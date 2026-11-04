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

/**
 * The depot at the middle of the yard, where the lane leads: an old Navy station of modules
 * plugged together around a node, moored to Psyche by a tether running down from its truss. The
 * hangar module faces down the lane with bay 3 inside it, 60 m deep, 80 m wide and 40 m high, and
 * a round landing pad on its floor where a ship docks; behind it the node, a ball 50 m across;
 * from the node the two habitat cylinders reach out to the sides (the couches of the Hosts in
 * debt), the office tower stands up with a mast and dish on top, the printer hall runs on behind
 * with its radiator wings above and below, solar wings spread at the habitats' ends, and the truss
 * runs down. Each part is a solid box of the field (kind 'rack', types from DEPOT_TYPE on; a
 * cylinder or the ball collides as the box just inside its round), so the bay is open where the
 * ship flies in. `shape` says how it is drawn: plated box, cylinder along an axis, ball, lattice,
 * radiator or solar panel. Centers and half extents in units, the depot's middle at the field's
 * center.
 */
export type DepotPart =
  | 'floor'
  | 'ceiling'
  | 'wallLeft'
  | 'wallRight'
  | 'back'
  | 'node'
  | 'habLeft'
  | 'habRight'
  | 'office'
  | 'printer'
  | 'truss'
  | 'mast'
  | 'radiatorUp'
  | 'radiatorDown'
  | 'solarLeft'
  | 'solarRight';
