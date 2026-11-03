import { expect, test } from '@playwright/test';
import { openGame, startSolo } from './game';

/** The speed the mouse's Host wants along the line (units/s, 200 m/s). */
const WANTED = 4000;

/**
 * A short stretch of a race flown with Playwright's mouse, as a Host does in free drift, as every
 * round starts: alone on the course, flying by the Course marker. It looks at the racing line a
 * good second ahead, sees how far the flight it has is from the flight it wants (towards that
 * point at WANTED), pushes the pointer from the screen's middle the way the crosshair (the nose)
 * has to turn to lie in that difference as the screen shows it (through the game's own camera),
 * half as far as it lies off the crosshair, and holds W while the nose is in it, every tenth of
 * a second. The DOM pointer, the input, the chase camera and the drive together have to bring the
 * ship through the first gates.
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
  const start = await page.evaluate(() => window.game.time);
  let gates = 0;
  let driving = false;
  // two gates, at most 40 seconds of game time
  while (gates < 2) {
    const look = await page.evaluate((wanted) => {
      const game = window.game;
      const me = game.me;
      const line = game.course.line;
      const next = me.gates % game.course.points.length;
      const speed = me.flight.velocity.length();
      // the line ahead; past a gate missed, the line's loop back to it, as the game's racers come back
      const point = me.flight.position.clone();
      if (line.beyond(me.flight.position, next)) line.target(me.flight.position, next, speed, game.field, point);
      else line.clear(line.progress(me.flight.position, next, 0) + Math.max(4000, speed * 1.6), game.field, point);
      // the flight it wants less the flight it has: the nose goes into that difference
      const distance = point.distanceTo(me.flight.position);
      const miss = point.clone().sub(me.flight.position).setLength(wanted).sub(me.flight.velocity);
      const aim = miss.length() > 100 ? miss.clone().setLength(distance).add(me.flight.position) : point;
      const forward = me.flight.forward(point.clone());
      const drive = miss.length() > 100 && forward.angleTo(miss) < 0.5;
      const nose = forward.multiplyScalar(distance).add(me.flight.position).project(game.camera);
      aim.project(game.camera);
      return { x: aim.x - nose.x, y: aim.y - nose.y, behind: aim.z > 1, drive, gates: me.gates, time: game.time, alive: me.alive };
    }, WANTED);
    expect(look.alive).toBe(true);
    expect(look.time - start).toBeLessThan(40);
    gates = look.gates;
    if (look.drive !== driving) await (look.drive ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW'));
    driving = look.drive;
    // the pointer pushed from the middle towards the line ahead, half as far as it lies off the crosshair
    const x = look.behind ? (look.x > 0 ? 0 : viewport.width) : Math.min(viewport.width - 1, Math.max(0, (0.5 + look.x / 4) * viewport.width));
    const y = look.behind ? viewport.height / 2 : Math.min(viewport.height - 1, Math.max(0, (0.5 - look.y / 4) * viewport.height));
    await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  expect(gates).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
