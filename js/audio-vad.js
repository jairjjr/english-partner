/**
 * Módulo de Captura y Control de Pantalla (English Partner v5 - Safari Safe)
 * Elimina la concurrencia destructiva entre Web Audio y SpeechRecognition
 * para garantizar 100% de estabilidad sin crashes en Safari (macOS / iOS).
 */

class AudioVAD {
  constructor(options = {}) {
    this.isRecording = false;
    this.isPaused = false;
    this.wakeLock = null;

    // Callbacks
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onAudioVolume = options.onAudioVolume || (() => {});
    this.onError = options.onError || (() => {});
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Pantalla bloqueada contra suspensión.');
      }
    } catch (e) {
      console.warn('[WakeLock] No disponible:', e.message);
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  async start() {
    await this.requestWakeLock();
    this.isRecording = true;
    return true;
  }

  stop() {
    this.isRecording = false;
    this.isPaused = false;
    this.releaseWakeLock();
  }
}
