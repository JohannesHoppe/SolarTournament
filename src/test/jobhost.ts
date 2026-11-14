import * as THREE from 'three';
import { IDLE, type Controls } from '../input/input';
import { Bot, evenSkills, RACE_SPEED } from '../ship/bots';
import { MAIN_THRUST, RCS_THRUST } from '../ship/flight';
import { firstHull, LASER_RANGE, type Ship } from '../ship/ship';
import { approachGate } from '../game/race';
import { PIPE_BORE, RING_RADIUS } from '../game/school';
import { RacingLine } from '../game/racingline';
import { exp } from '../detmath';
import { altitudeIn, densityIn, dragOn, heatSpeed, REACTOR_WASTE } from '../world/air';
import type { RayHit } from '../world/asteroids';
import type { Hands, Host, JobWorld } from './jobs';

/**
 * The simulated Host of the campaign's jobs (see jobs.ts): a pilot of middling skill (0.5, as
 * CLAUDE.md's plausibility rule asks) whose hands go through the flight model, never into the
 * ship's position or the drill's state. It reads what the HUD shows: the drill's marker, the
 * rings set out in space, the ships about it; and does what the drill's keys ask: flies to the
 * marker and holds there, flies a course of rings as a racing bot does, fights what is hostile as
 * a bot of its skill does. A drill that asks for a maneuver of its own has a behavior here (see
 * BEHAVIORS), keyed by the job and the drill's place in it.
 */

/** The Host's skill: what a Host is asked to fly, a middling bot must manage. */
export const HOST_SKILL = 0.5;
/** The speed it cruises at between points (units/s, 125 m/s), as a bot roams. */
const CRUISE = 2500;
/** It reckons with this share of the drive's push for stopping, and starts its stop this far early (units, 15 m), for the turn round. */
const STOP_SHARE = 0.45;
const STOP_PAD = 300;
const TURN_ROUND = 0.6;
/** A velocity off by more than this is burnt away with the drive, the nose turned into it; less, the thrusters trim it (units/s). */
const BURN_OFF = 400;
/** The drive burns once the nose points within this of where it should (rad). */
const BURN_CONE = 0.3;
/** How long the hand takes to move the stick, drive and thrusters where it wants them (s). */
const HAND = 0.2;
/** It lays a fresh way round the rock to a point that moved more than this (units), or this often (s). */
const RELAY = 4000;
const RELAY_SECONDS = 2;
/** Near a point it flies straight at it (units). */
const NEAR = 3000;
/** In an air it keeps under this share of the speed that heats the hull faster than it cools (see world/air). */
const AIR_MARGIN = 0.8;
/** In the air it never crawls slower than this (units/s, 20 m/s), however hot: crawling, the clog's waste heat burns it all the same. */
const AIR_CRAWL = 400;
const AIR_AHEAD = 4;
/** Short of a fin it flies no faster than this (units/s, 60 m/s) within AIR_DECK over the cloud deck and under it. */
const AIR_FINLESS = 1200;
const AIR_DECK = 3000;
/** It holds still before a line is said, or at rest, slower than this (units/s, 5 m/s): the brake takes the rest. */
const REST = 100;
/** It reads a moving goal's velocity off its marker over this long (s). */
const GOAL_SMOOTH = 0.2;
/** It fires at a drive while the laser is cooler than this, at armor while cooler than that (see Ship.heat, MAX_HEAT 100). */
const TRIGGER_DRIVE = 85;
/** Through a course of pipes it races at this (units/s, 110 m/s). */
const PIPE_SPEED = 2200;
/** A drill's hull it would strike within this (s) at the speed it flies, it brakes for. */
const HULL_WARNING = 1.5;
/** A marker in a drill's hull (felt for within ESCORT_PROBE of it) it escorts from ESCORT_ABOVE over it (units, 250 m). */
const ESCORT_PROBE = 1500;
const ESCORT_ABOVE = new THREE.Vector3(0, 5000, 0);
/** A torpedo homing on it within this (units, 1 km) it turns to shoot down. */
const INTERCEPT = 20000;
const TRIGGER_ARMOR = 45;

