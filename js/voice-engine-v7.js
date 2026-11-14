/**
 * Motor Conversacional de Voz en Tiempo Real (English Partner v7 - Studio Quality & Mobile Resilient)
 * - Voz Neural de Estudio Nativa de Google Gemini (gemini-3.8-flash-lite-tts con voz Aoede a 24kHz)
 * - Modo Oído Puro (Blind Listening) para desarrollo auditivo sin trampa bimodal
 * - Turn-Taking ultra-resiliente para Safari macOS y Navegadores Móviles Samsung/Android
 * - Respaldo offline automático con SpeechSynthesis en caso de fallo de red
 */

const VERIFIED_GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const GEMINI_TTS_VOICE = 'Aoede'; // Voz femenina cálida, articulación nativa limpia

class VoiceEngine {
  constructor(options = {}) {
    this.scenario = options.scenario || null;
    this.apiKey = options.apiKey || '';
    this.mode = options.mode || 'NORMAL';
    this.maxDurationSeconds = options.maxDurationSeconds || 600;
    this.wrapUpThresholdSeconds = 120;
    this.silenceDelayMs = options.silenceDelayMs || 2800; // Calibrado para permitir pensar respuestas sin cortes prematuros
    this.userLevel = options.userLevel || 'B1';
    this.pendingMistakes = options.pendingMistakes || [];

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
    this.currentAudioElement = null;

    this.audioVad = null;
    this.recognition = null;
    this.latestTranscript = '';
    this.interimTranscript = '';
    this.speechFinalizeTimer = null;
    this.micRestartTimer = null;
    this.safetyTurnTimer = null;

    // Callbacks de UI
    this.onTimerTick = options.onTimerTick || (() => {});
    this.onWrapUpWarning = options.onWrapUpWarning || (() => {});
    this.onUserSpeechRecognized = options.onUserSpeechRecognized || (() => {});
    this.onAiResponseStarted = options.onAiResponseStarted || (() => {});
    this.onAiResponseFinished = options.onAiResponseFinished || (() => {});
    this.onStatusChanged = options.onStatusChanged || (() => {}); // 'speaking' | 'listening' | 'thinking'
    this.onSessionFinished = options.onSessionFinished || (() => {});
    this.onError = options.onError || (() => {});
    this.onAudioVolume = options.onAudioVolume || (() => {});
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

    // 1. Activar WakeLock para evitar que la pantalla del móvil se apague
    this.audioVad = new AudioVAD();
    try {
      await this.audioVad.start();
    } catch (e) {
      console.warn('[VoiceEngine] WakeLock:', e);
    }

    // 2. Iniciar temporizador de 10 minutos
    this.startTimer();

    // 3. Saludo inicial hablado de Emma
    const initialText = this.getInitialGreetingText();
    this.history.push({
      role: 'assistant',
      text: initialText,
      timestamp: 0
    });
    this.lastAiText = initialText;

    this.onAiResponseStarted();
    this.onAiResponseFinished(initialText);

    // Hablar el saludo usando Gemini TTS nativo
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

  /**
   * Generador de Voz de Estudio Nativa con Gemini (gemini-3.8-flash-lite-tts)
   * Devuelve un AudioBlob reproducible en HTML5 Audio
   */
  static async fetchGeminiAudioBlob(text, apiKey, voiceName = GEMINI_TTS_VOICE) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    };

