/**
 * Controlador Principal de la Aplicación (English Partner)
 * Orquesta vistas, eventos de usuario, sincronización y renderizado.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('[PWA] Service Worker registrado con éxito.');
    } catch (e) {
      console.warn('[PWA] No se pudo registrar Service Worker:', e);
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

  // Inputs de Configuración
  const inputApiKey = document.getElementById('input-api-key');
  const inputGasUrl = document.getElementById('input-gas-url');
  const inputPin = document.getElementById('input-pin');

  // Componentes del Home
  const placementBanner = document.getElementById('placement-banner');
  const btnStartPlacement = document.getElementById('btn-start-placement');
  const categoryTabsContainer = document.getElementById('category-tabs');
  const scenariosGrid = document.getElementById('scenarios-grid');
  const userLevelBadge = document.getElementById('user-level-badge');

  // Componentes de la Sala de Voz
  const sessionScenarioTitle = document.getElementById('session-scenario-title');
  const sessionTimerDigits = document.getElementById('session-timer-digits');
  const wrapUpBanner = document.getElementById('wrap-up-banner');
  const waveVisualizer = document.getElementById('wave-visualizer');
  const liveTranscriptText = document.getElementById('live-transcript-text');
  const btnEndSession = document.getElementById('btn-end-session');

  // Componentes del Reporte Post-Sesión
  const reportScenarioTitle = document.getElementById('report-scenario-title');
  const scoreOverall = document.getElementById('score-overall');
  const scoreGrammar = document.getElementById('score-grammar');
  const scoreVocabulary = document.getElementById('score-vocabulary');
  const scorePronunciation = document.getElementById('score-pronunciation');
  const btnListenSummary = document.getElementById('btn-listen-summary');
  const reportTabBtns = document.querySelectorAll('.report-tab-btn');
  const tabGrammar = document.getElementById('tab-content-grammar');
  const tabVocabulary = document.getElementById('tab-content-vocabulary');
  const tabPronunciation = document.getElementById('tab-content-pronunciation');
  const btnBackHome = document.getElementById('btn-back-home');

  let currentVoiceEngine = null;
  let activeCategory = 'all';
  let latestGeneratedReport = null;

  // 3. Inicializar Estado Visual
  initAppMode();
  renderCategories();
  renderScenarios();
  updateUserBadge();

  // Intentar sincronizar en segundo plano con Google Apps Script
  syncWithCloud();

  // ==========================================
  // MANEJO DE VISTAS Y NAVEGACIÓN
  // ==========================================
  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      views[k].classList.remove('active');
    });
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
      }
    }
  }

  // ==========================================
  // RENDERIZADO DEL CATÁLOGO DE LECCIONES
  // ==========================================
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
    const scenarios = Curriculum.getScenariosByCategory(activeCategory);
    scenariosGrid.innerHTML = '';

    scenarios.forEach(sc => {
      const card = document.createElement('div');
      card.className = 'scenario-card';
      card.innerHTML = `
        <div>
          <div class="card-header">
            <span class="level-tag">${sc.level}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">⏱️ 10 min</span>
          </div>
          <h3 class="card-title">${sc.title}</h3>
          <p class="card-desc">${sc.description}</p>
        </div>
        <div class="card-footer">
          <span>${sc.aiRole.split(',')[0]}</span>
          <span style="color: var(--accent); font-weight: 600;">Entrenar &rarr;</span>
        </div>
      `;
      card.addEventListener('click', () => startSession(sc));
      scenariosGrid.appendChild(card);
    });
  }

  // ==========================================
  // INICIO Y CONTROL DE LA SESIÓN DE VOZ
  // ==========================================
  btnStartPlacement.addEventListener('click', () => {
    const placementScenario = Curriculum.getPlacementTest();
    startSession(placementScenario);
  });

  async function startSession(scenario) {
    const apiKey = Config.getApiKey();
    if (!apiKey) {
      alert('Por favor configura tu API Key de Gemini en el ícono de engrane ⚙️ antes de comenzar.');
      openSettings();
      return;
    }

    sessionScenarioTitle.textContent = scenario.title;
    sessionTimerDigits.textContent = '10:00';
    wrapUpBanner.classList.remove('visible');
    liveTranscriptText.textContent = 'Preparando al coach...';
    switchView('session');

    // Inicializar barras del visualizador
    initWaveBars();

    currentVoiceEngine = new VoiceEngine({
      scenario: scenario,
      apiKey: apiKey,
      mode: Config.isDriveMode() ? 'DRIVE' : 'NORMAL',
      maxDurationSeconds: 600, // 10 minutos
      onTimerTick: (timeData) => {
        sessionTimerDigits.textContent = timeData.formatted;
      },
      onWrapUpWarning: (warn) => {
        wrapUpBanner.classList.add('visible');
        // Aviso auditivo sutil
        if ('vibrate' in navigator) navigator.vibrate([150, 100, 150]);
      },
      onUserSpeechRecognized: (text) => {
        liveTranscriptText.textContent = `Tú: "${text}"`;
      },
      onAiResponseStarted: () => {
        liveTranscriptText.textContent = `${scenario.aiRole.split(',')[0]} está respondiendo...`;
        animateWaveThinking();
      },
      onAiResponseFinished: (aiText) => {
        liveTranscriptText.textContent = `${scenario.aiRole.split(',')[0]}: "${aiText}"`;
      },
      onSessionFinished: async (sessionResult) => {
        await handleSessionCompleted(sessionResult);
      },
      onError: (err) => {
        alert('Aviso de Voz: ' + err.message);
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

  btnEndSession.addEventListener('click', () => {
    if (confirm('¿Deseas finalizar la sesión y generar tu corrección completa ahora?')) {
      if (currentVoiceEngine) {
        currentVoiceEngine.stop(false);
      }
    }
  });

  // Animaciones de la Onda de Audio
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

  // ==========================================
  // FINALIZACIÓN Y REPORTE FORENSE POST-SESIÓN
  // ==========================================
  async function handleSessionCompleted(sessionResult) {
    liveTranscriptText.textContent = 'Analizando gramática, vocabulario y pronunciación...';

    const apiKey = Config.getApiKey();
    const evaluation = await Evaluator.analyzeSession(sessionResult, apiKey);
    latestGeneratedReport = evaluation.report;

    // Actualizar nivel si fue examen diagnóstico
    if (sessionResult.scenario.id === 'placement_test' && latestGeneratedReport.placement) {
      const assignedLevel = latestGeneratedReport.placement.assignedLevel || 'B1';
      Config.setLevel(assignedLevel);
      Config.setPlacementDone(true);
      updateUserBadge();
      await SyncService.savePlacement(assignedLevel, sessionResult, latestGeneratedReport);
    } else {
      await SyncService.saveSession(sessionResult, latestGeneratedReport);
    }

    renderReport(sessionResult.scenario, latestGeneratedReport);
    switchView('report');

    // Si está en Modo Camioneta, leer automáticamente el resumen ejecutivo por las bocinas
    if (Config.isDriveMode() && latestGeneratedReport.spokenSummary) {
      setTimeout(() => {
        speakSummary(latestGeneratedReport.spokenSummary);
      }, 1000);
    }
  }

  function renderReport(scenario, report) {
    reportScenarioTitle.textContent = scenario.title;
    const scores = report.scores || { grammar: 0, vocabulary: 0, pronunciation: 0, overall: 0 };

    scoreOverall.textContent = scores.overall;
    scoreGrammar.textContent = scores.grammar;
    scoreVocabulary.textContent = scores.vocabulary;
    scorePronunciation.textContent = scores.pronunciation;

    // 1. Pestaña Gramática
    tabGrammar.innerHTML = '';
    if (report.grammarAudit && report.grammarAudit.length > 0) {
      report.grammarAudit.forEach(g => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--accent); margin-bottom: 6px;">${g.rule || 'REGLA GRAMATICAL'}</div>
          <div class="diff-original">❌ Tú dijiste: "${g.original}"</div>
          <div class="diff-corrected">✅ Lo correcto: "${g.corrected}"</div>
          <div class="diff-explanation">💡 Explicación: ${g.explanation}</div>
        `;
        tabGrammar.appendChild(item);
      });
    } else {
      tabGrammar.innerHTML = '<div class="audit-card">¡Excelente gramática! No se detectaron errores estructurales graves en esta sesión.</div>';
    }

    // 2. Pestaña Vocabulario
    tabVocabulary.innerHTML = '';
    if (report.fillerWords && report.fillerWords.length > 0) {
      const fillerCard = document.createElement('div');
      fillerCard.className = 'audit-card';
      const pills = report.fillerWords.map(f => `<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 4px 10px; border-radius: 12px; font-size: 0.82rem; margin-right: 6px;">"${f.word}" (${f.count}x)</span>`).join('');
      fillerCard.innerHTML = `<div style="font-weight: 700; margin-bottom: 8px;">Muletillas detectadas (Filler Words):</div><div>${pills}</div>`;
      tabVocabulary.appendChild(fillerCard);
    }

    if (report.vocabularyAudit && report.vocabularyAudit.length > 0) {
      report.vocabularyAudit.forEach(v => {
        const item = document.createElement('div');
        item.className = 'audit-card';
        item.innerHTML = `
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px;">Frase básica: "${v.original}"</div>
          <div class="diff-corrected">💬 Opción Nativa Informal: "${v.nativeAlternative}"</div>
          <div style="color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 0.95rem; font-weight: 600;">💼 Opción Negocios / Ejecutiva: "${v.businessAlternative}"</div>
          <div class="diff-explanation">💡 ${v.reason || 'Eleva tu nivel de fluidez'}</div>
        `;
        tabVocabulary.appendChild(item);
      });
    }

    // 3. Pestaña Pronunciación
    tabPronunciation.innerHTML = '';
    if (report.pronunciationAudit && report.pronunciationAudit.length > 0) {
      report.pronunciationAudit.forEach(p => {
        const item = document.createElement('div');
        item.className = 'audit-card';

        let audioControls = '';
        if (p.userAudioUrl) {
          audioControls += `<button class="pronounce-audio-btn btn-play-user" data-url="${p.userAudioUrl}">🎤 Escuchar tu voz</button>`;
        }
        audioControls += `<button class="pronounce-audio-btn btn-play-native" data-word="${p.word}">🔊 Escuchar nativo</button>`;

        item.innerHTML = `
          <div class="pronounce-row" style="margin-bottom: 8px;">
            <div>
              <span class="pronounce-word">${p.word}</span>
              <span class="pronounce-ipa">${p.ipa}</span>
              <div style="font-size: 0.85rem; color: #fbbf24;">Cómo suena: <b>${p.figuredPronunciation}</b></div>
            </div>
            <div style="display: flex; gap: 8px;">${audioControls}</div>
          </div>
          <div class="diff-explanation">👅 Articulación: ${p.phoneticTip}</div>
        `;

        // Event listeners para los botones de audio
        const btnNative = item.querySelector('.btn-play-native');
        if (btnNative) {
          btnNative.addEventListener('click', () => speakWordNative(p.word));
        }
        const btnUser = item.querySelector('.btn-play-user');
        if (btnUser) {
          btnUser.addEventListener('click', () => {
            const audio = new Audio(p.userAudioUrl);
            audio.play();
          });
        }

        tabPronunciation.appendChild(item);
      });
    } else {
      tabPronunciation.innerHTML = '<div class="audit-card">¡Gran articulación! Se comprendió claramente cada palabra.</div>';
    }
  }

  // Cambio de pestañas del reporte
  reportTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      reportTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      tabGrammar.style.display = target === 'grammar' ? 'block' : 'none';
      tabVocabulary.style.display = target === 'vocabulary' ? 'block' : 'none';
      tabPronunciation.style.display = target === 'pronunciation' ? 'block' : 'none';
    });
  });

  // Botón para escuchar el resumen del coach
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
    utt.rate = 0.85; // Un poco más lento para apreciar articulación
    window.speechSynthesis.speak(utt);
  }

  btnBackHome.addEventListener('click', () => {
    switchView('home');
  });

  // ==========================================
  // MODAL DE CONFIGURACIÓN
  // ==========================================
  function openSettings() {
    inputApiKey.value = Config.getApiKey();
    inputGasUrl.value = Config.getGasUrl();
    inputPin.value = Config.getPin();
    modalSettings.classList.add('active');
  }

  function closeSettings() {
    modalSettings.classList.remove('active');
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);

  btnSaveSettings.addEventListener('click', async () => {
    Config.setApiKey(inputApiKey.value.trim());
    Config.setGasUrl(inputGasUrl.value.trim());
    Config.setPin(inputPin.value.trim());

    alert('Configuración guardada exitosamente.');
    closeSettings();
    updateUserBadge();
    await syncWithCloud();
  });
});

