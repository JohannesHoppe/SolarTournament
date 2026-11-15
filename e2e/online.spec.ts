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
      mode: game.roundMode,
      round: game.roundId,
      ships: game.ships.map((ship: { id: string }) => ship.id).sort(),
      rocks: [...game.field.asteroids.keys()].sort(),
      tints: game.ships.map((ship: { id: string; tint: string; kind: string }) => `${ship.kind} ${ship.id} ${ship.tint}`).sort(),
    };
  });

/**
 * The game master, paused, picks a new round on its plate and starts it: the mode first, since a
 * mode offers only its own arenas (a race never the Corona or the Event Horizon).
 */
const chooseRound = (page: Page, arena: string, mode: string) =>
  page.evaluate(
    ({ arena, mode }) => {
      window.game.pause();
      document.getElementById('new-round-open')!.click();
      document.querySelector<HTMLElement>(`[data-choice="new-round-mode"] button[data-value="${mode}"]`)!.click();
      document.querySelector<HTMLElement>(`#new-round-arenas button[data-value="${arena}"]`)!.click();
      document.getElementById('new-round-start')!.click();
    },
    { arena, mode },
  );

/** The game master (`a`) cuts the round short for one of `mode` in `arena`, and both tabs fly it. */
async function cutTo(a: Page, b: Page, arena: string, mode: string) {
  const round = await a.evaluate(() => window.game.roundId as number);
  await chooseRound(a, arena, mode);
  for (const page of [a, b]) await page.waitForFunction(({ round, arena }) => window.game.roundId === round + 1 && window.game.venue.id === arena && window.game.state === 'playing', { round, arena }, { timeout: 60_000 });
}

/** No errors in the tabs, and honest tabs never take each other for cheats. */
async function ranHonestly(errors: string[], ...pages: Page[]) {
  expect(errors).toEqual([]);
  for (const page of pages) expect(await page.evaluate(() => window.game.online.reported.size)).toBe(0);
}

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
  await ranHonestly(errors, a, b);
});

