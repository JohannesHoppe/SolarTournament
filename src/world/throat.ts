import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import type { Air } from './air';
import type { Placement } from './asteroids';
import type { Branch } from './crack';
import { reliefPiece } from './horizon';
import { Noise } from './noise';
import { TITAN_AIR, TITAN_RADIUS } from './titan';

/**
 * The Throat of Kraken Mare as a race world (a tournament's arena, see RACE_WORLDS in
 * world/arenas): the winding strait that joins the sea's two basins on Titan, low under the deck
 * of Titan's haze, in Titan's air and gravity (world/titan). Where things are; the scenery is
 * world/kraken's.
 *
 * Here the sea lies only SEA_DEPTH under the deck, not two kilometers as at the Circuit of the
 * campaign: the air at the water is thin enough for a ship to hold the speed limit without its
 * hull burning (see world/air, safeSpeed) and thick enough to give it the most lift the flight
 * computer takes (see ship/flight, LIFT_MOST), so the strait's tight bends are flown at the limit
 * only by carving in the air: in a vacuum even the autopilot would have to slow for them. Its
 * air is drawn clearer (THROAT_AIR), so the next bend always shows.
 *
 * The strait is laid as a course of bends (LEGS), each its own: out of the northern basin, the
 * Gate (a bend of 600 m between two bluffs, flown flat out on the thrusters alone), the Esses
 * (three bends of 250 to 260 m that only carving takes at full speed), a sweeper, the Narrows (the
 * water a quarter kilometer wide between bluffs up to 200 m high, arches of rock over it), the
 * Kraken's Elbow (a bend of 255 m turning 125°), a long sweeper, the Loop round the Mesa (a raised
 * block of the land that the river canyon cuts straight through: the Throat's branch, shorter
 * and narrower between walls up to 400 m high, see Branch), a last sweeper, and out into the
 * southern basin to the finish. Sand is banked up on the outside of the tight bends as a guide.
 */

/** 1 m and 1 km in units. */
const M = 20;
const KM = 20000;

/** The sea's still surface under the field's middle (units, 300 m under the haze's deck at y 0, see TITAN_AIR): the air there about 1.4 times as dense as at the deck. */
export const SEA_DEPTH = 6000;
const SEA = -SEA_DEPTH;

/**
 * The Throat's air: Titan's (see TITAN_AIR), its haze under the deck a third as thick as the
 * haze's model elsewhere (see Air.clear), so the eye reaches some 5 km over the water instead of
 * under 2 and the track's next bend always shows: the game's choice for a race. Its density, and
 * so its drag, heat and lift, is Titan's.
 */
export const THROAT_AIR: Air = { ...TITAN_AIR, clear: 1 / 3 };

/** One leg of the strait's middle line: a straight of `length` (m), or a bend of `radius` (m) turning `turn` degrees (positive to the left, seen from above); the water's half `width` along it (m) and how far its `bank` runs from the water to the land's top (m). */
interface Leg {
  length?: number;
  radius?: number;
  turn?: number;
  width: number;
  bank: number;
}

/** Half widths of the water (m): a wide stretch, the Esses, the Narrows, the Elbow, the canyon, the basins at either end. */
const WIDE = 220;
const ESSES = 160;
const NARROWS = 125;
const ELBOW = 170;
const CANYON = 110;
const BASIN = 1500;
/** How far a bank runs from the water to the land's top (m): a sandy shore, or the steep face of a bluff or a canyon's wall. */
const SHORE = 90;
const FACE = 30;

