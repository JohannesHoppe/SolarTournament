import { expect, test } from '@playwright/test';
import { openGame } from './game';

test('the campaign Lot 7731 takes no click on the plain address', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#campaign')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the campaign flies the scrap hull: the trigger fires nothing, and the HUD shows no overdrive and no torpedoes', async ({ page }) => {
  const errors = await openGame(page, '/?campaign');
  await page.click('#campaign');
  await page.waitForFunction(() => window.game.state === 'playing' && window.game.me?.alive && window.game.school?.attempt?.live, null, { timeout: 90_000 });
  await page.keyboard.down('Space');
  await page.evaluate(async () => {
    const start = window.game.time;
    while (window.game.time - start < 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.game.me.heat)).toBe(0);
  await expect(page.locator('#hud-overdrive')).toBeHidden();
  await expect(page.locator('#hud-torpedo')).toBeHidden();
  expect(errors).toEqual([]);
});

const CHAPTER_ONE = ['lamplighter', 'liveTarget', 'canisterSweep', 'firstCut', 'dockingLane'];

for (const [index, id] of CHAPTER_ONE.entries()) {
  test(`chapter 1's mission ${id} starts in the Boneyard and counts once its drill is live`, async ({ page }) => {
    const before = ['coldBoot', ...CHAPTER_ONE.slice(0, index)];
    if (index >= 3) before.splice(4, 0, 'cutter');
    const parts = index >= 3 ? ['cutter'] : [];
    await page.addInitScript(([done, parts]) => localStorage.setItem('solartournament.campaign', JSON.stringify({ done, step: 0, coins: 0, bond: 25000, parts })), [before, parts] as const);
    const errors = await openGame(page, '/?campaign');
    await page.click('#campaign');
    await page.waitForFunction(() => window.game.venue?.id === 'boneyard' && window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
    await page.evaluate(async () => {
      const start = window.game.time;
      while (window.game.time - start < 2) await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(await page.evaluate(() => window.game.me.perks.laser)).toBe(index >= 3);
    expect(errors).toEqual([]);
  });
}

test('Lamplighter counts the beacons held by, one after the other', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: ['coldBoot'], step: 0, coins: 0, bond: 25000, parts: [] })));
  const errors = await openGame(page, '/?campaign');
  await page.click('#campaign');
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  // the clone set beside each beacon in turn, at rest, until the line after the drill comes
  await page.evaluate(async () => {
    const game = window.game;
    const start = game.time;
    while (game.school.attempt?.points?.length && game.time - start < 60) {
      const attempt = game.school.attempt;
      const lamp = attempt.points[attempt.next];
      if (!lamp) break;
      game.me.flight.position.copy(lamp);
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(1);
  expect(errors).toEqual([]);
});

test('on the address with ?campaign its first mission flies on the flight school’s machinery, and done it is kept', async ({ page }) => {
  // the mission at its last drill (Nicole's closing words), so it ends by itself
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: [], step: 5, coins: 0, bond: 25000 })));
  const errors = await openGame(page, '/?campaign');
  await page.click('#campaign');
  await expect(page.locator('#school-step')).toContainText('Cold Boot 6/6', { timeout: 90_000 });
  await page.waitForFunction(() => window.game.state === 'menu', null, { timeout: 60_000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!));
  expect(kept.done).toEqual(['coldBoot']);
  expect(kept.step).toBe(0);
  // the flight school's own progress is untouched
  expect(await page.evaluate(() => localStorage.getItem('solartournament.school-step'))).toBeNull();
  expect(errors).toEqual([]);
});