test('the game master, named on its screen alone, cuts a round short for a new one in the arena and mode it chose, on both tabs', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}m`);
  const room = (page: Page) => page.evaluate(() => document.getElementById('hud-room')!.textContent!);
  expect(await room(a)).toContain('You are the game master');
  expect(await room(b)).not.toContain('You are the game master');
  // only the game master is offered a new round
  const offered = (page: Page) =>
    page.evaluate(() => {
      window.game.pause();
      return !document.getElementById('new-round-open')!.hidden;
    });
  expect(await offered(b)).toBe(false);
  await b.evaluate(() => document.getElementById('resume')!.click());
  expect(await offered(a)).toBe(true);
  const before = await world(a);
  // an arena of free space both modes are played in
  const target = before.arena === 'belt' ? 'rings' : 'belt';
  const mode = before.mode === 'race' ? 'deathmatch' : 'race';
  await chooseRound(a, target, mode);
  // the round ends on both, with the reason on the scoreboard of the other
  await b.waitForFunction(() => !document.getElementById('results')!.hidden, undefined, { timeout: 20_000 });
  expect(await b.evaluate(() => document.getElementById('results-next')!.textContent)).toContain('game master');
  for (const page of [a, b]) await page.waitForFunction((round) => window.game.roundId === round + 1, before.round, { timeout: 30_000 });
  await b.waitForFunction((target) => window.game.venue.id === target, target, { timeout: 10_000 });
  const [seenA, seenB] = [await world(a), await world(b)];
  expect(seenA.arena).toBe(target);
  expect(seenB.arena).toBe(target);
  expect(seenB.rocks).toEqual(seenA.rocks);
  expect([seenA.mode, seenB.mode]).toEqual([mode, mode]);
  await ranHonestly(errors, a, b);
});

test('the game master is the DJ: it skips the song and types a title, and the other tab plays the same at the same beat, without controls of its own', async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}d`);
  // nothing here is seen: unrendered, the tabs keep their frames short on a busy machine, where
  // gaps past CUT_OFF_MS (net/session) make a browser start over
  for (const page of [a, b]) await page.evaluate(() => (window.game.composer.render = () => {}));
  const onAir = (page: Page) => page.evaluate(() => window.game.musicCue() as { title: string; elapsed: number });
  const deck = (page: Page) => page.evaluate(() => getComputedStyle(document.getElementById('np-next')!).display !== 'none');
  await a.waitForFunction(() => document.getElementById('now-playing')!.classList.contains('dj'));
  expect(await deck(a)).toBe(true);
  expect(await deck(b)).toBe(false);
  expect(await a.evaluate(() => document.getElementById('hud-room')!.textContent)).toContain('(and DJ)');
  const programme = (await onAir(a)).title;
  expect((await onAir(b)).title).toBe(programme);
  // forward through the programme from the radio's own button: the other tab follows
  await a.evaluate(() => document.getElementById('np-next')!.click());
  const next = (await onAir(a)).title;
  expect(next).not.toBe(programme);
  await b.waitForFunction((title) => window.game.musicCue().title === title, next, { timeout: 10_000 });
  // the other tab's song keys step nothing: it is told who picks the music
  await b.keyboard.press('Period');
  await b.waitForFunction(() => document.getElementById('hud-message')!.textContent!.includes('Only the game master picks the music'));
  expect((await onAir(a)).title).toBe(next);
  // title words on the DJ's plate; the other tab offers no plate
  await b.evaluate(() => window.game.pause());
  expect(await b.evaluate(() => document.getElementById('dj-open')!.hidden)).toBe(true);
  await b.evaluate(() => document.getElementById('resume')!.click());
  await a.evaluate(() => {
    window.game.pause();
    document.getElementById('dj-open')!.click();
  });
  await a.locator('#dj-words').fill('orbit   terror');
  await a.keyboard.press('Enter');
  await b.waitForFunction(() => window.game.musicCue().title === 'Orbit Terror', undefined, { timeout: 10_000 });
  expect((await onAir(a)).title).toBe('Orbit Terror');
  // the same beat: both a few seconds into the song, within the round clock's agreement
  const [cueA, cueB] = [await onAir(a), await onAir(b)];
  expect(cueA.elapsed).toBeLessThan(15);
  expect(Math.abs(cueA.elapsed - cueB.elapsed)).toBeLessThan(1);
  // words the radio does not take change nothing and say why
  await a.locator('#dj-words').fill('<b>x</b>');
  await a.keyboard.press('Enter');
  expect(await a.evaluate(() => document.getElementById('dj-note')!.textContent)).not.toBe('');
  expect((await onAir(a)).title).toBe('Orbit Terror');
  await ranHonestly(errors, a, b);
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
    // the flight computer holds it there, against a planet's pull too (Jupiter's 2.5 g would drop
    // a ship left alone a kilometer before the torpedo comes)
    game.autopilot = true;
    // every blow its hull takes, frame by frame: the torpedo's is one, whatever the arena's sun
    // burns besides out of the shadows (the Corona's)
    const blows: number[] = [];
    let last = game.me.hull;
    const watch = () => {
      if (game.me.hull < last - 1) blows.push(last - game.me.hull);
      last = game.me.hull;
      requestAnimationFrame(watch);
    };
    watch();
    (window as unknown as { blows: number[] }).blows = blows;
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
  // one blow of the torpedo's 60 hull points (see TORPEDO_DAMAGE), the hull 40 but for a sun's burn
  const blows = await b.evaluate(() => (window as unknown as { blows: number[] }).blows);
  expect(blows.length).toBe(1);
  expect(blows[0]).toBeCloseTo(60, 0);
  expect(await b.evaluate(() => window.game.me.hull)).toBeLessThanOrEqual(40);
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
  // the first tab's clone hooks the other; the winch reels it in to 70 m while the hook holds
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
  // taken by the ship that hooked it, on its arrival: four more torpedoes, and gone on both tabs
  expect(await a.evaluate(() => window.game.me.torpedoes)).toBe(before + 4);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.probes.find('e2e.0.0'))).toBeNull();
  await ranHonestly(errors, a, b);
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
  // fires its harpoon at it once the round's start has let it go (a loaded
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
  // the key comes up once the core is in tow (a second press before would let the harpoon go,
  // and a harpoon let go early takes nothing)
  const towed = (page: Page) => page.waitForFunction((thief) => window.game.flags.cores.some((core: { carrier: string | null }) => core.carrier === thief), thief, { timeout: 15_000 });
  await towed(b);
  await b.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' })));
  await towed(a);
  for (const page of [a, b]) expect(await page.evaluate(() => window.game.flags.cores.map((core: { carrier: string | null }) => core.carrier))).toContain(thief);
  expect(errors).toEqual([]);
});

