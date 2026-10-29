import { describe, expect, it } from 'vitest';
import { normalPixels, windingHeights } from './surfaces';

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

describe("a coil's windings baked as a normal map", () => {
  const size = 64;
  const turns = 8;
  const pitch = size / turns;
  const strap = size / 8;
  const map = normalPixels(windingHeights(size, turns, strap / size), size, 3);
  /** The texture coordinate v of the middle of a canvas row, as the GPU reads it (first row at v = 1). */
  const v = (row: number) => 1 - (row + 0.5) / size;

  it('rounds every turn: its crown faces straight out, its flanks lean away from it across the turns', () => {
    for (let turn = 0; turn < turns; turn++) {
      const crown = turn * pitch + pitch / 2;
      const top = sample(map, size, 0.5, v(crown - 0.5));
      expect(Math.abs(top[1])).toBeLessThan(0.35);
      expect(top[2]).toBeGreaterThan(0.9);
      // the flank lower on the canvas lies lower in v: it rises towards the crown, so it leans back along -v
      expect(sample(map, size, 0.5, v(crown + pitch / 4 - 0.5))[1]).toBeLessThan(-0.2);
      expect(sample(map, size, 0.5, v(crown - pitch / 4 - 1.5))[1]).toBeGreaterThan(0.2);
      // along a turn (u) the wire is straight
      expect(Math.abs(sample(map, size, 0.5, v(crown + pitch / 4 - 0.5))[0])).toBeLessThan(0.01);
    }
  });

  it('lays the clamp strap flat across the turns, its edges beveled', () => {
    for (let row = 0; row < size; row++) {
      const [x, y, z] = sample(map, size, strap / 2 / size, v(row));
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
      expect(z).toBeGreaterThan(0.99);
    }
    // between two turns, its rising edge leans back along -u, its falling edge along +u
    expect(sample(map, size, 0.5 / size, v(pitch))[0]).toBeLessThan(-0.1);
    expect(sample(map, size, (strap - 0.5) / size, v(pitch))[0]).toBeGreaterThan(0.1);
  });
});
