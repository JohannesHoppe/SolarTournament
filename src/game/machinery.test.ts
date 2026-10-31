import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Randomizer } from '../random';
import { ARENAS } from '../world/arenas';
import { ELEVATION_GUTTER, ELEVATION_SLOT, Fleet, HANGAR_CEILING, HANGAR_FLOOR, HANGARS } from './fleet';
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

  it("keeps the hangar deck light enough for a phone: outside it, its six walls a picture on a plate each; inside, the machinery in full of the tunnel shown under 50,000 triangles", () => {
    for (const arena of ARENAS) {
      const fleet = new Fleet(arena.layout.seed);
      let outside = 0;
      fleet.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material.vertexColors && !fleet.machinery.includes(object)) outside += object.geometry.index.count / 3;
      });
      expect(outside, arena.layout.key).toBeLessThan(2000);
      expect(fleet.machinery).toHaveLength(HANGARS.length);
      for (const mesh of fleet.machinery) expect(mesh.geometry.index!.count / 3, arena.layout.key).toBeLessThan(50000);
    }
  });

  it('draws each wall as a picture of its machinery, and the rest of the deck in its own colors', () => {
    const fleet = new Fleet(ARENAS[0].layout.seed);
    const { data, width, height } = (fleet.machinery[0].material as THREE.MeshBasicMaterial).map!.image as { data: Uint8Array; width: number; height: number };
    // the white block every other piece of the deck samples
    const white = ((height - 8) * width + width / 2) * 4;
    expect([data[white], data[white + 1], data[white + 2]]).toEqual([255, 255, 255]);
    // each wall's picture shows the machinery: many shades, none of it blank
    for (let wall = 0; wall < 6; wall++) {
      const shades = new Set<number>();
      for (let y = wall * ELEVATION_SLOT + ELEVATION_GUTTER; y < (wall + 1) * ELEVATION_SLOT - ELEVATION_GUTTER; y += 3) for (let x = 0; x < width; x += 3) shades.add(data[(y * width + x) * 4 + 1]);
      expect(shades.size, `wall ${wall}`).toBeGreaterThan(40);
    }
  });

  it("shows a tunnel's machinery in full only from inside it or close to it, one tunnel's at a time", () => {
    const fleet = new Fleet(ARENAS[0].layout.seed);
    fleet.root.visible = true;
    fleet.root.updateMatrixWorld();
    /** The tunnels whose machinery shows from a point in the battleship's frame. */
    const seen = (x: number, y: number, z: number) => {
      fleet.view(new THREE.Vector3(x, y, z).applyMatrix4(fleet.root.matrixWorld));
      return fleet.machinery.flatMap((mesh, i) => (mesh.visible ? [i] : []));
    };
    HANGARS.forEach((z, i) => {
      expect(seen(0, 450, z)).toEqual([i]);
      expect(seen(5000, 450, z)).toEqual([i]);
      expect(seen(20000, 450, z)).toEqual([]);
    });
    expect(seen(0, 8000, HANGARS[1])).toEqual([]);
    expect(seen(0, 450, -6000)).toEqual([]);
    // just over the flight deck, or just under the hull, the hull hides them; out beyond a flank
    // at that height a mouth shows
    HANGARS.forEach((z, i) => {
      expect(seen(1000, HANGAR_CEILING + 1500, z)).toEqual([]);
      expect(seen(1000, HANGAR_FLOOR - 1500, z)).toEqual([]);
      expect(seen(4500, HANGAR_CEILING + 1500, z)).toEqual([i]);
      expect(seen(-4500, HANGAR_FLOOR - 1500, z)).toEqual([i]);
    });
  });

});
