/**
 * Constantes base para el motor tile-based de Pac-Man.
 * No depende del render; comparte el mismo mapa que gameView si est� presente.
 */
(function() {
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

  const LEVEL_MAP = (Array.isArray(viewConst.LEVEL_MAP) && viewConst.LEVEL_MAP.length)
    ? viewConst.LEVEL_MAP
    : FALLBACK_LEVEL;

  const TILE_TYPES = viewConst.TILE_TYPES || {
    WALL: 'W',
    PELLET: '.',
    POWER: 'o',
    PATH: ' ',
    GHOST_GATE: 'G',
    PACMAN_SPAWN: 'P'
  };

  const TILE_SIZE = viewConst.TILE_SIZE || 16;
  const MAP_COLS = viewConst.MAP_COLS || (LEVEL_MAP[0]?.length || 28);
  const MAP_ROWS = viewConst.MAP_ROWS || LEVEL_MAP.length || 31;

  const ACTIONS = {
    UP: 'UP',
    DOWN: 'DOWN',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    STAY: 'STAY'
  };

  const DIR_VECTORS = {
    [ACTIONS.UP]: { col: 0, row: -1 },
    [ACTIONS.DOWN]: { col: 0, row: 1 },
    [ACTIONS.LEFT]: { col: -1, row: 0 },
    [ACTIONS.RIGHT]: { col: 1, row: 0 },
    [ACTIONS.STAY]: { col: 0, row: 0 }
  };

  const DEFAULTS = {
    pacmanSpawn: viewConst.defaultPacmanSpawn || { col: 13, row: 29 },
    ghostSpawns: viewConst.defaultGhostSpawns || [
      { col: 13, row: 12 },
      { col: 14, row: 12 }
    ],
    lives: 3,
    powerDurationSteps: 60,
    stepLimit: 50000
  };

  const REWARDS = {
    pellet: 10,
    powerPellet: 50,
    step: -0.3,
    emptyStep: -1.5,
    death: -1000,
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

  // Escalado de dificultad por nivel.
  const DIFFICULTY = {
    powerDurationDecay: 0.82,
    minPowerDuration: 12,
    ghostChaseBase: 0.0,
    ghostChaseGrowth: 0.12,
    ghostChaseMax: 0.85
  };

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
    DIFFICULTY
  };
})();
