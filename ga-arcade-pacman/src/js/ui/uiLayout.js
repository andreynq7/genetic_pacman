// Caches references to relevant DOM nodes used across UI modules.
(function() {
  const refs = {};

  function cacheDom() {
    refs.form = domHelpers.getById('ga-params-form');
    refs.inputs = {
      population: domHelpers.getById('population-input'),
      generations: domHelpers.getById('generations-input'),
      selection: domHelpers.getById('selection-input'),
      crossover: domHelpers.getById('crossover-input'),
      mutation: domHelpers.getById('mutation-input'),
      tournament: domHelpers.getById('tournament-input'),
      seed: domHelpers.getById('seed-input'),
      fps: domHelpers.getById('fps-input'),
      episodes: domHelpers.getById('episodes-input')
    };

    refs.validation = {
      percentageError: domHelpers.getById('percentage-error')
    };

    refs.controls = {
      start: domHelpers.getById('start-btn'),
      pause: domHelpers.getById('pause-btn'),
      reset: domHelpers.getById('reset-btn'),
      demo: domHelpers.getById('demo-btn')
    };

    refs.statusBadge = domHelpers.getById('status-badge');

    refs.metrics = {
      best: domHelpers.getById('best-fitness'),
      avg: domHelpers.getById('avg-fitness'),
      totalTime: domHelpers.getById('total-time'),
      avgTime: domHelpers.getById('avg-time'),
      generation: domHelpers.getById('generation-count')
    };

    refs.game = {
      canvas: domHelpers.getById('game-canvas'),
      statusBar: {
        score: domHelpers.getById('score-value'),
        level: domHelpers.getById('level-value'),
        lives: domHelpers.getById('lives-value')
      },
      metricsCanvas: domHelpers.getById('metrics-canvas'),
      context: null
    };
  }

  function getRefs() {
    if (!Object.keys(refs).length) {
      cacheDom();
    }
    return refs;
  }

  window.uiLayout = {
    cacheDom,
    getRefs
  };
})();
