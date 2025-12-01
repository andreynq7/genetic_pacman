import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  await loadScripts(sandbox, [
    'game/gameConstants.js',
    'game/gameState.js',
    'game/gameLogic.js'
  ]);
});

describe('gameLogic', () => {
  it('consume pellet y actualiza score/contador', () => {
    const state = sandbox.gameState.createInitialState();
    state.pacman.col = 1;
    state.pacman.row = 1;
    state.map[1][1] = sandbox.gameConstants.TILE_TYPES.PELLET;
    const { state: next, reward } = sandbox.gameLogic.stepGame(state, sandbox.gameConstants.ACTIONS.STAY);
    expect(next.map[1][1]).toBe(sandbox.gameConstants.TILE_TYPES.PATH);
    expect(reward).toBeGreaterThan(0);
    expect(next.pelletsRemaining).toBeLessThan(state.pelletsRemaining);
  });

  it('aplica power pellet y asusta fantasmas', () => {
    const state = sandbox.gameState.createInitialState();
    state.pacman.col = 2;
    state.pacman.row = 1;
    state.map[1][2] = sandbox.gameConstants.TILE_TYPES.POWER;
    const { state: next } = sandbox.gameLogic.stepGame(state, sandbox.gameConstants.ACTIONS.STAY);
    expect(next.powerTimer).toBeGreaterThan(0);
    expect(next.ghosts.every((g) => g.frightenedTimer > 0)).toBe(true);
  });

  it('maneja colisi�n letal con fantasma', () => {
    const state = sandbox.gameState.createInitialState();
    // Forzar colisi�n inmediata
    state.ghosts[0].col = state.pacman.col;
    state.ghosts[0].row = state.pacman.row;
    const { state: next, done } = sandbox.gameLogic.stepGame(state, sandbox.gameConstants.ACTIONS.STAY);
    expect(next.lives).toBeLessThan(state.lives);
    expect(done).toBe(false); // life_lost con vidas restantes no termina episodio
    expect(next.status === 'life_lost' || next.status === 'running').toBe(true);
  });

  it('aplica estado stalled al superar umbral de estancamiento', () => {
    const state = sandbox.gameState.createInitialState();
    state.stepsSinceLastPellet = (sandbox.gameConstants.STALL?.HARD_STOP_THRESHOLD || 200) + 1;
    const { state: next, done } = sandbox.gameLogic.stepGame(state, sandbox.gameConstants.ACTIONS.STAY);
    expect(next.status).toBe('stalled');
    expect(done).toBe(true);
  });

  it('termina por step_limit y expira power mode', () => {
    const state = sandbox.gameState.createInitialState({ stepLimit: 1 });
    state.powerTimer = 1;
    state.ghosts.forEach((g) => { g.frightenedTimer = 1; g.eatenThisPower = true; });
    const { state: next, done } = sandbox.gameLogic.stepGame(state, sandbox.gameConstants.ACTIONS.STAY);
    expect(next.status).toBe('step_limit');
    expect(done).toBe(true);
    expect(next.powerTimer).toBe(0);
    expect(next.ghosts.every((g) => g.frightenedTimer === 0 && g.eatenThisPower === false)).toBe(true);
  });
});
