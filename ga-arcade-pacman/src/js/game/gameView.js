// Tile-based rendering for the Pac-Man board. Keeps grid data and helpers
// available for the future game/GA logic (collisions, movement, pellets).
(function() {
  // Tile metadata
  const TILE_SIZE = 16;
  const MAP_COLS = 28;
  const MAP_ROWS = 31;
//   const MAP_COLS = 22;
//   const MAP_ROWS = 20;
  const STEP_MS = 100;

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
    'W.WWWW.WW..........WW.WWWW.W',
    'W.WWWW.WWWWW WW WWWWW.WWWW.W',
    'W...WW.WWWWW WW WWWWW.WW...W',
    'WWW.WW....        ....WW.WWW',
    'WWW.WW.WW.WWGGGGWW.WW.WW.WWW',
    'WWW.WW.WW.WWCCCCWW.WW.WW.WWW',
    'W......WW.WWWWWWWW.WW......W',
    'W.WWWW.WW....WW....WW.WWWW.W',
    'W.WWWW.WWWWW.WW.WWWWW.WWWW.W',
    'Wo..WW................WW..oW',
    'WWW.WWWWW.WWWWWWWW.WWWWW.WWW',
    'WWW.WWWWW.WWWWWWWW.WWWWW.WWW',
    'W......WW....WW....WW......W',
    'W.WWWW....WW.WW.WW....WWWW.W',
    'W.WWWWWWWWWW.WW.WWWWWWWWWW.W',
    'W............WW............W',
    'W.WWWWWWW.WWWWWWWW.WWWWWWW.W',
    'W.WWWWWWW.WWWWWWWW.WWWWWWW.W',
    'W.....o......WW......o.....W',
    'WoWW.WWWWWWW.WW.WWWWWWW.WWoW',
    'W.WW.WWWWWWW.WW.WWWWWWW.WW.W',
    'W..............P...........W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWW'
  ];
// const LEVEL_MAP = [
//   'WWWWWWWWWWWWWWWWWWWWWW',
//   'W....................W',
//   'W.W.WWWW.WWWW.WWWW.W.W',
//   'WoW.W  WoWWWW.W  WoWoW',
//   'W.W.WWWW.WWWW.WWWW.W.W',
//   'W....................W',
//   'W.WWWW.WWWWWWWW.WWWW.W',
//   'W.WWWW..........WWWW.W',
//   'W.WWWW.WWGGGGWW.WWWW.W',
//   'W......WWCCCCWW......W',
//   'W.WWWW.WWWWWWWW.WWWW.W',
//   'W.WWWW..........WWWW.W',
//   'W.WWWW.WWWWWWWW.WWWW.W',
//   'W....................W',
//   'W.WWWW.W.WWWW.W.WWWW.W',
//   'Wo.....W.WWWW.W......W',
//   'W.WWWW.W.WWWW.W.WWWW.W',
//   'W.WWWW.W.WWWW.W.WWWW.W',
//   'W...........P........W',
//   'WWWWWWWWWWWWWWWWWWWWWW'
// ];

  const TILE_TYPES = {
    WALL: 'W',
    PELLET: '.',
    POWER: 'o',
    PATH: ' ',
    GHOST_GATE: 'G',
    GHOST_CONTAINER: 'C',
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
  const ghostSprites = loadGhostSprites();
  const defaultGhostSprite = getDefaultGhostSprite(ghostSprites);

  let cachedCtx = null;

  function initGameView(canvasOrRef) {
    const canvas = resolveCanvas(canvasOrRef);
    if (!canvas) return null;

    canvas.width = MAP_COLS * TILE_SIZE;
    canvas.height = MAP_ROWS * TILE_SIZE;

    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.imageSmoothingEnabled === 'boolean') {
      ctx.imageSmoothingEnabled = false;
    }
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
  function drawEntities(ctx, state, alpha = 1) {
    if (!state) return;
    const pac = state.pacman;
    if (pac) {
      const sprite = getPacmanSprite(pac, state?.steps || 0);
      const { x, y } = gridToPixelLerped(pac.prevCol ?? pac.col, pac.prevRow ?? pac.row, pac.col, pac.row, alpha);
      if (sprite?.ready) {
        ctx.drawImage(sprite.img, x, y, TILE_SIZE, TILE_SIZE);
      } else {
        const center = { x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 };
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.arc(center.x, center.y, TILE_SIZE * 0.45, 0.25 * Math.PI, 1.75 * Math.PI);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    const renderGhosts = collectRenderableGhosts(state);
    if (renderGhosts.length) {
      renderGhosts.forEach((ghost, idx) => {
        const { x, y } = gridToPixelLerped(ghost.prevCol ?? ghost.col, ghost.prevRow ?? ghost.row, ghost.col, ghost.row, alpha);
        const stepCount = state?.steps || 0;
        if (ghost.eyeState) {
          drawGhostEyes(ctx, ghost, x, y, stepCount);
          return;
        }
        const sprite = getGhostSprite(ghost, idx, stepCount);
        if (sprite?.ready) {
          ctx.drawImage(sprite.img, x, y, TILE_SIZE, TILE_SIZE);
        } else if (defaultGhostSprite?.ready) {
          ctx.drawImage(defaultGhostSprite.img, x, y, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = COLORS.ghost;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  /**
   * Render completo de un frame con estado dinámico.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} state
   */
  function renderFrame(ctx, state, alpha = 1) {
    if (!ctx) return;
    if (state?.map) {
      drawLevelMatrix(ctx, state.map);
    } else {
      drawLevel(ctx);
    }
    drawEntities(ctx, state, alpha);
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

  function gridToPixelLerped(prevCol, prevRow, col, row, alpha) {
    const lerp = (a, b, t) => a + (b - a) * t;
    const c = lerp(prevCol, col, Math.max(0, Math.min(1, alpha)));
    const r = lerp(prevRow, row, Math.max(0, Math.min(1, alpha)));
    return { x: c * TILE_SIZE, y: r * TILE_SIZE };
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

  function collectRenderableGhosts(state) {
    const seen = new Set();
    const list = [];
    const addGhost = (ghost) => {
      if (!ghost) return;
      const id = ghost.id || `${ghost.col},${ghost.row}`;
      if (seen.has(id)) return;
      seen.add(id);
      list.push(ghost);
    };
    (state.ghosts || []).forEach(addGhost);
    const waiting = (state.ghostPen && state.ghostPen.length) ? state.ghostPen : (state.pendingGhosts || []);
    waiting.forEach(addGhost);
    return list;
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
    preloadSprites,
    constants: {
      TILE_SIZE,
      MAP_COLS,
      MAP_ROWS,
      STEP_MS,
      LEVEL_MAP,
      TILE_TYPES
    }
  };

  // --------------- Sprites helpers ---------------
  function loadImage(src) {
    const sprite = { img: new Image(), ready: false, error: false, src };
    sprite.img.onload = () => { sprite.ready = true; };
    sprite.img.onerror = () => { sprite.error = true; try { console.error('[sprite-load-error]', src); } catch (_) {} };
    sprite.img.src = src;
    return sprite;
  }

  function loadPacmanSprites() {
    return {
      RIGHT: loadImage('./assets/sprites/pacman/pacman_right.png'),
      LEFT: loadImage('./assets/sprites/pacman/pacman_left.png'),
      UP: loadImage('./assets/sprites/pacman/pacman_up.png'),
      DOWN: loadImage('./assets/sprites/pacman/pacman_down.png'),
      CLOSED: loadImage('./assets/sprites/pacman/pacman_closed.png')
    };
  }

  function getPacmanSprite(pac, stepCount) {
    const dir = pac?.dir || 'RIGHT';
    const phaseClosed = (stepCount % 6) >= 3;
    if (phaseClosed && pacmanSprites.CLOSED?.ready) return pacmanSprites.CLOSED;
    switch (dir) {
      case 'LEFT': return pacmanSprites.LEFT;
      case 'UP': return pacmanSprites.UP;
      case 'DOWN': return pacmanSprites.DOWN;
      case 'RIGHT':
      default: return pacmanSprites.RIGHT;
    }
  }

  function loadGhostSprites() {
    const colors = ['red', 'pink', 'blue', 'orange'];
    const dirs = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
    const set = {};
    colors.forEach((color) => {
      set[color] = {};
      dirs.forEach((dir) => {
        const d = dir.toLowerCase();
        set[color][dir] = [
          loadImage(`./assets/sprites/${color}Ghost/${color}Ghost_${d}1.png`),
          loadImage(`./assets/sprites/${color}Ghost/${color}Ghost_${d}2.png`)
        ];
      });
    });
    set.eyes = {
      LEFT: [loadImage('./assets/sprites/eyesGhost/eyesGhost_left.png')],
      RIGHT: [loadImage('./assets/sprites/eyesGhost/eyesGhost_right.png')],
      UP: [loadImage('./assets/sprites/eyesGhost/eyesGhost_up.png')],
      DOWN: [loadImage('./assets/sprites/eyesGhost/eyesGhost_down.png')]
    };
    set.scared = [
      loadImage('./assets/sprites/scaredGhost/scaredGhost.png'),
      loadImage('./assets/sprites/scaredGhost/scaredGhost2.png')
    ];
    return set;
  }

  function collectSpriteObjects() {
    const list = [];
    Object.values(pacmanSprites).forEach((s) => { if (s) list.push(s); });
    Object.values(ghostSprites).forEach((entry) => {
      if (Array.isArray(entry)) {
        entry.forEach((s) => { if (s) list.push(s); });
      } else if (entry && typeof entry === 'object') {
        Object.values(entry).forEach((arr) => {
          if (Array.isArray(arr)) arr.forEach((s) => { if (s) list.push(s); });
        });
      }
    });
    return list;
  }

  function getSpriteAudit() {
    const sprites = collectSpriteObjects();
    return sprites.map((s) => ({ src: s?.img?.src || s?.src || '', ready: !!s?.ready, error: !!s?.error }));
  }

  function preloadSprites(timeoutMs = 5000) {
    const sprites = collectSpriteObjects();
    const readyCheck = () => sprites.every((s) => s?.ready || s?.img?.complete);
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (readyCheck()) {
          resolve(true);
          return;
        }
        if ((Date.now() - start) >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function getDefaultGhostSprite(sprites) {
    return sprites.red?.RIGHT?.[0]
      || sprites.red?.LEFT?.[0]
      || sprites.pink?.RIGHT?.[0]
      || sprites.scared?.[0]
      || null;
  }

  function getGhostSprite(ghost, idx, stepCount) {
    const animPhase = ((stepCount || 0) % 12) < 6 ? 0 : 1;
    const frightened = (ghost.frightenedTimer || 0) > 0;
    if (ghost?.eyeState) {
      const eyeSprite = getEyesSprite(ghost);
      if (eyeSprite?.ready) return eyeSprite;
    }
    if (frightened) {
      const warnBlink = ghost.frightenedWarning && ((stepCount || 0) % 8) >= 4;
      const colorWarn = verifyGhostColor(ghost, idx);
      const warnSprite = warnBlink ? pickDirSprite(ghostSprites[colorWarn], ghost?.dir, animPhase) : null;
      if (warnSprite?.ready) return warnSprite;
      const s = ghostSprites.scared[animPhase] || ghostSprites.scared[0];
      if (s?.ready) return s;
      const alt = ghostSprites.scared[0];
      if (alt?.ready) return alt;
    }
    const color = verifyGhostColor(ghost, idx);
    const set = ghostSprites[color];
    const sprite = pickDirSprite(set, ghost?.dir, animPhase);
    if (sprite) return sprite;
    return defaultGhostSprite?.ready ? defaultGhostSprite : null;
  }

  function verifyGhostColor(ghost, idx) {
    const palette = ['red', 'pink', 'blue', 'orange'];
    const fallback = palette[idx % palette.length];
    const original = ghost?.originalColor || fallback;
    if (!ghost) return fallback;
    if (!ghost.originalColor) {
      ghost.originalColor = original;
    }
    if (!ghost.color || !palette.includes(ghost.color)) {
      console.warn('[ghost-color] color inválido, corrigiendo', { id: ghost.id, was: ghost.color, to: original });
      ghost.color = original;
    }
    if (ghost.color !== ghost.originalColor) {
      console.warn('[ghost-color] desviación detectada, revirtiendo', { id: ghost.id, was: ghost.color, to: ghost.originalColor });
      ghost.color = ghost.originalColor;
    }
    return ghost.color;
  }

  function pickDirSprite(set, dir, animPhase) {
    if (!set) return null;
    const dirKey = set[dir] ? dir : (set.LEFT ? 'LEFT' : (set.RIGHT ? 'RIGHT' : (set.UP ? 'UP' : (set.DOWN ? 'DOWN' : null))));
    if (dirKey && set[dirKey]) {
      const s = set[dirKey][animPhase] || set[dirKey][0];
      if (s?.ready) return s;
      if (set[dirKey][0]?.ready) return set[dirKey][0];
      if (set[dirKey][1]?.ready) return set[dirKey][1];
    }
    const anyDir = set.LEFT || set.RIGHT || set.UP || set.DOWN;
    if (anyDir) {
      const s = anyDir[animPhase] || anyDir[0];
      if (s?.ready) return s;
      if (anyDir[0]?.ready) return anyDir[0];
      if (anyDir[1]?.ready) return anyDir[1];
    }
    return null;
  }

  function getEyesSprite(ghost) {
    const set = ghostSprites.eyes || {};
    const dirKey = normalizeDirKey(ghost?.dir);
    const list = set[dirKey] || set.LEFT || set.RIGHT || set.UP || set.DOWN;
    if (!list) return null;
    const sprite = Array.isArray(list) ? (list[0] || list[1]) : list;
    return sprite || null;
  }

  function normalizeDirKey(dir) {
    if (dir === 'UP' || dir === 'DOWN' || dir === 'LEFT' || dir === 'RIGHT') return dir;
    return 'LEFT';
  }

  function drawGhostEyes(ctx, ghost, x, y, stepCount) {
    const blinkDim = isEyesBlinkDimmed(ghost, stepCount);
    const sprite = getEyesSprite(ghost);
    ctx.save();
    if (blinkDim) {
      ctx.globalAlpha = 0.35;
    }
    if (sprite?.ready) {
      ctx.drawImage(sprite.img, x, y, TILE_SIZE, TILE_SIZE);
    } else {
      drawEyesFallback(ctx, x, y);
    }
    ctx.restore();
  }

  function drawEyesFallback(ctx, x, y) {
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2;
    const eyeOffset = TILE_SIZE * 0.18;
    const eyeRadius = TILE_SIZE * 0.12;
    const pupilRadius = TILE_SIZE * 0.08;

    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(centerX - eyeOffset, centerY - eyeOffset, eyeRadius, 0, Math.PI * 2);
    ctx.arc(centerX + eyeOffset, centerY - eyeOffset, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3f51b5';
    ctx.beginPath();
    ctx.arc(centerX - eyeOffset, centerY - eyeOffset, pupilRadius, 0, Math.PI * 2);
    ctx.arc(centerX + eyeOffset, centerY - eyeOffset, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  function isEyesBlinkDimmed(ghost, stepCount) {
    const c = window.gameConstants || {};
    const blinkSteps = c.GHOST_BLINK_STEPS
      || Math.max(1, Math.round(((c.TIMING?.ghostBlinkMs) || 250) / ((c.TIMING?.stepDurationMs) || STEP_MS)));
    const ticks = Math.max(0, (stepCount || 0) - (ghost?.eyeBlinkStartStep || 0));
    return ((Math.floor(ticks / blinkSteps)) % 2) === 1;
  }
})();
