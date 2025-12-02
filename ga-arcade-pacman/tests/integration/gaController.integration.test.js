import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

let sandbox;

beforeEach(async () => {
  vi.useFakeTimers();
  sandbox = createSandbox();
  await loadScripts(sandbox, [
    'game/gameConstants.js',
    'game/gameState.js',
    'game/gameLogic.js',
    'game/episodeSimulator.js',
    'agent/policyEncoding.js',
    'ga/fitnessEvaluator.js',
    'ga/geneticAlgorithm.js',
    'ga/gaController.js'
  ]);
});

describe('gaController integration', () => {
  it('corre generaciones y emite callbacks sin workers', async () => {
    const events = [];
    const onFinish = vi.fn();
    const uiConfig = {
      populationSize: 4,
      generations: 2,
      selectionRate: 40,
      crossoverRate: 40,
      mutationRate: 20,
      tournamentSize: 2,
      randomSeed: 5,
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 50
    };
    sandbox.gaController.initializeFromUI(uiConfig);
    sandbox.gaController.start((info) => events.push(info), onFinish);
    await vi.runAllTimersAsync();
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(events.at(-1).generation).toBe(uiConfig.generations);
  });

  it('pausa, reanuda y termina en finished', async () => {
    const uiConfig = {
      populationSize: 3,
      generations: 1,
      selectionRate: 40,
      crossoverRate: 40,
      mutationRate: 20,
      tournamentSize: 2,
      randomSeed: 3,
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 20
    };
    sandbox.gaController.initializeFromUI(uiConfig);
    sandbox.gaController.start();
    sandbox.gaController.pause();
    expect(sandbox.gaController.getStatus().status).toBe('paused');
    sandbox.gaController.resume();
    expect(sandbox.gaController.getStatus().status).toBe('running');
    await vi.runAllTimersAsync();
    expect(sandbox.gaController.getStatus().status).toBe('finished');
  });

  it('usa workerPool y emite progreso durante evaluacin', async () => {
    const progress = [];
    const pool = {
      evaluateChromosomes: vi.fn(async (tasks) => tasks.map((t) => ({ index: t.index, fitness: 1, evalStats: { ok: true } }))),
      terminate: vi.fn(),
      size: 1
    };
    sandbox.gaWorkerPool = { createWorkerPool: vi.fn(() => pool) };
    globalThis.gaWorkerPool = sandbox.gaWorkerPool;
    const uiConfig = {
      populationSize: 3,
      generations: 1,
      selectionRate: 40,
      crossoverRate: 40,
      mutationRate: 20,
      tournamentSize: 2,
      randomSeed: 5,
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 20
    };
    sandbox.gaController.initializeFromUI(uiConfig);
    sandbox.gaController.start(() => {}, () => {}, (evt) => progress.push(evt));
    await vi.runAllTimersAsync();
    expect(pool.evaluateChromosomes).toHaveBeenCalledTimes(1);
    expect(progress.some((p) => p?.stage === 'evaluation')).toBe(true);
  });

  it('retorna el mejor individuo final y coincide con el mximo de history', async () => {
    const uiConfig = {
      populationSize: 5,
      generations: 3,
      selectionRate: 40,
      crossoverRate: 40,
      mutationRate: 20,
      tournamentSize: 2,
      randomSeed: 7,
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 50
    };
    sandbox.gaController.initializeFromUI(uiConfig);
    let summary = null;
    sandbox.gaController.start(() => {}, (s) => { summary = s; });
    await vi.runAllTimersAsync();
    const finalBest = sandbox.gaController.getFinalBest();
    expect(summary).toBeTruthy();
    expect(finalBest).toBeTruthy();
    expect(summary.bestEver?.fitness).toBe(finalBest.fitness);
    const hist = sandbox.gaController.getHistory();
    const maxHist = Math.max(...hist.bestFitness);
    expect(finalBest.fitness).toBeCloseTo(maxHist, 6);
  });

  it('verifica selección y consistencia del demo sin modificar población', async () => {
    const uiConfig = {
      populationSize: 6,
      generations: 3,
      selectionRate: 40,
      crossoverRate: 40,
      mutationRate: 20,
      tournamentSize: 2,
      randomSeed: 11,
      episodesPerIndividual: 1,
      maxStepsPerEpisode: 40
    };
    sandbox.gaController.initializeFromUI(uiConfig);
    sandbox.gaController.start(() => {}, () => {});
    await vi.runAllTimersAsync();
    const beforePop = sandbox.gaController.getStatus().generation;
    const verify = sandbox.gaController.verifyBestSelection();
    expect(verify.consistent).toBe(true);
    const demo1 = sandbox.gaController.verifyDemoSelectionAndLog();
    const demo2 = sandbox.gaController.verifyDemoSelectionAndLog();
    expect(demo1.hash).toBe(demo2.hash);
    const afterPop = sandbox.gaController.getStatus().generation;
    expect(afterPop).toBe(beforePop);
  });
});
