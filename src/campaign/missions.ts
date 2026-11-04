import * as THREE from 'three';
import { msg, t } from '../i18n/i18n';
import { CAMPAIGN } from '../music/lines';
import { clear, DRILL, holdFor, saying, stop, type Attempt, type Drill, type Markers } from '../game/school';
import type { ArenaId } from '../world/arenas';
import { RACK_GAP, RACK_LENGTH, ROW_SPACING, YARD_END } from '../world/yard';
import { exp } from '../detmath';
import type { Campaign, Mission } from './campaign';

/**
 * The missions of Lot 7731 (see docs/campaign/STORY.md, section 3), each a run of drills on the
 * flight school's machinery, flown in the campaign's places. The prologue and chapter 1, the
 * Boneyard on Psyche: the first link, the menial jobs, the mining cutter, Patience docking.
 */

/** A drill of the flight school with Nicole's campaign line instead of the school's, once, without the school's praise, flown at a place of the campaign. */
const told = (drill: Drill, line: string, arena: ArenaId = 'boneyard'): Drill => ({ ...drill, line, praise: undefined, reps: 1, repLine: undefined, arena });
/** A line Nicole says at a place of the campaign. */
const said = (line: string, arena: ArenaId = 'boneyard'): Drill => ({ ...saying(line), arena });

const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The yard office, at the middle of the lane (the place's center). */
const OFFICE = point(0, 0, 0);
/** Where the end of a row of racks stands, out at the lane's ends: the row's beacon. */
const rowEnd = (side: -1 | 1, row: number) => point(side * (YARD_END + 800), 0, row * ROW_SPACING);

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
 * 1 km) by jinking. Leaving the zone starts it over.
 */
const TARGET_SECONDS = 90;
const TARGET_ZONE = 20000;
const TARGET_INTERVAL = 1.2;
const TARGET_LAG = 0.4;
const GUNNERS = [point(0, 6000, -24000), point(20000, -4000, 12000), point(-20000, 4000, 12000)];

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
  },
  done(ctx, a) {
    a.points[0].lerp(ctx.me.flight.position, 1 - exp(-ctx.dt / TARGET_LAG));
    if (a.seconds - a.lastShot > TARGET_INTERVAL / GUNNERS.length) {
      a.lastShot = a.seconds;
      a.count = (a.count + 1) % GUNNERS.length;
      ctx.fireAt(GUNNERS[a.count], a.points[0]);
    }
    return a.seconds >= TARGET_SECONDS;
  },
  fail: (ctx) => (ctx.me.flight.position.distanceTo(OFFICE) > TARGET_ZONE ? CAMPAIGN.liveTargetOut : null),
  mark: (_, a) => t('Stay alive: {seconds} s', { seconds: Math.max(0, Math.ceil(TARGET_SECONDS - a.seconds)) }),
  waypoint: () => null,
};

/**
 * Canister Sweep (1.3): salvage canisters drifting in the gaps between the rows, one at a time:
 * fly through one (within CANISTER_REACH, units, 30 m) to take it in tow, then through the
 * crusher at the yard office (within CRUSHER_REACH, 60 m) to deliver it.
 */
const CANISTER_REACH = 600;
const CRUSHER_REACH = 1200;
const between = ROW_SPACING / 2;
const CANISTERS = [point(-2 * (RACK_LENGTH + RACK_GAP), 800, between), point(RACK_LENGTH + RACK_GAP, -600, -between), point(2 * (RACK_LENGTH + RACK_GAP), 1200, 3 * between), point(-(RACK_LENGTH + RACK_GAP), 0, -3 * between)];

/** The marker of the step the sweep is at: a canister to take, or the crusher to bring it to. */
function sweepMarkers(a: Attempt, markers: Markers) {
  markers.clear();
  const target = a.points[a.next];
  if (!target) return;
  markers.buoy(target, a.next % 2 ? 1.5 : 0.6);
  markers.zone(target, a.next % 2 ? CRUSHER_REACH : CANISTER_REACH);
}

const canisterSweep: Drill = {
  line: CAMPAIGN.canisterSweep,
  keys: ['turn', 'drive', 'brake'],
  arena: 'boneyard',
  autopilot: false,
  enter(_, a, markers) {
    // canister, crusher, canister, crusher…
    a.points = CANISTERS.flatMap((canister) => [canister.clone(), OFFICE.clone()]);
    sweepMarkers(a, markers);
  },
  done(ctx, a, markers) {
    const reach = a.next % 2 ? CRUSHER_REACH : CANISTER_REACH;
    if (ctx.me.flight.position.distanceTo(a.points[a.next]) > reach) return false;
    a.next++;
    sweepMarkers(a, markers);
    return a.next >= a.points.length;
  },
  waypoint: (_, a) => a.points[a.next] ?? null,
  mark: (_, a) => (a.next % 2 ? t('Crusher') : t('Canister {n}/{total}', { n: a.next / 2 + 1, total: CANISTERS.length })),
};

