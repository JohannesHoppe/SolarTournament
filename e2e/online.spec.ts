import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openGame, play } from './game';

/** Joins a tournament of tabs in this browser (?local=1). */
async function join(page: Page, room: string) {
  const errors = await openGame(page, `/?local=1#t=${room}`);
  await page.evaluate(() => document.getElementById('online')!.click());
  return errors;
}

/** Two tabs of one tournament: the first leads, the second joins once the first runs; with the errors of both. */
async function pair(context: BrowserContext, room: string) {
  const a = await context.newPage();
  const errorsA = await join(a, room);
  await play(a, 7);
  const b = await context.newPage();
  const errorsB = await join(b, room);
  await play(b, 9);
  return { a, b, errors: errorsA.concat(errorsB) };
}

const world = (page: Page) =>
  page.evaluate(() => {
    const game = window.game;
    return {
      arena: game.venue.id,
      round: game.roundId,
      ships: game.ships.map((ship: { id: string }) => ship.id).sort(),
      rocks: [...game.field.asteroids.keys()].sort(),
    };
  });

test('two tabs of one tournament see the same world', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}`);
  const [seenA, seenB] = [await world(a), await world(b)];
  expect(seenB.arena).toBe(seenA.arena);
  expect(seenB.round).toBe(seenA.round);
  expect(seenB.rocks).toEqual(seenA.rocks);
  // each sees both Hosts' ships and the lead's bots
  expect(seenB.ships).toEqual(seenA.ships);
  expect(errors).toEqual([]);
  // honest tabs never take each other for cheats
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.online.reported.size)).toBe(0);
});

test('a torpedo flies on both tabs and hits the ship of the other', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}t&bots=0`);
  // above the field, where no rock of whatever arena the room draws comes between the two
  const target = await b.evaluate(() => {
    const game = window.game;
    game.me.protectedUntil = 0;
    game.me.flight.position.set(0, 62000, 0);
    game.me.flight.velocity.set(0, 0, 0);
    game.autopilot = false;
    return { id: game.me.id, position: game.me.flight.position.toArray() };
  });
  await a.evaluate(({ position }) => {
    const game = window.game;
    const me = game.me;
    const at = me.flight.position.clone().set(position[0], position[1], position[2]);
    me.protectedUntil = 0;
    me.flight.position.copy(at).add(at.clone().set(20000, 0, 0));
    me.flight.velocity.set(0, 0, 0);
    const look = game.camera.matrix.clone().lookAt(me.flight.position, at, at.clone().set(0, 1, 0));
    me.flight.orientation.setFromRotationMatrix(look);
    game.fireTorpedo(me);
  }, target);
  await play(b, 1);
  expect(await b.evaluate(() => window.game.torpedoes.list.length)).toBe(1);
  await play(b, 8);
  expect(await b.evaluate(() => window.game.me.hull)).toBe(40);
  expect(errors).toEqual([]);
});

test('two tabs agree on a tug of war between their ships on one rope', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}w&bots=0`);
  // above the field, 300 m apart along x: each tab puts its own clone there, at rest, its
  // nose along x (a quarter turn about y: towards +x, or towards -x)
  const place = (page: Page, x: number, towards: number) =>
    page.evaluate(
      ([x, towards]) => {
        const game = window.game;
        game.autopilot = false;
        game.me.protectedUntil = 0;
        game.me.flight.position.set(x, 62000, 0);
        game.me.flight.velocity.set(0, 0, 0);
        game.me.flight.orientation.set(0, -towards * Math.SQRT1_2, 0, Math.SQRT1_2);
      },
      [x, towards],
    );
  // without a GPU the tabs render too slowly to keep the game's time (a frame counts 50 ms at
  // most): each would play the tug at its own pace, so they draw nothing
  for (const page of [a, b]) await page.evaluate(() => (window.game.composer.render = () => {}));
  await place(b, 6000, 1);
  await place(a, 0, 1);
  await play(a, 1);
  // the first tab's clone hooks the other, holding the hook; the winch reels it in to 70 m
  await a.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })));
  await play(a, 3);
  expect(await a.evaluate(() => window.game.me.flight.position.distanceTo(window.game.ships.find((s: { id: string }) => s.id !== window.game.me.id).flight.position))).toBeLessThan(2000);
  // both turn away from each other and burn with full drives for 3 s of their own game time,
  // at once (one after the other, the second would burn on alone while the first is told)
  await Promise.all(
    [a, b].map((page, i) =>
      page.evaluate(async (away) => {
        const game = window.game;
        game.me.flight.orientation.set(0, away * Math.SQRT1_2, 0, Math.SQRT1_2);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        const start = game.time;
        while (game.time - start < 3) await new Promise((resolve) => requestAnimationFrame(resolve));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      }, i === 0 ? 1 : -1),
    ),
  );
  // a stalemate: the pair has hardly moved, the rope held, and both tabs see the same
  const seen = (page: Page): Promise<Record<string, number[]>> => page.evaluate(() => Object.fromEntries(window.game.ships.map((s: { id: string; flight: { position: { toArray(): number[] } } }) => [s.id, s.flight.position.toArray()])));
  const [onA, onB] = [await seen(a), await seen(b)];
  const ids = Object.keys(onA);
  const middle = (seen: Record<string, number[]>) => (seen[ids[0]][0] + seen[ids[1]][0]) / 2;
  expect(Math.abs(middle(onA) - 3000)).toBeLessThan(4000);
  expect(Math.abs(onA[ids[0]][0] - onA[ids[1]][0])).toBeLessThan(2000);
  for (const id of ids) expect(Math.hypot(...onA[id].map((v, i) => v - onB[id][i]))).toBeLessThan(2000);
  expect(errors).toEqual([]);
});

test('two tabs of Capture the Flag agree on the sides and on who has a core in tow, taken by a hook shot', async ({ context }) => {
  // two Hosts alone: bots would only slow two tabs without a GPU down
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}f&m=flag&bots=0`);
  const sides = (page: Page) =>
    page.evaluate(() => {
      const game = window.game;
      return Object.fromEntries(game.ships.map((ship: { id: string; team: number }) => [ship.id, ship.team]));
    });
  const [sidesA, sidesB] = [await sides(a), await sides(b)];
  expect(sidesB).toEqual(sidesA);
  // the two Hosts fly for different sides
  const hosts = Object.entries(sidesA).filter(([id]) => id.startsWith('p:'));
  expect(new Set(hosts.map(([, team]) => team)).size).toBe(2);
  // the second tab's clone, 300 m in front of the other side's ring, its nose on the core,
  // fires its harpoon at it (the hook held); the lead hears of the bite, takes the core for it
  // and tells both
  const thief = await b.evaluate(() => {
    const game = window.game;
    const base = game.flags.bases[1 - game.me.team];
    const facing = game.flags.facings[1 - game.me.team];
    game.me.flight.position.copy(base).addScaledVector(facing, -6000);
    game.me.flight.velocity.set(0, 0, 0);
    game.me.flight.orientation.setFromUnitVectors(facing.clone().set(0, 0, -1), facing);
    game.autopilot = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
    return game.me.id;
  });
  await play(b, 2);
  await b.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' })));
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.flags.cores.map((core: { carrier: string | null }) => core.carrier))).toContain(thief);
  expect(errors).toEqual([]);
});

