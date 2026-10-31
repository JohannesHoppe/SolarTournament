import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { topsTexture } from './jupiter';

/**
 * The noise of Jupiter's cloud tops (see topsGlsl) read back as the GPU reads it: a texture that
 * repeats, so a texel's neighbor across the edge is the texel on the other side.
 */
const texture = topsTexture();
const size = texture.image.width;
const data = texture.image.data as Uint8Array;
const texel = (x: number, y: number, channel: number) => data[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4 + channel] / 255;

/** The mean step from a texel to its neighbor east, over the columns `xs`. */
const step = (channel: number, xs: number[]) => {
  let sum = 0;
  for (const x of xs) for (let y = 0; y < size; y++) sum += Math.abs(texel(x + 1, y, channel) - texel(x, y, channel));
  return sum / (xs.length * size);
};

describe("Jupiter's cloud tops", () => {
  it('repeat without a seam, east-west and north-south, in every channel', () => {
    const inside = Array.from({ length: 64 }, (_, i) => 32 + i * 3);
    for (let channel = 0; channel < 4; channel++) {
      // across the edge the noise steps on as it does anywhere inside
      expect(step(channel, [size - 1])).toBeLessThan(step(channel, inside) * 1.5 + 0.004);
      let north = 0;
      for (let x = 0; x < size; x++) north += Math.abs(texel(x, 0, channel) - texel(x, size - 1, channel)) / size;
      let within = 0;
      for (let x = 0; x < size; x++) within += Math.abs(texel(x, 101, channel) - texel(x, 100, channel)) / size;
      expect(north).toBeLessThan(within * 1.5 + 0.004);
    }
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('fade to their mean where they are finer than a pixel: mipmapped, each noise channel around 0.5', () => {
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    for (let channel = 0; channel < 3; channel++) {
      let mean = 0;
      for (let i = 0; i < size * size; i++) mean += data[i * 4 + channel] / 255 / (size * size);
      let spread = 0;
      for (let i = 0; i < size * size; i++) spread += (data[i * 4 + channel] / 255 - mean) ** 2 / (size * size);
      expect(mean).toBeCloseTo(0.5, 1);
      expect(Math.sqrt(spread)).toBeGreaterThan(0.1);
      expect(Math.sqrt(spread)).toBeLessThan(0.15);
    }
  });

  it('carry pop-up clouds in about a third of their cells, and the same every time', () => {
    let covered = 0;
    for (let i = 0; i < size * size; i++) if (data[i * 4 + 3] > 0) covered++;
    // a third of the cells, each cloud a round bump over a fraction of its cell
    expect(covered / (size * size)).toBeGreaterThan(0.03);
    expect(covered / (size * size)).toBeLessThan(0.2);
    expect(topsTexture().image.data).toEqual(data);
  });

  it('are the very same texels on every machine', () => {
    expect(createHash('sha256').update(data).digest('hex')).toBe('eb67f76b30e6a9a2d8b4eda941b0264b64fa0866d3f3e554f56b4630697a1f83');
  });
});
