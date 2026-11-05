import { expect, type Page, test } from '@playwright/test';
import { openGame } from './game';

/** Opens the campaign's job board from the menu and takes the next job on it. */
async function takeNextJob(page: Page) {
  await page.click('#campaign');
  await page.click('#board-next button');
}

/**
 * Sets the clone at rest beside each point of the running drill in turn (`over` units above it),
 * until the drill moves on to its next step (the line after it).
 */
async function visitPoints(page: Page, over: number) {
  await page.evaluate(async (over) => {
    const game = window.game;
    const start = game.time;
    while (game.school.attempt?.points?.length && game.time - start < 60) {
      const attempt = game.school.attempt;
      const point = attempt.points[attempt.next];
      if (!point) break;
      game.me.flight.position.copy(point).add({ x: 0, y: over, z: 0 });
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, over);
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(2);
}

test('the campaign Lot 7731 takes no click on the plain address', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#campaign')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the campaign flies the scrap hull: the trigger fires nothing, the HUD shows no overdrive and no torpedoes, and Nicole has no radar', async ({ page }) => {
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
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
  // a salvaged flight computer: none of her modules installed (see Module in src/campaign/campaign.ts)
  await expect(page.locator('#radar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('out of the campaign the flight computer has every module: the radar shows in the flight school', async ({ page }) => {
  const errors = await openGame(page, '/?campaign');
  await page.evaluate(() => document.getElementById('school-basic')!.click());
  await page.waitForFunction(() => window.game.state === 'playing' && window.game.me?.alive, null, { timeout: 90_000 });
  await expect(page.locator('#radar')).toBeVisible();
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
    await takeNextJob(page);
    await page.waitForFunction(() => window.game.venue?.id === 'boneyard' && window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
    await page.evaluate(async () => {
      const start = window.game.time;
      while (window.game.time - start < 2) await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(await page.evaluate(() => window.game.me.perks.laser)).toBe(index >= 3);
    expect(errors).toEqual([]);
  });
}

/** Chapter 1 flown: every mission of it done, the cutter fitted and the thrusters welded. */
const CHAPTER_ONE_DONE = { done: ['coldBoot', 'lamplighter', 'liveTarget', 'canisterSweep', 'cutter', 'firstCut', 'dockingLane'], step: 0, coins: 0, bond: 25000, parts: ['cutter', 'patch'] };

test('chapter 2 opens on Vesta: the clone over Rheasilvia’s flank, the claims’ boulders lying on it', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify(kept)), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.venue?.id === 'rheasilvia' && window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  await expect(page.locator('#school-step')).toContainText('Rheasilvia 1/3');
  expect(errors).toEqual([]);
});

test('Claim Survey logs the claims’ buoys flown past, in the order they were filed', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify({ ...kept, done: [...kept.done, 'rheasilvia'] })), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.attempt?.points?.length === 5 && window.game.me?.alive, null, { timeout: 90_000 });
  // the clone set beside each buoy in turn, at rest, until the line after the drill comes
  await visitPoints(page, 1200);
  expect(errors).toEqual([]);
});

test('Cut and Haul marks the claim beside a working rig, and fines a beam on the rig', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify({ ...kept, done: [...kept.done, 'rheasilvia', 'claimSurvey'] })), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 120_000 });
  // the claim it cuts carries no rig, and a rig works on the claim nearest it
  const claim = await page.evaluate(() => {
    const game = window.game;
    const claims: { rock: string; rig: unknown }[] = game.mining.claims(game.field);
    const site = game.school.attempt.site;
    const cut = claims.find((c) => game.field.asteroids.get(c.rock)?.object.position.distanceTo(site) < 1);
    return { found: !!cut, rig: !!cut?.rig, rigs: claims.filter((c) => c.rig).length };
  });
  expect(claim).toEqual({ found: true, rig: false, rigs: 6 });
  // a beam that ends on a rig is counted, and costs the pay
  await page.evaluate(() => (window.game.rigBeams += 2));
  await expect.poll(() => page.evaluate(() => window.game.missionFine)).toBe(100);
  expect(errors).toEqual([]);
});

test('the Saw Brothers saw at a rig while the clone keeps away, and two of them shot down end it', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify({ ...kept, done: [...kept.done, 'rheasilvia', 'claimSurvey', 'cutAndHaul'] })), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 3, null, { timeout: 120_000 });
  // the clone held far off: the brothers saw at the rig, and their beams wear it down
  await page.waitForFunction(
    () => {
      const game = window.game;
      game.me.flight.position.set(-60000, 20000, -60000);
      game.me.flight.velocity.set(0, 0, 0);
      return game.jumpers.hits > 0;
    },
    null,
    { timeout: 90_000, polling: 100 },
  );
  // two of them shot down: the third runs, and the mission goes on
  await page.evaluate(() => window.game.jumpers.bots.slice(0, 2).forEach((bot: { ship: { alive: boolean } }) => (bot.ship.alive = false)));
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(3);
  expect(errors).toEqual([]);
});

