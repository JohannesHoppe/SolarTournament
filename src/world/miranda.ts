import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';

/**
 * Verona on Miranda (the campaign's chapter 13, see docs/campaign/): Verona Rupes, the tallest
 * cliff in the solar system, and the hideout the Loose cut into its face. Where things are, for
 * the field and its scenery (world/verona).
 *
 * The place's y is the true vertical. The cliff runs across the field along x: north of it (-z)
 * the upland TOP over the field's middle, south of it (+z) the foot FOOT under it, the face
 * between them nearly sheer, CLIFF high, squeezed as every place's heights are (the real one
 * drops some 10 to 20 km). The hideout's mouth opens in the face near its foot. Uranus fills a
 * fifth of the sky, lying on its side.
 */

/** 1 km in units. */
const KM = 20000;

/** Miranda's pull at its surface (units/s²): 0.079 m/s², about a 120th of a g, from its mass of 6.4 × 10¹⁹ kg over its radius of 236 km; too weak for a ship to feel. */
export const MIRANDA_FALL = 1.6;
/** Miranda's radius (units, 236 km). */
const MIRANDA_RADIUS = 236 * KM;

/** The upland over the cliff (units, 700 m over the field's middle) and the foot under it (1.3 km under the middle): the cliff 2 km high. */
export const TOP = 14000;
export const FOOT = -26000;
export const CLIFF = TOP - FOOT;
/** The face: steep, its drop spread over FACE_HALF on each side of its line (units, 250 m), so it leans back some 75°. */
const FACE_HALF = 5000;
/** How far the face winds off its straight line (units, 200 m), once every 3 km or so, and its buttresses and gullies (units, up to 60 m). */
const WIND = 4000;
const WIND_LENGTH = 60000;
const RIBS = 1200;
const RIB_SCALE = 2500;
/** Boulders and ice over all of it: a few meters, some 150 m across. */
const BUMPS = 120;
const BUMP_SCALE = 3000;
const ribs = new Noise(13006);
const bumps = new Noise(13007);

/** Where the face's line runs across z at `x` (its middle height). */
export const faceZ = (x: number) => WIND * sin((x / WIND_LENGTH) * Math.PI * 2) + RIBS * ribs.fractal(x / RIB_SCALE, 0.5, 0, 2);

/** How far south of the face's line (x, z) lies (units, negative north of it, on the upland). */
export const offFace = (x: number, z: number) => z - faceZ(x);

/** Miranda's ground (units, its height) over (x, z): the upland, the face, the foot, boulders over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  const t = THREE.MathUtils.clamp(offFace(x, z) / (2 * FACE_HALF) + 0.5, 0, 1);
  const drop = t * t * (3 - 2 * t);
  return TOP - CLIFF * drop + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * MIRANDA_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 24000, 4 * KM);
const GROUND_TOP = TOP + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/** Where the face stands (z) at `x` at height `y` between the foot and the top, boulders aside: the drop's share solved back for its offset. */
export function faceAt(x: number, y: number): number {
  const share = THREE.MathUtils.clamp((TOP - y) / CLIFF, 0, 1);
  let t = 0.5;
  for (let i = 0; i < 30; i++) t -= (t * t * (3 - 2 * t) - share) / Math.max(1e-6, 6 * t * (1 - t));
  return faceZ(x) + (t - 0.5) * 2 * FACE_HALF;
}

/** The hideout's mouth in the face, MOUTH_UP over the foot (units, 150 m) at x MOUTH_X: where the Loose's hangar opens, its lights in the ice. */
const MOUTH_X = -30000;
const MOUTH_UP = 3000;
export const MOUTH = new THREE.Vector3(MOUTH_X, FOOT + MOUTH_UP, faceAt(MOUTH_X, FOOT + MOUTH_UP));

/**
 * Uranus over Miranda: some 25° across (from 130,000 km off, its radius 25,600 km), lying on its
 * side, 35° up and still in the sky (Miranda keeps one face to it); drawn at URANUS_DISTANCE
 * (units, inside the sky's sphere of stars), on the sky's side away from the sun.
 */
const URANUS_DISTANCE = 250000;
const URANUS_ANGLE = 0.196;
const URANUS_UP = 0.61;
export const URANUS_AT = new THREE.Vector3(cos(URANUS_UP) * 0.6, sin(URANUS_UP), cos(URANUS_UP) * 0.8).normalize().multiplyScalar(URANUS_DISTANCE);
export const URANUS_SIZE = URANUS_DISTANCE * sin(URANUS_ANGLE);
