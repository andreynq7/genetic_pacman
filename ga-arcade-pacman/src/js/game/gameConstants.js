/**
 * Constantes base para el motor tile-based de Pac-Man.
 * No depende del render; comparte el mismo mapa que gameView si está presente.
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
    powerDurationSteps: 50,
    stepLimit: 2000
  };

  const REWARDS = {
    pellet: 15,
    powerPellet: 50,
    step: -0.5,
    death: -800,
    ghostEaten: 500,
    levelClear: 1300
  };

  // Penalización por estancamiento (demasiados pasos sin comer pellet)
  const STALL = {
    STEP_THRESHOLD: 40,
    PENALTY: -200
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
    STALL
  };
})();
