import * as THREE from 'three';

/** Impacts slower than this (units/s) only scratch the paint. */
export const SAFE_IMPACT = 250;
/** Hull damage per unit/s of impact speed above SAFE_IMPACT. */
const IMPACT_DAMAGE = 1 / 12;
/** Share of the impact speed a ship keeps when it bounces off a rock. */
const RESTITUTION = 0.3;
/**
 * Scraping along a surface takes sideways speed in proportion to how hard the hull was pushed
 * off it (a friction coefficient): a strike at 50 m/s takes about 10 m/s, and a ship resting
 * on a rock under its pull slides to a stop at the same rate whatever the frame rate.
 */
const FRICTION = 0.15;

const relative = new THREE.Vector3();

/**
 * A ship's `velocity` bounces off a surface moving at `moving` with the outward `normal`, and
 * scraping along it bleeds off some sideways speed; returns how fast it struck (units/s), 0
 * when it was moving away. A livelier body than a ship's hull passes its own `restitution`.
 */
export function bounceOff(velocity: THREE.Vector3, moving: THREE.Vector3, normal: THREE.Vector3, restitution = RESTITUTION): number {
  relative.subVectors(velocity, moving);
  const approach = -relative.dot(normal);
  if (approach <= 0) return 0;
  const push = approach * (1 + restitution);
  velocity.addScaledVector(normal, push);
  relative.subVectors(velocity, moving);
  const slide = relative.addScaledVector(normal, -relative.dot(normal));
  const sliding = slide.length();
  if (sliding > 1e-6) velocity.addScaledVector(slide, -Math.min(1, (FRICTION * push) / sliding));
  return approach;
}

/** The hull an impact this fast (units/s) takes. */
export const impactDamage = (approach: number) => Math.max(0, approach - SAFE_IMPACT) * IMPACT_DAMAGE;
