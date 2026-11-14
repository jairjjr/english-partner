/**
 * Controlador Principal de la Aplicación (English Partner v7 - Studio Quality & Mobile Resilient)
 * - Integración con Gemini Studio TTS (gemini-3.8-flash-lite-tts con voz Aoede)
 * - Modo Oído Puro (Blind Listening) con visor de transcripción bajo demanda
 * - Tap-to-Talk Shield táctil para Safari macOS y Samsung Android
 * - Pestaña forense de Transcripción Completa turno a turno
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Service Worker PWA v8.0.0
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=8.0');
      await reg.update();
      console.log('[PWA] Service Worker v8.0.0 actualizado.');
    } catch (e) {
      console.warn('[PWA] Service Worker:', e);
    }
  }

  // 2. Elementos del DOM
  const views = {
    home: document.getElementById('view-home'),
    session: document.getElementById('view-session'),
    report: document.getElementById('view-report')
  };

  const btnDriveToggle = document.getElementById('btn-drive-toggle');
  const btnSettings = document.getElementById('btn-settings');
  const modalSettings = document.getElementById('modal-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  const inputApiKey = document.getElementById('input-api-key');
  const inputGasUrl = document.getElementById('input-gas-url');
  const inputPin = document.getElementById('input-pin');
  const selectPauseDelay = document.getElementById('select-pause-delay');

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

  // Tarjeta de voz interactiva y Oído Puro
  const liveSpeechCard = document.getElementById('live-speech-card');
  const speechStatusPill = document.getElementById('speech-status-pill');
  const liveTranscriptText = document.getElementById('live-transcript-text');
  const btnToggleSubtitles = document.getElementById('btn-toggle-subtitles');
  const btnSubmitTurn = document.getElementById('btn-submit-turn');

  const btnReplayAi = document.getElementById('btn-replay-ai');
  const btnEndSession = document.getElementById('btn-end-session');

  const reportScenarioTitle = document.getElementById('report-scenario-title');
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

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  initAppMode();
  renderCategories();
  renderScenarios();
  updateUserBadge();
  syncWithCloud();

  // Botón para probar la voz neural humana de Gemini
  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', () => {
      testGeminiEmmaVoice();
    });
  }

  async function testGeminiEmmaVoice() {
    const apiKey = Config.getApiKey();
    if (!apiKey) {
      alert('Por favor ingresa tu API Key de Gemini en el engrane ⚙️ primero.');
      openSettings();
      return;
    }

    const originalText = btnTestVoice.innerHTML;
    btnTestVoice.innerHTML = '⏳ Conectando Gemini...';
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
        alert('No se pudo reproducir el audio de prueba.');
      };

      await audio.play();
    } catch (err) {
      console.warn('[TestVoice] Falló audio Gemini, recurriendo a voz local:', err.message);
      btnTestVoice.innerHTML = originalText;
      btnTestVoice.disabled = false;
      
      // Fallback
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance("Hi there! I'm Emma. Audio fallback active.");
        utt.lang = 'en-US';
        window.speechSynthesis.speak(utt);
      } else {
        alert('Error conectando a Gemini TTS: ' + err.message);
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
    if (level === 'PENDING_PLACEMENT') {
      userLevelBadge.textContent = 'Diagnóstico Pendiente';
      userLevelBadge.style.color = 'var(--warning)';
      userLevelBadge.style.borderColor = 'var(--warning)';
      placementBanner.style.display = 'flex';
    } else {
      userLevelBadge.textContent = `Nivel: ${level}`;
      userLevelBadge.style.color = 'var(--accent)';
      userLevelBadge.style.borderColor = 'var(--accent)';
      placementBanner.style.display = 'none';
    }
  }

  async function syncWithCloud() {
    if (Config.getGasUrl()) {
      const cloudData = await SyncService.fetchCloudProgress();
      if (cloudData) {
        updateUserBadge();
        renderScenarios();
      }
    }
  }

  function renderCategories() {
    const categories = Curriculum.getCategories();
    categoryTabsContainer.innerHTML = '';
    categories.forEach(cat => {
      const tab = document.createElement('button');
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

    // 1. Si el alumno tiene errores registrados en su Banco de Errores, mostrar primero la tarjeta adaptativa de repaso
    if (pendingMistakes.length > 0 && (activeCategory === 'all' || activeCategory === 'adaptive')) {
      const drillScenario = Curriculum.getMistakesDrillScenario(userLevel, pendingMistakes);
      const drillCard = document.createElement('div');
      drillCard.className = 'scenario-card mistakes-drill';

      const sampleCorrections = pendingMistakes.slice(0, 2)
        .map(m => `<span style="font-size: 0.7rem; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--success); padding: 2px 6px; border-radius: 4px; display: inline-block; margin: 2px 4px 2px 0;">✓ "${escapeHtml(m.correction)}"</span>`)
        .join('');

      drillCard.innerHTML = `
        <div>
          <div class="card-header">
            <span class="level-tag" style="color: var(--success);">Repaso (${escapeHtml(drillScenario.level)})</span>
            <span style="font-size: 0.72rem; color: var(--success); font-weight: 600;">${pendingMistakes.length} puntos por pulir</span>
          </div>
          <h3 class="card-title">${escapeHtml(drillScenario.title)}</h3>
          <p class="card-desc">${escapeHtml(drillScenario.description)}</p>
          <div style="margin-bottom: 8px;">${sampleCorrections}</div>
        </div>
        <div class="card-footer">
          <span>Emma (Coach Personal)</span>
          <span style="color: var(--success); font-weight: 600;">Practicar &rarr;</span>
        </div>
      `;
      drillCard.addEventListener('click', () => startSession(drillScenario));
      scenariosGrid.appendChild(drillCard);
    }

    // 2. Renderizar los escenarios ordenados por nivel recomendado
    scenarios.forEach(sc => {
      const isRecommended = (userLevel !== 'PENDING_PLACEMENT' && sc.level === userLevel && !completedIds.includes(sc.id));
      const isCompleted = completedIds.includes(sc.id);

      const card = document.createElement('div');
      card.className = isRecommended ? 'scenario-card recommended' : 'scenario-card';

      let statusBadge = `<span style="font-size: 0.72rem; color: var(--text-muted);">10 min</span>`;
      if (isRecommended) {
        statusBadge = `<span style="font-size: 0.68rem; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-main); padding: 2px 6px; border-radius: 4px; font-weight: 600;">Recomendado</span>`;
      } else if (isCompleted) {
        statusBadge = `<span style="font-size: 0.72rem; color: var(--success); font-weight: 600;">Completado</span>`;
      }

      const vocabPreview = Array.isArray(sc.targetVocabulary) && sc.targetVocabulary.length > 0
        ? `<div style="margin-bottom: 8px; font-size: 0.7rem; color: var(--text-muted);">Meta: <i style="color: var(--text-main);">"${escapeHtml(sc.targetVocabulary[0])}"</i></div>`
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
          <span style="color: var(--accent-light); font-weight: 600;">Entrenar &rarr;</span>
        </div>
      `;
      card.addEventListener('click', () => startSession(sc));
      scenariosGrid.appendChild(card);
    });
  }

  btnStartPlacement.addEventListener('click', () => {
    const placementScenario = Curriculum.getPlacementTest();
    startSession(placementScenario);
  });

  // Toggle para Modo Oído Puro (Ver / Ocultar Subtítulo)
  if (btnToggleSubtitles) {
    btnToggleSubtitles.addEventListener('click', (e) => {
      e.stopPropagation(); // Evitar disparar el click de la tarjeta
      isSubtitlesRevealed = !isSubtitlesRevealed;
      updateSubtitlesVisibility();
    });
  }

  // Botón de Envío Inmediato ("🚀 Enviar ahora" sin esperar los 2.8s de silencio)
  if (btnSubmitTurn) {
    btnSubmitTurn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentVoiceEngine && !currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
        btnSubmitTurn.style.display = 'none';
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

  // Tap-to-Talk Shield: Tocar la tarjeta activa el micrófono en Safari y Android Samsung
  if (liveSpeechCard) {
    liveSpeechCard.addEventListener('click', () => {
      if (currentVoiceEngine && !currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
        currentVoiceEngine.startListeningSafely();
        speechStatusPill.innerHTML = `<span>🟢</span> <span>Micrófono reactivado</span>`;
      }
    });
  }

  async function startSession(scenario) {
    const apiKey = Config.getApiKey();
    if (!apiKey) {
      alert('Por favor ingresa tu API Key de Gemini en el engrane ⚙️.');
      openSettings();
      return;
    }

    sessionScenarioTitle.textContent = scenario.title;
    sessionTimerDigits.textContent = '10:00';
    wrapUpBanner.classList.remove('visible');

    // Estado inicial de la tarjeta
    liveSpeechCard.className = 'live-speech-card speaking';
    speechStatusPill.innerHTML = `<span>⏳</span> <span>Conectando con Emma...</span>`;
    liveTranscriptText.textContent = 'Iniciando conversación en audio de alta fidelidad...';
    btnToggleSubtitles.style.display = 'none';
    if (btnSubmitTurn) btnSubmitTurn.style.display = 'none';
    isSubtitlesRevealed = false;

    switchView('session');
    initWaveBars();

    currentVoiceEngine = new VoiceEngine({
      scenario: scenario,
      apiKey: apiKey,
      mode: Config.isDriveMode() ? 'DRIVE' : 'NORMAL',
      maxDurationSeconds: 600,
      silenceDelayMs: Config.getPauseDelay(), // Pausa adaptativa (2.8s por defecto)
      userLevel: Config.getLevel(), // Para calibrar velocidad de voz (0.90x -> 1.04x) y complejidad
      pendingMistakes: Config.getPendingMistakes(), // Memoria activa de errores pasados
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
        liveTranscriptText.innerHTML = `<span style="color: var(--success); font-weight: 600;">🎤 Tú:</span> "${escapeHtml(text)}"`;
        btnToggleSubtitles.style.display = 'none';
        if (btnSubmitTurn) btnSubmitTurn.style.display = 'inline-flex';
      },
      onAiResponseStarted: () => {
        liveSpeechCard.className = 'live-speech-card thinking';
        speechStatusPill.innerHTML = `<span>⏳</span> <span>${escapeHtml(scenario.aiRole.split(',')[0])} está pensando...</span>`;
        liveTranscriptText.classList.remove('blind-mode');
        liveTranscriptText.textContent = 'Formulando respuesta natural...';
        btnToggleSubtitles.style.display = 'none';
        if (btnSubmitTurn) btnSubmitTurn.style.display = 'none';
        animateWaveThinking();
      },
      onAiResponseFinished: (aiText) => {
        // En Modo Oído Puro, colocamos el texto pero con efecto blur
        liveTranscriptText.innerHTML = `<span style="color: var(--accent-light); font-weight: 600;">🗣️ Emma:</span> "${escapeHtml(aiText)}"`;
      },
      onStatusChanged: (status, meta = {}) => {
        if (status === 'speaking') {
          liveSpeechCard.className = 'live-speech-card speaking';
          speechStatusPill.innerHTML = `<span>●</span> <span>Emma hablando... (Escucha atenta)</span>`;
          isSubtitlesRevealed = false;
          updateSubtitlesVisibility();
          btnToggleSubtitles.style.display = 'inline-flex';
          if (btnSubmitTurn) btnSubmitTurn.style.display = 'none';
        } else if (status === 'listening') {
          liveSpeechCard.className = 'live-speech-card listening';
          speechStatusPill.innerHTML = `<span>●</span> <span>TU TURNO: Te escucho</span>`;
          liveTranscriptText.classList.remove('blind-mode');
          liveTranscriptText.classList.remove('revealed');
          liveTranscriptText.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">Habla con naturalidad por tu micrófono o Bluetooth (o toca aquí)...</span>`;
          btnToggleSubtitles.style.display = 'none';
          if (btnSubmitTurn) btnSubmitTurn.style.display = 'none';
        } else if (status === 'thinking') {
          liveSpeechCard.className = 'live-speech-card thinking';
          speechStatusPill.innerHTML = `<span>⏳</span> <span>Procesando...</span>`;
          btnToggleSubtitles.style.display = 'none';
          if (btnSubmitTurn) btnSubmitTurn.style.display = 'none';
        }
      },
      onSessionFinished: async (sessionResult) => {
        latestSessionResult = sessionResult;
        await handleSessionCompleted(sessionResult);
      },
      onError: (err) => {
        console.warn('[Session] Aviso:', err.message);
        speechStatusPill.innerHTML = `<span>⚠️</span> <span>Aviso de conexión</span>`;
        liveTranscriptText.innerHTML = `<span style="color: var(--danger);">${escapeHtml(err.message)}</span>`;
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

  btnEndSession.addEventListener('click', () => {
    if (confirm('¿Deseas finalizar la sesión y generar tu corrección completa ahora?')) {
      if (currentVoiceEngine) {
        currentVoiceEngine.stop(false);
      }
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
      const height = Math.max(12, Math.min(75, volume * 350 * factor));
      bar.style.height = `${height}px`;
    });
  }

  function animateWaveThinking() {
    const bars = waveVisualizer.querySelectorAll('.wave-bar');
    bars.forEach((bar, idx) => {
      bar.style.height = `${20 + (idx % 3) * 15}px`;
    });
  }

  function formatScore(val) {
    return (typeof val === 'number' && !Number.isNaN(val)) ? val : '--';
  }

  async function processEvaluationResult(sessionResult, evaluation) {
    latestGeneratedReport = evaluation.report;

    // Solo persistir nivel/scores/banco de errores si el análisis real tuvo éxito
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
          setTimeout(() => {
            alert(`¡Felicidades! Por tu promedio (${levelUpCheck.averageScore}/100), subiste de ${levelUpCheck.currentLevel} a ${levelUpCheck.nextLevel}.`);
          }, 600);
        }
      }
      updateUserBadge();
      renderScenarios();
    } else {
      console.warn('[Evaluation] No se guardaron calificaciones porque falló la evaluación real:', evaluation.error);
    }

    renderReport(sessionResult.scenario, latestGeneratedReport, sessionResult);
  }

  async function handleSessionCompleted(sessionResult) {
    speechStatusPill.innerHTML = `<span>📊</span> <span>Generando Diagnóstico Forense...</span>`;
    liveTranscriptText.textContent = 'Analizando gramática, vocabulario y pronunciación en Gemini...';

    const apiKey = Config.getApiKey();
    const evaluation = await Evaluator.analyzeSession(sessionResult, apiKey);
    await processEvaluationResult(sessionResult, evaluation);
    switchView('report');

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
      btnRetryEvaluation.textContent = 'Reintentando...';
      try {
        const evaluation = await Evaluator.analyzeSession(latestSessionResult, Config.getApiKey());
        await processEvaluationResult(latestSessionResult, evaluation);
      } finally {
        btnRetryEvaluation.disabled = false;
        btnRetryEvaluation.textContent = 'Reintentar análisis';
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
        <div style="margin-bottom: 8px;">
          <div class="summary-section-title">Diagnóstico del Coach</div>
          <div>${escapeHtml(report.executiveSummary)}</div>
        </div>
      `);
    }

    if (report.placement && report.placement.assignedLevel) {
      parts.push(`
        <div style="margin-bottom: 8px;">
          <div class="summary-section-title">Nivel Asignado: ${escapeHtml(report.placement.assignedLevel)}</div>
          <div style="color: var(--text-muted);">${escapeHtml(report.placement.rationale || '')}</div>
        </div>
      `);
    }

    const metaBlocks = [];
    if (Array.isArray(report.strengths) && report.strengths.length > 0) {
      const list = report.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('');
      metaBlocks.push(`
        <div>
          <div class="summary-section-title">Fortalezas</div>
          <ul style="padding-left: 16px; color: var(--text-main);">${list}</ul>
        </div>
      `);
    }

    if (report.homeworkChallenge) {
      metaBlocks.push(`
        <div>
          <div class="summary-section-title">Reto para tu próxima sesión</div>
          <div style="color: var(--text-main);">${escapeHtml(report.homeworkChallenge)}</div>
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
      btnListenSummary.style.display = (!isError && report && report.spokenSummary) ? 'inline-flex' : 'none';
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
          <div style="font-size: 0.72rem; font-weight: 700; color: var(--accent-light); margin-bottom: 5px; text-transform: uppercase;">${escapeHtml(g.rule || 'Regla gramatical')}</div>
          <div class="diff-original">✗ Tú dijiste: "${escapeHtml(g.original)}"</div>
          <div class="diff-corrected">✓ Lo correcto: "${escapeHtml(g.corrected)}"</div>
          <div class="diff-explanation">Explicación: ${escapeHtml(g.explanation)}</div>
        `;
        tabGrammar.appendChild(item);
      });
    } else {
      tabGrammar.innerHTML = isError
        ? '<div class="audit-card">Análisis gramatical no disponible porque la evaluación falló. Puedes revisar tu transcripción o pulsar "Reintentar análisis".</div>'
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
        .map(f => `<span style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--warning); padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; margin-right: 6px; display: inline-block; margin-bottom: 4px;">"${escapeHtml(f.word)}" (${f.count}x)</span>`)
        .join('');
      fillerCard.innerHTML = `<div style="font-weight: 600; margin-bottom: 6px; font-size: 0.8rem;">Muletillas detectadas (Filler Words):</div><div>${pills}</div>`;
      tabVocabulary.appendChild(fillerCard);
    }

    if (hasVocab) {
      report.vocabularyAudit.forEach(v => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px;">Frase dicha: "${escapeHtml(v.original)}"</div>
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
          <div class="pronounce-row" style="margin-bottom: 6px;">
            <div>
              <span class="pronounce-word">${escapeHtml(p.word)}</span>
              <span class="pronounce-ipa">${escapeHtml(p.ipa || '')}</span>
              <div style="font-size: 0.78rem; color: var(--warning);">Cómo suena: <b>${escapeHtml(p.figuredPronunciation || '')}</b></div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="pronounce-audio-btn btn-play-native" data-word="${escapeHtml(p.word)}">🔊 Escuchar</button>
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
      tabGrammar.style.display = target === 'grammar' ? 'block' : 'none';
      tabVocabulary.style.display = target === 'vocabulary' ? 'block' : 'none';
      tabPronunciation.style.display = target === 'pronunciation' ? 'block' : 'none';
      tabTranscript.style.display = target === 'transcript' ? 'block' : 'none';
    });
  });

  btnListenSummary.addEventListener('click', () => {
    if (latestGeneratedReport && latestGeneratedReport.spokenSummary) {
      speakSummary(latestGeneratedReport.spokenSummary);
    }
  });

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

  function openSettings() {
    inputApiKey.value = Config.getApiKey();
    inputGasUrl.value = Config.getGasUrl();
    inputPin.value = Config.getPin();
    if (selectPauseDelay) {
      selectPauseDelay.value = Config.getPauseDelay().toString();
    }
    modalSettings.classList.add('active');
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', () => modalSettings.classList.remove('active'));

  btnSaveSettings.addEventListener('click', async () => {
    const key = inputApiKey.value.trim();
    const gas = inputGasUrl.value.trim();
    const pin = inputPin.value.trim();
    const pauseDelay = selectPauseDelay ? parseInt(selectPauseDelay.value, 10) : 2800;

    Config.setApiKey(key);
    Config.setGasUrl(gas);
    Config.setPin(pin);
    Config.setPauseDelay(pauseDelay);

    modalSettings.classList.remove('active');
    alert('Configuración guardada correctamente.');

    if (gas) {
      await syncWithCloud();
    }
  });

  // Auto-Recuperación de Visibilidad: Si la pantalla se bloqueó o cambió de pestaña y regresa
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Visibility] Pantalla activa de nuevo.');
      if (currentVoiceEngine && currentVoiceEngine.isSessionActive) {
        // Si el coach no está hablando ni pensando, reactivar micrófono
        if (!currentVoiceEngine.isAiSpeaking && !currentVoiceEngine.isAiResponding) {
          currentVoiceEngine.startListeningSafely();
        }
      }
    }
  });
});

