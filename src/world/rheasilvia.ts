import * as THREE from 'three';
import { cos, exp, log, sin } from '../detmath';
import { Noise } from './noise';
import { groundMaterial, groundUv, withCollider } from './boneyard';
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

/** The scenery's grid: rings from the claims out to SURFACE_REACH, closer near them, and as many spokes. */
const RINGS = 160;
const SPOKES = 360;
/** The first ring's distance (units, 6 km): inside it the slope's own ground lies over the scenery. */
const FIRST_RING = 120000;
/** Vesta drawn behind all that flies (clip depth, a share of the way to the far plane), in front of the stars, which it hides. */
const BEHIND_ALL = 0.99999;

/** Vesta's colors: grey basalt with a little brown, darker eucrite on the basin's floor, a pale streak of fresh dust down the peak's flank. */
const BASALT = new THREE.Color(0.2, 0.185, 0.165);
const DARK = new THREE.Color(0.14, 0.13, 0.115);
const PALE = new THREE.Color(0.28, 0.265, 0.24);
const tone = new Noise(2003);

/**
 * Vesta beyond the slope, drawn behind everything (whatever flies is drawn over it): its surface
 * from FIRST_RING out to SURFACE_REACH, on a grid of rings and spokes (see surfaceHeight), lit by the sun, its color varying in broad patches; scenery only.
 */
export function vesta(): THREE.Group {
  const positions = new Float32Array((RINGS + 1) * SPOKES * 3);
  const colors = new Float32Array((RINGS + 1) * SPOKES * 3);
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let ring = 0; ring <= RINGS; ring++) {
    // geometric spacing, the rings farther apart the farther out
    const out = FIRST_RING * exp((ring / RINGS) * log(SURFACE_REACH / FIRST_RING));
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const angle = (spoke / SPOKES) * Math.PI * 2;
      const x = cos(angle) * out;
      const z = sin(angle) * out;
      point.set(x, surfaceHeight(x, z), z);
      const k = (ring * SPOKES + spoke) * 3;
      point.toArray(positions, k);
      const patch = 0.5 + 0.5 * tone.fractal(x / 400000, 0.5, z / 400000, 4);
      const streak = Math.max(0, 1 - Math.abs(z) / 60000) * Math.max(0, Math.min(1, -x / 400000)) * 0.5;
      color.copy(BASALT).lerp(DARK, patch * 0.7).lerp(PALE, streak);
      color.toArray(colors, k);
    }
  }
  const index: number[] = [];
  for (let ring = 0; ring < RINGS; ring++) {
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const a = ring * SPOKES + spoke;
      const b = ring * SPOKES + ((spoke + 1) % SPOKES);
      // wound so each face looks up, away from Vesta
      index.push(a, b, a + SPOKES, b, b + SPOKES, a + SPOKES);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // drawn with what is see-through, after the sky, which it hides
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: VESTA_GLOW, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n  gl_Position.z = gl_Position.w * ${BEHIND_ALL};`);
  };
  const surface = new THREE.Mesh(geometry, material);
  surface.renderOrder = -2;
  surface.frustumCulled = false;
  surface.userData.shadowless = true;
  return new THREE.Group().add(surface);
}
