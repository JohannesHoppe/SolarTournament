import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import { Noise } from './noise';
import { reliefPiece } from './horizon';
import type { Placement } from './asteroids';

/**
 * The Lineae on Europa (the campaign's chapter 6, see docs/campaign/): a stretch of the ice shell
 * over Europa's ocean, crossed by its long cracks. Where things are, for the field and its
 * scenery (world/lineae).
 *
 * The place's y is the true vertical. Through the field runs the Crack, a fissure of the shell
 * along z, meandering a little, CRACK_WIDTH wide with walls nearly sheer, CRACK_DEPTH deep, its
 * lips raised into a ridge on either side as Europa's double ridges are. Older double ridges
 * cross the plain at angles of their own. A science station stands on the Crack's floor. Jupiter
 * stands still in the sky: Europa keeps one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Europa's pull at its surface (units/s²): 1.31 m/s², an eighth of a g, from its mass of 4.8 × 10²² kg over its radius of 1,561 km. */
export const EUROPA_FALL = 26.3;
/** Europa's radius (units, 1,561 km): its ground falls away by some 30 m at 10 km. */
export const EUROPA_RADIUS = 1561 * KM;

/** The ice plain under the field's middle (units, 100 m below it). */
export const LAND = -2000;

/**
 * The Crack: its middle line meanders by CRACK_SWAY (units, 300 m) over CRACK_WAVE along z; it is
 * CRACK_WIDTH wide (200 m) and CRACK_DEPTH deep (800 m), its walls falling over CRACK_EDGE (30 m)
 * at its rim; its lips are raised into a ridge LIP high (80 m) and LIP_WIDTH wide (300 m) on
 * either side.
 */
const CRACK_SWAY = 6000;
const CRACK_WAVE = 90000;
export const CRACK_WIDTH = 4000;
export const CRACK_DEPTH = 16000;
export const CRACK_EDGE = 600;
export const LIP = 1600;
const LIP_WIDTH = 6000;
/** Rubble on the Crack's floor: blocks fallen from its walls, up to 20 m. */
const RUBBLE = 400;
const rubble = new Noise(6007);

/** The older double ridges across the plain: each a pair of ridges RIDGE high (50 m), RIDGE_SPAN apart (600 m), along the direction it runs, through a point. */
const RIDGE = 1000;
const RIDGE_SPAN = 12000;
const RIDGE_WIDTH = 4000;
const RIDGES = [
  { through: [-30000, 0], angle: 0.9 },
  { through: [40000, -20000], angle: -0.5 },
  { through: [0, 50000], angle: 2.2 },
] as const;

/** Hummocks of the ice over all of it: a few meters, some 150 m across. */
const BUMPS = 80;
const BUMP_SCALE = 3000;
const bumps = new Noise(6006);

export const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
/** A raised cosine 1 at 0 to 0 at `width`. */
export const bump = (d: number, width: number) => (Math.abs(d) >= width ? 0 : 0.5 + 0.5 * cos((Math.PI * d) / width));

/** The x of the Crack's middle line at z. */
export const crackMiddle = (z: number) => CRACK_SWAY * sin((Math.PI * 2 * z) / CRACK_WAVE);

/** How far into the Crack (x, z) lies: 1 on its floor, 0 outside its rim. */
export function inCrack(x: number, z: number): number {
  const d = Math.abs(x - crackMiddle(z));
  return 1 - smooth((d - (CRACK_WIDTH / 2 - CRACK_EDGE)) / CRACK_EDGE);
}

