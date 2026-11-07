import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { block, lattice, macroUv, noUv, patchedPlating, PLATING_TILE, reliefGround, withCollider } from './boneyard';
import { boxUv, industrialSurface, surfaced } from '../view/surfaces';
import { rotateX, rotateZ } from '../detthree';
import { moonBeyond } from './horizon';
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

/** The listening post's plating: the Navy's old olive, stencilled, patched where it was hit. */
export const POST_PAINT = { key: 'navy-post', seed: 5101, tint: 0x8c9480, texts: ['UEN LP-3', 'NAVY', 'NO ENTRY', 'RESTRICTED', 'CALLISTO'] };
const POST_STEEL_SEED = 5102;

/**
 * The Navy's old listening post (where it stands in world/callisto), in its box's frame (`half`
 * its half extents): a bunker dug into the ground under a curved roof; a lattice tower beside it
 * carrying a dish 40 m across, turned up at the sky; two aerial masts; a red beacon on the tower;
 * long dead, nobody has kept it up. The same build in another `paint` serves for other outposts
 * (the science station in Europa's Crack).
 */
export function listeningPost(half: THREE.Vector3, paint = POST_PAINT): THREE.Group {
  const group = new THREE.Group();
  const plating = patchedPlating(paint.key, paint);
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(POST_STEEL_SEED), 2), color: 0x7b7f78 });
  const floor = -half.y;
  // the bunker: 60 m by 18 m high by 36 m, its foot dug into the ground, its roof a half cylinder along x
  const bunker = block(1200, 360, 720, -100, floor + 180, 0);
  const roof = rotateZ(new THREE.CylinderGeometry(360, 360, 1200, 16, 1, false, 0, Math.PI), Math.PI / 2).translate(-100, floor + 360, 0).toNonIndexed();
  for (const geometry of [bunker, roof]) group.add(new THREE.Mesh(macroUv(boxUv(geometry, PLATING_TILE), 0.4), plating));
  // the tower at the bunker's end, 65 m, and the dish on it, tilted towards the sky
  const towerTop = half.y - 450;
  const towerHalf = new THREE.Vector3(80, (towerTop - floor) / 2, 80);
  const struts = lattice(towerHalf, 160).map((part) => part.translate(560, floor + towerHalf.y, 0));
  const masts = [-1, 1].flatMap((side) => lattice(new THREE.Vector3(20, half.y * 0.6, 20), 200).map((part) => part.translate(-600, floor + half.y * 0.6, side * 420)));
  group.add(new THREE.Mesh(boxUv(mergeGeometries([...struts, ...masts].map(noUv)), 400), steel));
  // a cap of a sphere, its hollow turned up and tilted half a radian off the zenith
  const dish = rotateZ(rotateX(new THREE.SphereGeometry(400, 24, 8, 0, Math.PI * 2, 0, 0.7), Math.PI).translate(0, 400, 0), -0.5).translate(560, towerTop, 0);
  group.add(new THREE.Mesh(dish, steel));
  group.add(new THREE.Mesh(block(40, 40, 40, 560, towerTop - 40, 140), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false })));
  return withCollider(group, half);
}

/** Callisto's colors beyond the field: dark dust, flecked brighter where ice shows through. */
const DUST = new THREE.Color(0.075, 0.068, 0.058);
const ICE = new THREE.Color(0.2, 0.2, 0.2);
const tone = new Noise(5006);

/** The moon beyond the field's ground, from 7 km out to its horizon some 30 km away, drawn behind everything. */
export function callisto(): THREE.Group {
  return moonBeyond(GROUND_HALF.x, 30 * 20000, surfaceHeight, (x, z, color) => color.copy(DUST).lerp(ICE, Math.max(0, tone.fractal(x / 40000, 0.5, z / 40000, 3) - 0.15)), CALLISTO_GLOW);
}
