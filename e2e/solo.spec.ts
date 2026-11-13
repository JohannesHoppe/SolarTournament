import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openGame, play, startSolo, startSoloByMenu } from './game';

test('the title screen stands on two legs: the story Lot 7731, in the making and not to be clicked, and the Games with their three ways in; the ship and the hangar under the pad', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#menu-story #campaign')).toBeVisible();
  await expect(page.locator('#campaign')).toBeDisabled();
  await expect(page.locator('#campaign .mode-label')).toHaveText('Lot 7731');
  for (const id of ['school', 'start', 'online']) await expect(page.locator(`#menu-games #${id}`)).toBeVisible();
  // the ship's arrows and the hangar under the pad (the test browser's screen is wide)
  for (const id of ['ship-next', 'hangar']) await expect(page.locator(`#pad-controls #${id}`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a solo round starts and runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  // the solo plate opens with the default choice: a race against a full grid of seven rivals
  await startSoloByMenu(page);
  await play(page, 5);
  const state = await page.evaluate(() => {
    const game = window.game;
    return { state: game.state, ships: game.ships.length, arena: game.venue.id, alive: game.me.alive };
  });
  expect(state.state).toBe('playing');
  expect(state.ships).toBe(8);
  expect(state.alive).toBe(true);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const mode of ['deathmatch', 'survival', 'flag', 'fleet']) {
  test(`a solo round of ${mode} starts and runs without errors`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page, mode);
    await play(page, 3);
    const state = await page.evaluate(() => {
      const game = window.game;
      return { state: game.state, mode: game.roundMode, alive: game.me.alive };
    });
    expect(state).toEqual({ state: 'playing', mode, alive: true });
    expect(errors).toEqual([]);
  });
}

// the race worlds: the Crack in a vacuum, the Throat in Titan's air
for (const { world, title, air, pull } of [
  { world: 'crack', title: "Europa's Crack", air: false, pull: /0[.,]13/ },
  { world: 'throat', title: "Kraken Mare's Throat", air: true, pull: /0[.,]14/ },
]) {
  test(`a solo race over ${title} starts and runs without errors, its track from the start to the finish, the world's readouts under the height`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page, 'race', world);
    await play(page, 12);
    const state = await page.evaluate(() => {
      const game = window.game;
      const shown = (id: string) => !document.getElementById(id)!.hidden;
      return { state: game.state, arena: game.venue.id, alive: game.me.alive, finish: game.finishGates, gravity: shown('hud-grav'), grip: shown('hud-grip'), air: shown('hud-air'), value: document.getElementById('hud-grav-value')!.textContent };
    });
    expect(state).toMatchObject({ state: 'playing', arena: world, alive: true, gravity: true, grip: true, air });
    expect(state.finish).toBeGreaterThan(15);
    expect(state.value).toMatch(pull);
    expect(errors).toEqual([]);
  });
}

for (const arena of ['valhalla', 'lineae']) {
  test(`a solo deathmatch over the world ${arena} starts and runs without errors, every clone printed over its ground and none hurt by it`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page, 'deathmatch', arena);
    await play(page, 8);
    const state = await page.evaluate(() => {
      const game = window.game;
      const up = game.me.flight.position.clone();
      const heights: (number | null)[] = game.ships.filter((ship: { alive: boolean }) => ship.alive).map((ship: { flight: { position: unknown } }) => game.field.groundBelow(ship.flight.position, up));
      // the ground of a world kills nothing: no death there is a crash into rock
      const grounded = game.log.filter('death').filter((death: { cause: string }) => death.cause === 'rock').length;
      const shown = (id: string) => !document.getElementById(id)!.hidden;
      return { state: game.state, arena: game.venue.id, alive: game.me.alive, over: heights.every((h) => h !== null && h > 0), grounded, gravity: shown('hud-grav') };
    });
    expect(state).toEqual({ state: 'playing', arena, alive: true, over: true, grounded: 0, gravity: true });
    expect(errors).toEqual([]);
  });
}

