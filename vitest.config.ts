import { defineConfig } from 'vitest/config';

/** Unit tests of the deterministic core: they run in Node, without a browser. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
