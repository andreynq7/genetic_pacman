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

  /**
   * Cat�logo de mensajes usados para coordinar el hilo principal y los Web Workers del GA.
   * @typedef {'ga-worker/init'|'ga-worker/ready'|'ga-worker/evaluate-chunk'|'ga-worker/result'|'ga-worker/error'|'ga-worker/log'} GaWorkerMessage
   */
  window.gaWorkerMessages = MSG;
})();
