/**
 * Motor Conversacional de Voz en Tiempo Real (English Partner v5)
 * Utiliza los endpoints oficiales universales de Google AI Studio:
 * 1. gemini-flash-lite-latest (Gemini 3.5 Flash-Lite: ultra rápido para conversación)
 * 2. gemini-flash-latest      (Gemini 3.8 Flash: respaldo)
 * 3. gemini-pro-latest        (Gemini 3.1 Pro: razonamiento avanzado)
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
    this.elapsedSeconds = 0;
    this.history = [];
    this.isSessionActive = false;
    this.hasWrapUpCued = false;
    this.isAiResponding = false;
    this.isAiSpeaking = false;
    this.lastAiText = '';
    this.currentUtterance = null;

    this.audioVad = null;
    this.recognition = null;
    this.latestTranscript = '';
    this.interimTranscript = '';
    this.speechFinalizeTimer = null;
    this.lastRecordedAudioUrl = null;
    this.lastRecordedAudioBlob = null;

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

    // 1. Saludo inicial instantáneo (CERO llamadas de red al arrancar, CERO posibilidad de 503)
    const initialText = this.getInitialGreetingText();
    this.history.push({
      role: 'assistant',
      text: initialText,
      timestamp: 0
    });
    this.lastAiText = initialText;
    this.onAiResponseStarted();
    this.onAiResponseFinished(initialText);

    // Reproducir la voz de Emma inmediatamente con el clic del usuario
    await this.speakText(initialText);

    // 2. Iniciar Audio VAD para ondas y grabación de pronunciación
    this.audioVad = new AudioVAD({
      onSpeechStart: () => {
        if (!this.isAiSpeaking && !this.isAiResponding) {
          if (this.speechFinalizeTimer) {
            clearTimeout(this.speechFinalizeTimer);
            this.speechFinalizeTimer = null;
          }
        }
      },
      onSpeechEnd: (audioBlob, audioUrl) => {
        if (this.isAiSpeaking || this.isAiResponding) return;
        this.lastRecordedAudioBlob = audioBlob;
        this.lastRecordedAudioUrl = audioUrl;
        this.scheduleTurnSubmission(400);
      },
      onAudioVolume: (level) => {
        if (typeof this.onAudioVolume === 'function') {
          this.onAudioVolume(level);
        }
      },
      onError: (err) => console.warn('[AudioVAD] Aviso:', err)
    });

    const micOk = await this.audioVad.start();
    if (!micOk) {
      console.warn('[VoiceEngine] Micrófono no iniciado, continuando en modo escucha.');
    }

    // 3. Iniciar reconocimiento nativo de voz
    this.initSpeechRecognition();

    // 4. Iniciar temporizador de 10 minutos
    this.startTimer();

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
      console.warn('[VoiceEngine] Web Speech API no soportada en este navegador.');
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      // Ignorar entrada mientras Emma habla para evitar eco
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
        this.scheduleTurnSubmission(1600);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[SpeechRecognition] Estado:', event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isSessionActive) {
        try { this.recognition.start(); } catch (e) {}
      }
    };

    try {
      this.recognition.start();
    } catch (e) {}
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

    const audioBlob = this.lastRecordedAudioBlob;
    const audioUrl = this.lastRecordedAudioUrl;
    this.lastRecordedAudioBlob = null;
    this.lastRecordedAudioUrl = null;

    this.history.push({
      role: 'user',
      text: fullUserText,
      timestamp: this.elapsedSeconds,
      audioBlob: audioBlob,
      audioUrl: audioUrl
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
    if (this.audioVad) this.audioVad.isPaused = true;
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
      console.warn('[VoiceEngine] Aviso en turno:', err.message);
      this.onError(err);
      if (this.audioVad) this.audioVad.isPaused = false;
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
   * Sintetizador de voz de alta fidelidad con desbloqueo para macOS, iOS y Android
   */
  speakText(text) {
    return new Promise(async (resolve) => {
      if (!window.speechSynthesis || !text) {
        if (this.audioVad) this.audioVad.isPaused = false;
        resolve();
        return;
      }

      this.isAiSpeaking = true;
      if (this.audioVad) this.audioVad.isPaused = true;

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          await new Promise(r => setTimeout(r, 50));
        }
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Selección robusta de voz en inglés
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
        setTimeout(() => {
          this.isAiSpeaking = false;
          this.latestTranscript = '';
          this.interimTranscript = '';
          if (this.audioVad) this.audioVad.isPaused = false;
          resolve();
        }, 300);
      };

      const estimatedMs = Math.min(22000, Math.max(7000, text.length * 90));
      const safetyTimer = setTimeout(finishSpeaking, estimatedMs);

      utterance.onend = finishSpeaking;
      utterance.onerror = (e) => {
        console.warn('[SpeechSynthesis] Aviso:', e.error || e);
        finishSpeaking();
      };

      try {
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {
        finishSpeaking();
      }
    });
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

    clearInterval(this.timerInterval);
    this.timerInterval = null;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

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

