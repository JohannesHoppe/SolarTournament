import { MAIN_THRUST, MAX_SPEED, METERS_PER_UNIT, OVERDRIVE_PUSH, PATH_GRIP } from '../ship/flight';
import { MAX_HULL } from '../ship/ship';
import { RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { BOOST_PUSH, BOOST_RADIUS, GATE_POINTS, GATE_RADIUS, GATES, LAPS, PLACE_POINTS } from '../game/race';
import { LOCK_ANGLE, LOCK_DISTANCE, TORPEDO_BREAK, TORPEDO_DAMAGE, TORPEDO_LATERAL, TORPEDO_LIFETIME, TORPEDO_TOP_SPEED, TORPEDOES } from '../game/torpedoes';
import { HOOK_PULL, HOOK_RANGE, HOOK_RECHARGE } from '../game/hook';
import { PROBE_EVERY, PROBE_FIRST, PROBE_RADIUS } from '../game/items';
import { CLONES, FLARE_BURN, FLARE_HEAT } from '../game/survival';
import { ADRIFT_SECONDS, CAPTURE_POINTS, CAPTURES_TO_WIN, GRAB_POINTS, GRAB_REACH, RETURN_POINTS } from '../game/flags';
import { ARRIVAL, BATTERY_PERIOD, BATTERY_RANGE, SINK_BLAST, SINK_POINTS, TORPEDO_HITS, ZONE_HITS } from '../game/fleet';
import { COMET_WARNING } from '../game/comet';
import { HULL_CRITICAL, WELL_CAUTION, WELL_CRITICAL, WELL_WARNING } from '../game/alarms';
import { ASTEROID_POINTS } from '../world/asteroids';
import { ARENA_GRACE, ARENA_LIMIT } from '../world/arena';

/**
 * The numbers of the Pilot's Handbook (handbook.html), filled into its texts as {placeholders}
 * in the reader's number format, so no rule is written down twice.
 */

const meters = (units: number) => units * METERS_PER_UNIT;
const km = (units: number) => meters(units) / 1000;
/** Earth's gravity in m/s², the g the README counts accelerations in. */
const g = (units: number) => Math.round(meters(units) / 9.81);
const percent = (share: number) => Math.round(share * 100);

/** Numbers taken from the game's own constants: they follow the code by themselves. */
export const FROM_CODE: Record<string, number> = {
  limit: meters(MAX_SPEED),
  drive: g(MAIN_THRUST),
  // the hardest turn of the autopilot at the speed limit, rounded to 5 m as the README gives it
  turn: Math.round(meters(MAX_SPEED ** 2 / PATH_GRIP) / 5) * 5,
  overdrive: meters(OVERDRIVE_PUSH),
  gates: GATES,
  laps: LAPS,
  gateRadius: meters(GATE_RADIUS),
  core: meters(BOOST_RADIUS),
  boost: meters(BOOST_PUSH),
  gatePoints: GATE_POINTS,
  firstPlace: PLACE_POINTS[0],
  hull: MAX_HULL,
  torpedoes: TORPEDOES,
  lockAngle: Math.round((LOCK_ANGLE * 180) / Math.PI),
  lockRange: km(LOCK_DISTANCE),
  torpedoDamage: TORPEDO_DAMAGE,
  torpedoSpeed: meters(TORPEDO_TOP_SPEED),
  torpedoTurn: g(TORPEDO_LATERAL),
  grip: g(PATH_GRIP),
  torpedoBreak: TORPEDO_BREAK,
  torpedoLife: TORPEDO_LIFETIME,
  hookRange: km(HOOK_RANGE),
  hookPull: g(HOOK_PULL),
  hookReady: HOOK_RECHARGE,
  probeEvery: PROBE_EVERY,
  probeFirst: PROBE_FIRST,
  probeReach: meters(PROBE_RADIUS),
  bump: meters(RAM_SAFE),
  impactSafe: meters(SAFE_IMPACT),
  clones: CLONES,
  flareHeat: FLARE_HEAT,
  flareBurn: FLARE_BURN,
  captures: CAPTURES_TO_WIN,
  grab: meters(GRAB_REACH),
  grabPoints: GRAB_POINTS,
  capturePoints: CAPTURE_POINTS,
  returnPoints: RETURN_POINTS,
  adrift: ADRIFT_SECONDS,
  arrival: ARRIVAL,
  battery: ZONE_HITS.battery,
  driveHits: ZONE_HITS.drive,
  reactor: ZONE_HITS.reactor,
  torpedoHits: TORPEDO_HITS,
  batteryPeriod: BATTERY_PERIOD,
  batteryRange: km(BATTERY_RANGE),
  blast: km(SINK_BLAST),
  sink: SINK_POINTS,
  cometWarning: COMET_WARNING,
  wellCaution: percent(WELL_CAUTION),
  wellWarning: percent(WELL_WARNING),
  wellCritical: percent(WELL_CRITICAL),
  edge: Math.round(km(ARENA_LIMIT) * 10) / 10,
  grace: ARENA_GRACE,
  hullCritical: HULL_CRITICAL,
  rock1: ASTEROID_POINTS[0],
  rock2: ASTEROID_POINTS[1],
  rock3: ASTEROID_POINTS[2],
};

/**
 * Numbers the code keeps where the handbook cannot reach them (inside the round's flow), each
 * with the README's words for it (`#` stands for the number): the unit test finds every one of
 * them in the README, so the handbook says what the README says.
 */
export const FROM_README: Record<string, { value: number; readme: string }> = {
  overdriveHeat: { value: 4, readme: 'for # seconds it gives no thrust' },
  overdriveRecharge: { value: 60, readme: 'needs # seconds before it fires again' },
  dodge: { value: 40, readme: 'a kick of # m/s' },
  dodgeRecharge: { value: 1.5, readme: 'the thrusters need # seconds before the next dodge' },
  early: { value: 0.3, readme: 'A drive lit within # seconds before BURN!' },
  late: { value: 0.2, readme: 'within # seconds after it, makes a perfect start' },
  startShove: { value: 40, readme: 'a shove of # m/s along the nose' },
  stall: { value: 1.5, readme: 'stalls for # seconds' },
  raceKill: { value: 200, readme: 'a kill scores # in a race' },
  kill: { value: 500, readme: 'A kill scores # points' },
  armor: { value: 2, readme: '# of 100 hull points' },
  driveCone: { value: 50, readme: 'within #° of the ship' },
  heatShot: { value: 20, readme: 'Each shot adds # % of the heat capacity' },
  burstSun: { value: 6, readme: 'a burst of # in sunlight' },
  burstShade: { value: 9, readme: 'and # in shadow' },
  cooled: { value: 30, readme: 'cooled down to # %' },
  torpedoShot: { value: 50, readme: 'a 6 m target; # points' },
  nova: { value: 800, readme: 'Every other ship within # m is destroyed' },
  novaPanic: { value: 1.2, readme: 'Everyone within # km of a holder' },
  shove: { value: 5, readme: 'struck by another at # m/s or more is shoved' },
  knockout: { value: 3, readme: 'crashes within # seconds' },
  shoveSpeed: { value: 26, readme: 'flies off at about # m/s' },
  ramNose: { value: 30, readme: 'on the armored nose # % of the blow' },
  ramFlank: { value: 50, readme: 'on a flank # %' },
  plume: { value: 150, readme: '# m long and spreading' },
  closeCall: { value: 25, readme: 'earns # points' },
  flareSpeed: { value: 30, readme: 'evenly at # m/s' },
  pocket: { value: 1.35, readme: '# km deep at its middle' },
  kesslerOrbit: { value: 25, readme: 'all at # m/s' },
  stormEvery: { value: 50, readme: 'Every # seconds of field time a solar storm' },
  stormLength: { value: 8, readme: 'blinds the sensors for # seconds' },
  noReturn: { value: 280, readme: 'Within about # m no drive gets out' },
  impactKill: { value: 72, readme: 'at about # m/s a ship is destroyed' },
};

/** Every number of the handbook by its placeholder. */
export const HANDBOOK_NUMBERS: Record<string, number> = {
  ...FROM_CODE,
  ...Object.fromEntries(Object.entries(FROM_README).map(([name, { value }]) => [name, value])),
};
