import * as THREE from 'three';
import { cos, sin, atan2 } from '../detmath';
import { reliefPiece } from './horizon';
import { CRACK_DEPTH, crackMiddle, EUROPA_RADIUS, LAND, LIP, surfaceHeight } from './europa';

/**
 * Europa's Crack as a race world (a tournament's arena, see RACE_WORLDS in world/arenas): the
 * Lineae's very ice (world/europa) along a longer stretch of the Crack, and the track a race runs
 * on it, from one place to another. Where things are; the scenery is world/lineae's.
 *
 * The track starts deep in the Crack, runs down the canyon some 14 km with its gates low over the
 * floor, past the science station, climbs out of it, swings round over the lips and runs back
 * over the ice plain beside the Crack to the finish, some 26 km in all. It splits twice into two
 * ways that join again (see Branch): in the canyon the track's own way stays low over its floor
 * between its walls, the shorter and riskier one, while the other climbs out over the plain
 * beside it and back down; at the bend the track's own way swings wide and high, while the other
 * turns tight and low over the lips, shorter and riskier.
 */

/** 1 km in units. */
const KM = 20000;

/** How far the race world's ground reaches from the field's middle (units): 2 km across the Crack, 10 km along it, as deep under its top as the Lineae's. */
export const CRACK_GROUND_HALF = new THREE.Vector3(2 * KM, 12000, 10 * KM);
/** Its box's top: over the highest the ground gets there, a lip with a ridge crossing it and the hummocks (as the Lineae's). */
const GROUND_TOP = LAND + LIP + 2 * 1000 + 80;
/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, CRACK_GROUND_HALF, GROUND_TOP);
export const crackRelief = piece.relief;
export const crackGroundPlacement = piece.placement;

/**
 * Every point of the track lies this high over the ground beneath it (units, 45 m): in the
 * canyon over its floor (its rubble up to 20 m below that), on the plain over the highest of
 * the ground around. A gate's ring stands on the ground with its lower housing sunk into it, so
 * a ship riding its hover field low over the ground flies through the opening, and through the
 * coil's core when it keeps to the gate's middle.
 */
export const TRACK_LIFT = 900;
/** The track's points lie this far apart along it (units, 100 m). */
const TRACK_STEP = 2000;
/** It starts here along the Crack (units, z: 9.6 km), and climbs out of it from Z_CLIMB to Z_TOP (-4.4 km to -7.4 km). */
const Z_START = 9.6 * KM;
const Z_CLIMB = -4.4 * KM;
const Z_TOP = -7.4 * KM;
/** Out of the Crack the track runs this high over the plain (units, 150 m: 70 m over its raised lips), and swings round in a bend of TURN_RADIUS (units, 900 m). */
const TOP = LAND + 3000;
const TURN_RADIUS = 18000;
/** Back over the plain beside the Crack it runs this far to the finish (units, 6.5 km). */
const PLAIN_RUN = 6.5 * KM;
/** Over the plain its height follows the highest ground within this many points either way, smoothed as far (100 m each: over a ridge in a gentle arc). */
const PLAIN_REACH = 4;
/** The first gate (the start) lies this far along the track (units, 700 m), the others every GATE_SPACING (1.3 km), none within STATION_ROOM (700 m) of the station along it; the last one is the finish at the track's end. */
const GATE_FIRST = 0.7 * KM;
const GATE_SPACING = 1.3 * KM;
const STATION_ROOM = 0.7 * KM;
/** The science station's place along the Crack (units, z; see world/europa). */
const STATION_Z = -24000;

/**
 * The canyon's branch: it splits CANYON_SPLIT along the track (units, 900 m) and joins it again
 * CANYON_BRANCH further on (8.2 km), before the station. The other way first climbs CANYON_RISE
 * out of the Crack over CANYON_CLIMB along it (984 m, as deep as the Crack and as high as the
 * highest of the ground beside it, a lip where a double ridge crosses it, over 2.2 km), staying
 * over the canyon's middle, then swings CANYON_SIDE to its side (550 m, past the lips, over
 * CANYON_SWING, 1.8 km, from CANYON_SIDE_FROM, 1.6 km, on), some 230 m over the plain, and comes
 * back the same way: some 600 m longer, and nowhere a wall near. Its climbs and swings bend no
 * tighter than about 800 m.
 */
const CANYON_SPLIT = 0.9 * KM;
const CANYON_BRANCH = 8.2 * KM;
const CANYON_RISE = GROUND_TOP - LAND + CRACK_DEPTH;
const CANYON_CLIMB = 2.2 * KM;
const CANYON_SIDE = 0.55 * KM;
const CANYON_SIDE_FROM = 1.6 * KM;
const CANYON_SWING = 1.8 * KM;
/**
 * The bend's branch: where the track's own way bends round in TURN_RADIUS high over the lips, the
 * other turns BEND_EARLY sooner (units, 500 m, still climbing out of the Crack) in BEND_INNER
 * (500 m) low over them, then runs out to the track's own way over BEND_RUN (2.6 km) of the
 * plain: over a kilometer shorter, and tighter than a ship in free drift turns at the speed limit
 * (see turnRadius in ship/flight).
 */
const BEND_EARLY = 0.5 * KM;
const BEND_INNER = 10000;
const BEND_RUN = 2.6 * KM;

