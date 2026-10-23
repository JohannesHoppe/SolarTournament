import * as THREE from 'three';
import { contact, IMMOVABLE, type Body } from '../world/bodies';

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

/** A body bouncing off a surface, and the surface, which does not move (see bounceOff). */
const mover = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: 1 };
const wall = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };

/**
 * A ship's `velocity` bounces off a surface moving at `moving` with the outward `normal`, and
 * scraping along it bleeds off some sideways speed (a contact with a body that does not move,
 * see contact); returns how fast it struck (units/s), 0 when it was moving away. A livelier
 * body than a ship's hull passes its own `restitution`.
 */
export function bounceOff(velocity: THREE.Vector3, moving: THREE.Vector3, normal: THREE.Vector3, restitution = RESTITUTION): number {
  mover.velocity.copy(velocity);
  wall.velocity.copy(moving);
  const approach = contact(mover, wall, normal, restitution, FRICTION, true, false);
  velocity.copy(mover.velocity);
  return approach;
}

/** Two bodies bump, `normal` from b to a, each of them shoved by its share as a ship off a rock (see contact); returns how fast they closed. */
export function bump(a: Body, b: Body, normal: THREE.Vector3, restitution = RESTITUTION, moveA = true, moveB = true): number {
  return contact(a, b, normal, restitution, FRICTION, moveA, moveB);
}

/** The hull an impact this fast (units/s) takes. */
export const impactDamage = (approach: number) => Math.max(0, approach - SAFE_IMPACT) * IMPACT_DAMAGE;
