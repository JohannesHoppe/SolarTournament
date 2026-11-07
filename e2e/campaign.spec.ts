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

test('chapter 2 opens at the launch ring: the self-destruct held, the clone dies and its next print goes on the debt; then Patience’s galley, Hedda and Pim in the flesh', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify(kept)), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.venue?.id === 'rheasilvia' && window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  await expect(page.locator('#school-step')).toContainText('Rheasilvia 1/8');
  // the self-destruct held before the ring: the next print costs two thousand coins on the debt
  await page.keyboard.down('KeyB');
  await page.waitForFunction(() => window.game.school?.attempt?.warned, null, { timeout: 30_000 });
  await page.keyboard.up('KeyB');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).bond)).toBe(27000);
  // the galley's set and both figures, fetched as they come
  await page.waitForFunction(() => window.game.stage?.root.children.length === 3, null, { timeout: 30_000 });
  await expect(page.locator('#hud')).toHaveClass(/in-person/);
  expect(errors).toEqual([]);
});

test('the launch ring left alone is the gel: the agony over the link, the debt as it was', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify(kept)), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 60_000 }).toBe(1);
  expect(await page.evaluate(() => window.game.school.attempt?.warned ?? false)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).bond)).toBe(25000);
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

test('the Peak Run races three rivals through six old pipes, two laps, and counts the clone home', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify({ ...kept, done: [...kept.done, 'rheasilvia', 'claimSurvey', 'cutAndHaul', 'sawBrothers'] })), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.racers?.bots.length === 3, null, { timeout: 120_000 });
  // the rivals race off along the line towards the first pipe
  const off = await page.evaluate(async () => {
    const game = window.game;
    const ring = game.school.attempt.points[0];
    const before = game.racers.bots.map((bot: { ship: { flight: { position: { distanceTo(p: unknown): number } } } }) => bot.ship.flight.position.distanceTo(ring));
    const start = game.time;
    while (game.time - start < 6) await new Promise((resolve) => requestAnimationFrame(resolve));
    return game.racers.bots.map((bot: { ship: { flight: { position: { distanceTo(p: unknown): number } } } }, i: number) => before[i] - bot.ship.flight.position.distanceTo(ring));
  });
  for (const closer of off) expect(closer).toBeGreaterThan(0);
  // the clone flown through each pipe in turn, both laps, before any rival is home: it wins
  await page.evaluate(async () => {
    const game = window.game;
    const start = game.time;
    while (game.school.stepIndex === 1 && game.time - start < 60) {
      const attempt = game.school.attempt;
      const ring = attempt.points[attempt.next % attempt.points.length];
      const normal = attempt.normals[attempt.next % attempt.points.length];
      game.me.flight.position.copy(ring).addScaledVector(normal, attempt.side < 0 ? 400 : -400);
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(2);
  expect(errors).toEqual([]);
});

test('Practice Log hears the first echo once the clone holds still before a lit tunnel', async ({ page }) => {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify({ ...kept, done: [...kept.done, 'rheasilvia', 'claimSurvey', 'cutAndHaul', 'sawBrothers', 'peakRun'] })), CHAPTER_ONE_DONE);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  await page.waitForFunction(() => window.game.school?.attempt?.live && window.game.school.attempt.points?.length === 1 && window.game.me?.alive, null, { timeout: 120_000 });
  // the clone held at rest before the tunnel's mouth, until the echo plays
  await page.waitForFunction(
    () => {
      const game = window.game;
      if (game.school.stepIndex !== 0) return true;
      game.me.flight.position.copy(game.school.attempt.points[0]);
      game.me.flight.velocity.set(0, 0, 0);
      return false;
    },
    null,
    { timeout: 30_000, polling: 50 },
  );
  expect(await page.evaluate(() => window.game.school.stepIndex)).toBe(1);
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

/** The running mission at its drill `step`, without an error on the page. */
async function movesOn(page: Page, step: number, errors: string[]) {
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(step);
  expect(errors).toEqual([]);
}

/** The campaign as `kept` says, the game opened with `?campaign` and the next job taken; the page's errors. */
async function takeJobFrom(page: Page, kept: object): Promise<string[]> {
  await page.addInitScript((kept) => localStorage.setItem('solartournament.campaign', JSON.stringify(kept)), kept);
  const errors = await openGame(page, '/?campaign');
  await takeNextJob(page);
  return errors;
}

/** The clone held still at an echo (the export `echo` of the missions), or at the drill's first point as it moves (`first`), while the mission is at drill `step`, until it moves on (20 s at most). */
async function holdAtEcho(page: Page, echo: 'ECHO_TWO' | 'ECHO_THREE' | 'ECHO_FOUR' | 'ECHO_SEVEN' | 'ECHO_EIGHT' | 'ECHO_NINE' | 'first', step: number) {
  await page.evaluate(
    async ([path, echo, step]) => {
      const game = window.game;
      const at = echo === 'first' ? null : ((await import(path)) as typeof import('../src/campaign/missions'))[echo];
      const start = game.time;
      while (game.school?.stepIndex === step && game.time - start < 20) {
        game.me.flight.position.copy(at ?? game.school.attempt.points[0]);
        game.me.flight.velocity.set(0, 0, 0);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    },
    ['/src/campaign/missions.ts', echo, step] as const,
  );
}

/** A race of the campaign at `venue`, its drill `step` running: five rivals lined up, Perihelion among them, at eight rings. */
async function linedUp(page: Page, venue: string, step: number) {
  await page.waitForFunction(([venue, step]) => window.game.venue?.id === venue && window.game.school?.stepIndex === step && window.game.school.attempt?.live && window.game.racers?.bots.length === 5, [venue, step] as const, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.racers.bots.map((bot: { ship: { name: string } }) => bot.ship.name))).toContain('Perihelion');
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(8);
}

/** Chapter 2 flown: every mission of it done, the thrusters rebuilt, three thousand coins in the wallet. */
const CHAPTER_TWO_DONE = { ...CHAPTER_ONE_DONE, done: [...CHAPTER_ONE_DONE.done, 'rheasilvia', 'claimSurvey', 'cutAndHaul', 'sawBrothers', 'peakRun', 'practiceLog'], coins: 3000, ratings: 300, parts: [...CHAPTER_ONE_DONE.parts, 'thrusters'] };

test('chapter 3 opens at Occator: the clone held before the market’s mouth is docked, and Surplus fits the military laser, paid from the wallet and the rest on the debt, with targeting', async ({ page }) => {
  // both missions' lines are said out in full
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, CHAPTER_TWO_DONE);
  await page.waitForFunction(() => window.game.venue?.id === 'occator' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 120_000 });
  // the clone set at rest at the market's dock, the drill's waypoint
  await page.evaluate(async (path) => {
    const game = window.game;
    const { MARKET_DOCK } = (await import(path)) as typeof import('../src/world/ceres');
    const start = game.time;
    while (game.school?.stepIndex === 1 && game.time - start < 20) {
      game.me.flight.position.copy(MARKET_DOCK);
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, '/src/world/ceres.ts');
  await expect.poll(() => page.evaluate(() => window.game.school?.stepIndex), { timeout: 20_000 }).toBe(2);
  // the mission runs on into Surplus, fitted as it is done: the laser, three thousand from the wallet, three thousand on the debt
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('surplus')), { timeout: 120_000 }).toBe(true);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!));
  expect(kept.parts).toContain('laser');
  expect(kept.modules).toContain('targeting');
  expect([kept.coins, kept.bond]).toEqual([0, 28000]);
  expect(errors).toEqual([]);
});

