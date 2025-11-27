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
      onDemo: handleDemoBest
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
