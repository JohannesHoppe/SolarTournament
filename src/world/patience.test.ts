import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { patience, touchPatience } from './patience';

const pose = { position: new THREE.Vector3(0, 4000, -6000), quaternion: new THREE.Quaternion() };
const normal = new THREE.Vector3();

describe('Patience, the hauler of the campaign', () => {
  it('is solid where she is built and nowhere else: a sphere in her spine or a bin is pushed out of her, one in the gone bin\'s saddle or beyond her is not', () => {
    // in the spine between two bins
    const inSpine = pose.position.clone().add(new THREE.Vector3(1050, 100, 0));
    expect(touchPatience(pose, inSpine, 100, normal)).toBe(true);
    expect(normal.y).toBeCloseTo(1, 6);
    // moved out: clear of her now
    expect(touchPatience(pose, inSpine.clone(), 90, normal)).toBe(false);
    const inBin = pose.position.clone().add(new THREE.Vector3(-4200, 0, 560));
    expect(touchPatience(pose, inBin, 100, normal)).toBe(true);
    expect(normal.length()).toBeCloseTo(1, 6);
    // the port bin left out: its saddle is empty space
    expect(touchPatience(pose, pose.position.clone().add(new THREE.Vector3(-4200 + 4 * 1500, 0, -800)), 100, normal)).toBe(false);
    expect(touchPatience(pose, pose.position.clone().add(new THREE.Vector3(0, 3000, 0)), 340, normal)).toBe(false);
  });

  it('turns her colliders with her: what touches her bow touches it where the turned bow is', () => {
    const turned = { position: pose.position, quaternion: new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2) };
    // her bridge lies at -6000 along her own x; turned a quarter about y it lies at +6000 along the world's z
    expect(touchPatience(turned, pose.position.clone().add(new THREE.Vector3(0, 0, 6000)), 100, normal)).toBe(true);
    expect(touchPatience(turned, pose.position.clone().add(new THREE.Vector3(-6000, 0, 0)), 100, normal)).toBe(false);
  });

  it('is built once, with a box for every solid part', () => {
    expect(patience()).toBe(patience());
    expect(patience().colliders.length).toBeGreaterThan(30);
  });
});
