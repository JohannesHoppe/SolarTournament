import * as THREE from 'three';
import type { Asteroid, AsteroidField } from '../world/asteroids';
import { CONTROLS, type Command, type Controls, type Device } from '../input/input';
import type { Ship } from '../ship/ship';
import { SUN_DIRECTION } from '../world/space';
import { SCHOOL, SCHOOL_PRAISE } from '../music/lines';
import { RacingLine } from './racingline';
import { ARENA_LIMIT } from '../world/arena';
import { GateKit, touchRing } from '../world/gates';
import { GATE_RADIUS } from './race';
import type { ItemKind } from './items';
import { msg, t } from '../i18n/i18n';

/** What a flight school drill can see and do. */
export interface SchoolContext {
  me: Ship;
  controls: Controls;
  /** The pilot holds the brake (the flight computer flips and burns). */
  braking: boolean;
  /** The own hook holds on to something. */
  hooked: boolean;
  /** The impact warning is on. */
  impactAhead: boolean;
  /** The autopilot takes out the drift across the nose; off, the ship drifts freely. */
  autopilot: boolean;
  /** The camera sits in the cockpit instead of behind the ship. */
  cockpit: boolean;
  /** What the Host flies with; touch has no fine aim. */
  device: Device;
  field: AsteroidField;
  now: number;
  dt: number;
  /** The target drone, once a drill has spawned it. */
  drone: Ship | null;
  /** Places the target drone at a point, drifting with a velocity, its drive towards the pilot. */
  spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3): void;
  /** The sparring bot of the final exam. */
  bot: Ship | null;
  /** A bot at a point; an unarmed one only flees. Skill as in Bot (0..1). */
  spawnBot(position: THREE.Vector3, armed: boolean, skill: number): void;
  removeBot(): void;
  /** A laser shot from a point through a target point, for show: it costs no hull, a hit only sparks and shakes the link. */
  fireAt(from: THREE.Vector3, through: THREE.Vector3): void;
  /** A coil throws the pilot on along a direction (either way, as it flies), as a race's gate does. */
  boost(through: THREE.Vector3): void;
  /** Hands the pilot's clone two torpedoes, or a nova core. */
  arm(item: 'torpedo' | 'nova'): void;
  /** A torpedo from a ship (the drone), homing on the pilot. */
  torpedoAt(from: Ship): void;
  /** Torpedoes in flight, where the first of them is, and how many the pilot has shot down so far. */
  readonly torpedoes: number;
  readonly incoming: THREE.Vector3 | null;
  readonly torpedoesDown: number;
  /** How many of the pilot's torpedoes have hit a ship so far. */
  readonly torpedoesHit: number;
  /** A torpedo in flight still homes on the pilot. */
  readonly tracked: boolean;
  /** How many dodges the pilot has fired so far. */
  readonly dodges: number;
  /** Sends a comet (see comet.ts) along `direction` through `through`, its head there a few seconds from now; null clears it. */
  launchComet(through: THREE.Vector3 | null, direction?: THREE.Vector3): void;
  /** The comet the drill sent has passed, its shower gone by (true without one). */
  readonly cometGone: boolean;
  /** A probe carrying an item at a point; returns where it drifts. */
  spawnProbe(position: THREE.Vector3, kind: ItemKind): THREE.Vector3;
  /** A number of a countdown, or (`start`) the start word, in big neon. */
  countdown(text: string, start: boolean): void;
  /** The drive lit on BURN!: a perfect start's shove; lit too early: the drive stalls. */
  perfectStart(): void;
  stall(): void;
  /** The flight computer is still talking. */
  speaking: boolean;
  /** The flight computer says lines, one after the other, after whatever it is saying; false when it could not speak yet (voice still loading, audio not yet allowed). */
  say(lines: string[]): boolean;
}

/** The running state of one attempt at a drill. */
interface Attempt {
  /** Repetition of the drill, from 0. */
  rep: number;
  /** The instruction has been said and the drill's props are out: from now on the attempt counts. */
  live: boolean;
  seconds: number;
  /** Seconds a condition has held without interruption (see holdFor). */
  held: number;
  /** The pilot's nose when the attempt began, for drills that forbid turning. */
  forward: THREE.Vector3;
  /** Points of the drill: markers, the ring course, the debris, a rock. */
  points: THREE.Vector3[];
  /** Facing of each ring of the course. */
  normals: THREE.Vector3[];
  /** Index of the next ring of the course. */
  next: number;
  /** The ideal line through the rings of the course, from where the pilot started (see layRings). */
  track: RacingLine | null;
  /** Signed distance of the pilot to the plane of the next ring, the frame before (NaN: no frame yet for this ring). */
  side: number;
  /** The impact warning has come up in this attempt. */
  warned: boolean;
  /** The pilot used the S brake in this attempt; a brake still held from the drill before only counts once let go. */
  usedBrake: boolean;
  brakeLetGo: boolean;
  /** Distance the attempt started from its target (units). */
  reach: number;
  /** The side the pilot last pushed to with the thrusters (-1 left, 1 right, 0 not yet), and how often it changed. */
  jinkSide: number;
  jinks: number;
  /** When a drill's gunner fired last (attempt seconds). */
  lastShot: number;
  /** The start drill: the drive is lit and since when (attempt seconds), the number of the countdown shown, and a drive lit too early. */
  lit: boolean;
  litAt: number;
  count: number;
  early: boolean;
  /** When the drill was done in this attempt (attempt seconds; NaN: not yet), see SURVIVE. */
  doneAt: number;
}

interface Drill {
  /** Said and shown when the drill begins. */
  line: string;
  /** Said once the drill is mastered: praise and the physics behind it. */
  praise?: string;
  /** What the pilot uses in this drill; the panel shows the keys of the Host's device. */
  keys: Command[];
  reps?: number;
  /** Said instead of `line` from the second repetition on. */
  repLine?: string;
  enter?(ctx: SchoolContext, attempt: Attempt, markers: Markers): void;
  done(ctx: SchoolContext, attempt: Attempt, markers: Markers): boolean;
  /** A line when the attempt failed; the attempt then starts over. */
  fail?(ctx: SchoolContext, attempt: Attempt): string | null;
  leave?(ctx: SchoolContext): void;
  /** A point the HUD marks for the pilot. */
  waypoint?(ctx: SchoolContext, attempt: Attempt): THREE.Vector3 | null;
  /** What the waypoint is, written under it. */
  mark?(ctx: SchoolContext, attempt: Attempt): string;
  /** The autopilot setting the drill leaves behind, so a flight school resumed later starts with it. */
  autopilotAfter?: boolean;
  /** The drill does not apply to the Host's device: it is passed over without a word. */
  skip?(ctx: SchoolContext): boolean;
}


