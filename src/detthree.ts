/**
 * three.js's rotations, interpolations and curve built on `src/detmath.ts`.
 *
 * three.js computes them with `Math.sin`, `Math.cos`, `Math.acos` and `Math.pow`, which differ in
 * the last bits between processors and systems (see `src/detmath.ts`): `Quaternion.setFromAxisAngle`
 * and `setFromEuler`, `Quaternion.slerp`, `angleTo` and `rotateTowards`, `Vector3.applyAxisAngle`
 * and `angleTo`, `Matrix4.makeRotationX/Y/Z/Axis`, the `rotateX/Y/Z` of a geometry or an object,
 * an object's `rotation` (an Euler turned into its quaternion) and the centripetal
 * `CatmullRomCurve3`. These do the same with the deterministic functions; the shared world and
 * everything in `src/world`, `src/game`, `src/net` and `src/ship` uses them instead
 * (`src/detmath.guard.test.ts` holds the code to it). Each takes the object it sets and returns it.
 */
import * as THREE from 'three';
import { acos, cos, sin } from './detmath';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();
const turnB = new THREE.Quaternion();
const matrix = new THREE.Matrix4();

/** q as the rotation by angle (radians) about the unit axis: `Quaternion.setFromAxisAngle`. */
export function setFromAxisAngle(q: THREE.Quaternion, axis: THREE.Vector3, angle: number): THREE.Quaternion {
  const half = angle / 2;
  const s = sin(half);
  return q.set(axis.x * s, axis.y * s, axis.z * s, cos(half));
}

/**
 * q as the rotation of Euler angles x, y, z (radians) turned in the given order:
 * `Quaternion.setFromEuler`. The order names the axes as three.js does: 'XYZ' turns about X, then
 * the turned Y, then the twice turned Z.
 */
export function setFromEuler(q: THREE.Quaternion, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): THREE.Quaternion {
  q.identity();
  for (let i = 0; i < 3; i++) {
    const axis = order[i];
    q.multiply(setFromAxisAngle(turn, axis === 'X' ? X_AXIS : axis === 'Y' ? Y_AXIS : Z_AXIS, axis === 'X' ? x : axis === 'Y' ? y : z));
  }
  return q;
}

/** v turned by angle (radians) about the unit axis: `Vector3.applyAxisAngle`. */
export function applyAxisAngle(v: THREE.Vector3, axis: THREE.Vector3, angle: number): THREE.Vector3 {
  return v.applyQuaternion(setFromAxisAngle(turn, axis, angle));
}

/** The angle between two vectors in radians, π/2 if one is zero: `Vector3.angleTo`. */
export function angleTo(a: THREE.Vector3, b: THREE.Vector3): number {
  const denominator = Math.sqrt(a.lengthSq() * b.lengthSq());
  if (denominator === 0) return Math.PI / 2;
  return acos(THREE.MathUtils.clamp(a.dot(b) / denominator, -1, 1));
}

/** The angle between two unit quaternions' rotations, in radians: `Quaternion.angleTo`. */
export function quaternionAngleTo(a: THREE.Quaternion, b: THREE.Quaternion): number {
  return 2 * acos(Math.abs(THREE.MathUtils.clamp(a.dot(b), -1, 1)));
}

/** q turned the share t of the way to target along the shorter arc: `Quaternion.slerp`. */
export function slerp(q: THREE.Quaternion, target: THREE.Quaternion, t: number): THREE.Quaternion {
  let { x, y, z, w } = target;
  let dot = q.dot(target);
  if (dot < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
    dot = -dot;
  }
  let s = 1 - t;
  if (dot < 0.9995) {
    const theta = acos(dot);
    const sinTheta = sin(theta);
    s = sin(s * theta) / sinTheta;
    t = sin(t * theta) / sinTheta;
    return q.set(q.x * s + x * t, q.y * s + y * t, q.z * s + z * t, q.w * s + w * t);
  }
  // for small angles: a straight blend, normalized
  return q.set(q.x * s + x * t, q.y * s + y * t, q.z * s + z * t, q.w * s + w * t).normalize();
}

/** q turned towards target by at most step radians: `Quaternion.rotateTowards`. */
export function rotateTowards(q: THREE.Quaternion, target: THREE.Quaternion, step: number): THREE.Quaternion {
  const angle = quaternionAngleTo(q, target);
  if (angle === 0) return q;
  return slerp(q, target, Math.min(1, step / angle));
}

/** m as the rotation by theta (radians) about the x axis: `Matrix4.makeRotationX`. */
export function makeRotationX(m: THREE.Matrix4, theta: number): THREE.Matrix4 {
  const c = cos(theta);
  const s = sin(theta);
  return m.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
}

/** m as the rotation by theta (radians) about the y axis: `Matrix4.makeRotationY`. */
export function makeRotationY(m: THREE.Matrix4, theta: number): THREE.Matrix4 {
  const c = cos(theta);
  const s = sin(theta);
  return m.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
}

