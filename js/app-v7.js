/**
 * Controlador Principal de la Aplicación (English Partner v8.1 - Pulido Premium & Blindaje)
 * - Integración con Gemini Studio TTS (gemini-3.8-flash-lite-tts con voz Aoede)
 * - Modo Oído Puro (Blind Listening) + Tap-to-Talk Shield
 * - Modales nativos <dialog> con inert, Toasts no bloqueantes y Skeleton Screens
 * - Barra de progreso, Historial y gestión de Banco de Errores
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Service Worker PWA v8.1.0
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=8.1');
      await reg.update();
      console.log('[PWA] Service Worker v8.1.0 actualizado.');
    } catch (e) {
      console.warn('[PWA] Service Worker:', e);
    }
  }

  // 2. Elementos del DOM
  const appHeader = document.getElementById('app-header');
  const appMain = document.getElementById('app-main');
  const views = {
    home: document.getElementById('view-home'),
    session: document.getElementById('view-session'),
    report: document.getElementById('view-report')
  };

  const btnDriveToggle = document.getElementById('btn-drive-toggle');
  const btnHistory = document.getElementById('btn-history');
  const btnSettings = document.getElementById('btn-settings');

  const modalSettings = document.getElementById('modal-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  const modalHistory = document.getElementById('modal-history');
  const btnCloseHistory = document.getElementById('btn-close-history');
  const historyMistakesList = document.getElementById('history-mistakes-list');
  const historySessionsList = document.getElementById('history-sessions-list');

  const modalConfirm = document.getElementById('modal-confirm');
  const confirmMessage = document.getElementById('confirm-message');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');

  const toastContainer = document.getElementById('toast-container');

  const inputApiKey = document.getElementById('input-api-key');
  const inputGasUrl = document.getElementById('input-gas-url');
  const inputPin = document.getElementById('input-pin');
  const selectPauseDelay = document.getElementById('select-pause-delay');

  const statSessions = document.getElementById('stat-sessions');
  const statMinutes = document.getElementById('stat-minutes');
  const statMistakes = document.getElementById('stat-mistakes');
  const btnRetakePlacement = document.getElementById('btn-retake-placement');

  const placementBanner = document.getElementById('placement-banner');
  const btnStartPlacement = document.getElementById('btn-start-placement');
  const btnTestVoice = document.getElementById('btn-test-voice');
  const categoryTabsContainer = document.getElementById('category-tabs');
  const scenariosGrid = document.getElementById('scenarios-grid');
  const userLevelBadge = document.getElementById('user-level-badge');

  const sessionScenarioTitle = document.getElementById('session-scenario-title');
  const sessionTimerDigits = document.getElementById('session-timer-digits');
  const wrapUpBanner = document.getElementById('wrap-up-banner');
  const waveVisualizer = document.getElementById('wave-visualizer');

  const liveSpeechCard = document.getElementById('live-speech-card');
  const speechStatusPill = document.getElementById('speech-status-pill');
  const liveTranscriptText = document.getElementById('live-transcript-text');
  const btnToggleSubtitles = document.getElementById('btn-toggle-subtitles');
  const btnSubmitTurn = document.getElementById('btn-submit-turn');

  const btnReplayAi = document.getElementById('btn-replay-ai');
  const btnEndSession = document.getElementById('btn-end-session');

  const reportScenarioTitle = document.getElementById('report-scenario-title');
  const reportSkeleton = document.getElementById('report-skeleton');
  const reportMainContent = document.getElementById('report-main-content');
  const reportErrorBanner = document.getElementById('report-error-banner');
  const reportErrorMessage = document.getElementById('report-error-message');
  const btnRetryEvaluation = document.getElementById('btn-retry-evaluation');
  const reportFeedbackSummary = document.getElementById('report-feedback-summary');
  const scoreOverall = document.getElementById('score-overall');
  const scoreGrammar = document.getElementById('score-grammar');
  const scoreVocabulary = document.getElementById('score-vocabulary');
  const scorePronunciation = document.getElementById('score-pronunciation');
  const btnListenSummary = document.getElementById('btn-listen-summary');
  const reportTabBtns = document.querySelectorAll('.report-tab-btn');
  const tabGrammar = document.getElementById('tab-content-grammar');
  const tabVocabulary = document.getElementById('tab-content-vocabulary');
  const tabPronunciation = document.getElementById('tab-content-pronunciation');
  const tabTranscript = document.getElementById('tab-content-transcript');
  const btnBackHome = document.getElementById('btn-back-home');

  let currentVoiceEngine = null;
  let activeCategory = 'all';
  let latestGeneratedReport = null;
  let latestSessionResult = null;
  let isSubtitlesRevealed = false;
  let confirmResolver = null;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'info', durationMs = 3400) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const typeClass = type === 'info' ? '' : ` toast-${type}`;
    toast.className = `toast${typeClass}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, durationMs);
  }

  function setBackgroundInert(isInert) {
    if (appHeader) appHeader.inert = isInert;
    if (appMain) appMain.inert = isInert;
  }

  function openDialog(dlg) {
    if (!dlg) return;
    setBackgroundInert(true);
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) {
      dlg.close();
    } else {
      dlg.removeAttribute('open');
    }
    setBackgroundInert(false);
  }

  [modalSettings, modalHistory, modalConfirm].forEach(dlg => {
    if (dlg) {
      dlg.addEventListener('close', () => setBackgroundInert(false));
      dlg.addEventListener('cancel', () => setBackgroundInert(false));
    }
  });

  function askConfirm(message, acceptLabel = 'Confirmar') {
    if (!modalConfirm || !confirmMessage || !btnConfirmAccept) {
      return Promise.resolve(true);
    }
    confirmMessage.textContent = message;
    btnConfirmAccept.textContent = acceptLabel;
    openDialog(modalConfirm);

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  if (btnConfirmCancel) {
    btnConfirmCancel.addEventListener('click', () => {
      closeDialog(modalConfirm);
      if (confirmResolver) {
        confirmResolver(false);
        confirmResolver = null;
      }
    });
  }

  if (btnConfirmAccept) {
    btnConfirmAccept.addEventListener('click', () => {
      closeDialog(modalConfirm);
      if (confirmResolver) {
        confirmResolver(true);
        confirmResolver = null;
      }
    });
  }

  initAppMode();
  renderCategories();
  renderScenarios();
  updateUserBadge();
  updateStatsBar();
  syncWithCloud();

  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', testGeminiEmmaVoice);
  }

  async function testGeminiEmmaVoice() {
    const apiKey = Config.getApiKey();
    if (!apiKey) {
      showToast('Ingresa tu API Key de Gemini en Ajustes primero.', 'warning');
      openSettings();
      return;
    }

    const originalText = btnTestVoice.innerHTML;
    btnTestVoice.innerHTML = '⏳ Conectando...';
    btnTestVoice.disabled = true;

    try {
      const sampleText = "Hi there! I'm Emma, your English speaking coach. I am ready to practice with you!";
      const blob = await VoiceEngine.fetchGeminiAudioBlob(sampleText, apiKey);
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        btnTestVoice.innerHTML = originalText;
        btnTestVoice.disabled = false;
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        btnTestVoice.innerHTML = originalText;
        btnTestVoice.disabled = false;
        showToast('No se pudo reproducir el audio de prueba.', 'error');
      };

      await audio.play();
    } catch (err) {
      console.warn('[TestVoice] Falló audio Gemini, recurriendo a voz local:', err.message);
      btnTestVoice.innerHTML = originalText;
      btnTestVoice.disabled = false;

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance("Hi there! I'm Emma. Audio fallback active.");
        utt.lang = 'en-US';
        window.speechSynthesis.speak(utt);
        showToast('Voz neural ocupada; usando respaldo local.', 'warning');
      } else {
        showToast('Error conectando a Gemini TTS: ' + err.message, 'error');
      }
    }
  }

  function switchView(viewName) {
    Object.keys(views).forEach(k => views[k].classList.remove('active'));
    if (views[viewName]) {
      views[viewName].classList.add('active');
      window.scrollTo(0, 0);
    }
  }

  function initAppMode() {
    if (Config.isDriveMode()) {
      document.body.classList.add('drive-mode');
      btnDriveToggle.classList.add('active');
      btnDriveToggle.innerHTML = '🚗 Modo Camioneta Activo';
    } else {
      document.body.classList.remove('drive-mode');
      btnDriveToggle.classList.remove('active');
      btnDriveToggle.innerHTML = '🚗 Modo Camioneta';
    }
  }

  btnDriveToggle.addEventListener('click', () => {
    const isDrive = !Config.isDriveMode();
    Config.setDriveMode(isDrive);
    initAppMode();
  });

  function updateUserBadge() {
    const level = Config.getLevel();
    userLevelBadge.classList.remove('level-tag-warning', 'level-tag-accent');
    if (level === 'PENDING_PLACEMENT') {
      userLevelBadge.textContent = 'Diagnóstico Pendiente';
      userLevelBadge.classList.add('level-tag-warning');
      placementBanner.style.display = 'flex';
      if (btnRetakePlacement) btnRetakePlacement.hidden = true;
    } else {
      userLevelBadge.textContent = `Nivel: ${level}`;
      userLevelBadge.classList.add('level-tag-accent');
      placementBanner.style.display = 'none';
      if (btnRetakePlacement) btnRetakePlacement.hidden = false;
    }
  }

  function updateStatsBar() {
    const stats = Config.getStats();
    const pending = Config.getPendingMistakes();
    if (statSessions) statSessions.textContent = stats.totalSessions;
    if (statMinutes) statMinutes.textContent = `${stats.totalMinutes}m`;
    if (statMistakes) statMistakes.textContent = pending.length;
  }

  async function syncWithCloud() {
    if (!Config.getGasUrl()) return;

    const cloudData = await SyncService.fetchCloudProgress();
    if (!cloudData) return;

    if (cloudData.needsPin) {
      showToast('Ingresa tu PIN en ⚙️ Ajustes para sincronizar con tu Sheet.', 'info');
      return;
    }

    if (cloudData.authError) {
      showToast('PIN inválido al sincronizar con Google Sheets.', 'warning');
      return;
    }

    updateUserBadge();
    updateStatsBar();
    renderScenarios();
  }

  function renderCategories() {
    const categories = Curriculum.getCategories();
    categoryTabsContainer.innerHTML = '';
    categories.forEach(cat => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `cat-tab ${cat.id === activeCategory ? 'active' : ''}`;
      tab.textContent = cat.name;
      tab.addEventListener('click', () => {
        activeCategory = cat.id;
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderScenarios();
      });
      categoryTabsContainer.appendChild(tab);
    });
  }

  function renderScenarios() {
    const userLevel = Config.getLevel();
    const completedIds = Config.getCompletedScenarios();
    const pendingMistakes = Config.getPendingMistakes();
    const scenarios = Curriculum.getScenariosSortedForUser(activeCategory, userLevel, completedIds);

    scenariosGrid.innerHTML = '';

    if (pendingMistakes.length > 0 && (activeCategory === 'all' || activeCategory === 'adaptive')) {
      const drillScenario = Curriculum.getMistakesDrillScenario(userLevel, pendingMistakes);
      const drillCard = document.createElement('div');
      drillCard.className = 'scenario-card mistakes-drill';

      const sampleCorrections = pendingMistakes.slice(0, 2)
        .map(m => `<span class="mistake-pill">✓ "${escapeHtml(m.correction)}"</span>`)
        .join('');

      drillCard.innerHTML = `
        <div>
          <div class="card-header">
            <span class="level-tag level-tag-success">Repaso (${escapeHtml(drillScenario.level)})</span>
            <span class="status-tag-success">${pendingMistakes.length} por pulir</span>
          </div>
          <h3 class="card-title">${escapeHtml(drillScenario.title)}</h3>
          <p class="card-desc">${escapeHtml(drillScenario.description)}</p>
          <div class="mistake-pills-wrap">${sampleCorrections}</div>
        </div>
        <div class="card-footer">
          <span>Emma (Coach Personal)</span>
          <span class="status-tag-success">Practicar &rarr;</span>
        </div>
      `;
      drillCard.addEventListener('click', () => startSession(drillScenario));
      scenariosGrid.appendChild(drillCard);
    }

    scenarios.forEach(sc => {
      const isRecommended = (userLevel !== 'PENDING_PLACEMENT' && sc.level === userLevel && !completedIds.includes(sc.id));
      const isCompleted = completedIds.includes(sc.id);

      const card = document.createElement('div');
      card.className = isRecommended ? 'scenario-card recommended' : 'scenario-card';

      let statusBadge = `<span class="status-tag-muted">10 min</span>`;
      if (isRecommended) {
        statusBadge = `<span class="status-tag-recommended">Recomendado</span>`;
      } else if (isCompleted) {
        statusBadge = `<span class="status-tag-success">Completado</span>`;
      }

      const vocabPreview = Array.isArray(sc.targetVocabulary) && sc.targetVocabulary.length > 0
        ? `<div class="vocab-preview">Meta: <i>"${escapeHtml(sc.targetVocabulary[0])}"</i></div>`
        : '';

      card.innerHTML = `
        <div>
          <div class="card-header">
            <span class="level-tag">${escapeHtml(sc.level)}</span>
            ${statusBadge}
          </div>
          <h3 class="card-title">${escapeHtml(sc.title)}</h3>
          <p class="card-desc">${escapeHtml(sc.description)}</p>
          ${vocabPreview}
        </div>
        <div class="card-footer">
          <span>${escapeHtml(sc.aiRole.split(',')[0])}</span>
          <span class="card-cta">Entrenar &rarr;</span>
        </div>
      `;
      card.addEventListener('click', () => startSession(sc));
      scenariosGrid.appendChild(card);
    });
  }

  btnStartPlacement.addEventListener('click', () => {
    startSession(Curriculum.getPlacementTest());
  });

  if (btnRetakePlacement) {
    btnRetakePlacement.addEventListener('click', async () => {
      const ok = await askConfirm(
        '¿Quieres repetir el Examen Diagnóstico Inicial (Placement Test) para recalibrar tu nivel actual?',
        'Iniciar Examen'
      );
      if (ok) {
        startSession(Curriculum.getPlacementTest());
      }
    });
  }

  if (btnToggleSubtitles) {
    btnToggleSubtitles.addEventListener('click', (e) => {
      e.stopPropagation();
      isSubtitlesRevealed = !isSubtitlesRevealed;
      updateSubtitlesVisibility();
    });
  }

  if (btnSubmitTurn) {
    btnSubmitTurn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentVoiceEngine && !currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
        btnSubmitTurn.hidden = true;
        currentVoiceEngine.commitUserTurnNow();
      }
    });
  }

  function updateSubtitlesVisibility() {
    if (!liveTranscriptText) return;
    if (isSubtitlesRevealed) {
      liveTranscriptText.classList.remove('blind-mode');
      liveTranscriptText.classList.add('revealed');
      btnToggleSubtitles.innerHTML = '🙈 Ocultar subtítulo';
    } else {
      liveTranscriptText.classList.remove('revealed');
      liveTranscriptText.classList.add('blind-mode');
      btnToggleSubtitles.innerHTML = '👁️ Ver subtítulo';
    }
  }

  if (liveSpeechCard) {
    liveSpeechCard.addEventListener('click', () => {
      if (currentVoiceEngine && !currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
        currentVoiceEngine.startListeningSafely();
        speechStatusPill.innerHTML = `<span>●</span> <span>Micrófono reactivado</span>`;
      }
    });
  }

  async function startSession(scenario) {
    const apiKey = Config.getApiKey();
    if (!apiKey) {
      showToast('Configura tu API Key de Gemini antes de iniciar.', 'warning');
      openSettings();
      return;
    }

    sessionScenarioTitle.textContent = scenario.title;
    sessionTimerDigits.textContent = '10:00';
    wrapUpBanner.classList.remove('visible');

    liveSpeechCard.className = 'live-speech-card speaking';
    speechStatusPill.innerHTML = `<span>⏳</span> <span>Conectando con Emma...</span>`;
    liveTranscriptText.textContent = 'Iniciando conversación en audio de alta fidelidad...';
    btnToggleSubtitles.hidden = true;
    if (btnSubmitTurn) btnSubmitTurn.hidden = true;
    isSubtitlesRevealed = false;

    switchView('session');
    initWaveBars();

    currentVoiceEngine = new VoiceEngine({
      scenario: scenario,
      apiKey: apiKey,
      mode: Config.isDriveMode() ? 'DRIVE' : 'NORMAL',
      maxDurationSeconds: 600,
      silenceDelayMs: Config.getPauseDelay(),
      userLevel: Config.getLevel(),
      pendingMistakes: Config.getPendingMistakes(),
      onTimerTick: (timeData) => {
        sessionTimerDigits.textContent = timeData.formatted;
      },
      onWrapUpWarning: () => {
        wrapUpBanner.classList.add('visible');
        if ('vibrate' in navigator) navigator.vibrate([150, 100, 150]);
      },
      onUserSpeechRecognized: (text) => {
        liveSpeechCard.className = 'live-speech-card listening';
        speechStatusPill.innerHTML = `<span>🎤</span> <span>Escuchándote...</span>`;
        liveTranscriptText.classList.remove('blind-mode');
        liveTranscriptText.classList.add('revealed');
        liveTranscriptText.innerHTML = `<span class="speech-user-tag">🎤 Tú:</span> "${escapeHtml(text)}"`;
        btnToggleSubtitles.hidden = true;
        if (btnSubmitTurn) btnSubmitTurn.hidden = false;
      },
      onAiResponseStarted: () => {
        liveSpeechCard.className = 'live-speech-card thinking';
        speechStatusPill.innerHTML = `<span>⏳</span> <span>${escapeHtml(scenario.aiRole.split(',')[0])} está pensando...</span>`;
        liveTranscriptText.classList.remove('blind-mode');
        liveTranscriptText.textContent = 'Formulando respuesta natural...';
        btnToggleSubtitles.hidden = true;
        if (btnSubmitTurn) btnSubmitTurn.hidden = true;
        animateWaveThinking();
      },
      onAiResponseFinished: (aiText) => {
        liveTranscriptText.innerHTML = `<span class="speech-coach-tag">🗣️ Emma:</span> "${escapeHtml(aiText)}"`;
      },
      onStatusChanged: (status) => {
        if (status === 'speaking') {
          liveSpeechCard.className = 'live-speech-card speaking';
          speechStatusPill.innerHTML = `<span>●</span> <span>Emma hablando... (Escucha atenta)</span>`;
          isSubtitlesRevealed = false;
          updateSubtitlesVisibility();
          btnToggleSubtitles.hidden = false;
          if (btnSubmitTurn) btnSubmitTurn.hidden = true;
        } else if (status === 'listening') {
          liveSpeechCard.className = 'live-speech-card listening';
          speechStatusPill.innerHTML = `<span>●</span> <span>TU TURNO: Te escucho</span>`;
          liveTranscriptText.classList.remove('blind-mode', 'revealed');
          liveTranscriptText.innerHTML = `<span class="speech-placeholder">Habla con naturalidad por tu micrófono o Bluetooth (o toca aquí)...</span>`;
          btnToggleSubtitles.hidden = true;
          if (btnSubmitTurn) btnSubmitTurn.hidden = true;
        } else if (status === 'thinking') {
          liveSpeechCard.className = 'live-speech-card thinking';
          speechStatusPill.innerHTML = `<span>⏳</span> <span>Procesando...</span>`;
          btnToggleSubtitles.hidden = true;
          if (btnSubmitTurn) btnSubmitTurn.hidden = true;
        }
      },
      onSessionFinished: async (sessionResult) => {
        latestSessionResult = sessionResult;
        await handleSessionCompleted(sessionResult);
      },
      onError: (err) => {
        console.warn('[Session] Aviso:', err.message);
        speechStatusPill.innerHTML = `<span>⚠️</span> <span>Aviso de conexión</span>`;
        liveTranscriptText.innerHTML = `<span class="speech-error">${escapeHtml(err.message)}</span>`;
      }
    });

    currentVoiceEngine.onAudioVolume = (vol) => {
      updateWaveBars(vol);
    };

    const started = await currentVoiceEngine.start();
    if (!started) {
      switchView('home');
    }
  }

  if (btnReplayAi) {
    btnReplayAi.addEventListener('click', async () => {
      if (currentVoiceEngine) {
        await currentVoiceEngine.replayLastAiMessage();
      }
    });
  }

  btnEndSession.addEventListener('click', async () => {
    const confirmed = await askConfirm(
      '¿Deseas finalizar la sesión y generar tu auditoría CEFR ahora?',
      'Finalizar y Evaluar'
    );
    if (confirmed && currentVoiceEngine) {
      currentVoiceEngine.stop(false);
    }
  });

  function initWaveBars() {
    waveVisualizer.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('div');
      bar.className = 'wave-bar';
      waveVisualizer.appendChild(bar);
    }
  }

  function updateWaveBars(volume) {
    const bars = waveVisualizer.querySelectorAll('.wave-bar');
    bars.forEach((bar, idx) => {
      const factor = Math.sin((idx / bars.length) * Math.PI);
      const scale = Math.max(0.22, Math.min(1.0, volume * 4.5 * factor));
      bar.style.transform = `scaleY(${scale.toFixed(3)})`;
    });
  }

  function animateWaveThinking() {
    const bars = waveVisualizer.querySelectorAll('.wave-bar');
    bars.forEach((bar, idx) => {
      const scale = 0.32 + (idx % 3) * 0.18;
      bar.style.transform = `scaleY(${scale.toFixed(2)})`;
    });
  }

  function formatScore(val) {
    return (typeof val === 'number' && !Number.isNaN(val)) ? val : '--';
  }

  function setReportLoading(isLoading) {
    if (reportSkeleton) reportSkeleton.hidden = !isLoading;
    if (reportMainContent) reportMainContent.hidden = isLoading;
  }

  async function processEvaluationResult(sessionResult, evaluation) {
    latestGeneratedReport = evaluation.report;

    if (evaluation.success && !latestGeneratedReport.isErrorReport) {
      if (sessionResult.scenario.id === 'placement_test' && latestGeneratedReport.placement) {
        const assignedLevel = latestGeneratedReport.placement.assignedLevel || 'B1';
        Config.setLevel(assignedLevel);
        Config.setPlacementDone(true);
        await SyncService.savePlacement(assignedLevel, sessionResult, latestGeneratedReport);
      } else {
        await SyncService.saveSession(sessionResult, latestGeneratedReport);
        const overallScore = (latestGeneratedReport.scores && latestGeneratedReport.scores.overall) || 0;
        const levelUpCheck = Config.recordSessionScore(overallScore);
        if (levelUpCheck && levelUpCheck.shouldLevelUp) {
          Config.setLevel(levelUpCheck.nextLevel);
          showToast(
            `¡Subiste de ${levelUpCheck.currentLevel} a ${levelUpCheck.nextLevel}! Promedio: ${levelUpCheck.averageScore}/100`,
            'success',
            5500
          );
        }
      }
      updateUserBadge();
      updateStatsBar();
      renderScenarios();
    } else {
      console.warn('[Evaluation] No se guardaron calificaciones porque falló la evaluación real:', evaluation.error);
    }

    setReportLoading(false);
    renderReport(sessionResult.scenario, latestGeneratedReport, sessionResult);
  }

  async function handleSessionCompleted(sessionResult) {
    reportScenarioTitle.textContent = sessionResult.scenario.title;
    setReportLoading(true);
    switchView('report');

    const evaluation = await Evaluator.analyzeSession(sessionResult, Config.getApiKey());
    await processEvaluationResult(sessionResult, evaluation);

    if (
      Config.isDriveMode() &&
      evaluation.success &&
      latestGeneratedReport &&
      !latestGeneratedReport.isErrorReport &&
      latestGeneratedReport.spokenSummary
    ) {
      setTimeout(() => {
        speakSummary(latestGeneratedReport.spokenSummary);
      }, 800);
    }
  }

  if (btnRetryEvaluation) {
    btnRetryEvaluation.addEventListener('click', async () => {
      if (!latestSessionResult) return;
      btnRetryEvaluation.disabled = true;
      setReportLoading(true);
      try {
        const evaluation = await Evaluator.analyzeSession(latestSessionResult, Config.getApiKey());
        await processEvaluationResult(latestSessionResult, evaluation);
      } finally {
        btnRetryEvaluation.disabled = false;
      }
    });
  }

  function renderReportFeedbackSummary(report, isError) {
    if (!reportFeedbackSummary) return;
    if (isError) {
      reportFeedbackSummary.classList.remove('visible');
      reportFeedbackSummary.innerHTML = '';
      return;
    }

    const parts = [];
    if (report.executiveSummary) {
      parts.push(`
        <div class="summary-block">
          <div class="summary-section-title">Diagnóstico del Coach</div>
          <div>${escapeHtml(report.executiveSummary)}</div>
        </div>
      `);
    }

    if (report.placement && report.placement.assignedLevel) {
      parts.push(`
        <div class="summary-block">
          <div class="summary-section-title">Nivel Asignado: ${escapeHtml(report.placement.assignedLevel)}</div>
          <div class="summary-muted">${escapeHtml(report.placement.rationale || '')}</div>
        </div>
      `);
    }

    const metaBlocks = [];
    if (Array.isArray(report.strengths) && report.strengths.length > 0) {
      const list = report.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('');
      metaBlocks.push(`
        <div>
          <div class="summary-section-title">Fortalezas</div>
          <ul class="summary-list">${list}</ul>
        </div>
      `);
    }

    if (report.homeworkChallenge) {
      metaBlocks.push(`
        <div>
          <div class="summary-section-title">Reto para tu próxima sesión</div>
          <div>${escapeHtml(report.homeworkChallenge)}</div>
        </div>
      `);
    }

    if (metaBlocks.length > 0) {
      parts.push(`<div class="summary-meta-grid">${metaBlocks.join('')}</div>`);
    }

    if (parts.length > 0) {
      reportFeedbackSummary.innerHTML = parts.join('');
      reportFeedbackSummary.classList.add('visible');
    } else {
      reportFeedbackSummary.classList.remove('visible');
      reportFeedbackSummary.innerHTML = '';
    }
  }

  function renderReport(scenario, report, sessionResult) {
    reportScenarioTitle.textContent = scenario.title;
    const isError = Boolean(report && report.isErrorReport);
    const scores = (report && report.scores) || { grammar: null, vocabulary: null, pronunciation: null, overall: null };

    if (reportErrorBanner && reportErrorMessage) {
      reportErrorBanner.classList.toggle('visible', isError);
      reportErrorMessage.textContent = isError
        ? (report.errorMessage || 'No se pudo completar la evaluación con Gemini.')
        : '';
    }

    if (btnListenSummary) {
      btnListenSummary.hidden = !(!isError && report && report.spokenSummary);
    }

    scoreOverall.textContent = formatScore(scores.overall);
    scoreGrammar.textContent = formatScore(scores.grammar);
    scoreVocabulary.textContent = formatScore(scores.vocabulary);
    scorePronunciation.textContent = formatScore(scores.pronunciation);

    renderReportFeedbackSummary(report || {}, isError);

    // Pestaña 1: Gramática
    tabGrammar.innerHTML = '';
    if (report.grammarAudit && report.grammarAudit.length > 0) {
      report.grammarAudit.forEach(g => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div class="audit-rule-title">${escapeHtml(g.rule || 'Regla gramatical')}</div>
          <div class="diff-original">✗ Tú dijiste: "${escapeHtml(g.original)}"</div>
          <div class="diff-corrected">✓ Lo correcto: "${escapeHtml(g.corrected)}"</div>
          <div class="diff-explanation">Explicación: ${escapeHtml(g.explanation)}</div>
        `;
        tabGrammar.appendChild(item);
      });
    } else {
      tabGrammar.innerHTML = isError
        ? '<div class="audit-card">Análisis gramatical no disponible porque la evaluación falló. Revisa tu transcripción o pulsa "Reintentar Auditoría con Gemini".</div>'
        : '<div class="audit-card">Sin correcciones gramaticales mayores detectadas en esta sesión.</div>';
    }

    // Pestaña 2: Vocabulario
    tabVocabulary.innerHTML = '';
    const hasFillers = Array.isArray(report.fillerWords) && report.fillerWords.length > 0;
    const hasVocab = Array.isArray(report.vocabularyAudit) && report.vocabularyAudit.length > 0;

    if (hasFillers) {
      const fillerCard = document.createElement('div');
      fillerCard.className = 'audit-card';
      const pills = report.fillerWords
        .map(f => `<span class="filler-pill">"${escapeHtml(f.word)}" (${f.count}x)</span>`)
        .join('');
      fillerCard.innerHTML = `<div class="filler-title">Muletillas detectadas (Filler Words):</div><div>${pills}</div>`;
      tabVocabulary.appendChild(fillerCard);
    }

    if (hasVocab) {
      report.vocabularyAudit.forEach(v => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div class="summary-muted summary-block">Frase dicha: "${escapeHtml(v.original)}"</div>
          <div class="diff-corrected">Opción Nativa Informal: "${escapeHtml(v.nativeAlternative)}"</div>
          <div class="diff-upgrade">Opción Ejecutiva: "${escapeHtml(v.businessAlternative)}"</div>
          <div class="diff-explanation">${escapeHtml(v.reason || 'Eleva tu precisión léxica')}</div>
        `;
        tabVocabulary.appendChild(item);
      });
    } else if (!hasFillers) {
      tabVocabulary.innerHTML = isError
        ? '<div class="audit-card">Análisis de vocabulario no disponible por error de evaluación.</div>'
        : '<div class="audit-card">Sin sugerencias adicionales de vocabulario para esta sesión.</div>';
    }

    // Pestaña 3: Pronunciación
    tabPronunciation.innerHTML = '';
    if (report.pronunciationAudit && report.pronunciationAudit.length > 0) {
      report.pronunciationAudit.forEach(p => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div class="pronounce-row">
            <div>
              <span class="pronounce-word">${escapeHtml(p.word)}</span>
              <span class="pronounce-ipa">${escapeHtml(p.ipa || '')}</span>
              <div class="pronounce-sound">Cómo suena: <b>${escapeHtml(p.figuredPronunciation || '')}</b></div>
            </div>
            <div class="pronounce-actions">
              <button class="pronounce-audio-btn btn-play-native" type="button" data-word="${escapeHtml(p.word)}">🔊 Escuchar</button>
            </div>
          </div>
          <div class="diff-explanation">Articulación: ${escapeHtml(p.phoneticTip || '')}</div>
        `;

        const btnNative = item.querySelector('.btn-play-native');
        if (btnNative) {
          btnNative.addEventListener('click', () => speakWordNative(p.word));
        }

        tabPronunciation.appendChild(item);
      });
    } else {
      tabPronunciation.innerHTML = isError
        ? '<div class="audit-card">Análisis de pronunciación no disponible por error de evaluación.</div>'
        : '<div class="audit-card">Sin observaciones críticas de articulación en esta sesión.</div>';
    }

    // Pestaña 4: Transcripción Completa Turno a Turno
    tabTranscript.innerHTML = '';
    if (sessionResult && sessionResult.history && sessionResult.history.length > 0) {
      const chatContainer = document.createElement('div');
      chatContainer.className = 'transcript-chat-list';

      sessionResult.history.forEach(h => {
        const row = document.createElement('div');
        const isCoach = (h.role === 'assistant');
        row.className = `chat-bubble-row ${isCoach ? 'coach' : 'user'}`;

        const minutes = Math.floor((h.timestamp || 0) / 60);
        const seconds = ((h.timestamp || 0) % 60).toString().padStart(2, '0');
        const timeLabel = `${minutes}:${seconds}`;

        row.innerHTML = `
          <div class="chat-bubble">
            <div class="chat-bubble-header">
              <span>${isCoach ? 'Emma (Coach)' : 'Tú'}</span>
              <span>${timeLabel}</span>
            </div>
            <div>${escapeHtml(h.text)}</div>
          </div>
        `;
        chatContainer.appendChild(row);
      });

      tabTranscript.appendChild(chatContainer);
    } else {
      tabTranscript.innerHTML = '<div class="audit-card">No se registraron turnos en la conversación.</div>';
    }
  }

  reportTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      reportTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      tabGrammar.hidden = target !== 'grammar';
      tabVocabulary.hidden = target !== 'vocabulary';
      tabPronunciation.hidden = target !== 'pronunciation';
      tabTranscript.hidden = target !== 'transcript';
    });
  });

  if (btnListenSummary) {
    btnListenSummary.addEventListener('click', () => {
      if (latestGeneratedReport && !latestGeneratedReport.isErrorReport && latestGeneratedReport.spokenSummary) {
        speakSummary(latestGeneratedReport.spokenSummary);
      }
    });
  }

  function speakSummary(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-US';
    utt.rate = 1.0;
    window.speechSynthesis.speak(utt);
  }

  function speakWordNative(word) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(word);
    utt.lang = 'en-US';
    utt.rate = 0.85;
    window.speechSynthesis.speak(utt);
  }

  btnBackHome.addEventListener('click', () => switchView('home'));

  // Modal de Historial & Banco de Errores
  async function openHistoryModal() {
    if (!modalHistory) return;
    renderMistakesModalList();
    historySessionsList.innerHTML = '<div class="history-item-meta">Cargando historial desde Google Sheets...</div>';
    openDialog(modalHistory);

    const res = await SyncService.fetchHistory();
    historySessionsList.innerHTML = '';
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      res.data.forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item';
        const dateLabel = item.date ? String(item.date).slice(0, 10) : '';
        const overall = (item.scores && item.scores.overall !== '' && item.scores.overall !== null)
          ? `${item.scores.overall}/100`
          : '--';
        row.innerHTML = `
          <div>
            <div class="history-item-title">${escapeHtml(item.scenarioTitle || 'Sesión')}</div>
            <div class="history-item-meta">${escapeHtml(dateLabel)} · ${Math.round((Number(item.durationSeconds) || 0) / 60)} min</div>
          </div>
          <span class="history-score-pill">${escapeHtml(overall)}</span>
        `;
        historySessionsList.appendChild(row);
      });
    } else {
      const msg = (res && res.error) ? res.error : 'Aún no hay sesiones guardadas en tu Sheet.';
      historySessionsList.innerHTML = `<div class="history-item-meta">${escapeHtml(msg)}</div>`;
    }
  }

  function renderMistakesModalList() {
    if (!historyMistakesList) return;
    const mistakes = Config.getPendingMistakes();
    historyMistakesList.innerHTML = '';

    if (mistakes.length === 0) {
      historyMistakesList.innerHTML = '<div class="history-item-meta">No tienes errores pendientes en el banco actual.</div>';
      return;
    }

    mistakes.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mistake-row';
      row.innerHTML = `
        <div>
          <div class="history-item-title">✓ "${escapeHtml(m.correction || '')}"</div>
          <div class="history-item-meta">Dijiste: "${escapeHtml(m.original || '')}"</div>
        </div>
        <button class="btn-ghost-xs btn-master-mistake" type="button">Dominado</button>
      `;
      const btn = row.querySelector('.btn-master-mistake');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await SyncService.markMistakeMastered(m.id, m.original);
        renderMistakesModalList();
        updateStatsBar();
        renderScenarios();
        showToast('Punto marcado como dominado.', 'success');
      });
      historyMistakesList.appendChild(row);
    });
  }

  if (btnHistory) btnHistory.addEventListener('click', openHistoryModal);
  if (btnCloseHistory) btnCloseHistory.addEventListener('click', () => closeDialog(modalHistory));

  function openSettings() {
    inputApiKey.value = Config.getApiKey();
    inputGasUrl.value = Config.getGasUrl();
    inputPin.value = Config.getPin();
    if (selectPauseDelay) {
      selectPauseDelay.value = Config.getPauseDelay().toString();
    }
    openDialog(modalSettings);
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', () => closeDialog(modalSettings));

  btnSaveSettings.addEventListener('click', async () => {
    const key = inputApiKey.value.trim();
    const gas = inputGasUrl.value.trim();
    const pin = inputPin.value.trim();
    const pauseDelay = selectPauseDelay ? parseInt(selectPauseDelay.value, 10) : 2800;

    Config.setApiKey(key);
    Config.setGasUrl(gas);
    Config.setPin(pin);
    Config.setPauseDelay(pauseDelay);

    closeDialog(modalSettings);
    showToast('Configuración guardada correctamente.', 'success');

    if (gas && pin) {
      await syncWithCloud();
      await SyncService.flushQueue();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Visibility] Pantalla activa de nuevo.');
      if (currentVoiceEngine && currentVoiceEngine.isSessionActive) {
        if (!currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
          currentVoiceEngine.startListeningSafely();
        }
      }
    }
  });
});
