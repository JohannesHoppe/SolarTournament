import { describe, expect, it } from 'vitest';
import { turnShape } from './touch';

describe('the touch turn stick', () => {
  const length = (v: { x: number; y: number }) => Math.sqrt(v.x * v.x + v.y * v.y);

  it('does nothing just off its middle, so a resting thumb holds the nose still', () => {
    expect(turnShape({ x: 0.05, y: 0.03 })).toEqual({ x: 0, y: 0 });
  });

  it('turns slowly for a small push and at full rate only at its rim', () => {
    expect(length(turnShape({ x: 0.3, y: 0 }))).toBeLessThan(0.1);
    expect(length(turnShape({ x: 0, y: 0.6 }))).toBeLessThan(0.35);
    expect(length(turnShape({ x: 1, y: 0 }))).toBeCloseTo(1, 5);
  });

  it('keeps the way it is pushed, and grows steadily with the push', () => {
    const shaped = turnShape({ x: -0.6, y: 0.6 });
    expect(shaped.x).toBeCloseTo(-shaped.y, 9);
    let last = 0;
    for (let push = 0.1; push <= 1; push += 0.1) {
      const now = length(turnShape({ x: push, y: 0 }));
      expect(now).toBeGreaterThan(last);
      last = now;
    }
  });
});
