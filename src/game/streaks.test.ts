import { describe, expect, it } from 'vitest';
import { STREAK_SECONDS, streakBonus, Streaks } from './streaks';

describe('kill streaks', () => {
  it('pays half a kill more for a double kill and a whole kill more for every kill from the third on', () => {
    const streaks = new Streaks();
    const bonuses = [0, 1, 2, 3, 4].map((at) => streakBonus(streaks.kill('s', at), 500, false));
    expect(bonuses).toEqual([0, 250, 500, 500, 500]);
    // a race's kill is worth less, and so is its bonus
    expect(streakBonus(2, 200, false)).toBe(100);
    expect(streakBonus(3, 200, false)).toBe(200);
  });

  it('never pays a streak\'s kill more than a nova\'s double kill', () => {
    for (let streak = 1; streak <= 10; streak++) expect(500 + streakBonus(streak, 500, false)).toBeLessThanOrEqual(2 * 500);
  });

  it('gives a nova\'s kills no bonus, but counts them in the streak', () => {
    const streaks = new Streaks();
    expect(streakBonus(streaks.kill('s', 10), 500, true)).toBe(0);
    expect(streakBonus(streaks.kill('s', 10), 500, true)).toBe(0);
    // a beam's kill right after the blast is the streak's third
    expect(streakBonus(streaks.kill('s', 12), 500, false)).toBe(500);
  });

  it('counts each ship\'s streak on its own, and ends it after a pause, a death or the round', () => {
    const streaks = new Streaks();
    expect(streaks.kill('a', 0)).toBe(1);
    expect(streaks.kill('b', 1)).toBe(1);
    expect(streaks.kill('a', 2)).toBe(2);
    expect(streaks.kill('a', 2 + STREAK_SECONDS)).toBe(3);
    expect(streaks.kill('a', 2 + 2 * STREAK_SECONDS + 0.1)).toBe(1);
    streaks.kill('b', 2);
    streaks.end('b');
    expect(streaks.kill('b', 3)).toBe(1);
    streaks.kill('b', 4);
    streaks.reset();
    expect(streaks.kill('b', 5)).toBe(1);
  });
});
