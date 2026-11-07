import { describe, expect, it } from 'vitest';
import { crestZ, darkness, GROUND_HALF, groundPlacement, groundRelief, LAND, surfaceHeight } from './iapetus';
import { IAPETUS_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';

describe('Two Faces on Iapetus', () => {
  it('collides as its ground, on the plain, up the ridge’s flanks and on its crest, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const points: [number, number][] = [[0, crestZ(0)], [30000, crestZ(30000)], [-40000, crestZ(-40000) + 15000], [50000, 50000], [-60000, -50000]];
    const { misses } = groundField('iapetus-test', groundPlacement(IAPETUS_TYPE), surfaceHeight, points);
    expect(misses).toEqual([]);
  });

  it('runs its ridge across the field under its middle, a kilometer over the plain, the dark face north of it and the bright one south', () => {
    for (const x of [-60000, -20000, 20000, 60000]) {
      const crest = surfaceHeight(x, crestZ(x));
      expect(crest).toBeGreaterThan(LAND + 18000);
      expect(crest).toBeLessThan(-2000);
      expect(surfaceHeight(x, crestZ(x) + 40000)).toBeLessThan(LAND + 1000);
    }
    expect(darkness(0, -60000)).toBeGreaterThan(0.9);
    expect(darkness(0, 60000)).toBeLessThan(0.1);
  });
});
