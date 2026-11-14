import * as THREE from 'three';
import { ramImpulse } from './impact';

/**
 * The spin a blow gives a hull. The hull is taken as a rod along its nose (HULL_LENGTH long,
 * its mass spread evenly: a moment of inertia of m·L²/12 about its middle), struck where the
 * blow lands along it: a ship coming from ahead or behind meets it near the nose or the drive,
 * one from the side near the middle. The blow's impulse is the ram's change of speed
 * (ramImpulse) times the hull's mass; its lever is how far along the hull it lands, and only the
 * part of it across the hull turns it. A blow straight on the flank's middle or straight on the
 * nose shoves without spinning; one on the nose's corner spins the hull hardest.
 */

/** The interceptor's length (units, 35 m), the rod a blow turns. */
export const HULL_LENGTH = 700;
/** The flight computer catches no faster spin than this (rad/s); a blow never sets more. */
export const SHOVE_SPIN_MAX = 6;

/**
 * Adds to `spin` (rad/s, the ship's own axes: x pitch, y yaw, z roll) what a blow from the
 * direction `blow` (unit length in the ship's frame, the way the hull is pushed)
 * at `closing` (units/s) gives it. Returns the spin added (rad/s).
 */
export function shoveSpin(blow: THREE.Vector3, closing: number, spin: THREE.Vector3): number {
  // where it lands along the hull: the striker sits against the push, at −blow, so the blow
  // lands half the length towards −blow.z along the axis
  const lever = (HULL_LENGTH / 2) * blow.z;
  // ω = r × J / I with J = m·Δv and I = m·L²/12: the mass drops out
  const rate = (lever * ramImpulse(closing) * 12) / (HULL_LENGTH * HULL_LENGTH);
  // r = (0, 0, −lever), the push along `blow`: r × blow = (lever·blow.y, −lever·blow.x, 0)
  let x = blow.y * rate;
  let y = -blow.x * rate;
  const size = Math.sqrt(x * x + y * y);
  if (size > SHOVE_SPIN_MAX) {
    x *= SHOVE_SPIN_MAX / size;
    y *= SHOVE_SPIN_MAX / size;
  }
  spin.x += x;
  spin.y += y;
  return Math.min(size, SHOVE_SPIN_MAX);
}
