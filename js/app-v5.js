/**
 * Controlador Principal de la Aplicación (English Partner v5 - Safari Resilient)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Registrar y forzar actualización de Service Worker para PWA
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=6');
      await reg.update();
      console.log('[PWA] Service Worker actualizado (v6.0.0).');
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
  const liveTranscriptText = document.getElementById('live-transcript-text');
  const btnReplayAi = document.getElementById('btn-replay-ai');
  const btnEndSession = document.getElementById('btn-end-session');

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

  initAppMode();
  renderCategories();
  renderScenarios();
  updateUserBadge();
  syncWithCloud();

  // Botón para probar la voz de Emma con voces neurales
  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', () => {
      testEmmaVoice();
    });
  }

  function testEmmaVoice() {
    if (!window.speechSynthesis) {
      alert('Tu navegador no soporta síntesis de voz.');
      return;
    }
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
    } catch (e) {}

    const utt = new SpeechSynthesisUtterance("Hi there! I'm Emma, your English speaking coach. Can you hear my voice loud and clear?");
    utt.lang = 'en-US';
    utt.rate = 0.94;
    utt.pitch = 1.02;

    const voices = window.speechSynthesis.getVoices() || [];
    const englishVoice = voices.find(v => 
      v.lang.startsWith('en') &&
      (v.name.includes('Enhanced') || v.name.includes('Premium') || v.name.includes('Natural') || v.name.includes('Siri'))
    ) || voices.find(v => 
      v.lang.startsWith('en') &&
      (v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Natural') || v.name.includes('Ava') || v.name.includes('Allison') || v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Zoe'))
    ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en_US') || voices.find(v => v.lang.startsWith('en'));

    if (englishVoice) {
      utt.voice = englishVoice;
      console.log('[TTS] Voz activa seleccionada:', englishVoice.name);
    }

    window.speechSynthesis.speak(utt);
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
      if (cloudData) updateUserBadge();
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

  btnStartPlacement.addEventListener('click', () => {
    const placementScenario = Curriculum.getPlacementTest();
    startSession(placementScenario);
  });

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
    liveTranscriptText.innerHTML = '<span style="color: #38bdf8;">Iniciando sesión con Emma...</span>';
    switchView('session');

    initWaveBars();

    currentVoiceEngine = new VoiceEngine({
      scenario: scenario,
      apiKey: apiKey,
      mode: Config.isDriveMode() ? 'DRIVE' : 'NORMAL',
      maxDurationSeconds: 600,
      onTimerTick: (timeData) => {
        sessionTimerDigits.textContent = timeData.formatted;
      },
      onWrapUpWarning: () => {
        wrapUpBanner.classList.add('visible');
        if ('vibrate' in navigator) navigator.vibrate([150, 100, 150]);
      },
      onUserSpeechRecognized: (text) => {
        liveTranscriptText.innerHTML = `<span style="color: #34d399; font-weight: 700;">🎤 Tú:</span> "${text}"`;
      },
      onAiResponseStarted: () => {
        liveTranscriptText.innerHTML = `<span style="color: #fbbf24; font-weight: 700;">⏳ ${scenario.aiRole.split(',')[0]} está pensando...</span>`;
        animateWaveThinking();
      },
      onAiResponseFinished: (aiText) => {
        liveTranscriptText.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">🗣️ ${scenario.aiRole.split(',')[0]}:</span> "${aiText}"`;
      },
      onStatusChanged: (status) => {
        if (status === 'listening') {
          liveTranscriptText.innerHTML = `<span style="color: #34d399; font-weight: 700;">🟢 Tu Turno: Te escucho...</span> (Habla con naturalidad o toca aquí)`;
        } else if (status === 'speaking') {
          liveTranscriptText.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">🔴 Emma está hablando...</span>`;
        }
      },
      onSessionFinished: async (sessionResult) => {
        await handleSessionCompleted(sessionResult);
      },
      onError: (err) => {
        console.warn('[Session] Aviso:', err.message);
        liveTranscriptText.innerHTML = `<span style="color: #f87171;">⚠️ ${err.message}</span>`;
      }
    });

    // Permitir tocar la tarjeta para forzar reactivación del micrófono si Safari pausa
    liveTranscriptText.style.cursor = 'pointer';
    liveTranscriptText.onclick = () => {
      if (currentVoiceEngine && !currentVoiceEngine.isAiSpeaking) {
        currentVoiceEngine.startListeningSafely();
      }
    };

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

  async function handleSessionCompleted(sessionResult) {
    liveTranscriptText.textContent = 'Analizando gramática, vocabulario y pronunciación...';

    const apiKey = Config.getApiKey();
    const evaluation = await Evaluator.analyzeSession(sessionResult, apiKey);
    latestGeneratedReport = evaluation.report;

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
      tabGrammar.innerHTML = '<div class="audit-card">¡Excelente gramática! No se detectaron errores graves en esta sesión.</div>';
    }

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
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px;">Frase dicha: "${v.original}"</div>
          <div class="diff-corrected">💬 Opción Nativa Informal: "${v.nativeAlternative}"</div>
          <div style="color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 0.95rem; font-weight: 600;">💼 Opción Negocios / Ejecutiva: "${v.businessAlternative}"</div>
          <div class="diff-explanation">💡 ${v.reason || 'Eleva tu nivel'}</div>
        `;
        tabVocabulary.appendChild(item);
      });
    }

    tabPronunciation.innerHTML = '';
    if (report.pronunciationAudit && report.pronunciationAudit.length > 0) {
      report.pronunciationAudit.forEach(p => {
        const item = document.createElement('div');
        item.className = 'audit-card';

        let audioControls = '';
        if (p.userAudioUrl) {
          audioControls += `<button class="pronounce-audio-btn btn-play-user" data-url="${p.userAudioUrl}">🎤 Tu voz</button>`;
        }
        audioControls += `<button class="pronounce-audio-btn btn-play-native" data-word="${p.word}">🔊 Nativo</button>`;

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
