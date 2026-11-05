import { describe, expect, it } from 'vitest';
import { PORTRAIT_TRIANGLES, portraitModel, PRODUCT_TRIANGLES, PRODUCTS, productModel, productSwing } from './products';
import { CAST_NAMES, type Cast } from '../music/lines';
import { sponsorProducts } from '../game/satire-ads';
import { HOLOGRAM_FPS, STILL_ANGLE, hologramState } from './hologram';

describe("the sponsors' products", () => {
  it('every sponsor presents a product, and no two the same', () => {
    const products = sponsorProducts();
    for (const product of products) expect(PRODUCTS).toContain(product);
    expect(new Set(products).size).toBe(products.length);
  });

  for (const product of PRODUCTS) {
    it(`${product}: built, within a unit box, under its triangle budget, every vertex toned`, () => {
      const model = productModel(product);
      const position = model.attributes.position;
      const triangles = position.count / 3;
      expect(triangles).toBeGreaterThan(100);
      expect(triangles).toBeLessThanOrEqual(PRODUCT_TRIANGLES);
      expect(model.attributes.normal.count).toBe(position.count);
      expect(model.attributes.tone.count).toBe(position.count);
      let largest = 0;
      for (let i = 0; i < position.count * 3; i++) {
        const value = position.array[i];
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThanOrEqual(0.5 + 1e-6);
        largest = Math.max(largest, Math.abs(value));
      }
      // fitted: its largest side is the box's
      expect(largest).toBeGreaterThan(0.499);
      const tone = model.attributes.tone.array;
      for (let i = 0; i < tone.length; i++) expect(tone[i]).toBeGreaterThanOrEqual(0);
      model.dispose();
    });
  }
});

describe("the campaign's people as their holograms show them", () => {
  for (const who of Object.keys(CAST_NAMES) as Cast[]) {
    it(`${who}: a bust within a unit box, under its triangle budget, every vertex toned`, () => {
      const model = portraitModel(who);
      const position = model.attributes.position;
      expect(position.count / 3).toBeGreaterThan(300);
      expect(position.count / 3).toBeLessThanOrEqual(PORTRAIT_TRIANGLES);
      expect(model.attributes.tone.count).toBe(position.count);
      let largest = 0;
      for (let i = 0; i < position.count * 3; i++) largest = Math.max(largest, Math.abs(position.array[i]));
      expect(largest).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(largest).toBeGreaterThan(0.499);
      model.dispose();
    });
  }
});

describe('the hologram', () => {
  it('with reduced motion stands still: no turn, no flicker, no glitch, no drift', () => {
    for (const time of [0, 0.3, 7.77, 123.4]) expect(hologramState(time, true)).toEqual({ angle: STILL_ANGLE, level: 1, glitch: null, scroll: 0 });
  });

  it('otherwise turns, drifts, flickers a little and glitches now and then', () => {
    const frames = 60 * HOLOGRAM_FPS;
    let glitches = 0;
    let dropouts = 0;
    for (let i = 0; i < frames; i++) {
      const state = hologramState(i / HOLOGRAM_FPS, false);
      expect(state.level).toBeGreaterThan(0);
      expect(state.level).toBeLessThanOrEqual(1);
      if (state.level < 0.5) dropouts++;
      if (state.glitch) {
        glitches++;
        expect(state.glitch.high).toBeGreaterThan(state.glitch.low);
        expect(Math.abs(state.glitch.shift)).toBeGreaterThan(0);
      }
    }
    // a glitch now and then, never most of the time
    expect(glitches).toBeGreaterThan(0);
    expect(glitches / frames).toBeLessThan(0.05);
    expect(dropouts / frames).toBeLessThan(0.02);
    expect(hologramState(1, false).angle).not.toBe(hologramState(2, false).angle);
    expect(hologramState(1, false).scroll).toBeLessThan(hologramState(2, false).scroll);
  });

  it('a flat product swings to and fro, its face towards the Host', () => {
    for (const product of PRODUCTS) {
      const swing = productSwing(product);
      if (!swing) continue;
      const angles = Array.from({ length: 200 }, (_, i) => hologramState(i * 0.1, false, swing).angle);
      expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(swing);
      expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(swing);
    }
  });

  it('flickers alike on every call', () => {
    expect(hologramState(12.34, false)).toEqual(hologramState(12.34, false));
  });
});
