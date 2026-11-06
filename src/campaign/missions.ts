import * as THREE from 'three';
import { msg, t } from '../i18n/i18n';
import { CAMPAIGN, HEDDA, PIM, RASK, SAW, TALLY } from '../music/lines';
import { clear, holdFor, PIPE_BORE, saying, stop, type Attempt, type Drill, type Markers, type SchoolContext } from '../game/school';
import { RISE, VESTA_GROUND } from '../world/vesta';
import { MARKET_DOCK, onPlace } from '../world/ceres';
import type { Asteroid } from '../world/asteroids';
import type { Claim } from '../world/mining';
import type { ArenaId } from '../world/arenas';
import { BAY_MOUTH, GROUND, HOPPER, PAD, PAD_RADIUS, RACK_GAP, RACK_HEIGHT, RACK_LENGTH, ROW_SPACING, YARD_END } from '../world/yard';
import { cos, exp, hypot, sin } from '../detmath';
import { type Campaign, LASER_PRICE, type Mission } from './campaign';
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

const peakRun: Drill = {
  line: CAMPAIGN.peakRun,
  keys: ['turn', 'drive', 'brake'],
  arena: 'rheasilvia',
  // a race against the claims' racers
  music: 'fight',
  autopilot: true,
  enter(ctx, a, markers) {
    stop(ctx);
    a.points = PEAK_COURSE.map((pipe) => clear(ctx, pipe.clone(), PIPE_BORE * 2));
    // each ring faces along the loop, from the ring before it to the ring after it
    a.normals = a.points.map((_, i) => a.points[(i + 1) % PEAK_RINGS].clone().sub(a.points[(i + PEAK_RINGS - 1) % PEAK_RINGS]).normalize());
    a.points.forEach((pipe, i) => markers.pipe(pipe, a.normals[i], VESTA_GROUND + RISE * pipe.x));
    a.pipes = true;
    a.next = 0;
    a.side = NaN;
    a.warned = false;
    ctx.spawnRacers(a.points, a.normals, PIPE_BORE, PEAK_LAPS, PEAK_RIVALS, PEAK_SKILL, ctx.me.flight.position);
  },
  done(ctx, a) {
    const k = a.next % PEAK_RINGS;
    const offset = a.site.subVectors(ctx.me.flight.position, a.points[k]);
    const side = offset.dot(a.normals[k]);
    const crossed = Number.isFinite(a.side) && a.side < 0 !== side < 0;
    a.side = side;
    if (!crossed || offset.addScaledVector(a.normals[k], -side).length() >= PIPE_BORE) return false;
    a.next++;
    a.side = NaN;
    if (a.next < PEAK_RINGS * PEAK_LAPS) return false;
    // home: in the first two, or the race is lost
    a.warned = ctx.racersFinished >= PEAK_PODIUM;
    return !a.warned;
  },
  fail: (_, a) => (a.warned ? CAMPAIGN.peakRunLost : null),
  leave: (ctx) => ctx.removeRacers(),
  waypoint: (_, a) => a.points[a.next % PEAK_RINGS] ?? null,
  mark: (_, a) => t('Lap {lap}/{laps} · pipe {n}/{total}', { lap: Math.min(PEAK_LAPS, Math.floor(a.next / PEAK_RINGS) + 1), laps: PEAK_LAPS, n: (a.next % PEAK_RINGS) + 1, total: PEAK_RINGS }),
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
  if (!campaign.parts.includes('laser')) campaign.parts.push('laser');
  const paid = Math.min(campaign.coins, LASER_PRICE);
  campaign.coins -= paid;
  campaign.bond += LASER_PRICE - paid;
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
const BARGE_WAY = new THREE.Vector3().subVectors(BARGE_TO, BARGE_FROM).normalize();
const BARGE_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), BARGE_WAY);
const bargeNow = new THREE.Vector3();

/** Where the barge is `seconds` after it set out, on its lane, stopped at its end. */
function bargeAt(seconds: number, out: THREE.Vector3): THREE.Vector3 {
  const length = BARGE_FROM.distanceTo(BARGE_TO);
  return out.copy(BARGE_FROM).addScaledVector(BARGE_WAY, Math.min(length, seconds * BARGE_SPEED));
}

const oreBarge: Drill = {
  line: CAMPAIGN.oreBarge,
  keys: ['turn', 'drive', 'fire'],
  arena: 'occator',
  autopilot: false,
  // the lane's calm until the scrappers come, then the fight
  turn: (_, a) => (a.count > 0 ? 'fight' : undefined),
  enter(ctx, a, markers) {
    stop(ctx);
    ctx.removeJumpers();
    markers.clear();
    markers.bargeAt(BARGE_FROM, BARGE_TURN);
    // a.count: the waves sent; a.jinks: the hits of the waves before this one
    a.count = 0;
    a.jinks = 0;
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done(ctx, a, markers) {
    bargeAt(a.seconds, bargeNow);
    markers.bargeAt(bargeNow, BARGE_TURN);
    ctx.moveJumpers(bargeNow);
    if (a.count === 0 && a.seconds >= BARGE_QUIET) {
      ctx.spawnJumpers(null, bargeNow, SCRAPPERS, SCRAP_SKILL[0], SCRAP_NAMES, SCRAP_HOLD);
      a.count = 1;
    } else if (a.count > 0 && a.count < SCRAP_SKILL.length && ctx.jumpersDown >= SCRAPPERS) {
      a.jinks += ctx.rigWear;
      ctx.spawnJumpers(null, bargeNow, SCRAPPERS, SCRAP_SKILL[a.count], SCRAP_NAMES, SCRAP_HOLD);
      a.count++;
    }
    return a.count >= SCRAP_SKILL.length && ctx.jumpersDown >= SCRAPPERS && bargeNow.distanceTo(BARGE_TO) < 1;
  },
  fail: (ctx, a) => (a.jinks + ctx.rigWear >= BARGE_HULL ? CAMPAIGN.oreBargeLost : null),
  leave: (ctx) => ctx.removeJumpers(),
  waypoint: () => bargeNow,
  mark: (ctx, a) => t('Wave {n}/{waves} · barge hull {hull} %', { n: Math.max(1, a.count), waves: SCRAP_SKILL.length, hull: Math.max(0, Math.round(100 * (1 - (a.jinks + ctx.rigWear) / BARGE_HULL))) }),
};

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
];
