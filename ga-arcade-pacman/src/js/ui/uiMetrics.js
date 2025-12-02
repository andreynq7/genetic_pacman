// Visual updates for live metrics placeholders.
(function() {
  const statusClassMap = {
    idle: 'status-idle',
    training: 'status-training',
    paused: 'status-paused',
    demo: 'status-demo'
  };

  /**
   * Actualiza el badge de estado superior (Idle/Training/etc).
   * @param {string} text - Texto a mostrar.
   * @param {'idle'|'training'|'paused'|'demo'} state - Estado para mapear clases CSS.
   */
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
  /**
   * Refresca las tarjetas num�ricas de m�tricas principales.
   * @param {Object} refs - Referencias de UI.
   * @param {Object} metrics - Valores a mostrar (bestFitness, averageFitness, generation, totalTime, averageTime, workersActive, chunkSizeUsed).
   */
  function updateTrainingMetrics(refs, metrics) {
    if (!refs || !metrics) return;
    updateMetricValue(refs.metrics.best, metrics.bestFitness ?? '--');
    updateMetricValue(refs.metrics.avg, metrics.averageFitness ?? '--');
    updateMetricValue(refs.metrics.generation, metrics.generation ?? '--');
    updateMetricValue(refs.metrics.totalTime, metrics.totalTime ?? '--');
    updateMetricValue(refs.metrics.avgTime, metrics.averageTime ?? '--');
    updateMetricValue(refs.metrics.workersActive, metrics.workersActive ?? refs.metrics.workersActive?.textContent ?? '--');
    updateMetricValue(refs.metrics.chunkSizeUsed, metrics.chunkSizeUsed ?? refs.metrics.chunkSizeUsed?.textContent ?? '--');
    updateMetricValue(refs.metrics.workersActiveDup, metrics.workersActive ?? refs.metrics.workersActiveDup?.textContent ?? '--');
    updateMetricValue(refs.metrics.chunkSizeUsedDup, metrics.chunkSizeUsed ?? refs.metrics.chunkSizeUsedDup?.textContent ?? '--');
  }

  /**
   * Alias ligero para actualizar solo m�tricas principales.
   * @param {Object} refs - Referencias de UI.
   * @param {Object} metrics - Valores de fitness y tiempos.
   */
  function updateMetrics(refs, metrics) {
    if (!refs || !metrics) return;
    updateMetricValue(refs.metrics.best, metrics.bestFitness ?? '--');
    updateMetricValue(refs.metrics.avg, metrics.averageFitness ?? '--');
    updateMetricValue(refs.metrics.totalTime, metrics.totalTime ?? '--');
    updateMetricValue(refs.metrics.avgTime, metrics.averageTime ?? '--');
    updateMetricValue(refs.metrics.generation, metrics.generation ?? '--');
  }

  /**
   * Dibuja un placeholder estilizado en el canvas de m�tricas cuando no hay datos.
   * @param {Object} refs - Referencias de UI.
   */
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
  /**
   * Dibuja la gr�fica de evoluci�n de fitness (best y avg por generaci�n).
   * @param {Object} refs - Referencias de UI.
   * @param {number[]} [bestSeries] - Serie de mejores valores por generaci�n.
   * @param {number[]} [avgSeries] - Serie de promedios por generaci�n.
   */
  function renderFitnessGraph(refs, bestSeries = [], avgSeries = []) {
    if (!refs?.game?.metricsCanvas) return;
    const canvas = refs.game.metricsCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 18;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    const firstBest = firstDataValue(bestSeries);
    const firstAvg = firstDataValue(avgSeries);
    const haveData = Number.isFinite(firstBest) || Number.isFinite(firstAvg);
    const minBase = Math.min(
      Number.isFinite(firstBest) ? firstBest : Infinity,
      Number.isFinite(firstAvg) ? firstAvg : Infinity
    );
    const maxVal = Math.max(1,
      ...bestSeries.map(n => Number.isFinite(n) ? n : 0),
      ...avgSeries.map(n => Number.isFinite(n) ? n : 0)
    );

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

    if (!haveData) {
      return;
    }
    const denom = Math.max(1e-9, maxVal - minBase);
    plotSeries(ctx, bestSeries, padding, width, height, maxVal, '#00bcd4', minBase, denom);
    plotSeries(ctx, avgSeries, padding, width, height, maxVal, '#ffc107', minBase, denom);
  }

  function plotSeries(ctx, series, padding, width, height, maxVal, color, minBase, denom) {
    if (!series.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((val, idx) => {
      const x = padding + (idx / Math.max(1, series.length - 1)) * width;
      const v = Number.isFinite(val) ? val : minBase;
      const clamped = Math.max(minBase, Math.min(maxVal, v));
      const y = padding + height - ((clamped - minBase) / denom) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function firstDataValue(series) {
    for (let i = 0; i < series.length; i += 1) {
      const v = Number(series[i]);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  }

  /**
   * Renderiza un comparativo simple de tiempo total con y sin workers.
   * @param {Object} refs - Referencias de UI (usa `refs.workers.comparison.canvas`).
   * @param {Object|null} onData - Resumen con workers.
   * @param {Object|null} offData - Resumen sin workers.
   */
  function renderComparisonGraph(refs, onData, offData) {
    const canvas = refs?.workers?.comparison?.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const padding = 18;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;
    const onVal = onData ? (onData.totalTimeMs || 0) : 0;
    const offVal = offData ? (offData.totalTimeMs || 0) : 0;
    const maxVal = Math.max(1, onVal, offVal);
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(padding, padding, width, height);
    const barW = Math.floor(width / 4);
    const gap = Math.floor(width / 6);
    const onH = Math.floor((onVal / maxVal) * height);
    const offH = Math.floor((offVal / maxVal) * height);
    const baseY = padding + height;
    const onX = padding + gap;
    const offX = padding + gap * 3 + barW;
    ctx.fillStyle = '#00bcd4';
    ctx.fillRect(onX, baseY - onH, barW, onH);
    ctx.fillStyle = '#ffc107';
    ctx.fillRect(offX, baseY - offH, barW, offH);
  }

  window.uiMetrics = {
    updateStatusBadge,
    updateMetrics,
    updateTrainingMetrics,
    renderPlaceholderGraph,
    renderFitnessGraph,
    renderComparisonGraph

  };
})();
