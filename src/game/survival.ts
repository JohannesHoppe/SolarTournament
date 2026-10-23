import * as THREE from 'three';
import { ARENA_LIMIT } from '../world/arena';
import { FIELD_RADIUS } from '../world/asteroids';
import { SUN_DIRECTION } from '../world/space';

/**
 * Last Clone Standing: every Host has CLONES clones for the round, and a ship whose last clone
 * died is out. The last one with a clone left wins.
 */
export const CLONES = 3;

/**
 * The solar flare: the sun throws a wall of plasma at the arena. Its plasma is a sphere of
 * FLARE_RADIUS (units, 13.5 km), its center out towards the sun, so its front bulges only gently
 * into the field. FLARE_APPROACH seconds of field time before FLARE_START it shows up
 * FLARE_APPROACH_REACH beyond the arena's edge and comes at it; from FLARE_START its front eats
 * into the arena from the sun's side, evenly, until FLARE_END, where it stands FLARE_FRONT_END
 * from the center on the far side (1.7 km): what is left is a pocket on the side away from the
 * sun, a sliver of the arena 1.7 km deep at its middle and about 6 km across where the front meets
 * the arena's edge, its side towards the center among the field's outer rocks (they reach out to
 * 2.25 km), so there is cover and a fight to the end. A ship in the plasma takes FLARE_HEAT heat and FLARE_BURN hull
 * per second (about 17 s from a whole hull to nothing, and the laser locks from the heat long
 * before), only FLARE_SHADE of that with a rock between it and the sun.
 */
export const FLARE_START = 60;
export const FLARE_END = 240;
export const FLARE_APPROACH = 30;
export const FLARE_APPROACH_REACH = ARENA_LIMIT * 2;
export const FLARE_RADIUS = ARENA_LIMIT * 4;
export const FLARE_FRONT_END = -FIELD_RADIUS * 0.75;
export const FLARE_HEAT = 40;
export const FLARE_BURN = 6;
export const FLARE_SHADE = 0.25;
/** Bots turn back, and new clones are printed, within this share of the pocket's half depth (see flarePocket). */
export const FLARE_KEEP = 0.7;

/**
 * Where the flare's front is at a field time: how far from the arena's center towards the sun
 * its nearest point lies (units; negative: past the center, on the far side).
 */
export function flareFront(seconds: number): number {
  if (seconds < FLARE_START) {
    const coming = THREE.MathUtils.clamp((FLARE_START - seconds) / FLARE_APPROACH, 0, 1);
    return ARENA_LIMIT + FLARE_APPROACH_REACH * coming;
  }
  const progress = Math.min(1, (seconds - FLARE_START) / (FLARE_END - FLARE_START));
  return ARENA_LIMIT + (FLARE_FRONT_END - ARENA_LIMIT) * progress;
}

/** The center of the flare's plasma sphere at a field time, out towards the sun. */
export function flareCenter(seconds: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(SUN_DIRECTION).multiplyScalar(flareFront(seconds) + FLARE_RADIUS);
}

const center = new THREE.Vector3();

/** How far a point lies outside the flare's plasma (units; negative: inside it, that deep). */
export function flareClearance(position: THREE.Vector3, seconds: number): number {
  return position.distanceTo(flareCenter(seconds, center)) - FLARE_RADIUS;
}

/**
 * The safe pocket at a field time, as a ball for whoever keeps to it (bots, new clones): its
 * center on the axis away from the sun, halfway between the front and the arena's far edge, and
 * its radius half that way. Before the flare it is the whole arena.
 */
export function flarePocket(seconds: number, out: THREE.Vector3): number {
  const front = Math.min(ARENA_LIMIT, flareFront(seconds));
  out.copy(SUN_DIRECTION).multiplyScalar((front - ARENA_LIMIT) / 2);
  return (front + ARENA_LIMIT) / 2;
}

/** Clones a ship has left of the round's CLONES. */
export const clonesLeft = (ship: { deaths: number }) => Math.max(0, CLONES - ship.deaths);

/** Whether a ship has lost its last clone. */
export const isOut = (ship: { deaths: number }) => ship.deaths >= CLONES;

/** How many of the ships still have a clone left (counted by hand: it runs every frame). */
export function standing(ships: readonly { deaths: number }[]): number {
  let count = 0;
  for (const ship of ships) if (!isOut(ship)) count++;
  return count;
}