test("a race over the Crack boosts: the overdrive recharges in 8 s and heats the drive, a third shove too soon burns it out, and the bots boost too", async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'race', 'crack');
  // past the start lights, then the boost
  await play(page, 12);
  const boost = async () => {
    await page.keyboard.down('KeyE');
    await play(page, 0.1);
    await page.keyboard.up('KeyE');
  };
  await boost();
  const first = await page.evaluate(() => {
    const game = window.game;
    const me = game.me;
    return { heat: me.driveHeat.read(game.time), recharge: me.overdriveReadyAt - game.time, gauge: !document.getElementById('hud-drive-heat-gauge')!.hidden, drive: me.driveOffline(game.time) };
  });
  expect(first.gauge).toBe(true);
  expect(first.heat).toBeGreaterThan(35);
  expect(first.recharge).toBeGreaterThan(7);
  expect(first.recharge).toBeLessThanOrEqual(8);
  // the drive burns on after a race's boost
  expect(first.drive).toBe(false);
  // two more at once, the recharge cut short as a probe would: the third burns the drive out
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window.game.me.overdriveReadyAt = 0));
    await boost();
  }
  const burnt = await page.evaluate(() => {
    const game = window.game;
    const me = game.me;
    return { heat: me.driveHeat.read(game.time), drive: me.driveOffline(game.time), hull: me.hull, shown: document.getElementById('hud-drive-heat')!.className };
  });
  expect(burnt.heat).toBeGreaterThan(100);
  expect(burnt.drive).toBe(true);
  expect(burnt.hull).toBeLessThanOrEqual(80);
  expect(burnt.shown).toContain('burnt');
  // the bots race on and boost on the canyon's straights
  await page.evaluate(() => (window.game.timeScale = 4));
  await play(page, 60);
  const boosted = await page.evaluate(() => window.game.log.filter('act').filter((event: { act?: string; ship?: string }) => event.act === 'overdrive' && event.ship !== window.game.me.name).length);
  expect(boosted).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('alone, the pause menu pays out the round and starts a new one at once, in the arena and mode chosen; the flight school offers none', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  await play(page, 3);
  const round = await page.evaluate(() => {
    const game = window.game;
    game.me.score = 500;
    const coins = game.hangar.coins;
    game.pause();
    const offered = !document.getElementById('new-round-open')!.hidden;
    const named = document.querySelector<HTMLElement>('#hud-room')!.textContent;
    document.getElementById('new-round-open')!.click();
    const mixed = !document.querySelector<HTMLElement>('[data-choice="new-round-mode"] button[data-value="mixed"]')!.hidden;
    document.querySelector<HTMLElement>('#new-round-arenas button[data-value="hole"]')!.click();
    document.querySelector<HTMLElement>('[data-choice="new-round-mode"] button[data-value="flag"]')!.click();
    document.getElementById('new-round-start')!.click();
    return { offered, named, mixed, paid: game.hangar.coins - coins, state: game.state, arena: game.venue.id, mode: game.roundMode, score: game.me.score, plate: document.getElementById('new-round')!.hidden, pause: document.getElementById('pause')!.hidden };
  });
  expect(round).toMatchObject({ offered: true, named: '', mixed: false, state: 'playing', arena: 'hole', mode: 'flag', score: 0, plate: true, pause: true });
  expect(round.paid).toBeGreaterThan(0);
  await play(page, 2);
  const school = await page.evaluate(() => {
    const game = window.game;
    game.showMenu();
    document.getElementById('school-basic')!.click();
    game.pause();
    return document.getElementById('new-round-open')!.hidden;
  });
  expect(school).toBe(true);
  expect(errors).toEqual([]);
});

test('alone, the Host is the DJ: back and forward on the radio, title words on the pause menu\'s plate; the flight school has no DJ', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  await play(page, 3);
  const title = () => page.evaluate(() => window.game.musicCue().title as string);
  const programme = await title();
  await page.waitForFunction(() => document.getElementById('now-playing')!.classList.contains('dj'));
  // the radio keeps its cue from frame to frame: the DJ's buttons never stop it
  expect(await page.evaluate(() => new Promise<boolean>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.game.radio.playing as boolean)))))).toBe(true);
  await page.evaluate(() => document.getElementById('np-next')!.click());
  const next = await title();
  expect(next).not.toBe(programme);
  await page.evaluate(() => document.getElementById('np-back')!.click());
  expect(await title()).toBe(programme);
  // the plate: what is on air, and the words of a title
  await page.evaluate(() => {
    window.game.pause();
    document.getElementById('dj-open')!.click();
  });
  expect(await page.evaluate(() => document.getElementById('dj-on-air')!.textContent)).toBe(programme);
  await page.locator('#dj-words').fill('golden damage');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => [document.getElementById('dj-on-air')!.textContent, window.game.state])).toEqual(['Golden Damage', 'paused']);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => [document.getElementById('dj')!.hidden, document.getElementById('pause')!.hidden])).toEqual([true, false]);
  // a solo round's pause plays the lounge; back in the round the DJ's title is on air
  await page.evaluate(() => document.getElementById('resume')!.click());
  expect(await title()).toBe('Golden Damage');
  // the flight school plays no radio and has no DJ
  const school = await page.evaluate(() => {
    const game = window.game;
    game.showMenu();
    document.getElementById('school-basic')!.click();
    game.pause();
    return document.getElementById('dj-open')!.hidden;
  });
  expect(school).toBe(true);
  await page.waitForFunction(() => !document.getElementById('now-playing')!.classList.contains('dj'));
  expect(errors).toEqual([]);
});

