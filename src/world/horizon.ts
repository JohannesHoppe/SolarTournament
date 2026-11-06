import * as THREE from 'three';
import { cos, exp, log, sin } from '../detmath';

/**
 * The land around a place of the campaign beyond its own near ground (Vesta's basin, Ceres's
 * crater), drawn behind everything that flies: one mesh on a grid of rings and spokes round the
 * field, its rings farther apart the farther out, at the heights and in the colors the place
 * gives, lit by the sun; scenery only.
 */

/** Drawn behind all that flies (clip depth, a share of the way to the far plane), in front of the stars, which it hides. */
const BEHIND_ALL = 0.99999;

/** A material drawn behind all that flies (see BEHIND_ALL), whatever its distance. */
export function behindAll<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n  gl_Position.z = gl_Position.w * ${BEHIND_ALL};`);
  };
  return material;
}

export interface Horizon {
  /** Rings from `first` out to `reach` (units), and spokes round them. */
  rings: number;
  spokes: number;
  first: number;
  reach: number;
  /** The land's height at (x, z), and its color there (written into `color`). */
  height(x: number, z: number): number;
  paint(x: number, z: number, color: THREE.Color): void;
  /** A faint light of the land's own, so its shadow side never goes black. */
  glow: number;
}

/** The land of `horizon` as one mesh, drawn behind everything with what is see-through, after the sky. */
export function horizonMesh(horizon: Horizon): THREE.Mesh {
  const { rings, spokes } = horizon;
  const positions = new Float32Array((rings + 1) * spokes * 3);
  const colors = new Float32Array((rings + 1) * spokes * 3);
  const color = new THREE.Color();
  for (let ring = 0; ring <= rings; ring++) {
    // geometric spacing, the rings farther apart the farther out
    const out = horizon.first * exp((ring / rings) * log(horizon.reach / horizon.first));
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const x = cos(angle) * out;
      const z = sin(angle) * out;
      const k = (ring * spokes + spoke) * 3;
      positions.set([x, horizon.height(x, z), z], k);
      horizon.paint(x, z, color);
      color.toArray(colors, k);
    }
  }
  const index: number[] = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let spoke = 0; spoke < spokes; spoke++) {
      const a = ring * spokes + spoke;
      const b = ring * spokes + ((spoke + 1) % spokes);
      // wound so each face looks up, away from the body
      index.push(a, b, a + spokes, b, b + spokes, a + spokes);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, behindAll(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: horizon.glow, transparent: true, depthWrite: false })));
  surface.renderOrder = -2;
  surface.frustumCulled = false;
  surface.userData.shadowless = true;
  return surface;
}
