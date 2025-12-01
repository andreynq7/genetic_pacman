/**
 * gaController.js
 * ----------------
 * Orquesta la ejecución del Algoritmo Genético y expone controles de inicio,
 * pausa, reanudación y reset para la UI. Construye la configuración a partir de
 * los parámetros de la UI, ejecuta generaciones en loop no bloqueante y
 * mantiene métricas históricas para las gráficas.
 */
(function() {
  const GA = window.geneticAlgorithm;
  const FITNESS = window.fitnessEvaluator;

  if (!GA || !FITNESS) {
    console.warn('gaController: geneticAlgorithm o fitnessEvaluator no disponibles');
    return;
  }

  const runState = {
    gaConfig: null,
    fitnessConfig: null,
    gaState: null,
    status: 'idle', // idle | running | paused | finished
    maxGenerations: 0,
    loopHandle: null,
    callbacks: { onGeneration: null, onFinish: null, onProgress: null },
    timing: { totalMs: 0, perGen: [] },
    workerPool: null,
    workerOptions: {
      enabled: true,
      size: null,
      chunkSize: 12
    }
  };

  /**
   * Inicializa el GA a partir de la configuración proveniente de la UI.
   * @param {Object} uiConfig Valores numéricos ya validados desde el formulario.
   */
  function initializeFromUI(uiConfig) {
    const fitnessConfig = FITNESS.createFitnessConfig({
      episodesPerIndividual: uiConfig.episodesPerIndividual,
      maxStepsPerEpisode: uiConfig.maxStepsPerEpisode,
      baseSeed: uiConfig.randomSeed
    });

    const gaConfig = GA.createGAConfig({
      populationSize: uiConfig.populationSize,
      generations: uiConfig.generations,
      selectionRate: uiConfig.selectionRate,
      crossoverRate: uiConfig.crossoverRate,
      mutationRate: uiConfig.mutationRate,
      tournamentSize: uiConfig.tournamentSize,
      randomSeed: uiConfig.randomSeed,
      fitnessConfig
    });

    runState.gaConfig = gaConfig;
    runState.fitnessConfig = fitnessConfig;
    runState.gaState = GA.createGAState(gaConfig);
    runState.status = 'idle';
    runState.maxGenerations = gaConfig.generations;
    runState.timing = { totalMs: 0, perGen: [] };
    clearLoop();
    ensureWorkerPool();
    return { gaConfig, fitnessConfig };
  }

  /**
   * Arranca la ejecución continua del GA.
   * @param {Function} onGeneration callback por generación.
   * @param {Function} onFinish callback al terminar todas las generaciones.
   */
  function start(onGeneration, onFinish, onProgress) {
    if (!runState.gaState) {
      console.warn('gaController: inicializa antes de iniciar el GA');
      return;
    }
    runState.callbacks = { onGeneration, onFinish, onProgress };
    runState.status = 'running';
    scheduleLoop();
  }

  /** Pausa la ejecución (no destruye estado). */
  function pause() {
    runState.status = 'paused';
    clearLoop();
  }

  /** Reanuda la ejecución si estaba pausada. */
  function resume() {
    if (!runState.gaState || runState.status === 'finished') return;
    runState.status = 'running';
    scheduleLoop();
  }

  /** Reinicia el GA con la configuración actual. */
  function reset() {
    if (!runState.gaConfig) return;
    runState.gaState = GA.createGAState(runState.gaConfig);
    runState.status = 'idle';
    runState.timing = { totalMs: 0, perGen: [] };
    clearLoop();
  }

  /**
   * Extiende el n�mero de generaciones objetivo usando el estado actual.
   * Permite seguir mejorando sin perder el mejor individuo hallado.
   * @param {number} extraGenerations Generaciones adicionales a correr.
   */
  function extendGenerations(extraGenerations) {
    if (!runState.gaState || !Number.isFinite(extraGenerations)) return null;
    const extra = Math.max(1, Math.floor(extraGenerations));
    runState.maxGenerations += extra;
    if (runState.gaConfig) {
      runState.gaConfig = { ...runState.gaConfig, generations: runState.maxGenerations };
    }
    if (runState.status === 'finished' || runState.status === 'idle') {
      runState.status = 'running';
      scheduleLoop();
    } else if (runState.status === 'paused') {
      runState.status = 'running';
      scheduleLoop();
    }
    return {
      targetGeneration: runState.maxGenerations,
      currentGeneration: runState.gaState.generation
    };
  }

  function ensureWorkerPool() {
    if (!runState.workerOptions.enabled) return null;
    if (runState.workerPool) return runState.workerPool;
    if (!window.gaWorkerPool || !gaWorkerPool.createWorkerPool) return null;
    runState.workerPool = gaWorkerPool.createWorkerPool({
      size: runState.workerOptions.size || undefined,
      chunkSize: runState.workerOptions.chunkSize
    });
    return runState.workerPool;
  }

  async function evaluatePopulationWithWorkers(gaState) {
    const pool = ensureWorkerPool();
    if (!pool || !pool.evaluateChromosomes) {
      throw new Error('gaController: pool de workers no disponible');
    }
    const tasks = [];
    const baseCfg = gaState.config?.fitnessConfig || {};
    const generation = gaState.generation;
    gaState.population.forEach((ind, idx) => {
      if (ind.fitness != null) return;
      const seeded = GA.seedFitnessConfig
        ? GA.seedFitnessConfig(baseCfg, generation, idx)
        : seedFitnessConfigFallback(baseCfg, generation, idx);
      tasks.push({
        index: idx,
        chromosome: ind.chromosome,
        fitnessConfig: seeded
      });
    });
    if (!tasks.length) return;
    notifyProgress({ stage: 'evaluation', completed: 0, total: tasks.length, generation });
    const results = await pool.evaluateChromosomes(tasks, {
      generation,
      chunkSize: runState.workerOptions.chunkSize
    });
    results.forEach((res) => {
      const target = gaState.population[res.index];
      if (target) {
        target.fitness = res.fitness;
        target.evalStats = res.evalStats;
      }
    });
    notifyProgress({ stage: 'evaluation', completed: tasks.length, total: tasks.length, generation });
  }

  /** Ejecuta una sola generación; se usa internamente por el loop. */
  async function tickGeneration() {
    if (!runState.gaState || runState.status !== 'running') return;
    if (runState.gaState.generation >= runState.maxGenerations) {
      finish();
      return;
    }

    const t0 = nowMs();
    let best;
    let avg;

    const useWorkers = runState.workerOptions.enabled && !!runState.workerPool;
    if (useWorkers) {
      try {
        await evaluatePopulationWithWorkers(runState.gaState);
        if (runState.status !== 'running') return;
        ({ best, avg } = GA.runGeneration(runState.gaState, { skipEvaluation: true }));
      } catch (err) {
        console.warn('gaController: fallo en workers, se continua en hilo principal', err);
        runState.workerOptions.enabled = false;
        ({ best, avg } = GA.runGeneration(runState.gaState));
      }
    } else {
      ({ best, avg } = GA.runGeneration(runState.gaState));
    }

    const t1 = nowMs();
    const duration = t1 - t0;
    runState.timing.totalMs += duration;
    runState.timing.perGen.push(duration);

    const info = {
      generation: runState.gaState.generation,
      bestFitness: best.fitness,
      averageFitness: avg,
      bestEver: runState.gaState.bestEver,
      history: runState.gaState.history,
      totalTimeMs: runState.timing.totalMs,
      avgTimeMs: runState.timing.totalMs / runState.gaState.generation,
      metrics: runState.gaState.lastMetrics
    };

    if (runState.callbacks.onGeneration) {
      runState.callbacks.onGeneration(info);
    }

    if (runState.gaState.generation >= runState.maxGenerations) {
      finish();
    } else if (runState.status === 'running') {
      scheduleLoop();
    }
  }

  function seedFitnessConfigFallback(baseCfg, generation, index) {
    const seedOffset = generation * 100000 + index * 9973;
    return {
      ...baseCfg,
      baseSeed: ((baseCfg.baseSeed || 0) + seedOffset) >>> 0,
      generationOffset: generation
    };
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function notifyProgress(payload) {
    if (runState.callbacks.onProgress) {
      runState.callbacks.onProgress(payload);
    }
  }

  function finish() {
    clearLoop();
    runState.status = 'finished';
    if (runState.callbacks.onFinish) {
      runState.callbacks.onFinish({
        bestEver: runState.gaState?.bestEver,
        history: runState.gaState?.history,
        totalTimeMs: runState.timing.totalMs
      });
    }
  }

  function scheduleLoop() {
    clearLoop();
    runState.loopHandle = setTimeout(tickGeneration, 0);
  }

  function clearLoop() {
    if (runState.loopHandle) {
      clearTimeout(runState.loopHandle);
      runState.loopHandle = null;
    }
  }

  function getBestChromosome() {
    return runState.gaState?.bestEver?.chromosome || null;
  }

  /** Devuelve el mejor fitness global alcanzado. */
  function getBestFitness() {
    return runState.gaState?.bestEver?.fitness ?? null;
  }

  /** Devuelve info del mejor individuo global (cromosoma, fitness, generación). */
  function getBestInfo() {
    if (!runState.gaState?.bestEver) return null;
    const best = runState.gaState.bestEver;
    return {
      chromosome: best.chromosome,
      fitness: best.fitness,
      generation: best.generation ?? runState.gaState.generation
    };
  }
  /** Configuración actual del GA. */
  function getGAConfig() {
    return runState.gaConfig;
  }
  /** Configuración actual de fitness. */
  function getFitnessConfig() {
    return runState.fitnessConfig;
  }
  function getStatus() {
    return {
      status: runState.status,
      generation: runState.gaState ? runState.gaState.generation : 0,
      maxGenerations: runState.maxGenerations
    };
  }

  function getHistory() {
    return runState.gaState?.history || { bestFitness: [], avgFitness: [] };
  }
  function getTiming() {
    return runState.timing;
  }

  function getMetricsHistory() {
    return runState.gaState?.metricsHistory || [];
  }

  window.gaController = {
    initializeFromUI,
    start,
    pause,
    resume,
    reset,
    extendGenerations,
    getBestChromosome,
    getBestFitness,
    getBestInfo,
    getGAConfig,
    getFitnessConfig,
    getStatus,
    getHistory,
    getTiming,
    getMetricsHistory
  };
})();
