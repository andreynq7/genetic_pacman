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

describe('fitnessEvaluator', () => {
  it('produce fitness reproducible con misma semilla', () => {
    const cfg = sandbox.fitnessEvaluator.createFitnessConfig({
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 80,
      baseSeed: 777
    });
    const first = sandbox.fitnessEvaluator.evaluateChromosome(smallChromosome, cfg);
    const second = sandbox.fitnessEvaluator.evaluateChromosome(smallChromosome, cfg);
    expect(first.fitness).toBeCloseTo(second.fitness, 6);
  });

  it('respeta maxStepsPerEpisode en evaluaci�n', () => {
    const cfg = sandbox.fitnessEvaluator.createFitnessConfig({
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 10,
      baseSeed: 1
    });
    const result = sandbox.fitnessEvaluator.evaluateChromosome(smallChromosome, cfg);
    expect(result.episodes[0].steps).toBeLessThanOrEqual(10);
  });
});
