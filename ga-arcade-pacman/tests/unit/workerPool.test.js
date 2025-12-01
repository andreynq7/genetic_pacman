import { describe, it, expect } from 'vitest';
import { createSandbox, loadScripts } from '../helpers/harness.js';

class FakeWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
  }

  postMessage(msg) {
    if (msg.type === 'ga-worker/init') {
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: 'ga-worker/ready', payload: { workerId: msg.payload?.workerId } } });
      });
    } else if (msg.type === 'ga-worker/evaluate-chunk') {
      const res = (msg.payload?.items || []).map((item) => ({
        index: item.index,
        fitness: 1,
        evalStats: { ok: true }
      }));
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'ga-worker/result',
            id: msg.id,
            payload: { results: res, chunkId: msg.payload?.chunkId, generation: msg.payload?.generation }
          }
        });
      });
    }
  }

  terminate() {}
}

describe('workerPool', () => {
  it('procesa chunks y devuelve resultados agregados', async () => {
    const sandbox = createSandbox({ Worker: FakeWorker });
    await loadScripts(sandbox, ['ga/workerMessages.js', 'ga/workerPool.js']);
    const pool = sandbox.gaWorkerPool.createWorkerPool({ size: 1, chunkSize: 2 });
    const items = [
      { index: 0, chromosome: [0], fitnessConfig: {} },
      { index: 1, chromosome: [0], fitnessConfig: {} },
      { index: 2, chromosome: [0], fitnessConfig: {} }
    ];
    const results = await pool.evaluateChromosomes(items, { generation: 0, chunkSize: 2 });
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ fitness: 1, evalStats: { ok: true } });
    pool.terminate();
  });

  it('rechaza jobs cuando el worker env�a ERROR', async () => {
    class ErrorWorker extends FakeWorker {
      postMessage(msg) {
        if (msg.type === 'ga-worker/init') {
          queueMicrotask(() => this.onmessage?.({ data: { type: 'ga-worker/ready', payload: { workerId: msg.payload?.workerId } } }));
        } else if (msg.type === 'ga-worker/evaluate-chunk') {
          queueMicrotask(() => this.onmessage?.({
            data: { type: 'ga-worker/error', id: msg.id, payload: { message: 'fail' } }
          }));
        }
      }
    }
    const sandbox = createSandbox({ Worker: ErrorWorker });
    await loadScripts(sandbox, ['ga/workerMessages.js', 'ga/workerPool.js']);
    const pool = sandbox.gaWorkerPool.createWorkerPool({ size: 1, chunkSize: 2 });
    const promise = pool.evaluateChromosomes([{ index: 0, chromosome: [], fitnessConfig: {} }], { generation: 0 });
    await expect(promise).rejects.toThrow('fail');
    pool.terminate();
  });
});
