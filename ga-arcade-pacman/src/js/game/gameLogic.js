/**
 * Lógica paso a paso del juego (sin render). Define stepGame(state, action)
 * que devuelve nuevo estado, recompensa y si terminó el episodio.
 */
(function() {
  const C = window.gameConstants;
  const STATE = window.gameState;
  const T = C.TILE_TYPES;

  /**
   * Ejecuta un paso de simulación discreto.
   * @param {Object} state Estado actual (no se muta; se clona dentro).
   * @param {string} action Acción discreta (gameConstants.ACTIONS).
   * @returns {{state:Object,reward:number,done:boolean,info:Object}}
   */
  function stepGame(state, action) {
    const next = STATE.cloneState(state);
    if (next.status !== 'running') {
      return { state: next, reward: 0, done: true, info: { reason: next.status } };
    }

    let reward = C.REWARDS.step;
    next.steps += 1;

    applyPacmanMove(next, action);
    reward += handleConsumables(next);

    // Colisión antes del movimiento de fantasmas (por si Pac-Man entra a la casa)
    reward += handleCollisions(next, { checkBeforeGhosts: true });
    if (next.status === 'running') {
      moveGhosts(next);
      reward += handleCollisions(next);
    }

    updatePowerTimer(next);

    const prevStatus = next.status;
    const done = computeDone(next);
    if (next.status === 'level_cleared' && prevStatus !== 'level_cleared') {
      reward += C.REWARDS.levelClear;
    }
    const info = { reason: next.status, pelletsRemaining: next.pelletsRemaining, lives: next.lives };
    return { state: next, reward, done, info };
  }

  /**
   * Mueve a Pac-Man una celda si es transitable.
   * @param {Object} state
   * @param {string} action
   */
  function applyPacmanMove(state, action) {
    const dir = C.DIR_VECTORS[action] || C.DIR_VECTORS[C.ACTIONS.STAY];
    const target = { col: state.pacman.col + dir.col, row: state.pacman.row + dir.row };
    if (isWalkableForPacman(state.map, target.col, target.row)) {
      state.pacman.col = target.col;
      state.pacman.row = target.row;
      state.pacman.dir = action;
      state.lastAction = action;
    }
  }

  /**
   * Procesa pellets y power pellets en la celda actual.
   * @param {Object} state
   * @returns {number} recompensa obtenida en este paso
   */
  function handleConsumables(state) {
    const tile = getTile(state.map, state.pacman.col, state.pacman.row);
    let reward = 0;
    if (tile === T.PELLET) {
      state.map[state.pacman.row][state.pacman.col] = T.PATH;
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.pellet;
      reward += C.REWARDS.pellet;
    } else if (tile === T.POWER) {
      state.map[state.pacman.row][state.pacman.col] = T.PATH;
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.powerPellet;
      reward += C.REWARDS.powerPellet;
      setGhostsFrightened(state);
    }
    return reward;
  }

  /**
   * Colisiones Pac-Man vs fantasmas.
   * @param {Object} state
   * @param {{checkBeforeGhosts?:boolean}} [options]
   * @returns {number} recompensa asociada a la colisión
   */
  function handleCollisions(state, options = {}) {
    if (state.status !== 'running') return 0;
    let reward = 0;
    const pacCol = state.pacman.col;
    const pacRow = state.pacman.row;
    const frightened = state.powerTimer > 0;

    for (let i = 0; i < state.ghosts.length; i += 1) {
      const ghost = state.ghosts[i];
      if (ghost.col === pacCol && ghost.row === pacRow) {
        if (frightened || ghost.frightenedTimer > 0) {
          reward += C.REWARDS.ghostEaten;
          state.score += C.REWARDS.ghostEaten;
          respawnGhost(ghost);
        } else {
          state.lives -= 1;
          state.status = state.lives > 0 ? 'life_lost' : 'game_over';
          reward += C.REWARDS.death;
          break;
        }
      }
    }

    return reward;
  }

  /**
   * Movimiento simple de fantasmas: selecciona un vecino transitable.
   * @param {Object} state
   */
  function moveGhosts(state) {
    state.ghosts.forEach((ghost) => {
      const options = getValidMoves(state.map, ghost.col, ghost.row, true);
      if (!options.length) return;

      const withoutReverse = options.filter((opt) => opt.action !== oppositeDirection(ghost.dir));
      const candidates = withoutReverse.length ? withoutReverse : options;
      const choice = candidates[Math.floor(Math.random() * candidates.length)];

      ghost.col = choice.col;
      ghost.row = choice.row;
      ghost.dir = choice.action;

      if (ghost.frightenedTimer > 0) ghost.frightenedTimer -= 1;
    });
  }

  /**
   * Devuelve movimientos válidos desde una celda.
   * @param {string[][]} map
   * @param {number} col
   * @param {number} row
   * @param {boolean} allowGate
   */
  function getValidMoves(map, col, row, allowGate = false) {
    const moves = [];
    Object.entries(C.DIR_VECTORS).forEach(([action, vec]) => {
      const target = { col: col + vec.col, row: row + vec.row };
      if (isWalkable(map, target.col, target.row, allowGate)) {
        moves.push({ action, col: target.col, row: target.row });
      }
    });
    return moves;
  }

  /**
   * Marca a los fantasmas como asustados por power pellet.
   * @param {Object} state
   */
  function setGhostsFrightened(state) {
    state.powerTimer = C.DEFAULTS.powerDurationSteps;
    state.ghosts.forEach((ghost) => {
      ghost.frightenedTimer = C.DEFAULTS.powerDurationSteps;
    });
  }

  /**
   * Resta el temporizador global de power pellet.
   * @param {Object} state
   */
  function updatePowerTimer(state) {
    if (state.powerTimer > 0) {
      state.powerTimer -= 1;
    }
  }

  /**
   * Determina si el episodio terminó.
   * @param {Object} state
   */
  function computeDone(state) {
    if (state.pelletsRemaining <= 0) {
      if (state.status !== 'level_cleared') {
        state.score += C.REWARDS.levelClear;
      }
      state.status = 'level_cleared';
      return true;
    }
    if (state.status === 'game_over' || state.status === 'life_lost') {
      return true;
    }
    if (state.steps >= state.stepLimit) {
      state.status = 'step_limit';
      return true;
    }
    return false;
  }

  /**
   * Respawnea un fantasma en la casa central.
   * @param {Object} ghost
   */
  function respawnGhost(ghost) {
    const spawn = C.DEFAULTS.ghostSpawns[0];
    ghost.col = spawn.col;
    ghost.row = spawn.row;
    ghost.frightenedTimer = 0;
    ghost.dir = C.ACTIONS.LEFT;
  }

  function isWalkable(map, col, row, allowGate) {
    const tile = getTile(map, col, row);
    if (tile === null) return false;
    if (tile === T.WALL) return false;
    if (!allowGate && tile === T.GHOST_GATE) return false;
    return true;
  }

  function isWalkableForPacman(map, col, row) {
    return isWalkable(map, col, row, false);
  }

  function getTile(map, col, row) {
    if (row < 0 || row >= C.MAP_ROWS || col < 0 || col >= C.MAP_COLS) return null;
    return map[row][col];
  }

  function oppositeDirection(action) {
    switch (action) {
      case C.ACTIONS.UP: return C.ACTIONS.DOWN;
      case C.ACTIONS.DOWN: return C.ACTIONS.UP;
      case C.ACTIONS.LEFT: return C.ACTIONS.RIGHT;
      case C.ACTIONS.RIGHT: return C.ACTIONS.LEFT;
      default: return C.ACTIONS.STAY;
    }
  }

  /**
   * Devuelve una acción aleatoria válida para Pac-Man.
   * @param {Object} state
   */
  function getRandomAction(state) {
    const moves = getValidMoves(state.map, state.pacman.col, state.pacman.row, false);
    if (!moves.length) return C.ACTIONS.STAY;
    const choice = moves[Math.floor(Math.random() * moves.length)];
    return choice.action;
  }

  window.gameLogic = {
    stepGame,
    getValidMoves,
    getRandomAction
  };
})();
