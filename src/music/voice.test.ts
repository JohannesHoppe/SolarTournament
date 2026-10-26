import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A decoded sprite: just its length, in samples of a rate of 1. */
class FakeBuffer {
  readonly sampleRate = 1;
  constructor(readonly length: number) {}
  get duration() {
    return this.length;
  }
  getChannelData() {
    return new Float32Array(this.length);
  }
  copyToChannel() {}
}

/** The voice files as the server has them; `down` lists the sprites that fail to load. */
function serve(down: Set<string>) {
  return vi.fn((url: string) => {
    const sprite = /voice-(\w+)\./.exec(url)![1];
    if (down.has(sprite)) return Promise.reject(new Error('offline'));
    const manifest = { sampleRate: 1, version: '1', clips: { [`${sprite}:clip`]: [0, 1] } };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifest), arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
  });
}

describe('loading the voices', () => {
  let now = 0;
  beforeEach(() => {
    vi.resetModules();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('AudioBuffer', class extends FakeBuffer {
      constructor({ length }: { length: number }) {
        super(length);
      }
    });
    vi.stubGlobal('OfflineAudioContext', class {
      decodeAudioData = () => Promise.resolve(new FakeBuffer(2));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tries the language's sprite again after a pause once it failed, and keeps the radio's", async () => {
    const down = new Set(['en']);
    const fetch = serve(down);
    vi.stubGlobal('fetch', fetch);
    const { loadVoice } = await import('./voice');
    const first = await loadVoice();
    expect(first.partial).toBe(true);
    expect(Object.keys(first.clips)).toEqual(['radio:clip']);
    // wanted again at once: the same voice, nothing fetched
    const calls = fetch.mock.calls.length;
    expect(await loadVoice()).toBe(first);
    expect(fetch.mock.calls.length).toBe(calls);
    // after the pause, the language's sprite is there
    down.clear();
    now = 11000;
    const second = await loadVoice();
    expect(second.partial).toBeFalsy();
    expect(Object.keys(second.clips).sort()).toEqual(['en:clip', 'radio:clip']);
    // the radio's sprite was not loaded twice
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('voice-radio')).length).toBe(2);
    expect(await loadVoice()).toBe(second);
  });

  it('waits twice as long after each further failure', async () => {
    const fetch = serve(new Set(['en']));
    vi.stubGlobal('fetch', fetch);
    const { loadVoice } = await import('./voice');
    await loadVoice();
    now = 11000;
    await loadVoice();
    const tries = () => fetch.mock.calls.filter(([url]) => String(url).includes('voice-en')).length;
    expect(tries()).toBe(2);
    now = 25000;
    await loadVoice();
    expect(tries()).toBe(2);
    now = 32000;
    await loadVoice();
    expect(tries()).toBe(3);
  });
});
