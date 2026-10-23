import { describe, expect, it } from 'vitest';
import { Moments, STREAK_SECONDS } from './moments';

describe('the big moments of the own pilot', () => {
  it('counts kills close after each other into a double, a triple and a multi kill', () => {
    const moments = new Moments();
    expect([0, 1, 2, 3].map((at) => moments.ownKill(`v${at}`, at, false))).toEqual([null, 'double', 'triple', 'multi']);
  });

  it('starts a new streak after a pause, and after the own clone died', () => {
    const moments = new Moments();
    moments.ownKill('a', 0, false);
    expect(moments.ownKill('b', STREAK_SECONDS + 0.1, false)).toBe(null);
    moments.died(null);
    expect(moments.ownKill('c', STREAK_SECONDS + 0.5, false)).toBe(null);
  });

  it('pays back the ship that killed the own clone last, once', () => {
    const moments = new Moments();
    moments.died('killer');
    expect(moments.ownKill('killer', 10, false)).toBe('revenge');
    moments.died('killer');
    expect(moments.ownKill('other', 20, false)).toBe(null);
    expect(moments.ownKill('killer', 30, false)).toBe('revenge');
    expect(moments.ownKill('killer', 40, false)).toBe(null);
  });

  it('takes a nova with several victims as one blast', () => {
    const moments = new Moments();
    expect([moments.ownKill('a', 5, true), moments.ownKill('b', 5, true), moments.ownKill('c', 5, true)]).toEqual([null, 'supernova', 'supernova']);
  });
});
