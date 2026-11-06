import * as THREE from 'three';
import { Randomizer } from '../random';
import type { Placement } from './asteroids';
import { SLOPE_HALF } from './vesta';
import { OCCATOR_BOXES } from './ceres';

/**
 * Where the Boneyard on Psyche (the campaign's first place, see docs/campaign/) puts things: the
 * flat floor of a crater on Psyche, the racks of dead fighters standing on it in rows, the yard's
 * floodlight masts, and the depot at the end of the lane. Psyche's gravity (PSYCHE_FALL, about
 * 0.015 g) holds all of it on the ground over the years and lets a ship that does nothing sink
 * slowly towards the floor. Only the numbers, so the arenas and the tests take them without the looks
 * (see world/boneyard). Centers and half extents in units, the field's center 60 m above the
 * crater floor.
 */

/** The crater floor lies this far below the field's center (units, 60 m). */
export const GROUND = -1200;
/** A rack is this long (units, 240 m), this tall and deep: a frame of girders holding three tiers of fighters on their cradles. */
export const RACK_LENGTH = 4800;
export const RACK_HEIGHT = 900;
export const RACK_DEPTH = 700;
/** The yard's seed: the rack's own number. */
export const YARD_SEED = 7731;
/** Racks stand in rows this far apart (units, 260 m), with this gap between two racks of a row (80 m). */
export const ROW_SPACING = 5200;
export const RACK_GAP = 1600;
/** The far end of the lane through the yard (units, 1.3 km out): beside the last racks of the rows, where rack 7731 stands. */
export const YARD_END = 3 * (RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2;
/** A rack's middle stands this high: on the ground. */
export const RACK_Y = GROUND + RACK_HEIGHT / 2;

/**
 * The depot at the lane's far end, on the crater floor, sized for fighters 35 m long and built as
 * a station is in space, for Psyche's pull is next to nothing: round modules, no walls to stand
 * on, everything moored to the ground by cables and anchors so it never drifts off. The hangar
 * hall a vault (half a cylinder) open towards the lane, inside 80 m deep, 90 m wide and 45 m high
 * with the round landing pad on its floor; beside it the two habitation cylinders on their
 * saddles, the couches of the Hosts in debt inside; behind it Rask's office tower, a column 120 m
 * high with the round, glazed cab of his office on top and a crane's boom reaching out over the
 * yard; the printer hall a dome; the crusher with its hopper; three spherical tanks on legs; the
 * dish. And along the lane the yard's floodlight masts. Each part is a solid box of the field
 * (kind 'rack', types from DEPOT_TYPE on; a round part collides as the box inside its round), so
 * the hall stands open where the ship flies in; `shape` says how it is drawn.
 */
export type DepotPart =
  | 'ground'
  | 'hallLeft'
  | 'hallRight'
  | 'hallBack'
  | 'hallRoof'
  | 'habLeft'
  | 'habRight'
  | 'tower'
  | 'cab'
  | 'boom'
  | 'printer'
  | 'crusher'
  | 'tankA'
  | 'tankB'
  | 'tankC'
  | 'dish'
  | 'mast1'
  | 'mast2'
  | 'mast3'
  | 'mast4'
  | 'mast5'
  | 'mast6';
export type DepotShape = 'ground' | 'wall' | 'vault' | 'end' | 'hab' | 'tower' | 'cab' | 'lattice' | 'dome' | 'crusher' | 'tank' | 'dish' | 'mast';
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The hangar hall's door at BAY_MOUTH along x, its back wall at BAY_BACK; its inside half as wide and as high as these (units). */
export const BAY_MOUTH = YARD_END + 2400;
export const BAY_BACK = BAY_MOUTH + 1600;
export const BAY_HALF_WIDTH = 900;
export const BAY_HEIGHT = 900;
/** The tanks' radius (units, 15 m). */
export const TANK_RADIUS = 300;
/** The hall's vault: half a cylinder of this radius (units, 70 m) over the bay, its axis on the ground. */
export const VAULT_RADIUS = 1400;
/** The habitation cylinders' radius (units, 21 m) and how high their saddles lift them (6 m). */
export const HAB_RADIUS = 420;
export const HAB_LIFT = 120;
/** The office tower's and its cab's radii (units, 16 and 26 m), the printer dome's (55 m). */
export const TOWER_RADIUS = 320;
export const CAB_RADIUS = 520;
export const DOME_RADIUS = 1100;
const bayMiddle = (BAY_MOUTH + BAY_BACK) / 2;
const bayHalf = (BAY_BACK - BAY_MOUTH) / 2;
const TOWER_X = BAY_BACK + 1400;
const TOWER_HEIGHT = 2400;
const on = (height: number) => GROUND + height / 2;
const mast = (x: number, z: number) => ({ center: v(x, on(1600), z), half: v(60, 800, 60), shape: 'mast' as const });
export const DEPOT_LAYOUT: Readonly<Record<DepotPart, { center: THREE.Vector3; half: THREE.Vector3; shape: DepotShape }>> = {
  // the crater floor out to the crater's wall, 4.5 km all round
  ground: { center: v(0, GROUND - 4000, 0), half: v(90000, 4000, 90000), shape: 'ground' },
  // the hall is a vault, half a cylinder lying on the ground; its colliders lie inside its shell: side walls, a roof slab, its closed end
  hallLeft: { center: v(bayMiddle, GROUND + 430, -BAY_HALF_WIDTH - 100), half: v(bayHalf, 430, 100), shape: 'wall' },
  hallRight: { center: v(bayMiddle, GROUND + 430, BAY_HALF_WIDTH + 100), half: v(bayHalf, 430, 100), shape: 'wall' },
  hallBack: { center: v(BAY_BACK + 100, GROUND + 525, 0), half: v(100, 525, BAY_HALF_WIDTH), shape: 'end' },
  hallRoof: { center: v(bayMiddle + 100, GROUND + 980, 0), half: v(bayHalf + 100, 80, 850), shape: 'vault' },
  // the habitation cylinders lying on their saddles beside the hall, each colliding as the box inside its round
  habLeft: { center: v(bayMiddle + 200, GROUND + HAB_LIFT + HAB_RADIUS, -VAULT_RADIUS - 200 - HAB_RADIUS), half: v(750, HAB_RADIUS * 0.7, HAB_RADIUS * 0.7), shape: 'hab' },
  habRight: { center: v(bayMiddle + 200, GROUND + HAB_LIFT + HAB_RADIUS, VAULT_RADIUS + 200 + HAB_RADIUS), half: v(750, HAB_RADIUS * 0.7, HAB_RADIUS * 0.7), shape: 'hab' },
  tower: { center: v(TOWER_X, on(TOWER_HEIGHT), 0), half: v(TOWER_RADIUS * 0.7, TOWER_HEIGHT / 2, TOWER_RADIUS * 0.7), shape: 'tower' },
  cab: { center: v(TOWER_X, GROUND + TOWER_HEIGHT + 200, 0), half: v(CAB_RADIUS * 0.7, 200, CAB_RADIUS * 0.7), shape: 'cab' },
  boom: { center: v(TOWER_X - 2200, GROUND + TOWER_HEIGHT + 460, 0), half: v(1700, 60, 60), shape: 'lattice' },
  // the printer hall a dome on the ground, colliding as the box inside it
  printer: { center: v(TOWER_X + 2000, GROUND + 300, -1800), half: v(600, 300, 600), shape: 'dome' },
  crusher: { center: v(TOWER_X + 1600, on(1000), 1900), half: v(450, 500, 450), shape: 'crusher' },
  tankA: { center: v(BAY_BACK + 600, GROUND + 700, 2800), half: v(TANK_RADIUS * 0.82, TANK_RADIUS * 0.82, TANK_RADIUS * 0.82), shape: 'tank' },
  tankB: { center: v(BAY_BACK + 1300, GROUND + 700, 3100), half: v(TANK_RADIUS * 0.82, TANK_RADIUS * 0.82, TANK_RADIUS * 0.82), shape: 'tank' },
  tankC: { center: v(BAY_BACK + 600, GROUND + 700, 3500), half: v(TANK_RADIUS * 0.82, TANK_RADIUS * 0.82, TANK_RADIUS * 0.82), shape: 'tank' },
  dish: { center: v(TOWER_X + 3200, on(800), 600), half: v(80, 400, 80), shape: 'dish' },
  // floodlights along the lane, between it and the first rows, on both sides
  mast1: mast(-2 * (RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2 + RACK_GAP / 2, -2600),
  mast2: mast(RACK_GAP / 2 + RACK_LENGTH / 2, -2600),
  mast3: mast(2 * (RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2 + RACK_GAP / 2, -2600),
  mast4: mast(-(RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2 + RACK_GAP / 2, 2600),
  mast5: mast((RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2 + RACK_GAP / 2, 2600),
  mast6: mast(YARD_END + 900, 2600),
};
export const DEPOT_PARTS = Object.keys(DEPOT_LAYOUT) as DepotPart[];
/** The yard's templates of kind 'rack': the three racks, then the depot's parts in DEPOT_PARTS' order. */
export const DEPOT_TYPE = 3;
/** The landing pad in the hangar hall: its center on the floor, its radius (units, 15 m). */
export const PAD = v(bayMiddle, GROUND, 0);
export const PAD_RADIUS = 300;
/** Where the crusher swallows what is brought to it: over its hopper. */
export const HOPPER = v(DEPOT_LAYOUT.crusher.center.x, GROUND + 1000 + 300, DEPOT_LAYOUT.crusher.center.z);

/**
 * The half extents of each template's collider box (units): 0 a full rack, 1 a rack with gaps, 2
 * an empty frame, then the depot's parts, then the slope under Vesta's claims (VESTA_GROUND_TYPE,
 * see world/vesta), then Occator's terrace, steps and domes (from OCCATOR_TYPE, see world/ceres).
 */
export const RACK_BOXES: readonly THREE.Vector3[] = [...[0, 1, 2].map(() => v(RACK_LENGTH / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2)), ...DEPOT_PARTS.map((part) => DEPOT_LAYOUT[part].half), SLOPE_HALF, ...OCCATOR_BOXES];
/** The template of the slope under Vesta's claims in the yards' set. */
export const VESTA_GROUND_TYPE = DEPOT_TYPE + DEPOT_PARTS.length;
/** The first of Occator's templates in the yards' set (see world/ceres, occatorGround). */
export const OCCATOR_TYPE = VESTA_GROUND_TYPE + 1;

/**
 * Where the racks stand: on the ground in rows along the field's x axis; the row through the
 * middle stays open, the lane to the depot. A rack in four stands empty, one in three has gaps.
 * Solid pieces: they never break, never move.
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
        position: new THREE.Vector3(column * (RACK_LENGTH + RACK_GAP), RACK_Y, row * ROW_SPACING),
        orientation: level,
        solid: true,
      });
    }
  }
  DEPOT_PARTS.forEach((part, k) => racks.push({ kind: 'rack', type: DEPOT_TYPE + k, scale: 1, position: DEPOT_LAYOUT[part].center.clone(), orientation: level, solid: true }));
  return racks;
}

/** Psyche's pull at its surface (units/s²): 0.144 m/s², about 0.015 g, from its mass of 2.4 × 10¹⁹ kg over its mean radius of 111 km. */
export const PSYCHE_FALL = 2.88;
/** Psyche's radius (units, 113 km); its surface beyond the crater's wall lies a little below the crater floor. */
export const PSYCHE_RADIUS = 2_260_000;
export const PSYCHE_BELOW = -GROUND + 1500;
export const PSYCHE_CENTER = new THREE.Vector3(0, -(PSYCHE_RADIUS + PSYCHE_BELOW), 0);
/** The crater's wall: rising from the floor at CRATER_RADIUS (units, 4.6 km) to its crest at CRATER_CREST (5.6 km), CRATER_HEIGHT high (400 m). */
export const CRATER_RADIUS = 92000;
export const CRATER_CREST = 112000;
export const CRATER_HEIGHT = 8000;
