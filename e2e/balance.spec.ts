import { writeFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { openGame, startSolo } from './game';
import { ROUND_SECONDS } from '../src/music/songs';

/**
 * Balance (npm run balance, not part of npm run e2e): every mode of a solo round plays out in
 * time-lapse in every arena, with the default rivals and the Host's ship taken out. What a bot of
 * middling skill (Kessler, 0.5) cannot manage, a Host will not manage either: on average it
 * scores at least the median (in a race: it finishes), and it does not die all the time; a
 * deathmatch is a fight, Capture the Flag sees captures, and the bots together sink the
 * President's battleship.
 *
 * One round says little: a single dogfight can turn it, and an arena of its own (the corona's
 * hot lasers, the black hole's pull) favors other pilots. So each mode plays every arena, the
 * same ones every time, ROUNDS_PER_ARENA rounds each, and the middling bot is judged on its mean
 * over all of them: as many as it takes for chance not to decide the check (see the e2e README
 * for the numbers behind them). The rounds run side by side on PAGES pages.
 */
const MIDDLING = 'Kessler';
/**
 * Rounds per arena of each mode. In a deathmatch the middling bot's lead over the median differs
 * from round to round by about 550 points either way (a bot makes one or two kills a round),
 * against about 130 on average (672 rounds): over 168 rounds its mean scatters by about 45, so
 * chance does not decide the check. In Last Clone Standing its mean place lies about 1.1 inside
 * the limit, with a scatter of about 1.8 places a round: 42 rounds. The race and the battleship
 * are clearer.
 */
const ROUNDS_PER_ARENA: Record<string, number> = { deathmatch: 24, survival: 6, race: 1, flag: 2, fleet: 1 };
/**
 * Game seconds per real second: a five-minute round in half a minute. The simulation takes the
 * same steps at any time-lapse (at most a thirtieth of a second each, see MAX_STEP in game.ts),
 * and the round's clock follows the game's time, so the round plays as it is played.
 */
const TIME_LAPSE = 10;
/** Rounds played side by side, each on a page of its own (BALANCE_PAGES on a busy or small machine). */
const PAGES = Number(process.env.BALANCE_PAGES ?? 7);
/** A busy machine plays the time-lapse slower: BALANCE_SLOW=4 gives each round four times as long. */
const SLOW = Number(process.env.BALANCE_SLOW ?? 1);
/** Real seconds a round may take at most, its loading included. */
const ROUND_BUDGET = 120;
/** Game seconds a round may run past its five minutes (its opening, a sinking battleship) before its clock counts as stuck. */
const ROUND_GRACE = 30;

type Pilot = { name: string; kills: number; deaths: number; score: number; finish: number };
/** A round's standings, how long it ran (game seconds), and the development log of it (see src/devlog.ts): its summary and the whole of it as JSON. */
type Round = { arena: string; standings: Pilot[]; captures: number; sunk: boolean; seconds: number; summary: { arena: string; deaths: Record<string, number> } & Record<string, unknown>; log: string };

/** Plays a whole solo round of `mode` in `arena` on a fresh page with the Host out, and returns how it went. */
async function playRound(browser: Browser, mode: string, arena: string): Promise<Round> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await openGame(page);
    await page.evaluate((arena) => (window.game.solo.arena = arena), arena);
    await startSolo(page, mode);
    return await page.evaluate(
      async ([lapse, limit]) => {
        const game = window.game;
        // the Host is no pilot here: its ship is gone for the round
        game.me.alive = false;
        game.me.root.visible = false;
        game.me.respawnAt = Infinity;
        game.timeScale = lapse;
        const start = game.time;
        // the round ends by its own clock, which follows the game's time
        while (game.state !== 'results') {
          if (game.time - start > limit) throw new Error(`the round's clock did not end the round after ${Math.round(game.time - start)} s of game time`);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const standings = game
          .standings()
          .filter((ship: object) => ship !== game.me)
          .map((ship: Pilot) => ({ name: ship.name, kills: ship.kills, deaths: ship.deaths, score: ship.score, finish: ship.finish }));
        const summary = game.log.summary();
        return { arena: summary.arena, standings, captures: game.flags ? game.flags.captures[0] + game.flags.captures[1] : 0, sunk: !!game.fleet?.down, seconds: Math.round(game.time - start), summary, log: game.log.json() };
      },
      [TIME_LAPSE, ROUND_SECONDS + ROUND_GRACE],
    );
  } finally {
    await context.close();
  }
}

