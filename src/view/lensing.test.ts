import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Lensing } from './lensing';

const camera = () => {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 1, 1e6);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
};

describe('the black hole\'s lens', () => {
  it('is off for a hole far behind the camera, and a shadow whose edge reaches in is black without bending the picture', () => {
    const lens = new Lensing();
    const horizon = 1000;
    // far behind: nothing to see
    lens.update(camera(), new THREE.Vector3(0, 0, 100000), horizon, null);
    expect(lens.pass.enabled).toBe(false);
    // its middle just behind the camera plane, the shadow spanning 60 degrees: the edge is in the picture
    lens.update(camera(), new THREE.Vector3(1500, 0, 100), horizon, null);
    expect(lens.pass.enabled).toBe(true);
    expect(lens.pass.uniforms.bend.value).toBe(0);
    expect(lens.pass.uniforms.holeDepth.value).toBe(1);
    // in front: bent, the shadow's angle the sphere's as the camera sees it
    lens.update(camera(), new THREE.Vector3(0, 0, -5000), horizon, null);
    expect(lens.pass.enabled).toBe(true);
    expect(lens.pass.uniforms.bend.value).toBe(1);
    expect(lens.pass.uniforms.shadowAngle.value).toBeCloseTo(Math.asin((horizon * 1.3) / 5000), 6);
    // away: off
    lens.update(camera(), null, horizon, null);
    expect(lens.pass.enabled).toBe(false);
  });
});
