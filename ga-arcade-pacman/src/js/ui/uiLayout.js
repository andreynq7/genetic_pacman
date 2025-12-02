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
      fps: null,
      episodes: domHelpers.getById('episodes-input'),
      workers: null,
      chunk: null
    };

    refs.validation = {
      percentageError: domHelpers.getById('percentage-error')
    };

    refs.controls = {
      start: domHelpers.getById('start-btn'),
      pause: domHelpers.getById('pause-btn'),
      extend: domHelpers.getById('extend-btn'),
      reset: domHelpers.getById('reset-btn'),
      demo: domHelpers.getById('demo-btn'),
      exportBest: domHelpers.getById('export-best-btn'),
      exportRun: domHelpers.getById('export-run-btn'),
      exportFitness: domHelpers.getById('export-fitness-btn')
    };

    refs.statusBadge = domHelpers.getById('status-badge');

    refs.metrics = {
      best: domHelpers.getById('best-fitness'),
      avg: domHelpers.getById('avg-fitness'),
      totalTime: domHelpers.getById('total-time'),
      avgTime: domHelpers.getById('avg-time'),
      generation: domHelpers.getById('generation-count'),
      workersActive: null,
      chunkSizeUsed: null,
      workersActiveDup: null,
      chunkSizeUsedDup: null,
      bestList: domHelpers.getById('best-list')
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

    refs.populationChart = {
      svg: domHelpers.getById('population-chart'),
      tooltip: domHelpers.getById('population-tooltip'),
      rangeStart: domHelpers.getById('population-range-start'),
      rangeEnd: domHelpers.getById('population-range-end'),
      improvementBtn: domHelpers.getById('pop-improvement-btn'),
      cumulativeBtn: domHelpers.getById('pop-cumulative-btn')
    };

    refs.tabs = null;
    refs.workers = null;
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
