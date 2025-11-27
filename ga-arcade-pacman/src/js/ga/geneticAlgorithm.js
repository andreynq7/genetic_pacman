/**
 * geneticAlgorithm.js
 * -------------------
 * Implementación de un Algoritmo Genético para optimizar cromosomas de la política.
 * Separa: población, evaluación, selección, cruce, mutación y reemplazo con elitismo.
 * Usa un RNG con semilla para reproducibilidad en el navegador.
 */
(function() {
  const POLICY = window.policyEncoding;
  const FITNESS = window.fitnessEvaluator;

  if (!POLICY || !FITNESS) {
    console.warn('geneticAlgorithm: módulos policyEncoding/fitnessEvaluator no disponibles');
    return;
  }

  // RNG reproducible (LCG simple)
  class SeededRng {
    constructor(seed) {
      this.state = (seed >>> 0) || 1;
    }
    random() {
      this.state = (1664525 * this.state + 1013904223) >>> 0;
      return this.state / 0x100000000;
    }
    range(min, max) {
      return min + this.random() * (max - min);
    }
    int(max) {
      return Math.floor(this.random() * max);
    }
    pick(arr) {
      if (!arr.length) return null;
      return arr[this.int(arr.length)];
    }
  }

  const baseDefaults = window.defaultConfig || {};

  /**
   * Configuración por defecto del GA (puede ser sobreescrita).
   * selectionRate, crossoverRate, mutationRate se interpretan como % de individuos nuevos generados por cada operador.
   */
  const defaultGAConfig = {
    populationSize: baseDefaults.populationSize || 30,
    generations: baseDefaults.generations || 20,
    selectionRate: baseDefaults.selectionRate || 40,
    crossoverRate: baseDefaults.crossoverRate || 45,
    mutationRate: baseDefaults.mutationRate || 15,
    tournamentSize: baseDefaults.tournamentSize || 3,
    elitismCount: 2,
    mutationStrength: 0.5,      // magnitud del ruido agregado en mutación
    mutationGeneRate: 0.1,      // probabilidad por gen de mutar
    randomSeed: baseDefaults.randomSeed || 1234,
    fitnessConfig: FITNESS.defaultFitnessConfig
  };

  /**
   * Crea una configuración normalizada del GA.
   * @param {Object} cfg
   */
  function createGAConfig(cfg = {}) {
    return {
      populationSize: cfg.populationSize ?? defaultGAConfig.populationSize,
      generations: cfg.generations ?? defaultGAConfig.generations,
      selectionRate: cfg.selectionRate ?? defaultGAConfig.selectionRate,
      crossoverRate: cfg.crossoverRate ?? defaultGAConfig.crossoverRate,
      mutationRate: cfg.mutationRate ?? defaultGAConfig.mutationRate,
      tournamentSize: cfg.tournamentSize ?? defaultGAConfig.tournamentSize,
      elitismCount: cfg.elitismCount ?? defaultGAConfig.elitismCount,
      mutationStrength: cfg.mutationStrength ?? defaultGAConfig.mutationStrength,
      mutationGeneRate: cfg.mutationGeneRate ?? defaultGAConfig.mutationGeneRate,
      randomSeed: cfg.randomSeed ?? defaultGAConfig.randomSeed,
      fitnessConfig: FITNESS.createFitnessConfig(cfg.fitnessConfig || defaultGAConfig.fitnessConfig)
    };
  }

  /**
   * Estructura del estado del GA.
   * population: array de individuos { id, chromosome, fitness, evalStats }.
   * generation: índice de generación actual.
   * history: métricas por generación.
   */
  function createGAState(configOverrides = {}) {
    const config = createGAConfig(configOverrides);
    const rng = new SeededRng(config.randomSeed);
    const population = createInitialPopulation(config, rng);
    return {
      config,
      rng,
      population,
      generation: 0,
      bestEver: null,
      history: {
        bestFitness: [],
        avgFitness: []
      }
    };
  }

  /**
   * Crea población inicial con cromosomas aleatorios.
   * @param {Object} config
   * @param {SeededRng} rng
   */
  function createInitialPopulation(config, rng) {
    const pop = [];
    for (let i = 0; i < config.populationSize; i += 1) {
      pop.push({
        id: `ind-${i}`,
        chromosome: randomChromosomeWithRng(rng),
        fitness: null,
        evalStats: null
      });
    }
    return pop;
  }

  /**
   * Evalúa la población completa; solo evalúa individuos sin fitness.
   * @param {Object} gaState
   */
  function evaluatePopulation(gaState) {
    const cfg = gaState.config;
    let best = gaState.bestEver;
    let sum = 0;

    gaState.population.forEach((ind, idx) => {
      if (ind.fitness == null) {
        const fit = FITNESS.evaluateChromosome(ind.chromosome, seedFitnessConfig(cfg.fitnessConfig, gaState.generation, idx));
        ind.fitness = fit.fitness;
        ind.evalStats = fit;
      }
      sum += ind.fitness;
      if (!best || ind.fitness > best.fitness) {
        best = { ...ind, id: ind.id, generation: gaState.generation };
      }
    });

    gaState.bestEver = best;
    const avg = sum / gaState.population.length;
    return { best, avg };
  }

  /**
   * Ejecuta una generación: evalúa, registra métricas y crea la siguiente población.
   * @param {Object} gaState
   * @returns {{best:Object, avg:number}}
   */
  function runGeneration(gaState) {
    const { best, avg } = evaluatePopulation(gaState);
    gaState.history.bestFitness.push(best.fitness);
    gaState.history.avgFitness.push(avg);

    const nextPop = buildNextPopulation(gaState);
    gaState.population = nextPop;
    gaState.generation += 1;
    return { best, avg };
  }

  /**
   * Ejecuta N generaciones seguidas. Callback opcional por generación.
   * @param {Object} gaState
   * @param {number} generations
   * @param {(info:{generation:number,best:Object,avg:number})=>void} [onGeneration]
   */
  function runGenerations(gaState, generations, onGeneration) {
    for (let i = 0; i < generations; i += 1) {
      const result = runGeneration(gaState);
      if (onGeneration) {
        onGeneration({ generation: gaState.generation, best: gaState.bestEver, avg: result.avg });
      }
    }
  }

  /**
   * Construye la siguiente población aplicando elitismo + selección/cruce/mutación.
   * @param {Object} gaState
   */
  function buildNextPopulation(gaState) {
    const cfg = gaState.config;
    const rng = gaState.rng;
    const current = [...gaState.population].sort((a, b) => b.fitness - a.fitness);

    const next = [];
    // Elitismo: copia los mejores sin cambios
    const elites = Math.min(cfg.elitismCount, current.length);
    for (let i = 0; i < elites; i += 1) {
      next.push({ id: `g${gaState.generation + 1}-elite-${i}`, chromosome: POLICY.cloneChromosome(current[i].chromosome), fitness: null, evalStats: null });
    }

    const remainingSlots = cfg.populationSize - next.length;
    if (remainingSlots <= 0) return next;

    const selCount = Math.max(0, Math.round(remainingSlots * (cfg.selectionRate / 100)));
    const crossCount = Math.max(0, Math.round(remainingSlots * (cfg.crossoverRate / 100)));
    const mutCount = Math.max(0, remainingSlots - selCount - crossCount);

    // Selección (clones directos)
    for (let i = 0; i < selCount && next.length < cfg.populationSize; i += 1) {
      const parent = tournamentSelect(current, cfg.tournamentSize, rng);
      next.push({ id: `g${gaState.generation + 1}-sel-${i}`, chromosome: POLICY.cloneChromosome(parent.chromosome), fitness: null, evalStats: null });
    }

    // Cruces
    let crossIdx = 0;
    while (next.length < cfg.populationSize && crossIdx < crossCount) {
      const p1 = tournamentSelect(current, cfg.tournamentSize, rng);
      const p2 = tournamentSelect(current, cfg.tournamentSize, rng);
      const [c1, c2] = crossoverSinglePoint(p1.chromosome, p2.chromosome, rng);
      next.push({ id: `g${gaState.generation + 1}-cross-${crossIdx}`, chromosome: mutateChromosome(c1, cfg, rng), fitness: null, evalStats: null });
      if (next.length < cfg.populationSize) {
        next.push({ id: `g${gaState.generation + 1}-cross-${crossIdx}-b`, chromosome: mutateChromosome(c2, cfg, rng), fitness: null, evalStats: null });
      }
      crossIdx += 1;
    }

    // Mutaciones directas
    let mutIdx = 0;
    while (next.length < cfg.populationSize && mutIdx < mutCount) {
      const parent = tournamentSelect(current, cfg.tournamentSize, rng);
      const child = mutateChromosome(POLICY.cloneChromosome(parent.chromosome), cfg, rng);
      next.push({ id: `g${gaState.generation + 1}-mut-${mutIdx}`, chromosome: child, fitness: null, evalStats: null });
      mutIdx += 1;
    }

    // Si faltan individuos por redondeos, rellenar con cruces/mutaciones adicionales
    while (next.length < cfg.populationSize) {
      const p1 = tournamentSelect(current, cfg.tournamentSize, rng);
      const p2 = tournamentSelect(current, cfg.tournamentSize, rng);
      const [c1, c2] = crossoverSinglePoint(p1.chromosome, p2.chromosome, rng);
      next.push({ id: `g${gaState.generation + 1}-fill-${next.length}`, chromosome: mutateChromosome(c1, cfg, rng), fitness: null, evalStats: null });
      if (next.length < cfg.populationSize) {
        next.push({ id: `g${gaState.generation + 1}-fill-${next.length}`, chromosome: mutateChromosome(c2, cfg, rng), fitness: null, evalStats: null });
      }
    }

    return next;
  }

  /**
   * Selección por torneo: elige k individuos al azar y devuelve el mejor.
   * @param {Array} population Evaluada.
   * @param {number} k Tamaño de torneo.
   * @param {SeededRng} rng
   */
  function tournamentSelect(population, k, rng) {
    const size = Math.max(2, Math.min(k, population.length));
    let best = null;
    for (let i = 0; i < size; i += 1) {
      const candidate = rng.pick(population);
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best;
  }

  /**
   * Cruce de un punto. Devuelve dos hijos.
   * @param {number[]} a
   * @param {number[]} b
   * @param {SeededRng} rng
   */
  function crossoverSinglePoint(a, b, rng) {
    const len = POLICY.NUM_GENES;
    const point = 1 + rng.int(len - 1);
    const child1 = a.slice(0, point).concat(b.slice(point));
    const child2 = b.slice(0, point).concat(a.slice(point));
    return [child1, child2];
  }

  /**
   * Mutación por gen con probabilidad mutationGeneRate; añade ruido uniformemente distribuido.
   * @param {number[]} chromosome
   * @param {Object} cfg
   * @param {SeededRng} rng
   */
  function mutateChromosome(chromosome, cfg, rng) {
    const genes = POLICY.cloneChromosome(chromosome);
    for (let i = 0; i < genes.length; i += 1) {
      if (rng.random() < cfg.mutationGeneRate) {
        const noise = rng.range(-cfg.mutationStrength, cfg.mutationStrength);
        genes[i] = clamp(genes[i] + noise, POLICY.GENE_RANGE.min, POLICY.GENE_RANGE.max);
      }
    }
    return POLICY.normalizeChromosome(genes);
  }

  function randomChromosomeWithRng(rng) {
    const genes = [];
    for (let i = 0; i < POLICY.NUM_GENES; i += 1) {
      genes.push(rng.range(POLICY.GENE_RANGE.min, POLICY.GENE_RANGE.max));
    }
    return genes;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function seedFitnessConfig(baseCfg, generation, individualIndex) {
    const seedOffset = generation * 100000 + individualIndex * 9973;
    return { ...baseCfg, baseSeed: (baseCfg.baseSeed + seedOffset) >>> 0 };
  }

  function getBestIndividual(gaState) {
    return gaState.bestEver;
  }

  function getHistory(gaState) {
    return gaState.history;
  }

  window.geneticAlgorithm = {
    defaultGAConfig,
    createGAConfig,
    createGAState,
    evaluatePopulation,
    runGeneration,
    runGenerations,
    getBestIndividual,
    getHistory
  };
})();
