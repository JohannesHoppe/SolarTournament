import { expect, test } from '@playwright/test';
import { openGame, play, type GameWindow } from './game';

test('a solo round starts and runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  // the solo plate opens with the default choice: a race against a full grid of seven rivals
  await page.click('#start');
  await page.click('#solo-launch');
  await play(page, 5);
  const state = await page.evaluate(() => {
    const game = (window as unknown as GameWindow).game;
    return { state: game.state, ships: game.ships.length, arena: game.venue.id, alive: game.me.alive };
  });
  expect(state.state).toBe('playing');
  expect(state.ships).toBe(8);
  expect(state.alive).toBe(true);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const mode of ['deathmatch', 'survival', 'flag']) {
  test(`a solo round of ${mode} starts and runs without errors`, async ({ page }) => {
    const errors = await openGame(page);
    await page.click('#start');
    await page.click(`[data-choice="solo-mode"] button[data-value="${mode}"]`);
    await page.click('#solo-launch');
    await play(page, 3);
    const state = await page.evaluate(() => {
      const game = (window as unknown as GameWindow).game;
      return { state: game.state, mode: game.roundMode, alive: game.me.alive };
    });
    expect(state).toEqual({ state: 'playing', mode, alive: true });
    expect(errors).toEqual([]);
  });
}

for (const course of ['basic', 'racer', 'gladiator']) {
  test(`the flight school's ${course} course starts in the belt`, async ({ page }) => {
    const errors = await openGame(page);
    await page.click('#school');
    await page.click(`#school-${course}`);
    await play(page, 2);
    expect(await page.evaluate(() => (window as unknown as GameWindow).game.venue.id)).toBe('belt');
    await expect(page.locator('#school-step')).toContainText(/\d+\/\d+/);
    expect(errors).toEqual([]);
  });
}
