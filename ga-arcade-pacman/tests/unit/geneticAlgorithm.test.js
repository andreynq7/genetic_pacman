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

describe('geneticAlgorithm', () => {
  it('ejecuta una generaci�n y actualiza historia', () => {
    const ga = sandbox.geneticAlgorithm;
    const cfg = ga.createGAConfig(tinyGAConfig);
    const state = ga.createGAState(cfg);
    const { best, avg } = ga.runGeneration(state);
    expect(state.generation).toBe(1);
    expect(state.history.bestFitness).toHaveLength(1);
    expect(state.history.avgFitness).toHaveLength(1);
    expect(best.fitness).toBeDefined();
    expect(avg).toBeTypeOf('number');
  });

  it('conserva mejor individuo en bestEver', () => {
    const ga = sandbox.geneticAlgorithm;
    const cfg = ga.createGAConfig(tinyGAConfig);
    const state = ga.createGAState(cfg);
    ga.runGeneration(state);
    const firstBest = state.bestEver;
    ga.runGeneration(state);
    expect(state.bestEver.fitness).toBeGreaterThanOrEqual(firstBest.fitness);
  });

  it('registra mejor individuo por generacin en history.bestIndividuals', () => {
    const ga = sandbox.geneticAlgorithm;
    const cfg = ga.createGAConfig(tinyGAConfig);
    const state = ga.createGAState(cfg);
    ga.runGeneration(state);
    ga.runGeneration(state);
    const hist = ga.getHistory(state);
    expect(Array.isArray(hist.bestIndividuals)).toBe(true);
    expect(hist.bestIndividuals.length).toBeGreaterThanOrEqual(2);
    const entry = hist.bestIndividuals[0];
    expect(entry.generation).toBeDefined();
    expect(entry.fitness).toBeDefined();
  });
});