test('Ore Barge sets the barge out on its lane, sends the scrappers at its hull, and the second wave once the first is down', async ({ page }) => {
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus'], coins: 0, parts: [...CHAPTER_TWO_DONE.parts, 'laser'], modules: ['targeting'] };
  const errors = await takeJobFrom(page, kept);
  await page.waitForFunction(() => window.game.venue?.id === 'occator' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 120_000 });
  // the first wave comes and its beams wear the barge's hull
  await page.evaluate(() => (window.game.timeScale = 4));
  await page.waitForFunction(() => window.game.school.attempt?.count === 1 && window.game.jumpers?.hits > 0, null, { timeout: 60_000 });
  // the first wave shot down: the second comes
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots) bot.ship.alive = false;
  });
  await page.waitForFunction(() => window.game.school.attempt?.count === 2 && window.game.jumpers?.bots.every((b: { ship: { alive: boolean } }) => b.ship.alive), null, { timeout: 30_000 });
  await page.evaluate(() => (window.game.timeScale = 1));
  expect(errors).toEqual([]);
});

test('Repo Men: the tug’s harpoon reels the hull in, and beams on its winch break it free', async ({ page }) => {
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge'], coins: 1200, parts: [...CHAPTER_TWO_DONE.parts, 'laser'], modules: ['targeting'] };
  const errors = await takeJobFrom(page, kept);
  await page.waitForFunction(() => window.game.venue?.id === 'occator' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 180_000 });
  // the harpoon bites and the cable shortens
  await page.waitForFunction(() => window.game.school.attempt?.reach > 0, null, { timeout: 30_000 });
  const first = await page.evaluate(() => window.game.school.attempt.reach);
  await expect.poll(() => page.evaluate(() => window.game.school.attempt?.reach ?? 0), { timeout: 10_000 }).toBeLessThan(first - 200);
  // beams that end on the winch count, and enough of them break the hull free
  await page.evaluate(async () => {
    const game = window.game;
    const winch = game.school.markers.winchAt(game.me.flight.position.clone());
    for (let k = 0; k < 20 && game.school?.stepIndex === 2; k++) {
      game.school.struck(winch);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  await movesOn(page, 3, errors);
});

test('Wall Run: the barge follows the hull low over the Solar Wall’s top edge, under the searchlights, and through', async ({ page }) => {
  test.setTimeout(300_000);
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge', 'repoMen'], coins: 2700, parts: [...CHAPTER_TWO_DONE.parts, 'laser'], modules: ['targeting'] };
  const errors = await takeJobFrom(page, kept);
  await page.waitForFunction(() => window.game.venue?.id === 'wall' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 120_000 });
  // the hull flown up to 50 m over the edge, across it, and on; time runs three times as fast
  await page.evaluate(() => {
    const game = window.game;
    game.timeScale = 3;
    const flight = game.me.flight;
    const way = [[-40000, 0, 2000], [-6000, 5000, 2000], [6000, 5000, 2000], [60000, 3000, 2000]];
    let k = 0;
    // how often the searchlights saw the barge during the run (read while it lasts: the next drill has a count of its own)
    (window as unknown as { wallSeen: number }).wallSeen = 0;
    const steer = () => {
      if (game.school?.stepIndex !== 1) return;
      (window as unknown as { wallSeen: number }).wallSeen = game.school.attempt?.count ?? 0;
      const [x, y, z] = way[k];
      const d = flight.position.clone().set(x, y, z).sub(flight.position);
      if (d.length() < 600 && k < way.length - 1) k++;
      flight.velocity.copy(d.normalize().multiplyScalar(600));
      requestAnimationFrame(steer);
    };
    steer();
  });
  await page.waitForFunction(() => window.game.school?.stepIndex === 2, null, { timeout: 240_000 });
  // through, seen at most once (twice fails the run)
  expect(await page.evaluate(() => (window as unknown as { wallSeen: number }).wallSeen)).toBeLessThan(2);
  await page.evaluate(() => (window.game.timeScale = 1));
  expect(errors).toEqual([]);
});

test('Scout Two grinds the grey off: the old livery shows on the hull once the second echo is heard', async ({ page }) => {
  test.setTimeout(300_000);
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge', 'repoMen', 'wallRun'], coins: 3700, parts: [...CHAPTER_TWO_DONE.parts, 'laser'], modules: ['targeting'] };
  const errors = await takeJobFrom(page, kept);
  await page.waitForFunction(() => window.game.venue?.id === 'occator' && window.game.school?.stepIndex === 4 && window.game.school.attempt?.live && window.game.me?.alive, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.me.model.getObjectByName('livery')?.visible)).toBe(false);
  // the clone held before the wall's second step: the echo, and the livery on the hull from then on
  await holdAtEcho(page, 'ECHO_TWO', 4);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).parts.includes('stripped')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('chapter 4 opens on Phobos: the Stickney Grand lines up five rivals, Perihelion among them, at eight rings down into the crater', async ({ page }) => {
  test.setTimeout(300_000);
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge', 'repoMen', 'wallRun', 'scoutTwo', 'overhaul'], coins: 2100, parts: [...CHAPTER_TWO_DONE.parts, 'laser', 'stripped', 'drive'], modules: ['targeting'] };
  const errors = await takeJobFrom(page, kept);
  await linedUp(page, 'phobos', 2);
  expect(errors).toEqual([]);
});

test('Debt Day: four collectors shot down, the Navy hails, and the benefactor holds the debt from then on', async ({ page }) => {
  test.setTimeout(300_000);
  const kept = { ...CHAPTER_TWO_DONE, done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge', 'repoMen', 'wallRun', 'scoutTwo', 'overhaul', 'stickneyGrand'], coins: 3100, parts: [...CHAPTER_TWO_DONE.parts, 'laser', 'stripped', 'drive'], modules: ['targeting', 'racingLine'] };
  const errors = await takeJobFrom(page, kept);
  await page.waitForFunction(() => window.game.venue?.id === 'phobos' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 6, null, { timeout: 180_000 });
  await page.evaluate(() => window.game.jumpers.bots.slice(0, 4).forEach((bot: { ship: { alive: boolean } }) => (bot.ship.alive = false)));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).held), { timeout: 180_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 4 flown, and of chapter 5 the missions `done` (each after the one before): the debt held, the hull armored, Nicole's radar in once Pilot Episode is done. */
const chapterFive = (...done: string[]) => ({
  ...CHAPTER_TWO_DONE,
  done: [...CHAPTER_TWO_DONE.done, 'occator', 'surplus', 'oreBarge', 'repoMen', 'wallRun', 'scoutTwo', 'overhaul', 'stickneyGrand', 'debtDay', 'grooveShoot', 'armorPanels', ...done],
  coins: 9000,
  parts: [...CHAPTER_TWO_DONE.parts, 'laser', 'stripped', 'drive', 'panels'],
  modules: done.length ? ['targeting', 'racingLine', 'radar'] : ['targeting', 'racingLine'],
  held: true,
});

test('Pilot Episode: over Valhalla on Callisto, Red Ledger shot down ends the bounty, and Nicole has her radar', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive());
  await page.waitForFunction(() => window.game.venue?.id === 'callisto' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 3, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Red Ledger');
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.alive = false));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('pilotEpisode')), { timeout: 180_000 }).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).modules)).toContain('radar');
  expect(errors).toEqual([]);
});

