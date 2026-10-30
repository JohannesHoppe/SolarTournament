import { describe, expect, it } from 'vitest';
import { RING_LAYER, RING_SHEET } from './arenas';
import { ringShare } from './landmarks';

/** Both faces of the ring's slab together, as a camera at `height` sees them. */
const total = (height: number) => ringShare(height, -1) + ringShare(height, 1);

describe("the Rings of Saturn's sheet", () => {
  it('shows the whole ring as a disk from afar, on the face across the slab, and nothing on the near face', () => {
    for (const height of [60000, 100000, 1e6]) {
      expect(ringShare(height, -1)).toBe(1);
      expect(ringShare(height, 1)).toBe(0);
      expect(ringShare(-height, 1)).toBe(1);
      expect(ringShare(-height, -1)).toBe(0);
    }
    // the open space above and below the slab stays open on the camera's side
    expect(ringShare(RING_SHEET, 1)).toBe(0);
    expect(ringShare(-RING_SHEET, -1)).toBe(0);
  });

  it('grows see-through towards the layer by the height alone, faint in it but never gone, and never jumps', () => {
    // in the layer a faint veil, never nothing
    for (const height of [0, RING_LAYER / 2, -RING_LAYER]) {
      expect(total(height)).toBeGreaterThan(0.05);
      expect(total(height)).toBeLessThan(0.15);
    }
    let last = total(-80000);
    for (let height = -80000; height <= 80000; height += 10) {
      const now = total(height);
      // smooth, crossing the slab and the plane included
      expect(Math.abs(now - last)).toBeLessThan(1e-3);
      // more of the ring the farther from the plane, the same on either side
      if (height > 0) expect(now).toBeGreaterThanOrEqual(last - 1e-12);
      expect(now).toBeCloseTo(total(-height), 12);
      last = now;
    }
  });
});
