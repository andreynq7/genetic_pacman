// Button wiring for Start/Pause/Reset/Demo con handlers inyectables.
(function() {
  function bindControls(refs, handlers = {}) {
    if (!refs || !refs.controls) return;
    const { start, pause, extend, reset, demo, exportBest, exportRun, exportFitness } = refs.controls;
    start?.addEventListener('click', () => { handlers.onStart?.(); });
    pause?.addEventListener('click', () => { handlers.onPause?.(); });
    extend?.addEventListener('click', () => { handlers.onExtend?.(); });
    reset?.addEventListener('click', () => { handlers.onReset?.(); });
    demo?.addEventListener('click', () => { handlers.onDemo?.(); });
    exportBest?.addEventListener('click', () => { handlers.onExportBest?.(); });
    exportRun?.addEventListener('click', () => { handlers.onExportRun?.(); });
    exportFitness?.addEventListener('click', () => { handlers.onExportFitness?.(); });
  }
  window.uiControls = { bindControls };
})();
