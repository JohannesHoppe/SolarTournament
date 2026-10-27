import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATLAS_RES, createRocks, createRockShapes, DISTANT_DETAIL, normalAtlas } from './rocks';

/** The direction a cube face's cell stands for, as the shader's rockNormal looks it up (face order +x, −x, +y, −y, +z, −z). */
function cellDirection(face: number, s: number, t: number) {
  const v = [new THREE.Vector3(1, s, t), new THREE.Vector3(-1, s, t), new THREE.Vector3(s, 1, t), new THREE.Vector3(s, -1, t), new THREE.Vector3(s, t, 1), new THREE.Vector3(s, t, -1)][face];
  return v.normalize();
}

describe("a rock's normal atlas", () => {
  it('holds, read row by row as the GPU reads it, the outward normal of the direction each cell stands for', () => {
    for (const index of [0, 7, 15]) {
      const atlas = normalAtlas(index);
      const { data, width, height } = atlas.image as { data: Uint8Array; width: number; height: number };
      expect([width, height]).toEqual([ATLAS_RES * 6, ATLAS_RES]);
      let outward = 0, cells = 0;
      for (let face = 0; face < 6; face++) {
        for (let j = 0; j < ATLAS_RES; j += 3) {
          for (let i = 0; i < ATLAS_RES; i += 3) {
            const o = (j * width + face * ATLAS_RES + i) * 4;
            const normal = new THREE.Vector3(data[o], data[o + 1], data[o + 2]).divideScalar(255).multiplyScalar(2).subScalar(1);
            const direction = cellDirection(face, ((i + 0.5) / ATLAS_RES) * 2 - 1, ((j + 0.5) / ATLAS_RES) * 2 - 1);
            cells++;
            if (normal.dot(direction) > 0.3) outward++;
          }
        }
      }
      // crater walls and crags tilt a normal, but the surface faces outward almost everywhere
      expect(outward / cells).toBeGreaterThan(0.95);
    }
  });
});

describe('the shapes the collisions measure', () => {
  it('are the drawn rocks vertex for vertex, without colors, normals or a material of their own', () => {
    const drawn = createRocks(DISTANT_DETAIL);
    const shapes = createRockShapes(DISTANT_DETAIL);
    expect(shapes).toHaveLength(drawn.length);
    shapes.forEach((shape, i) => {
      expect(Array.from(shape.geometry.getAttribute('position').array)).toEqual(Array.from(drawn[i].geometry.getAttribute('position').array));
      expect(shape.geometry.getAttribute('color')).toBeUndefined();
      expect(shape.geometry.getAttribute('normal')).toBeUndefined();
      expect(shape.material).toBe(shapes[0].material);
    });
  });
});
