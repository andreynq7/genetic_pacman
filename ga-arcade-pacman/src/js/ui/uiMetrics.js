// Visual updates for live metrics placeholders.
(function() {
  const statusClassMap = {
    idle: 'status-idle',
    training: 'status-training',
    paused: 'status-paused',
    demo: 'status-demo'
  };

  function updateStatusBadge(text, state) {
    const refs = uiLayout.getRefs();
    const badge = refs.statusBadge;
    if (!badge) return;

    badge.textContent = text || 'Idle';
    badge.className = `status-badge ${statusClassMap[state] || 'status-idle'}`;
  }

  function updateMetricValue(el, value) {
    if (el) {
      domHelpers.setText(el, value);
    }
  }

  /**
   * Actualiza métricas numéricas básicas (fitness, generación, tiempos).
   * @param {Object} refs
   * @param {Object} metrics { bestFitness, averageFitness, generation, totalTime, averageTime }
   */
  function updateTrainingMetrics(refs, metrics) {
    if (!refs || !metrics) return;
    updateMetricValue(refs.metrics.best, metrics.bestFitness ?? '--');
    updateMetricValue(refs.metrics.avg, metrics.averageFitness ?? '--');
    updateMetricValue(refs.metrics.generation, metrics.generation ?? '--');
    updateMetricValue(refs.metrics.totalTime, metrics.totalTime ?? '--');
    updateMetricValue(refs.metrics.avgTime, metrics.averageTime ?? '--');
  }

  function updateMetrics(refs, metrics) {
    if (!refs || !metrics) return;
    updateMetricValue(refs.metrics.best, metrics.bestFitness ?? '--');
    updateMetricValue(refs.metrics.avg, metrics.averageFitness ?? '--');
    updateMetricValue(refs.metrics.totalTime, metrics.totalTime ?? '--');
    updateMetricValue(refs.metrics.avgTime, metrics.averageTime ?? '--');
    updateMetricValue(refs.metrics.generation, metrics.generation ?? '--');
  }

  function renderPlaceholderGraph(refs) {
    if (!refs?.game?.metricsCanvas) return;
    const canvas = refs.game.metricsCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0, 188, 212, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 193, 7, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 20);
    ctx.lineTo(canvas.width * 0.35, canvas.height * 0.55);
    ctx.lineTo(canvas.width * 0.55, canvas.height * 0.35);
    ctx.lineTo(canvas.width * 0.85, canvas.height * 0.15);
    ctx.stroke();

    ctx.fillStyle = '#ffc107';
    const points = [
      { x: canvas.width * 0.35, y: canvas.height * 0.55 },
      { x: canvas.width * 0.55, y: canvas.height * 0.35 },
      { x: canvas.width * 0.85, y: canvas.height * 0.15 }
    ];
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * Dibuja la gráfica de evolución de fitness (best y avg por generación).
   * @param {Object} refs
   * @param {number[]} bestSeries
   * @param {number[]} avgSeries
   */
  function renderFitnessGraph(refs, bestSeries = [], avgSeries = []) {
    if (!refs?.game?.metricsCanvas) return;
    const canvas = refs.game.metricsCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 18;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    const maxVal = Math.max(1, ...bestSeries, ...avgSeries);

    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(padding, padding, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const y = padding + (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + width, y);
      ctx.stroke();
    }

    plotSeries(ctx, bestSeries, padding, width, height, maxVal, '#00bcd4');
    plotSeries(ctx, avgSeries, padding, width, height, maxVal, '#ffc107');
  }

  function plotSeries(ctx, series, padding, width, height, maxVal, color) {
    if (!series.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((val, idx) => {
      const x = padding + (idx / Math.max(1, series.length - 1)) * width;
      const y = padding + height - (val / maxVal) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  window.uiMetrics = {
    updateStatusBadge,
    updateMetrics,
    updateTrainingMetrics,
    renderPlaceholderGraph,
    renderFitnessGraph
  };
})();
