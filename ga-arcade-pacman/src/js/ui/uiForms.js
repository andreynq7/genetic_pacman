// Basic form handling for parameter inputs.
(function() {
  /**
   * Pinta valores por defecto en los inputs del formulario de par�metros.
   * @param {Object} refs - Referencias devueltas por `uiLayout.getRefs()`.
   * @param {Object} config - Configuraci�n por defecto a usar como fallback.
   */
  function applyDefaults(refs, config) {
    if (!refs || !refs.inputs || !config) return;
    if (refs.inputs.population) refs.inputs.population.value = config.populationSize ?? '';
    if (refs.inputs.generations) refs.inputs.generations.value = config.generations ?? '';
    if (refs.inputs.selection) refs.inputs.selection.value = config.selectionRate ?? '';
    if (refs.inputs.crossover) refs.inputs.crossover.value = config.crossoverRate ?? '';
    if (refs.inputs.mutation) refs.inputs.mutation.value = config.mutationRate ?? '';
    if (refs.inputs.tournament) refs.inputs.tournament.value = config.tournamentSize ?? '';
    if (refs.inputs.seed) refs.inputs.seed.value = config.randomSeed ?? '';
    if (refs.inputs.fps) refs.inputs.fps.value = config.simulationFps ?? '';
    if (refs.inputs.episodes) refs.inputs.episodes.value = config.episodesPerIndividual ?? '';
    if (refs.inputs.workers) refs.inputs.workers.value = config.workerSize ?? '';
    if (refs.inputs.chunk) refs.inputs.chunk.value = config.chunkSize ?? '';
  }

  /**
   * Lee y convierte los parámetros del formulario a un objeto de configuración numérica.
   * No valida porcentajes; se asume que validateParametersForm se llamó antes.
   * @param {Object} refs
   * @param {Object} fallback valores por defecto opcionales
   */
  function readUIConfig(refs, fallback = {}) {
    if (!refs?.inputs) return {};
    const getNum = (el, defVal) => {
      const n = Number(el?.value);
      return Number.isFinite(n) ? n : defVal;
    };
    return {
      populationSize: getNum(refs.inputs.population, fallback.populationSize ?? 30),
      generations: getNum(refs.inputs.generations, fallback.generations ?? 20),
      selectionRate: getNum(refs.inputs.selection, fallback.selectionRate ?? 40),
      crossoverRate: getNum(refs.inputs.crossover, fallback.crossoverRate ?? 45),
      mutationRate: getNum(refs.inputs.mutation, fallback.mutationRate ?? 15),
      tournamentSize: getNum(refs.inputs.tournament, fallback.tournamentSize ?? 3),
      randomSeed: getNum(refs.inputs.seed, fallback.randomSeed ?? 1234),
      episodesPerIndividual: getNum(refs.inputs.episodes, fallback.episodesPerIndividual ?? 3),
      maxStepsPerEpisode: fallback.maxStepsPerEpisode ?? (window.gameConstants?.DEFAULTS?.stepLimit || 2000),
      workerSize: getNum(refs.inputs.workers, fallback.workerSize ?? 8),
      chunkSize: getNum(refs.inputs.chunk, fallback.chunkSize ?? 0)
    };
  }

  /**
   * Valida que los porcentajes de selecci�n/cruce/mutaci�n sumen ~100%.
   * Muestra u oculta el mensaje de error en la UI.
   * @param {Object} refs - Referencias de formulario.
   * @returns {boolean} True si la suma es v�lida.
   */
  function validateParametersForm(refs) {
    if (!refs || !refs.inputs) return true;
    const selection = Number(refs.inputs.selection.value) || 0;
    const crossover = Number(refs.inputs.crossover.value) || 0;
    const mutation = Number(refs.inputs.mutation.value) || 0;
    const sum = selection + crossover + mutation;
    const isValid = Math.abs(sum - 100) < 0.5;

    const errorEl = refs.validation?.percentageError;
    if (errorEl) {
      if (isValid) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
      } else {
        errorEl.classList.remove('hidden');
        errorEl.textContent = `La suma de porcentajes debe ser 100% (actual: ${sum.toFixed(1)}%)`;
      }
    }
    return isValid;
  }

  /**
   * Enlaza validaci�n en vivo y prevenci�n de submit al formulario de par�metros.
   * @param {Object} refs - Referencias de la UI.
   * @returns {void}
   */
  function bindFormValidation(refs) {
    if (!refs || !refs.inputs) return;
    const percentInputs = [refs.inputs.selection, refs.inputs.crossover, refs.inputs.mutation];
    percentInputs.forEach((input) => {
      if (input) {
        input.addEventListener('input', function() {
          validateParametersForm(refs);
        });
      }
    });

    if (refs.form) {
      refs.form.addEventListener('submit', function(evt) {
        evt.preventDefault();
        validateParametersForm(refs);
        console.log('Formulario enviado (stub)');
      });
    }
  }

  window.uiForms = {
    applyDefaults,
    validateParametersForm,
    bindFormValidation,
    readUIConfig
  };
})();