/** The way is clear where a sphere this much larger than the hull (units) meets nothing along it, looked at every CLEAR_STEP (units); the last NEAR of it to the goal is the goal's own business. */
const CLEAR_ROOM = 20;
const CLEAR_STEP = 400;
/** How far out it looks for a way round (units: 100 m to 2 km). */
const DETOURS = [2000, 4000, 8000, 14000, 24000, 40000];

const upward = new THREE.Vector3();
const side = new THREE.Vector3();
const probe = new THREE.Vector3();
const hullProbe = new THREE.Vector3();
const hullNormal = new THREE.Vector3();
const middle = new THREE.Vector3();
const escape = new THREE.Vector3();

/** Whether the way from `from` to `to` is clear of the field's pieces and the drill's hulls (see CLEAR_ROOM). */
function clearWay(world: JobWorld, from: THREE.Vector3, to: THREE.Vector3, room: number, tail = NEAR): boolean {
  const length = from.distanceTo(to);
  for (let s = room; s < length - tail; s += CLEAR_STEP) {
    probe.lerpVectors(from, to, s / length);
    if (world.field.overlap(probe, room) || world.school.touchesHull(hullProbe.copy(probe), room, hullNormal)) return false;
  }
  return true;
}

const toGoal = new THREE.Vector3();
const wayHit: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
const want = new THREE.Vector3();
const error = new THREE.Vector3();
const accel = new THREE.Vector3();
const local = new THREE.Vector3();
const aim = new THREE.Vector3();
const gravity = new THREE.Vector3();

/** What a behavior asks of the Host's hands this step; anything left out is the default (see host). */
export interface Intent {
  /** Fly to this point (and hold there, unless `through`). */
  goto?: THREE.Vector3 | null;
  /** The point moves at this velocity (an escort's barge, the parade's slot). */
  moving?: THREE.Vector3;
  /** Fly through the point at speed instead of stopping at it. */
  through?: boolean;
  /** Cruise no faster than this (units/s). */
  cruise?: number;
  /** Fight the hostiles, this one first. */
  fight?: boolean;
  prey?: Ship | null;
  /** Turn the nose onto this point (and fire with `fire`). */
  look?: THREE.Vector3 | null;
  fire?: boolean;
  brake?: boolean;
  hook?: boolean;
  selfDestruct?: boolean;
  /** The mining charge's key held (see game/charges). */
  charge?: boolean;
  /** Extra stick and thrusters on top of the flight (a jink: strafe). */
  strafe?: THREE.Vector3;
  /** Hands off. */
  idle?: boolean;
  /** Silent: the thrusters alone, the drive cold (a patrol in sight sees a burning drive). */
  quiet?: boolean;
  /** Race through a course of rings or pipes (see Pilot.race). */
  race?: { points: readonly THREE.Vector3[]; normals: readonly THREE.Vector3[]; next: number; radius: number; closed: boolean };
}

/** A behavior for one drill: the Host's intent each step, from the world as the HUD shows it. */
export type Behavior = (world: JobWorld, pilot: Pilot) => Intent;

/**
 * The Host's hands: steering, drive and thrusters as a pilot gives them (eased in over HAND), a
 * bot of HOST_SKILL for fights and races, and the way to a point laid round the rock as the game's
 * guide lays it (see RacingLine).
 */
export class Pilot {
  readonly bot: Bot;
  private readonly hand: Controls = { ...IDLE };
  private lineTo = new THREE.Vector3();
  private lineAt = -Infinity;
  private readonly lastGoal = new THREE.Vector3();
  private lastGoalAt = -Infinity;
  /** The moving goal's velocity as the Host reads it off its marker (smoothed). */
  readonly goalVelocity = new THREE.Vector3();
  private hookWas = false;
  /** Free for a behavior's own state, cleared when the drill or its attempt changes. */
  memo: Record<string, unknown> = {};

  constructor(readonly me: Ship) {
    this.bot = new Bot(me, evenSkills(HOST_SKILL));
    this.bot.home = Infinity;
  }

