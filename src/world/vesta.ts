import * as THREE from 'three';
import { atan, cos, hypot, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import { Noise } from './noise';
import type { Placement } from './asteroids';

/**
 * Rheasilvia on Vesta (the campaign's chapter 2, see docs/campaign/): the Rockborn's claims high
 * on the flank of the basin's central peak. Where things are, for the field and its scenery
 * (world/rheasilvia).
 *
 * The place's y is the true vertical, along which Vesta pulls. The flank under the claims is a
 * plane leaning SLOPE (about 13°), rising towards +x, to the summit: over the field's width it
 * climbs some 1.2 km, and the claims' rocks lie on it (FieldLayout.rest), its solid box beneath
 * them (slopeGround). Down the other way the flank falls to the basin's floor some 20 km below,
 * its rim on the horizon.
 */

/** 1 km in units. */
const KM = 20000;

/** The flank under the field's center (units, 75 m below it). */
export const VESTA_GROUND = -1500;
/** The flank's solid box under the claims: its half extents (units, 12 km across, 800 m thick), its top the flank. */
export const SLOPE_HALF = new THREE.Vector3(6 * KM, 8000, 6 * KM);

/** Vesta's pull on its surface (units/s²): 0.25 m/s², about a fortieth of a g, from its mass of 2.6 × 10²⁰ kg over its mean radius of 263 km. */
export const VESTA_FALL = 5;
/** Vesta's mean radius (units, 263 km): what curves its surface beyond the basin's rim. */
const VESTA_RADIUS = 263 * KM;

/** The central peak: its height over the basin's floor (units, 22 km) and the radius of its base (100 km), a raised cosine from summit to foot. */
const PEAK_HEIGHT = 22 * KM;
const PEAK_BASE = 100 * KM;
/** How far from the summit the claims lie (units, 21 km), some 20 km over the basin's floor. */
const CLAIMS_OUT = 21 * KM;
/**
 * The basin's floor: 500 km across, far flatter than the sphere it was struck into, curving
 * down as a sphere of BASIN_CURVE (units, 900 km) would; its rim RIM_OUT from the summit (250 km),
 * RIM_HEIGHT over the floor (6 km), RIM_WIDTH wide (60 km); beyond it Vesta's own curve.
 */
const BASIN_CURVE = 900 * KM;
const RIM_OUT = 250 * KM;
const RIM_HEIGHT = 6 * KM;
const RIM_WIDTH = 60 * KM;
/** Hills over all of it: ridges and slumps up to a kilometer high, some 25 km across; none under the claims. */
const HILLS = 1 * KM;
const HILL_SCALE = 25 * KM;
const HILLS_FROM = 8 * KM;
const hillNoise = new Noise(2002);

/** How far the scenery reaches from the claims (units, 330 km): past the basin's rim. */
export const SURFACE_REACH = 330 * KM;

/** The raised cosine of the peak, 1 at its summit to 0 at its foot. */
const peak = (out: number) => (out >= PEAK_BASE ? 0 : 0.5 + 0.5 * cos((Math.PI * out) / PEAK_BASE));
/** The rim's rise, 1 on its crest, a raised cosine over RIM_WIDTH. */
const rim = (out: number) => {
  const d = Math.abs(out - RIM_OUT) / (RIM_WIDTH / 2);
  return d >= 1 ? 0 : 0.5 + 0.5 * cos(Math.PI * d);
};
/** The basin's floor curving down and Vesta's curve beyond the rim (units, negative), at `out` from the summit. */
const fallOff = (out: number) => {
  const beyond = Math.max(0, out - RIM_OUT);
  return -(out * out) / (2 * BASIN_CURVE) - (beyond * beyond) / (2 * VESTA_RADIUS);
};

/** The surface's height over the basin's floor (units) under the claims. */
const CLAIMS_HEIGHT = PEAK_HEIGHT * peak(CLAIMS_OUT) + fallOff(CLAIMS_OUT);
/**
 * How steeply the flank rises under the claims towards the summit (height per distance, about
 * 0.235: some 13°): the peak's raised cosine's steepness there plus the floor's curve.
 */
export const RISE = ((PEAK_HEIGHT * Math.PI) / (2 * PEAK_BASE)) * sin((Math.PI * CLAIMS_OUT) / PEAK_BASE) + CLAIMS_OUT / BASIN_CURVE;
/** The flank's lean there (rad). */
export const SLOPE = atan(RISE);

/**
 * Vesta's surface (units, its height) over (x, z): the peak, the basin's floor curving down, its
 * rim, Vesta's curve beyond, the hills; VESTA_GROUND under the field's center, the summit along +x.
 */
export function surfaceHeight(x: number, z: number): number {
  const out = hypot(x - CLAIMS_OUT, z);
  const near = Math.min(1, hypot(x, z) / HILLS_FROM);
  const hills = HILLS * hillNoise.fractal(x / HILL_SCALE, 0.5, z / HILL_SCALE, 4) * near * near;
  return PEAK_HEIGHT * peak(out) + fallOff(out) + RIM_HEIGHT * rim(out) + hills - CLAIMS_HEIGHT + VESTA_GROUND;
}

/** The summit (units), the HUD's reference. */
export const SUMMIT = new THREE.Vector3(CLAIMS_OUT, surfaceHeight(CLAIMS_OUT, 0), 0);

/**
 * The flank's solid box under the claims, as the field's piece of kind 'rack' it is (type `type`
 * in the yards' set, see world/boneyard): leaning SLOPE about z, its top the plane through
 * VESTA_GROUND under the field's center rising RISE towards +x.
 */
export function slopeGround(type: number): Placement {
  return {
    kind: 'rack',
    type,
    scale: 1,
    position: new THREE.Vector3(sin(SLOPE) * SLOPE_HALF.y, VESTA_GROUND - cos(SLOPE) * SLOPE_HALF.y, 0),
    orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 0, 1), SLOPE),
    solid: true,
  };
}
