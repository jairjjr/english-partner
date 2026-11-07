/**
 * Motor Conversacional de Voz en Tiempo Real (English Partner)
 * Maneja el diálogo por turnos, temporizador de 10 minutos, aviso del minuto 8:00
 * y síntesis de voz natural.
 */

class VoiceEngine {
  constructor(options = {}) {
    this.scenario = options.scenario || null;
    this.apiKey = options.apiKey || '';
    this.mode = options.mode || 'NORMAL'; // 'NORMAL' o 'DRIVE'
    this.maxDurationSeconds = options.maxDurationSeconds || 600; // 10 minutos
    this.wrapUpThresholdSeconds = 120; // Al faltar 2 min (minuto 8:00)

    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.history = []; // Historial de turnos { role, text, timestamp, audioUrl }
    this.isSessionActive = false;
    this.hasWrapUpCued = false;
    this.isAiResponding = false;

    this.audioVad = null;
    this.recognition = null;
    this.latestTranscript = '';

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
   * Inicializa la sesión y arranca el temporizador y el reconocimiento de voz
   */
  async start() {
    if (!this.apiKey) {
      this.onError(new Error('Falta la API Key de Gemini. Configúrala en el menú de ajustes.'));
      return false;
    }

    this.isSessionActive = true;
    this.elapsedSeconds = 0;
    this.history = [];
    this.hasWrapUpCued = false;

    // 1. Iniciar SpeechRecognition nativo del navegador
    this.initSpeechRecognition();

    // 2. Iniciar Audio VAD para detección manos libres y grabación de fragmentos
    this.audioVad = new AudioVAD({
      onSpeechStart: () => {
        if (this.isAiResponding) {
          // Si el usuario interrumpe, detener la voz de la IA
          window.speechSynthesis.cancel();
          this.isAiResponding = false;
        }
      },
      onSpeechEnd: (audioBlob, audioUrl, duration) => {
        this.handleUserTurnCompleted(audioBlob, audioUrl);
      },
      onAudioVolume: (level) => {
        if (typeof this.onAudioVolume === 'function') {
          this.onAudioVolume(level);
        }
      },
      onError: (err) => this.onError(err)
    });

    const micOk = await this.audioVad.start();
    if (!micOk) return false;

    // 3. Iniciar temporizador regresivo de 10 minutos
    this.startTimer();

    // 4. Saludo inicial del personaje del escenario
    await this.sendInitialGreeting();

    return true;
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
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.latestTranscript += ' ' + transcript;
        } else {
          interim += transcript;
        }
      }
      this.onUserSpeechRecognized(this.latestTranscript + (interim ? ` (${interim})` : ''));
    };

    this.recognition.onerror = (event) => {
      console.warn('[SpeechRecognition] Evento de error:', event.error);
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
   * Saludo inicial del personaje para romper el hielo según el escenario
   */
  async sendInitialGreeting() {
    const isPlacement = this.scenario.id === 'placement_test';
    let prompt = '';

    if (isPlacement) {
      prompt = `You are Emma, welcoming the user to their initial English speaking diagnostic test. Greet them warmly in 2 short, friendly sentences. Ask their name and how they are feeling today.`;
    } else {
      prompt = `
Context: You are ${this.scenario.aiRole}. 
Scenario: ${this.scenario.scenarioContext}. 
The user is playing the role of: ${this.scenario.userRole}.
Start the conversation with an engaging opening line (1 to 2 short sentences). Do not break character. Do not give meta instructions. Speak directly to them.
`;
    }

    try {
      this.onAiResponseStarted();
      const greetingText = await this.callGeminiRaw(prompt, []);
      this.history.push({
        role: 'assistant',
        text: greetingText,
        timestamp: this.elapsedSeconds
      });
      this.onAiResponseFinished(greetingText);
      await this.speakText(greetingText);
    } catch (err) {
      this.onError(err);
    }
  }

  /**
   * Procesa el turno completado del usuario
   */
  async handleUserTurnCompleted(audioBlob, audioUrl) {
    if (!this.isSessionActive || this.isAiResponding) return;

    const userText = (this.latestTranscript || '').trim();
    this.latestTranscript = '';

    // Si no hubo texto reconocido por el navegador (ej. si el usuario habló en voz baja), no romper
    const textToRecord = userText || '(Audio recorded - speaking in English)';

    this.history.push({
      role: 'user',
      text: textToRecord,
      timestamp: this.elapsedSeconds,
      audioBlob: audioBlob,
      audioUrl: audioUrl
    });

    // Solicitar respuesta de Gemini
    await this.generateAiResponse();
  }

  async generateAiResponse() {
    this.isAiResponding = true;
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
    } finally {
      this.isAiResponding = false;
    }
  }

  /**
   * Llamada a Gemini con el historial de la conversación
   */
  async callGeminiWithHistory(systemInstruction, history) {
    const contents = history.map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.text }]
    }));

    // Inyectar system instruction
    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 150
      }
    };

    // Usamos gemini-3.8-flash como modelo conversacional rápido
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
  }

  async callGeminiRaw(prompt, history) {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 120 }
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
  }

  /**
   * Sintetizador de voz Text-to-Speech usando Web Speech API
   */
  speakText(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Buscar la mejor voz en inglés disponible en el dispositivo
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => 
        (v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Natural') || v.name.includes('Daniel')))
      ) || voices.find(v => v.lang.startsWith('en'));

      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Detiene la sesión y dispara el callback de finalización
   */
  stop(autoFinished = false) {
    if (!this.isSessionActive) return;

    this.isSessionActive = false;
    clearInterval(this.timerInterval);
    this.timerInterval = null;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    if (this.audioVad) {
      this.audioVad.stop();
    }

    window.speechSynthesis.cancel();

    this.onSessionFinished({
      scenario: this.scenario,
      history: this.history,
      durationSeconds: this.elapsedSeconds,
      autoFinished: autoFinished
    });
  }
}

