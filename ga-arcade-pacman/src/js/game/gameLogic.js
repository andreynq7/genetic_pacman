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
  const STEP_MS = (C?.TIMING?.stepDurationMs) || 100;
  const RESPAWN_WAIT_STEPS = Math.max(1, C.GHOST_RESPAWN_STEPS || Math.round(((C.TIMING?.ghostRespawnMs) || 3000) / STEP_MS));

  function cloneActors(list) {
    return (list || []).map((g) => ({ ...g }));
  }

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
    if (next.status === 'respawning' || next.status === 'life_lost') {
      const info = processRespawnCountdown(next);
      return { state: next, reward: 0, done: false, info };
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
    updatePhysicsForActor(next.pacman);
    reward += handleConsumables(next, events);
    const stallSteps = next.stepsSinceLastPellet;
    reward += applyStallPenalty(next);
    updateGhostPen(next);
    updateGhostSpawns(next, events);
    updateGhostModes(next);
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
      next.ghosts.forEach(updatePhysicsForActor);
      reward += handleCollisions(next, {}, events);
    }

    updatePowerTimer(next);

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
      respawnTimerSteps: next.respawnTimerSteps ?? 0,
      pelletEaten: events.pelletEaten,
      powerPelletEaten: events.powerPelletEaten,
      ghostEatenCount: events.ghostEatenCount,
      returningGhosts: events.returningGhosts || 0,
      ghostsReturned: events.ghostsReturned || 0,
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
      state.mapDirty = true;
      state.stepsSinceLastPellet = 0;
      invalidatePowerPathCache();
      STATE.captureLevelSnapshot(state);
      if (events) events.pelletEaten = true;
    } else if (tile === T.POWER) {
      setTile(state.map, state.pacman.col, state.pacman.row, T.PATH);
      state.pelletsRemaining -= 1;
      state.score += C.REWARDS.powerPellet;
      reward += C.REWARDS.powerPellet;
      state.mapDirty = true;
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

    const usePhysics = !!(state.pacman?.fx);
    const ts = C.TILE_SIZE;
    const half = ts * 0.45;
    const dt = C.TIMING.stepDurationMs || 100;

    const getBounds = (actor) => {
      if (usePhysics && actor?.fx) {
        const cx = actor.fx.x + actor.fx.vx * dt;
        const cy = actor.fx.y + actor.fx.vy * dt;
        return { l: cx - half, t: cy - half, r: cx + half, b: cy + half };
      }
      const cx = actor.col * ts + ts / 2;
      const cy = actor.row * ts + ts / 2;
      return { l: cx - half, t: cy - half, r: cx + half, b: cy + half };
    };

    const intersects = (a, b) => !(a.r < b.l || a.l > b.r || a.b < b.t || a.t > b.b);

    const pacBounds = getBounds(state.pacman);
    for (let i = 0; i < state.ghosts.length; i += 1) {
      const ghost = state.ghosts[i];
      if (ghost.returningToHome || ghost.waitingToRespawn || ghost.eyeState) continue;
      const hit = intersects(getBounds(ghost), pacBounds);
      if (hit) {
        const ghostEdible = (frightened || ghost.frightenedTimer > 0) && !ghost.eatenThisPower;
        if (ghostEdible) {
          reward += C.REWARDS.ghostEaten;
          state.score += C.REWARDS.ghostEaten;
          ghost.eatenThisPower = true;
          sendGhostHome(state, ghost);
          if (events) events.ghostEatenCount = (events.ghostEatenCount || 0) + 1;
        } else {
          state.lives -= 1;
          state.status = state.lives > 0 ? 'life_lost' : 'game_over';
          state.respawnTimerSteps = state.lives > 0 ? (C.RESPAWN_DELAY_STEPS || 1) : 0;
          state.pacman.alive = state.lives > 0 ? false : state.pacman.alive;
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

  function processRespawnCountdown(state) {
    const delay = C.RESPAWN_DELAY_STEPS || 1;
    const current = (state.respawnTimerSteps == null || state.respawnTimerSteps <= 0) ? delay : state.respawnTimerSteps;
    state.respawnTimerSteps = Math.max(0, current - 1);
    const info = {
      reason: state.respawnTimerSteps <= 0 ? 'running' : 'life_lost',
      lives: state.lives,
      lifeLost: true,
      respawnTimerSteps: state.respawnTimerSteps
    };
    if (state.respawnTimerSteps <= 0) {
      resetAfterLifeLost(state);
      state.status = 'running';
      state.pacman.alive = true;
      info.reason = 'running';
    } else {
      state.status = 'life_lost';
      state.pacman.alive = false;
    }
    return info;
  }

  /**
   * Movimiento simple de fantasmas: selecciona un vecino transitable.
   * @param {Object} state
   */
  function moveGhosts(state, events) {
    let returningCount = 0;
    state.ghosts.forEach((ghost) => {
      if (ghost.waitingToRespawn) {
        returningCount += 1;
        if (ghost.respawnReleaseStep == null) {
          ghost.respawnReleaseStep = (state.steps || 0) + RESPAWN_WAIT_STEPS;
        }
        if ((state.steps || 0) >= (ghost.respawnReleaseStep || 0)) {
          releaseGhostFromHome(state, ghost);
        }
        return;
      }

      if (ghost.returningToHome) {
        returningCount += 1;
        const home = getGhostHome(ghost);
        const nextStep = nextStepToHome(state, ghost);
        if (nextStep) {
          ghost.prevCol = ghost.col;
          ghost.prevRow = ghost.row;
          ghost.col = nextStep.col;
          ghost.row = nextStep.row;
          ghost.dir = directionFromStep({ col: ghost.prevCol, row: ghost.prevRow }, nextStep) || ghost.dir;
          ghost.lastMoveStep = state.steps || 0;
          if (window.debugGhostLogic && (window.debugGhostLogicVerbose || ((state.steps || 0) % 10 === 0))) {
            console.log('[ghost-logic] return move', { id: ghost.id, from: { c: ghost.prevCol, r: ghost.prevRow }, to: { c: ghost.col, r: ghost.row }, dir: ghost.dir });
          }
        } else if (ghost.col !== home.col || ghost.row !== home.row) {
          ghost.prevCol = ghost.col;
          ghost.prevRow = ghost.row;
          ghost.col = home.col;
          ghost.row = home.row;
          ghost.dir = C.ACTIONS.LEFT;
          ghost.lastMoveStep = state.steps || 0;
          if (window.debugGhostLogic && (window.debugGhostLogicVerbose || ((state.steps || 0) % 10 === 0))) {
            console.log('[ghost-logic] snap home', { id: ghost.id, to: { c: ghost.col, r: ghost.row } });
          }
        }
        if (ghost.col === home.col && ghost.row === home.row) {
          startGhostRespawnWait(state, ghost, events);
        }
        return;
      }

      const options = getValidMoves(state.map, ghost.col, ghost.row, true);
      if (!options.length) return;

      if (!ghostShouldMove(state, ghost)) {
        if (ghost.frightenedTimer > 0) ghost.frightenedTimer -= 1;
        return;
      }

      const forwardVec = C.DIR_VECTORS[ghost.dir] || C.DIR_VECTORS[C.ACTIONS.STAY];
      const forwardCell = { col: ghost.col + forwardVec.col, row: ghost.row + forwardVec.row };
      const canForward = isWalkable(state.map, forwardCell.col, forwardCell.row, true);
      const intersection = isIntersection(state.map, ghost.col, ghost.row, ghost.dir);

      let nextCell = null;
      if (isFrightenedState(ghost)) {
        ghost.mode = C.GHOST_MODES.FRIGHTENED;
        const choice = chooseFrightenedMove(state, ghost, options);
        if (choice) {
          nextCell = { col: choice.col, row: choice.row };
          ghost.dir = choice.action;
        }
      } else if (canForward && !intersection) {
        nextCell = forwardCell;
      } else {
        const target = computeGhostTarget(state, ghost);
        const path = findGhostPath(state, ghost, target);
        if (path && path.length >= 2) {
          const step1 = path[1];
          if (directionFromStep({ col: ghost.col, row: ghost.row }, step1) !== oppositeDirection(ghost.dir)) {
            nextCell = step1;
          }
        }
        if (!nextCell) {
          const withoutReverse = options.filter((opt) => opt.action !== oppositeDirection(ghost.dir));
          const candidates = withoutReverse.length ? withoutReverse : options;
          const choice = pickGhostMove(state, ghost, candidates);
          nextCell = { col: choice.col, row: choice.row };
          ghost.dir = choice.action;
        }
      }

      ghost.prevCol = ghost.col;
      ghost.prevRow = ghost.row;
      ghost.col = nextCell.col;
      ghost.row = nextCell.row;
      const newDir = directionFromStep({ col: ghost.prevCol, row: ghost.prevRow }, nextCell);
      if (newDir) ghost.dir = newDir;
      ghost.lastMoveStep = state.steps || 0;
      if (window.debugGhostLogic && (window.debugGhostLogicVerbose || ((state.steps || 0) % 10 === 0))) {
        console.log('[ghost-logic] move', { id: ghost.id, from: { c: ghost.prevCol, r: ghost.prevRow }, to: { c: ghost.col, r: ghost.row }, dir: ghost.dir, fright: ghost.frightenedTimer, speed: ghost.speedFactor });
      }

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

  function isIntersection(map, col, row, currentDir) {
    const options = getValidMoves(map, col, row, true);
    const withoutReverse = options.filter((opt) => opt.action !== oppositeDirection(currentDir));
    return withoutReverse.length > 1;
  }

  function ghostShouldMove(state, ghost) {
    if (ghost.waitingToRespawn) return false;
    updateGhostSpeedTowardsTarget(ghost);
    ghost.moveAccumulator = (ghost.moveAccumulator || 0) + (ghost.speedFactor || 1);
    if (ghost.moveAccumulator >= 1) {
      ghost.moveAccumulator -= 1;
      return true;
    }
    return false;
  }

  function updatePhysicsForActor(actor) {
    if (!actor) return;
    const ts = C.TILE_SIZE;
    const dt = C.TIMING.stepDurationMs || 100;
    const prevX = (actor.prevCol ?? actor.col) * ts + ts / 2;
    const prevY = (actor.prevRow ?? actor.row) * ts + ts / 2;
    const curX = actor.col * ts + ts / 2;
    const curY = actor.row * ts + ts / 2;
    actor.fx = actor.fx || { x: curX, y: curY, vx: 0, vy: 0, ax: 0, ay: 0, size: ts };
    actor.fx.x = prevX;
    actor.fx.y = prevY;
    actor.fx.vx = (curX - prevX) / dt;
    actor.fx.vy = (curY - prevY) / dt;
    actor.fx.size = ts;
  }

  function updateGhostSpawns(state, events) {
    if (!state.pendingGhosts || !state.pendingGhosts.length) return;
    state.nextGhostSpawnSteps = (state.nextGhostSpawnSteps ?? state.ghostSpawnIntervalSteps ?? 1) - 1;
    if (state.nextGhostSpawnSteps > 0) return;
    if (hasGhostContainer(state)) {
      scheduleGhostExit(state, events);
    } else {
      spawnNextGhost(state, events);
    }
    state.nextGhostSpawnSteps = state.pendingGhosts.length ? (state.ghostSpawnIntervalSteps || 1) : 0;
  }

  function hasGhostContainer(state) {
    const cells = state.ghostContainerCells || state.levelSnapshot?.ghostContainerCells || [];
    if (Array.isArray(cells) && cells.length > 0) return true;
    return Array.isArray(state.ghostPen) && state.ghostPen.length > 0;
  }

  function scheduleGhostExit(state, events) {
    if (!state.pendingGhosts || !state.pendingGhosts.length) return;
    const next = state.pendingGhosts.shift();
    if (!next) return;
    prepareGhostForExit(state, next);
    if (!Array.isArray(state.ghostPen)) state.ghostPen = [];
    if (!state.ghostPen.find((g) => g.id === next.id)) {
      state.ghostPen.push(next);
    }
    if (events) events.returningGhosts = (events.returningGhosts || 0);
  }

  function prepareGhostForExit(state, ghost) {
    ghost.leavingPen = true;
    ghost.penExitStep = 0;
    ghost.penExitPath = computePenExitPath(state, ghost);
    ghost.state = 'PEN';
    ghost.eyeState = false;
    ghost.waitingToRespawn = false;
    ghost.returningToHome = false;
    ghost.frightenedTimer = 0;
    ghost.frightenedWarning = false;
    ghost.eatenThisPower = false;
    ghost.moveAccumulator = 0;
    ghost.speedFactor = 1;
    ghost.frightenedSpeedTarget = 1;
  }

  function spawnNextGhost(state, events) {
    if (!state.pendingGhosts || !state.pendingGhosts.length) return;
    const next = state.pendingGhosts.shift();
    if (!next) return;
    const spawn = state.ghostSpawnPoints?.[state.ghosts.length % (state.ghostSpawnPoints.length || 1)] || { col: next.col, row: next.row };
    next.col = spawn.col;
    next.row = spawn.row;
    next.prevCol = spawn.col;
    next.prevRow = spawn.row;
    next.dir = C.ACTIONS.LEFT;
    next.state = 'NORMAL';
    next.eyeState = false;
    next.waitingToRespawn = false;
    next.returningToHome = false;
    next.frightenedTimer = 0;
    next.frightenedWarning = false;
    next.eatenThisPower = false;
    next.moveAccumulator = 0;
    next.speedFactor = 1;
    next.frightenedSpeedTarget = 1;
    next.leavingPen = false;
    next.penExitPath = null;
    next.penExitStep = 0;
    state.ghosts.push(next);
    if (events) events.returningGhosts = (events.returningGhosts || 0);
  }

  function updateGhostPen(state) {
    if (!state.ghostPen || !state.ghostPen.length) return;
    if (!hasGhostContainer(state)) return;
    const containerKeys = new Set((state.ghostContainerCells || []).map((cell) => key(cell.col, cell.row)));
    const occupied = new Set();
    state.ghostPen.forEach((ghost) => occupied.add(key(ghost.col, ghost.row)));
    const shuffled = shuffleList(state.ghostPen);
    const remaining = [];
    shuffled.forEach((ghost) => {
      occupied.delete(key(ghost.col, ghost.row));
      const exited = ghost.leavingPen
        ? stepPenExit(state, ghost, containerKeys, occupied)
        : wanderPenGhost(state, ghost, containerKeys, occupied);
      occupied.add(key(ghost.col, ghost.row));
      if (exited) {
        finalizeGhostExit(state, ghost);
      } else {
        remaining.push(ghost);
      }
    });
    state.ghostPen = remaining;
  }

  function wanderPenGhost(state, ghost, containerKeys, occupied) {
    const options = [
      { col: ghost.col, row: ghost.row, action: ghost.dir },
      { col: ghost.col + 1, row: ghost.row, action: C.ACTIONS.RIGHT },
      { col: ghost.col - 1, row: ghost.row, action: C.ACTIONS.LEFT },
      { col: ghost.col, row: ghost.row + 1, action: C.ACTIONS.DOWN },
      { col: ghost.col, row: ghost.row - 1, action: C.ACTIONS.UP }
    ].filter((pos) => containerKeys.has(key(pos.col, pos.row)));
    const shuffledOpts = shuffleList(options);
    const target = shuffledOpts.find((pos) => !occupied.has(key(pos.col, pos.row))) || options[0];
    if (target) {
      ghost.prevCol = ghost.col;
      ghost.prevRow = ghost.row;
      ghost.col = target.col;
      ghost.row = target.row;
      const dir = directionFromStep({ col: ghost.prevCol, row: ghost.prevRow }, target);
      ghost.dir = target.action || dir || ghost.dir;
      ghost.state = 'PEN';
      ghost.lastMoveStep = state.steps || 0;
      if (window.debugGhostLogic && (window.debugGhostLogicVerbose || ((state.steps || 0) % 10 === 0))) {
        console.log('[ghost-logic] pen wander', { id: ghost.id, to: { c: ghost.col, r: ghost.row } });
      }
    }
    return false;
  }

  function stepPenExit(state, ghost, containerKeys, occupied) {
    if (!ghost.penExitPath || !ghost.penExitPath.length) {
      ghost.penExitPath = computePenExitPath(state, ghost);
      ghost.penExitStep = 0;
    }
    const path = ghost.penExitPath || [{ col: ghost.col, row: ghost.row }];
    const nextIdx = Math.min((ghost.penExitStep || 0) + 1, path.length - 1);
    const nextPos = path[nextIdx] || path[path.length - 1];
    const targetKey = key(nextPos.col, nextPos.row);
    if (occupied && occupied.has(targetKey)) {
      return false;
    }
    ghost.prevCol = ghost.col;
    ghost.prevRow = ghost.row;
    ghost.col = nextPos.col;
    ghost.row = nextPos.row;
    const dir = directionFromStep({ col: ghost.prevCol, row: ghost.prevRow }, nextPos);
    ghost.dir = dir || ghost.dir;
    ghost.penExitStep = nextIdx;
    ghost.lastMoveStep = state.steps || 0;
    if (window.debugGhostLogic && (window.debugGhostLogicVerbose || ((state.steps || 0) % 10 === 0))) {
      console.log('[ghost-logic] pen exit', { id: ghost.id, to: { c: ghost.col, r: ghost.row }, step: ghost.penExitStep });
    }
    const outsideContainer = !containerKeys.has(key(ghost.col, ghost.row));
    const atGate = getTile(state.map, ghost.col, ghost.row) === T.GHOST_GATE;
    return outsideContainer && !atGate;
  }

  function finalizeGhostExit(state, ghost) {
    ghost.leavingPen = false;
    ghost.penExitPath = null;
    ghost.penExitStep = 0;
    ghost.eyeState = false;
    ghost.waitingToRespawn = false;
    ghost.returningToHome = false;
    ghost.frightenedTimer = 0;
    ghost.frightenedWarning = false;
    ghost.eatenThisPower = false;
    ghost.moveAccumulator = 0;
    ghost.speedFactor = 1;
    ghost.frightenedSpeedTarget = 1;
    ghost.mode = state.ghostMode ?? (C.GHOST_MODES?.SCATTER || 'SCATTER');
    ghost.state = 'NORMAL';
    if (!state.ghosts.find((g) => g.id === ghost.id)) {
      state.ghosts.push(ghost);
    }
  }

  function computePenExitPath(state, ghost) {
    const outsideCandidates = [];
    const gateCandidates = [];
    (state.ghostSpawnPoints || []).forEach((gate) => {
      const above = { col: gate.col, row: gate.row - 1 };
      if (isWalkable(state.map, above.col, above.row, true)) {
        outsideCandidates.push({ target: above, allowGate: true });
      }
      gateCandidates.push({ target: gate, allowGate: true });
    });
    const start = { col: ghost.col, row: ghost.row };
    const pickBest = (list) => {
      let best = null;
      let bestLen = Infinity;
      list.forEach((candidate) => {
        const path = findPathAStar(state, start, candidate.target, { maxExplored: C.MAP_COLS * C.MAP_ROWS, allowGate: true });
        if (path && path.length && path.length < bestLen) {
          best = path;
          bestLen = path.length;
        }
      });
      return best;
    };
    const outsidePath = pickBest(outsideCandidates);
    if (outsidePath && outsidePath.length) return outsidePath;
    const gatePath = pickBest(gateCandidates);
    if (gatePath && gatePath.length) return gatePath;
    return [start];
  }

  function updateGhostSpeedTowardsTarget(ghost) {
    const cfg = C.FRIGHTENED || {};
    const accel = cfg.accel ?? 0.08;
    const target = (ghost.state === 'FRIGHTENED' || ghost.state === 'FRIGHTENED_WARNING')
      ? (ghost.frightenedSpeedTarget || cfg.speedMax || 0.7)
      : 1;
    const current = ghost.speedFactor ?? 1;
    const next = current + (target - current) * accel;
    ghost.speedFactor = Math.max(0.3, Math.min(1, next));
  }

  function updateGhostModes(state) {
    if (!Array.isArray(C.SCATTER_CHASE_SCHEDULE) || !C.SCATTER_CHASE_SCHEDULE.length) return;
    if (state.powerTimer > 0) return;
    state.ghostModeTimer = (state.ghostModeTimer || 0) - 1;
    if (state.ghostModeTimer <= 0) {
      state.ghostModeIndex = ((state.ghostModeIndex || 0) + 1) % C.SCATTER_CHASE_SCHEDULE.length;
      const entry = C.SCATTER_CHASE_SCHEDULE[state.ghostModeIndex] || C.SCATTER_CHASE_SCHEDULE[0];
      state.ghostMode = entry.mode || C.GHOST_MODES.SCATTER;
      state.ghostModeTimer = entry.durationSteps || 0;
    }
  }

  function getGhostByColor(state, color) {
    for (let i = 0; i < state.ghosts.length; i += 1) {
      const g = state.ghosts[i];
      if ((g.color === color) || (g.originalColor === color)) return g;
    }
    return null;
  }

  function clampToWalkable(state, col, row) {
    if (isWalkable(state.map, col, row, true)) return { col, row };
    const moves = getValidMoves(state.map, col, row, true);
    if (moves.length) return { col: moves[0].col, row: moves[0].row };
    return { col, row };
  }

  function computeGhostTarget(state, ghost) {
    const pac = state.pacman;
    if (isFrightenedState(ghost)) {
      ghost.mode = C.GHOST_MODES.FRIGHTENED;
      return { col: ghost.col, row: ghost.row };
    }
    if (ghost.returningToHome || ghost.waitingToRespawn) {
      const home = getGhostHome(ghost);
      ghost.mode = C.GHOST_MODES.SCATTER;
      return { col: home.col, row: home.row };
    }
    const mode = ghost.frightenedTimer > 0 || (state.powerTimer > 0 && !ghost.returningToHome)
      ? C.GHOST_MODES.FRIGHTENED
      : (ghost.color === 'orange' && manhattan(ghost.col, ghost.row, pac.col, pac.row) <= 8)
        ? C.GHOST_MODES.SCATTER
        : state.ghostMode || C.GHOST_MODES.SCATTER;
    ghost.mode = mode;
    if (ghost.returningToHome) {
      const home = getGhostHome(ghost);
      return { col: home.col, row: home.row };
    }
    if (mode === C.GHOST_MODES.SCATTER || mode === C.GHOST_MODES.FRIGHTENED) {
      const c = { col: ghost.cornerCol ?? ghost.col, row: ghost.cornerRow ?? ghost.row };
      return clampToWalkable(state, c.col, c.row);
    }
    if ((ghost.color === 'red')) {
      return { col: pac.col, row: pac.row };
    }
    if ((ghost.color === 'pink')) {
      const vec = C.DIR_VECTORS[pac.dir] || { col: 1, row: 0 };
      const target = { col: pac.col + vec.col * 4, row: pac.row + vec.row * 4 };
      return clampToWalkable(state, target.col, target.row);
    }
    if ((ghost.color === 'blue')) {
      const blinky = getGhostByColor(state, 'red');
      const aheadVec = C.DIR_VECTORS[pac.dir] || { col: 1, row: 0 };
      const ahead = { col: pac.col + aheadVec.col * 2, row: pac.row + aheadVec.row * 2 };
      const px = ahead.col * 2 - (blinky?.col ?? ahead.col);
      const py = ahead.row * 2 - (blinky?.row ?? ahead.row);
      return clampToWalkable(state, px, py);
    }
    if ((ghost.color === 'orange')) {
      return { col: pac.col, row: pac.row };
    }
    return { col: pac.col, row: pac.row };
  }

  function findGhostPath(state, ghost, target) {
    if ((ghost.color === 'red')) {
      return findPathAStar(state, { col: ghost.col, row: ghost.row }, target, { maxExplored: Infinity, maxRadius: Infinity });
    }
    if ((ghost.color === 'pink')) {
      return findPathAStar(state, { col: ghost.col, row: ghost.row }, target, { maxExplored: C.MAP_COLS * C.MAP_ROWS, maxRadius: Infinity });
    }
    if ((ghost.color === 'blue')) {
      return findPathAStar(state, { col: ghost.col, row: ghost.row }, target, { maxExplored: C.MAP_COLS * C.MAP_ROWS * 2, maxRadius: 30 });
    }
    if ((ghost.color === 'orange')) {
      return findPathAStar(state, { col: ghost.col, row: ghost.row }, target, { maxExplored: C.MAP_COLS * C.MAP_ROWS, maxRadius: Infinity });
    }
    return findPathAStar(state, { col: ghost.col, row: ghost.row }, target, {});
  }

  /**
   * Marca a los fantasmas como asustados por power pellet.
   * @param {Object} state
   */
  function setGhostsFrightened(state) {
    const duration = frightenedDurationForLevel(state.level || 1);
    state.powerTimer = duration;
    state.frightenedWarningSteps = Math.min(duration, C.FRIGHTENED_WARNING_STEPS || Math.max(1, Math.round((C.TIMING?.frightenedWarningMs || 3000) / STEP_MS)));
    state.ghosts.forEach((ghost) => {
      if (ghost.returningToHome || ghost.waitingToRespawn || ghost.eyeState) {
        ghost.frightenedTimer = 0;
        return;
      }
      const targetSpeed = frightenedTargetSpeed(state.level || 1);
      ghost.frightenedTimer = duration;
      ghost.frightenedWarning = false;
      ghost.state = 'FRIGHTENED';
      ghost.eyeState = false;
      ghost.eatenThisPower = false;
      ghost.frightenedSpeedTarget = targetSpeed;
      ghost.speedFactor = Math.min(ghost.speedFactor || 1, 1);
      ghost.moveAccumulator = 0;
    });
  }

  /**
   * Resta el temporizador global de power pellet.
   * @param {Object} state
   */
  function updatePowerTimer(state) {
    if (state.powerTimer <= 0) return;
    state.powerTimer -= 1;
    const warnSteps = state.frightenedWarningSteps || C.FRIGHTENED_WARNING_STEPS || Math.max(1, Math.round((C.TIMING?.frightenedWarningMs || 3000) / STEP_MS));
    const warningActive = state.powerTimer <= warnSteps;
    state.ghosts.forEach((ghost) => {
      if (ghost.state === 'FRIGHTENED' || ghost.state === 'FRIGHTENED_WARNING') {
        ghost.frightenedTimer = Math.max(0, state.powerTimer);
        if (warningActive && ghost.state === 'FRIGHTENED') {
          ghost.state = 'FRIGHTENED_WARNING';
          ghost.frightenedWarning = true;
        }
        if (ghost.state === 'FRIGHTENED_WARNING' && warnSteps > 0) {
          const warnProgress = 1 - (state.powerTimer / Math.max(1, warnSteps));
          const target = ghost.frightenedSpeedTarget || 1;
          const blended = target + (1 - target) * Math.min(1, warnProgress);
          ghost.frightenedSpeedTarget = Math.min(1, blended);
        }
      }
    });
    if (state.powerTimer <= 0) {
      state.ghosts.forEach((ghost) => {
        ghost.eatenThisPower = false;
        ghost.frightenedTimer = 0;
        ghost.frightenedWarning = false;
        if (!ghost.returningToHome && !ghost.waitingToRespawn && !ghost.eyeState) {
          ghost.state = 'NORMAL';
          ghost.speedFactor = 1;
          ghost.frightenedSpeedTarget = 1;
          ghost.moveAccumulator = 0;
        }
      });
      invalidatePowerPathCache();
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
   * @param {Object} state
   * @param {Object} ghost
   */
  function sendGhostHome(state, ghost) {
    ghost.returningToHome = true;
    ghost.waitingToRespawn = false;
    ghost.respawnReleaseStep = null;
    ghost.frightenedTimer = 0;
    ghost.eatenThisPower = true;
    ghost.eyeState = true;
    ghost.state = 'EYES';
    ghost.dir = ghost.dir || C.ACTIONS.LEFT;
    ghost.color = ghost.originalColor || ghost.color;
    ghost.eyeBlinkStartStep = state?.steps || 0;
    ghost.moveAccumulator = 0;
    ghost.speedFactor = 1;
    ghost.frightenedSpeedTarget = 1;
  }

  function startGhostRespawnWait(state, ghost, events) {
    ghost.returningToHome = false;
    ghost.waitingToRespawn = true;
    ghost.state = 'RESPAWN_WAIT';
    ghost.respawnReleaseStep = (state.steps || 0) + RESPAWN_WAIT_STEPS;
    ghost.frightenedTimer = 0;
    if (events) events.ghostsReturned = (events.ghostsReturned || 0) + 1;
  }

  function releaseGhostFromHome(state, ghost) {
    ghost.waitingToRespawn = false;
    ghost.returningToHome = false;
    ghost.respawnReleaseStep = null;
    ghost.eyeState = false;
    ghost.frightenedTimer = 0;
    ghost.eatenThisPower = true;
    ghost.color = ghost.originalColor || ghost.color;
    ghost.dir = C.ACTIONS.UP;
    ghost.prevCol = ghost.col;
    ghost.prevRow = ghost.row;
    ghost.mode = state.ghostMode ?? (C.GHOST_MODES?.SCATTER || 'SCATTER');
    ghost.state = 'NORMAL';
    ghost.speedFactor = 1;
    ghost.frightenedSpeedTarget = 1;
    ghost.moveAccumulator = 0;
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
    const allowGate = options.allowGate ?? goalIsGate;
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
      const neighbors = getValidMoves(state.map, cc, cr, allowGate);
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

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // Selecciona un movimiento de fantasma con sesgo creciente a perseguir a Pac-Man seg�n nivel.
  function pickGhostMove(state, ghost, candidates) {
    if (!candidates.length) return { ...ghost, action: C.ACTIONS.STAY };
    // Si est� asustado, mantiene movimiento aleatorio para facilitar comerlo.
    if (ghost.frightenedTimer > 0) {
      return chooseFrightenedMove(state, ghost, candidates) || candidates[Math.floor(Math.random() * candidates.length)];
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

  function chooseFrightenedMove(state, ghost, options) {
    if (!options.length) return null;
    const nonReverse = options.filter((opt) => opt.action !== oppositeDirection(ghost.dir));
    const pool = nonReverse.length ? nonReverse : options;
    const weights = pool.map((opt) => {
      const pac = state?.pacman || { col: 0, row: 0 };
      const currentDist = manhattan(ghost.col, ghost.row, pac.col, pac.row);
      const nextDist = manhattan(opt.col, opt.row, pac.col, pac.row);
      let w = 1;
      // Prefiere alejarse de Pac-Man para ser menos agresivo.
      if (nextDist > currentDist) w *= 1.6;
      if (nextDist === currentDist) w *= 1.1;
      if (nextDist < currentDist) w *= 0.4;
      // Suaviza cambios bruscos y evita reversas casi por completo.
      if (opt.action === ghost.dir) w *= 1.2;
      if (opt.action === oppositeDirection(ghost.dir)) w *= 0.2;
      if (opt.action === ghost.lastRandomDir) w *= 0.7;
      w *= 0.9 + Math.random() * 0.2; // ligera variaci�n para no ser completamente determinista
      return w;
    });
    const pick = weightedPick(pool, weights);
    ghost.lastRandomDir = pick.action;
    return pick;
  }

  function shuffleList(list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function weightedPick(list, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * (total || 1);
    for (let i = 0; i < list.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
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

    const preserved = {
      score: state.score,
      lives: state.lives,
      level: state.level,
      lifeLossCount: state.lifeLossCount || 0,
      scoreInicialNivel: state.scoreInicialNivel,
      pelletsRemaining: state.pelletsRemaining,
      initialPellets: state.initialPellets,
      pelletMilestoneAwarded: state.pelletMilestoneAwarded,
      stepsSinceLastPellet: state.stepsSinceLastPellet,
      steps: state.steps
    };

    STATE.restoreLevelSnapshot(state);
    const palette = ['red', 'pink', 'blue', 'orange'];
    const pacSpawn = state.pacmanSpawn || C.DEFAULTS.pacmanSpawn;
    state.pacman.col = pacSpawn.col;
    state.pacman.row = pacSpawn.row;
    state.pacman.prevCol = pacSpawn.col;
    state.pacman.prevRow = pacSpawn.row;
    state.pacman.dir = C.ACTIONS.LEFT;
    state.pacman.alive = true;

    const ghostTemplates = (state.levelSnapshot?.ghosts && state.levelSnapshot.ghosts.length)
      ? state.levelSnapshot.ghosts
      : state.ghosts;
    const penTemplates = (state.levelSnapshot?.ghostPen && state.levelSnapshot.ghostPen.length)
      ? state.levelSnapshot.ghostPen
      : null;
    const pendingTemplates = (state.levelSnapshot?.pendingGhosts && state.levelSnapshot.pendingGhosts.length)
      ? state.levelSnapshot.pendingGhosts
      : (penTemplates || []);
    const spawnPoints = (state.ghostSpawnPoints && state.ghostSpawnPoints.length)
      ? state.ghostSpawnPoints
      : (state.levelSnapshot?.ghostSpawnPoints && state.levelSnapshot.ghostSpawnPoints.length
        ? state.levelSnapshot.ghostSpawnPoints
        : C.DEFAULTS.ghostSpawns);

    const buildGhost = (template, idx, spawnOverride) => {
      const spawn = spawnOverride || spawnPoints[idx % spawnPoints.length] || spawnPoints[0];
      const color = template.color || template.originalColor || palette[idx % palette.length];
      const homeCol = template.homeCol ?? spawn.col;
      const homeRow = template.homeRow ?? spawn.row;
      return {
        id: template.id || `ghost-${idx + 1}`,
        color,
        originalColor: template.originalColor || color,
        col: spawn.col,
        row: spawn.row,
        prevCol: spawn.col,
        prevRow: spawn.row,
        dir: C.ACTIONS.LEFT,
        frightenedTimer: 0,
        frightenedWarning: false,
        state: 'NORMAL',
        speedFactor: 1,
        moveAccumulator: 0,
        frightenedSpeedTarget: 1,
        leavingPen: false,
        penExitPath: null,
        penExitStep: 0,
        eatenThisPower: false,
        returningToHome: false,
        waitingToRespawn: false,
        respawnReleaseStep: null,
        eyeBlinkStartStep: state.steps || 0,
        eyeState: false,
        homeCol,
        homeRow,
        mode: state.ghostMode ?? ((C.SCATTER_CHASE_SCHEDULE?.[0]?.mode) || (C.GHOST_MODES?.SCATTER) || 'SCATTER'),
        speed: 1,
        cornerCol: (C.GHOST_CORNERS?.[color]?.col) ?? homeCol,
        cornerRow: (C.GHOST_CORNERS?.[color]?.row) ?? homeRow
      };
    };

    if (penTemplates && penTemplates.length) {
      state.ghostPen = penTemplates.map((template, idx) => {
        const spawn = { col: template.col ?? spawnPoints[idx % spawnPoints.length]?.col ?? template.homeCol ?? template.col, row: template.row ?? spawnPoints[idx % spawnPoints.length]?.row ?? template.homeRow ?? template.row };
        const base = buildGhost(template, idx, spawn);
        return {
          ...base,
          state: 'PEN',
          leavingPen: false,
          penExitPath: null,
          penExitStep: 0,
          waitingToRespawn: false,
          returningToHome: false,
          eyeState: false,
          frightenedTimer: 0,
          frightenedWarning: false
        };
      });
      const penMap = new Map(state.ghostPen.map((g) => [g.id, g]));
      state.pendingGhosts = pendingTemplates.map((g, idx) => {
        const penClone = penMap.get(g.id);
        if (penClone) return { ...penClone, state: 'PEN' };
        return buildGhost(g, idx, { col: g.col, row: g.row });
      });
      state.ghosts = ghostTemplates.map((template, idx) => buildGhost(template, idx));
    } else {
      state.ghosts = ghostTemplates.map((template, idx) => buildGhost(template, idx));
      state.pendingGhosts = pendingTemplates.map((g, idx) => buildGhost(g, idx, { col: g.col, row: g.row }));
      state.ghostPen = [];
    }
    state.ghostSpawnIntervalSteps = state.ghostSpawnIntervalSteps ?? (C.GHOST_SPAWN_INTERVAL_STEPS || 1);
    state.nextGhostSpawnSteps = state.pendingGhosts.length ? state.ghostSpawnIntervalSteps : 0;
    state.respawnTimerSteps = 0;
    state.status = 'running';
    state.powerTimer = 0;
    state.frightenedWarningSteps = C.FRIGHTENED_WARNING_STEPS;
    state.ghostModeIndex = state.ghostModeIndex ?? 0;
    state.ghostMode = state.ghostMode ?? ((C.SCATTER_CHASE_SCHEDULE?.[0]?.mode) || (C.GHOST_MODES?.SCATTER) || 'SCATTER');
    state.ghostModeTimer = state.ghostModeTimer ?? (C.SCATTER_CHASE_SCHEDULE?.[0]?.durationSteps || 0);
    state.stepsSinceLastPellet = state.levelSnapshot?.stepsSinceLastPellet ?? 0;
    state.pelletMilestoneAwarded = state.levelSnapshot?.pelletMilestoneAwarded ?? false;
    state.lastAction = state.levelSnapshot?.lastAction ?? state.lastAction;
    state.score = preserved.score;
    state.lives = preserved.lives;
    state.level = preserved.level;
    state.lifeLossCount = preserved.lifeLossCount;
    state.scoreInicialNivel = preserved.scoreInicialNivel ?? state.scoreInicialNivel;
    state.initialPellets = preserved.initialPellets ?? state.initialPellets;
    state.pelletsRemaining = preserved.pelletsRemaining ?? state.pelletsRemaining;
    state.pelletMilestoneAwarded = preserved.pelletMilestoneAwarded ?? state.pelletMilestoneAwarded;
    state.stepsSinceLastPellet = preserved.stepsSinceLastPellet ?? state.stepsSinceLastPellet;
    state.steps = preserved.steps ?? state.steps;
    state.lifeLostThisStep = false;
    state.mapDirty = true;
    STATE.captureLevelSnapshot(state);
    invalidatePowerPathCache();
  }



  function frightenedDurationForLevel(level) {
    const lvl = Math.max(1, level);
    const baseMinMs = C.TIMING?.frightenedDurationMinMs || 8000;
    const baseMaxMs = C.TIMING?.frightenedDurationMaxMs || 12000;
    const coherence = Math.max(0.25, 1 - (lvl - 1) * 0.06); // niveles altos: duraciones m�s consistentes y algo m�s cortas
    const span = (baseMaxMs - baseMinMs) * coherence;
    const minMs = baseMinMs;
    const maxMs = baseMinMs + span;
    const pickedMs = randBetween(minMs, maxMs);
    const steps = Math.max(C.DIFFICULTY?.minPowerDuration ?? 1, Math.round(pickedMs / STEP_MS));
    return steps;
  }

  function frightenedTargetSpeed(level) {
    const cfg = C.FRIGHTENED || {};
    const baseMin = cfg.speedMin ?? 0.6;
    const baseMax = cfg.speedMax ?? 0.7;
    const jitter = cfg.speedJitter ?? 0.1;
    const jitterScale = Math.max(0.2, 1 - (Math.max(1, level) - 1) * 0.08);
    const base = randBetween(baseMin, baseMax);
    const offset = randBetween(-jitter, jitter) * jitterScale;
    const target = base + offset;
    return Math.max(0.5, Math.min(0.85, target));
  }

  function isGhostLethal(state, ghost) {
    if (ghost.eyeState || ghost.waitingToRespawn || ghost.returningToHome) return false;
    const frightenedActive = (state.powerTimer > 0) && (ghost.frightenedTimer > 0) && !ghost.eatenThisPower;
    return !frightenedActive;
  }

  function isFrightenedState(ghost) {
    return ghost.state === 'FRIGHTENED' || ghost.state === 'FRIGHTENED_WARNING';
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

  function getGhostHome(ghost) {
    const fallback = C.DEFAULTS?.ghostSpawns?.[0] || { col: ghost.col, row: ghost.row };
    return {
      col: ghost.homeCol ?? fallback.col,
      row: ghost.homeRow ?? fallback.row
    };
  }

  function nextStepToHome(state, ghost) {
    const home = getGhostHome(ghost);
    if (ghost.col === home.col && ghost.row === home.row) return null;
    const exploredCap = Number.isFinite(C.MAP_COLS * C.MAP_ROWS) ? C.MAP_COLS * C.MAP_ROWS * 4 : Infinity;
    const path = findPathAStar(state, { col: ghost.col, row: ghost.row }, home, {
      maxExplored: exploredCap || Infinity,
      maxRadius: Infinity
    });
    if (!path || path.length < 2) return null;
    return path[1];
  }


  window.gameLogic = {
    stepGame,
    getValidMoves,
    getRandomAction
  };
})();
