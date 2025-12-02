(function() {
  const state = { lastFitness: null };
  const FEATURE_NAMES = [
    'isWall',
    'isPellet',
    'isPowerPellet',
    'keepDirection',
    'uTurn',
    'distToPelletNorm',
    'distToGhostNorm',
    'approachingGhost',
    'fleeingGhost',
    'localOpenness',
    'pelletsRemainingFrac',
    'stepFraction'
  ];
  function init() { state.lastFitness = null; }
  function names() {
    if (window.policyEncoding && Array.isArray(window.policyEncoding.FEATURE_NAMES)) {
      return window.policyEncoding.FEATURE_NAMES;
    }
    return FEATURE_NAMES;
  }
  function buildPolicy(chromosome) {
    const arr = Array.isArray(chromosome) ? chromosome : [];
    const keys = names();
    const obj = {};
    const limit = Math.min(arr.length, keys.length);
    for (let i = 0; i < limit; i += 1) { obj[keys[i]] = arr[i]; }
    for (let i = limit; i < keys.length; i += 1) { obj[keys[i]] = null; }
    return obj;
  }
  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function maybeUpdate(best, cfgs) {
    if (!best || best.fitness == null) return;
    if (state.lastFitness != null && best.fitness <= state.lastFitness) return;
    state.lastFitness = best.fitness;
    // const payload = {
    //   chromosome: best.chromosome,
    //   policy: buildPolicy(best.chromosome),
    //   metadata: {
    //     generatedAt: new Date().toISOString(),
    //     fitness: best.fitness,
    //     generation: best.generation,
    //     gaParams: cfgs && cfgs.gaConfig ? cfgs.gaConfig : null,
    //     fitnessParams: cfgs && cfgs.fitnessConfig ? cfgs.fitnessConfig : null
    //   }
    // };
    // //downloadJson(payload, 'best.json');
    if (window.logger) window.logger.info('best_update', { fitness: best.fitness, generation: best.generation });
  }
  window.bestStore = { init, maybeUpdate };
})();
