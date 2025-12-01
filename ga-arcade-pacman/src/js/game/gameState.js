/**
 * Estado y utilidades para el entorno de Pac-Man basado en celdas.
 * No depende del render; todo se define sobre el grid y el mapa.
 */
(function() {
  const C = window.gameConstants;
  const T = C.TILE_TYPES;

  function cloneMatrix(matrix) {
    // Asegura que cada fila sea mutable (array de chars); convierte strings si llegan sin normalizar.
    return matrix.map((row) => (Array.isArray(row) ? row.slice() : String(row || '').split('')));
  }

  function cloneActors(list) {
    return list.map((g) => ({ ...g }));
  }

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
    const palette = ['red', 'pink', 'blue', 'orange'];

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

    const state = {
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
      lifeLossCount: options.lifeLossCount ?? 0,
      scoreInicialNivel: options.scoreInicialNivel ?? null,
      levelSnapshot: null,
      stallCount: 0,
      lifeLostThisStep: false,
      ghostModeIndex: 0,
      ghostMode: (C.SCATTER_CHASE_SCHEDULE?.[0]?.mode) || C.GHOST_MODES?.SCATTER || 'SCATTER',
      ghostModeTimer: (C.SCATTER_CHASE_SCHEDULE?.[0]?.durationSteps) || 0,
      pacmanSpawn: { ...pacSpawn },
      ghostSpawnPoints: ghostSpawns.map((p) => ({ ...p })),
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
        color: palette[idx % palette.length],
        originalColor: palette[idx % palette.length],
        col: pos.col,
        row: pos.row,
        prevCol: pos.col,
        prevRow: pos.row,
        dir: C.ACTIONS.LEFT,
        frightenedTimer: 0,
        eatenThisPower: false,
        returningToHome: false,
        waitingToRespawn: false,
        respawnReleaseStep: null,
        eyeBlinkStartStep: 0,
        eyeState: false,
        homeCol: pos.col,
        homeRow: pos.row,
        mode: (C.SCATTER_CHASE_SCHEDULE?.[0]?.mode) || C.GHOST_MODES?.SCATTER || 'SCATTER',
        speed: 1,
        cornerCol: (C.GHOST_CORNERS?.[palette[idx % palette.length]]?.col) ?? pos.col,
        cornerRow: (C.GHOST_CORNERS?.[palette[idx % palette.length]]?.row) ?? pos.row
      }))
    };

    // Guarda snapshot y score de arranque del nivel para reintentos tras perder vida.
    captureLevelSnapshot(state);
    state.scoreInicialNivel = state.score;
    return state;
  }

  /**
   * Clona el estado para ser usado por stepGame sin mutar el original.
   * @param {Object} state
   * @returns {Object}
   */
  function cloneState(state) {
    return {
      map: cloneMatrix(state.map),
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
      lifeLossCount: state.lifeLossCount || 0,
      scoreInicialNivel: state.scoreInicialNivel ?? null,
      ghostModeIndex: state.ghostModeIndex ?? 0,
      ghostMode: state.ghostMode ?? (C.GHOST_MODES?.SCATTER || 'SCATTER'),
      ghostModeTimer: state.ghostModeTimer ?? 0,
      levelSnapshot: state.levelSnapshot ? {
        map: cloneMatrix(state.levelSnapshot.map),
        pacman: { ...state.levelSnapshot.pacman },
        ghosts: cloneActors(state.levelSnapshot.ghosts),
        pelletsRemaining: state.levelSnapshot.pelletsRemaining,
        initialPellets: state.levelSnapshot.initialPellets,
        pelletMilestoneAwarded: state.levelSnapshot.pelletMilestoneAwarded,
        lastAction: state.levelSnapshot.lastAction,
        powerTimer: state.levelSnapshot.powerTimer ?? 0,
        stepsSinceLastPellet: state.levelSnapshot.stepsSinceLastPellet ?? 0,
        pacmanSpawn: state.levelSnapshot.pacmanSpawn ? { ...state.levelSnapshot.pacmanSpawn } : null,
        ghostSpawnPoints: state.levelSnapshot.ghostSpawnPoints
          ? state.levelSnapshot.ghostSpawnPoints.map((p) => ({ ...p }))
          : null
      } : null,
      lifeLostThisStep: false,
      pacman: { ...state.pacman },
      pacmanSpawn: state.pacmanSpawn ? { ...state.pacmanSpawn } : null,
      ghostSpawnPoints: state.ghostSpawnPoints ? state.ghostSpawnPoints.map((p) => ({ ...p })) : null,
      ghosts: state.ghosts.map((g) => ({ ...g }))
    };
  }

  function captureLevelSnapshot(state) {
    state.levelSnapshot = {
      map: cloneMatrix(state.map),
      pacman: { ...state.pacman },
      ghosts: cloneActors(state.ghosts),
      pelletsRemaining: state.pelletsRemaining,
      initialPellets: state.initialPellets,
      pelletMilestoneAwarded: state.pelletMilestoneAwarded,
      lastAction: state.lastAction,
      powerTimer: 0,
      stepsSinceLastPellet: 0,
      pacmanSpawn: state.pacmanSpawn ? { ...state.pacmanSpawn } : null,
      ghostSpawnPoints: state.ghostSpawnPoints ? state.ghostSpawnPoints.map((p) => ({ ...p })) : null,
      score: state.score,
      steps: state.steps
    };
    if (state.scoreInicialNivel == null) {
      state.scoreInicialNivel = state.score;
    }
    return state.levelSnapshot;
  }

  function restoreLevelSnapshot(state) {
    if (!state.levelSnapshot) return;
    const snap = state.levelSnapshot;
    state.map = cloneMatrix(snap.map);
    state.pacman = { ...snap.pacman };
    state.ghosts = cloneActors(snap.ghosts);
    state.pelletsRemaining = snap.pelletsRemaining;
    state.initialPellets = snap.initialPellets;
    state.pelletMilestoneAwarded = snap.pelletMilestoneAwarded;
    state.lastAction = snap.lastAction;
    state.powerTimer = snap.powerTimer ?? 0;
    state.stepsSinceLastPellet = snap.stepsSinceLastPellet ?? 0;
    if (snap.pacmanSpawn) {
      state.pacmanSpawn = { ...snap.pacmanSpawn };
    }
    if (snap.ghostSpawnPoints) {
      state.ghostSpawnPoints = snap.ghostSpawnPoints.map((p) => ({ ...p }));
    }
    if (snap.steps != null) {
      state.steps = snap.steps;
    }
    if (snap.score != null) {
      state.score = snap.score;
    }
  }

  window.gameState = {
    createInitialState,
    cloneState,
    normalizeLevel,
    findPacmanSpawn,
    findGhostSpawns,
    countPellets,
    captureLevelSnapshot,
    restoreLevelSnapshot
  };
})();
