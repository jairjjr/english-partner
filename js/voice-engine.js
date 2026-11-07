/**
 * Motor Conversacional de Voz en Tiempo Real (English Partner)
 * Maneja el diálogo por turnos, temporizador de 10 minutos, aviso del minuto 8:00,
 * aislamiento anti-eco y síntesis de voz natural con modelos oficiales Gemini 3.
 */

// Modelos oficiales verificados en Google AI Studio (Familia Gemini 3):
// 1. gemini-3.5-flash-lite  -> "3.5 Flash-Lite: Respuestas más rápidas" (Primario para voz en vivo)
// 2. gemini-3.8-flash       -> "3.8 Flash: Asistencia general" (Respaldo inmediato)
// 3. gemini-3.1-pro-preview -> "3.1 Pro: Razonamiento avanzado" (Respaldo secundario)
const GEMINI_VOICE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview'
];

class VoiceEngine {
  constructor(options = {}) {
    this.scenario = options.scenario || null;
    this.apiKey = options.apiKey || '';
    this.mode = options.mode || 'NORMAL'; // 'NORMAL' o 'DRIVE'
    this.maxDurationSeconds = options.maxDurationSeconds || 600; // 10 minutos
    this.wrapUpThresholdSeconds = 120; // Al faltar 2 min (minuto 8:00)

    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.history = []; // Historial de turnos { role: 'user'|'assistant', text, timestamp, audioUrl }
    this.isSessionActive = false;
    this.hasWrapUpCued = false;
    this.isAiResponding = false;
    this.isAiSpeaking = false;
    this.lastAiText = '';
    this.currentUtterance = null; // Referencia viva para evitar Garbage Collection del navegador

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

  /**
   * Inicializa la sesión, desbloquea el sintetizador de voz, arranca el micrófono y saluda
   */
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

    // Precargar las voces del navegador en el gesto de clic del usuario
    await this.ensureVoicesLoaded();

    // 1. Iniciar Audio VAD para visualizar ondas y grabar fragmentos de pronunciación
    this.audioVad = new AudioVAD({
      onSpeechStart: () => {
        // Solo registrar inicio si el Coach NO está hablando
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
        // Esperar 400ms para que SpeechRecognition termine de volcar las últimas palabras
        this.scheduleTurnSubmission(400);
      },
      onAudioVolume: (level) => {
        if (typeof this.onAudioVolume === 'function') {
          this.onAudioVolume(level);
        }
      },
      onError: (err) => this.onError(err)
    });

    // Pausar el VAD antes del saludo inicial para que el micrófono no escuche a Emma
    this.audioVad.isPaused = true;
    const micOk = await this.audioVad.start();
    if (!micOk) return false;

    // 2. Iniciar SpeechRecognition nativo del navegador
    this.initSpeechRecognition();

    // 3. Iniciar temporizador regresivo de 10 minutos
    this.startTimer();

    // 4. Saludo inicial hablado del personaje del escenario
    await this.sendInitialGreeting();

    return true;
  }