test("two tabs of the President's Fleet see one battleship and count the same hits, a torpedo's too", async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}b&m=fleet&bots=0`);
  // the batteries hold their fire on both tabs, each firing at its own view of the clones, which
  // sit right above them: the test counts hits, and a clone shot down could not fire the next
  // shot or fly through the core. The battleship comes in on the field time; both tabs wait for it
  for (const page of [a, b]) {
    await page.evaluate(() => {
      window.game.fireBattery = () => {};
      window.game.field.setClock(13);
    });
  }
  await play(b, 2);
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
  const dropper = await b.evaluate(() => ({ id: window.game.me.id, deaths: window.game.me.deaths }));
  for (const page of [a, b]) {
    await page.evaluate(({ id, deaths }) => {
      const game = window.game;
      const part = game.fleet.zoneAt(2);
      const above = part.clone().set(0, 1, 0).applyQuaternion(game.fleet.quaternion).multiplyScalar(3000).add(part);
      game.probes.drop(id, deaths, ['nova'], above, game.fleet.velocity.clone(), game.time);
      // a drop flies apart at up to 20 m/s; this core keeps station over the battery instead, so
      // the clone sent there meets it however long the tabs take
      const core = game.probes.list.find((probe: { id: string }) => probe.id.startsWith(`${id}.${deaths}.`));
      core.velocity.copy(game.fleet.velocity);
      core.slotVelocity.copy(game.fleet.velocity);
    }, dropper);
  }
  await fireAt(a, 2, null, true);
  await a.waitForFunction(() => window.game.me.nova, undefined, { timeout: 10_000 });
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
      game.online.session.sendNova(game.me.id, at, game.field.clock);
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
    // no clone of theirs went down to it (a clone left idle for minutes can be lost otherwise: one drifted out past the arena's edge)
    const seen = await page.evaluate((name) => {
      const game = window.game;
      const novas = game.log.filter('death').filter((death: { cause: string; killer: string | null }) => death.cause === 'nova' || death.killer === name);
      return { novas: novas.length, cheaters: game.cheaters };
    }, name);
    expect(seen.novas).toBe(0);
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

test("a ship flies through a satellite's solar wing at speed with only the plug's scrape, and both tabs see the wing go the same way", async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}j&bots=0`);
  // the game master takes the room to the Satellite Junkyard
  await cutTo(a, b, 'junkyard', 'deathmatch');
  // past the round's opening (its intro flight and the start lights), when the ships fly free
  await b.waitForFunction(() => window.game.roundSeconds() > 10, undefined, { timeout: 60_000 });
  // the following tab's ship, 100 m short of a satellite's wing, flying square through it at 250 m/s
  const struck = await b.evaluate(() => {
    const game = window.game;
    const piece = [...game.field.asteroids.values()].find((a: { junk: { build: { kind: string } } | null }) => a.junk?.build.kind === 'satellite');
    const hard = piece.junk.build.hard as { max: number };
    const local = piece.object.position.clone().set((hard.max + piece.semiAxes.x) / 2, 0, 0);
    const at = piece.object.localToWorld(local.clone());
    const square = piece.object.localToWorld(local.clone().setY(1)).sub(at).normalize();
    const me = game.me;
    me.protectedUntil = 0;
    game.autopilot = false;
    me.flight.position.copy(at).addScaledVector(square, -2000);
    me.flight.velocity.copy(game.field.surfaceVelocity(piece, at, at.clone())).addScaledVector(square, 5000);
    me.flight.orientation.setFromRotationMatrix(game.camera.matrix.clone().lookAt(me.flight.position, at, square.clone().set(0, 1, 0)));
    return { id: piece.id as string, velocity: piece.velocity.toArray() as number[] };
  });
  await play(b, 1.5);
  const seen = (page: Page, id: string) => page.evaluate((id) => ({ velocity: window.game.field.asteroids.get(id).velocity.toArray() as number[], by: window.game.field.asteroids.get(id).shovedBy as number | null, hull: window.game.me.hull as number, alive: window.game.me.alive as boolean }), id);
  const there = await seen(b, struck.id);
  // through the wing at full speed, the hull scraped by the plug it tore out (75 kg at 250 m/s,
  // 2.3 MJ: 3 hull points, see sheetDamage); the wing knocked into a tumble
  expect(there.alive).toBe(true);
  expect(100 - there.hull).toBeCloseTo(3, 0);
  expect(there.by).toBe(-2);
  expect(there.velocity).not.toEqual(struck.velocity);
  // the leading tab took the strike from the striker's word
  await expect.poll(async () => (await seen(a, struck.id)).velocity, { timeout: 5_000 }).toEqual(there.velocity);
  expect(errors).toEqual([]);
});

