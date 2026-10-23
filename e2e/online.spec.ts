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
      tints: game.ships.map((ship: { id: string; tint: string; kind: string }) => `${ship.kind} ${ship.id} ${ship.tint}`).sort(),
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
  // both tabs chose the same tint (one browser, one storage): both see the later one in another
  expect(seenB.tints).toEqual(seenA.tints);
  const hosts = seenA.tints.filter((entry: string) => entry.startsWith('host '));
  expect(new Set(hosts.map((entry: string) => entry.split(' ')[2])).size).toBe(2);
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

test('two tabs of Capture the Flag agree on the sides and on who has a core in tow', async ({ context }) => {
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
  // the second tab's clone takes the first side's core; the lead sees it and tells both
  const thief = await b.evaluate(() => {
    const game = window.game;
    game.me.flight.position.copy(game.flags.bases[1 - game.me.team]);
    game.me.flight.velocity.set(0, 0, 0);
    game.autopilot = false;
    return game.me.id;
  });
  await play(b, 2);
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
