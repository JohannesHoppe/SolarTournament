import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundPlacement, STICKNEY, STICKNEY_FLOOR, surfaceHeight } from './phobos';
import { PHOBOS_TYPE } from './yard';
import { groundField } from '../test/field';

describe('Stickney on Phobos', () => {
  const { field, misses } = groundField('phobos-test', groundPlacement(PHOBOS_TYPE), surfaceHeight, [[STICKNEY.x, STICKNEY.z], [0, 0], [30000, 0], [60000, 20000], [-20000, 50000]]);

  it('collides as its ground: a ship just under it touches, one just over it flies free, in the crater, on its rim and in a groove', () => {
    expect(misses).toEqual([]);
  });

  it('stops a beam on its ground, down into the crater over its rim', () => {
    const from = new THREE.Vector3(40000, 10000, 0);
    const to = STICKNEY_FLOOR.clone();
    const way = to.clone().sub(from);
    const hit = field.raycast(from, way.clone().normalize(), way.length() + 1000);
    expect(hit).not.toBeNull();
    const at = from.clone().addScaledVector(way.normalize(), hit!.distance);
    expect(Math.abs(at.y - surfaceHeight(at.x, at.z))).toBeLessThan(100);
  });

  it('lies deep: the crater’s floor some 1.2 km under the field’s middle, the land beyond it under 100 m', () => {
    expect(STICKNEY_FLOOR.y).toBeLessThan(-24000);
    expect(surfaceHeight(40000, 0)).toBeLessThan(-1600);
  });
});

describe('the grooves beyond Stickney', () => {
  it('give a groove to fly low along for half a minute at 25 m/s, inside the arena, from where Groove Shoot marks', async () => {
    const { GROOVE_WAY, inGrooves } = await import('./phobos');
    const { GROOVE_START } = await import('../campaign/missions');
    const { ARENA_LIMIT } = await import('./arena');
    const at = GROOVE_START.clone();
    for (let t = 0; t <= 30; t += 0.5) {
      at.copy(GROOVE_START).addScaledVector(GROOVE_WAY, 500 * t);
      at.y = surfaceHeight(at.x, at.z) + 600;
      expect(inGrooves(at.x, at.z), `${t} s`).toBe(true);
      expect(at.length()).toBeLessThan(ARENA_LIMIT);
    }
  });
});
