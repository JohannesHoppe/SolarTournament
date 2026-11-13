import * as THREE from 'three';
import { DUST_TILE, groundMaterial, macroUv, reliefGround, withCollider } from './boneyard';
import { boxUv } from '../view/surfaces';
import { moonBeyond } from './horizon';
import { Noise } from './noise';
import { fightRelief, GROUND_CELL, GROUND_HALF, groundRelief, lineaeTones, surfaceHeight } from './europa';
import { CRACK_GROUND_HALF, crackRelief, crackTones, riftHeight } from './crack';
import { listeningPost } from './valhalla';

/**
 * How Europa looks, at the Lineae and on the Crack (where things are in world/europa and
 * world/crack): the ground of the field as the piece it collides as (its relief, see Relief) in
 * Europa's ice, one of the brightest surfaces in the system: white with a touch of blue, the
 * double ridges' crests and the chaos's frozen matrix stained the reddish brown of Europa's
 * cracks, the walls of a rift or the Crack the cleanest, bluest ice, broken open last; glossier
 * than dust, so the low sun glints off it, and its shadow side warmed a little by Jupiter's light.
 * The shell beyond, streaked with the same brown, drawn behind everything; the science station.
 */

/** Europa's ice: white (it reflects some two thirds of the light), lit faintly by Jupiter's glow, which is warm. */
const ICE_TINT = 0xffffff;
const EUROPA_GLOW = 0x3a2e22;
/** Ice is smoother than dust: the low sun glints off it. */
const ICE_ROUGHNESS = 0.6;

/** The ice's tones over the ground's grain (see icy): plain ice, the cleanest ice in a rift's walls, a little bluer, and the stain of the cracks. */
const ICE = new THREE.Color(0.96, 1, 1.06);
const FRESH = new THREE.Color(0.8, 0.95, 1.14);
const STAIN = new THREE.Color(0.72, 0.47, 0.33);
const tones = { stain: 0, fresh: 0 };
const grain = new Noise(6009);

/** A tone of the ice from `stain` and `fresh` (see lineaeTones), mottled a little at `x`, `z`. */
function iceTone(x: number, z: number, color: THREE.Color) {
  const mottle = 0.06 * grain.fractal(x / 2500, 0.4, z / 2500, 2);
  return color.copy(ICE).lerp(FRESH, tones.fresh * 0.8).lerp(STAIN, Math.min(1, tones.stain + mottle));
}

/**
 * The ground's layers (see groundMaterial) made ice: their grain kept but not their dust's warm
 * hue, and lifted towards white (ICE_FLOOR of the light at the least, the grain the rest), before
 * the ice's own tones; glossier than dust.
 */
