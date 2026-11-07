import { describe, expect, it } from 'vitest';
import { GROUND_HALF, groundPlacement, groundRelief, RING_SPACING, ringAt, surfaceHeight, VALHALLA } from './callisto';
import { CALLISTO_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';
import { ARENA_LIMIT } from './arena';

describe('Valhalla on Callisto', () => {
  it('collides as its ground: a ship just under it touches, one just over it flies free, on a ridge, in a crater and between', () => {
    const { misses } = groundField('callisto-test', groundPlacement(CALLISTO_TYPE), surfaceHeight, [[0, 0], [40000, 0], [-60000, 30000], [100000, -80000], [-140000, -140000], [70000, 120000]]);
    expect(misses).toEqual([]);
  });

  it('keeps its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 500)).toEqual([]);
  });

  it('crosses the field with Valhalla’s ridges, each rising gently away from the basin and dropping off in a scarp', () => {
    const step = RING_SPACING / 60;
    let ridges = 0;
    let inScarp = false;
    for (let out = -VALHALLA.x - ARENA_LIMIT; out < -VALHALLA.x + ARENA_LIMIT; out += step) {
      const slope = (ringAt(out + step) - ringAt(out)) / step;
      // the rise never steeper than a fifth (11°), the scarp's drop steeper than two fifths (22°)
      expect(slope, `${out}`).toBeLessThan(0.2);
      const scarp = slope < -0.4;
      if (scarp && !inScarp) ridges++;
      inScarp = scarp;
    }
    // at least four ridges across the arena
    expect(ridges).toBeGreaterThanOrEqual(4);
  });
});
