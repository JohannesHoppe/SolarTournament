import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { angleTo, applyAxisAngle, CentripetalCurve, makeRotationAxis, makeRotationX, makeRotationY, makeRotationZ, quaternionAngleTo, rotateTowards, rotateX, rotateY, rotateZ, setFromAxisAngle, setFromEuler, setRotation, slerp } from './detthree';
import { Randomizer } from './random';

// Each helper does what three.js's own does, to the rounding of the last bits.
const r = new Randomizer(7);
const unit = () => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
const angle = () => r.range(-7, 7);
const quaternion = () => new THREE.Quaternion(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
/** The same numbers to 12 digits. */
const nearValues = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(b[i])));
};
const near = (a: { toArray(): number[] }, b: { toArray(): number[] }) => nearValues(a.toArray(), b.toArray());

describe("detthree: three.js's rotations on the deterministic functions", () => {
  it('turns quaternions, vectors and matrices as three.js does', () => {
    for (let i = 0; i < 200; i++) {
      const axis = unit();
      const a = angle();
      near(setFromAxisAngle(new THREE.Quaternion(), axis, a), new THREE.Quaternion().setFromAxisAngle(axis, a));
      const v = unit().multiplyScalar(r.range(1, 100));
      near(applyAxisAngle(v.clone(), axis, a), v.clone().applyAxisAngle(axis, a));
      near(makeRotationAxis(new THREE.Matrix4(), axis, a), new THREE.Matrix4().makeRotationAxis(axis, a));
      near(makeRotationX(new THREE.Matrix4(), a), new THREE.Matrix4().makeRotationX(a));
      near(makeRotationY(new THREE.Matrix4(), a), new THREE.Matrix4().makeRotationY(a));
      near(makeRotationZ(new THREE.Matrix4(), a), new THREE.Matrix4().makeRotationZ(a));
      for (const order of ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'] as const) {
        const [x, y, z] = [angle(), angle(), angle()];
        near(setFromEuler(new THREE.Quaternion(), x, y, z, order), new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order)));
      }
    }
  });

  it('measures angles and blends rotations as three.js does', () => {
    for (let i = 0; i < 200; i++) {
      const a = unit().multiplyScalar(r.range(0.1, 10));
      const b = unit().multiplyScalar(r.range(0.1, 10));
      expect(angleTo(a, b)).toBeCloseTo(a.angleTo(b), 13);
      const p = quaternion();
      const q = quaternion();
      expect(quaternionAngleTo(p, q)).toBeCloseTo(p.angleTo(q), 7); // acos near 1 amplifies the last bits
      const t = r.nextFloat();
      near(slerp(p.clone(), q, t), p.clone().slerp(q, t));
      const step = r.range(0, 2);
      near(rotateTowards(p.clone(), q, step), p.clone().rotateTowards(q, step));
    }
    expect(angleTo(new THREE.Vector3(), new THREE.Vector3(1, 0, 0))).toBe(Math.PI / 2);
    const identity = new THREE.Quaternion();
    expect(rotateTowards(identity.clone(), identity, 1).equals(identity)).toBe(true);
  });

  it('turns geometries and objects as three.js does', () => {
    for (const [ours, theirs] of [
      [rotateX, 'rotateX'],
      [rotateY, 'rotateY'],
      [rotateZ, 'rotateZ'],
    ] as const) {
      const a = angle();
      const geometry = new THREE.BoxGeometry(1, 2, 3);
      nearValues(ours(geometry.clone(), a).getAttribute('position').array, geometry.clone()[theirs](a).getAttribute('position').array);
      const object = new THREE.Object3D();
      object.quaternion.copy(quaternion());
      near(ours(object.clone(), a).quaternion, object.clone()[theirs](a).quaternion);
    }
    const object = setRotation(new THREE.Object3D(), 0.3, -1.2, 2.5, 'YXZ');
    near(object.quaternion, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.2, 2.5, 'YXZ')));
  });

  it("draws the centripetal Catmull-Rom curve as three.js's, open and closed", () => {
    const points = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(i * 300 + r.range(-200, 200), r.range(-500, 500), r.range(-900, 900)));
    for (const closed of [true, false]) {
      const ours = new CentripetalCurve(points, closed);
      const theirs = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
      for (let i = 0; i <= 500; i++) near(ours.getPoint(i / 500), theirs.getPoint(i / 500));
      expect(ours.getLength() / theirs.getLength()).toBeCloseTo(1, 12);
    }
    // repeated points do not divide by zero
    const repeated = new CentripetalCurve([points[0], points[0], points[1], points[2]], false);
    for (let i = 0; i <= 10; i++) expect(Number.isFinite(repeated.getPoint(i / 10).x)).toBe(true);
  });
});
