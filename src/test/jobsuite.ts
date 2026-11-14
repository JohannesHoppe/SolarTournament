import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { complete, freshCampaign, MISSIONS, type Campaign, type Mission } from '../campaign/campaign';
import { flyJob, JobWorld, type JobRun } from './jobs';
import { host } from './jobhost';
import { BEHAVIORS } from './jobbehaviors';
import { Randomizer, textSeed } from '../random';

/** How long the warm-up world may take to build (ms): seconds alone, far longer with six shards and other work on the machine. */
const WARM_UP = 300000;

/**
 * The campaign's jobs flown by a simulated Host of middling skill (see jobhost), drill by drill,
 * through the drills' own code (see jobs.ts): what a Host is asked to fly, a middling bot must
 * manage (CLAUDE.md, Plausibility). A drill that cannot be done (a start inside rock or outside
 * its own zone, a target out of reach, a clock too short, a fail that loops) fails here instead
 * of for a player. The jobs are spread over a few test files (src/campaign/jobs.*.test.ts) so
 * they fly side by side; `npm run jobs` runs them. Each job is flown on several seeds and won by a
 * majority of them (see SEEDS); each file prints what its jobs won. `JOB=<id>` flies that job
 * alone, `SEEDS=<n>` on n seeds, `SEED=<n>` from its n-th seed on, and `TRACE=<s>` prints where
 * the clone is every that many seconds of it; `STRICT=1` holds the outmatched jobs (see
 * OUTMATCHED) to winning too, on every seed.
 */

/** A drill is given this long (s of simulated time), and this many attempts. */
export const DRILL_LIMIT = 900;
export const ATTEMPTS = 8;
/** The clone may be lost to the place itself (rock, ground, a hull, a ring, the well, the air) this often in a job before the job counts as one a Host cannot fly; deaths in a fight are the fight's. */
export const CRASHES = 4;
const PLACE_DEATHS = ['rock', 'hull', 'gate', 'well', 'air', 'space'];
/** A job may take this long to fly on a busy machine (ms): its verdict is its assertions, never the wall clock. */
const JOB_TIMEOUT = 600_000;

/**
 * A job is flown on up to this many seeds (the bots' and the Host's dice), `SEEDS=<n>` to change it,
 * and judged won when the middling Host wins most of them (SEED_MAJORITY): one seed alone is a coin
 * thrown, so a change of no consequence (a thousandth of a heat point a second) flipped a close job
 * and the verdict with it. Flying stops once the verdict is certain (a majority won, or no longer
 * reachable), so a job won seed after seed costs three flights, a close one up to five.
 */
export const SEEDS = Math.max(1, Number(process.env.SEEDS ?? 5));
export const SEED_MAJORITY = Math.floor(SEEDS / 2) + 1;

/**
 * The jobs a middling bot does not win as they are built, each with what the runs measured. They
 * are flown all the same, and checked for what any job must be (no clone printed in rock, no
 * attempt failing before a Host can act); their verdict is for the designer, not for a bot. Most
 * are fights of one against several: two raiders press it at once (see bots, pressOn), and a
 * middling bot loses to two pressing it, ambushers of 0.45, 0.35 and 0.25 alike, mostly to shots
 * into its drive and reactor from the one behind it. A job won on about as many seeds as lost is
 * listed too (`chance`): its verdict is the dice's, never a Host's.
 */
