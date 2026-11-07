import * as THREE from 'three';
import { msg, t } from '../i18n/i18n';
import { CAMPAIGN, CRISP, HEDDA, JACK, NAVY, PIM, QUILL, RASK, SAW, SPARE, TALLY, VEY } from '../music/lines';
import { clear, CORE_SHARE, DRILL, holdFor, passRing, PIPE_BORE, RING_RADIUS, saying, stop, type Attempt, type Drill, type Markers, type SchoolContext } from '../game/school';
import { RISE, VESTA_GROUND } from '../world/vesta';
import { MARKET_DOCK, onPlace, stepFace, stepTop } from '../world/ceres';
import { hullInLight } from '../world/wall';
import { inGrooves, surfaceHeight as phobosHeight } from '../world/phobos';
import { POST_AT, POST_HALF, surfaceHeight as callistoHeight } from '../world/callisto';
import { ARENA_LIMIT } from '../world/arena';
import { crackMiddle, LAND as EUROPA_LAND, stationPlacement } from '../world/europa';
import { SEA as SEA_LEVEL } from '../world/titan';
import { FLUX_AT, fluxStatic, LAND as IO_LAND, surfaceHeight as ioHeight } from '../world/io';
import { iceTug, sulfurFreighter, tug } from '../world/barge';
import { DEPOT_AT } from '../world/ladder';
import { crestZ, surfaceHeight as iapetusHeight } from '../world/iapetus';
import { faceAt, MOUTH as VERONA_MOUTH, TOP as VERONA_TOP } from '../world/miranda';
import { GEYSER_RADIUS, GEYSERS_AT, LAND as TRITON_LAND, STATION_AT as MEMORIAL_AT } from '../world/triton';
import { surfaceHeight as plutoHeight } from '../world/pluto';
import { yacht } from '../world/yacht';
import type { HullBox } from '../world/boxes';
import { LAND as ENCELADUS_LAND, STRIPE_NAMES, STRIPE_WAY, VENTS } from '../world/enceladus';
import type { Asteroid } from '../world/asteroids';
import type { Claim } from '../world/mining';
import type { ArenaId } from '../world/arenas';
import { BAY_MOUTH, GROUND, HOPPER, PAD, PAD_RADIUS, RACK_GAP, RACK_HEIGHT, RACK_LENGTH, ROW_SPACING, YARD_END } from '../world/yard';
import { cos, exp, hypot, sin } from '../detmath';
import { type Campaign, LASER_PRICE, OVERHAUL_PRICE, PANELS_PRICE, PLATING_PRICE, RADIATORS_PRICE, TUBE_PRICE, DRIVE_ONE_PRICE, HOOK_PRICE, SECOND_TUBE_PRICE, THRUSTERS_ONE_PRICE, PLATING_TWO_PRICE, DRIVE_TWO_PRICE, TUBES_ONE_PRICE, OVERDRIVE_PRICE, THRUSTERS_TWO_PRICE, THRUSTERS_THREE_PRICE, PLATING_THREE_PRICE, DRIVE_THREE_PRICE, type Mission } from './campaign';
import type { Ship } from '../ship/ship';
import { Randomizer } from '../random';
import type { SceneName } from './scenes';

/**
 * The missions of Lot 7731 (see docs/campaign/STORY.md, section 3), each a run of drills on the
 * flight school's machinery, flown in the campaign's places. The prologue and chapter 1, the
 * Boneyard on Psyche: the first link, the menial jobs, the mining cutter, Patience docking.
 */

/** A line said at a place of the campaign: Nicole's, or someone's on the comm (see castOf). */
const said = (line: string, arena: ArenaId = 'boneyard'): Drill => ({ ...saying(line), arena });

const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The yard's middle, over the middle of the lane (the place's center). */
const OFFICE = point(0, 0, 0);
/** The crusher's hopper, behind the depot's hall. */
const CRUSHER = HOPPER;
/** Where the end of a row of racks stands, out at the lane's ends: the row's beacon. */
const rowEnd = (side: -1 | 1, row: number) => point(side * (YARD_END + 800), GROUND + RACK_HEIGHT + 100, row * ROW_SPACING);

/**
 * Lamplighter (1.1): six dead beacons at the ends of the rows, relit one after the other by
 * holding within LAMP_REACH (units, 40 m) of each for LAMP_HOLD seconds, before the shift ends
 * (LAMP_SHIFT seconds).
 */
const LAMP_REACH = 800;
const LAMP_HOLD = 3;
const LAMP_SHIFT = 360;
const LAMPS = [rowEnd(-1, -1), rowEnd(-1, -2), rowEnd(-1, -3), rowEnd(1, -3), rowEnd(1, -2), rowEnd(1, -1)];

/** The beacons not lit yet, each in its sphere; lit ones are gone. */
function lampMarkers(a: Attempt, markers: Markers) {
  markers.clear();
  for (const lamp of a.points.slice(a.next)) {
    markers.buoy(lamp);
    markers.zone(lamp, LAMP_REACH);
  }
}

const lamplighter: Drill = {
  line: CAMPAIGN.lamplighter,
  keys: ['turn', 'drive', 'brake'],
  arena: 'boneyard',
  autopilot: false,
  enter(_, a, markers) {
    a.points = LAMPS.map((lamp) => lamp.clone());
    lampMarkers(a, markers);
  },
  done(ctx, a, markers) {
    if (!holdFor(ctx, a, ctx.me.flight.position.distanceTo(a.points[a.next]) < LAMP_REACH, LAMP_HOLD)) return false;
    a.held = 0;
    a.next++;
    lampMarkers(a, markers);
    return a.next >= a.points.length;
  },
  fail: (_, a) => (a.seconds > LAMP_SHIFT ? CAMPAIGN.lamplighterLate : null),
  waypoint: (_, a) => a.points[a.next] ?? null,
  mark: (_, a) => t('Beacon {n}/{total} · {seconds} s left', { n: a.next + 1, total: a.points.length, seconds: Math.max(0, Math.ceil(LAMP_SHIFT - a.seconds)) }),
};

/**
 * Live Target (1.2): tourists pay to shoot at the hull. Three gunners on a ring around the yard
 * fire, each every TARGET_INTERVAL seconds, at where the ship was TARGET_LAG ago (as the slide
 * drill's gunner does); the ship lives TARGET_SECONDS inside TARGET_ZONE of the office (units,
 * 1 km) by jinking. Leaving the zone starts it over. Every hit takes TARGET_FINE coins off the
 * pay (see complete), as the attempt stands.
 */
const TARGET_SECONDS = 90;
const TARGET_ZONE = 20000;
const TARGET_INTERVAL = 1.2;
const TARGET_LAG = 0.4;
const TARGET_FINE = 10;
const GUNNERS = [point(0, 6000, -24000), point(20000, 3000, 12000), point(-20000, 4000, 12000)];

const liveTarget: Drill = {
  line: CAMPAIGN.liveTarget,
  keys: ['slide', 'turn', 'drive'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a, markers) {
    stop(ctx);
    a.points = [ctx.me.flight.position.clone()];
    markers.zone(OFFICE, TARGET_ZONE);
    a.lastShot = 0;
    // a.jinks: the hits taken in this attempt
    a.jinks = 0;
    ctx.fine(0);
  },
  done(ctx, a) {
    a.points[0].lerp(ctx.me.flight.position, 1 - exp(-ctx.dt / TARGET_LAG));
    if (a.seconds - a.lastShot > TARGET_INTERVAL / GUNNERS.length) {
      a.lastShot = a.seconds;
      a.count = (a.count + 1) % GUNNERS.length;
      if (ctx.fireAt(GUNNERS[a.count], a.points[0])) ctx.fine(++a.jinks * TARGET_FINE);
    }
    return a.seconds >= TARGET_SECONDS;
  },
  fail: (ctx) => (ctx.me.flight.position.distanceTo(OFFICE) > TARGET_ZONE ? CAMPAIGN.liveTargetOut : null),
  mark: (_, a) => t('Stay alive: {seconds} s · hits {hits} · ☉ {fine} off the pay', { seconds: Math.max(0, Math.ceil(TARGET_SECONDS - a.seconds)), hits: a.jinks, fine: a.jinks * TARGET_FINE }),
  waypoint: () => null,
};

/**
 * Canister Sweep (1.3): salvage canisters drifting in the gaps between the rows, one at a time:
 * fly through one (within CANISTER_REACH, units, 30 m) to take it in tow (it hangs on a cable
 * behind the stern and swings out in the turns, see Markers.tow), then through the crusher behind
 * the depot (within CRUSHER_REACH, 60 m) to deliver it.
 */
const CANISTER_REACH = 600;
const CRUSHER_REACH = 1200;
const between = ROW_SPACING / 2;
const CANISTERS = [point(-2 * (RACK_LENGTH + RACK_GAP), GROUND + 500, between), point(RACK_LENGTH + RACK_GAP, GROUND + 300, -between), point(2 * (RACK_LENGTH + RACK_GAP), GROUND + 800, 3 * between), point(-(RACK_LENGTH + RACK_GAP), GROUND + 400, -3 * between)];

/**
 * The props of the step the sweep is at: a canister drifting where it is to be taken, or, on the
 * way to the crusher, the canister in tow behind the ship (`me`) and the crusher marked.
 */
function sweepMarkers(a: Attempt, markers: Markers, me: Ship) {
  markers.clear();
  const target = a.points[a.next];
  if (!target) return;
  const towing = a.next % 2 === 1;
  if (towing) markers.tow(markers.canister(me.flight.position), me);
  else markers.canister(target);
  if (towing) markers.buoy(target, 1.5);
  markers.zone(target, towing ? CRUSHER_REACH : CANISTER_REACH);
}

const canisterSweep: Drill = {
  line: CAMPAIGN.canisterSweep,
  keys: ['turn', 'drive', 'brake'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a, markers) {
    // canister, crusher, canister, crusher…
    a.points = CANISTERS.flatMap((canister) => [canister.clone(), CRUSHER.clone()]);
    sweepMarkers(a, markers, ctx.me);
  },
  done(ctx, a, markers) {
    const reach = a.next % 2 ? CRUSHER_REACH : CANISTER_REACH;
    if (ctx.me.flight.position.distanceTo(a.points[a.next]) > reach) return false;
    a.next++;
    sweepMarkers(a, markers, ctx.me);
    return a.next >= a.points.length;
  },
  waypoint: (_, a) => a.points[a.next] ?? null,
  mark: (_, a) => (a.next % 2 ? t('Crusher') : t('Canister {n}/{total}', { n: a.next / 2 + 1, total: CANISTERS.length })),
};

/**
 * First Cut (1.5): break FIRST_CUT rocks of the yard's spoil with the cutter and fly through
 * ORE_NEEDED glints of ore. Every rock broken sheds GLINTS_PER_ROCK glints from where it stood,
 * drifting away at GLINT_SPEED (units/s, 3 to 8 m/s); one is taken within GLINT_REACH (units,
 * 25 m). The marker leads to the nearest glint, else to the nearest rock.
 */
const FIRST_CUT = 3;
const ORE_NEEDED = 20;
const GLINTS_PER_ROCK = 7;
const GLINT_SPEED = [60, 160] as const;
const GLINT_REACH = 500;

/** The glints of ore the `nth` rock broken in an attempt sheds from `at`, the same every attempt, among the attempt's points. */
function glintsOf(a: Attempt, markers: Markers, at: THREE.Vector3, nth: number) {
  const r = new Randomizer(nth * 7 + 1);
  for (let i = 0; i < GLINTS_PER_ROCK; i++) {
    const way = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    a.points.push(markers.glint(at, way.multiplyScalar(r.range(GLINT_SPEED[0], GLINT_SPEED[1]))));
  }
}

/** A glint within GLINT_REACH of the pilot taken (one a frame): gone, and counted in a.next. */
function takeGlint(ctx: SchoolContext, a: Attempt, markers: Markers) {
  const glint = a.points.find((point) => ctx.me.flight.position.distanceTo(point) <= GLINT_REACH);
  if (!glint) return;
  markers.remove(glint);
  a.points.splice(a.points.indexOf(glint), 1);
  a.next++;
}

/** The point of `points` nearest the pilot, if any. */
function nearestOf(ctx: SchoolContext, points: readonly THREE.Vector3[]): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let nearest = Infinity;
  for (const position of points) {
    const distance = position.distanceTo(ctx.me.flight.position);
    if (distance < nearest) {
      nearest = distance;
      best = position;
    }
  }
  return best;
}

const firstCut: Drill = {
  line: CAMPAIGN.firstCut,
  keys: ['turn', 'drive', 'fire'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a) {
    // a.count: rocks broken before the attempt, a.jinks: rocks whose glints are out, a.next: glints taken
    a.count = ctx.rocksBroken;
    a.jinks = 0;
    a.next = 0;
    a.points = [];
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done(ctx, a, markers) {
    // a rock just broken sheds its glints, the same ones every attempt
    while (a.jinks < ctx.rocksBroken - a.count) glintsOf(a, markers, ctx.brokenAt, ++a.jinks);
    takeGlint(ctx, a, markers);
    return ctx.rocksBroken - a.count >= FIRST_CUT && a.next >= ORE_NEEDED;
  },
  waypoint: (ctx, a) => nearestOf(ctx, a.points.length ? a.points : [...ctx.field.asteroids.values()].filter((rock) => !rock.solid).map((rock) => rock.object.position)),
  mark: (ctx, a) =>
    t('Rock {n}/{total} · ore {ore}/{needed}', { n: Math.min(FIRST_CUT, ctx.rocksBroken - a.count + (ctx.rocksBroken - a.count < FIRST_CUT ? 1 : 0)), total: FIRST_CUT, ore: a.next, needed: ORE_NEEDED }),
};

/**
 * Docking Lane (1.6): Patience (see world/patience) lies at her berth over the yard; loose hulls
 * drift at her, one after the other, LANE_WAVES of them, from LANE_FROM (units, 1 km) off at
 * LANE_SPEED (units/s, 40 m/s). Each has to be shot before it strikes her hull; LANE_STRIKES
 * strikes fail it. Her hull is solid to the Host's ship too.
 */
const BERTH = point(0, 4000, -6000);
const LANE_WAVES = 6;
const LANE_FROM = 20000;
const LANE_SPEED = 800;
const LANE_STRIKES = 3;
/** Where a hull struck Patience, and the way out of her (scratch). */
const struck = new THREE.Vector3();
const strikeNormal = new THREE.Vector3();
/** The ways the hulls come from, one after the other: from above and the sides, over the racks. */
const LANE_FROM_WAYS = [point(0.6, 0.8, 0), point(-0.5, 0.6, -0.62), point(0, 0.7, 0.71), point(-0.8, 0.6, 0), point(0.5, 0.5, -0.71), point(0.3, 0.9, 0.3)].map((way) => way.normalize());

const dockingLane: Drill = {
  line: CAMPAIGN.dockingLane,
  keys: ['turn', 'drive', 'fire'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a, markers) {
    stop(ctx);
    markers.hauler(BERTH);
    a.count = 0;
    a.jinks = 0;
    a.lit = false;
  },
  done(ctx, a, markers) {
    const drone = ctx.drone;
    // the next hull comes once the last is gone, shot or past
    if (!a.lit || !drone || !drone.alive) {
      if (a.lit && drone && !drone.alive) a.count++;
      if (a.count >= LANE_WAVES) return true;
      const from = clear(ctx, LANE_FROM_WAYS[a.count % LANE_FROM_WAYS.length].clone().multiplyScalar(LANE_FROM).add(BERTH), 1500);
      ctx.spawnDrone(from, new THREE.Vector3().subVectors(BERTH, from).setLength(LANE_SPEED));
      a.lit = true;
      return false;
    }
    if (markers.touchesHull(struck.copy(drone.flight.position), drone.radius, strikeNormal)) {
      a.jinks++;
      ctx.removeDrone();
      a.lit = false;
    }
    return false;
  },
  fail: (_, a) => (a.jinks >= LANE_STRIKES ? CAMPAIGN.dockingLaneStruck : null),
  waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : BERTH),
  mark: (_, a) => t('Hull {n}/{total} · strikes {strikes}/{max}', { n: Math.min(LANE_WAVES, a.count + 1), total: LANE_WAVES, strikes: a.jinks, max: LANE_STRIKES }),
};

/** Fits the mining cutter (see hullOf), on the debt: the yard adds its price to what the Host owes. */
export const CUTTER_PRICE = 1200;
const fitCutter = (campaign: Campaign) => {
  if (!campaign.parts.includes('cutter')) campaign.parts.push('cutter');
  campaign.bond += CUTTER_PRICE;
};

/**
 * The salvaged flight computer crashes (see SchoolContext.crash): its fault on the screen for
 * CRASH_SECONDS while it boots again.
 */
const CRASH_SECONDS = 2.5;
const crash: Drill = {
  line: msg('NAVIGATION UNIT · MEMORY FAULT · REBOOTING'),
  keys: [],
  arena: 'boneyard',
  silent: true,
  enter: (ctx) => ctx.crash(),
  done: (_, a) => a.seconds > CRASH_SECONDS,
};

/**
 * Cold Boot (0.1): out of rack 7731 along the lane to the depot, into bay 3 and down onto its
 * pad. The approach ends APPROACH_NEAR (units, 400 m) short of the bay's mouth; the brake
 * there takes the ship below DOCK_SLOW (units/s, 10 m/s); docked is resting on the pad: within
 * its radius of its middle, no higher above it than a ship's own size and a little, slower
 * than DOCK_REST (units/s, 2 m/s), for DOCK_HOLD seconds.
 */
const APPROACH_NEAR = 8000;
const DOCK_SLOW = 200;
const DOCK_REST = 40;
const DOCK_HOLD = 1;
const MOUTH = point(BAY_MOUTH, PAD.y + 400, 0);

const approach: Drill = {
  line: CAMPAIGN.depotTurn,
  keys: ['turn', 'drive'],
  arena: 'boneyard',
  autopilot: true,
  enter: (_, __, markers) => markers.buoy(MOUTH, 1.5),
  done: (ctx) => ctx.me.flight.position.distanceTo(MOUTH) < APPROACH_NEAR,
  waypoint: () => MOUTH,
  mark: (ctx) => t('Bay 3 · {m} m', { m: Math.round(ctx.me.flight.position.distanceTo(MOUTH) * 0.05) }),
};

const slowDown: Drill = {
  line: CAMPAIGN.depotBrake,
  keys: ['brake'],
  arena: 'boneyard',
  enter: (_, __, markers) => markers.buoy(MOUTH, 1.5),
  done: (ctx) => ctx.me.flight.velocity.length() < DOCK_SLOW,
  waypoint: () => MOUTH,
  mark: (ctx) => t('{speed} m/s', { speed: Math.round(ctx.me.flight.velocity.length() * 0.05) }),
};