/** The strait's middle line, leg by leg from the northern basin to the southern one. */
const LEGS: readonly Leg[] = [
  { length: 1600, width: BASIN, bank: SHORE },
  { length: 600, width: 260, bank: SHORE },
  // the Gate
  { radius: 600, turn: 55, width: 300, bank: SHORE },
  { length: 800, width: 200, bank: SHORE },
  // the Esses
  { radius: 255, turn: -75, width: ESSES, bank: SHORE },
  { length: 220, width: ESSES, bank: SHORE },
  { radius: 260, turn: 95, width: ESSES, bank: SHORE },
  { length: 220, width: ESSES, bank: SHORE },
  { radius: 250, turn: -70, width: ESSES, bank: SHORE },
  { length: 900, width: 190, bank: SHORE },
  // a sweeper
  { radius: 900, turn: 30, width: WIDE, bank: SHORE },
  { length: 500, width: 170, bank: SHORE },
  // the Narrows
  { radius: 3000, turn: -28, width: NARROWS, bank: FACE },
  { length: 800, width: 160, bank: SHORE },
  // the Kraken's Elbow
  { radius: 255, turn: 125, width: ELBOW, bank: SHORE },
  { length: 900, width: 190, bank: SHORE },
  // a long sweeper
  { radius: 850, turn: -95, width: WIDE, bank: SHORE },
  { length: 700, width: WIDE, bank: SHORE },
  // the Loop round the Mesa
  { radius: 650, turn: -70, width: WIDE, bank: SHORE },
  { length: 300, width: WIDE, bank: SHORE },
  { radius: 750, turn: 140, width: WIDE, bank: SHORE },
  { length: 300, width: WIDE, bank: SHORE },
  { radius: 650, turn: -70, width: WIDE, bank: SHORE },
  { length: 900, width: WIDE, bank: SHORE },
  // a last sweeper
  { radius: 1000, turn: 40, width: WIDE, bank: SHORE },
  { length: 1000, width: WIDE, bank: SHORE },
  { length: 1700, width: BASIN, bank: SHORE },
];
/** Some legs by their index in LEGS: the Gate, the Esses' middle bend, the Narrows, the Elbow, the sweeper after it, the Loop's first and last. */
const GATE_LEG = 2;
const ESS_LEG = 6;
const NARROWS_LEG = 12;
const ELBOW_LEG = 14;
const SWEEPER_LEG = 16;
const LOOP_FIRST = 18;
const LOOP_LAST = 22;

/** The middle line is sampled every FINE along it (units, 10 m), its half widths and banks smoothed over SMOOTH either way (units, 250 m), so the water widens and narrows gently, its curvature over CURL either way (100 m). */
const FINE = 10 * M;
const SMOOTH = 250 * M;
const CURL = 100 * M;

/** A middle line sampled every FINE: positions, unit tangents, signed curvature (1/units, positive to the left), the water's half width and the bank's run (units), and each sample's distance along it (units). */
interface Line {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  readonly curve: Float64Array;
  readonly width: Float64Array;
  readonly bank: Float64Array;
  readonly along: Float64Array;
}

/** The legs walked from the origin heading -z, a point every FINE: positions, the half widths and banks of the legs they lie on, and the sample each leg begins at. */
function walk(legs: readonly Leg[]): { xs: number[]; zs: number[]; widths: number[]; banks: number[]; starts: number[] } {
  let x = 0;
  let z = 0;
  let dx = 0;
  let dz = -1;
  const xs = [x];
  const zs = [z];
  const widths = [legs[0].width * M];
  const banks = [legs[0].bank * M];
  const starts: number[] = [];
  for (const leg of legs) {
    starts.push(xs.length - 1);
    const length = (leg.length ?? (leg.radius! * Math.abs(leg.turn!) * Math.PI) / 180) * M;
    // the heading turns this much each step on a bend
    const turn = leg.radius ? (Math.sign(leg.turn!) * FINE) / (leg.radius * M) : 0;
    const c = cos(turn);
    const s = sin(turn);
    for (let walked = FINE; walked <= length + FINE / 2; walked += FINE) {
      const ndx = dx * c - dz * s;
      dz = dx * s + dz * c;
      dx = ndx;
      x += dx * FINE;
      z += dz * FINE;
      xs.push(x);
      zs.push(z);
      widths.push(leg.width * M);
      banks.push(leg.bank * M);
    }
  }
  starts.push(xs.length - 1);
  return { xs, zs, widths, banks, starts };
}

/** The length of (x, z). */
const distance = (x: number, z: number) => Math.sqrt(x * x + z * z);

/** The mean of `values` over `reach` samples either way of each. */
function smoothed(values: ArrayLike<number>, reach: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - reach); j <= Math.min(n - 1, i + reach); j++, count++) sum += values[j];
    out[i] = sum / count;
  }
  return out;
}

/** A sampled line (see Line) through points every FINE, its half widths and banks smoothed along it. */
function lineOf(xs: readonly number[], zs: readonly number[], widths: readonly number[], banks: readonly number[]): Line {
  const n = xs.length;
  const tx = new Float64Array(n);
  const tz = new Float64Array(n);
  const along = new Float64Array(n);
  const curve = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const ex = xs[b] - xs[a];
    const ez = zs[b] - zs[a];
    const length = Math.sqrt(ex * ex + ez * ez);
    tx[i] = ex / length;
    tz[i] = ez / length;
    if (i > 0) along[i] = along[i - 1] + distance(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  for (let i = 1; i < n - 1; i++) curve[i] = (tx[i - 1] * tz[i + 1] - tz[i - 1] * tx[i + 1]) / (along[i + 1] - along[i - 1]);
  const smooth = Math.round(SMOOTH / FINE);
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), tx, tz, along, curve: smoothed(curve, Math.round(CURL / FINE)), width: smoothed(widths, smooth), bank: smoothed(banks, smooth) };
}

