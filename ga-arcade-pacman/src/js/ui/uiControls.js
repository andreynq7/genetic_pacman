// Button wiring for Start/Pause/Reset/Demo placeholders.
(function() {
  function bindControls(refs) {
    if (!refs || !refs.controls) return;
    const { start, pause, reset, demo } = refs.controls;

    start?.addEventListener('click', () => {
      console.log('Start clicked');
      uiMetrics.updateStatusBadge('Entrenando', 'training');
    });

    pause?.addEventListener('click', () => {
      console.log('Pause/Resume clicked');
      uiMetrics.updateStatusBadge('Pausado', 'paused');
    });

    reset?.addEventListener('click', () => {
      console.log('Reset clicked');
      uiMetrics.updateStatusBadge('Idle', 'idle');
    });

    demo?.addEventListener('click', () => {
      console.log('Demo best clicked');
      uiMetrics.updateStatusBadge('Demo', 'demo');
    });
  }

  window.uiControls = {
    bindControls
  };
})();
