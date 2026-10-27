import { gripAt, LEAD_TIME, leadLimit, MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, METERS_PER_UNIT, ON_NOSE, OVERDRIVE_PUSH, RCS_THRUST, TURN_ACCELERATION, turnRadius } from '../ship/flight';
import { NOZZLES, NOZZLES_PER_QUAD, QUADS } from '../ship/thrusters';
import { COOLING_SHADOW, G, MAX_HULL } from '../ship/ship';
import { dragAt, reachAt, safeSpeed, SIGHT_DEPTH } from '../world/air';
import { RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { BOOST_PUSH, BOOST_RADIUS, GATE_POINTS, GATE_RADIUS, GATES, LAPS, PLACE_POINTS } from '../game/race';
import { FLING_CREDIT, LOCK_ANGLE, LOCK_DISTANCE, TORPEDO_BREAK, TORPEDO_DAMAGE, TORPEDO_LATERAL, TORPEDO_LIFETIME, TORPEDO_THRUST, TORPEDO_TOP_SPEED, TORPEDOES } from '../game/torpedoes';
import { HOOK_PULL, HOOK_RANGE, HOOK_RECHARGE } from '../game/hook';
import { PROBE_EVERY, PROBE_FIRST, PROBE_RADIUS } from '../game/items';
import { CLONES, FLARE_BURN, FLARE_HEAT } from '../game/survival';
import { ADRIFT_SECONDS, CAPTURE_POINTS, CAPTURES_TO_WIN, CORE_BRAKE, GRAB_POINTS, GRAB_REACH, RETURN_POINTS } from '../game/flags';
import { MASS } from '../world/bodies';
import { ARRIVAL, BATTERY_PERIOD, BATTERY_RANGE, SINK_BLAST, SINK_POINTS, TORPEDO_HITS, ZONE_HITS } from '../game/fleet';
import { COMET_WARNING } from '../game/comet';
import { HULL_CRITICAL, WELL_CAUTION, WELL_CRITICAL, WELL_WARNING } from '../game/alarms';
import { ASTEROID_POINTS } from '../world/asteroids';
import { ARENA_GRACE, ARENA_LIMIT } from '../world/arena';
import { RING_LAYER } from '../world/arenas';

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
  // the maneuvering thrusters: their clusters and nozzles, their push, how fast they turn the
  // ship (degrees a second) and how soon they reach it (s)
  quads: QUADS,
  quadNozzles: NOZZLES_PER_QUAD,
  nozzles: NOZZLES,
  thrust: g(RCS_THRUST),
  turnRate: Math.round((MAX_TURN_RATE * 180) / Math.PI),
  turnReach: MAX_TURN_RATE / TURN_ACCELERATION,
  // the hardest turn of the autopilot at the speed limit, rounded to 5 m as the README gives it
  turn: Math.round(meters(turnRadius(MAX_SPEED)) / 5) * 5,
  // how far the nose leads the flight at most at the speed limit (degrees), and how soon the flight is back on it (s)
  lead: Math.round((leadLimit(MAX_SPEED) * 180) / Math.PI),
  settle: LEAD_TIME,
  onNose: Math.round((ON_NOSE * 180) / Math.PI),
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
  grip: g(gripAt(MAX_SPEED)),
  torpedoBreak: TORPEDO_BREAK,
  torpedoMass: MASS.torpedo / 1000,
  torpedoThrust: g(TORPEDO_THRUST),
  torpedoBurn: TORPEDO_LIFETIME,
  fling: FLING_CREDIT,
  hookRange: km(HOOK_RANGE),
  hookPull: g(HOOK_PULL),
  hookReady: HOOK_RECHARGE,
  shipMass: MASS.ship / 1000,
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
  coreMass: MASS.core / 1000,
  coreBrake: g(CORE_BRAKE),
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
  // Jupiter's air (see world/air): what the eye sees just under the deck, a kilometer and two
  // kilometers down (rounded to 10 m); its drag at the deck at the limit; where the limit starts
  // to heat the hull (to 100 m), and what is safe a kilometer and two kilometers down
  seeDeck: Math.round(km(reachAt(-1, SIGHT_DEPTH)) * 10) / 10,
  seeKm: Math.round(meters(reachAt(-20000, SIGHT_DEPTH)) / 10) * 10,
  seeTwoKm: Math.round(meters(reachAt(-40000, SIGHT_DEPTH)) / 10) * 10,
  dragDeck: Math.round((dragAt(-1, MAX_SPEED) / G) * 10) / 10,
  hotDepth: Math.round(hotDepth() / 100) * 100,
  safeKm: Math.round(meters(safeSpeed(-20000, COOLING_SHADOW))),
  safeTwoKm: Math.round(meters(safeSpeed(-40000, COOLING_SHADOW))),
  // the Rings of Saturn's layer of ice grains, top to bottom
  ringLayer: meters(2 * RING_LAYER),
};

/** How deep under Jupiter's deck the speed limit starts to heat a hull in the air's shade (m). */
function hotDepth(): number {
  let depth = 0;
  while (safeSpeed(-depth / METERS_PER_UNIT, COOLING_SHADOW) >= MAX_SPEED) depth += 1;
  return depth;
}

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
  junkOrbit: { value: 25, readme: 'all at # m/s' },
  stormEvery: { value: 50, readme: 'Every # seconds of field time a solar storm' },
  stormLength: { value: 8, readme: 'blinds the sensors for # seconds' },
  noReturn: { value: 280, readme: 'Within about # m no drive gets out' },
  impactKill: { value: 72, readme: 'at about # m/s a ship is destroyed' },
  towCable: { value: 75, readme: 'on a cable of about # m' },
  pingWarn: { value: 150, readme: 'orange from # ms' },
  pingCritical: { value: 300, readme: 'red from # ms' },
};

/** Every number of the handbook by its placeholder. */
export const HANDBOOK_NUMBERS: Record<string, number> = {
  ...FROM_CODE,
  ...Object.fromEntries(Object.entries(FROM_README).map(([name, { value }]) => [name, value])),
};