  /** The hands for an intent. */
  hands(world: JobWorld, intent: Intent): Hands {
    const hook = !!intent.hook && !this.hookWas;
    this.hookWas = !!intent.hook;
    // it flies in free drift, as the bots do: the autopilot's key pressed off where a drill switched it on
    const hands: Hands = { controls: this.hand, brake: !!intent.brake, hook, selfDestruct: !!intent.selfDestruct, charge: !!intent.charge, torpedo: false, autopilot: false };
    if (intent.idle || intent.brake) return { ...hands, controls: this.ease({ ...IDLE }, world.dt) };
    // a hull of the drill's ahead on its way (Patience, the barge it escorts), soon to be struck: the brake
    const flight = this.me.flight;
    const speed = flight.velocity.length();
    if (speed > REST && world.school.hullRay(flight.position, local.copy(flight.velocity).divideScalar(speed), speed * HULL_WARNING + this.me.radius * 2) !== null) {
      return { ...hands, brake: true, controls: this.ease({ ...IDLE }, world.dt) };
    }
    let wanted: Controls | null = null;
    // a torpedo homing on it is shot down first, the nose on it and the trigger held while it is on it
    // (racing, only well away from the next ring)
    const homing = intent.fight || (intent.race && intent.race.points[intent.race.next % intent.race.points.length].distanceTo(this.me.flight.position) > INTERCEPT) ? world.homing : null;
    if (homing && homing.distanceTo(this.me.flight.position) < INTERCEPT) {
      const out = this.flyTo(world, this.held(), { look: homing });
      return { ...hands, controls: { ...this.ease(out, world.dt), fire: !this.me.overheated && this.me.flight.noseAngleTo(aim.subVectors(homing, this.me.flight.position)) < 0.03 } };
    }
    if (intent.race) return { ...hands, controls: this.race(world, intent.race) };
    if (intent.fight) {
      this.bot.prey = intent.prey ?? null;
      const thought = this.bot.think(world.now, world.ships.filter((ship) => ship === this.me || world.hostiles.includes(ship) || ship === intent.prey), world.field);
      // a bot with something to fight fights; with nothing in sight, it goes on to the marker
      if (this.bot.target) {
        hands.torpedo = this.me.torpedoes > 0 && Math.random() < world.dt * 0.08;
        return { ...hands, controls: { ...thought, fire: this.trigger(world, thought.fire) } };
      }
    }
    // to the point, or holding where it is; the nose on what it looks at, if anything; in a fight
    // with nothing in sight and no marker, to the nearest hostile the HUD's arrows show
    wanted = this.flyTo(world, intent.goto ?? (intent.fight ? nearestOf(world.hostiles, this.me) : null) ?? this.held(), intent);
    if (intent.strafe) {
      wanted.strafeX = THREE.MathUtils.clamp(wanted.strafeX + intent.strafe.x, -1, 1);
      wanted.strafeY = THREE.MathUtils.clamp(wanted.strafeY + intent.strafe.y, -1, 1);
    }
    const out = this.ease(wanted, world.dt);
    out.fire = !!intent.fire;
    return { ...hands, controls: out };
  }

  /**
   * A Host's trigger in a fight: as the bot would pull it, and whenever the crosshair lies on a
   * hostile hull within the laser's reach (the HUD shows it: the crosshair turns orange), while
   * the laser is cool enough, hotter for an open drive; never with a friend under it.
   */
  private trigger(world: JobWorld, bot: boolean): boolean {
    const me = this.me;
    const direction = me.flight.forward(local);
    const hull = firstHull(world.ships, me, me.nose(aim), direction, LASER_RANGE * me.perks.laserReach);
    // nothing under the crosshair within its reach (a cutter reaches 400 m): no shot
    if (!hull?.ship) return false;
    if (!world.hostiles.includes(hull.ship)) return false;
    return bot || (!me.overheated && me.heat < (hull.ship.tailToward(direction) ? TRIGGER_DRIVE : TRIGGER_ARMOR));
  }

  /** Where it holds still when it flies to nowhere: where it was when it began to hold. */
  private held(): THREE.Vector3 {
    const at = this.memo.held as THREE.Vector3 | undefined;
    if (at && at.distanceTo(this.me.flight.position) < NEAR) return at;
    return (this.memo.held = this.me.flight.position.clone());
  }

  /** Eases the hand towards what it wants (see HAND); the trigger is instant. */
  private ease(wanted: Controls, dt: number): Controls {
    const k = 1 - exp(-dt / HAND);
    const hand = this.hand;
    for (const axis of ['yaw', 'pitch', 'roll', 'thrust', 'strafeX', 'strafeY', 'strafeZ'] as const) hand[axis] += (wanted[axis] - hand[axis]) * k;
    hand.fire = wanted.fire;
    return hand;
  }

