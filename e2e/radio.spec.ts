import { expect, test } from '@playwright/test';
import { openGame, startSolo } from './game';

/**
 * Radio 2584's page: the game's title of the running track leads there in the same tab (in a
 * round only from the pause menu), its seal leads back, and the last pressing kept in the
 * browser is offered again after a reload.
 */

test("the track's title pauses a round, then opens the radio page in the same tab, whose seal leads back", async ({ page, context }) => {
  const errors = await openGame(page);
  await startSolo(page);
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60_000 });
  await page.click('#now-playing-link');
  expect(await page.evaluate(() => [window.game.state, location.pathname])).toEqual(['paused', '/']);
  await page.click('#now-playing-link');
  await page.waitForURL(/\/radio\.html\?title=/);
  expect(context.pages()).toHaveLength(1);
  await expect(page.locator('#track-title')).not.toBeEmpty();
  await page.click('a[href="./"] .logo');
  await page.waitForURL((url) => url.pathname === '/');
  expect(errors).toEqual([]);
});

test('the last pressing is offered again after a reload and saved as often as wanted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/radio.html?title=Neon%20Funeral');
  await expect(page.locator('.download-again')).toBeHidden();
  // a pressing as the page keeps it (pressing a whole track takes most of a minute)
  expect(
    await page.evaluate(async (path) => {
      const { keepPressing } = (await import(path)) as typeof import('../src/music/kept');
      return keepPressing({ title: 'Orbit Terror', wav: new Blob(['RIFF'], { type: 'audio/wav' }) });
    }, '/src/music/kept.ts'),
  ).toBe(true);
  await page.reload();
  const again = page.locator('#download-again');
  await expect(again).toHaveText('Download again: Orbit Terror');
  for (let i = 0; i < 2; i++) {
    const download = page.waitForEvent('download');
    await again.click();
    expect((await download).suggestedFilename()).toBe('SolarTournament - Orbit Terror.wav');
  }
  // the Download button on the kept title saves the kept file instead of pressing it anew
  await page.goto('/radio.html?title=Orbit%20Terror');
  const download = page.waitForEvent('download', { timeout: 5_000 });
  await page.click('#download');
  expect((await download).suggestedFilename()).toBe('SolarTournament - Orbit Terror.wav');
  expect(errors).toEqual([]);
});
