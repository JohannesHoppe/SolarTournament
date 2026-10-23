import { describe } from 'vitest';
import { ARENAS } from '../world/arenas';
import { raceTest } from '../test/racehost';

/** Playability of the race (see src/test/racehost.ts): the first half of the arenas; hostrace2.test.ts flies the rest beside it. */
describe('a simulated Host races', () => {
  for (const arena of ARENAS.slice(0, Math.ceil(ARENAS.length / 2))) raceTest(arena);
});
