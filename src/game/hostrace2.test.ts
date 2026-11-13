import { describe } from 'vitest';
import { RACE_ARENAS } from '../world/arenas';
import { raceTest } from '../test/racehost';

/** Playability of the race (see src/test/racehost.ts): the second half of the arenas, beside hostrace.test.ts. */
describe('a simulated Host races', () => {
  for (const arena of RACE_ARENAS.slice(Math.ceil(RACE_ARENAS.length / 2))) raceTest(arena);
});
