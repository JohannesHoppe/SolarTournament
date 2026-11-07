import * as THREE from 'three';
import { cos, exp, log, sin } from '../detmath';
import type { Placement, Relief } from './asteroids';
import { Randomizer } from '../random';

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

/**
 * A cratered plain's craters (the Moon's, Mercury's): `count` bowls seeded from `seed` over a
 * square `reach` on each side of the field's middle, `from` to `to` in radius (units), none within
 * `clear` of the middle; what they add to the ground's height at (x, z): each a bowl a fifth as
 * deep as it is wide, a rim `rim` of its radius high round it, fading out to 1.6 radii.
 */
export function craterField(seed: number, count: number, reach: number, from: number, to: number, clear: number, rim: number): (x: number, z: number) => number {
  const r = new Randomizer(seed);
  const craters = Array.from({ length: count }, () => ({ x: r.range(-reach, reach), z: r.range(-reach, reach), radius: r.range(from, to) })).filter((c) => Math.sqrt(c.x * c.x + c.z * c.z) > clear + c.radius);
  return (x, z) => {
    let height = 0;
    for (const crater of craters) {
      const dx = x - crater.x;
      const dz = z - crater.z;
      const d = Math.sqrt(dx * dx + dz * dz) / crater.radius;
      if (d > 1.6) continue;
      height += d < 1 ? crater.radius * 0.2 * (d * d - 1) + crater.radius * rim * d * d : crater.radius * rim * (1 - (d - 1) / 0.6) * (1 - (d - 1) / 0.6);
    }
    return height;
  };
}

/** The highest `surface` gets over the square of `half` (sampled every 50 m), for a ground box's top. */
export function reliefTop(surface: (x: number, z: number) => number, half: THREE.Vector3): number {
  let top = -Infinity;
  for (let x = -half.x; x <= half.x; x += 1000) for (let z = -half.z; z <= half.z; z += 1000) top = Math.max(top, surface(x, z));
  return top;
}

/**
 * A moon's ground as a piece of the field: a box of half extents `half` whose top is the ground
 * `surface` gives (its `relief`, see Relief), the box's top at `top` (units, over the highest the
 * ground gets there); `placement` sets it as the piece of kind 'rack' of type `type` in the
 * yards' set.
 */
export function reliefPiece(surface: (x: number, z: number) => number, half: THREE.Vector3, top: number): { relief: Relief; placement: (type: number) => Placement } {
  const middle = top - half.y;
  return {
    relief: (x, z) => surface(x, z) - middle,
    placement: (type) => ({ kind: 'rack', type, scale: 1, position: new THREE.Vector3(0, middle, 0), orientation: new THREE.Quaternion(), solid: true, ground: true }),
  };
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

/**
 * A moon beyond its place's field ground (Phobos, Callisto, Europa, Io, Ganymede): its land from
 * 85 % of the ground's half width `half` out to its horizon at `reach` (units), on 140 rings and
 * 360 spokes, at the moon's `height`, in the colors `paint` gives, lit faintly by `glow`; a group
 * the rest of its scenery is added to.
 */
export function moonBeyond(half: number, reach: number, height: Horizon['height'], paint: Horizon['paint'], glow: number): THREE.Group {
  return new THREE.Group().add(horizonMesh({ rings: 140, spokes: 360, first: half * 0.85, reach, height, paint, glow }));
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