test('Ice Run: the Loose harpoon the ice tugs, one each, and a tug whose raider is shot down is free again', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode'));
  await page.waitForFunction(() => window.game.venue?.id === 'callisto' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  // the Loose come and harpoon a tug
  await page.waitForFunction(() => window.game.school.markers.hookedBy.some((ship: unknown) => ship), null, { timeout: 120_000 });
  const holders = await page.evaluate(() => window.game.school.markers.hookedBy.filter((ship: unknown) => ship).map((ship: { name: string }) => ship.name));
  expect(new Set(holders).size).toBe(holders.length);
  // the raider holding the first tug held shot down: its cable lets go (another of the Loose may harpoon the tug again)
  const [index, name] = await page.evaluate(() => {
    const hooked: ({ alive: boolean; name: string } | null)[] = window.game.school.markers.hookedBy;
    const i = hooked.findIndex((ship) => ship);
    hooked[i]!.alive = false;
    return [i, hooked[i]!.name] as const;
  });
  await expect.poll(() => page.evaluate((i) => window.game.school.markers.hookedBy[i]?.name ?? null, index), { timeout: 20_000 }).not.toBe(name);
  expect(errors).toEqual([]);
});

test('Valhalla Sprint: six coils in a straight line over Valhalla, the clock starting at the first', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun'));
  await page.waitForFunction(() => window.game.venue?.id === 'callisto' && window.game.school?.stepIndex === 0 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(6);
  expect(await page.evaluate(() => Number.isNaN(window.game.school.attempt.clockFrom))).toBe(true);
  expect(errors).toEqual([]);
});