const dock: Drill = {
  line: CAMPAIGN.depotDock,
  keys: ['turn', 'drive', 'slide', 'brake'],
  arena: 'boneyard',
  enter(_, __, markers) {
    markers.buoy(PAD.clone().setY(PAD.y + 200), 0.8);
    markers.zone(PAD, PAD_RADIUS);
  },
  done(ctx, a) {
    const at = ctx.me.flight.position;
    const over = hypot(at.x - PAD.x, at.z - PAD.z) < PAD_RADIUS && at.y - PAD.y < ctx.me.radius + 300;
    if (!holdFor(ctx, a, over && ctx.me.flight.velocity.length() < DOCK_REST, DOCK_HOLD)) return false;
    // the clamps take the hull
    stop(ctx);
    return true;
  },
  waypoint: () => PAD,
  mark: (ctx) => t('Pad · {m} m', { m: Math.round(ctx.me.flight.position.distanceTo(PAD) * 0.05) }),
};

/** A line someone of the campaign says over the comm (Rask, Pim, Hedda: see castOf), the hull held in the clamps while they talk. */
const rask = (line: string): Drill => ({ ...said(line), enter: (ctx) => stop(ctx) });

/**
 * The clone climbs out of the cockpit into a scene in person (see campaign/scenes): the hull held
 * in its clamps, the canopy open, the clone up in the room CLIMB_SECONDS later, looking around.
 */
const CLIMB_SECONDS = 4;
const climbOut = (scene: SceneName, line: string, arena: ArenaId = 'boneyard'): Drill => ({
  line,
  keys: ['turn'],
  arena,
  silent: true,
  enter(ctx) {
    stop(ctx);
    ctx.stage(scene);
  },
  done: (_, a) => a.seconds > CLIMB_SECONDS,
});

/** A line Nicole says about what the clone just felt in a scene in person, the touch jolting through the link as it begins. */
const felt = (line: string): Drill => ({ ...said(line), enter: (ctx) => ctx.feel() });

/** A line said in the room of a scene in person at a place of the campaign. */
const inRoom = (line: string, arena: ArenaId): Drill => said(line, arena);

/** The clone climbs back into the cockpit, the hull still held: the scene is over, and `line` said. */
const climbIn = (line: string, arena: ArenaId): Drill => ({ ...said(line, arena), enter: (ctx) => {
    ctx.stage(null);
    stop(ctx);
  } });

/** Pim welds the thrusters while she talks (see hullOf): free, she says, and Rask need not know. */
const fitPatch = (campaign: Campaign) => {
  if (!campaign.parts.includes('patch')) campaign.parts.push('patch');
};

/** Where every mission after the first begins: docked on bay 3's pad, the nose out of the bay. */
const ON_PAD = { at: [PAD.x, PAD.y + 400, PAD.z] as const, toward: [BAY_MOUTH - 20000, PAD.y + 400, PAD.z] as const };

/** A line said on Vesta's flank, the ship held still for it (Hedda's from Patience, Pim's, Nicole's). */
const onVesta = (line: string): Drill => ({ ...said(line, 'rheasilvia'), enter: (ctx) => stop(ctx) });

/**
 * Claim Survey (2.1): five claims filed, each marked by its buoy (see world/mining), flown past
 * in the order they were filed, within SURVEY_REACH (units, 100 m) of each, before the survey
 * window shuts (SURVEY_WINDOW seconds).
 */
const SURVEY_CLAIMS = 5;
const SURVEY_REACH = 2000;
const SURVEY_WINDOW = 480;

const claimSurvey: Drill = {
  line: CAMPAIGN.claimSurvey,
  keys: ['turn', 'drive', 'brake'],
  arena: 'rheasilvia',
  autopilot: false,
  enter(ctx, a, markers) {
    a.points = ctx.claims().slice(0, SURVEY_CLAIMS).map((claim) => claim.buoy);
    surveyMarkers(a, markers);
  },
  done(ctx, a, markers) {
    if (ctx.me.flight.position.distanceTo(a.points[a.next]) >= SURVEY_REACH) return false;
    a.next++;
    surveyMarkers(a, markers);
    return a.next >= a.points.length;
  },
  fail: (_, a) => (a.seconds > SURVEY_WINDOW ? CAMPAIGN.claimSurveyLate : null),
  waypoint: (_, a) => a.points[a.next] ?? null,
  mark: (_, a) => t('Claim {n}/{total} · {seconds} s left', { n: a.next + 1, total: a.points.length, seconds: Math.max(0, Math.ceil(SURVEY_WINDOW - a.seconds)) }),
};

/** The next claim's buoy in its sphere; the others wait their turn. */
function surveyMarkers(a: Attempt, markers: Markers) {
  markers.clear();
  const next = a.points[a.next];
  if (next) markers.zone(next, SURVEY_REACH);
}

/**
 * Cut and Haul (2.2): the claim beside a working rig (the claim without a rig nearest to one
 * with a rig, see world/mining) cut apart with the cutter, and HAUL_ORE glints of its ore flown
 * through (its pieces shed them as First Cut's rocks do, see glintsOf). Every beam that strikes
 * a rig or a buoy takes RIG_FINE coins off the pay; it cannot fail. HAUL_FAMILY: how far from
 * where the claim stood (in its radii) a piece broken counts as its own.
 */
const HAUL_ORE = 40;
const ORE_PAY = 35;
const RIG_FINE = 50;
const HAUL_FAMILY = 2.5;

/** The claim the haul cuts: the one without a rig nearest to a claim with one. */
function haulClaim(ctx: SchoolContext): Asteroid | null {
  const claims = ctx.claims();
  let best: Asteroid | null = null;
  let nearest = Infinity;
  for (const claim of claims) {
    if (claim.rig) continue;
    const rock = ctx.field.asteroids.get(claim.rock);
    if (!rock) continue;
    for (const rigged of claims) {
      const rig = rigged.rig ? ctx.field.asteroids.get(rigged.rock) : undefined;
      const distance = rig ? rig.object.position.distanceTo(rock.object.position) : Infinity;
      if (distance < nearest) {
        nearest = distance;
        best = rock;
      }
    }
  }
  return best;
}

