(function() {
  function stripComments(text) {
    return text.replace(/\/\*[^]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  }
  async function loadJsonc(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('config fetch failed ' + url);
    const raw = await res.text();
    const clean = stripComments(raw);
    return JSON.parse(clean);
  }
  function num(v, def) { return Number.isFinite(v) ? v : def; }
  function bool(v, def) { return typeof v === 'boolean' ? v : def; }
  function str(v, def) { return typeof v === 'string' ? v : def; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function validateGa(cfg) {
    const t = {};
    t.populationSize = clamp(num(cfg.populationSize, 30), 1, 100000);
    t.generations = clamp(num(cfg.generations, 50), 1, 100000);
    t.selectionRate = clamp(num(cfg.selectionRate, 40), 0, 100);
    t.crossoverRate = clamp(num(cfg.crossoverRate, 45), 0, 100);
    t.mutationRate = clamp(num(cfg.mutationRate, 15), 0, 100);
    t.tournamentSize = clamp(num(cfg.tournamentSize, 3), 1, 100000);
    t.randomSeed = num(cfg.randomSeed, 1234);
    t.elitismCount = clamp(num(cfg.elitismCount, 3), 0, 100000);
    t.mutationStrength = clamp(num(cfg.mutationStrength, 0.8), 0, 10);
    t.mutationGeneRate = clamp(num(cfg.mutationGeneRate, 0.6), 0, 1);
    t.mutationSchedule = cfg.mutationSchedule && typeof cfg.mutationSchedule === 'object' ? {
      start: clamp(num(cfg.mutationSchedule.start, 1.2), 0, 10),
      end: clamp(num(cfg.mutationSchedule.end, 0.7), 0, 10)
    } : { start: 1.2, end: 0.7 };
    const ct = str(cfg.crossoverType, 'blend');
    t.crossoverType = (ct === 'blend' || ct === 'single_point') ? ct : 'blend';
    t.crossoverBlendRate = clamp(num(cfg.crossoverBlendRate, 0.6), 0, 1);
    const ss = str(cfg.selectionScaling, 'log');
    t.selectionScaling = (ss === 'log' || ss === 'linear') ? ss : 'log';
    t.fitnessSharing = bool(cfg.fitnessSharing, true);
    t.sharingSigma = clamp(num(cfg.sharingSigma, 0.75), 0, 10);
    t.sharingAlpha = clamp(num(cfg.sharingAlpha, 1), 0, 10);
    return t;
  }
  function validateFitness(cfg) {
    const t = {};
    t.episodesPerIndividual = clamp(num(cfg.episodesPerIndividual, 3), 1, 1000);
    t.maxStepsPerEpisode = clamp(num(cfg.maxStepsPerEpisode, (window.gameConstants?.DEFAULTS?.stepLimit || 2000)), 1, 1000000);
    t.gamma = clamp(num(cfg.gamma, 0.99), 0, 1);
    t.baseSeed = num(cfg.baseSeed, 0);
    t.episodeSeeds = Array.isArray(cfg.episodeSeeds) ? cfg.episodeSeeds.map((n) => num(n, 0)) : null;
    t.baseLevel = clamp(num(cfg.baseLevel, 1), 1, 6);
    t.curriculumGrowth = clamp(num(cfg.curriculumGrowth, 0.15), 0, 1);
    t.maxCurriculumLevel = clamp(num(cfg.maxCurriculumLevel, 6), 1, 99);
    t.completionBonus = num(cfg.completionBonus, 5000);
    t.lifeLossPenalty = num(cfg.lifeLossPenalty, 500);
    t.noLifeLossBonus = num(cfg.noLifeLossBonus, 2500);
    t.generationOffset = num(cfg.generationOffset, 0);
    t.disableCompletionBonus = bool(cfg.disableCompletionBonus, false);
    t.stepPenalty = num(cfg.stepPenalty, 0);
    t.stallPenalty = num(cfg.stallPenalty, 10);
    return t;
  }
  function validateLogging(cfg) {
    const t = {};
    t.level = ['debug','info','warn','error'].includes(str(cfg.level, 'info')) ? str(cfg.level, 'info') : 'info';
    t.format = str(cfg.format, 'jsonl');
    t.rotation = cfg.rotation && typeof cfg.rotation === 'object' ? {
      daily: bool(cfg.rotation.daily, true),
      maxSizeMB: clamp(num(cfg.rotation.maxSizeMB, 10), 1, 1024),
      maxFiles: clamp(num(cfg.rotation.maxFiles, 14), 1, 10000)
    } : { daily: true, maxSizeMB: 10, maxFiles: 14 };
    t.retentionDays = clamp(num(cfg.retentionDays, 14), 1, 3650);
    t.serverUrl = str(cfg.serverUrl, '');
    t.maxEntries = clamp(num(cfg.maxEntries, 10000), 100, 1000000);
    return t;
  }
  async function load() {
    let ga = null;
    let fitness = null;
    let logging = null;
    try { ga = validateGa(await loadJsonc('./config/ga.jsonc')); } catch (_) { ga = validateGa({}); }
    try { fitness = validateFitness(await loadJsonc('./config/fitness.jsonc')); } catch (_) { fitness = validateFitness({}); }
    try { logging = validateLogging(await loadJsonc('./config/logging.jsonc')); } catch (_) { logging = validateLogging({}); }
    window.appConfig = { ga, fitness, logging };
    if (window.logger && window.logger.init) window.logger.init(logging);
    return window.appConfig;
  }
  window.configLoader = { load };
})();
