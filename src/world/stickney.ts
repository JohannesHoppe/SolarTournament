import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { horizonMesh } from './horizon';
import { Noise } from './noise';
import { GROUND_HALF, groundRelief, surfaceHeight } from './phobos';

/**
 * How Stickney on Phobos looks (where things are in world/phobos): the ground of the field as the
 * piece it collides as (its relief, see Relief), in the crater floor's photograph tinted to
 * Phobos's dark, reddish dust; and the moon beyond, curving away fast, drawn behind everything.
 */

/** Phobos's ground: very dark, a little red (it reflects some 7 % of the light), lit faintly by Mars's glow. */
const PHOBOS_TINT = 0xd6c4b6;
const PHOBOS_GLOW = 0x2a1d17;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/phobos gives (see reliefGround). */
export const phobosGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, PHOBOS_TINT, PHOBOS_GLOW);

/** Phobos's colors beyond the field: dark grey dust, a little red, in broad patches. */
const DUST = new THREE.Color(0.06, 0.05, 0.045);
const DARKER = new THREE.Color(0.045, 0.038, 0.034);
const tone = new Noise(4005);

/** The moon beyond the field's ground, from 5 km out to its horizon some 20 km away, drawn behind everything. */
export function phobos(): THREE.Group {
  const surface = horizonMesh({
    rings: 120,
    spokes: 360,
    first: GROUND_HALF.x * 0.85,
    reach: 20 * 20000,
    height: surfaceHeight,
    paint: (x, z, color) => color.copy(DUST).lerp(DARKER, 0.5 + 0.5 * tone.fractal(x / 60000, 0.5, z / 60000, 3)),
    glow: PHOBOS_GLOW,
  });
  return new THREE.Group().add(surface);
}
