import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';

/**
 * Two Faces on Iapetus (the campaign's chapter 11, see docs/campaign/): the equatorial ridge, a
 * wall of rock running along the moon's equator like a seam, where the soot-dark half of the moon
 * meets its snow-bright half. Where things are, for the field and its scenery (world/twofaces).
 *
 * The place's y is the true vertical. The plain lies LAND below the field's middle; the ridge runs
 * across the field along x, its crest RIDGE_HEIGHT over the plain, squeezed as every place's
 * heights are (the real one rises up to some 20 km). Its north side (-z) lies in the dark face,
 * its south side (+z) in the bright one, the border wandering across the ridge. Saturn hangs in
 * the sky with its ring opened: Iapetus orbits tilted to the ring's plane.
 */

/** 1 km in units. */
const KM = 20000;

/** Iapetus's pull at its surface (units/s²): 0.22 m/s², about a 44th of a g, from its mass of 1.81 × 10²¹ kg over its radius of 735 km; too weak for a ship to feel. */
export const IAPETUS_FALL = 4.5;
/** Iapetus's radius (units, 735 km): its ground falls away by some 70 m at 10 km. */
const IAPETUS_RADIUS = 735 * KM;

/** The plain under the field's middle (units, 1.5 km below it), so the ridge's crest runs some 400 m under the middle. */
export const LAND = -30000;

/** The ridge: its crest RIDGE_HEIGHT over the plain (units, 1.1 km), its flanks reaching RIDGE_HALF out on each side (units, 1.6 km), steep up to the crest; the crest's peaks and saddles up to PEAKS high (units, 90 m), some 400 m apart. */
const RIDGE_HEIGHT = 22000;
const RIDGE_HALF = 32000;
const PEAKS = 1800;
const PEAK_SCALE = 8000;
/** How far the crest winds off the equator (units, 150 m), once every 4 km or so. */
const WIND = 3000;
const WIND_LENGTH = 80000;
/** Craters and hummocks over all of it: a few meters, some 150 m across. */
const BUMPS = 150;
const BUMP_SCALE = 3000;
const peaks = new Noise(11006);
const bumps = new Noise(11007);
const faces = new Noise(11008);

/** Where the crest runs across z at `x`. */
export const crestZ = (x: number) => WIND * sin((x / WIND_LENGTH) * Math.PI * 2);

/** The ridge's height over the plain at (x, z) (units): steep flanks, a broad crest, its peaks and saddles. */
export function ridgeHeight(x: number, z: number): number {
  const off = Math.abs(z - crestZ(x)) / RIDGE_HALF;
  if (off >= 1) return 0;
  // a profile steepest halfway up, rounded at the crest and flaring into the plain at the foot
  const rise = 1 - off * off * (3 - 2 * off);
  return rise * (RIDGE_HEIGHT + PEAKS * peaks.fractal(x / PEAK_SCALE, 0.7, 0, 3) * rise);
}

/** Iapetus's ground (units, its height) over (x, z): the plain, the ridge, craters and hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  return LAND + ridgeHeight(x, z) + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * IAPETUS_RADIUS);
}

/** How dark the ground is at (x, z): 1 on the dark face (north, -z), 0 on the bright one, the border wandering across the ridge in tongues. */
export function darkness(x: number, z: number): number {
  const border = 6000 * faces.fractal(x / 40000, 0.2, z / 40000, 3);
  const t = THREE.MathUtils.clamp((z - border) / 12000 + 0.5, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 16000, 4 * KM);
/** Its box's top: over the highest the ground gets there, the crest's highest peak and its hummocks. */
const GROUND_TOP = LAND + RIDGE_HEIGHT + PEAKS + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * Saturn over Iapetus: some 2° across (from 3.56 million km off, its radius 60,300 km), its ring
 * opened by the moon's tilted orbit (RING_TILT), 25° up and still in the sky (Iapetus keeps one
 * face to it); drawn at SATURN_DISTANCE (units, inside the sky's sphere of stars).
 */
const SATURN_DISTANCE = 250000;
const SATURN_ANGLE = 0.0169;
const SATURN_UP = 0.44;
export const SATURN_AT = new THREE.Vector3(cos(SATURN_UP) * 0.6, sin(SATURN_UP), cos(SATURN_UP) * 0.8).normalize().multiplyScalar(SATURN_DISTANCE);
export const SATURN_SIZE = SATURN_DISTANCE * sin(SATURN_ANGLE);
/** How far the ring is opened from its edge as seen from Iapetus (rad, some 15°). */
export const RING_TILT = 0.26;