/** 50 m/s and 5 m/s in world units (1 unit = 5 cm). */
const FAST = 1000;
const STOPPED = 100;
/** Ring radius of the course: a race's gate (120 m), so the rings fly as a race does. */
export const RING_RADIUS = GATE_RADIUS;
/** Radius of the zone the stop drill wants the ship to rest in: 200 m, shown as a sphere around the marker. */
const STOP_RADIUS = 4000;
/** At rest in the stop drill means slower than this: 10 m/s. */
const STOP_SPEED = 200;
/** Radius of the debris of the dodge drill: 15 m. */
const DEBRIS_RADIUS = 300;
/** Speed of the debris: 60 m/s. */
const DEBRIS_SPEED = 1200;
/** Turning more than this (rad, about 45°) breaks a drill that forbids turning; a mouse pointer slightly off-center does not get there. */
const NO_TURN = 0.8;
/** The jinking drill's gunner fires every GUNNER_INTERVAL seconds at where the ship was GUNNER_LAG seconds ago (a smoothing time constant). */
const GUNNER_INTERVAL = 0.7;
const GUNNER_LAG = 0.35;
/** Changes of side the jinking drill wants: left, right, left, right, left. */
const JINKS = 4;
/** A drill done counts only once the clone has lived through it this long after (s): dying right after is no success. */
const SURVIVE = 1.5;
/** A drill waits this long for the voice to say its lines (s), then goes on without. */
const UNSAID_PATIENCE = 10;
/**
 * The rings of the ring drill, in the pilot's frame (units): a gentle slalom, the rings about
 * 830 m apart, close to a race's gates (about 1.1 km), so there is room to turn at race speed.
 */
export const RING_COURSE: readonly [number, number, number][] = [
  [0, 0, -8000],
  [3500, 1500, -24000],
  [1000, 4000, -40000],
  [-2500, 2000, -52000],
];
/** The rings of the coil drill: three in a long, almost straight line 1.1 km apart, so the speed a coil gives leaves time to line up for the next. */
export const COIL_COURSE: readonly [number, number, number][] = [
  [0, 0, -8000],
  [1000, 500, -30000],
  [-800, 1000, -52000],
];
/** A ring course lies within this share of the arena's edge (see ringCourse); both courses (2.6 km) fit ahead of a pilot in the middle. */
export const COURSE_ROOM = 0.85;
/** A pilot this far from the next ring (units, 2.5 km) has lost the course and starts again. */
const COURSE_LOST = 50000;
/** A coil fires for a pilot through this share of its ring's radius, as a race's gates do (see race.ts). */
export const CORE_SHARE = 1 / 3;
/** The start drill counts down to BURN! at this second of the attempt; the drive has to light at most START_EARLY before it and START_LATE after it, as in a race. */
const START_GO = 3;
const START_EARLY = 0.3;
const START_LATE = 0.2;
/** The hook drill wants the pilot to fly off faster than this when it lets go (units/s, 65 m/s): 1.3 times the drift it started with, a few seconds of reeling. */
export const HOOK_FLING = 1300;
/** The hook drill starts this far off the rock's farthest reach (units, 500 m): cable enough to gain speed on any rock. */
export const HOOK_STANDOFF = 10000;
/** The overdrive drill wants the ship past this speed from rest (units/s, 140 m/s): the overdrive's shove, nearly all of it. */
const OVERDRIVE_FAST = 2800;
/** The ship hooked in the hook drill of the arsenal counts as reeled in this close (units, 300 m). */
const HOOKED_CLOSE = 6000;
/** The debris of the dodge kick drill: 150 m/s from 600 m off, four seconds, too fast to slide out of its way in time. */
const KICK_DEBRIS_SPEED = 3000;
const KICK_DEBRIS_START = 12000;
/** The cover drills put the pilot this far off the surface of a rock (units, 150 m), the gunner or the torpedo's drone this far behind the pilot (1.2 km). */
const COVER_STANDOFF = 3000;
const COVER_GUNNER = 24000;
/** Seconds out of the gunner's sight the cover drill wants. */
const COVER_HOLD = 3;
/** The comet drill's route passes this far above the pilot (units, 150 m): its head goes over, its shower engulfs it. */
const COMET_ABOVE = 3000;
/** The comet drill fails once the drive is down to this share: two pieces into it. */
const COMET_DRIVE = 0.7;
/** Skill of the tactician's sparring bots (see Bot): the one on the tail, the one for bursts, the hunter of the cover drill, and the exam's, as good as the middling bot of the field. */
const TAIL_SKILL = 0.15;
const BURST_SKILL = 0.25;
const HUNTER_SKILL = 0.5;
const EXAM_SKILL = 0.5;


const scratch = new THREE.Vector3();
const toTarget = new THREE.Vector3();

/** A point given in the pilot's frame (-Z ahead, +X right, +Y up), in world space. */
function ahead(ctx: SchoolContext, x: number, y: number, z: number) {
  return ctx.me.flight.toWorld(new THREE.Vector3(x, y, z));
}

/** A world point in the pilot's frame. */
function local(ctx: SchoolContext, point: THREE.Vector3, target = scratch) {
  return ctx.me.flight.toLocal(point, target);
}

/** Angle between the pilot's nose and a point (rad). */
function aimError(ctx: SchoolContext, point: THREE.Vector3) {
  return ctx.me.flight.angleTo(toTarget.copy(point).sub(ctx.me.flight.position));
}

/** Moves a point out of any asteroid, so markers never sit inside rock. */
function clear(ctx: SchoolContext, point: THREE.Vector3, radius: number) {
  for (let i = 0; i < 12 && ctx.field.overlap(point, radius); i++) point.add(scratch.randomDirection().multiplyScalar(radius * 2));
  return point;
}

/** Counts seconds the condition has held without interruption. */
function holdFor(ctx: SchoolContext, attempt: Attempt, condition: boolean, seconds: number) {
  attempt.held = condition ? attempt.held + ctx.dt : 0;
  return attempt.held >= seconds;
}

function stop(ctx: SchoolContext) {
  ctx.me.flight.velocity.set(0, 0, 0);
  ctx.me.flight.angularVelocity.set(0, 0, 0);
}

/** Sets the pilot drifting along a direction, or along the nose. */
function drift(ctx: SchoolContext, speed: number, direction?: THREE.Vector3) {
  const flight = ctx.me.flight;
  flight.velocity.copy(direction ?? flight.forward()).normalize().multiplyScalar(speed);
  flight.angularVelocity.set(0, 0, 0);
}

/** The pilot has lost a ring course: too far from its next ring (see COURSE_LOST). */
const lost = (ctx: SchoolContext, attempt: Attempt) => ctx.me.flight.position.distanceTo(attempt.points[Math.min(attempt.next, attempt.points.length - 1)]) > COURSE_LOST;
const turned = (ctx: SchoolContext, attempt: Attempt) => ctx.me.flight.angleTo(attempt.forward) > NO_TURN;
const speed = (ctx: SchoolContext) => ctx.me.flight.velocity.length();

/** A point in the shadow of the asteroid nearest to the pilot. */
function nearestShadow(ctx: SchoolContext): THREE.Vector3 | null {
  const asteroid = nearestAsteroid(ctx);
  return asteroid && scratch.copy(asteroid.object.position).addScaledVector(SUN_DIRECTION, -(asteroid.radius + 1500));
}

