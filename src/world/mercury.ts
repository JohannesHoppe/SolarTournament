import * as THREE from 'three';
import { exp, sin } from '../detmath';
import { Noise } from './noise';
import { craterField, reliefPiece, reliefTop } from './horizon';
import { setFromAxisAngle } from '../detthree';
import type { Placement } from './asteroids';

/**
 * Caloris on Mercury (a side trip of the campaign, see docs/campaign/): the floor of Mercury's
 * greatest basin, where the sun miners work, the morning sun low over the plain and two to three
 * times as wide as from Earth. Where things are, for the field and its scenery (world/caloris).
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
export const ridgeNorth = (x: number) => 34000 + 8000 * sin(x / 50000);
const ridgeWest = (z: number) => -46000 + 6000 * sin(z / 37000 + 1);

/** Hummocks of regolith: a few meters. */
const BUMPS = 80;
const bumps = new Noise(20007);

/** Mercury's ground (units, its height) over (x, z): the plain, its ridges, its craters' bowls and rims, hummocks, and the planet's curve. */
export function surfaceHeight(x: number, z: number): number {
  return LAND + ridge(z - ridgeNorth(x)) + ridge(x - ridgeWest(z)) + craters(x, z) + BUMPS * bumps.fractal(x / 3000, 0.4, z / 3000, 3) - (x * x + z * z) / (2 * MERCURY_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
/** Its box's top: over the highest the ground gets in it (see reliefTop). */
const GROUND_TOP = reliefTop(surfaceHeight, GROUND_HALF) + BUMPS;

/** The ground as the field's piece (see reliefPiece). */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
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
