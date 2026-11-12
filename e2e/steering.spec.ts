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
    // the nose level, the spawn's heading kept: the spawn faces the field's middle, up or down
    // by chance, and a held turn keeps the nose as high as it is
    const spawned = me.flight.forward(new Vector3());
    me.flight.orientation.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-spawned.x, -spawned.z));
    const nose = me.flight.forward(new Vector3());
    // a place with no rock within 1.5 km ahead, behind and to either side, and within 2.5 km of
    // the center, so the turn about stays inside the arena (3.4 km)
    const side = new Vector3(0, 1, 0).cross(nose).normalize();
    const clear = (at: any) => at.length() < 50000 && [nose, nose.clone().negate(), side, side.clone().negate()].every((way: any) => !game.field.raycast(at, way, 30000)) && !game.field.overlap(at, 2000);
    let place = me.flight.position.clone();
    for (let i = 0; i < 400 && !clear(place); i++) place = new Vector3(random.range(-50000, 50000), random.range(-20000, 20000), random.range(-50000, 50000));
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
  // the drive held, the pointer to the right until the nose (the crosshair, which a Host steers
  // by) points back, then centered; the flight follows the nose
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down('KeyW');
  await page.mouse.move(center.x + Math.min(viewport.width, viewport.height) * 0.22, center.y, { steps: 8 });
  await page.waitForFunction(
    (start) => {
      const nose = window.game.me.flight.forward(window.game.me.flight.velocity.clone());
      return nose.x * start.x + nose.y * start.y + nose.z * start.z < -0.95;
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

/**
 * A rival's torpedo is a dot of a few pixels: the HUD marks it with a triangle, and the aim
 * assist takes it as it takes a ship, its triangle orange while it holds it. A decoy dropped is
 * felt: the clamp's jolt shakes the view.
 */
test("a rival's torpedo is marked and locked, and a decoy dropped jolts the view", async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  await page.waitForFunction(() => !window.game.clamped && window.game.me?.alive && window.game.state === 'playing', null, { timeout: 60_000 });
  const set = await page.evaluate(() => {
    const game = window.game;
    const me = game.me;
    const rival = game.ships.find((ship: any) => ship !== me);
    for (const ship of game.ships) {
      if (ship === me || ship === rival) continue;
      ship.alive = false;
      ship.respawnAt = Infinity;
    }
    const Vector3 = me.flight.position.constructor;
    const nose = me.flight.forward(new Vector3());
    // a place with 1.2 km of open space ahead
    let place = me.flight.position.clone();
    for (let i = 0; i < 400 && (game.field.raycast(place, nose, 30000) || game.field.overlap(place, 2000)); i++) place = new Vector3((i * 7919) % 90000 - 45000, ((i * 104729) % 30000) - 15000, ((i * 1299709) % 90000) - 45000);
    me.flight.position.copy(place);
    me.flight.velocity.set(0, 0, 0);
    me.flight.angularVelocity.set(0, 0, 0);
    me.protectedUntil = Infinity;
    me.syncTransform();
    // the rival 1.1 km ahead, facing the own ship, fires one torpedo at it and is gone
    rival.flight.position.copy(place).addScaledVector(nose, 22000);
    rival.flight.velocity.set(0, 0, 0);
    rival.flight.orientation.copy(me.flight.orientation).multiply(new me.flight.orientation.constructor(0, 1, 0, 0));
    rival.syncTransform();
    rival.torpedoes = 1;
    game.fireTorpedo(rival);
    rival.alive = false;
    rival.respawnAt = Infinity;
    return game.torpedoes.list.length;
  });
  expect(set, 'the rival fired').toBe(1);
  await page.waitForSelector('.torpedo-mark:not([hidden])', { timeout: 10_000 });
  await page.waitForSelector('.torpedo-mark.locked:not([hidden])', { timeout: 10_000 });
  const jolt = await page.evaluate(() => {
    const game = window.game;
    game.torpedoes.list.length = 0;
    game.me.decoys = 1;
    game.kick = 0;
    game.dropDecoy(game.me);
    return { kick: game.kick, left: game.me.decoys };
  });
  expect(jolt.left).toBe(0);
  expect(jolt.kick).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});