    const doFetch = (typeof Config !== 'undefined' && Config.fetchWithTimeout)
      ? Config.fetchWithTimeout.bind(Config)
      : fetch;

    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 15000);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    const inlineData = part && part.inlineData;

    if (!inlineData || !inlineData.data) {
      throw new Error('Gemini TTS no devolvió datos de audio válidos.');
    }

    const base64Data = inlineData.data;
    const mimeType = inlineData.mimeType || 'audio/wav';

    // Decodificar Base64 a Blob binario
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes.buffer], { type: mimeType });
  }

  /**
   * Reproduce el texto usando audio nativo de Gemini o fallback al navegador
   */
  async speakText(text) {
    if (!text || !this.isSessionActive) return;

    this.isAiSpeaking = true;
    this.onStatusChanged('speaking', { text: text, role: 'assistant' });
    this.stopListeningSafely();
    this.startWaveSimulation(true);

    try {
      // 1. Intentar con Gemini Studio TTS (Aoede)
      await this.playGeminiAudio(text);
    } catch (err) {
      console.warn('[VoiceEngine] Gemini TTS falló o sin conexión, usando sintetizador local:', err.message);
      // 2. Fallback a SpeechSynthesis del sistema si falla la red
      await this.playLocalSpeechSynthesis(text);
    } finally {
      this.isAiSpeaking = false;
      this.startWaveSimulation(false);

      // Transición Inmediata: Ceder la palabra de inmediato en la UI
      if (this.isSessionActive && !this.isAiResponding) {
        this.onStatusChanged('listening');

        // Buffer de desacoplamiento de 500ms para que el hardware de audio (CoreAudio / Android AudioManager) libere la salida
        setTimeout(() => {
          if (this.isSessionActive && !this.isAiSpeaking && !this.isAiResponding) {
            this.startListeningSafely();
          }
        }, 500);
      }
    }
  }

  /**
   * Calcula la velocidad de habla progresiva según el nivel diagnosticado del alumno
   */
  getAdaptivePlaybackRate() {
    if (this.scenario && this.scenario.id === 'placement_test') return 0.95;
    switch (this.userLevel) {
      case 'A2': return 0.90; // Más pausado y articulado al inicio
      case 'B1': return 0.96; // Ritmo conversacional natural
      case 'B2': return 1.00; // Velocidad nativa estándar
      case 'C1': return 1.04; // Ritmo ejecutivo dinámico
      default: return 0.95;
    }
  }

  playGeminiAudio(text) {
    return new Promise(async (resolve, reject) => {
      let audioUrl = null;
      try {
        const blob = await VoiceEngine.fetchGeminiAudioBlob(text, this.apiKey);
        audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        const rate = this.getAdaptivePlaybackRate();
        audio.playbackRate = rate;
        if ('preservesPitch' in audio) audio.preservesPitch = true;
        this.currentAudioElement = audio;

        audio.onended = () => {
          this.currentAudioElement = null;
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (e) => {
          this.currentAudioElement = null;
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          reject(new Error('Fallo al reproducir audio HTML5: ' + (e.message || 'error')));
        };

        await audio.play();
      } catch (err) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        this.currentAudioElement = null;
        reject(err);
      }
    });
  }

  playLocalSpeechSynthesis(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = this.getAdaptivePlaybackRate();
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices() || [];
      const best = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Enhanced') || v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Google')))
        || voices.find(v => v.lang.startsWith('en')) || null;
      if (best) utterance.voice = best;

      let ended = false;
      const done = () => {
        if (ended) return;
        ended = true;
        resolve();
      };

      utterance.onend = done;
      utterance.onerror = done;
      setTimeout(done, Math.max(5000, text.length * 80));

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        done();
      }
    });
  }

  /**
   * Instancia limpia de SpeechRecognition para cada turno
   * Resuelve el congelamiento en Safari y la latencia en Android Samsung
   */
  createFreshRecognition() {
    this.destroyRecognition();

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[VoiceEngine] Web Speech Recognition no soportada.');
      return null;
    }

    const rec = new SpeechRec();
    rec.continuous = false; // Turnos independientes son infinitamente más estables en móviles
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      this.isListening = true;
      this.onStatusChanged('listening');
      this.startWaveSimulation(true);
    };

    rec.onresult = (event) => {
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
        // Ventana de silencio adaptativa (Hold Time) para pensar sin que corte
        this.scheduleTurnSubmission(this.silenceDelayMs);
      }
    };

    rec.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[SpeechRecognition] Estado:', event.error);
      }
    };

    rec.onend = () => {
      this.isListening = false;
      this.startWaveSimulation(false);

      // Si la sesión continúa activa y el Coach no está hablando, mantener viva la escucha
      if (this.isSessionActive && !this.isAiSpeaking && !this.isAiResponding) {
        this.micRestartTimer = setTimeout(() => {
          this.startListeningSafely();
        }, 350);
      }
    };

    return rec;
  }

  destroyRecognition() {
    if (this.micRestartTimer) {
      clearTimeout(this.micRestartTimer);
      this.micRestartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
    this.isListening = false;
  }

  startListeningSafely() {
    if (!this.isSessionActive || this.isAiSpeaking || this.isAiResponding) return;

    this.recognition = this.createFreshRecognition();
    if (!this.recognition) return;

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('[VoiceEngine] Reconocimiento en espera:', e.message);
      this.micRestartTimer = setTimeout(() => {
        if (this.isSessionActive && !this.isAiSpeaking && !this.isAiResponding) {
          this.startListeningSafely();
        }
      }, 500);
    }
  }

  stopListeningSafely() {
    this.destroyRecognition();
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

  /**
   * Envío manual instantáneo del turno (0ms latencia) sin esperar el contador de silencio
   */
  commitUserTurnNow() {
    if (this.speechFinalizeTimer) {
      clearTimeout(this.speechFinalizeTimer);
      this.speechFinalizeTimer = null;
    }
    this.commitUserTurn();
  }

  async commitUserTurn() {
    if (!this.isSessionActive || this.isAiResponding || this.isAiSpeaking) return;

    const fullUserText = (this.latestTranscript + ' ' + this.interimTranscript).trim();
    if (fullUserText.length < 2) return;

    this.latestTranscript = '';
    this.interimTranscript = '';

    // Pausar y destruir micrófono antes de invocar a Gemini
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
          message: 'Quedan 2 minutos. La coach y tú comenzarán a despedirse naturalmente.',
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
    this.onStatusChanged('thinking');
    this.onAiResponseStarted();

    try {
      const remainingSeconds = this.maxDurationSeconds - this.elapsedSeconds;
      let wrapUpDirective = '';

      if (remainingSeconds <= this.wrapUpThresholdSeconds) {
        wrapUpDirective = `\n[SYSTEM CUE: Exactly ${Math.floor(remainingSeconds / 60)} minutes and ${remainingSeconds % 60} seconds remaining in this 10-minute session. Wrap up the conversation naturally and say goodbye.]`;
      }

      // 1. Directiva de nivel adaptativo (velocidad léxica y complejidad)
      let levelDirective = '';
      if (this.scenario.id !== 'placement_test') {
        if (this.userLevel === 'A2') {
          levelDirective = '\nADAPTIVE LEVEL (A2): Use clear, everyday vocabulary and concise sentences so the student builds confidence.';
        } else if (this.userLevel === 'B1') {
          levelDirective = '\nADAPTIVE LEVEL (B1): Use natural intermediate English and weave in common phrasal verbs or everyday idioms.';
        } else if (this.userLevel === 'B2') {
          levelDirective = '\nADAPTIVE LEVEL (B2): Use upper-intermediate professional English, rich connectors, and thought-provoking follow-up questions.';
        } else if (this.userLevel === 'C1') {
          levelDirective = '\nADAPTIVE LEVEL (C1): Use advanced executive English, nuanced idioms, and high-level analytical follow-up questions.';
        }
      }

      // 2. Vocabulario objetivo de la lección
      let vocabDirective = '';
      if (Array.isArray(this.scenario.targetVocabulary) && this.scenario.targetVocabulary.length > 0) {
        vocabDirective = `\nTARGET VOCABULARY FOR THIS LESSON: ${this.scenario.targetVocabulary.join(' | ')}. Naturally model 1 of these expressions when fitting and create context for the user to use them.`;
      }

      // 3. Memoria activa del Banco de Errores (Spaced Repetition)
      let mistakesDirective = '';
      if (Array.isArray(this.pendingMistakes) && this.pendingMistakes.length > 0) {
        const topMistakes = this.pendingMistakes.slice(0, 5).map(m => `"${m.original}" -> should be "${m.correction}"`).join('; ');
        mistakesDirective = `\nACTIVE SPACED-REPETITION MEMORY (PAST MISTAKES TO REINFORCE): In previous sessions, the student struggled with: [${topMistakes}]. Without breaking character or lecturing, naturally steer questions so the student has opportunities to practice these structures/words correctly, and model the correct forms in your own speech.`;
      }

      const systemInstruction = `
You are roleplaying as: ${this.scenario.aiRole}.
The scenario is: ${this.scenario.scenarioContext}.
${this.scenario.systemPromptAddon || ''}${levelDirective}${vocabDirective}${mistakesDirective}

RULES:
1. Stay 100% in character.
2. Keep your spoken responses concise and natural (between 1 and 3 short sentences).
3. Do not lecture grammar during the conversation. Just react naturally as a conversation partner.
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

  extractReplyText(data) {
    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    if (!Array.isArray(parts)) return '';

    const spokenParts = parts
      .filter(p => p && !p.thought && typeof p.text === 'string' && p.text.trim().length > 0)
      .map(p => p.text.trim());

    return spokenParts.join(' ').trim();
  }

  async requestGeminiWithFallback(payload) {
    let lastError = null;
    const doFetch = (typeof Config !== 'undefined' && Config.fetchWithTimeout)
      ? Config.fetchWithTimeout.bind(Config)
      : fetch;

    for (const model of VERIFIED_GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const response = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }, 15000);

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
        const replyText = this.extractReplyText(data);
        if (replyText) {
          return replyText;
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

  startWaveSimulation(active) {
    if (this.waveInterval) {
      clearInterval(this.waveInterval);
      this.waveInterval = null;
    }
    if (!active) {
      this.onAudioVolume(0.02);
      return;
    }
    this.waveInterval = setInterval(() => {
      const simVol = 0.08 + Math.random() * 0.18;
      this.onAudioVolume(simVol);
    }, 110);
  }

  stop(autoFinished = false) {
    if (!this.isSessionActive) return;

    this.isSessionActive = false;
    this.isAiSpeaking = false;
    this.isAiResponding = false;

    // Volcar cualquier frase pendiente que el usuario estuviera diciendo al pulsar finalizar
    const pendingText = (this.latestTranscript + ' ' + this.interimTranscript).trim();
    if (pendingText.length >= 2) {
      this.history.push({
        role: 'user',
        text: pendingText,
        timestamp: this.elapsedSeconds
      });
    }
    this.latestTranscript = '';
    this.interimTranscript = '';

    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement = null;
      } catch (e) {}
    }

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

