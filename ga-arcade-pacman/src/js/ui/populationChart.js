// Gráfico interactivo de distribución poblacional por generación.
(function() {
  const COLORS = {
    improving: '#4caf50',
    stable: '#ffc107',
    regressing: '#ff5252',
    trend: '#00bcd4',
    axis: 'rgba(255, 255, 255, 0.24)',
    grid: 'rgba(255, 255, 255, 0.08)',
    text: '#eaeaea'
  };

  const state = {
    svg: null,
    tooltip: null,
    container: null,
    data: [],
    filtered: [],
    range: { start: 0, end: 0 },
    improvementMode: false,
    cumulative: false,
    hotspots: [],
    resizeObs: null,
    controls: {
      startInput: null,
      endInput: null,
      improvementBtn: null,
      cumulativeBtn: null
    }
  };

  /**
   * Inicializa el SVG y los manejadores de eventos del gr�fico poblacional.
   * @returns {boolean|null} True si se encontr� el contenedor, null en caso contrario.
   */
  function init() {
    state.svg = document.getElementById('population-chart');
    state.tooltip = document.getElementById('population-tooltip');
    state.container = state.svg ? state.svg.parentElement : null;
    state.controls.startInput = document.getElementById('population-range-start');
    state.controls.endInput = document.getElementById('population-range-end');
    state.controls.improvementBtn = document.getElementById('pop-improvement-btn');
    state.controls.cumulativeBtn = document.getElementById('pop-cumulative-btn');
    if (state.controls.cumulativeBtn) {
      state.controls.cumulativeBtn.classList.add('ghost');
    }

    if (!state.svg || !state.container) return null;
    bindControls();
    attachResizeObserver();
    renderPlaceholder();
    return true;
  }

  function bindControls() {
    const { startInput, endInput, improvementBtn, cumulativeBtn } = state.controls;
    if (startInput && endInput) {
      const onChange = () => {
        const start = Number(startInput.value) || 0;
        const end = Number(endInput.value) || 0;
        setRange(start, end);
      };
      startInput.addEventListener('change', onChange);
      endInput.addEventListener('change', onChange);
    }
    if (improvementBtn) {
      improvementBtn.addEventListener('click', () => {
        state.improvementMode = !state.improvementMode;
        improvementBtn.setAttribute('aria-pressed', state.improvementMode ? 'true' : 'false');
        improvementBtn.classList.toggle('primary', state.improvementMode);
        render();
      });
    }
    if (cumulativeBtn) {
      cumulativeBtn.addEventListener('click', () => {
        state.cumulative = !state.cumulative;
        cumulativeBtn.setAttribute('aria-pressed', state.cumulative ? 'true' : 'false');
        cumulativeBtn.classList.toggle('ghost', !state.cumulative);
        cumulativeBtn.classList.toggle('primary', state.cumulative);
        render();
      });
    }
    if (state.svg) {
      state.svg.addEventListener('pointermove', handlePointerMove);
      state.svg.addEventListener('pointerleave', hideTooltip);
    }
  }

  function attachResizeObserver() {
    if (!state.container || !window.ResizeObserver) return;
    state.resizeObs = new ResizeObserver(() => render());
    state.resizeObs.observe(state.container);
  }

  /**
   * Sobrescribe el dataset de snapshots y re-renderiza el gr�fico.
   * @param {Array<Object>} entries - Lista de snapshots de poblaci�n por generaci�n.
   */
  function setData(entries = []) {
    state.data = normalizeData(entries);
    syncRangeInputs();
    render();
  }

  /**
   * Inserta o reemplaza un snapshot individual y actualiza la visualizaci�n.
   * @param {{generation:number}} snapshot - Registro de poblaci�n para una generaci�n.
   */
  function addSnapshot(snapshot) {
    if (!snapshot || snapshot.generation == null) return;
    const next = [...state.data];
    const idx = next.findIndex((s) => s.generation === snapshot.generation);
    if (idx >= 0) next[idx] = snapshot;
    else next.push(snapshot);
    state.data = normalizeData(next);
    syncRangeInputs();
    render();
  }

  function normalizeData(entries) {
    const map = new Map();
    entries.forEach((e) => {
      if (e && Number.isFinite(e.generation)) {
        map.set(e.generation, {
          generation: e.generation,
          populationSize: e.populationSize ?? 0,
          improving: e.improving ?? 0,
          stable: e.stable ?? 0,
          regressing: e.regressing ?? 0,
          cumulativeCount: e.cumulativeCount ?? e.populationSize ?? 0,
          bestFitness: e.bestFitness ?? null,
          avgFitness: e.avgFitness ?? null,
          percentile75: e.percentile75 ?? null,
          percentile90: e.percentile90 ?? null,
          diversity: e.diversity ?? null
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.generation - b.generation);
  }

  function setRange(start, end) {
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.max(clampedStart, end);
    state.range = { start: clampedStart, end: clampedEnd };
    if (state.controls.startInput) state.controls.startInput.value = clampedStart;
    if (state.controls.endInput) state.controls.endInput.value = clampedEnd;
    render();
  }

  function syncRangeInputs() {
    const hasData = state.data.length > 0;
    const minGen = hasData ? state.data[0].generation : 0;
    const maxGen = hasData ? state.data[state.data.length - 1].generation : 0;
    state.range.start = Math.max(minGen, Math.min(state.range.start, maxGen));
    state.range.end = Math.max(state.range.start, Math.min(maxGen, state.range.end || maxGen));
    if (state.controls.startInput) {
      state.controls.startInput.min = String(minGen);
      state.controls.startInput.max = String(maxGen);
      state.controls.startInput.value = String(state.range.start);
    }
    if (state.controls.endInput) {
      state.controls.endInput.min = String(minGen);
      state.controls.endInput.max = String(maxGen);
      state.controls.endInput.value = String(state.range.end);
    }
  }

  function renderPlaceholder() {
    if (!state.svg) return;
    clearSvg();
    state.svg.setAttribute('viewBox', '0 0 360 220');
    const text = createSvgEl('text', {
      x: 180,
      y: 110,
      'text-anchor': 'middle',
      fill: COLORS.text,
      'font-size': 14,
      'font-weight': '600'
    });
    text.textContent = 'Ejecuta el GA para ver la distribución';
    state.svg.appendChild(text);
  }

  /**
   * Recalcula escalas y vuelve a dibujar el gr�fico seg�n el rango activo.
   * @returns {void}
   */
  function render() {
    if (!state.svg) return;
    if (!state.data.length) {
      renderPlaceholder();
      return;
    }
    const width = state.container?.clientWidth || 360;
    const height = 260;
    const margin = { top: 28, right: 18, bottom: 40, left: 58 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    state.svg.setAttribute('width', width);
    state.svg.setAttribute('height', height);
    state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clearSvg();
    state.hotspots = [];

    const filtered = getVisibleData();
    if (!filtered.length) {
      renderPlaceholder();
      return;
    }

    const yMax = computeYMax(filtered);
    drawGrid(width, height, margin, yMax);
    drawAxes(width, height, margin);
    drawLabels(width, height, margin);
    drawBars(filtered, margin, innerW, innerH, yMax);
    drawTrend(filtered, margin, innerW, innerH, yMax);
    drawTicks(filtered, width, height, margin, yMax);
  }

  function getVisibleData() {
    if (!state.data.length) return [];
    const start = state.range.start ?? state.data[0].generation;
    const end = state.range.end ?? state.data[state.data.length - 1].generation;
    const sliced = state.data.filter((d) => d.generation >= start && d.generation <= end);
    if (!state.cumulative) return sliced;
    let accImproving = 0;
    let accStable = 0;
    let accRegressing = 0;
    return sliced.map((d) => {
      accImproving += d.improving;
      accStable += d.stable;
      accRegressing += d.regressing;
      return {
        ...d,
        improving: accImproving,
        stable: accStable,
        regressing: accRegressing,
        populationSize: d.populationSize + (accImproving + accStable + accRegressing - (d.improving + d.stable + d.regressing))
      };
    });
  }

  function computeYMax(data) {
    const vals = [];
    data.forEach((d) => {
      ['populationSize', 'improving', 'stable', 'regressing'].forEach((key) => {
        const v = Number.isFinite(d[key]) ? d[key] : 0;
        vals.push(v);
      });
    });
    const max = Math.max(...vals, 5);
    return max * 1.1;
  }

  function drawGrid(width, height, margin, yMax) {
    const steps = 4;
    for (let i = 0; i <= steps; i += 1) {
      const y = margin.top + (height - margin.top - margin.bottom) * (i / steps);
      const line = createSvgEl('line', {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: COLORS.grid,
        'stroke-width': 1
      });
      state.svg.appendChild(line);
      const val = Math.round(yMax * (1 - (i / steps)));
      const label = createSvgEl('text', {
        x: margin.left - 10,
        y: y + 4,
        'text-anchor': 'end',
        fill: COLORS.axis,
        'font-size': 11
      });
      label.textContent = val;
      state.svg.appendChild(label);
    }
  }

  function drawAxes(width, height, margin) {
    const axisX = createSvgEl('line', {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: COLORS.axis,
      'stroke-width': 1.5
    });
    const axisY = createSvgEl('line', {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: COLORS.axis,
      'stroke-width': 1.5
    });
    state.svg.appendChild(axisX);
    state.svg.appendChild(axisY);
  }

  function drawLabels(width, height, margin) {
    const xLabel = createSvgEl('text', {
      x: margin.left + (width - margin.left - margin.right) / 2,
      y: height - 8,
      'text-anchor': 'middle',
      fill: COLORS.text,
      'font-size': 12,
      'font-weight': '600'
    });
    xLabel.textContent = 'Generaciones';
    const yLabel = createSvgEl('text', {
      x: 16,
      y: margin.top + (height - margin.top - margin.bottom) / 2,
      'text-anchor': 'middle',
      fill: COLORS.text,
      'font-size': 12,
      transform: `rotate(-90 16 ${margin.top + (height - margin.top - margin.bottom) / 2})`
    });
    yLabel.textContent = 'Cantidad de población';
    state.svg.appendChild(xLabel);
    state.svg.appendChild(yLabel);
  }

  function drawBars(data, margin, innerW, innerH, yMax) {
    const categories = [
      { key: 'improving', color: COLORS.improving },
      { key: 'stable', color: COLORS.stable },
      { key: 'regressing', color: COLORS.regressing }
    ];
    const step = innerW / Math.max(1, data.length);
    const barW = Math.max(6, Math.min(26, step / (categories.length + 0.4)));
    const gap = Math.max(2, barW * 0.18);

    data.forEach((entry, idx) => {
      const groupStart = margin.left + idx * step + (step / 2) - ((categories.length * barW + (categories.length - 1) * gap) / 2);
      categories.forEach((cat, catIdx) => {
        const value = entry[cat.key] || 0;
        const h = Math.min(innerH, (value / yMax) * innerH);
        const x = groupStart + catIdx * (barW + gap);
        const y = margin.top + innerH - h;
        const opacity = state.improvementMode && cat.key === 'stable' ? 0.4 : 0.9;
        const rect = createSvgEl('rect', {
          x,
          y,
          width: barW,
          height: h,
          rx: 3,
          ry: 3,
          fill: cat.color,
          'fill-opacity': opacity
        });
        state.svg.appendChild(rect);
        registerHotspot({
          type: 'bar',
          bounds: { x1: x, x2: x + barW, y1: y, y2: margin.top + innerH },
          entry,
          category: cat.key
        });
      });
    });
  }

  function drawTrend(data, margin, innerW, innerH, yMax) {
    const step = innerW / Math.max(1, data.length);
    const path = [];
    const circles = [];
    const smoothed = smoothSeries(data.map((d) => ({
      generation: d.generation,
      value: Number.isFinite(state.improvementMode ? d.improving : d.populationSize)
        ? (state.improvementMode ? d.improving : d.populationSize)
        : 0
    })));
    smoothed.forEach((point, idx) => {
      const x = margin.left + idx * step + step / 2;
      const y = margin.top + innerH - Math.min(innerH, (point.value / yMax) * innerH);
      path.push(idx === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
      circles.push({ x, y, entry: data[idx] });
    });
    const trendPath = createSvgEl('path', {
      d: path.join(' '),
      fill: 'none',
      stroke: COLORS.trend,
      'stroke-width': 2.2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    });
    state.svg.appendChild(trendPath);
    circles.forEach((pt) => {
      const c = createSvgEl('circle', {
        cx: pt.x,
        cy: pt.y,
        r: 3.2,
        fill: COLORS.trend,
        'fill-opacity': 0.85
      });
      state.svg.appendChild(c);
      registerHotspot({
        type: 'trend',
        bounds: { x1: pt.x - 6, x2: pt.x + 6, y1: pt.y - 6, y2: pt.y + 6 },
        entry: pt.entry,
        category: state.improvementMode ? 'improving' : 'population'
      });
    });
  }

  function drawTicks(data, width, height, margin, yMax) {
    const innerW = width - margin.left - margin.right;
    const step = innerW / Math.max(1, data.length);
    data.forEach((entry, idx) => {
      const x = margin.left + idx * step + step / 2;
      if (data.length <= 20 || idx === 0 || idx === data.length - 1 || idx % Math.ceil(data.length / 6) === 0) {
        const tick = createSvgEl('text', {
          x,
          y: height - margin.bottom + 14,
          'text-anchor': 'middle',
          fill: COLORS.axis,
          'font-size': 11
        });
        tick.textContent = entry.generation;
        state.svg.appendChild(tick);
      }
    });

    const summary = createSvgEl('text', {
      x: width - margin.right,
      y: margin.top - 8,
      'text-anchor': 'end',
      fill: COLORS.axis,
      'font-size': '11'
    });
    const last = data[data.length - 1];
    const popLabel = Number.isFinite(last.populationSize) ? last.populationSize : '--';
    const impLabel = Number.isFinite(last.improving) ? last.improving : '--';
    summary.textContent = `Pop: ${popLabel} • Mejora: ${impLabel}`;
    state.svg.appendChild(summary);
  }

  function smoothSeries(series) {
    if (series.length <= 2) return series;
    const smoothed = [];
    for (let i = 0; i < series.length; i += 1) {
      const prev = series[Math.max(0, i - 1)].value;
      const curr = series[i].value;
      const next = series[Math.min(series.length - 1, i + 1)].value;
      smoothed.push({
        generation: series[i].generation,
        value: (prev + curr + next) / 3
      });
    }
    return smoothed;
  }

  function handlePointerMove(evt) {
    if (!state.svg || !state.hotspots.length) return;
    const rect = state.svg.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const hit = state.hotspots.find((h) => x >= h.bounds.x1 && x <= h.bounds.x2 && y >= h.bounds.y1 && y <= h.bounds.y2);
    if (hit) {
      showTooltip(hit, evt.clientX, evt.clientY);
    } else {
      hideTooltip();
    }
  }

  function registerHotspot(hit) {
    state.hotspots.push(hit);
  }

  function showTooltip(hit, clientX, clientY) {
    if (!state.tooltip) return;
    const entry = hit.entry;
    const total = entry.populationSize || (entry.improving + entry.stable + entry.regressing);
    const improvingPct = total ? Math.round((entry.improving / total) * 100) : 0;
    const stablePct = total ? Math.round((entry.stable / total) * 100) : 0;
    const regPct = total ? Math.round((entry.regressing / total) * 100) : 0;
    const content = [
      `<strong>Generación ${entry.generation}</strong>`,
      `Población: ${total}`,
      `Mejoran: ${entry.improving} (${improvingPct}%)`,
      `Estables: ${entry.stable} (${stablePct}%)`,
      `Retroceden: ${entry.regressing} (${regPct}%)`,
      entry.bestFitness != null ? `Best fitness: ${formatNumber(entry.bestFitness)}` : '',
      entry.avgFitness != null ? `Avg fitness: ${formatNumber(entry.avgFitness)}` : '',
      entry.percentile90 != null ? `P90: ${formatNumber(entry.percentile90)}` : '',
      entry.diversity != null ? `Diversidad: ${formatNumber(entry.diversity)}` : ''
    ].filter(Boolean).join('<br>');
    state.tooltip.innerHTML = content;
    state.tooltip.classList.remove('hidden');
    const parentRect = state.container.getBoundingClientRect();
    const left = Math.min(parentRect.width - 180, Math.max(8, clientX - parentRect.left + 12));
    const top = Math.min(parentRect.height - 80, Math.max(8, clientY - parentRect.top - 10));
    state.tooltip.style.left = `${left}px`;
    state.tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    if (state.tooltip) {
      state.tooltip.classList.add('hidden');
    }
  }

  function clearSvg() {
    while (state.svg && state.svg.firstChild) {
      state.svg.removeChild(state.svg.firstChild);
    }
  }

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function formatNumber(n) {
    if (n == null || Number.isNaN(n)) return '--';
    if (Math.abs(n) >= 1000) return n.toFixed(0);
    return Number.parseFloat(n).toFixed(2);
  }

  window.populationChart = {
    init,
    setData,
    addSnapshot
  };
})();
