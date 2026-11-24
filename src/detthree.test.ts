import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as GeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from './detmath';
import {
  angleTo,
  applyAxisAngle,
  CentripetalCurve,
  cylinderGeometry,
  deterministic,
  makeRotationAxis,
  makeRotationX,
  makeRotationY,
  makeRotationZ,
  mergeVertices,
  quaternionAngleTo,
  randomDirection,
  rotateTowards,
  rotateX,
  rotateY,
  rotateZ,
  setFromAxisAngle,
  setFromEuler,
  setRotation,
  slerp,
  updateProjection,
} from './detthree';
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

  it('draws a random direction as three.js does from the same numbers', () => {
    const draws = new Randomizer(11);
    const numbers = Array.from({ length: 400 }, () => draws.nextFloat());
    let k = 0;
    const ours = new THREE.Vector3();
    const theirs = new THREE.Vector3();
    const random = Math.random;
    try {
      for (let i = 0; i < 200; i++) {
        randomDirection(ours, () => numbers[k++]);
        k -= 2;
        Math.random = () => numbers[k++];
        theirs.randomDirection();
        Math.random = random;
        near(ours, theirs);
        expect(ours.length()).toBeCloseTo(1, 14);
      }
    } finally {
      Math.random = random;
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

  it("projects a camera as three.js's does, with a view offset and a film offset too", () => {
    for (let i = 0; i < 100; i++) {
      const theirs = new THREE.PerspectiveCamera(r.range(20, 120), r.range(0.4, 2.5), r.range(0.1, 10), r.range(1e3, 1e7));
      theirs.zoom = r.range(0.5, 2);
      if (i % 2) theirs.setViewOffset(1920, 1080, r.range(-200, 200), r.range(-100, 100), 1600, 1000);
      if (i % 3 === 0) theirs.filmOffset = r.range(-5, 5);
      theirs.updateProjectionMatrix();
      const ours = updateProjection(theirs.clone());
      near(ours.projectionMatrix, theirs.projectionMatrix);
      near(ours.projectionMatrixInverse, theirs.projectionMatrixInverse);
    }
  });

  it("builds a cylinder and welds vertices as three.js does, on the deterministic functions", () => {
    const sameArrays = (ours: THREE.BufferGeometry, theirs: THREE.BufferGeometry) => {
      for (const name of Object.keys(theirs.attributes)) nearValues(ours.getAttribute(name).array, theirs.getAttribute(name).array);
      expect(ours.index?.array).toEqual(theirs.index?.array);
    };
    for (const args of [[], [0.5, 2, 3, 11, 4, true, 1, 3], [3, 3, 7, 16, 1, true, Math.PI, Math.PI]] as ConstructorParameters<typeof THREE.CylinderGeometry>[])
      sameArrays(cylinderGeometry(...args), new THREE.CylinderGeometry(...args));
    for (const detail of [1, 3, 5]) {
      const sphere = () => new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv');
      sameArrays(mergeVertices(sphere()), GeometryUtils.mergeVertices(sphere()));
    }
  });

  it("puts Math's own functions back after a deterministic build, nested or failing too", () => {
    const math = Math as unknown as Record<string, unknown>;
    const own = math['cos'];
    expect(own).not.toBe(cos);
    deterministic(() => {
      expect(math['cos']).toBe(cos);
      deterministic(() => expect(math['sin']).toBe(sin));
      expect(math['sin']).toBe(sin);
    });
    expect(() =>
      deterministic(() => {
        throw new Error('failed');
      }),
    ).toThrow('failed');
    expect(math['cos']).toBe(own);
  });
});
