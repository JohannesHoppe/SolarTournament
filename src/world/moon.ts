import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { craterField, reliefPiece, reliefTop } from './horizon';
import { setFromAxisAngle } from '../detthree';
import type { Placement } from './asteroids';

/**
 * The Ballroom on the Moon (the campaign's chapter 19, see docs/campaign/): the President's
 * ballroom, a dome of gold and glass on the Moon's grey plain, the Games' new Hosts paraded over
 * it under Earth. Where things are, for the field and its scenery (world/ballroom).
 *
 * The place's y is the true vertical. The plain lies LAND below the field's middle, pocked with
 * craters; the dome stands on it at the field's middle, DOME_RADIUS wide. Earth hangs over it,
 * still in the Moon's sky.
 */

/** 1 km in units. */
const KM = 20000;

/** The Moon's pull at its surface (units/s²): 1.62 m/s², a sixth of a g. */
export const MOON_FALL = 32.4;
/** The Moon's radius (units, 1,737 km). */
const MOON_RADIUS = 1737 * KM;

/** The plain under the field's middle (units, 800 m below it). */
export const LAND = -16000;

/** The Ballroom's dome: its radius on the plain (units, 300 m), its height (units, 150 m), and how far round it no crater lies (units, 450 m). */
export const DOME_RADIUS = 6000;
export const DOME_HEIGHT = 3000;
const DOME_CLEAR = 9000;

/** The craters: 40 of them seeded over the field, some 50 to 400 m across, their rims 15 % of their radius high (see craterField). */
const craters = craterField(19006, 40, 80000, 1000, 8000, DOME_CLEAR, 0.15);
/** Hummocks of regolith: a few meters. */
const BUMPS = 80;
const bumps = new Noise(19007);

/** The Moon's ground (units, its height) over (x, z): the plain, its craters' bowls and rims, hummocks, and the Moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  return LAND + craters(x, z) + BUMPS * bumps.fractal(x / 3000, 0.4, z / 3000, 3) - (x * x + z * z) / (2 * MOON_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
/** Its box's top: over the highest the ground gets in it (overlapping craters' rims add up), sampled every 50 m. */
const GROUND_TOP = reliefTop(surfaceHeight, GROUND_HALF) + BUMPS;

/** The ground as the field's piece (see reliefPiece). */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/** The dome's box: what collides of it (its half extents), standing on the plain at the field's middle. */
export const DOME_HALF = new THREE.Vector3(DOME_RADIUS * 0.8, DOME_HEIGHT / 2, DOME_RADIUS * 0.8);
export function domePlacement(type: number): Placement {
  return { kind: 'rack', type, scale: 1, position: new THREE.Vector3(0, surfaceHeight(0, 0) + DOME_HALF.y, 0), orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), 0), solid: true };
}

/** Earth over the Moon: some 1.9° across (from 384,000 km off, its radius 6,371 km), 55° up, still in the sky; drawn at EARTH_DISTANCE (units). */
const EARTH_DISTANCE = 250000;
const EARTH_ANGLE = 0.0166;
const EARTH_UP = 0.96;
export const EARTH_AT = new THREE.Vector3(cos(EARTH_UP) * 0.6, sin(EARTH_UP), cos(EARTH_UP) * 0.8).normalize().multiplyScalar(EARTH_DISTANCE);
export const EARTH_SIZE = EARTH_DISTANCE * sin(EARTH_ANGLE);