test('Lamplighter counts the beacons held by, one after the other', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: ['coldBoot'], step: 0, coins: 0, bond: 25000, parts: [] })));
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  // past Rask's briefing to the drill itself, then the clone set beside each beacon in turn, at rest, until the line after the drill comes
  await page.waitForFunction(() => window.game.school?.attempt?.points?.length > 0, null, { timeout: 60_000 });
  await visitPoints(page, 0);
  expect(errors).toEqual([]);
});

test('Cold Boot docks the hull on bay 3’s pad once it rests above it', async ({ page }) => {
  // at the docking drill, the flight into the bay done
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: [], step: 15, coins: 0, bond: 25000 })));
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  // the clone set at rest over the pad's middle, a little above the bay's floor, until the drill counts
  await page.evaluate(async () => {
    const game = window.game;
    const start = game.time;
    while (game.school.stepIndex === 15 && game.time - start < 20) {
      // the pad: the hall's middle (see PAD in src/world/yard.ts), on the crater floor 60 m below the field's center
      game.me.flight.position.set(24800, -1200 + game.me.radius + 100, 0);
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  expect(await page.evaluate(() => window.game.school.stepIndex)).toBe(16);
  expect(errors).toEqual([]);
});

test('on the address with ?campaign its first mission flies on the flight school’s machinery, and done it is kept', async ({ page }) => {
  // the mission at its last drill (Pim's words once docked), so it ends by itself and runs on into the next
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: [], step: 18, coins: 0, bond: 25000 })));
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await expect(page.locator('#school-step')).toContainText('Cold Boot 19/19', { timeout: 90_000 });
  await expect(page.locator('#school-step')).toContainText('Lamplighter 1/3', { timeout: 60_000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!));
  expect(kept.done).toEqual(['coldBoot']);
  expect(kept.step).toBe(0);
  // the flight school's own progress is untouched
  expect(await page.evaluate(() => localStorage.getItem('solartournament.school-step'))).toBeNull();
  expect(errors).toEqual([]);
});

test("after the docking lane the clone climbs out into Rask's office: Rask and Hedda in the flesh, the HUD only what is said, no hologram", async ({ page }) => {
  // the docking lane done up to its climb out of the cockpit (its fourth drill)
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: ['coldBoot', 'lamplighter', 'liveTarget', 'canisterSweep', 'cutter', 'firstCut'], step: 3, coins: 0, bond: 25000, parts: ['cutter', 'patch'] })));
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.stage && window.game.school?.attempt?.live, null, { timeout: 90_000 });
  // the figures come in as they are fetched: the set, Rask and Hedda
  await page.waitForFunction(() => window.game.stage.root.children.length === 3, null, { timeout: 30_000 });
  await expect(page.locator('#hud')).toHaveClass(/in-person/);
  await expect(page.locator('#school-panel')).toBeVisible();
  await expect(page.locator('#crosshair')).toBeHidden();
  expect(await page.evaluate(() => window.game.caller)).toBeNull();
  // the camera stands at the clone's eyes in the cab, not behind the ship
  const apart = await page.evaluate(() => window.game.camera.position.distanceTo(window.game.me.flight.position));
  expect(apart).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('the job board names the wallet, the Bond and the rank, takes the next job up where it was left, and flies a job done again from its start, keeping the story where it stands', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.campaign', JSON.stringify({ done: ['coldBoot', 'lamplighter'], step: 1, coins: 90, bond: 24940, ratings: 10, parts: ['patch'] })));
  const errors = await openGame(page, '/?campaign');
  await page.click('#campaign');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#board-wallet')).toContainText('90 ☉');
  await expect(page.locator('#board-wallet')).toContainText('Unrated');
  await expect(page.locator('#board-next button')).toContainText('Live Target');
  await expect(page.locator('#board-next button')).toContainText('Taken up where you left it.');
  await expect(page.locator('#board-done button')).toHaveCount(2);
  await expect(page.locator('#board-ship')).toContainText('the thrusters welded up');
  await expect(page.locator('#board-ship')).toContainText('none of her modules');
  // Escape goes back to the menu, the campaign's button opens the board again
  await page.keyboard.press('Escape');
  await expect(page.locator('#board')).toBeHidden();
  await page.click('#campaign');
  // Lamplighter flown again: from its first drill, the story's drill reached kept as it was
  await page.locator('#board-done button', { hasText: 'Lamplighter' }).click();
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  await expect(page.locator('#school-step')).toContainText('Lamplighter 1/3');
  await page.waitForFunction(() => window.game.school.stepIndex === 1, null, { timeout: 60_000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!));
  expect(kept.step).toBe(1);
  expect(kept.done).toEqual(['coldBoot', 'lamplighter']);
  expect(errors).toEqual([]);
});
