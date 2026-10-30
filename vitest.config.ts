import { defineConfig } from 'vitest/config';

/** Unit tests of the deterministic core: they run in Node, without a browser. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // many tests fly whole rounds or courses, seconds of work on a busy machine and more on the
    // site's build machine, which runs them before every build; a test's verdict is its
    // assertions, never the wall clock
    testTimeout: 60_000,
  },
});
