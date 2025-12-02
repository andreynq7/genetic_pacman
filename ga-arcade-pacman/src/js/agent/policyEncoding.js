/**
 * policyEncoding.js
 * -----------------
 * Módulo de política basada en cromosomas de pesos para Pac-Man.
 * Convierte un vector de genes en una función de decisión pura que evalúa acciones
 * mediante un score lineal w·f(state, action).
 * No simula episodios ni toca UI; está listo para usar en el GA y en el simulador.
 */
(function() {
  const C = window.gameConstants;
  const LOGIC = window.gameLogic;

  if (!C || !LOGIC) {
    console.warn('policyEncoding: gameConstants/gameLogic no encontrados');
    return;
  }

  // Rango permitido para los genes (pesos)
  const GENE_RANGE = { min: -3, max: 3 };

  // Distancia máxima Manhattan usada para normalizar distancias (ancho + alto del mapa)
  const MAX_NORM_DIST = C.MAP_COLS + C.MAP_ROWS;

  // Pellets iniciales para normalizar progreso global
  const INITIAL_PELLETS = (() => {
    let pellets = 0;
    let power = 0;
    C.LEVEL_MAP.forEach((row) => {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i] === C.TILE_TYPES.PELLET) pellets += 1;
        if (row[i] === C.TILE_TYPES.POWER) power += 1;
      }
    });
    return pellets + power;
  })();

  /**
   * ORDEN Y SIGNIFICADO DE LAS FEATURES (vector fijo)
   *  0: isWall               -> [0,1] 1 si la celda destino es muro (penalizable)
   *  1: isPellet             -> [0,1] 1 si la celda destino tiene pellet normal
   *  2: isPowerPellet        -> [0,1] 1 si la celda destino tiene power pellet
   *  3: keepDirection        -> [0,1] 1 si mantiene la dirección actual
   *  4: uTurn                -> [0,1] 1 si es giro en U respecto a la dirección actual
   *  5: distToPelletNorm     -> [0,1] distancia Manhattan normalizada al pellet más cercano
   *  6: distToGhostNorm      -> [0,1] distancia Manhattan normalizada al fantasma más cercano
   *  7: approachingGhost     -> [0,1] 1 si la acción reduce la distancia al fantasma más cercano
   *  8: fleeingGhost         -> [0,1] 1 si la acción aumenta la distancia al fantasma más cercano
   *  9: localOpenness        -> [0,1] celdas libres (N,S,E,O) desde destino / 4
   * 10: pelletsRemainingFrac -> [0,1] progreso global: pellets restantes / pellets iniciales
   * 11: stepFraction         -> [0,1] steps / stepLimit
   */
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

  const NUM_GENES = FEATURE_NAMES.length;

  /**
   * Genera un cromosoma aleatorio uniforme en el rango permitido.
   * @returns {number[]}
   */
  function createRandomChromosome() {
    return Array.from({ length: NUM_GENES }, () => randInRange(GENE_RANGE.min, GENE_RANGE.max));
  }

  /**
   * Clona un cromosoma (shallow copy).
   * @param {number[]} chromosome
   * @returns {number[]}
   */
  function cloneChromosome(chromosome) {
    return Array.isArray(chromosome) ? chromosome.slice() : [];
  }

  /**
   * Normaliza (clamp) un cromosoma y asegura longitud NUM_GENES.
   * @param {number[]} chromosome
   * @returns {number[]}
   */
  function normalizeChromosome(chromosome) {
    const out = Array.from({ length: NUM_GENES }, (_, idx) => {
      const val = Array.isArray(chromosome) ? Number(chromosome[idx]) : 0;
      return clamp(isFinite(val) ? val : 0, GENE_RANGE.min, GENE_RANGE.max);
    });
    return out;
  }

  /**
   * Extrae el vector de características f(state, action) en el orden definido.
   * No muta el estado. Usa la celda destino como referencia.
   * @param {Object} state GameState actual
   * @param {string} action Acción candidata (gameConstants.ACTIONS)
   * @returns {number[]} features
   */
  function extractFeatures(state, action) {
    const features = new Array(NUM_GENES).fill(0);
    if (!state || !action) return features;

    const dirVec = C.DIR_VECTORS[action] || { col: 0, row: 0 };
    const target = {
      col: state.pacman.col + dirVec.col,
      row: state.pacman.row + dirVec.row
    };

    const tile = safeGetTile(state.map, target.col, target.row);
    const currentGhostDist = nearestGhostDistance(state, state.pacman);
    const candidateGhostDist = nearestGhostDistance(state, target);

    const pelletDist = nearestPelletDistance(state, target);

    features[0] = tile === C.TILE_TYPES.WALL ? 1 : 0;
    features[1] = tile === C.TILE_TYPES.PELLET ? 1 : 0;
    features[2] = tile === C.TILE_TYPES.POWER ? 1 : 0;
    features[3] = action === state.pacman.dir ? 1 : 0;
    features[4] = isUTurn(action, state.pacman.dir) ? 1 : 0;
    features[5] = normalizeDistance(pelletDist);
    features[6] = normalizeDistance(candidateGhostDist);
    features[7] = candidateGhostDist < currentGhostDist ? 1 : 0;
    features[8] = candidateGhostDist > currentGhostDist ? 1 : 0;
    features[9] = localOpenness(state.map, target);
    features[10] = clamp((state.pelletsRemaining ?? 0) / (INITIAL_PELLETS || 1), 0, 1);
    features[11] = clamp((state.steps ?? 0) / (state.stepLimit || 1), 0, 1);

    return features;
  }

  /**
   * Calcula el score lineal w·f para una acción. Penaliza acciones ilegales.
   * @param {number[]} chromosome
   * @param {Object} state
   * @param {string} action
   * @returns {number}
   */
  function evaluateAction(chromosome, state, action) {
    const genes = normalizeChromosome(chromosome);
    if (!isActionLegal(state, action)) {
      return -1e6; // Penalización dura para acciones inválidas
    }
    const feats = extractFeatures(state, action);
    let sum = 0;
    for (let i = 0; i < NUM_GENES; i += 1) {
      sum += genes[i] * feats[i];
    }
    return sum;
  }

  /**
   * Devuelve una policyFn pura derivada del cromosoma.
   * @param {number[]} chromosome
   * @param {{tieBreak?: 'first'|'random'}} [options]
   * @returns {(state:Object)=>string}
   */
  function policyFromChromosome(chromosome, options = {}) {
    const genes = normalizeChromosome(chromosome);
    const tieBreak = options.tieBreak || 'first';

    return function policyFn(state) {
      if (!state) return C.ACTIONS.STAY;
      const legal = getLegalActions(state);
      if (!legal.length) return C.ACTIONS.STAY;

      let bestScore = -Infinity;
      let bestActions = [];
      for (let i = 0; i < legal.length; i += 1) {
        const act = legal[i];
        const score = evaluateAction(genes, state, act);
        if (score > bestScore) {
          bestScore = score;
          bestActions = [act];
        } else if (score === bestScore) {
          bestActions.push(act);
        }
      }

      if (bestActions.length === 1 || tieBreak === 'first') {
        return bestActions[0];
      }
      // Nota: desempate aleatorio usa Math.random; para reproducibilidad controlar seed en otro módulo.
      const idx = Math.floor(Math.random() * bestActions.length);
      return bestActions[idx];
    };
  }

  /**
   * Lista de acciones legales desde el estado actual (usa gameLogic.getValidMoves).
   * @param {Object} state
   * @returns {string[]}
   */
  function getLegalActions(state) {
    if (!state) return [C.ACTIONS.STAY];
    const moves = LOGIC.getValidMoves(state.map, state.pacman.col, state.pacman.row, false) || [];
    if (!moves.length) return [C.ACTIONS.STAY];
    return moves.map((m) => m.action);
  }

  /**
   * Determina si la acción es legal (no atraviesa muros) usando getValidMoves.
   * @param {Object} state
   * @param {string} action
   */
  function isActionLegal(state, action) {
    const legal = getLegalActions(state);
    return legal.includes(action);
  }

  /**
   * Distancia Manhattan al pellet/power más cercano desde una posición.
   * @param {Object} state
   * @param {{col:number,row:number}} pos
   * @returns {number} distancia en celdas (Infinity si no hay pellets)
   */
  function nearestPelletDistance(state, pos) {
    let min = Infinity;
    for (let r = 0; r < C.MAP_ROWS; r += 1) {
      for (let c = 0; c < C.MAP_COLS; c += 1) {
        const cell = state.map[r][c];
        if (cell === C.TILE_TYPES.PELLET || cell === C.TILE_TYPES.POWER) {
          const dist = manhattan(pos.col, pos.row, c, r);
          if (dist < min) min = dist;
        }
      }
    }
    return min;
  }

  /**
   * Distancia Manhattan al fantasma más cercano desde una posición.
   * @param {Object} state
   * @param {{col:number,row:number}} pos
   */
  function nearestGhostDistance(state, pos) {
    if (!state.ghosts || !state.ghosts.length) return Infinity;
    let min = Infinity;
    state.ghosts.forEach((g) => {
      const dist = manhattan(pos.col, pos.row, g.col, g.row);
      if (dist < min) min = dist;
    });
    return min;
  }

  /**
   * Cantidad de vecinos libres alrededor de la celda destino (N,S,E,O)/4.
   * @param {string[][]} map
   * @param {{col:number,row:number}} pos
   * @returns {number} [0,1]
   */
  function localOpenness(map, pos) {
    const dirs = [C.ACTIONS.UP, C.ACTIONS.DOWN, C.ACTIONS.LEFT, C.ACTIONS.RIGHT];
    let free = 0;
    dirs.forEach((act) => {
      const vec = C.DIR_VECTORS[act];
      const col = pos.col + vec.col;
      const row = pos.row + vec.row;
      const tile = safeGetTile(map, col, row);
      if (tile && tile !== C.TILE_TYPES.WALL) free += 1;
    });
    return free / 4;
  }

  // --------------------- Helpers internos ---------------------
  function manhattan(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  function normalizeDistance(dist) {
    if (!isFinite(dist)) return 1; // sin objetivo, considerar lejos
    return clamp(dist / MAX_NORM_DIST, 0, 1);
  }

  function isUTurn(action, currentDir) {
    if (!action || !currentDir) return false;
    switch (action) {
      case C.ACTIONS.UP: return currentDir === C.ACTIONS.DOWN;
      case C.ACTIONS.DOWN: return currentDir === C.ACTIONS.UP;
      case C.ACTIONS.LEFT: return currentDir === C.ACTIONS.RIGHT;
      case C.ACTIONS.RIGHT: return currentDir === C.ACTIONS.LEFT;
      default: return false;
    }
  }

  function randInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function safeGetTile(map, col, row) {
    if (!map) return null;
    if (row < 0 || row >= C.MAP_ROWS || col < 0 || col >= C.MAP_COLS) return null;
    return Array.isArray(map[row]) ? map[row][col] : map[row].charAt(col);
  }

  // API pública
  window.policyEncoding = {
    NUM_GENES,
    FEATURE_NAMES,
    GENE_RANGE,
    createRandomChromosome,
    cloneChromosome,
    normalizeChromosome,
    extractFeatures,
    evaluateAction,
    policyFromChromosome,
    getLegalActions,
    isActionLegal
  };
})();
