import * as THREE from 'three';
import { msg } from '../i18n/i18n';
import type { ArenaProfile, Reference } from './arenas';

/**
 * The reference plane: the horizontal plane through the field's center, square to the arena's
 * north pole (+Y). Every arena lies in it: the belt's and the Kessler field's balls of rock and
 * debris around it, the ring of ice and the black hole's disk in it, the derelict's bow along it,
 * the gas giant's clouds straight below it. The attitude's horizon, the pitch ladder, the bank
 * scale, the grid, the drop lines, the height and the climb all refer to it, so they agree.
 */
export const PLANE_UP: Readonly<THREE.Vector3> = new THREE.Vector3(0, 1, 0);

/** How far a point lies above the plane (units; below, negative). */
export const heightOf = (position: THREE.Vector3) => position.dot(PLANE_UP);

/** How fast a velocity climbs away from the plane (units/s; sinking, negative). */
export const climbOf = (velocity: THREE.Vector3) => velocity.dot(PLANE_UP);

/** Where a point lies on the plane straight below or above it (writes into `target`). */
export const footOf = (position: THREE.Vector3, target: THREE.Vector3) => target.copy(position).addScaledVector(PLANE_UP, -heightOf(position));

/**
 * Below this share of the plane's up seen across a view (the length of up in the view's picture
 * plane), the view looks almost straight up or down, and its bank means nothing.
 */
const BANK_STEEP = 0.2;
const up = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/**
 * Which way the plane's up points in a view's picture (rad, from the picture's top, clockwise
 * positive): 0 with the wings level, positive when the view is banked left (up leans right on
 * screen), as a fighter's sky pointer swings. NaN while the view looks almost straight up or
 * down (see BANK_STEEP).
 */
export function skyPointer(orientation: THREE.Quaternion): number {
  up.copy(PLANE_UP).applyQuaternion(inverse.copy(orientation).invert());
  return Math.hypot(up.x, up.y) < BANK_STEEP ? NaN : Math.atan2(up.x, up.y);
}

/**
 * The closure rate of a target, as fighters show it (Vc, units/s): how fast the range between
 * the two shrinks; negative while it opens.
 */
export function closure(position: THREE.Vector3, velocity: THREE.Vector3, targetPosition: THREE.Vector3, targetVelocity: THREE.Vector3): number {
  const dx = targetPosition.x - position.x;
  const dy = targetPosition.y - position.y;
  const dz = targetPosition.z - position.z;
  const range = Math.hypot(dx, dy, dz);
  if (range < 1e-6) return 0;
  return -((targetVelocity.x - velocity.x) * dx + (targetVelocity.y - velocity.y) * dy + (targetVelocity.z - velocity.z) * dz) / range;
}

/** The field's center, marked in every arena that has nothing there of its own. */
const CENTER: Reference = { glyph: 'center', label: msg('Center'), position: new THREE.Vector3(), distance: true };

/** An arena's fixed references besides the sun: the field's center (unless something of the arena lies there, the black hole) and its own. */
export function referencesOf(arena: ArenaProfile): Reference[] {
  return arena.references.some((reference) => reference.position.lengthSq() === 0) ? arena.references : [CENTER, ...arena.references];
}
