import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { horizonMesh } from './horizon';
import { Noise } from './noise';
import { FLUX_AT, FLUX_RADIUS, GROUND_HALF, groundRelief, LAND, PATERA, PATERA_RADIUS, PIT_FLOOR, surfaceHeight } from './io';

/**
 * How Flux on Io looks (where things are in world/io): the ground of the field as the piece it
 * collides as (its relief, see Relief), the crater floor's photograph tinted to Io's sulfur
 * yellow; the lava lake glowing on the patera's floor; the flux tube, a column of faint violet
 * light up into the sky; and the plains beyond, in patches of yellow, orange, white and black,
 * drawn behind everything.
 */

/** Io's sulfur: pale yellow, lit faintly by Jupiter's glow and the lava's. */
const IO_TINT = 0xf2e2a0;
const IO_GLOW = 0x2a2214;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/io gives (see reliefGround). */
export const ioGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, IO_TINT, IO_GLOW);

/** The lava lake: a crust of dark rock cracked over molten lava, glowing orange through the cracks; a disk on the patera's floor, a little short of its rim. */
const LAVA_GLOW = new THREE.Color(1, 0.36, 0.08).multiplyScalar(1.6);
const LAKE_SHARE = 0.85;
/** The flux tube's glow: violet, faint, its column some 20 km tall, a brighter core within. */
const FLUX_COLOR = new THREE.Color(0.55, 0.3, 1);
const FLUX_HEIGHT = 400000;

/** Io's colors beyond the field: sulfur yellow, orange and white, with black lava flows, in patches. */
const SULFUR = new THREE.Color(0.48, 0.42, 0.18);
const ORANGE = new THREE.Color(0.45, 0.24, 0.08);
const FROST = new THREE.Color(0.55, 0.54, 0.48);
const BASALT = new THREE.Color(0.05, 0.04, 0.035);
const patches = new Noise(7008);
const flows = new Noise(7009);

/** The patera's lava lake and the flux tube, in the field. */
export function fluxScenery(): THREE.Group {
  const group = new THREE.Group();
  // the lake: a cracked crust drawn as a disk whose glow comes through the cracks (a noise texture of veins)
  const cracks = lakeTexture();
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(PATERA_RADIUS * LAKE_SHARE, 64),
    new THREE.MeshBasicMaterial({ map: cracks, color: LAVA_GLOW, toneMapped: false }),
  );
  lake.geometry.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  lake.position.set(PATERA.x, PIT_FLOOR + 20, PATERA.z);
  group.add(lake);
  // the tube: two nested columns, additive, faint, never written to the depth so the field shows through
  for (const [share, strength] of [
    [1, 0.025],
    [0.35, 0.06],
  ] as const) {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(FLUX_RADIUS * share, FLUX_RADIUS * share, FLUX_HEIGHT, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: FLUX_COLOR.clone().multiplyScalar(strength), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    column.position.set(FLUX_AT.x, LAND + FLUX_HEIGHT / 2, FLUX_AT.z);
    column.userData.shadowless = true;
    group.add(column);
  }
  return group;
}

/** The lava lake's crust: dark plates, the glow coming through the cracks between them (white where it shows, multiplied by the lake's color). */
function lakeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const veins = new Noise(7010);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // a ridged noise is near 1 along its ridges: the cracks
      const ridge = veins.fractal(x / 24, 0.5, y / 24, 3, true);
      const glow = Math.max(0, Math.min(1, (ridge - 0.55) * 4));
      const shade = Math.round(255 * (0.06 + 0.94 * glow));
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The plains beyond the field's ground, from 3.4 km out to their horizon some 25 km away, drawn behind everything. */
export function io(): THREE.Group {
  const surface = horizonMesh({
    rings: 140,
    spokes: 360,
    first: GROUND_HALF.x * 0.85,
    reach: 25 * 20000,
    height: surfaceHeight,
    paint: (x, z, color) => {
      const p = patches.fractal(x / 50000, 0.4, z / 50000, 3);
      color.copy(SULFUR).lerp(p > 0.1 ? ORANGE : FROST, Math.min(1, Math.abs(p) * 2));
      // the black of fresh lava flows in long tongues
      const flow = flows.fractal(x / 120000, 0.6, z / 20000, 3);
      if (flow > 0.35) color.lerp(BASALT, Math.min(1, (flow - 0.35) * 5));
    },
    glow: IO_GLOW,
  });
  return new THREE.Group().add(surface, fluxScenery());
}
