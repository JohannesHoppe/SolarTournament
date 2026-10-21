import { expect, test, type Page } from '@playwright/test';
import { openGame, play, type GameWindow } from './game';

/** Joins a tournament of tabs in this browser (?local=1). */
async function join(page: Page, room: string) {
  const errors = await openGame(page, `/?local=1#t=${room}`);
  await page.evaluate(() => document.getElementById('online')!.click());
  return errors;
}

const world = (page: Page) =>
  page.evaluate(() => {
    const game = (window as unknown as GameWindow).game;
    return {
      arena: game.venue.id,
      round: game.roundId,
      ships: game.ships.map((ship: { id: string }) => ship.id).sort(),
      rocks: [...game.field.asteroids.keys()].sort(),
    };
  });

test('two tabs of one tournament see the same world', async ({ context }) => {
  const room = `e2e-${Date.now().toString(36)}`;
  const a = await context.newPage();
  const errorsA = await join(a, room);
  await play(a, 7);
  const b = await context.newPage();
  const errorsB = await join(b, room);
  await play(b, 9);
  const [seenA, seenB] = [await world(a), await world(b)];
  expect(seenB.arena).toBe(seenA.arena);
  expect(seenB.round).toBe(seenA.round);
  expect(seenB.rocks).toEqual(seenA.rocks);
  // each sees both Hosts' ships and the lead's bots
  expect(seenB.ships).toEqual(seenA.ships);
  expect(errorsA.concat(errorsB)).toEqual([]);
  // honest tabs never take each other for cheats
  for (const page of [a, b]) expect(await page.evaluate(() => (window as unknown as GameWindow).game.online.reported.size)).toBe(0);
});

test('a torpedo flies on both tabs and hits the ship of the other', async ({ context }) => {
  const room = `e2e-${Date.now().toString(36)}t&bots=0`;
  const a = await context.newPage();
  await join(a, room);
  await play(a, 7);
  const b = await context.newPage();
  await join(b, room);
  await play(b, 9);
  const target = await b.evaluate(() => {
    const game = (window as unknown as GameWindow).game;
    game.me.protectedUntil = 0;
    game.me.flight.velocity.set(0, 0, 0);
    game.autopilot = false;
    return { id: game.me.id, position: game.me.flight.position.toArray() };
  });
  await a.evaluate(({ position }) => {
    const game = (window as unknown as GameWindow).game;
    const me = game.me;
    const at = me.flight.position.clone().set(position[0], position[1], position[2]);
    me.protectedUntil = 0;
    me.flight.position.copy(at).add(at.clone().set(0, 0, 20000));
    me.flight.velocity.set(0, 0, 0);
    const look = game.camera.matrix.clone().lookAt(me.flight.position, at, at.clone().set(0, 1, 0));
    me.flight.orientation.setFromRotationMatrix(look);
    game.fireTorpedo(me);
  }, target);
  await play(b, 1);
  expect(await b.evaluate(() => (window as unknown as GameWindow).game.torpedoes.list.length)).toBe(1);
  await play(b, 8);
  expect(await b.evaluate(() => (window as unknown as GameWindow).game.me.hull)).toBe(40);
});

test('a nova from a ship without a core never goes off, and two tabs name its Host a cheater', async ({ context }) => {
  const room = `e2e-${Date.now().toString(36)}n&bots=0`;
  const pages = [];
  for (const wait of [7, 9, 9]) {
    const page = await context.newPage();
    await join(page, room);
    await play(page, wait);
    pages.push(page);
  }
  const [a, b, cheat] = pages;
  for (const page of [a, b]) {
    await page.evaluate(() => {
      const game = (window as unknown as GameWindow).game;
      game.cheaters = [];
      game.announceCheater = (name: string) => game.cheaters.push(name);
    });
  }
  const victim = await a.evaluate(() => (window as unknown as GameWindow).game.me.flight.position.toArray().map(Math.round));
  // the cheating tab says its clone set off a core it never had, right at the other's ship
  const name = await cheat.evaluate((at) => {
    const game = (window as unknown as GameWindow).game;
    game.online.session.sendNova(game.me.id, at);
    return game.me.name;
  }, victim);
  await play(a, 2);
  await play(b, 2);
  for (const page of [a, b]) {
    const seen = await page.evaluate(() => {
      const game = (window as unknown as GameWindow).game;
      return { alive: game.me.alive, cheaters: game.cheaters };
    });
    expect(seen.alive).toBe(true);
    expect(seen.cheaters).toEqual([name]);
  }
});
