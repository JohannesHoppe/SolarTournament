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

test('two tabs show a ping for each other and agree on who leads', async ({ context }) => {
  const { a, b } = await pair(context, `e2e-${Date.now().toString(36)}p`);
  const read = (page: Page) =>
    page.evaluate(() => {
      const online = window.game.online;
      const session = online.session;
      return { selfId: online.selfId, leadId: session.leadId, pings: (session.peers as string[]).map((peer) => session.pingTo(peer)) };
    });
  const [seenA, seenB] = [await read(a), await read(b)];
  // a BroadcastChannel round trip (?local=1) answers at once: both measured a ping to the other
  expect(seenA.pings.length).toBeGreaterThan(0);
  expect(seenA.pings.every((ms) => typeof ms === 'number' && ms >= 0)).toBe(true);
  expect(seenB.pings.every((ms) => typeof ms === 'number' && ms >= 0)).toBe(true);
  // the first tab leads, and both name the same browser
  expect(seenA.leadId).toBe(seenA.selfId);
  expect(seenB.leadId).toBe(seenA.selfId);
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
  // put 1 km beside it, its nose on it; it fires once the other tab has its states from
  // there (a torpedo launched from where the others do not see the ship is not launched)
  const aim = () =>
    a.evaluate(({ position }) => {
      const game = window.game;
      const me = game.me;
      const at = me.flight.position.clone().set(position[0], position[1], position[2]);
      me.protectedUntil = 0;
      me.flight.position.copy(at).add(at.clone().set(20000, 0, 0));
      me.flight.velocity.set(0, 0, 0);
      const look = game.camera.matrix.clone().lookAt(me.flight.position, at, at.clone().set(0, 1, 0));
      me.flight.orientation.setFromRotationMatrix(look);
    }, target);
  await aim();
  await play(a, 0.5);
  await aim();
  await a.evaluate(() => window.game.fireTorpedo(window.game.me));
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

test('two tabs see a probe on a hook travel to the hooking ship, and be taken there', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}p&bots=0`);
  // the same probe on both tabs (as a dead clone's would be), above the field and at rest
  // there; the second tab's clone keeps well away
  for (const page of [a, b])
    await page.evaluate(() => {
      const game = window.game;
      const at = game.me.flight.position.clone().set(0, 62000, 0);
      game.probes.drop('e2e', 0, ['torpedoes'], at, at.clone().set(0, 0, 0), game.time);
      const probe = game.probes.find('e2e.0.0');
      game.probes.park(probe, at);
      probe.until = Infinity;
    });
  await b.evaluate(() => {
    const game = window.game;
    game.autopilot = false;
    game.me.flight.position.set(0, 62000, -60000);
    game.me.flight.velocity.set(0, 0, 0);
  });
  // the first tab's clone, 400 m from the probe, its nose on it (straight ahead is -z)
  const before = await a.evaluate(() => {
    const game = window.game;
    game.autopilot = false;
    game.me.flight.position.set(0, 62000, 8000);
    game.me.flight.velocity.set(0, 0, 0);
    game.me.flight.orientation.set(0, 0, 0, 1);
    return game.me.torpedoes;
  });
  await play(a, 1);
  // it fires its hook and holds it, while the second tab watches where the probe is
  const watch = b.evaluate(async () => {
    const game = window.game;
    const seen: number[] = [];
    const start = game.time;
    while (game.time - start < 6) {
      const probe = game.probes.find('e2e.0.0');
      seen.push(probe ? probe.position.z : NaN);
      if (!probe) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen;
  });
  await a.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })));
  const seen = await watch;
  await play(a, 1);
  await a.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' })));
  // the second tab saw it come more than half the way towards the hooking ship, then it was gone
  expect(Math.max(...seen.filter((z) => !Number.isNaN(z)))).toBeGreaterThan(4000);
  expect(Number.isNaN(seen[seen.length - 1])).toBe(true);
  // taken by the ship that hooked it, on its arrival: two more torpedoes, and gone on both tabs
  expect(await a.evaluate(() => window.game.me.torpedoes)).toBe(before + 2);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.probes.find('e2e.0.0'))).toBeNull();
  expect(errors).toEqual([]);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.online.reported.size)).toBe(0);
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
  // fires its harpoon at it (the hook held) once the round's start has let it go (a loaded
  // machine may still be counting down); the lead hears of the bite, takes the core for it and
  // tells both
  await b.waitForFunction(() => window.game.countdown === 0, undefined, { timeout: 30_000 });
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
  // the hook is held until the core is in tow (a harpoon let go early takes nothing)
  const towed = (page: Page) => page.waitForFunction((thief) => window.game.flags.cores.some((core: { carrier: string | null }) => core.carrier === thief), thief, { timeout: 15_000 });
  await towed(b);
  await b.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' })));
  await towed(a);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.flags.cores.map((core: { carrier: string | null }) => core.carrier))).toContain(thief);
  expect(errors).toEqual([]);
});

test("two tabs of the President's Fleet see one battleship and count the same hits, a torpedo's too", async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}b&m=fleet&bots=0`);
  // the battleship comes in on the field time; both tabs wait for it
  for (const page of [a, b]) await page.evaluate(() => window.game.field.setClock(13));
  await play(b, 2);
  // the batteries hold their fire on the shooting tab's clone, which sits right above them: the
  // test counts hits, and a clone shot down between two shots could not fire the next
  await b.evaluate(() => (window.game.fireBattery = () => {}));
  const where = (page: Page) => page.evaluate(() => window.game.fleet.position.toArray());
  const [atA, atB] = [await where(a), await where(b)];
  expect(Math.hypot(atA[0] - atB[0], atA[1] - atB[1], atA[2] - atB[2])).toBeLessThan(2000);
  // the clone 150 m above a part of the battleship, its nose on it, fires its laser or a
  // torpedo (null: neither, it is only put there); returns what the torpedo locked on. Coming from afar (`arrive`) it is put there
  // first and fires once the other tab has its states from there: a shot from where the others
  // do not see the ship yet is no shot of its (see Online.onFire)
  const fireAt = async (page: Page, zone: number, torpedo: boolean | null, arrive = false) => {
    const aim = (fire: boolean | null) =>
      page.evaluate(
        ([zone, fire]) => {
          const game = window.game;
          const part = game.fleet.zoneAt(zone);
          const above = part.clone().set(0, 1, 0).applyQuaternion(game.fleet.quaternion).multiplyScalar(3000).add(part);
          game.me.flight.position.copy(above);
          game.me.flight.velocity.set(0, 0, 0);
          const bow = part.clone().set(0, 0, -1).applyQuaternion(game.fleet.quaternion);
          game.me.flight.orientation.setFromRotationMatrix(game.fleet.root.matrixWorld.clone().lookAt(above, part, bow));
          if (fire === true) game.fireTorpedo(game.me);
          else if (fire === false) game.fireLaser(game.me);
          return game.torpedoes.list[0]?.target?.id;
        },
        [zone, fire] as const,
      );
    if (arrive) {
      await aim(null);
      await play(page, 0.5);
    }
    return aim(torpedo);
  };
  // ten shots into the first battery, as fast as the laser fires: the first tab sees the beams
  // end there and counts the hits too
  for (let i = 0; i < 10; i++) {
    await fireAt(b, 0, false, i === 0);
    await b.waitForTimeout(150);
  }
  await play(a, 2);
  expect(await a.evaluate(() => window.game.fleet.hits[0])).toBe(10);
  // a torpedo at the next battery locks on; its clone dies right after the launch, the torpedo
  // flies on, goes off there, and both tabs count its hits
  expect(await fireAt(b, 1, true)).toBe('battleship.1');
  expect(
    await b.evaluate(() => {
      const game = window.game;
      if (game.me.structural(1e6, game.time) !== 'destroyed') return false;
      game.shipDestroyed(game.me, null, 'battery');
      return true;
    }),
  ).toBe(true);
  await play(b, 3);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.fleet.hits[1])).toBe(10);
  // the dead clone of the second tab dropped a nova core 150 m above the third battery, on both
  // tabs alike; the first tab's clone flies through it, fires there, and both count the core's
  // hits on every part it reached: the battery under it broken outright
  await a.evaluate(() => (window.game.fireBattery = () => {}));
  const dropper = await b.evaluate(() => ({ id: window.game.me.id, deaths: window.game.me.deaths }));
  for (const page of [a, b]) {
    await page.evaluate(({ id, deaths }) => {
      const game = window.game;
      const part = game.fleet.zoneAt(2);
      const above = part.clone().set(0, 1, 0).applyQuaternion(game.fleet.quaternion).multiplyScalar(3000).add(part);
      game.probes.drop(id, deaths, ['nova'], above, game.fleet.velocity.clone(), game.time);
    }, dropper);
  }
  await fireAt(a, 2, null, true);
  expect(await a.evaluate(() => window.game.me.nova)).toBe(true);
  await fireAt(a, 2, false);
  await play(a, 3);
  const counted = await a.evaluate(() => [...window.game.fleet.hits]);
  expect(counted[2]).toBe(await a.evaluate(() => window.game.fleet.hitsOf(2)));
  expect(await b.evaluate(() => [...window.game.fleet.hits])).toEqual(counted);
  expect(errors).toEqual([]);
});