test('the hangar sells an upgrade for Solar Coins and keeps it, and neither the Magpie nor the Sovereign is flown before it is earned', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('solartournament.hangar', JSON.stringify({ coins: 1200, ship: 'human' }));
    sessionStorage.setItem('seeded', '1');
  });
  const errors = await openGame(page);
  await page.click('#hangar');
  await page.locator('.upgrade', { hasText: 'Radiators' }).click();
  await expect(page.locator('#hangar-coins')).toContainText('200 Solar Coins');
  // the previous ships from the human interceptor are the Magpie and the Sovereign, both still holograms
  await page.click('#ship-prev');
  await expect(page.locator('#ship-note')).toContainText('Bring Lot 7731 through the campaign');
  await page.click('#ship-prev');
  await expect(page.locator('#ship-note')).toContainText('Make both interceptors complete');
  await page.reload();
  await page.waitForFunction(() => window.game?.composer);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.hangar')!));
  expect(kept.coins).toBe(200);
  expect(kept.levels.human.radiators).toBe(1);
  expect(kept.ship).toBe('human');
  expect(errors).toEqual([]);
});

test('a hangar edited to what no Host can own is named on screen and not used, until it is put back or cleared', async ({ page, context }) => {
  const errors = await openGame(page);
  const insult = page.locator('#tampered');
  await expect(insult).toBeHidden();
  // edited in another tab: the storage event brings the insult at once
  const other = await context.newPage();
  await other.goto('/datenschutz.html');
  const honest = await other.evaluate(() => localStorage.getItem('solartournament.hangar'));
  await other.evaluate(() => localStorage.setItem('solartournament.hangar', JSON.stringify({ coins: 999_999_999, ship: 'human' })));
  await expect(insult).toBeVisible();
  await expect(insult).toContainText('CHEATER');
  await expect(page.locator('#hangar-note')).not.toContainText('999');
  // put back the way it was found: gone
  await other.evaluate((entry) => (entry === null ? localStorage.removeItem('solartournament.hangar') : localStorage.setItem('solartournament.hangar', entry)), honest);
  await expect(insult).toBeHidden();
  // edited in the own tab, which raises no storage event, it is noticed all the same, and clearing the storage forgives it
  await page.evaluate(() => localStorage.setItem('solartournament.hangar', JSON.stringify({ levels: { human: { drive: 7 } } })));
  await expect(insult).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await expect(insult).toBeHidden();
  expect(errors).toEqual([]);
});

for (const course of ['basic', 'racer', 'gladiator', 'arsenal', 'tactician']) {
  test(`the flight school's ${course} course starts in the Rings of Saturn`, async ({ page }) => {
    const errors = await openGame(page);
    await page.click('#school');
    await page.click(`#school-${course}`);
    await play(page, 2);
    expect(await page.evaluate(() => window.game.venue.id)).toBe('rings');
    await expect(page.locator('#school-step')).toContainText(/\d+\/\d+/);
    expect(errors).toEqual([]);
  });
}