test('Callisto Echo: the hull held still over the listening post’s dish hears the third echo', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint'));
  await page.waitForFunction(() => window.game.venue?.id === 'callisto' && window.game.school?.stepIndex === 0 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await holdAtEcho(page, 'ECHO_THREE', 0);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Under the Lineae: down in Europa’s Crack, the hull held over the science station’s dish hears the fourth echo', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators', 'dose'));
  await page.waitForFunction(() => window.game.venue?.id === 'europa' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await holdAtEcho(page, 'ECHO_FOUR', 1);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('chapter 6 opens on Europa: Dose sets the tanker on its lane, and the belt doses the clone over the ice, never down in the Crack', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators'));
  await page.waitForFunction(() => window.game.venue?.id === 'europa' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.markers.hookedBy.length)).toBe(1);
  // the clone held at (x, y, z) for two seconds: the dose it takes meanwhile
  const taken = (x: number, y: number, z: number) =>
    page.evaluate(
      async ([x, y, z]) => {
        const game = window.game;
        const start = game.time;
        const before: number = game.school.attempt.taken;
        while (game.time - start < 2) {
          game.me.flight.position.set(x, y, z);
          game.me.flight.velocity.set(0, 0, 0);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return game.school.attempt.taken - before;
      },
      [x, y, z] as const,
    );
  // 500 m over the ice the belt doses the clone; in the Crack, 500 m down, nothing
  expect(await taken(30000, 8000, 30000)).toBeGreaterThan(0);
  const middle = await page.evaluate(async (path) => ((await import(path)) as typeof import('../src/world/europa')).crackMiddle(30000), '/src/world/europa.ts');
  expect(await taken(middle, -12000, 30000)).toBe(0);
  expect(errors).toEqual([]);
});

for (const [outcome, ratings] of [['shot down', 250], ['let go', 100]] as const) {
  test(`The Quiet Man ${outcome}: he never finishes the clone, turns away, and pays ${ratings} ratings`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators', 'dose', 'underTheLineae'));
    await page.waitForFunction(() => window.game.venue?.id === 'europa' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 1, null, { timeout: 180_000 });
    const before: number = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).ratings);
    // the clone worn down to where he spares it: he turns away
    await page.evaluate(() => (window.game.me.hull = 20));
    await page.waitForFunction(() => window.game.school.attempt.count === 1, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.game.me.alive)).toBe(true);
    if (outcome === 'shot down') await page.evaluate(() => (window.game.jumpers.bots[0].ship.alive = false));
    else
      await page.evaluate(() => {
        const ship = window.game.jumpers.bots[0].ship;
        ship.flight.position.set(-50000, 6000, 30000);
      });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('quietMan')), { timeout: 60_000 }).toBe(true);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!));
    expect(kept.ratings - before).toBe(ratings);
    expect(kept.choices.includes('quietManSpared')).toBe(outcome === 'let go');
    expect(errors).toEqual([]);
  });
}

test('chapter 7 opens on Io: the Flux Tube Race lines up five rivals, Perihelion among them, at eight rings past the flux tube', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators', 'dose', 'underTheLineae', 'quietMan', 'plating'));
  await linedUp(page, 'io', 1);
  expect(errors).toEqual([]);
});

test('Blackout: in the flux tube the link cuts, the picture white with LINK LOST and no rot, and a new clone wakes; it cannot fail', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, chapterFive('pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators', 'dose', 'underTheLineae', 'quietMan', 'plating', 'fluxTubeRace', 'tubeFitting', 'mainDrive'));
  await page.waitForFunction(() => window.game.venue?.id === 'io' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  // the freighter flown on to where the lane meets the tube
  await page.evaluate(() => (window.game.school.attempt.seconds = 1000));
  await expect(page.locator('#link-lost')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#link-lost')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('blackout')), { timeout: 180_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapters 5 to 7 flown, all of them: the hull as far as Io fits it. */
const CHAPTER_SEVEN = ['pilotEpisode', 'iceRun', 'valhallaSprint', 'callistoEcho', 'radiators', 'dose', 'underTheLineae', 'quietMan', 'plating', 'fluxTubeRace', 'tubeFitting', 'mainDrive', 'blackout'];

test('chapter 8 opens over Ganymede: Hollow Jack and three of the Loose among the ice, Jack shot down ends the bounty; then his harpoon, flown through, is the hook', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await takeJobFrom(page, chapterFive(...CHAPTER_SEVEN));
  await page.waitForFunction(() => window.game.venue?.id === 'ganymede' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 4, null, { timeout: 240_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Hollow Jack');
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.alive = false));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('hollowJack')), { timeout: 240_000 }).toBe(true);
  // The Harpoon: the clone held where the piece drifts
  await page.waitForFunction(() => window.game.school?.stepIndex === 0 && window.game.school.attempt?.live && window.game.school.attempt.points.length === 1, null, { timeout: 120_000 });
  await holdAtEcho(page, 'first', 0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).parts.includes('hook')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('Swing Shift faces the hull to a block of ice of the tug yard, three times to hook and swing', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...chapterFive(...CHAPTER_SEVEN, 'hollowJack', 'harpoon'), parts: ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'hook'] });
  await page.waitForFunction(() => window.game.venue?.id === 'ganymede' && window.game.school?.stepIndex === 0 && window.game.school.attempt?.live, null, { timeout: 240_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(1);
  expect(await page.evaluate(() => window.game.me.perks.hook)).toBe(true);
  expect(errors).toEqual([]);
});

