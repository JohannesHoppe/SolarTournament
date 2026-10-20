import { expect, test } from '@playwright/test';
import { openGame, play, type GameWindow } from './game';

test('a solo round starts and runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#start');
  await play(page, 5);
  const state = await page.evaluate(() => {
    const game = (window as unknown as GameWindow).game;
    return { state: game.state, ships: game.ships.length, arena: game.venue.id, alive: game.me.alive };
  });
  expect(state.state).toBe('playing');
  expect(state.ships).toBe(4);
  expect(state.alive).toBe(true);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the flight school starts in the belt', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#school');
  await play(page, 2);
  expect(await page.evaluate(() => (window as unknown as GameWindow).game.venue.id)).toBe('belt');
  expect(errors).toEqual([]);
});
