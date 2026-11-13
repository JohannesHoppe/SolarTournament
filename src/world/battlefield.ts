import * as THREE from 'three';
import { cos, hypot, sin } from '../detmath';
import { setFromEuler } from '../detthree';
import { Noise } from './noise';
import { reliefPiece, reliefTop } from './horizon';
import type { Placement } from './asteroids';
import { LAND, surfaceHeight } from './callisto';

/**
 * Valhalla as a world fought over (the deathmatch arena over Callisto, see FIGHT_WORLDS in
 * world/arenas): where things are, for the field and its scenery (world/hulk). The campaign's
 * place on Callisto stays as world/callisto lays it out; this ground takes the place's own beyond
 * the arena and its own within.
 *
 * Within the arena the ring zone is packed tight: a scarp every RING_SPACING across the field
 * (running along z, one after the other along x), RIDGE_LOW to RIDGE_HIGH over the plain, each
 * rising gently and dropping off in a cliff into a gorge at its foot. Through all of them, along
 * x, runs the furrow the Navy's battlecruiser Steadfast ploughed when it came down, long ago:
 * FURROW_HALF wide to each side of the middle, its floor FURROW_DEPTH under the plain, a berm of
 * thrown-up ice along both its lips; the cruiser lies in it broken in two, its halves apart with
 * a gorge of open space between them, half sunk into the ice. Ice bridges span a few gorges. The
 * clones are printed on pads round the arena's edge, on the ground. The arena is low and tight:
 * BOUNDS (1.25 km from the middle, 550 m over the plain), so a fight stays among the scarps.
 */

/** 1 m and 1 km in units. */
const M = 20;
const KM = 20000;

/** The arena's edge over Valhalla (units): RADIUS from the middle across the ground, and its ceiling as a height (550 m over the plain). */
export const BOUNDS = { radius: 1.25 * KM, ceiling: LAND + 550 * M };

/** The scarps: one every RING_SPACING (units, 650 m) along x, RIDGE_LOW to RIDGE_HIGH (100 m to 250 m) high, rising over RISE of the spacing, flat on top to TOP, dropping off by SCARP. */
const RING_SPACING = 650 * M;
const RIDGE_LOW = 100 * M;
const RIDGE_HIGH = 250 * M;
const RISE = 0.66;
const TOP = 0.74;
const SCARP = 0.89;
/** The gorge at a scarp's foot: GORGE_DEPTH (units, 70 m) deep at GORGE_AT of the spacing, GORGE_HALF of it wide to each side (about 40 m). */
const GORGE_DEPTH = 70 * M;
const GORGE_AT = 0.95;
const GORGE_HALF = 0.062;
/** A scarp's line meanders by up to MEANDER (units, 60 m) along its length, and its height by a quarter. */
const MEANDER = 60 * M;
const meander = new Noise(5161);
const crests = new Noise(5162);
/** Where the scarps' phase starts along x (units). */
const PHASE = 180 * M;

/** The furrow: its floor FURROW_DEPTH (units, 40 m) under the plain over FURROW_HALF (170 m) to each side of x, its walls out to FURROW_WALL (240 m), the berm BERM high (35 m) at BERM_AT (300 m) out, BERM_HALF wide. */
const FURROW_DEPTH = 40 * M;
const FURROW_HALF = 170 * M;
const FURROW_WALL = 240 * M;
const BERM = 35 * M;
const BERM_AT = 300 * M;
const BERM_HALF = 70 * M;
/** The furrow's floor in world height (units). */
export const FURROW_FLOOR = LAND - FURROW_DEPTH;

/** Hummocks over all of it: a few meters, some 100 m across. */
const BUMPS = 3 * M;
const BUMP_SCALE = 100 * M;
const bumps = new Noise(5163);