  /**
   * Free drift to a point: the velocity it wants (towards the point along the way round the
   * rock, as fast as it can still stop there, or through it; plus the point's own motion), and
   * the difference burnt away nose first or trimmed with the thrusters, gravity held against.
   */
  private flyTo(world: JobWorld, goal: THREE.Vector3, intent: Intent): Controls {
    const flight = this.me.flight;
    const out: Controls = { ...IDLE };
    this.readGoal(world, goal, intent);
    toGoal.subVectors(goal, flight.position);
    const distance = toGoal.length();
    // a point on a piece's surface (a claim's buoy, a rig) is stopped at short of the surface
    const surface = distance > 1 ? world.field.raycast(flight.position, local.copy(toGoal).divideScalar(distance), distance, false, wayHit) : null;
    const room = surface ? Math.max(0, surface.distance - this.me.radius * 2) + STOP_PAD : distance;
    let cruise = intent.cruise ?? CRUISE;
    const air = world.field.air;
    // in an air, no faster than the hull sheds the heat of (the waste heat a clog holds in taken off what the radiators shed)
    // (where it is, and where it will be AIR_AHEAD seconds on: it slows before it dives into thicker air)
    if (air) {
      const shed = Math.max(0, this.me.cooling - REACTOR_WASTE * this.me.clog);
      const deeper = Math.min(altitudeIn(air, flight.position), altitudeIn(air, local.copy(flight.position).addScaledVector(flight.velocity, AIR_AHEAD)));
      cruise = Math.min(cruise, Math.max(AIR_CRAWL, heatSpeed(air, deeper, shed) * AIR_MARGIN));
      // a hull short of a fin (the Magpie) holds its course in the clouds only slowly (see world/air, finSpin)
      if (this.me.perks.fins < 2 && deeper < AIR_DECK) cruise = Math.min(cruise, AIR_FINLESS);
    }
    const stopping = intent.quiet ? RCS_THRUST * Math.max(0.25, flight.thrusterFactor) * STOP_SHARE : MAIN_THRUST * Math.max(0.1, flight.driveFactor) * STOP_SHARE;
    // the stop reckons with the turn round before the burn: TURN_ROUND seconds at the speed flown
    const speed = intent.through ? cruise : Math.min(cruise, Math.sqrt(2 * stopping * Math.max(0, Math.min(distance, room) - STOP_PAD - local.subVectors(flight.velocity, this.goalVelocity).length() * TURN_ROUND)));
    // the way round the rock, as the game's guide lays it, unless the point is near
    if (distance > NEAR) this.wayTo(world, goal, aim);
    else aim.copy(goal);
    want.subVectors(aim, flight.position);
    if (want.lengthSq() > 1) want.setLength(speed);
    want.add(this.goalVelocity);
    error.subVectors(want, flight.velocity);
    world.field.gravity(flight.position, gravity);
    // the air's drag pulls as gravity does, and its lift bends the flight (see Game.outside)
    flight.airDensity = densityIn(air, flight.position);
    if (air) dragOn(air, flight.position, flight.velocity, world.dt, gravity);
    // the push it wants: the difference taken out within a second or two, gravity held against
    accel.copy(error).multiplyScalar(0.8).sub(gravity);
    const big = error.length() > BURN_OFF || accel.length() > RCS_THRUST * flight.thrusterFactor * 0.8;
    if (intent.look) {
      // the nose held on what it looks at: the drive burns only as far as it points the right way
      flight.steer(local.subVectors(intent.look, flight.position), 3, out);
      out.thrust = flight.noseAngleTo(accel) < BURN_CONE ? THREE.MathUtils.clamp(accel.dot(flight.forward(local)) / (MAIN_THRUST * Math.max(0.1, flight.driveFactor)), 0, 1) : 0;
    } else if (big) {
      flight.steer(accel, 2.5, out);
      out.thrust = flight.noseAngleTo(accel) < BURN_CONE ? Math.min(1, accel.length() / (MAIN_THRUST * Math.max(0.1, flight.driveFactor))) : 0;
    } else {
      // the nose along the way (or on the point when it is near), the thrusters trimming
      flight.steer(distance > STOP_PAD * 2 ? want.lengthSq() > 1 ? want : toGoal : flight.forward(local), 2.5, out);
    }
    if (intent.quiet) out.thrust = 0;
    // what the drive does not give, the thrusters do
    if (out.thrust > 0) accel.addScaledVector(flight.forward(local), -out.thrust * MAIN_THRUST * flight.driveFactor);
    flight.toLocalDirection(accel, local).divideScalar(RCS_THRUST * Math.max(0.25, flight.thrusterFactor));
    out.strafeX = THREE.MathUtils.clamp(local.x, -1, 1);
    out.strafeY = THREE.MathUtils.clamp(local.y, -1, 1);
    out.strafeZ = THREE.MathUtils.clamp(-local.z, -1, 1);
    return out;
  }

