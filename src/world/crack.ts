import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import { Noise } from './noise';
import { reliefPiece } from './horizon';
import type { Placement } from './asteroids';
import { bump, chaosAt, CHAOS_TOP, EUROPA_RADIUS, LAND, smooth } from './europa';

/**
 * Europa's Crack as a race world (a tournament's arena, see RACE_WORLDS in world/arenas): a rift
 * in Europa's ice shell somewhere off the campaign's Lineae, on the edge of the face Europa keeps
 * turned to Jupiter, so Jupiter hangs low over its horizon; and the track a race runs on it, from
 * one place to another. Where things are; the scenery is world/lineae's.
 *
 * The rift runs along z, in segments that end in valley heads where its floor rises to the plain:
 * a valley RIFT_DEPTH deep (300 m) whose floor is some 500 m wide, its walls climbing in
 * WALL_STEPS terraces to the rim, so the sky opens wider the higher the eye looks. The track starts
 * on the floor of the first segment, rides up its head onto the plain, crosses a field of chaos
 * terrain between the two segments in a lane among its rafts, drops into the second, runs its
 * 8 km down to the narrows (the floor 190 m wide), up its head again, swings round over the plain
 * and runs back over the double ridges to the finish, some 26 km in all. Its long straight down
 * the second segment heads straight at Jupiter. Slabs of ice that fell across the rift and froze
 * in (BRIDGE_HALF) span it low enough to fly under. It splits twice into two ways that join again
 * (see Branch): in the second segment the rift swings out to the east in a wide bow, the track's
 * own way, while a gorge, the shorter and riskier way, cuts straight through a block of ice raised
 * between them, 220 m wide and 700 m deep; at the bend the track's own way swings wide over the
 * plain, while the other turns tight and low, shorter and riskier.
 */

/** 1 km in units. */
const KM = 20000;

/** The rift's depth under the plain (units, 300 m). */
export const RIFT_DEPTH = 6000;
/** Its floor's half width (units, 260 m), swaying by FLOOR_SWAY (40 m) along it. */
export const FLOOR_HALF = 5200;
const FLOOR_SWAY = 800;
/** Its walls: WALL_STEPS terraces each WALL_STEP wide (70 m), its riser falling over RISER (25 m), the rest a bench; jagged by WALL_JAG (25 m). */
const WALL_STEPS = 3;
const WALL_STEP = 1400;
const RISER = 500;
const WALL_JAG = 500;
/** Its middle line sways by RIFT_SWAY (150 m) over RIFT_WAVE (9 km) along z. */
const RIFT_SWAY = 3000;
const RIFT_WAVE = 9 * KM;
/**
 * Its segments along z: the first comes in from beyond the ground's end and rises out in its head
 * from HEAD_A (8.2 km) to HEAD_A - HEAD_RUN (6.6 km); the second sinks in from HEAD_B (3.6 km) over
 * HEAD_RUN and rises out from HEAD_C + HEAD_RUN to HEAD_C (-7.6 km). A head's floor climbs 300 m
 * over 1.6 km, gently enough that a racing line along it bends no tighter than some 1.4 km.
 */
const HEAD_A = 8.2 * KM;
const HEAD_B = 3.6 * KM;
const HEAD_C = -7.6 * KM;
const HEAD_RUN = 1.6 * KM;
/** The narrows: from NARROW_FROM to NARROW_TO along z (-4.8 km to -5.8 km) the floor is NARROW_HALF across (95 m), easing in over NARROW_EASE (300 m). */
const NARROW_FROM = -4.8 * KM;
const NARROW_TO = -5.8 * KM;
const NARROW_HALF = 1900;
const NARROW_EASE = 6000;

/**
 * The branch in the second segment: from BRANCH_FROM to BRANCH_TO along z (1.6 km to -4.6 km)
 * the rift swings BOW to the east (1.2 km), over BOW_RUN either way (2.6 km: a racing line along it
 * bends no tighter than some 900 m); the gorge runs straight on, GORGE_HALF wide (110 m) with sheer
 * walls, through a block of ice raised MASSIF over the plain (400 m) and MASSIF_HALF wide either
 * side of the gorge (350 m, easing out over MASSIF_EASE, 150 m) where the bow is far enough off.
 */
