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

  /** Reinicia el tracking interno del mejor fitness. */
  function init() { state.lastFitness = null; }

  /**
   * Obtiene los nombres de features que corresponden al cromosoma de pol�tica.
   * Prefiere los definidos en `policyEncoding.FEATURE_NAMES` si existen.
   * @returns {string[]} Lista de nombres de genes.
   */
  function names() {
    if (window.policyEncoding && Array.isArray(window.policyEncoding.FEATURE_NAMES)) {
      return window.policyEncoding.FEATURE_NAMES;
    }
    return FEATURE_NAMES;
  }

  /**
   * Convierte un cromosoma en objeto legible llave-valor.
   * @param {number[]} chromosome - Genes en orden fijo.
   * @returns {Object} Mapa de feature -> peso.
   */
  function buildPolicy(chromosome) {
    const arr = Array.isArray(chromosome) ? chromosome : [];
    const keys = names();
    const obj = {};
    const limit = Math.min(arr.length, keys.length);
    for (let i = 0; i < limit; i += 1) { obj[keys[i]] = arr[i]; }
    for (let i = limit; i < keys.length; i += 1) { obj[keys[i]] = null; }
    return obj;
  }

  /**
   * Descarga un JSON con los datos proporcionados.
   * @param {Object} obj - Contenido serializable.
   * @param {string} filename - Nombre de archivo sugerido.
   */
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

  /**
   * Actualiza el mejor fitness visto y registra un log si hay mejora.
   * @param {{fitness:number,generation?:number,chromosome?:number[]}} best - Individuo evaluado.
   * @param {{gaConfig?:Object,fitnessConfig?:Object}} cfgs - Configuraciones asociadas.
   * @returns {void}
   */
  function maybeUpdate(best, cfgs) {
    if (!best || best.fitness == null) return;
    if (state.lastFitness != null && best.fitness <= state.lastFitness) return;
    state.lastFitness = best.fitness;
    if (window.logger) window.logger.info('best_update', { fitness: best.fitness, generation: best.generation, gaConfig: cfgs?.gaConfig, fitnessConfig: cfgs?.fitnessConfig });
  }

  window.bestStore = { init, maybeUpdate, buildPolicy, downloadJson, names };
})();
