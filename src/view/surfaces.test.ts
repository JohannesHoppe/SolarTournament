import { describe, expect, it } from 'vitest';
import { DEPOT, GIFT, sovereignNumberSpan, THRUSTER_LAYOUTS, TILE } from '../ship/models';
import { QUAD_SIZE } from '../ship/thrusters';
import { Randomizer } from '../random';
import { ARMOR_RELIEF_SIZE, ARMOR_SLOPE, ARMOR_TILE, armorLayout, armorRelief, normalPixels, panelLayout, SIZE, windingHeights } from './surfaces';

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

describe("the battleship's armor", () => {
  const S = ARMOR_RELIEF_SIZE;
  const meter = S / (ARMOR_TILE * 0.05);
  const { layout, height, color } = armorRelief(7);
  const normals = normalPixels(height, S, ARMOR_SLOPE, 1);
  const u = (x: number) => (x + 0.5) / S;
  const v = (y: number) => 1 - (y + 0.5) / S;

  it('is laid in plates that cover the tile once, of many sizes, not in courses of bricks', () => {
    const covered = new Uint8Array(S * S);
    for (const p of layout.plates) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) covered[(y % S) * S + (x % S)]++;
    expect(covered.every((n) => n === 1)).toBe(true);
    expect(new Set(layout.plates.map((p) => `${p.w}x${p.h}`)).size).toBeGreaterThan(layout.plates.length * 0.8);
    expect(new Set(layout.plates.map((p) => p.h)).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...layout.plates.map((p) => p.w)) / meter).toBeGreaterThan(30);
    // most of the hull is long plates along it, 30 m and more
    const long = layout.plates.filter((p) => p.w >= 30 * meter).reduce((sum, p) => sum + p.w * p.h, 0);
    expect(long / (S * S)).toBeGreaterThan(0.6);
    for (const kind of ['doubler', 'access', 'hardpoint'] as const) expect(layout.insets.some((p) => p.kind === kind)).toBe(true);
    expect(layout.welds.length).toBeGreaterThan(5);
    expect(layout.ports.length).toBeGreaterThan(0);
  });

  it('steps a plate laid over it out of the armor: its edges face away from it as the GPU reads them', () => {
    const doubler = layout.insets.find((p) => p.kind === 'doubler')!;
    const middleY = doubler.y + Math.floor(doubler.h / 2);
    const middleX = doubler.x + Math.floor(doubler.w / 2);
    expect(sample(normals, S, u(doubler.x + 1), v(middleY))[0]).toBeLessThan(-0.3);
    expect(sample(normals, S, u(doubler.x + doubler.w - 2), v(middleY))[0]).toBeGreaterThan(0.3);
    expect(sample(normals, S, u(middleX), v(doubler.y + 1))[1]).toBeGreaterThan(0.3);
    expect(sample(normals, S, u(middleX), v(doubler.y + doubler.h - 2))[1]).toBeLessThan(-0.3);
    // its face is flat, the line around it a thin dark cut
    expect(sample(normals, S, u(middleX), v(middleY))[2]).toBeGreaterThan(0.99);
    const line = ((middleY % S) * S + (doubler.x % S)) * 3;
    const inside = ((middleY % S) * S + (middleX % S)) * 3;
    expect(color[line]).toBeLessThan(color[inside] * 0.7);
  });

  it('calms with distance: its normal map averaged as a mipmap 16 times smaller lies nearly flat everywhere', () => {
    const block = 16;
    let steepest = 0;
    for (let by = 0; by < S; by += block) {
      for (let bx = 0; bx < S; bx += block) {
        const mean = [0, 0, 0];
        for (let y = by; y < by + block; y++) for (let x = bx; x < bx + block; x++) for (let k = 0; k < 3; k++) mean[k] += normals[(y * S + x) * 4 + k] / 255 / (block * block);
        const [nx, ny, nz] = mean.map((c) => c * 2 - 1);
        steepest = Math.max(steepest, Math.acos(nz / Math.hypot(nx, ny, nz)));
      }
    }
    expect((steepest * 180) / Math.PI).toBeLessThan(15);
  });

  it('is laid out alike from the same seed', () => {
    expect(armorLayout(7)).toEqual(layout);
    expect(armorLayout(8)).not.toEqual(layout);
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

describe('the fighters\' plating', () => {
  const hatch = (bolts: [number, number][], hatches: [number, number][]) => bolts.every(([x, y]) => hatches.some(([hx, hy]) => x > hx && x < hx + 16 && y > hy && y < hy + 12));

  it('is flush on the Sovereign: not a rivet, flush bolts only in the corners of a few hatches', () => {
    expect(GIFT.relief).toBe('flush');
    const { rivets, hatches, bolts } = panelLayout(new Randomizer(7), GIFT.relief);
    expect(rivets).toHaveLength(0);
    expect(hatches.length).toBeGreaterThan(0);
    expect(hatches.length).toBeLessThanOrEqual(3);
    expect(bolts).toHaveLength(hatches.length * 4);
    expect(hatch(bolts, hatches)).toBe(true);
  });

  it("carries the Sovereign's number at one place on the nose's flanks, never on a hatch", () => {
    // no stencil in the repeating surface: the number is a decal of its own
    expect(GIFT.stencils).toHaveLength(0);
    const { hatches } = panelLayout(new Randomizer(7), GIFT.relief);
    const { fore, aft, bottom, top } = sovereignNumberSpan();
    // behind the fore thruster clusters' housings
    expect(fore).toBeGreaterThan(THRUSTER_LAYOUTS.sovereign.fore.z + QUAD_SIZE);
    const px = (units: number) => (units / TILE) * SIZE;
    // does [a0, a1] meet [b0, b1] on a tile that wraps every SIZE pixels?
    const meets = (a0: number, a1: number, b0: number, b1: number) => {
      const shift = Math.floor(a0 / SIZE) * SIZE;
      return [-SIZE, 0, SIZE].some((k) => a0 - shift < b1 + k && a1 - shift > b0 + k);
    };
    // the flanks' surface (see boxUv, 'readable'): along -z on the right flank and +z on the left,
    // its rows running down the canvas as the height rises
    for (const [u0, u1] of [[-aft, -fore], [fore, aft]]) {
      for (const [hx, hy] of hatches) expect(meets(px(u0), px(u1), hx, hx + 16) && meets(px(-top), px(-bottom), hy, hy + 12)).toBe(false);
    }
  });

  it('keeps its rivets on the human interceptor, an old depot fighter, in the same panels', () => {
    const riveted = panelLayout(new Randomizer(41), DEPOT.relief);
    expect(riveted.rivets.length).toBeGreaterThan(100);
    expect(riveted.bolts).toHaveLength(0);
    // the same seed lays out the same panels, riveted or flush
    expect(panelLayout(new Randomizer(41), 'flush').seams).toEqual(riveted.seams);
  });
});
