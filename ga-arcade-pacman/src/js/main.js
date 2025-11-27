// Entry point to bootstrap UI wiring + GA orchestration + demo del mejor individuo.
(function() {
  let refs = null;
  let ctx = null;
  let currentState = null;
  let demoTimer = null;
  let demoPolicyFn = null;

  function initApp() {
    refs = uiLayout.getRefs();
    uiForms.applyDefaults(refs, window.defaultConfig || {});
    uiForms.bindFormValidation(refs);
    uiForms.validateParametersForm(refs);

    uiControls.bindControls(refs, {
      onStart: handleStartTraining,
      onPause: handlePauseResume,
      onReset: handleReset,
      onDemo: handleDemoBest,
      onExportBest: handleExportBest,
      onExportRun: handleExportRun
    });
    bindKeyboard();

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

  function render() {
    if (ctx && currentState) {
      gameView.renderFrame(ctx, currentState);
    }
    syncHud();
  }

  function syncHud() {
    if (!refs?.game?.statusBar || !currentState) return;
    domHelpers.setText(refs.game.statusBar.score, currentState.score);
    domHelpers.setText(refs.game.statusBar.level, '1');
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
    gaController.start(onGenerationUpdate, onTrainingFinished);
  }

  function handlePauseResume() {
    const status = gaController.getStatus();
    if (status.status === 'running') {
      gaController.pause();
      uiMetrics.updateStatusBadge('Pausado', 'paused');
    } else if (status.status === 'paused') {
      gaController.resume();
      uiMetrics.updateStatusBadge('Entrenando', 'training');
    } else if (demoTimer) {
      pauseDemoLoop();
    }
  }

  function handleReset() {
    stopDemo();
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

  // ----------------- Demo del mejor individuo -----------------
  function handleDemoBest() {
    stopDemo();
    const best = gaController.getBestChromosome();
    if (best) {
      demoPolicyFn = policyEncoding.policyFromChromosome(best, { tieBreak: 'random' });
    } else {
      demoPolicyFn = () => gameLogic.getRandomAction(currentState);
    }
    currentState = gameState.createInitialState();
    uiMetrics.updateStatusBadge('Demo', 'demo');
    demoTimer = setInterval(() => {
      const action = demoPolicyFn ? demoPolicyFn(currentState) : gameConstants.ACTIONS.STAY;
      stepDemo(action);
    }, 140);
  }

  function pauseDemoLoop() {
    stopDemo();
    uiMetrics.updateStatusBadge('Pausado', 'paused');
  }

  function stopDemo() {
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
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
    if (!currentState) return;
    const result = gameLogic.stepGame(currentState, action || gameConstants.ACTIONS.STAY);
    currentState = result.state;
    render();
    if (result.done && demoTimer) {
      // Reinicia episodio en modo demo para seguir mostrando recorrido.
      currentState = gameState.createInitialState();
    }
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (evt) => {
      const action = keyToAction(evt.key);
      if (action) {
        evt.preventDefault();
        stepDemo(action);
      }
    });
  }

  function keyToAction(key) {
    switch (key) {
      case 'ArrowUp': return gameConstants.ACTIONS.UP;
      case 'ArrowDown': return gameConstants.ACTIONS.DOWN;
      case 'ArrowLeft': return gameConstants.ACTIONS.LEFT;
      case 'ArrowRight': return gameConstants.ACTIONS.RIGHT;
      case ' ': return gameConstants.ACTIONS.STAY;
      default: return null;
    }
  }

  function formatNumber(val) {
    if (val == null || Number.isNaN(val)) return '--';
    return Number(val).toFixed(2);
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
