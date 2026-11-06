import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { horizonMesh } from './horizon';
import { Noise } from './noise';
import { GROUND_HALF, groundRelief, surfaceHeight } from './callisto';

/**
 * How Valhalla on Callisto looks (where things are in world/callisto): the ground of the field as
 * the piece it collides as (its relief, see Relief), in the crater floor's photograph tinted to
 * Callisto's dark, ice-flecked dust; and the moon beyond, the basin's ridges running on to the
 * horizon, drawn behind everything.
 */

/** Callisto's ground: dark grey-brown dust over ice (it reflects some 20 % of the light), lit faintly by Jupiter's cream glow. */
const CALLISTO_TINT = 0xd8d2c8;
const CALLISTO_GLOW = 0x1c1a16;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/callisto gives (see reliefGround). */
export const callistoGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, CALLISTO_TINT, CALLISTO_GLOW);

/** Callisto's colors beyond the field: dark dust, flecked brighter where ice shows through. */
const DUST = new THREE.Color(0.075, 0.068, 0.058);
const ICE = new THREE.Color(0.2, 0.2, 0.2);
const tone = new Noise(5006);

/** The moon beyond the field's ground, from 7 km out to its horizon some 30 km away, drawn behind everything. */
export function callisto(): THREE.Group {
  const surface = horizonMesh({
    rings: 140,
    spokes: 360,
    first: GROUND_HALF.x * 0.85,
    reach: 30 * 20000,
    height: surfaceHeight,
    paint: (x, z, color) => color.copy(DUST).lerp(ICE, Math.max(0, tone.fractal(x / 40000, 0.5, z / 40000, 3) - 0.15)),
    glow: CALLISTO_GLOW,
  });
  return new THREE.Group().add(surface);
}
