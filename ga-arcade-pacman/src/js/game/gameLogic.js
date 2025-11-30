/**
 * Lógica paso a paso del juego (sin render). Define stepGame(state, action)
 * que devuelve nuevo estado, recompensa y si terminó el episodio.
 * Incluye: penalización por estancamiento y persecución de fantasmas comestibles con A* en modo power.
 */
(function() {
  const C = window.gameConstants;
  const STATE = window.gameState;
  const T = C.TILE_TYPES;

  /**
   * Ejecuta un paso de simulación discreto.
   * Nota: la acción propuesta puede ser anulada en modo power para perseguir
   * fantasmas comestibles con A* en tiempo real.
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
    next.stepsSinceLastPellet += 1;

    const effectiveAction = chooseActionWithPower(next, action);

    applyPacmanMove(next, effectiveAction);
    reward += handleConsumables(next);
    reward += applyStallPenalty(next);

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
   * Selecciona la acción efectiva, anulando la acción de la política si hay modo power
   * y fantasmas comestibles, persiguiéndolos con A* en tiempo real.
   * @param {Object} state
   * @param {string} proposedAction
   */
  function chooseActionWithPower(state, proposedAction) {
    if (state.powerTimer <= 0) return proposedAction;
    const frightenedGhost = getNearestFrightenedGhost(state);
    if (!frightenedGhost) return proposedAction;

    const minProgress = C.BALANCE?.powerChaseMinProgress ?? 0;
    const maxPath = C.BALANCE?.powerChaseMaxPath ?? Infinity;
    const initialPellets = state.initialPellets || state.pelletsRemaining || 1;
    const progress = 1 - (state.pelletsRemaining / initialPellets);

    const path = findPathAStar(state, { col: state.pacman.col, row: state.pacman.row }, { col: frightenedGhost.col, row: frightenedGhost.row });
    const pathLen = path ? path.length - 1 : Infinity;
    const shouldChase = progress >= minProgress && pathLen <= maxPath;

    if (shouldChase && path && path.length > 1) {
      const nextStep = path[1];
      const actionFromPath = directionFromStep(state.pacman, nextStep);
      if (actionFromPath) return actionFromPath;
    }
    return proposedAction;
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
      state.stepsSinceLastPellet = 0;
    } else if (tile === T.POWER) {
      state.map[state.pacman.row][state.pacman.col] = T.PATH;
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.powerPellet;
      reward += C.REWARDS.powerPellet;
      state.stepsSinceLastPellet = 0;
      setGhostsFrightened(state);
    }
    return reward;
  }

  /**
   * Penaliza estancamiento si se superó el umbral de pasos sin comer pellet.
   * Reinicia el contador tras aplicar la penalización.
   */
  function applyStallPenalty(state) {
    if (!C.STALL) return 0;
    if (state.stepsSinceLastPellet >= C.STALL.STEP_THRESHOLD) {
      state.stepsSinceLastPellet = 0;
      state.score += C.STALL.PENALTY;
      return C.STALL.PENALTY;
    }
    return 0;
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
        const ghostEdible = (frightened || ghost.frightenedTimer > 0) && !ghost.eatenThisPower;
        if (ghostEdible) {
          reward += C.REWARDS.ghostEaten;
          state.score += C.REWARDS.ghostEaten;
          ghost.eatenThisPower = true;
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
      const choice = pickGhostMove(state, ghost, candidates);

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
    const duration = powerDurationForLevel(state.level || 1);
    state.powerTimer = duration;
    state.ghosts.forEach((ghost) => {
      ghost.frightenedTimer = duration;
      ghost.eatenThisPower = false;
    });
  }

  /**
   * Resta el temporizador global de power pellet.
   * @param {Object} state
   */
  function updatePowerTimer(state) {
    if (state.powerTimer > 0) {
      state.powerTimer -= 1;
      if (state.powerTimer <= 0) {
        // Al expirar, los fantasmas recuperan letalidad total en siguiente power.
        state.ghosts.forEach((ghost) => {
          ghost.eatenThisPower = false;
          ghost.frightenedTimer = 0;
        });
      }
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
    // Mantiene eatenThisPower en true para seguir siendo letal durante el power restante.
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

  /**
   * Encuentra el fantasma comestible más cercano (por distancia Manhattan).
   * @param {Object} state
   */
  function getNearestFrightenedGhost(state) {
    if (!state.ghosts?.length || state.powerTimer <= 0) return null;
    let best = null;
    let bestDist = Infinity;
    state.ghosts.forEach((ghost) => {
      if (ghost.frightenedTimer > 0) {
        const dist = manhattan(state.pacman.col, state.pacman.row, ghost.col, ghost.row);
        if (dist < bestDist) {
          bestDist = dist;
          best = ghost;
        }
      }
    });
    return best;
  }

  /**
   * Aplica A* sobre el grid actual para encontrar un camino al objetivo.
   * @param {Object} state
   * @param {{col:number,row:number}} start
   * @param {{col:number,row:number}} goal
   * @returns {Array<{col:number,row:number}>|null}
   */
  function findPathAStar(state, start, goal) {
    const startKey = key(start.col, start.row);
    const goalKey = key(goal.col, goal.row);
    const open = new Set([startKey]);
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    gScore[startKey] = 0;
    fScore[startKey] = manhattan(start.col, start.row, goal.col, goal.row);
    const goalIsGate = getTile(state.map, goal.col, goal.row) === T.GHOST_GATE;

    while (open.size > 0) {
      const currentKey = lowestF(open, fScore);
      const [cc, cr] = currentKey.split(',').map(Number);
      if (currentKey === goalKey) {
        return reconstructPath(cameFrom, currentKey);
      }

      open.delete(currentKey);
      const neighbors = getValidMoves(state.map, cc, cr, goalIsGate);
      neighbors.forEach((n) => {
        const nKey = key(n.col, n.row);
        const tentativeG = (gScore[currentKey] ?? Infinity) + 1;
        if (tentativeG < (gScore[nKey] ?? Infinity)) {
          cameFrom[nKey] = currentKey;
          gScore[nKey] = tentativeG;
          fScore[nKey] = tentativeG + manhattan(n.col, n.row, goal.col, goal.row);
          open.add(nKey);
        }
      });
    }
    return null;
  }

  function reconstructPath(cameFrom, currentKey) {
    const path = [currentKey];
    let cur = currentKey;
    while (cameFrom[cur]) {
      cur = cameFrom[cur];
      path.unshift(cur);
    }
    return path.map((k) => {
      const [c, r] = k.split(',').map(Number);
      return { col: c, row: r };
    });
  }

  function lowestF(open, fScore) {
    let bestKey = null;
    let bestVal = Infinity;
    open.forEach((k) => {
      const val = fScore[k] ?? Infinity;
      if (val < bestVal) {
        bestVal = val;
        bestKey = k;
      }
    });
    return bestKey;
  }

  function key(col, row) {
    return `${col},${row}`;
  }

  function manhattan(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  // Selecciona un movimiento de fantasma con sesgo creciente a perseguir a Pac-Man seg�n nivel.
  function pickGhostMove(state, ghost, candidates) {
    if (!candidates.length) return { ...ghost, action: C.ACTIONS.STAY };
    // Si est� asustado, mantiene movimiento aleatorio para facilitar comerlo.
    if (ghost.frightenedTimer > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const level = state.level || 1;
    const prob = ghostChaseProbability(level);
    if (Math.random() < prob) {
      let best = candidates[0];
      let bestDist = manhattan(candidates[0].col, candidates[0].row, state.pacman.col, state.pacman.row);
      for (let i = 1; i < candidates.length; i += 1) {
        const d = manhattan(candidates[i].col, candidates[i].row, state.pacman.col, state.pacman.row);
        if (d < bestDist) {
          bestDist = d;
          best = candidates[i];
        }
      }
      return best;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function ghostChaseProbability(level) {
    const base = C.DIFFICULTY?.ghostChaseBase ?? 0;
    const growth = C.DIFFICULTY?.ghostChaseGrowth ?? 0;
    const max = C.DIFFICULTY?.ghostChaseMax ?? 1;
    const prob = base + (Math.max(1, level) - 1) * growth;
    return Math.min(max, Math.max(0, prob));
  }

  function directionFromStep(from, to) {
    const dc = to.col - from.col;
    const dr = to.row - from.row;
    if (dc === 0 && dr === -1) return C.ACTIONS.UP;
    if (dc === 0 && dr === 1) return C.ACTIONS.DOWN;
    if (dc === -1 && dr === 0) return C.ACTIONS.LEFT;
    if (dc === 1 && dr === 0) return C.ACTIONS.RIGHT;
    return null;
  }

  function powerDurationForLevel(level) {
    const base = C.DEFAULTS.powerDurationSteps;
    const decay = C.DIFFICULTY?.powerDurationDecay ?? 1;
    const min = C.DIFFICULTY?.minPowerDuration ?? 0;
    const lvl = Math.max(1, level);
    const duration = Math.round(base * Math.pow(decay, lvl - 1));
    return Math.max(min, duration);
  }

  window.gameLogic = {
    stepGame,
    getValidMoves,
    getRandomAction
  };
})();