/** The strait's middle line, walked and then moved so the field's middle lies in the middle of all of it. */
const walked = walk(LEGS);
const STRAIT_RAW = lineOf(walked.xs, walked.zs, walked.widths, walked.banks);
const LEG_STARTS = walked.starts;

/**
 * The river canyon through the Mesa: from where the Loop begins to where it ends, a Hermite curve
 * between the strait's own points, leaving it FORK to the left of its heading where the Loop turns
 * right and joining it again FORK from the right, so the two ways part at once; swaying
 * CANYON_SWAY to either side (units, 200 m) in four bends along its way, so it is flown on the
 * lift as the Esses are.
 */
const CANYON_SWAY = 200 * M;
const FORK = 0.6;
function canyonOf(strait: Line): { xs: number[]; zs: number[] } {
  const a = LEG_STARTS[LOOP_FIRST];
  const b = LEG_STARTS[LOOP_LAST + 1];
  const p0 = new THREE.Vector2(strait.x[a], strait.z[a]);
  const p1 = new THREE.Vector2(strait.x[b], strait.z[b]);
  const chord = p0.distanceTo(p1);
  // a heading turned by `by` to the left (positive), as walk turns it
  const turned = (i: number, by: number) => new THREE.Vector2(strait.tx[i] * cos(by) - strait.tz[i] * sin(by), strait.tx[i] * sin(by) + strait.tz[i] * cos(by)).multiplyScalar(chord);
  const t0 = turned(a, FORK);
  const t1 = turned(b, -FORK);
  const across = new THREE.Vector2(-(p1.y - p0.y), p1.x - p0.x).divideScalar(chord);
  const point = (u: number, out: THREE.Vector2) => {
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const swell = sin(Math.PI * u);
    const sway = CANYON_SWAY * swell * swell * sin(4 * Math.PI * u);
    return out.set(h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x + across.x * sway, h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y + across.y * sway);
  };
  // walked finely, a point kept every FINE along the way
  const xs = [p0.x];
  const zs = [p0.y];
  const last = new THREE.Vector2().copy(p0);
  const next = new THREE.Vector2();
  let since = 0;
  const steps = 20000;
  for (let k = 1; k <= steps; k++) {
    point(k / steps, next);
    since += next.distanceTo(last);
    last.copy(next);
    if (since >= FINE || k === steps) {
      xs.push(next.x);
      zs.push(next.y);
      since = 0;
    }
  }
  return { xs, zs };
}
const canyonWalked = canyonOf(STRAIT_RAW);
const CANYON_RAW = lineOf(
  canyonWalked.xs,
  canyonWalked.zs,
  canyonWalked.xs.map(() => CANYON * M),
  canyonWalked.xs.map(() => FACE * M),
);

/** Where both lines lie, round about: the field's middle is put in the middle of them. */
const bounds = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const line of [STRAIT_RAW, CANYON_RAW]) {
    for (let i = 0; i < line.x.length; i++) {
      minX = Math.min(minX, line.x[i]);
      maxX = Math.max(maxX, line.x[i]);
      minZ = Math.min(minZ, line.z[i]);
      maxZ = Math.max(maxZ, line.z[i]);
    }
  }
  return { minX, maxX, minZ, maxZ };
})();
const SHIFT_X = -(bounds.minX + bounds.maxX) / 2;
const SHIFT_Z = -(bounds.minZ + bounds.maxZ) / 2;
const shifted = (line: Line): Line => ({ ...line, x: line.x.map((x) => x + SHIFT_X), z: line.z.map((z) => z + SHIFT_Z) });
/** The strait's middle line and the canyon's, the field's middle in the middle of them. */
export const STRAIT: Line = shifted(STRAIT_RAW);
export const CANYON_LINE: Line = shifted(CANYON_RAW);
/** The lines in the order the ground reads them. */
const LINES = [STRAIT, CANYON_LINE];