function nearestAsteroid(ctx: SchoolContext): Asteroid | null {
  let best: Asteroid | null = null;
  let bestDistance = Infinity;
  for (const asteroid of ctx.field.asteroids.values()) {
    const distance = asteroid.object.position.distanceTo(ctx.me.flight.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = asteroid;
    }
  }
  return best;
}

/**
 * Puts the pilot `standoff` units off the surface of a rock, between it and the field's
 * center, facing it: the nearest rock whose spot lies in open space and whose way there no
 * other rock blocks. Returns the rock and the way from the center out to it; null for none.
 */
function faceRock(ctx: SchoolContext, standoff: number): { rock: Asteroid; outward: THREE.Vector3 } | null {
  const flight = ctx.me.flight;
  const rocks = [...ctx.field.asteroids.values()].sort((p, q) => p.object.position.distanceTo(flight.position) - q.object.position.distanceTo(flight.position));
  const start = new THREE.Vector3();
  const outward = new THREE.Vector3();
  for (const rock of rocks) {
    outward.copy(rock.object.position).normalize();
    start.copy(rock.object.position).addScaledVector(outward, -(rock.radius + standoff));
    if (ctx.field.overlap(start, ctx.me.radius * 4)) continue;
    if (ctx.field.raycast(start, outward, Infinity)?.asteroid !== rock) continue;
    flight.position.copy(start);
    flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(start, rock.object.position, new THREE.Vector3(0, 1, 0)));
    return { rock, outward };
  }
  return null;
}

const TURN_MARKERS: [number, number, number][] = [
  [0.55, 0.1, -1],
  [-0.5, 0.45, -1],
  [0.8, -0.35, 0.3],
];

/** A drill that only says its line: a course's opening or closing words. */
const saying = (line: string): Drill => ({
  line,
  keys: [],
  done: (ctx, a) => (a.seconds > 2 && !ctx.speaking) || a.seconds > 30,
});

/**
 * Whether the pilot flew through the attempt's next ring this frame, either way: how far from
 * its center, or null. The ring then counts as passed.
 */
function passRing(ctx: SchoolContext, a: Attempt): number | null {
  const normal = a.normals[a.next];
  const offset = toTarget.copy(ctx.me.flight.position).sub(a.points[a.next]);
  const side = offset.dot(normal);
  const crossed = Number.isFinite(a.side) && a.side < 0 !== side < 0;
  a.side = side;
  if (!crossed) return null;
  const off = offset.addScaledVector(normal, -side).length();
  if (off >= RING_RADIUS) return null;
  a.next++;
  a.side = NaN;
  return off;
}

/**
 * Where the rings of a course (in the pilot's frame) lie for a pilot at `position` turned by
 * `orientation`: ahead of it, or, where they would reach out beyond COURSE_ROOM of the arena's
 * edge, towards the arena's center instead, and the pilot turns to the first ring.
 */
export function ringCourse(position: THREE.Vector3, orientation: THREE.Quaternion, course: readonly (readonly [number, number, number])[]): THREE.Vector3[] {
  const frame = orientation.clone();
  const place = ([x, y, z]: readonly [number, number, number]) => new THREE.Vector3(x, y, z).applyQuaternion(frame).add(position);
  if (position.lengthSq() > 1 && course.some((point) => place(point).length() > ARENA_LIMIT * COURSE_ROOM)) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
    frame.setFromRotationMatrix(new THREE.Matrix4().lookAt(position, new THREE.Vector3(), up));
  }
  return course.map(place);
}

/** Lays out a course of rings for the pilot (see ringCourse), each facing the way from the one before. */
function layRings(ctx: SchoolContext, a: Attempt, markers: Markers, course: readonly [number, number, number][]) {
  stop(ctx);
  a.points = ringCourse(ctx.me.flight.position, ctx.me.flight.orientation, course).map((point) => clear(ctx, point, RING_RADIUS * 1.5));
  a.normals = a.points.map((point, i) => point.clone().sub(i === 0 ? ctx.me.flight.position : a.points[i - 1]).normalize());
  a.points.forEach((point, i) => markers.ring(point, a.normals[i]));
  a.track = new RacingLine(a.points, false, ctx.me.flight.position);
  markers.highlight(0);
}