test('a nova from a ship without a core never goes off; once is forgiven, and when it comes again and again two tabs name its Host a cheater and cast it out', async ({ context }) => {
  // three tabs take their time on a busy machine
  test.setTimeout(240_000);
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
  for (const page of pages) {
    await page.evaluate(() => {
      const game = window.game;
      game.cheaters = [];
      game.announceCheater = (name: string) => game.cheaters.push(name);
    });
  }
  const victim = await a.evaluate(() => window.game.me.flight.position.toArray().map(Math.round));
  // the cheating tab says its clone set off a core it never had, right at the other's ship
  const nova = () =>
    cheat.evaluate((at) => {
      const game = window.game;
      game.online.session.sendNova(game.me.id, at);
      return { name: game.me.name, id: game.me.id };
    }, victim);
  const { name, id: cheaterId } = await nova();
  await play(a, 1.5);
  // once is rejected, never reported: one odd event names nobody
  for (const page of [a, b]) {
    const seen = await page.evaluate(() => ({
      caught: window.game.online.suspicions.some((s: { cheat: string }) => s.cheat === 'nova'),
      cheaters: window.game.cheaters,
      reported: window.game.online.reported.size,
    }));
    expect(seen).toEqual({ caught: true, cheaters: [], reported: 0 });
  }
  // again and again, a second apart: both name it
  await nova();
  await play(a, 1.5);
  await nova();
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
  // cast out: its ship is gone from the others; the tab named sees its callsign called, but never
  // leaves on the others' word (votes carry no evidence)
  for (const page of [a, b]) {
    expect(await page.evaluate((id) => window.game.ships.some((ship: { id: string }) => ship.id === id), cheaterId)).toBe(false);
  }
  await cheat.waitForFunction((called) => window.game.cheaters.includes(called), name, { timeout: 15_000 });
  expect(await cheat.evaluate(() => window.game.state)).not.toBe('menu');
  expect(errors).toEqual([]);
});
