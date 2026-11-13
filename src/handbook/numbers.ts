import { gripAt, HOVER_HEIGHT, LEAD_TIME, leadLimit, LIFT, LIFT_MOST, MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, METERS_PER_UNIT, ON_NOSE, OVERDRIVE_PUSH, RCS_THRUST, TURN_ACCELERATION, turnRadius } from '../ship/flight';
import { NOZZLES, NOZZLES_PER_QUAD, QUADS } from '../ship/thrusters';
import { COOLING_SHADOW, G, MAX_HULL, NANO_SECONDS, NANO_WAIT, SILENT_AFTER, SILENT_RANGE } from '../ship/ship';
import { CLOG_DEPTH, CLOG_LOSS, CLOG_SECONDS, densityIn, dragAt, IN_AIR_TOP, reachAt, safeSpeed, SIGHT_DEPTH, UNCLOG_SECONDS } from '../world/air';
import { RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { BOOST_PUSH, BOOST_RADIUS, GATE_POINTS, GATE_RADIUS, GATES, LAPS, PLACE_POINTS, TRACK_RESPAWN_SECONDS, TRACK_RESPAWN_SPEED } from '../game/race';
import * as THREE from 'three';
import { CRACK_TRACK, FLOOR_HALF, MASSIF, RIFT_DEPTH } from '../world/crack';
import { BOOST_HEAT, BOOST_RECHARGE, BURNOUT_DAMAGE, BURNOUT_HEAT, BURNOUT_SECONDS, DRIVE_HEAT_SHED } from '../ship/driveheat';
import { THROAT_TRACK } from '../world/throat';
import { TITAN_AIR, TITAN_FALL } from '../world/titan';
import { bendRadius, RacingLine } from '../game/racingline';
import { EUROPA_FALL } from '../world/europa';
import { CALLISTO_FALL } from '../world/callisto';
import { FLING_CREDIT, LOCK_ANGLE, LOCK_DISTANCE, TORPEDO_BREAK, TORPEDO_DAMAGE, TORPEDO_LATERAL, TORPEDO_LIFETIME, TORPEDO_THRUST, TORPEDO_TOP_SPEED, TORPEDOES, TORPEDOES_PER_PROBE } from '../game/torpedoes';
import { HOOK_PULL, HOOK_RANGE, HOOK_RECHARGE } from '../game/hook';
import { NOVA_RADIUS, PROBE_EVERY, PROBE_FIRST, PROBE_RADIUS } from '../game/items';
import { CLONES, FLARE_BURN, FLARE_HEAT } from '../game/survival';
import { ADRIFT_SECONDS, CAPTURE_POINTS, CAPTURES_TO_WIN, CORE_BRAKE, GRAB_POINTS, GRAB_REACH, RETURN_POINTS } from '../game/flags';
import { MASS } from '../world/bodies';
import { ARRIVAL, BATTERY_PERIOD, BATTERY_RANGE, FLEET_SPEED, HANGAR_CEILING, HANGAR_FLOOR, HANGAR_WIDTH, HANGARS, NOVA_EDGE, NOVA_SHATTER, SINK_BLAST, SINK_POINTS, TORPEDO_HITS, ZONE_HITS } from '../game/fleet';
import { COMET_WARNING } from '../game/comet';
import { STREAK_SECONDS, streakBonus } from '../game/streaks';
import { HULL_CRITICAL, WELL_CAUTION, WELL_CRITICAL, WELL_WARNING } from '../game/alarms';
import { orbitRoom, safePeriapsis, wellMu } from '../game/orbit';
import { ASTEROID_POINTS, CRUMBLE_AFTER } from '../world/asteroids';
import { ARENA_GRACE, ARENA_LIMIT } from '../world/arena';
import { arenaById, RING_LAYER } from '../world/arenas';
import { GEAR, SELF_DESTRUCT_HOLD, SELF_DESTRUCT_RADIUS } from '../game/hangar';

/**
 * The numbers of the Pilot's Handbook (handbook.html), filled into its texts as {placeholders}
 * in the reader's number format, so no rule is written down twice.
 */

const meters = (units: number) => units * METERS_PER_UNIT;
const km = (units: number) => meters(units) / 1000;
/** A track's length along its points (units). */
const lengthOf = (points: readonly THREE.Vector3[]) => points.reduce((sum, point, i, all) => sum + (i ? point.distanceTo(all[i - 1]) : 0), 0);
/** The tightest bend of a track's racing line (units, radius), measured as the race's bend test measures it: over 50 m either side of every point 20 m apart. */
function tightestBend(track: { points: readonly THREE.Vector3[]; gates: readonly number[] }): number {
  const line = new RacingLine(track.points, false, undefined, undefined, track.gates);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let least = Infinity;
  for (let s = 0; s < line.length; s += 400) least = Math.min(least, bendRadius(line.point(s - 1000, a), line.point(s, b), line.point(s + 1000, c)));
  return least;
}
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
  hoverHeight: meters(HOVER_HEIGHT),
  gates: GATES,
  trackGates: CRACK_TRACK.gates.length,
  trackRespawn: TRACK_RESPAWN_SECONDS,
  trackSpeed: meters(TRACK_RESPAWN_SPEED),
  trackLength: Math.round(km(lengthOf(CRACK_TRACK.points))),
  boostRecharge: BOOST_RECHARGE,
  boostHeat: BOOST_HEAT,
  boostShed: DRIVE_HEAT_SHED,
  burnoutHeat: BURNOUT_HEAT,
  burnoutSeconds: BURNOUT_SECONDS,
  burnoutDamage: BURNOUT_DAMAGE,
  boostTop: meters(MAX_SPEED + OVERDRIVE_PUSH),
  riftFloor: Math.round(meters(2 * FLOOR_HALF) / 10) * 10,
  riftDepth: meters(RIFT_DEPTH),
  gorgeDepth: meters(RIFT_DEPTH + MASSIF),
  crackGravity: Math.round((meters(EUROPA_FALL) / 9.81) * 100) / 100,
  throatLength: Math.round(km(lengthOf(THROAT_TRACK.points))),
  throatGravity: Math.round((meters(TITAN_FALL) / 9.81) * 100) / 100,
  // the Throat's tightest bend, and the autopilot's tightest turn at the limit in the air over its water and in a vacuum
  throatBend: Math.round(meters(tightestBend(THROAT_TRACK)) / 10) * 10,
  throatCarve: Math.round(meters(turnRadius(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: densityIn(TITAN_AIR, THROAT_TRACK.points[0]) })) / 5) * 5,
  vacuumTurn: Math.round(meters(turnRadius(MAX_SPEED)) / 5) * 5,
  valhallaGravity: Math.round((meters(CALLISTO_FALL) / 9.81) * 100) / 100,
  laps: LAPS,
  gateRadius: meters(GATE_RADIUS),
  core: meters(BOOST_RADIUS),
  boost: meters(BOOST_PUSH),
  gatePoints: GATE_POINTS,
  firstPlace: PLACE_POINTS[0],
  streak: STREAK_SECONDS,
  hull: MAX_HULL,
  torpedoes: TORPEDOES,
  probeTorpedoes: TORPEDOES_PER_PROBE,
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
  nova: meters(NOVA_RADIUS),
  selfDestruct: meters(SELF_DESTRUCT_RADIUS),
  silentAfter: SILENT_AFTER,
  silentRange: km(SILENT_RANGE),
  selfDestructHold: SELF_DESTRUCT_HOLD,
  hookPrice: GEAR.find((gear) => gear.id === 'hook')!.price,
  nanobotsPrice: GEAR.find((gear) => gear.id === 'nanobots')!.price,
  selfDestructPrice: GEAR.find((gear) => gear.id === 'selfDestruct')!.price,
  novaShatter: meters(NOVA_SHATTER),
  novaEdge: percent(NOVA_EDGE),
  batteryPeriod: BATTERY_PERIOD,
  batteryRange: km(BATTERY_RANGE),
  blast: km(SINK_BLAST),
  sink: SINK_POINTS,
  hangars: HANGARS.length,
  hangarWidth: meters(HANGAR_WIDTH),
  hangarHeight: meters(HANGAR_CEILING - HANGAR_FLOOR),
  fleetSpeed: meters(FLEET_SPEED),
  cometWarning: COMET_WARNING,
  crumble: CRUMBLE_AFTER,
  wellCaution: percent(WELL_CAUTION),
  wellWarning: percent(WELL_WARNING),
  wellCritical: percent(WELL_CRITICAL),
  // where the black hole's pull beats the main drive (rounded to 5 m as the README gives it)
  noReturn: Math.round(meters(noReturn()) / 5) * 5,
  // the black hole's orbits (see game/orbit): the nearest a stable one comes to its center (to
  // 5 m), a circle a kilometer out (m/s, and seconds once around), a circle at the arena's edge
  orbitSafe: Math.round(meters(safePeriapsis(hole(), MAIN_THRUST)) / 5) * 5,
  orbitKm: Math.round(meters(circularAt(20000))),
  orbitKmTime: Math.round((2 * Math.PI * 20000) / circularAt(20000)),
  orbitEdge: Math.round(meters(circularAt(orbitRoom(hole())))),
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
  // the lift of the fins at the deck at the limit, the flight computer's trim, and the autopilot's
  // hardest turn at the deck at the limit (to 5 m, as the README gives it)
  liftDeck: g(LIFT),
  liftMost: g(LIFT_MOST),
  carveDeck: Math.round(meters(turnRadius(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 })) / 5) * 5,
  hotDepth: Math.round(hotDepth() / 100) * 100,
  safeKm: Math.round(meters(safeSpeed(-20000, COOLING_SHADOW))),
  safeTwoKm: Math.round(meters(safeSpeed(-40000, COOLING_SHADOW))),
  // how far over the deck the flight computer takes its horizon from the planet
  airTop: meters(IN_AIR_TOP),
  // the nanobots: how long after the last blow they begin, and how long they take from nothing
  nanoWait: NANO_WAIT,
  nanoSeconds: NANO_SECONDS,
  // the clouds clogging the radiators: through just under the deck, and from how deep twice as
  // fast; how much less they shed then (%); how fast the crust boils off over the deck
  clogDeck: CLOG_SECONDS,
  clogDeep: CLOG_SECONDS / 2,
  clogDepth: meters(CLOG_DEPTH),
  clogLoss: Math.round(CLOG_LOSS * 100),
  unclog: UNCLOG_SECONDS,
  // the Rings of Saturn's layer of ice grains, top to bottom
  ringLayer: meters(2 * RING_LAYER),
};

