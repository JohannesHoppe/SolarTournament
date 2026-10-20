import type { Page } from '@playwright/test';

/** The game a page runs, as it hangs on the window in development (see main.ts). */
export type GameWindow = Window & { game: Record<string, any> };

/** Opens the game and waits until it runs; collects the page's errors. */
export async function openGame(page: Page, path = '/'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as GameWindow).game?.composer, null, { timeout: 60_000 });
  // several tabs render too slowly without a GPU; the tests watch the state, not the picture
  await page.evaluate(() => {
    const game = (window as unknown as GameWindow).game;
    game.composer.render = () => {};
    game.nextIdleGlitch = Infinity;
  });
  return errors;
}

/** Waits for this many seconds of game time. */
export async function play(page: Page, seconds: number) {
  await page.evaluate(async (seconds) => {
    const game = (window as unknown as GameWindow).game;
    const start = game.time;
    while (game.time - start < seconds) await new Promise((resolve) => requestAnimationFrame(resolve));
  }, seconds);
}
