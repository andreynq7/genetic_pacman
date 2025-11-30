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
    callbacks: { onGeneration: null, onFinish: null },
    timing: { totalMs: 0, perGen: [] }
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
    return { gaConfig, fitnessConfig };
  }

  /**
   * Arranca la ejecución continua del GA.
   * @param {Function} onGeneration callback por generación.
   * @param {Function} onFinish callback al terminar todas las generaciones.
   */
  function start(onGeneration, onFinish) {
    if (!runState.gaState) {
      console.warn('gaController: inicializa antes de iniciar el GA');
      return;
    }
    runState.callbacks = { onGeneration, onFinish };
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

  /** Ejecuta una sola generación; se usa internamente por el loop. */
  function tickGeneration() {
    if (!runState.gaState || runState.status !== 'running') return;
    if (runState.gaState.generation >= runState.maxGenerations) {
      finish();
      return;
    }

    const t0 = performance.now ? performance.now() : Date.now();
    const { best, avg } = GA.runGeneration(runState.gaState);
    const t1 = performance.now ? performance.now() : Date.now();
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
      avgTimeMs: runState.timing.totalMs / runState.gaState.generation
    };

    if (runState.callbacks.onGeneration) {
      runState.callbacks.onGeneration(info);
    }

    if (runState.gaState.generation >= runState.maxGenerations) {
      finish();
    } else {
      scheduleLoop();
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
    getTiming
   };
})();
