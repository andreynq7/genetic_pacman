// Basic form handling for parameter inputs.
(function() {
  function applyDefaults(refs, config) {
    if (!refs || !refs.inputs || !config) return;
    refs.inputs.population.value = config.populationSize ?? '';
    refs.inputs.generations.value = config.generations ?? '';
    refs.inputs.selection.value = config.selectionRate ?? '';
    refs.inputs.crossover.value = config.crossoverRate ?? '';
    refs.inputs.mutation.value = config.mutationRate ?? '';
    refs.inputs.tournament.value = config.tournamentSize ?? '';
    refs.inputs.seed.value = config.randomSeed ?? '';
    refs.inputs.fps.value = config.simulationFps ?? '';
    refs.inputs.episodes.value = config.episodesPerIndividual ?? '';
  }

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
    bindFormValidation
  };
})();