test('the tactician’s turn and shoot drill: the brake flips the nose onto the drone on the tail, the laser takes it down, and the brake pressed again turns the ship back onto its course', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.school-step', JSON.stringify({ tactician: 'turnShoot' })));
  const errors = await openGame(page);
  await page.click('#school');
  await page.click('#school-tactician');
  // the drill counts once its line is said and the drone is out
  await page.waitForFunction(() => window.game.drone?.alive && window.game.school?.attempt?.live, null, { timeout: 90_000 });
  const step = () => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.school-step') ?? '{}').tactician);
  // a press the game sees: held over a few frames
  const tapBrake = async () => {
    await page.keyboard.down('KeyS');
    await play(page, 0.1);
    await page.keyboard.up('KeyS');
  };
  await tapBrake();
  // as a Host does: the pointer on the drone as the brake brings the nose round to it (the
  // ship turns towards the pointer), firing while the nose is on it. The hand works in the page,
  // once a frame, as the Host sees the frames: a loaded machine slows the game's frames and the
  // hand alike, never the hand alone (a round trip of the test per look lags it by whole frames)
  const viewport = page.viewportSize()!;
  const trace = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const game = window.game;
        const lines: string[] = [];
        const until = game.time + 10;
        let firing = false;
        const fire = (on: boolean) => {
          if (on === firing) return;
          firing = on;
          window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'Space' }));
        };
        const look = () => {
          const drone = game.drone;
          if (!drone?.alive || game.time > until) {
            fire(false);
            resolve(lines);
            return;
          }
          const on = drone.flight.position.clone().project(game.camera);
          const to = drone.flight.position.clone().sub(game.me.flight.position);
          const nose = game.me.flight.noseAngleTo(to);
          lines.push(`${game.time.toFixed(2)} ${game.brakePhase} nose ${((nose * 180) / Math.PI).toFixed(1)}° v ${(game.me.flight.velocity.length() / 20).toFixed(0)} hull ${drone.hull.toFixed(0)}`);
          if (on.z < 1) document.dispatchEvent(new MouseEvent('mousemove', { clientX: ((on.x + 1) / 2) * window.innerWidth, clientY: ((1 - on.y) / 2) * window.innerHeight }));
          fire(nose < 0.03);
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
  );
  expect(await page.evaluate(() => window.game.drone?.alive ?? false), trace.slice(-30).join('\n')).toBe(false);
  // the drone down, the Host lets go of the pointer
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  // pressed again, unless the brake came to rest and turned back by itself already
  if (await page.evaluate(() => window.game.brakePhase === 'brake')) await tapBrake();
  // a brake that came to rest before the drone went down turns back while the Host still holds the
  // pointer on the drone, which takes the nose (BRAKE_TAKEOVER): then the Host steers back to the
  // buoy by hand, the pointer towards it, and lets go once the nose is on it
  for (let i = 0; i < 400; i++) {
    const back = await page.evaluate(() => {
      const game = window.game;
      const buoy = game.school?.attempt?.points?.[0];
      if (game.brakePhase !== 'off' || !buoy) return null;
      const to = game.me.flight.toLocalDirection(buoy.clone().sub(game.me.flight.position));
      return { x: to.x, y: to.y, nose: game.me.flight.noseAngleTo(to.applyQuaternion(game.me.flight.orientation)) };
    });
    if (!back || back.nose < 0.05) break;
    // full deflection towards the buoy while it is far off the nose, less as it comes on
    const full = Math.min(viewport.width, viewport.height) * 0.25;
    const across = Math.hypot(back.x, back.y) || 1;
    const reach = full * Math.min(1, back.nose / 0.5);
    await page.mouse.move(viewport.width / 2 + (back.x / across) * reach, viewport.height / 2 - (back.y / across) * reach);
    await page.waitForTimeout(30);
  }
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect.poll(step, { timeout: 30_000 }).toBe('slideShot');
  expect(errors).toEqual([]);
});

test('the tactician’s rescue drill at the Event Horizon: burning away on a hurt drive, the alarm calls the overdrive, and fired the ship gets out', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.school-step', JSON.stringify({ tactician: 'rescue' })));
  const errors = await openGame(page);
  await page.click('#school');
  await page.click('#school-tactician');
  await page.waitForFunction(() => window.game.venue?.id === 'hole' && window.game.school?.attempt?.live && window.game.me?.alive, null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.game.me.drive)).toBeCloseTo(0.3, 5);
  await page.keyboard.down('KeyW');
  // the drive alone no longer gets out: the alarm calls the overdrive
  await page.waitForFunction(() => window.game.alarms.list.some((alarm: { id: string; text: string }) => alarm.id === 'well' && alarm.text === 'OVERDRIVE · AWAY FROM IT'), null, { timeout: 10_000 });
  await page.keyboard.down('KeyE');
  await play(page, 0.1);
  await page.keyboard.up('KeyE');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solartournament.school-step') ?? '{}').tactician), { timeout: 60_000 }).toBe('exam');
  await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});