/** The arena's own ground within BLEND_IN of the middle (units, 1.6 km), the place's beyond BLEND_OUT (3 km), the one blending into the other between. */
const BLEND_IN = 1.6 * KM;
const BLEND_OUT = 3 * KM;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** A number in [0, 1) for scarp `k`, alike on every machine (integer hashing). */
function unit(k: number): number {
  let h = Math.imul(k ^ 0x5bd1e995, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The scarp's line at `z`: how far it is shifted along x there (units). */
const shiftAt = (z: number) => MEANDER * meander.fractal(0.31, z / (500 * M), 0.47, 2) * 2;

/** The scarp `k` at `z`: its height over the plain (units). */
const ridgeOf = (k: number, z: number) => (RIDGE_LOW + (RIDGE_HIGH - RIDGE_LOW) * unit(k)) * (0.78 + 0.44 * smooth(0.5 + crests.fractal(k * 1.7, z / (400 * M), 0.2, 2)));

/** The scarps and their gorges over the plain at (x, z) (units, 0 on the plain). */
function scarps(x: number, z: number): number {
  const along = x + shiftAt(z) + PHASE;
  const k = Math.floor(along / RING_SPACING);
  const p = along / RING_SPACING - k;
  const height = ridgeOf(k, z);
  const ridge = p < RISE ? height * smooth(p / RISE) : p < TOP ? height : p < SCARP ? height * (1 - smooth((p - TOP) / (SCARP - TOP))) : 0;
  const off = p > 0.5 ? Math.abs(p - GORGE_AT) : p + 1 - GORGE_AT;
  return ridge - GORGE_DEPTH * (1 - smooth(off / GORGE_HALF));
}

/** The furrow's share of the ground at `z` (1 on its floor, 0 beyond its walls). */
const furrowAt = (z: number) => 1 - smooth((Math.abs(z) - FURROW_HALF) / (FURROW_WALL - FURROW_HALF));

/** The arena's own ground at (x, z) (units, world height): the scarps, the furrow through them and the berm along it, hummocks over all. */
function arenaGround(x: number, z: number): number {
  const off = (Math.abs(z) - BERM_AT) / BERM_HALF;
  const berm = BERM * Math.max(0, 1 - off * off);
  const plain = LAND + scarps(x, z) + berm;
  const furrow = furrowAt(z);
  return plain + (FURROW_FLOOR - plain) * furrow + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.3, z / BUMP_SCALE, 2);
}

/** Valhalla's ground as the arena has it (units, its height) over (x, z): its own within BLEND_IN, the place's beyond BLEND_OUT. */
export function battleHeight(x: number, z: number): number {
  const r = hypot(x, z);
  if (r >= BLEND_OUT) return surfaceHeight(x, z);
  const own = arenaGround(x, z);
  if (r <= BLEND_IN) return own;
  const place = surfaceHeight(x, z);
  return own + (place - own) * smooth((r - BLEND_IN) / (BLEND_OUT - BLEND_IN));
}

/** How much of the ice lies bare at (x, z), 0 to 1: on the furrow's floor and its berm, churned up as the cruiser came down, and on the scarps' cliffs, too steep for dust to lie on. */
export function freshIce(x: number, z: number): number {
  const fade = 1 - smooth((hypot(x, z) - BLEND_IN) / (BLEND_OUT - BLEND_IN));
  const off = (Math.abs(z) - BERM_AT) / BERM_HALF;
  const churned = Math.max(furrowAt(z), 0.5 * Math.max(0, 1 - off * off)) * fade;
  const step = 10 * M;
  const slope = hypot(battleHeight(x + step, z) - battleHeight(x - step, z), battleHeight(x, z + step) - battleHeight(x, z - step)) / (2 * step);
  return Math.max(churned, smooth((slope - 0.7) / 0.8));
}

/** How far the arena's ground piece reaches (units, 3.2 km to each side), and how deep under its highest point (2 km). */
export const BATTLE_GROUND_HALF = new THREE.Vector3(3.2 * KM, 2 * KM, 3.2 * KM);
const groundPiece = reliefPiece(battleHeight, BATTLE_GROUND_HALF, reliefTop(battleHeight, BATTLE_GROUND_HALF) + 10 * M);
export const battleRelief = groundPiece.relief;
/** The ground's grid (units, 20 m): fine enough for the scarps' cliffs. */
export const BATTLE_GROUND_CELL = 20 * M;

/**
 * The cruiser Steadfast's halves (units): each a hull of HULL_HALF (300 m long, 60 m high, 75 m
 * to each side), a hall HALL wide and high through it from end to end (80 m by 60 m), its floor
 * FLOOR thick (25 m) and its roof ROOF (35 m), and a tunnel across it from flank to flank at its
 * middle, CROSS wide (70 m); the rest solid. The bow half lies along -x, the stern half along
 * +x, GAP apart (300 m between their torn ends), sunk BURIED (10 m) into the furrow's floor,
 * rolled and turned askew as they came to rest.
 */
export const HULL_HALF = new THREE.Vector3(300 * M, 60 * M, 75 * M);
export const HALL = { width: 80 * M, height: 60 * M };
const FLOOR = 25 * M;
const ROOF = 35 * M;
export const CROSS = 70 * M;
const GAP = 300 * M;
const BURIED = 10 * M;
/** The halves' parts' half extents (units): the floor under the hall, the roof over it, a stretch of wall beside it (four a half, the cross tunnel between them), the bridge tower on the stern half's roof, a turret on the bow half's. */
const WALL_THICK = HULL_HALF.z - HALL.width / 2;
export const FLOOR_HALF = new THREE.Vector3(HULL_HALF.x, FLOOR / 2, HULL_HALF.z);
export const ROOF_HALF = new THREE.Vector3(HULL_HALF.x, ROOF / 2, HULL_HALF.z);
export const WALL_HALF = new THREE.Vector3((HULL_HALF.x - CROSS / 2) / 2, HALL.height / 2, WALL_THICK / 2);
export const TOWER_HALF = new THREE.Vector3(25 * M, 30 * M, 30 * M);
export const TURRET_HALF = new THREE.Vector3(18 * M, 8 * M, 18 * M);
/** The hall's middle over the hull's middle (units): from the floor's top to the roof's underside. */
export const HALL_Y = -HULL_HALF.y + FLOOR + HALL.height / 2;

/** A half's pose: where its hull's middle lies and how it is turned. */
export interface HalfPose {
  readonly position: THREE.Vector3;
  readonly orientation: THREE.Quaternion;
  readonly bow: boolean;
}

const halfAt = (x: number, roll: number, yaw: number, pitch: number, bow: boolean): HalfPose => ({
  position: new THREE.Vector3(x, FURROW_FLOOR - BURIED + HULL_HALF.y, 0),
  orientation: setFromEuler(new THREE.Quaternion(), roll, yaw, pitch, 'YXZ'),
  bow,
});
/** The two halves: the bow along -x, rolled 7°, turned 5° and dug 1.5° in; the stern along +x, rolled the other way 10°, turned 6°. */
export const HALVES: readonly HalfPose[] = [halfAt(-(GAP / 2 + HULL_HALF.x), 0.122, 0.087, 0.026, true), halfAt(GAP / 2 + HULL_HALF.x, -0.175, -0.105, -0.017, false)];

/** The parts of a half in its own frame: the template's key and where its middle lies. */
export type HullPart = 'floor' | 'roof' | 'wall' | 'tower' | 'turret';
function partsOf(bow: boolean): { part: HullPart; at: THREE.Vector3 }[] {
  const wallX = CROSS / 2 + WALL_HALF.x;
  const wallZ = HALL.width / 2 + WALL_HALF.z;
  const parts: { part: HullPart; at: THREE.Vector3 }[] = [
    { part: 'floor', at: new THREE.Vector3(0, -HULL_HALF.y + FLOOR / 2, 0) },
    { part: 'roof', at: new THREE.Vector3(0, HULL_HALF.y - ROOF / 2, 0) },
  ];
  for (const x of [-wallX, wallX]) for (const z of [-wallZ, wallZ]) parts.push({ part: 'wall', at: new THREE.Vector3(x, HALL_Y, z) });
  // the stern half carries the bridge tower aft of its cross tunnel, the bow half two turrets
  if (bow) for (const x of [-170 * M, 120 * M]) parts.push({ part: 'turret', at: new THREE.Vector3(x, HULL_HALF.y + TURRET_HALF.y, 0) });
  else parts.push({ part: 'tower', at: new THREE.Vector3(150 * M, HULL_HALF.y + TOWER_HALF.y, 0) });
  return parts;
}

/** The templates of the yards' set the battlefield's pieces take (see world/yard). */
export interface BattleTypes {
  ground: number;
  bow: number;
  stern: number;
  roof: number;
  wall: number;
  tower: number;
  turret: number;
  bridge: number;
  pad: number;
}

const solidPiece = (type: number, position: THREE.Vector3, orientation: THREE.Quaternion, ground = false): Placement => ({ kind: 'rack', type, scale: 1, position, orientation, solid: true, ...(ground ? { ground } : {}) });

/** A point of a half's frame (`local`) in the world, into `out`. */
export function onHalf(half: HalfPose, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(local).applyQuaternion(half.orientation).add(half.position);
}

/** The cruiser's pieces: each half's floor (its looks the whole half's, a world's ground under the hall: the hover field carries a ship through it), roof, walls, tower or turrets. */
function cruiserPlacements(types: BattleTypes): Placement[] {
  const placements: Placement[] = [];
  for (const half of HALVES) {
    for (const { part, at } of partsOf(half.bow)) {
      const type = part === 'floor' ? (half.bow ? types.bow : types.stern) : types[part];
      placements.push(solidPiece(type, onHalf(half, at), half.orientation.clone(), part === 'floor'));
    }
  }
  return placements;
}

/**
 * The ice bridges (units): a slab of BRIDGE_HALF (140 m long, 20 m thick, 50 m wide) across the
 * gorge at a scarp's foot, its top 10 m over the plain, resting on the gorge's lips; some 60 m
 * of open gorge under it to fly through. Ice of the world, so its ground too: the hover field
 * carries a ship over it, and a hull meeting it glides. At the scarps of BRIDGES (each by its
 * number along x, and how far out from the furrow, units).
 */
export const BRIDGE_HALF = new THREE.Vector3(70 * M, 10 * M, 25 * M);
const BRIDGES: readonly [number, number][] = [
  [-2, 560 * M],
  [-1, -720 * M],
  [0, 820 * M],
  [1, -480 * M],
];
/** Where the gorge at the foot of scarp `k` runs at `z` (its x, units). */
const gorgeX = (k: number, z: number) => (k + GORGE_AT) * RING_SPACING - PHASE - shiftAt(z);
export const BRIDGE_AT: readonly THREE.Vector3[] = BRIDGES.map(([k, z]) => new THREE.Vector3(gorgeX(k, z), LAND, z));

/**
 * The clones' pads round the arena's edge (units): PADS of them PAD_OUT from the middle, each
 * the flattest spot of PAD_SEARCH tries within PAD_SPREAD of its bearing; a square deck of
 * PAD_HALF (30 m to each side) whose top stands PAD_LIFT (2 m) over the highest ground under it,
 * its foot 120 m down into the ice. A clone is printed over one, at the hover field's ride height.
 */
export const PAD_HALF = new THREE.Vector3(30 * M, 60 * M, 30 * M);
const PADS = 8;
const PAD_OUT = 1.05 * KM;
const PAD_SPREAD = 0.3;
const PAD_SEARCH = 13;
const PAD_LIFT = 2 * M;
export const PAD_AT: readonly THREE.Vector3[] = Array.from({ length: PADS }, (_, i) => {
  let best = { spread: Infinity, x: 0, z: 0, top: 0 };
  for (let k = 0; k < PAD_SEARCH; k++) {
    const bearing = ((i + 0.5) / PADS) * Math.PI * 2 + (k / (PAD_SEARCH - 1) - 0.5) * 2 * PAD_SPREAD;
    const x = PAD_OUT * cos(bearing);
    const z = PAD_OUT * sin(bearing);
    let low = Infinity;
    let high = -Infinity;
    for (const dx of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        const h = battleHeight(x + dx * PAD_HALF.x, z + dz * PAD_HALF.z);
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    }
    if (high - low < best.spread) best = { spread: high - low, x, z, top: high + PAD_LIFT };
  }
  return new THREE.Vector3(best.x, best.top, best.z);
});

/** Every piece of the battlefield: its ground, the cruiser's halves, the ice bridges and the pads (the bridges and the pads a world's ground too: the hover field carries a ship over them). */
export function battlefieldPlacements(types: BattleTypes): Placement[] {
  const level = new THREE.Quaternion();
  return [
    groundPiece.placement(types.ground),
    ...cruiserPlacements(types),
    ...BRIDGE_AT.map((at) => solidPiece(types.bridge, at.clone(), level.clone(), true)),
    ...PAD_AT.map((top) => solidPiece(types.pad, new THREE.Vector3(top.x, top.y - PAD_HALF.y, top.z), level.clone(), true)),
  ];
}

/**
 * Where a sponsor probe of a round shows up over Valhalla (into `out`), from the numbers `h`
 * gives (each in [0, 1)): most at the cruiser, so the fights go there (a quarter in its halves'
 * halls, a sixth in the gap between them, a fifth in the furrow beside it), the rest low over
 * the ground anywhere within 1.1 km.
 */
export function battleProbe(h: (k: number) => number, out: THREE.Vector3): THREE.Vector3 {
  const roll = h(1);
  if (roll < 0.25) return onHalf(HALVES[h(2) < 0.5 ? 0 : 1], out.set((h(3) * 2 - 1) * (HULL_HALF.x - 30 * M), HALL_Y, 0), out);
  if (roll < 0.42) return out.set((h(3) - 0.5) * GAP * 0.6, FURROW_FLOOR + (30 + h(4) * 60) * M, (h(5) - 0.5) * 200 * M);
  if (roll < 0.62) return out.set((h(3) * 2 - 1) * 650 * M, FURROW_FLOOR + (15 + h(4) * 35) * M, (h(5) < 0.5 ? -1 : 1) * (115 + h(6) * 45) * M);
  const r = Math.sqrt(h(3)) * 1.1 * KM;
  const bearing = h(4) * Math.PI * 2;
  const x = r * cos(bearing);
  const z = r * sin(bearing);
  return out.set(x, battleHeight(x, z) + (15 + h(5) * 65) * M, z);
}

/** Where the HUD marks the wreck: the gap between its halves, over the furrow (units). */
export const STEADFAST_MARK = new THREE.Vector3(0, FURROW_FLOOR + 40 * M, 0);
