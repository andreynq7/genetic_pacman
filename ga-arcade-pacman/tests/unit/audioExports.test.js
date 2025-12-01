import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

let sandbox;

beforeEach(async () => {
  sandbox = createSandbox();
  // Stub Audio to avoid real playback in test
  sandbox.Audio = class { constructor() { this.paused = true; } play() { return Promise.resolve(); } pause() {} };
  await loadScripts(sandbox, [ 'game/audioManager.js' ]);
});

describe('audioManager exports', () => {
  it('exposes playOnceWithEnd on window.audioManager', () => {
    expect(typeof sandbox.audioManager.playOnceWithEnd).toBe('function');
  });
  it('exposes playOnce on window.audioManager', () => {
    expect(typeof sandbox.audioManager.playOnce).toBe('function');
  });
});

