import { describe, expect, it } from 'vitest';
import { GROUND_HALF, groundPlacement, groundRelief, LAND, PEAKS, surfaceHeight } from './pluto';
import { PLUTO_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';

describe('Last Light on Pluto', () => {
  it('collides as its ground, on the heart’s cells and the mountains, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const { misses } = groundField('pluto-test', groundPlacement(PLUTO_TYPE), surfaceHeight, [[0, 0], [40000, -20000], [20000, 40000], [-60000, 10000], [-70000, -50000]]);
    expect(misses).toEqual([]);
  });

  it('lays the heart flat under the field’s middle and raises the mountains beside it, to the north-west', () => {
    for (const [x, z] of [[0, 0], [40000, 30000], [20000, -40000]]) expect(Math.abs(surfaceHeight(x, z) - LAND)).toBeLessThan(800);
    expect(surfaceHeight(-70000, 0)).toBeGreaterThan(LAND + PEAKS * 0.3);
  });
});
