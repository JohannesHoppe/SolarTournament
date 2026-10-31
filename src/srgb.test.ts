import { describe, expect, it } from 'vitest';
import { srgbByte } from './srgb';

describe('srgbByte', () => {
  it('maps black, white and the standard mid-points', () => {
    expect(srgbByte(0)).toBe(0);
    expect(srgbByte(1)).toBe(255);
    expect(srgbByte(0.2140411)).toBe(128); // sRGB 0.5
    expect(srgbByte(0.001)).toBe(3); // the linear toe: 12.92 per unit
  });

  it('clamps what lies outside 0 to 1', () => {
    expect(srgbByte(-3)).toBe(0);
    expect(srgbByte(7)).toBe(255);
  });

  it('rises with the light', () => {
    let last = -1;
    for (let i = 0; i <= 1000; i++) {
      const byte = srgbByte(i / 1000);
      expect(byte).toBeGreaterThanOrEqual(last);
      last = byte;
    }
  });
});