test("two tabs agree again on a piece one of them moved alone, once the lead's sync of the field came round", async ({ context }) => {
  const { a, b, errors } = await pair(context, `e2e-${Date.now().toString(36)}s`);
  // where a piece is at a field time both tabs can name, on each tab
  const at = (page: Page, id: string, time: number) =>
    page.evaluate(
      ([id, time]) => {
        const piece = window.game.field.asteroids.get(id);
        return piece ? window.game.field.positionOf(piece, time, piece.object.position.clone()).toArray() : null;
      },
      [id, time] as const,
    );
  // a field of free space whose rocks drift (over a world fought over every piece stands solid on its ground)
  await cutTo(a, b, 'belt', 'deathmatch');
  const id = await a.evaluate(() => [...window.game.field.asteroids.values()].find((piece: { solid: boolean }) => !piece.solid)!.id as string);
  // the second tab (it follows) shoves it 100 m aside on its own
  const moved = await b.evaluate((id) => {
    const field = window.game.field;
    const piece = field.asteroids.get(id);
    const before = piece.object.position.y;
    field.move({ id, b: field.clock, p: piece.object.position.clone().setY(piece.object.position.y + 2000).toArray(), v: [0, 0, 0], q: piece.object.quaternion.toArray(), s: [0, 1, 0, 0], c: -2 });
    return piece.object.position.y - before;
  }, id);
  expect(moved).toBeCloseTo(2000, 0);
  const later = (await a.evaluate(() => window.game.field.clock as number)) + 60;
  // apart on the two tabs (a piece a bot's laser broke in the meantime is gone on both)
  const apart = async () => {
    const [here, there] = [await at(a, id, later), await at(b, id, later)];
    if (!here || !there) return here === there ? 0 : Infinity;
    return Math.hypot(here[0] - there[0], here[1] - there[1], here[2] - there[2]);
  };
  // the whole field comes round every 10 s
  await expect.poll(apart, { timeout: 25_000, intervals: [1000] }).toBeLessThan(1);
  expect(errors).toEqual([]);
});