/** Sample `i` of a line as a point at the level 0. */
const at = (line: Line, i: number) => new THREE.Vector3(line.x[i], 0, line.z[i]);

/**
 * The land's top over the water's banks (m): LAND over the sea and up to LAND_SWING more, raised
 * into bluffs at the Gate (GATE_RISE) and along the Narrows (NARROWS_RISE), into the Mesa
 * (MESA_RISE) round the canyon, low by the basins (down to SHORE_LOW); dunes of DUNES over all of
 * it; under the water the bed falls SHOAL below the surface. On the outside of a bend tighter than
 * BERM_FROM (m) sand is banked up BERM (m) over BERM_RUN (m) from the water, fully from BERM_FULL.
 */
const LAND = 45 * M;
const LAND_SWING = 45 * M;
const GATE_RISE = 75 * M;
const NARROWS_RISE = 125 * M;
const MESA_RISE = 330 * M;
const SHORE_LOW = 18 * M;
const DUNES = 12 * M;
const SHOAL = 20 * M;
const BERM = 40 * M;
const BERM_RUN = 40 * M;
const BERM_FROM = 800 * M;
const BERM_FULL = 300 * M;

const swell = new Noise(9101);
const dunes = new Noise(9102);

/** A raised (or lowered) patch of the land: full height within `flat` of its middle, gone at `reach`. */
interface Rise {
  x: number;
  z: number;
  flat: number;
  reach: number;
  height: number;
}
const rise = (x: number, z: number, flat: number, reach: number, height: number): Rise => ({ x, z, flat, reach, height });

/** The bluffs, the Mesa and the low shores of the basins (see LAND). */
const RISES: Rise[] = (() => {
  const list: Rise[] = [];
  const mid = (leg: number) => Math.round((LEG_STARTS[leg] + LEG_STARTS[leg + 1]) / 2);
  const gate = mid(GATE_LEG);
  list.push(rise(STRAIT.x[gate], STRAIT.z[gate], 300 * M, 750 * M, GATE_RISE));
  for (let i = LEG_STARTS[NARROWS_LEG]; i <= LEG_STARTS[NARROWS_LEG + 1]; i += Math.round((200 * M) / FINE)) list.push(rise(STRAIT.x[i], STRAIT.z[i], 250 * M, 600 * M, NARROWS_RISE));
  const canyon = Math.round(CANYON_LINE.x.length / 2);
  const half = CANYON_LINE.along[CANYON_LINE.x.length - 1] / 2;
  list.push(rise(CANYON_LINE.x[canyon], CANYON_LINE.z[canyon], half * 0.8, half + 450 * M, MESA_RISE));
  return list;
})();
const BASINS = [0, STRAIT.x.length - 1].map((i) => ({ x: STRAIT.x[i], z: STRAIT.z[i] }));

/** How much a rise lifts the land at (x, z). */
function lift(r: Rise, x: number, z: number) {
  return r.height * (1 - THREE.MathUtils.smoothstep(distance(x - r.x, z - r.z), r.flat, r.reach));
}

/** The land's top at (x, z) away from the water (units, over the sea's level): the swell, the highest rise over it, the basins' low shores. */
function top(x: number, z: number): number {
  let raised = 0;
  for (const r of RISES) raised = Math.max(raised, lift(r, x, z));
  let low = 1;
  for (const b of BASINS) low = Math.min(low, THREE.MathUtils.smoothstep(distance(x - b.x, z - b.z), 1500 * M, 2600 * M));
  const land = LAND + LAND_SWING * Math.max(0, swell.fractal(x / 15000, 0.3, z / 15000, 2));
  return SHORE_LOW + (land - SHORE_LOW) * low + raised;
}

/**
 * The samples near each cell of a grid of CELL (units, 200 m) over the lines: each sample listed
 * in every cell within its water, its bank and a margin of it, so the nearest sample of a line
 * to a point is found among a few.
 */
