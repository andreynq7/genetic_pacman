import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';
import { tinyGAConfig } from '../data/mockConfig.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  await loadScripts(sandbox, [
    'game/gameConstants.js',
    'game/gameState.js',
    'game/gameLogic.js',
    'game/episodeSimulator.js',
    'agent/policyEncoding.js',
    'ga/fitnessEvaluator.js',
    'ga/geneticAlgorithm.js'
  ]);
});

describe('GA regresi�n y reproducibilidad', () => {
  it('mismas semillas producen mejor fitness consistente', () => {
    const ga = sandbox.geneticAlgorithm;
    const cfgA = ga.createGAConfig(tinyGAConfig);
    const cfgB = ga.createGAConfig(tinyGAConfig);
    const run = (cfg) => {
      const st = ga.createGAState(cfg);
      ga.runGeneration(st);
      return st.bestEver.fitness;
    };
    const fa = run(cfgA);
    const fb = run(cfgB);
    expect(fa).toBeCloseTo(fb, 5);
  });
});
