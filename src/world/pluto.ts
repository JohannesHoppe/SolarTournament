import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';

/**
 * Last Light on Pluto (the campaign's chapter 15, see docs/campaign/): the edge of Pluto's heart,
 * Sputnik Planitia, a plain of nitrogen ice broken into slowly overturning cells, the cells' rims
 * a few meters low where the ice sinks back; beyond its north-west edge (-x) the mountains of
 * water ice that frame it, blocky and steep. Where things are, for the field and its scenery
 * (world/heart).
 *
 * The place's y is the true vertical. The plain lies LAND below the field's middle; the mountains
 * rise up to PEAKS over it, squeezed as every place's heights are (the real ones rise some 3 to 5
 * km). Charon hangs in the sky, still: Pluto and Charon keep one face to each other.
 */

/** 1 km in units. */
const KM = 20000;

/** Pluto's pull at its surface (units/s²): 0.62 m/s², about a 16th of a g, from its mass of 1.3 × 10²² kg over its radius of 1,188 km. */
export const PLUTO_FALL = 12.4;
/** Pluto's radius (units, 1,188 km). */
const PLUTO_RADIUS = 1188 * KM;

/** The plain under the field's middle (units, 600 m below it). */
export const LAND = -12000;

/** The cells of the plain: some CELL across (units, 1.5 km, the real ones 20 to 30 km), their rims TROUGH deep (units, 15 m) and a little ridged at their middles. */
const CELL = 30000;
const TROUGH = 300;
const cells = new Noise(15006);
/** The mountains: from MOUNTAINS_FROM along x towards -x (units, 1.5 km out), rising to PEAKS (units, 1 km), blocky. */
const MOUNTAINS_FROM = -30000;
const MOUNTAINS_RISE = 25000;
export const PEAKS = 20000;
const blocks = new Noise(15007);
/** Frost hummocks over all of it: a few meters. */
const BUMPS = 60;
const bumps = new Noise(15008);

/** How high the mountains stand at (x, z) over the plain (units). */
function mountains(x: number, z: number): number {
  const into = THREE.MathUtils.clamp((MOUNTAINS_FROM - x) / MOUNTAINS_RISE, 0, 1);
  if (into <= 0) return 0;
  // blocks of water ice, flat-topped and steep-sided: a noise quantized into steps
  const block = blocks.fractal(x / 9000, 0.4, z / 9000, 2) * 0.5 + 0.5;
  const step = Math.round(block * 4) / 4;
  return PEAKS * into * (0.35 + 0.65 * step);
}

/** Pluto's ground (units, its height) over (x, z): the plain's cells, the mountains to the north-west, frost hummocks, and the dwarf planet's curve. */
export function surfaceHeight(x: number, z: number): number {
  // a ridged noise is near 1 along its ridges: the cells' rims sink there
  const rims = cells.fractal(x / CELL, 0.2, z / CELL, 1, true);
  return LAND - TROUGH * rims * rims + mountains(x, z) + BUMPS * bumps.fractal(x / 3000, 0.4, z / 3000, 2) - (x * x + z * z) / (2 * PLUTO_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 12000, 4 * KM);
const GROUND_TOP = LAND + PEAKS + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * Charon over Pluto: some 3.5° across (from 19,600 km off, its radius 606 km), 40° up and still in
 * the sky; drawn at CHARON_DISTANCE (units, inside the sky's sphere of stars).
 */
const CHARON_DISTANCE = 250000;
const CHARON_ANGLE = 0.0309;
const CHARON_UP = 0.7;
export const CHARON_AT = new THREE.Vector3(cos(CHARON_UP) * 0.6, sin(CHARON_UP), cos(CHARON_UP) * 0.8).normalize().multiplyScalar(CHARON_DISTANCE);
export const CHARON_SIZE = CHARON_DISTANCE * sin(CHARON_ANGLE);
