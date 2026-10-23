import { it } from 'vitest';
import { Course } from './game/race';
import { ARENAS } from './world/arenas';
import { testField } from './test/field';
import { DISTANT_DETAIL } from './world/rocks';
it('probe', () => {
  for (const arena of ARENAS) {
    const a = testField(); a.generate(arena.layout);
    const b = testField(16 as never); b.generate(arena.layout);
    const ca = new Course(a, arena.layout.seed), cb = new Course(b, arena.layout.seed);
    const d = Math.max(...ca.points.map((p, i) => p.distanceTo(cb.points[i])));
    console.log(arena.id, 'max gate shift (units)', d.toFixed(0), DISTANT_DETAIL);
  }
});