const BRANCH_FROM = 1.6 * KM;
const BRANCH_TO = -4.6 * KM;
const BOW = 24000;
const BOW_RUN = 2.6 * KM;
const GORGE_HALF = 2200;
export const MASSIF = 8000;
const MASSIF_HALF = 7000;
const MASSIF_EASE = 3000;

/** The chaos field between the two segments: from CHAOS_SOUTH to CHAOS_NORTH along z (3.4 km to 6.8 km), out to CHAOS_REACH either side of the rift's line (1.6 km), a lane LANE_HALF either side of it kept open (150 m). */
const CHAOS_SOUTH = 3.4 * KM;
const CHAOS_NORTH = 6.8 * KM;
const CHAOS_REACH = 1.6 * KM;
const LANE_HALF = 3000;
const CHAOS_SEED = 6511;

/** Double ridges across the plain: each a pair of crests RIDGE high (10 m), RIDGE_SPAN apart (400 m), RIDGE_HALF wide either side (200 m), gentle enough to ride over in hops of a few seconds. */
const RIDGE = 200;
const RIDGE_SPAN = 8000;
const RIDGE_HALF = 4000;
const RIDGES = [
  { through: [-36000, -120000], angle: 1.45 },
  { through: [-36000, -90000], angle: 1.7 },
  { through: [-30000, -70000], angle: 1.35 },
  { through: [20000, 170000], angle: 0.6 },
  { through: [-40000, 30000], angle: 2.3 },
].map(({ through, angle }) => ({ through, c: cos(angle), s: sin(angle) }));

/** Hummocks of the ice over all of it: a few meters, some 150 m across. */
const BUMPS = 80;
const BUMP_SCALE = 3000;
/** Rubble on the floor: blocks up to RUBBLE (15 m) all over it, and up to EDGE_RUBBLE (35 m) along the foot of its walls. */
const RUBBLE = 300;
const EDGE_RUBBLE = 700;
const bumps = new Noise(6501);
const rubble = new Noise(6502);
const jag = new Noise(6503);

/** How far the rift has swung out to the east at z (0 to 1): the branch's bow. */
const bowAt = (z: number) => smooth((BRANCH_FROM - z) / BOW_RUN) * smooth((z - BRANCH_TO) / BOW_RUN);
/** The rift's middle line without its bow at z: the gorge's line, and the rift's outside the branch. */
export const gorgeMiddle = (z: number) => RIFT_SWAY * sin((Math.PI * 2 * z) / RIFT_WAVE);
/** The rift's middle line at z. */
export const riftMiddle = (z: number) => gorgeMiddle(z) + BOW * bowAt(z);
/** The rift's depth under the plain at z: full in its segments, rising to nothing in their heads, nothing between them. */
export const riftDepth = (z: number) => RIFT_DEPTH * Math.max(smooth((z - (HEAD_A - HEAD_RUN)) / HEAD_RUN), smooth((HEAD_B - z) / HEAD_RUN) * smooth((z - HEAD_C) / HEAD_RUN));
/** Where the slabs fall across the rift along z (their middles, units), and whether in the gorge; the rift's floor narrows under them to BRIDGE_FLOOR (170 m) over BRIDGE_EASE (150 m) either way, so their ends rest in its walls. */
const BRIDGES: readonly { z: number; gorge: boolean }[] = [
  { z: 9.3 * KM, gorge: false },
  { z: -1.4 * KM, gorge: false },
  { z: -1.7 * KM, gorge: true },
];
const BRIDGE_FLOOR = 3400;
const BRIDGE_EASE = 3000;
/** The floor's half width at z. */
function floorHalf(z: number): number {
  let half = FLOOR_HALF + FLOOR_SWAY * sin((Math.PI * 2 * z) / (3.7 * KM));
  half += (NARROW_HALF - half) * smooth((NARROW_FROM - z) / NARROW_EASE) * smooth((z - NARROW_TO) / NARROW_EASE);
  for (const bridge of BRIDGES) if (!bridge.gorge) half += (BRIDGE_FLOOR - half) * bump(z - bridge.z, BRIDGE_EASE * 2);
  return half;
}
/** How far up its wall a point lies `beyond` the floor's edge (units): 0 on the floor to 1 at the rim, in its terraces. */
function wallRise(beyond: number): number {
  if (beyond <= 0) return 0;
  const t = beyond / WALL_STEP;
  const step = Math.floor(t);
  if (step >= WALL_STEPS) return 1;
  return (step + smooth(((t - step) * WALL_STEP) / RISER)) / WALL_STEPS;
}
/** The gorge's reach along z: between the branch's ends. */
const inGorge = (z: number) => z < BRANCH_FROM && z > BRANCH_TO;

