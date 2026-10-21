import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GHOST_STEP, LapTimer, parseLaps } from './laps';
import { GATES } from './race';

/** Flies a lap of `seconds` from race time `start`: a gate every `seconds / GATES`, the ship moving along x at 100 units/s. */
function lap(timer: LapTimer, start: number, seconds: number) {
  const events = [];
  for (let t = start; t < start + seconds; t += GHOST_STEP / 2) timer.record(t, new THREE.Vector3(t * 100, 0, 0), new THREE.Quaternion());
  for (let gate = 1; gate < GATES; gate++) events.push(timer.pass(gate, start + (gate * seconds) / GATES));
  events.push(timer.pass(0, start + seconds));
  return events;
}

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

  it('flies the best lap again as a ghost', () => {
    const timer = new LapTimer(null);
    timer.pass(0, 0);
    lap(timer, 0, 60);
    const position = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    // the next lap began at 60: ten seconds into it, the ghost is where the ship was ten seconds into the best
    expect(timer.ghostAt(70, position, orientation)).toBe(true);
    expect(position.x).toBeCloseTo(1000, -1);
    // past the end of the best lap there is no ghost
    expect(timer.ghostAt(200, position, orientation)).toBe(false);
  });

  it('keeps only best laps that make sense', () => {
    const good = { time: 60, splits: new Array(GATES).fill(1), ghost: [0, 0, 0, 0, 0, 0, 1] };
    const kept = JSON.stringify({ belt: good, rings: { time: -1, splits: [], ghost: [] }, hole: { ...good, ghost: [1, 2] } });
    expect(Object.keys(parseLaps(kept))).toEqual(['belt']);
    expect(parseLaps('not json')).toEqual({});
    expect(parseLaps(null)).toEqual({});
  });
});
