import { describe, it, expect } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

describe('workerMessages', () => {
  it('expone tipos de mensaje esperados', async () => {
    const sandbox = createSandbox();
    await loadScripts(sandbox, ['ga/workerMessages.js']);
    const MSG = sandbox.gaWorkerMessages;
    expect(MSG).toBeDefined();
    expect(MSG).toMatchObject({
      INIT: expect.any(String),
      READY: expect.any(String),
      EVALUATE_CHUNK: expect.any(String),
      RESULT: expect.any(String),
      ERROR: expect.any(String),
      LOG: expect.any(String)
    });
  });
});
