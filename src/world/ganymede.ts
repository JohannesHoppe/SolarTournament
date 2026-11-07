import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';

/**
 * The Tug Yards over Ganymede (the campaign's chapter 8, see docs/campaign/): where the Loose hide
 * among the blocks of ice the tugs have hauled in, parked over the moon's ground. Where things
 * are, for the field and its scenery (world/yards).
 *
 * The place's y is the true vertical. The ground lies deep under the field, LAND below its
 * middle, so the yard's blocks of ice float free over it. Ganymede's ground is two kinds: bright
 * terrain in bands of long parallel grooves, and dark terrain, old and smooth, between them.
 * Jupiter stands still in the sky: Ganymede keeps one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Ganymede's pull at its surface (units/s²): 1.43 m/s², a seventh of a g, from its mass of 1.48 × 10²³ kg over its radius of 2,634 km. */
export const GANYMEDE_FALL = 28.6;
/** Ganymede's radius (units, 2,634 km): its ground falls away by some 19 m at 10 km. */
const GANYMEDE_RADIUS = 2634 * KM;

/** The ground under the field's middle (units, 600 m below it): the yard's ice floats over it. */
export const LAND = -12000;

/** The grooves of the bright terrain: troughs GROOVE_DEPTH deep (units, 80 m), GROOVE_SPACING apart (500 m), along GROOVE_TURN; the bright terrain where the band's noise is over BRIGHT. */
const GROOVE_DEPTH = 1600;
const GROOVE_SPACING = 10000;
const GROOVE_TURN = 0.6;
const BRIGHT = 0;
const bands = new Noise(8006);
/** Hummocks over all of it: a few meters, some 150 m across; swells of the dark terrain, 30 m over 2 km. */
const BUMPS = 80;
const BUMP_SCALE = 3000;
const SWELL = 600;
const bumps = new Noise(8007);

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** How bright terrain (x, z) is: 1 in a band of grooves, 0 on the dark terrain, smooth between. */
export function brightness(x: number, z: number): number {
  return smooth((bands.fractal(x / 120000, 0.3, z / 120000, 2) - BRIGHT) / 0.15 + 0.5);
}

/** Ganymede's ground (units, its height) over (x, z): the grooves in the bright bands, the dark terrain's swells, hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  const bright = brightness(x, z);
  const across = x * cos(GROOVE_TURN) + z * sin(GROOVE_TURN);
  const trough = 0.5 + 0.5 * cos((2 * Math.PI * across) / GROOVE_SPACING);
  const grooves = -GROOVE_DEPTH * trough * trough * bright;
  const swell = SWELL * bumps.fractal(x / 40000, 0.9, z / 40000, 2) * (1 - bright);
  return LAND + grooves + swell + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * GANYMEDE_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
/** Its box's top: over the highest the ground gets there, a swell and its hummocks. */
const GROUND_TOP = LAND + SWELL + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * Jupiter over Ganymede: some 7.6° across (from 1.07 million km off, its radius 71,500 km), 40°
 * up, still in the sky; drawn as a sphere at JUPITER_DISTANCE (units, inside the sky's sphere of
 * stars), on the sky's side away from the sun, so its lit face shows.
 */
const JUPITER_DISTANCE = 250000;
const JUPITER_ANGLE = 0.0665;
const JUPITER_UP = 0.7;
export const JUPITER_AT = new THREE.Vector3(cos(JUPITER_UP) * 0.5, sin(JUPITER_UP), cos(JUPITER_UP) * 0.866).normalize().multiplyScalar(JUPITER_DISTANCE);
export const JUPITER_SIZE = JUPITER_DISTANCE * sin(JUPITER_ANGLE);
