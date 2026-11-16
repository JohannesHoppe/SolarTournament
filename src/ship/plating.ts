import * as THREE from 'three';
import { boxAxis, plateMap, SIZE, type PlateLayout, type Wear } from '../view/surfaces';

/**
 * The hangar's plating as the hull shows it: every step has the depot replace more of an
 * interceptor's plates with spares fresh from a new batch (see game/hangar, the upgrade
 * 'plating'). Step 1 about a third of them, most on the nose and the flanks, where hits land;
 * step 2 about two thirds; step 3 all of them. Each step keeps the plates of the one before.
 *
 * Which plates a step replaces is fixed for a hull: each plate of the surface's tile has a rank
 * from the hull's seed (see view/surfaces, plateLayout), shuffled once more for every repeat of
 * the tile on the hull and every way the surface is projected (see boxUv), and weighted by how
 * far back the plate's middle lies along the hull and whether it lies on a flank. The plates
 * whose order (plateOrder) lies under a step's threshold (PLATE_STEPS) are fresh. The hull's
 * shader reckons it per pixel from the plate map (PLATE_GLSL), so every ship of a type shares
 * its textures and only the step differs; plateOrder is the same reckoning in TypeScript, for
 * the unit tests. Looks only: nothing of it is shared or decides anything.
 */

/** The threshold of each step (0 stock .. 3): a plate whose order lies under it is fresh. The first two replace about a third and two thirds of a hull's painted area (see the unit test), the last all of it. */
export const PLATE_STEPS = [-1, 0.4, 0.57, 2] as const;
/** How much of a plate's order its place on the hull decides, the rest its rank (0..1). */
const PLACE_WEIGHT = 0.5;
/** How far a plate on a flank counts as forward: a flank takes the hits a ship turning in a fight shows its enemy. */
const FLANK = 0.55;
/** The hulls' nose and stern along z (units): from where a plate counts as forward (0) to aft (1). */
const NOSE = -330;
const STERN = 410;
/** Tile coordinates are shifted by this before hashing, so they stay positive. */
const TILE_SHIFT = 4096;

/** The hash of a plate's tile repeat and projection (0..1, 16 bits), as the shader's plateHash. */
function plateHash(u: number, v: number, key: number): number {
  let h = (Math.imul(u + TILE_SHIFT, 0x8da6b343) ^ Math.imul(v + TILE_SHIFT, 0xd8163841) ^ Math.imul(key, 0xcb1ab31f)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h & 0xffff) / 65536;
}

/** How a face of a hull finds a plate's place along z from the plate's middle in texture coordinates (see plateFore): z = (a·u + b·v)·tile + c·z of the point itself. */
type Fore = readonly [number, number, number];

/** The projection's key a plate's rank is shuffled with (0..17). */
const keyOf = ([a, b, c]: Fore) => Math.round(a) + 1 + 3 * (Math.round(b) + 1) + 9 * Math.round(c);

/** A plate's order (see PLATE_STEPS): its rank shuffled for its tile repeat (`tileU`, `tileV`) and projection, and weighted by its place. */
export function plateOrder(rank: number, tileU: number, tileV: number, fore: Fore, middle: [number, number], z: number, tile: number): number {
  const along = Math.round(fore[0]) * (tileU + middle[0]) * tile + Math.round(fore[1]) * (tileV + middle[1]) * tile + Math.round(fore[2]) * z;
  const aft = Math.max(0, Math.min(1, (along - NOSE) / (STERN - NOSE)));
  const flank = Math.abs(Math.round(fore[0])) === 1 ? FLANK : 1;
  const shuffled = (rank + plateHash(tileU, tileV, keyOf(fore))) % 1;
  return (1 - PLACE_WEIGHT) * shuffled + PLACE_WEIGHT * aft * flank;
}

/**
 * Whether the point of a face at texture coordinates (u, v), z along the hull, is on a fresh plate
 * at a step: the plates of `layout` as its plate map holds them (their middles to the map's byte).
 */
export function freshAt(layout: PlateLayout, u: number, v: number, fore: Fore, z: number, tile: number, step: number): boolean {
  const tileU = Math.floor(u);
  const tileV = Math.floor(v);
  const plate = layout.plates[layout.at((u - tileU) * SIZE, (1 - (v - tileV)) * SIZE)];
  const byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255) / 255;
  return plateOrder(Math.round(plate.rank * 255) / 255, tileU, tileV, fore, [byte(plate.x / SIZE), byte(1 - plate.y / SIZE)], z, tile) < PLATE_STEPS[step];
}