/** The height of the Crack's floor under the middle line (units), without its rubble: the canyon's depth under the plain, on Europa's curve. */
const floorAt = (x: number, z: number) => LAND - CRACK_DEPTH - (x * x + z * z) / (2 * EUROPA_RADIUS);
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

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
  // down the canyon along its middle line, then climbing out of it as it runs on
  for (let z = Z_START; z >= Z_TOP; z -= TRACK_STEP) {
    const x = crackMiddle(z);
    const canyon = floorAt(x, z) + TRACK_LIFT;
    points.push(new THREE.Vector3(x, canyon + (TOP - canyon) * smooth((Z_CLIMB - z) / (Z_CLIMB - Z_TOP)), z));
  }
  // the bend round over the lips and the plain, away from where the Crack sways, until it heads back along it
  const canyon = points.length;
  const bend = bendFrom(points[canyon - 1], points[canyon - 2], TURN_RADIUS);
  const run: THREE.Vector3[] = [];
  const from = bend[bend.length - 1];
  for (let along = TRACK_STEP; along <= PLAIN_RUN; along += TRACK_STEP) run.push(new THREE.Vector3(from.x, 0, from.z + along));
  liftOverPlain(bend, run, TOP);
  points.push(...bend, ...run);
  // the gates along it by the distance flown, the station kept clear
  const arcs = [0];
  for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + points[i].distanceTo(points[i - 1]));
  const nearest = (s: number) => arcs.reduce((best, arc, i) => (Math.abs(arc - s) < Math.abs(arcs[best] - s) ? i : best), 0);
  const station = arcs[points.reduce((best, point, i) => (Math.abs(point.z - STATION_Z) < Math.abs(points[best].z - STATION_Z) && i < points.length / 2 ? i : best), 0)];
  const length = arcs[arcs.length - 1];
  const gates: number[] = [];
  for (let s = GATE_FIRST; s < length - GATE_SPACING * 0.75; s += GATE_SPACING) {
    if (Math.abs(s - station) < STATION_ROOM) s = station + STATION_ROOM;
    gates.push(nearest(s));
  }
  gates.push(points.length - 1);
  const split = CANYON_SPLIT / TRACK_STEP;
  const branches = [
    branchOf(points, arcs, gates, split, split + CANYON_BRANCH / TRACK_STEP, false, canyonWay),
    branchOf(points, arcs, gates, canyon - 1 - BEND_EARLY / TRACK_STEP, canyon + bend.length + BEND_RUN / TRACK_STEP - 1, true, (all, at, to) => bendWay(all, at, to, canyon + bend.length)),
  ];
  return { points, gates, branches };
}

/** A bend of `radius` from `last` on (heading on from `before`), turning till it heads back the other way, every TRACK_STEP along it; its heights are laid later (see liftOverPlain). */
function bendFrom(last: THREE.Vector3, before: THREE.Vector3, radius: number): THREE.Vector3[] {
  let heading = atan2(last.z - before.z, last.x - before.x);
  const center = new THREE.Vector3(last.x - radius * cos(heading + Math.PI / 2), 0, last.z - radius * sin(heading + Math.PI / 2));
  const bend: THREE.Vector3[] = [];
  const end = -Math.PI * 1.5;
  while (heading > end) {
    heading = Math.max(end, heading - TRACK_STEP / radius);
    bend.push(new THREE.Vector3(center.x + radius * cos(heading + Math.PI / 2), 0, center.z + radius * sin(heading + Math.PI / 2)));
  }
  return bend;
}

/** The heights over the plain of a `bend` out of the Crack and the `run` after it: the highest ground around, smoothed, and the lift over it; in the bend from the height it starts at (`top`) down to it. */
function liftOverPlain(bend: THREE.Vector3[], run: THREE.Vector3[], top: number) {
  const plain = [...bend, ...run];
  const highest = plain.map((_, i) => {
    let top = -Infinity;
    for (let k = Math.max(0, i - PLAIN_REACH); k <= Math.min(plain.length - 1, i + PLAIN_REACH); k++) top = Math.max(top, surfaceHeight(plain[k].x, plain[k].z));
    return top;
  });
  plain.forEach((point, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - PLAIN_REACH); k <= Math.min(plain.length - 1, i + PLAIN_REACH); k++, count++) sum += highest[k];
    const over = sum / count + TRACK_LIFT;
    point.y = i < bend.length ? top + (over - top) * smooth(i / bend.length) : over;
  });
}

/** The canyon's other way (see CANYON_BRANCH) between the track's points `from` and `to`: out of the Crack, beside it over the plain and back. */
function canyonWay(points: readonly THREE.Vector3[], from: number, to: number): THREE.Vector3[] {
  const way: THREE.Vector3[] = [];
  for (let i = from + 1; i < to; i++) {
    const end = Math.min(i - from, to - i) * TRACK_STEP;
    way.push(new THREE.Vector3(CANYON_SIDE * smooth((end - CANYON_SIDE_FROM) / CANYON_SWING), CANYON_RISE * smooth(end / CANYON_CLIMB), 0).add(points[i]));
  }
  return way;
}

/**
 * The bend's other way (see BEND_INNER) between the track's points `from` (BEND_EARLY before
 * the Crack's last) and `to` (on the run back, BEND_RUN past the run's start, the track's point
 * `runStart`): the tight bend, then out to the track's own way along the run, its heights over
 * the plain laid as the track's own, eased onto them by the join.
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
  liftOverPlain(bend, run, points[from].y);
  run.forEach((point, k) => {
    const own = points[runStart + k].y;
    point.y += (own - point.y) * smooth((k + 1) / run.length);
  });
  return [...bend, ...run];
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