const DRILL = {
  briefing: saying(SCHOOL.briefing),
  turn: {
    line: SCHOOL.turn,
    praise: SCHOOL_PRAISE.turn,
    keys: ['turn'],
    reps: TURN_MARKERS.length,
    enter(ctx, a, markers) {
      stop(ctx);
      const [x, y, z] = TURN_MARKERS[a.rep];
      a.points = [markers.buoy(ahead(ctx, x, y, z).sub(ctx.me.flight.position).setLength(3000).add(ctx.me.flight.position))];
    },
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < 0.05, 0.4),
    waypoint: (_, a) => a.points[0],
    mark: () => t('Target'),
  },
  fineAim: {
    line: SCHOOL.fineAim,
    praise: SCHOOL_PRAISE.fineAim,
    keys: ['fine'],
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(ahead(ctx, 0.12, -0.07, -1).sub(ctx.me.flight.position).setLength(8000).add(ctx.me.flight.position), 0.5)];
    },
    // touch sticks have no fine aim: there the marker only has to sit in the crosshair
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < (ctx.device === 'touch' ? 0.04 : 0.015), 0.8),
    waypoint: (_, a) => a.points[0],
    mark: () => t('Target'),
  },
  cockpit: {
    line: SCHOOL.cockpit,
    praise: SCHOOL_PRAISE.cockpit,
    keys: ['camera'],
    // touch screens have no camera switch: there the drill is not given at all
    skip: (ctx) => ctx.device === 'touch',
    // in, then out again
    done(ctx, a) {
      if (ctx.cockpit) a.next = 1;
      return a.next === 1 && !ctx.cockpit;
    },
  },
  drive: {
    line: SCHOOL.drive,
    praise: SCHOOL_PRAISE.drive,
    keys: ['drive'],
    enter: (ctx) => stop(ctx),
    done: (ctx) => speed(ctx) >= FAST,
  },
  brake: {
    line: SCHOOL.brake,
    praise: SCHOOL_PRAISE.brake,
    keys: ['brake'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST * 1.2, speed(ctx) > 10 ? ctx.me.flight.velocity : undefined);
    },
    done: (ctx) => speed(ctx) < STOPPED,
  },
  rings: {
    line: SCHOOL.rings,
    praise: SCHOOL_PRAISE.rings,
    keys: ['drive', 'brake', 'flip'],
    enter: (ctx, a, markers) => layRings(ctx, a, markers, RING_COURSE),
    done(ctx, a, markers) {
      if (passRing(ctx, a) === null) return false;
      markers.highlight(a.next);
      return a.next >= a.points.length;
    },
    fail: (ctx, a) => (lost(ctx, a) ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => t('Ring {n}/{total}', { n: a.next + 1, total: a.points.length }),
  },
  // the rings of a race are coils: only their core throws a ship on
  coil: {
    line: SCHOOL.coil,
    praise: SCHOOL_PRAISE.coil,
    keys: ['drive', 'turn', 'fine'],
    enter: (ctx, a, markers) => layRings(ctx, a, markers, COIL_COURSE),
    done(ctx, a, markers) {
      const off = passRing(ctx, a);
      if (off === null) return false;
      markers.highlight(a.next);
      if (off < RING_RADIUS * CORE_SHARE) ctx.boost(a.normals[a.next - 1]);
      else a.warned = true;
      return a.next >= a.points.length && !a.warned;
    },
    fail: (ctx, a) => (a.warned ? SCHOOL.coilMiss : lost(ctx, a) ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => t('Core {n}/{total}', { n: a.next + 1, total: a.points.length }),
  },
  // the race's start: the clamps hold the ship until BURN!, and the drive must light on it
  start: {
    line: SCHOOL.start,
    praise: SCHOOL_PRAISE.start,
    keys: ['drive'],
    enter: (ctx) => stop(ctx),
    done(ctx, a) {
      const lit = ctx.controls.thrust > 0;
      if (lit && !a.lit) a.litAt = a.seconds;
      a.lit = lit;
      const count = Math.max(0, Math.ceil(START_GO - a.seconds));
      if (count !== a.count) {
        ctx.countdown(count > 0 ? String(count) : t('BURN!'), count === 0);
        a.count = count;
      }
      if (count > 0) {
        stop(ctx);
        return false;
      }
      if (!lit) return false;
      if (a.litAt >= START_GO - START_EARLY) {
        ctx.perfectStart();
        return true;
      }
      if (!a.early) ctx.stall();
      a.early = true;
      return false;
    },
    fail: (_, a) => (a.early ? SCHOOL.tooEarly : a.seconds > START_GO + START_LATE ? SCHOOL.tooLate : null),
  },
  // the hook: bite a rock while drifting past it, swing around it, and fly off when let go
  hook: {
    line: SCHOOL.hook,
    praise: SCHOOL_PRAISE.hook,
    keys: ['hook', 'turn'],
    enter(ctx, a) {
      stop(ctx);
      const facing = faceRock(ctx, HOOK_STANDOFF);
      if (!facing) return;
      // drifting past the rock sideways, so the cable swings the ship around it
      drift(ctx, 1000, new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation));
      a.points = [facing.rock.object.position];
    },
    done(ctx, a) {
      if (!a.points.length) return true;
      if (ctx.hooked) a.warned = true;
      return a.warned && !ctx.hooked && speed(ctx) > HOOK_FLING;
    },
    fail(ctx, a) {
      if (a.warned && !ctx.hooked && speed(ctx) <= HOOK_FLING) return SCHOOL.hookSlow;
      return a.points.length && ctx.me.flight.position.distanceTo(a.points[0]) > 40000 ? SCHOOL.again : null;
    },
    waypoint: (_, a) => a.points[0] ?? null,
    mark: () => t('Hook it'),
  },
  shoot: atDrone(SCHOOL.shoot, SCHOOL_PRAISE.shoot, 6000),
  shootMoving: {
    line: SCHOOL.shootMoving,
    praise: SCHOOL_PRAISE.shootMoving,
    keys: ['fire', 'fine'],
    enter(ctx) {
      stop(ctx);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation);
      ctx.spawnDrone(ahead(ctx, -2500, 0, -7000), right.multiplyScalar(450));
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    fail: (ctx) => (ctx.drone && ctx.drone.flight.position.distanceTo(ctx.me.flight.position) > 20000 ? SCHOOL.again : null),
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => t('Drone'),
  },
  overheat: {
    line: SCHOOL.overheat,
    praise: SCHOOL_PRAISE.overheat,
    keys: ['fire'],
    // a laser still hot from the last drill would pass this one before the first shot
    enter(ctx) {
      stop(ctx);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
    },
    done: (ctx) => ctx.me.overheated,
  },
  shadow: {
    line: SCHOOL.shadow,
    praise: SCHOOL_PRAISE.shadow,
    keys: ['drive', 'brake'],
    done: (ctx, a) => holdFor(ctx, a, ctx.me.inShadow, 1),
    waypoint: (ctx) => nearestShadow(ctx),
    mark: () => t('Shadow'),
  },
  impact: {
    line: SCHOOL.impact,
    praise: SCHOOL_PRAISE.impact,
    keys: ['brake', 'slide'],
    enter(ctx, a) {
      // between a rock and the field's center, heading for the rock at 100 m/s
      const facing = faceRock(ctx, 14000);
      if (!facing) return;
      drift(ctx, 2000, facing.outward);
      a.points = [facing.rock.object.position];
      a.reach = ctx.me.flight.position.distanceTo(facing.rock.object.position);
    },
    done(ctx, a) {
      a.warned ||= ctx.impactAhead;
      if (!a.points.length) return true;
      const away = toTarget.copy(a.points[0]).sub(ctx.me.flight.position).dot(ctx.me.flight.velocity) < 0;
      // braking before the warning even comes up is good flying too; sliding past only
      // counts once the warning has been seen
      return holdFor(ctx, a, !ctx.impactAhead && (speed(ctx) < STOPPED || (away && a.warned)), 1);
    },
    // slid past without ever being warned: the lesson did not happen, once more
    fail: (ctx, a) => (a.points.length && !a.warned && ctx.me.flight.position.distanceTo(a.points[0]) > a.reach + 3000 ? SCHOOL.again : null),
  },
  // free drift: flying like a real spaceship, for the dogfight
  freeDrift: {
    line: SCHOOL.freeDrift,
    praise: SCHOOL_PRAISE.freeDrift,
    keys: ['autopilot'],
    done: (ctx) => !ctx.autopilot,
    autopilotAfter: false,
  },
  drift: {
    line: SCHOOL.drift,
    praise: SCHOOL_PRAISE.drift,
    keys: [],
    // a fresh clone (after a crash) starts at rest: it gets the drift it would have had
    enter(ctx) {
      if (speed(ctx) < FAST / 2) drift(ctx, FAST);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.controls.thrust === 0 && speed(ctx) > FAST / 2, 2.5),
  },
  lookBack: {
    line: SCHOOL.lookBack,
    praise: SCHOOL_PRAISE.lookBack,
    keys: ['turn'],
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.angleTo(ctx.me.flight.velocity) > 2.4, 1),
    // without drift there is no course to look away from
    fail: (ctx) => (speed(ctx) < FAST * 0.3 ? SCHOOL.again : null),
  },
  flipBurn: {
    line: SCHOOL.flipBurn,
    praise: SCHOOL_PRAISE.flipBurn,
    repLine: SCHOOL.flipBurnAgain,
    keys: ['flip', 'drive'],
    reps: 2,
    enter: (ctx, a) => drift(ctx, a.rep === 0 ? 1500 : 2400),
    // counts once the burn has taken out the drift along the course; a burn by hand never
    // hits the flight direction exactly, so some sideways drift is allowed to remain
    done: (ctx, a) => ctx.me.flight.velocity.dot(a.forward) < STOPPED && !a.usedBrake,
    // stopping with the S brake does not count; the attempt starts over once the ship is at rest
    fail(ctx, a) {
      a.brakeLetGo ||= !ctx.braking;
      a.usedBrake ||= ctx.braking && a.brakeLetGo;
      return a.usedBrake && speed(ctx) < STOPPED ? SCHOOL.byHand : null;
    },
  },
  stopAt: {
    line: SCHOOL.stopAt,
    praise: SCHOOL_PRAISE.stopAt,
    repLine: SCHOOL.stopAtFar,
    keys: ['drive', 'flip', 'brake'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(clear(ctx, a.rep === 0 ? ahead(ctx, 0, 0, -10000) : ahead(ctx, 3000, 1500, -18000), STOP_RADIUS))];
      markers.zone(a.points[0], STOP_RADIUS);
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.flight.position.distanceTo(a.points[0]) < STOP_RADIUS && speed(ctx) < STOP_SPEED, 0.3),
    fail: (ctx, a) => (ctx.me.flight.position.distanceTo(a.points[0]) > 30000 ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[0],
    mark: () => t('Stop here'),
  },
  slide: {
    line: SCHOOL.slide,
    praise: SCHOOL_PRAISE.slide,
    keys: ['slide'],
    // a gunner on the pilot's tail fires where the ship was a moment ago: jinking left and
    // right with the thrusters is what makes the shots go past; turning and drift do not matter
    enter(ctx, a) {
      stop(ctx);
      a.points = [ctx.me.flight.position.clone()];
    },
    done(ctx, a) {
      const push = ctx.controls.strafeX;
      const side = push > 0.5 ? 1 : push < -0.5 ? -1 : 0;
      if (side && side !== a.jinkSide) {
        if (a.jinkSide) a.jinks++;
        a.jinkSide = side;
      }
      a.points[0].lerp(ctx.me.flight.position, 1 - Math.exp(-ctx.dt / GUNNER_LAG));
      if (a.seconds - a.lastShot > GUNNER_INTERVAL) {
        a.lastShot = a.seconds;
        ctx.fireAt(ahead(ctx, (Math.random() - 0.5) * 3000, 800, 12000), a.points[0]);
      }
      return a.jinks >= JINKS;
    },
  },
  dodge: debris(SCHOOL.dodge, SCHOOL_PRAISE.dodge, 9000, DEBRIS_SPEED, false),
  autopilotOn: {
    line: SCHOOL.autopilotOn,
    praise: SCHOOL_PRAISE.autopilotOn,
    keys: ['autopilot'],
    done: (ctx) => ctx.autopilot,
    autopilotAfter: true,
  },
  chase: sparring(SCHOOL.chase, SCHOOL_PRAISE.chase, ['drive', 'brake', 'fire'], false, 0.1),
  evade: sparring(SCHOOL.evade, SCHOOL_PRAISE.evade, ['slide', 'fire'], true, 0.05),
  duel: sparring(SCHOOL.duel, SCHOOL_PRAISE.duel, ['drive', 'brake', 'slide', 'fire'], true, 0.2),
  // the arsenal: what a clone carries besides its laser, and what it finds out there
  torpedo: {
    line: SCHOOL.torpedo,
    praise: SCHOOL_PRAISE.torpedo,
    keys: ['turn', 'torpedo'],
    enter(ctx, a) {
      stop(ctx);
      ctx.arm('torpedo');
      ctx.spawnDrone(clear(ctx, ahead(ctx, 3000, 1500, -24000), 2000), new THREE.Vector3());
      a.count = ctx.torpedoesHit;
    },
    // a torpedo's hit, not the laser's
    done: (ctx, a) => ctx.torpedoesHit > a.count,
    // both launched without a lock, or both gone past
    fail: (ctx) => (ctx.me.torpedoes === 0 && ctx.torpedoes === 0 ? SCHOOL.again : null),
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => t('Lock on'),
  },
  torpedoDown: {
    line: SCHOOL.torpedoDown,
    praise: SCHOOL_PRAISE.torpedoDown,
    keys: ['turn', 'fine', 'fire'],
    enter(ctx, a) {
      stop(ctx);
      incoming(ctx, a, clear(ctx, ahead(ctx, 0, 0, -30000), 2000));
    },
    done: (ctx, a) => launched(ctx, a) && ctx.torpedoesDown > a.count,
    fail: (ctx, a) => (ctx.me.hull < a.reach || (a.lit && ctx.torpedoes === 0 && ctx.torpedoesDown === a.count) ? SCHOOL.torpedoHit : null),
    waypoint: (ctx) => ctx.incoming,
    mark: () => t('Torpedo'),
  },
  overdrive: {
    line: SCHOOL.overdrive,
    praise: SCHOOL_PRAISE.overdrive,
    keys: ['overdrive'],
    enter: (ctx) => stop(ctx),
    done: (ctx) => speed(ctx) > OVERDRIVE_FAST,
  },
  probe: {
    line: SCHOOL.probe,
    praise: SCHOOL_PRAISE.probe,
    keys: ['turn', 'drive', 'brake'],
    enter(ctx, a) {
      stop(ctx);
      a.count = ctx.me.torpedoes;
      a.points = [ctx.spawnProbe(clear(ctx, ahead(ctx, 0, 0, -8000), 1000), 'torpedoes')];
    },
    done: (ctx, a) => ctx.me.torpedoes > a.count,
    fail: (ctx, a) => (ctx.me.flight.position.distanceTo(a.points[0]) > 30000 ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[0] ?? null,
    mark: () => t('Probe'),
  },
  hookShip: {
    line: SCHOOL.hookShip,
    praise: SCHOOL_PRAISE.hookShip,
    keys: ['turn', 'hook'],
    enter(ctx) {
      stop(ctx);
      ctx.spawnBot(clear(ctx, ahead(ctx, 0, 0, -12000), 2000), false, 0.2);
    },
    done: (ctx) => ctx.hooked && !!ctx.bot && ctx.bot.flight.position.distanceTo(ctx.me.flight.position) < HOOKED_CLOSE,
    leave: (ctx) => ctx.removeBot(),
    waypoint: (ctx) => (ctx.bot?.alive ? ctx.bot.flight.position : null),
    mark: () => t('Hook it'),
  },
  nova: atDrone(SCHOOL.nova, SCHOOL_PRAISE.nova, 10000, true),
  // the tactician: how to win a dogfight, and how not to lose one
  // past fast debris with a dodge: sliding alone does not get there in time
  kick: debris(SCHOOL.kick, SCHOOL_PRAISE.kick, KICK_DEBRIS_START, KICK_DEBRIS_SPEED, true),
  // a bot sits on the pilot's tail and fires: the armored nose has to come round to it
  onTail: sparring(SCHOOL.onTail, SCHOOL_PRAISE.onTail, ['turn', 'slide', 'fire'], true, TAIL_SKILL, 6000),
  // a kill without ever overheating the laser
  bursts: {
    ...sparring(SCHOOL.bursts, SCHOOL_PRAISE.bursts, ['fire'], true, BURST_SKILL),
    fail: (ctx) => (ctx.me.overheated ? SCHOOL.tooHot : null),
  },
  // a better bot hunts the pilot: a rock between them hides the pilot from its sensors
  cover: {
    line: SCHOOL.cover,
    praise: SCHOOL_PRAISE.cover,
    keys: ['drive', 'slide'],
    enter(ctx, a) {
      const behind = takeCover(ctx, a);
      if (behind) ctx.spawnBot(behind, true, HUNTER_SKILL);
    },
    done: (ctx, a) => !a.points.length || holdFor(ctx, a, !!ctx.bot && !ctx.field.lineOfSight(ctx.bot.flight.position, ctx.me.flight.position), COVER_HOLD),
    leave: (ctx) => ctx.removeBot(),
    waypoint: (_, a) => a.points[1] ?? null,
    mark: () => t('Cover'),
  },
  // a torpedo homes on the pilot: a rock between them breaks its lock for good
  torpedoCover: {
    line: SCHOOL.torpedoCover,
    praise: SCHOOL_PRAISE.torpedoCover,
    keys: ['drive', 'slide'],
    enter(ctx, a) {
      const behind = takeCover(ctx, a);
      if (behind) incoming(ctx, a, behind);
    },
    done: (ctx, a) => !a.points.length || (launched(ctx, a) && !ctx.tracked),
    fail(ctx, a) {
      if (ctx.me.hull < a.reach) return SCHOOL.torpedoCoverHit;
      return ctx.torpedoesDown > a.count ? SCHOOL.hideInstead : null;
    },
    waypoint: (_, a) => a.points[1] ?? null,
    mark: () => t('Cover'),
  },
  // a comet passes above the pilot from its right: its shower is the danger; the lee of the
  // rock, or the armored nose turned into it, the answer
  comet: {
    line: SCHOOL.comet,
    praise: SCHOOL_PRAISE.comet,
    keys: ['turn', 'drive', 'slide'],
    enter(ctx, a) {
      takeCover(ctx, a);
      if (!a.points.length) return;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.me.flight.orientation);
      ctx.launchComet(ctx.me.flight.position.clone().addScaledVector(up, COMET_ABOVE), right.negate());
    },
    done: (ctx, a) => !a.points.length || ctx.cometGone,
    fail: (ctx) => (ctx.me.alive && ctx.me.drive < COMET_DRIVE ? SCHOOL.cometDrive : null),
    leave: (ctx) => ctx.launchComet(null),
    waypoint: (_, a) => a.points[1] ?? null,
    mark: () => t('Cover'),
  },
  exam: sparring(SCHOOL.exam, SCHOOL_PRAISE.exam, ['drive', 'brake', 'slide', 'dodge', 'fire'], true, EXAM_SKILL),
} satisfies Record<string, Drill>;

