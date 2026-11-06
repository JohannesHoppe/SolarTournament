import * as THREE from 'three';

/**
 * Boxes in their own frame (centered, axis-aligned, `half` the extents), for what collides as
 * boxes: the hull of a wreck, the President's battleships.
 */

/**
 * A sphere of `radius` around `local` (in the box's frame) against the box: the point of the
 * box closest to the center (on its surface; for a center inside, on the face nearest to it)
 * into `closest`, and the outward normal there into `normal`, when the sphere touches the box;
 * otherwise null.
 */
export function boxContact(local: THREE.Vector3, half: THREE.Vector3, radius: number, normal: THREE.Vector3, closest: THREE.Vector3): THREE.Vector3 | null {
  closest.set(THREE.MathUtils.clamp(local.x, -half.x, half.x), THREE.MathUtils.clamp(local.y, -half.y, half.y), THREE.MathUtils.clamp(local.z, -half.z, half.z));
  const distance = normal.subVectors(local, closest).length();
  if (distance >= radius) return null;
  if (distance > 0) {
    normal.divideScalar(distance);
    return closest;
  }
  // the center is inside: out through the nearest face
  const dx = half.x - Math.abs(local.x);
  const dy = half.y - Math.abs(local.y);
  const dz = half.z - Math.abs(local.z);
  // the shallowest depth, the first axis on a tie
  const axis = dx <= dy && dx <= dz ? 0 : dy <= dz ? 1 : 2;
  normal.set(0, 0, 0).setComponent(axis, Math.sign(local.getComponent(axis)) || 1);
  closest.copy(local).setComponent(axis, normal.getComponent(axis) * half.getComponent(axis));
  return closest;
}

/** How many steps `step` from `origin` (both in the box's frame) a ray goes until it meets the box (slabs); 0 from inside; null when it misses. */
export function rayBox(origin: THREE.Vector3, step: THREE.Vector3, half: THREE.Vector3): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const start = origin.getComponent(axis);
    const d = step.getComponent(axis);
    const h = half.getComponent(axis);
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(start) > h) return null;
      continue;
    }
    const a = (-h - start) / d;
    const b = (h - start) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far || far < 0) return null;
  return Math.max(near, 0);
}

/** A box of a hull built of boxes (a hauler, a barge): its middle, its own turn and its half extents, in the hull's frame. */
export interface HullBox {
  center: THREE.Vector3;
  turn: THREE.Quaternion;
  half: THREE.Vector3;
}

/** Where a hull stands: its world position and turn. */
export interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const hullLocal = new THREE.Vector3();
const hullClosest = new THREE.Vector3();
const hullInverse = new THREE.Quaternion();
const hullStep = new THREE.Vector3();

/**
 * Whether a sphere of `radius` at `position` touches a hull of `boxes` posed by `pose`: moves the
 * sphere out of the box it touches and sets the outward `normal` (both in the world).
 */
export function touchHull(boxes: readonly HullBox[], pose: Pose, position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
  for (const box of boxes) {
    // into the box's frame: the hull's turn, then the box's own
    hullInverse.copy(pose.quaternion).multiply(box.turn).invert();
    hullLocal.copy(box.center).applyQuaternion(pose.quaternion).add(pose.position);
    hullLocal.subVectors(position, hullLocal).applyQuaternion(hullInverse);
    if (!boxContact(hullLocal, box.half, radius, normal, hullClosest)) continue;
    const outward = hullInverse.invert();
    normal.applyQuaternion(outward);
    // the sphere's center out to its radius beyond the closest point of the box
    hullClosest.applyQuaternion(outward);
    position.copy(box.center).applyQuaternion(pose.quaternion).add(pose.position).add(hullClosest).addScaledVector(normal, radius);
    return true;
  }
  return false;
}

/** How far along a beam from `origin` along `direction` (a unit vector) it meets a hull of `boxes` posed by `pose`, nearer than `max`; null when it does not. */
export function rayHull(boxes: readonly HullBox[], pose: Pose, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
  let best: number | null = null;
  for (const box of boxes) {
    hullInverse.copy(pose.quaternion).multiply(box.turn).invert();
    hullLocal.copy(box.center).applyQuaternion(pose.quaternion).add(pose.position);
    hullLocal.subVectors(origin, hullLocal).applyQuaternion(hullInverse);
    hullStep.copy(direction).applyQuaternion(hullInverse);
    const distance = rayBox(hullLocal, hullStep, box.half);
    if (distance !== null && distance < (best ?? max)) best = distance;
  }
  return best;
}
