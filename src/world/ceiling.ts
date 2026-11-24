import type * as THREE from 'three';
import { cos, sin } from '../detmath';

/**
 * A world's ground's ceiling: a bound that no point of the ground (see Relief in world/asteroids)
 * rises over, for every cell of a grid over its footprint, and for every 2 × 2 of them, 4 × 4 and
 * so on up to one over all of it (a max-height pyramid). A ray marched over the ground (see
 * reliefRay) asks it at each step before it samples the ground: where the ray runs above the
 * bound of a cell the point lies in, the ground there cannot reach it, and the sample is left
 * out. The answer is the very one the sample would give, so every ray meets the ground at the
 * same step and the same point as without it; only the samples high above the ground are saved.
 *
 * That holds only while every bound lies over the ground everywhere in its cell. A world's
 * ceiling function (`Ceiling`) is therefore never found by sampling: it is reckoned over the
 * cell's rectangle term by term from the height function's own terms, each by how it can grow
 * there (interval arithmetic): a term that only rises with its argument at the argument's
 * largest value, a raised cosine at the argument nearest its middle, a noise by the lattice
 * values its cells blend (see Noise.fractalRange), a sine by its slope, a product of terms that
 * never fall below zero by the product of their bounds, a blend of two values by the larger of
 * the blends at the share's ends, a minimum of terms by the least of their bounds. Each rectangle
 * is widened by CELL_SLACK before it is reckoned and each bound raised by CEILING_MARGIN, far
 * beyond any rounding of the height function or of the cell a point is looked up in.
 */

/** A world's ground's ceiling over the rectangle [x0, x1] × [z0, z1] (its relief's coordinates): no point of the ground there lies higher. */
export type Ceiling = (x0: number, z0: number, x1: number, z1: number) => number;

/** The finest cells of the pyramid (units, 40 m): four steps of a ray's march (see reliefRay). */
const CEILING_CELL = 800;
/** How far each cell's rectangle is widened before its ceiling is reckoned (units, 5 cm): a point on a cell's edge looked up in its neighbour by rounding still lies in the rectangle reckoned. */
const CELL_SLACK = 1;
/** How far each bound is raised over the ceiling reckoned (units, 5 cm): the height function's rounding is some 10⁻⁹ of that. */
const CEILING_MARGIN = 1;
/** The most cells `highest` reads on one level (see Pyramid.highest): a ship's sphere covers four of the finest at most, a wide reach is read a level or more up. */
const HIGHEST_CELLS = 16;

/**
 * The column (or row) of a level's cells of `size` that a coordinate `at` falls in, over a
 * footprint reaching `halfExtent` either way with `count` cells across, a coordinate beyond it
 * taken at its edge: the one lookup above, highest and finest share, so the bound a sphere reads
 * (highest) comes from the very cells a ray's steps find (above).
 */
const cellOf = (at: number, halfExtent: number, size: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor((at + halfExtent) / size)));

/** The pyramid of a ground's ceiling: its levels' bounds, finest first, each level half as many cells either way as the one before. */
export class Pyramid {
  private readonly levels: Float64Array[] = [];
  private readonly columns: number[] = [];
  private readonly rows: number[] = [];
  private readonly sizes: number[] = [];
  /** The cell the last point found the ray above (see above), and its bound. */
  private x0 = 0;
  private x1 = -1;
  private z0 = 0;
  private z1 = -1;
  private bound = Infinity;