/** A drone at a point that launches a torpedo at the pilot once the drill counts (see launched); the attempt keeps the hull and the torpedoes shot down so far. */
function incoming(ctx: SchoolContext, a: Attempt, from: THREE.Vector3) {
  ctx.spawnDrone(from, new THREE.Vector3());
  a.count = ctx.torpedoesDown;
  a.reach = ctx.me.hull;
}

/** Launches the drone's torpedo the first time it is asked; false then, true once it flies. */
function launched(ctx: SchoolContext, a: Attempt): boolean {
  if (a.lit) return true;
  if (ctx.drone) ctx.torpedoAt(ctx.drone);
  a.lit = true;
  return false;
}

/**
 * Sets up a cover drill: the pilot off a rock, facing it (see faceRock), the gunner or drone off
 * to the pilot's right, and the attempt's points the rock and the spot in its lee, ahead and to
 * the left: a slanting dash of about 1.4 times the rock's reach, a few seconds of burn, where
 * going round the far side of a rock would take longer than a torpedo. Returns where the gunner
 * or drone goes, or null without a rock.
 */
function takeCover(ctx: SchoolContext, a: Attempt): THREE.Vector3 | null {
  stop(ctx);
  const facing = faceRock(ctx, COVER_STANDOFF);
  if (!facing) return null;
  const rock = facing.rock;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.me.flight.orientation);
  a.points = [rock.object.position, rock.object.position.clone().addScaledVector(right, -(rock.radius + COVER_STANDOFF))];
  return clear(ctx, ctx.me.flight.position.clone().addScaledVector(right, COVER_GUNNER), 2000);
}

