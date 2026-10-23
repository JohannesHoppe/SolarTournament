import { expect, test, type Page } from '@playwright/test';
import { openGame, startSolo } from './game';

/**
 * The share button: on every screen of the game and on the station pages, its menu opens and
 * closes, and the link it copies is the game's, or in an online tournament the tournament's own.
 */

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const GAME_URL = 'https://solartournament.games/';

/** Opens the share menu, copies its link and closes the menu again; returns what was copied. */
async function copyShared(page: Page): Promise<string> {
  await expect(page.locator('#share')).toBeVisible();
  await page.click('#share');
  const panel = page.locator('#share-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.share-targets a')).toHaveCount(9);
  await page.click('.share-copy');
  await expect(page.locator('.share-copy')).toHaveText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  return copied;
}

test('the share button is on every screen of the menu and shares the game', async ({ page }) => {
  const errors = await openGame(page);
  expect(await copyShared(page)).toBe(GAME_URL);
  for (const [open, back] of [
    ['#school', '#school-back'],
    ['#start', '#solo-back'],
    ['#hangar', '#hangar-back'],
  ]) {
    await page.click(open);
    expect(await copyShared(page)).toBe(GAME_URL);
    await page.click(back);
  }
  expect(errors).toEqual([]);
});

test('in a solo round the share menu shares the game, lets the mouse go and pauses nothing', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page);
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60_000 });
  await page.click('#share');
  expect(await page.evaluate(() => [window.game.state, window.game.input.steering])).toEqual(['playing', false]);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => [window.game.state, window.game.input.steering])).toEqual(['playing', true]);
  expect(await copyShared(page)).toBe(GAME_URL);
  expect(errors).toEqual([]);
});

test('in the flight school the share button stays without the radio', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => document.getElementById('school-basic')!.click());
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60_000 });
  expect(await copyShared(page)).toBe(GAME_URL);
  expect(errors).toEqual([]);
});

test("in an online tournament the share menu shares the tournament's own link and warns for a private one", async ({ page }) => {
  const errors = await openGame(page, `/?local=1#t=e2e-share-${Date.now().toString(36)}&n=Share+Test`);
  await page.evaluate(() => document.getElementById('online')!.click());
  await page.waitForFunction(() => window.game.state === 'playing' && window.game.online, null, { timeout: 60_000 });
  await page.click('#share');
  await expect(page.locator('.share-warning')).toBeVisible();
  await page.keyboard.press('Escape');
  const copied = await copyShared(page);
  expect(copied).toBe(page.url());
  expect(copied).toContain('#t=e2e-share-');
  expect(copied).toContain('?local=1');
  expect(errors).toEqual([]);
});

for (const path of ['radio.html', 'handbook.html']) {
  test(`${path} has the share button in its corner`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`/${path}`);
    expect(await copyShared(page)).toBe(GAME_URL);
    expect(errors).toEqual([]);
  });
}