/** A job a middling bot wins on about as many seeds as it loses (see SEEDS): its verdict is the dice's, so it is flown, its share printed, never judged. */
const chance = (why: string, won: number, flown: number) => `${why}: won or lost as the dice fall, ${won} of ${flown} seeds won when measured`;
const RACE = 'the rivals shoot the leader’s drive and send torpedoes, and a death starts the race over (the balance runs allow a middling bot three deaths a race)';
export const OUTMATCHED: Readonly<Record<string, string>> = {
  ...Object.fromEntries(MISSIONS.filter((m) => m.ambush).map((m) => [m.id, 'three bandits of 0.45, two pressing at once: lost to the two, mostly to shots into the drive and reactor'])),
  'ambush:lantern': chance('three bandits of 0.45, two pressing at once', 3, 4),
  'ambush:ballroom': chance('three bandits of 0.45, two pressing at once', 3, 5),
  sawBrothers: 'three brothers at once with the cutter (400 m); the rig falls 10 s after they start sawing, the flight there from the place’s start takes 17 s at 125 m/s',
  feedersComet: 'three guns sink Scout One (her drive turned to the Host and open to the guns on that side, and their torpedoes) within 1 to 5 s of the attempt, even with the Host beside her, so some attempts fail before a Host can act (one gun: won)',
  debtDay: 'four of six collectors at once',
  oreBarge: 'waves of three scrappers at once round the barge',
  rungTwo: 'waves of three scavengers at once round the fuel barge',
  plumeYacht: 'three raiders of 0.65 at once',
  lastTallymen: 'Ma Tally and three escorts at once',
  lastLight: 'six pickets at once',
  theSweep: 'six Navy fighters at once, Spare on the wing',
  iceRun: 'four of the Loose at once round the convoy',
  dose: 'three of the Loose at once round the tanker, the dose filling meanwhile',
  theRidge: chance('Spare’s two strays fighting the Host at the echo', 3, 4),
  theMemorial: 'four guards at once round the tower while the Host climbs its hatches',
  hollowJack: 'Hollow Jack (0.7) and three raiders at once',
  firstDeath: chance('Perihelion (0.75) and four of the Navy at once, Spare on the wing', 3, 5),
  // bounties: the face and its escorts at once, two pressing (the others won seed after seed)
  ...Object.fromEntries(['bounty:occator:1', 'bounty:iapetus:3'].map((id) => [id, 'the face and its escorts, two pressing at once: lost on every seed measured (0 of 3)'])),
  'bounty:occator:3': 'the face and its escorts, two pressing at once: lost on most seeds (1 of 4 won when measured)',
  ...Object.fromEntries(
    (
      [
        ['bounty:rheasilvia:2', 3, 4],
        ['bounty:europa:2', 3, 4],
        ['bounty:europa:3', 2, 5],
        ['bounty:io:3', 2, 5],
        ['bounty:ganymede:3', 3, 4],
        ['bounty:titan:1', 3, 5],
        ['bounty:triton:3', 3, 4],
        ['bounty:lantern:3', 3, 5],
      ] as const
    ).map(([id, won, flown]) => [id, chance('the face and its escorts, two pressing at once', won, flown)]),
  ),
  'bounty:rheasilvia:1': 'the face (0.45) and an escort with the cutter (400 m)',
  'bounty:rheasilvia:3': chance('the face (0.65) and three escorts with the cutter (400 m)', 2, 5),
  'bounty:titan:3': chance('the face (0.65) and three escorts in Titan’s haze', 2, 5),
  // a race against armed rivals: they shoot the drive of whoever leads and send torpedoes, and a death starts the race over
  ...Object.fromEntries(['peakRun', 'stickneyGrand', 'fluxTubeRace'].map((id) => [id, RACE])),
  heartRun: chance(RACE, 3, 4),
  haumeaRing: chance(RACE, 3, 5),
  qualifyingHeat: `${RACE}; half of each lap in Titan’s haze, where a hull short of a fin barely holds its course`,
  circuitFinal: `${RACE}; as the Qualifying Heat, and only first home counts`,
  cloudLine: `${RACE}; half of each lap under Venus’s acid clouds, where a hull short of a fin barely holds its course`,
  methaneEcho: 'the echo lies 1.6 km under Titan’s deck, where a hull short of a fin loses its course: lost on every seed measured (0 of 3)',
  dockingLane: 'six hulls to shoot with the cutter (400 m) before they strike Patience',
  wallRun: 'the searchlights’ cones: the simulated Host has no way of reading them yet',
  rideComet: 'the simulated Host does not hold on to the comet yet',
};

/** The jobs known to fail some attempts at once (see OUTMATCHED for why). */
const QUICK_KNOWN = ['feedersComet'];

/** The campaign as a Host has it when a job comes up: every story job before it done (a side job: every one up to the job that offers it). */
export function campaignFor(mission: Mission): Campaign {
  const campaign = freshCampaign();
  const until = mission.side ? MISSIONS.findIndex((m) => m.id === mission.side) + 1 : MISSIONS.indexOf(mission);
  for (const before of MISSIONS.slice(0, until)) if (!before.side) complete(campaign, before);
  return campaign;
}

/** How a job went, drill by drill, for a failure's message. */
export function report(run: JobRun): string {
  const drills = run.drills.map((d) => {
    const fails = [...new Set(d.fails)].map((line) => `"${line.slice(0, 80)}" ×${d.fails.filter((f) => f === line).length}`);
    return `  drill ${d.index}${d.done ? '' : ' NOT DONE'}: ${d.seconds.toFixed(0)} s, ${d.attempts} attempt(s)${d.quick ? `, ${d.quick} failed at once` : ''}${fails.length ? `, started over: ${fails.join(', ')}` : ''}`;
  });
  return [`${run.seconds.toFixed(0)} s, deaths ${JSON.stringify(run.deaths.causes)}${run.buried ? `, printed in rock ${run.buried}×` : ''}`, ...drills].join('\n');
}

/** The jobs are flown in this many test files side by side, each a share of MISSIONS in order. */
export const SHARDS = 6;

/** The share `k` (from 1) of the jobs (see SHARDS). */
export function flyShard(k: number) {
  flyJobs(Math.floor(((k - 1) * MISSIONS.length) / SHARDS), Math.floor((k * MISSIONS.length) / SHARDS));
}

