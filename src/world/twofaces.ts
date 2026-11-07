import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { moonBeyond } from './horizon';
import { darkness, GROUND_HALF, groundRelief, surfaceHeight } from './iapetus';

/**
 * How Two Faces on Iapetus looks (where things are in world/iapetus): the ground of the field as
 * the piece it collides as (its relief, see Relief), the crater floor's photograph tinted to
 * Iapetus's two faces, a soot as dark as coal on the north side of the ridge, ice as bright as
 * snow on the south, the border wandering across the ridge in tongues; the moon beyond in the
 * same two faces, drawn behind everything.
 */

/** Iapetus's ice: pale, lit by Saturn's glow and the far sun, as bright as snow (the glow on the field's ground in each vertex's tone, see reliefGround; the land beyond its own, fainter). */
const IAPETUS_TINT = 0xf2efe8;
const IAPETUS_GLOW = 0x4a4844;
const BEYOND_GLOW = 0x16140f;
/** The two faces on the field's ground, over the tint: the bright one's ice, the dark one's reddish soot. */
const ICE_TONE = new THREE.Color(1, 1, 1);
const SOOT_TONE = new THREE.Color(0.04, 0.03, 0.024);

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/iapetus gives (see reliefGround), each vertex in its face's tone. */
export const iapetusGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, IAPETUS_TINT, IAPETUS_GLOW, undefined, (x, z, color) => color.copy(ICE_TONE).lerp(SOOT_TONE, darkness(x, z)));

/** The two faces beyond the field (linear light): the bright terrain's ice, the dark terrain's soot, as dark as coal. */
const ICE = new THREE.Color(0.42, 0.42, 0.41);
const SOOT = new THREE.Color(0.008, 0.006, 0.005);

/** The moon beyond the field's ground, from 3.4 km out to its horizon some 25 km away, drawn behind everything. */
export function iapetus(): THREE.Group {
  return moonBeyond(GROUND_HALF.x, 25 * 20000, surfaceHeight, (x, z, color) => color.copy(ICE).lerp(SOOT, darkness(x, z)), BEYOND_GLOW);
}
