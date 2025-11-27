/**
 * fitnessEvaluator.js
 * -------------------
 * Evalúa el fitness de un cromosoma ejecutando episodios sin render.
 * Construye la política desde el cromosoma, simula episodios con el simulador
 * y agrega recompensas para obtener un valor de fitness reproducible.
 */
(function() {
  const POLICY = window.policyEncoding;
  const SIM = window.episodeSimulator;
  const STATE = window.gameState;
  const CONST = window.gameConstants;

  if (!POLICY || !SIM || !STATE || !CONST) {
    console.warn('fitnessEvaluator: módulos requeridos no disponibles');
    return;
  }

  /**
   * Configuración por defecto para evaluar fitness.
   * - episodesPerIndividual: cuántos episodios se simulan por cromosoma.
   * - maxStepsPerEpisode: límite de pasos por episodio (usa stepLimit por defecto).
   * - gamma: factor de descuento opcional (no aplicado a la recompensa base, reservado para ajustes futuros).
   * - baseSeed: semilla base para reproducibilidad de Math.random durante cada episodio.
   * - episodeSeeds: lista opcional de semillas por episodio; si existe se usa en lugar de derivar desde baseSeed.
   */
  const defaultFitnessConfig = {
    episodesPerIndividual: 3,
    maxStepsPerEpisode: CONST.DEFAULTS.stepLimit,
    gamma: 1,
    baseSeed: 12345,
    episodeSeeds: null
  };

  /**
   * Normaliza/mezcla una configuración de fitness con valores por defecto.
   * @param {Object} cfg
   * @returns {Object}
   */
  function createFitnessConfig(cfg = {}) {
    return {
      episodesPerIndividual: cfg.episodesPerIndividual ?? defaultFitnessConfig.episodesPerIndividual,
      maxStepsPerEpisode: cfg.maxStepsPerEpisode ?? defaultFitnessConfig.maxStepsPerEpisode,
      gamma: cfg.gamma ?? defaultFitnessConfig.gamma,
      baseSeed: cfg.baseSeed ?? defaultFitnessConfig.baseSeed,
      episodeSeeds: Array.isArray(cfg.episodeSeeds) ? cfg.episodeSeeds : null
    };
  }

  /**
   * Evalúa un solo episodio con una política derivada del cromosoma.
   * @param {number[]} chromosome Vector de genes.
   * @param {Object} fitnessConfig Configuración de evaluación.
   * @param {number} seed Semilla usada para Math.random durante el episodio.
   * @returns {{reward:number, steps:number, finalState:Object, status:string}}
   */
  function evaluateEpisode(chromosome, fitnessConfig, seed) {
    const policyFn = POLICY.policyFromChromosome(chromosome, { tieBreak: 'first' });
    const initialState = STATE.createInitialState({ stepLimit: fitnessConfig.maxStepsPerEpisode });

    // Se fuerza reproducibilidad envolviendo Math.random con una LCG simple.
    const result = runWithSeed(seed, () => SIM.runEpisode(policyFn, {
      initialState,
      maxSteps: fitnessConfig.maxStepsPerEpisode
    }));

    const finalState = result.finalState;
    const totalReward = result.totalReward;
    return {
      reward: totalReward,
      steps: result.steps,
      finalState,
      status: finalState.status
    };
  }

  /**
   * Evalúa un cromosoma ejecutando múltiples episodios y agregando recompensas.
   * Fitness principal = media de recompensas de episodios.
   * @param {number[]} chromosome
   * @param {Object} configOverrides
   * @returns {{fitness:number, rewards:number[], bestReward:number, stdReward:number, episodes:Array}}
   */
  function evaluateChromosome(chromosome, configOverrides = {}) {
    const cfg = createFitnessConfig(configOverrides);
    const rewards = [];
    const episodes = [];

    for (let i = 0; i < cfg.episodesPerIndividual; i += 1) {
      const seed = getEpisodeSeed(cfg, i);
      const ep = evaluateEpisode(chromosome, cfg, seed);
      rewards.push(ep.reward);
      episodes.push(ep);
    }

    const fitness = mean(rewards);
    const stdReward = stddev(rewards, fitness);
    const bestReward = Math.max(...rewards);

    return {
      fitness,
      rewards,
      bestReward,
      stdReward,
      episodes
    };
  }

  // ----------------- Helpers internos -----------------
  function getEpisodeSeed(cfg, index) {
    if (cfg.episodeSeeds && cfg.episodeSeeds[index] != null) return cfg.episodeSeeds[index];
    const base = cfg.baseSeed >>> 0;
    // LCG derivada por índice para estabilidad: seed_i = (base + i * 1013904223) mod 2^32
    return (base + (index * 1013904223)) >>> 0;
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stddev(arr, mu) {
    if (!arr.length) return 0;
    const variance = arr.reduce((acc, v) => acc + (v - mu) * (v - mu), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * Envuelve una ejecución usando una versión seeded de Math.random para reproducibilidad.
   * @param {number} seed Semilla de 32 bits.
   * @param {Function} fn Función a ejecutar con la semilla aplicada.
   */
  function runWithSeed(seed, fn) {
    const originalRandom = Math.random;
    let state = (seed >>> 0) || 1;
    Math.random = function seededRandom() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    try {
      return fn();
    } finally {
      Math.random = originalRandom;
    }
  }

  window.fitnessEvaluator = {
    defaultFitnessConfig,
    createFitnessConfig,
    evaluateEpisode,
    evaluateChromosome
  };
})();
