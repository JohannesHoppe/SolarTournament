import { describe, expect, it } from 'vitest';
import { PolySynth } from 'tone';
import { onTime } from './band';

describe("the band's chords", () => {
  it('reach the audio clock the moment they are played, however far ahead', () => {
    const started: number[] = [];
    const released: number[] = [];
    const deferred: number[] = [];
    // PolySynth's own scheduling over a clock at 0 s with Tone's lookahead of 0.1 s
    const poly = Object.assign(Object.create(PolySynth.prototype), {
      now: () => 0.1,
      toSeconds: (time: number) => time,
      context: { setTimeout: (_fn: () => void, delay: number) => deferred.push(delay) },
      _triggerAttack: (_notes: unknown, time: number) => started.push(time),
      _triggerRelease: (_notes: unknown, time: number) => released.push(time),
    }) as PolySynth;
    // Tone's own holds a chord a second ahead back for a timer on the main thread
    poly.triggerAttackRelease([440, 550], 0.2, 0.9);
    expect(started).toEqual([]);
    expect(deferred.length).toBe(2);
    onTime(poly).triggerAttackRelease([440, 550], 0.2, 0.9);
    expect(started).toEqual([0.9]);
    expect(released[0]).toBeCloseTo(1.1, 9);
    expect(deferred.length).toBe(2);
  });
});
