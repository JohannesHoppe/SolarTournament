import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Radio } from './radio';
import { barSeconds, ROUND_SECONDS, STEPS_PER_BAR } from './songs';

/** Just enough of an AudioContext for the radio: a clock that runs when told, nodes that connect, params that take anything. */
function fakeContext() {
  const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect: (next: unknown) => next, gain: param(), frequency: param(), type: '' });
  return { currentTime: 0, state: 'running', createGain: node, createBiquadFilter: node } as unknown as AudioContext & { currentTime: number };
}

/** A band that only notes which steps it was handed. */
function fakeBand(played: number[]) {
  return { voiceUntil: 0, prepare() {}, joinBar() {}, speak() {}, announce() {}, play: (_song: unknown, step: number) => played.push(step) };
}

describe("the radio's scheduler", () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A radio on a track from audio time 0, its steps handed to `played`; `run(seconds, every)` runs the page with a tick every `every` seconds. */
  function radio(played: number[]) {
    now = 0;
    const context = fakeContext();
    const r = new Radio(context, context as unknown as AudioNode, () => {}, () => {}, false);
    Object.assign(r, { band: fakeBand(played), voiced: true });
    r.setCue({ title: 'Orbit Terror', energy: 'round', elapsed: 0, roundLength: ROUND_SECONDS });
    const tick = (r as unknown as { tick: () => void }).tick.bind(r);
    const run = (seconds: number, every: number) => {
      for (const end = now + seconds * 1000; now < end; ) {
        now += every * 1000;
        context.currentTime = now / 1000;
        tick();
      }
    };
    return { r, run };
  }

  /** Steps missing from the run of steps the band was handed. */
  const missing = (played: number[]) => played.slice(1).reduce((sum, step, i) => sum + step - played[i] - 1, 0);

  it('keeps the short lookahead while the page ticks on time, and loses no step', () => {
    const played: number[] = [];
    const { r, run } = radio(played);
    run(20, 0.04);
    expect(r.lookahead).toBe(0.2);
    expect(missing(played)).toBe(0);
    const sixteenth = barSeconds(r.song!) / STEPS_PER_BAR;
    expect(played.length).toBeGreaterThan(20 / sixteenth - 2);
  });

  it("schedules further ahead while a phone's long frames hold the page, so no note is lost after the first", () => {
    const played: number[] = [];
    const { r, run } = radio(played);
    run(2, 0.04);
    // the first long frame costs the notes it held up: the scheduler cannot know it ahead
    run(0.6, 0.6);
    const before = played.length;
    const lost = missing(played);
    run(20, 0.6);
    expect(r.lookahead).toBeGreaterThanOrEqual(0.6);
    expect(r.lookahead).toBeLessThanOrEqual(1);
    expect(missing(played)).toBe(lost);
    expect(played.length).toBeGreaterThan(before);
  });

  it('forgets a hitch: back to the short lookahead within twenty seconds of it', () => {
    const played: number[] = [];
    const { r, run } = radio(played);
    run(1, 0.04);
    run(0.7, 0.7);
    expect(r.lookahead).toBeGreaterThan(0.8);
    run(30, 0.04);
    expect(r.lookahead).toBe(0.2);
    expect(missing(played)).toBeGreaterThan(0);
  });

  it('never schedules further ahead than a second, even in a tab the browser ticks once a second or slower', () => {
    const played: number[] = [];
    const { r, run } = radio(played);
    run(10, 2);
    expect(r.lookahead).toBe(1);
  });
});
