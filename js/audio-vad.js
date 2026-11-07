/**
 * Módulo de Captura de Audio, Voice Activity Detection (VAD) y WakeLock
 * Diseñado especialmente para Modo Camioneta (Manos Libres & Bluetooth).
 */

class AudioVAD {
  constructor(options = {}) {
    this.silenceThreshold = options.silenceThreshold || 0.035; // Umbral calibrado contra ruido ambiente
    this.silenceDurationMs = options.silenceDurationMs || 1500; // Milisegundos de silencio para cerrar turno
    this.minSpeechDurationMs = options.minSpeechDurationMs || 700; // Mínimo para no disparar con ruidos cortos

    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];

    this.isRecording = false;
    this.isPaused = false; // Pausa el detector mientras el Coach habla para evitar auto-eco
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSoundTime = 0;
    this.animationFrameId = null;
    this.wakeLock = null;

    // Callbacks
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onAudioVolume = options.onAudioVolume || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Solicita WakeLock para impedir que la pantalla se apague en la camioneta
   */
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Pantalla bloqueada contra apagado automático.');
        this.wakeLock.addEventListener('release', () => {
          console.log('[WakeLock] Pantalla liberada.');
        });
      }
    } catch (err) {
      console.warn('[WakeLock] No se pudo activar WakeLock:', err.message);
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * Inicializa el flujo de micrófono y el analizador de volumen
   */
  async start() {
    try {
      await this.requestWakeLock();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);

      this.isRecording = true;
      this.initMediaRecorder();
      this.monitorAudioLevel();

      return true;
    } catch (err) {
      console.error('[AudioVAD] Error al iniciar micrófono:', err);
      this.onError(err);
      return false;
    }
  }

  initMediaRecorder() {
    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
  }

  monitorAudioLevel() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkLevel = () => {
      if (!this.isRecording) return;

      this.analyser.getByteTimeDomainData(dataArray);

      // Calcular Root Mean Square (RMS) para volumen normalizado 0.0 - 1.0
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const now = performance.now();

      this.onAudioVolume(rms);

      // Si el Coach está hablando, ignorar entrada de micrófono para evitar auto-eco
      if (this.isPaused) {
        if (this.isSpeaking) {
          this.isSpeaking = false;
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try { this.mediaRecorder.stop(); } catch (e) {}
          }
        }
        this.animationFrameId = requestAnimationFrame(checkLevel);
        return;
      }

      // Lógica de detección de voz (VAD)
      if (rms > this.silenceThreshold) {
        this.lastSoundTime = now;

        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.speechStartTime = now;
          this.recordedChunks = [];
          if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.mediaRecorder.start(100);
          }
          this.onSpeechStart();
        }
      } else {
        // En silencio
        if (this.isSpeaking) {
          const silenceElapsed = now - this.lastSoundTime;
          const speechDuration = now - this.speechStartTime;

          if (silenceElapsed > this.silenceDurationMs) {
            this.isSpeaking = false;

            if (speechDuration >= this.minSpeechDurationMs) {
              // Turno válido completado
              if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                setTimeout(() => {
                  const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
                  const audioBlob = new Blob(this.recordedChunks, { type: mimeType });
                  const audioUrl = URL.createObjectURL(audioBlob);
                  this.onSpeechEnd(audioBlob, audioUrl, speechDuration);
                }, 150);
              }
            } else {
              // Ruido corto descartado
              if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
              }
            }
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(checkLevel);
    };

    this.animationFrameId = requestAnimationFrame(checkLevel);
  }

  stop() {
    this.isRecording = false;
    this.isSpeaking = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.releaseWakeLock();
  }
}

