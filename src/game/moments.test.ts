import { describe, expect, it } from 'vitest';
import { Moments } from './moments';
import { STREAK_SECONDS, Streaks } from './streaks';

/** The own pilot (`me`) kills `victim` at `now`: the moment it makes, its streak counted as the game counts it. */
function kill(moments: Moments, streaks: Streaks, victim: string, now: number, nova = false) {
  return moments.ownKill(victim, streaks.kill('me', now), nova);
}

describe('the big moments of the own pilot', () => {
  it('counts kills close after each other into a double, a triple and a multi kill', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    expect([0, 1, 2, 3].map((at) => kill(moments, streaks, `v${at}`, at))).toEqual([null, 'double', 'triple', 'multi']);
  });

  it('starts a new streak after a pause, and after the own clone died', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    kill(moments, streaks, 'a', 0);
    expect(kill(moments, streaks, 'b', STREAK_SECONDS + 0.1)).toBe(null);
    moments.died(null);
    streaks.end('me');
    expect(kill(moments, streaks, 'c', STREAK_SECONDS + 0.5)).toBe(null);
  });

  it('pays back the ship that killed the own clone last, once', () => {
    const moments = new Moments();
    moments.died('killer');
    expect(moments.ownKill('killer', 1, false)).toBe('revenge');
    moments.died('killer');
    expect(moments.ownKill('other', 1, false)).toBe(null);
    expect(moments.ownKill('killer', 1, false)).toBe('revenge');
    expect(moments.ownKill('killer', 1, false)).toBe(null);
  });

  it('takes a nova with several victims as one blast', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    expect([kill(moments, streaks, 'a', 5, true), kill(moments, streaks, 'b', 5, true), kill(moments, streaks, 'c', 5, true)]).toEqual([null, 'supernova', 'supernova']);
  });
});