/** The plain at (x, z) before the rift: Europa's curve, hummocks, the double ridges, the chaos field and the block the gorge cuts. */
function plainHeight(x: number, z: number): number {
  let height = LAND + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.7, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * EUROPA_RADIUS);
  for (const { through, c, s } of RIDGES) {
    const across = (x - through[0]) * c + (z - through[1]) * s;
    height += RIDGE * (bump(across - RIDGE_SPAN / 2, RIDGE_HALF) + bump(across + RIDGE_SPAN / 2, RIDGE_HALF));
  }
  const line = Math.abs(x - riftMiddle(z));
  const field = smooth((z - CHAOS_SOUTH) / 8000) * smooth((CHAOS_NORTH - z) / 8000) * smooth((CHAOS_REACH - line) / 6000);
  if (field > 0) height += chaosAt(x, z, CHAOS_SEED) * field * smooth((line - LANE_HALF) / 2400);
  if (inGorge(z)) height += MASSIF * bowAt(z) * bowAt(z) * smooth((MASSIF_HALF + MASSIF_EASE - Math.abs(x - gorgeMiddle(z))) / MASSIF_EASE);
  return height;
}

/** The race world's ground (units, its height) over (x, z): the plain, the rift cut into it in its terraces with the rubble on its floor, and the gorge. */
export function riftHeight(x: number, z: number): number {
  let height = plainHeight(x, z);
  const depth = riftDepth(z);
  if (depth > 0) {
    const side = x > riftMiddle(z) ? 1 : -1;
    const beyond = Math.abs(x - riftMiddle(z)) - floorHalf(z) + WALL_JAG * jag.fractal(z / 2000, side * 3.1, x / 6000, 3);
    const rise = wallRise(beyond);
    if (rise < 1) {
      // the walls climb to the plain beside them, whatever stands on it
      const floor = LAND - depth;
      const loose = (1 - rise) * (RUBBLE * Math.max(0, rubble.fractal(x / 1500, 0.2, z / 1500, 2)) + EDGE_RUBBLE * Math.max(0, rubble.fractal(x / 900, 1.7, z / 900, 2)) * smooth((beyond + 1200) / 600));
      height = Math.min(height, floor + (height - floor) * rise + loose);
    }
  }
  if (inGorge(z)) {
    // its walls stand sheer: 20 to 1
    const beyond = Math.abs(x - gorgeMiddle(z)) - GORGE_HALF + WALL_JAG * 0.6 * jag.fractal(z / 1500, 9.7, x / 5000, 3);
    height = Math.min(height, LAND - RIFT_DEPTH + Math.max(0, beyond) * 20 + RUBBLE * Math.max(0, rubble.fractal(x / 1200, 3.3, z / 1200, 2)));
  }
  return height;
}

