/**
 * Módulo de Sincronización en la Nube con Google Apps Script y Cola Offline
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

  async flushQueue() {
    const queue = this.getQueue();
    if (queue.length === 0) return;

    const gasUrl = Config.getGasUrl();
    if (!gasUrl) return;

    console.log(`[SyncService] Procesando ${queue.length} tareas pendientes...`);
    const remaining = [];

    for (const item of queue) {
      try {
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item.payload)
        });
        const resJson = await response.json();
        if (!resJson.success) {
          remaining.push(item);
        }
      } catch (err) {
        remaining.push(item);
      }
    }

    this.saveQueue(remaining);
  },

  /**
   * Guarda una sesión regular de 10 minutos
   */
  async saveSession(sessionData, report) {
    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();

    // Extraer y persistir errores para alimentar la memoria activa de las próximas sesiones
    const extractedMistakes = Config.addMistakesFromReport(report);
    if (report && !report.mistakes) {
      report.mistakes = extractedMistakes;
    }
    if (sessionData && sessionData.scenario && sessionData.scenario.id) {
      Config.markScenarioCompleted(sessionData.scenario.id);
    }

    const payload = {
      action: 'saveSession',
      pin: pin,
      sessionData: {
        id: 'sess_' + Date.now(),
        scenarioId: sessionData.scenario.id,
        scenarioTitle: sessionData.scenario.title,
        mode: sessionData.mode || 'NORMAL',
        durationSeconds: sessionData.durationSeconds,
        report: report
      }
    };

    if (!gasUrl || !navigator.onLine) {
      this.addToQueue(payload);
      return { success: true, queued: true };
    }

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.warn('[SyncService] Error de red, guardando en cola offline:', err);
      this.addToQueue(payload);
      return { success: true, queued: true };
    }
  },

  /**
   * Guarda el resultado del examen diagnóstico inicial
   */
  async savePlacement(level, sessionData, report) {
    Config.setLevel(level);
    Config.setPlacementDone(true);

    const extractedMistakes = Config.addMistakesFromReport(report);
    if (report && !report.mistakes) {
      report.mistakes = extractedMistakes;
    }

    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();

    const payload = {
      action: 'savePlacement',
      pin: pin,
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

    if (!gasUrl || !navigator.onLine) {
      this.addToQueue(payload);
      return { success: true, queued: true, level };
    }

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      this.addToQueue(payload);
      return { success: true, queued: true, level };
    }
  },

  /**
   * Descarga el estado y progreso desde Google Apps Script para sincronizar PC y móvil
   */
  async fetchCloudProgress() {
    const gasUrl = Config.getGasUrl();
    const pin = Config.getPin();
    if (!gasUrl) return null;

    try {
      const url = `${gasUrl}?action=getProgress&pin=${encodeURIComponent(pin)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success && data.data) {
        if (data.data.level && data.data.level !== 'PENDING_PLACEMENT') {
          Config.setLevel(data.data.level);
        }
        if (data.data.placementCompleted) {
          Config.setPlacementDone(true);
        }
        if (data.data.apiKey && !Config.getApiKey()) {
          Config.setApiKey(data.data.apiKey);
        }
        if (Array.isArray(data.data.pendingMistakes) && data.data.pendingMistakes.length > 0) {
          Config.setPendingMistakes(data.data.pendingMistakes);
        }
        return data.data;
      }
      return null;
    } catch (err) {
      console.warn('[SyncService] No se pudo conectar a Google Sheets:', err);
      return null;
    }
  }
};

SyncService.init();

