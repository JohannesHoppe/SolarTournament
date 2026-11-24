import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { alienInterceptor, humanInterceptor, sovereign, TILE } from './models';
import { freshAt, PLATE_STEPS, platedOf } from './plating';
import { plateLayout, plateMap, SCALE_PITCH, SCALE_RADIUS, SCALE_ROW, SIZE, type Wear } from '../view/surfaces';

/** The coats of a hull the plating renews, with the wear their plates are laid out by. */
function platedCoats(root: THREE.Object3D) {
  const coats: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && platedOf(o.material)) coats.push(o);
  });
  return coats;
}

/**
 * The share of a hull's renewed coats' area on fresh plates at every step, and of its front
 * half's and its flanks' (sampled on a grid in every triangle), and whether a point fresh at a
 * step stays fresh at every step after it.
 */
function shares(root: THREE.Object3D, wears: Map<THREE.Texture, { seed: number; wear: Wear }>) {
  const area = [0, 0, 0, 0];
  const front = [0, 0, 0, 0];
  let total = 0;
  let frontTotal = 0;
  let superset = true;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const mesh of platedCoats(root)) {
    const plated = platedOf(mesh.material)!;
    const { seed, wear } = wears.get(plated.plates)!;
    const layout = plateLayout(seed, wear);
    const { position, uv, plateFore } = mesh.geometry.attributes;
    for (let t = 0; t < position.count; t += 3) {
      a.fromBufferAttribute(position, t);
      b.fromBufferAttribute(position, t + 1);
      c.fromBufferAttribute(position, t + 2);
      const triangle = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      const fore = [plateFore.getX(t), plateFore.getY(t), plateFore.getZ(t)] as const;
      const n = 6;
      for (let i = 0; i < n; i++) {
        for (let j = 0; i + j < n; j++) {
          const wa = (i + 1 / 3) / (n + 1 / 3);
          const wb = (j + 1 / 3) / (n + 1 / 3);
          const wc = 1 - wa - wb;
          const weight = triangle / ((n * (n + 1)) / 2);
          const u = uv.getX(t) * wa + uv.getX(t + 1) * wb + uv.getX(t + 2) * wc;
          const v = uv.getY(t) * wa + uv.getY(t + 1) * wb + uv.getY(t + 2) * wc;
          const z = a.z * wa + b.z * wb + c.z * wc;
          total += weight;
          if (z < 0) frontTotal += weight;
          let before = false;
          for (let step = 0; step < PLATE_STEPS.length; step++) {
            const fresh = freshAt(layout, u, v, fore, z, TILE, step);
            if (before && !fresh) superset = false;
            before = fresh;
            if (fresh) {
              area[step] += weight;
              if (z < 0) front[step] += weight;
            }
          }
        }
      }
    }
  }
  return { share: area.map((x) => x / total), front: front.map((x) => x / frontTotal), superset };
}

/** A stand-in for the model file: the hulls take only its collider, flame and glows. */
const original = () => new THREE.Group();

describe('the plating on the hull', () => {
  const hulls = [
    ['human', humanInterceptor(original()), [{ seed: 41, relief: undefined }, { seed: 42, relief: 'ribs' }]],
    ['alien', alienInterceptor(original()), [{ seed: 23, relief: 'scales' }]],
  ] as const;

  for (const [name, root, coats] of hulls) {
    it(`renews about a third of the ${name} interceptor's plates at the first step, most at the front, two thirds at the second, all at the third, each step keeping the last`, () => {
      const wears = new Map(coats.map(({ seed, relief }) => [plateMap(seed, { relief } as Wear) as THREE.Texture, { seed, wear: { relief } as Wear }]));
      const { share, front, superset } = shares(root, wears);
      expect(share[0]).toBe(0);
      expect(share[1]).toBeGreaterThan(0.25);
      expect(share[1]).toBeLessThan(0.42);
      expect(front[1]).toBeGreaterThan(share[1]);
      expect(share[2]).toBeGreaterThan(0.55);
      expect(share[2]).toBeLessThan(0.75);
      expect(share[3]).toBe(1);
      expect(superset).toBe(true);
    });
  }

  it('gives the Sovereign no plates to renew', () => {
    expect(platedCoats(sovereign(original()))).toHaveLength(0);
  });

  it('decides every scale of the alien skin once, also where it crosses the edge of the tile into the next repeat', () => {
    // the scales' lattice as the skin is drawn, over the whole plane (canvas down): a scale's
    // crescent that shows for certain lies within its radius, clear of its neighbors in the row
    // and of every scale of the rows below it, which lie over it
    const covering = [[-1, 0], [1, 0], [-0.5, 1], [0.5, 1], [-1.5, 1], [1.5, 1], [0, 2], [-1, 2], [1, 2], [-0.5, 3], [0.5, 3]].map(([dx, dy]) => [dx * SCALE_PITCH, dy * SCALE_ROW]);
    const layout = plateLayout(23, { relief: 'scales' } as Wear);
    const fores = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1]] as const;
    let crossing = 0;
    // the scales whose crescent crosses the tile's left or top edge, in a few repeats of the tile
    for (const [tu, tv] of [[0, 0], [3, -2], [-5, 7]]) {
      for (let row = -1; row <= SIZE / SCALE_ROW; row++) {
        for (let column = -1; column <= SIZE / SCALE_PITCH; column++) {
          const cx = (row & 1 ? SCALE_PITCH / 2 : 0) + column * SCALE_PITCH;
          const cy = row * SCALE_ROW;
          const points: [number, number][] = [];
          for (let y = cy - SCALE_RADIUS; y <= cy + SCALE_RADIUS; y += 0.25) {
            for (let x = cx - SCALE_RADIUS; x <= cx + SCALE_RADIUS; x += 0.25) {
              const within = (ox: number, oy: number) => (x - ox) * (x - ox) + (y - oy) * (y - oy) <= SCALE_RADIUS * SCALE_RADIUS;
              if (!within(cx, cy) || covering.some(([dx, dy]) => within(cx + dx, cy + dy))) continue;
              points.push([x, y]);
            }
          }
          const sides = new Set(points.map(([x, y]) => `${Math.floor(x / SIZE)}:${Math.floor(y / SIZE)}`));
          if (sides.size < 2) continue;
          crossing++;
          for (const fore of fores) {
            for (const step of [1, 2]) {
              const fresh = new Set(points.map(([x, y]) => freshAt(layout, tu + x / SIZE, tv + 1 - y / SIZE, fore, 0, TILE, step)));
              expect(fresh.size, `scale ${row}:${column} of tile ${tu}:${tv}, ${fore}, step ${step}`).toBe(1);
            }
          }
        }
      }
    }
    expect(crossing).toBeGreaterThan(30);
  });

  it('lays every plate of a tile out whole: a point of the tile in exactly one plate, the panels between the seams', () => {
    for (const relief of [undefined, 'ribs', 'scales'] as const) {
      const { plates, at } = plateLayout(41, { relief } as Wear);
      const seen = new Set<number>();
      for (let y = 0.5; y < SIZE; y += 2) for (let x = 0.5; x < SIZE; x += 2) seen.add(at(x, y));
      // every plate holds some of the tile, and no point lies outside a plate
      expect(seen.size, String(relief)).toBe(plates.length);
      for (const plate of plates) if (plate.box) expect(at(plate.x, plate.y)).toBe(plates.indexOf(plate));
    }
  });
});
