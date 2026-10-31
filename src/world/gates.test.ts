import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ringReach, ringSamples, touchRing } from './gates';

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

  it('include the station module on top and its sponsor plate: a ship flying into it head on bounces back', () => {
    // the module sits on top (+Y for a ring facing +Z), 35 m wide, its plate facing along the axis
    const hit = touch(0, 2070, -420);
    expect(hit.touched).toBe(true);
    expect(hit.normal.z).toBeLessThan(-0.9);
  });

  it('include the struts out to the position lights', () => {
    const angle = Math.PI / 4 + Math.PI / 10;
    const out = 1620 + 200 + 250;
    const hit = touch(Math.cos(angle) * out, Math.sin(angle) * out, -300);
    expect(hit.touched).toBe(true);
    expect(touch(Math.cos(angle) * out, Math.sin(angle) * out, -600).touched).toBe(false);
  });

  it('push a ship whose center is inside a housing out through the nearest face', () => {
    const hit = touch(1700, 0, 150);
    expect(hit.touched).toBe(true);
    expect(hit.normal.z).toBeCloseTo(1);
    expect(hit.position.z).toBeCloseTo(180 + SHIP);
  });
});

describe("the points a ring's solid parts are sampled by", () => {
  const points = ringSamples(center, facing, RADIUS);
  /** The 5 m the samples promise (SAMPLE_SPACING), with a hair for rounding. */
  const SPACING = 100.01;
  /** The band's outer face: its housings begin 20 units outside the opening, 200 thick. */
  const OUTER = RADIUS + 20 + 200;

  it('lie no farther apart than 5 m around the band and along it', () => {
    const outer: THREE.Vector3[] = [];
    for (let k = 0; k < points.length; k += 3) {
      const p = new THREE.Vector3(points[k], points[k + 1], points[k + 2]);
      if (Math.abs(Math.hypot(p.x, p.y) - OUTER) < 1e-2 && Math.abs(p.z) <= 180.01) outer.push(p);
    }
    // along the band: at one place around, the points on its outer face
    const along = outer.filter((p) => Math.abs(Math.atan2(p.y, p.x)) < 1e-3).map((p) => p.z).sort((a, b) => a - b);
    expect(along.length).toBeGreaterThan(2);
    expect(along[0]).toBeCloseTo(-180, 1);
    expect(along.at(-1)).toBeCloseTo(180, 1);
    for (let i = 1; i < along.length; i++) expect(along[i] - along[i - 1]).toBeLessThanOrEqual(SPACING);
    // around the band: the points of one end of its outer face, by angle
    const angles = outer.filter((p) => Math.abs(p.z + 180) < 1e-2).map((p) => Math.atan2(p.y, p.x)).sort((a, b) => a - b);
    angles.push(angles[0] + Math.PI * 2);
    for (let i = 1; i < angles.length; i++) expect((angles[i] - angles[i - 1]) * OUTER).toBeLessThanOrEqual(SPACING);
  });
});

describe("a ring's reach", () => {
  it('holds everything a ship can touch: nothing farther from the center touches, in any direction', () => {
    const reach = ringReach(RADIUS);
    const direction = new THREE.Vector3();
    for (let i = 0; i < 4000; i++) {
      direction.set(Math.sin(i * 12.9898), Math.cos(i * 78.233), Math.sin(i * 37.719)).normalize();
      // beyond the reach and the ship's radius
      expect(touchRing(center, facing, RADIUS, direction.clone().multiplyScalar(reach + SHIP * 1.01), SHIP, new THREE.Vector3())).toBe(false);
    }
  });
});