export type DepotShape = 'box' | 'x' | 'y' | 'z' | 'ball' | 'lattice' | 'radiator' | 'solar';
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The bay's inside (units): its mouth at BAY_MOUTH along x, its back wall at BAY_BACK, half its height and width. */
export const BAY_MOUTH = -1600;
export const BAY_BACK = -400;
export const BAY_HALF_HEIGHT = 400;
export const BAY_HALF_WIDTH = 800;
/** The hangar module's walls, floor and ceiling are this thick (units, 15 m). */
const SHELL = 300;
/** The node's radius (units, 25 m) and where it sits, right behind the hangar. */
const NODE_RADIUS = 500;
const NODE_X = BAY_BACK + 2 * SHELL / 3 + NODE_RADIUS;
/** The truss below the node, 300 m long (units). */
export const TRUSS_LENGTH = 6000;
/** A round module collides as the box just inside its round: this share of its radius. */
const ROUND_FILL = 0.9;
const bayMiddle = (BAY_MOUTH + BAY_BACK) / 2;
const bayHalf = (BAY_BACK - BAY_MOUTH) / 2;
const round = (radius: number, along: 'x' | 'y' | 'z', half: number) => {
  const r = radius * ROUND_FILL;
  return along === 'x' ? v(half, r, r) : along === 'y' ? v(r, half, r) : v(r, r, half);
};
export const DEPOT_LAYOUT: Readonly<Record<DepotPart, { center: THREE.Vector3; half: THREE.Vector3; shape: DepotShape }>> = {
  floor: { center: v(bayMiddle, -BAY_HALF_HEIGHT - SHELL / 2, 0), half: v(bayHalf, SHELL / 2, BAY_HALF_WIDTH + SHELL), shape: 'box' },
  ceiling: { center: v(bayMiddle, BAY_HALF_HEIGHT + SHELL / 2, 0), half: v(bayHalf, SHELL / 2, BAY_HALF_WIDTH + SHELL), shape: 'box' },
  wallLeft: { center: v(bayMiddle, 0, -BAY_HALF_WIDTH - SHELL / 2), half: v(bayHalf, BAY_HALF_HEIGHT, SHELL / 2), shape: 'box' },
  wallRight: { center: v(bayMiddle, 0, BAY_HALF_WIDTH + SHELL / 2), half: v(bayHalf, BAY_HALF_HEIGHT, SHELL / 2), shape: 'box' },
  back: { center: v(BAY_BACK + SHELL / 3, 0, 0), half: v(SHELL / 3, BAY_HALF_HEIGHT + SHELL, BAY_HALF_WIDTH + SHELL), shape: 'box' },
  node: { center: v(NODE_X, 0, 0), half: v(NODE_RADIUS * 0.82, NODE_RADIUS * 0.82, NODE_RADIUS * 0.82), shape: 'ball' },
  habLeft: { center: v(NODE_X, 0, -1800), half: round(420, 'z', 1400), shape: 'z' },
  habRight: { center: v(NODE_X, 0, 1800), half: round(420, 'z', 1400), shape: 'z' },
  office: { center: v(NODE_X, 1350, 0), half: round(360, 'y', 900), shape: 'y' },
  printer: { center: v(NODE_X + 1700, 0, 0), half: round(650, 'x', 1300), shape: 'x' },
  truss: { center: v(NODE_X, -NODE_RADIUS - TRUSS_LENGTH / 2, 0), half: v(160, TRUSS_LENGTH / 2, 160), shape: 'lattice' },
  mast: { center: v(NODE_X, 2250 + 600, 0), half: v(50, 600, 50), shape: 'lattice' },
  radiatorUp: { center: v(NODE_X + 1800, 650 + 600, 0), half: v(1000, 600, 20), shape: 'radiator' },
  radiatorDown: { center: v(NODE_X + 1800, -650 - 600, 0), half: v(1000, 600, 20), shape: 'radiator' },
  solarLeft: { center: v(NODE_X, 0, -3200 - 500), half: v(1800, 20, 500), shape: 'solar' },
  solarRight: { center: v(NODE_X, 0, 3200 + 500), half: v(1800, 20, 500), shape: 'solar' },
};
export const DEPOT_PARTS = Object.keys(DEPOT_LAYOUT) as DepotPart[];
/** The yard's templates of kind 'rack': the three racks, then the depot's parts in DEPOT_PARTS' order. */
export const DEPOT_TYPE = 3;
/** The landing pad of bay 3: its center on the bay's floor, its radius (units, 15 m). */
export const PAD = v(bayMiddle, -BAY_HALF_HEIGHT, 0);
export const PAD_RADIUS = 300;
/** Where the tether's foot lies: under the truss, on Psyche. */
export const TETHER_TOP = v(NODE_X, -NODE_RADIUS - TRUSS_LENGTH, 0);
/** The round modules' radii as drawn (units): a little beyond their collider boxes. */
export const DEPOT_RADIUS: Partial<Record<DepotPart, number>> = { node: NODE_RADIUS, habLeft: 420, habRight: 420, office: 360, printer: 650 };

/**
 * The half extents of each template's collider box (units): 0 a full rack, 1 a rack with gaps, 2
 * an empty frame, then the depot's parts.
 */
export const RACK_BOXES: readonly THREE.Vector3[] = [...[0, 1, 2].map(() => v(RACK_LENGTH / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2)), ...DEPOT_PARTS.map((part) => DEPOT_LAYOUT[part].half)];

/** Racks stand in rows this far apart (units, 260 m), with this gap between two racks of a row (80 m). */
export const ROW_SPACING = 5200;
export const RACK_GAP = 1600;

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
  DEPOT_PARTS.forEach((part, k) => racks.push({ kind: 'rack', type: DEPOT_TYPE + k, scale: 1, position: DEPOT_LAYOUT[part].center.clone(), orientation: level, solid: true }));
  return racks;
}

/** The far end of the lane through the yard (units, 1.3 km out): beside the last racks of the rows, where rack 7731 stands. */
export const YARD_END = 3 * (RACK_LENGTH + RACK_GAP) + RACK_LENGTH / 2;

/** Psyche's radius (units, 113 km) and how far its surface lies below the field's center (units, 6 km). */
export const PSYCHE_RADIUS = 2_260_000;
export const PSYCHE_BELOW = 120_000;
export const PSYCHE_CENTER = new THREE.Vector3(0, -(PSYCHE_RADIUS + PSYCHE_BELOW), 0);
