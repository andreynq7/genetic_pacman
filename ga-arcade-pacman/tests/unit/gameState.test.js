import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  await loadScripts(sandbox, ['game/gameConstants.js', 'game/gameState.js']);
});

describe('gameState', () => {
  it('normalizeLevel convierte strings a matrices mutables', () => {
    const level = ['W.W', 'W.W'];
    const matrix = sandbox.gameState.normalizeLevel(level);
    expect(matrix[0][1]).toBe('.');
    matrix[0][1] = 'X';
    expect(level[0][1]).toBe('.');
  });

  it('createInitialState inicializa contadores y spawns', () => {
    const state = sandbox.gameState.createInitialState();
    expect(state.pacman).toBeDefined();
    expect(state.ghosts.length).toBeGreaterThan(0);
    expect(state.pelletsRemaining).toBeGreaterThan(0);
    expect(state.status).toBe('running');
  });
});
