import { describe, expect, it } from 'vitest';
import { CLIFF, faceAt, FOOT, GROUND_HALF, groundPlacement, groundRelief, MOUTH, surfaceHeight, TOP } from './miranda';
import { MIRANDA_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';
import { ARENA_LIMIT } from './arena';

describe('Verona on Miranda', () => {
  it('collides as its ground, on the upland and at the foot, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const points: [number, number][] = [[0, -30000], [0, 30000], [40000, -40000], [-30000, 40000], [50000, 50000]];
    const { misses } = groundField('miranda-test', groundPlacement(MIRANDA_TYPE), surfaceHeight, points);
    expect(misses).toEqual([]);
  });

  it('drops two kilometers across the field from the upland to the foot, the face nearly sheer, the hideout’s mouth in it near the foot, inside the arena', () => {
    expect(CLIFF).toBe(40000);
    for (const x of [-60000, -20000, 20000, 60000]) {
      const north = surfaceHeight(x, faceAt(x, 0) - 8000);
      const south = surfaceHeight(x, faceAt(x, 0) + 8000);
      expect(north).toBeGreaterThan(TOP - 1000);
      expect(south).toBeLessThan(FOOT + 1000);
    }
    // steeper than 60° where it is steepest: a kilometer of drop over less than 600 m
    expect(surfaceHeight(0, faceAt(0, 10000)) - surfaceHeight(0, faceAt(0, -10000))).toBeGreaterThan(18000);
    expect(Math.abs(faceAt(0, 10000) - faceAt(0, -10000))).toBeLessThan(12000);
    expect(Math.abs(surfaceHeight(MOUTH.x, MOUTH.z) - MOUTH.y)).toBeLessThan(600);
    expect(Math.sqrt(MOUTH.x * MOUTH.x + MOUTH.z * MOUTH.z)).toBeLessThan(ARENA_LIMIT);
  });
});
