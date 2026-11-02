import { describe, expect, it } from 'vitest';
import { lapClock, LapTimer, parseLaps } from './laps';
import { GATES } from './race';

/** Flies a lap of `seconds` from race time `start`: a gate every `seconds / GATES`. */
function lap(timer: LapTimer, start: number, seconds: number) {
  const events = [];
  for (let gate = 1; gate < GATES; gate++) events.push(timer.pass(gate, start + (gate * seconds) / GATES));
  events.push(timer.pass(0, start + seconds));
  return events;
}

describe('a lap time', () => {
  it('reads as minutes and seconds to the hundredth, never as 60 seconds', () => {
    expect(lapClock(62.345)).toBe('1:02.35');
    expect(lapClock(59.996)).toBe('1:00.00');
    expect(lapClock(9.5)).toBe('0:09.50');
  });
});

describe('the lap timer', () => {
  it('times laps from the pink gate round to the pink gate, and keeps the best', () => {
    const timer = new LapTimer(null);
    expect(timer.pass(3, 1)).toBeNull();
    expect(timer.pass(0, 2)).toEqual({ kind: 'start' });
    const first = lap(timer, 2, 60);
    expect(first.at(-1)).toEqual({ kind: 'lap', time: 60, delta: null, best: true });
    // a slower lap is behind at every gate and leaves the best as it is
    const second = lap(timer, 62, 64);
    expect(second.slice(0, -1).every((event) => event?.kind === 'split' && event.delta! > 0)).toBe(true);
    expect(second.at(-1)).toMatchObject({ kind: 'lap', delta: 4, best: false });
    expect(timer.best!.time).toBe(60);
    // a faster one is ahead and becomes the best
    const third = lap(timer, 126, 55);
    expect(third.at(-1)).toMatchObject({ kind: 'lap', delta: -5, best: true });
    expect(timer.best!.time).toBe(55);
  });

  it('keeps only best laps that make sense, and of them only time and splits', () => {
    const good = { time: 60, splits: new Array(GATES).fill(1) };
    const kept = JSON.stringify({ belt: { ...good, ghost: [0, 0, 0, 0, 0, 0, 1] }, rings: { time: -1, splits: [] }, hole: { ...good, splits: [1, 2] } });
    expect(parseLaps(kept)).toEqual({ belt: good });
    expect(parseLaps('not json')).toEqual({});
    expect(parseLaps(null)).toEqual({});
  });
});