const CELL = 200 * M;
const index = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const reach = (line: Line, i: number) => line.width[i] + Math.max(line.bank[i], BERM_RUN) + CELL;
  LINES.forEach((line) => {
    for (let i = 0; i < line.x.length; i++) {
      const r = reach(line, i);
      minX = Math.min(minX, line.x[i] - r);
      maxX = Math.max(maxX, line.x[i] + r);
      minZ = Math.min(minZ, line.z[i] - r);
      maxZ = Math.max(maxZ, line.z[i] + r);
    }
  });
  const nx = Math.ceil((maxX - minX) / CELL);
  const nz = Math.ceil((maxZ - minZ) / CELL);
  const cells: number[][] = Array.from({ length: nx * nz }, () => []);
  LINES.forEach((line, l) => {
    for (let i = 0; i < line.x.length; i++) {
      const r = reach(line, i);
      const x0 = Math.max(0, Math.floor((line.x[i] - r - minX) / CELL));
      const x1 = Math.min(nx - 1, Math.floor((line.x[i] + r - minX) / CELL));
      const z0 = Math.max(0, Math.floor((line.z[i] - r - minZ) / CELL));
      const z1 = Math.min(nz - 1, Math.floor((line.z[i] + r - minZ) / CELL));
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) cells[cz * nx + cx].push(l * 1e6 + i);
    }
  });
  const start = new Int32Array(nx * nz + 1);
  cells.forEach((cell, k) => (start[k + 1] = start[k] + cell.length));
  const items = new Int32Array(start[nx * nz]);
  cells.forEach((cell, k) => items.set(cell, start[k]));
  return { minX, minZ, nx, nz, start, items };
})();

/** The nearest sample of each line to the last point asked (see nearest), and its square distance; -1 where none lies near. */
const near = [-1, -1];
const nearDistance = [Infinity, Infinity];

/** Finds the nearest sample of each line to (x, z) among those listed near it (see near). */
function nearest(x: number, z: number) {
  near[0] = near[1] = -1;
  nearDistance[0] = nearDistance[1] = Infinity;
  const cx = Math.floor((x - index.minX) / CELL);
  const cz = Math.floor((z - index.minZ) / CELL);
  if (cx < 0 || cz < 0 || cx >= index.nx || cz >= index.nz) return;
  const k = cz * index.nx + cx;
  for (let j = index.start[k]; j < index.start[k + 1]; j++) {
    const item = index.items[j];
    const l = item >= 1e6 ? 1 : 0;
    const i = item - l * 1e6;
    const line = LINES[l];
    const dx = x - line.x[i];
    const dz = z - line.z[i];
    const d = dx * dx + dz * dz;
    if (d < nearDistance[l]) {
      nearDistance[l] = d;
      near[l] = i;
    }
  }
}

/**
 * Beyond either end of the strait its basin opens out to the horizon: past its end sample a
 * point's distance to the line is taken across the line's heading only, and the water widens by
 * OPEN for every unit further out.
 */
const OPEN = 0.6;

/**
 * How high the land rises at (x, z) by a line's water, given its nearest sample `i` and the square
 * distance to it: `share` of the way from the bed to the land's top (0 in the water, 1 on top),
 * and on the outside of a tight bend the sand banked up there, `berm` over the sea (units).
 */
const banked = { share: 0, berm: 0 };
function bankOf(line: Line, i: number, x: number, z: number, d2: number): { share: number; berm: number } {
  let d = Math.sqrt(d2);
  let width = line.width[i];
  if (line === STRAIT && (i === 0 || i === line.x.length - 1)) {
    // past an end: across the heading only, the water widening out
    const out = i === 0 ? -1 : 1;
    const beyond = ((x - line.x[i]) * line.tx[i] + (z - line.z[i]) * line.tz[i]) * out;
    if (beyond > 0) {
      d = Math.abs((x - line.x[i]) * -line.tz[i] + (z - line.z[i]) * line.tx[i]);
      width += beyond * OPEN;
    }
  }
  banked.share = THREE.MathUtils.smoothstep((d - width) / line.bank[i], -0.3, 1);
  // sand banked up on the outside of a tight bend: the outside lies to the right of a bend to the left
  const tight = THREE.MathUtils.smoothstep(Math.abs(line.curve[i]), 1 / BERM_FROM, 1 / BERM_FULL);
  banked.berm = 0;
  if (tight > 0) {
    const left = (x - line.x[i]) * -line.tz[i] + (z - line.z[i]) * line.tx[i];
    if (left * line.curve[i] < 0) banked.berm = -SHOAL + (SHOAL + tight * BERM) * THREE.MathUtils.smoothstep(d - width, 0, BERM_RUN);
  }
  return banked;
}

/** Titan's curve under the field's middle (units, how far the surface drops at x, z). */
const curve = (x: number, z: number) => (x * x + z * z) / (2 * TITAN_RADIUS);

/** The sea's still surface at (x, z) (units). */
export const throatSea = (x: number, z: number) => SEA - curve(x, z);

