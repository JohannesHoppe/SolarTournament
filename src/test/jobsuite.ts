import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { complete, freshCampaign, MISSIONS, type Campaign, type Mission } from '../campaign/campaign';
import { flyJob, type JobRun, type JobWorld } from './jobs';
import { host } from './jobhost';
import { BEHAVIORS } from './jobbehaviors';
import { Randomizer, textSeed } from '../random';

/**
 * The campaign's jobs flown by a simulated Host of middling skill (see jobhost), drill by drill,
 * through the drills' own code (see jobs.ts): what a Host is asked to fly, a middling bot must
 * manage (CLAUDE.md, Plausibility). A drill that cannot be done (a start inside rock or outside
 * its own zone, a target out of reach, a clock too short, a fail that loops) fails here instead
 * of for a player. The jobs are spread over a few test files (src/campaign/jobs.*.test.ts) so
 * they fly side by side; `npm run jobs` runs them. `JOB=<id>` flies that job alone, and
 * `TRACE=<s>` prints where the clone is every that many seconds of it; `STRICT=1` holds the
 * outmatched jobs (see OUTMATCHED) to winning too.
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
 * The jobs a middling bot does not win as they are built, each with what the runs measured. They
 * are flown all the same, and checked for what any job must be (no clone printed in rock, no
 * attempt failing before a Host can act); their verdict is for the designer, not for a bot. Most
 * are fights of one against several: two raiders press it at once (see bots, pressOn), and a
 * middling bot loses to two pressing it, ambushers of 0.45, 0.35 and 0.25 alike, mostly to shots
 * into its drive and reactor from the one behind it.
 */
const RACE = 'the rivals shoot the leader’s drive and send torpedoes, and a death starts the race over (the balance runs allow a middling bot three deaths a race)';
export const OUTMATCHED: Readonly<Record<string, string>> = {
  ...Object.fromEntries(MISSIONS.filter((m) => m.ambush).map((m) => [m.id, 'three bandits of 0.45, two pressing at once: lost to the two, mostly to shots into the drive and reactor'])),
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
  theRidge: 'Spare’s two strays fighting the Host at the echo',
  theMemorial: 'four guards at once round the tower while the Host climbs its hatches',
  hollowJack: 'Hollow Jack (0.7) and three raiders at once',
  firstDeath: 'Perihelion (0.75) and four of the Navy at once, Spare on the wing',
  theHunter: 'Perihelion (0.7) and two escorts (0.5), two pressing at once: won or lost as the run’s chance falls, lost in the whole run',
  // bounties: the face and its escorts at once (the other 46 are won)
  // the face and its escorts, two pressing at once, are won or lost as the run's chance falls: a
  // change anywhere shifts which of them the whole run loses (these five lost, others won)
  ...Object.fromEntries(['bounty:occator:1', 'bounty:occator:3', 'bounty:phobos:3', 'bounty:titan:1', 'bounty:iapetus:3'].map((id) => [id, 'the face and its escorts, two pressing at once: won or lost as the run’s chance falls, lost in the whole run'])),
  'bounty:rheasilvia:1': 'the face (0.45) and an escort with the cutter (400 m)',
  'bounty:rheasilvia:3': 'the face (0.65) and three escorts with the cutter (400 m)',
  'bounty:titan:2': 'the face (0.55) and two escorts in Titan’s haze',
  'bounty:titan:3': 'the face (0.65) and three escorts in Titan’s haze',
  'bounty:triton:3': 'the face (0.65) and three escorts',
  // a race against armed rivals: they shoot the drive of whoever leads and send torpedoes, and a death starts the race over
  ...Object.fromEntries(['peakRun', 'stickneyGrand', 'fluxTubeRace', 'heartRun', 'haumeaRing', 'terminatorRun'].map((id) => [id, RACE])),
  qualifyingHeat: `${RACE}; half of each lap in Titan’s haze, where a hull short of a fin barely holds its course`,
  circuitFinal: `${RACE}; as the Qualifying Heat, and only first home counts`,
  cloudLine: `${RACE}; half of each lap under Venus’s acid clouds, where a hull short of a fin barely holds its course`,
  methaneEcho: 'the echo lies 1.6 km under Titan’s deck: the clogged radiators burn the hull within some 110 s under it, and a hull short of a fin loses its course there',
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
        random = new Randomizer(textSeed(mission.id));
        const run = flyJob(mission, campaignFor(mission), host(BEHAVIORS[mission.id]), DRILL_LIMIT, ATTEMPTS, trace > 0 ? tracer(trace) : undefined);
        const text = report(run);
        if (only) console.log(`${mission.id}: ${run.done ? 'done' : 'not done'}\n${text}`);
        // what every job must be: never a clone printed in rock, never an attempt that fails before a Host can act
        expect(run.buried, text).toBe(0);
        // (but where the drill is known to fail at once, see OUTMATCHED: The Feeders' Comet)
        if (!QUICK_KNOWN.includes(mission.id)) for (const drill of run.drills) expect(drill.quick, text).toBe(0);
        if (outmatched || endless) return;
        expect(run.done, text).toBe(true);
        for (const drill of run.drills) expect(drill.attempts, text).toBeLessThanOrEqual(ATTEMPTS);
        const crashes = PLACE_DEATHS.reduce((sum, cause) => sum + (run.deaths.causes[cause] ?? 0), 0);
        expect(crashes, text).toBeLessThanOrEqual(CRASHES);
      }, JOB_TIMEOUT);
    }
  });
}