const cutAndHaul: Drill = {
  line: CAMPAIGN.cutAndHaul,
  keys: ['turn', 'drive', 'fire'],
  arena: 'rheasilvia',
  autopilot: false,
  enter(ctx, a) {
    // a.count: rocks broken before the attempt, a.jinks: breaks whose glints are out, a.next: ore taken, a.reach: how far the claim's pieces lie
    const claim = haulClaim(ctx);
    a.site.copy(claim?.object.position ?? ctx.me.flight.position);
    a.reach = (claim?.radius ?? 2000) * HAUL_FAMILY;
    a.count = ctx.rocksBroken;
    a.jinks = 0;
    a.next = 0;
    a.points = [];
    a.rigBeams = ctx.rigBeams;
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done(ctx, a, markers) {
    // the claim's pieces shed their glints; a rock broken elsewhere sheds none for this job
    while (a.jinks < ctx.rocksBroken - a.count) {
      a.jinks++;
      if (ctx.brokenAt.distanceTo(a.site) < a.reach) glintsOf(a, markers, ctx.brokenAt, a.jinks);
    }
    takeGlint(ctx, a, markers);
    ctx.fine((ctx.rigBeams - a.rigBeams) * RIG_FINE);
    return a.next >= HAUL_ORE;
  },
  waypoint(ctx, a) {
    // the nearest glint, else the nearest piece of the claim
    const pieces = [...ctx.field.asteroids.values()].filter((rock) => !rock.solid && rock.kind === 'rock' && rock.object.position.distanceTo(a.site) < a.reach).map((rock) => rock.object.position);
    return nearestOf(ctx, a.points.length ? a.points : pieces);
  },
  mark: (ctx, a) => t('Ore {ore}/{needed} · rig hits {hits}', { ore: a.next, needed: HAUL_ORE, hits: ctx.rigBeams - a.rigBeams }),
};

/**
 * Saw Brothers (2.3): JUMPERS claim-jumpers of JUMPER_SKILL saw at the rig nearest the place's
 * middle (see Game.jumpers: each holds off it and fires at it until a ship comes near, then
 * fights); JUMPERS_DOWN of them shot down wins, and the third runs; the rig falls at RIG_FALLS
 * hits of theirs, and the attempt starts over.
 */
const JUMPERS = 3;
const JUMPER_SKILL = 0.15;
const JUMPERS_DOWN = 2;
const RIG_FALLS = 30;
/** The music turns to the fight once the pilot is this near the rig (units, 1.2 km): the brothers hold 400 m off it and heed a ship within 800 m of them. */
const SAW_FIGHT = 24000;

/** The claim whose rig the Saw Brothers saw at: of those with a rig, the one nearest the place's middle. */
function sawnClaim(ctx: SchoolContext): Claim | null {
  let best: Claim | null = null;
  for (const claim of ctx.claims()) if (claim.rig && (!best || claim.rig.length() < best.rig!.length())) best = claim;
  return best;
}

const sawBrothers: Drill = {
  line: CAMPAIGN.sawBrothers,
  keys: ['turn', 'drive', 'fire'],
  arena: 'rheasilvia',
  // the claim's calm while the brothers saw; the music turns the moment the fight does
  turn: (ctx, a) => (ctx.jumpersDown > 0 || ctx.me.flight.position.distanceTo(a.site) < SAW_FIGHT ? 'fight' : undefined),
  autopilot: false,
  enter(ctx, a) {
    const claim = sawnClaim(ctx);
    if (claim?.rig) {
      ctx.spawnJumpers(claim.rock, claim.rig, JUMPERS, JUMPER_SKILL);
      a.site.copy(claim.rig);
    }
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done: (ctx) => ctx.jumpersDown >= JUMPERS_DOWN,
  fail: (ctx) => (ctx.rigWear >= RIG_FALLS ? CAMPAIGN.sawBrothersFell : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: (_, a) => a.site,
  mark: (ctx) => t('Down {n}/{needed} · rig {wear}/{falls}', { n: ctx.jumpersDown, needed: JUMPERS_DOWN, wear: ctx.rigWear, falls: RIG_FALLS }),
};

/**
 * The Peak Run (2.4): the Rockborn kids' race through PEAK_RINGS sections of an old ore line's
 * pipe (see Markers.pipe), hung on an ellipse round the claims (PEAK_REACH and PEAK_DEPTH its half
 * axes), PEAK_OVER above the flank, PEAK_LAPS laps against PEAK_RIVALS rivals of PEAK_SKILL (see
 * Game.racers); a pipe counts flown through its bore, either way. In the first PEAK_PODIUM it wins;
 * later, the attempt starts over.
 */
export const PEAK_RINGS = 6;
const PEAK_REACH = 32000;
const PEAK_DEPTH = 24000;
const PEAK_OVER = 6000;
export const PEAK_LAPS = 2;
const PEAK_RIVALS = 3;
const PEAK_SKILL = 0.2;
const PEAK_PODIUM = 2;
export const PEAK_COURSE = Array.from({ length: PEAK_RINGS }, (_, k) => {
  const angle = (k / PEAK_RINGS) * Math.PI * 2;
  const x = cos(angle) * PEAK_REACH;
  return point(x, VESTA_GROUND + RISE * x + PEAK_OVER, sin(angle) * PEAK_DEPTH);
});

/**
 * A race of a mission against rivals (see Game.racers): `laps` laps through `marks` (each facing
 * along the loop, from the mark before it to the mark after it), pipes of PIPE_BORE standing on
 * `ground` (a height by x) or rings of the Games of RING_RADIUS; home among the first `podium`
 * wins, later the race is flown again (`lost` said).
 */
interface RaceSpec {
  line: string;
  lost: string;
  arena: ArenaId;
  marks: readonly THREE.Vector3[];
  laps: number;
  pipes: { ground: (x: number) => number } | null;
  rivals: { names: readonly string[]; skills: readonly number[] };
  podium: number;
  /** What a mark is called under the waypoint, with the lap: a text marked with msg(). */
  mark: string;
}

function race(spec: RaceSpec): Drill {
  const count = spec.marks.length;
  const bore = spec.pipes ? PIPE_BORE : RING_RADIUS;
  return {
    line: spec.line,
    keys: ['turn', 'drive', 'brake'],
    arena: spec.arena,
    // a race against rivals
    music: 'fight',
    autopilot: true,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = spec.marks.map((mark) => clear(ctx, mark.clone(), bore * 2));
      a.normals = a.points.map((_, i) => a.points[(i + 1) % count].clone().sub(a.points[(i + count - 1) % count]).normalize());
      a.points.forEach((mark, i) => (spec.pipes ? markers.pipe(mark, a.normals[i], spec.pipes.ground(mark.x)) : markers.ring(mark, a.normals[i])));
      a.pipes = !!spec.pipes;
      a.next = 0;
      a.side = NaN;
      a.warned = false;
      ctx.spawnRacers(a.points, a.normals, bore, spec.laps, spec.rivals.skills.length, spec.rivals.skills[0], ctx.me.flight.position, spec.rivals.names, spec.rivals.skills);
    },
    done(ctx, a) {
      const k = a.next % count;
      const offset = a.site.subVectors(ctx.me.flight.position, a.points[k]);
      const side = offset.dot(a.normals[k]);
      const crossed = Number.isFinite(a.side) && a.side < 0 !== side < 0;
      a.side = side;
      if (!crossed || offset.addScaledVector(a.normals[k], -side).length() >= bore) return false;
      a.next++;
      a.side = NaN;
      if (a.next < count * spec.laps) return false;
      // home: among the first, or the race is lost
      a.warned = ctx.racersFinished >= spec.podium;
      return !a.warned;
    },
    fail: (_, a) => (a.warned ? spec.lost : null),
    leave: (ctx) => ctx.removeRacers(),
    waypoint: (_, a) => a.points[a.next % count] ?? null,
    mark: (_, a) => t(spec.mark, { lap: Math.min(spec.laps, Math.floor(a.next / count) + 1), laps: spec.laps, n: (a.next % count) + 1, total: count }),
  };
}

const peakRun = race({
  line: CAMPAIGN.peakRun,
  lost: CAMPAIGN.peakRunLost,
  arena: 'rheasilvia',
  marks: PEAK_COURSE,
  laps: PEAK_LAPS,
  pipes: { ground: (x) => VESTA_GROUND + RISE * x },
  rivals: { names: ['Nix', 'Bean', 'Spark'], skills: Array.from({ length: PEAK_RIVALS }, () => PEAK_SKILL) },
  podium: PEAK_PODIUM,
  mark: msg('Lap {lap}/{laps} · pipe {n}/{total}'),
});

/**
 * The Stickney Grand (4.1): GRAND_RINGS rings of the Games on an ellipse (GRAND_REACH by
 * GRAND_DEPTH, about GRAND_MIDDLE) that dives from over Stickney's rim down into the crater and
 * out again, each GRAND_OVER over Phobos's ground beneath it; GRAND_LAPS laps against Perihelion
 * (who has never died) and four others; home among the first GRAND_PODIUM goes to Lanes Watch.
 */
export const GRAND_RINGS = 8;
const GRAND_REACH = 44000;
const GRAND_DEPTH = 32000;
const GRAND_MIDDLE = -12000;
const GRAND_OVER = 6000;
export const GRAND_LAPS = 3;
const GRAND_PODIUM = 3;
/** A race's loop of `rings` rings over a moon's ground: an ellipse `reach` by `depth` about (x, z) of `middle`, each ring `over` the ground (`height`) beneath it; and where the racers line up, on the ellipse half a radian before the first ring, facing it. */
function groundLoop(rings: number, middle: readonly [number, number], reach: number, depth: number, over: number, height: (x: number, z: number) => number) {
  const at = (angle: number) => {
    const x = middle[0] + cos(angle) * reach;
    const z = middle[1] + sin(angle) * depth;
    return point(x, height(x, z) + over, z);
  };
  const course = Array.from({ length: rings }, (_, k) => at((k / rings) * Math.PI * 2));
  return { course, start: { at: at(-0.5).toArray() as [number, number, number], toward: course[0].toArray() as [number, number, number] } };
}
const grand = groundLoop(GRAND_RINGS, [GRAND_MIDDLE, 0], GRAND_REACH, GRAND_DEPTH, GRAND_OVER, phobosHeight);
export const GRAND_COURSE = grand.course;
/** Where the racers line up: on the ellipse a stretch before the first ring, facing it. */
export const GRAND_START = grand.start;

const stickneyGrand = race({
  line: CAMPAIGN.stickneyGrand,
  lost: CAMPAIGN.stickneyGrandLost,
  arena: 'phobos',
  marks: GRAND_COURSE,
  laps: GRAND_LAPS,
  pipes: null,
  rivals: { names: ['Perihelion', 'Vasquez', 'Kade', 'Moth', 'Dray'], skills: [0.65, 0.35, 0.35, 0.3, 0.3] },
  podium: GRAND_PODIUM,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});

/**
 * The Flux Tube Race (7.1): the sulfur miners' race, FLUX_RINGS rings on an ellipse over Io's
 * plain (FLUX_REACH by FLUX_DEPTH about FLUX_MIDDLE), each FLUX_OVER over the ground beneath it,
 * one side of it running past the flux tube: the nearer, the more the link crackles (see
 * fluxStatic). FLUX_LAPS laps against Perihelion and four of the miners; home among the first
 * FLUX_PODIUM.
 */
export const FLUX_RINGS = 8;
const FLUX_REACH = 22000;
const FLUX_DEPTH = 16000;
const FLUX_MIDDLE = [-20000, 6000] as const;
const FLUX_OVER = 6000;
export const FLUX_LAPS = 2;
const FLUX_PODIUM = 2;
const flux = groundLoop(FLUX_RINGS, FLUX_MIDDLE, FLUX_REACH, FLUX_DEPTH, FLUX_OVER, ioHeight);
export const FLUX_COURSE = flux.course;
export const FLUX_START = flux.start;

const fluxRace = race({
  line: CAMPAIGN.fluxTubeRace,
  lost: CAMPAIGN.fluxTubeRaceLost,
  arena: 'io',
  marks: FLUX_COURSE,
  laps: FLUX_LAPS,
  pipes: null,
  rivals: { names: ['Perihelion', 'Brimstone', 'Cinder', 'Kade', 'Moth'], skills: [0.65, 0.4, 0.35, 0.35, 0.3] },
  podium: FLUX_PODIUM,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});
/** The race, the link crackling by the tube (see fluxStatic). */
const fluxTubeRace: Drill = {
  ...fluxRace,
  done(ctx, a, markers) {
    ctx.linkStatic(fluxStatic(ctx.me.flight.position));
    return fluxRace.done(ctx, a, markers);
  },
};

/**
 * The Victory Cola Circuit over Kraken Mare (chapter 9): HEAT_RINGS Ministry coils on an ellipse
 * (HEAT_REACH by HEAT_DEPTH) whose one side runs HEAT_HIGH over Titan's haze deck and whose
 * other dips HEAT_LOW into it, where the air brakes and hides (see world/air). The Qualifying
 * Heat (9.1): HEAT_LAPS laps against Perihelion and four of the Circuit, home among the first
 * HEAT_PODIUM; the Circuit Final (9.4) the same loop, home first.
 */
export const HEAT_RINGS = 8;
const HEAT_REACH = 44000;
const HEAT_DEPTH = 32000;
const HEAT_HIGH = 3000;
const HEAT_LOW = -6000;
export const HEAT_LAPS = 3;
const heatHeight = (x: number) => HEAT_LOW + ((HEAT_HIGH - HEAT_LOW) * (x / HEAT_REACH + 1)) / 2;
const heat = groundLoop(HEAT_RINGS, [0, 0], HEAT_REACH, HEAT_DEPTH, 0, heatHeight);
export const HEAT_COURSE = heat.course;
export const HEAT_START = heat.start;
const CIRCUIT_RIVALS = { names: ['Perihelion', 'Vasquez', 'Fizz', 'Kade', 'Vega'], skills: [0.65, 0.45, 0.4, 0.4, 0.35] };

const qualifyingHeat = race({
  line: CAMPAIGN.qualifyingHeat,
  lost: CAMPAIGN.qualifyingHeatLost,
  arena: 'titan',
  marks: HEAT_COURSE,
  laps: HEAT_LAPS,
  pipes: null,
  rivals: CIRCUIT_RIVALS,
  podium: 3,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});

/** The Circuit Final (9.4): the Qualifying Heat's loop over Kraken Mare, against the same field, home first. */
const circuitFinal = race({
  line: CAMPAIGN.circuitFinal,
  lost: CAMPAIGN.circuitFinalLost,
  arena: 'titan',
  marks: HEAT_COURSE,
  laps: HEAT_LAPS,
  pipes: null,
  rivals: CIRCUIT_RIVALS,
  podium: 1,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});

/**
 * The Pit Fight (9.2): the Host and five of the Circuit in the haze PIT_DEPTH under the deck, every
 * ship for itself (see SchoolContext.brawl), for PIT_SECONDS; the Host's kills placed among
 * theirs, among the first PIT_PODIUM wins (a tie counts for the Host); the clock run out
 * placed lower starts it over.
 */
const PIT_SECONDS = 180;
const PIT_PODIUM = 3;
const PIT_FIELD = point(0, -12000, 0);
const PIT_NAMES = ['Brix', 'Volta', 'Mako', 'Sable', 'Rook'];
const PIT_SKILL = 0.4;
/** The Host's place in the Pit Fight by kills: one more than the rivals with more. */
const pitPlace = (ctx: SchoolContext) => 1 + ctx.jumperKills.filter((kills) => kills > ctx.me.kills).length;

const pitFight: Drill = {
  line: CAMPAIGN.pitFight,
  keys: ['turn', 'drive', 'fire'],
  arena: 'titan',
  autopilot: false,
  music: 'fight',
  enter(ctx) {
    ctx.spawnJumpers(null, PIT_FIELD, PIT_NAMES.length, PIT_SKILL, PIT_NAMES, 12000, true);
    ctx.brawl();
    ctx.me.kills = 0;
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done: (ctx, a) => a.seconds >= PIT_SECONDS && pitPlace(ctx) <= PIT_PODIUM,
  fail: (ctx, a) => (a.seconds >= PIT_SECONDS && pitPlace(ctx) > PIT_PODIUM ? CAMPAIGN.pitFightLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => PIT_FIELD,
  mark: (ctx, a) => t('Place {place} · {seconds} s left', { place: pitPlace(ctx), seconds: Math.max(0, Math.ceil(PIT_SECONDS - a.seconds)) }),
};

/**
 * The Haze Duel (9.3): Perihelion alone (skill PERIHELION_SKILL), DUEL_DEPTH under Titan's deck,
 * where the eye sees some 600 m and the radar twice that; once his hull is down to
 * PERIHELION_BREAK (of 100) he breaks off, as he always does before his clone can die, and the
 * duel is won.
 */
const PERIHELION_SKILL = 0.65;
const PERIHELION_BREAK = 35;
const DUEL_FIELD = point(0, -25000, 0);
const DUEL_GONE = point(-60000, -10000, -20000);

/**
 * A duel with one rival who never lets a clone die (the Haze Duel's Perihelion, Spare): `name` of
 * `skill` at `field`, fighting every ship he sees; once his hull is down to `breakAt` (of 100) he
 * flies off to `gone` with any `escorts` (a few of the Navy beside him), Nicole says `breaks`, and
 * the duel is won a few seconds later.
 */
function duel(spec: { line: string; arena: ArenaId; name: string; skill: number; field: THREE.Vector3; breakAt: number; gone: THREE.Vector3; breaks: string; mark: string; escorts?: { names: readonly string[]; skill: number } }): Drill {
  const names = [spec.name, ...(spec.escorts?.names ?? [])];
  const skills = names.map((_, i) => (i ? spec.escorts!.skill : spec.skill));
  return {
    line: spec.line,
    keys: ['turn', 'drive', 'fire'],
    arena: spec.arena,
    autopilot: false,
    music: 'fight',
    enter(ctx) {
      ctx.spawnJumpers(null, spec.field, names.length, skills, names, 8000, true);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
    },
    done(ctx, a) {
      if (!Number.isNaN(a.doneAt)) return a.seconds >= a.doneAt;
      if (ctx.leaderDown || ctx.leaderHull <= spec.breakAt) {
        ctx.standDown(spec.gone);
        ctx.say([spec.breaks]);
        a.doneAt = a.seconds + 4;
      }
      return false;
    },
    leave: (ctx) => ctx.removeJumpers(),
    waypoint: () => null,
    mark: (ctx) => t(spec.mark, { hull: Math.round(ctx.leaderHull) }),
  };
}

const hazeDuel = duel({ line: CAMPAIGN.hazeDuel, arena: 'titan', name: 'Perihelion', skill: PERIHELION_SKILL, field: DUEL_FIELD, breakAt: PERIHELION_BREAK, gone: DUEL_GONE, breaks: CAMPAIGN.hazeDuelBreaks, mark: msg('Perihelion · hull {hull} %') });

/** Methane Echo (9.5): the seventh echo, low over Kraken Mare, ECHO_SEVEN_OVER over the sea, where the haze hides it from the eye and not from the radar. */
const ECHO_SEVEN_OVER = 1600;
export const ECHO_SEVEN = point(25000, SEA_LEVEL + ECHO_SEVEN_OVER, -20000);

/** The second tube (9.6), from the Circuit's pits: two torpedoes a clone (see hullOf), at SECOND_TUBE_PRICE. */
const fitSecondTube = (campaign: Campaign) => {
  if (campaign.parts.includes('secondTube')) return;
  campaign.parts.push('secondTube');
  buy(campaign, SECOND_TUBE_PRICE);
};
/** Thrusters I (9.6): the thrusters a step past stock (see hullOf), at THRUSTERS_ONE_PRICE. */
const fitThrustersOne = (campaign: Campaign) => {
  if (campaign.parts.includes('thrustersOne')) return;
  campaign.parts.push('thrustersOne');
  buy(campaign, THRUSTERS_ONE_PRICE);
};

/** Voice II (10.2): Nicole's own voice, clean, from a board out of Crisp's yacht (see Module, Speaker.thin). */
const fitVoice = (campaign: Campaign) => {
  if (!campaign.modules.includes('voice')) campaign.modules.push('voice');
};

/**
 * Hello, Host (10.2): Spare, the clone lost in Io's flux tube, in a grey interceptor (skill
 * SPARE_SKILL) over the tiger stripes; once his hull is down to SPARE_BREAK (of 100) he breaks
 * off, as the Host would, and hails.
 */
const SPARE_SKILL = 0.6;
const SPARE_BREAK = 50;
const SPARE_FIELD = point(0, ENCELADUS_LAND + 10000, 0);
const SPARE_GONE = point(60000, ENCELADUS_LAND + 30000, -30000);

const helloHost = duel({ line: CAMPAIGN.helloHost, arena: 'enceladus', name: 'Spare', skill: SPARE_SKILL, field: SPARE_FIELD, breakAt: SPARE_BREAK, gone: SPARE_GONE, breaks: CAMPAIGN.spareBreaks, mark: msg('Spare · hull {hull} %') });

/**
 * Tiger Stripes (10.3): a time trial down the four stripes, through TIGER_PER_STRIPE coils of the
 * Ministry over each, leased for a Victory Cola ad and moored at the vents (the second and the
 * fourth of each stripe, see VENTS), TIGER_OVER over the plain so the trough and its ridges stay
 * clear beneath; down the first stripe, back up the second, and so on. The clock starts at the
 * first coil, and every coil after it within TIGER_TIME (the ad's length) wins; a coil missed
 * starts it over.
 */
const TIGER_PER_STRIPE = 2;
const TIGER_OVER = 3200;
export const TIGER_TIME = 75;
const VENTS_PER = VENTS.length / STRIPE_NAMES.length;
export const TIGER_COURSE = STRIPE_NAMES.flatMap((_, k) => {
  const coils = [1, 3].map((i) => VENTS[k * VENTS_PER + i].clone().setY(ENCELADUS_LAND + TIGER_OVER));
  return k % 2 ? coils.reverse() : coils;
});
/** Each coil faces along its stripe, the way it is flown. */
export const TIGER_NORMALS = TIGER_COURSE.map((_, i) => STRIPE_WAY.clone().multiplyScalar(Math.floor(i / TIGER_PER_STRIPE) % 2 ? -1 : 1));
const TIGER_FROM = TIGER_COURSE[0].clone().addScaledVector(STRIPE_WAY, -20000);
export const TIGER_START = { at: [TIGER_FROM.x, TIGER_FROM.y, TIGER_FROM.z] as const, toward: [TIGER_COURSE[0].x, TIGER_COURSE[0].y, TIGER_COURSE[0].z] as const };

const tigerStripes = timeTrial({ line: CAMPAIGN.tigerStripes, arena: 'enceladus', points: TIGER_COURSE, normals: TIGER_NORMALS, time: TIGER_TIME, missed: CAMPAIGN.tigerStripesMissed, slow: CAMPAIGN.tigerStripesSlow });

/** Main drive II and Radiators II (11.2), paid by the Ministry's money: each the hangar's second step (see hullOf), at DRIVE_TWO_PRICE each. */
const fitDriveTwo = (campaign: Campaign) => {
  for (const part of ['driveTwo', 'radiatorsTwo'] as const) {
    if (campaign.parts.includes(part)) continue;
    campaign.parts.push(part);
    buy(campaign, DRIVE_TWO_PRICE);
  }
};

/** Torpedo tubes I (12.4), the trials' prize: the tubes' first step (see hullOf), at TUBES_ONE_PRICE. */
const fitTubesOne = (campaign: Campaign) => {
  if (campaign.parts.includes('tubesOne')) return;
  campaign.parts.push('tubesOne');
  buy(campaign, TUBES_ONE_PRICE);
};

/** The Ring Trials' arena (chapter 12): the Rings of Saturn, the Games' own. */
const RINGS: ArenaId = 'rings';

/**
 * Verona Drop (13.1): down the face of Verona Rupes to the hideout's mouth through DROP_BUOYS
 * buoys, each DROP_OFF_BUOY south of the face (units, 150 m), from near the top edge at
 * DROP_FROM_X down and along to the mouth; reached within DROP_REACH, in order. Faster than
 * DROP_SPEED (units/s, 150 m/s: slow beside the ships' 250 m/s), or once at the first buoy more than DROP_OFF (units, 300 m) off
 * the face (south of it, below the top), and the Navy's scopes see the hull: it starts over.
 */
const DROP_BUOYS = 6;
const DROP_FROM_X = 40000;
const DROP_OFF_BUOY = 3000;
const DROP_REACH = 1600;
const DROP_SPEED = 3000;
const DROP_OFF = 6000;
export const DROP_COURSE = Array.from({ length: DROP_BUOYS }, (_, i) => {
  const share = (i + 1) / DROP_BUOYS;
  const x = DROP_FROM_X + (VERONA_MOUTH.x - DROP_FROM_X) * share;
  const y = VERONA_TOP - 2000 + (VERONA_MOUTH.y - (VERONA_TOP - 2000)) * share;
  return point(x, y, faceAt(x, y) + DROP_OFF_BUOY);
});

/** Where the drop starts: south of the face, over its top edge, east of the first buoy. */
export const DROP_START = (() => {
  const x = DROP_FROM_X + 15000;
  return { at: [x, VERONA_TOP + 4000, faceAt(x, VERONA_TOP) + 6000] as const, toward: [DROP_COURSE[0].x, DROP_COURSE[0].y, DROP_COURSE[0].z] as const };
})();

const veronaDrop: Drill = {
  line: CAMPAIGN.veronaDrop,
  keys: ['turn', 'drive', 'brake'],
  arena: 'miranda',
  autopilot: false,
  enter(_, a, markers) {
    a.points = DROP_COURSE.map((buoy) => buoy.clone());
    surveyMarkers(a, markers);
  },
  done(ctx, a, markers) {
    if (ctx.me.flight.position.distanceTo(a.points[a.next]) >= DROP_REACH) return false;
    a.next++;
    surveyMarkers(a, markers);
    return a.next >= a.points.length;
  },
  fail(ctx, a) {
    const at = ctx.me.flight.position;
    if (ctx.me.flight.velocity.length() > DROP_SPEED) return CAMPAIGN.veronaFast;
    // how far south of the face the hull flies, at its own height
    return a.next > 0 && at.y < VERONA_TOP && at.z - faceAt(at.x, at.y) > DROP_OFF ? CAMPAIGN.veronaOff : null;
  },
  waypoint: (_, a) => a.points[a.next] ?? null,
  mark: (ctx, a) => t('Buoy {n}/{total} · {speed} m/s', { n: Math.min(a.next + 1, a.points.length), total: a.points.length, speed: Math.round(ctx.me.flight.velocity.length() * 0.05) }),
};

/** The overdrive (13.2), the Loose's reactor dump, fitted at OVERDRIVE_PRICE. */
const fitOverdrive = (campaign: Campaign) => {
  if (campaign.parts.includes('overdrive')) return;
  campaign.parts.push('overdrive');
  buy(campaign, OVERDRIVE_PRICE);
};
/** Thrusters II (13.4): the thrusters' second step (see hullOf), at THRUSTERS_TWO_PRICE. */
const fitThrustersTwo = (campaign: Campaign) => {
  if (campaign.parts.includes('thrustersTwo')) return;
  campaign.parts.push('thrustersTwo');
  buy(campaign, THRUSTERS_TWO_PRICE);
};

/**
 * The Sweep (13.3): SWEEPERS Navy fighters of SWEEP_SKILL come for the hideout's mouth, holding
 * SWEEP_HOLD off it (units, 200 m); Spare flies on the Host's wing (skill SPARE_SKILL). One of them
 * within SWEEP_REACH of the mouth (units, 300 m) for SWEEP_SIT seconds in a row opens the hideout
 * and starts it over; the mouth kept clear SWEEP_SECONDS, or all of them down, wins.
 */
const SWEEPERS = 6;
const SWEEP_SKILL = 0.5;
const SWEEP_HOLD = 4000;
const SWEEP_REACH = 6000;
const SWEEP_SIT = 8;
const SWEEP_SECONDS = 240;
/** The Navy pilots' names (never translated). */
const SWEEP_NAMES = ['Lt. Marr', 'Lt. Okafor', 'Ens. Vale', 'Ens. Brandt', 'Ens. Sato', 'Lt. Reyes'];
const SWEEP_FROM = point(30000, -6000, 50000);

const theSweep: Drill = {
  line: CAMPAIGN.sweep,
  keys: ['turn', 'drive', 'fire'],
  arena: 'miranda',
  autopilot: false,
  music: 'fight',
  enter(ctx, a) {
    ctx.removeJumpers();
    ctx.spawnJumpers(null, VERONA_MOUTH, SWEEPERS, SWEEP_SKILL, SWEEP_NAMES, SWEEP_HOLD);
    ctx.wingman('Spare', SPARE_SKILL, SWEEP_FROM.clone().lerp(VERONA_MOUTH, 0.8));
    ctx.me.heat = 0;
    ctx.me.overheated = false;
    // a.jinks: the seconds a Navy ship has sat on the mouth in a row
    a.jinks = 0;
    a.lastShot = a.seconds;
  },
  done(ctx, a) {
    const dt = stepOf(a);
    a.jinks = ctx.jumperNear(VERONA_MOUTH, SWEEP_REACH) ? a.jinks + dt : 0;
    return a.seconds >= SWEEP_SECONDS || ctx.jumpersDown >= SWEEPERS;
  },
  fail: (_, a) => (a.jinks >= SWEEP_SIT ? CAMPAIGN.sweepLost : null),
  leave(ctx) {
    ctx.removeJumpers();
    ctx.removeWingman();
  },
  waypoint: () => VERONA_MOUTH,
  mark: (ctx, a) => t('Navy {n}/{total} · {seconds} s left', { n: SWEEPERS - ctx.jumpersDown, total: SWEEPERS, seconds: Math.max(0, Math.ceil(SWEEP_SECONDS - a.seconds)) }),
};

/**
 * Heart Run (15.1): the Feeder pilots' race over Pluto's heart, HEART_LAPS laps of HEART_RINGS
 * rings on an ellipse over the plain east of the mountains, clear of them, HEART_OVER over the ground; only first
 * home wins, and the Feeders take Patience on.
 */
const HEART_RINGS = 8;
export const HEART_LAPS = 2;
/** The rings' height over the ground (units, 300 m): more than twice a ring's radius, so no ring is set clear of the ground (see clear). */
const HEART_OVER = 6000;
const heartLoop = groundLoop(HEART_RINGS, [24000, 0], 38000, 30000, HEART_OVER, plutoHeight);
export const HEART_COURSE = heartLoop.course;
export const HEART_START = heartLoop.start;
const heartRun = race({
  line: CAMPAIGN.heartRun,
  lost: CAMPAIGN.heartRunLost,
  arena: 'pluto',
  marks: HEART_COURSE,
  laps: HEART_LAPS,
  pipes: null,
  rivals: { names: ['Wick', 'Ember', 'Lumen', 'Cinder', 'Ash'], skills: [0.6, 0.5, 0.45, 0.45, 0.4] },
  podium: 1,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});

/** The tenth echo (15.2), over the edge of the mountains by Pluto's heart, ECHO_TEN_OVER over their ground. */
const ECHO_TEN_X = -36000;
const ECHO_TEN_Z = 12000;
const ECHO_TEN_OVER = 1500;
export const ECHO_TEN = point(ECHO_TEN_X, plutoHeight(ECHO_TEN_X, ECHO_TEN_Z) + ECHO_TEN_OVER, ECHO_TEN_Z);

/** Wells (15.4): Nicole's escape gauge and orbit readout (see Module). */
const fitWells = (campaign: Campaign) => {
  if (!campaign.modules.includes('wells')) campaign.modules.push('wells');
};
/** Plating III (15.5): the plating's third step (see hullOf), at PLATING_THREE_PRICE. */
const fitPlatingThree = (campaign: Campaign) => {
  if (campaign.parts.includes('platingThree')) return;
  campaign.parts.push('platingThree');
  buy(campaign, PLATING_THREE_PRICE);
};

/**
 * Haumea's Ring (16.1): the depot crews' race between beacons in Haumea's ring, two laps of
 * HAUMEA_RINGS rings on an ellipse among the ring's ice; only first home wins.
 */
const HAUMEA_RINGS = 8;
export const HAUMEA_LAPS = 2;
const haumeaLoop = groundLoop(HAUMEA_RINGS, [0, 0], 46000, 36000, 0, () => 0);
export const HAUMEA_COURSE = haumeaLoop.course;
export const HAUMEA_START = haumeaLoop.start;
const haumeaRing = race({
  line: CAMPAIGN.haumeaRing,
  lost: CAMPAIGN.haumeaRingLost,
  arena: 'haumea',
  marks: HAUMEA_COURSE,
  laps: HAUMEA_LAPS,
  pipes: null,
  rivals: { names: ['Rime', 'Sleet', 'Hoar', 'Glaze', 'Floe'], skills: [0.6, 0.55, 0.5, 0.45, 0.45] },
  podium: 1,
  mark: msg('Lap {lap}/{laps} · ring {n}/{total}'),
});

/** Rung Two (16.2): a fuel barge of the depot's (an ice tug's build) from the far side of the field to the depot at Eris, two waves of scavengers on it. */
export const FUEL_FROM = point(48000, 2000, 36000);
const rungTwo = bargeRun({ line: CAMPAIGN.rungTwo, lost: CAMPAIGN.rungTwoLost, arena: 'eris', from: FUEL_FROM, to: DEPOT_AT, speed: 400, quiet: 20, count: 3, skills: [0.5, 0.55], names: ['Drift', 'Scree', 'Talus'], hold: 10000, hull: 400, kind: iceTug });

/** The Hunter (16.3): Perihelion (skill 0.7), the Ministry's hunter now, and two Navy fighters (0.5) at Eris; at 35 % of his hull he breaks off again. */
const hunter = duel({ line: CAMPAIGN.hunter, arena: 'eris', name: 'Perihelion', skill: 0.7, field: point(-10000, 0, 0), breakAt: 35, gone: point(-60000, 20000, 40000), breaks: CAMPAIGN.hunterBreaks, mark: msg('Perihelion · hull {hull} %'), escorts: { names: ['Lt. Ames', 'Ens. Kolb'], skill: 0.5 } });

/** Main drive III and Radiators III (16.4): each the hangar's third step (see hullOf), at DRIVE_THREE_PRICE each. */
const fitDriveThree = (campaign: Campaign) => {
  for (const part of ['driveThree', 'radiatorsThree'] as const) {
    if (campaign.parts.includes(part)) continue;
    campaign.parts.push(part);
    buy(campaign, DRIVE_THREE_PRICE);
  }
};

/** Plating II (10.2): the plating's second step (see hullOf), at PLATING_TWO_PRICE. */
const fitPlatingTwo = (campaign: Campaign) => {
  if (campaign.parts.includes('platingTwo')) return;
  campaign.parts.push('platingTwo');
  buy(campaign, PLATING_TWO_PRICE);
};

/**
 * Debt Day (4.2): Ma Tally's collectors, COLLECTORS of skill COLLECTOR_SKILL, come for the hull over
 * Phobos's grooves beyond Stickney's rim, fighting every ship they see (guards of the drill's
 * point, see Game.jumpers); COLLECTORS_DOWN of them shot down, and a Navy cutter hails (the next
 * lines): the debt is bought, and from then on the benefactor holds it (see Campaign.held).
 */
const COLLECTORS = 6;
const COLLECTOR_SKILL = 0.35;
const COLLECTORS_DOWN = 4;
const COLLECTOR_NAMES = ['Docket', 'Lien', 'Arrears', 'Escrow', 'Ledger', 'Tithe'];
const GROOVES = point(48000, phobosHeight(48000, 0) + 4000, 0);

const debtDay: Drill = {
  line: CAMPAIGN.debtDay,
  keys: ['turn', 'drive', 'fire'],
  arena: 'phobos',
  autopilot: false,
  music: 'fight',
  enter(ctx) {
    ctx.spawnJumpers(null, GROOVES, COLLECTORS, COLLECTOR_SKILL, COLLECTOR_NAMES, 12000, true);
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done: (ctx) => ctx.jumpersDown >= COLLECTORS_DOWN,
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => GROOVES,
  mark: (ctx) => t('Collectors down {n}/{needed}', { n: ctx.jumpersDown, needed: COLLECTORS_DOWN }),
};

/**
 * Groove Shoot (4.3): a camera drone of Lanes Watch films the hull flying a groove of the land
 * beyond Stickney's rim, under GROOVE_LOW (units, 60 m) over the ground and faster than
 * GROOVE_FAST (units/s, 20 m/s), for GROOVE_HOLD seconds without a break.
 */
const GROOVE_LOW = 1200;
const GROOVE_FAST = 400;
const GROOVE_HOLD = 30;
export const GROOVE_START = point(50000, phobosHeight(50000, -40000) + 800, -40000);

const grooveShoot: Drill = {
  line: CAMPAIGN.grooveShoot,
  keys: ['turn', 'drive', 'brake'],
  arena: 'phobos',
  autopilot: false,
  done(ctx, a) {
    const { position, velocity } = ctx.me.flight;
    const low = position.y - phobosHeight(position.x, position.z) < GROOVE_LOW;
    return holdFor(ctx, a, low && inGrooves(position.x, position.z) && velocity.length() > GROOVE_FAST, GROOVE_HOLD);
  },
  waypoint: (_, a) => (a.held > 0 ? null : GROOVE_START),
  mark: (ctx, a) => t('Low in a groove {seconds}/{needed} s · {meters} m over the ground', { seconds: Math.floor(a.held), needed: GROOVE_HOLD, meters: Math.round((ctx.me.flight.position.y - phobosHeight(ctx.me.flight.position.x, ctx.me.flight.position.z)) / 20) }),
};

/**
 * Pilot Episode (5.1): Lanes Watch's first show. The Tallyman Red Ledger and his two wingmen, of
 * skill BOUNTY_SKILL, fight every ship they see over Valhalla's craters (guards of BOUNTY_FIELD,
 * see Game.jumpers); Red Ledger shot down ends it, his wingmen only in the way.
 */
const BOUNTY_NAMES = ['Red Ledger', 'Carbon', 'Copy'];
const BOUNTY_SKILL = 0.4;
const BOUNTY_FIELD = point(-30000, callistoHeight(-30000, 20000) + 5000, 20000);

/** A bounty of Lanes Watch's at `arena`: raiders named `names` (the target first) of `skills`, guarding `field`, fighting every ship they see; the target shot down ends it. */
const bounty = (line: string, arena: ArenaId, field: THREE.Vector3, names: readonly string[], skills: number | readonly number[]): Drill => ({
  line,
  keys: ['turn', 'drive', 'fire'],
  arena,
  autopilot: false,
  music: 'fight',
  enter(ctx) {
    ctx.spawnJumpers(null, field, names.length, skills, names, 12000, true);
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done: (ctx) => ctx.leaderDown,
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => field,
  mark: () => t('Bounty: {name}', { name: names[0] }),
});

const pilotEpisode = bounty(CAMPAIGN.pilotEpisode, 'callisto', BOUNTY_FIELD, BOUNTY_NAMES, BOUNTY_SKILL);

/**
 * Last of the Tallymen (11.3): Ma Tally (skill LAST_TALLY_SKILL) and LAST_TALLY_ESCORTS escorts round her
 * last tug (see world/barge), moored over Iapetus's dark face; all of them shot down wins.
 */
const LAST_TALLY_SKILL = 0.55;
const LAST_TALLY_ESCORTS = 3;
const ESCORT_SKILL = 0.5;
const LAST_TALLY_FIELD = point(10000, -2000, -50000);
const TALLY_TUG_TURN = new THREE.Quaternion();
const LAST_TALLY_NAMES = ['Ma Tally', 'Docket', 'Lien', 'Escrow'];
const tallyBounty = bounty(CAMPAIGN.lastTallymen, 'iapetus', LAST_TALLY_FIELD, LAST_TALLY_NAMES, [LAST_TALLY_SKILL, ESCORT_SKILL]);
const lastTallymen: Drill = {
  ...tallyBounty,
  enter(ctx, a, markers) {
    tallyBounty.enter!(ctx, a, markers);
    markers.bargeAt(LAST_TALLY_FIELD.clone().setY(LAST_TALLY_FIELD.y - 3000), TALLY_TUG_TURN, tug);
  },
  done: (ctx) => ctx.jumpersDown > LAST_TALLY_ESCORTS,
  mark: (ctx) => t('Tallymen {n}/{total}', { n: ctx.jumpersDown, total: LAST_TALLY_ESCORTS + 1 }),
};

/**
 * Valhalla Sprint (5.3): SPRINT_COILS coils of the Ministry, which Lanes Watch leases for the show,
 * in a straight line across Valhalla's ridges along -x, SPRINT_GAP apart (units, 1 km), level at
 * SPRINT_OVER over the highest ground under the line; the clock starts at the first coil, and
 * every coil after it within SPRINT_TIME wins; each coil's core throws the ship on, a coil missed
 * starts it over.
 */
const SPRINT_COILS = 6;
const SPRINT_FROM = 62000;
const SPRINT_GAP = 20000;
const SPRINT_OVER = 2000;
export const SPRINT_TIME = 25;
const SPRINT_WAY = point(-1, 0, 0);
const SPRINT_HEIGHT = (() => {
  let highest = -Infinity;
  for (let x = -SPRINT_FROM; x <= SPRINT_FROM; x += 250) highest = Math.max(highest, callistoHeight(x, 0));
  return highest + SPRINT_OVER;
})();
export const SPRINT_COURSE = Array.from({ length: SPRINT_COILS }, (_, k) => point(SPRINT_FROM - (k + 1) * SPRINT_GAP, SPRINT_HEIGHT, 0));
export const SPRINT_START = { at: [SPRINT_FROM, SPRINT_HEIGHT, 0] as const, toward: [0, SPRINT_HEIGHT, 0] as const };

/**
 * A time trial through coils of the Ministry (Valhalla Sprint, Tiger Stripes): `points` flown in
 * order, each through its face along `normals`; the first counts only flown along its normal, so
 * a pilot coming back to start over turns first; the clock starts at the first coil, and every
 * coil after it within `time` wins; each coil's core throws the ship on along it, a coil missed
 * (`missed`) or the clock run out (`slow`) starts it over.
 */
function timeTrial(spec: { line: string; arena: ArenaId; points: readonly THREE.Vector3[]; normals: readonly THREE.Vector3[]; time: number; missed: string; slow: string }): Drill {
  return {
    line: spec.line,
    keys: ['drive', 'turn'],
    arena: spec.arena,
    music: 'fight',
    autopilot: true,
    enter(_, a, markers) {
      a.points = spec.points.map((coil) => coil.clone());
      a.normals = spec.normals.map((normal) => normal.clone());
      a.points.forEach((coil, i) => markers.ring(coil, a.normals[i]));
      markers.highlight(0);
    },
    done(ctx, a, markers) {
      if (a.next === 0 && ctx.me.flight.velocity.dot(a.normals[0]) <= 0) {
        a.side = NaN;
        return false;
      }
      const off = passRing(ctx, a);
      if (off === null) return false;
      if (off >= RING_RADIUS) {
        a.warned = true;
        return false;
      }
      markers.highlight(a.next);
      if (off < RING_RADIUS * CORE_SHARE) ctx.boost(a.normals[a.next - 1]);
      if (a.next === 1) a.clockFrom = a.seconds;
      return a.next >= a.points.length;
    },
    fail: (_, a) => (a.warned ? spec.missed : a.seconds - a.clockFrom > spec.time ? spec.slow : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => (Number.isFinite(a.clockFrom) ? t('Coil {n}/{total} · {seconds} s left', { n: a.next + 1, total: a.points.length, seconds: Math.max(0, Math.ceil(spec.time - (a.seconds - a.clockFrom))) }) : t('Coil {n}/{total}', { n: a.next + 1, total: a.points.length })),
  };
}

const valhallaSprint = timeTrial({ line: CAMPAIGN.valhallaSprint, arena: 'callisto', points: SPRINT_COURSE, normals: SPRINT_COURSE.map(() => SPRINT_WAY), time: SPRINT_TIME, missed: CAMPAIGN.valhallaSprintMissed, slow: CAMPAIGN.valhallaSprintSlow });

/** Radiators I (5.5): a tug yard's radiators of the first grade, a step up (see hullOf), at RADIATORS_PRICE. */
const fitRadiators = (campaign: Campaign) => {
  if (campaign.parts.includes('radiators')) return;
  campaign.parts.push('radiators');
  buy(campaign, RADIATORS_PRICE);
};

/**
 * Ice Run (5.2): a convoy of CONVOY ice tugs flies its lane across Valhalla, CONVOY_GAP apart,
 * at CONVOY_SPEED, level CONVOY_OVER over the highest ground under it, out of the arena towards
 * Ganymede. LOOSE_QUIET seconds in, LOOSE raiders of the Loose (skill LOOSE_SKILL) come for the
 * frontmost tug still free, holding LOOSE_HOLD off it; they never fire beams at a tug, only
 * harpoons (see Markers.hook), and they fight a ship that comes near. A harpooned tug is dragged
 * off its lane at DRAG while its raider lives and glides back once it is shot down; dragged
 * TUG_GONE off its lane, it is lost. The convoy at its lane's end with at most one tug lost wins;
 * a second lost fails it.
 */
const CONVOY = 3;
const CONVOY_GAP = 8000;
const CONVOY_SPEED = 600;
const CONVOY_OVER = 3000;
const CONVOY_FROM = point(-55000, 0, 25000);
const CONVOY_TO = point(55000, 0, -15000);
const CONVOY_WAY = new THREE.Vector3().subVectors(CONVOY_TO, CONVOY_FROM).normalize();
const CONVOY_LENGTH = CONVOY_FROM.distanceTo(CONVOY_TO);
const CONVOY_HEIGHT = (() => {
  let highest = -Infinity;
  for (let s = 0; s <= 1; s += 0.005) highest = Math.max(highest, callistoHeight(CONVOY_FROM.x + (CONVOY_TO.x - CONVOY_FROM.x) * s, CONVOY_FROM.z + (CONVOY_TO.z - CONVOY_FROM.z) * s));
  return highest + CONVOY_OVER;
})();
const CONVOY_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), CONVOY_WAY);
/** Sideways off the lane, the way a dragged tug goes (level, square to the lane). */
const CONVOY_SIDE = new THREE.Vector3(-CONVOY_WAY.z, 0, CONVOY_WAY.x);
const LOOSE = 4;
const LOOSE_SKILL = 0.45;
const LOOSE_HOLD = 5000;
const LOOSE_QUIET = 15;
/** The Loose's names, their own (never translated). */
const LOOSE_NAMES = ['Driftwood', 'Salvo', 'Magpie Jack', 'Lanyard'];
const DRAG = 300;
export const TUG_GONE = 16000;
/** A freed tug's way back to its lane: its offset shrinks by e every TUG_BACK seconds. */
const TUG_BACK = 4;
const waypointAt = new THREE.Vector3();
/** Each tug's offset from its lane and whether it is lost, for the running attempt. */
const convoyOff = Array.from({ length: CONVOY }, () => new THREE.Vector3());
const convoyLost: boolean[] = [];
const tugNow = new THREE.Vector3();

/** Where tug `index` would be on its lane `seconds` after the convoy set out, from its place in the line to the lane's end. */
export function convoyAt(index: number, seconds: number, out: THREE.Vector3): THREE.Vector3 {
  const along = Math.min(CONVOY_LENGTH, Math.max(0, seconds * CONVOY_SPEED - index * CONVOY_GAP));
  out.copy(CONVOY_FROM).addScaledVector(CONVOY_WAY, along);
  out.y = CONVOY_HEIGHT;
  return out;
}

/**
 * The tugs a drill escorts against the Loose, a step on (see Markers.hook): each held tug is
 * dragged off its lane at DRAG towards its raider's side, a lost one drifts on, a freed one
 * glides back; dragged TUG_GONE off its lane it is lost (`lost`, then `onLost`). `laneAt` says
 * where a tug would be on its lane now; each is posed turned by `turn`. The frontmost tug still
 * free, or null.
 */
function haul(markers: Markers, dt: number, count: number, laneAt: (i: number, out: THREE.Vector3) => THREE.Vector3, side: THREE.Vector3, turn: THREE.Quaternion, offs: THREE.Vector3[], lost: boolean[], onLost: () => void): THREE.Vector3 | null {
  let front: THREE.Vector3 | null = null;
  for (let i = 0; i < count; i++) {
    const raider = markers.hookedBy[i];
    if (raider && !raider.alive) markers.hookedBy[i] = null;
    const held = markers.hookedBy[i];
    const off = offs[i];
    if (held) off.addScaledVector(side, DRAG * dt * (laneAt(i, tugNow).sub(held.flight.position).dot(side) > 0 ? -1 : 1));
    else if (lost[i]) off.addScaledVector(side, DRAG * dt * (off.dot(side) < 0 ? -1 : 1));
    else off.multiplyScalar(exp(-dt / TUG_BACK));
    if (!lost[i] && off.length() > TUG_GONE) {
      lost[i] = true;
      onLost();
    }
    laneAt(i, tugNow).add(off);
    markers.iceTugAt(i, tugNow, turn);
    markers.tether(i, held ? held.flight.position : null);
    if (!front && !lost[i] && !held) front = tugNow.clone();
  }
  return front;
}

/**
 * What an escort against the Loose shares (Ice Run, Dose): its keys, no autopilot, the music
 * turning to the fight once they come (a.count), and its start: the hull stopped, no raiders and
 * no props yet, the radiators cold.
 */
const escort = (line: string, arena: ArenaId): Pick<Drill, 'line' | 'keys' | 'arena' | 'autopilot' | 'turn'> => ({ line, keys: ['turn', 'drive', 'fire'], arena, autopilot: false, turn: (_, a) => (a.count > 0 ? 'fight' : undefined) });
function startEscort(ctx: SchoolContext, a: Attempt, markers: Markers) {
  stop(ctx);
  ctx.removeJumpers();
  markers.clear();
  a.count = 0;
  ctx.me.heat = 0;
  ctx.me.overheated = false;
}
/** The seconds since the attempt's last step (kept in a.lastShot). */
function stepOf(a: Attempt): number {
  const dt = a.seconds - a.lastShot;
  a.lastShot = a.seconds;
  return dt;
}

const iceRun: Drill = {
  ...escort(CAMPAIGN.iceRun, 'callisto'),
  enter(ctx, a, markers) {
    startEscort(ctx, a, markers);
    convoyLost.length = 0;
    for (let i = 0; i < CONVOY; i++) {
      convoyOff[i].set(0, 0, 0);
      convoyLost.push(false);
      markers.iceTugAt(i, convoyAt(i, 0, tugNow), CONVOY_TURN);
    }
  },
  done(ctx, a, markers) {
    const dt = stepOf(a);
    const front = haul(markers, dt, CONVOY, (i, out) => convoyAt(i, a.seconds, out), CONVOY_SIDE, CONVOY_TURN, convoyOff, convoyLost, () => {
      if (convoyLost.filter(Boolean).length === 1) ctx.say([CAMPAIGN.iceRunTugLost]);
    });
    ctx.moveJumpers(front ?? convoyAt(0, a.seconds, tugNow));
    if (a.count === 0 && a.seconds >= LOOSE_QUIET) {
      ctx.spawnJumpers(null, front ?? tugNow, LOOSE, LOOSE_SKILL, LOOSE_NAMES, LOOSE_HOLD, false, true);
      a.count = 1;
    }
    const home = CONVOY_LENGTH + (CONVOY - 1) * CONVOY_GAP;
    return a.seconds * CONVOY_SPEED >= home && convoyLost.filter(Boolean).length <= 1;
  },
  fail: () => (convoyLost.filter(Boolean).length > 1 ? CAMPAIGN.iceRunLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: (_, a) => convoyAt(1, a.seconds, waypointAt).add(convoyOff[1]),
  mark: () => t('Tugs {n}/{total} · lost {lost}', { n: CONVOY - convoyLost.filter(Boolean).length, total: CONVOY, lost: convoyLost.filter(Boolean).length }),
};

/**
 * The Plume Yacht (10.1): Bellamy Crisp's yacht (see world/yacht) flies its lane across the tiger
 * stripes, YACHT_OVER over Enceladus's plain and through the plumes, at YACHT_SPEED. First the
 * show: ACTORS of Crisp's staged bandits, whose shots fly wide (see SchoolContext.blanks), for
 * STAGED seconds; then real raiders, RAIDERS of RAIDER_SKILL, shoot the actors down and go for the
 * yacht. All of them shot down wins; YACHT_HULL of their hits on the yacht fail it, and the
 * attempt starts over.
 */
const YACHT_OVER = 8000;
const YACHT_SPEED = 300;
const YACHT_REACH = 55000;
const YACHT_ACROSS = new THREE.Vector3(-STRIPE_WAY.z, 0, STRIPE_WAY.x);
export const YACHT_FROM = YACHT_ACROSS.clone().multiplyScalar(-YACHT_REACH).setY(ENCELADUS_LAND + YACHT_OVER);
export const YACHT_TO = YACHT_ACROSS.clone().multiplyScalar(YACHT_REACH).setY(ENCELADUS_LAND + YACHT_OVER);
const YACHT_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), YACHT_ACROSS);
const STAGED = 30;
const ACTORS = 3;
const ACTOR_SKILL = 0.35;
/** The actors' stage names, and the raiders' (never translated). */
const ACTOR_NAMES = ['Lance Steel', 'Rex Danger', 'Ace Hart'];
const RAIDERS = 3;
const RAIDER_SKILL = 0.65;
const RAIDER_NAMES = ['Spite', 'Hex', 'Cinder'];
const YACHT_HOLD = 8000;
const YACHT_HULL = 400;
const yachtNow = new THREE.Vector3();

/** Where the yacht is `seconds` after it set out, on its lane, stopped at its end. */
export function yachtAt(seconds: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(YACHT_FROM).addScaledVector(YACHT_ACROSS, Math.min(2 * YACHT_REACH, seconds * YACHT_SPEED));
}

const plumeYacht: Drill = {
  ...escort(CAMPAIGN.plumeYacht, 'enceladus'),
  // the show's calm until the raiders come, then the fight
  turn: (_, a) => (a.count > 1 ? 'fight' : undefined),
  enter(ctx, a, markers) {
    startEscort(ctx, a, markers);
    markers.bargeAt(yachtAt(0, yachtNow), YACHT_TURN, yacht);
    ctx.spawnJumpers(null, yachtNow, ACTORS, ACTOR_SKILL, ACTOR_NAMES, YACHT_HOLD);
    ctx.blanks();
    a.count = 1;
  },
  done(ctx, a, markers) {
    markers.bargeAt(yachtAt(a.seconds, yachtNow), YACHT_TURN, yacht);
    ctx.moveJumpers(yachtNow);
    if (a.count === 1 && a.seconds >= STAGED) {
      ctx.ambush(RAIDERS, RAIDER_SKILL, RAIDER_NAMES, YACHT_HOLD);
      ctx.say([CAMPAIGN.plumeYachtReal, CRISP.panic]);
      a.count = 2;
    }
    return a.count === 2 && ctx.jumpersDown >= RAIDERS;
  },
  fail: (ctx, a) => (a.count === 2 && ctx.rigWear >= YACHT_HULL ? CAMPAIGN.plumeYachtLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => yachtNow,
  mark: (ctx, a) => (a.count < 2 ? t('Yacht · on camera') : t('Raiders {n}/{total} · yacht hull {hull} %', { n: ctx.jumpersDown, total: RAIDERS, hull: Math.max(0, Math.round(100 * (1 - ctx.rigWear / YACHT_HULL))) })),
};

/**
 * Last Light (15.3): Patience moored where the Feeder convoy forms up (LAST_BERTH), PICKETS
 * Ministry pickets of PICKET_SKILL firing at her, holding PICKET_HOLD off; all of them down wins,
 * PATIENCE_HULL of their hits on her start it over.
 */
const LAST_BERTH = point(20000, -2000, -20000);
const PICKETS = 6;
const PICKET_SKILL = 0.55;
const PICKET_HOLD = 12000;
const PATIENCE_HULL = 500;
/** The pickets' names (never translated). */
const PICKET_NAMES = ['Warden 1', 'Warden 2', 'Warden 3', 'Warden 4', 'Warden 5', 'Warden 6'];
const lastLight: Drill = {
  ...escort(CAMPAIGN.lastLight, 'pluto'),
  turn: () => 'fight',
  enter(ctx, a, markers) {
    startEscort(ctx, a, markers);
    markers.hauler(LAST_BERTH);
    ctx.spawnJumpers(null, LAST_BERTH, PICKETS, PICKET_SKILL, PICKET_NAMES, PICKET_HOLD);
  },
  done: (ctx) => ctx.jumpersDown >= PICKETS,
  fail: (ctx) => (ctx.rigWear >= PATIENCE_HULL ? CAMPAIGN.lastLightLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => LAST_BERTH,
  mark: (ctx) => t('Pickets {n}/{total} · Patience {hull} %', { n: PICKETS - ctx.jumpersDown, total: PICKETS, hull: Math.max(0, Math.round(100 * (1 - ctx.rigWear / PATIENCE_HULL))) }),
};

/** Plating I (6.4): plating of the first grade, every hit hurting less (see hullOf), at PLATING_PRICE. */
const fitPlating = (campaign: Campaign) => {
  if (campaign.parts.includes('plating')) return;
  campaign.parts.push('plating');
  buy(campaign, PLATING_PRICE);
};

/**
 * Blackout (7.3): a sulfur freighter of Io's miners flies its lane straight through the flux
 * tube (FREIGHTER_FROM to FREIGHTER_TO) at FREIGHTER_SPEED, the hull escorting it, the link
 * crackling the nearer the tube (see fluxStatic). Where the lane comes nearest the tube's axis,
 * the link cuts (see SchoolContext.linkLost) for LINK_DARK seconds, and the drill ends there: the
 * next lines wake a new clone on Patience. It cannot fail.
 */
const FREIGHTER_SPEED = 400;
const FREIGHTER_FROM = point(-40000, IO_LAND + 5000, -40000);
const FREIGHTER_TO = point(44000, IO_LAND + 6000, 36000);
const FREIGHTER_WAY = new THREE.Vector3().subVectors(FREIGHTER_TO, FREIGHTER_FROM).normalize();
const FREIGHTER_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), FREIGHTER_WAY);
/** The share of its lane where the freighter comes nearest the tube's axis: where the link cuts. */
export const BLACKOUT_AT = (() => {
  const level = new THREE.Vector3(FREIGHTER_WAY.x, 0, FREIGHTER_WAY.z);
  const along = new THREE.Vector3(FLUX_AT.x - FREIGHTER_FROM.x, 0, FLUX_AT.z - FREIGHTER_FROM.z).dot(level) / level.lengthSq();
  return along / FREIGHTER_FROM.distanceTo(FREIGHTER_TO);
})();
const LINK_DARK = 5;
const freighterNow = new THREE.Vector3();

/** Where the freighter is `seconds` after it set out (into `out`), and the share of its lane flown. */
export function freighterAt(seconds: number, out: THREE.Vector3): number {
  const share = Math.min(1, (seconds * FREIGHTER_SPEED) / FREIGHTER_FROM.distanceTo(FREIGHTER_TO));
  out.lerpVectors(FREIGHTER_FROM, FREIGHTER_TO, share);
  return share;
}

const blackout: Drill = {
  line: CAMPAIGN.blackout,
  keys: ['turn', 'drive', 'brake'],
  arena: 'io',
  autopilot: false,
  enter(ctx, a, markers) {
    startEscort(ctx, a, markers);
    freighterAt(0, freighterNow);
    markers.iceTugAt(0, freighterNow, FREIGHTER_TURN, sulfurFreighter);
  },
  done(ctx, a, markers) {
    if (!Number.isNaN(a.doneAt)) return a.seconds >= a.doneAt;
    const share = freighterAt(a.seconds, freighterNow);
    markers.iceTugAt(0, freighterNow, FREIGHTER_TURN, sulfurFreighter);
    ctx.linkStatic(fluxStatic(ctx.me.flight.position));
    if (share >= BLACKOUT_AT) {
      ctx.linkLost(LINK_DARK);
      a.doneAt = a.seconds + LINK_DARK;
    }
    return false;
  },
  waypoint: (_, a) => (Number.isNaN(a.doneAt) ? freighterNow : null),
  mark: () => t('Freighter'),
};

/**
 * Hollow Jack (8.1): Lanes Watch's bounty on the chief of the Loose, among the blocks of ice of
 * Ganymede's tug yards: Jack (skill JACK_SKILL) and three of his raiders (LOOSE_SKILL), fighting
 * every ship they see; Jack shot down ends it. He is a stray: no Host, no printer, no next clone.
 */
const JACK_SKILL = 0.7;
const JACK_FIELD = point(-10000, 0, -15000);

const hollowJack = bounty(CAMPAIGN.hollowJack, 'ganymede', JACK_FIELD, ['Hollow Jack', ...LOOSE_NAMES.slice(0, 3)], [JACK_SKILL, LOOSE_SKILL]);

/**
 * The Harpoon (8.2): the piece of Jack's wreck that holds his harpoon drifts out of the yard,
 * from HARPOON_FROM along HARPOON_WAY at HARPOON_DRIFT; flown through within HARPOON_REACH, it is
 * the Magpie's (the hook, fitted for HOOK_PRICE); drifted out past HARPOON_GONE of the arena,
 * it is gone and the attempt starts over.
 */
const HARPOON_FROM = point(-8000, 0, -14000);
const HARPOON_WAY = new THREE.Vector3(-0.6, 0.1, -0.79).normalize();
const HARPOON_DRIFT = 300;
const HARPOON_REACH = 1000;
const HARPOON_GONE = 0.95;
const harpoonAt = new THREE.Vector3();

const harpoon: Drill = {
  line: CAMPAIGN.harpoon,
  keys: ['turn', 'drive', 'brake'],
  arena: 'ganymede',
  autopilot: true,
  enter(_, a, markers) {
    markers.clear();
    a.site.copy(HARPOON_FROM);
    a.points = [markers.harpoonPiece(HARPOON_FROM).position];
  },
  done(ctx, a) {
    harpoonAt.copy(a.site).addScaledVector(HARPOON_WAY, HARPOON_DRIFT * a.seconds);
    a.points[0].copy(harpoonAt);
    return ctx.me.flight.position.distanceTo(harpoonAt) < HARPOON_REACH;
  },
  fail: () => (harpoonAt.length() > ARENA_LIMIT * HARPOON_GONE ? CAMPAIGN.harpoonLost : null),
  waypoint: (_, a) => a.points[0] ?? null,
  mark: () => t('Harpoon'),
};

/** Swing Shift (8.3): the tug yard's drill with the new hook, the flight school's (see DRILL.hook), three times: hook a block of ice, swing round it, let go fast enough. */
const swingShift: Drill = { ...DRILL.hook, line: CAMPAIGN.swingShift, praise: undefined, arena: 'ganymede', reps: 3 };

/** The Harpoon: Jack's harpoon, fitted with a tug's winch as the Magpie's hook, at HOOK_PRICE. */
const fitHook = (campaign: Campaign) => {
  if (campaign.parts.includes('hook')) return;
  campaign.parts.push('hook');
  buy(campaign, HOOK_PRICE);
};

/** Tube Fitting (7.2): the first torpedo tube, one torpedo a clone (see hullOf), at TUBE_PRICE. */
const fitTube = (campaign: Campaign) => {
  if (campaign.parts.includes('tube')) return;
  campaign.parts.push('tube');
  buy(campaign, TUBE_PRICE);
};

/** Main Drive I (7.3): the main drive a step past a stock ship's (see hullOf), at DRIVE_ONE_PRICE. */
const fitDriveOne = (campaign: Campaign) => {
  if (campaign.parts.includes('driveOne')) return;
  campaign.parts.push('driveOne');
  buy(campaign, DRIVE_ONE_PRICE);
};

/** Pilot Episode: Nicole installs her radar (see Module). */
const fitRadar = (campaign: Campaign) => {
  if (!campaign.modules.includes('radar')) campaign.modules.push('radar');
};

/** Debt Day's end: the benefactor holds the debt, and nobody takes a cut from then on. */
const fitHeld = (campaign: Campaign) => {
  campaign.held = true;
};

/** The prize of the Peak Run, Pim's thruster parts: the thrusters rebuilt to stock, and with them the dodge. */
const fitThrusters = (campaign: Campaign) => {
  if (!campaign.parts.includes('thrusters')) campaign.parts.push('thrusters');
};

/**
 * Practice Log (2.5): before the mouth of a lit tunnel in a cut rock's face (the first claim with
 * one, see world/mining), the ship held within ECHO_REACH (units, 40 m) and slower than ECHO_STILL
 * (units/s, 2 m/s) for ECHO_HOLD seconds, so Nicole can listen to what is there: the first echo.
 */
const ECHO_REACH = 800;
const ECHO_STILL = 40;
const ECHO_HOLD = 3;

const practiceLog: Drill = {
  line: CAMPAIGN.practiceLog,
  keys: ['turn', 'drive', 'brake'],
  arena: 'rheasilvia',
  autopilot: false,
  enter(ctx, a, markers) {
    const tunnel = ctx.claims().find((claim) => claim.tunnel)?.tunnel;
    a.points = tunnel ? [tunnel.clone()] : [];
    markers.clear();
    if (tunnel) markers.zone(tunnel, ECHO_REACH);
  },
  done: (ctx, a) => !!a.points[0] && holdFor(ctx, a, ctx.me.flight.position.distanceTo(a.points[0]) < ECHO_REACH && ctx.me.flight.velocity.length() < ECHO_STILL, ECHO_HOLD),
  waypoint: (_, a) => a.points[0] ?? null,
  mark: () => t('Tunnel'),
};

/**
 * The launch ring (docs/campaign/STORY.md, "The gel of a nobody"): Patience lines up for the
 * ring that throws her to Vesta, and every body aboard gets the gel. The Host chooses: the gel,
 * long past its date, an agony of GEL_PAIN seconds over the link; or the self-destruct's button
 * held for CHOICE_HOLD seconds before the ring, the clone dead and the next printed by Patience's
 * printer after the boost, PRINT_DEBT coins more on the debt. Left alone for GEL_WAIT seconds,
 * it is the gel.
 */
const GEL_WAIT = 20;
const CHOICE_HOLD = 1.5;
const GEL_PAIN = 6;
const PRINT_DEBT = 2000;
/** How long the dead clone's link stays dark before the next one wakes (s). */
const REPRINT_SECONDS = 3;

const launchRing: Drill = {
  line: CAMPAIGN.gelChoice,
  keys: ['selfDestruct'],
  arena: 'rheasilvia',
  // the needle or the switch: no music over that choice
  music: null,
  enter(ctx, a) {
    stop(ctx);
    a.doneAt = NaN;
    a.warned = false;
  },
  done(ctx, a) {
    if (!Number.isNaN(a.doneAt)) return a.seconds >= a.doneAt;
    if (holdFor(ctx, a, ctx.selfDestructing, CHOICE_HOLD)) {
      // a.warned: the clone died for it
      a.warned = true;
      a.doneAt = a.seconds + REPRINT_SECONDS;
      ctx.crash();
      ctx.owe(PRINT_DEBT);
    } else if (a.seconds > GEL_WAIT) {
      a.doneAt = a.seconds + GEL_PAIN;
      ctx.agony(GEL_PAIN);
    }
    return false;
  },
  mark: (_, a) => (Number.isNaN(a.doneAt) ? t('Launch ring in {seconds} s', { seconds: Math.max(0, Math.ceil(GEL_WAIT - a.seconds)) }) : a.warned ? t('Clone lost · printing the next') : t('Gel · boost')),
};

/** A line said at Occator on Ceres (chapter 3), the hull held still. */
const onCeres = (line: string): Drill => ({ ...said(line, 'occator'), enter: (ctx) => stop(ctx) });

/**
 * Occator (3.0): down to the market terrace and before the mouth of the market's gallery in the
 * wall's first step, held within MARKET_REACH (units, 60 m) of its dock (see world/ceres) and
 * slower than MARKET_STILL (units/s, 2 m/s) for MARKET_HOLD seconds, so the dock takes the hull.
 */
const MARKET_REACH = 1200;
const MARKET_STILL = 40;
const MARKET_HOLD = 2;

const marketRun: Drill = {
  line: CAMPAIGN.market,
  keys: ['turn', 'drive', 'brake'],
  arena: 'occator',
  autopilot: true,
  enter(_, __, markers) {
    markers.clear();
    markers.zone(MARKET_DOCK, MARKET_REACH);
  },
  done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.position.distanceTo(MARKET_DOCK) < MARKET_REACH && ctx.me.flight.velocity.length() < MARKET_STILL, MARKET_HOLD),
  waypoint: () => MARKET_DOCK,
  mark: () => t('Market'),
};

/**
 * Surplus (3.1): the Navy surplus laser from Occator's market, the Games' own (see hullOf); what
 * the wallet holds of LASER_PRICE is paid, the rest put on the debt; and with it Nicole switches
 * on her targeting.
 */
const fitLaser = (campaign: Campaign) => {
  if (campaign.parts.includes('laser')) return;
  campaign.parts.push('laser');
  buy(campaign, LASER_PRICE);
  if (!campaign.modules.includes('targeting')) campaign.modules.push('targeting');
};

/**
 * Ore Barge (3.2): a Rockborn ore barge (see world/barge) flies its lane out of Occator, from
 * before the market over the terrace and out over the crater floor and up, at BARGE_SPEED (units/s, 20 m/s);
 * BARGE_QUIET seconds after it sets out the scrappers come, a wave of SCRAPPERS of skill
 * SCRAP_SKILL[0], and once they are down a second of SCRAP_SKILL[1], each holding SCRAP_HOLD
 * (units, 500 m) off the barge and firing at it until a ship comes near. The barge at its lane's
 * end with both waves down wins; BARGE_HULL of their hits on it fail it (three raiders left
 * alone land some four a second, so a wave left alone sinks it in a little over a minute), and
 * the attempt starts over.
 */
export const BARGE_FROM = onPlace(6000, 3600, 0);
export const BARGE_TO = onPlace(-60000, 14000, -20000);
const BARGE_SPEED = 400;
const BARGE_QUIET = 25;
const SCRAPPERS = 3;
const SCRAP_SKILL = [0.2, 0.3];
const SCRAP_HOLD = 10000;
const BARGE_HULL = 300;
/** The scrappers' names, the Rockborn's own (never translated). */
const SCRAP_NAMES = ['Rust', 'Grit', 'Slag'];
/**
 * A barge flown along its lane (`from` to `to`, at `speed`), waves of raiders firing at it: `quiet`
 * seconds after it sets out a wave of `count` of `skills[0]`, and once they are down one of each
 * skill after; each holds `hold` off the barge and fires at it until a ship comes near. The barge
 * at its lane's end with every wave down wins; `hull` of their hits on it fail it (`lost`), and
 * the attempt starts over. `kind` is its build (see world/barge).
 */
interface BargeRun {
  line: string;
  lost: string;
  arena: ArenaId;
  from: THREE.Vector3;
  to: THREE.Vector3;
  speed: number;
  quiet: number;
  count: number;
  skills: readonly number[];
  names: readonly string[];
  hold: number;
  hull: number;
  kind?: () => { root: THREE.Group; boxes: readonly HullBox[] };
}
const bargeNow = new THREE.Vector3();

/** Where a barge run's barge is `seconds` after it set out, on its lane, stopped at its end. */
function bargeAt(run: BargeRun, seconds: number, out: THREE.Vector3): THREE.Vector3 {
  const length = run.from.distanceTo(run.to);
  return out.lerpVectors(run.from, run.to, Math.min(1, (seconds * run.speed) / length));
}

function bargeRun(run: BargeRun): Drill {
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3().subVectors(run.to, run.from).normalize());
  const waves = run.skills.length;
  return {
    line: run.line,
    keys: ['turn', 'drive', 'fire'],
    arena: run.arena,
    autopilot: false,
    // the lane's calm until the raiders come, then the fight
    turn: (_, a) => (a.count > 0 ? 'fight' : undefined),
    enter(ctx, a, markers) {
      stop(ctx);
      ctx.removeJumpers();
      markers.clear();
      markers.bargeAt(run.from, turn, run.kind);
      // a.count: the waves sent; a.jinks: the hits of the waves before this one
      a.count = 0;
      a.jinks = 0;
      ctx.me.heat = 0;
      ctx.me.overheated = false;
    },
    done(ctx, a, markers) {
      bargeAt(run, a.seconds, bargeNow);
      markers.bargeAt(bargeNow, turn, run.kind);
      ctx.moveJumpers(bargeNow);
      if (a.count === 0 && a.seconds >= run.quiet) {
        ctx.spawnJumpers(null, bargeNow, run.count, run.skills[0], run.names, run.hold);
        a.count = 1;
      } else if (a.count > 0 && a.count < waves && ctx.jumpersDown >= run.count) {
        a.jinks += ctx.rigWear;
        ctx.spawnJumpers(null, bargeNow, run.count, run.skills[a.count], run.names, run.hold);
        a.count++;
      }
      return a.count >= waves && ctx.jumpersDown >= run.count && bargeNow.distanceTo(run.to) < 1;
    },
    fail: (ctx, a) => (a.jinks + ctx.rigWear >= run.hull ? run.lost : null),
    leave: (ctx) => ctx.removeJumpers(),
    waypoint: () => bargeNow,
    mark: (ctx, a) => t('Wave {n}/{waves} · barge hull {hull} %', { n: Math.max(1, a.count), waves, hull: Math.max(0, Math.round(100 * (1 - (a.jinks + ctx.rigWear) / run.hull))) }),
  };
}

const oreBarge = bargeRun({ line: CAMPAIGN.oreBarge, lost: CAMPAIGN.oreBargeLost, arena: 'occator', from: BARGE_FROM, to: BARGE_TO, speed: BARGE_SPEED, quiet: BARGE_QUIET, count: SCRAPPERS, skills: SCRAP_SKILL, names: SCRAP_NAMES, hold: SCRAP_HOLD, hull: BARGE_HULL });

/**
 * Repo Men (3.3): the Tallymen, who hold the debt, come for the hull. Their tug (see world/barge)
 * lies at TUG_AT over the crater; HARPOON_AFTER seconds in, its harpoon bites the hull and its
 * winch reels it in at REEL (units/s, 12 m/s): the cable is as long as the way was and shortens,
 * and the hull is held on it, whatever its drive does. TALLYMEN guards of TALLY_SKILL fight round
 * the tug. The hull breaks free with WINCH_HITS of its beams on the winch (the cable snaps) or
 * TALLY_DOWN of the guards shot down (they give up); reeled within TUG_CATCH (units, 100 m) of the
 * winch, it is theirs, and the attempt starts over.
 */
const TUG_AT = onPlace(-40000, 12000, -26000);
const TUG_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3().subVectors(onPlace(-30000, 2000, 0), TUG_AT).normalize());
const HARPOON_AFTER = 4;
const REEL = 240;
const TALLYMEN = 4;
const TALLY_SKILL = 0.3;
const TALLY_HOLD = 8000;
const WINCH_HITS = 12;
const TALLY_DOWN = 3;
const TUG_CATCH = 2000;
/** The Tallymen's names, the firm's own (never translated). */
const TALLY_NAMES = ['Docket', 'Lien', 'Arrears', 'Escrow'];
const winchNow = new THREE.Vector3();
const reeled = new THREE.Vector3();

const repoMen: Drill = {
  line: CAMPAIGN.repoMen,
  keys: ['turn', 'drive', 'fire'],
  arena: 'occator',
  autopilot: false,
  music: 'fight',
  enter(ctx, a, markers) {
    markers.clear();
    markers.tugAt(TUG_AT, TUG_TURN);
    ctx.spawnJumpers(null, TUG_AT, TALLYMEN, TALLY_SKILL, TALLY_NAMES, TALLY_HOLD, true);
    // a.reach: the cable's length (0 while the harpoon has not bitten)
    a.reach = 0;
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done(ctx, a, markers) {
    // a.count: the Host's beams on the winch so far
    a.count = markers.winchHits;
    if (a.count >= WINCH_HITS || ctx.jumpersDown >= TALLY_DOWN) {
      markers.cable(null);
      return true;
    }
    if (!markers.winchAt(winchNow)) return false;
    const flight = ctx.me.flight;
    if (a.reach === 0 && a.seconds >= HARPOON_AFTER) a.reach = flight.position.distanceTo(winchNow);
    if (a.reach > 0) {
      // the winch reels in; the hull is held on the cable, its way outwards taken off
      a.reach = Math.max(0, a.reach - REEL * ctx.dt);
      reeled.subVectors(flight.position, winchNow);
      const distance = reeled.length();
      if (distance > a.reach && distance > 0) {
        reeled.divideScalar(distance);
        flight.position.copy(winchNow).addScaledVector(reeled, a.reach);
        const outward = flight.velocity.dot(reeled);
        if (outward > -REEL) flight.velocity.addScaledVector(reeled, -REEL - outward);
      }
      markers.cable(flight.position);
    }
    return false;
  },
  fail: (ctx) => (ctx.me.flight.position.distanceTo(winchNow) < TUG_CATCH ? CAMPAIGN.repoMenCaught : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => winchNow,
  mark: (ctx, a) => (a.reach > 0 ? t('Winch {hits}/{needed} · down {n}/{down} · cable {meters} m', { hits: a.count, needed: WINCH_HITS, n: ctx.jumpersDown, down: TALLY_DOWN, meters: Math.round(a.reach / 20) }) : t('Tug')),
};

/**
 * Wall Run (3.4): Hedda's barge of Rockborn refugees (the barge of world/barge) follows the
 * hull's way, FOLLOW (units, 400 m) behind it at most at FOLLOW_SPEED (units/s, 25 m/s), from
 * before the Solar Wall over its top edge (see world/wall). The searchlights see it, bow, middle
 * or stern, once their cones have held it SEEN_HOLD seconds, adding up while it is lit and
 * fading at half that pace while it is not; seen SEEN_MAX times fails it. Beyond the wall by
 * WALL_CLEAR (units, 1 km) it is through.
 */
const FOLLOW = 8000;
const FOLLOW_SPEED = 500;
const SEEN_HOLD = 3;
const SEEN_MAX = 2;
const WALL_CLEAR = 20000;
/** The hull's way as the barge follows it: a point every TRAIL_STEP (units, 20 m) it has flown. */
const TRAIL_STEP = 400;
const RUN_FROM = point(-48000, 0, 0);
const runBarge = new THREE.Vector3();
const runWay = new THREE.Vector3();
const runTurn = new THREE.Quaternion();
const BOW = new THREE.Vector3(-1, 0, 0);

const wallRun: Drill = {
  line: CAMPAIGN.wallRun,
  keys: ['turn', 'drive', 'brake'],
  arena: 'wall',
  autopilot: true,
  enter(ctx, a, markers) {
    markers.clear();
    runBarge.copy(RUN_FROM);
    runWay.set(1, 0, 0);
    runTurn.setFromUnitVectors(BOW, runWay);
    markers.bargeAt(runBarge, runTurn);
    // a.points: the hull's way; a.held: the barge's time in a light; a.count: how often it was seen
    a.points = [ctx.me.flight.position.clone()];
    a.count = 0;
    a.lastShot = 0;
  },
  done(ctx, a, markers) {
    const flight = ctx.me.flight;
    if (flight.position.distanceTo(a.points[a.points.length - 1]) > TRAIL_STEP) a.points.push(flight.position.clone());
    // the barge along the way, never nearer the hull than FOLLOW
    let moved = FOLLOW_SPEED * ctx.dt;
    while (moved > 0 && a.points.length > 1 && runBarge.distanceTo(flight.position) > FOLLOW) {
      const next = a.points[0];
      const gap = runBarge.distanceTo(next);
      if (gap <= moved) {
        runBarge.copy(next);
        a.points.shift();
        moved -= gap;
      } else {
        runWay.subVectors(next, runBarge).normalize();
        runBarge.addScaledVector(runWay, moved);
        runTurn.setFromUnitVectors(BOW, runWay);
        moved = 0;
      }
    }
    markers.bargeAt(runBarge, runTurn);
    // the lights that hold it (bow, middle or stern) long enough see it; then it has a moment to get out of them
    const lit = hullInLight(runBarge, runWay, ctx.field.clock) && a.seconds >= a.lastShot;
    a.held = lit ? a.held + ctx.dt : Math.max(0, a.held - ctx.dt / 2);
    if (a.held >= SEEN_HOLD) {
      a.count++;
      a.held = 0;
      a.lastShot = a.seconds + SEEN_HOLD;
      if (a.count < SEEN_MAX) ctx.say([CAMPAIGN.wallRunSeen]);
    }
    return runBarge.x > WALL_CLEAR;
  },
  fail: (_, a) => (a.count >= SEEN_MAX ? CAMPAIGN.wallRunLost : null),
  waypoint: () => runBarge,
  mark: (_, a) => t('Barge · seen {n}/{max}', { n: a.count, max: SEEN_MAX }),
};

/**
 * Scout Two (3.5): Pim grinds the depot's grey off and the scout's old livery shows under it (see
 * Perks.stripped); then the second echo, from the wall's second step under the neon NO WALL IN
 * SPACE: the hull held before it, within ECHO_REACH and slower than ECHO_STILL for ECHO_HOLD seconds.
 */
export const ECHO_TWO = onPlace(stepFace(2) - 1200, stepTop(1) + (stepTop(2) - stepTop(1)) * 0.7, -7000);

/** An echo at a fixed place (`at`, at the place `arena`): Nicole's `call` to it, the hull held there within ECHO_REACH and slower than ECHO_STILL for ECHO_HOLD seconds. */
const echoAt = (call: string, arena: ArenaId, at: THREE.Vector3): Drill => ({
  line: call,
  keys: ['turn', 'drive', 'brake'],
  arena,
  autopilot: true,
  enter(_, __, markers) {
    markers.clear();
    markers.zone(at, ECHO_REACH);
  },
  done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.position.distanceTo(at) < ECHO_REACH && ctx.me.flight.velocity.length() < ECHO_STILL, ECHO_HOLD),
  waypoint: () => at,
  mark: () => t('Signal'),
});

const echoTwo = echoAt(CAMPAIGN.echoTwoCall, 'occator', ECHO_TWO);

/**
 * Geyser Field (14.1): a time trial from the field's south-east to the Memorial Station through
 * GEYSER_COILS coils of the Navy, each beside a geyser on the way, GEYSER_OFF from its axis
 * (units, 200 m: the coil's rim passes just outside the column), GEYSER_OVER over the plain; a
 * geyser's column throws a ship up (see Column); the clock starts at the first coil.
 */
const GEYSER_FROM = point(48000, TRITON_LAND + 3000, 36000);
const GEYSER_OFF = GEYSER_RADIUS + 2400;
const GEYSER_OVER = 3000;
export const GEYSER_TIME = 60;
const GEYSER_WAY = new THREE.Vector3().subVectors(MEMORIAL_AT, GEYSER_FROM).setY(0).normalize();
const GEYSER_SIDE = new THREE.Vector3(-GEYSER_WAY.z, 0, GEYSER_WAY.x);
/** The geysers on the way, in the order the way passes them: those within GEYSER_LANE of its line (units, 1.5 km). */
const GEYSER_LANE = 30000;
const GEYSER_LENGTH = GEYSER_FROM.clone().setY(0).distanceTo(MEMORIAL_AT.clone().setY(0));
export const GEYSER_COURSE = (() => {
  const along = (p: THREE.Vector3) => new THREE.Vector3().subVectors(p, GEYSER_FROM).setY(0).dot(GEYSER_WAY);
  const across = (p: THREE.Vector3) => new THREE.Vector3().subVectors(p, GEYSER_FROM).setY(0).dot(GEYSER_SIDE);
  const passed = GEYSERS_AT.filter((g) => along(g) > 8000 && along(g) < GEYSER_LENGTH - 8000 && Math.abs(across(g)) < GEYSER_LANE).sort((a, b) => along(a) - along(b));
  // each coil on the line's side of its geyser, the column just outside its rim
  const coils = passed.map((g) => g.clone().addScaledVector(GEYSER_SIDE, across(g) > 0 ? -GEYSER_OFF : GEYSER_OFF).setY(TRITON_LAND + GEYSER_OVER));
  // and the last before the station
  coils.push(MEMORIAL_AT.clone().addScaledVector(GEYSER_WAY, -6000).setY(TRITON_LAND + GEYSER_OVER));
  return coils;
})();
export const GEYSER_NORMALS = GEYSER_COURSE.map((coil, i) => coil.clone().sub(i ? GEYSER_COURSE[i - 1] : GEYSER_FROM).setY(0).normalize());
export const GEYSER_START = { at: [GEYSER_FROM.x, GEYSER_FROM.y, GEYSER_FROM.z] as const, toward: [GEYSER_COURSE[0].x, GEYSER_COURSE[0].y, GEYSER_COURSE[0].z] as const };

const geyserField = timeTrial({ line: CAMPAIGN.geyserField, arena: 'triton', points: GEYSER_COURSE, normals: GEYSER_NORMALS, time: GEYSER_TIME, missed: CAMPAIGN.geyserFieldMissed, slow: CAMPAIGN.geyserFieldSlow });

/**
 * The Memorial (14.3): the ninth echo before the Derelict's bow, in the gap where it tore (ECHO_NINE, 300 m off its torn end), the hull
 * held still there while a Navy guard of GUARDS at GUARD_SKILL fights it; Grave Shift (14.4): the
 * guard on the hull's tail, out to the arena's edge (within EDGE_SHARE of ARENA_LIMIT).
 */
export const ECHO_NINE = point(-8000, 0, 0);
const GUARDS = 4;
const GUARD_SKILL = 0.5;
const GUARD_NAMES = ['Lt. Hale', 'Ens. Dorn', 'Ens. Pike', 'Lt. Wen'];
const EDGE_SHARE = 0.92;
const memorialEcho = echoAt(CAMPAIGN.memorial, 'derelict', ECHO_NINE);
const theMemorial: Drill = {
  ...memorialEcho,
  keys: ['turn', 'drive', 'brake', 'fire'],
  music: 'fight',
  enter(ctx, a, markers) {
    memorialEcho.enter!(ctx, a, markers);
    ctx.spawnJumpers(null, ECHO_NINE, GUARDS, GUARD_SKILL, GUARD_NAMES, 10000, true);
  },
  leave: (ctx) => ctx.removeJumpers(),
};
const graveShift: Drill = {
  line: CAMPAIGN.graveShift,
  keys: ['turn', 'drive', 'overdrive'],
  arena: 'derelict',
  autopilot: false,
  music: 'fight',
  enter(ctx) {
    ctx.spawnJumpers(null, ctx.me.flight.position.clone(), GUARDS, GUARD_SKILL, GUARD_NAMES, 6000, true);
  },
  done: (ctx) => ctx.me.flight.position.length() > ARENA_LIMIT * EDGE_SHARE,
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: (ctx) => ctx.me.flight.position.clone().setLength(ARENA_LIMIT),
  mark: (ctx) => t('Edge · {meters} m', { meters: Math.max(0, Math.round((ARENA_LIMIT * EDGE_SHARE - ctx.me.flight.position.length()) * 0.05)) }),
};

/** Thrusters III (14.5): the thrusters' third step (see hullOf), at THRUSTERS_THREE_PRICE. */
const fitThrustersThree = (campaign: Campaign) => {
  if (campaign.parts.includes('thrustersThree')) return;
  campaign.parts.push('thrustersThree');
  buy(campaign, THRUSTERS_THREE_PRICE);
};

/**
 * The Ridge (11.1): the eighth echo, from a cache on Iapetus's ridge (see world/iapetus), the hull
 * held ECHO_EIGHT_OVER over the crest at x ECHO_EIGHT_X; WINGMEN_AFTER seconds in, two of Spare's
 * strays (WINGMEN of WINGMAN_SKILL) set out for it from the ridge's far end, fighting a ship that
 * comes near them; one of them there first (within ECHO_REACH) starts it over.
 */
const ECHO_EIGHT_X = -45000;
const ECHO_EIGHT_OVER = 1000;
export const ECHO_EIGHT = point(ECHO_EIGHT_X, iapetusHeight(ECHO_EIGHT_X, crestZ(ECHO_EIGHT_X)) + ECHO_EIGHT_OVER, crestZ(ECHO_EIGHT_X));
const WINGMEN_AFTER = 8;
const WINGMAN_SKILL = 0.45;
/** Spare's strays (never translated). */
const WINGMEN = ['Fade', 'Mute'];
const WINGMEN_FROM = point(60000, 0, -30000);
const ridgeEcho = echoAt(CAMPAIGN.theRidge, 'iapetus', ECHO_EIGHT);
const theRidge: Drill = {
  ...ridgeEcho,
  keys: ['turn', 'drive', 'brake', 'fire'],
  enter(ctx, a, markers) {
    ridgeEcho.enter!(ctx, a, markers);
    ctx.removeJumpers();
    a.count = 0;
  },
  done(ctx, a, markers) {
    if (a.count === 0 && a.seconds >= WINGMEN_AFTER) {
      ctx.spawnJumpers(null, WINGMEN_FROM, WINGMEN.length, WINGMAN_SKILL, WINGMEN, 2000);
      ctx.standDown(ECHO_EIGHT);
      a.count = 1;
    }
    return ridgeEcho.done!(ctx, a, markers);
  },
  fail: (ctx, a) => (a.count === 1 && ctx.jumperNear(ECHO_EIGHT, ECHO_REACH) ? CAMPAIGN.theRidgeLost : null),
  leave: (ctx) => ctx.removeJumpers(),
};

/**
 * Callisto Echo (5.4): the third echo, from the Navy's old listening post among Valhalla's
 * craters (see world/callisto), the hull held ECHO_THREE_OVER over the dish.
 */
const ECHO_THREE_OVER = 1000;
export const ECHO_THREE = point(POST_AT.x + 560, POST_AT.y + POST_HALF.y + ECHO_THREE_OVER, POST_AT.z);
const echoThree = echoAt(CAMPAIGN.echoThreeCall, 'callisto', ECHO_THREE);

/**
 * Under the Lineae (6.2): down into Europa's Crack, 200 m between its walls, to the science
 * station on its floor 800 m below the plain (see world/europa), the hull held ECHO_FOUR_OVER
 * over its dish: the fourth echo, in which Nicole hears her own name.
 */
const ECHO_FOUR_OVER = 1000;
const STATION = stationPlacement(0, POST_HALF).position;
// the station is turned along the Crack: its dish stands 28 m along -z from its middle
export const ECHO_FOUR = point(STATION.x, STATION.y + POST_HALF.y + ECHO_FOUR_OVER, STATION.z - 560);
const echoFour = echoAt(CAMPAIGN.echoFourCall, 'europa', ECHO_FOUR);

/**
 * Dose (6.1): an ice tanker climbs out of Europa's Crack and away through Jupiter's radiation
 * belt, on its lane (TANKER_LANE) at TANKER_SPEED. The clone takes a dose wherever it flies over
 * the ice, the more the higher: none in the Crack, whose ice shields it, the full rate from
 * BELT_RISE (units, 300 m) over the plain on; DOSE_SECONDS at the full rate fill the dose, and
 * a full dose is more than a clone can take. Once the tanker is out of the Crack, TANKER_RAIDERS
 * of the Loose come for it with their harpoons (see haul); dragged off its lane it is lost.
 */
const TANKER_SPEED = 500;
const BELT_RISE = 6000;
const DOSE_SECONDS = 150;
/** At this share of the dose Nicole warns. */
const DOSE_WARN = 0.75;
const TANKER_RAIDERS = 3;
/** The tanker's lane: along the Crack 500 m below the plain, climbing out of it, and away over the ice into the belt. */
const TANKER_LANE: THREE.Vector3[] = [
  ...Array.from({ length: 10 }, (_, k) => point(crackMiddle(30000 - k * 3000), EUROPA_LAND - 10000, 30000 - k * 3000)),
  point(crackMiddle(-3000), EUROPA_LAND - 3000, -3000),
  point(crackMiddle(-6000), EUROPA_LAND + 7000, -6000),
  point(20000, EUROPA_LAND + 10000, -30000),
  point(45000, EUROPA_LAND + 12000, -45000),
];
/** Where the lane leaves the Crack: the Loose come once the tanker is past it. */
const TANKER_OUT = 11;
const laneLengths = TANKER_LANE.map((p, i) => (i === 0 ? 0 : p.distanceTo(TANKER_LANE[i - 1])));
const laneTotal = laneLengths.reduce((sum, length) => sum + length, 0);
const tankerTurn = new THREE.Quaternion();
const tankerSide = new THREE.Vector3();
const tankerOff = [new THREE.Vector3()];
const tankerLost = [false];

/** Where the tanker is `seconds` after it set out, along its lane (into `out`), and the leg it flies (its index into TANKER_LANE's points, from 1). */
export function tankerAt(seconds: number, out: THREE.Vector3): number {
  let along = Math.min(laneTotal, seconds * TANKER_SPEED);
  for (let i = 1; i < TANKER_LANE.length; i++) {
    if (along <= laneLengths[i] || i === TANKER_LANE.length - 1) {
      out.lerpVectors(TANKER_LANE[i - 1], TANKER_LANE[i], Math.min(1, along / laneLengths[i]));
      return i;
    }
    along -= laneLengths[i];
  }
  return TANKER_LANE.length - 1;
}

/** The share of a full dose a clone at `position` takes a second (see Dose). */
export const doseRate = (position: THREE.Vector3) => Math.min(1, Math.max(0, (position.y - EUROPA_LAND) / BELT_RISE)) / DOSE_SECONDS;

const doseRun: Drill = {
  ...escort(CAMPAIGN.dose, 'europa'),
  enter(ctx, a, markers) {
    startEscort(ctx, a, markers);
    tankerOff[0].set(0, 0, 0);
    tankerLost[0] = false;
    a.told = false;
    a.warned = false;
  },
  done(ctx, a, markers) {
    const dt = stepOf(a);
    const leg = tankerAt(a.seconds, tugNow);
    tankerSide.subVectors(TANKER_LANE[leg], TANKER_LANE[leg - 1]).normalize();
    tankerTurn.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), tankerSide);
    tankerSide.set(-tankerSide.z, 0, tankerSide.x).normalize();
    const onLane = (_: number, out: THREE.Vector3) => {
      tankerAt(a.seconds, out);
      return out;
    };
    // the Loose go for the tanker where it is, on its cable or not (haul leaves it in tugNow)
    haul(markers, dt, 1, onLane, tankerSide, tankerTurn, tankerOff, tankerLost, () => undefined);
    ctx.moveJumpers(tugNow);
    if (a.count === 0 && leg > TANKER_OUT) {
      ctx.spawnJumpers(null, tugNow, TANKER_RAIDERS, LOOSE_SKILL, LOOSE_NAMES, LOOSE_HOLD, false, true);
      a.count = 1;
    }
    // the dose, as long as the clone lives; a full one is more than it can take
    if (ctx.me.alive) a.taken = Math.min(1, a.taken + doseRate(ctx.me.flight.position) * dt);
    if (a.taken >= DOSE_WARN && !a.told) {
      a.told = true;
      ctx.say([CAMPAIGN.doseHigh]);
    }
    if (a.taken >= 1 && !a.warned) {
      a.warned = true;
      ctx.agony(3);
    }
    return !a.warned && !tankerLost[0] && a.seconds * TANKER_SPEED >= laneTotal;
  },
  fail: (_, a) => (a.warned ? CAMPAIGN.doseFull : tankerLost[0] ? CAMPAIGN.doseLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: (_, a) => {
    tankerAt(a.seconds, waypointAt);
    return waypointAt.add(tankerOff[0]);
  },
  mark: (_, a) => t('Tanker · dose {dose} %', { dose: Math.floor(a.taken * 100) }),
};

/**
 * The Quiet Man (6.3): a raider of the Loose (skill QUIET_SKILL) who fights the hull over the
 * ice and never finishes a clone (see SchoolContext.spareClones). QUIET_DUEL seconds into the
 * fight, or once he has worn the hull down to SPARED (of 100), he turns away and flies off to
 * QUIET_GONE: shot down, he pays the full ratings; once within QUIET_REACH of it he is gone, let
 * go, and the campaign remembers it (Choice 'quietManSpared'), for fewer ratings.
 */
const QUIET_SKILL = 0.5;
const QUIET_DUEL = 40;
const SPARED = 30;
const QUIET_FIELD = point(35000, EUROPA_LAND + 6000, -20000);
const QUIET_GONE = point(-50000, EUROPA_LAND + 8000, 30000);
const QUIET_REACH = 6000;
/** How long the outcome's line has before the drill ends (s). */
const QUIET_AFTER = 4;
const QUIET_RATINGS = 250;
const QUIET_SPARED_RATINGS = 100;

const quietMan: Drill = {
  line: CAMPAIGN.quietMan,
  keys: ['turn', 'drive', 'fire'],
  arena: 'europa',
  autopilot: false,
  music: 'fight',
  enter(ctx, a) {
    ctx.spawnJumpers(null, QUIET_FIELD, 1, QUIET_SKILL, ['The Quiet Man'], 12000, true);
    ctx.spareClones();
    ctx.me.heat = 0;
    ctx.me.overheated = false;
    // a.count: 0 fighting, 1 turned away; a.doneAt: when the drill ends, its outcome said
    a.count = 0;
  },
  done(ctx, a) {
    if (!Number.isNaN(a.doneAt)) return a.seconds >= a.doneAt;
    if (ctx.leaderDown) {
      ctx.say([CAMPAIGN.quietManShot]);
      a.doneAt = a.seconds + QUIET_AFTER;
    } else if (a.count === 0 && (a.seconds >= QUIET_DUEL || ctx.me.hull <= SPARED)) {
      a.count = 1;
      ctx.standDown(QUIET_GONE);
      ctx.say([CAMPAIGN.quietManTurns]);
    } else if (a.count === 1 && ctx.jumperNear(QUIET_GONE, QUIET_REACH)) {
      ctx.choose('quietManSpared');
      ctx.removeJumpers();
      ctx.say([CAMPAIGN.quietManGone]);
      a.doneAt = a.seconds + QUIET_AFTER;
    }
    return false;
  },
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => null,
  mark: (_, a) => (a.count === 0 ? t('The Quiet Man') : t('The Quiet Man · turned away')),
};

/** Dose: Nicole installs her threat warnings (see Module). */
const fitThreat = (campaign: Campaign) => {
  if (!campaign.modules.includes('threat')) campaign.modules.push('threat');
};

/** Pays a part's price from the wallet as far as it holds, the rest put on the debt (the laser, the overhaul). */
const buy = (campaign: Campaign, price: number) => {
  const paid = Math.min(campaign.coins, price);
  campaign.coins -= paid;
  campaign.bond += price - paid;
};

/** Overhaul (3.6): the drive's cracked bell replaced by one of Rockborn make, the main drive to stock (see hullOf), at OVERHAUL_PRICE. */
const fitDrive = (campaign: Campaign) => {
  if (campaign.parts.includes('drive')) return;
  campaign.parts.push('drive');
  buy(campaign, OVERHAUL_PRICE);
};

/** The Stickney Grand: Nicole installs her racing line (see Module). */
const fitRacingLine = (campaign: Campaign) => {
  if (!campaign.modules.includes('racingLine')) campaign.modules.push('racingLine');
};

/** Armor Panels (4.4): the bare left flank closed (see Perks.bareFlank), at PANELS_PRICE. */
const fitPanels = (campaign: Campaign) => {
  if (campaign.parts.includes('panels')) return;
  campaign.parts.push('panels');
  buy(campaign, PANELS_PRICE);
};

const fitStripped = (campaign: Campaign) => {
  if (!campaign.parts.includes('stripped')) campaign.parts.push('stripped');
};

/** The missions in the order the story runs them. */
export const MISSIONS: readonly Mission[] = [
  {
    // the first link into the hull in rack 7731: Nicole boots and crashes, the yardmaster calls,
    // and the hull flies out of the rack, down the lane and into the depot's bay
    id: 'coldBoot',
    name: msg('Cold Boot'),
    drills: [
      said(CAMPAIGN.bootHello),
      crash,
      said(CAMPAIGN.bootAgain),
      said(CAMPAIGN.bootLink),
      said(CAMPAIGN.bootName),
      crash,
      said(CAMPAIGN.bootThird),
      said(CAMPAIGN.bootSorry),
      said(RASK.wake),
      said(RASK.deal),
      said(RASK.memory),
      said(RASK.come),
      said(CAMPAIGN.dislike),
      approach,
      slowDown,
      dock,
      said(CAMPAIGN.docked),
      rask(RASK.docked),
      rask(PIM.meet),
    ],
    pay: 0,
    fit: fitPatch,
  },
  { id: 'lamplighter', name: msg('Lamplighter'), drills: [rask(RASK.lamplighter), lamplighter, said(CAMPAIGN.lamplighterDone)], pay: 150, ratings: 10, start: ON_PAD },
  { id: 'liveTarget', name: msg('Live Target'), drills: [rask(RASK.liveTarget), liveTarget, said(CAMPAIGN.liveTargetDone)], pay: 300, ratings: 15, start: ON_PAD },
  { id: 'canisterSweep', name: msg('Canister Sweep'), drills: [rask(RASK.canisterSweep), canisterSweep, said(CAMPAIGN.canisterSweepDone)], pay: 200, ratings: 10, start: ON_PAD },
  { id: 'cutter', name: msg('The Cutter'), drills: [rask(RASK.cutter), rask(PIM.cutter), rask(CAMPAIGN.cutterFitted)], pay: 0, fit: fitCutter, start: ON_PAD },
  { id: 'firstCut', name: msg('First Cut'), drills: [rask(RASK.firstCut), firstCut, said(CAMPAIGN.firstCutDone), rask(PIM.magpie)], pay: 400, ratings: 20, start: ON_PAD },
  { id: 'dockingLane', name: msg('Docking Lane'), drills: [rask(RASK.dockingLane), dockingLane, said(CAMPAIGN.dockingLaneDone), climbOut('office', msg("The canopy opens. Your clone climbs out and takes the lift up to Rask's office.")), rask(RASK.dockingLaneDone), felt(CAMPAIGN.handshake), rask(HEDDA.meet)], pay: 600, ratings: 40, start: ON_PAD },
  // chapter 2, Rheasilvia on Vesta: Patience brings the Host to the Rockborn's claims, and Pim gives Nicole a voice board
  {
    id: 'rheasilvia',
    name: msg('Rheasilvia'),
    // Patience holds over the claims; first the clone climbs up to her galley, where the crew eats
    drills: [
      launchRing,
      said(CAMPAIGN.throughRing, 'rheasilvia'),
      climbOut('galley', msg("Patience holds over Vesta. The clamps keep the hull in her workshop; your clone climbs up to the galley."), 'rheasilvia'),
      inRoom(PIM.galley, 'rheasilvia'),
      inRoom(HEDDA.tally, 'rheasilvia'),
      climbIn(HEDDA.vesta, 'rheasilvia'),
      onVesta(PIM.voice),
      onVesta(CAMPAIGN.voiceOne),
    ],
    pay: 0,
  },
  { id: 'claimSurvey', name: msg('Claim Survey'), drills: [onVesta(HEDDA.claimSurvey), claimSurvey, said(CAMPAIGN.claimSurveyDone, 'rheasilvia')], pay: 400, ratings: 20 },
  { id: 'cutAndHaul', name: msg('Cut and Haul'), drills: [onVesta(HEDDA.cutAndHaul), cutAndHaul, said(CAMPAIGN.cutAndHaulDone, 'rheasilvia')], pay: HAUL_ORE * ORE_PAY, ratings: 25 },
  { id: 'sawBrothers', name: msg('Saw Brothers'), drills: [onVesta(HEDDA.sawBrothers), onVesta(SAW.giggle), sawBrothers, said(SAW.lost, 'rheasilvia'), said(CAMPAIGN.sawBrothersDone, 'rheasilvia')], pay: 1200, ratings: 80 },
  { id: 'peakRun', name: msg('The Peak Run'), drills: [onVesta(HEDDA.peakRun), peakRun, said(CAMPAIGN.peakRunDone, 'rheasilvia'), onVesta(PIM.thrusters)], pay: 800, ratings: 60, fit: fitThrusters },
  { id: 'practiceLog', name: msg('Practice Log'), drills: [practiceLog, said(CAMPAIGN.echoOne, 'rheasilvia'), said(CAMPAIGN.echoOneHeard, 'rheasilvia')], pay: 0, ratings: 20 },
  // chapter 3, Occator on Ceres: the Rockborn's capital, the market and the laser, the debt sold
  { id: 'occator', name: msg('Occator'), drills: [onCeres(HEDDA.occator), marketRun, said(CAMPAIGN.marketReached, 'occator')], pay: 0 },
  { id: 'surplus', name: msg('Surplus'), drills: [onCeres(PIM.surplus), onCeres(CAMPAIGN.targeting), onCeres(RASK.soldDebt)], pay: 0, fit: fitLaser },
  { id: 'oreBarge', name: msg('Ore Barge'), drills: [onCeres(HEDDA.oreBarge), oreBarge, said(CAMPAIGN.oreBargeDone, 'occator')], pay: 2000, ratings: 120 },
  { id: 'repoMen', name: msg('Repo Men'), drills: [onCeres(HEDDA.repoMen), said(TALLY.repo, 'occator'), repoMen, said(TALLY.noted, 'occator'), said(CAMPAIGN.repoMenDone, 'occator')], pay: 1500, ratings: 150 },
  { id: 'wallRun', name: msg('Wall Run'), drills: [said(HEDDA.wallRun, 'wall'), wallRun, said(CAMPAIGN.wallRunDone, 'wall')], pay: 1000, ratings: 200 },
  { id: 'scoutTwo', name: msg('Scout Two'), drills: [onCeres(PIM.grind), onCeres(PIM.paintOld), onCeres(CAMPAIGN.scoutTwo), onCeres(CAMPAIGN.scoutTwoHull), echoTwo, said(CAMPAIGN.echoTwo, 'occator'), said(CAMPAIGN.echoTwoHeard, 'occator')], pay: 0, ratings: 20, fit: fitStripped },
  { id: 'overhaul', name: msg('Overhaul'), drills: [onCeres(PIM.overhaul), onCeres(CAMPAIGN.overhaul)], pay: 0, fit: fitDrive },
  // chapter 4, Stickney on Phobos: the Navy town under Mars, the race into the crater, the debt changing hands
  { id: 'stickneyGrand', name: msg('Stickney Grand'), drills: [said(HEDDA.phobos, 'phobos'), said(CAMPAIGN.racingLine, 'phobos'), stickneyGrand, said(CAMPAIGN.stickneyGrandDone, 'phobos')], pay: 2500, ratings: 250, fit: fitRacingLine, start: GRAND_START },
  { id: 'debtDay', name: msg('Debt Day'), drills: [said(TALLY.debtDay, 'phobos'), debtDay, said(NAVY.hail, 'phobos'), said(TALLY.closed, 'phobos'), said(CAMPAIGN.debtDayBought, 'phobos')], pay: 2000, ratings: 200, fit: fitHeld },
  { id: 'grooveShoot', name: msg('Groove Shoot'), drills: [grooveShoot, said(CAMPAIGN.grooveShootDone, 'phobos')], pay: 1200, ratings: 150 },
  { id: 'armorPanels', name: msg('Armor Panels'), drills: [said(PIM.panels, 'phobos'), said(CAMPAIGN.panels, 'phobos')], pay: 0, fit: fitPanels },
  // chapter 5, Valhalla on Callisto: Lanes Watch's bounty show over the craters, under Jupiter
  { id: 'pilotEpisode', name: msg('Pilot Episode'), drills: [said(HEDDA.callisto, 'callisto'), said(CAMPAIGN.radar, 'callisto'), pilotEpisode, said(CAMPAIGN.pilotEpisodeDone, 'callisto')], pay: 3000, ratings: 300, fit: fitRadar },
  { id: 'iceRun', name: msg('Ice Run'), drills: [said(HEDDA.iceRun, 'callisto'), iceRun, said(CAMPAIGN.iceRunDone, 'callisto')], pay: 2500, ratings: 200 },
  { id: 'valhallaSprint', name: msg('Valhalla Sprint'), drills: [valhallaSprint, said(CAMPAIGN.valhallaSprintDone, 'callisto')], pay: 1500, ratings: 150, start: SPRINT_START },
  { id: 'callistoEcho', name: msg('Callisto Echo'), drills: [echoThree, said(CAMPAIGN.echoThree, 'callisto'), said(CAMPAIGN.echoThreeHeard, 'callisto')], pay: 0, ratings: 30 },
  { id: 'radiators', name: msg('Radiators I'), drills: [said(PIM.radiators, 'callisto'), said(CAMPAIGN.radiators, 'callisto')], pay: 0, fit: fitRadiators },
  // chapter 6, the Lineae on Europa: the Crack in the ice shell and the science station on its floor
  { id: 'dose', name: msg('Dose'), drills: [said(HEDDA.dose, 'europa'), said(CAMPAIGN.threat, 'europa'), doseRun, said(CAMPAIGN.doseDone, 'europa')], pay: 3500, ratings: 250, fit: fitThreat },
  { id: 'underTheLineae', name: msg('Under the Lineae'), drills: [said(HEDDA.europa, 'europa'), echoFour, said(CAMPAIGN.echoFour, 'europa'), said(CAMPAIGN.echoFourHeard, 'europa')], pay: 1000, ratings: 100 },
  { id: 'quietMan', name: msg('The Quiet Man'), drills: [said(HEDDA.quietMan, 'europa'), quietMan], pay: 2500, ratings: (campaign) => (campaign.choices.includes('quietManSpared') ? QUIET_SPARED_RATINGS : QUIET_RATINGS) },
  { id: 'plating', name: msg('Plating I'), drills: [said(PIM.plating, 'europa'), said(CAMPAIGN.plating, 'europa')], pay: 0, fit: fitPlating },
  // chapter 7, Flux on Io: the sulfur miners' race round the flux tube
  { id: 'fluxTubeRace', name: msg('Flux Tube Race'), drills: [said(HEDDA.io, 'io'), fluxTubeRace, said(CAMPAIGN.fluxTubeRaceDone, 'io')], pay: 4000, ratings: 350, start: FLUX_START },
  { id: 'tubeFitting', name: msg('Tube Fitting'), drills: [said(PIM.tube, 'io'), said(CAMPAIGN.tube, 'io')], pay: 0, fit: fitTube },
  { id: 'mainDrive', name: msg('Main Drive I'), drills: [said(PIM.driveOne, 'io'), said(CAMPAIGN.driveOne, 'io')], pay: 0, fit: fitDriveOne },
  { id: 'blackout', name: msg('Blackout'), drills: [said(HEDDA.blackout, 'io'), blackout, said(CAMPAIGN.blackoutBoot, 'io'), said(HEDDA.blackoutFreighter, 'io'), said(HEDDA.blackoutLog, 'io'), said(CAMPAIGN.blackoutBlank, 'io')], pay: 2000, ratings: 150 },
  // chapter 8, the Tug Yards over Ganymede: the bounty on Hollow Jack, and his harpoon
  { id: 'hollowJack', name: msg('Hollow Jack'), drills: [said(HEDDA.ganymede, 'ganymede'), said(JACK.hello, 'ganymede'), hollowJack, said(JACK.hit, 'ganymede'), said(JACK.last, 'ganymede'), said(CAMPAIGN.jackNoLink, 'ganymede'), said(CAMPAIGN.jackGone, 'ganymede')], pay: 6000, ratings: 600 },
  { id: 'harpoon', name: msg('The Harpoon'), drills: [harpoon, said(PIM.hook, 'ganymede'), said(CAMPAIGN.hook, 'ganymede')], pay: 0, fit: fitHook },
  { id: 'swingShift', name: msg('Swing Shift'), drills: [swingShift, said(CAMPAIGN.swingShiftDone, 'ganymede')], pay: 1000, ratings: 100 },
  { id: 'sponsorNight', name: msg('Sponsor Night'), drills: [said(CRISP.hello, 'ganymede'), said(CRISP.deal, 'ganymede'), said(CAMPAIGN.sponsored, 'ganymede')], pay: 0 },
  // chapter 9, the Victory Cola Circuit over Kraken Mare on Titan, in the haze
  { id: 'qualifyingHeat', name: msg('Qualifying Heat'), drills: [said(HEDDA.titan, 'titan'), qualifyingHeat, said(CAMPAIGN.qualifyingHeatDone, 'titan')], pay: 4000, ratings: 400, start: HEAT_START },
  { id: 'pitFight', name: msg('Pit Fight'), drills: [said(CAMPAIGN.pitFightIntro, 'titan'), pitFight, said(CAMPAIGN.pitFightDone, 'titan')], pay: 4000, ratings: 500 },
  { id: 'hazeDuel', name: msg('Haze Duel'), drills: [said(CAMPAIGN.hazeDuelIntro, 'titan'), hazeDuel, said(CAMPAIGN.hazeDuelDone, 'titan')], pay: 3000, ratings: 400 },
  { id: 'circuitFinal', name: msg('Circuit Final'), drills: [circuitFinal, said(CAMPAIGN.circuitFinalDone, 'titan')], pay: 6000, ratings: 800, start: HEAT_START },
  { id: 'methaneEcho', name: msg('Methane Echo'), drills: [echoAt(CAMPAIGN.echoSevenCall, 'titan', ECHO_SEVEN), said(CAMPAIGN.echoSeven, 'titan'), said(CAMPAIGN.echoSevenHeard, 'titan')], pay: 0, ratings: 40 },
  { id: 'secondTube', name: msg('Second Tube'), drills: [said(PIM.secondTube, 'titan'), said(CAMPAIGN.secondTube, 'titan')], pay: 0, fit: fitSecondTube },
  { id: 'thrustersOne', name: msg('Thrusters I'), drills: [said(PIM.thrustersOne, 'titan'), said(CAMPAIGN.thrustersOne, 'titan')], pay: 0, fit: fitThrustersOne },
  // chapter 10, the Plumes at Enceladus: Crisp's show, and the raiders who were not in it
  { id: 'plumeYacht', name: msg('Plume Yacht'), drills: [said(HEDDA.enceladus, 'enceladus'), said(CRISP.yacht, 'enceladus'), plumeYacht, said(CAMPAIGN.plumeYachtDone, 'enceladus'), said(CRISP.after, 'enceladus')], pay: 5000, ratings: 500 },
  { id: 'platingTwo', name: msg('Plating II'), drills: [said(PIM.platingTwo, 'enceladus'), said(CAMPAIGN.platingTwo, 'enceladus')], pay: 0, fit: fitPlatingTwo },
  { id: 'voiceTwo', name: msg('Voice II'), drills: [said(PIM.voiceTwo, 'enceladus'), said(CAMPAIGN.voiceTwo, 'enceladus')], pay: 0, fit: fitVoice },
  { id: 'helloHost', name: msg('Hello, Host'), drills: [said(HEDDA.spare, 'enceladus'), said(SPARE.hello, 'enceladus'), helloHost, said(SPARE.io, 'enceladus'), said(CAMPAIGN.spareFlight, 'enceladus'), said(SPARE.nicole, 'enceladus'), said(SPARE.stop, 'enceladus')], pay: 0, ratings: 300 },
  { id: 'tigerStripes', name: msg('Tiger Stripes'), drills: [said(CRISP.tigerStripes, 'enceladus'), tigerStripes, said(CAMPAIGN.tigerStripesDone, 'enceladus')], pay: 2500, ratings: 300, start: TIGER_START },
  // chapter 11, Two Faces on Iapetus: the eighth echo, the Ministry's visit, the last of the Tallymen
  { id: 'theRidge', name: msg('The Ridge'), drills: [said(HEDDA.iapetus, 'iapetus'), theRidge, said(CAMPAIGN.echoEight, 'iapetus'), said(CAMPAIGN.echoEightHeard, 'iapetus')], pay: 2000, ratings: 300 },
  {
    id: 'officeHours',
    name: msg('Office Hours'),
    drills: [
      climbOut('visit', msg('Patience holds over Iapetus. A Ministry shuttle has docked; your clone climbs up to the galley, where a guest is waiting.'), 'iapetus'),
      inRoom(QUILL.hello, 'iapetus'),
      inRoom(QUILL.body, 'iapetus'),
      inRoom(QUILL.track, 'iapetus'),
      inRoom(HEDDA.quill, 'iapetus'),
      inRoom(QUILL.nothing, 'iapetus'),
      climbIn(CAMPAIGN.quillGone, 'iapetus'),
    ],
    pay: 0,
  },
  { id: 'driveTwo', name: msg('Drive II'), drills: [said(PIM.driveTwo, 'iapetus'), said(CAMPAIGN.driveTwo, 'iapetus')], pay: 0, fit: fitDriveTwo },
  { id: 'lastTallymen', name: msg('Last of the Tallymen'), drills: [said(HEDDA.lastTallymen, 'iapetus'), said(TALLY.last, 'iapetus'), lastTallymen, said(CAMPAIGN.lastTallymenDone, 'iapetus')], pay: 5000, ratings: 500 },
  // chapter 12, the Ring Trials: four rounds of the Games in the Rings of Saturn, broadcast
  { id: 'trialRace', name: msg('Trial I: the Race'), drills: [said(QUILL.trials, RINGS), said(CAMPAIGN.trialRace, RINGS)], pay: 5000, ratings: 1000, trial: { mode: 'race', arena: RINGS, podium: 3 } },
  { id: 'trialDeathmatch', name: msg('Trial II: the Deathmatch'), drills: [said(CAMPAIGN.trialDeathmatch, RINGS)], pay: 5000, ratings: 1200, trial: { mode: 'deathmatch', arena: RINGS, podium: 2 } },
  { id: 'trialFlag', name: msg('Trial III: Capture the Flag'), drills: [said(CAMPAIGN.trialFlag, RINGS)], pay: 5000, ratings: 1200, trial: { mode: 'flag', arena: RINGS, podium: 1 } },
  { id: 'trialCarrier', name: msg('Trial IV: the Battleship'), drills: [said(CAMPAIGN.trialCarrier, RINGS)], pay: 8000, ratings: 1600, trial: { mode: 'fleet', arena: RINGS, podium: 1 } },
  { id: 'tubesOne', name: msg('Torpedo Tubes I'), drills: [said(PIM.tubesOne, RINGS), said(CAMPAIGN.tubesOne, RINGS)], pay: 0, fit: fitTubesOne },
  { id: 'invitation', name: msg('The Invitation'), drills: [said(QUILL.invitation, RINGS), said(CAMPAIGN.invitation, RINGS)], pay: 0 },
  // chapter 13, Verona on Miranda: down the cliff to the Loose, their overdrive, a Navy sweep at their door
  { id: 'veronaDrop', name: msg('Verona Drop'), drills: [said(HEDDA.miranda, 'miranda'), veronaDrop, said(CAMPAIGN.veronaDone, 'miranda')], pay: 0, ratings: 300, start: DROP_START },
  { id: 'amongTheLoose', name: msg('Among the Loose'), drills: [said(SPARE.hideout, 'miranda'), said(SPARE.overdrive, 'miranda'), said(PIM.overdrive, 'miranda'), said(CAMPAIGN.overdrive, 'miranda')], pay: 0, fit: fitOverdrive },
  { id: 'theSweep', name: msg('The Sweep'), drills: [said(HEDDA.sweep, 'miranda'), said(SPARE.wing, 'miranda'), theSweep, said(CAMPAIGN.sweepDone, 'miranda'), said(SPARE.after, 'miranda')], pay: 6000, ratings: 500 },
  { id: 'thrustersTwo', name: msg('Thrusters II'), drills: [said(PIM.thrustersTwo, 'miranda'), said(CAMPAIGN.thrustersTwo, 'miranda')], pay: 0, fit: fitThrustersTwo },
  // chapter 14, Memorial: Triton's geysers to the Navy's oldest admiral, then the Derelict's bow and its log
  { id: 'geyserField', name: msg('Geyser Field'), drills: [said(HEDDA.triton, 'triton'), geyserField, said(CAMPAIGN.geyserFieldDone, 'triton')], pay: 3000, ratings: 300, start: GEYSER_START },
  { id: 'oldAdmiral', name: msg('The Old Admiral'), drills: [said(VEY.visitor, 'triton'), said(VEY.order, 'triton'), said(VEY.medal, 'triton'), said(CAMPAIGN.veyHeard, 'triton')], pay: 0 },
  { id: 'theMemorial', name: msg('The Memorial'), drills: [said(HEDDA.memorial, 'derelict'), theMemorial, said(CAMPAIGN.echoNine, 'derelict'), said(CAMPAIGN.echoNineHeard, 'derelict')], pay: 4000, ratings: 400 },
  { id: 'graveShift', name: msg('Grave Shift'), drills: [graveShift, said(CAMPAIGN.graveShiftDone, 'derelict')], pay: 3000, ratings: 300 },
  { id: 'thrustersThree', name: msg('Thrusters III'), drills: [said(PIM.thrustersThree, 'derelict'), said(CAMPAIGN.thrustersThree, 'derelict')], pay: 0, fit: fitThrustersThree },
  // chapter 15, Last Light at Pluto: the Feeders' race, Spare's file, the tenth echo, the pickets at the last dock
  { id: 'heartRun', name: msg('Heart Run'), drills: [said(HEDDA.pluto, 'pluto'), heartRun, said(CAMPAIGN.heartRunDone, 'pluto')], pay: 5000, ratings: 500, start: HEART_START },
  {
    id: 'theFile',
    name: msg('The File'),
    drills: [
      climbOut('file', msg('Patience lies at Pluto’s last dock. Spare has come aboard, unarmed; your clone climbs up to the galley.'), 'pluto'),
      inRoom(SPARE.file, 'pluto'),
      inRoom(SPARE.road, 'pluto'),
      climbIn(CAMPAIGN.fileAnswer, 'pluto'),
    ],
    pay: 0,
  },
  { id: 'plutoEcho', name: msg('Pluto Echo'), drills: [echoAt(CAMPAIGN.echoTenCall, 'pluto', ECHO_TEN), said(CAMPAIGN.echoTen, 'pluto'), said(CAMPAIGN.echoTenHeard, 'pluto')], pay: 0, ratings: 40 },
  { id: 'lastLight', name: msg('Last Light'), drills: [said(HEDDA.lastLight, 'pluto'), lastLight, said(CAMPAIGN.lastLightDone, 'pluto')], pay: 6000, ratings: 400 },
  { id: 'wells', name: msg('Wells'), drills: [said(CAMPAIGN.wells, 'pluto'), said(CAMPAIGN.wellsAhead, 'pluto')], pay: 0, fit: fitWells },
  { id: 'platingThree', name: msg('Plating III'), drills: [said(PIM.platingThree, 'pluto'), said(CAMPAIGN.platingThree, 'pluto')], pay: 0, fit: fitPlatingThree },
  // chapter 16, the Long Ladder: Haumea's ring, a fuel barge to Eris's depot, Perihelion hunting
  { id: 'haumeaRing', name: msg('Haumea’s Ring'), drills: [said(HEDDA.haumea, 'haumea'), haumeaRing, said(CAMPAIGN.haumeaRingDone, 'haumea')], pay: 6000, ratings: 600, start: HAUMEA_START },
  { id: 'rungTwo', name: msg('Rung Two'), drills: [said(HEDDA.rungTwo, 'eris'), rungTwo, said(CAMPAIGN.rungTwoDone, 'eris')], pay: 6000, ratings: 400 },
  { id: 'theHunter', name: msg('The Hunter'), drills: [said(HEDDA.hunter, 'eris'), hunter, said(CAMPAIGN.hunterDone, 'eris')], pay: 5000, ratings: 600 },
  { id: 'driveThree', name: msg('Drive III'), drills: [said(PIM.driveThree, 'eris'), said(CAMPAIGN.driveThree, 'eris')], pay: 0, fit: fitDriveThree },
];