test('chapter 9 opens on Titan: the Qualifying Heat lines up five rivals, Perihelion among them, at eight coils over and into the haze, the air the place’s own', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...chapterFive(...CHAPTER_SEVEN, 'hollowJack', 'harpoon', 'swingShift', 'sponsorNight'), parts: ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'hook'] });
  await linedUp(page, 'titan', 1);
  expect(await page.evaluate(() => !!window.game.field.air)).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 8 flown too: the hull with its hook, over Titan. */
const CHAPTER_EIGHT = [...CHAPTER_SEVEN, 'hollowJack', 'harpoon', 'swingShift', 'sponsorNight'];
const titanHull = (...done: string[]) => ({ ...chapterFive(...CHAPTER_EIGHT, ...done), parts: ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'hook'] });

test('the Pit Fight sets five of the Circuit on each other and the Host in Titan’s haze, every ship for itself', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, titanHull('qualifyingHeat'));
  await page.waitForFunction(() => window.game.venue?.id === 'titan' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 5, null, { timeout: 180_000 });
  const allied = await page.evaluate(() => {
    const ships = window.game.jumpers.bots.map((bot: { ship: { allyOf: (other: unknown) => boolean } }) => bot.ship);
    return ships.some((ship: { allyOf: (other: unknown) => boolean }) => ships.some((other: unknown) => ship.allyOf(other)));
  });
  expect(allied).toBe(false);
  expect(errors).toEqual([]);
});

test('the Haze Duel: Perihelion breaks off once his hull is worn down, before his clone can die, and the duel is won', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, titanHull('qualifyingHeat', 'pitFight'));
  await page.waitForFunction(() => window.game.venue?.id === 'titan' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 1, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Perihelion');
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.hull = 30));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('hazeDuel')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('Methane Echo: the hull held still low over Kraken Mare hears the seventh echo', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, titanHull('qualifyingHeat', 'pitFight', 'hazeDuel', 'circuitFinal'));
  await page.waitForFunction(() => window.game.venue?.id === 'titan' && window.game.school?.stepIndex === 0 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await holdAtEcho(page, 'ECHO_SEVEN', 0);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/** Chapter 9 flown too: the hull with its second tube and Thrusters I, at Enceladus. */
const enceladusHull = (...done: string[]) => ({ ...titanHull('qualifyingHeat', 'pitFight', 'hazeDuel', 'circuitFinal', 'methaneEcho', 'secondTube', 'thrustersOne', ...done), parts: ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'hook', 'secondTube', 'thrustersOne'] });

test('the Plume Yacht: Crisp’s actors fire wide and hurt nobody, then real raiders shoot them down and go for the yacht; all of them down wins', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, enceladusHull());
  await page.waitForFunction(() => window.game.venue?.id === 'enceladus' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 3, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots.map((bot: { ship: { name: string } }) => bot.ship.name))).toEqual(['Lance Steel', 'Rex Danger', 'Ace Hart']);
  // the clone parked by an actor: its shots fly wide
  const hull = await page.evaluate(async () => {
    const game = window.game;
    const start = game.time;
    while (game.time - start < 10) {
      const actor = game.jumpers.bots[0].ship;
      game.me.flight.position.copy(actor.flight.position).add({ x: 0, y: 0, z: 1500 } as never);
      game.me.flight.velocity.set(0, 0, 0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return game.me.hull;
  });
  expect(hull).toBe(100);
  await page.waitForFunction(() => window.game.jumpers?.bots[0]?.ship.name === 'Spite', null, { timeout: 60_000 });
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots) bot.ship.alive = false;
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('plumeYacht')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('Hello, Host: Spare in his grey interceptor breaks off at half his hull, and his hail follows', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...enceladusHull('plumeYacht', 'platingTwo', 'voiceTwo'), modules: ['targeting', 'racingLine', 'radar', 'threat', 'voice'] });
  await page.waitForFunction(() => window.game.venue?.id === 'enceladus' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 1, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Spare');
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.hull = 45));
  await page.waitForFunction(() => (window.game.school?.stepIndex ?? 0) > 2, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.game.jumpers?.bots[0]?.ship.alive ?? true)).toBe(true);
  expect(errors).toEqual([]);
});

