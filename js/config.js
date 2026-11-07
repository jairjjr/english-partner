/**
 * Módulo de Configuración y Almacenamiento Local (English Partner)
 */
const Config = {
  // Configuración predeterminada para tu aplicación
  DEFAULT_GAS_URL: 'https://script.google.com/macros/s/AKfycbx4P1vL7VYbu5upoMaNfq_M61LYMTQ5S9arKhJRGCSucEU0sJDtYTqKF9AS0yL9jI7U/exec',
  DEFAULT_API_KEY: '', // Se descarga automáticamente y de forma segura desde tu Google Apps Script privado

  KEYS: {
    API_KEY: 'ep_gemini_api_key',
    GAS_URL: 'ep_gas_web_app_url',
    PIN: 'ep_user_pin',
    LEVEL: 'ep_user_level',
    PLACEMENT_DONE: 'ep_placement_done',
    DRIVE_MODE: 'ep_drive_mode_enabled',
    VOICE_URI: 'ep_selected_voice_uri',
    PAUSE_DELAY: 'ep_pause_delay_ms'
  },

  getPauseDelay() {
    const val = localStorage.getItem(this.KEYS.PAUSE_DELAY);
    return val ? parseInt(val, 10) : 2800;
  },

  setPauseDelay(ms) {
    localStorage.setItem(this.KEYS.PAUSE_DELAY, ms.toString());
  },

  getApiKey() {
    return localStorage.getItem(this.KEYS.API_KEY) || this.DEFAULT_API_KEY;
  },

  setApiKey(key) {
    if (key) {
      localStorage.setItem(this.KEYS.API_KEY, key.trim());
    } else {
      localStorage.removeItem(this.KEYS.API_KEY);
    }
  },

  getGasUrl() {
    return localStorage.getItem(this.KEYS.GAS_URL) || this.DEFAULT_GAS_URL;
  },

  setGasUrl(url) {
    if (url) {
      localStorage.setItem(this.KEYS.GAS_URL, url.trim());
    } else {
      localStorage.removeItem(this.KEYS.GAS_URL);
    }
  },

  getPin() {
    return localStorage.getItem(this.KEYS.PIN) || '1234';
  },

  setPin(pin) {
    localStorage.setItem(this.KEYS.PIN, (pin || '1234').trim());
  },

  getLevel() {
    return localStorage.getItem(this.KEYS.LEVEL) || 'PENDING_PLACEMENT';
  },

  setLevel(level) {
    localStorage.setItem(this.KEYS.LEVEL, level);
  },

  isPlacementDone() {
    return localStorage.getItem(this.KEYS.PLACEMENT_DONE) === 'true';
  },

  setPlacementDone(done) {
    localStorage.setItem(this.KEYS.PLACEMENT_DONE, done ? 'true' : 'false');
  },

  isDriveMode() {
    return localStorage.getItem(this.KEYS.DRIVE_MODE) === 'true';
  },

  setDriveMode(enabled) {
    localStorage.setItem(this.KEYS.DRIVE_MODE, enabled ? 'true' : 'false');
  },

  isConfigured() {
    return !!this.getApiKey();
  }
};

