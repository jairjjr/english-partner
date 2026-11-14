/**
 * Módulo de Sincronización en la Nube con Google Apps Script y Cola Offline (v8.1)
 * Garantiza resiliencia cuando el usuario maneja en zonas con señal inestable.
 */

const SyncService = {
  QUEUE_KEY: 'ep_offline_sync_queue',

  init() {
    window.addEventListener('online', () => {
      console.log('[SyncService] Red reestablecida. Vaciando cola offline...');
      this.flushQueue();
    });
  },

  getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  saveQueue(queue) {
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
  },

  addToQueue(payload) {
    const queue = this.getQueue();
    queue.push({
      id: 'task_' + Date.now(),
      timestamp: new Date().toISOString(),
      payload: payload
    });
    this.saveQueue(queue);
    console.log('[SyncService] Tarea guardada en cola offline. Total pendientes:', queue.length);
  },

  async postPayload(gasUrl, payload) {
    const response = await Config.fetchWithTimeout(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }, 15000);
    return await response.json();
  },

  async flushQueue() {
    const queue = this.getQueue();
    if (queue.length === 0) return;

    const gasUrl = Config.getGasUrl();
    const currentPin = Config.getPin();
    if (!gasUrl || !currentPin) return;

    console.log(`[SyncService] Procesando ${queue.length} tareas pendientes...`);
    const remaining = [];

    for (const item of queue) {
      try {
        const payload = { ...item.payload, pin: item.payload.pin || currentPin };
        const resJson = await this.postPayload(gasUrl, payload);
        if (!resJson || !resJson.success) {
          remaining.push(item);
        }
      } catch (err) {
        remaining.push(item);
      }
    }

    this.saveQueue(remaining);
  },

  async dispatchOrQueue(payload, extraMeta = {}) {
    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();

    if (!gasUrl || !pin || !navigator.onLine) {
      this.addToQueue(payload);
      return { success: true, queued: true, ...extraMeta };
    }

    try {
      return await this.postPayload(gasUrl, payload);
    } catch (err) {
      console.warn('[SyncService] Error de red, guardando en cola offline:', err.message);
      this.addToQueue(payload);
      return { success: true, queued: true, ...extraMeta };
    }
  },

  /**
   * Guarda una sesión regular de 10 minutos
   */
  async saveSession(sessionData, report) {
    const extractedMistakes = Config.addMistakesFromReport(report);
    if (report && !report.mistakes) {
      report.mistakes = extractedMistakes;
    }
    if (sessionData && sessionData.scenario && sessionData.scenario.id) {
      Config.markScenarioCompleted(sessionData.scenario.id);
    }
    Config.incrementLocalStats(sessionData ? sessionData.durationSeconds : 600);

    const payload = {
      action: 'saveSession',
      pin: Config.getPin(),
      sessionData: {
        id: 'sess_' + Date.now(),
        scenarioId: sessionData.scenario.id,
        scenarioTitle: sessionData.scenario.title,
        mode: sessionData.mode || 'NORMAL',
        durationSeconds: sessionData.durationSeconds,
        report: report
      }
    };

    return await this.dispatchOrQueue(payload);
  },

  /**
   * Guarda el resultado del examen diagnóstico inicial
   */
  async savePlacement(level, sessionData, report) {
    Config.setLevel(level);
    Config.setPlacementDone(true);
    Config.incrementLocalStats(sessionData ? sessionData.durationSeconds : 600);

    const extractedMistakes = Config.addMistakesFromReport(report);
    if (report && !report.mistakes) {
      report.mistakes = extractedMistakes;
    }

    const payload = {
      action: 'savePlacement',
      pin: Config.getPin(),
      level: level,
      sessionData: {
        id: 'placement_' + Date.now(),
        scenarioId: 'placement_test',
        scenarioTitle: 'Initial Placement Test',
        mode: sessionData.mode || 'NORMAL',
        durationSeconds: sessionData.durationSeconds,
        report: report
      }
    };

    return await this.dispatchOrQueue(payload, { level });
  },

  /**
   * Marca un error del Banco de Errores como dominado
   */
  async markMistakeMastered(errorId, originalText) {
    Config.markMistakeMasteredLocally(errorId, originalText);

    if (!errorId) {
      return { success: true, localOnly: true };
    }

    return await this.dispatchOrQueue({
      action: 'markMistakeMastered',
      pin: Config.getPin(),
      errorId
    });
  },

  /**
   * Descarga el estado y progreso desde Google Apps Script para sincronizar PC y móvil
   */
  async fetchCloudProgress() {
    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();
    if (!gasUrl) return null;
    if (!pin) return { needsPin: true };

    try {
      const url = `${gasUrl}?action=getProgress&pin=${encodeURIComponent(pin)}`;
      const response = await Config.fetchWithTimeout(url, {}, 15000);
      const data = await response.json();
      if (data && data.success && data.data) {
        if (data.data.level && data.data.level !== 'PENDING_PLACEMENT') {
          Config.setLevel(data.data.level);
        }
        if (data.data.placementCompleted) {
          Config.setPlacementDone(true);
        }
        if (data.data.apiKey && !Config.getApiKey()) {
          Config.setApiKey(data.data.apiKey);
        }
        if (Array.isArray(data.data.pendingMistakes)) {
          Config.setPendingMistakes(data.data.pendingMistakes);
        }
        if (typeof data.data.totalSessions === 'number' || typeof data.data.totalMinutes === 'number') {
          Config.setStats(data.data.totalSessions || 0, data.data.totalMinutes || 0);
        }
        return data.data;
      }
      return { authError: data && data.error };
    } catch (err) {
      console.warn('[SyncService] No se pudo conectar a Google Sheets:', err.message);
      return null;
    }
  },

  /**
   * Consulta el historial reciente de sesiones desde Google Apps Script
   */
  async fetchHistory() {
    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();
    if (!gasUrl || !pin) return { success: false, error: 'Configura tu URL y PIN en Ajustes para consultar el historial en la nube.', data: [] };

    try {
      const url = `${gasUrl}?action=getHistory&pin=${encodeURIComponent(pin)}`;
      const response = await Config.fetchWithTimeout(url, {}, 15000);
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message, data: [] };
    }
  }
};

SyncService.init();
