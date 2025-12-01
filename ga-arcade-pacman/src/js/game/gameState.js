/**
 * Estado y utilidades para el entorno de Pac-Man basado en celdas.
 * No depende del render; todo se define sobre el grid y el mapa.
 */
(function() {
  const C = window.gameConstants;
  const T = C.TILE_TYPES;

  /**
   * Convierte un mapa (array de strings o matrix) en matrix mutable.
   * @param {string[]|string[][]} levelMap
   * @returns {string[][]}
   */
  function normalizeLevel(levelMap) {
    const source = levelMap || C.LEVEL_MAP;
    return source.map((row) => Array.isArray(row) ? row.slice() : row.split(''));
  }

  /**
   * Busca la posición de spawn de Pac-Man dentro del mapa.
   * @param {string[][]} matrix
   * @param {{col:number,row:number}} fallback
   * @returns {{col:number,row:number}}
   */
  function findPacmanSpawn(matrix, fallback) {
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (matrix[r][c] === T.PACMAN_SPAWN) {
          return { col: c, row: r };
        }
      }
    }
    return { ...fallback };
  }

  /**
   * Busca spawns para fantasmas; usa casillas G o el fallback.
   * @param {string[][]} matrix
   * @param {Array<{col:number,row:number}>} fallback
   * @returns {Array<{col:number,row:number}>}
   */
  function findGhostSpawns(matrix, fallback) {
    const positions = [];
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (matrix[r][c] === T.GHOST_GATE) {
          positions.push({ col: c, row: r });
        }
      }
    }
    if (positions.length) return positions;
    return fallback.map((p) => ({ ...p }));
  }

  /**
   * Cuenta pellets y power pellets existentes en el mapa.
   * @param {string[][]} matrix
   */
  function countPellets(matrix) {
    let pellets = 0;
    let power = 0;
    matrix.forEach((row) => {
      row.forEach((cell) => {
        if (cell === T.PELLET) pellets += 1;
        if (cell === T.POWER) power += 1;
      });
    });
    return { pellets, power, total: pellets + power };
  }

  /**
   * Crea el estado inicial del episodio.
   * @param {Object} [options]
   * @param {string[]|string[][]} [options.levelMap]
   * @param {{col:number,row:number}} [options.pacmanSpawn]
   * @param {Array<{col:number,row:number}>} [options.ghostSpawns]
   * @param {number} [options.lives]
   * @param {number} [options.stepLimit]
   */
  function createInitialState(options = {}) {
    const matrix = normalizeLevel(options.levelMap);
    const pacSpawn = findPacmanSpawn(matrix, options.pacmanSpawn || C.DEFAULTS.pacmanSpawn);
    const ghostSpawns = findGhostSpawns(matrix, options.ghostSpawns || C.DEFAULTS.ghostSpawns);
    const level = options.level ?? 1;

    // Limpia las marcas de spawn en el mapa para que cuenten como camino.
    if (matrix[pacSpawn.row][pacSpawn.col] === T.PACMAN_SPAWN || matrix[pacSpawn.row][pacSpawn.col] === T.PELLET) {
      matrix[pacSpawn.row][pacSpawn.col] = T.PATH;
    }
    ghostSpawns.forEach((pos) => {
      if (matrix[pos.row][pos.col] === T.GHOST_GATE) {
        // Dejar la puerta visible para render/colisiones, no se elimina.
      }
    });

    const pelletInfo = countPellets(matrix);

    return {
      map: matrix,
      pelletsRemaining: pelletInfo.total,
      initialPellets: pelletInfo.total,
      score: options.score ?? 0,
      lives: options.lives ?? C.DEFAULTS.lives,
      level,
      steps: 0,
      stepLimit: options.stepLimit ?? C.DEFAULTS.stepLimit,
      stepsSinceLastPellet: 0,
      pelletMilestoneAwarded: false,
      status: 'running',
      powerTimer: 0,
      lastAction: C.ACTIONS.LEFT,
      aStarRecalcs: 0,
      aStarCacheHits: 0,
      pacman: {
        col: pacSpawn.col,
        row: pacSpawn.row,
        prevCol: pacSpawn.col,
        prevRow: pacSpawn.row,
        dir: C.ACTIONS.LEFT,
        alive: true
      },
      ghosts: ghostSpawns.map((pos, idx) => ({
        id: `ghost-${idx + 1}`,
        col: pos.col,
        row: pos.row,
        prevCol: pos.col,
        prevRow: pos.row,
        dir: C.ACTIONS.LEFT,
        frightenedTimer: 0,
        eatenThisPower: false
      }))
    };
  }

  /**
   * Clona el estado para ser usado por stepGame sin mutar el original.
   * @param {Object} state
   * @returns {Object}
   */
  function cloneState(state) {
    return {
      map: state.map.map((row) => row.slice()),
      pelletsRemaining: state.pelletsRemaining,
      initialPellets: state.initialPellets,
      score: state.score,
      lives: state.lives,
      level: state.level,
      steps: state.steps,
      stepLimit: state.stepLimit,
      stepsSinceLastPellet: state.stepsSinceLastPellet,
      pelletMilestoneAwarded: state.pelletMilestoneAwarded,
      status: state.status,
      powerTimer: state.powerTimer,
      lastAction: state.lastAction,
      aStarRecalcs: state.aStarRecalcs || 0,
      aStarCacheHits: state.aStarCacheHits || 0,
      pacman: { ...state.pacman },
      ghosts: state.ghosts.map((g) => ({ ...g }))
    };
  }

  window.gameState = {
    createInitialState,
    cloneState,
    normalizeLevel,
    findPacmanSpawn,
    findGhostSpawns,
    countPellets
  };
})();
