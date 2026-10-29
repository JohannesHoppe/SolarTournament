import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Randomizer } from '../random';
import { ARENAS } from '../world/arenas';
import { Fleet } from './fleet';
import { EMPHASES, machinery, type Emphasis, type Wall } from './machinery';

/** A wall in the frame the machinery is laid out in: 215 m across, 53 m high, 6 m deep. */
const WALL: Wall = { reach: 2120, edge: 2150, floor: -80, ceiling: 980, depth: 120, frame: new THREE.Matrix4() };

/** One wall's machinery: every corner of it, its triangles, and its pieces' colors. */
function build(seed: number, emphasis: Emphasis) {
  const corners: THREE.Vector3[] = [];
  const colors: number[] = [];
  let triangles = 0;
  machinery(new Randomizer(seed), WALL, emphasis, (geometry, color) => {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) corners.push(new THREE.Vector3().fromBufferAttribute(position, i));
    triangles += (geometry.index?.count ?? position.count) / 3;
    colors.push(color.getHex());
  });
  return { corners, triangles, colors };
}

describe("the machinery on the hangars' walls", () => {
  it('stays inside the wall: never out into the tunnel, between the flanks, floor and ceiling', () => {
    for (const emphasis of EMPHASES) {
      for (const seed of [3, 7, 22, 101, 4711, 90001]) {
        for (const p of build(seed, emphasis).corners) {
          expect(p.z, `${emphasis} ${seed}`).toBeLessThanOrEqual(0);
          expect(p.z, `${emphasis} ${seed}`).toBeGreaterThanOrEqual(-150);
          expect(Math.abs(p.x), `${emphasis} ${seed}`).toBeLessThanOrEqual(WALL.edge);
          expect(p.y, `${emphasis} ${seed}`).toBeGreaterThanOrEqual(WALL.floor - 10);
          expect(p.y, `${emphasis} ${seed}`).toBeLessThanOrEqual(WALL.ceiling + 10);
        }
      }
    }
  });

  it('is laid out alike from the same seed', () => {
    for (const emphasis of EMPHASES) {
      const [a, b] = [build(7, emphasis), build(7, emphasis)];
      expect(a.triangles).toBe(b.triangles);
      expect(a.colors).toEqual(b.colors);
      expect(a.corners.every((p, i) => p.equals(b.corners[i]))).toBe(true);
    }
  });

  it('keeps the hangar deck light enough for a phone: its six walls, floors and ceilings in every arena under 50,000 triangles', () => {
    for (const arena of ARENAS) {
      let triangles = 0;
      new Fleet(arena.layout.seed).root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material.vertexColors) triangles += object.geometry.index.count / 3;
      });
      expect(triangles, arena.layout.key).toBeLessThan(50000);
    }
  });
});
