/**
 * workerPool.js
 * --------------
 * Pool ligero de Web Workers para evaluar cromosomas en paralelo.
 * Expone evaluateChromosomes(items, { generation, chunkSize }) -> Promise<results[]>.
 */
(function() {
  const MSG = window.gaWorkerMessages || {
    INIT: 'ga-worker/init',
    READY: 'ga-worker/ready',
    EVALUATE_CHUNK: 'ga-worker/evaluate-chunk',
    RESULT: 'ga-worker/result',
    ERROR: 'ga-worker/error',
    LOG: 'ga-worker/log'
  };

  /**
   * Crea un pool ligero de Web Workers para evaluar cromosomas en paralelo.
   * Devuelve null si la API de Worker no est� disponible.
   * @param {{scriptUrl?:string,size?:number,chunkSize?:number}} [options] - Opciones de inicializaci�n.
   * @returns {{evaluateChromosomes:Function,terminate:Function,size:number}|null} Pool listo para usar.
   */
  function createWorkerPool(options = {}) {
    if (typeof Worker === 'undefined') {
      console.warn('gaWorkerPool: Worker API no disponible; fallback a ejecuci�n sin pool.');
      return null;
    }

    const scriptUrl = options.scriptUrl || './src/js/ga/gaWorker.js';
    const size = Math.max(1, options.size || Math.min(8, (navigator.hardwareConcurrency || 2)));
    const defaultChunk = Math.max(1, options.chunkSize || 16);
    const workers = [];
    const queue = [];
    const inFlight = new Map();
    let seq = 0;

    for (let i = 0; i < size; i += 1) {
      spawnWorker(i);
    }

    function spawnWorker(idx) {
      const worker = new Worker(scriptUrl);
      const wrapper = { worker, busy: false, ready: false, id: idx };
      worker.onmessage = (evt) => handleMessage(wrapper, evt);
      worker.onerror = (err) => handleError(wrapper, err);
      worker.postMessage({ type: MSG.INIT, payload: { workerId: idx } });
      workers.push(wrapper);
    }

    function handleMessage(wrapper, evt) {
      const { data } = evt || {};
      const type = data?.type;
      const id = data?.id;
      const payload = data?.payload;

      if (type === MSG.READY) {
        wrapper.ready = true;
        wrapper.busy = false;
        dispatch();
        return;
      }

      const job = inFlight.get(id);
      if (!job) {
        return;
      }

      if (type === MSG.RESULT) {
        wrapper.busy = false;
        inFlight.delete(id);
        job.resolve(payload);
        dispatch();
      } else if (type === MSG.ERROR) {
        wrapper.busy = false;
        inFlight.delete(id);
        job.reject(new Error(payload?.message || 'Error en worker'));
        dispatch();
      }
    }

    function handleError(wrapper, err) {
      const error = err?.message || err?.toString() || 'Worker error';
      wrapper.ready = false;
      wrapper.busy = false;
      // Rechaza todos los jobs asignados a este worker.
      inFlight.forEach((job, jobId) => {
        if (job.workerId === wrapper.id) {
          job.reject(new Error(error));
          inFlight.delete(jobId);
        }
      });
      dispatch();
    }

    function dispatch() {
      if (!queue.length) return;
      const free = workers.find((w) => w.ready && !w.busy);
      if (!free) return;
      const job = queue.shift();
      free.busy = true;
      inFlight.set(job.id, { ...job, workerId: free.id });
      free.worker.postMessage({ type: job.type, id: job.id, payload: job.payload });
    }

    function enqueue(type, payload) {
      return new Promise((resolve, reject) => {
        const id = `job-${++seq}`;
        queue.push({ id, type, payload, resolve, reject });
        dispatch();
      });
    }

    /**
     * Distribuye cromosomas entre los workers y devuelve sus fitness agregados.
     * @param {Array} items - Lista de { index, chromosome, fitnessConfig }.
     * @param {{generation?:number,chunkSize?:number}} [opts] - Ajustes de ejecuci�n.
     * @returns {Promise<Array<{index:number,fitness:number,evalStats:Object}>>}
     */
    async function evaluateChromosomes(items, opts = {}) {
      if (!items || !items.length) return [];
      const chunkSize = Math.max(1, opts.chunkSize || defaultChunk);
      const generation = opts.generation ?? 0;
      const chunks = [];
      for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
      }
      const promises = chunks.map((chunk, idx) => enqueue(MSG.EVALUATE_CHUNK, {
        chunkId: idx,
        items: chunk,
        generation
      }));
      const payloads = await Promise.all(promises);
      const merged = [];
      payloads.forEach((p) => {
        if (p?.results) merged.push(...p.results);
      });
      return merged;
    }

    function terminate() {
      workers.forEach((w) => {
        try { w.worker.terminate(); } catch (err) { /* ignore */ }
      });
      queue.length = 0;
      inFlight.clear();
    }

    return {
      evaluateChromosomes,
      terminate,
      size
    };
  }

  window.gaWorkerPool = {
    createWorkerPool
  };
})();
