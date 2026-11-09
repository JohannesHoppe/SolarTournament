import { configDefaults, defineConfig } from 'vitest/config';

/** Unit tests of the deterministic core: they run in Node, without a browser. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // the campaign's jobs, flown by a simulated Host, take a few minutes: `npm run jobs` (JOBS set) flies them
    exclude: process.env.JOBS ? configDefaults.exclude : [...configDefaults.exclude, 'src/campaign/jobs.*.test.ts'],
    environment: 'node',
    // many tests fly whole rounds or courses, seconds of work on a busy machine and more on the
    // site's build machine, which runs them before every build; a test's verdict is its
    // assertions, never the wall clock
    testTimeout: 60_000,
  },
});