test("two tabs of the President's Fleet see one battleship and count the same hits, a torpedo's too", async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}b&m=fleet&bots=0`);
  // the battleship comes in on the field time; both tabs wait for it
  for (const page of [a, b]) await page.evaluate(() => window.game.field.setClock(13));
  await play(b, 2);
  const where = (page: Page) => page.evaluate(() => window.game.fleet.position.toArray());
  const [atA, atB] = [await where(a), await where(b)];
  expect(Math.hypot(atA[0] - atB[0], atA[1] - atB[1], atA[2] - atB[2])).toBeLessThan(2000);
  // the clone 150 m above a part of the battleship, its nose on it, fires its laser or a
  // torpedo; returns what the torpedo locked on
  const fireAt = (page: Page, zone: number, torpedo: boolean) =>
    page.evaluate(
      ([zone, torpedo]) => {
        const game = window.game;
        const part = game.fleet.zoneAt(zone);
        const above = part.clone().set(0, 1, 0).applyQuaternion(game.fleet.quaternion).multiplyScalar(3000).add(part);
        game.me.flight.position.copy(above);
        game.me.flight.velocity.set(0, 0, 0);
        const bow = part.clone().set(0, 0, -1).applyQuaternion(game.fleet.quaternion);
        game.me.flight.orientation.setFromRotationMatrix(game.fleet.root.matrixWorld.clone().lookAt(above, part, bow));
        if (torpedo) game.fireTorpedo(game.me);
        else game.fireLaser(game.me);
        return game.torpedoes.list[0]?.target?.id;
      },
      [zone, torpedo] as const,
    );
  // ten shots into the first battery, as fast as the laser fires: the first tab sees the beams
  // end there and counts the hits too
  for (let i = 0; i < 10; i++) {
    await fireAt(b, 0, false);
    await b.waitForTimeout(150);
  }
  await play(a, 2);
  expect(await a.evaluate(() => window.game.fleet.hits[0])).toBe(10);
  // a torpedo at the next battery locks on, goes off there, and both tabs count its hits
  expect(await fireAt(b, 1, true)).toBe('battleship.1');
  await play(b, 3);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.fleet.hits[1])).toBe(10);
  expect(errors).toEqual([]);
});

test('a nova from a ship without a core never goes off, and two tabs name its Host a cheater and cast it out', async ({ context }) => {
  const room = `e2e-${Date.now().toString(36)}n&bots=0`;
  const pages = [];
  const errors: string[] = [];
  for (const wait of [7, 9, 9]) {
    const page = await context.newPage();
    errors.push(...(await join(page, room)));
    await play(page, wait);
    pages.push(page);
  }
  const [a, b, cheat] = pages;
  for (const page of [a, b]) {
    await page.evaluate(() => {
      const game = window.game;
      game.cheaters = [];
      game.announceCheater = (name: string) => game.cheaters.push(name);
    });
  }
  const victim = await a.evaluate(() => window.game.me.flight.position.toArray().map(Math.round));
  // the cheating tab says its clone set off a core it never had, right at the other's ship
  const { name, id: cheaterId } = await cheat.evaluate((at) => {
    const game = window.game;
    game.online.session.sendNova(game.me.id, at);
    return { name: game.me.name, id: game.me.id };
  }, victim);
  await play(a, 2);
  await play(b, 2);
  for (const page of [a, b]) {
    const seen = await page.evaluate(() => {
      const game = window.game;
      return { alive: game.me.alive, cheaters: game.cheaters };
    });
    expect(seen.alive).toBe(true);
    expect(seen.cheaters).toEqual([name]);
  }
  // cast out: its ship is gone from the others, and the cheating tab is back in the menu
  for (const page of [a, b]) {
    expect(await page.evaluate((id) => window.game.ships.some((ship: { id: string }) => ship.id === id), cheaterId)).toBe(false);
  }
  await cheat.waitForFunction(() => window.game.state === 'menu', null, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
