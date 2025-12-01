/**
 * workerMessages.js
 * ------------------
 * Mensajes estandarizados para coordinar hilo principal y Web Workers del GA.
 * Se expone en window para reuso desde el pool y los workers.
 */
(function() {
  const MSG = {
    INIT: 'ga-worker/init',
    READY: 'ga-worker/ready',
    EVALUATE_CHUNK: 'ga-worker/evaluate-chunk',
    RESULT: 'ga-worker/result',
    ERROR: 'ga-worker/error',
    LOG: 'ga-worker/log'
  };

  window.gaWorkerMessages = MSG;
})();