  constructor(
    ceiling: Ceiling,
    readonly half: THREE.Vector3,
  ) {
    let columns = Math.max(1, Math.ceil((2 * half.x) / CEILING_CELL));
    let rows = Math.max(1, Math.ceil((2 * half.z) / CEILING_CELL));
    const finest = new Float64Array(columns * rows);
    for (let j = 0; j < rows; j++) {
      const z0 = -half.z + j * CEILING_CELL;
      for (let i = 0; i < columns; i++) {
        const x0 = -half.x + i * CEILING_CELL;
        // over the box's top no ground reaches (see reliefRay)
        finest[j * columns + i] = Math.min(half.y, ceiling(x0 - CELL_SLACK, z0 - CELL_SLACK, x0 + CEILING_CELL + CELL_SLACK, z0 + CEILING_CELL + CELL_SLACK) + CEILING_MARGIN);
      }
    }
    let level = finest;
    let size = CEILING_CELL;
    for (;;) {
      this.levels.push(level);
      this.columns.push(columns);
      this.rows.push(rows);
      this.sizes.push(size);
      if (columns === 1 && rows === 1) break;
      const up = Math.ceil(columns / 2);
      const upRows = Math.ceil(rows / 2);
      const coarser = new Float64Array(up * upRows).fill(-Infinity);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
          const k = (j >> 1) * up + (i >> 1);
          coarser[k] = Math.max(coarser[k], level[j * columns + i]);
        }
      }
      level = coarser;
      columns = up;
      rows = upRows;
      size *= 2;
    }
  }

  /**
   * Whether a point at height `y` over (x, z) (in the footprint, its relief's coordinates) lies
   * above the ground's ceiling there: then the ground cannot reach it. The cell asked last is
   * tried first (a ray's steps mostly stay in it), then the pyramid from its top down, taking the
   * largest cell whose bound lies below the point.
   */
  above(x: number, y: number, z: number): boolean {
    if (y > this.bound && x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1) return true;
    const half = this.half;
    for (let k = this.levels.length - 1; k >= 0; k--) {
      const size = this.sizes[k];
      const columns = this.columns[k];
      const i = cellOf(x, half.x, size, columns);
      const j = cellOf(z, half.z, size, this.rows[k]);
      const bound = this.levels[k][j * columns + i];
      if (y > bound) {
        this.bound = bound;
        this.x0 = -half.x + i * size;
        this.x1 = this.x0 + size;
        this.z0 = -half.z + j * size;
        this.z1 = this.z0 + size;
        return true;
      }
    }
    return false;
  }

  /**
   * A bound no point of the ground rises over anywhere in the rectangle [x0, x1] × [z0, z1] (its
   * relief's coordinates; a point beyond the footprint taken at its edge): the most of the finest
   * cells it covers, or of the cells of the first level up where it covers no more than
   * HIGHEST_CELLS of them. Every point of the rectangle lies in one of those cells as `above`
   * finds them (the cell of a point never lies before the cell of a point before it), and a
   * coarser cell's bound holds its finer cells' (see reliefContact).
   */
  highest(x0: number, z0: number, x1: number, z1: number): number {
    const columns = this.columns[0];
    const rows = this.rows[0];
    const half = this.half;
    let i0 = cellOf(x0, half.x, CEILING_CELL, columns);
    let i1 = cellOf(x1, half.x, CEILING_CELL, columns);
    let j0 = cellOf(z0, half.z, CEILING_CELL, rows);
    let j1 = cellOf(z1, half.z, CEILING_CELL, rows);
    // a level's cell holds the finer cells 2i and 2i + 1 of the level below
    let k = 0;
    while ((i1 - i0 + 1) * (j1 - j0 + 1) > HIGHEST_CELLS && k + 1 < this.levels.length) {
      k++;
      i0 >>= 1;
      i1 >>= 1;
      j0 >>= 1;
      j1 >>= 1;
    }
    const level = this.levels[k];
    const across = this.columns[k];
    let most = -Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) most = Math.max(most, level[j * across + i]);
    return most;
  }

  /** The bound of the finest cell over (x, z), for the tests. */
  finest(x: number, z: number): number {
    const columns = this.columns[0];
    const i = cellOf(x, this.half.x, CEILING_CELL, columns);
    const j = cellOf(z, this.half.z, CEILING_CELL, this.rows[0]);
    return this.levels[0][j * columns + i];
  }
}