/** How far the race world's ground reaches from the field's middle (units): 6 km across the rift, 23 km along it, as deep under its top as the gorge needs. */
export const CRACK_GROUND_HALF = new THREE.Vector3(3 * KM, 12000, 11.5 * KM);
/** Its box's top: over the highest the ground gets there, a raft of the chaos on a ridge, the gorge's block. */
const GROUND_TOP = LAND + Math.max(MASSIF, CHAOS_TOP + 2 * RIDGE) + 2 * BUMPS;
/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(riftHeight, CRACK_GROUND_HALF, GROUND_TOP);
export const crackRelief = piece.relief;
export const crackGroundPlacement = piece.placement;

/**
 * A slab of ice fallen across the rift (half extents, units): 600 m long, 60 m thick, 200 m wide,
 * its underside BRIDGE_CLEAR over the floor (90 m; in the gorge GORGE_CLEAR, 120 m), its ends
 * resting deep in the walls, some 400 m of it spanning the rift. Ice 60 m thick over that span holds its own
 * weight under Europa's eighth of a g (a bending stress of some 1 MPa, about what cold ice bears).
 */
export const BRIDGE_HALF = new THREE.Vector3(6000, 600, 2000);
const BRIDGE_CLEAR = 1800;
const GORGE_CLEAR = 2400;
/** The slabs as pieces of the field (type `type`), turned across the rift where each lies. */
export function bridgePlacements(type: number): Placement[] {
  return BRIDGES.map(({ z, gorge }) => {
    const middle = gorge ? gorgeMiddle : riftMiddle;
    const across = atan2(middle(z + 200) - middle(z - 200), 400);
    return {
      kind: 'rack',
      type,
      scale: 1,
      position: new THREE.Vector3(middle(z), LAND - RIFT_DEPTH + (gorge ? GORGE_CLEAR : BRIDGE_CLEAR) + BRIDGE_HALF.y, z),
      orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), across),
      solid: true,
      spanned: true,
    };
  });
}

/**
 * The science station on the second segment's floor, east of the track's line, STATION_Z along
 * it; and the outposts on the eastern rim (Rockborn scaffolds with their masts and dishes), built
 * as it is: on the side away from the run back over the plain, so the racing line keeps clear of
 * them without bowing.
 */
const STATION_Z = 2.0 * KM;
const STATION_OFF = 3600;
const OUTPOSTS: readonly [number, number][] = [
  [8.8 * KM, 1],
  [0.4 * KM, 1],
  [-3.2 * KM, 1],
  [-6.4 * KM, 1],
];
/** The station and the outposts as pieces of the field (type `type`, half extents `half`), standing on the ground beneath their middles, sunk in by a little. */
export function stationPlacements(type: number, half: THREE.Vector3): Placement[] {
  const spots = [new THREE.Vector3(riftMiddle(STATION_Z) + STATION_OFF, 0, STATION_Z), ...OUTPOSTS.map(([z, side]) => new THREE.Vector3(riftMiddle(z) + side * (floorHalf(z) + WALL_STEPS * WALL_STEP + 2400), 0, z))];
  return spots.map((at, k) => {
    at.y = riftHeight(at.x, at.z) + half.y - 200;
    return { kind: 'rack', type, scale: 1, position: at, orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), k ? Math.PI / 2 : 0), solid: true };
  });
}

/**
 * Jupiter over the rift: some 12° across, 12° up, still in the sky, straight ahead of the second
 * segment's long straight (along -z): a site near the edge of the face Europa keeps turned to it.
 * The sun stands low behind a racer on that straight (15° up), so Jupiter shows its lit face and the
 * rift's floor lies in the light along its length, the walls' long shadows thrown down it.
 */
const JUPITER_DISTANCE = 250000;
const JUPITER_UP = 0.21;
export const CRACK_JUPITER = new THREE.Vector3(0.08, sin(JUPITER_UP), -cos(JUPITER_UP)).normalize().multiplyScalar(JUPITER_DISTANCE);
export const CRACK_SUN = new THREE.Vector3(0.35, 0.27, 0.9).normalize();