test('the flight school’s orbit drill flies at the Event Horizon: free drift flies a STABLE ORBIT without the well’s alarm, and the autopilot calls the path ORBIT READY', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solartournament.school-step', JSON.stringify({ tactician: 'orbit' })));
  const errors = await openGame(page);
  await page.click('#school');
  await page.click('#school-tactician');
  await play(page, 2);
  expect(await page.evaluate(() => window.game.venue.id)).toBe('hole');
  // the drill puts the pilot 1.2 km above the hole, drifting too slowly for an orbit
  await expect(page.locator('#hud-orbit')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#hud-orbit-state')).toHaveText('NO ORBIT · FALLS IN');
  // a burn along the nose (still across the line to the hole) up to the speed of a circular orbit there
  await page.evaluate(() => {
    const flight = window.game.me.flight;
    const well = window.game.field.well;
    const arm = flight.position.clone().sub(well.position);
    const across = arm.clone().cross(flight.velocity).cross(arm).normalize();
    flight.velocity.copy(across).multiplyScalar(Math.sqrt((well.surfaceGravity * well.radius * well.radius) / arm.length()));
  });
  await expect(page.locator('#hud-orbit-state')).toHaveText('STABLE ORBIT');
  await play(page, 1);
  expect(await page.evaluate(() => window.game.alarms.list.some((alarm: { id: string }) => alarm.id === 'well'))).toBe(false);
  await expect(page.locator('#hud-escape')).not.toHaveClass(/caution|warning|critical/);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })));
  await expect(page.locator('#hud-orbit-state')).toHaveText('ORBIT READY');
  expect(errors).toEqual([]);
});

for (const kick of [true, false]) {
  test(`two ships side by side through a gate at 100 m/s: ${kick ? 'a kick puts the one at the band into it, a knockout for the kicker' : 'without a kick both pass'}`, async ({ page }) => {
    const errors = await openGame(page);
    await startSolo(page);
    // the opening's clamps hold every ship until the start
    await page.waitForFunction(() => window.game.clamped, null, { timeout: 60_000 });
    await page.waitForFunction(() => !window.game.clamped && window.game.me.alive, null, { timeout: 60_000 });
    const result = await page.evaluate(async (kick) => {
      const game = window.game;
      const me = game.me;
      const bot = game.bots[0];
      const victim = bot.ship;
      for (const ship of game.ships) {
        if (ship === me || ship === victim) continue;
        ship.alive = false;
        ship.respawnAt = Infinity;
      }
      // the victim flies straight on: its brain thinks, its hand stays still
      const think = bot.think.bind(bot);
      bot.think = (...args: unknown[]) => {
        const controls = think(...args);
        for (const key of Object.keys(controls)) controls[key] = typeof controls[key] === 'boolean' ? false : 0;
        bot.shove = null;
        return controls;
      };
      const Vector3 = me.flight.position.constructor;
      const center = game.course.points[2];
      const facing = game.course.normals[2].clone().normalize();
      const side = new Vector3(0, 1, 0).cross(facing).normalize();
      // the band's inner face is 2420 units (121 m) off the gate's axis: the victim passes 10 m
      // inside it, the Host 45 m further in, both 300 m before the gate
      const place = (ship: any, out: number) => {
        ship.flight.position.copy(center).addScaledVector(side, out).addScaledVector(facing, -6000);
        ship.flight.velocity.copy(facing).multiplyScalar(2000);
        ship.flight.angularVelocity.set(0, 0, 0);
        ship.flight.orientation.setFromUnitVectors(new Vector3(0, 0, -1), facing);
        ship.protectedUntil = 0;
        ship.syncTransform();
      };
      const out = 2420 - victim.radius - 200;
      place(victim, out);
      place(me, out - 900);
      const kills = me.kills;
      const deaths = victim.deaths;
      const start = game.time;
      const wait = async (seconds: number) => {
        while (game.time - start < seconds) await new Promise((resolve) => requestAnimationFrame(resolve));
      };
      // the kick 100 m before the gate: kicked earlier, the victim would drift out past the band
      // before it reaches the gate
      await wait(2);
      if (kick) game.dodge({ x: Math.sign(me.flight.toLocal(victim.flight.position.clone()).x), y: 0 });
      await wait(3.5);
      return { died: victim.deaths > deaths, kills: me.kills - kills, banner: game.hud.bannerText.textContent };
    }, kick);
    expect(result).toEqual(kick ? { died: true, kills: 1, banner: 'KNOCKOUT' } : { died: false, kills: 0, banner: '' });
    expect(errors).toEqual([]);
  });
}

