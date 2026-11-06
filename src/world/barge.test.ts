import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { setFromAxisAngle } from '../detthree';
import { BARGE_LENGTH, rayBarge, touchBarge } from './barge';

describe('the ore barge', () => {
  const pose = { position: new THREE.Vector3(1000, 2000, -500), quaternion: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), 0.7) };

  it('stops a beam on its hull wherever it is posed, and lets one past it go by', () => {
    const origin = pose.position.clone().add(new THREE.Vector3(0, 0, 20000));
    const down = pose.position.clone().sub(origin).normalize();
    const distance = rayBarge(pose, origin, down, 40000);
    expect(distance).not.toBeNull();
    expect(distance!).toBeLessThan(origin.distanceTo(pose.position));
    expect(rayBarge(pose, origin, down, distance! - 1)).toBeNull();
    // a beam well above it misses
    expect(rayBarge(pose, origin.clone().add(new THREE.Vector3(0, 5000, 0)), down, 40000)).toBeNull();
  });

  it('pushes a ship out of its hull, and leaves one clear of it be', () => {
    const inside = pose.position.clone();
    const normal = new THREE.Vector3();
    expect(touchBarge(pose, inside, 340, normal)).toBe(true);
    // out of one box at a time, as a frame after a frame does
    let tries = 0;
    while (touchBarge(pose, inside, 340, normal) && tries < 10) tries++;
    expect(tries).toBeLessThan(10);
    expect(touchBarge(pose, inside, 340, normal)).toBe(false);
    expect(touchBarge(pose, pose.position.clone().add(new THREE.Vector3(0, BARGE_LENGTH, 0)), 340, normal)).toBe(false);
  });
});
