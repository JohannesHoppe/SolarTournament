import { defineConfig } from 'vitest/config';

/** The search for the Derelict's lasting loops (npm run orbits): run by Vitest, which reads the game's sources as the unit tests do. */
export default defineConfig({
  test: {
    include: ['tools/derelict/*.search.ts'],
    environment: 'node',
  },
});
