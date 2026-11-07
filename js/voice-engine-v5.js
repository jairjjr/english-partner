/**
 * Motor Conversacional de Voz en Tiempo Real (English Partner v5 - Safari Safe)
 * Arquitectura Time-Slicing: Alterna estrictamente entre Altavoz y Micrófono
 * para evitar colisiones de CoreAudio / WebKit y erradicar crashes en Safari.
 */

const VERIFIED_GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

class VoiceEngine {
  constructor(options = {}) {
    this.scenario = options.scenario || null;
    this.apiKey = options.apiKey || '';
    this.mode = options.mode || 'NORMAL';
    this.maxDurationSeconds = options.maxDurationSeconds || 600;
    this.wrapUpThresholdSeconds = 120;

    this.timerInterval = null;
    this.waveInterval = null;
    this.elapsedSeconds = 0;
    this.history = [];
    this.isSessionActive = false;
    this.hasWrapUpCued = false;
    this.isAiResponding = false;
    this.isAiSpeaking = false;
    this.isListening = false;
    this.lastAiText = '';
    this.currentUtterance = null;

    this.audioVad = null;
    this.recognition = null;
    this.latestTranscript = '';
    this.interimTranscript = '';
    this.speechFinalizeTimer = null;

    // Callbacks de UI
    this.onTimerTick = options.onTimerTick || (() => {});
    this.onWrapUpWarning = options.onWrapUpWarning || (() => {});
    this.onUserSpeechRecognized = options.onUserSpeechRecognized || (() => {});
    this.onAiResponseStarted = options.onAiResponseStarted || (() => {});
    this.onAiResponseFinished = options.onAiResponseFinished || (() => {});
    this.onSessionFinished = options.onSessionFinished || (() => {});
    this.onError = options.onError || (() => {});
  }

  async start() {
    if (!this.apiKey) {
      this.onError(new Error('Falta la API Key de Gemini. Configúrala en el menú de ajustes ⚙️.'));
      return false;
    }

    this.isSessionActive = true;
    this.elapsedSeconds = 0;
    this.history = [];
    this.hasWrapUpCued = false;
    this.latestTranscript = '';
    this.interimTranscript = '';

    // 1. Activar WakeLock para evitar que la pantalla se apague en la camioneta
    this.audioVad = new AudioVAD();
    await this.audioVad.start();

    // 2. Inicializar el motor de reconocimiento de voz sin arrancarlo todavía
    this.initSpeechRecognition();

    // 3. Iniciar temporizador de 10 minutos
    this.startTimer();

    // 4. Saludo inicial hablado de Emma (Altavoz exclusivo)
    const initialText = this.getInitialGreetingText();
    this.history.push({
      role: 'assistant',
      text: initialText,
      timestamp: 0
    });
    this.lastAiText = initialText;

    this.onAiResponseStarted();
    this.onAiResponseFinished(initialText);

    // Hablar el saludo. Al terminar de hablar, speakText activará el micrófono automáticamente.
    await this.speakText(initialText);

    return true;
  }

  getInitialGreetingText() {
    if (this.scenario && this.scenario.initialGreeting) {
      return this.scenario.initialGreeting;
    }
    if (this.scenario && this.scenario.id === 'placement_test') {
      return "Hello! I'm Emma, your English coach. I'm excited to practice with you today! To get started, could you tell me a little bit about yourself, where you're from, and how your day is going?";
    }
    return "Hello! I'm ready to begin our conversation practice. How are you doing today?";
  }

  initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[VoiceEngine] Web Speech Recognition no soportada.');
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.startWaveSimulation(true);
    };

    this.recognition.onresult = (event) => {
      if (this.isAiSpeaking || this.isAiResponding) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.latestTranscript = (this.latestTranscript + ' ' + transcript).trim();
        } else {
          interim += transcript;
        }
      }
      this.interimTranscript = interim.trim();

      const display = (this.latestTranscript + (this.interimTranscript ? ` ${this.interimTranscript}` : '')).trim();
      if (display) {
        this.onUserSpeechRecognized(display);
        // Cuando el usuario hace una pausa tras hablar, programar el envío del turno
        this.scheduleTurnSubmission(1500);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[SpeechRecognition] Estado:', event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.startWaveSimulation(false);
      // Solo reiniciar si la sesión sigue activa y el Coach NO está hablando
      if (this.isSessionActive && !this.isAiSpeaking && !this.isAiResponding) {
        setTimeout(() => {
          this.startListeningSafely();
        }, 200);
      }
    };
  }

  startListeningSafely() {
    if (!this.recognition || !this.isSessionActive || this.isAiSpeaking || this.isAiResponding) return;
    try {
      this.recognition.start();
    } catch (e) {
      // Ignorar si ya estaba iniciado
    }
  }

  stopListeningSafely() {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (e) {}
    this.isListening = false;
    this.startWaveSimulation(false);
  }

  scheduleTurnSubmission(delayMs) {
    if (this.speechFinalizeTimer) {
      clearTimeout(this.speechFinalizeTimer);
    }
    this.speechFinalizeTimer = setTimeout(() => {
      this.speechFinalizeTimer = null;
      this.commitUserTurn();
    }, delayMs);
  }

  async commitUserTurn() {
    if (!this.isSessionActive || this.isAiResponding || this.isAiSpeaking) return;

    const fullUserText = (this.latestTranscript + ' ' + this.interimTranscript).trim();
    if (fullUserText.length < 2) return;

    this.latestTranscript = '';
    this.interimTranscript = '';

    // Pausar el micrófono antes de llamar a la IA para liberar CoreAudio
    this.stopListeningSafely();

    this.history.push({
      role: 'user',
      text: fullUserText,
      timestamp: this.elapsedSeconds
    });

    await this.generateAiResponse();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      const remainingSeconds = Math.max(0, this.maxDurationSeconds - this.elapsedSeconds);

      this.onTimerTick({
        elapsed: this.elapsedSeconds,
        remaining: remainingSeconds,
        formatted: this.formatTime(remainingSeconds)
      });

      if (remainingSeconds <= this.wrapUpThresholdSeconds && !this.hasWrapUpCued) {
        this.hasWrapUpCued = true;
        this.onWrapUpWarning({
          message: 'Quedan 2 minutos. La IA y tú comenzarán a despedirse.',
          remainingSeconds
        });
      }

      if (this.elapsedSeconds >= this.maxDurationSeconds) {
        this.stop(true);
      }
    }, 1000);
  }

  formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async generateAiResponse() {
    this.isAiResponding = true;
    this.onAiResponseStarted();

    try {
      const remainingSeconds = this.maxDurationSeconds - this.elapsedSeconds;
      let wrapUpDirective = '';

      if (remainingSeconds <= this.wrapUpThresholdSeconds) {
        wrapUpDirective = `\n[SYSTEM CUE: Exactly ${Math.floor(remainingSeconds / 60)} minutes and ${remainingSeconds % 60} seconds remaining in this 10-minute session. Wrap up the conversation naturally and say goodbye.]`;
      }

      const systemInstruction = `
You are roleplaying as: ${this.scenario.aiRole}.
The scenario is: ${this.scenario.scenarioContext}.
${this.scenario.systemPromptAddon || ''}

RULES:
1. Stay 100% in character.
2. Keep your spoken responses concise and natural (between 1 and 3 short sentences).
3. Do not lecture grammar during the conversation. Just react naturally.
4. End your turn with an engaging question or reaction.
${wrapUpDirective}
`;

      const aiText = await this.callGeminiWithHistory(systemInstruction, this.history);
      this.lastAiText = aiText;

      this.history.push({
        role: 'assistant',
        text: aiText,
        timestamp: this.elapsedSeconds
      });

      this.onAiResponseFinished(aiText);
      await this.speakText(aiText);
    } catch (err) {
      console.warn('[VoiceEngine] Aviso en respuesta:', err.message);
      this.onError(err);
      // Reabrir micrófono si hubo error
      this.startListeningSafely();
    } finally {
      this.isAiResponding = false;
    }
  }

  buildValidGeminiContents(history) {
    const normalized = [];

    for (const item of history) {
      const geminiRole = item.role === 'assistant' ? 'model' : 'user';
      const cleanText = (item.text || '').trim();
      if (!cleanText) continue;

      if (normalized.length === 0 && geminiRole === 'model') {
        normalized.push({
          role: 'user',
          parts: [{ text: "Hello, I'm ready to start our conversation practice." }]
        });
      }

      if (normalized.length > 0 && normalized[normalized.length - 1].role === geminiRole) {
        normalized[normalized.length - 1].parts[0].text += '\n' + cleanText;
      } else {
        normalized.push({
          role: geminiRole,
          parts: [{ text: cleanText }]
        });
      }
    }

    if (normalized.length === 0 || normalized[normalized.length - 1].role !== 'user') {
      normalized.push({
        role: 'user',
        parts: [{ text: 'Hello!' }]
      });
    }

    return normalized;
  }

  async callGeminiWithHistory(systemInstruction, history) {
    const contents = this.buildValidGeminiContents(history);

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 160
      }
    };

    return await this.requestGeminiWithFallback(payload);
  }

  async requestGeminiWithFallback(payload) {
    let lastError = null;

    for (const model of VERIFIED_GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.status === 503 || response.status === 429) {
          console.warn(`[VoiceEngine] Modelo ${model} ocupado (${response.status}). Cambiando al siguiente...`);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`API Error (${model} - ${response.status}): ${errBody}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          return data.candidates[0].content.parts[0].text.trim();
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Servidor ocupado momentáneamente. Habla de nuevo para continuar.');
  }

  async replayLastAiMessage() {
    if (this.lastAiText) {
      await this.speakText(this.lastAiText);
    }
  }

  /**
   * Sintetizador de voz Text-to-Speech (Altavoz Exclusivo)
   * Asegura que el micrófono esté cerrado mientras habla para no colisionar en Safari.
   */
  speakText(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis || !text) {
        this.startListeningSafely();
        resolve();
        return;
      }

      this.isAiSpeaking = true;
      // Cerrar micrófono mientras habla Emma
      this.stopListeningSafely();

      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices() || [];
      const englishVoice = voices.find(v => 
        v.lang.startsWith('en') &&
        (v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Natural') || v.name.includes('Ava') || v.name.includes('Allison') || v.name.includes('Daniel') || v.name.includes('Karen'))
      ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en_US') || voices.find(v => v.lang.startsWith('en'));

      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      let finished = false;
      const finishSpeaking = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimer);
        this.isAiSpeaking = false;
        // Esperar 450ms antes de encender el micrófono para evitar eco
        setTimeout(() => {
          if (this.isSessionActive && !this.isAiResponding) {
            this.startListeningSafely();
          }
          resolve();
        }, 450);
      };

      const estimatedMs = Math.min(20000, Math.max(6000, text.length * 85));
      const safetyTimer = setTimeout(finishSpeaking, estimatedMs);

      utterance.onend = finishSpeaking;
      utterance.onerror = () => finishSpeaking();

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        finishSpeaking();
      }
    });
  }

  startWaveSimulation(active) {
    if (this.waveInterval) {
      clearInterval(this.waveInterval);
      this.waveInterval = null;
    }
    if (!active) {
      if (typeof this.onAudioVolume === 'function') this.onAudioVolume(0.02);
      return;
    }
    this.waveInterval = setInterval(() => {
      if (typeof this.onAudioVolume === 'function') {
        const simVol = 0.05 + Math.random() * 0.12;
        this.onAudioVolume(simVol);
      }
    }, 120);
  }

  stop(autoFinished = false) {
    if (!this.isSessionActive) return;

    this.isSessionActive = false;
    this.isAiSpeaking = false;
    this.isAiResponding = false;

    if (this.speechFinalizeTimer) {
      clearTimeout(this.speechFinalizeTimer);
      this.speechFinalizeTimer = null;
    }

    if (this.waveInterval) {
      clearInterval(this.waveInterval);
      this.waveInterval = null;
    }

    clearInterval(this.timerInterval);
    this.timerInterval = null;

    this.stopListeningSafely();

    if (this.audioVad) {
      this.audioVad.stop();
    }

    try { window.speechSynthesis.cancel(); } catch (e) {}

    this.onSessionFinished({
      scenario: this.scenario,
      history: this.history,
      durationSeconds: this.elapsedSeconds,
      autoFinished: autoFinished
    });
  }
}