/** A drill against the target drone at rest `distance` ahead, done once it is gone; for the nova drill the clone holds a core first. */
function atDrone(line: string, praise: string, distance: number, nova = false): Drill {
  return {
    line,
    praise,
    keys: ['fire'],
    enter(ctx) {
      stop(ctx);
      if (nova) ctx.arm('nova');
      ctx.spawnDrone(clear(ctx, ahead(ctx, 0, 0, -distance), 2000), new THREE.Vector3());
    },
    done: (ctx) => !!ctx.drone && !ctx.drone.alive,
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => t('Drone'),
  };
}

/**
 * A drill against a sparring bot, armed or not, of a skill (see Bot), `at` units along the
 * pilot's axis (negative: ahead, positive: on its tail). The laser starts the fight cool.
 */
function sparring(line: string, praise: string, keys: Command[], armed: boolean, skill: number, at = -8000): Drill {
  return {
    line,
    praise,
    keys,
    enter(ctx) {
      stop(ctx);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
      ctx.spawnBot(clear(ctx, ahead(ctx, 0, 0, at), 2000), armed, skill);
    },
    done: (ctx) => !!ctx.bot && !ctx.bot.alive,
    leave: (ctx) => ctx.removeBot(),
    waypoint: (ctx) => (ctx.bot?.alive ? ctx.bot.flight.position : null),
    mark: () => t('Bot'),
  };
}

/**
 * Debris from `distance` ahead drifting straight at the pilot at `speed`, twice: done once it is
 * past, without turning; with `kick`, only past with a dodge fired.
 */
function debris(line: string, praise: string, distance: number, speed: number, kick: boolean): Drill {
  return {
    line,
    praise,
    keys: [kick ? 'dodge' : 'slide'],
    reps: 2,
    enter(ctx, a, markers) {
      stop(ctx);
      const start = ahead(ctx, 0, 0, -distance);
      const velocity = ctx.me.flight.position.clone().sub(start).setLength(speed);
      a.points = [markers.debris(start, velocity, DEBRIS_RADIUS)];
      a.count = ctx.dodges;
    },
    done: (ctx, a) => local(ctx, a.points[0]).z > 1500 && (!kick || ctx.dodges > a.count),
    fail(ctx, a) {
      if (ctx.me.flight.position.distanceTo(a.points[0]) < DEBRIS_RADIUS + ctx.me.radius) return SCHOOL.dodgeHit;
      return turned(ctx, a) ? SCHOOL.noTurn : null;
    },
  };
}