/** Every arena (as the game has them: src/world/arenas.ts, served by the dev server). */
async function arenas(browser: Browser): Promise<string[]> {
  const page = await browser.newPage();
  try {
    await page.goto('/');
    return await page.evaluate(async (path) => (await import(path)).ARENAS.map((arena: { id: string }) => arena.id), '/src/world/arenas.ts');
  } finally {
    await page.close();
  }
}

/** Every round of a mode, PAGES at a time, and what they come to on average for the middling bot. */
async function playRounds(browser: Browser, mode: string) {
  const queue = (await arenas(browser)).flatMap((arena) => Array.from({ length: ROUNDS_PER_ARENA[mode] }, () => arena));
  const rounds: Round[] = [];
  const next = async () => {
    for (let arena = queue.shift(); arena; arena = queue.shift()) rounds.push(await playRound(browser, mode, arena));
  };
  expect(queue.length, 'the arenas the time-out was made for').toBe(ARENA_COUNT * ROUNDS_PER_ARENA[mode]);
  await Promise.all(Array.from({ length: PAGES }, next));
  // the whole log of every round goes with the result; its deaths by cause into the detail of a failure
  for (const [i, round] of rounds.entries()) {
    const path = test.info().outputPath(`${mode}-${i + 1}-${round.arena}.json`);
    writeFileSync(path, round.log);
    await test.info().attach(`log of round ${i + 1}`, { path, contentType: 'application/json' });
  }
  test.info().annotations.push({ type: mode, description: JSON.stringify(rounds.map((round) => ({ seconds: round.seconds, standings: round.standings, summary: round.summary }))) });
  const mean = (value: (round: Round) => number) => rounds.reduce((sum, round) => sum + value(round), 0) / rounds.length;
  const pilot = (round: Round) => round.standings.find((p) => p.name === MIDDLING)!;
  const median = (round: Round) => round.standings.map((p) => p.score).sort((a, b) => a - b)[Math.floor(round.standings.length / 2)];
  const detail = rounds.map((round) => ({ arena: round.arena, seconds: round.seconds, deaths: round.summary.deaths, standings: round.standings }));
  const result = {
    score: mean((round) => pilot(round).score),
    median: mean(median),
    deaths: mean((round) => pilot(round).deaths),
    place: mean((round) => round.standings.indexOf(pilot(round)) + 1),
    kills: mean((round) => round.standings.reduce((sum, p) => sum + p.kills, 0)),
  };
  // what the checks judged, and every round's standings and deaths by cause, next to the logs
  writeFileSync(test.info().outputPath(`${mode}.json`), JSON.stringify({ ...result, rounds: detail }, null, 1));
  return { ...result, rounds, detail: JSON.stringify(detail) };
}

/** The arenas there are, for the time the rounds take (checked in playRounds). */
const ARENA_COUNT = 7;
/** Long enough for every round of a mode, PAGES at a time. */
const timeout = (mode: string) => Math.ceil((ARENA_COUNT * ROUNDS_PER_ARENA[mode]) / PAGES) * ROUND_BUDGET * 1000 * SLOW + 60_000;

test('a deathmatch is a fight, and a middling bot holds its own in it', async ({ browser }) => {
  test.setTimeout(timeout('deathmatch'));
  const r = await playRounds(browser, 'deathmatch');
  expect(r.kills, r.detail).toBeGreaterThanOrEqual(6);
  expect(r.score, r.detail).toBeGreaterThanOrEqual(r.median);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(4);
});

// every racing bot flies the ideal line alike: the place among them is chance and fights, so a
// race asks of the middling bot what it asks of a Host, to finish without dying all the time
test('a middling bot finishes a race, without dying all the time', async ({ browser }) => {
  test.setTimeout(timeout('race'));
  const r = await playRounds(browser, 'race');
  for (const round of r.rounds) expect(round.standings.find((p) => p.name === MIDDLING)!.finish, r.detail).toBeGreaterThan(0);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(3);
});

test('a middling bot is not among the first out of Last Clone Standing', async ({ browser }) => {
  test.setTimeout(timeout('survival'));
  const r = await playRounds(browser, 'survival');
  expect(r.place, r.detail).toBeLessThanOrEqual(5);
});

test('Capture the Flag sees captures, and a middling bot does not die all the time', async ({ browser }) => {
  test.setTimeout(timeout('flag'));
  const r = await playRounds(browser, 'flag');
  expect(r.rounds.reduce((sum, round) => sum + round.captures, 0), r.detail).toBeGreaterThan(0);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(5);
});

test("the bots sink the President's battleship before the time runs out", async ({ browser }) => {
  test.setTimeout(timeout('fleet'));
  const r = await playRounds(browser, 'fleet');
  for (const round of r.rounds) expect(round.sunk, r.detail).toBe(true);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(3);
});
