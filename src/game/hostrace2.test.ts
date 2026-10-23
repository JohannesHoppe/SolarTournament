import { describe } from 'vitest';
import { ARENAS } from '../world/arenas';
import { raceTest } from '../test/racehost';

/** Playability of the race (see src/test/racehost.ts): the second half of the arenas, beside hostrace.test.ts. */
describe('a simulated Host races', () => {
  for (const arena of ARENAS.slice(Math.ceil(ARENAS.length / 2))) raceTest(arena);
});
