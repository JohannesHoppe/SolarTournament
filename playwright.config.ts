import { defineConfig } from '@playwright/test';

/** The dev server's port (see DEV_PORT in vite.config.ts). */
const port = Number(process.env.DEV_PORT ?? 5173);

/**
 * Browser tests: the game starts in a real browser (Chromium with software WebGL), and two
 * tabs of one tournament (?local=1) see the same world. They run against the dev server.
 */
export default defineConfig({
  testDir: 'e2e',
  // the balance runs and the soak of the cheat checks play whole rounds and the benchmark measures for minutes: each runs on its own (npm run balance, npm run soak, npm run bench)
  testIgnore: [...(process.env.BALANCE ? [] : ['**/balance.spec.ts']), ...(process.env.SOAK ? [] : ['**/soak.spec.ts']), ...(process.env.BENCH ? [] : ['**/bench.spec.ts'])],
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // WebGL in software (swiftshader); the page itself is composited without it: compositing the
    // DOM's layers (the HUD, the neon's glows) in software GL holds every tab to a few frames a
    // second and slows a second tab's start until the online tests time out
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
