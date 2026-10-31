import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Lensing, lensAngles } from './lensing';
import { HOLE_SHADOW } from '../world/landmarks';

const HORIZON = 7000;

/** A camera at `distance` from a hole at the origin, turned `yaw` (rad) away from it. */
const camera = (distance: number, yaw: number) => {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 10, 700000);
  c.position.set(distance, 0, 0);
  c.lookAt(0, 0, 0);
  c.rotateY(yaw);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
};

/** The angle (rad) between the ray through a point of the picture (NDC) and the line to the hole. */
const offHole = (c: THREE.PerspectiveCamera, x: number, y: number) => {
  const ray = new THREE.Vector3(x, y, 0.5).unproject(c).sub(c.position).normalize();
  return ray.angleTo(c.position.clone().negate().normalize());
};

/** The least angle any pixel's ray makes with the line to the hole, over a grid across the picture. */
const nearest = (c: THREE.PerspectiveCamera) => {
  let least = Math.PI;
  for (let i = 0; i <= 64; i++) for (let j = 0; j <= 36; j++) least = Math.min(least, offHole(c, -1 + i / 32, -1 + j / 18));
  return least;
};

describe("the black hole's lens", () => {
  it('draws the shadow straight ahead at its share of the screen height', () => {
    for (const distance of [14000, 40000, 120000]) {
      const c = camera(distance, 0);
      const { shadow } = lensAngles(HORIZON, distance, THREE.MathUtils.degToRad(c.fov));
      // the cone's rim straight above the hole, on the picture
      const rim = new THREE.Vector3(0, Math.tan(shadow) * distance, 0).project(c);
      expect(rim.y / 2).toBeCloseTo((HOLE_SHADOW * Math.atan(HORIZON / distance)) / THREE.MathUtils.degToRad(c.fov), 6);
    }
  });

  it('is on wherever the shadow or its photon ring reaches into the picture, the hole beside or behind the camera too, and bends only the light of a hole ahead', () => {
    const lens = new Lensing();
    for (const distance of [12000, 14000, 20000, 40000]) {
      for (let degrees = 0; degrees <= 180; degrees += 5) {
        const c = camera(distance, THREE.MathUtils.degToRad(degrees));
        lens.update(c, new THREE.Vector3(), HORIZON, null);
        const { shadow } = lensAngles(HORIZON, distance, THREE.MathUtils.degToRad(c.fov));
        const reach = nearest(c);
        // a pixel inside the shadow or on its ring: the lens draws it
        if (reach < shadow * 1.2) expect(lens.pass.enabled, `${distance} units, ${degrees}°`).toBe(true);
        if (lens.pass.enabled) {
          expect(lens.pass.uniforms.shadowAngle.value).toBeCloseTo(shadow, 9);
          // the bend fades out before the hole comes abeam
          if (degrees <= 70) expect(lens.pass.uniforms.bend.value).toBe(1);
          if (degrees >= 90) expect(lens.pass.uniforms.bend.value).toBeCloseTo(0, 9);
        }
        // far behind, with nothing of it in the picture: off
        if (degrees >= 90 && reach > shadow * 1.6) expect(lens.pass.enabled, `${distance} units, ${degrees}°`).toBe(false);
      }
    }
    lens.update(camera(14000, 0), null, HORIZON, null);
    expect(lens.pass.enabled).toBe(false);
  });

  it('shows the shadow of a hole 700 m out and 80° off the nose on the edge of the picture', () => {
    const c = camera(14000, THREE.MathUtils.degToRad(80));
    const { shadow } = lensAngles(HORIZON, 14000, THREE.MathUtils.degToRad(c.fov));
    // the middle of the picture's right edge lies in the shadow
    expect(offHole(c, 1, 0)).toBeLessThan(shadow);
    const lens = new Lensing();
    lens.update(c, new THREE.Vector3(), HORIZON, null);
    expect(lens.pass.enabled).toBe(true);
  });
});
