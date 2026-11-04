import * as THREE from 'three';
import { Randomizer } from '../random';
import type { Placement } from './asteroids';

/**
 * Where the Boneyard on Psyche (the campaign's first place, see docs/campaign/) puts things:
 * the racks of dead fighters and Psyche below. Only the numbers, so the arenas and the tests
 * take them without the racks' looks (see world/boneyard).
 */

/** A rack is this long (units, 240 m), this tall and deep: a frame of girders holding a row of fighters on their cradles. */
export const RACK_LENGTH = 4800;
export const RACK_HEIGHT = 900;
export const RACK_DEPTH = 700;
/** The yard's seed: the rack's own number. */
export const YARD_SEED = 7731;

/** The half extents of each rack template's collider box (units): 0 a full rack, 1 a rack with gaps, 2 an empty frame. */
export const RACK_BOXES: readonly THREE.Vector3[] = [0, 1, 2].map(() => new THREE.Vector3(RACK_LENGTH / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2));

/** Racks stand in rows this far apart (units, 260 m), with this gap between two racks of a row (80 m). */
const ROW_SPACING = 5200;
const RACK_GAP = 1600;

/**
 * Where the racks stand: rows along the field's x axis, every other row a little higher; the
 * row through the middle stays open, the lane to the yard office. A rack in four stands empty,
 * one in three has gaps. Solid pieces: they never break, never move.
 */
export function boneyardRacks(): Placement[] {
  const r = new Randomizer(YARD_SEED);
  const racks: Placement[] = [];
  const level = new THREE.Quaternion();
  for (let row = -4; row <= 4; row++) {
    for (let column = -3; column <= 3; column++) {
      const roll = r.nextFloat();
      if (row === 0) continue;
      racks.push({
        kind: 'rack',
        type: roll < 0.25 ? 2 : roll < 0.55 ? 1 : 0,
        scale: 1,
        position: new THREE.Vector3(column * (RACK_LENGTH + RACK_GAP), (row % 2) * 600, row * ROW_SPACING),
        orientation: level,
        solid: true,
      });
    }
  }
  return racks;
}

/** The far end of the lane through the yard (units, 1.3 km out): beside the last racks of the rows, where rack 7731 stands. */
export const YARD_END = 3 * (RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2;

/** Psyche's radius (units, 113 km) and how far its surface lies below the field's center (units, 6 km). */
export const PSYCHE_RADIUS = 2_260_000;
export const PSYCHE_BELOW = 120_000;
export const PSYCHE_CENTER = new THREE.Vector3(0, -(PSYCHE_RADIUS + PSYCHE_BELOW), 0);
