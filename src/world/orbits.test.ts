import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { kepler } from './orbits';

/** Steps a body through a point mass's gravity (leapfrog, small steps): what the closed form must match. */
function stepped(mu: number, position: THREE.Vector3, velocity: THREE.Vector3, seconds: number, step = 1 / 8000) {
  const p = position.clone();
  const v = velocity.clone();
  const a = new THREE.Vector3();
  const pull = (at: THREE.Vector3) => {
    const r = at.length();
    return a.copy(at).multiplyScalar(-mu / (r * r * r));
  };
  const steps = Math.round(seconds / step);
  v.addScaledVector(pull(p), step / 2);
  for (let k = 0; k < steps; k++) {
    p.addScaledVector(v, step);
    v.addScaledVector(pull(p), k === steps - 1 ? step / 2 : step);
  }
  return { p, v };
}

// the Event Horizon's hole: 1 g at 2 km (units: 196.2 units/s² at 40,000 units)
const MU = 196.2 * 40000 * 40000;

describe('a piece on its own conic about the hole', () => {
  it('comes round a circular orbit to where it started, once a period', () => {
    const r = 28000;
    const speed = Math.sqrt(MU / r);
    const period = (2 * Math.PI * r) / speed;
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    kepler(MU, new THREE.Vector3(r, 0, 0), new THREE.Vector3(0, 0, -speed), period, p, v);
    expect(p.distanceTo(new THREE.Vector3(r, 0, 0))).toBeLessThan(1e-3);
    expect(v.distanceTo(new THREE.Vector3(0, 0, -speed))).toBeLessThan(1e-6);
  });

  it('flies an ellipse, a hyperbola and a fall where gravity, stepped finely, takes it', () => {
    const start = new THREE.Vector3(30000, 2500, 0);
    for (const velocity of [new THREE.Vector3(0, 40, -3400), new THREE.Vector3(600, 0, -4300), new THREE.Vector3(-900, 0, -900)]) {
      for (const seconds of [3, 40, 140]) {
        const p = new THREE.Vector3();
        const v = new THREE.Vector3();
        kepler(MU, start, velocity, seconds, p, v);
        const truth = stepped(MU, start, velocity, seconds);
        // a fall passes the hole close: only until it comes near
        if (truth.p.length() < 8000) continue;
        expect(p.distanceTo(truth.p)).toBeLessThan(2);
        expect(v.distanceTo(truth.v)).toBeLessThan(0.1);
      }
    }
  });

  it('keeps its energy over a round', () => {
    const start = new THREE.Vector3(45000, -1000, 12000);
    const velocity = new THREE.Vector3(-800, 30, 2700);
    const energy = (p: THREE.Vector3, v: THREE.Vector3) => v.lengthSq() / 2 - MU / p.length();
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const seconds of [1, 77, 300, 1000]) {
      kepler(MU, start, velocity, seconds, p, v);
      expect(Math.abs(energy(p, v) / energy(start, velocity) - 1)).toBeLessThan(1e-9);
    }
  });
});
