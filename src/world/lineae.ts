import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { horizonMesh } from './horizon';
import { Noise } from './noise';
import { GROUND_CELL, GROUND_HALF, groundRelief, inCrack, surfaceHeight } from './europa';
import { listeningPost } from './valhalla';

/**
 * How the Lineae on Europa look (where things are in world/europa): the ground of the field as
 * the piece it collides as (its relief, see Relief), the crater floor's photograph tinted to
 * Europa's bright, bluish ice; the shell beyond, streaked with the reddish brown of its cracks,
 * drawn behind everything; the science station on the Crack's floor.
 */

/** Europa's ice: bright (it reflects some two thirds of the light), a little blue, lit faintly by Jupiter's glow. */
const EUROPA_TINT = 0xf2f6ff;
const EUROPA_GLOW = 0x1c2026;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/europa gives, on its fine grid (see reliefGround). */
export const europaGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, EUROPA_TINT, EUROPA_GLOW, GROUND_CELL);

/** The science station's plating: an outfit's white, its stencils, worn by the cold. */
const STATION_PAINT = { key: 'europa-station', seed: 6101, tint: 0xd8d6cc, texts: ['EUROPA SCIENCE', 'OCEAN PROBE 4', 'LIFE?', 'KEEP OUT', 'DEEP STATION'] };

/** The science station on the Crack's floor (see world/europa): the listening post's build in the outfit's white. */
export const scienceStation = (half: THREE.Vector3): THREE.Group => listeningPost(half, STATION_PAINT);

/** Europa's colors beyond the field: white ice, streaked with reddish brown where the shell cracked, in long bands. */
const ICE = new THREE.Color(0.55, 0.58, 0.62);
const STREAK = new THREE.Color(0.32, 0.2, 0.13);
const streaks = new Noise(6008);

/** The shell beyond the field's ground, from 3.4 km out to its horizon some 25 km away, drawn behind everything. */
export function europa(): THREE.Group {
  const surface = horizonMesh({
    rings: 140,
    spokes: 360,
    first: GROUND_HALF.x * 0.85,
    reach: 25 * 20000,
    height: surfaceHeight,
    // the Crack's rim and long ridged bands stained brown, the ice between white
    paint: (x, z, color) => color.copy(ICE).lerp(STREAK, Math.max(inCrack(x, z), Math.max(0, streaks.fractal(x / 200000, 0.3, z / 15000, 3) - 0.2) * 1.5)),
    glow: EUROPA_GLOW,
  });
  return new THREE.Group().add(surface);
}
