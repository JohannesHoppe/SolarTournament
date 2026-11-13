import { describe, expect, it } from 'vitest';
import { Chatter, CHATTER_GAP, CHATTER_RULES, recentWindow, type ChatterMoment } from './chatter';
import { CHATTER, COMPUTER } from '../music/lines';
import { Randomizer } from '../random';

/** A seeded stand-in for Math.random, so every run of the test hears the same evening. */
const dice = (seed: number) => {
  const r = new Randomizer(seed);
  return () => r.nextFloat();
};

describe("Nicole's chatter", () => {
  it('has a pool of at least 8 lines for the moments of every round, and a few for a race', () => {
    for (const moment of ['launch', 'death', 'reprint', 'roundOver', 'passed'] as const) expect(CHATTER[moment].length).toBeGreaterThanOrEqual(8);
    for (const moment of ['lead', 'lostLead', 'passedBy', 'captured'] as const) expect(CHATTER[moment].length).toBeGreaterThanOrEqual(3);
  });

  it('never says a line again while it is among the last of its pool', () => {
    for (const moment of Object.keys(CHATTER) as ChatterMoment[]) {
      const chatter = new Chatter(dice(7));
      const said: string[] = [];
      for (let i = 0, now = 0; i < 400; i++, now += 120) {
        const line = chatter.line(moment, now);
        if (line) said.push(line);
      }
      const window = recentWindow(CHATTER[moment].length);
      for (let i = 1; i < said.length; i++) expect(said.slice(Math.max(0, i - window), i)).not.toContain(said[i]);
      // and over an evening every line of the pool is heard
      expect(new Set(said).size).toBe(CHATTER[moment].length);
    }
  });

  it('stays silent about as often as its rule says, and more often after speaking just now', () => {
    const rounds = 4000;
    for (const moment of ['launch', 'death', 'reprint', 'roundOver'] as const) {
      const chatter = new Chatter(dice(11));
      let silent = 0;
      for (let i = 0; i < rounds; i++) if (chatter.line(moment, i * 120) === null) silent++;
      expect(silent / rounds).toBeGreaterThan(CHATTER_RULES[moment].silence - 0.04);
      expect(silent / rounds).toBeLessThan(CHATTER_RULES[moment].silence + 0.04);
    }
    // a clone lost and the next one booting 12 s later: after speaking at the loss she speaks
    // at the boot less often than at a boot on its own
    let both = 0;
    let boots = 0;
    for (let i = 0; i < rounds; i++) {
      const chatter = new Chatter(dice(100 + i));
      if (chatter.line('death', 0) === null) continue;
      boots++;
      if (chatter.line('reprint', 12) !== null) both++;
    }
    expect(both / boots).toBeLessThan(1 - CHATTER_RULES.reprint.silence - 0.15);
  });

  it('praises a pass seldom: never twice within its gap, and never within the gap of any line', () => {
    const chatter = new Chatter(dice(3));
    let last = -Infinity;
    let praise = 0;
    // a race of five minutes with a pass every 4 s
    for (let now = 0; now < 300; now += 4) {
      if (chatter.line('passed', now) === null) continue;
      praise++;
      expect(now - last).toBeGreaterThanOrEqual(CHATTER_RULES.passed.gap);
      last = now;
    }
    expect(praise).toBeLessThanOrEqual(Math.ceil(300 / CHATTER_RULES.passed.gap));
    const quiet = new Chatter(() => 0.99);
    expect(quiet.line('lead', 0)).not.toBeNull();
    expect(quiet.line('passedBy', CHATTER_GAP - 1)).toBeNull();
  });

  it('keeps the warnings out of it: none of them is a line she may leave unsaid', () => {
    const chatty = new Set<string>(Object.values(CHATTER).flat());
    for (const warning of [COMPUTER.torpedo, COMPUTER.reactor, COMPUTER.hullCritical, COMPUTER.reactorCritical, COMPUTER.airBurn, COMPUTER.holePull, COMPUTER.comet, COMPUTER.lastClone]) expect(chatty.has(warning)).toBe(false);
  });

  it('calls a Host by a pet name in no more than one line in four', () => {
    const lines = Object.values(CHATTER).flat();
    const pet = lines.filter((line) => /\b(darling|love|sweetheart|honey|handsome|my hero|big guy)\b/.test(line));
    expect(pet.length / lines.length).toBeLessThanOrEqual(0.25);
  });
});
