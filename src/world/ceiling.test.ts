import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Randomizer } from '../random';
import { reliefRay, type Relief } from './asteroids';
import { pyramidOf } from './ceiling';
import { RACK_BOXES, RACK_RELIEFS } from './yard';

/** Every ground of hills and hollows the field knows (see RACK_RELIEFS), with its box's half extents. */
const GROUNDS = RACK_RELIEFS.flatMap((relief, type) => (relief ? [{ type, relief, half: RACK_BOXES[type] }] : []));

/** The cell the tests sample (units): the pyramid's finest. */
const CELL = 800;

describe("a world's ground's ceiling", () => {
  it('is there for every ground', () => {
    expect(GROUNDS.length).toBeGreaterThan(15);
    for (const { type, relief } of GROUNDS) expect(relief.ceiling, `ground ${type}`).toBeTypeOf('function');
  });

  for (const { type, relief, half } of GROUNDS) {
    it(`lies over every point of ground ${type}`, () => {
      const pyramid = pyramidOf(relief.ceiling!, half);
      const random = new Randomizer(7301 + type);
      let worst = -Infinity;
      const check = (x: number, z: number) => {
        if (x > half.x || z > half.z) return;
        worst = Math.max(worst, Math.min(half.y, relief(x, z)) - pyramid.finest(x, z));
      };
      // every cell on a grid of 3 × 3 points, its edges included, and a point anywhere in it
      for (let z0 = -half.z; z0 < half.z; z0 += CELL) {
        for (let x0 = -half.x; x0 < half.x; x0 += CELL) {
          for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) check(x0 + (i * CELL) / 2, z0 + (j * CELL) / 2);
          check(x0 + random.nextFloat() * CELL, z0 + random.nextFloat() * CELL);
        }
      }
      // a ray's step is left out only above the bound: the ground may reach it (the sea's middle meets its box's top)
      expect(worst).toBeLessThanOrEqual(0);
    });

    it(`leaves every ray over ground ${type} meeting it where the ground alone has it met`, () => {
      const plain: Relief = (x, z) => relief(x, z);
      const random = new Randomizer(7302 + type);
      const origin = new THREE.Vector3();
      const step = new THREE.Vector3();
      let hits = 0;
      for (let k = 0; k < 3000; k++) {
        // from a little under the ground to high above it, mostly level, some steeply down or up
        const x = random.range(-half.x, half.x);
        const z = random.range(-half.z, half.z);
        origin.set(x, Math.min(half.y, relief(x, z)) + random.range(-200, 1 + random.nextFloat() * 8000), z);
        const steep = random.nextFloat() < 0.2;
        step.set(random.range(-1, 1), steep ? random.range(-1, 1) : random.range(-0.08, 0.04), random.range(-1, 1)).normalize();
        const max = random.nextFloat() < 0.5 ? Infinity : random.range(1000, 60000);
        const fast = reliefRay(origin, step, half, relief, max);
        const exact = reliefRay(origin, step, half, plain, max);
        if (!Object.is(fast, exact)) throw new Error(`ground ${type}: ray ${k} met the ground at ${fast}, alone at ${exact}`);
        if (exact !== null) hits++;
      }
      // the rays do meet the ground, most of them
      expect(hits).toBeGreaterThan(750);
    });
  }
});