/** The land at (x, z) (units): the bed under the water, the banks, bluffs and walls beside it, the dunes on top; under the sea's surface where the water lies. */
export function throatLand(x: number, z: number): number {
  const land = top(x, z);
  nearest(x, z);
  let height = land;
  for (let l = 0; l < LINES.length; l++) {
    if (near[l] < 0) continue;
    const { share, berm } = bankOf(LINES[l], near[l], x, z, nearDistance[l]);
    height = Math.min(height, Math.min(land, Math.max(-SHOAL + (SHOAL + land) * share, berm)));
  }
  // beyond the index (the horizon) the basins still open out past either end
  if (near[0] < 0) {
    for (const i of [0, STRAIT.x.length - 1]) {
      const dx = x - STRAIT.x[i];
      const dz = z - STRAIT.z[i];
      const { share } = bankOf(STRAIT, i, x, z, dx * dx + dz * dz);
      height = Math.min(height, -SHOAL + (SHOAL + land) * share);
    }
  }
  const sand = DUNES * dunes.fractal(x / 6000, 0.6, z / 2500, 2) * THREE.MathUtils.smoothstep(height, 0, 20 * M);
  return SEA + height + sand - curve(x, z);
}

/** The ground at (x, z) (units): the sea's surface where the water lies, else the land. */
export const throatGround = (x: number, z: number) => Math.max(throatSea(x, z), throatLand(x, z));

/** How far the race world's ground reaches from the field's middle (units): past both lines and their water by a margin, as high as the Mesa's walls and the bed under the water. */
const MARGIN = 900 * M;
const GROUND_TOP = SEA + LAND + LAND_SWING + MESA_RISE + DUNES + BERM + 20 * M;
const GROUND_BOTTOM = SEA - SHOAL - 60 * M;
export const THROAT_GROUND_HALF = new THREE.Vector3((bounds.maxX - bounds.minX) / 2 + MARGIN, (GROUND_TOP - GROUND_BOTTOM) / 2, (bounds.maxZ - bounds.minZ) / 2 + MARGIN);
/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(throatGround, THROAT_GROUND_HALF, GROUND_TOP);
export const throatRelief = piece.relief;
export const throatGroundPlacement = piece.placement;
/** The land alone in the box's coordinates (its bed under the water), for drawing it under the sea's sheet. */
export const throatLandRelief = (x: number, z: number) => throatLand(x, z) - (GROUND_TOP - THROAT_GROUND_HALF.y);
/** The sea's surface in the box's coordinates. */
export const throatSeaRelief = (x: number, z: number) => throatSea(x, z) - (GROUND_TOP - THROAT_GROUND_HALF.y);

/** Every point of the track lies this high over the sea (units, 45 m), so a gate's ring stands with its lower housing in the water. */
export const TRACK_LIFT = 900;
/** The track's points lie this far apart along it (units, 100 m). */
const TRACK_STEP = 2000;
/** It begins and ends this far into the basins from the strait's ends (units, 400 m). */
const TRACK_IN = 400 * M;
/** The first gate (the start) lies this far along the track (units, 700 m), the others every GATE_SPACING (1.3 km); the last one is the finish at the track's end. */
const GATE_FIRST = 0.7 * KM;
const GATE_SPACING = 1.3 * KM;
/** Two gates stand at least this far apart in a straight line (units, 1.05 km), however the track winds between them. */
const GATE_APART = 1.05 * KM;

/** The race's track through the Throat: its points every TRACK_STEP along it, the indices among them where its gates stand, the first the start and the last the finish, and where it splits into two ways (see Branch). */
export interface Track {
  readonly points: readonly THREE.Vector3[];
  readonly gates: readonly number[];
  readonly branches: readonly Branch[];
}

/** Points every TRACK_STEP along a line from `from` to `to` along it (units), each TRACK_LIFT over the sea; the sample each lies nearest to as well. */
function pointsAlong(line: Line, from: number, to: number): { points: THREE.Vector3[]; samples: number[] } {
  const points: THREE.Vector3[] = [];
  const samples: number[] = [];
  let i = 0;
  for (let s = from; s <= to + 1; s += TRACK_STEP) {
    while (i < line.x.length - 1 && line.along[i + 1] <= s) i++;
    const x = line.x[i];
    const z = line.z[i];
    points.push(new THREE.Vector3(x, throatSea(x, z) + TRACK_LIFT, z));
    samples.push(i);
  }
  return { points, samples };
}

