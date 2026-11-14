import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HULL_LENGTH, SHOVE_SPIN_MAX, shoveSpin } from './blow';
import { ramImpulse } from './impact';

const CLOSING = 800; // 40 m/s

describe('the spin a blow gives a hull', () => {
  it('a blow square on the flank shoves without spinning, as does one straight on the nose', () => {
    expect(shoveSpin(new THREE.Vector3(1, 0, 0), CLOSING, new THREE.Vector3())).toBe(0);
    expect(shoveSpin(new THREE.Vector3(0, 0, 1), CLOSING, new THREE.Vector3())).toBe(0);
  });

  it('a blow on the corner of the nose spins hardest, by the rod the hull is', () => {
    const blow = new THREE.Vector3(1, 0, 1).normalize();
    const spin = new THREE.Vector3();
    const added = shoveSpin(blow, CLOSING, spin);
    // ω = (L/2)·sin·cos·Δv·12/L² = 3·Δv/L at 45°
    expect(added).toBeCloseTo((3 * ramImpulse(CLOSING)) / HULL_LENGTH, 6);
    expect(added).toBeGreaterThan(1.5);
    expect(added).toBeLessThan(2.5);
    // turns about the up axis only (a yaw), no roll
    expect(Math.abs(spin.x)).toBeLessThan(1e-12);
    expect(spin.z).toBe(0);
  });

  it('the far end turns the other way, and the spin never passes what the flight computer catches', () => {
    const front = new THREE.Vector3();
    const back = new THREE.Vector3();
    shoveSpin(new THREE.Vector3(1, 0, 1).normalize(), CLOSING, front);
    shoveSpin(new THREE.Vector3(1, 0, -1).normalize(), CLOSING, back);
    expect(Math.sign(front.y)).toBe(-Math.sign(back.y));
    expect(shoveSpin(new THREE.Vector3(1, 0, 1).normalize(), 40000, new THREE.Vector3())).toBe(SHOVE_SPIN_MAX);
  });

  it('a blow from above at the nose pitches the hull', () => {
    const spin = new THREE.Vector3();
    shoveSpin(new THREE.Vector3(0, 1, 1).normalize(), CLOSING, spin);
    expect(Math.abs(spin.x)).toBeGreaterThan(1);
    expect(Math.abs(spin.y)).toBeLessThan(1e-12);
  });
});
