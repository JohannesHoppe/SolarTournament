import * as THREE from 'three';
import type { AsteroidField } from './asteroids';
import { densityIn, dragOn } from './air';
import { exp } from '../detmath';
import { HOVER_HEIGHT, HOVER_REACH, HOVER_RIDE, type Ground } from '../ship/flight';

/**
 * The hover field: every ship carries one. It pushes against the gravity of a large body (a
 * planet, a moon, a planetoid such as Psyche) and so holds a ship off that body's ground (the
 * field's pieces that are a world's ground, see Placement.ground); where no such body pulls (free
 * space, a rock of the field) it has nothing to push against and does nothing. What stands on the
 * ground (racks, modules, hulls, rocks) is no ground: the field holds a ship off nothing of it.
 *
 * It pushes along the ground's normal with the world's own pull times (HOVER_HEIGHT / h)², `h` the
 * height of the hull's underside over the ground: at the ride height it carries the ship's weight
 * exactly, lower it pushes harder by the square (up to HOVER_HARDEST times the weight), higher it
 * fades, and beyond HOVER_REACH ride heights it is gone, the last of them fading out smoothly. A
 * damping on the speed along the normal takes out the bounce, critical at the ride height. On a
 * world of strong pull the field is stiff, on Psyche's soft.
 */

/** Closer than this share of the ride height the push grows no more: 64 times the weight. */
const HOVER_CLOSEST = 1 / 8;
/**
 * A hull on a world's ground glides: it never bounces, and its speed across the ground bleeds off
 * at this rate while it touches (1/s: a tenth a second), the scrape of the hull on the ground.
 */
export const GROUND_SCRAPE = 0.1;

/**
 * The speed into a world's ground (units/s) the hover field takes out of a hull before it meets
 * the ground, on a world of `fall` (units/s²), reckoned from the field's own numbers: its damping
 * (critical at the ride height, 2√(2·fall/H) a second) takes that much speed per unit of height
 * over its reach of HOVER_REACH ride heights, and its push of fall·(H/h)² (HOVER_CLOSEST's 64
 * times the weight closest in) stores √(2·work) more. Europa's 0.13 g cushions 43 m/s, Psyche's
 * 0.015 g 14 m/s, Phobos's 0.0006 g 3 m/s. It holds alike against the ground's slopes and the
 * walls of its canyons, whichever way the ground's normal points.
 */
export function cushion(fall: number): number {
  const reach = HOVER_HEIGHT * HOVER_REACH;
  const damping = 2 * Math.sqrt((2 * fall) / HOVER_HEIGHT) * reach;
  const closest = HOVER_HEIGHT * HOVER_CLOSEST;
  const work = fall * HOVER_HEIGHT * HOVER_HEIGHT * (1 / closest - 1 / reach) + fall * (HOVER_HEIGHT / closest) * (HOVER_HEIGHT / closest) * closest;
  return damping + Math.sqrt(2 * work);
}

/**
 * The blow (units/s) a hull meeting a world's ground `into` fast (units/s, along the ground's own
 * normal, a canyon's wall and a terrace's edge alike) takes, on a world of `fall`: what the field's
 * cushion leaves, struck as on rock (see ship/impact, impactDamage). Gliding along a wall at a
 * shallow angle stays under the cushion; meeting it steeply strikes it.
 */
export const groundBlow = (into: number, fall: number) => Math.max(0, into - cushion(fall));

/** The ground under the ship last reckoned (see hover). */
const under: Ground = { normal: new THREE.Vector3(), gap: 0 };
const normal = under.normal;

/**
 * Adds the hover field's push on a ship at `position` moving at `velocity`, its hit radius
 * `radius`, into `target` (units/s²), over the field's ground under it. Returns the ground (its
 * outward normal and the height of the hull's underside over it; a scratch record, valid until the
 * next call) while the ship rides it (within HOVER_RIDE ride heights), else null.
 */
export function hover(field: AsteroidField, position: THREE.Vector3, velocity: THREE.Vector3, radius: number, target: THREE.Vector3): Ground | null {
  if (field.fall <= 0) return null;
  const height = field.groundBelow(position, normal);
  if (height === null) return null;
  const gap = height - radius;
  if (gap >= HOVER_HEIGHT * HOVER_RIDE) return null;
  under.gap = gap;
  const reach = HOVER_HEIGHT * HOVER_REACH;
  if (gap >= reach) return under;
  const fade = 1 - THREE.MathUtils.smoothstep(gap, reach - HOVER_HEIGHT, reach);
  const ratio = HOVER_HEIGHT / Math.max(gap, HOVER_HEIGHT * HOVER_CLOSEST);
  const fall = field.fall;
  // critical damping of the push's stiffness at the ride height, 2·fall/HOVER_HEIGHT
  const damping = 2 * Math.sqrt((2 * fall) / HOVER_HEIGHT);
  target.addScaledVector(normal, (fall * ratio * ratio - damping * velocity.dot(normal)) * fade);
  return under;
}

/**
 * What pulls and brakes a ship from outside over a step of `dt` (units/s²) into `target`: the
 * field's gravity, the hover field over a world's ground, and the drag of an arena's air (see
 * world/air); the air's density at the ship goes into its `flight` (for its lift, see
 * ship/flight's LIFT). Returns the ground while the ship rides it (see hover).
 */
export function outside(field: AsteroidField, position: THREE.Vector3, velocity: THREE.Vector3, radius: number, dt: number, target: THREE.Vector3, flight?: { airDensity: number }): Ground | null {
  if (flight) flight.airDensity = densityIn(field.air, position);
  field.gravity(position, target);
  const ground = hover(field, position, velocity, radius, target);
  if (field.air) dragOn(field.air, position, velocity, dt, target);
  return ground;
}

/** Copies `from` into `to`, returning `to`. */
export function copyGround(from: Ground, to: Ground): Ground {
  to.normal.copy(from.normal);
  to.gap = from.gap;
  return to;
}

/**
 * A hull on a world's ground (outward `normal`; the ground does not move): it glides over it,
 * its speed into the ground taken out, never bounced back, its speed across bleeding off at
 * GROUND_SCRAPE over `dt`. Returns how fast it was moving into the ground (units/s), 0 when it was
 * moving away.
 */
export function glide(velocity: THREE.Vector3, normal: THREE.Vector3, dt: number): number {
  const into = -velocity.dot(normal);
  if (into > 0) velocity.addScaledVector(normal, into);
  velocity.addScaledVector(normal, -velocity.dot(normal)).multiplyScalar(exp(-GROUND_SCRAPE * dt)).addScaledVector(normal, Math.max(0, -into));
  return Math.max(0, into);
}
