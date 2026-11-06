import * as THREE from 'three';
import { cos, hypot, sin } from '../detmath';
import { Noise } from './noise';
import type { Placement, Relief } from './asteroids';

/**
 * Stickney on Phobos (the campaign's chapter 4, see docs/campaign/): the inner wall and floor of
 * the great crater of Mars's larger moon, and the grooves that run across the moon beyond its
 * rim. Where things are, for the field and its scenery.
 *
 * The place's y is the true vertical. The field's middle hangs over Stickney's inner wall: the
 * crater's floor lies towards -x, its rim towards +x, and beyond the rim the moon's ground runs
 * on in long parallel grooves. Phobos is small, so its ground curves away fast: some 4.5 km
 * down at 10 km out.
 */

/** 1 km in units. */
const KM = 20000;

/** Phobos's pull at its surface (units/s²): 0.0057 m/s², about a 1,700th of a g; nothing a ship feels. */
export const PHOBOS_FALL = 0.114;
/** Phobos's mean radius (units, 11.1 km): what curves its ground away. */
const PHOBOS_RADIUS = 11.1 * KM;

/** Stickney: 9 km across, its floor 1.2 km under its rim, its rim 150 m over the land beyond; its middle 3 km from the field's middle along -x. */
const STICKNEY_RADIUS = 4.5 * KM;
const STICKNEY_DEPTH = 1.2 * KM;
const RIM_HEIGHT = 0.15 * KM;
const RIM_WIDTH = 0.8 * KM;
export const STICKNEY = new THREE.Vector3(-3 * KM, 0, 0);
/** The land beyond the rim, under the field's middle's level (units): the rim's crest stands RIM_HEIGHT over it. */
export const LAND = -1600;

/** The grooves: troughs GROOVE_DEPTH deep (units, 25 m), GROOVE_SPACING apart (300 m), running along GROOVE_WAY across the land beyond the rim, fading into the rim. */
const GROOVE_DEPTH = 500;
const GROOVE_SPACING = 6000;
const GROOVE_TURN = 0.35;
/** Boulders and small craters over all of it: a few meters, some 200 m across. */
const BUMPS = 120;
const BUMP_SCALE = 4000;
const bumps = new Noise(4004);

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Phobos's ground (units, its height) over (x, z): Stickney's bowl, its raised rim, the grooved
 * land beyond, bumps over all of it, and the moon's own curve.
 */
export function surfaceHeight(x: number, z: number): number {
  const out = hypot(x - STICKNEY.x, z - STICKNEY.z) / STICKNEY_RADIUS;
  // the bowl: a parabola from the floor up to the rim, the rim's crest a raised cosine over its width
  const bowl = out < 1 ? -STICKNEY_DEPTH * (1 - out * out) : 0;
  const rimOff = Math.abs(out - 1) * STICKNEY_RADIUS;
  const rim = rimOff < RIM_WIDTH ? RIM_HEIGHT * (0.5 + 0.5 * cos((Math.PI * rimOff) / RIM_WIDTH)) : 0;
  // the grooves beyond the rim, across the land, fading in over the rim's foot
  const across = x * cos(GROOVE_TURN) + z * sin(GROOVE_TURN);
  const trough = 0.5 + 0.5 * cos((2 * Math.PI * across) / GROOVE_SPACING);
  const grooves = -GROOVE_DEPTH * trough * trough * trough * smooth((out - 1.15) / 0.2);
  const lumps = BUMPS * bumps.fractal(x / BUMP_SCALE, 0.3, z / BUMP_SCALE, 3);
  return LAND + bowl + rim + grooves + lumps - (x * x + z * z) / (2 * PHOBOS_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 6 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(6 * KM, 2 * KM, 6 * KM);
/** Its box's top: the ground's highest point there, the rim's crest with its bumps. */
const GROUND_TOP = LAND + RIM_HEIGHT + BUMPS;

/** The ground's relief in its box's own coordinates (see Relief): the surface, about the box's middle. */
export const groundRelief: Relief = (x, z) => surfaceHeight(x, z) - (GROUND_TOP - GROUND_HALF.y);

/** The ground as the field's piece of kind 'rack' (type `type` in the yards' set): a box whose top is the ground (see Relief). */
export function groundPlacement(type: number): Placement {
  return { kind: 'rack', type, scale: 1, position: new THREE.Vector3(0, GROUND_TOP - GROUND_HALF.y, 0), orientation: new THREE.Quaternion(), solid: true, ground: true };
}

/** Where the race's mark stands for the HUD: Stickney's floor in its middle (units). */
export const STICKNEY_FLOOR = new THREE.Vector3(STICKNEY.x, surfaceHeight(STICKNEY.x, STICKNEY.z), STICKNEY.z);

/**
 * Mars over Stickney: Phobos keeps one face to it, so it stands still in the sky, some 35° up,
 * 42° across (from 9,400 km off, its radius 3,390 km); drawn as a sphere at MARS_DISTANCE (units,
 * inside the sky's sphere of stars, which it hides) sized to look as large.
 */
const MARS_DISTANCE = 250000;
const MARS_ANGLE = 0.367;
export const MARS_AT = new THREE.Vector3(0.3, 0.57, 0.76).normalize().multiplyScalar(MARS_DISTANCE);
export const MARS_SIZE = MARS_DISTANCE * sin(MARS_ANGLE);
