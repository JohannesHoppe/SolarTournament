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
}
