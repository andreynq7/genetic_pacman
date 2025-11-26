// Entry point to bootstrap UI wiring + demo simple del motor base de Pac-Man.
(function() {
  let refs = null;
  let ctx = null;
  let currentState = null;
  let demoTimer = null;

  function initApp() {
    refs = uiLayout.getRefs();
    uiForms.applyDefaults(refs, window.defaultConfig || {});
    uiForms.bindFormValidation(refs);
    uiForms.validateParametersForm(refs);

    uiControls.bindControls(refs);
    bindDemoControls(refs);
    bindKeyboard();

    uiMetrics.updateMetrics(refs, {
      bestFitness: '0.00',
      averageFitness: '0.00',
      totalTime: '0 s',
      averageTime: '0 s',
      generation: '0'
    });
    uiMetrics.updateStatusBadge('Idle', 'idle');

    setupGame();
    uiMetrics.renderPlaceholderGraph(refs);
    console.log('GA-Arcade UI listo con motor base (sin IA).');
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

  function stepDemo(action) {
    if (!currentState) return;
    const result = gameLogic.stepGame(currentState, action || gameConstants.ACTIONS.STAY);
    currentState = result.state;
    render();
    if (result.done) {
      stopDemo();
      uiMetrics.updateStatusBadge('Idle', 'idle');
    }
  }

  function startDemoLoop() {
    stopDemo();
    uiMetrics.updateStatusBadge('Demo', 'demo');
    if (!currentState) {
      currentState = gameState.createInitialState();
    }
    demoTimer = setInterval(() => {
      const action = gameLogic.getRandomAction(currentState);
      stepDemo(action);
    }, 180);
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

  function resetGame() {
    stopDemo();
    currentState = gameState.createInitialState();
    uiMetrics.updateStatusBadge('Idle', 'idle');
    render();
  }

  function bindDemoControls(localRefs) {
    const controls = localRefs.controls || {};
    controls.start?.addEventListener('click', startDemoLoop);
    controls.pause?.addEventListener('click', pauseDemoLoop);
    controls.reset?.addEventListener('click', resetGame);
    controls.demo?.addEventListener('click', startDemoLoop);
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

  document.addEventListener('DOMContentLoaded', initApp);

  // Exponer helpers para pruebas manuales desde consola.
  window.gameSession = {
    getState: () => currentState,
    startDemoLoop,
    pauseDemoLoop,
    resetGame,
    stepOnce: stepDemo
  };
})();
