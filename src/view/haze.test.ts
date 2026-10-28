import { describe, expect, it } from 'vitest';
import { HAZE_UNIFORMS } from './haze';

/**
 * The clouds' noise texture read back as the GPU reads it (see CLOUD_GLSL): bilinear between
 * texel centers, wrapping around, its two channels two layers of one 3D noise.
 */
const texture = HAZE_UNIFORMS.hazeNoise.value;
const size = texture.image.width;
const data = texture.image.data as Uint8Array;
const texel = (x: number, y: number, channel: number) => data[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4 + channel] / 255;
/** The texture at `u`, `v` in texels (texel centers at whole numbers), one channel, linearly filtered. */
const sample = (u: number, v: number, channel: number) => {
  const x = Math.floor(u);
  const y = Math.floor(v);
  const sx = u - x;
  const sy = v - y;
  const top = texel(x, y, channel) * (1 - sx) + texel(x + 1, y, channel) * sx;
  const bottom = texel(x, y + 1, channel) * (1 - sx) + texel(x + 1, y + 1, channel) * sx;
  return top * (1 - sy) + bottom * sy;
};
/** hazeNoise3 as the shader computes it. */
const noise = (x: number, y: number, z: number) => {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const pz = Math.floor(z);
  const ease = (s: number) => s * s * (3 - 2 * s);
  const sx = ease(x - px);
  const sy = ease(y - py);
  const sz = ease(z - pz);
  const u = px + 37 * pz + sx;
  const v = py + 17 * pz + sy;
  return sample(u, v, 1) + (sample(u, v, 0) - sample(u, v, 1)) * sz;
};

describe("the haze's clouds", () => {
  it('read one 3D noise from the texture, without a seam between its layers', () => {
    for (const [x, y] of [[3.3, 7.8], [120.6, 4.1], [250.9, 255.5], [-17.2, 40.4]]) {
      for (let z = -3; z <= 5; z++) expect(noise(x, y, z - 1e-6)).toBeCloseTo(noise(x, y, z + 1e-6), 4);
    }
  });

  it('vary between light and dark, the same on every browser', () => {
    const values = Array.from({ length: 400 }, (_, i) => noise(i * 0.37, i * 0.61, i * 0.23));
    expect(Math.min(...values)).toBeLessThan(0.25);
    expect(Math.max(...values)).toBeGreaterThan(0.75);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});
