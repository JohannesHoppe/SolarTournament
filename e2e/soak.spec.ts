import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openGame, play } from './game';

/**
 * The cheat checks in honest play (npm run soak, not part of npm run e2e: about a quarter of an
 * hour). Three tabs of one tournament (?local=1) play a round of every mode in turn with the
 * lead's bots, which shove, ram, hook, dodge and fire torpedoes; each tab's Host flies too, by a
 * wild hand on the keys (the stick slammed about, the drive, flips, dodges, the hook, the
 * overdrive, the laser and torpedoes). Nobody cheats, so no tab may report another and nobody
 * may be named a cheater; every check a ship failed even once (`game.online.suspicions`) is
 * listed, and how close each check came to its bound (`game.online.margins`, 1: on it).
 */
const TABS = 3;
/** Real seconds of each round: its end is brought forward to this by the lead (a round runs five minutes). */
const ROUND = Number(process.env.SOAK_ROUND ?? 100);
const MODES = 5;

/** Joins a tournament of tabs; the Host's clone flies with a wild hand on the keys. */
async function join(page: Page, room: string) {
  // three tabs of the GPU-less test browser play too slowly with their audio on: it stays
  // suspended here, the checks need none of it
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        void super.suspend();
      }
      override resume() {
        return Promise.resolve();
      }
    };
  });
  // a page takes its time on a loaded machine; a round takes longer anyway
  const errors = await openGame(page, `/?local=1#t=${room}`, 240_000);
  await page.evaluate(() => {
    const game = window.game;
    game.cheaters = [];
    const announce = game.announceCheater.bind(game);
    game.announceCheater = (name: string) => {
      game.cheaters.push(name);
      announce(name);
    };
    document.getElementById('online')!.click();
  });
  return errors;
}

/** A wild hand on the keys: every few tenths of a second other keys held, now and then a double tap (a dodge), the hook, the overdrive, a torpedo. */
async function wildHand(page: Page) {
  await page.evaluate(() => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyX', 'Space', 'KeyF', 'KeyR'];
    const taps = ['KeyA', 'KeyD', 'KeyV', 'KeyE', 'KeyG', 'KeyT'];
    const press = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    const held = new Set<string>();
    setInterval(() => {
      for (const code of keys) {
        const down = Math.random() < (code === 'Space' || code === 'KeyW' ? 0.5 : 0.25);
        if (down !== held.has(code)) press(code, down);
        if (down) held.add(code);
        else held.delete(code);
      }
      const tap = taps[Math.floor(Math.random() * taps.length * 3)];
      if (!tap) return;
      press(tap, true);
      setTimeout(() => press(tap, false), 60);
      // a double tap of a thruster key dodges
      if ((tap === 'KeyA' || tap === 'KeyD') && Math.random() < 0.5) {
        setTimeout(() => press(tap, true), 120);
        setTimeout(() => press(tap, false), 180);
      }
    }, 250);
  });
}

/** What a tab's checks found: reports, cheaters named, failed checks, margins. */
const verdict = (page: Page) =>
  page.evaluate(() => {
    const game = window.game;
    const online = game.online;
    return {
      round: game.roundId as number,
      mode: game.roundMode as string,
      arena: game.venue.id as string,
      state: game.state as string,
      reported: online ? [...online.reported] : [],
      cheaters: game.cheaters as string[],
      suspicions: online ? online.suspicions.map((s: { ship: string; cheat: string; strikes: number; share: number; round: number; reported: boolean }) => `${s.ship} ${s.cheat} ×${s.strikes} share ${s.share} round ${s.round}${s.reported ? ' reported' : ''}`) : [],
      margins: online ? { ...online.margins } : {},
      ships: game.ships.length as number,
    };
  });

test('honest tabs play a round of every mode and never take each other for cheats', async ({ context }) => {
  test.setTimeout((MODES * (ROUND + 120) + TABS * 240 + 120) * 1000);
  const room = `soak-${Date.now().toString(36)}&m=mixed`;
  const pages: Page[] = [];
  const errors: string[] = [];
  for (let i = 0; i < TABS; i++) {
    const page = await context.newPage();
    errors.push(...(await join(page, room)));
    await play(page, i === 0 ? 7 : 9);
    pages.push(page);
  }
  for (const page of pages) await wildHand(page);
  const rounds = [];
  let lead = pages[0];
  for (let n = 0; n < MODES; n++) {
    // whichever tab leads brings the round's end forward, so every mode gets its turn
    for (const page of pages) if (await page.evaluate(() => window.game.online?.isLead === true)) lead = page;
    const round = await lead.evaluate(() => window.game.roundId as number);
    await lead.evaluate((seconds) => {
      const game = window.game;
      if (game.roundEndsAtWall - performance.now() / 1000 > seconds) game.setRoundEnd(seconds);
    }, ROUND);
    const deadline = Date.now() + (ROUND + 120) * 1000;
    while ((await lead.evaluate(() => window.game.roundId as number)) <= round) {
      expect(Date.now(), `round ${round} still runs`).toBeLessThan(deadline);
      await lead.waitForTimeout(5000);
    }
    const seen = [];
    for (const page of pages) seen.push(await verdict(page));
    rounds.push({ round, seen });
    console.log(JSON.stringify({ round, seen: seen.map(({ mode, arena, reported, cheaters, suspicions, ships, state }) => ({ mode, arena, reported, cheaters, suspicions, ships, state })) }));
  }
  await play(lead, 2);
  const last = [];
  for (const page of pages) last.push(await verdict(page));
  const path = test.info().outputPath('soak.json');
  writeFileSync(path, JSON.stringify({ rounds, last }, null, 2));
  await test.info().attach('soak', { path, contentType: 'application/json' });
  console.log(JSON.stringify(last.map((tab) => tab.margins)));
  for (const tab of last) {
    expect(tab.state).not.toBe('menu');
    expect(tab.reported).toEqual([]);
    expect(tab.cheaters).toEqual([]);
  }
  expect(rounds.every(({ seen }) => seen.every((tab) => tab.reported.length === 0 && tab.cheaters.length === 0))).toBe(true);
  expect(errors).toEqual([]);
});