/** The black hole's well. */
function hole() {
  return arenaById('hole')!.layout.well!;
}

/** How far from the black hole's center its pull equals the main drive's thrust (units). */
function noReturn(): number {
  const well = hole();
  return well.radius * Math.sqrt(well.surfaceGravity / MAIN_THRUST);
}

/** The speed of a circular orbit about the black hole at a distance from its center (units/s). */
function circularAt(distance: number): number {
  return Math.sqrt(wellMu(hole()) / distance);
}

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
  overdriveRecharge: { value: 20, readme: 'needs # seconds before it fires again' },
  dodge: { value: 60, readme: 'a kick of # m/s' },
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
  novaPanic: { value: 1.2, readme: 'Everyone within # km of a holder' },
  shove: { value: 5, readme: 'struck by another at # m/s or more is shoved' },
  knockout: { value: 3, readme: 'crashes within # seconds' },
  shoveSpeed: { value: 39, readme: 'flies off at about # m/s' },
  ramNose: { value: 30, readme: 'on the armored nose # % of the blow' },
  ramFlank: { value: 50, readme: 'on a flank # %' },
  plume: { value: 150, readme: '# m long and spreading' },
  closeCall: { value: 25, readme: 'earns # points' },
  flareSpeed: { value: 30, readme: 'evenly at # m/s' },
  pocket: { value: 1.35, readme: '# km deep at its middle' },
  junkOrbit: { value: 25, readme: 'all at # m/s' },
  stormEvery: { value: 50, readme: 'Every # seconds of field time a solar storm' },
  stormLength: { value: 8, readme: 'blinds the sensors for # seconds' },
  impactKill: { value: 72, readme: 'at about # m/s a ship is destroyed' },
  towCable: { value: 75, readme: 'on a cable of about # m' },
  pingWarn: { value: 150, readme: 'orange from # ms' },
  pingCritical: { value: 300, readme: 'red from # ms' },
};

/** Every number of the handbook by its placeholder; a streak's bonus is the game's share of a kill's points. */
export const HANDBOOK_NUMBERS: Record<string, number> = {
  ...FROM_CODE,
  ...Object.fromEntries(Object.entries(FROM_README).map(([name, { value }]) => [name, value])),
  streakDouble: streakBonus(2, FROM_README.kill.value, false),
  streakMore: streakBonus(3, FROM_README.kill.value, false),
};
