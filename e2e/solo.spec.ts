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

test('a hangar edited to what no Host can own is named on screen and not used, until it is put back or cleared', async ({ page, context }) => {
  const errors = await openGame(page);
  const insult = page.locator('#tampered');
  await expect(insult).toBeHidden();
  // edited in another tab: the storage event brings the insult at once
  const other = await context.newPage();
  await other.goto('/datenschutz.html');
  const honest = await other.evaluate(() => localStorage.getItem('solartournament.hangar'));
  await other.evaluate(() => localStorage.setItem('solartournament.hangar', JSON.stringify({ coins: 999_999_999, ship: 'human' })));
  await expect(insult).toBeVisible();
  await expect(insult).toContainText('CHEATER');
  await expect(page.locator('#hangar-note')).not.toContainText('999');
  // put back the way it was found: gone
  await other.evaluate((entry) => (entry === null ? localStorage.removeItem('solartournament.hangar') : localStorage.setItem('solartournament.hangar', entry)), honest);
  await expect(insult).toBeHidden();
  // edited in the own tab, which raises no storage event, it is noticed all the same, and clearing the storage forgives it
  await page.evaluate(() => localStorage.setItem('solartournament.hangar', JSON.stringify({ levels: { human: { drive: 7 } } })));
  await expect(insult).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await expect(insult).toBeHidden();
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

for (const kick of [true, false]) {
  test(`two ships side by side through a gate at 100 m/s: ${kick ? 'a kick puts the one at the band into it, a knockout for the kicker' : 'without a kick both pass'}`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page);
    // the opening's clamps hold every ship until the start
    await page.waitForFunction(() => window.game.clamped, null, { timeout: 60_000 });
    await page.waitForFunction(() => !window.game.clamped && window.game.me.alive, null, { timeout: 60_000 });
    const result = await page.evaluate(async (kick) => {
      const game = window.game;
      const me = game.me;
      const bot = game.bots[0];
      const victim = bot.ship;
      for (const ship of game.ships) {
        if (ship === me || ship === victim) continue;
        ship.alive = false;
        ship.respawnAt = Infinity;
      }
      // the victim flies straight on: its brain thinks, its hand stays still
      const think = bot.think.bind(bot);
      bot.think = (...args: unknown[]) => {
        const controls = think(...args);
        for (const key of Object.keys(controls)) controls[key] = typeof controls[key] === 'boolean' ? false : 0;
        bot.shove = null;
        return controls;
      };
      const Vector3 = me.flight.position.constructor;
      const center = game.course.points[2];
      const facing = game.course.normals[2].clone().normalize();
      const side = new Vector3(0, 1, 0).cross(facing).normalize();
      // the band's inner face is 2420 units (121 m) off the gate's axis: the victim passes 10 m
      // inside it, the Host 45 m further in, both 300 m before the gate
      const place = (ship: any, out: number) => {
        ship.flight.position.copy(center).addScaledVector(side, out).addScaledVector(facing, -6000);
        ship.flight.velocity.copy(facing).multiplyScalar(2000);
        ship.flight.angularVelocity.set(0, 0, 0);
        ship.flight.orientation.setFromUnitVectors(new Vector3(0, 0, -1), facing);
        ship.protectedUntil = 0;
        ship.syncTransform();
      };
      const out = 2420 - victim.radius - 200;
      place(victim, out);
      place(me, out - 900);
      const kills = me.kills;
      const deaths = victim.deaths;
      const start = game.time;
      const wait = async (seconds: number) => {
        while (game.time - start < seconds) await new Promise((resolve) => requestAnimationFrame(resolve));
      };
      await wait(1);
      if (kick) game.dodge({ x: Math.sign(me.flight.toLocal(victim.flight.position.clone()).x), y: 0 });
      await wait(3.5);
      return { died: victim.deaths > deaths, kills: me.kills - kills, banner: game.hud.bannerText.textContent };
    }, kick);
    expect(result).toEqual(kick ? { died: true, kills: 1, banner: 'KNOCKOUT' } : { died: false, kills: 0, banner: '' });
    expect(errors).toEqual([]);
  });
}
