import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assignTints, botTint, SOVEREIGN_TINT, TINTS } from './tints';
import { BOT_NAMES } from '../music/lines';

/** Hue (degrees), saturation and lightness of a hex color. */
function hsl(hex: string) {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(out, THREE.SRGBColorSpace);
  return { hue: out.h * 360, saturation: out.s, lightness: out.l };
}

/** How far apart two hues lie on the color wheel (degrees). */
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('the palette of tints', () => {
  it('is bright and saturated, so every tint reads on black space', () => {
    for (const { hex } of TINTS) {
      const { saturation, lightness } = hsl(hex);
      expect(saturation, hex).toBeGreaterThanOrEqual(0.9);
      expect(lightness, hex).toBeGreaterThanOrEqual(0.55);
      expect(lightness, hex).toBeLessThanOrEqual(0.75);
    }
  });

  it("keeps clear of the sides' orange, the HUD's azure, the red of danger and each other", () => {
    const hues = TINTS.map(({ hex }) => hsl(hex).hue);
    for (const hue of hues) {
      expect(apart(hue, 37)).toBeGreaterThanOrEqual(25);
      expect(apart(hue, 217)).toBeGreaterThanOrEqual(25);
      expect(apart(hue, 0)).toBeGreaterThanOrEqual(20);
    }
    for (let a = 0; a < hues.length; a++) for (let b = a + 1; b < hues.length; b++) expect(apart(hues[a], hues[b])).toBeGreaterThanOrEqual(25);
    // neighbors in the list are neighbors on the wheel
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeGreaterThan(hues[i - 1]);
  });

  it("leaves the Sovereign's ivory to the Sovereign: far lighter than every tint", () => {
    expect(hsl(SOVEREIGN_TINT).lightness).toBeGreaterThanOrEqual(0.85);
    expect(TINTS.map(({ hex }) => hex)).not.toContain(SOVEREIGN_TINT);
  });

  it('gives every bot its own tint, the same on every browser', () => {
    expect(new Set(BOT_NAMES.map(botTint)).size).toBe(BOT_NAMES.length);
    expect(botTint('Sparring bot')).toBe(botTint('Sparring bot'));
  });
});

describe('the tints of the Hosts in a round', () => {
  it('gives each Host its choice while it is free', () => {
    expect(assignTints([0, 3, 7])).toEqual([0, 3, 7]);
  });

  it('gives a Host who joined later the nearest free tint, the next one up first', () => {
    expect(assignTints([3, 3])).toEqual([3, 4]);
    expect(assignTints([3, 4, 3])).toEqual([3, 4, 2]);
    expect(assignTints([7, 7])).toEqual([7, 0]);
  });

  it('lets a Host keep its choice once every tint is taken', () => {
    const all = TINTS.map((_, i) => i);
    expect(assignTints([...all, 5])).toEqual([...all, 5]);
  });
});
