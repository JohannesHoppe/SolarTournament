import { afterEach, describe, expect, it, vi } from 'vitest';
import { bakeReliefMaps } from './rocks';

/** A worker that never answers, and counts how many were started and stopped. */
function silentWorkers() {
  const state = { started: 0, terminated: 0 };
  vi.stubGlobal('Worker', class {
    onmessage = null;
    onerror = null;
    onmessageerror: (() => void) | null = null;
    constructor() {
      state.started++;
    }
    terminate() {
      state.terminated++;
    }
    postMessage() {}
  });
  return state;
}

describe('baking the relief maps in background workers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('gives up workers that stay silent instead of holding the load for ever', async () => {
    vi.useFakeTimers();
    const state = silentWorkers();
    let done = false;
    const baking = bakeReliefMaps().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(30000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(31000);
    await baking;
    expect(done).toBe(true);
    expect(state.terminated).toBe(state.started);
  });

  it('gives a worker up whose message cannot be read', async () => {
    const made: { onmessageerror: (() => void) | null }[] = [];
    vi.stubGlobal('Worker', class {
      onmessage = null;
      onerror = null;
      onmessageerror: (() => void) | null = null;
      constructor() {
        made.push(this);
      }
      terminate() {}
      postMessage() {
        queueMicrotask(() => this.onmessageerror?.());
      }
    });
    await bakeReliefMaps();
    expect(made.length).toBeGreaterThan(0);
  });
});
