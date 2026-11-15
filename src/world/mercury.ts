import * as THREE from 'three';
import { exp, sin } from '../detmath';
import { Noise } from './noise';
import { craterField, reliefPiece, reliefTop } from './horizon';
import { setFromAxisAngle } from '../detthree';
import type { Placement } from './asteroids';
import { SUN_DIRECTION } from './space';
import { absLow, curveLow, sineHigh, sineLow, type Ceiling } from './ceiling';

/**
 * Caloris on Mercury (a side trip of the campaign, see docs/campaign/): the floor of Mercury's
 * greatest basin, where the sun miners work, on the terminator: the morning sun on the horizon
 * and two to three times as wide as from Earth. Where things are, for the field and its scenery
 * (world/caloris).
 *
 * The place's y is the true vertical. The plain lies LAND below the field's middle, pocked with
 * craters and crossed by two wrinkle ridges, the plain's crust pushed up where it shrank as the
 * planet cooled; the miners' camp stands on it at the field's middle.
 */

/** 1 km in units. */
const KM = 20000;

/** Mercury's pull at its surface (units/s²): 3.7 m/s², some 0.38 g. */
export const MERCURY_FALL = 74;
/** Mercury's radius (units, 2,440 km). */
const MERCURY_RADIUS = 2440 * KM;

/**
 * Towards Caloris's sun: on the horizon over the camp, in the bearing the sun has over every
 * arena (SUN_DIRECTION's). The terminator, the line between day and night, runs through the camp
 * square to that bearing: the sun's middle on the horizon there, its upper half over it; the
 * planet's curve lifts it 0.05° for every 2 km towards it and sinks it as much away from it, so
 * from the race's 300 m, where the horizon dips 0.9°, the whole disc stands just over the plain.
 */
export const MERCURY_SUN = new THREE.Vector3(SUN_DIRECTION.x, 0, SUN_DIRECTION.z).normalize();

/** The plain under the field's middle (units, 800 m below it). */
export const LAND = -16000;

/** How far round the camp no crater lies (units, 300 m). */
const CAMP_CLEAR = 6000;
/** The craters: 30 of them seeded over the field, some 50 to 300 m across, their rims 12 % of their radius high (see craterField). */
const craters = craterField(20006, 30, 80000, 1000, 6000, CAMP_CLEAR, 0.12);

/**
 * A wrinkle ridge: a broad arch RIDGE_WIDTH wide (units, its half width 2 km) and RIDGE_HEIGHT
 * high (units, 120 m), a narrower crest CREST_WIDTH (units, 200 m) and CREST_HEIGHT (units, 50 m)
 * on top of it, along a line that wanders.
 */
const RIDGE_WIDTH = 40000;
const RIDGE_HEIGHT = 2400;
const CREST_WIDTH = 4000;
const CREST_HEIGHT = 1000;
const ridge = (d: number) => RIDGE_HEIGHT * exp(-(d * d) / (RIDGE_WIDTH * RIDGE_WIDTH)) + CREST_HEIGHT * exp(-(d * d) / (CREST_WIDTH * CREST_WIDTH));
/** The first ridge runs east-west north of the camp, the second north-south west of it (units). */
const NORTH_AT = 34000;
const NORTH_SWAY = 8000;
const NORTH_WAVE = 50000;
const WEST_AT = -46000;
const WEST_SWAY = 6000;
const WEST_WAVE = 37000;
export const ridgeNorth = (x: number) => NORTH_AT + NORTH_SWAY * sin(x / NORTH_WAVE);
const ridgeWest = (z: number) => WEST_AT + WEST_SWAY * sin(z / WEST_WAVE + 1);

/** Hummocks of regolith: a few meters. */
const BUMPS = 80;
const bumps = new Noise(20007);

/** Mercury's ground (units, its height) over (x, z): the plain, its ridges, its craters' bowls and rims, hummocks, and the planet's curve. */
export function surfaceHeight(x: number, z: number): number {
  return LAND + ridge(z - ridgeNorth(x)) + ridge(x - ridgeWest(z)) + craters(x, z) + BUMPS * bumps.fractal(x / 3000, 0.4, z / 3000, 3) - (x * x + z * z) / (2 * MERCURY_RADIUS);
}

/**
 * The most surfaceHeight gives over a rectangle (see world/ceiling): each ridge falls off with the
 * distance from its line, so it gives its most at the least distance, the line's wander bounded
 * by its sine's slope; the craters' ceiling, the hummocks by their noise's lattice, the curve at
 * its least.
 */
const surfaceCeiling: Ceiling = (x0, z0, x1, z1) => {
  const north = absLow(z0 - NORTH_AT - sineHigh(x0, x1, NORTH_SWAY, 1 / NORTH_WAVE), z1 - NORTH_AT - sineLow(x0, x1, NORTH_SWAY, 1 / NORTH_WAVE));
  const west = absLow(x0 - WEST_AT - sineHigh(z0, z1, WEST_SWAY, 1 / WEST_WAVE, 1), x1 - WEST_AT - sineLow(z0, z1, WEST_SWAY, 1 / WEST_WAVE, 1));
  return LAND + ridge(north) + ridge(west) + craters.ceiling(x0, z0, x1, z1) + BUMPS * bumps.fractalRange(x0 / 3000, x1 / 3000, 0.4, 0.4, z0 / 3000, z1 / 3000, 3, span).hi - curveLow(x0, z0, x1, z1, MERCURY_RADIUS);
};
const span = { lo: 0, hi: 0 };

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
/** Its box's top: over the highest the ground gets in it (see reliefTop). */
const GROUND_TOP = reliefTop(surfaceHeight, GROUND_HALF) + BUMPS;

/** The ground as the field's piece (see reliefPiece). */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP, surfaceCeiling);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/** The sun miners' camp at the field's middle: its box's half extents are the listening post's (see world/callisto), its foot BURIED (units, 10 m) in the plain. */
const BURIED = 200;
export const CAMP_AT = new THREE.Vector3(0, surfaceHeight(0, 0), 0);
export function campPlacement(type: number, half: THREE.Vector3): Placement {
  const at = CAMP_AT.clone();
  at.y += half.y - BURIED;
  return { kind: 'rack', type, scale: 1, position: at, orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), -0.4), solid: true };
}
