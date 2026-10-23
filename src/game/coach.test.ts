import { beforeEach, describe, expect, it } from 'vitest';
import { Coach } from './coach';
import { TIPS } from '../music/lines';

const kept = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => kept.set(key, value) } });

/** Plays rounds in which the coach tries to give a tip once a frame for a few frames; returns how often it was said. */
function rounds(coach: Coach, tip: keyof typeof TIPS, count: number, say = () => true) {
  let said = 0;
  for (let round = 0; round < count; round++) {
    coach.newRound();
    for (let frame = 0; frame < 5; frame++) if (coach.give(tip, say)) said++;
  }
  return said;
}

describe("Nicole's coaching", () => {
  beforeEach(() => kept.clear());

  it('gives a tip of the fight once a round, three rounds long, then trusts the Host with it', () => {
    expect(rounds(new Coach(), 'tail', 5)).toBe(3);
  });

  it("briefs a mode only in a Host's first round of it", () => {
    expect(rounds(new Coach(), 'flag', 3)).toBe(1);
  });

  it('keeps a tip due while the voice cannot say it', () => {
    const coach = new Coach();
    expect(rounds(coach, 'race', 1, () => false)).toBe(0);
    expect(rounds(coach, 'race', 1)).toBe(1);
  });

  it('remembers what the browser has heard', () => {
    rounds(new Coach(), 'torpedo', 2);
    expect(rounds(new Coach(), 'torpedo', 5)).toBe(1);
  });
});
