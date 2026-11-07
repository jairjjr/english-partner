/**
 * Módulo de Configuración y Almacenamiento Local (English Partner)
 */
const Config = {
  // Configuración predeterminada para tu aplicación
  DEFAULT_GAS_URL: 'https://script.google.com/macros/s/AKfycbx4P1vL7VYbu5upoMaNfq_M61LYMTQ5S9arKhJRGCSucEU0sJDtYTqKF9AS0yL9jI7U/exec',
  DEFAULT_API_KEY: '', // Se descarga automáticamente y de forma segura desde tu Google Apps Script privado
  DEFAULT_PIN: '8619',

  KEYS: {
    API_KEY: 'ep_gemini_api_key',
    GAS_URL: 'ep_gas_web_app_url',
    PIN: 'ep_user_pin',
    LEVEL: 'ep_user_level',
    PLACEMENT_DONE: 'ep_placement_done',
    DRIVE_MODE: 'ep_drive_mode_enabled',
    VOICE_URI: 'ep_selected_voice_uri',
    PAUSE_DELAY: 'ep_pause_delay_ms',
    PENDING_MISTAKES: 'ep_pending_mistakes',
    COMPLETED_SCENARIOS: 'ep_completed_scenarios',
    RECENT_SCORES: 'ep_recent_scores'
  },

  getPendingMistakes() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.PENDING_MISTAKES) || '[]');
    } catch (e) {
      return [];
    }
  },

  setPendingMistakes(mistakes) {
    if (Array.isArray(mistakes)) {
      localStorage.setItem(this.KEYS.PENDING_MISTAKES, JSON.stringify(mistakes.slice(0, 15)));
    }
  },

  extractMistakesFromReport(report) {
    if (!report) return [];
    const list = [];
    if (Array.isArray(report.grammarAudit)) {
      report.grammarAudit.forEach(g => {
        if (g.original && g.corrected) {
          list.push({
            type: 'GRAMMAR',
            original: g.original,
            correction: g.corrected,
            explanation: g.explanation || g.rule || ''
          });
        }
      });
    }
    if (Array.isArray(report.vocabularyAudit)) {
      report.vocabularyAudit.forEach(v => {
        if (v.original && (v.nativeAlternative || v.businessAlternative)) {
          list.push({
            type: 'VOCABULARY',
            original: v.original,
            correction: v.businessAlternative || v.nativeAlternative,
            explanation: v.reason || ''
          });
        }
      });
    }
    if (Array.isArray(report.pronunciationAudit)) {
      report.pronunciationAudit.forEach(p => {
        if (p.word) {
          list.push({
            type: 'PRONUNCIATION',
            original: p.word,
            correction: `${p.word} (${p.figuredPronunciation || p.ipa || ''})`,
            explanation: p.phoneticTip || ''
          });
        }
      });
    }
    return list;
  },

  addMistakesFromReport(report) {
    const newMistakes = this.extractMistakesFromReport(report);
    if (newMistakes.length === 0) return [];
    const existing = this.getPendingMistakes();
    const combined = [...newMistakes, ...existing].slice(0, 15);
    this.setPendingMistakes(combined);
    return newMistakes;
  },

  getCompletedScenarios() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.COMPLETED_SCENARIOS) || '[]');
    } catch (e) {
      return [];
    }
  },

  markScenarioCompleted(scenarioId) {
    if (!scenarioId || scenarioId === 'placement_test') return;
    const list = this.getCompletedScenarios();
    if (!list.includes(scenarioId)) {
      list.push(scenarioId);
      localStorage.setItem(this.KEYS.COMPLETED_SCENARIOS, JSON.stringify(list));
    }
  },

  recordSessionScore(scoreOverall) {
    const currentLevel = this.getLevel();
    if (!currentLevel || currentLevel === 'PENDING_PLACEMENT') return null;

    let scores = [];
    try {
      scores = JSON.parse(localStorage.getItem(this.KEYS.RECENT_SCORES) || '[]');
    } catch (e) {
      scores = [];
    }

    scores.push({ level: currentLevel, score: Number(scoreOverall) || 0, date: Date.now() });
    scores = scores.slice(-5);
    localStorage.setItem(this.KEYS.RECENT_SCORES, JSON.stringify(scores));

    const sameLevelScores = scores.filter(s => s.level === currentLevel);
    if (sameLevelScores.length >= 3) {
      const lastThree = sameLevelScores.slice(-3);
      const avg = lastThree.reduce((acc, item) => acc + item.score, 0) / 3;
      const ladder = ['A2', 'B1', 'B2', 'C1'];
      const idx = ladder.indexOf(currentLevel);
      if (avg >= 88 && idx !== -1 && idx < ladder.length - 1) {
        return {
          shouldLevelUp: true,
          currentLevel: currentLevel,
          nextLevel: ladder[idx + 1],
          averageScore: Math.round(avg)
        };
      }
    }
    return null;
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
    return localStorage.getItem(this.KEYS.PIN) || this.DEFAULT_PIN;
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

