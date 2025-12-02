
(function() {
  /* The code `const viewConst = window.gameView?.constants || {};` is trying to access the `constants`
  property of the `gameView` object in the `window` global object. */
  const viewConst = window.gameView?.constants || {};

  const FALLBACK_LEVEL = [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W............WW............W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'WoWWWW.WWWWW.WW.WWWWW.WWWWoW',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'W..........................W',
    'W.WWWW.WW.WWWWWWWW.WW.WWWW.W',
    'W.WWWW.WW.WWWWWWWW.WW.WWWW.W',
    'W......WW....WW....WW......W',
    'WWWWWW.WWWWW WW WWWWW.WWWWWW',
    'WWWWWW.WWWWW WW WWWWW.WWWWWW',
    'WWWWWW.WW          WW.WWWWWW',
    'WWWWWW.WW WWWGGWWW WW.WWWWWW',
    'WWWWWW.WW WWWWWWWW WW.WWWWWW',
    'W............WW............W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'Wo..WW................WW..oW',
    'WWW.WW.WW.WWWWWWWW.WW.WW.WWW',
    'WWW.WW.WW.WWWWWWWW.WW.WW.WWW',
    'W......WW....WW....WW......W',
    'W.WWWWWWWWWW.WW.WWWWWWWWWW.W',
    'W.WWWWWWWWWW.WW.WWWWWWWWWW.W',
    'W............WW............W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'W......WW....WW....WW......W',
    'WoWWWWWWWWWW.WW.WWWWWWWWWWoW',
    'W..........................W',
    'W..........................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWW'
  ];

  const LEVEL_MAP = FALLBACK_LEVEL;

/* The `const TILE_TYPES` declaration is setting up a constant variable that defines different types of
tiles in the game. It first attempts to access the `TILE_TYPES` property from the `viewConst`
object, which is expected to contain definitions for various tile types. If `viewConst.TILE_TYPES`
is not available or undefined, it falls back to a default object that defines the following tile
types: */
  const TILE_TYPES = viewConst.TILE_TYPES || {
    WALL: 'W',
    PELLET: '.',
    POWER: 'o',
    PATH: ' ',
    GHOST_GATE: 'G',
    GHOST_CONTAINER: 'C',
    PACMAN_SPAWN: 'P'
  };

/* These lines of code are setting up default values for various game constants based on the values
found in the `viewConst` object or fallback values if those properties are not present or undefined. */
  const TILE_SIZE = viewConst.TILE_SIZE || 16;
  const MAP_COLS = viewConst.MAP_COLS || (LEVEL_MAP[0]?.length || 28);
  const MAP_ROWS = viewConst.MAP_ROWS || LEVEL_MAP.length || 31;
  const STEP_DURATION_MS = viewConst.STEP_MS || 100;

  const ACTIONS = {
    UP: 'UP',
    DOWN: 'DOWN',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    STAY: 'STAY'
  };

  /* The `const DIR_VECTORS` object is defining directional vectors for different actions in the game.
  Each property within the object corresponds to a specific action (UP, DOWN, LEFT, RIGHT, STAY) and
  contains an object with `col` and `row` properties representing the change in column and row
  positions when that action is taken. */
  /* The `const DIR_VECTORS` object is defining directional vectors for different actions in the game.
  Each property within the object corresponds to a specific action (UP, DOWN, LEFT, RIGHT, STAY) and
  contains an object with `col` and `row` properties representing the change in column and row
  positions when that action is taken. */
  const DIR_VECTORS = {
    [ACTIONS.UP]: { col: 0, row: -1 },
    [ACTIONS.DOWN]: { col: 0, row: 1 },
    [ACTIONS.LEFT]: { col: -1, row: 0 },
    [ACTIONS.RIGHT]: { col: 1, row: 0 },
    [ACTIONS.STAY]: { col: 0, row: 0 }
  };

  /* The `DEFAULTS` constant object is defining default values for various game settings related to the
  gameplay. Here's a breakdown of each property within the `DEFAULTS` object: */
  const DEFAULTS = {
    pacmanSpawn: viewConst.defaultPacmanSpawn || { col: 13, row: 29 },
    ghostSpawns: viewConst.defaultGhostSpawns || [
      { col: 13, row: 12 },
      { col: 14, row: 12 }
    ],
    lives: 3,
    powerDurationSteps: 60,
    stepLimit: 1000
  };

 /* The `GHOST_MODES` constant object defines different modes for the ghosts in the game. It includes
 the following modes:
 - `CHASE`: Represents the mode where ghosts actively chase the player.
 - `SCATTER`: Represents the mode where ghosts disperse or scatter around the game map.
 - `FRIGHTENED`: Represents the mode where ghosts are scared and can be eaten by the player. */
  const GHOST_MODES = {
    CHASE: 'CHASE',
    SCATTER: 'SCATTER',
    FRIGHTENED: 'FRIGHTENED'
  };

 /* The `SCATTER_CHASE_SCHEDULE` constant array defines a sequence of modes for the ghosts in the game.
 Each object in the array represents a specific mode (either "SCATTER" or "CHASE") and the duration
 in steps for which that mode should be active. */
  const SCATTER_CHASE_SCHEDULE = [
    { mode: 'SCATTER', durationSteps: 70 },
    { mode: 'CHASE', durationSteps: 200 },
    { mode: 'SCATTER', durationSteps: 70 },
    { mode: 'CHASE', durationSteps: 200 }
  ];

/* The `GHOST_CORNERS` constant object is defining the corner positions for different colored ghosts in
the game. Each property represents a different colored ghost and its corresponding corner position
on the game map grid. Here's a breakdown of the corner positions for each colored ghost: */
  const GHOST_CORNERS = {
    red: { col: 26, row: 1 },
    pink: { col: 1, row: 1 },
    blue: { col: 26, row: 29 },
    orange: { col: 1, row: 29 }
  };

/* The `const REWARDS` object is defining the rewards associated with different actions or events in
the game. Here's a breakdown of each reward defined in the object: */
  const REWARDS = {
    pellet: 10,
    powerPellet: 50,
    step: -0.3,
    emptyStep: -1.5,
    death: -500,
    ghostEaten: 100,
    levelClear: 10000
  };

  // Penalizaci�n por estancamiento (demasiados pasos sin comer pellet)
  const STALL = {
    STEP_THRESHOLD: 30,
    PENALTY: -200,
    HARD_STOP_THRESHOLD: 200,       // early-stop si supera este umbral sin comer
    KILL_CHECK_STEP: 250,           // paso para evaluar kill switch por baja recompensa
    KILL_SCORE_THRESHOLD: -1000     // si la puntuaci�n cae por debajo, termina el episodio
  };

  // Reglas de balance para no sacrificar progreso por perseguir fantasmas.
  const BALANCE = {
    // Solo perseguir autom�ticamente fantasmas asustados si ya se avanz� lo suficiente
    // y la ruta hasta ellos es corta.
    powerChaseMinProgress: 0.35, // proporci�n de pellets ya comidos [0,1]
    powerChaseMaxPath: 10,
    pelletMilestoneThreshold: 0.2,
    pelletMilestoneReward: 800
  };

  // Ajustes extra de balance din�mico.
  BALANCE.pelletDangerRadius = 4;      // radio de seguridad para priorizar pellet
  BALANCE.ghostChaseDangerRadius = 3;  // radio de seguridad al perseguir fantasmas
  BALANCE.ghostChaseMinPellets = 0.15; // no perseguir fantasmas si queda menos de este porcentaje de pellets
  BALANCE.powerPathRecalcInterval = 3; // recálculo de A* en power cada N pasos
  BALANCE.powerPathMaxRadius = 10;     // limitar radio de búsqueda en power mode
  BALANCE.powerPathMaxExplored = 120;  // máximo de nodos explorados por A* en power


/* The `DIFFICULTY` constant object is defining parameters related to the difficulty settings of the
game. Here's a breakdown of each property: */
  const DIFFICULTY = {
    powerDurationDecay: 0.82,
    minPowerDuration: 12,
    ghostChaseBase: 0.0,
    ghostChaseGrowth: 0.12,
    ghostChaseMax: 0.85
  };

/* The `FRIGHTENED` constant object is defining parameters related to the movement behavior of the
ghosts when they are in the "FRIGHTENED" mode in the game. Here's a breakdown of each property: */
  const FRIGHTENED = {
    speedMin: 1,
    speedMax: 1,
    speedJitter: 0,
    accel: 0
  };

  /* The `const TIMING` object is defining various timing parameters related to different aspects of
  the game. Here's a breakdown of each property: */
  const TIMING = {
    stepDurationMs: STEP_DURATION_MS,
    ghostRespawnMs: 3000,
    ghostBlinkMs: 250,
    frightenedWarningMs: 3000,
    frightenedDurationMinMs: 8000,
    frightenedDurationMaxMs: 12000,
    ghostSpawnIntervalMs: 5000,
    respawnDelayMs: 2000
  };

  /* These lines of code are calculating the number of steps required for different timing events in
  the game based on the duration in milliseconds and the step duration in milliseconds. Here's a
  breakdown of each calculation: */
  const GHOST_RESPAWN_STEPS = Math.max(1, Math.round(TIMING.ghostRespawnMs / TIMING.stepDurationMs));
  const GHOST_BLINK_STEPS = Math.max(1, Math.round(TIMING.ghostBlinkMs / TIMING.stepDurationMs));
  const FRIGHTENED_WARNING_STEPS = Math.max(1, Math.round(TIMING.frightenedWarningMs / TIMING.stepDurationMs));
  const GHOST_SPAWN_INTERVAL_STEPS = Math.max(1, Math.round(TIMING.ghostSpawnIntervalMs / TIMING.stepDurationMs));
  const RESPAWN_DELAY_STEPS = Math.max(1, Math.round(TIMING.respawnDelayMs / TIMING.stepDurationMs));

  window.gameConstants = {
    TILE_SIZE,
    MAP_COLS,
    MAP_ROWS,
    TILE_TYPES,
    LEVEL_MAP,
    ACTIONS,
    DIR_VECTORS,
    DEFAULTS,
    REWARDS,
    STALL,
    BALANCE,
    DIFFICULTY,
    FRIGHTENED,
    GHOST_MODES,
    SCATTER_CHASE_SCHEDULE,
    GHOST_CORNERS,
    TIMING,
    GHOST_RESPAWN_STEPS,
    GHOST_BLINK_STEPS,
    FRIGHTENED_WARNING_STEPS,
    GHOST_SPAWN_INTERVAL_STEPS,
    RESPAWN_DELAY_STEPS
  };
})();