/** The courses of the flight school, each played on its own. */
export type SchoolCourse = 'basic' | 'racer' | 'gladiator' | 'arsenal' | 'tactician';
export const SCHOOL_COURSES: readonly SchoolCourse[] = ['basic', 'racer', 'gladiator', 'arsenal', 'tactician'];
export const COURSE_NAMES: Record<SchoolCourse, string> = { basic: msg('Basic training'), racer: msg('Racer'), gladiator: msg('Gladiator'), arsenal: msg('Arsenal'), tactician: msg('Tactician') };

/**
 * The drills of each course, in the order a Host needs them. Basic training: turning, aiming,
 * the drive and the brake, stopping at a point and the rocks, all with the autopilot on. The
 * racer: the rings, their coils, the start and the hook. The gladiator: the laser and its heat, free
 * drift like a real spaceship, dodging, and the dogfight last. The arsenal: torpedoes (launching
 * one, shooting one down), the overdrive, a probe, the hook on a ship, the nova core. The
 * tactician: the dodge, a bot on the tail, bursts, cover from a hunter and from a torpedo, and an
 * exam against a bot as good as the field's middling one.
 */
const COURSES: Record<SchoolCourse, Drill[]> = {
  basic: [DRILL.briefing, DRILL.turn, DRILL.fineAim, DRILL.cockpit, DRILL.drive, DRILL.brake, DRILL.stopAt, DRILL.impact, saying(SCHOOL.basicDone)],
  racer: [saying(SCHOOL.racer), DRILL.rings, DRILL.coil, DRILL.start, DRILL.hook, saying(SCHOOL.racerDone)],
  gladiator: [
    saying(SCHOOL.gladiator),
    DRILL.shoot,
    DRILL.shootMoving,
    DRILL.overheat,
    DRILL.shadow,
    DRILL.freeDrift,
    DRILL.drift,
    DRILL.lookBack,
    DRILL.flipBurn,
    DRILL.slide,
    DRILL.dodge,
    DRILL.autopilotOn,
    DRILL.chase,
    DRILL.evade,
    DRILL.duel,
    saying(SCHOOL.done),
  ],
  arsenal: [saying(SCHOOL.arsenal), DRILL.torpedo, DRILL.torpedoDown, DRILL.overdrive, DRILL.probe, DRILL.hookShip, DRILL.nova, saying(SCHOOL.arsenalDone)],
  tactician: [saying(SCHOOL.tactician), DRILL.kick, DRILL.onTail, DRILL.bursts, DRILL.cover, DRILL.torpedoCover, DRILL.comet, DRILL.exam, saying(SCHOOL.tacticianDone)],
};

/** The 3D props of the drills: marker buoys, rings of the course, debris. */
class Markers {
  readonly root = new THREE.Group();
  private readonly buoyGeometry = new THREE.OctahedronGeometry(1, 0);
  /** The rings are a race's coils (see GateKit): the next one's windings glow orange, the others blue. */
  private readonly kit = new GateKit(RING_RADIUS);
  private readonly nextCoil = this.kit.coilMaterial(0xff8c00, 2.6);
  private readonly laterCoil = this.kit.coilMaterial(0x4d91ff, 1.4);
  private readonly debrisGeometry = new THREE.IcosahedronGeometry(1, 0);
  private readonly zoneGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly bright = new THREE.MeshBasicMaterial({ color: 0xff9d00, wireframe: true });
  private readonly dim = new THREE.MeshBasicMaterial({ color: 0x4d91ff, wireframe: true, transparent: true, opacity: 0.45 });
  private readonly rock = new THREE.MeshBasicMaterial({ color: 0xff4d2e, wireframe: true });
  private rings: { root: THREE.Group; coil: THREE.Mesh }[] = [];
  /** Seconds the props have run, for the rings' position lights. */
  private clock = 0;
  private moving: { mesh: THREE.Object3D; position: THREE.Vector3; velocity: THREE.Vector3 }[] = [];

  /** A spinning diamond (150 units, about 7.5 m, by default). */
  buoy(position: THREE.Vector3, scale = 1) {
    const mesh = new THREE.Mesh(this.buoyGeometry, this.bright);
    mesh.scale.setScalar(150 * scale);
    mesh.position.copy(position);
    mesh.userData.spin = true;
    this.root.add(mesh);
    return mesh.position;
  }

  /** A faint wire sphere around a point: the zone a drill wants the ship in. */
  zone(position: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(this.zoneGeometry, this.dim);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    this.root.add(mesh);
  }

  ring(position: THREE.Vector3, normal: THREE.Vector3) {
    const ring = this.kit.build(position, normal, this.laterCoil);
    this.root.add(ring.root);
    this.rings.push(ring);
  }

  /** The next ring's coil glows orange, passed rings disappear. */
  highlight(next: number) {
    this.rings.forEach((ring, i) => {
      ring.root.visible = i >= next;
      ring.coil.material = i === next ? this.nextCoil : this.laterCoil;
    });
  }

  /** A tumbling chunk that drifts; returns its live position. */
  debris(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(this.debrisGeometry, this.rock);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    mesh.userData.spin = true;
    this.root.add(mesh);
    this.moving.push({ mesh, position: mesh.position, velocity });
    return mesh.position;
  }

  update(dt: number) {
    this.clock += dt;
    this.kit.blink(this.clock);
    for (const { position, velocity } of this.moving) position.addScaledVector(velocity, dt);
    for (const child of this.root.children) {
      if (child.userData.spin) child.rotation.y += dt * 1.5;
    }
  }

  clear() {
    this.root.clear();
    this.rings = [];
    this.moving = [];
  }

  /** Frees the geometries and materials on the GPU when the flight school ends. */
  dispose() {
    this.clear();
    for (const resource of [this.buoyGeometry, this.debrisGeometry, this.zoneGeometry, this.bright, this.dim, this.rock]) resource.dispose();
    this.kit.dispose();
  }
}

/**
 * The guided training of one course: one drill after another, each one maneuver, some
 * repeated. A failed attempt or a dead training clone starts the attempt over; training
 * clones are free.
 */
export class FlightSchool {
  private readonly markers = new Markers();
  private readonly drills: Drill[];
  private index: number;
  private attempt: Attempt | null = null;
  /** The attempt has to start over (failed, or the clone died). */
  private restart = false;
  /** Lines to say before the next attempt: the praise of the last drill, or why the attempt failed. */
  private pending: string[] = [];
  /** Lines of the beginning attempt the voice could not say yet, and since when (see speak). */
  private unsaid: { lines: string[]; since: number } | null = null;
  private line: string;
  /** What the current waypoint is, for its label in the HUD. */
  mark = '';

