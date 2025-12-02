/**
 * gaWorker.js
 * -----------
 * Worker dedicado para evaluar cromosomas sin bloquear la UI.
 * Se apoya en los mismos m�dulos globales (gameConstants, gameState, gameLogic, policyEncoding, fitnessEvaluator).
 */
(function() {
  const ctx = self; // eslint-disable-line no-restricted-globals
  ctx.window = ctx; // Muchos m�dulos asumen window global; en worker alias a self.

  // Cargar mensajes y dependencias del GA.
  try {
    importScripts('./workerMessages.js');
    importScripts('../game/gameConstants.js', '../game/gameState.js', '../game/gameLogic.js', '../game/episodeSimulator.js');
    importScripts('../agent/policyEncoding.js', './fitnessEvaluator.js');
  } catch (err) {
    postError(null, `Error cargando scripts en worker: ${err?.message || err}`);
  }

  const MSG = ctx.gaWorkerMessages || {
    INIT: 'ga-worker/init',
    READY: 'ga-worker/ready',
    EVALUATE_CHUNK: 'ga-worker/evaluate-chunk',
    RESULT: 'ga-worker/result',
    ERROR: 'ga-worker/error',
    LOG: 'ga-worker/log'
  };

  const FITNESS = ctx.fitnessEvaluator;

  /**
   * Punto de entrada para mensajes entrantes desde el hilo principal.
   * Soporta INIT para handshake y EVALUATE_CHUNK para evaluar cromosomas.
   * @param {MessageEvent} event - Mensaje recibido.
   */
  ctx.onmessage = function onMessage(event) {
    const { data } = event || {};
    const type = data?.type;
    const id = data?.id || null;
    const payload = data?.payload || {};

    switch (type) {
      case MSG.INIT:
        postMessageSafe({ type: MSG.READY, id, payload: { workerId: payload?.workerId ?? null } });
        break;
      case MSG.EVALUATE_CHUNK:
        handleEvaluateChunk(id, payload);
        break;
      default:
        postError(id, `gaWorker: mensaje desconocido ${type}`);
        break;
    }
  };

  /**
   * Eval�a una tanda de cromosomas y responde al hilo principal con los resultados.
   * @param {string} id - Identificador de la solicitud.
   * @param {{items:Array, generation:number, chunkId:number}} payload - Datos de evaluaci�n.
   */
  function handleEvaluateChunk(id, payload) {
    if (!FITNESS) {
      postError(id, 'gaWorker: fitnessEvaluator no disponible');
      return;
    }
    if (!payload || !Array.isArray(payload.items)) {
      postError(id, 'gaWorker: payload.items faltante en evaluate-chunk');
      return;
    }
    const started = nowMs();
    const { items, generation, chunkId } = payload;
    const results = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const cfg = mergeFitnessConfig(item.fitnessConfig || {}, generation);
      try {
        const evalStats = FITNESS.evaluateChromosome(item.chromosome, cfg);
        results.push({
          index: item.index,
          fitness: evalStats.fitness,
          evalStats
        });
      } catch (err) {
        postError(id, `gaWorker: error evaluando index ${item?.index}: ${err?.message || err}`);
        return;
      }
    }

    const elapsedMs = nowMs() - started;
    postMessageSafe({
      type: MSG.RESULT,
      id,
      payload: {
        kind: MSG.EVALUATE_CHUNK,
        chunkId,
        generation,
        results,
        elapsedMs
      }
    });
  }

  /**
   * Mezcla configuraci�n de fitness con un desplazamiento de generaci�n por chunk.
   * @param {Object} base - Configuraci�n base recibida.
   * @param {number} generation - Generaci�n actual.
   * @returns {Object} Configuraci�n lista para evaluar.
   */
  function mergeFitnessConfig(base, generation) {
    return {
      ...base,
      generationOffset: base.generationOffset ?? generation ?? 0
    };
  }

  function nowMs() {
    return (ctx.performance && ctx.performance.now) ? ctx.performance.now() : Date.now();
  }

  /**
   * Env�a un mensaje de error seguro al hilo principal.
   * @param {string|null} id - Identificador de la tarea relacionada.
   * @param {string} message - Descripci�n del error.
   */
  function postError(id, message) {
    postMessageSafe({ type: MSG.ERROR, id, payload: { message } });
  }

  /**
   * Env�a un mensaje atrapando errores para no matar el worker.
   * @param {Object} msg - Payload a emitir.
   */
  function postMessageSafe(msg) {
    try {
      ctx.postMessage(msg);
    } catch (err) {
      // No re-lanza para no romper el worker.
      // eslint-disable-next-line no-console
      console.error('gaWorker postMessage error', err);
    }
  }
})();

