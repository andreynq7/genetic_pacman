/**
 * geneticAlgorithm.js
 * -------------------
 * Implementaci�n de un Algoritmo Gen�tico para optimizar cromosomas de la pol�tica.
 * Separa: poblaci�n, evaluaci�n, selecci�n, cruce, mutaci�n y reemplazo con elitismo.
 * Usa un RNG con semilla para reproducibilidad en el navegador.
 */
(function() {
  const POLICY = window.policyEncoding;
  const FITNESS = window.fitnessEvaluator;

  if (!POLICY || !FITNESS) {
    console.warn('geneticAlgorithm: m�dulos policyEncoding/fitnessEvaluator no disponibles');
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
  const PERFORMANCE_TARGETS = {
    levelRange: { min: 1, max: 6 },
    growthRate: { min: 0.10, max: 0.25 }, // crecimiento esperado por ventana
    pointsPerMinute: { min: 1200, max: 3000 },
    efficiency: { min: 1.5, max: 3 }, // puntos por paso de simulación (aprox.)
    percentileRange: { min: 0.75, max: 0.9 },
    potentialGap: { min: 0.10, max: 0.30 }, // 10-30% por debajo del mejor
    evaluationWindowGenerations: 10,
    evaluationFrequencyGenerations: 5
  };

  /**
   * Configuraci�n por defecto del GA (puede ser sobreescrita).
   * selectionRate, crossoverRate, mutationRate se interpretan como % de individuos nuevos generados por cada operador.
   */
  const defaultGAConfig = {
    populationSize: baseDefaults.populationSize || 30,
    generations: baseDefaults.generations || 50,
    selectionRate: baseDefaults.selectionRate || 50,
    crossoverRate: baseDefaults.crossoverRate || 40,
    mutationRate: baseDefaults.mutationRate || 10,
    tournamentSize: baseDefaults.tournamentSize || 3,
    elitismCount: 3,
    mutationStrength: 0.8,      // magnitud del ruido agregado en mutaci�n
    mutationGeneRate: 0.6,      // probabilidad por gen de mutar
    randomSeed: baseDefaults.randomSeed || 1234, // baseDefaults.randomSeed ||
    mutationSchedule: { start: 1.2, end: 0.7 }, // factor multiplicativo dinamico
    fitnessConfig: FITNESS.defaultFitnessConfig,
    crossoverType: 'blend',
    crossoverBlendRate: 0.6,
    selectionScaling: 'log',
    fitnessSharing: true,
    sharingSigma: 0.75,
    sharingAlpha: 1
  };

  /**
   * Crea una configuraci�n normalizada del GA.
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
      mutationSchedule: cfg.mutationSchedule ?? defaultGAConfig.mutationSchedule,
      randomSeed: cfg.randomSeed ?? defaultGAConfig.randomSeed,
      fitnessConfig: FITNESS.createFitnessConfig(cfg.fitnessConfig || defaultGAConfig.fitnessConfig),
      crossoverType: cfg.crossoverType ?? defaultGAConfig.crossoverType,
      crossoverBlendRate: cfg.crossoverBlendRate ?? defaultGAConfig.crossoverBlendRate,
      selectionScaling: cfg.selectionScaling ?? defaultGAConfig.selectionScaling
    };
  }

  /**
   * Estructura del estado del GA.
   * population: array de individuos { id, chromosome, fitness, evalStats }.
   * generation: �ndice de generaci�n actual.
   * history: m�tricas por generaci�n.
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
      lastMetrics: null,
      metricsHistory: [],
      history: {
        bestFitness: [],
        avgFitness: []
      }
    };
  }

  /**
   * Crea poblaci�n inicial con cromosomas aleatorios.
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
   * Eval�a la poblaci�n completa; solo eval�a individuos sin fitness.
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

    const avg = sum / gaState.population.length;
    finalizeEvaluationMetrics(gaState, best, avg);
    return { best, avg };
  }

  /**
   * Reutiliza fitness ya calculado para registrar metricas y continuar con el pipeline.
   * @param {Object} gaState
   * @returns {{best:Object, avg:number}}
   */
  function summarizeEvaluatedPopulation(gaState) {
    let best = gaState.bestEver;
    let sum = 0;
    gaState.population.forEach((ind) => {
      if (ind.fitness == null) return;
      sum += ind.fitness;
      if (!best || ind.fitness > best.fitness) {
        best = { ...ind, id: ind.id, generation: gaState.generation };
      }
    });
    const avg = sum / gaState.population.length;
    finalizeEvaluationMetrics(gaState, best, avg);
    return { best, avg };
  }

  /**
   * Ejecuta una generaci�n: eval�a, registra m�tricas y crea la siguiente poblaci�n.
   * @param {Object} gaState
   * @returns {{best:Object, avg:number}}
   */
  function runGeneration(gaState, options = {}) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const { best, avg } = options.skipEvaluation
      ? summarizeEvaluatedPopulation(gaState)
      : evaluatePopulation(gaState);
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    maybeAutoTuneParameters(gaState);
    pushWithLimit(gaState.history.bestFitness, best.fitness);
    pushWithLimit(gaState.history.avgFitness, avg);
    const elapsed = t1 - t0;
    const perf = gaState.lastMetrics;
    console.log(`[GA] gen ${gaState.generation} eval ${elapsed.toFixed(1)}ms | A* recalcs ${perf?.aStarRecalcs ?? 'n/a'} cacheHits ${perf?.aStarCacheHits ?? 'n/a'}`);

    const nextPop = buildNextPopulation(gaState);
    gaState.population = nextPop;
    gaState.generation += 1;
    return { best, avg };
  }

  function finalizeEvaluationMetrics(gaState, best, avg) {
    gaState.bestEver = best;
    const perf = computePerformanceSnapshot(gaState, best, avg);
    gaState.lastMetrics = perf;
    pushWithLimit(gaState.metricsHistory, perf);
  }

  /**
   * Ejecuta N generaciones seguidas. Callback opcional por generaci�n.
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
   * Construye la siguiente poblaci�n aplicando elitismo + selecci�n/cruce/mutaci�n.
   * @param {Object} gaState
   */
  function buildNextPopulation(gaState) {
    const cfg = gaState.config;
    const rng = gaState.rng;
    const current = [...gaState.population].sort((a, b) => b.fitness - a.fitness);
    const sharingCfg = { enabled: cfg.fitnessSharing, sigma: cfg.sharingSigma, alpha: cfg.sharingAlpha };
    const priorityWeights = computePriorityWeights(current, PERFORMANCE_TARGETS, cfg.selectionScaling, sharingCfg);

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

    // Selecci�n (clones directos)
    for (let i = 0; i < selCount && next.length < cfg.populationSize; i += 1) {
      const parent = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      next.push({ id: `g${gaState.generation + 1}-sel-${i}`, chromosome: POLICY.cloneChromosome(parent.chromosome), fitness: null, evalStats: null });
    }

    const mutationTuning = getMutationTuning(gaState);

    // Cruces
    let crossIdx = 0;
    while (next.length < cfg.populationSize && crossIdx < crossCount) {
      const p1 = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      const p2 = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      const useBlend = cfg.crossoverType === 'blend' && rng.random() < cfg.crossoverBlendRate;
      const children = useBlend
        ? crossoverBlend(p1.chromosome, p2.chromosome, Math.max(0.25, Math.min(0.75, (p1.fitness) / Math.max(1, p1.fitness + p2.fitness))))
        : crossoverSinglePoint(p1.chromosome, p2.chromosome, rng);
      const perc1 = 1 - (current.indexOf(p1) / Math.max(1, current.length - 1));
      const perc2 = 1 - (current.indexOf(p2) / Math.max(1, current.length - 1));
      const tuned1 = scaleMutationByPercentile(mutationTuning, perc1);
      const tuned2 = scaleMutationByPercentile(mutationTuning, perc2);
      next.push({ id: `g${gaState.generation + 1}-cross-${crossIdx}`, chromosome: mutateChromosome(children[0], cfg, rng, tuned1), fitness: null, evalStats: null });
      if (next.length < cfg.populationSize) {
        next.push({ id: `g${gaState.generation + 1}-cross-${crossIdx}-b`, chromosome: mutateChromosome(children[1], cfg, rng, tuned2), fitness: null, evalStats: null });
      }
      crossIdx += 1;
    }

    // Mutaciones directas
    let mutIdx = 0;
    while (next.length < cfg.populationSize && mutIdx < mutCount) {
      const parent = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      const perc = 1 - (current.indexOf(parent) / Math.max(1, current.length - 1));
      const tuned = scaleMutationByPercentile(mutationTuning, perc);
      const child = mutateChromosome(POLICY.cloneChromosome(parent.chromosome), cfg, rng, tuned);
      next.push({ id: `g${gaState.generation + 1}-mut-${mutIdx}`, chromosome: child, fitness: null, evalStats: null });
      mutIdx += 1;
    }

    // Si faltan individuos por redondeos, rellenar con cruces/mutaciones adicionales
    while (next.length < cfg.populationSize) {
      const p1 = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      const p2 = tournamentSelect(current, cfg.tournamentSize, rng, priorityWeights);
      const [c1, c2] = crossoverSinglePoint(p1.chromosome, p2.chromosome, rng);
      next.push({ id: `g${gaState.generation + 1}-fill-${next.length}`, chromosome: mutateChromosome(c1, cfg, rng, mutationTuning), fitness: null, evalStats: null });
      if (next.length < cfg.populationSize) {
        next.push({ id: `g${gaState.generation + 1}-fill-${next.length}`, chromosome: mutateChromosome(c2, cfg, rng, mutationTuning), fitness: null, evalStats: null });
      }
    }

    return next;
  }

  /**
   * Selecci�n por torneo: elige k individuos al azar y devuelve el mejor.
   * @param {Array} population Evaluada.
   * @param {number} k Tama�o de torneo.
   * @param {SeededRng} rng
   */
  function tournamentSelect(population, k, rng, weights = null) {
    const size = Math.max(2, Math.min(k, population.length));
    let best = null;
    for (let i = 0; i < size; i += 1) {
      const candidate = pickWeighted(population, weights, rng);
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

  function crossoverBlend(a, b, w) {
    const len = POLICY.NUM_GENES;
    const child1 = new Array(len);
    const child2 = new Array(len);
    for (let i = 0; i < len; i += 1) {
      const g1 = clamp(a[i] * w + b[i] * (1 - w), POLICY.GENE_RANGE.min, POLICY.GENE_RANGE.max);
      const g2 = clamp(b[i] * w + a[i] * (1 - w), POLICY.GENE_RANGE.min, POLICY.GENE_RANGE.max);
      child1[i] = g1;
      child2[i] = g2;
    }
    return [POLICY.normalizeChromosome(child1), POLICY.normalizeChromosome(child2)];
  }

  /**
   * Mutaci�n por gen con probabilidad mutationGeneRate; a�ade ruido uniformemente distribuido.
   * @param {number[]} chromosome
   * @param {Object} cfg
   * @param {SeededRng} rng
   */
  function mutateChromosome(chromosome, cfg, rng, tuning) {
    const genes = POLICY.cloneChromosome(chromosome);
    const geneRate = tuning?.geneRate ?? cfg.mutationGeneRate;
    const strength = tuning?.strength ?? cfg.mutationStrength;
    for (let i = 0; i < genes.length; i += 1) {
      if (rng.random() < geneRate) {
        const noise = rng.range(-strength, strength);
        genes[i] = clamp(genes[i] + noise, POLICY.GENE_RANGE.min, POLICY.GENE_RANGE.max);
      }
    }
    return POLICY.normalizeChromosome(genes);
  }

  function pickWeighted(population, weights, rng) {
    if (!weights || weights.length !== population.length) return rng.pick(population);
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return rng.pick(population);
    let r = rng.random() * total;
    for (let i = 0; i < population.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return population[i];
    }
    return population[population.length - 1];
  }

  function computePriorityWeights(population, targets, scalingMode, sharingCfg = { enabled: false, sigma: 1, alpha: 1 }) {
    if (!population.length) return null;
    const bestFitness = population[0].fitness ?? 1;
    const gapRange = targets.potentialGap;
    const percRange = targets.percentileRange;
    const len = population.length;
    const sharing = sharingCfg?.enabled ? computeSharingFactors(population, sharingCfg.sigma, sharingCfg.alpha) : null;
    return population.map((ind, idx) => {
      const percentile = len > 1 ? 1 - (idx / (len - 1)) : 1;
      const gap = Math.max(0, (bestFitness - ind.fitness) / Math.max(1, Math.abs(bestFitness)));
      const gapBonus = (gap >= gapRange.min && gap <= gapRange.max) ? 1.25 : 1;
      const percentileBonus = (percentile >= percRange.min && percentile <= percRange.max) ? 1.15 : 1;
      const base = (scalingMode === 'log')
        ? (Math.log(1 + Math.max(0, ind.fitness)) + 1)
        : Math.max(1, ind.fitness);
      const crowd = sharing ? Math.max(0.5, 1 + sharing[idx]) : 1;
      return (base * gapBonus * percentileBonus) / crowd;
    });
  }

  function computePerformanceSnapshot(gaState, best, avg) {
    const evalStats = best?.evalStats;
    const episodes = Array.isArray(evalStats?.episodes) ? evalStats.episodes : [];
    const meanSteps = episodes.length
      ? episodes.reduce((acc, ep) => acc + (ep?.steps || 0), 0) / episodes.length
      : Math.max(1, evalStats?.steps || POLICY.NUM_GENES);
    const meanReward = evalStats?.fitness ?? best?.fitness ?? avg ?? 0;
    const stepsPerMinute = 600;
    const pointsPerMinute = (meanReward / Math.max(1, meanSteps)) * stepsPerMinute;
    const efficiency = meanReward / Math.max(1, meanSteps);
    const level = episodes.reduce((acc, ep) => Math.max(acc, ep?.finalState?.level || 0), 0) || PERFORMANCE_TARGETS.levelRange.min;
    const totalAStarRecalcs = episodes.reduce((acc, ep) => acc + ((ep?.finalState?.aStarRecalcs) || 0), 0);
    const totalAStarCacheHits = episodes.reduce((acc, ep) => acc + ((ep?.finalState?.aStarCacheHits) || 0), 0);

    const hist = gaState.history?.avgFitness || [];
    const win = PERFORMANCE_TARGETS.evaluationWindowGenerations;
    let growthRate = 0;
    if (hist.length >= win) {
      const prev = hist[hist.length - win];
      const denom = Math.max(1, Math.abs(prev));
      growthRate = (avg - prev) / denom;
    }
    const { p75, p90 } = computePercentiles(gaState.population);
    const div = computePopulationDiversity(gaState.population);
    const avgRatio = Math.max(0.0001, avg) / Math.max(0.0001, best?.fitness ?? avg ?? 1);
    return {
      level,
      meanReward,
      meanSteps,
      pointsPerMinute,
      efficiency,
      growthRate,
      percentile75: p75,
      percentile90: p90,
      aStarRecalcs: totalAStarRecalcs,
      aStarCacheHits: totalAStarCacheHits,
      diversity: div.geneStdMean,
      avgToBestRatio: avgRatio
    };
  }

  function computePercentiles(population) {
    if (!population.length) return { p75: 0, p90: 0 };
    const values = population.map((p) => p.fitness).sort((a, b) => a - b);
    const at = (q) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))];
    return { p75: at(0.75), p90: at(0.9) };
  }

  function computeSharingFactors(population, sigma, alpha) {
    const n = population.length;
    const len = POLICY.NUM_GENES;
    const s = new Array(n).fill(0);
    const sg = Math.max(0.0001, sigma);
    const a = Math.max(0.5, alpha);
    for (let i = 0; i < n; i += 1) {
      const gi = population[i].chromosome;
      let acc = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const gj = population[j].chromosome;
        let dist2 = 0;
        for (let k = 0; k < len; k += 1) {
          const d = gi[k] - gj[k];
          dist2 += d * d;
        }
        const d = Math.sqrt(dist2);
        if (d < sg) {
          const sh = 1 - Math.pow(d / sg, a);
          acc += Math.max(0, sh);
        }
      }
      s[i] = acc;
    }
    return s;
  }

  function computePopulationDiversity(population) {
    if (!population.length) return { geneStdMean: 0 };
    const len = POLICY.NUM_GENES;
    const n = population.length;
    const sums = new Array(len).fill(0);
    const sums2 = new Array(len).fill(0);
    for (let p = 0; p < n; p += 1) {
      const g = population[p].chromosome;
      for (let i = 0; i < len; i += 1) {
        const v = g[i];
        sums[i] += v;
        sums2[i] += v * v;
      }
    }
    let stdSum = 0;
    for (let i = 0; i < len; i += 1) {
      const mu = sums[i] / n;
      const varg = Math.max(0, (sums2[i] / n) - mu * mu);
      stdSum += Math.sqrt(varg);
    }
    return { geneStdMean: stdSum / len };
  }

  function maybeAutoTuneParameters(gaState) {
    const perf = gaState.lastMetrics;
    if (!perf) return;
    const targets = PERFORMANCE_TARGETS;
    if (gaState.generation !== 0 && (gaState.generation % targets.evaluationFrequencyGenerations !== 0)) return;

    const cfg = gaState.config;
    let tweaked = false;
    const desiredElitism = gaState.generation < targets.evaluationWindowGenerations ? 4 : 2;
    cfg.elitismCount = clamp(desiredElitism, 1, Math.max(2, Math.floor(cfg.populationSize * 0.2)));

    const underperforming = (perf.growthRate < targets.growthRate.min)
      || (perf.efficiency < targets.efficiency.min)
      || (perf.pointsPerMinute < targets.pointsPerMinute.min);
    const overperforming = (perf.growthRate > targets.growthRate.max)
      && (perf.efficiency > targets.efficiency.max);

    if (underperforming) {
      cfg.mutationRate = clamp(cfg.mutationRate + 5, 10, 60);
      cfg.crossoverRate = clamp(cfg.crossoverRate + 2, 20, 70);
      cfg.selectionRate = clamp(cfg.selectionRate - 5, 20, 80);
      cfg.mutationStrength = clamp(cfg.mutationStrength * 1.08, 0.5, 3);
      tweaked = true;
    } else if (overperforming) {
      cfg.mutationRate = clamp(cfg.mutationRate - 5, 5, 50);
      cfg.crossoverRate = clamp(cfg.crossoverRate - 2, 15, 65);
      cfg.selectionRate = clamp(cfg.selectionRate + 5, 30, 90);
      cfg.mutationStrength = clamp(cfg.mutationStrength * 0.92, 0.5, 3);
      tweaked = true;
    }

    const lastAvg = gaState.history?.avgFitness?.length ? gaState.history.avgFitness[gaState.history.avgFitness.length - 1] : 0;
    const bestFit = gaState.bestEver?.fitness ?? 1;
    const avgRatio = Math.max(0.0001, lastAvg) / Math.max(0.0001, bestFit);
    const lowAvgGap = avgRatio < 0.25;
    const lowDiversity = (perf?.diversity ?? 0) < 0.35;

    if (lowAvgGap && !lowDiversity) {
      cfg.tournamentSize = clamp(cfg.tournamentSize + 1, 2, 6);
      cfg.selectionRate = clamp(cfg.selectionRate + 5, 30, 90);
      cfg.mutationStrength = clamp(cfg.mutationStrength * 0.95, 0.4, 3);
      tweaked = true;
    } else if (lowDiversity) {
      cfg.tournamentSize = clamp(cfg.tournamentSize - 1, 2, 6);
      cfg.mutationRate = clamp(cfg.mutationRate + 5, 10, 60);
      cfg.crossoverRate = clamp(cfg.crossoverRate + 3, 25, 75);
      cfg.fitnessSharing = true;
      cfg.sharingSigma = clamp(cfg.sharingSigma * 1.15, 0.5, 2.5);
      tweaked = true;
    }

    cfg.fitnessConfig.baseLevel = targets.levelRange.min;
    cfg.fitnessConfig.maxCurriculumLevel = targets.levelRange.max;
    if (cfg.fitnessConfig.curriculumGrowth == null) {
      cfg.fitnessConfig.curriculumGrowth = FITNESS?.defaultFitnessConfig?.curriculumGrowth ?? 0.12;
    }

    if (tweaked) normalizeRates(cfg);
  }

  function normalizeRates(cfg) {
    const total = cfg.selectionRate + cfg.crossoverRate + cfg.mutationRate;
    if (total > 100) {
      const scale = 100 / total;
      cfg.selectionRate *= scale;
      cfg.crossoverRate *= scale;
      cfg.mutationRate *= scale;
    } else if (total < 95) {
      const deficit = 100 - total;
      cfg.crossoverRate = clamp(cfg.crossoverRate + deficit * 0.5, 10, 80);
      cfg.selectionRate = clamp(cfg.selectionRate + deficit * 0.3, 10, 90);
      cfg.mutationRate = clamp(cfg.mutationRate + deficit * 0.2, 5, 60);
    }
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

  function pushWithLimit(arr, value, limit = 200) {
    arr.push(value);
    if (arr.length > limit) {
      arr.splice(0, arr.length - limit);
    }
  }

  function seedFitnessConfig(baseCfg, generation, individualIndex) {
    const seedOffset = generation * 100000 + individualIndex * 9973;
    return { ...baseCfg, baseSeed: (baseCfg.baseSeed + seedOffset) >>> 0, generationOffset: generation };
  }

  function getMutationTuning(gaState) {
    const cfg = gaState.config;
    const sched = cfg.mutationSchedule || { start: 1, end: 1 };
    const progress = Math.min(1, gaState.generation / Math.max(1, cfg.generations || 1));
    const factor = sched.start + (sched.end - sched.start) * progress;
    return {
      geneRate: cfg.mutationGeneRate * factor,
      strength: cfg.mutationStrength * factor
    };
  }

  function scaleMutationByPercentile(baseTuning, percentile) {
    const p = Math.max(0, Math.min(1, percentile));
    const rateScale = 0.8 + (1 - p) * 0.6;
    const strengthScale = 0.85 + (1 - p) * 0.5;
    return {
      geneRate: baseTuning.geneRate * rateScale,
      strength: baseTuning.strength * strengthScale
    };
  }

  function getBestIndividual(gaState) {
    return gaState.bestEver;
  }

  function getHistory(gaState) {
    return gaState.history;
  }

  function getMetricsHistory(gaState) {
    return gaState.metricsHistory || [];
  }

  window.geneticAlgorithm = {
    defaultGAConfig,
    createGAConfig,
    createGAState,
    evaluatePopulation,
    runGeneration,
    runGenerations,
    summarizeEvaluatedPopulation,
    seedFitnessConfig,
    getBestIndividual,
    getHistory,
    getMetricsHistory
  };
})();
