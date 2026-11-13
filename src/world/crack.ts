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
 * over the ice plain beside the Crack to the finish, some 26 km in all.
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

/** The height of the Crack's floor under the middle line (units), without its rubble: the canyon's depth under the plain, on Europa's curve. */
const floorAt = (x: number, z: number) => LAND - CRACK_DEPTH - (x * x + z * z) / (2 * EUROPA_RADIUS);
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** The race's track on the Crack: its points every TRACK_STEP along it, and the indices among them where its gates stand, the first the start and the last the finish. */
export interface Track {
  readonly points: readonly THREE.Vector3[];
  readonly gates: readonly number[];
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
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  let heading = atan2(last.z - before.z, last.x - before.x);
  const center = new THREE.Vector3(last.x - TURN_RADIUS * cos(heading + Math.PI / 2), 0, last.z - TURN_RADIUS * sin(heading + Math.PI / 2));
  const bend: THREE.Vector3[] = [];
  const end = -Math.PI * 1.5;
  while (heading > end) {
    heading = Math.max(end, heading - TRACK_STEP / TURN_RADIUS);
    bend.push(new THREE.Vector3(center.x + TURN_RADIUS * cos(heading + Math.PI / 2), 0, center.z + TURN_RADIUS * sin(heading + Math.PI / 2)));
  }
  const run: THREE.Vector3[] = [];
  const from = bend[bend.length - 1];
  for (let along = TRACK_STEP; along <= PLAIN_RUN; along += TRACK_STEP) run.push(new THREE.Vector3(from.x, 0, from.z + along));
  // over the plain: the highest ground around, smoothed, and the lift over it; in the bend from the height out of the Crack down to it
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
    point.y = i < bend.length ? TOP + (over - TOP) * smooth(i / bend.length) : over;
  });
  points.push(...plain);
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
  return { points, gates };
}

/** The track, laid once. */
export const CRACK_TRACK: Track = layTrack();

/** Where the HUD marks the finish: its gate. */
export const FINISH_MARK = CRACK_TRACK.points[CRACK_TRACK.points.length - 1].clone();