/**
 * Every point of the track lies this high over the ground beneath it (units, 45 m): over the
 * highest of the ground around it, its rubble and ridges counted. A gate's ring stands on the
 * ground with its lower housing sunk into it, so a ship riding its hover field low over the ground
 * flies through the opening, and through the coil's core when it keeps to the gate's middle.
 */
export const TRACK_LIFT = 900;
/** The track's points lie this far apart along z (units, 100 m). */
const TRACK_STEP = 2000;
/** It starts here along the rift (units, z: 10.6 km) and leaves it, past the last head, at Z_END (-8 km). */
const Z_START = 10.6 * KM;
const Z_END = -8 * KM;
/** Out of the rift it swings round over the plain in a bend of TURN_RADIUS (units, 900 m) and runs back PLAIN_RUN to the finish (3.5 km). */
const TURN_RADIUS = 18000;
const PLAIN_RUN = 3.5 * KM;
/** Its height follows the highest ground within this many points either way, smoothed as far (100 m each: over a ridge or a raft in a gentle arc). */
const REACH = 4;
/** The first gate (the start) lies this far along the track (units, 700 m), the others every GATE_SPACING (1.3 km), none within STATION_ROOM (700 m) of the station along it; the last one is the finish at the track's end. */
const GATE_FIRST = 0.7 * KM;
const GATE_SPACING = 1.3 * KM;
const STATION_ROOM = 0.7 * KM;
/** In the branch a gate stands only where the rift's bow lies this far from the gorge (units, 400 m), so the gate of either way stands clear of the other's. */
const BOW_APART = 8000;
/**
 * The bend's branch: where the track's own way bends round in TURN_RADIUS over the plain, the
 * other turns BEND_EARLY sooner (units, 500 m, still in the last head) in BEND_INNER (500 m) low
 * over it, then runs out to the track's own way over BEND_RUN (2.6 km) of the plain: over a
 * kilometer shorter, and tighter than a ship in free drift turns at the speed limit (see turnRadius
 * in ship/flight).
 */
const BEND_EARLY = 0.5 * KM;
const BEND_INNER = 10000;
const BEND_RUN = 2.6 * KM;

/**
 * Where a track splits into two ways that join again: its own way through its points from
 * `split` to `join`, and the other way's `points` between those two. Each gate of the track
 * between them stands on the other way too (`gates`: the gate, its index among the track's gates,
 * and where it stands, an index into `points`), and either of the two counts. `risky`: the other
 * way is the shorter and riskier one (else the track's own way is).
 */
export interface Branch {
  readonly split: number;
  readonly join: number;
  readonly points: readonly THREE.Vector3[];
  readonly gates: readonly { readonly gate: number; readonly at: number }[];
  readonly risky: boolean;
}

/** The race's track on the Crack: its points every TRACK_STEP along it, the indices among them where its gates stand, the first the start and the last the finish, and where it splits into two ways (see Branch). */
export interface Track {
  readonly points: readonly THREE.Vector3[];
  readonly gates: readonly number[];
  readonly branches: readonly Branch[];
}