test('Tiger Stripes: eight coils over the four stripes at Enceladus, the clock not yet running before the first', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...enceladusHull('plumeYacht', 'platingTwo', 'voiceTwo', 'helloHost'), modules: ['targeting', 'racingLine', 'radar', 'threat', 'voice'] });
  await page.waitForFunction(() => window.game.venue?.id === 'enceladus' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(8);
  expect(await page.evaluate(() => Number.isFinite(window.game.school.attempt.clockFrom))).toBe(false);
  expect(errors).toEqual([]);
});

/** Chapter 10 flown too: the hull with Plating II and Nicole's own voice, at Iapetus. */
const iapetusHull = (...done: string[]) => ({ ...enceladusHull('plumeYacht', 'platingTwo', 'voiceTwo', 'helloHost', 'tigerStripes', ...done), parts: ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'hook', 'secondTube', 'thrustersOne', 'platingTwo'], modules: ['targeting', 'racingLine', 'radar', 'threat', 'voice'] });

test('The Ridge: the hull held still over the crest of Iapetus’s ridge hears the eighth echo, while Spare’s two strays race for it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, iapetusHull());
  await page.waitForFunction(() => window.game.venue?.id === 'iapetus' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await page.waitForFunction(() => window.game.jumpers?.bots.length === 2, null, { timeout: 30_000 });
  await holdAtEcho(page, 'ECHO_EIGHT', 1);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('Office Hours: the clone climbs up to Patience’s galley, Hedda and Commissioner Quill in the flesh', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, iapetusHull('theRidge'));
  await page.waitForFunction(() => window.game.stage && window.game.school?.attempt?.live, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.game.stage.root.children.length === 3, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.venue?.id)).toBe('iapetus');
  expect(errors).toEqual([]);
});

test('Last of the Tallymen: Ma Tally and three escorts round her tug at Iapetus’s dark face; all four down wins', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...iapetusHull('theRidge', 'officeHours', 'driveTwo'), parts: [...iapetusHull().parts, 'driveTwo', 'radiatorsTwo'] });
  await page.waitForFunction(() => window.game.venue?.id === 'iapetus' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 4, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Ma Tally');
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots.slice(0, 3)) bot.ship.alive = false;
  });
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.game.school?.stepIndex)).toBe(2);
  await page.evaluate(() => (window.game.jumpers.bots[3].ship.alive = false));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('lastTallymen')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 11 flown too: the hull with Drive II, for the Ring Trials. */
const trialsHull = (...done: string[]) => ({ ...iapetusHull('theRidge', 'officeHours', 'driveTwo', 'lastTallymen', ...done), parts: [...iapetusHull().parts, 'driveTwo', 'radiatorsTwo'] });

test('Trial I: after its briefing a whole race of the Games in the Rings, flown in the campaign’s hull; first at the end passes it, paid in the campaign and not in the hangar', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, trialsHull());
  // the briefing said, the trial’s round begins
  await page.waitForFunction(() => window.game.school?.attempt?.live, null, { timeout: 180_000 });
  await page.waitForFunction(() => !window.game.school && window.game.venue?.id === 'rings' && window.game.roundMode === 'race' && window.game.ships.length === 8, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.game.me.type)).toBe('magpie');
  const coins = await page.evaluate(() => localStorage.getItem('solartournament.hangar'));
  // the Host first home, the clock run out
  await page.evaluate(() => {
    const game = window.game;
    game.me.finish = 1;
    game.roundEndsAt = game.time;
  });
  await page.waitForFunction(() => window.game.state === 'results', null, { timeout: 30_000 });
  await expect(page.locator('#results-next')).toContainText('Trial I');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('trialRace'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('solartournament.hangar'))).toBe(coins);
  expect(errors).toEqual([]);
});

/** Chapter 12 flown too: the hull with its third tube, at Miranda. */
const mirandaHull = (...done: string[]) => ({ ...trialsHull('trialRace', 'trialDeathmatch', 'trialFlag', 'trialCarrier', 'tubesOne', 'invitation', ...done), parts: [...trialsHull().parts, 'tubesOne'] });

test('Verona Drop: down the cliff’s face through six buoys to the hideout’s mouth', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, mirandaHull());
  await page.waitForFunction(() => window.game.venue?.id === 'miranda' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(6);
  await visitPoints(page, 0);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('The Sweep: six Navy fighters for the hideout’s mouth, Spare on the Host’s wing on its side, all of them down wins', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, { ...mirandaHull('veronaDrop', 'amongTheLoose'), parts: [...mirandaHull().parts, 'overdrive'] });
  await page.waitForFunction(() => window.game.venue?.id === 'miranda' && window.game.school?.stepIndex === 2 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 6, null, { timeout: 180_000 });
  const sides = await page.evaluate(() => {
    const spare = window.game.ships.find((ship: { name: string }) => ship.name === 'Spare');
    return { spare: !!spare, ally: spare?.allyOf(window.game.me), enemy: spare?.allyOf(window.game.jumpers.bots[0].ship) };
  });
  expect(sides).toEqual({ spare: true, ally: true, enemy: false });
  expect(await page.evaluate(() => window.game.me.perks.overdrive)).toBe(true);
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots) bot.ship.alive = false;
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('theSweep')), { timeout: 120_000 }).toBe(true);
  expect(await page.evaluate(() => window.game.me?.team ?? -1)).toBe(-1);
  expect(errors).toEqual([]);
});