function layTrack(): Track {
  const length = STRAIT.along[STRAIT.x.length - 1];
  const own = pointsAlong(STRAIT, TRACK_IN, length - TRACK_IN);
  const points = own.points;
  const arcs = [0];
  for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + points[i].distanceTo(points[i - 1]));
  const nearestPoint = (s: number) => arcs.reduce((best, arc, i) => (Math.abs(arc - s) < Math.abs(arcs[best] - s) ? i : best), 0);
  const total = arcs[arcs.length - 1];
  const gates: number[] = [];
  for (let s = GATE_FIRST; s < total - GATE_SPACING * 0.75; s += GATE_SPACING) {
    // through a tight bend a gate moves on till it stands GATE_APART from the last in a straight line too
    let gate = nearestPoint(s);
    while (gates.length && gate < points.length - 1 && points[gate].distanceTo(points[gates[gates.length - 1]]) < GATE_APART) gate++;
    s = arcs[gate];
    gates.push(gate);
  }
  gates.push(points.length - 1);
  // the canyon: from the track's point where the Loop begins to the one where it ends
  const pointAt = (sample: number) => own.samples.reduce((best, s, k) => (Math.abs(s - sample) < Math.abs(own.samples[best] - sample) ? k : best), 0);
  const split = pointAt(LEG_STARTS[LOOP_FIRST]);
  const join = pointAt(LEG_STARTS[LOOP_LAST + 1]);
  const canyonLength = CANYON_LINE.along[CANYON_LINE.x.length - 1];
  const way = pointsAlong(CANYON_LINE, TRACK_STEP, canyonLength - TRACK_STEP / 2).points;
  const through = [points[split], ...way, points[join]];
  const along = [0];
  for (let i = 1; i < through.length; i++) along.push(along[i - 1] + through[i].distanceTo(through[i - 1]));
  const wayLength = along[along.length - 1];
  const stands: { gate: number; at: number }[] = [];
  gates.forEach((index, gate) => {
    if (index <= split || index >= join) return;
    const want = ((arcs[index] - arcs[split]) / (arcs[join] - arcs[split])) * wayLength;
    let best = 1;
    for (let i = 1; i < through.length - 1; i++) if (Math.abs(along[i] - want) < Math.abs(along[best] - want)) best = i;
    stands.push({ gate, at: best - 1 });
  });
  return { points, gates, branches: [{ split, join, points: way, gates: stands, risky: true }] };
}

/** The track, laid once. */
export const THROAT_TRACK: Track = layTrack();

/** Where the HUD marks the finish: its gate. */
export const THROAT_FINISH = THROAT_TRACK.points[THROAT_TRACK.points.length - 1].clone();

/** The menu's view of the Throat behind its plate: 30 m over the track 600 m before the Esses, looking along it to them. */
export const THROAT_PREVIEW = (() => {
  const esses = THROAT_TRACK.points.findIndex((p) => Math.abs(p.x - STRAIT.x[LEG_STARTS[ESS_LEG - 2]]) + Math.abs(p.z - STRAIT.z[LEG_STARTS[ESS_LEG - 2]]) < TRACK_STEP);
  const from = THROAT_TRACK.points[Math.max(0, esses - 6)];
  const to = THROAT_TRACK.points[esses + 2];
  return { from: [from.x, from.y - TRACK_LIFT + 30 * M, from.z] as [number, number, number], at: [to.x, to.y, to.z] as [number, number, number] };
})();

/**
 * The landmarks standing by the strait, each in its own box of the yards' set (see world/yard):
 * a Rockborn drilling rig on its stilts in the water by the Gate, a sponsor's hologram sign on its
 * pylon over the Esses, two arches of rock across the Narrows, a beacon tower on the Mesa's tip
 * where the canyon splits off, and an ice tug's wreck beached on the long sweeper after the Elbow.
 * Their half extents (units), each built along its own x across the strait, y up, z along it.
 */
export const RIG_HALF = new THREE.Vector3(60 * M, 85 * M, 50 * M);
export const SIGN_HALF = new THREE.Vector3(9 * M, 70 * M, 9 * M);
export const ARCH_HALF = new THREE.Vector3((NARROWS + FACE + 70) * M, 28 * M, 40 * M);
export const TOWER_HALF = new THREE.Vector3(12 * M, 80 * M, 12 * M);
export const WRECK_HALF = new THREE.Vector3(22 * M, 30 * M, 80 * M);
/** The arches' undersides over the sea (units, 110 m). */
export const ARCH_CLEARANCE = 110 * M;

