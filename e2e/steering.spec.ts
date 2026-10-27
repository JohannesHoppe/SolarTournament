import { expect, test } from '@playwright/test';
import { openGame, play, startSolo } from './game';

/**
 * Mouse flight as a Host's hand does it: the pointer pushed to the side turns the nose, and with
 * the autopilot the flight follows it. A turn about at 150 m/s with the drive held: the pointer
 * is held to the right until the flight points back, then centered; the ship flies on where its
 * nose points.
 */
test('the mouse turns the flight about at 150 m/s, and the recorder keeps the flight', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  // the opening's clamps hold every ship until the start
  await page.waitForFunction(() => window.game.clamped, null, { timeout: 60_000 });
  await page.waitForFunction(() => !window.game.clamped && window.game.me?.alive && window.game.state === 'playing', null, { timeout: 60_000 });
  // alone, in open space, flying ahead at 150 m/s with the autopilot on
  const start = await page.evaluate(async () => {
    // the game's seeded generator, as the dev server serves it: the same places tried every run
    const module = '/src/random.ts';
    const { Randomizer } = await import(module);
    const random = new Randomizer(7919);
    const game = window.game;
    const me = game.me;
    for (const ship of game.ships) {
      if (ship === me) continue;
      ship.alive = false;
      ship.respawnAt = Infinity;
    }
    const Vector3 = me.flight.position.constructor;
    const nose = me.flight.forward(new Vector3());
    // a place with no rock within 1.5 km ahead, behind and to either side
    const side = new Vector3(0, 1, 0).cross(nose).normalize();
    const clear = (at: any) => [nose, nose.clone().negate(), side, side.clone().negate()].every((way: any) => !game.field.raycast(at, way, 30000)) && !game.field.overlap(at, 2000);
    let place = me.flight.position.clone();
    for (let i = 0; i < 400 && !clear(place); i++) place = new Vector3(random.range(-60000, 60000), random.range(-20000, 20000), random.range(-60000, 60000));
    const open = clear(place);
    me.flight.position.copy(place);
    me.flight.velocity.copy(nose).multiplyScalar(3000);
    me.flight.angularVelocity.set(0, 0, 0);
    me.protectedUntil = Infinity;
    me.syncTransform();
    game.autopilot = true;
    return { x: nose.x, y: nose.y, z: nose.z, open };
  });
  expect(start.open, 'a place clear of rock to fly the turn about in').toBe(true);
  await play(page, 0.3);
  const viewport = page.viewportSize()!;
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  // the drive held, the pointer to the right until the flight points back, then centered
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down('KeyW');
  await page.mouse.move(center.x + Math.min(viewport.width, viewport.height) * 0.22, center.y, { steps: 8 });
  await page.waitForFunction(
    (start) => {
      const velocity = window.game.me.flight.velocity;
      const speed = velocity.length();
      return (velocity.x * start.x + velocity.y * start.y + velocity.z * start.z) / speed < -0.95;
    },
    start,
    { timeout: 120_000 },
  );
  await page.mouse.move(center.x, center.y, { steps: 8 });
  await play(page, 2);
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(
    ({ start }) => {
      const game = window.game;
      const flight = game.me.flight;
      const path = flight.velocity.clone().normalize();
      const frames = game.recorder.frames();
      return {
        alive: game.me.alive,
        speed: flight.velocity.length() / 20,
        back: path.x * start.x + path.y * start.y + path.z * start.z,
        onNose: path.angleTo(flight.forward(path.clone())),
        recorded: frames.length,
        steered: frames.some((frame: any) => frame.mode === 'autopilot' && frame.pointer && frame.controls.yaw > 0.5),
      };
    },
    { start },
  );
  expect(end.alive).toBe(true);
  // the flight points back, where the nose points
  expect(end.back).toBeLessThan(-0.9);
  expect(end.onNose).toBeLessThan(0.26);
  expect(end.speed).toBeGreaterThan(120);
  expect(end.recorded).toBeGreaterThan(100);
  expect(end.steered).toBe(true);
  expect(errors).toEqual([]);
});