/** Europa's ground (units, its height) over (x, z): the plain, its double ridges, the Crack with its raised lips and the rubble on its floor, hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  const d = Math.abs(x - crackMiddle(z));
  const crack = inCrack(x, z);
  let height = LAND + LIP * bump(d - CRACK_WIDTH / 2 - LIP_WIDTH / 2, LIP_WIDTH / 2);
  for (const { through, angle } of RIDGES) {
    const across = (x - through[0]) * cos(angle) + (z - through[1]) * sin(angle);
    height += RIDGE * (bump(across - RIDGE_SPAN / 2, RIDGE_WIDTH / 2) + bump(across + RIDGE_SPAN / 2, RIDGE_WIDTH / 2)) * (1 - crack);
  }
  height -= CRACK_DEPTH * crack;
  height += crack * RUBBLE * Math.max(0, rubble.fractal(x / 1500, 0.2, z / 1500, 2));
  return height + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.7, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * EUROPA_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square, the arena and a little more), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 12000, 4 * KM);
/** Its box's top: over the highest the ground gets there, a lip with a ridge crossing it and the hummocks. */
const GROUND_TOP = LAND + LIP + 2 * RIDGE + BUMPS;
/** The ground's grid (units, 25 m): fine enough to draw the Crack's walls. */
export const GROUND_CELL = 500;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/** The science station on the Crack's floor (the fourth echo), STATION_Z along it: the listening post's build (see world/callisto), turned along the Crack, in a science outfit's paint. */
const STATION_Z = -24000;
export const STATION_AT = new THREE.Vector3(crackMiddle(STATION_Z), 0, STATION_Z);
/** The station's box stands on the floor beneath its middle, sunk in by a little. */
export function stationPlacement(type: number, half: THREE.Vector3): Placement {
  const at = STATION_AT.clone();
  at.y = surfaceHeight(at.x, at.z) - RUBBLE + half.y - 100;
  return { kind: 'rack', type, scale: 1, position: at, orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), Math.PI / 2), solid: true };
}

/** Where the HUD marks the Crack: on its middle line where the field's middle is closest. */
export const CRACK_MARK = new THREE.Vector3(crackMiddle(0), LAND - CRACK_DEPTH, 0);

/**
 * Jupiter over the Lineae: some 12° across (from 671,000 km off, its radius 71,500 km), 30° up,
 * still in the sky; drawn as a sphere at JUPITER_DISTANCE (units, inside the sky's sphere of
 * stars), on the sky's side away from the sun, so its lit face shows.
 */
const JUPITER_DISTANCE = 250000;
const JUPITER_ANGLE = 0.107;
const JUPITER_UP = 0.52;
export const JUPITER_AT = new THREE.Vector3(cos(JUPITER_UP) * 0.8, sin(JUPITER_UP), cos(JUPITER_UP) * 0.6).normalize().multiplyScalar(JUPITER_DISTANCE);
export const JUPITER_SIZE = JUPITER_DISTANCE * sin(JUPITER_ANGLE);

/**
 * Chaos terrain: where Europa's shell broke into rafts of ice that drifted, tilted and froze in
 * again (Conamara Chaos is the real one), a field of them on a jittered grid of CHAOS_CELL (units,
 * 140 m). A cell holds one raft or stays open (one in five: the lanes between them): a block
 * CHAOS_SIZE across (60–110 m), CHAOS_RISE high over the frozen matrix around it (20–55 m),
 * turned any way and tilted up to CHAOS_TILT, its sides falling over CHAOS_EDGE (12 m); the
 * matrix itself lies CHAOS_SINK under the plain (8 m).
 */
