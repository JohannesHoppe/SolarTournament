import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Course } from './race';
import type { RacingLine } from './racingline';
import { RACE_ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { DETAIL } from '../world/rocks';
import { Randomizer } from '../random';

/**
 * How far along the line a ship is, reckoned as the line itself does it but from its points
 * alone, sampled anew at every call: the samples the line keeps for each stretch must give the
 * very same answer, to the bit.
 */
function progressOf(line: RacingLine, position: THREE.Vector3, next: number, before: number): number {
  const from = next > 0 ? line.gateArc(next - 1) : line.closed ? line.gateArc(line.gateCount - 1) : 0;
  const gate = line.gateArc(next);
  const to = gate <= from ? gate + line.length : gate;
  // as many samples as the line has there: SAMPLES between two of its points
  const samples = line.sampleCount;
  const steps = Math.max(1, Math.ceil(((to - from) / line.length) * (samples - 1)));
  let best = from;
  let distance = Infinity;
  const at = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const s = from + ((to - from) * i) / steps;
    const d = line.point(s, at).distanceToSquared(position);
    if (d < distance) {
      distance = d;
      best = s;
    }
  }
  return Math.min(best, to - before);
}

describe("a racing line's progress", () => {
  for (const arena of RACE_ARENAS) {
    it(`is the same to the bit as sampling the line anew at every call in ${arena.id}`, () => {
      const field = testField(DETAIL);
      field.generate(arena.layout);
      const course = new Course(field, arena.layout.seed);
      const branches = arena.layout.course?.form === 'track' ? (arena.layout.course.branches?.length ?? 0) : 0;
      const random = new Randomizer(7);
      const position = new THREE.Vector3();
      const on = new THREE.Vector3();
      let compared = 0;
      for (let ways = 0; ways < 1 << branches; ways++) {
        const line = course.lineOf(ways);
        for (let round = 0; round < 3; round++) {
          for (let next = 0; next < line.gateCount; next++) {
            // ships near the line and far off it, before the gate and past it
            const s = random.range(0, line.length);
            line.point(s, on);
            position.set(on.x + random.range(-1, 1) * 20000, on.y + random.range(-1, 1) * 4000, on.z + random.range(-1, 1) * 20000);
            const before = random.range(0, 4000);
            expect(line.progress(position, next, before)).toBe(progressOf(line, position, next, before));
            compared++;
          }
        }
      }
      expect(compared).toBeGreaterThan(0);
    });
  }
});
