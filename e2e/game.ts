import type { Page } from '@playwright/test';

declare global {
  interface Window {
    /** The game a page runs, as it hangs on the window in development (see main.ts); only the browser tests read it. */
    game: Record<string, any>;
  }
}

/** Opens the game and waits until it runs, at most `timeout` ms; collects the page's errors. */
export async function openGame(page: Page, path = '/', timeout = 60_000): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(path, { timeout });
  await page.waitForFunction(() => window.game?.composer, null, { timeout });
  // several tabs render too slowly without a GPU (the title screen's pad, with its shadows and
  // lacquer, holds up every other tab); the tests watch the state, not the picture
  await page.evaluate(() => {
    window.game.composer.render = () => {};
    if (window.game.showcase) window.game.showcase.render = () => {};
    window.game.nextIdleGlitch = Infinity;
  });
  return errors;
}

/** Launches a solo round from the menu, of `mode` or the default choice. */
export async function startSolo(page: Page, mode?: string) {
  await page.click('#start');
  if (mode) await page.click(`[data-choice="solo-mode"] button[data-value="${mode}"]`);
  await page.click('#solo-launch');
}

/** Waits for this many seconds of game time. */
export async function play(page: Page, seconds: number) {
  await page.evaluate(async (seconds) => {
    const start = window.game.time;
    while (window.game.time - start < seconds) await new Promise((resolve) => requestAnimationFrame(resolve));
  }, seconds);
}