  /** Starts a course at a drill: 0 for its opening, or where a Host left off. */
  constructor(
    readonly course: SchoolCourse,
    start = 0,
  ) {
    this.drills = COURSES[course];
    this.index = THREE.MathUtils.clamp(Math.floor(start), 0, this.drills.length - 1);
    this.line = this.drills[this.index].line;
    // the very first words of the school: Nicole introduces herself before the briefing
    if (course === 'basic' && this.index === 0) this.pending = [SCHOOL.hello];
  }

  /** Number of drills of a course, for the menu's "continue at drill n of m". */
  static drillsOf(course: SchoolCourse) {
    return COURSES[course].length;
  }

  /** Whether the autopilot is on at the starting drill: as the drills before it left it. */
  get startsWithAutopilot() {
    let on = true;
    for (let i = 0; i < this.index; i++) on = this.drills[i].autopilotAfter ?? on;
    return on;
  }

  /** Group of the drills' props; the game adds it to the scene. */
  get root(): THREE.Object3D {
    return this.markers.root;
  }

  get finished() {
    return this.index >= this.drills.length;
  }

  /** The ideal line of a ring course while its drill counts, with the next ring; null without one. */
  get track(): { line: RacingLine; next: number } | null {
    const a = this.attempt;
    return a?.live && a.track && a.next < a.points.length ? { line: a.track, next: a.next } : null;
  }

  /** The next ring of a ring course while its drill counts, and the one after it, for the HUD's brackets; null without a ring course. */
  get nextRing(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live && a.track ? (a.points[a.next] ?? null) : null;
  }

  get ringAfter(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live && a.track ? (a.points[a.next + 1] ?? null) : null;
  }

  /** Which way the next ring of a ring course faces, for where the flight crosses its plane; null without one. */
  get nextNormal(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live && a.track ? (a.normals[a.next] ?? null) : null;
  }

  /**
   * Whether a ship touches the housings of a ring still standing in a ring course (see
   * touchRing; the rings passed are gone); moves it out and sets `normal` when it does.
   */
  touchesRing(position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
    const a = this.attempt;
    if (!a?.live || !a.track) return false;
    for (let i = a.next; i < a.points.length; i++) if (touchRing(a.points[i], a.normals[i], RING_RADIUS, position, radius, normal)) return true;
    return false;
  }

  dispose() {
    this.markers.dispose();
  }

  /**
   * Advances the training; returns the waypoint to mark, if any. Every attempt runs in clear
   * phases, one after the other: what is left to say of the last one (the praise, or why it
   * failed) to its end; then the instruction, to its end; only then the drill's props show up
   * and the drill counts.
   */
  update(ctx: SchoolContext): THREE.Vector3 | null {
    if (!this.attempt) while (!this.finished && this.drills[this.index].skip?.(ctx)) this.index++;
    if (this.finished) return null;
    const drill = this.drills[this.index];
    if (!ctx.me.alive) {
      this.restart = true;
      return null;
    }
    if (this.pending.length && !this.unsaid) {
      this.unsaid = { lines: this.pending, since: ctx.now };
      this.pending = [];
    }
    if (!this.speak(ctx)) return null;
    if (!this.attempt || this.restart) {
      if (ctx.speaking) return null;
      this.begin(ctx, this.attempt?.rep ?? 0);
      return null;
    }
    const attempt = this.attempt;
    if (!attempt.live) {
      if (ctx.speaking) return null;
      attempt.live = true;
      // drills that forbid turning measure from the nose as the attempt really starts
      ctx.me.flight.forward(attempt.forward);
      drill.enter?.(ctx, attempt, this.markers);
    }
    attempt.seconds += ctx.dt;
    this.markers.update(ctx.dt);

    // a drill done counts once the clone has lived through it for SURVIVE seconds: a clone that
    // dies right after (flung into a rock off the hook, say) does the drill again
    if (Number.isNaN(attempt.doneAt)) {
      const failure = drill.fail?.(ctx, attempt) ?? null;
      if (failure) {
        this.pending = [failure];
        this.restart = true;
        return null;
      }
      if (drill.done(ctx, attempt, this.markers)) attempt.doneAt = attempt.seconds;
    }
    if (attempt.seconds - attempt.doneAt >= SURVIVE) {
      if (attempt.rep + 1 < (drill.reps ?? 1)) {
        this.begin(ctx, attempt.rep + 1);
      } else {
        drill.leave?.(ctx);
        this.pending = drill.praise ? [drill.praise] : [];
        this.markers.clear();
        this.index++;
        this.attempt = null;
      }
      return null;
    }
    this.mark = drill.mark?.(ctx, attempt) ?? '';
    return drill.waypoint?.(ctx, attempt) ?? null;
  }

  /** Sets up an attempt and says its instruction; the drill's props come once it is said (see update). */
  private begin(ctx: SchoolContext, rep: number) {
    const drill = this.drills[this.index];
    const fresh = !this.attempt || this.attempt.rep !== rep;
    this.markers.clear();
    this.attempt = { rep, live: false, seconds: 0, held: 0, forward: ctx.me.flight.forward(), points: [], normals: [], next: 0, track: null, side: NaN, warned: false, usedBrake: false, brakeLetGo: false, reach: 0, jinkSide: 0, jinks: 0, lastShot: 0, lit: false, litAt: -Infinity, count: -1, early: false, doneAt: NaN };
    this.restart = false;
    // the panel keeps the instruction; a repetition without a line of its own just goes on
    const instruction = rep > 0 && drill.repLine ? drill.repLine : drill.line;
    this.line = instruction;
    if (fresh && (rep === 0 || drill.repLine)) this.unsaid = { lines: [instruction], since: ctx.now };
  }

  /**
   * Says the lines of the beginning attempt. Until the voice can speak (still loading, or the
   * browser has not allowed audio yet) the drill waits, so no instruction is lost; after
   * UNSAID_PATIENCE seconds it goes on without.
   */
  private speak(ctx: SchoolContext): boolean {
    const unsaid = this.unsaid;
    if (!unsaid) return true;
    if (ctx.say(unsaid.lines) || ctx.now - unsaid.since > UNSAID_PATIENCE) this.unsaid = null;
    return !this.unsaid;
  }

  /**
   * "Racer 3/5", the current line, the keys of the Host's device, in the Host's language. The
   * same object every frame; it only changes with the drill, the line or the device.
   */
  status(device: Device): { step: string; text: string; keys: string[] } {
    const index = Math.min(this.index, this.drills.length - 1);
    const shown = this.shown;
    if (shown.index !== index || shown.line !== this.line || shown.device !== device) {
      shown.index = index;
      shown.line = this.line;
      shown.device = device;
      shown.status = {
        step: t('{course} {n}/{total}', { course: t(COURSE_NAMES[this.course]), n: index + 1, total: this.drills.length }),
        text: t(this.line),
        keys: this.drills[index].keys.flatMap((command) => CONTROLS[device][command].map((label) => t(label))),
      };
    }
    return shown.status;
  }

  private readonly shown = { index: -1, line: '', device: 'keyboard' as Device, status: { step: '', text: '', keys: [] as string[] } };

  get stepIndex() {
    return this.index;
  }
}
