/**
 * Smooth 3D value noise in [-1, 1]. It uses integer hashing and polynomial blending only,
 * no transcendental functions, so every browser computes exactly the same shapes.
 */
export class Noise {
  constructor(private readonly seed: number) {}

  private lattice(x: number, y: number, z: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h & 0xffff) / 32767.5 - 1;
  }

  /** Written out without helper closures (the bakes call it millions of times); the arithmetic is the plain trilinear blend of the quintic fade. */
  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const x1 = xi + 1, y1 = yi + 1, z1 = zi + 1;
    const n000 = this.lattice(xi, yi, zi), n100 = this.lattice(x1, yi, zi);
    const n010 = this.lattice(xi, y1, zi), n110 = this.lattice(x1, y1, zi);
    const n001 = this.lattice(xi, yi, z1), n101 = this.lattice(x1, yi, z1);
    const n011 = this.lattice(xi, y1, z1), n111 = this.lattice(x1, y1, z1);
    const a00 = n000 + (n100 - n000) * u, a10 = n010 + (n110 - n010) * u;
    const a01 = n001 + (n101 - n001) * u, a11 = n011 + (n111 - n011) * u;
    const b0 = a00 + (a10 - a00) * v, b1 = a01 + (a11 - a01) * v;
    return b0 + (b1 - b0) * w;
  }

  /** Fractal noise: octaves of halving size and amplitude. Ridged noise gives sharp crests. */
  fractal(x: number, y: number, z: number, octaves: number, ridged = false): number {
    let sum = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      const s = this.sample(x * frequency, y * frequency, z * frequency);
      sum += amplitude * (ridged ? 1 - 2 * Math.abs(s) : s);
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum;
  }

  /**
   * The least and the most `fractal` (not ridged) can be anywhere in the box [x0, x1] × [y0, y1] ×
   * [z0, z1], written into `out`: each octave's sample is a blend of the eight lattice values at
   * the corners of its lattice cell with weights between 0 and 1 (the quintic fade of a fraction
   * in [0, 1)), so it lies between the least and the most lattice value of the cells the box's
   * points fall in, scaled by the octave's amplitude. The lattice cells are found by flooring the
   * corners times the octave's frequency, computed as fractal computes it: the product and the
   * floor never decrease, so every point's cell lies among them. A box too large to list its
   * lattice for an octave takes the whole [-1, 1] there. Within that, a small box is held closer
   * by the sample's slope about its middle (see SLOPE). For a world's ground's ceiling (see
   * world/ceiling).
   */
  fractalRange(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, octaves: number, out: { lo: number; hi: number }): { lo: number; hi: number } {
    let lo = 0, hi = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      const xa = Math.floor(x0 * frequency), xb = Math.floor(x1 * frequency) + 1;
      const ya = Math.floor(y0 * frequency), yb = Math.floor(y1 * frequency) + 1;
      const za = Math.floor(z0 * frequency), zb = Math.floor(z1 * frequency) + 1;
      let least = 1, most = -1;
      if (x0 === x1 && z0 === z1 && yb - ya <= LATTICE_LIMIT) {
        // along y alone: within a lattice cell the sample is a blend of two fixed values by the
        // fade of y's fraction, which never falls, so its extremes lie at the ends of each cell's
        // stretch; at a cell's edge both cells give the same value
        const x = x0 * frequency, z = z0 * frequency;
        const from = y0 * frequency, to = y1 * frequency;
        for (let y = ya; y < yb; y++) {
          const start = this.sample(x, Math.max(from, y), z);
          const end = this.sample(x, Math.min(to, y + 1), z);
          least = Math.min(least, start, end);
          most = Math.max(most, start, end);
        }
      } else if ((xb - xa + 1) * (yb - ya + 1) * (zb - za + 1) > LATTICE_LIMIT) {
        least = -1;
        most = 1;
      } else {
        for (let x = xa; x <= xb; x++) {
          for (let y = ya; y <= yb; y++) {
            for (let z = za; z <= zb; z++) {
              const n = this.lattice(x, y, z);
              if (n < least) least = n;
              if (n > most) most = n;
            }
          }
        }
      }
      // and by its slope from the box's middle: along each axis the sample changes by at most the
      // fade's steepest (1.875) times the largest difference of two lattice values (2) per
      // lattice cell, so by no more than SLOPE times the half sides (in lattice cells) summed
      const middle = this.sample(((x0 + x1) / 2) * frequency, ((y0 + y1) / 2) * frequency, ((z0 + z1) / 2) * frequency);
      const reach = SLOPE * frequency * ((x1 - x0) / 2 + (y1 - y0) / 2 + (z1 - z0) / 2);
      least = Math.max(least, middle - reach);
      most = Math.min(most, middle + reach);
      lo += amplitude * least;
      hi += amplitude * most;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    out.lo = lo;
    out.hi = hi;
    return out;
  }
}

/** The most lattice points fractalRange lists for one octave before it takes the whole range. */
const LATTICE_LIMIT = 4096;
/** The steepest a sample can change along one axis, per lattice cell: the quintic fade's steepest slope (30 t² (1 − t)² at t = ½) times the widest gap between two lattice values. */
const SLOPE = 1.875 * 2;
