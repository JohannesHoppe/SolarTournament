import * as THREE from 'three';
import { cos, hypot, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';

/**
 * Flux on Io (the campaign's chapter 7, see docs/campaign/): a stretch of Io's sulfur plains,
 * the most volcanic ground in the system. Where things are, for the field and its scenery
 * (world/flux).
 *
 * The place's y is the true vertical. A patera, a volcano's flat-floored pit with a lava lake on
 * its floor, lies on one side of the field, a mesa of Io's mountains on the other; between them
 * stands the flux tube, the current between Io and Jupiter along the field's lines, a column of
 * faint violet light up into the sky, and the nearer a ship flies to it, the more its link
 * crackles. Jupiter stands still in the sky: Io keeps one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Io's pull at its surface (units/s²): 1.80 m/s², a fifth of a g, from its mass of 8.9 × 10²² kg over its radius of 1,822 km. */
export const IO_FALL = 35.9;
/** Io's radius (units, 1,822 km): its ground falls away by some 27 m at 10 km. */
const IO_RADIUS = 1822 * KM;

/** The sulfur plain under the field's middle (units, 100 m below it). */
export const LAND = -2000;

/** The patera: its middle, its radius (1 km), its depth (150 m), its rim falling over PATERA_EDGE (60 m). */
export const PATERA = new THREE.Vector3(-25000, 0, 20000);
export const PATERA_RADIUS = 1 * KM;
const PATERA_DEPTH = 3000;
const PATERA_EDGE = 1200;
/** The mesa: its middle, the radius of its top (700 m), its height (300 m), its walls falling over MESA_EDGE (150 m). */
export const MESA = new THREE.Vector3(30000, 0, -25000);
const MESA_RADIUS = 14000;
const MESA_HEIGHT = 6000;
const MESA_EDGE = 3000;
/** The plain's swells (20 m over 1.5 km) and hummocks (a few meters over 150 m). */
const SWELL = 400;
const SWELL_SCALE = 30000;
const BUMPS = 80;
const BUMP_SCALE = 3000;
const swells = new Noise(7006);
const bumps = new Noise(7007);

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Io's ground (units, its height) over (x, z): the plain's swells, the patera's pit, the mesa, hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  const pit = 1 - smooth((hypot(x - PATERA.x, z - PATERA.z) - (PATERA_RADIUS - PATERA_EDGE)) / PATERA_EDGE);
  const mesa = 1 - smooth((hypot(x - MESA.x, z - MESA.z) - MESA_RADIUS) / MESA_EDGE);
  const plain = LAND + SWELL * swells.fractal(x / SWELL_SCALE, 0.2, z / SWELL_SCALE, 2) + MESA_HEIGHT * mesa + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3);
  // the patera's floor is level, the lava lake's crust (PIT_FLOOR); its rim falls to it
  return plain + (PIT_FLOOR - plain) * pit - (x * x + z * z) / (2 * IO_RADIUS);
}

/** The patera's floor, level (units). */
export const PIT_FLOOR = LAND - PATERA_DEPTH;

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 6000, 4 * KM);
/** Its box's top: over the highest the ground gets there, the mesa's top with a swell and its roughness. */
const GROUND_TOP = LAND + MESA_HEIGHT + SWELL + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/** The flux tube: where it stands on the plain, its glowing radius (units, 300 m), and how far out from its axis the link starts to crackle (1.5 km), the static full at its glow. */
export const FLUX_AT = new THREE.Vector3(2000, 0, -2000);
export const FLUX_RADIUS = 6000;
const FLUX_REACH = 30000;

/** The link's static at `position` (0 to 1): none beyond FLUX_REACH of the tube's axis, rising to full at its glow. */
export function fluxStatic(position: THREE.Vector3): number {
  const off = hypot(position.x - FLUX_AT.x, position.z - FLUX_AT.z);
  return 1 - smooth((off - FLUX_RADIUS) / (FLUX_REACH - FLUX_RADIUS));
}

/**
 * Jupiter over Io: some 19° across (from 422,000 km off, its radius 71,500 km), 45° up, still in
 * the sky; drawn as a sphere at JUPITER_DISTANCE (units, inside the sky's sphere of stars), on the
 * sky's side away from the sun, so its lit face shows.
 */
const JUPITER_DISTANCE = 250000;
const JUPITER_ANGLE = 0.17;
const JUPITER_UP = 0.78;
export const JUPITER_AT = new THREE.Vector3(cos(JUPITER_UP) * 0.7, sin(JUPITER_UP), cos(JUPITER_UP) * 0.71).normalize().multiplyScalar(JUPITER_DISTANCE);
export const JUPITER_SIZE = JUPITER_DISTANCE * sin(JUPITER_ANGLE);
