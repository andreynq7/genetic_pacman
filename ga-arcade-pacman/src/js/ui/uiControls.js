// Button wiring for Start/Pause/Reset/Demo con handlers inyectables.
(function() {
  /**
   * Asocia handlers a los botones principales. Si no se provee handler,
   * se hace no-op.
   * @param {Object} refs
   * @param {Object} handlers { onStart, onPause, onReset, onDemo, onExportBest, onExportRun }
   */
  function bindControls(refs, handlers = {}) {
    if (!refs || !refs.controls) return;
    const { start, pause, reset, demo, exportBest, exportRun } = refs.controls;

    start?.addEventListener('click', () => {
      handlers.onStart?.();
    });

    pause?.addEventListener('click', () => {
      handlers.onPause?.();
    });

    reset?.addEventListener('click', () => {
      handlers.onReset?.();
    });

    demo?.addEventListener('click', () => {
      handlers.onDemo?.();
    });

    exportBest?.addEventListener('click', () => {
      handlers.onExportBest?.();
    });

    exportRun?.addEventListener('click', () => {
      handlers.onExportRun?.();
    });
  }

  window.uiControls = {
    bindControls
  };
})();
