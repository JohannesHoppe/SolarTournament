import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Randomizer } from '../random';
import { reliefRay, type Relief } from './asteroids';
import { pyramidOf } from './ceiling';
import { CRACK_GROUND_HALF, crackRelief } from './crack';
import { fightRelief, groundRelief as lineaeRelief, GROUND_HALF as LINEAE_HALF } from './europa';
import { groundRelief as valhallaRelief, GROUND_HALF as VALHALLA_HALF } from './callisto';
import { BATTLE_GROUND_HALF, battleRelief } from './battlefield';
import { THROAT_GROUND_HALF, throatRelief } from './throat';

/** Every ground with a ceiling, with its box's half extents. */
const GROUNDS: readonly { name: string; relief: Relief; half: THREE.Vector3 }[] = [
  { name: 'the Crack', relief: crackRelief, half: CRACK_GROUND_HALF },
  { name: 'the Throat', relief: throatRelief, half: THROAT_GROUND_HALF },
  { name: 'the Lineae', relief: lineaeRelief, half: LINEAE_HALF },
  { name: 'the Lineae fought over', relief: fightRelief, half: LINEAE_HALF },
  { name: 'Valhalla', relief: valhallaRelief, half: VALHALLA_HALF },
  { name: 'Valhalla fought over', relief: battleRelief, half: BATTLE_GROUND_HALF },
];

/** The cell the tests sample (units): the pyramid's finest. */
const CELL = 800;

describe("a world's ground's ceiling", () => {
  for (const { name, relief, half } of GROUNDS) {
    it(`lies over every point of ${name}`, () => {
      const pyramid = pyramidOf(relief.ceiling!, half);
      const random = new Randomizer(7301);
      let worst = -Infinity;
      // every cell on a grid of 4 × 4 points, its edges included, and two points anywhere in it
      for (let z0 = -half.z; z0 < half.z; z0 += CELL) {
        for (let x0 = -half.x; x0 < half.x; x0 += CELL) {
          const check = (x: number, z: number) => {
            if (x > half.x || z > half.z) return;
            const over = Math.min(half.y, relief(x, z)) - pyramid.finest(x, z);
            if (over > worst) worst = over;
          };
          for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) check(x0 + (i * CELL) / 3, z0 + (j * CELL) / 3);
          for (let k = 0; k < 2; k++) check(x0 + random.nextFloat() * CELL, z0 + random.nextFloat() * CELL);
        }
      }
      expect(worst).toBeLessThan(0);
    });

    it(`leaves every ray over ${name} meeting it where the ground alone has it met`, () => {
      const plain: Relief = (x, z) => relief(x, z);
      const random = new Randomizer(7302);
      const origin = new THREE.Vector3();
      const step = new THREE.Vector3();
      let hits = 0;
      for (let k = 0; k < 4000; k++) {
        // from a little over the ground to high above it, mostly level, some steeply down or up
        const x = random.range(-half.x, half.x);
        const z = random.range(-half.z, half.z);
        origin.set(x, Math.min(half.y, relief(x, z)) + random.range(-200, 1 + random.nextFloat() * 8000), z);
        const steep = random.nextFloat() < 0.2;
        step.set(random.range(-1, 1), steep ? random.range(-1, 1) : random.range(-0.08, 0.04), random.range(-1, 1)).normalize();
        const max = random.nextFloat() < 0.5 ? Infinity : random.range(1000, 60000);
        const fast = reliefRay(origin, step, half, relief, max);
        const exact = reliefRay(origin, step, half, plain, max);
        if (!Object.is(fast, exact)) throw new Error(`${name}: ray ${k} met the ground at ${fast}, alone at ${exact}`);
        if (exact !== null) hits++;
      }
      // the rays do meet the ground, most of them
      expect(hits).toBeGreaterThan(1000);
    });
  }
});
