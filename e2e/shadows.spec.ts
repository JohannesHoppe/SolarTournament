import { expect, test } from '@playwright/test';

test("the medium tier, which refreshes the sun's shadows every other frame, draws without a GL error from its first frame on and whenever their map changes size", async ({ page }) => {
  const glErrors: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('GL_INVALID')) glErrors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('solartournament.quality', JSON.stringify({ choice: 'medium' })));
  await page.goto('/');
  await page.waitForFunction(() => window.game?.graphics, null, { timeout: 60_000 });
  const look = await page.evaluate(async () => {
    const frames = (count: number) => new Promise<void>((resolve) => {
      const next = () => (count-- > 0 ? requestAnimationFrame(next) : resolve());
      next();
    });
    await frames(5);
    // a new map one frame apart, so it falls on a frame of each kind: with a refresh and without
    for (const size of [1024, 2048, 1024, 2048]) {
      window.game.space.setLook(size, 1);
      await frames(size === 1024 ? 2 : 3);
    }
    return { shadows: window.game.graphics.look.shadows, map: window.game.space.sunLight.shadow.map.width };
  });
  expect(look).toEqual({ shadows: 2048, map: 2048 });
  // the browser hands the GL's messages to the console a moment later
  await page.waitForTimeout(1000);
  expect(glErrors).toEqual([]);
});
