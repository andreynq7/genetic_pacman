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
    start: 0.5,
    eating: 0.2,
    ghostNormal: 0.15,
    ghostBlue: 0.15,
    eatingFruit: 0.4,
    miss: 0.5,
    ghostReturn: 0.35
  };

  const sounds = {};
  let ghostLoop = 'ghostNormal';
  let powerActive = false;
  let lifeSeqRunning = false;

  function createAudio(name, { loop = false } = {}) {
    const src = SOUND_PATH + sources[name];
    const audio = new Audio(src);
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = volumes[name] ?? 0.3;
    audio.onerror = (err) => console.warn(`[audio] fallo al cargar ${src}`, err?.message || err);
    return audio;
  }

  function loadAll() {
    Object.keys(sources).forEach((key) => {
      sounds[key] = createAudio(key, { loop: key === 'eating' || key === 'ghostNormal' || key === 'ghostBlue' });
    });
    const promises = Object.values(sounds).map((a) => new Promise((resolve) => {
      const done = () => {
        a.removeEventListener('canplaythrough', done);
        a.removeEventListener('error', done);
        resolve();
      };
      a.addEventListener('canplaythrough', done, { once: true });
      a.addEventListener('error', done, { once: true });
    }));
    return Promise.all(promises).catch((e) => console.warn('[audio] error en pre-carga', e));
  }

  function stop(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function startLoop(name) {
    const a = sounds[name];
    if (!a) return;
    if (!a.loop) a.loop = true;
    a.currentTime = 0;
    a.play().catch((e) => console.warn('[audio] play loop', name, e?.message || e));
  }

  function stopLoop(name) {
    stop(sounds[name]);
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

  function setGhostLoop(to) {
    // Siempre intenta arrancar el loop solicitado; si cambia, detiene el previo.
    if (ghostLoop !== to) {
      stopLoop(ghostLoop);
      ghostLoop = to;
    }
    startLoop(ghostLoop);
  }

  function playStartSequence() {
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
  }

  function startGameplayLoops(state) {
    stopAllLoops();
    startLoop('eating');
    const power = state?.powerTimer > 0;
    powerActive = power;
    setGhostLoop(power ? 'ghostBlue' : 'ghostNormal');
  }

  function handleStep(state, info = {}) {
    if (info.lifeLost && !lifeSeqRunning) {
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
    await playOnceWithEnd('miss');
    await playStartSequence();
    startGameplayLoops(state);
    lifeSeqRunning = false;
  }

  function resetAll() {
    Object.values(sounds).forEach(stop);
    powerActive = false;
    ghostLoop = 'ghostNormal';
    lifeSeqRunning = false;
  }

  window.audioManager = {
    loadAll,
    playStartSequence,
    startGameplayLoops,
    handleStep,
    handleLifeLostSequence,
    stopAllLoops,
    resetAll
  };
})();
