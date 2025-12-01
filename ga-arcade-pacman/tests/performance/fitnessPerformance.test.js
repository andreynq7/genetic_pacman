import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';
import { smallChromosome } from '../data/mockConfig.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  await loadScripts(sandbox, [
    'game/gameConstants.js',
    'game/gameState.js',
    'game/gameLogic.js',
    'game/episodeSimulator.js',
    'agent/policyEncoding.js',
    'ga/fitnessEvaluator.js'
  ]);
});

describe('Performance', () => {
  it('eval�a un cromosoma corto dentro de l�mite de tiempo', () => {
    const cfg = sandbox.fitnessEvaluator.createFitnessConfig({
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 60,
      baseSeed: 9
    });
    const t0 = performance.now();
    sandbox.fitnessEvaluator.evaluateChromosome(smallChromosome, cfg);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
