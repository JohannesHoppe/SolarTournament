import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { touchRing } from './gates';

/** A ring at the origin facing +Z with the opening of a race's gate (80 m), and a ship of 17 m (the interceptors' hit radius). */
const RADIUS = 1600;
const SHIP = 337;
const center = new THREE.Vector3();
const facing = new THREE.Vector3(0, 0, 1);

function touch(x: number, y: number, z: number) {
  const position = new THREE.Vector3(x, y, z);
  const normal = new THREE.Vector3();
  return { touched: touchRing(center, facing, RADIUS, position, SHIP, normal), position, normal };
}

describe("a ring's housings", () => {
  it('let a ship through the opening, its core and well off it', () => {
    for (const [x, y] of [[0, 0], [500, 0], [0, -900], [1200, 0]]) expect(touch(x, y, 0).touched).toBe(false);
  });

  it('stop a ship that flies into the coil head on, and push it back out the way it came', () => {
    const hit = touch(1750, 0, -300);
    expect(hit.touched).toBe(true);
    expect(hit.normal.z).toBeLessThan(-0.9);
    expect(hit.position.z).toBeLessThan(-180 - SHIP + 1);
  });

  it("stop a ship that grazes the opening's edge, pushing it inwards", () => {
    const hit = touch(1400, 0, 0);
    expect(hit.touched).toBe(true);
    expect(hit.normal.x).toBeLessThan(-0.9);
    expect(hit.position.x).toBeCloseTo(1620 - SHIP, 0);
  });

  it('leave a ship alone that passes outside the ring or far before it', () => {
    expect(touch(2400, 0, 0).touched).toBe(false);
    expect(touch(1750, 0, -1000).touched).toBe(false);
  });

  it('push a ship whose center is inside a housing out through the nearest face', () => {
    const hit = touch(1700, 0, 150);
    expect(hit.touched).toBe(true);
    expect(hit.normal.z).toBeCloseTo(1);
    expect(hit.position.z).toBeCloseTo(180 + SHIP);
  });
});
