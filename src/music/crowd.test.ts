import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Crowd } from './crowd';

/** A gain's scheduled targets, as [value, start time]. */
type Targets = [number, number][];

/** Just enough of an AudioContext for the crowd: gains that record what they are told, nodes that connect. */
function fakeContext() {
  const gains: Targets[] = [];
  const node = () => ({ connect: (next: unknown) => next });
  const context = {
    currentTime: 0,
    createGain: () => {
      const targets: Targets = [];
      gains.push(targets);
      return {
        ...node(),
        gain: {
          value: 0,
          setTargetAtTime: (value: number, at: number) => targets.push([value, at]),
          cancelScheduledValues: (from: number) => targets.splice(0, targets.length, ...targets.filter(([, at]) => at < from)),
        },
      };
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: { value: 0 } }),
    decodeAudioData: () => new Promise(() => {}),
  };
  return { context: context as unknown as AudioContext, gains, clock: context };
}

/** The last target a gain was told, as of `at`. */
const last = (targets: Targets, at = Infinity) => targets.filter(([, start]) => start <= at).at(-1)?.[0] ?? 0;

describe('the crowd on the broadcast', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { baseURI: 'http://localhost/' });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stays silent off air, whatever a moment cues', () => {
    const { context, gains } = fakeContext();
    const crowd = new Crowd(context, {} as AudioNode);
    crowd.swell(1, 0.2, 3);
    crowd.erupt();
    expect(gains[0]).toEqual([]);
    expect(gains[1]).toEqual([]);
  });

  it('murmurs on air, hushes off it (a pause, a sponsor break) and comes back', () => {
    const { context, gains } = fakeContext();
    const crowd = new Crowd(context, {} as AudioNode);
    crowd.air(true);
    expect(last(gains[0])).toBeGreaterThan(0);
    crowd.air(false);
    expect(last(gains[0])).toBe(0);
    expect(last(gains[1])).toBe(0);
    crowd.air(true);
    expect(last(gains[0])).toBeGreaterThan(0);
  });

  it('cheers the end of a round, then fades out, and wakes for no later cheer', () => {
    const { context, gains, clock } = fakeContext();
    const crowd = new Crowd(context, {} as AudioNode);
    crowd.air(true);
    clock.currentTime = 10;
    crowd.finale();
    const cheer = last(gains[0], 10);
    expect(cheer).toBeGreaterThan(0.5);
    expect(last(gains[0])).toBe(0);
    expect(last(gains[1])).toBe(0);
    const told = gains[0].length;
    crowd.swell(1, 0.2);
    crowd.air(false);
    expect(gains[0].length).toBe(told);
    // leaving to the menu cuts the fading cheer short
    clock.currentTime = 11;
    crowd.hush();
    expect(last(gains[0])).toBe(0);
    expect(gains[0].filter(([value, at]) => at >= 11 && value > 0)).toEqual([]);
  });

  it('takes a failed answer for no recording, and tries again only after a pause', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
    vi.stubGlobal('fetch', fetch);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { context } = fakeContext();
    const decode = vi.spyOn(context, 'decodeAudioData');
    const crowd = new Crowd(context, {} as AudioNode);
    crowd.air(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
    // every cheer of the next seconds asks for nothing
    for (let i = 0; i < 5; i++) crowd.swell(1, 0.2);
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 11000;
    crowd.swell(1, 0.2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(2);
    // the next pause is twice as long
    now = 25000;
    crowd.swell(1, 0.2);
    expect(fetch).toHaveBeenCalledTimes(2);
    now = 32000;
    crowd.swell(1, 0.2);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});
