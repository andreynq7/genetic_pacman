import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  await loadScripts(sandbox, [
    'game/gameConstants.js',
    'game/gameState.js',
    'game/gameLogic.js',
    'agent/policyEncoding.js'
  ]);
});

describe('policyEncoding', () => {
  it('crea cromosomas del tama�o y rango esperados', () => {
    const chrom = sandbox.policyEncoding.createRandomChromosome();
    expect(chrom).toHaveLength(sandbox.policyEncoding.NUM_GENES);
    expect(Math.max(...chrom)).toBeLessThanOrEqual(sandbox.policyEncoding.GENE_RANGE.max);
    expect(Math.min(...chrom)).toBeGreaterThanOrEqual(sandbox.policyEncoding.GENE_RANGE.min);
  });

  it('normalizeChromosome clampa y respeta longitud', () => {
    const raw = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 99 : -99));
    const norm = sandbox.policyEncoding.normalizeChromosome(raw);
    expect(norm).toHaveLength(sandbox.policyEncoding.NUM_GENES);
    expect(Math.max(...norm)).toBeLessThanOrEqual(sandbox.policyEncoding.GENE_RANGE.max);
    expect(Math.min(...norm)).toBeGreaterThanOrEqual(sandbox.policyEncoding.GENE_RANGE.min);
  });

  it('policyFromChromosome devuelve acciones legales y respeta desempate first', () => {
    const state = sandbox.gameState.createInitialState();
    // Colocar a Pac-Man en una celda de camino con vecinos libres
    state.pacman.col = 1;
    state.pacman.row = 1;
    const chrom = Array(sandbox.policyEncoding.NUM_GENES).fill(0);
    const policy = sandbox.policyEncoding.policyFromChromosome(chrom, { tieBreak: 'first' });
    const action = policy(state);
    const legal = sandbox.policyEncoding.getLegalActions(state);
    expect(legal).toContain(action);
  });

  it('evaluateAction penaliza acciones ilegales', () => {
    const state = sandbox.gameState.createInitialState();
    state.pacman.col = 0;
    state.pacman.row = 0; // esquina en muro
    const chrom = Array(sandbox.policyEncoding.NUM_GENES).fill(1);
    const score = sandbox.policyEncoding.evaluateAction(chrom, state, sandbox.gameConstants.ACTIONS.LEFT);
    expect(score).toBeLessThan(-1e5 / 2);
  });
});
