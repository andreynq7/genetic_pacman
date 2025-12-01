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

  function createAudio(name, { loop = false } = {}) {
    const src = SOUND_PATH + sources[name];
    const audio = new Audio(src);
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = volumes[name] ?? 0.3;
    audio.onerror = (err) => console.warn(`[audio] fallo al cargar ${src}`, err?.message || err);
    return audio;
  }

  function ensureSoundsCreated() {
    if (Object.keys(sounds).length) return;
    Object.keys(sources).forEach((key) => {
      if (!sounds[key]) {
        sounds[key] = createAudio(key, { loop: key === 'eating' || key === 'ghostNormal' || key === 'ghostBlue' });
      }
    });
  }

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

  function setMuted(flag) {
    muted = !!flag;
    Object.values(sounds).forEach(applyMutedFlag);
  }

  function setGhostLoop(to) {
    // Siempre intenta arrancar el loop solicitado; si cambia, detiene el previo.
    if (ghostLoop !== to) {
      stopLoop(ghostLoop);
      ghostLoop = to;
    }
    startLoop(ghostLoop);
  }

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

  function playStartMusic() {
    return warmStartBuffer().then(() => {
      stopStartMusic();
      stopAllLoops();
      const a = sounds.start;
      if (!a) return Promise.resolve();
      applyMutedFlag(a);
      a.loop = false;
      a.currentTime = 0;
      return a.play().catch((e) => console.warn('[audio] start-music', e?.message || e));
    });
  }

  function startGameplayLoops(state) {
    ensurePreloaded();
    stopAllLoops();
    startLoop('eating');
    const power = state?.powerTimer > 0;
    powerActive = power;
    setGhostLoop(power ? 'ghostBlue' : 'ghostNormal');
  }

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

  function resetAll() {
    stopAllSounds();
    lifeSeqRunning = false;
  }

  window.audioManager = {
    loadAll,
    playStartSequence,
    playStartMusic,
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
