import { describe, expect, it } from 'vitest';
import { normalPixels } from './surfaces';

/** A gray canvas of `size` pixels, its height at each pixel from `height(column, row)` (0..255). */
function heights(size: number, height: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.fill(height(x, y), (y * size + x) * 4, (y * size + x) * 4 + 3);
  return data;
}

/**
 * The normal at texture coordinates (u, v) as the GPU reads it: a canvas texture is flipped on
 * upload (its first row at v = 1), and each channel decodes from 0..255 to -1..1.
 */
function sample(map: Uint8ClampedArray, size: number, u: number, v: number) {
  const x = Math.floor(u * size);
  const y = Math.floor((1 - v) * size);
  const i = (y * size + x) * 4;
  return [map[i], map[i + 1], map[i + 2]].map((c) => (c / 255) * 2 - 1);
}

describe('the armor relief baked as a normal map', () => {
  const size = 16;

  it('stands straight out of a flat surface', () => {
    const [x, y, z] = sample(normalPixels(heights(size, () => 128), size, 6), size, 0.5, 0.5);
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(y)).toBeLessThan(0.01);
    expect(z).toBeGreaterThan(0.99);
  });

  it('tilts against a slope rising along u, and against one rising along v', () => {
    const alongU = sample(normalPixels(heights(size, (x) => 100 + x * 4), size, 6), size, 0.5, 0.5);
    expect(alongU[0]).toBeLessThan(-0.1);
    expect(Math.abs(alongU[1])).toBeLessThan(0.01);
    // rising along v is rising up the canvas, towards its first row
    const alongV = sample(normalPixels(heights(size, (_, y) => 160 - y * 4), size, 6), size, 0.5, 0.5);
    expect(alongV[1]).toBeLessThan(-0.1);
    expect(Math.abs(alongV[0])).toBeLessThan(0.01);
  });

  it('is of unit length and wraps around the tile, so a groove on its edge is a groove', () => {
    // a groove along the first column: both its sides tilt in towards it, across the tile's edge
    const map = normalPixels(heights(size, (x) => (x === 0 ? 40 : 128)), size, 6);
    const left = sample(map, size, (size - 1 + 0.5) / size, 0.5);
    const right = sample(map, size, 1.5 / size, 0.5);
    expect(left[0]).toBeGreaterThan(0.1);
    expect(right[0]).toBeLessThan(-0.1);
    for (const n of [left, right]) expect(Math.hypot(...n)).toBeCloseTo(1, 1);
  });
});