  /** How the goal moves, read off where its marker was a moment ago (an escort's barge, the parade's slot); still for a fixed one. */
  private readGoal(world: JobWorld, goal: THREE.Vector3, intent: Intent) {
    if (intent.moving) {
      this.goalVelocity.copy(intent.moving);
      return;
    }
    const since = world.now - this.lastGoalAt;
    if (since > 0 && since < 0.5 && goal.distanceTo(this.lastGoal) < 400 * since + 2000) {
      toGoal.subVectors(goal, this.lastGoal).divideScalar(since);
      this.goalVelocity.lerp(toGoal, 1 - exp(-since / GOAL_SMOOTH));
    } else if (since !== 0) this.goalVelocity.set(0, 0, 0);
    this.lastGoal.copy(goal);
    this.lastGoalAt = world.now;
  }

  /**
   * Where to fly for on the way to `goal`: straight at it where the way is clear of the field's
   * pieces, else by a point beside or over what is in the way, the first of a few the Host's eye
   * finds clear both ways (higher, and to either side, further and further out); with none, up.
   * Looked at again every RELAY_SECONDS, or once the goal moved RELAY.
   */
  private wayTo(world: JobWorld, goal: THREE.Vector3, out: THREE.Vector3) {
    const flight = this.me.flight;
    if (this.lineTo.distanceTo(goal) > RELAY || world.now - this.lineAt > RELAY_SECONDS || flight.position.distanceTo(this.via) < NEAR / 2) {
      this.lineTo.copy(goal);
      this.lineAt = world.now;
      this.plan(world, goal);
    }
    out.copy(this.direct ? goal : this.via);
    world.note = this.direct ? 'direct' : `via ${this.via.toArray().map(Math.round)}`;
  }

  private readonly via = new THREE.Vector3();
  private direct = true;

  private plan(world: JobWorld, goal: THREE.Vector3) {
    const from = this.me.flight.position;
    const room = this.me.radius + CLEAR_ROOM;
    this.direct = clearWay(world, from, goal, room);
    if (this.direct) return;
    world.field.gravity(from, upward).negate();
    if (upward.lengthSq() < 1e-6) upward.set(0, 1, 0);
    upward.normalize();
    side.crossVectors(middle.subVectors(goal, from), upward);
    if (side.lengthSq() < 1) side.set(1, 0, 0);
    side.normalize();
    middle.addVectors(from, goal).multiplyScalar(0.5);
    for (const lift of DETOURS) {
      for (const [up, across] of [[1, 0], [0.5, 1], [0.5, -1], [0, 1.5], [0, -1.5]]) {
        this.via.copy(middle).addScaledVector(upward, lift * up).addScaledVector(side, lift * across);
        if (clearWay(world, from, this.via, room) && clearWay(world, this.via, goal, room)) return;
      }
    }
    // no way round in one turn (out of a hall, round a wall): first wherever it can fly to that
    // brings it nearest the goal (up, ahead, behind, to the sides), and from there it looks again
    let best = Infinity;
    const flight = this.me.flight;
    const ways = [upward, flight.forward(new THREE.Vector3()), flight.forward(new THREE.Vector3()).negate(), side, side.clone().negate(), middle.subVectors(goal, from).setY(0).normalize()];
    for (const lift of DETOURS.slice(1, 4)) {
      for (const way of ways) {
        escape.copy(from).addScaledVector(way, lift);
        const left = escape.distanceTo(goal);
        if (left < best && clearWay(world, from, escape, room, 0)) {
          best = left;
          this.via.copy(escape);
        }
      }
    }
    if (best === Infinity) this.via.copy(from).addScaledVector(upward, DETOURS[1]);
  }