/** Chapter 13 flown too: the hull with the overdrive and Thrusters II, at Triton. */
const tritonHull = (...done: string[]) => ({ ...mirandaHull('veronaDrop', 'amongTheLoose', 'theSweep', 'thrustersTwo', ...done), parts: [...mirandaHull().parts, 'overdrive', 'thrustersTwo'] });

test('Geyser Field: coils past Triton’s geysers to the Memorial Station; a geyser’s column throws the hull up', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, tritonHull());
  await page.waitForFunction(() => window.game.venue?.id === 'triton' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBeGreaterThan(4);
  const climb = await page.evaluate(async (path) => {
    const { GEYSERS_AT } = (await import(path)) as typeof import('../src/world/triton');
    const game = window.game;
    const at = GEYSERS_AT[0].clone();
    at.y += 1000;
    game.me.flight.position.copy(at);
    game.me.flight.velocity.set(0, 0, 0);
    const start = game.time;
    while (game.time - start < 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    return game.me.flight.velocity.y;
  }, '/src/world/triton.ts');
  // thrown up though the flight computer fights it (see GEYSER_PUSH)
  expect(climb).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('The Memorial and Grave Shift: the ninth echo held at the Derelict’s torn bow past a Navy guard, then out to the arena’s edge with the guard on the tail', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, tritonHull('geyserField', 'oldAdmiral'));
  await page.waitForFunction(() => window.game.venue?.id === 'derelict' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 4, null, { timeout: 180_000 });
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots) bot.ship.protectedUntil = Infinity;
  });
  await holdAtEcho(page, 'ECHO_NINE', 1);
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('theMemorial')), { timeout: 120_000 }).toBe(true);
  // Grave Shift: the hull set past the edge's mark
  await page.waitForFunction(() => window.game.school?.mission?.id === 'graveShift' && window.game.school.attempt?.live, null, { timeout: 120_000 });
  await page.evaluate(() => {
    window.game.me.flight.position.set(64000, 0, 0);
    window.game.me.flight.velocity.set(0, 0, 0);
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('graveShift')), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 14 flown too: the hull with Thrusters III, at Pluto. */
const plutoHull = (...done: string[]) => ({ ...tritonHull('geyserField', 'oldAdmiral', 'theMemorial', 'graveShift', 'thrustersThree', ...done), parts: [...tritonHull().parts, 'thrustersThree'] });

test('chapter 15 at Pluto: the Heart Run lines up five Feeders at eight rings over the heart, every ring inside the arena', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, plutoHull());
  await page.waitForFunction(() => window.game.venue?.id === 'pluto' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.racers?.bots.length === 5, null, { timeout: 180_000 });
  const rings = await page.evaluate(() => window.game.school.attempt.points.map((p: { length: () => number }) => p.length()));
  expect(rings.length).toBe(8);
  for (const reach of rings) expect(reach).toBeLessThan(67500);
  expect(errors).toEqual([]);
});

test('The File: Spare aboard Patience in the flesh, Hedda at the table', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, plutoHull('heartRun'));
  await page.waitForFunction(() => window.game.stage && window.game.school?.attempt?.live, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.game.stage.root.children.length === 3, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.game.venue?.id)).toBe('pluto');
  expect(errors).toEqual([]);
});

test('Last Light: Ministry pickets fire at Patience moored at the last dock; all six down wins, and Nicole’s wells come with the next job', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, plutoHull('heartRun', 'theFile', 'plutoEcho'));
  await page.waitForFunction(() => window.game.venue?.id === 'pluto' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 6, null, { timeout: 180_000 });
  await page.evaluate(() => {
    for (const bot of window.game.jumpers.bots) bot.ship.alive = false;
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('lastLight')), { timeout: 120_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).modules.includes('wells')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 15 flown too: the hull with Plating III and Nicole's wells, on the Ladder. */
const ladderHull = (...done: string[]) => ({ ...plutoHull('heartRun', 'theFile', 'plutoEcho', 'lastLight', 'wells', 'platingThree', ...done), parts: [...plutoHull().parts, 'platingThree'], modules: ['targeting', 'racingLine', 'radar', 'threat', 'voice', 'wells'] });

test('chapter 16 on the Ladder: five depot crews line up at eight rings in Haumea’s ring', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await takeJobFrom(page, ladderHull());
  await page.waitForFunction(() => window.game.venue?.id === 'haumea' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.racers?.bots.length === 5, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(8);
  expect(errors).toEqual([]);
});

test('The Hunter: Perihelion and two Navy fighters at Eris; worn down to a third of his hull he breaks off, and the duel is won', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, ladderHull('haumeaRing', 'rungTwo'));
  await page.waitForFunction(() => window.game.venue?.id === 'eris' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.jumpers?.bots.length === 3, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.jumpers.bots[0].ship.name)).toBe('Perihelion');
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.hull = 30));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('theHunter')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 16 flown too: the hull with Drive III, at Lantern. */
const lanternHull = (...done: string[]) => ({ ...ladderHull('haumeaRing', 'rungTwo', 'theHunter', 'driveThree', ...done), parts: [...ladderHull().parts, 'driveThree', 'radiatorsThree'] });