const CHAOS_CELL = 2800;
const CHAOS_SIZE = [1200, 2200] as const;
const CHAOS_RISE = [400, 1100] as const;
const CHAOS_TILT = 0.22;
const CHAOS_EDGE = 240;
export const CHAOS_SINK = 160;
/** An integer hash of a cell and a channel, as a number in [0, 1). */
function cellHash(i: number, j: number, channel: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(channel + 1, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65536;
}

/**
 * The chaos terrain's height over the plain at (x, z) (units; -CHAOS_SINK on the matrix between
 * the rafts), from the field of rafts of `seed`: the highest raft whose footprint holds the point.
 */
export function chaosAt(x: number, z: number, seed: number): number {
  const ci = Math.floor(x / CHAOS_CELL);
  const cj = Math.floor(z / CHAOS_CELL);
  let height = -CHAOS_SINK;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (cellHash(i, j, 0, seed) < 0.2) continue;
      const cx = (i + 0.3 + 0.4 * cellHash(i, j, 1, seed)) * CHAOS_CELL;
      const cz = (j + 0.3 + 0.4 * cellHash(i, j, 2, seed)) * CHAOS_CELL;
      // turned by a unit vector drawn from the hash (no trigonometry: the same bits everywhere)
      const c = 2 * cellHash(i, j, 3, seed) - 1;
      const s = Math.sqrt(1 - c * c);
      const du = (x - cx) * c + (z - cz) * s;
      const dv = (z - cz) * c - (x - cx) * s;
      const hu = (CHAOS_SIZE[0] + (CHAOS_SIZE[1] - CHAOS_SIZE[0]) * cellHash(i, j, 4, seed)) / 2;
      const hv = (CHAOS_SIZE[0] + (CHAOS_SIZE[1] - CHAOS_SIZE[0]) * cellHash(i, j, 5, seed)) / 2;
      const inside = Math.min(hu - Math.abs(du), hv - Math.abs(dv));
      if (inside <= 0) continue;
      const rise = CHAOS_RISE[0] + (CHAOS_RISE[1] - CHAOS_RISE[0]) * cellHash(i, j, 6, seed);
      const top = rise + CHAOS_TILT * ((2 * cellHash(i, j, 7, seed) - 1) * du + (2 * cellHash(i, j, 8, seed) - 1) * dv);
      height = Math.max(height, -CHAOS_SINK + (top + CHAOS_SINK) * smooth(inside / CHAOS_EDGE));
    }
  }
  return height;
}

/**
 * The Lineae as a world fought over (see FIGHT_WORLDS in world/arenas): the place's ground, and
 * east of the Crack a field of chaos terrain on the plain, its rafts rising from CHAOS_FROM
 * (units, 800 m from the field's middle) and standing whole CHAOS_RAMP further (200 m): cover to
 * fight among, and slopes to ride; the campaign's place keeps its open plain.
 */
const CHAOS_FROM = 16000;
const CHAOS_RAMP = 4000;
const FIGHT_CHAOS = 6113;
export const fightHeight = (x: number, z: number) => surfaceHeight(x, z) + chaosAt(x, z, FIGHT_CHAOS) * smooth((x - CHAOS_FROM) / CHAOS_RAMP);
/** How far a raft can stand over the ground under it (units): its highest rise, tilted. */
export const CHAOS_TOP = CHAOS_RISE[1] + CHAOS_TILT * CHAOS_SIZE[1];
const fightPiece = reliefPiece(fightHeight, GROUND_HALF, GROUND_TOP + CHAOS_TOP);
export const fightRelief = fightPiece.relief;
export const fightGroundPlacement = fightPiece.placement;

/**
 * How the ice looks at (x, z), for its scenery (world/lineae): `stain` how much of the reddish
 * brown it carries (the double ridges' crests, the Crack's lips, the frozen matrix between the
 * chaos's rafts where the ground is `fought` over), `fresh` how deep in the Crack it lies (broken
 * open late, the cleanest and bluest ice).
 */
export function lineaeTones(x: number, z: number, fought: boolean, out: { stain: number; fresh: number }) {
  const d = Math.abs(x - crackMiddle(z));
  let stain = 0.8 * bump(d - CRACK_WIDTH / 2 - LIP_WIDTH / 2, LIP_WIDTH / 2);
  for (const { through, angle } of RIDGES) {
    const across = (x - through[0]) * cos(angle) + (z - through[1]) * sin(angle);
    stain = Math.max(stain, 0.9 * bump(across - RIDGE_SPAN / 2, RIDGE_WIDTH / 3), 0.9 * bump(across + RIDGE_SPAN / 2, RIDGE_WIDTH / 3));
  }
  const field = fought ? smooth((x - CHAOS_FROM) / CHAOS_RAMP) : 0;
  if (field > 0 && chaosAt(x, z, FIGHT_CHAOS) < 0) stain = Math.max(stain, 0.6 * field);
  out.stain = stain;
  out.fresh = inCrack(x, z);
  return out;
}

/** How far below the plain a point lies in the Crack (units; 0 outside it or above the plain). */
export const depthInCrack = (x: number, y: number, z: number) => (inCrack(x, z) > 0.5 ? Math.max(0, LAND - y) : 0);