/**
 * Gives every vertex of a hull's coat, its texture coordinates laid by boxUv ('readable'), how
 * its face finds a plate's place along the hull (`plateFore`, see Fore): on a flank z is u
 * (its sign by the side), on the top and the belly −v; on a face looking along z its own z.
 */
export function plateFore(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const normal = geometry.attributes.normal;
  const fore = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const axis = boxAxis(normal, i);
    if (axis === 0) fore[i * 3] = -Math.sign(normal.getX(i));
    else if (axis === 1) fore[i * 3 + 1] = -1;
    else fore[i * 3 + 2] = 1;
  }
  geometry.setAttribute('plateFore', new THREE.BufferAttribute(fore, 3));
  return geometry;
}

/** The vertex shader's part of the plates: what plateOrder needs from each vertex. */
export const PLATE_VERTEX = /* glsl */ `
attribute vec3 plateFore;
varying vec3 vPlateFore;
varying float vPlateZ;
`;
export const PLATE_VERTEX_MAIN = /* glsl */ `
	vPlateFore = plateFore;
	vPlateZ = position.z;
`;

/** The fragment shader's part: plateFresh(uv) is 1 on a fresh plate at the material's step (`plateThreshold`), else 0 (see plateOrder). */
export function plateFragment(tile: number) {
  return /* glsl */ `
uniform sampler2D plateMap;
uniform float plateThreshold;
varying vec3 vPlateFore;
varying float vPlateZ;
float plateHash( vec2 tile, float key ) {
	uint h = ( uint( tile.x + ${TILE_SHIFT.toFixed(1)} ) * 0x8da6b343u ) ^ ( uint( tile.y + ${TILE_SHIFT.toFixed(1)} ) * 0xd8163841u ) ^ ( uint( key ) * 0xcb1ab31fu );
	h ^= h >> 15u;
	h *= 0x2c1b3c6du;
	h ^= h >> 12u;
	return float( h & 0xffffu ) / 65536.0;
}
float plateFresh( vec2 uv ) {
	vec4 plate = texture2D( plateMap, uv );
	vec2 tile = floor( uv );
	vec3 fore = floor( vPlateFore + 0.5 );
	float along = ( fore.x * ( tile.x + plate.g ) + fore.y * ( tile.y + plate.b ) ) * ${tile.toFixed(1)} + fore.z * vPlateZ;
	float aft = clamp( ( along - ${NOSE.toFixed(1)} ) / ${(STERN - NOSE).toFixed(1)}, 0.0, 1.0 );
	float flank = abs( fore.x ) > 0.5 ? ${FLANK.toFixed(4)} : 1.0;
	float key = fore.x + 1.0 + 3.0 * ( fore.y + 1.0 ) + 9.0 * fore.z;
	float shuffled = fract( plate.r + plateHash( tile, key ) );
	float order = ${(1 - PLACE_WEIGHT).toFixed(4)} * shuffled + ${PLACE_WEIGHT.toFixed(4)} * aft * flank;
	return order < plateThreshold ? 1.0 : 0.0;
}
`;
}

/**
 * A coat whose plates the plating replaces: its material at every step (0 stock .. 3), all
 * drawn by one shader program, and its plate map. A ship takes the material of its step (see
 * Ship.outfit); the hangar's marks read the plate map (see view/showcase).
 */
export type Plated = { steps: THREE.MeshPhysicalMaterial[]; plates: THREE.DataTexture };
const families = new WeakMap<THREE.Material, Plated>();

/** Registers a coat's materials for every step, over the plates of a seed and a wear. */
export function platedCoat(steps: THREE.MeshPhysicalMaterial[], seed: number, wear: Wear): Plated {
  const family = { steps, plates: plateMap(seed, wear) };
  steps.forEach((material, step) => {
    material.userData.platingStep = step;
    families.set(material, family);
  });
  return family;
}

/** The plated coat a hull's material belongs to, if any. */
export const platedOf = (material: THREE.Material | THREE.Material[]) => (Array.isArray(material) ? undefined : families.get(material));
