import { defineConfig } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
