import * as THREE from 'three';
import { Noise } from './noise';
import { groundMaterial, groundUv, withCollider } from './boneyard';
import { horizonMesh } from './horizon';
import { RISE, slopeGround, SURFACE_REACH, surfaceHeight, VESTA_GROUND } from './vesta';

/**
 * How Rheasilvia on Vesta looks (where things are in world/vesta): the slope under the claims as
 * the ground they lie on, and Vesta beyond it, the peak's flank falling away to the basin's
 * floor, the rim on the horizon.
 */

/** Vesta's ground: grey basalt dust, a little brown (sRGB, times the ground's photograph and dust), lit faintly by the sunlit flank around it. */
const VESTA_TINT = 0xfff4e4;
const VESTA_GLOW = 0x3a342c;

/** A plane laid flat: its y turned into -z (a quarter turn about x, no trigonometry). */
const FLAT = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

/** How far the slope's own ground reaches (units, 9 km): flat out to FLAT_TO (5.5 km), where it bends into the surface beyond. */
const GROUND_REACH = 180000;
const FLAT_TO = 110000;

/**
 * The slope under the claims, as the ground's piece shows it (its box's half extents `half`, the
 * ground on its top): flat as far as its solid box reaches under the field, bending beyond into
 * Vesta's surface as the scenery draws it, so the two meet; in the crater floor's three layers
 * of ground, tinted to Vesta's basalt.
 */
export function vestaGround(half: THREE.Vector3): THREE.Group {
  const geometry = new THREE.PlaneGeometry(GROUND_REACH * 2, GROUND_REACH * 2, 240, 240).applyMatrix4(FLAT);
  const position = geometry.getAttribute('position');
  // built where it lies in the place, then taken into its leaning box's own frame
  const box = slopeGround(0);
  const intoBox = new THREE.Matrix4().compose(box.position, box.orientation, new THREE.Vector3(1, 1, 1)).invert();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const bend = THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), FLAT_TO, GROUND_REACH);
    const flank = VESTA_GROUND + RISE * x;
    position.setXYZ(i, ...point.set(x, flank + (surfaceHeight(x, z) - flank) * bend, z).applyMatrix4(intoBox).toArray());
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(groundUv(geometry), groundMaterial(VESTA_TINT, VESTA_GLOW, 0.05));
  mesh.receiveShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

/** Vesta's colors: grey basalt with a little brown, darker eucrite on the basin's floor, a pale streak of fresh dust down the peak's flank. */
const BASALT = new THREE.Color(0.2, 0.185, 0.165);
const DARK = new THREE.Color(0.14, 0.13, 0.115);
const PALE = new THREE.Color(0.28, 0.265, 0.24);
const tone = new Noise(2003);

/**
 * Vesta beyond the slope, drawn behind everything (whatever flies is drawn over it): its surface
 * from 6 km out to SURFACE_REACH (see surfaceHeight), lit by the sun, its color varying in broad
 * patches; scenery only.
 */
export function vesta(): THREE.Group {
  return new THREE.Group().add(
    horizonMesh({
      rings: 160,
      spokes: 360,
      first: 120000,
      reach: SURFACE_REACH,
      height: surfaceHeight,
      paint: (x, z, color) => {
        const patch = 0.5 + 0.5 * tone.fractal(x / 400000, 0.5, z / 400000, 4);
        const streak = Math.max(0, 1 - Math.abs(z) / 60000) * Math.max(0, Math.min(1, -x / 400000)) * 0.5;
        color.copy(BASALT).lerp(DARK, patch * 0.7).lerp(PALE, streak);
      },
      glow: VESTA_GLOW,
    }),
  );
}