  /** A racer through a course of rings (or pipes, of `radius`), as the game's rivals fly theirs (see Game.raceRival, test/pilot flyRings). */
  private race(world: JobWorld, { points, normals, next, radius, closed }: NonNullable<Intent['race']>): Controls {
    const key = `${points.length}:${points[0].x}:${points[0].z}`;
    if (this.memo.course !== key) {
      this.memo.course = key;
      this.memo.line = new RacingLine(points.map((point) => point.clone()), closed, closed ? undefined : this.me.flight.position.clone());
    }
    const line = this.memo.line as RacingLine;
    const k = next % points.length;
    const flight = this.me.flight;
    const goal = line.target(flight.position, k, flight.velocity.length(), world.field, new THREE.Vector3());
    this.bot.waypoint = approachGate(points[k], normals[k], radius, flight.position, flight.velocity, this.me.radius, goal);
    this.bot.through = { center: points[k], facing: normals[k], radius };
    // a pipe's bore is narrower than a ring's opening and long: it is flown slower, lined up with it
    this.bot.raceSpeed = radius < RING_RADIUS ? PIPE_SPEED : RACE_SPEED;
    // it races as the rivals do: shooting whoever is ahead on its line, looking back at a chaser
    const thought = this.bot.think(world.now, [this.me, ...world.rivals], world.field);
    this.bot.waypoint = this.bot.through = null;
    return { ...thought };
  }

  /** Clears what the hands kept for the drill before. */
  reset() {
    this.memo = {};
    this.lineAt = -Infinity;
    this.goalVelocity.set(0, 0, 0);
    this.lastGoalAt = -Infinity;
  }
}

/**
 * The Host for a job: each step, the drill's own behavior if it has one, else the default: hold
 * still while a line is said, fight what is hostile when the drill's keys hold the trigger, fly a
 * course of rings through, fly to the drill's marker and hold there.
 */
export function host(behaviors: Record<number, Behavior> = {}): Host {
  let pilot: Pilot | null = null;
  let drill = -1;
  let attempt: JobWorld['attempt'] = null;
  return (world) => {
    if (!pilot || pilot.me !== world.me) pilot = new Pilot(world.me);
    // a new drill, or a new attempt or repetition of it: the hands start afresh
    if (world.drillIndex !== drill || world.attempt !== attempt) {
      drill = world.drillIndex;
      attempt = world.attempt;
      pilot.reset();
    }
    const behavior = behaviors[drill];
    return pilot.hands(world, behavior ? behavior(world, pilot) : standard(world, pilot));
  };
}

/** The default Host (see host). */
export const standard: Behavior = (world) => {
  const drill = world.mission.drills[world.drillIndex];
  const keys = drill?.keys ?? [];
  // a course of rings: a time trial's (it has a gold time) is flown once, a race's laps round its loop
  const course = world.course;
  if (course?.live) return { race: { points: course.points, normals: course.normals, next: course.next, radius: course.pipes ? PIPE_BORE : RING_RADIUS, closed: drill.gold === undefined } };
  // a marker on a hull of the drill's (the barge, the freighter, Patience) is escorted from above it, never flown into
  const goto = world.waypoint && world.school.touchesHull(hullProbe.copy(world.waypoint), ESCORT_PROBE, hullNormal) ? world.waypoint.clone().add(ESCORT_ABOVE) : world.waypoint;
  if (keys.includes('fire') && world.hostiles.length) return { fight: true, goto };
  if (goto) return { goto };
  // nothing to fly to: hold still where the clone is
  return world.me.flight.velocity.length() > REST ? { brake: true } : { goto: null };
};

/** The position of the nearest of `ships` to `me`, or null for none. */
function nearestOf(ships: readonly Ship[], me: Ship): THREE.Vector3 | null {
  let best: Ship | null = null;
  for (const ship of ships) if (!best || ship.flight.position.distanceToSquared(me.flight.position) < best.flight.position.distanceToSquared(me.flight.position)) best = ship;
  return best?.flight.position ?? null;
}
