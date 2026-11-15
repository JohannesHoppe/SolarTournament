import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Lensing, hotSpots, lensAngles, lensRegion, type Region } from './lensing';
import { HOLE_SHADOW } from '../world/landmarks';
import { acos, atan, cos, hypot, pow, sin, tan } from '../detmath';

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
      const rim = new THREE.Vector3(0, tan(shadow) * distance, 0).project(c);
      expect(rim.y / 2).toBeCloseTo((HOLE_SHADOW * atan(HORIZON / distance)) / THREE.MathUtils.degToRad(c.fov), 6);
    }
  });

  it('is on wherever the hole lies, its shadow reaching into the picture with the hole behind the camera too, and bends only the light of a hole ahead', () => {
    const lens = new Lensing();
    let rimsBehind = 0;
    for (const distance of [10000, 14000, 20000, 40000]) {
      for (let degrees = 0; degrees <= 180; degrees += 5) {
        const c = camera(distance, THREE.MathUtils.degToRad(degrees));
        lens.update(c, new THREE.Vector3(), HORIZON, null);
        const { shadow } = lensAngles(HORIZON, distance, THREE.MathUtils.degToRad(c.fov));
        expect(lens.pass.enabled, `${distance} units, ${degrees}°`).toBe(true);
        expect(lens.pass.uniforms.shadowAngle.value).toBeCloseTo(shadow, 9);
        // the bend fades out before the hole comes abeam
        if (degrees <= 70) expect(lens.pass.uniforms.bend.value).toBe(1);
        if (degrees >= 90) expect(lens.pass.uniforms.bend.value).toBeCloseTo(0, 9);
        // the hole's middle beside or behind the camera, a pixel's ray in its shadow
        if (degrees >= 90 && nearest(c) < shadow) rimsBehind++;
      }
    }
    expect(rimsBehind).toBeGreaterThan(0);
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

  it('flares its hot spots only with the disk seen nearly edge-on, the side streaming towards the pilot the brighter, as the gas circles counterclockwise seen from above', () => {
    const spots = { spotLateral: { value: new THREE.Vector3() }, spotNormal: { value: new THREE.Vector3() }, spotBoost: { value: new THREE.Vector2() }, spotFlare: { value: 0 } };
    // the pilot on +x looking at the hole: the side towards -z is where the gas streams away (towards -x), the side towards +z where it comes on
    hotSpots(new THREE.Vector3(-1, 0, 0), spots);
    expect(spots.spotFlare.value).toBe(1);
    expect(spots.spotLateral.value.z).toBeCloseTo(-1, 9);
    expect(spots.spotNormal.value.y).toBeCloseTo(1, 9);
    expect(spots.spotBoost.value.x).toBeCloseTo(pow(0.45, 3), 9);
    expect(spots.spotBoost.value.y).toBeCloseTo(pow(1.55, 3), 9);
    // 30° above the plane: fading; 60° above and straight down: none
    hotSpots(new THREE.Vector3(-cos(Math.PI / 6), -sin(Math.PI / 6), 0), spots);
    expect(spots.spotFlare.value).toBeGreaterThan(0);
    expect(spots.spotFlare.value).toBeLessThan(1);
    hotSpots(new THREE.Vector3(-0.5, -Math.sqrt(0.75), 0), spots);
    expect(spots.spotFlare.value).toBe(0);
    hotSpots(new THREE.Vector3(0, -1, 0), spots);
    expect(spots.spotFlare.value).toBe(0);
  });

  it('runs in full wherever it moves a pixel by half a texel or more or draws its ring, glow or hot spots, and only there', () => {
    const width = 1280;
    const height = 720;
    const region: Region = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const toHole = new THREE.Vector3();
    const ray = new THREE.Vector3();
    const across = new THREE.Vector3();
    const source = new THREE.Vector3();
    const here = new THREE.Vector3();
    let partial = 0;
    let empty = 0;
    let whole = 0;
    for (const distance of [12000, 30000, 68000]) {
      for (const degrees of [0, 40, 75, 82, 86, 90, 95, 110, 140, 180]) {
        for (const pitch of [-0.4, 0, 0.3]) {
          const c = camera(distance, THREE.MathUtils.degToRad(degrees));
          c.rotateX(pitch);
          c.updateMatrixWorld();
          const lens = new Lensing();
          lens.pass.setSize(width, height);
          lens.update(c, new THREE.Vector3(), HORIZON, null);
          const { shadow, ring } = lensAngles(HORIZON, distance, THREE.MathUtils.degToRad(c.fov));
          const bend = lens.pass.uniforms.bend.value;
          lensRegion(c, toHole.copy(c.position).negate().normalize(), shadow, ring, bend, width, height, region);
          const area = Math.max(0, region.x1 - region.x0) * Math.max(0, region.y1 - region.y0);
          if (area === 0) empty++;
          else if (area === 1) whole++;
          else partial++;
          // every 8th pixel: how far the bend moves it on screen (as the shader's first step finds its source), and whether a ring, glow or spot reaches it
          for (let px = 4; px < width; px += 8) {
            for (let py = 4; py < height; py += 8) {
              const x = (px / width) * 2 - 1;
              const y = (py / height) * 2 - 1;
              ray.set(x, y, 0.5).unproject(c).sub(c.position).normalize();
              const theta = acos(Math.min(Math.max(ray.dot(toHole), -1), 1));
              let moved = 0;
              if (bend > 0 && theta > 1e-6) {
                const beta = theta - (bend * ring * ring) / theta;
                across.copy(ray).addScaledVector(toHole, -ray.dot(toHole)).normalize();
                source.copy(toHole).multiplyScalar(cos(beta)).addScaledVector(across, sin(beta));
                // a source behind the camera: as far as it gets
                if (source.dot(c.getWorldDirection(here)) <= 0) moved = Infinity;
                else {
                  here.copy(c.position).add(source).project(c);
                  moved = hypot(((here.x - x) * width) / 2, ((here.y - y) * height) / 2);
                }
              }
              if (moved < 0.5 && theta >= 4 * shadow) continue;
              const u = px / width;
              const v = py / height;
              expect(u >= region.x0 && u <= region.x1 && v >= region.y0 && v <= region.y1, `${distance} units, ${degrees}°, pitch ${pitch}: pixel ${px}, ${py} moved ${moved.toFixed(2)} px, ${(theta / shadow).toFixed(2)} shadows out`).toBe(true);
            }
          }
        }
      }
    }
    // the bend reaches all of the picture with the hole ahead; beside it the region shrinks, behind the camera it is gone
    expect(whole).toBeGreaterThan(0);
    expect(partial).toBeGreaterThan(0);
    expect(empty).toBeGreaterThan(0);
  });
});