function layTrack(): Track {
  const points: THREE.Vector3[] = [];
  // along the rift's line: down the first segment, over the chaos field, down the second
  for (let z = Z_START; z >= Z_END; z -= TRACK_STEP) points.push(new THREE.Vector3(riftMiddle(z), 0, z));
  const rift = points.length;
  // the bend round over the plain, away from the rift, until it heads back along it
  const bend = bendFrom(points[rift - 1], points[rift - 2], TURN_RADIUS);
  const from = bend[bend.length - 1];
  for (let along = TRACK_STEP; along <= PLAIN_RUN; along += TRACK_STEP) bend.push(new THREE.Vector3(from.x, 0, from.z + along));
  points.push(...bend);
  liftOver(points);
  // the gates along it by the distance flown, the station kept clear
  const arcs = [0];
  for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + points[i].distanceTo(points[i - 1]));
  const nearest = (s: number) => arcs.reduce((best, arc, i) => (Math.abs(arc - s) < Math.abs(arcs[best] - s) ? i : best), 0);
  const station = arcs[points.reduce((best, point, i) => (Math.abs(point.z - STATION_Z) < Math.abs(points[best].z - STATION_Z) && i < rift ? i : best), 0)];
  const length = arcs[arcs.length - 1];
  const gates: number[] = [];
  // where the rift's bow and the gorge still lie close, a gate would stand on both ways at once: none there
  const together = (i: number) => inGorge(points[i].z) && BOW * bowAt(points[i].z) < BOW_APART;
  for (let s = GATE_FIRST; s < length - GATE_SPACING * 0.75; s += GATE_SPACING) {
    if (Math.abs(s - station) < STATION_ROOM) s = station + STATION_ROOM;
    while (together(nearest(s))) s += TRACK_STEP;
    gates.push(nearest(s));
  }
  gates.push(points.length - 1);
  const index = (z: number) => Math.round((Z_START - z) / TRACK_STEP);
  const turn = rift + (bend.length - PLAIN_RUN / TRACK_STEP);
  const branches = [
    branchOf(points, arcs, gates, index(BRANCH_FROM), index(BRANCH_TO), true, gorgeWay),
    branchOf(points, arcs, gates, rift - 1 - BEND_EARLY / TRACK_STEP, turn + BEND_RUN / TRACK_STEP - 1, true, (all, at, to) => bendWay(all, at, to, turn)),
  ];
  return { points, gates, branches };
}

/** A bend of `radius` from `last` on (heading on from `before`), turning till it heads back the other way, every TRACK_STEP along it; its heights are laid later (see liftOver). */
function bendFrom(last: THREE.Vector3, before: THREE.Vector3, radius: number): THREE.Vector3[] {
  let heading = atan2(last.z - before.z, last.x - before.x);
  const center = new THREE.Vector3(last.x - radius * cos(heading + Math.PI / 2), 0, last.z - radius * sin(heading + Math.PI / 2));
  const bend: THREE.Vector3[] = [];
  const end = heading - Math.PI;
  while (heading > end) {
    heading = Math.max(end, heading - TRACK_STEP / radius);
    bend.push(new THREE.Vector3(center.x + radius * cos(heading + Math.PI / 2), 0, center.z + radius * sin(heading + Math.PI / 2)));
  }
  return bend;
}

/** Lays the heights of `points` (their x and z set): the highest ground around each, smoothed, and the lift over it. */
function liftOver(points: THREE.Vector3[]) {
  const highest = points.map((_, i) => {
    let top = -Infinity;
    for (let k = Math.max(0, i - REACH); k <= Math.min(points.length - 1, i + REACH); k++) top = Math.max(top, riftHeight(points[k].x, points[k].z));
    return top;
  });
  points.forEach((point, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - REACH); k <= Math.min(points.length - 1, i + REACH); k++, count++) sum += highest[k];
    point.y = sum / count + TRACK_LIFT;
  });
}

/** The gorge's way (see BRANCH_FROM) between the track's points `from` and `to`: straight on along the rift's line without its bow, through the block of ice. */
function gorgeWay(points: readonly THREE.Vector3[], from: number, to: number): THREE.Vector3[] {
  const way: THREE.Vector3[] = [];
  for (let i = from - REACH; i <= to + REACH; i++) way.push(new THREE.Vector3(gorgeMiddle(points[i].z), 0, points[i].z));
  liftOver(way);
  // the ends eased onto the track's own heights by the split and the join
  return way.slice(REACH + 1, way.length - REACH - 1);
}

/**
 * The bend's other way (see BEND_INNER) between the track's points `from` (BEND_EARLY before the
 * rift's end) and `to` (on the run back, BEND_RUN past the run's start, the track's point
 * `runStart`): the tight bend, then out to the track's own way along the run, its heights laid as
 * the track's own, eased onto them by the join.
 */
