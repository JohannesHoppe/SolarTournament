import { expect, test } from '@playwright/test';
import { openGame, play, startSolo } from './game';

/**
 * Mouse flight as a Host's hand does it: the pointer pushed to the side turns the autopilot's
 * course, and centered it leaves the course where it is. A turn about at 150 m/s: the pointer is
 * held to the right until the course points back, then centered; the flight computer flips, burns
 * and brings the flight round onto the course, at about the speed it had.
 */
test('the mouse turns the flight about at 150 m/s, and the recorder keeps the flight', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  await page.waitForFunction(() => !window.game.clamped && window.game.me?.alive && window.game.state === 'playing', null, { timeout: 60_000 });
  // alone, in open space, flying ahead at 150 m/s with the autopilot on
  const start = await page.evaluate(() => {
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
    for (let i = 0; i < 400 && !clear(place); i++) place = new Vector3((Math.random() - 0.5) * 120000, (Math.random() - 0.5) * 40000, (Math.random() - 0.5) * 120000);
    me.flight.position.copy(place);
    me.flight.velocity.copy(nose).multiplyScalar(3000);
    me.flight.angularVelocity.set(0, 0, 0);
    me.protectedUntil = Infinity;
    me.syncTransform();
    game.autopilot = true;
    return { x: nose.x, y: nose.y, z: nose.z };
  });
  await play(page, 0.3);
  const viewport = page.viewportSize()!;
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  // the pointer to the right, held until the course points back, then centered
  await page.mouse.move(center.x, center.y);
  await page.mouse.move(center.x + Math.min(viewport.width, viewport.height) * 0.22, center.y, { steps: 8 });
  await page.waitForFunction(
    (start) => {
      const course = window.game.steering.course;
      return course.x * start.x + course.y * start.y + course.z * start.z < -0.95;
    },
    start,
    { timeout: 20_000 },
  );
  await page.mouse.move(center.x, center.y, { steps: 8 });
  const held = await page.evaluate(() => window.game.steering.course.clone());
  await play(page, 6);
  const end = await page.evaluate(
    ({ start, held }) => {
      const game = window.game;
      const flight = game.me.flight;
      const path = flight.velocity.clone().normalize();
      const course = game.steering.course;
      const frames = game.recorder.frames();
      return {
        alive: game.me.alive,
        speed: flight.velocity.length() / 20,
        back: path.x * start.x + path.y * start.y + path.z * start.z,
        onCourse: path.angleTo(course),
        courseKept: Math.acos(Math.min(1, course.x * held.x + course.y * held.y + course.z * held.z)),
        recorded: frames.length,
        steered: frames.some((frame: any) => frame.mode === 'autopilot' && frame.pointer && frame.controls.yaw > 0.5),
      };
    },
    { start, held: { x: held.x, y: held.y, z: held.z } },
  );
  expect(end.alive).toBe(true);
  // the flight points back, onto the course the pointer left, which stayed where it was put
  expect(end.back).toBeLessThan(-0.94);
  expect(end.onCourse).toBeLessThan(0.05);
  expect(end.courseKept).toBeLessThan(0.01);
  expect(end.speed).toBeGreaterThan(120);
  expect(end.recorded).toBeGreaterThan(100);
  expect(end.steered).toBe(true);
  expect(errors).toEqual([]);
});
