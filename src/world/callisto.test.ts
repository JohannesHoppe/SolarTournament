import { describe, expect, it } from 'vitest';
import { GROUND_HALF, groundPlacement, groundRelief, RING_SPACING, ringAt, surfaceHeight, VALHALLA } from './callisto';
import { CALLISTO_TYPE } from './yard';
import { groundField } from '../test/field';

describe('Valhalla on Callisto', () => {
  it('collides as its ground: a ship just under it touches, one just over it flies free, on a ridge, in a crater and between', () => {
    const { misses } = groundField('callisto-test', groundPlacement(CALLISTO_TYPE), surfaceHeight, [[0, 0], [40000, 0], [-60000, 30000], [100000, -80000], [-140000, -140000], [70000, 120000]]);
    expect(misses).toEqual([]);
  });

  it('keeps its relief inside its box over the whole square', () => {
    for (let x = -GROUND_HALF.x; x <= GROUND_HALF.x; x += 500) {
      for (let z = -GROUND_HALF.z; z <= GROUND_HALF.z; z += 500) {
        const top = groundRelief(x, z);
        expect(top).toBeLessThan(GROUND_HALF.y);
        expect(top).toBeGreaterThan(-GROUND_HALF.y);
      }
    }
  });

  it('crosses the field with Valhalla’s ridges, each rising gently away from the basin and dropping off in a scarp', () => {
    const steps = 60;
    let ridges = 0;
    for (let out = -VALHALLA.x - GROUND_HALF.x; out < -VALHALLA.x + GROUND_HALF.x; out += RING_SPACING / steps) {
      const step = ringAt(out + RING_SPACING / steps) - ringAt(out);
      // the rise never steeper than a tenth, the scarp's drop steeper than a third
      expect(step, `${out}`).toBeLessThan((RING_SPACING / steps) * 0.1);
      if (step < -(RING_SPACING / steps) / 3) ridges++;
    }
    // each scarp's steep stretch counted over several steps: at least five ridges over the field's 16 km
    expect(ridges / 4).toBeGreaterThanOrEqual(5);
  });
});