function bendWay(points: readonly THREE.Vector3[], from: number, to: number, runStart: number): THREE.Vector3[] {
  const bend = bendFrom(points[from], points[from - 1], BEND_INNER);
  // the bend's last step is what is left of its turn: a point that close to the end is left out
  if (bend.length > 2 && bend[bend.length - 1].distanceTo(bend[bend.length - 2]) < TRACK_STEP / 2) bend.splice(bend.length - 2, 1);
  const out = bend[bend.length - 1];
  const join = points[to];
  const run: THREE.Vector3[] = [];
  for (let along = TRACK_STEP; along < BEND_RUN; along += TRACK_STEP) {
    const t = along / BEND_RUN;
    run.push(new THREE.Vector3(out.x + (join.x - out.x) * smooth(t), 0, out.z + (join.z - out.z) * t));
  }
  const way = [points[from - 1], points[from], ...bend, ...run, join].map((point) => point.clone());
  liftOver(way);
  const inner = way.slice(2, way.length - 1);
  inner.forEach((point, k) => {
    // eased from the height it starts at and onto the track's own by the join
    point.y += (points[from].y - point.y) * (1 - smooth((k + 1) / 4));
    if (k >= bend.length) point.y += (points[runStart + k - bend.length].y - point.y) * smooth((k - bend.length + 1) / run.length);
  });
  return inner;
}

/**
 * A branch of the track (see Branch) between its points `split` and `join`, its other way laid by
 * `lay`: each gate between them stands on the other way at the same share of its length.
 */
function branchOf(points: readonly THREE.Vector3[], arcs: readonly number[], gates: readonly number[], split: number, join: number, risky: boolean, lay: (points: readonly THREE.Vector3[], from: number, to: number) => THREE.Vector3[]): Branch {
  const way = lay(points, split, join);
  const through = [points[split], ...way, points[join]];
  const along = [0];
  for (let i = 1; i < through.length; i++) along.push(along[i - 1] + through[i].distanceTo(through[i - 1]));
  const length = along[along.length - 1];
  const stands: { gate: number; at: number }[] = [];
  gates.forEach((index, gate) => {
    if (index <= split || index >= join) return;
    const want = ((arcs[index] - arcs[split]) / (arcs[join] - arcs[split])) * length;
    let at = 1;
    for (let i = 1; i < through.length - 1; i++) if (Math.abs(along[i] - want) < Math.abs(along[at] - want)) at = i;
    stands.push({ gate, at: at - 1 });
  });
  return { split, join, points: way, gates: stands, risky };
}

/** The track, laid once. */
export const CRACK_TRACK: Track = layTrack();

/** Where the HUD marks the finish: its gate. */
export const FINISH_MARK = CRACK_TRACK.points[CRACK_TRACK.points.length - 1].clone();

/**
 * How the ice looks at (x, z), for its scenery (world/lineae): `stain` how much of the reddish
 * brown it carries (the double ridges' crests, the frozen matrix between the chaos's rafts), `fresh`
 * how deep in the rift or the gorge it lies (broken open late, the cleanest and bluest ice).
 */
export function crackTones(x: number, z: number, out: { stain: number; fresh: number }) {
  let ridge = 0;
  for (const { through, c, s } of RIDGES) {
    const across = (x - through[0]) * c + (z - through[1]) * s;
    ridge = Math.max(ridge, bump(across - RIDGE_SPAN / 2, RIDGE_HALF * 0.7), bump(across + RIDGE_SPAN / 2, RIDGE_HALF * 0.7));
  }
  const line = Math.abs(x - riftMiddle(z));
  const field = smooth((z - CHAOS_SOUTH) / 8000) * smooth((CHAOS_NORTH - z) / 8000) * smooth((CHAOS_REACH - line) / 6000);
  const matrix = field > 0 && chaosAt(x, z, CHAOS_SEED) < 0 ? field : 0;
  out.stain = Math.max(ridge * 0.9, matrix * 0.6);
  out.fresh = Math.min(1, Math.max(0, (plainHeight(x, z) - riftHeight(x, z)) / RIFT_DEPTH));
  return out;
}
