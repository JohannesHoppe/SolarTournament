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
 * when it was moving away.
 */
export function bounceOff(velocity: THREE.Vector3, moving: THREE.Vector3, normal: THREE.Vector3): number {
  relative.subVectors(velocity, moving);
  const approach = -relative.dot(normal);
  if (approach <= 0) return 0;
  const push = approach * (1 + RESTITUTION);
  velocity.addScaledVector(normal, push);
  relative.subVectors(velocity, moving);
  const slide = relative.addScaledVector(normal, -relative.dot(normal));
  const sliding = slide.length();
  if (sliding > 1e-6) velocity.addScaledVector(slide, -Math.min(1, (FRICTION * push) / sliding));
  return approach;
}

/** The hull an impact this fast (units/s) takes. */
export const impactDamage = (approach: number) => Math.max(0, approach - SAFE_IMPACT) * IMPACT_DAMAGE;

/**
 * Two ships meeting slower than this (units/s, 15 m/s, their closing speed along the line between
 * them) only bump: a clunk through the hull and a bounce, scratches and dents. A pack flying
 * together, or two ships touching while they jostle, never closes this fast.
 */
export const RAM_SAFE = 300;
/**
 * Where a ram strikes a ship decides what breaks, as with the laser: the armored nose takes
 * RAM_NOSE of the hull damage a rock would deal at that speed, a flank RAM_FLANK and shakes the
 * thrusters (RAM_THRUSTERS of their health per point of hull), the open drive the full damage
 * and loses all its thrust once the ram closes RAM_DRIVE (units/s, 45 m/s) faster than RAM_SAFE,
 * so 60 m/s into a drive sends its reactor critical. A ram that hurts at all hurts at least as
 * much as a laser's hit (RAM_LEAST hull, and a fifth of the drive's thrust from behind).
 *
 * Two ships meeting nose to nose at full speed (a closing speed above 215 m/s) both go
 * down; an overdrive's shove into a drive kills the ship ahead and leaves the rammer badly hurt
 * (at 150 m/s closing, about two thirds of its hull).
 */
const RAM_NOSE = 0.3;
const RAM_FLANK = 0.5;
const RAM_THRUSTERS = 0.01;
const RAM_DRIVE = 900;
const RAM_LEAST = 2;
const RAM_LEAST_DRIVE = 0.2;
/** The two ships keep this share of their closing speed, apart again (as off a rock). */
const RAM_RESTITUTION = RESTITUTION;

/** Where a ram strikes a ship: its armored nose, a flank, or the open drive behind. */
export type RamZone = 'nose' | 'flank' | 'drive';

/** What a ram closing at `closing` (units/s) does to a ship struck in `zone`: hull points, and shares of the drive's and the thrusters' health. */
export function ramDamage(closing: number, zone: RamZone): { hull: number; drive: number; thrusters: number } {
  if (closing <= RAM_SAFE) return { hull: 0, drive: 0, thrusters: 0 };
  const rock = (closing - RAM_SAFE) * IMPACT_DAMAGE;
  if (zone === 'drive') return { hull: Math.max(RAM_LEAST, rock), drive: Math.max(RAM_LEAST_DRIVE, (closing - RAM_SAFE) / RAM_DRIVE), thrusters: 0 };
  const hull = Math.max(RAM_LEAST, rock * (zone === 'nose' ? RAM_NOSE : RAM_FLANK));
  return { hull, drive: 0, thrusters: zone === 'flank' ? Math.min(1, hull * RAM_THRUSTERS) : 0 };
}

/**
 * Two ships of equal mass meet: `apart` points from the first to the second (unit length). Their
 * velocities change by the same impulse in opposite directions, as two bodies of equal mass
 * that keep RAM_RESTITUTION of their closing speed apart; `first`/`second` say whose velocity
 * this browser changes (it runs that ship). Returns the closing speed (units/s), 0 when they
 * were already moving apart.
 */
export function ram(a: THREE.Vector3, b: THREE.Vector3, apart: THREE.Vector3, first: boolean, second: boolean): number {
  const closing = relative.subVectors(a, b).dot(apart);
  if (closing <= 0) return 0;
  const impulse = (closing * (1 + RAM_RESTITUTION)) / 2;
  if (first) a.addScaledVector(apart, -impulse);
  if (second) b.addScaledVector(apart, impulse);
  return closing;
}