const ICE_FLOOR = 0.35;
function icy(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.roughness = ICE_ROUGHNESS;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `diffuseColor.rgb = vec3(${ICE_FLOOR.toFixed(2)} + ${(1 - ICE_FLOOR).toFixed(2)} * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));\n#include <color_fragment>`,
    );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}-ice`;
  return material;
}

/** A ground of Europa's ice on `relief`, its tones from `paint`. */
function iceGround(half: THREE.Vector3, relief: (x: number, z: number) => number, paint: (x: number, z: number, color: THREE.Color) => void): THREE.Group {
  const group = reliefGround(half, relief, ICE_TINT, EUROPA_GLOW, GROUND_CELL, paint);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) icy(object.material);
  });
  return group;
}

/** The ground's tones at the Lineae, in the frame of the ground's box (its middle at the field's middle in x and z). */
const lineaePaint = (fought: boolean) => (x: number, z: number, color: THREE.Color) => {
  lineaeTones(x, z, fought, tones);
  return iceTone(x, z, color);
};
/** The ground's tones on the Crack. */
const crackPaint = (x: number, z: number, color: THREE.Color) => {
  crackTones(x, z, tones);
  return iceTone(x, z, color);
};

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/europa gives, on its fine grid (see reliefGround). */
export const europaGround = (half: THREE.Vector3): THREE.Group => iceGround(half, groundRelief, lineaePaint(false));

/** The ground of the Lineae as a world fought over (see world/europa, fightHeight): the same ice with the chaos's rafts east of the Crack. */
export const lineaeGround = (half: THREE.Vector3): THREE.Group => iceGround(half, fightRelief, lineaePaint(true));

/** The race world's ground on the Crack (see world/crack): the same ice on its rift, along its longer box. */
export const crackGround = (half: THREE.Vector3): THREE.Group => iceGround(half, crackRelief, crackPaint);

/** The slab's ice: the rift walls' clean blue-white, its faces cracked and lumpy by up to SLAB_LUMP (3 m), never out of its collider box. */
const SLAB_TINT = 0xd6e8ff;
const SLAB_LUMP = 60;
const lumps = new Noise(6010);

/**
 * A slab of ice fallen across the rift (see world/crack, BRIDGE_HALF), in its box's frame: a
 * block on a grid of some 25 m, each face pushed in by its lumps, in the ground's layers of ice.
 */
export function iceSlab(half: THREE.Vector3): THREE.Group {
  const geometry = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2, Math.round(half.x / 250), 4, Math.round(half.z / 250));
  const position = geometry.getAttribute('position');
  // pushed in along every axis whose face the corner lies on, the same wherever faces meet: no seam opens
  const inward = (value: number, extent: number, push: number) => (Math.abs(value) >= extent - 1 ? value - Math.sign(value) * push : value);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const push = SLAB_LUMP * (0.5 + 0.5 * lumps.fractal(x / 900, y / 900, z / 900, 3));
    position.setXYZ(i, inward(x, half.x, push), inward(y, half.y, push), inward(z, half.z, push));
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(macroUv(boxUv(geometry, DUST_TILE), 0.5, DUST_TILE), icy(groundMaterial(SLAB_TINT, EUROPA_GLOW, 0.04)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

/** The science station's plating: an outfit's white, its stencils, worn by the cold. */
const STATION_PAINT = { key: 'europa-station', seed: 6101, tint: 0xd8d6cc, texts: ['EUROPA SCIENCE', 'OCEAN PROBE 4', 'LIFE?', 'KEEP OUT', 'DEEP STATION'] };

/** The science station on the Crack's floor (see world/europa): the listening post's build in the outfit's white. */
export const scienceStation = (half: THREE.Vector3): THREE.Group => listeningPost(half, STATION_PAINT);

/** Europa's colors beyond the field: white ice, streaked with reddish brown where the shell cracked, in long bands. */
const SHELL = new THREE.Color(0.8, 0.83, 0.88);
const STREAK = new THREE.Color(0.45, 0.29, 0.19);
const streaks = new Noise(6008);

/** Long ridged bands stained brown, the ice between white; the Lineae's Crack and ridges in their own stain. */
const paintShell = (stained: (x: number, z: number) => number) => (x: number, z: number, color: THREE.Color) =>
  color.copy(SHELL).lerp(STREAK, Math.min(1, Math.max(stained(x, z), Math.max(0, streaks.fractal(x / 200000, 0.3, z / 15000, 3) - 0.2) * 1.5)));

/** The shell beyond the field's ground, from 3.4 km out to its horizon some 25 km away, drawn behind everything. */
export function europa(): THREE.Group {
  return moonBeyond(GROUND_HALF.x, 25 * 20000, surfaceHeight, paintShell((x, z) => lineaeTones(x, z, false, tones).stain), EUROPA_GLOW);
}

/** The shell around the race world's ground (see world/crack), from 2.5 km out to some 35 km away, the rift running on beyond the ground's end. */
export function crackBeyond(): THREE.Group {
  return moonBeyond(CRACK_GROUND_HALF.x, 35 * 20000, riftHeight, paintShell((x, z) => crackTones(x, z, tones).stain), EUROPA_GLOW);
}
