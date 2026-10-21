import { describe, expect, it } from 'vitest';
import { ARENA_LIMIT } from '../world/arena';
import { CLONES, clonesLeft, FLARE_END, FLARE_MIN, FLARE_START, flareRadius, isOut } from './survival';

describe('Last Clone Standing', () => {
  it('closes the flare in from the arena edge, evenly, and holds it', () => {
    expect(flareRadius(0)).toBe(ARENA_LIMIT);
    expect(flareRadius(FLARE_START)).toBe(ARENA_LIMIT);
    expect(flareRadius((FLARE_START + FLARE_END) / 2)).toBeCloseTo((ARENA_LIMIT + FLARE_MIN) / 2);
    expect(flareRadius(FLARE_END)).toBe(FLARE_MIN);
    expect(flareRadius(FLARE_END + 100)).toBe(FLARE_MIN);
  });

  it('counts the clones down to out', () => {
    expect(clonesLeft({ deaths: 0 })).toBe(CLONES);
    expect(isOut({ deaths: CLONES - 1 })).toBe(false);
    expect(isOut({ deaths: CLONES })).toBe(true);
    expect(clonesLeft({ deaths: CLONES + 2 })).toBe(0);
  });
});