/** The pyramid of each ground's relief with a ceiling, built once. */
const pyramids = new WeakMap<Ceiling, Pyramid>();

/** The pyramid of a ground's ceiling over a box of half extents `half`, built the first time it is asked for. */
export function pyramidOf(ceiling: Ceiling, half: THREE.Vector3): Pyramid {
  let pyramid = pyramids.get(ceiling);
  if (!pyramid || !pyramid.half.equals(half)) {
    pyramid = new Pyramid(ceiling, half.clone());
    pyramids.set(ceiling, pyramid);
  }
  return pyramid;
}

/** The least |d| for d in [lo, hi]. */
export const absLow = (lo: number, hi: number) => (lo > 0 ? lo : hi < 0 ? -hi : 0);
/** The most |d| for d in [lo, hi]. */
export const absHigh = (lo: number, hi: number) => Math.max(-lo, hi);

/** The least and the most of a * x + b * z over the rectangle (a plane's extremes lie on its corners). */
export const planeLow = (x0: number, z0: number, x1: number, z1: number, a: number, b: number) => a * (a > 0 ? x0 : x1) + b * (b > 0 ? z0 : z1);
export const planeHigh = (x0: number, z0: number, x1: number, z1: number, a: number, b: number) => a * (a > 0 ? x1 : x0) + b * (b > 0 ? z1 : z0);

/** The least and the most distance from (px, pz) to a point of the rectangle. */
export function distanceLow(x0: number, z0: number, x1: number, z1: number, px: number, pz: number): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
  return Math.sqrt(dx * dx + dz * dz);
}
export function distanceHigh(x0: number, z0: number, x1: number, z1: number, px: number, pz: number): number {
  const dx = Math.max(Math.abs(px - x0), Math.abs(px - x1));
  const dz = Math.max(Math.abs(pz - z0), Math.abs(pz - z1));
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * The least and the most of `amplitude` × sin(`rate` × z + `phase`) for z in [z0, z1]: the sine
 * moves by no more than its slope's bound (amplitude × rate) times the distance from the middle,
 * and never past its amplitude.
 */
export function sineLow(z0: number, z1: number, amplitude: number, rate: number, phase = 0): number {
  return Math.max(-amplitude, amplitude * sin(rate * ((z0 + z1) / 2) + phase) - amplitude * rate * ((z1 - z0) / 2));
}
export function sineHigh(z0: number, z1: number, amplitude: number, rate: number, phase = 0): number {
  return Math.min(amplitude, amplitude * sin(rate * ((z0 + z1) / 2) + phase) + amplitude * rate * ((z1 - z0) / 2));
}

/** The least of cos(`rate` × u) for u in [lo, hi]: −1 where the range holds a trough of it (an odd multiple of π), else the lesser of its ends (between two troughs it rises, then falls). */
export function cosineLow(lo: number, hi: number, rate: number): number {
  const a = rate * lo;
  const b = rate * hi;
  const trough = Math.PI * (2 * Math.ceil((a - Math.PI) / (2 * Math.PI)) + 1);
  return trough <= b ? -1 : Math.min(cos(a), cos(b));
}

/** The least a moon's curve of `radius` lowers its ground over the rectangle: at the point nearest the field's middle. */
export function curveLow(x0: number, z0: number, x1: number, z1: number, radius: number): number {
  const x = absLow(x0, x1);
  const z = absLow(z0, z1);
  return (x * x + z * z) / (2 * radius);
}

/** The larger of a blend a × (1 − s) + b × s for s at either end of [s0, s1] (a blend is linear in its share, so its most lies at an end). */
export const blendHigh = (a: number, b: number, s0: number, s1: number) => Math.max(a + (b - a) * s0, a + (b - a) * s1);

/** A scratch range for the ceilings' terms. */
export interface Span {
  lo: number;
  hi: number;
}
