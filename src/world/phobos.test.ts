import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundPlacement, STICKNEY, STICKNEY_FLOOR, surfaceHeight } from './phobos';
import { PHOBOS_TYPE } from './yard';
import { FIELD_RADIUS } from './asteroids';
import { DETAIL } from './rocks';
import { testField } from '../test/field';

const SHIP = 340;

describe('Stickney on Phobos', () => {
  const field = testField(DETAIL);
  field.generate({ key: 'phobos-test', seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [groundPlacement(PHOBOS_TYPE)] });

  it('collides as its ground: a ship just under it touches, one just over it flies free, in the crater, on its rim and in a groove', () => {
    for (const [x, z] of [[STICKNEY.x, STICKNEY.z], [0, 0], [30000, 0], [60000, 20000], [-20000, 50000]]) {
      const ground = surfaceHeight(x, z);
      expect(field.overlap(new THREE.Vector3(x, ground + SHIP - 60, z), SHIP), `${x}, ${z}`).not.toBeNull();
      expect(field.overlap(new THREE.Vector3(x, ground + SHIP + 200, z), SHIP), `${x}, ${z}`).toBeNull();
    }
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