test('the self-destruct, held for a second, takes a rival close by along, a kill of the Host’s, and the Host’s clone with it', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch');
  await page.waitForFunction(() => window.game.clamped, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.clamped && window.game.me?.alive, null, { timeout: 60_000 });
  const before = await page.evaluate(() => {
    const game = window.game;
    const me = game.me;
    const [rival, ...others] = game.ships.filter((ship: { id: string }) => ship !== me);
    for (const ship of others) {
      ship.alive = false;
      ship.respawnAt = Infinity;
    }
    // the rival 30 m off the own ship, at rest beside it
    rival.flight.position.copy(me.flight.position).add({ x: 600, y: 0, z: 0 });
    rival.flight.velocity.set(0, 0, 0);
    rival.protectedUntil = 0;
    me.protectedUntil = 0;
    game.rivalForTest = rival;
    return { kills: me.kills, deaths: me.deaths };
  });
  // held: nothing before the second is up, then it goes off (within 3 s of game time, however the frames fall)
  // the rival is a bot and would fly off: it is held beside the own ship every frame
  await page.keyboard.down('KeyB');
  const held = await page.evaluate(async () => {
    const game = window.game;
    const me = game.me;
    const rival = game.rivalForTest;
    const start = game.time;
    let early = false;
    while (me.alive && game.time - start < 3) {
      if (rival.alive) {
        rival.flight.position.copy(me.flight.position).add({ x: 600, y: 0, z: 0 });
        rival.flight.velocity.copy(me.flight.velocity);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!me.alive && game.time - start < 0.6) early = true;
    }
    return { early };
  });
  await page.keyboard.up('KeyB');
  expect(held.early).toBe(false);
  const after = await page.evaluate(() => ({ kills: window.game.me.kills, deaths: window.game.me.deaths, rival: window.game.rivalForTest.alive }));
  expect(after.rival).toBe(false);
  expect(after.kills).toBe(before.kills + 1);
  expect(after.deaths).toBe(before.deaths + 1);
  expect(errors).toEqual([]);
});

test('the sponsor break keeps a death by a shooter as a clip: three seconds of the replay as a video, saved where the browser shares no files', async ({ page }) => {
  const errors = await openGame(page);
  await startSolo(page, 'deathmatch', 'belt');
  // past the round's opening (intro, countdown), when lasers start to count
  await play(page, 10);
  // a rival's lasers take the clone; the kill cam replays it, then the break offers the clip
  await page.evaluate(() => {
    const game = window.game;
    const killer = game.ships.find((ship: { alive: boolean }) => ship !== game.me && ship.alive);
    for (let k = 0; k < 200 && game.me.alive; k++) game.applyLaserHit(game.me, killer.flight.position.clone(), game.me.flight.position.clone().sub(killer.flight.position).normalize(), killer);
  });
  const clip = page.locator('#sponsor-clip');
  await expect(clip).toBeVisible({ timeout: 20_000 });
  await clip.click();
  await expect(clip).toHaveText('Share the clip', { timeout: 15_000 });
  const download = page.waitForEvent('download');
  await clip.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^solartournament-kill\.(mp4|webm)$/);
  const seconds = await page.evaluate(async (url) => {
    const video = document.createElement('video');
    video.src = url;
    await new Promise((resolve) => (video.onloadedmetadata = resolve));
    // a WebM's length is known once it is read to its end
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e6;
      await new Promise((resolve) => (video.ontimeupdate = resolve));
    }
    return video.duration;
  }, `data:video/${file.suggestedFilename().endsWith('.mp4') ? 'mp4' : 'webm'};base64,${readFileSync(await file.path()).toString('base64')}`);
  expect(seconds).toBeGreaterThan(2.5);
  expect(seconds).toBeLessThan(4);
  await expect(clip).toHaveText('Clip saved');
  expect(errors).toEqual([]);
});
