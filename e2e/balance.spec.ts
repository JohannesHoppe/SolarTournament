import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openGame, startSolo } from './game';
import { ROUND_SECONDS } from '../src/music/songs';

/**
 * Balance (npm run balance, not part of npm run e2e: each round takes about a minute): every
 * mode of a solo round plays out in time-lapse, ROUNDS times, with the default rivals and the
 * Host's ship taken out. What a bot of middling skill (Kessler, 0.5) cannot manage, a Host will
 * not manage either: on average it scores at least the median (in a race: it finishes), and it
 * does not die all the time; a deathmatch is a fight, Capture the Flag sees captures, and the bots together sink the
 * President's battleship. One round alone says little: a single dogfight can turn any round.
 */
const MIDDLING = 'Kessler';
const ROUNDS = 2;
/** Game seconds per real second: a five-minute round in under a minute. */
const TIME_LAPSE = 6;

type Pilot = { name: string; kills: number; deaths: number; score: number; finish: number };
/** A round's standings, and the development log of it (see src/devlog.ts): its summary and the whole of it as JSON. */
type Round = { standings: Pilot[]; captures: number; sunk: boolean; summary: { arena: string; deaths: Record<string, number> } & Record<string, unknown>; log: string };

/** Plays a whole solo round of `mode` with the Host out, and returns how it went. */
async function playRound(page: Page, mode: string): Promise<Round> {
  await openGame(page);
  await startSolo(page, mode);
  return page.evaluate(
    async ([lapse, roundSeconds]) => {
      const game = window.game;
      // the Host is no pilot here: its ship is gone for the round
      game.me.alive = false;
      game.me.root.visible = false;
      game.me.respawnAt = Infinity;
      game.timeScale = lapse;
      const start = game.time;
      // a solo round ends on the wall clock (the radio keeps time with it): in time-lapse the
      // round is ended after its five minutes of game time, unless it was decided before
      while (game.state !== 'results') {
        if (game.time - start >= roundSeconds) game.endRound();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const standings = game
        .standings()
        .filter((ship: object) => ship !== game.me)
        .map((ship: Pilot) => ({ name: ship.name, kills: ship.kills, deaths: ship.deaths, score: ship.score, finish: ship.finish }));
      return { standings, captures: game.flags ? game.flags.captures[0] + game.flags.captures[1] : 0, sunk: !!game.fleet?.down, summary: game.log.summary(), log: game.log.json() };
    },
    [TIME_LAPSE, ROUND_SECONDS],
  );
}

/** ROUNDS rounds of a mode, and what they come to on average for the middling bot. */
async function playRounds(page: Page, mode: string) {
  const rounds: Round[] = [];
  for (let i = 0; i < ROUNDS; i++) rounds.push(await playRound(page, mode));
  // the whole log of every round goes with the result; its deaths by cause into the detail of a failure
  for (const [i, round] of rounds.entries()) {
    const path = test.info().outputPath(`${mode}-${i + 1}-${round.summary.arena}.json`);
    writeFileSync(path, round.log);
    await test.info().attach(`log of round ${i + 1}`, { path, contentType: 'application/json' });
  }
  test.info().annotations.push({ type: mode, description: JSON.stringify(rounds.map((round) => ({ standings: round.standings, summary: round.summary }))) });
  const mean = (value: (round: Round) => number) => rounds.reduce((sum, round) => sum + value(round), 0) / rounds.length;
  const pilot = (round: Round) => round.standings.find((p) => p.name === MIDDLING)!;
  const median = (round: Round) => round.standings.map((p) => p.score).sort((a, b) => a - b)[Math.floor(round.standings.length / 2)];
  return {
    rounds,
    detail: JSON.stringify(rounds.map((round) => ({ arena: round.summary.arena, deaths: round.summary.deaths, standings: round.standings }))),
    score: mean((round) => pilot(round).score),
    median: mean(median),
    deaths: mean((round) => pilot(round).deaths),
    place: mean((round) => round.standings.indexOf(pilot(round)) + 1),
    kills: mean((round) => round.standings.reduce((sum, p) => sum + p.kills, 0)),
  };
}

// a busy machine plays the time-lapse slower: BALANCE_SLOW=4 gives each test four times as long
test.describe.configure({ timeout: ROUNDS * 150_000 * Number(process.env.BALANCE_SLOW ?? 1) });

test('a deathmatch is a fight, and a middling bot holds its own in it', async ({ page }) => {
  const r = await playRounds(page, 'deathmatch');
  expect(r.kills, r.detail).toBeGreaterThanOrEqual(6);
  expect(r.score, r.detail).toBeGreaterThanOrEqual(r.median);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(4);
});

// every racing bot flies the ideal line alike: the place among them is chance and fights, so a
// race asks of the middling bot what it asks of a Host, to finish without dying all the time
test('a middling bot finishes a race, without dying all the time', async ({ page }) => {
  const r = await playRounds(page, 'race');
  for (const round of r.rounds) expect(round.standings.find((p) => p.name === MIDDLING)!.finish, r.detail).toBeGreaterThan(0);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(3);
});

test('a middling bot is not among the first out of Last Clone Standing', async ({ page }) => {
  const r = await playRounds(page, 'survival');
  expect(r.place, r.detail).toBeLessThanOrEqual(5);
});

test('Capture the Flag sees captures, and a middling bot does not die all the time', async ({ page }) => {
  const r = await playRounds(page, 'flag');
  expect(r.rounds.reduce((sum, round) => sum + round.captures, 0), r.detail).toBeGreaterThan(0);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(5);
});

test("the bots sink the President's battleship before the time runs out", async ({ page }) => {
  const r = await playRounds(page, 'fleet');
  for (const round of r.rounds) expect(round.sunk, r.detail).toBe(true);
  expect(r.deaths, r.detail).toBeLessThanOrEqual(3);
});
