import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hypot } from '../detmath';
import { reliefContact, reliefRay, type Relief } from './asteroids';

/** A box 2 km square, its ground a hollow 300 m deep in its middle and flat 100 m under its top beyond. */
const half = new THREE.Vector3(20000, 4000, 20000);
const hollow: Relief = (x, z) => {
  const out = hypot(x, z);
  return out < 10000 ? 2000 - 6000 * (1 - out / 10000) : 2000;
};

describe('a ground of hills and hollows on a box', () => {
  it('touches a sphere that reaches down to it, and none above it or off its footprint', () => {
    const normal = new THREE.Vector3();
    const closest = new THREE.Vector3();
    // over the flat: 300 units over the ground with a radius of 340 touches, with 200 not
    expect(reliefContact(new THREE.Vector3(15000, 2300, 0), half, hollow, 340, normal, closest)).not.toBeNull();
    expect(normal.y).toBeCloseTo(1);
    expect(closest.y).toBeCloseTo(2000);
    expect(reliefContact(new THREE.Vector3(15000, 2300, 0), half, hollow, 200, normal, closest)).toBeNull();
    // in the hollow, below the box's top but over its ground: free
    expect(reliefContact(new THREE.Vector3(0, 0, 0), half, hollow, 340, normal, closest)).toBeNull();
    // under the ground of the hollow's slope: inside, pushed out up the slope's normal
    expect(reliefContact(new THREE.Vector3(5000, -1500, 0), half, hollow, 340, normal, closest)).not.toBeNull();
    expect(normal.x).toBeLessThan(0);
    expect(normal.y).toBeGreaterThan(0);
    // off the footprint: nothing
    expect(reliefContact(new THREE.Vector3(25000, 0, 0), half, hollow, 340, normal, closest)).toBeNull();
  });

  it('stops a ray on its ground, through the box’s empty top', () => {
    // straight down into the hollow's middle: past the box's top, down to the ground 4,000 below it
    const down = reliefRay(new THREE.Vector3(0, 10000, 0), new THREE.Vector3(0, -1, 0), half, hollow);
    expect(down).toBeCloseTo(10000 + 4000, -1);
    // level across over the flat: no ground in the way
    expect(reliefRay(new THREE.Vector3(-30000, 2500, 5000), new THREE.Vector3(1, 0, 0), half, hollow)).toBeNull();
    // level from outside under the flat ground: it meets the box's side where it enters
    expect(reliefRay(new THREE.Vector3(-30000, 0, 0), new THREE.Vector3(1, 0, 0), half, hollow)).toBeCloseTo(10000);
    // level from the hollow's middle, 1,000 under the box's middle: it meets the slope where the ground lies that deep, 5,000 out
    expect(reliefRay(new THREE.Vector3(0, -1000, 0), new THREE.Vector3(1, 0, 0), half, hollow)).toBeCloseTo(5000, -1);
  });
});