  /**
   * Garantiza que las voces del sistema estén cargadas antes de pronunciar la primera frase
   */
  ensureVoicesLoaded() {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve([]);
        return;
      }
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        resolve(voices);
        return;
      }
      let resolved = false;
      window.speechSynthesis.onvoiceschanged = () => {
        if (!resolved) {
          resolved = true;
          resolve(window.speechSynthesis.getVoices());
        }
      };
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(window.speechSynthesis.getVoices() || []);
        }
      }, 800);
    });
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
      // Mientras el Coach está hablando o pensando, ignorar el micrófono para no transcribir el eco de las bocinas
      if (this.isAiSpeaking || this.isAiResponding) {
        return;
      }

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
        // Temporizador de respaldo: si el usuario hace una pausa de 1.7 segundos después de dictar, enviar turno
        this.scheduleTurnSubmission(1700);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[SpeechRecognition] Aviso:', event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isSessionActive) {
        try { this.recognition.start(); } catch (e) {}
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('[SpeechRecognition] No se pudo arrancar de inmediato:', e);
    }
  }

  /**
   * Programa el envío del turno del usuario una vez que concluye su frase
   */
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
    // Si no se dictaron palabras reales (solo fue ruido ambiente), no enviar petición vacía a Gemini
    if (fullUserText.length < 2) {
      return;
    }

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

      // ALERTA COORDINADA AL MINUTO 8:00 (Quedan 2 minutos)
      if (remainingSeconds <= this.wrapUpThresholdSeconds && !this.hasWrapUpCued) {
        this.hasWrapUpCued = true;
        this.onWrapUpWarning({
          message: 'Quedan 2 minutos. La IA y tú comenzarán a despedirse.',
          remainingSeconds
        });
      }

      // Fin automático a los 10 minutos exactos
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

  /**
   * Saludo inicial del personaje para romper el hielo de forma instantánea
   */
  async sendInitialGreeting() {
    let greetingText = this.scenario.initialGreeting;

    if (!greetingText) {
      if (this.scenario.id === 'placement_test') {
        greetingText = "Hello! I'm Emma, your English speaking coach. I'm excited to practice with you today! To get started, could you tell me a little bit about yourself, where you're from, and how your day is going?";
      } else {
        greetingText = `Hello! Welcome to this session. I'm ready to begin our scenario as ${this.scenario.aiRole.split(',')[0]}. How are you doing today?`;
      }
    }

    try {
      this.isAiResponding = true;
      this.lastAiText = greetingText;
      this.history.push({
        role: 'assistant',
        text: greetingText,
        timestamp: 0
      });
      this.onAiResponseStarted();
      this.onAiResponseFinished(greetingText);
      await this.speakText(greetingText);
    } catch (err) {
      console.warn('[VoiceEngine] Error en saludo inicial:', err);
    } finally {
      this.isAiResponding = false;
    }
  }

  async generateAiResponse() {
    this.isAiResponding = true;
    if (this.audioVad) this.audioVad.isPaused = true;
    this.onAiResponseStarted();

    try {
      const remainingSeconds = this.maxDurationSeconds - this.elapsedSeconds;
      let wrapUpDirective = '';

      // Directiva oculta cuando faltan 2 minutos (Minuto 8:00)
      if (remainingSeconds <= this.wrapUpThresholdSeconds) {
        wrapUpDirective = `\n[SYSTEM CUE: Exactly ${Math.floor(remainingSeconds / 60)} minutes and ${remainingSeconds % 60} seconds remaining in this 10-minute session. Both of you must wrap up. Acknowledge that time is wrapping up, conclude the topic smoothly, and start saying your goodbyes naturally.]`;
      }

      const systemInstruction = `
You are roleplaying as: ${this.scenario.aiRole}.
The scenario is: ${this.scenario.scenarioContext}.
${this.scenario.systemPromptAddon || ''}

RULES:
1. Always stay 100% in character.
2. Keep your spoken responses concise and natural (between 1 and 3 sentences maximum), because this is a real-time voice conversation.
3. Never lecture or correct grammar during the conversation. Just react naturally to what the user said.
4. Encourage the user to speak by ending your turn with an engaging, natural question or reaction.
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
      console.error('[VoiceEngine] Error al generar respuesta de IA:', err);
      this.onError(err);
      if (this.audioVad) this.audioVad.isPaused = false;
    } finally {
      this.isAiResponding = false;
    }
  }

  /**
   * Construye un arreglo contents 100% válido para Gemini API:
   * - Siempre inicia con role: 'user'
   * - Alterna estrictamente 'user' <-> 'model'
   */
  buildValidGeminiContents(history) {
    const normalized = [];

    for (const item of history) {
      const geminiRole = item.role === 'assistant' ? 'model' : 'user';
      const cleanText = (item.text || '').trim();
      if (!cleanText) continue;

      // Si el primer mensaje de la historia es del 'model' (el saludo inicial),
      // insertamos el disparador de inicio del usuario para cumplir el contrato de Gemini API
      if (normalized.length === 0 && geminiRole === 'model') {
        normalized.push({
          role: 'user',
          parts: [{ text: "Hi, I'm ready to start our English conversation session." }]
        });
      }

      // Si hay dos turnos seguidos del mismo rol, fusionarlos para mantener alternancia estricta
      if (normalized.length > 0 && normalized[normalized.length - 1].role === geminiRole) {
        normalized[normalized.length - 1].parts[0].text += '\n' + cleanText;
      } else {
        normalized.push({
          role: geminiRole,
          parts: [{ text: cleanText }]
        });
      }
    }

    // Garantizar que el último mensaje enviado sea de 'user'
    if (normalized.length === 0 || normalized[normalized.length - 1].role !== 'user') {
      normalized.push({
        role: 'user',
        parts: [{ text: 'Hello!' }]
      });
    }

    return normalized;
  }

  /**
   * Llamada a Gemini con el historial de la conversación y fallback entre modelos Gemini 3
   */
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

  /**
   * Ejecuta la petición usando gemini-3.5-flash-lite como primario ("Respuestas más rápidas")
   * y fallback automático a gemini-3.8-flash y gemini-3.1-pro-preview si hay saturación 503/429.
   */
  async requestGeminiWithFallback(payload) {
    let lastError = null;

    // 2 rondas de intento con espera exponencial corta en caso de pico 503
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const model of GEMINI_VOICE_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.status === 503 || response.status === 429) {
            console.warn(`[VoiceEngine] Modelo ${model} con alta demanda (${response.status}). Conmutando al siguiente modelo...`);
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API (${model} - ${response.status}): ${errBody}`);
          }

          const data = await response.json();
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            return data.candidates[0].content.parts[0].text.trim();
          }
        } catch (err) {
          lastError = err;
          console.warn(`[VoiceEngine] Intento fallido en ${model}:`, err.message);
        }
      }
    }

    throw lastError || new Error('Los servidores de voz de Gemini tienen alta demanda en este segundo. Habla de nuevo para continuar.');
  }

  /**
   * Permite repetir en voz alta la última frase del Coach cuando el usuario lo solicite
   */
  async replayLastAiMessage() {
    if (this.lastAiText) {
      await this.speakText(this.lastAiText);
    }
  }

  /**
   * Sintetizador de voz Text-to-Speech usando Web Speech API
   * Aísla el micrófono mientras habla para evitar auto-cancelación y eco.
   */
  speakText(text) {
    return new Promise(async (resolve) => {
      if (!window.speechSynthesis || !text) {
        if (this.audioVad) this.audioVad.isPaused = false;
        resolve();
        return;
      }

      this.isAiSpeaking = true;
      if (this.audioVad) {
        this.audioVad.isPaused = true;
      }

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        // Solo llamar cancel() si realmente hay una locución previa activa, esperando 60ms para no abortar la nueva en Chrome
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          await new Promise(r => setTimeout(r, 60));
        }
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance; // Evita que el Garbage Collector de Chrome/Safari corte la voz a mitad de frase
      utterance.lang = 'en-US';
      utterance.rate = 0.98;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Natural') || v.name.includes('Ava') || v.name.includes('Allison') || v.name.includes('Victoria') || v.name.includes('Karen') || v.name.includes('Daniel'))
      ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en_US') || voices.find(v => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      let finished = false;
      const finishSpeaking = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimer);
        // Esperar 350ms tras terminar de hablar para que se disipe el eco acústico antes de reabrir el micrófono
        setTimeout(() => {
          this.isAiSpeaking = false;
          this.latestTranscript = '';
          this.interimTranscript = '';
          if (this.audioVad) {
            this.audioVad.isPaused = false;
          }
          resolve();
        }, 350);
      };

      // Timeout proporcional a la longitud del texto (mínimo 8s, máximo 20s)
      const estimatedMs = Math.min(20000, Math.max(8000, text.length * 90));
      const safetyTimer = setTimeout(finishSpeaking, estimatedMs);

      utterance.onend = finishSpeaking;
      utterance.onerror = (e) => {
        console.warn('[SpeechSynthesis] Aviso en reproducción:', e.error || e);
        finishSpeaking();
      };

      try {
        window.speechSynthesis.speak(utterance);
        // Workaround para Safari/Chrome cuando el motor queda suspendido
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {
        finishSpeaking();
      }
    });
  }

  /**
   * Detiene la sesión y dispara el callback de finalización
   */
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
