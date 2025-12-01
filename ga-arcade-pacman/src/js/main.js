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

  function initApp() {
    refs = uiLayout.getRefs();
    uiForms.applyDefaults(refs, window.defaultConfig || {});
    uiForms.bindFormValidation(refs);
    uiForms.validateParametersForm(refs);
    if (window.audioManager) {
      window.audioManager.loadAll().catch(() => {});
    }

    uiControls.bindControls(refs, {
      onStart: handleStartTraining,
      onPause: handlePauseResume,
      onExtend: handleExtendTraining,
      onReset: handleReset,
      onDemo: handleDemoBest,
      onExportBest: handleExportBest,
      onExportRun: handleExportRun
    });

    uiMetrics.updateTrainingMetrics(refs, {
      bestFitness: '--',
      averageFitness: '--',
      generation: '0',
      totalTime: '0 s',
      averageTime: '0 s'
    });
    uiMetrics.updateStatusBadge('Idle', 'idle');

    setupGame();
    uiMetrics.renderPlaceholderGraph(refs);
    console.log('GA-Arcade UI lista con integración de GA.');
  }

  function setupGame() {
    ctx = gameView.initGameView(refs.game?.canvas || 'game-canvas');
    currentState = gameState.createInitialState();
    render();
  }

  function render(alpha = 1) {
    if (ctx && currentState) {
      gameView.renderFrame(ctx, currentState, alpha);
    }
    syncHud();
  }

  function syncHud() {
    if (!refs?.game?.statusBar || !currentState) return;
    domHelpers.setText(refs.game.statusBar.score, currentState.score);
    const level = currentState.level ?? 1;
    domHelpers.setText(refs.game.statusBar.level, level);
    domHelpers.setText(refs.game.statusBar.lives, currentState.lives);
  }

  // ----------------- GA control -----------------
  function handleStartTraining() {
    if (!uiForms.validateParametersForm(refs)) return;
    stopDemo();
    const uiConfig = uiForms.readUIConfig(refs, window.defaultConfig || {});
    gaController.initializeFromUI(uiConfig);
    uiMetrics.updateStatusBadge('Entrenando', 'training');
    uiMetrics.renderFitnessGraph(refs, [], []);
    gaController.start(onGenerationUpdate, onTrainingFinished, onTrainingProgress);
  }

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

  function handleExtendTraining() {
    if (!uiForms.validateParametersForm(refs)) return;
    stopDemo();
    const uiConfig = uiForms.readUIConfig(refs, window.defaultConfig || {});
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
    setupGame();
  }

  function onGenerationUpdate(info) {
    uiMetrics.updateStatusBadge('Entrenando', 'training');
    const best = formatNumber(info.bestFitness);
    const avg = formatNumber(info.averageFitness);
    const genLabel = `${info.generation}/${gaController.getStatus().maxGenerations || info.generation}`;
    const totalTime = `${formatNumber(info.totalTimeMs / 1000)} s`;
    const avgTime = `${formatNumber(info.avgTimeMs / 1000)} s`;

    uiMetrics.updateTrainingMetrics(refs, {
      bestFitness: best,
      averageFitness: avg,
      generation: genLabel,
      totalTime,
      averageTime: avgTime
    });
    uiMetrics.renderFitnessGraph(refs, info.history.bestFitness, info.history.avgFitness);
  }

  function onTrainingFinished(summary) {
    uiMetrics.updateStatusBadge('Terminado', 'training');
    if (summary?.history) {
      uiMetrics.renderFitnessGraph(refs, summary.history.bestFitness, summary.history.avgFitness);
    }
  }

  function onTrainingProgress(progress) {
    if (!progress) return;
    if (progress.stage === 'evaluation') {
      uiMetrics.updateStatusBadge('Evaluando', 'training');
    }
  }

  // ----------------- Demo del mejor individuo -----------------
  function handleDemoBest() {
    stopDemo();
    hideGameOverModal();
    const best = gaController.getBestChromosome();
    if (best) {
      demoPolicyFn = policyEncoding.policyFromChromosome(best, { tieBreak: 'random' });
    } else {
      demoPolicyFn = () => gameLogic.getRandomAction(currentState);
    }
    currentState = gameState.createInitialState();
    uiMetrics.updateStatusBadge('Demo', 'demo');
    showReadyLabel();
    const startSeq = window.audioManager ? window.audioManager.playStartSequence() : Promise.resolve();
    startSeq.finally(() => {
      hideReadyLabel();
      if (window.audioManager) {
        window.audioManager.startGameplayLoops(currentState);
      }
      startRenderLoop();
    });
  }

  function pauseDemoLoop() {
    stopDemo();
    uiMetrics.updateStatusBadge('Pausado', 'paused');
  }

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
    downloadJson(payload, filename);
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
      generationCount: status.generation,
      timing: gaController.getTiming(),
      timestamp: new Date().toISOString()
    };
    const ts = formatTimestampForFile();
    downloadJson(configExport, `config_run_${ts}.json`);
    downloadJson(logsExport, `logs_run_${ts}.json`);
  }

  // ----------------- Simulación de juego y entrada -----------------
  function stepDemo(action) {
    if (!demoRunning) return;
    if (!currentState) return;
    const result = gameLogic.stepGame(currentState, action || gameConstants.ACTIONS.STAY);
    currentState = result.state;
    if (window.audioManager) {
      window.audioManager.handleStep(currentState, result.info || {});
    }
    if (result.done) {
      const reason = result.state.status;
      if ((reason === 'life_lost' || reason === 'game_over') && result.state.lives <= 0) {
        stopDemo();
        uiMetrics.updateStatusBadge('Game Over', 'paused');
        showGameOverModal();
        currentState = gameState.createInitialState();
        render();
        return;
      }
      if (reason === 'life_lost' && result.state.lives > 0) {
        currentState = gameState.createInitialState({ lives: result.state.lives, level: result.state.level, score: result.state.score });
        if (window.audioManager) window.audioManager.startGameplayLoops(currentState);
        render();
        return;
      }
      if (reason === 'stalled' || reason === 'killed') {
        // En demo mantenemos continuidad: limpiamos contadores de estancamiento y seguimos.
        currentState.status = 'running';
        currentState.stepsSinceLastPellet = 0;
        currentState.stallCount = 0;
        if (window.audioManager) window.audioManager.startGameplayLoops(currentState);
        return;
      }
      const nextLevel = reason === 'level_cleared' ? (result.state.level || 1) + 1 : (result.state.level || 1);
      currentState = gameState.createInitialState({ lives: result.state.lives, level: nextLevel, score: result.state.score });
      if (window.audioManager) window.audioManager.startGameplayLoops(currentState);
      render();
    }
  }

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
    if (demoRunning && currentState?.status !== 'game_over') {
      renderLoopHandle = requestAnimationFrame(renderLoop);
    }
  }

  function startRenderLoop() {
    demoRunning = true;
    lastTimestamp = null;
    accumulatorMs = 0;
    renderLoopHandle = requestAnimationFrame(renderLoop);
  }



  function formatNumber(val) {
    if (val == null || Number.isNaN(val)) return '--';
    return Number(val).toFixed(2);
  }

  function showReadyLabel() {
    const existing = document.getElementById('ready-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ready-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '48px',
      fontWeight: '800',
      color: '#ffc107',
      textShadow: '0 0 10px #000',
      pointerEvents: 'none',
      zIndex: '50'
    });
    overlay.textContent = 'READY';
    const gameContainer = refs?.game?.container || (refs?.game?.canvas?.parentElement);
    const parent = gameContainer || document.body;
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(overlay);
  }

  function hideReadyLabel() {
    const existing = document.getElementById('ready-overlay');
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

  function hideGameOverModal() {
    const existing = document.getElementById('game-over-overlay');
    if (existing) existing.remove();
  }

  document.addEventListener('DOMContentLoaded', initApp);

  // Exponer helpers para pruebas manuales desde consola.
  window.gameSession = {
    getState: () => currentState,
    startDemoLoop: handleDemoBest,
    pauseDemoLoop,
    resetGame: handleReset,
    stepOnce: stepDemo
  };
})();
