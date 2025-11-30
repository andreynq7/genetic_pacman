// Tile-based rendering for the Pac-Man board. Keeps grid data and helpers
// available for the future game/GA logic (collisions, movement, pellets).
(function() {
  // Tile metadata
  const TILE_SIZE = 16;
  const MAP_COLS = 28;
  const MAP_ROWS = 31;

  // Legend:
  // W = Wall
  // . = Pellet
  // o = Power pellet
  //   = Empty path
  // G = Ghost house gate/area
  // P = Suggested Pac-Man spawn
  const LEVEL_MAP = [
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
    'WWWWWW.WW WWGGGGWW WW.WWWWWW',
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
    'W.WWWWWWWWWW.WW.WWWWWWWWWW.W',
    'W..............P...........W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWW'
  ];

  const TILE_TYPES = {
    WALL: 'W',
    PELLET: '.',
    POWER: 'o',
    PATH: ' ',
    GHOST_GATE: 'G',
    PACMAN_SPAWN: 'P'
  };

  const COLORS = {
    background: '#000000',
    wall: '#0033ff',
    pellet: '#ffc107',
    power: '#ffd54f',
    ghost: '#00bcd4'
  };

  // Sprites
  const pacmanSprites = loadPacmanSprites();

  let cachedCtx = null;

  function initGameView(canvasOrRef) {
    const canvas = resolveCanvas(canvasOrRef);
    if (!canvas) return null;

    canvas.width = MAP_COLS * TILE_SIZE;
    canvas.height = MAP_ROWS * TILE_SIZE;

    const ctx = canvas.getContext('2d');
    cachedCtx = ctx;
    if (window.uiLayout) {
      const refs = uiLayout.getRefs();
      if (refs?.game) refs.game.context = ctx;
    }
    clearBoard(ctx);
    drawLevel(ctx);
    return ctx;
  }

  function resolveCanvas(canvasOrRef) {
    if (!canvasOrRef && window.uiLayout) {
      const refs = uiLayout.getRefs();
      return refs?.game?.canvas || null;
    }
    if (typeof canvasOrRef === 'string') {
      return document.getElementById(canvasOrRef);
    }
    return canvasOrRef || null;
  }

  function clearBoard(ctx) {
    if (!ctx) return;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
  }

  function drawLevel(ctx = cachedCtx, levelMatrix) {
    if (!ctx) return;
    const matrix = levelMatrix || LEVEL_MAP;
    drawLevelMatrix(ctx, matrix);
  }

  /**
   * Dibuja el nivel a partir de una matriz (array de strings o de arrays).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string[]|string[][]} matrix
   */
  function drawLevelMatrix(ctx, matrix) {
    clearBoard(ctx);
    for (let row = 0; row < MAP_ROWS; row += 1) {
      const rowData = matrix[row];
      const tiles = Array.isArray(rowData) ? rowData : rowData.split('');
      for (let col = 0; col < MAP_COLS; col += 1) {
        const tile = tiles[col];
        drawTile(ctx, col, row, tile);
      }
    }
  }

  function drawTile(ctx, col, row, tileType) {
    const { x, y } = gridToPixel(col, row);
    switch (tileType) {
      case TILE_TYPES.WALL:
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        break;
      case TILE_TYPES.PELLET:
        drawPellet(ctx, x, y, 2.5, COLORS.pellet);
        break;
      case TILE_TYPES.POWER:
        drawPellet(ctx, x, y, 4, COLORS.power);
        break;
      case TILE_TYPES.GHOST_GATE:
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = COLORS.ghost;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + TILE_SIZE / 2);
        ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
        ctx.stroke();
        break;
      case TILE_TYPES.PACMAN_SPAWN:
      case TILE_TYPES.PATH:
      default:
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        break;
    }
  }

  /**
   * Dibuja entidades dinámicas (Pac-Man y fantasmas) sobre el mapa.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} state
   */
  function drawEntities(ctx, state) {
    if (!state) return;
    const pac = state.pacman;
    if (pac) {
      const sprite = getPacmanSprite(pac, state?.steps || 0);
      const { x, y } = gridToPixel(pac.col, pac.row);
      if (sprite && sprite.complete) {
        ctx.drawImage(sprite, x, y, TILE_SIZE, TILE_SIZE);
      } else {
        const center = gridCenter(pac.col, pac.row);
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.arc(center.x, center.y, TILE_SIZE * 0.45, 0.25 * Math.PI, 1.75 * Math.PI);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (state.ghosts && state.ghosts.length) {
      state.ghosts.forEach((ghost, idx) => {
        const { x, y } = gridToPixel(ghost.col, ghost.row);
        const bodyColor = ghost.frightenedTimer > 0 ? '#e9f1eaff' : ['#ff5252', '#00bcd4', '#e91e63', '#8bc34a'][idx % 4];
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      });
    }
  }

  /**
   * Render completo de un frame con estado dinámico.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} state
   */
  function renderFrame(ctx, state) {
    if (!ctx) return;
    if (state?.map) {
      drawLevelMatrix(ctx, state.map);
    } else {
      drawLevel(ctx);
    }
    drawEntities(ctx, state);
  }

  function drawPellet(ctx, x, y, radius, color) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function gridToPixel(col, row) {
    return { x: col * TILE_SIZE, y: row * TILE_SIZE };
  }

  function gridCenter(col, row) {
    const { x, y } = gridToPixel(col, row);
    return { x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 };
  }

  function pixelToGrid(x, y) {
    return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) };
  }

  function isInsideGrid(col, row) {
    return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS;
  }

  function getTile(col, row) {
    if (!isInsideGrid(col, row)) return null;
    return LEVEL_MAP[row][col];
  }

  function isWall(col, row) {
    return getTile(col, row) === TILE_TYPES.WALL;
  }

  function isWalkable(col, row) {
    const tile = getTile(col, row);
    if (!tile) return false;
    return tile !== TILE_TYPES.WALL;
  }

  function isGhostGate(col, row) {
    return getTile(col, row) === TILE_TYPES.GHOST_GATE;
  }

  function getMapDimensions() {
    return {
      cols: MAP_COLS,
      rows: MAP_ROWS,
      tileSize: TILE_SIZE,
      widthPx: MAP_COLS * TILE_SIZE,
      heightPx: MAP_ROWS * TILE_SIZE
    };
  }

  window.gameView = {
    initGameView,
    initGameCanvas: initGameView, // alias for backward compatibility
    drawLevel,
    drawLevelMatrix,
    drawEntities,
    renderFrame,
    gridToPixel,
    gridCenter,
    pixelToGrid,
    isWall,
    isWalkable,
    isGhostGate,
    getMapDimensions,
    constants: {
      TILE_SIZE,
      MAP_COLS,
      MAP_ROWS,
      LEVEL_MAP,
      TILE_TYPES
    }
  };

  // --------------- Sprites helpers ---------------
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  function loadPacmanSprites() {
    return {
      RIGHT: loadImage('./assets/sprites/pacman_right.png'),
      LEFT: loadImage('./assets/sprites/pacman_left.png'),
      UP: loadImage('./assets/sprites/pacman_up.png'),
      DOWN: loadImage('./assets/sprites/pacman_down.png'),
      CLOSED: loadImage('./assets/sprites/pacman_closed.png')
    };
  }

  function getPacmanSprite(pac, stepCount) {
    const dir = pac?.dir || 'RIGHT';
    const phase = (stepCount % 12) < 6 ? 'OPEN' : 'CLOSED';
    if (phase === 'CLOSED') return pacmanSprites.CLOSED;
    switch (dir) {
      case 'LEFT': return pacmanSprites.LEFT;
      case 'UP': return pacmanSprites.UP;
      case 'DOWN': return pacmanSprites.DOWN;
      case 'RIGHT':
      default: return pacmanSprites.RIGHT;
    }
  }
})();
