import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mirror } from './models';

/** Two triangles whose vertices carry a color each, as the models' parts do. */
function painted(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 1, 0), new THREE.Vector3(2, 0, 1),
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 1), new THREE.Vector3(1, 1, 1),
  ]);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]), 3));
  return g;
}

describe('mirror', () => {
  it('keeps every vertex color with its vertex when it swaps corners to keep the faces outwards', () => {
    const source = painted();
    const m = mirror(source);
    const sp = source.attributes.position;
    const mp = m.attributes.position;
    const sc = source.attributes.color;
    const mc = m.attributes.color;
    // each mirrored vertex is a source vertex with x flipped, carrying that source vertex's color
    for (let i = 0; i < mp.count; i++) {
      let found = false;
      for (let k = 0; k < sp.count; k++) {
        if (Math.abs(sp.getX(k) + mp.getX(i)) < 1e-6 && sp.getY(k) === mp.getY(i) && sp.getZ(k) === mp.getZ(i) && sc.getX(k) === mc.getX(i)) found = true;
      }
      expect(found).toBe(true);
    }
    // the second and third corner of a triangle trade places
    expect(mc.getX(1)).toBe(sc.getX(2));
    expect(mc.getX(2)).toBe(sc.getX(1));
    expect(mp.getX(1)).toBe(-sp.getX(2));
  });
});
