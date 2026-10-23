import { expect, it } from 'vitest';
import { GATES } from '../game/race';
import type { ArenaProfile } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from './field';
import { ORDINARY, raceLaps } from './human';

/** A middling bot, the yardstick of the lap times. */
const SKILL = 0.5;
/** An ordinary Host's lap may take this much longer than the middling bot's. */
const LAP_MARGIN = 1.15;
/** Of the laps of an arena, at most this many may end with more than one gate missed or unfinished; none may end lost. */
const SLIPS = 1;
/** A race test flies a dozen laps: it is given this long (ms). */
const RACE_TIMEOUT = 120_000;

/**
 * The race test of an arena (see raceLaps): a simulated Host with hands from quick to slow flies
 * a lap; it is never lost, misses at most one gate nearly every time, and an ordinary Host is
 * about as fast as a middling bot. The race tests run in two files, so they run side by side.
 */
export function raceTest(arena: ArenaProfile) {
  it(
    `a lap in ${arena.id} with hands from quick to slow: never lost, at most one gate missed nearly every time, an ordinary Host about as fast as a middling bot`,
    () => {
      const { laps, bot } = raceLaps(testField(DETAIL), arena, SKILL);
      const lines = laps.map(({ hands, seed, flight }) => `reaction ${hands.reaction} s, seed ${seed}: ${flight.crashed ? 'LOST' : `${flight.passed}/${GATES + 1} gates in ${flight.seconds.toFixed(0)} s, ${flight.missed} missed`}`);
      const summary = `${arena.id}: middling bot ${bot.seconds.toFixed(0)} s; ${lines.join('; ')}`;
      console.info(`Host laps in ${summary}`);
      for (const { flight } of laps) expect(flight.crashed, summary).toBe(false);
      expect(laps.filter(({ flight }) => flight.passed < GATES + 1 || flight.missed > 1).length, summary).toBeLessThanOrEqual(SLIPS);
      const ordinary = Math.min(...laps.filter(({ hands, flight }) => hands === ORDINARY && flight.passed === GATES + 1 && flight.missed <= 1).map(({ flight }) => flight.seconds));
      expect(ordinary, summary).toBeLessThan(bot.seconds * LAP_MARGIN);
    },
    RACE_TIMEOUT,
  );
}
