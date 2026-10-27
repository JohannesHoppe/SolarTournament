import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { firing, NOZZLES, thrustersOf, type Thrusters } from './thrusters';
import { THRUSTER_LAYOUTS } from './models';

/** The push and turn of the nozzles as they fire: the sum of their pushes, and of their turns. */
function result(thrusters: Thrusters, strengths: Float32Array) {
  const push = new THREE.Vector3();
  const turn = new THREE.Vector3();
  thrusters.nozzles.forEach((nozzle, i) => {
    push.addScaledVector(nozzle.exhaust, -strengths[i]);
    turn.addScaledVector(nozzle.torque, strengths[i]);
  });
  return { push, turn, fired: [...strengths].filter((s) => s > 0).length };
}

const fire = (thrusters: Thrusters, push: THREE.Vector3, turn: THREE.Vector3) => {
  const out = new Float32Array(NOZZLES);
  firing(thrusters, push, turn, out);
  return result(thrusters, out);
};

describe('the maneuvering thrusters', () => {
  for (const [hull, layout] of Object.entries(THRUSTER_LAYOUTS)) {
    const thrusters = thrustersOf(layout);
    const still = new THREE.Vector3();
    /** The quads' mean distance fore and aft of the center (units). */
    const lever = (Math.abs(layout.fore.z) + Math.abs(layout.aft.z)) / 2;

    it(`of the ${hull} are four quads of four nozzles`, () => {
      expect(thrusters.nozzles).toHaveLength(NOZZLES);
      expect(NOZZLES).toBe(16);
    });

    it(`of the ${hull} push it every way without turning it`, () => {
      for (const way of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const wanted = new THREE.Vector3(...way);
        const { push, turn, fired } = fire(thrusters, wanted, still);
        expect(fired, `${way}`).toBe(way[2] === 0 && way[0] === 0 ? 4 : 2);
        expect(push.clone().normalize().dot(wanted), `${way}`).toBeCloseTo(1, 6);
        // what turn is left comes from the quads sitting a little above or below the center
        expect(turn.length(), `${way}`).toBeLessThan(0.15 * lever);
      }
    });

    it(`of the ${hull} turn it about each axis either way without moving it`, () => {
      for (let k = 0; k < 3; k++) {
        for (const sign of [1, -1]) {
          const wanted = new THREE.Vector3().setComponent(k, sign);
          const { push, turn, fired } = fire(thrusters, still, wanted);
          expect(fired, `axis ${k} ${sign}`).toBeGreaterThanOrEqual(2);
          expect(push.length(), `axis ${k} ${sign}`).toBeLessThan(1e-6);
          expect(turn.getComponent(k) * sign, `axis ${k} ${sign}`).toBeGreaterThan(0);
          expect(Math.sqrt(turn.lengthSq() - turn.getComponent(k) ** 2), `axis ${k} ${sign}`).toBeLessThan(0.15 * Math.abs(turn.getComponent(k)));
        }
      }
    });
  }

  it('slide the human interceptor left by puffing from both quads on its right flank', () => {
    const thrusters = thrustersOf(THRUSTER_LAYOUTS.human);
    const out = new Float32Array(NOZZLES);
    firing(thrusters, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), out);
    const puffing = thrusters.nozzles.filter((_, i) => out[i] > 0);
    expect(puffing.map((n) => [n.mouth.x > 0, n.exhaust.x])).toEqual([[true, 1], [true, 1]]);
  });
});