/** m as the rotation by theta (radians) about the z axis: `Matrix4.makeRotationZ`. */
export function makeRotationZ(m: THREE.Matrix4, theta: number): THREE.Matrix4 {
  const c = cos(theta);
  const s = sin(theta);
  return m.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** m as the rotation by angle (radians) about the unit axis: `Matrix4.makeRotationAxis`. */
export function makeRotationAxis(m: THREE.Matrix4, axis: THREE.Vector3, angle: number): THREE.Matrix4 {
  const c = cos(angle);
  const s = sin(angle);
  const t = 1 - c;
  const { x, y, z } = axis;
  const tx = t * x;
  const ty = t * y;
  return m.set(tx * x + c, tx * y - s * z, tx * z + s * y, 0, tx * y + s * z, ty * y + c, ty * z - s * x, 0, tx * z - s * y, ty * z + s * x, t * z * z + c, 0, 0, 0, 0, 1);
}

/**
 * Turns a geometry about a world axis, or an object about its own axis, by angle (radians):
 * `BufferGeometry.rotateX/Y/Z` and `Object3D.rotateX/Y/Z`.
 */
function rotate<T extends THREE.BufferGeometry | THREE.Object3D>(target: T, axis: 'x' | 'y' | 'z', angle: number): T {
  if (target instanceof THREE.BufferGeometry) {
    target.applyMatrix4(axis === 'x' ? makeRotationX(matrix, angle) : axis === 'y' ? makeRotationY(matrix, angle) : makeRotationZ(matrix, angle));
  } else {
    target.quaternion.multiply(setFromAxisAngle(turnB, axis === 'x' ? X_AXIS : axis === 'y' ? Y_AXIS : Z_AXIS, angle));
  }
  return target;
}
export const rotateX = <T extends THREE.BufferGeometry | THREE.Object3D>(target: T, angle: number) => rotate(target, 'x', angle);
export const rotateY = <T extends THREE.BufferGeometry | THREE.Object3D>(target: T, angle: number) => rotate(target, 'y', angle);
export const rotateZ = <T extends THREE.BufferGeometry | THREE.Object3D>(target: T, angle: number) => rotate(target, 'z', angle);

/** An object turned to Euler angles x, y, z (radians): what setting its `rotation` does. */
export function setRotation<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): T {
  setFromEuler(object.quaternion, x, y, z, order);
  return object;
}

/**
 * A centripetal Catmull-Rom curve through points, closed into a loop or open: as three.js's
 * `CatmullRomCurve3` of type 'centripetal' draws it (each stretch a cubic whose knots lie the
 * fourth root of the squared distance apart, so it never forms a cusp or a loop), its knot spacing
 * taken with `Math.sqrt` twice. An open curve's ends are extended by mirroring their neighbours.
 */
export class CentripetalCurve extends THREE.Curve<THREE.Vector3> {
  private readonly before = new THREE.Vector3();
  private readonly after = new THREE.Vector3();

  constructor(
    readonly points: THREE.Vector3[],
    readonly closed = false,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const points = this.points;
    const n = points.length;
    const p = (n - (this.closed ? 0 : 1)) * t;
    let i = Math.floor(p);
    let weight = p - i;
    if (this.closed) i += i > 0 ? 0 : (Math.floor(Math.abs(i) / n) + 1) * n;
    else if (weight === 0 && i === n - 1) {
      i = n - 2;
      weight = 1;
    }
    const p0 = this.closed || i > 0 ? points[(i - 1) % n] : this.before.subVectors(points[0], points[1]).add(points[0]);
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = this.closed || i + 2 < n ? points[(i + 2) % n] : this.after.subVectors(points[n - 1], points[n - 2]).add(points[n - 1]);
    let dt0 = Math.sqrt(Math.sqrt(p0.distanceToSquared(p1)));
    let dt1 = Math.sqrt(Math.sqrt(p1.distanceToSquared(p2)));
    let dt2 = Math.sqrt(Math.sqrt(p2.distanceToSquared(p3)));
    // repeated points
    if (dt1 < 1e-4) dt1 = 1;
    if (dt0 < 1e-4) dt0 = dt1;
    if (dt2 < 1e-4) dt2 = dt1;
    return target.set(
      hermite(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, weight),
      hermite(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2, weight),
      hermite(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, weight),
    );
  }
}

/**
 * One coordinate of a non-uniform Catmull-Rom stretch from x1 to x2 at w in [0, 1]: the cubic
 * Hermite curve whose tangents at x1 and x2 come from the neighbours x0 and x3 over the knot
 * spacings dt0, dt1, dt2.
 */
function hermite(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number, w: number): number {
  const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
  const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
  const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
  const c3 = 2 * x1 - 2 * x2 + t1 + t2;
  const w2 = w * w;
  return x1 + t1 * w + c2 * w2 + c3 * w2 * w;
}
