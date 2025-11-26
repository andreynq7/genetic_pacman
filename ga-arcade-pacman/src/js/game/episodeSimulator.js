/**
 * Simulador de episodios para pruebas rápidas o para el AG.
 * Permite correr pasos con una política o con una lista fija de acciones.
 */
(function() {
  const C = window.gameConstants;
  const STATE = window.gameState;
  const LOGIC = window.gameLogic;

  /**
   * Corre un episodio hasta done o hasta maxSteps usando una política.
   * @param {(state:Object, step:number)=>string} policyFn Devuelve una acción.
   * @param {{initialState?:Object,maxSteps?:number}} [options]
   * @returns {{finalState:Object,totalReward:number,steps:number,history:Array}}
   */
  function runEpisode(policyFn, options = {}) {
    let current = options.initialState ? STATE.cloneState(options.initialState) : STATE.createInitialState();
    const maxSteps = options.maxSteps ?? C.DEFAULTS.stepLimit;
    let totalReward = 0;
    const history = [];

    for (let i = 0; i < maxSteps; i += 1) {
      const action = policyFn ? policyFn(current, i) : LOGIC.getRandomAction(current);
      const result = LOGIC.stepGame(current, action);
      current = result.state;
      totalReward += result.reward;
      history.push({ step: i, action, reward: result.reward, done: result.done });
      if (result.done) break;
    }

    return {
      finalState: current,
      totalReward,
      steps: history.length,
      history
    };
  }

  /**
   * Corre un episodio con una secuencia fija de acciones.
   * @param {string[]} actions
   * @param {{initialState?:Object}} [options]
   */
  function simulateWithActions(actions, options = {}) {
    let current = options.initialState ? STATE.cloneState(options.initialState) : STATE.createInitialState();
    let totalReward = 0;
    const history = [];

    for (let i = 0; i < actions.length; i += 1) {
      const result = LOGIC.stepGame(current, actions[i]);
      current = result.state;
      totalReward += result.reward;
      history.push({ step: i, action: actions[i], reward: result.reward, done: result.done });
      if (result.done) break;
    }

    return { finalState: current, totalReward, steps: history.length, history };
  }

  window.episodeSimulator = {
    runEpisode,
    simulateWithActions
  };
})();