/** First Cut (1.5): break FIRST_CUT rocks of the yard's spoil with the cutter, the nearest one marked. */
const FIRST_CUT = 3;

const firstCut: Drill = {
  line: CAMPAIGN.firstCut,
  keys: ['turn', 'drive', 'fire'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a) {
    a.count = ctx.rocksBroken;
    ctx.me.heat = 0;
    ctx.me.overheated = false;
  },
  done: (ctx, a) => ctx.rocksBroken - a.count >= FIRST_CUT,
  waypoint(ctx) {
    let best: THREE.Vector3 | null = null;
    let nearest = Infinity;
    for (const rock of ctx.field.asteroids.values()) {
      if (rock.solid) continue;
      const distance = rock.object.position.distanceTo(ctx.me.flight.position);
      if (distance < nearest) {
        nearest = distance;
        best = rock.object.position;
      }
    }
    return best;
  },
  mark: (ctx, a) => t('Rock {n}/{total}', { n: Math.min(FIRST_CUT, ctx.rocksBroken - a.count + 1), total: FIRST_CUT }),
};

/**
 * Docking Lane (1.6): Patience docks at the yard; loose hulls drift into its lane, one after the
 * other, LANE_WAVES of them, from LANE_FROM (units, 1 km) off its berth at LANE_SPEED (units/s,
 * 40 m/s). Each has to be shot before it comes within LANE_STRIKE (units, 100 m) of the berth;
 * LANE_STRIKES that do fail it.
 */
const BERTH = point(0, 4000, -6000);
const LANE_WAVES = 6;
const LANE_FROM = 20000;
const LANE_SPEED = 800;
const LANE_STRIKE = 2000;
const LANE_STRIKES = 3;
/** The ways the hulls come from, one after the other: from above and the sides, over the racks. */
const LANE_FROM_WAYS = [point(0.6, 0.8, 0), point(-0.5, 0.6, -0.62), point(0, 0.7, 0.71), point(-0.8, 0.6, 0), point(0.5, 0.5, -0.71), point(0.3, 0.9, 0.3)].map((way) => way.normalize());

const dockingLane: Drill = {
  line: CAMPAIGN.dockingLane,
  keys: ['turn', 'drive', 'fire'],
  arena: 'boneyard',
  autopilot: false,
  enter(ctx, a, markers) {
    stop(ctx);
    markers.buoy(BERTH, 3);
    markers.zone(BERTH, LANE_STRIKE);
    a.count = 0;
    a.jinks = 0;
    a.lit = false;
  },
  done(ctx, a) {
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
    if (drone.flight.position.distanceTo(BERTH) < LANE_STRIKE) {
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

/** Fits the mining cutter (see hullOf), on the Bond: the yard adds its price to what the Host owes. */
export const CUTTER_PRICE = 1200;
const fitCutter = (campaign: Campaign) => {
  if (!campaign.parts.includes('cutter')) campaign.parts.push('cutter');
  campaign.bond += CUTTER_PRICE;
};

/** The missions in the order the story runs them. */
export const MISSIONS: readonly Mission[] = [
  {
    // the first link into the hull in rack 7731, and out of the rack to the yard office's beacon
    id: 'coldBoot',
    name: msg('Cold Boot'),
    drills: [said(CAMPAIGN.coldBoot), told(DRILL.turn, CAMPAIGN.coldBootTurn), told(DRILL.drive, CAMPAIGN.coldBootDrive), told(DRILL.brake, CAMPAIGN.coldBootBrake), told(DRILL.stopAt, CAMPAIGN.coldBootStop), said(CAMPAIGN.coldBootDone)],
    pay: 0,
  },
  { id: 'lamplighter', name: msg('Lamplighter'), drills: [lamplighter, said(CAMPAIGN.lamplighterDone)], pay: 150 },
  { id: 'liveTarget', name: msg('Live Target'), drills: [liveTarget, said(CAMPAIGN.liveTargetDone)], pay: 300 },
  { id: 'canisterSweep', name: msg('Canister Sweep'), drills: [canisterSweep, said(CAMPAIGN.canisterSweepDone)], pay: 200 },
  { id: 'cutter', name: msg('The Cutter'), drills: [said(CAMPAIGN.cutter), said(CAMPAIGN.cutterFitted)], pay: 0, fit: fitCutter },
  { id: 'firstCut', name: msg('First Cut'), drills: [firstCut, said(CAMPAIGN.firstCutDone)], pay: 400 },
  { id: 'dockingLane', name: msg('Docking Lane'), drills: [dockingLane, said(CAMPAIGN.dockingLaneDone)], pay: 600 },
];
