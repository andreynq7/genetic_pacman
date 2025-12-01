/**
 * Lógica paso a paso del juego (sin render). Define stepGame(state, action)
 * que devuelve nuevo estado, recompensa y si terminó el episodio.
 * Incluye: penalización por estancamiento y persecución de fantasmas comestibles con A* en modo power.
 */
(function() {
  const C = window.gameConstants;
  const STATE = window.gameState;
  const T = C.TILE_TYPES;
  let powerPathCache = null;

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
    next.lifeLostThisStep = false;
    if (!next.levelSnapshot) {
      STATE.captureLevelSnapshot(next);
    }
    if (next.status !== 'running') {
      return { state: next, reward: 0, done: true, info: { reason: next.status } };
    }

    let reward = C.REWARDS.step;
    next.steps += 1;
    next.stepsSinceLastPellet += 1;
    const events = {
      pelletEaten: false,
      powerPelletEaten: false,
      ghostEatenCount: 0,
      lifeLost: false,
      levelCleared: false,
      returningGhosts: 0,
      ghostsReturned: 0
    };

    const effectiveAction = chooseActionWithOverrides(next, action);

    applyPacmanMove(next, effectiveAction);
    reward += handleConsumables(next, events);
    const stallSteps = next.stepsSinceLastPellet;
    reward += applyStallPenalty(next);
    const hardStop = C.STALL?.HARD_STOP_THRESHOLD;
    if (hardStop && stallSteps >= hardStop) {
      next.status = 'stalled';
    }
    const killStep = C.STALL?.KILL_CHECK_STEP;
    const killScore = C.STALL?.KILL_SCORE_THRESHOLD;
    if (killStep && killScore != null && next.steps >= killStep && next.score <= killScore) {
      next.status = 'killed';
    }

    // Colisión antes del movimiento de fantasmas (por si Pac-Man entra a la casa)
    reward += handleCollisions(next, { checkBeforeGhosts: true }, events);
    if (next.status === 'running') {
      moveGhosts(next, events);
      reward += handleCollisions(next, {}, events);
    }

    updatePowerTimer(next);

    // Si perdi� una vida pero le quedan, respawnea y sigue el episodio.
    if (next.status === 'life_lost' && next.lives > 0) {
      resetAfterLifeLost(next);
    }

    const prevStatus = next.status;
    const done = computeDone(next);
    if (next.status === 'level_cleared' && prevStatus !== 'level_cleared') {
      reward += C.REWARDS.levelClear;
      events.levelCleared = true;
    }
    const info = {
      reason: next.status,
      pelletsRemaining: next.pelletsRemaining,
      lives: next.lives,
      lifeLossCount: next.lifeLossCount || 0,
      lifeLostThisStep: next.lifeLostThisStep || false,
      pelletEaten: events.pelletEaten,
      powerPelletEaten: events.powerPelletEaten,
      ghostEatenCount: events.ghostEatenCount,
      lifeLost: events.lifeLost,
      levelCleared: events.levelCleared
    };
    return { state: next, reward, done, info };
  }

  /**
   * Selecciona la acción efectiva, anulando la acción de la política si hay modo power
   * y fantasmas comestibles, persiguiéndolos con A* en tiempo real.
   * @param {Object} state
   * @param {string} proposedAction
   */
  function chooseActionWithOverrides(state, proposedAction) {
    const ghostOverride = chooseActionChasingGhost(state);
    if (ghostOverride) return ghostOverride;
    return proposedAction;
  }

  // Decide si perseguir un fantasma vulnerable evaluando costo/beneficio y seguridad.
  function chooseActionChasingGhost(state) {
    if (state.powerTimer <= 0) return null;
    const frightenedGhost = getNearestFrightenedGhost(state);
    if (!frightenedGhost) return null;

    const initialPellets = state.initialPellets || state.pelletsRemaining || 1;
    const pelletsFrac = (state.pelletsRemaining / initialPellets);
    const pelletsThreshold = C.BALANCE?.ghostChaseMinPellets ?? 0.15;
    if (pelletsFrac < pelletsThreshold) return null;

    const path = getCachedPowerPath(state, frightenedGhost);
    const pathLen = path ? path.length - 1 : Infinity;
    if (!path || pathLen <= 0) return null;
    if (pathLen >= state.powerTimer) return null;

    const stepCost = Math.abs((C.REWARDS.step || 0) + (C.REWARDS.emptyStep || 0));
    const valueGhost = C.REWARDS.ghostEaten - pathLen * stepCost;
    if (valueGhost <= 0) return null;

    const threatRadius = C.BALANCE?.ghostChaseDangerRadius ?? 3;
    if (!isPathSafeFromLethalGhosts(state, path, threatRadius)) return null;

    const nextStep = path[1];
    return directionFromStep(state.pacman, nextStep);
  }

  function invalidatePowerPathCache() {
    powerPathCache = null;
  }

  function getCachedPowerPath(state, ghost) {
    const interval = C.BALANCE?.powerPathRecalcInterval ?? 2;
    const maxRadius = C.BALANCE?.powerPathMaxRadius ?? Infinity;
    const maxExplored = C.BALANCE?.powerPathMaxExplored ?? Infinity;
    const steps = state.steps || 0;
    const cache = powerPathCache;
    const cacheValid = cache
      && cache.ghostId === ghost.id
      && cache.pelletsRemaining === state.pelletsRemaining
      && cache.start.col === state.pacman.col
      && cache.start.row === state.pacman.row
      && cache.ghostPos.col === ghost.col
      && cache.ghostPos.row === ghost.row
      && (steps - cache.stepComputed) < interval;
    if (cacheValid) {
      state.aStarCacheHits = (state.aStarCacheHits || 0) + 1;
      return cache.path;
    }

    const path = findPathAStar(state, { col: state.pacman.col, row: state.pacman.row }, { col: ghost.col, row: ghost.row }, {
      maxRadius,
      maxExplored
    });
    state.aStarRecalcs = (state.aStarRecalcs || 0) + 1;
    powerPathCache = {
      ghostId: ghost.id,
      pelletsRemaining: state.pelletsRemaining,
      start: { col: state.pacman.col, row: state.pacman.row },
      ghostPos: { col: ghost.col, row: ghost.row },
      path,
      stepComputed: steps
    };
    return path;
  }

  /**
   * Mueve a Pac-Man una celda si es transitable.
   * @param {Object} state
   * @param {string} action
   */
  function applyPacmanMove(state, action) {
    const tryMove = (act) => {
      const dir = C.DIR_VECTORS[act] || C.DIR_VECTORS[C.ACTIONS.STAY];
      const target = { col: state.pacman.col + dir.col, row: state.pacman.row + dir.row };
      if (!isWalkableForPacman(state.map, target.col, target.row)) return false;
      state.pacman.prevCol = state.pacman.col;
      state.pacman.prevRow = state.pacman.row;
      state.pacman.col = target.col;
      state.pacman.row = target.row;
      state.pacman.dir = act;
      state.lastAction = act;
      return true;
    };

    // Intenta la acci�n propuesta; si es inv�lida, mantiene el movimiento anterior si sigue siendo v�lido.
    if (action && tryMove(action)) return;
    if (state.lastAction && state.lastAction !== action) {
      tryMove(state.lastAction);
    }
  }

  /**
   * Procesa pellets y power pellets en la celda actual.
   * @param {Object} state
   * @returns {number} recompensa obtenida en este paso
   */
  function handleConsumables(state, events) {
    const tile = getTile(state.map, state.pacman.col, state.pacman.row);
    let reward = 0;
    if (tile === T.PELLET) {
      setTile(state.map, state.pacman.col, state.pacman.row, T.PATH);
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.pellet;
      reward += C.REWARDS.pellet;
      state.stepsSinceLastPellet = 0;
      invalidatePowerPathCache();
      STATE.captureLevelSnapshot(state);
      if (events) events.pelletEaten = true;
    } else if (tile === T.POWER) {
      setTile(state.map, state.pacman.col, state.pacman.row, T.PATH);
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.powerPellet;
      reward += C.REWARDS.powerPellet;
      state.stepsSinceLastPellet = 0;
      setGhostsFrightened(state);
      invalidatePowerPathCache();
      checkPelletMilestone(state, (extra) => { reward += extra; });
      STATE.captureLevelSnapshot(state);
      if (events) events.powerPelletEaten = true;
    } else if (tile === T.PATH) {
      // Penaliza avanzar a casillas vac�as para priorizar limpiar el mapa.
      state.score += C.REWARDS.emptyStep;
      reward += C.REWARDS.emptyStep;
    }
    if (tile === T.PELLET || tile === T.POWER) {
      checkPelletMilestone(state, (extra) => { reward += extra; });
    }
    return reward;
  }

  function checkPelletMilestone(state, onReward) {
    const thresholdFrac = C.BALANCE?.pelletMilestoneThreshold ?? 0;
    const bonus = C.BALANCE?.pelletMilestoneReward ?? 0;
    if (!thresholdFrac || bonus === 0) return;
    if (state.pelletMilestoneAwarded) return;
    const threshold = Math.ceil(state.initialPellets * thresholdFrac);
    if (threshold <= 0) return;
    if (state.pelletsRemaining <= threshold) {
      state.pelletMilestoneAwarded = true;
      state.score += bonus;
      if (onReward) onReward(bonus);
    }
  }

  /**
   * Penaliza estancamiento si se superó el umbral de pasos sin comer pellet.
   * Reinicia el contador tras aplicar la penalización.
   */
  function applyStallPenalty(state) {
    if (!C.STALL) return 0;
    if (state.stepsSinceLastPellet >= C.STALL.STEP_THRESHOLD) {
      state.stepsSinceLastPellet = 0;
      state.stallCount = (state.stallCount || 0) + 1;
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
  function handleCollisions(state, options = {}, events) {
    if (state.status !== 'running') return 0;
    let reward = 0;
    const pacCol = state.pacman.col;
    const pacRow = state.pacman.row;
    const frightened = state.powerTimer > 0;

    for (let i = 0; i < state.ghosts.length; i += 1) {
      const ghost = state.ghosts[i];
      if (ghost.returningToHome) continue;
      if (ghost.col === pacCol && ghost.row === pacRow) {
        const ghostEdible = (frightened || ghost.frightenedTimer > 0) && !ghost.eatenThisPower;
        if (ghostEdible) {
          reward += C.REWARDS.ghostEaten;
          state.score += C.REWARDS.ghostEaten;
          ghost.eatenThisPower = true;
          sendGhostHome(ghost);
          if (events) events.ghostEatenCount = (events.ghostEatenCount || 0) + 1;
        } else {
          state.lives -= 1;
          state.status = state.lives > 0 ? 'life_lost' : 'game_over';
          reward += C.REWARDS.death;
          state.score += C.REWARDS.death;
          state.lifeLossCount = (state.lifeLossCount || 0) + 1;
          state.lifeLostThisStep = true;
          if (events) events.lifeLost = true;
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
  function moveGhosts(state, events) {
    let returningCount = 0;
    state.ghosts.forEach((ghost) => {
      const options = getValidMoves(state.map, ghost.col, ghost.row, true);
      if (!options.length) return;

      if (ghost.returningToHome) {
        returningCount += 1;
        const nextStep = nextStepToHome(state, ghost);
        if (nextStep) {
          ghost.prevCol = ghost.col;
          ghost.prevRow = ghost.row;
          ghost.col = nextStep.col;
          ghost.row = nextStep.row;
          ghost.dir = directionFromStep({ col: ghost.prevCol, row: ghost.prevRow }, nextStep) || ghost.dir;
        }
        if (ghost.col === (ghost.homeCol ?? ghost.col) && ghost.row === (ghost.homeRow ?? ghost.row)) {
          ghost.returningToHome = false;
          ghost.frightenedTimer = 0;
          ghost.eatenThisPower = false;
          if (events) events.ghostsReturned = (events.ghostsReturned || 0) + 1;
        }
        return;
      }

      const withoutReverse = options.filter((opt) => opt.action !== oppositeDirection(ghost.dir));
      const candidates = withoutReverse.length ? withoutReverse : options;
      const choice = pickGhostMove(state, ghost, candidates);

      ghost.prevCol = ghost.col;
      ghost.prevRow = ghost.row;
      ghost.col = choice.col;
      ghost.row = choice.row;
      ghost.dir = choice.action;

      if (ghost.frightenedTimer > 0) ghost.frightenedTimer -= 1;
    });
    if (events) events.returningGhosts = returningCount;
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
        invalidatePowerPathCache();
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
    if (state.status === 'game_over') {
      return true;
    }
    if (state.status === 'stalled' || state.status === 'killed') {
      return true;
    }
    if (state.steps >= state.stepLimit) {
      state.status = 'step_limit';
      return true;
    }
    return false;
  }

  /**
   * Marca a un fantasma como retornando a su spawn y limpia timers.
   * @param {Object} ghost
   */
  function sendGhostHome(ghost) {
    ghost.returningToHome = true;
    ghost.frightenedTimer = 0;
    ghost.eatenThisPower = true;
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

  function setTile(map, col, row, value) {
    if (!map || row < 0 || row >= C.MAP_ROWS || col < 0 || col >= C.MAP_COLS) return;
    if (!Array.isArray(map[row])) {
      map[row] = String(map[row] ?? '').split('');
    }
    map[row][col] = value;
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
  function findPathAStar(state, start, goal, options = {}) {
    const startKey = key(start.col, start.row);
    const goalKey = key(goal.col, goal.row);
    const open = new Set([startKey]);
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    gScore[startKey] = 0;
    fScore[startKey] = manhattan(start.col, start.row, goal.col, goal.row);
    const goalIsGate = getTile(state.map, goal.col, goal.row) === T.GHOST_GATE;
    let explored = 0;
    const maxExplored = options.maxExplored || Infinity;
    const maxRadius = options.maxRadius || Infinity;

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
        if (tentativeG > maxRadius) return;
        if (tentativeG < (gScore[nKey] ?? Infinity)) {
          cameFrom[nKey] = currentKey;
          gScore[nKey] = tentativeG;
          fScore[nKey] = tentativeG + manhattan(n.col, n.row, goal.col, goal.row);
          open.add(nKey);
        }
      });
      explored += 1;
      if (explored > maxExplored) {
        return null;
      }
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

  function resetAfterLifeLost(state) {
    if (!state.levelSnapshot) {
      STATE.captureLevelSnapshot(state);
    }
    STATE.restoreLevelSnapshot(state);
    state.pacman.col = C.DEFAULTS.pacmanSpawn.col;
    state.pacman.row = C.DEFAULTS.pacmanSpawn.row;
    state.pacman.dir = C.ACTIONS.LEFT;
    state.ghosts = C.DEFAULTS.ghostSpawns.map((pos, idx) => ({
      id: `ghost-${idx + 1}`,
      col: pos.col,
      row: pos.row,
      prevCol: pos.col,
      prevRow: pos.row,
      dir: C.ACTIONS.LEFT,
      frightenedTimer: 0,
      eatenThisPower: false
    }));
    state.status = 'running';
    state.powerTimer = 0;
    state.stepsSinceLastPellet = state.levelSnapshot?.stepsSinceLastPellet ?? 0;
    state.pelletMilestoneAwarded = state.levelSnapshot?.pelletMilestoneAwarded ?? false;
    state.lastAction = state.levelSnapshot?.lastAction ?? state.lastAction;
    invalidatePowerPathCache();
  }

  function powerDurationForLevel(level) {
    const base = C.DEFAULTS.powerDurationSteps;
    const decay = C.DIFFICULTY?.powerDurationDecay ?? 1;
    const min = C.DIFFICULTY?.minPowerDuration ?? 0;
    const lvl = Math.max(1, level);
    const duration = Math.round(base * Math.pow(decay, lvl - 1));
    return Math.max(min, duration);
  }

  function isGhostLethal(state, ghost) {
    return (state.powerTimer <= 0) || (ghost.frightenedTimer <= 0);
  }

  function isPathSafeFromLethalGhosts(state, path, radius) {
    if (!Array.isArray(path) || path.length === 0) return false;
    const r = Math.max(0, radius || 0);
    for (let i = 0; i < path.length; i += 1) {
      const step = path[i];
      for (let g = 0; g < state.ghosts.length; g += 1) {
        const ghost = state.ghosts[g];
        if (isGhostLethal(state, ghost)) {
          const d = manhattan(step.col, step.row, ghost.col, ghost.row);
          if (d <= r) return false;
        }
      }
    }
    return true;
  }

  function nextStepToHome(state, ghost) {
    const home = { col: ghost.homeCol ?? C.DEFAULTS.ghostSpawns[0].col, row: ghost.homeRow ?? C.DEFAULTS.ghostSpawns[0].row };
    if (ghost.col === home.col && ghost.row === home.row) return null;
    const path = findPathAStar(state, { col: ghost.col, row: ghost.row }, home, { maxExplored: C.BALANCE?.powerPathMaxExplored || 500, maxRadius: C.BALANCE?.powerPathMaxRadius || Infinity });
    if (!path || path.length < 2) return null;
    return path[1];
  }


  window.gameLogic = {
    stepGame,
    getValidMoves,
    getRandomAction
  };
})();
