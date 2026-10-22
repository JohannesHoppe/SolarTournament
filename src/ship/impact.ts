import * as THREE from 'three';

/** Impacts slower than this (units/s) only scratch the paint. */
export const SAFE_IMPACT = 250;
/** Hull damage per unit/s of impact speed above SAFE_IMPACT. */
const IMPACT_DAMAGE = 1 / 12;
/** Share of the impact speed a ship keeps when it bounces off a rock. */
const RESTITUTION = 0.3;

const relative = new THREE.Vector3();

/**
 * A ship's `velocity` bounces off a surface moving at `moving` with the outward `normal`, and
 * scraping along it bleeds off some sideways speed; returns how fast it struck (units/s), 0
 * when it was moving away.
 */
export function bounceOff(velocity: THREE.Vector3, moving: THREE.Vector3, normal: THREE.Vector3): number {
  relative.subVectors(velocity, moving);
  const approach = -relative.dot(normal);
  if (approach <= 0) return 0;
  velocity.addScaledVector(normal, approach * (1 + RESTITUTION));
  relative.subVectors(velocity, moving);
  velocity.addScaledVector(relative.addScaledVector(normal, -relative.dot(normal)), -0.2);
  return approach;
}

/** The hull an impact this fast (units/s) takes. */
export const impactDamage = (approach: number) => Math.max(0, approach - SAFE_IMPACT) * IMPACT_DAMAGE;
