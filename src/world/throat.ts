import * as THREE from 'three';
import { sin } from '../detmath';
import { reliefPiece } from './horizon';
import { Noise } from './noise';
import { TITAN_RADIUS } from './titan';

/**
 * The Throat of Kraken Mare as a race world (a tournament's arena, see RACE_WORLDS in
 * world/arenas): the winding strait that joins the sea's two basins on Titan, low under the deck
 * of Titan's haze, in Titan's air and gravity (world/titan). Where things are; the scenery is
 * world/kraken's.
 *
 * Here the sea lies only SEA_DEPTH under the deck, not two kilometers as at the Circuit of the
 * campaign: the air at the water is thin enough for a ship to hold the speed limit without its
 * hull burning (see world/air, safeSpeed) and thick enough to give it the most lift the flight
 * computer takes (see ship/flight, LIFT_MOST), so the strait's bends are flown at the limit only
 * by carving in the air: in a vacuum even the autopilot would have to slow for them.
 *
 * The track starts in the open water of the northern basin, runs into the strait between its
 * low bluffs of dark sand and swings through it from bend to bend, 45 m over the methane, and
 * comes out into the southern basin to the finish.
 */

/** 1 km in units. */
const KM = 20000;

/** The sea's still surface under the field's middle (units, 300 m under the haze's deck at y 0, see TITAN_AIR): the air there about 1.4 times as dense as at the deck. */
export const SEA_DEPTH = 6000;
const SEA = -SEA_DEPTH;

/** The strait's middle line sways across the field (x) as it runs along it (z): a swing of SWAY (units, 400 m) every WAVE (2.4 km), and a smaller one of SWAY_2 (60 m) every WAVE_2 (1.5 km) that keeps the bends from repeating. */
const SWAY = 8000;
const WAVE = 2.4 * KM;
const SWAY_2 = 1200;
const WAVE_2 = 1.5 * KM;
/** The strait runs from Z_END to -Z_END (units, 10.5 km); its last MOUTH (2 km) at either end opens into a basin, its swing fading out there. */
const Z_END = 10.5 * KM;
const MOUTH = 2 * KM;
/** Half the strait's width of open water (units): NARROW (180 m) in the strait, varying by NARROW_SWING (60 m), BASIN (1.5 km) out in the basins. */
const NARROW = 3600;
const NARROW_SWING = 1200;
const BASIN = 30000;
/** Its banks: sand rising from the water over BANK (units, 80 m) to the bluffs' tops, BLUFF (50 m) over the sea and up to BLUFF_SWING (40 m) more, dunes of DUNES (15 m) over all of the land; under the water the bed falls SHOAL (20 m) below the surface. */
const BANK = 1600;
const BLUFF = 1000;
const BLUFF_SWING = 800;
const DUNES = 300;
const SHOAL = 400;

const bluffs = new Noise(9101);
const dunes = new Noise(9102);
const narrows = new Noise(9103);

/** How far the strait sways at `z` (0 in the basins, 1 along the strait). */
const swing = (z: number) => THREE.MathUtils.smoothstep(Z_END - Math.abs(z), 0, MOUTH);

/** The strait's middle line: its x at `z` (units). */
export const throatMiddle = (z: number) => swing(z) * (SWAY * sin((Math.PI * 2 * z) / WAVE) + SWAY_2 * sin((Math.PI * 2 * z) / WAVE_2 + 1.3));

/** Half the width of the open water at `z` (units). */
export const throatHalfWidth = (z: number) => {
  const s = swing(z);
  return (NARROW + NARROW_SWING * narrows.fractal(z / 30000, 0.4, 0.1, 2)) * s + BASIN * (1 - s);
};

/** Titan's curve under the field's middle (units, how far the surface drops at x, z). */
const curve = (x: number, z: number) => (x * x + z * z) / (2 * TITAN_RADIUS);

/** The sea's still surface at (x, z) (units). */
export const throatSea = (x: number, z: number) => SEA - curve(x, z);

/** The land at (x, z) (units): the bed under the water, the banks and bluffs beside the strait, the dunes on top; under the sea's surface where the water lies. */
export function throatLand(x: number, z: number): number {
  const off = Math.abs(x - throatMiddle(z)) - throatHalfWidth(z);
  const bank = THREE.MathUtils.smoothstep(off, -BANK / 4, BANK);
  const bluff = BLUFF + BLUFF_SWING * Math.max(0, bluffs.fractal(x / 12000, 0.3, z / 12000, 2));
  const sand = DUNES * dunes.fractal(x / 6000, 0.6, z / 2500, 2) * bank;
  return SEA - SHOAL + (SHOAL + bluff) * bank + sand - curve(x, z);
}

/** The ground at (x, z) (units): the sea's surface where the water lies, else the land. */
export const throatGround = (x: number, z: number) => Math.max(throatSea(x, z), throatLand(x, z));

/** How far the race world's ground reaches from the field's middle (units): 2.5 km across the strait, 11 km along it. */
export const THROAT_GROUND_HALF = new THREE.Vector3(2.5 * KM, 3000, 11 * KM);
/** Its box's top: over the highest the bluffs and their dunes get. */
const GROUND_TOP = SEA + BLUFF + BLUFF_SWING + DUNES + 200;
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
/** The first gate (the start) lies this far along the track (units, 700 m), the others every GATE_SPACING (1.3 km); the last one is the finish at the track's end. */
const GATE_FIRST = 0.7 * KM;
const GATE_SPACING = 1.3 * KM;

/** The race's track through the Throat: its points every TRACK_STEP along it, and the indices among them where its gates stand, the first the start and the last the finish. */
export interface Track {
  readonly points: readonly THREE.Vector3[];
  readonly gates: readonly number[];
}

function layTrack(): Track {
  const points: THREE.Vector3[] = [];
  // along the strait's middle line, a point every TRACK_STEP of its length
  let z = Z_END - 0.3 * KM;
  const end = -Z_END + 0.3 * KM;
  while (z > end) {
    const x = throatMiddle(z);
    points.push(new THREE.Vector3(x, throatSea(x, z) + TRACK_LIFT, z));
    // the step along z that makes TRACK_STEP along the line
    const slope = (throatMiddle(z - 100) - throatMiddle(z + 100)) / 200;
    z -= TRACK_STEP / Math.sqrt(1 + slope * slope);
  }
  const arcs = [0];
  for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + points[i].distanceTo(points[i - 1]));
  const nearest = (s: number) => arcs.reduce((best, arc, i) => (Math.abs(arc - s) < Math.abs(arcs[best] - s) ? i : best), 0);
  const length = arcs[arcs.length - 1];
  const gates: number[] = [];
  for (let s = GATE_FIRST; s < length - GATE_SPACING * 0.75; s += GATE_SPACING) gates.push(nearest(s));
  gates.push(points.length - 1);
  return { points, gates };
}

/** The track, laid once. */
export const THROAT_TRACK: Track = layTrack();

/** Where the HUD marks the finish: its gate. */
export const THROAT_FINISH = THROAT_TRACK.points[THROAT_TRACK.points.length - 1].clone();