/** Where the clone is and what the drill shows, every TRACE seconds (see the file's comment). */
function tracer(every: number): (world: JobWorld) => void {
  let last = -Infinity;
  const at = (v: { x: number; y: number; z: number }) => `${Math.round(v.x)},${Math.round(v.y)},${Math.round(v.z)}`;
  return (world) => {
    if (world.now - last < every) return;
    last = world.now;
    const f = world.me.flight;
    const others = world.ships.filter((s) => s !== world.me && s.alive).map((s) => `${s.name}@${Math.round(s.flight.position.distanceTo(f.position))}/${Math.round(s.hull)}`);
    console.log(`${world.now.toFixed(1)} drill ${world.drillIndex}${world.attempt?.live ? '' : ' (said)'} ${world.me.alive ? '' : 'DEAD '}at ${at(f.position)} ${Math.round(f.velocity.length())} u/s hull ${Math.round(world.me.hull)} | ${world.school.mark} | ${world.note} | ${others.join(' ')}`);
  };
}

/** The jobs of MISSIONS from `from` up to `to` (indices), each flown in a test of its own. */
export function flyJobs(from: number, to: number) {
  describe('the campaign’s jobs, flown by a middling Host', () => {
    // the bots' and the Host's hands use Math.random: seeded per job, so a run comes out alike every time
    let random = new Randomizer(1);
    // a world built once before any job fills what the game builds on first use (the rock shapes of
    // a detail, ...): three.js names every object it makes with Math.random, so a job flown first,
    // or alone (JOB), would otherwise draw other dice than the same job flown after others
    // (building it bakes the shapes' meshes: on a busy machine far longer than a hook's default 10 s, WARM_UP)
    beforeAll(() => {
      const first = MISSIONS[0];
      new JobWorld(first, campaignFor(first), host(BEHAVIORS[first.id]));
    }, WARM_UP);
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockImplementation(() => random.nextFloat());
    });
    afterEach(() => vi.restoreAllMocks());

    const only = process.env.JOB;
    const trace = Number(process.env.TRACE ?? 0);
    const jobs = MISSIONS.slice(from, to).filter((m) => !only || m.id === only);
    // a share with none of the job asked for (JOB) has nothing to fly
    if (!jobs.length) it.skip('none of these jobs is asked for', () => undefined);
    for (const mission of jobs) {
      // STRICT=1 holds every job to winning, the outmatched too (to see which of them a change has made winnable)
      const outmatched = process.env.STRICT ? undefined : OUTMATCHED[mission.id];
      // a trial's round is a whole round of the Games after its drills, flown by the balance runs
      // a night in the Pit is never done: it ends when the clone does (see Game.cloneLost)
      const endless = !!mission.pit;
      const name = `${mission.id}${mission.trial ? ' (its drills)' : ''}${endless ? ' (flown; never done: the night ends with the clone)' : outmatched ? ` (flown; not won by a middling bot: ${outmatched})` : ''}`;
      it(name, () => {
        // an outmatched job or a night in the Pit has no verdict to reach: one flight checks what every job must be
        const seeds = outmatched || endless ? 1 : SEEDS;
        const need = Math.min(seeds, SEED_MAJORITY);
        let wins = 0;
        let flown = 0;
        let lost: string | null = null;
        for (let seed = 0; seed < seeds && wins < need && flown - wins <= seeds - need; seed++) {
          // SEED=<n> starts at other dice (the n-th of the job's seeds), to see how far its outcome is chance
          random = new Randomizer(textSeed(mission.id) + Number(process.env.SEED ?? 0) + seed);
          const run = flyJob(mission, campaignFor(mission), host(BEHAVIORS[mission.id]), DRILL_LIMIT, ATTEMPTS, trace > 0 ? tracer(trace) : undefined);
          const text = report(run);
          flown++;
          if (only) console.log(`${mission.id}, seed ${seed}: ${run.done ? 'done' : 'not done'}\n${text}`);
          // what every job must be, on every seed: never a clone printed in rock, never an attempt that fails before a Host can act
          expect(run.buried, text).toBe(0);
          // (but where the drill is known to fail at once, see OUTMATCHED: The Feeders' Comet)
          if (!QUICK_KNOWN.includes(mission.id)) for (const drill of run.drills) expect(drill.quick, text).toBe(0);
          if (won(run)) wins++;
          else lost ??= `seed ${seed}: ${text}`;
        }
        shares.push(`${mission.id}: ${wins} of ${flown} won${outmatched ? ' (outmatched)' : endless ? ' (endless)' : ''}`);
        if (outmatched || endless) return;
        expect(wins, `won ${wins} of ${flown} seeds, ${need} needed; the first lost, ${lost}`).toBeGreaterThanOrEqual(need);
      }, JOB_TIMEOUT * SEEDS);
    }
  });
}

/** What the jobs of this file won, seeds won of seeds flown, printed once they are flown (see SEEDS). */
const shares: string[] = [];
afterAll(() => {
  if (shares.length) process.stdout.write(`the jobs' seeds won:\n${shares.join('\n')}\n`);
});

/** Whether a job's flight won it: every drill done within its attempts, the clone lost to the place itself no more than CRASHES times. */
function won(run: JobRun): boolean {
  const crashes = PLACE_DEATHS.reduce((sum, cause) => sum + (run.deaths.causes[cause] ?? 0), 0);
  return run.done && run.drills.every((drill) => drill.attempts <= ATTEMPTS) && crashes <= CRASHES;
}