/** What stands where (see RIG_HALF): its middle, its turn about y, which of the landmarks. */
export interface Landmark {
  readonly kind: 'rig' | 'sign' | 'arch' | 'tower' | 'wreck';
  readonly position: THREE.Vector3;
  readonly orientation: THREE.Quaternion;
}

/** A landmark's turn: its x across the strait's line at sample `i` of `line`, z along it. */
function across(line: Line, i: number): THREE.Quaternion {
  // a turn by a about y takes z to (sin a, cos a): z along the line's heading
  return setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), atan2(line.tx[i], line.tz[i]));
}

/** A point beside sample `i` of `line`, `side` units to its left (negative: to its right), on the land or sea there. */
function beside(line: Line, i: number, side: number): THREE.Vector3 {
  return new THREE.Vector3(line.x[i] - line.tz[i] * side, 0, line.z[i] + line.tx[i] * side);
}

/** The side of the strait away from a bend's middle at sample `i`: its outside (1 left, -1 right). */
const outside = (i: number) => (STRAIT.curve[i] > 0 ? -1 : 1);

export const LANDMARKS: readonly Landmark[] = (() => {
  const marks: Landmark[] = [];
  const mid = (leg: number) => Math.round((LEG_STARTS[leg] + LEG_STARTS[leg + 1]) / 2);
  const stand = (kind: Landmark['kind'], position: THREE.Vector3, orientation: THREE.Quaternion, half: THREE.Vector3, onWater = false) => {
    const floor = onWater ? throatSea(position.x, position.z) - SHOAL : throatGround(position.x, position.z);
    position.y = floor + half.y - (onWater ? 0 : 6 * M);
    marks.push({ kind, position, orientation });
  };
  // the rig in the water on the Gate's outside, clear of the line
  const gate = mid(GATE_LEG);
  stand('rig', beside(STRAIT, gate, outside(gate) * (STRAIT.width[gate] - 40 * M)), across(STRAIT, gate), RIG_HALF, true);
  // the sign's pylon on the bank outside the Esses' middle bend, where the racers look as they come into it
  const ess = mid(ESS_LEG);
  stand('sign', beside(STRAIT, ess, outside(ess) * (STRAIT.width[ess] + 60 * M)), across(STRAIT, ess), SIGN_HALF);
  // the arches across the Narrows, a third and two thirds along, clear of the gates
  for (const share of [0.3, 0.72]) {
    const i = Math.round(LEG_STARTS[NARROWS_LEG] + (LEG_STARTS[NARROWS_LEG + 1] - LEG_STARTS[NARROWS_LEG]) * share);
    const position = at(STRAIT, i);
    position.y = throatSea(position.x, position.z) + ARCH_CLEARANCE + ARCH_HALF.y;
    marks.push({ kind: 'arch', position, orientation: across(STRAIT, i) });
  }
  // the tower on the Mesa's tip, between the strait and the canyon 700 m past the split
  const split = LEG_STARTS[LOOP_FIRST] + Math.round((900 * M) / FINE);
  const fork = Math.round((900 * M) / FINE);
  const tip = at(STRAIT, split).add(at(CANYON_LINE, fork)).multiplyScalar(0.5);
  stand('tower', tip, across(STRAIT, split), TOWER_HALF);
  // the wreck beached on the outside of the long sweeper after the Elbow
  const sweep = mid(SWEEPER_LEG);
  stand('wreck', beside(STRAIT, sweep, outside(sweep) * (STRAIT.width[sweep] + 25 * M)), across(STRAIT, sweep), WRECK_HALF);
  return marks;
})();

/** The landmarks as pieces of the field (see Landmark), their types in the yards' set by kind (see world/yard). */
export function landmarkPlacements(types: Readonly<Record<Landmark['kind'], number>>): Placement[] {
  return LANDMARKS.map((mark) => ({ kind: 'rack', type: types[mark.kind], scale: 1, position: mark.position.clone(), orientation: mark.orientation.clone(), solid: true, ground: mark.kind === 'arch' }));
}

/** Where the bends' names stand along the strait, for the docs and the tests: the sample of each. */
export const BENDS = { gate: GATE_LEG, esses: ESS_LEG, narrows: NARROWS_LEG, elbow: ELBOW_LEG, loop: LOOP_FIRST } as const;
/** The sample a leg of LEGS begins at. */
export const legStart = (leg: number) => LEG_STARTS[leg];
