import { expect, test } from '@playwright/test';
import { openGame, play, startSolo } from './game';

test('a solo round starts and runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  // the solo plate opens with the default choice: a race against a full grid of seven rivals
  await startSolo(page);
  await play(page, 5);
  const state = await page.evaluate(() => {
    const game = window.game;
    return { state: game.state, ships: game.ships.length, arena: game.venue.id, alive: game.me.alive };
  });
  expect(state.state).toBe('playing');
  expect(state.ships).toBe(8);
  expect(state.alive).toBe(true);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const mode of ['deathmatch', 'survival', 'flag', 'fleet']) {
  test(`a solo round of ${mode} starts and runs without errors`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page, mode);
    await play(page, 3);
    const state = await page.evaluate(() => {
      const game = window.game;
      return { state: game.state, mode: game.roundMode, alive: game.me.alive };
    });
    expect(state).toEqual({ state: 'playing', mode, alive: true });
    expect(errors).toEqual([]);
  });
}

test('the hangar sells an upgrade for Solar Coins and keeps it, and the Sovereign is not flown before it is earned', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('solartournament.hangar', JSON.stringify({ coins: 1200, ship: 'human' }));
    sessionStorage.setItem('seeded', '1');
  });
  const errors = await openGame(page);
  await page.click('#hangar');
  await page.locator('.upgrade', { hasText: 'Radiators' }).click();
  await expect(page.locator('#hangar-coins')).toContainText('200 Solar Coins');
  // the previous ship from the human interceptor is the Sovereign, still a silhouette
  await page.click('#ship-prev');
  await expect(page.locator('#ship-note')).toContainText('Make both interceptors complete');
  await page.reload();
  await page.waitForFunction(() => window.game?.composer);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.hangar')!));
  expect(kept.coins).toBe(200);
  expect(kept.levels.human.radiators).toBe(1);
  expect(kept.ship).toBe('human');
  expect(errors).toEqual([]);
});

for (const course of ['basic', 'racer', 'gladiator', 'arsenal', 'tactician']) {
  test(`the flight school's ${course} course starts in the belt`, async ({ page }) => {
    const errors = await openGame(page);
    await page.click('#school');
    await page.click(`#school-${course}`);
    await play(page, 2);
    expect(await page.evaluate(() => window.game.venue.id)).toBe('belt');
    await expect(page.locator('#school-step')).toContainText(/\d+\/\d+/);
    expect(errors).toEqual([]);
  });
}
