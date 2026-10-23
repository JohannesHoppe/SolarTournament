import { expect, test } from '@playwright/test';
import { openGame, startSolo } from './game';

/**
 * A short stretch of a race flown with Playwright's mouse, as a Host does: alone on the course,
 * W held, the pointer put on the racing line a good second ahead as the screen shows it (through
 * the game's own camera), every tenth of a second. The DOM pointer, the input, the camera on the
 * course and the flight computer together have to bring the ship through the first gates.
 */
test('the mouse flies the first gates of a race', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page);
  await page.waitForFunction(() => window.game.clamped, null, { timeout: 60_000 });
  await page.waitForFunction(() => !window.game.clamped && window.game.me?.alive && window.game.state === 'playing', null, { timeout: 60_000 });
  await page.evaluate(() => {
    const game = window.game;
    for (const ship of game.ships) {
      if (ship === game.me) continue;
      ship.alive = false;
      ship.respawnAt = Infinity;
    }
  });
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.keyboard.down('KeyW');
  const start = await page.evaluate(() => window.game.time);
  let gates = 0;
  // two gates, at most 40 seconds of game time
  while (gates < 2) {
    const look = await page.evaluate(() => {
      const game = window.game;
      const me = game.me;
      const line = game.course.line;
      const next = me.gates % game.course.points.length;
      const speed = me.flight.velocity.length();
      const at = line.progress(me.flight.position, next, 0) + Math.max(4000, speed * 1.6);
      const point = line.clear(at, game.field, me.flight.position.clone()).project(game.camera);
      return { x: point.x, y: point.y, behind: point.z > 1, gates: me.gates, time: game.time, alive: me.alive };
    });
    expect(look.alive).toBe(true);
    expect(look.time - start).toBeLessThan(40);
    gates = look.gates;
    // the pointer on the line ahead, held on the screen
    const x = look.behind ? (look.x > 0 ? 0 : viewport.width) : Math.min(viewport.width - 1, Math.max(0, ((look.x + 1) / 2) * viewport.width));
    const y = look.behind ? viewport.height / 2 : Math.min(viewport.height - 1, Math.max(0, ((1 - look.y) / 2) * viewport.height));
    await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  expect(gates).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
