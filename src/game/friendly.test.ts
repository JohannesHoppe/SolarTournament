import { describe, expect, it } from 'vitest';
import { killScore } from './friendly';

describe('friendly fire', () => {
  it('takes from the killer of a ship of its own side what the kill gives against the other side', () => {
    expect(killScore(false, 500, 1)).toBe(500);
    expect(killScore(true, 500, 1)).toBe(-500);
    // a nova's double kill, and its double penalty
    expect(killScore(false, 500, 2)).toBe(1000);
    expect(killScore(true, 500, 2)).toBe(-1000);
    // a race's kill
    expect(killScore(true, 200, 1)).toBe(-200);
  });
});
