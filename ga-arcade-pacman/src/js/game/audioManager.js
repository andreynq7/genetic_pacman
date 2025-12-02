/**
 * audioManager.js
 * ----------------
 * Carga y orquesta los sonidos del juego (demo/GA). Maneja loops exclusivos,
 * eventos especiales y recuperación ante errores de carga.
 */
(function() {
  const SOUND_PATH = './sounds/';
  const sources = {
    start: 'start-music.mp3',
    eating: 'eating.mp3',
    ghostNormal: 'ghost-normal-move.mp3',
    ghostBlue: 'ghost-turn-to-blue.mp3',
    eatingFruit: 'eating-fruit.mp3',
    miss: 'miss.mp3',
    ghostReturn: 'ghost-return-to-home.mp3'
  };

  const volumes = {
    start: 0.4,
    eating: 0.2,
    ghostNormal: 0.15,
    ghostBlue: 0.15,
    eatingFruit: 0.4,
    miss: 0.5,
    ghostReturn: 0.35
  };

  const sounds = {};
  let preloadPromise = null;
  let soundsReady = false;
  let startPrimed = false;
  let ghostLoop = 'ghostNormal';
  let powerActive = false;
  let lifeSeqRunning = false;
  let muted = false;
  let startMusicGuard = false;
  let startMusicActive = false;

  function createAudio(name, { loop = false } = {}) {
    const src = SOUND_PATH + sources[name];
    const audio = new Audio(src);
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = volumes[name] ?? 0.3;
    audio.onerror = (err) => console.warn(`[audio] fallo al cargar ${src}`, err?.message || err);
    return audio;
  }

  /**
   * Crea instancias de Audio para todos los sonidos si todav�a no existen.
   * Idempotente para evitar recrear nodos de audio.
   * @returns {void}
   */
  function ensureSoundsCreated() {
    if (Object.keys(sounds).length) return;
    Object.keys(sources).forEach((key) => {
      if (!sounds[key]) {
        sounds[key] = createAudio(key, { loop: key === 'eating' || key === 'ghostNormal' || key === 'ghostBlue' });
      }
    });
  }

  /**
   * Precarga todos los sonidos y resuelve cuando pueden reproducirse.
   * @returns {Promise<boolean>} True si se cargaron correctamente.
   */
  function loadAll() {
    if (preloadPromise) return preloadPromise;
    ensureSoundsCreated();
    const promises = Object.values(sounds).map((a) => new Promise((resolve) => {
      const done = () => {
        a.removeEventListener('canplaythrough', done);
        a.removeEventListener('error', done);
        resolve();
      };
      a.addEventListener('canplaythrough', done, { once: true });
      a.addEventListener('error', done, { once: true });
    }));
    preloadPromise = Promise.all(promises).then(() => { soundsReady = true; return true; }).catch((e) => {
      console.warn('[audio] error en pre-carga', e);
      return false;
    });
    return preloadPromise;
  }

  /**
   * Garantiza que los recursos de audio est�n precargados, registrando advertencias si fallan.
   * @returns {Promise<void>}
   */
  async function ensurePreloaded() {
    ensureSoundsCreated();
    try {
      await loadAll();
    } catch (e) {
      console.warn('[audio] precarga', e?.message || e);
    }
  }

  async function warmStartBuffer() {
    await ensurePreloaded();
    const a = sounds.start;
    if (!a || startPrimed) return;
    const prevMuted = a.muted;
    try {
      a.muted = true;
      a.currentTime = 0;
      await a.play();
      a.pause();
      a.currentTime = 0;
      startPrimed = true;
    } catch (e) {
      console.warn('[audio] warm start', e?.message || e);
    } finally {
      a.muted = prevMuted;
    }
  }

  /**
   * Precalienta el buffer de la m�sica inicial para evitar delays en la primera reproducci�n.
   * @returns {Promise<void>}
   */
  function primeForInstantStart() {
    return warmStartBuffer();
  }

  function stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function startLoop(name) {
    const a = sounds[name];
    if (!a) return;
    applyMutedFlag(a);
    if (!a.loop) a.loop = true;
    a.currentTime = 0;
    a.play().catch((e) => console.warn('[audio] play loop', name, e?.message || e));
  }

  function stopLoop(name) {
    stop(sounds[name]);
  }

  function stopStartMusic() {
    stop(sounds.start);
    startMusicActive = false;
  }

  function playOnce(name) {
    const a = sounds[name];
    if (!a) return;
    a.loop = false;
    a.currentTime = 0;
    a.play().catch((e) => console.warn('[audio] play once', name, e?.message || e));
  }

  function playOnceWithEnd(name) {
    const a = sounds[name];
    if (!a) return Promise.resolve();
    a.loop = false;
    a.currentTime = 0;
    return new Promise((resolve) => {
      const done = () => {
        a.removeEventListener('ended', done);
        a.removeEventListener('error', done);
        resolve();
      };
      a.addEventListener('ended', done, { once: true });
      a.addEventListener('error', done, { once: true });
      a.play().catch((e) => {
        console.warn('[audio] play once', name, e?.message || e);
        resolve();
      });
    });
  }

  function stopAllLoops() {
    ['eating', 'ghostNormal', 'ghostBlue'].forEach(stopLoop);
  }

  function stopAllSounds() {
    Object.values(sounds).forEach(stop);
    ghostLoop = 'ghostNormal';
    powerActive = false;
  }

  function applyMutedFlag(audio) {
    if (!audio) return;
    audio.muted = muted;
  }

  /**
   * Activa o desactiva silencio global para todos los clips.
   * @param {boolean} flag - True para mutear.
   */
  function setMuted(flag) {
    muted = !!flag;
    Object.values(sounds).forEach(applyMutedFlag);
  }

  /**
   * Cambia el loop de movimiento de fantasmas (normal vs power) y lo reproduce.
   * @param {'ghostNormal'|'ghostBlue'} to - Loop deseado.
   */
  function setGhostLoop(to) {
    // Siempre intenta arrancar el loop solicitado; si cambia, detiene el previo.
    if (ghostLoop !== to) {
      stopLoop(ghostLoop);
      ghostLoop = to;
    }
    startLoop(ghostLoop);
  }

  /**
   * Reproduce la secuencia inicial y resuelve una vez que termina.
   * @returns {Promise<void>}
   */
  function playStartSequence() {
    return warmStartBuffer().then(() => {
      stopAllLoops();
      const startAudio = sounds.start;
      if (!startAudio) return Promise.resolve();
      return new Promise((resolve) => {
        startAudio.loop = false;
        startAudio.currentTime = 0;
        const onEnd = () => {
          startAudio.removeEventListener('ended', onEnd);
          resolve();
        };
        startAudio.addEventListener('ended', onEnd);
        startAudio.play().catch((e) => {
          console.warn('[audio] start music', e?.message || e);
          resolve();
        });
      });
    });
  }

  /**
   * Inicia la m�sica de apertura asegurando que el buffer est� listo.
   * @returns {Promise<void>}
   */
  function playStartMusic() {
    return warmStartBuffer().then(() => {
      stopStartMusic();
      stopAllLoops();
      const a = sounds.start;
      if (!a) return Promise.resolve();
      applyMutedFlag(a);
      a.loop = false;
      a.currentTime = 0;
      startMusicActive = true;
      return a.play().catch((e) => { console.warn('[audio] start-music', e?.message || e); startMusicActive = false; });
    });
  }

  /**
   * Variante protegida para iniciar la m�sica evitando condiciones de carrera.
   * @param {number} [timeoutMs=500] - Tiempo m�ximo para esperar play().
   * @returns {Promise<void>}
   */
  function playStartMusicSafe(timeoutMs = 500) {
    return warmStartBuffer().then(async () => {
      const a = sounds.start;
      if (!a) return;
      if (startMusicGuard) {
        console.debug('[audio] start-music: guard active');
        return;
      }
      if (!a.paused && a.currentTime > 0) {
        console.debug('[audio] start-music: already playing');
        startMusicActive = true;
        return;
      }
      startMusicGuard = true;
      stopStartMusic();
      stopAllLoops();
      applyMutedFlag(a);
      a.loop = false;
      a.currentTime = 0;
      try {
        const playPromise = a.play();
        await Promise.race([
          playPromise,
          new Promise((resolve) => setTimeout(resolve, timeoutMs))
        ]);
        startMusicActive = !a.paused;
        console.debug('[audio] start-music: play resolved', { active: startMusicActive });
      } catch (e) {
        console.warn('[audio] start-music safe', e?.message || e);
        startMusicActive = false;
      } finally {
        startMusicGuard = false;
      }
    });
  }

  /**
   * Inicia los loops de fondo apropiados seg�n el estado de juego (power vs normal).
   * @param {Object} state - Estado actual con indicador de powerTimer.
   */
  function startGameplayLoops(state) {
    ensurePreloaded();
    stopAllLoops();
    startLoop('eating');
    const power = state?.powerTimer > 0;
    powerActive = power;
    setGhostLoop(power ? 'ghostBlue' : 'ghostNormal');
  }

  /**
   * Responde a eventos de un paso de simulaci�n para disparar sonidos contextuales.
   * @param {Object} state - Estado de juego tras el paso.
   * @param {Object} [info={}] - Informaci�n de evento devuelta por gameLogic.
   */
  function handleStep(state, info = {}) {
    if (info.lifeLost && !lifeSeqRunning) {
      stopStartMusic();
      handleLifeLostSequence(state);
      return;
    }
    if (lifeSeqRunning) return;
    // Eventos de consumo
    if (info.powerPelletEaten) {
      stopLoop('eating');
      playOnce('eatingFruit');
      powerActive = true;
      setGhostLoop('ghostBlue');
      setTimeout(() => { if (!lifeSeqRunning) startLoop('eating'); }, 300);
    }
    const powerNow = state?.powerTimer > 0;
    if (!powerNow && powerActive) {
      powerActive = false;
      setGhostLoop('ghostNormal');
    }
    if (info.returningGhosts && info.returningGhosts > 0) {
      startLoop('ghostReturn');
    }
    if ((!info.returningGhosts || info.returningGhosts === 0) && info.ghostsReturned) {
      stopLoop('ghostReturn');
    }
  }

  /**
   * Reproduce la secuencia de audio asociada a perder una vida y reanuda el loop de juego.
   * @param {Object} state - Estado actual para sincronizar loops.
   * @returns {Promise<void>}
   */
  async function handleLifeLostSequence(state) {
    if (lifeSeqRunning) return;
    lifeSeqRunning = true;
    stopAllLoops();
    stopStartMusic();
    await playOnceWithEnd('miss');
    await playStartSequence();
    startGameplayLoops(state);
    lifeSeqRunning = false;
  }

  /**
   * Detiene todos los sonidos y reinicia banderas internas.
   * @returns {void}
   */
  function resetAll() {
    stopAllSounds();
    lifeSeqRunning = false;
    startMusicGuard = false;
    startMusicActive = false;
  }

  window.audioManager = {
    loadAll,
    playStartSequence,
    playStartMusic,
    playStartMusicSafe,
    playOnce,
    playOnceWithEnd,
    startGameplayLoops,
    handleStep,
    handleLifeLostSequence,
    stopAllLoops,
    resetAll,
    stopStartMusic,
    stopAllSounds,
    setMuted,
    primeForInstantStart,
    ensurePreloaded,
    isAnyPlaying: () => {
      return Object.values(sounds).some((a) => {
        try {
          return a && !a.paused && !a.ended && a.currentTime > 0;
        } catch (_) {
          return false;
        }
      });
    }
  };
})();
