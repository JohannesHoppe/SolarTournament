import { defineConfig } from '@playwright/test';

/** The dev server's port (see DEV_PORT in vite.config.ts). */
const port = Number(process.env.DEV_PORT ?? 5173);

/**
 * Browser tests: the game starts in a real browser (Chromium with software WebGL), and two
 * tabs of one tournament (?local=1) see the same world. They run against the dev server.
 */
export default defineConfig({
  testDir: 'e2e',
  // the balance runs play whole rounds and run on their own (npm run balance)
  testIgnore: process.env.BALANCE ? [] : ['**/balance.spec.ts'],
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
