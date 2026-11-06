import * as THREE from 'three';
import { groundMaterial, groundUv, withCollider } from './boneyard';
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

/** The ground's grid: cells of CELL (units, 75 m) over the piece's square. */
const CELL = 1500;

/**
 * The ground of the field in its box's frame (`half` its half extents): the relief world/phobos
 * gives on a grid of 75 m, its texture laid on from above; the yards' set gives the field the
 * same relief (RACK_RELIEFS in world/yard), so it collides as this very ground.
 */
export function phobosGround(half: THREE.Vector3): THREE.Group {
  const cells = Math.round((half.x * 2) / CELL);
  const geometry = new THREE.PlaneGeometry(half.x * 2, half.z * 2, cells, cells);
  // laid flat: the plane's y into -z
  geometry.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, Math.min(half.y, groundRelief(position.getX(i), position.getZ(i))));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(groundUv(geometry), groundMaterial(PHOBOS_TINT, PHOBOS_GLOW, 0.04));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

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
