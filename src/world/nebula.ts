import * as THREE from 'three';
import { canvas, toTexture } from '../view/textures';
import type { Grade } from '../view/grade';

/**
 * A cloud of the sky's nebulae, drawn as a glowing sprite at infinity: towards `at` (a
 * direction, need not be unit length), in `color` (linear, its brightness included), `size`
 * units wide at the sky's distance, of cloud shape `shape` (see CLOUD_SHAPES) turned by `turn`
 * (rad).
 */
export interface Nebula {
  at: readonly [number, number, number];
  color: readonly [number, number, number];
  size: number;
  shape: number;
  turn: number;
}

/**
 * An arena's light and color mood, set around its landmark: the color of space where nothing is
 * drawn, the sky's faint light from all around (from above `sky`, from below `ground`, this
 * `ambient` strong; with `sunward`, from the sun's side `sky` and from the far side `ground`), its nebulae, how bright its stars show (1 in the dark; a near sun's glare
 * drowns them), the tint of the dust that streaks past, and the picture's color grade. With
 * `starmap` its sky is the real one (see world/starmap): an arena in the solar system sees the
 * stars and the Milky Way that Earth sees; without, its stars are generated in code.
 */
export interface Mood {
  space: number;
  sky: number;
  ground: number;
  ambient: number;
  sunward?: boolean;
  nebulae: readonly Nebula[];
  stars: number;
  starmap: boolean;
  dust: readonly [number, number, number];
  grade: Grade;
}

/** The most nebulae an arena's sky has: each is a sprite drawn over much of the sky, so few keep it cheap on a phone. */
export const MAX_NEBULAE = 4;
/** The number of cloud shapes the nebulae are drawn from. */
export const CLOUD_SHAPES = 3;
/** The edge of a cloud's texture (px): the clouds are soft, so it may be magnified many times. */
const CLOUD_SIZE = 256;
/** The coarsest and the finest detail of a cloud, in cells across its texture. */
const CLOUD_COARSE = 3;
const CLOUD_OCTAVES = 5;

/** Integer hash of a lattice point and a seed, to 0..1. */
function lattice(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise of a seed at (x, y), 0 to 1 (the soft clouds of this file and of world/mining are made of it). */
export function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => lattice(i, j, seed);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/**
 * A cloud of shape `seed`: billowing noise, thinning out towards the texture's edge and torn
 * into wisps and dark lanes, grey on black (its color comes from the sprite). Built once per
 * shape from integer hashes, the same on every load.
 */
export function cloudTexture(seed: number): THREE.CanvasTexture {
  const [element, ctx] = canvas(CLOUD_SIZE);
  const image = ctx.createImageData(CLOUD_SIZE, CLOUD_SIZE);
  for (let y = 0; y < CLOUD_SIZE; y++) {
    for (let x = 0; x < CLOUD_SIZE; x++) {
      const u = x / CLOUD_SIZE;
      const v = y / CLOUD_SIZE;
      let sum = 0;
      let weight = 0;
      let amplitude = 1;
      let cells = CLOUD_COARSE;
      for (let octave = 0; octave < CLOUD_OCTAVES; octave++) {
        sum += noise(u * cells, v * cells, seed * 7 + octave) * amplitude;
        weight += amplitude;
        amplitude *= 0.55;
        cells *= 2;
      }
      const billow = sum / weight;
      // round, thinning towards the edge, the noise pushing its rim in and out
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      // (and gone before the texture's edge, so no sprite shows its square)
      const falloff = THREE.MathUtils.smoothstep(1 - r + (billow - 0.5) * 0.9, 0, 0.75) * (1 - THREE.MathUtils.smoothstep(r, 0.75, 0.98));
      const density = falloff * THREE.MathUtils.smoothstep(billow, 0.32, 0.78) ** 1.5;
      const value = Math.round(255 * density);
      const i = (y * CLOUD_SIZE + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(element);
}
