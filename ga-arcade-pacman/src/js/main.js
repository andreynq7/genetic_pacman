// Entry point to bootstrap UI wiring + GA orchestration + demo del mejor individuo.
(function() {
  let refs = null;
  let ctx = null;
  let currentState = null;
  let demoTimer = null;
  let demoPolicyFn = null;
  let demoRunning = false;
  let renderLoopHandle = null;
  let lastTimestamp = null;
  let accumulatorMs = 0;
  const stepMs = 100; // 10 pasos lógicos por segundo, render a ~60fps
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const comparisonData = { on: null, off: null };
  let fpsOverlayEl = null;
  let fpsMeasure = { last: 0, frames: 0, fps: 0 };
  let lifeLossInProgress = false;

  /**
   * Combina configuraci�n de la app (o fallback) para inicializar el formulario de par�metros.
   * @returns {Object} Valores num�ricos por defecto para el GA.
   */
  function getUiDefaults() {
    const ga = (window.appConfig && window.appConfig.ga) || (window.defaultConfig || {});
    const fit = (window.appConfig && window.appConfig.fitness) || {};
    return { ...ga, episodesPerIndividual: fit.episodesPerIndividual ?? ga.episodesPerIndividual };
  }

  /**
   * Carga configuraciones, vincula la UI y lanza la precarga inicial de sprites/audio.
   * Se ejecuta cuando el DOM est� listo.
   * @returns {Promise<void>}
   */
  async function initApp() {
    try { if (window.configLoader && window.configLoader.load) await window.configLoader.load(); } catch (_) {}
    refs = uiLayout.getRefs();
    uiForms.applyDefaults(refs, getUiDefaults());
    uiForms.bindFormValidation(refs);
    uiForms.validateParametersForm(refs);
    if (window.audioManager) {
      const preload = window.audioManager.ensurePreloaded || window.audioManager.loadAll;
      if (preload) {
        try { preload(); } catch (e) { /* ignore preload errors in init */ }
      }
    }

    uiControls.bindControls(refs, {
      onStart: handleStartTraining,
      onPause: handlePauseResume,
      onExtend: handleExtendTraining,
      onReset: handleReset,
      onDemo: handleDemoBest,
      onExportBest: handleExportBest,
      onExportRun: handleExportRun,
      onExportFitness: handleExportFitness
    });



    uiMetrics.updateTrainingMetrics(refs, {
      bestFitness: '--',
      averageFitness: '--',
      generation: '0',
      totalTime: '0 s',
      averageTime: '0 s'
    });
    uiMetrics.updateStatusBadge('Idle', 'idle');
    if (window.populationChart) {
      populationChart.init(refs);
      populationChart.setData([]);
    }

    gameView.preloadSprites().finally(() => {
      setupGame();
      uiMetrics.renderPlaceholderGraph(refs);
    });
    console.log('GA-Arcade UI lista con integración de GA.');
  }



  /**
   * Inicializa canvas, estado de juego y overlay de FPS antes de renderizar.
   */
  function setupGame() {
    ctx = gameView.initGameView(refs.game?.canvas || 'game-canvas');
    currentState = gameState.createInitialState();
    ensureFpsOverlay();
    render();
  }

  /**
   * Renderiza el frame actual y sincroniza el HUD.
   * @param {number} [alpha=1] - Factor de interpolaci�n usado por el render loop.
   */
  function render(alpha = 1) {
    if (ctx && currentState) {
      gameView.renderFrame(ctx, currentState, alpha);
    }
    syncHud();
  }

  /**
   * Actualiza los contadores visibles (score, nivel, vidas) seg�n el estado presente.
   */
  function syncHud() {
    if (!refs?.game?.statusBar || !currentState) return;
    domHelpers.setText(refs.game.statusBar.score, currentState.score);
    const level = currentState.level ?? 1;
    domHelpers.setText(refs.game.statusBar.level, level);
    domHelpers.setText(refs.game.statusBar.lives, currentState.lives);
  }

  // ----------------- GA control -----------------
  /**
   * Lee configuraci�n de la UI y arranca el loop del GA desde cero.
   * Detiene cualquier demo activa y reinicia las m�tricas visuales.
   */
  function handleStartTraining() {
    if (!uiForms.validateParametersForm(refs)) return;
    stopDemo();
    const uiConfig = uiForms.readUIConfig(refs, getUiDefaults());
    gaController.initializeFromUI(uiConfig);
    uiMetrics.updateStatusBadge('Entrenando', 'training');
    uiMetrics.renderFitnessGraph(refs, [], []);
    gaController.start(onGenerationUpdate, onTrainingFinished, onTrainingProgress);
  }

  /**
   * Alterna entre pausa y reanudaci�n; tambi�n pausa la demo si est� corriendo.
   */
  function handlePauseResume() {
    const status = gaController.getStatus();
    if (status.status === 'running') {
      gaController.pause();
      uiMetrics.updateStatusBadge('Pausado', 'paused');
    } else if (status.status === 'paused') {
      gaController.resume();
      uiMetrics.updateStatusBadge('Entrenando', 'training');
    } else if (demoRunning) {
      pauseDemoLoop();
    }
  }

  /**
   * A�ade generaciones al objetivo actual, arrancando el entrenamiento si estaba idle.
   */
  function handleExtendTraining() {
    if (!uiForms.validateParametersForm(refs)) return;
    stopDemo();
    const uiConfig = uiForms.readUIConfig(refs, getUiDefaults());
    const extraGenerations = Math.max(1, Math.floor(uiConfig.generations || 0));
    const status = gaController.getStatus();

    // Si todavía no hay entrenamiento activo, iniciar uno nuevo.
    if (!gaController.getGAConfig() || status.status === 'idle') {
      handleStartTraining();
      return;
    }

    const result = gaController.extendGenerations(extraGenerations);
    if (result) {
      uiMetrics.updateStatusBadge('Entrenando', 'training');
      const refreshedStatus = gaController.getStatus();
      if (refreshedStatus.status !== 'running') {
        gaController.resume();
      }
    }
  }

  /**
   * Detiene demo/GA, limpia UI y reestablece el juego a estado inicial.
   */
  function handleReset() {
    stopDemo();
    hideGameOverModal();
    gaController.reset();
    uiMetrics.updateStatusBadge('Idle', 'idle');
    uiMetrics.updateTrainingMetrics(refs, {
      bestFitness: '--',
      averageFitness: '--',
      generation: '0',
      totalTime: '0 s',
      averageTime: '0 s'
    });
    uiMetrics.renderPlaceholderGraph(refs);
    if (window.populationChart) {
      populationChart.setData([]);
    }
    setupGame();
  }

  /**
   * Callback por generaci�n para refrescar tarjetas, gr�ficos y snapshot de poblaci�n.
   * @param {Object} info - Resumen devuelto por gaController.
   */
  function onGenerationUpdate(info) {
    uiMetrics.updateStatusBadge('Entrenando', 'training');
    const best = formatNumber(info.bestFitness);
    const avg = formatNumber(info.averageFitness);
    const genLabel = `${info.generation}/${gaController.getStatus().maxGenerations || info.generation}`;
    const totalTime = `${formatNumber(info.totalTimeMs / 1000)} s`;
    const avgTime = `${formatNumber(info.avgTimeMs / 1000)} s`;
    const workersActive = info.workerPoolSize != null ? String(info.workerPoolSize) : '--';
    const chunkSizeUsed = info.workerChunkSize != null ? String(info.workerChunkSize) : '--';

    uiMetrics.updateTrainingMetrics(refs, {
      bestFitness: best,
      averageFitness: avg,
      generation: genLabel,
      totalTime,
      averageTime: avgTime,
      workersActive,
      chunkSizeUsed
    });
    uiMetrics.renderFitnessGraph(refs, info.history.bestFitness, info.history.avgFitness);
    //uiMetrics.renderBestIndividuals(refs, gaController.getHistory().bestIndividuals || []);
    if (window.populationChart) {
      if (info.populationSnapshot) {
        populationChart.addSnapshot(info.populationSnapshot);
      } else {
        populationChart.setData(gaController.getPopulationHistory());
      }
    }
  }

  /**
   * Callback de finalizaci�n del GA: actualiza badges, gr�ficos y datos de comparaci�n.
   * @param {Object} summary - Resumen con historial y tiempos totales.
   */
  function onTrainingFinished(summary) {
    uiMetrics.updateStatusBadge('Terminado', 'training');
    if (summary?.history) {
      uiMetrics.renderFitnessGraph(refs, summary.history.bestFitness, summary.history.avgFitness);
    }
    if (window.populationChart) {
      populationChart.setData(gaController.getPopulationHistory());
    }
    const status = gaController.getStatus();
    const enabled = gaController.getWorkerOptions ? !!gaController.getWorkerOptions().enabled : true;
    const best = gaController.getBestFitness();
    const totalMs = summary?.totalTimeMs || gaController.getTiming()?.totalMs || 0;
    const genCount = status?.generation || 0;
    const avgMs = genCount > 0 ? totalMs / genCount : 0;
    const payload = { bestFitness: best, totalTimeMs: totalMs, avgTimeMs: avgMs, generations: genCount };
    if (enabled) comparisonData.on = payload; else comparisonData.off = payload;
    updateComparisonUI();
  }

  /**
   * Callback de progreso (ej. evaluaci�n en curso) para informar al HUD.
   * @param {Object} progress - Estado parcial entregado por gaController.
   */
  function onTrainingProgress(progress) {
    if (!progress) return;
    if (progress.stage === 'evaluation') {
      uiMetrics.updateStatusBadge('Evaluando', 'training');
    }
  }

  /**
   * Pinta la secci�n de comparaci�n on/off workers cuando existen datos de ambos modos.
   */
  function updateComparisonUI() {
    const r = refs.workers?.comparison;
    if (!r) return;
    const on = comparisonData.on;
    const off = comparisonData.off;
    if (on) {
      domHelpers.setText(r.onTotalTime, `${formatNumber(on.totalTimeMs / 1000)} s`);
      domHelpers.setText(r.onAvgTime, `${formatNumber(on.avgTimeMs / 1000)} s`);
      domHelpers.setText(r.onBest, `${formatNumber(on.bestFitness)}`);
    }
    if (off) {
      domHelpers.setText(r.offTotalTime, `${formatNumber(off.totalTimeMs / 1000)} s`);
      domHelpers.setText(r.offAvgTime, `${formatNumber(off.avgTimeMs / 1000)} s`);
      domHelpers.setText(r.offBest, `${formatNumber(off.bestFitness)}`);
    }
    if (uiMetrics.renderComparisonGraph) uiMetrics.renderComparisonGraph(refs, on, off);
  }

  // ----------------- Demo del mejor individuo -----------------
  /**
   * Construye la pol�tica del mejor cromosoma y arranca una demo con cuenta regresiva.
   */
  function handleDemoBest() {
    stopDemo();
    hideGameOverModal();
    if (gaController.verifyBestSelection) gaController.verifyBestSelection();
    const best = gaController.getBestChromosome();
    if (best) {
      demoPolicyFn = policyEncoding.policyFromChromosome(best, { tieBreak: 'random' });
      if (gaController.verifyDemoSelectionAndLog) gaController.verifyDemoSelectionAndLog();
    } else {
      demoPolicyFn = () => gameLogic.getRandomAction(currentState);
    }
    currentState = gameState.createInitialState();
    uiMetrics.updateStatusBadge('Demo', 'demo');
    if (window.audioManager && window.audioManager.primeForInstantStart) {
      window.audioManager.primeForInstantStart();
    }
    render();
    startDemoWithCountdown();
  }

  /** Pausa la demo actual y actualiza el badge de estado. */
  function pauseDemoLoop() {
    stopDemo();
    uiMetrics.updateStatusBadge('Pausado', 'paused');
  }

  /** Detiene el loop de demo y resetea recursos de audio/render. */
  function stopDemo() {
    demoRunning = false;
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
    if (renderLoopHandle) {
      cancelAnimationFrame(renderLoopHandle);
      renderLoopHandle = null;
    }
    if (window.audioManager) {
      window.audioManager.resetAll();
    }
  }

  // Permite salir del overlay de Game Over y reiniciar el juego para seguir probando.
  /**
   * Sale del overlay de Game Over y reinicia el juego listo para nuevas pruebas.
   */
  function resetAfterGameOver() {
    stopDemo();
    hideGameOverModal();
    currentState = gameState.createInitialState();
    uiMetrics.updateStatusBadge('Idle', 'idle');
    render();
  }

  // ----------------- Exportaciones -----------------
  /**
   * Handler para exportar el mejor individuo como best.json.
   * Flujo: obtiene best de gaController -> arma objeto con config y timestamp -> descarga.
   */
  function handleExportBest() {
    const best = gaController.getBestInfo();
    if (!best || !best.chromosome) {
      console.warn('No hay mejor individuo todavía. Entrene el GA primero.');
      if (window.logger) window.logger.warn('export_best_missing', { reason: 'no_best_info' });
      return;
    }
    const config = {
      gaConfig: gaController.getGAConfig(),
      fitnessConfig: gaController.getFitnessConfig()
    };
    const payload = {
      chromosome: best.chromosome,
      fitness: best.fitness,
      generation: best.generation,
      config,
      timestamp: new Date().toISOString()
    };
    const filename = `best_${formatTimestampForFile()}.json`;
    try {
      downloadJson(payload, filename);
      if (window.logger) window.logger.info('export_best_ok', { filename, fitness: best.fitness, generation: best.generation });
    } catch (err) {
      console.error('Export Best fallo', err);
      if (window.logger) window.logger.error('export_best_fail', { message: err && err.message ? err.message : String(err) });
    }
  }

  /**
   * Handler para exportar configuración y logs de la corrida.
   * Genera dos JSON: config_run_*.json y logs_run_*.json.
   */
  function handleExportRun() {
    const history = gaController.getHistory();
    const hasData = (history?.bestFitness?.length || 0) > 0;
    if (!hasData) {
      console.warn('No hay datos de entrenamiento todavía.');
      return;
    }
    const status = gaController.getStatus();
    const configExport = {
      gaConfig: gaController.getGAConfig(),
      fitnessConfig: gaController.getFitnessConfig(),
      generationCount: status.generation,
      timestamp: new Date().toISOString()
    };
    const logsExport = {
      history,
      //bestIndividuals: gaController.getHistory()?.bestIndividuals || [],
      metricsHistory: gaController.getMetricsHistory(),
      generationCount: status.generation,
      timing: gaController.getTiming(),
      timestamp: new Date().toISOString(),
      logs: (window.logger && window.logger.dump) ? window.logger.dump() : []
    };
    const ts = formatTimestampForFile();
    downloadJson(configExport, `config_run_${ts}.json`);
    downloadJson(logsExport, `logs_run_${ts}.json`);
  }

  /**
   * Descarga un archivo de texto plano generado en memoria.
   * @param {string} text - Contenido a serializar.
   * @param {string} filename - Nombre sugerido de archivo.
   */
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatTimestampForFile() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /**
   * Exporta el hist�rico de fitness a un archivo JSONL (una l�nea por generaci�n).
   */
  function handleExportFitness() {
    const hist = gaController.getHistory();
    const bestIndividuals = hist?.bestIndividuals || [];
    const count = (hist?.bestFitness?.length || 0);
    if (!count) {
      console.warn('No hay datos de entrenamiento todavía.');
      if (window.logger) window.logger.warn('export_fitness_missing', { reason: 'no_history' });
      return;
    }
    try {
      const lines = [];
      for (let i = 0; i < count; i += 1) {
        const entry = {
          generation: i + 1,
          bestFitness: hist.bestFitness[i],
          avgFitness: hist.avgFitness?.[i] ?? null,
          bestIndividual: bestIndividuals?.[i] ?? null
        };
        lines.push(JSON.stringify(entry));
      }
      const ts = formatTimestampForFile();
      const filename = `fitness_history_${ts}.jsonl`;
      downloadText(lines.join('\n'), filename);
      if (window.logger) window.logger.info('export_fitness_ok', { filename, generations: count });
    } catch (err) {
      console.error('Export Fitness fallo', err);
      if (window.logger) window.logger.error('export_fitness_fail', { message: err && err.message ? err.message : String(err) });
    }
  }

  // ----------------- Simulación de juego y entrada -----------------
  /**
   * Avanza un paso de juego en modo demo aplicando la acci�n elegida.
   * Maneja transiciones de nivel, p�rdidas de vida y estados de finalizaci�n.
   * @param {string} action - Acci�n propuesta por la pol�tica demo.
   */
  function stepDemo(action) {
    if (!demoRunning) return;
    if (!currentState) return;
    const result = gameLogic.stepGame(currentState, action || gameConstants.ACTIONS.STAY);
    currentState = result.state;
    if (window.audioManager) {
      window.audioManager.handleStep(currentState, result.info || {});
    }
    if (result.info && result.info.lifeLost) {
      runLifeLostFlow();
      return;
    }
    if (result.done) {
      const reason = result.state.status;
      if ((reason === 'game_over') && result.state.lives <= 0) {
        if (window.audioManager) window.audioManager.stopAllSounds();
        stopDemo();
        uiMetrics.updateStatusBadge('Game Over', 'paused');
        showGameOverModal();
        currentState = gameState.createInitialState();
        render();
        return;
      }
      if (reason === 'stalled' || reason === 'killed') {
        currentState.status = 'running';
        currentState.stepsSinceLastPellet = 0;
        currentState.stallCount = 0;
        if (window.audioManager) window.audioManager.startGameplayLoops(currentState);
        return;
      }
      const nextLevel = reason === 'level_cleared' ? (result.state.level || 1) + 1 : (result.state.level || 1);
      const nextState = gameState.createInitialState({ lives: result.state.lives, level: nextLevel, score: result.state.score });
      beginLevelTransition(nextState);
    }
  }

  /**
   * Bucle de render principal para la demo, integrando simulaci�n y dibujado.
   * @param {number} timestamp - Timestamp de requestAnimationFrame.
   */
  function renderLoop(timestamp) {
    if (!demoRunning) return;
    if (lastTimestamp == null) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    accumulatorMs += delta;
    while (accumulatorMs >= stepMs) {
      const action = demoPolicyFn ? demoPolicyFn(currentState) : gameConstants.ACTIONS.STAY;
      stepDemo(action);
      accumulatorMs -= stepMs;
    }
    const alpha = Math.max(0, Math.min(1, accumulatorMs / stepMs));
    render(alpha);
    updateFps(timestamp);
    if (demoRunning && currentState?.status !== 'game_over') {
      renderLoopHandle = requestAnimationFrame(renderLoop);
    }
  }

  /** Reinicia contadores y arranca el loop de render de la demo. */
  function startRenderLoop() {
    demoRunning = true;
    lastTimestamp = null;
    accumulatorMs = 0;
    fpsMeasure = { last: 0, frames: 0, fps: 0 };
    renderLoopHandle = requestAnimationFrame(renderLoop);
  }

  /**
   * Ejecuta la cuenta regresiva, arranca m�sica y pone en marcha la demo.
   * @returns {Promise<void>}
   */
  async function startDemoWithCountdown() {
    cancelRenderLoop();
    demoRunning = false;
    if (window.audioManager) {
      window.audioManager.stopAllSounds();
      if (window.audioManager.ensurePreloaded) window.audioManager.ensurePreloaded();
      window.audioManager.playStartMusic();
    }
    await runCountdownSequence();
    if (window.audioManager) {
      window.audioManager.startGameplayLoops(currentState);
    }
    startRenderLoop();
  }

  /**
   * Reproduce la animaci�n/sonido de muerte y espera al respawn seguro.
   * @returns {Promise<void>}
   */
  async function runLifeLostFlow() {
    if (lifeLossInProgress) return;
    lifeLossInProgress = true;
    cancelRenderLoop();
    demoRunning = false;
    if (window.audioManager) {
      window.audioManager.stopAllSounds();
      try { if (window.audioManager.ensurePreloaded) await window.audioManager.ensurePreloaded(); } catch (_) {}
      try {
        if (window.audioManager.playOnceWithEnd) {
          await window.audioManager.playOnceWithEnd('miss');
        } else if (window.audioManager.playOnce) {
          window.audioManager.playOnce('miss');
        }
      } catch (_) {}
    }
    const d = ensureDeathOverlay();
    updateDeathOverlay('MISS');
    await delay(600);
    removeDeathOverlay();
    let complete = false;
    while (!complete && currentState && currentState.lives > 0) {
      const res = gameLogic.stepGame(currentState, gameConstants.ACTIONS.STAY);
      currentState = res.state;
      render();
      complete = currentState.status === 'running' && (res.info?.respawnTimerSteps === 0);
      await delay(stepMs);
    }
    if (!currentState || currentState.lives <= 0 || currentState.status === 'game_over') {
      if (window.audioManager) window.audioManager.stopAllSounds();
      stopDemo();
      uiMetrics.updateStatusBadge('Game Over', 'paused');
      showGameOverModal();
      currentState = gameState.createInitialState();
      render();
      lifeLossInProgress = false;
      return;
    }
    if (window.audioManager) {
      try { if (window.audioManager.playStartMusicSafe) await window.audioManager.playStartMusicSafe(500); } catch (_) {}
      window.audioManager.startGameplayLoops(currentState);
    }
    startRenderLoop();
    lifeLossInProgress = false;
  }

  /**
   * Gestiona el cambio de nivel tras limpiar el mapa, incluyendo cuenta regresiva.
   * @param {Object} nextState - Estado inicial del siguiente nivel.
   * @returns {Promise<void>}
   */
  async function beginLevelTransition(nextState) {
    cancelRenderLoop();
    demoRunning = false;
    if (window.audioManager) {
      window.audioManager.stopAllSounds();
      if (window.audioManager.ensurePreloaded) window.audioManager.ensurePreloaded();
      window.audioManager.playStartMusic();
    }
    currentState = nextState;
    render();
    await runCountdownSequence();
    if (window.audioManager) {
      window.audioManager.startGameplayLoops(currentState);
    }
    startRenderLoop();
  }

  /** Cancela el requestAnimationFrame en curso si existe. */
  function cancelRenderLoop() {
    if (renderLoopHandle) {
      cancelAnimationFrame(renderLoopHandle);
      renderLoopHandle = null;
    }
  }



  /**
   * Formatea n�meros para mostrarlos en el HUD, devolviendo '--' si no son v�lidos.
   * @param {number} val - Valor a mostrar.
   * @returns {string} Texto formateado.
   */
  function formatNumber(val) {
    if (val == null || Number.isNaN(val)) return '--';
    return Number(val).toFixed(2);
  }

  /**
   * Muestra un overlay de cuenta regresiva (Ready, 3-2-1) antes de iniciar acci�n.
   * @returns {Promise<void>}
   */
  async function runCountdownSequence() {
    const overlay = ensureCountdownOverlay();
    updateCountdownOverlay('READY');
    await delay(500);
    for (const n of [3, 2, 1]) {
      updateCountdownOverlay(String(n));
      await delay(1000);
    }
    removeCountdownOverlay();
  }

  /**
   * Crea (o reutiliza) el overlay semitransparente usado para la cuenta regresiva.
   * @returns {HTMLElement} Nodo overlay.
   */
  function ensureCountdownOverlay() {
    let overlay = document.getElementById('countdown-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'countdown-overlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '56px',
        fontWeight: '900',
        color: '#ffc107',
        textShadow: '0 0 12px #000',
        pointerEvents: 'none',
        zIndex: '60',
        background: 'rgba(0,0,0,0.35)'
      });
      const gameContainer = refs?.game?.container || (refs?.game?.canvas?.parentElement);
      const parent = gameContainer || document.body;
      parent.style.position = parent.style.position || 'relative';
      parent.appendChild(overlay);
    }
    return overlay;
  }

  /**
   * Crea un peque�o overlay con la medici�n de FPS y lo ancla sobre el canvas.
   * @returns {HTMLElement} Elemento overlay.
   */
  function ensureFpsOverlay() {
    let el = document.getElementById('fps-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fps-overlay';
      Object.assign(el.style, {
        position: 'absolute',
        top: '8px',
        left: '8px',
        padding: '2px 6px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '700',
        color: '#e0f7fa',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(3px)',
        boxShadow: '0 0 6px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: '40'
      });
      const gameContainer = refs?.game?.canvas?.parentElement || document.body;
      gameContainer.style.position = gameContainer.style.position || 'relative';
      gameContainer.appendChild(el);
    }
    fpsOverlayEl = el;
    return el;
  }

  /**
   * Calcula FPS medio en ventanas de 500 ms y actualiza el overlay.
   * @param {number} ts - Timestamp de requestAnimationFrame.
   */
  function updateFps(ts) {
    if (!fpsOverlayEl) return;
    if (!fpsMeasure.last) fpsMeasure.last = ts;
    fpsMeasure.frames += 1;
    const dt = ts - fpsMeasure.last;
    if (dt >= 500) {
      fpsMeasure.fps = fpsMeasure.frames / (dt / 1000);
      fpsMeasure.frames = 0;
      fpsMeasure.last = ts;
      fpsOverlayEl.textContent = `${Math.round(fpsMeasure.fps)} FPS`;
    }
  }

  /**
   * Crea/reutiliza el overlay rojo de muerte.
   * @returns {HTMLElement} Elemento overlay.
   */
  function ensureDeathOverlay() {
    let overlay = document.getElementById('death-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'death-overlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '56px',
        fontWeight: '900',
        color: '#ff5252',
        textShadow: '0 0 12px #000',
        pointerEvents: 'none',
        zIndex: '60',
        background: 'rgba(0,0,0,0.45)'
      });
      const gameContainer = refs?.game?.canvas?.parentElement || document.body;
      gameContainer.style.position = gameContainer.style.position || 'relative';
      gameContainer.appendChild(overlay);
    }
    return overlay;
  }

  /**
   * Cambia el texto mostrado en el overlay de muerte.
   * @param {string} text - Mensaje a mostrar.
   */
  function updateDeathOverlay(text) {
    const overlay = ensureDeathOverlay();
    overlay.textContent = text;
  }

  /** Elimina el overlay de muerte si existe. */
  function removeDeathOverlay() {
    const existing = document.getElementById('death-overlay');
    if (existing) existing.remove();
  }

  /**
   * Actualiza el texto del overlay de cuenta regresiva.
   * @param {string} text - Texto a mostrar.
   */
  function updateCountdownOverlay(text) {
    const overlay = ensureCountdownOverlay();
    overlay.textContent = text;
  }

  /** Remueve el overlay de cuenta regresiva si est� presente. */
  function removeCountdownOverlay() {
    const existing = document.getElementById('countdown-overlay');
    if (existing) existing.remove();
  }

  function formatTimestampForFile() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  /**
   * Descarga un objeto JSON como archivo (usa Blob y enlace temporal).
   * @param {Object} obj
   * @param {string} filename
   */
  function downloadJson(obj, filename = 'data.json') {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ----------------- Game Over Modal -----------------
  /**
   * Crea un overlay modal de Game Over con opciones de export y reinicio.
   */
  function showGameOverModal() {
    hideGameOverModal();
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.78)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      zIndex: '9999',
      color: '#f5f5f5'
    });

    const title = document.createElement('div');
    title.textContent = 'Game Over';
    Object.assign(title.style, { fontSize: '22px', fontWeight: '700' });

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '10px' });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cerrar y reiniciar';
    closeBtn.className = 'btn';
    closeBtn.onclick = resetAfterGameOver;

    const exportBestBtn = document.createElement('button');
    exportBestBtn.textContent = 'Export Best';
    exportBestBtn.className = 'btn';
    exportBestBtn.onclick = handleExportBest;

    const exportRunBtn = document.createElement('button');
    exportRunBtn.textContent = 'Export Run Data';
    exportRunBtn.className = 'btn';
    exportRunBtn.onclick = handleExportRun;

    actions.appendChild(closeBtn);
    actions.appendChild(exportBestBtn);
    actions.appendChild(exportRunBtn);
    overlay.appendChild(title);
    overlay.appendChild(actions);
    document.body.appendChild(overlay);
  }

  /** Elimina el overlay de Game Over si existe. */
  function hideGameOverModal() {
    const existing = document.getElementById('game-over-overlay');
    if (existing) existing.remove();
  }

  document.addEventListener('DOMContentLoaded', initApp);

  // Exponer helpers para pruebas manuales desde consola.
  /**
   * API ligera expuesta en window para pruebas manuales desde consola.
   */
  window.gameSession = {
    getState: () => currentState,
    startDemoLoop: handleDemoBest,
    pauseDemoLoop,
    resetGame: handleReset,
    stepOnce: stepDemo,
    muteAudio: (flag) => { if (window.audioManager) window.audioManager.setMuted(flag); }
  };
})();
