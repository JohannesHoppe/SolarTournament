import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { moonBeyond } from './horizon';
import { brightness, GROUND_HALF, groundRelief, surfaceHeight } from './ganymede';

/**
 * How the Tug Yards over Ganymede look (where things are in world/ganymede): the ground of the
 * field far below as the piece it collides as (its relief, see Relief), the crater floor's
 * photograph tinted to Ganymede's grey ice; the moon beyond, its bright grooved bands and its
 * dark old terrain, drawn behind everything. The yard's blocks of ice are the field's ice.
 */

/** Ganymede's ice: grey, a little brown on the dark terrain, lit faintly by Jupiter's glow. */
const GANYMEDE_TINT = 0xd8d6d0;
const GANYMEDE_GLOW = 0x1c1c1e;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/ganymede gives (see reliefGround). */
export const ganymedeGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, GANYMEDE_TINT, GANYMEDE_GLOW);

/** Ganymede's colors beyond the field: the bright terrain's pale grey ice, the dark terrain's brown-grey. */
const BRIGHT_ICE = new THREE.Color(0.32, 0.32, 0.33);
const DARK = new THREE.Color(0.09, 0.08, 0.07);

/** The moon beyond the field's ground, from 3.4 km out to its horizon some 30 km away, drawn behind everything. */
export function ganymede(): THREE.Group {
  return moonBeyond(GROUND_HALF.x, 30 * 20000, surfaceHeight, (x, z, color) => color.copy(DARK).lerp(BRIGHT_ICE, brightness(x, z)), GANYMEDE_GLOW);
}
