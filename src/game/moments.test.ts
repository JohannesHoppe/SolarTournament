import { describe, expect, it } from 'vitest';
import { Moments, NOVA_BLAST_SECONDS } from './moments';
import { STREAK_SECONDS, Streaks } from './streaks';

/** The own pilot (`me`) kills `victim` at `now`: the moment it makes, its streak counted as the game counts it. */
function kill(moments: Moments, streaks: Streaks, victim: string, now: number, nova = false) {
  return moments.ownKill(victim, streaks.kill('me', now), nova, now);
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
    expect(moments.ownKill('killer', 1, false, 0)).toBe('revenge');
    moments.died('killer');
    expect(moments.ownKill('other', 1, false, 0)).toBe(null);
    expect(moments.ownKill('killer', 1, false, 0)).toBe('revenge');
    expect(moments.ownKill('killer', 1, false, 0)).toBe(null);
  });

  it('takes a nova with several victims as one blast', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    expect([kill(moments, streaks, 'a', 5, true), kill(moments, streaks, 'b', 5, true), kill(moments, streaks, 'c', 5, true)]).toEqual([null, 'supernova', 'supernova']);
  });

  it('counts a victim another browser reports a moment later in the same blast', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    expect([kill(moments, streaks, 'a', 5, true), kill(moments, streaks, 'b', 5 + NOVA_BLAST_SECONDS * 0.9, true)]).toEqual([null, 'supernova']);
  });

  it('makes a nova that takes one ship no SUPERNOVA, even within a streak', () => {
    const moments = new Moments();
    const streaks = new Streaks();
    // a laser kill, then a nova that takes only one ship: the streak's second kill
    expect(kill(moments, streaks, 'a', 0)).toBe(null);
    expect(kill(moments, streaks, 'b', 3, true)).toBe('double');
    // two novas, each taking one ship, are two blasts
    const apart = new Moments();
    const own = new Streaks();
    expect([kill(apart, own, 'c', 10, true), kill(apart, own, 'd', 10 + NOVA_BLAST_SECONDS + 0.5, true)]).toEqual([null, 'double']);
  });

  it('forgets a blast with a new round', () => {
    const moments = new Moments();
    moments.ownKill('a', 1, true, 5);
    moments.reset();
    expect(moments.ownKill('b', 1, true, 5)).toBe(null);
  });
});
