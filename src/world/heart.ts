import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { behindAll, moonBeyond } from './horizon';
import { Noise } from './noise';
import { CHARON_AT, CHARON_SIZE, GROUND_HALF, groundRelief, LAND, surfaceHeight } from './pluto';

/**
 * How Last Light on Pluto looks (where things are in world/pluto): the ground of the field as the
 * piece it collides as (its relief, see Relief), the crater floor's photograph tinted to the
 * heart's pale nitrogen ice, the mountains' water ice greyer, each vertex in its own tone; the
 * heart beyond, its cells and the reddish tholin plains past its edge, drawn behind everything;
 * Charon in the sky, grey.
 */

/** The heart's nitrogen ice: very pale, a little warm, lit faintly by Charon's glow under a sun some 2,400 times dimmer than at Earth. */
const PLUTO_TINT = 0xfff6ee;
const PLUTO_GLOW = 0x3a3634;
/** The tones over the tint: the plain's fresh nitrogen white, the mountains' water ice grey-brown where they rise. */
const NITROGEN = new THREE.Color(1, 0.98, 0.95);
const WATER_ICE = new THREE.Color(0.55, 0.5, 0.46);

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/pluto gives (see reliefGround), the mountains in their own tone. */
export const plutoGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, PLUTO_TINT, PLUTO_GLOW, undefined, (x, z, color) => color.copy(NITROGEN).lerp(WATER_ICE, THREE.MathUtils.smoothstep(surfaceHeight(x, z) - LAND, 400, 4000)));

/** Pluto beyond the field: the heart's pale plain and, past its edges, the dark reddish tholins. */
const HEART = new THREE.Color(0.48, 0.46, 0.44);
const THOLIN = new THREE.Color(0.16, 0.08, 0.05);
const edge = new Noise(15009);

/** Charon: grey water ice. */
const CHARON_COLOR = 0x8c8884;

/** The plain beyond the field's ground, from 3.4 km out to its horizon some 25 km away, and Charon, drawn behind everything. */
export function pluto(): THREE.Group {
  const paint = (x: number, z: number, color: THREE.Color) => {
    // the heart's edge wanders some 10 km out to the south and east; past it the tholins
    const past = THREE.MathUtils.smoothstep(Math.sqrt((x - 80000) * (x - 80000) + (z - 80000) * (z - 80000)) + 40000 * edge.fractal(x / 200000, 0.3, z / 200000, 2), 260000, 330000);
    color.copy(HEART).lerp(THOLIN, past);
    color.lerp(THOLIN, THREE.MathUtils.smoothstep(surfaceHeight(x, z) - LAND, 2000, 16000) * 0.5);
  };
  const charon = new THREE.Mesh(new THREE.SphereGeometry(CHARON_SIZE, 48, 24), behindAll(new THREE.MeshStandardMaterial({ color: CHARON_COLOR, roughness: 1, metalness: 0 })));
  charon.position.copy(CHARON_AT);
  charon.userData.shadowless = true;
  return moonBeyond(GROUND_HALF.x, 25 * 20000, surfaceHeight, paint, PLUTO_GLOW).add(charon);
}