test('chapter 17: Kiln’s six beacons called at in turn over Lantern; at Granary the comet bound for the Ninth is reached', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await takeJobFrom(page, lanternHull());
  await page.waitForFunction(() => window.game.venue?.id === 'lantern' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.school.attempt.points.length)).toBe(6);
  await visitPoints(page, 0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('kiln')), { timeout: 120_000 }).toBe(true);
  // Granary: the hull set beside the comet, out of every cone
  await page.waitForFunction(() => window.game.venue?.id === 'granary' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const game = window.game;
    game.me.flight.position.copy(game.school.attempt.points[0]).add({ x: 0, y: 4000, z: 0 } as never);
    game.me.flight.velocity.set(0, 0, 0);
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('granary')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

/** Chapter 17 flown too: the hull with every tube, at the Ninth. */
const ninthHull = (...done: string[]) => ({ ...lanternHull('kiln', 'granary', 'granaryEcho', 'rideComet', 'tubesComplete', ...done), parts: [...lanternHull().parts, 'tubesTwo', 'tubesThree'] });

test('The Drain: Scout One lies among the Feeders’ ice by the hole, named on the HUD; the crosshair held on her scans her', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, ninthHull());
  await page.waitForFunction(() => window.game.venue?.id === 'hole' && window.game.school?.stepIndex === 1 && window.game.school.attempt?.live && window.game.drone?.name === 'Scout One', null, { timeout: 180_000 });
  // the nose held on her from a kilometer off until the scan is done
  await page.evaluate(async () => {
    const game = window.game;
    const scout = game.drone.flight.position;
    const Vector = scout.constructor;
    const ahead = new Vector(0, 0, -1);
    const west = new Vector(-1, 0, 0);
    const start = game.time;
    while (game.school?.stepIndex === 1 && game.time - start < 15) {
      game.me.flight.position.copy(scout).add(new Vector(20000, 0, 0));
      game.me.flight.velocity.set(0, 0, 0);
      game.me.flight.angularVelocity.set(0, 0, 0);
      game.me.flight.orientation.setFromUnitVectors(ahead, west);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('First Death: Perihelion and four Navy fighters, Spare on the Host’s side; Perihelion shot down ends it, with no breaking off', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, ninthHull('theDrain', 'scoutOne', 'feedersComet'));
  await page.waitForFunction(() => window.game.venue?.id === 'hole' && window.game.school?.attempt?.live && window.game.jumpers?.bots.length === 5, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.game.ships.find((ship: { name: string; allyOf: (o: unknown) => boolean }) => ship.name === 'Spare')?.allyOf(window.game.me))).toBe(true);
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.hull = 30));
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('firstDeath'))).toBe(false);
  await page.evaluate(() => (window.game.jumpers.bots[0].ship.alive = false));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).done.includes('firstDeath')), { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('chapter 19 at the Ballroom: the Parade’s slot moves along ten rings over the dome; kept to it, the parade is flown', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, ninthHull('theDrain', 'scoutOne', 'feedersComet', 'firstDeath', 'lastOrbit', 'theDeal'));
  await page.waitForFunction(() => window.game.venue?.id === 'ballroom' && window.game.school?.stepIndex === 0 && window.game.school.attempt?.live, null, { timeout: 180_000 });
  await page.evaluate(
    async ([path]) => {
      const { slotAt } = (await import(path)) as typeof import('../src/campaign/missions');
      const game = window.game;
      const slot = game.me.flight.position.clone();
      const start = game.time;
      while (game.school?.stepIndex === 0 && game.time - start < 90) {
        game.me.flight.position.copy(slotAt(game.school.attempt?.seconds ?? 0, slot));
        game.me.flight.velocity.set(0, 0, 0);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    },
    ['/src/campaign/missions.ts'] as const,
  );
  expect(await page.evaluate(() => window.game.school?.stepIndex ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the job board offers Nicole’s voice clean or with the old board’s crackle only once her own is back, and keeps the choice', async ({ page }) => {
  const errors = await takeJobFrom(page, trialsHull());
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.showBoard(true));
  await expect(page.locator('#board-voice')).toBeVisible();
  await expect(page.locator('#board-voice')).toContainText('clean');
  await page.click('#board-voice');
  await expect(page.locator('#board-voice')).toContainText('crackle');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.campaign')!).crackle)).toBe(true);
  expect(errors).toEqual([]);
});

test('Orbit at the Ninth: Patience’s printer gone, the clone’s death goes black, no ad, and the attempt starts over', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await takeJobFrom(page, ninthHull('theDrain', 'scoutOne', 'feedersComet', 'firstDeath'));
  await page.waitForFunction(() => window.game.venue?.id === 'hole' && window.game.school?.attempt?.live && window.game.school?.lastClone, null, { timeout: 180_000 });
  await page.evaluate(() => {
    window.game.me.alive = false;
    window.game.me.respawnAt = window.game.time;
  });
  await expect(page.locator('#no-clone')).toBeVisible();
  await expect(page.locator('#sponsor')).toBeHidden();
  await page.waitForFunction(() => window.game.me?.alive, null, { timeout: 30_000 });
  await expect(page.locator('#no-clone')).toBeHidden();
  expect(errors).toEqual([]);
});
