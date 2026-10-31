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
import { MAX_SPEED } from '../ship/flight';
import type { ItemKind } from './items';
import { HOOK_RANGE } from './hook';
import { msg, t } from '../i18n/i18n';
import type { ArenaId } from '../world/arenas';
import type { OrbitState } from './orbit';

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
  /** The orbit readout as the HUD shows it near the black hole (see game/orbit); null elsewhere. */
  orbit: OrbitState | null;
  /** The autopilot takes out the drift across the nose; off, the ship drifts freely. */
  autopilot: boolean;
  /** Switches the autopilot on or off, as the Host's key does. */
  setAutopilot(on: boolean): void;
  /** Set by the flight school: the autopilot leaves the drift across the nose alone this frame (see Drill.keepsDrift). */
  keepDrift: boolean;
  /** The overdrive ready at once, whenever the Host last fired it. */
  readyOverdrive(): void;
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
  /** Takes the target drone out of the arena, alive or not. */
  removeDrone(): void;
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
  /** The ideal line through the rings of the course (see layRings) or the markers of the curve drill, from where the pilot started. */
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
  /** The angle flown about the black hole in a stable orbit so far (rad), see the orbit drill. */
  swept: number;
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
  /** The autopilot as every attempt of the drill begins: on, off, or (undefined) as the Host left it. */
  autopilot?: boolean;
  /** The autopilot setting the drill leaves behind, so a flight school resumed later starts with it. */
  autopilotAfter?: boolean;
  /** While true, the autopilot leaves the drift across the nose alone: the drill's drift is the point. */
  keepsDrift?(ctx: SchoolContext, attempt: Attempt): boolean;
  /** The drill does not apply to the Host's device: it is passed over without a word. */
  skip?(ctx: SchoolContext): boolean;
  /** The arena the drill is flown in; without one, the school's home (the default arena). */
  arena?: ArenaId;
}


/** 50 m/s and 5 m/s in world units (1 unit = 5 cm). */
const FAST = 1000;
const STOPPED = 100;
/** Ring radius of the course: a race's gate (120 m), so the rings fly as a race does. */
export const RING_RADIUS = GATE_RADIUS;
/** Radius of the zone the stop drill wants the ship to rest in: 200 m, shown as a sphere around the marker. */
const STOP_RADIUS = 4000;
/** A marker of the turn drill counts as reached within this of it: 40 m, a ship's length past the diamond. */
const REACHED = 800;
/** At rest in the stop drill means slower than this: 10 m/s. */
const STOP_SPEED = 200;
/** Radius of the debris of the dodge drill: 15 m. */
const DEBRIS_RADIUS = 300;
/** The debris is an icosahedron as large as DEBRIS_RADIUS: its faces lie this share of it out from its center, as far as it meets rock. */
const DEBRIS_FILL = 0.8;
/** The debris that burst on rock (see Markers.update), by its live position: it threatens nobody any more. */
const burst = new WeakSet<THREE.Vector3>();
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
/**
 * The markers of the curve drill, in the pilot's frame (units): 400 m straight ahead, a quarter
 * turn to the right on an arc of 1.3 km radius, and 600 m straight on after it, where centered
 * steering is all it takes.
 */
export const CURVE_COURSE: readonly [number, number, number][] = [
  [0, 0, -8000],
  [7615, 0, -26385],
  [26000, 0, -34000],
  [38000, 0, -34000],
];
/** The curve drill starts drifting at this speed (units/s, 100 m/s): the autopilot flies it, and its arc takes the thrusters alone (0.8 g). */
export const CURVE_SPEED = 2000;
/** A marker of the curve drill counts within this distance (units, 100 m), shown as a sphere around it. */
export const CURVE_ZONE = 2000;
/**
 * The rings of the brake drill: the first 1.5 km ahead, then a bend of about 470 m radius to the
 * second, 475 m to the right, and on to the third. At the speed limit the autopilot turns no
 * tighter than about 585 m (see turnRadius), so the racing line glows orange before the bend; at
 * about 225 m/s it takes the bend, after a short brake.
 */
export const BRAKE_COURSE: readonly [number, number, number][] = [
  [0, 0, -30000],
  [9500, 0, -38500],
  [20000, 0, -48000],
];
/**
 * The rings of the full-speed drill: five, about 570 m apart, weaving 125 m to the right and 100 m
 * to the left and rising by 70 m, 2.7 km ahead: the line bends no tighter than about 1.2 km, which
 * a ship takes at the speed limit and beyond (a coil's 290 m/s), so it never glows orange.
 */
export const LINE_COURSE: readonly [number, number, number][] = [
  [0, 0, -10000],
  [2000, 700, -21000],
  [2500, 1400, -32000],
  [500, 700, -43000],
  [-2000, 0, -54000],
];
/**
 * The full-speed drill wants its course flown at LINE_PACE on average (units/s, 200 m/s) along
 * its racing line, with LINE_SPARE seconds more for the burn up to speed (the pilot starts facing the first
 * ring): only a drive held all the way gets there.
 */
export const LINE_PACE = 4000;
export const LINE_SPARE = 4;
/** A ring course lies within this share of the arena's edge (see ringCourse); every course fits ahead of a pilot in the middle. */
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
/** The nova drill's drone sits this far ahead (units, 1.2 km), beyond the blast's 800 m. */
export const NOVA_DRONE = 24000;
/** The overdrive drill turns the pilot to open space this deep (units, 1.5 km): ten seconds at its shove's speed. */
const OVERDRIVE_ROOM = 30000;
/** The ship hooked in the hook drill of the arsenal counts as reeled in this close (units, 300 m). */
const HOOKED_CLOSE = 6000;
/** The runner of that drill has got away this far off (units, 1.5 km, half again the hook's reach): once more. */
const HOOK_ESCAPED = HOOK_RANGE * 1.5;
/** The debris of the dodge kick drill: 150 m/s from 600 m off, four seconds, too fast to slide out of its way in time. */
const KICK_DEBRIS_SPEED = 3000;
const KICK_DEBRIS_START = 12000;
/**
 * The shove drill: the pilot and the drone drift side by side at SHOVE_DRIFT (units/s, 20 m/s)
 * at a rock SHOVE_AHEAD (units, 200 m) ahead, the drone SHOVE_ABREAST (45 m, a few meters
 * between the hulls) off the pilot's left, its way passing SHOVE_CLEAR (20 m) off the rock. A
 * kick (40 m/s) throws it at the stone at some 26 m/s. The drone starts with SHOVE_DRONE_HULL,
 * a wreck already: the stone finishes it (some 20 points at that speed), a knockout.
 */
const SHOVE_DRIFT = 400;
const SHOVE_AHEAD = 4000;
const SHOVE_ABREAST = 900;
const SHOVE_CLEAR = 400;
const SHOVE_DRONE_HULL = 15;
/**
 * The cover drills put the pilot this far off the surface of a rock (units, 150 m), the gunner
 * this far off to its right (1.2 km), and the torpedo's drone farther (2 km): a torpedo is quick,
 * and from there it arrives in about 6 s, time for the dash into cover.
 */
export const COVER_STANDOFF = 3000;
const COVER_GUNNER = 24000;
export const COVER_DRONE = 40000;
/** Seconds out of the gunner's sight the cover drill wants. */
const COVER_HOLD = 3;
/**
 * The slide shot drill: the pilot drifts at SLIDE_SPEED (units/s, 100 m/s) along its nose past
 * an armed bot of SLIDE_SKILL that starts at SLIDE_BOT in the pilot's frame (250 m to the right,
 * 600 m ahead); SLIDE_HITS hits with the nose more than SLIDE_ANGLE (rad, 60°) off the flight, in
 * free drift and faster than SLIDE_MOVING (units/s, 20 m/s), and the autopilot on again.
 */
export const SLIDE_SPEED = 2000;
export const SLIDE_BOT: [number, number, number] = [5000, 0, -12000];
const SLIDE_SKILL = 0.15;
export const SLIDE_HITS = 3;
export const SLIDE_ANGLE = Math.PI / 3;
const SLIDE_MOVING = 400;
/** Skill of the tactician's sparring bots (see Bot): the one on the tail, the one for bursts, the hunter of the cover drill, and the exam's, as good as the middling bot of the field. */
const TAIL_SKILL = 0.15;
const BURST_SKILL = 0.25;
const HUNTER_SKILL = 0.5;
const EXAM_SKILL = 0.5;
/**
 * The orbit drill, at the Event Horizon: the pilot starts ORBIT_START from the hole's center
 * (units, 1.2 km straight above it, out of the plane its rocks circle in, inside their ring),
 * its nose along ORBIT_NOSE, across the line to the hole, drifting that way at ORBIT_DRIFT
 * (units/s, 100 m/s; a circular orbit there flies 181 m/s, ORBIT READY comes from about 157
 * m/s), and has to fly ORBIT_SWEEP (rad, half a turn) about the hole in a stable orbit.
 */
export const ORBIT_START = new THREE.Vector3(0, 24000, 0);
export const ORBIT_NOSE = new THREE.Vector3(1, 0, 0);
export const ORBIT_DRIFT = 2000;
export const ORBIT_SWEEP = Math.PI;
const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);


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
  return clearOfRock(ctx.field, point, radius);
}

/**
 * Moves a point (a sphere of `radius` around it) out of the rock of `field`: away from each rock
 * it touches, straight out beyond the rock's farthest reach (upwards from a rock's very center),
 * up to 12 times for rocks side by side.
 */
export function clearOfRock(field: AsteroidField, point: THREE.Vector3, radius: number) {
  for (let i = 0; i < 12; i++) {
    const rock = field.overlap(point, radius);
    if (!rock) break;
    scratch.subVectors(point, rock.object.position);
    if (scratch.lengthSq() < 1) scratch.set(0, 1, 0);
    point.copy(rock.object.position).addScaledVector(scratch.normalize(), rock.radius + radius + 1);
  }
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

/** A point in the shadow of a rock (its center and farthest reach), 75 m off its far side from the sun. */
function shadowOf(center: THREE.Vector3, radius: number): THREE.Vector3 {
  return scratch.copy(center).addScaledVector(SUN_DIRECTION, -(radius + 1500));
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
 * The spot `standoff` units off the surface of a rock, between it and the field's center, into
 * `start`, and the way from the center out to the rock into `outward`; false when the spot is
 * not open space for `room` units or another rock lies between it and the rock.
 */
export function facingRock(field: AsteroidField, rock: Asteroid, standoff: number, room: number, start: THREE.Vector3, outward: THREE.Vector3): boolean {
  outward.copy(rock.object.position).normalize();
  start.copy(rock.object.position).addScaledVector(outward, -(rock.radius + standoff));
  return !field.overlap(start, room) && field.raycast(start, outward, Infinity)?.asteroid === rock;
}

/**
 * Puts the pilot `standoff` units off the surface of a rock, between it and the field's
 * center, facing it: the nearest rock whose spot lies in open space and whose way there no
 * other rock blocks, and that `accept` takes (given the rock, the spot and the pilot's turn there).
 * Returns the rock and the way from the center out to it; null for none.
 */
function faceRock(ctx: SchoolContext, standoff: number, accept?: (rock: Asteroid, start: THREE.Vector3, orientation: THREE.Quaternion) => boolean): { rock: Asteroid; outward: THREE.Vector3 } | null {
  const flight = ctx.me.flight;
  const rocks = [...ctx.field.asteroids.values()].sort((p, q) => p.object.position.distanceTo(flight.position) - q.object.position.distanceTo(flight.position));
  const start = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  for (const rock of rocks) {
    if (!facingRock(ctx.field, rock, standoff, ctx.me.radius * 4, start, outward)) continue;
    orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(start, rock.object.position, new THREE.Vector3(0, 1, 0)));
    if (accept && !accept(rock, start, orientation)) continue;
    flight.position.copy(start);
    flight.orientation.copy(orientation);
    return { rock, outward };
  }
  return null;
}

/** Turns the pilot to the first of a few ways (ahead, then about the up axis in steps of 45°) with no rock within `room`. */
function faceOpenSpace(ctx: SchoolContext, room: number) {
  const flight = ctx.me.flight;
  const up = flight.up(new THREE.Vector3());
  const turn = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 4);
  for (let i = 0; i < 8; i++) {
    if (!ctx.field.raycast(flight.position, flight.forward(toTarget), room)) return;
    flight.orientation.premultiply(turn);
  }
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
 * Whether the pilot crossed the plane of the attempt's next ring this frame, either way: how far
 * from its center, or null. Inside the ring it counts as passed; beside it (RING_RADIUS or more)
 * the ring is missed.
 */
function passRing(ctx: SchoolContext, a: Attempt): number | null {
  const normal = a.normals[a.next];
  const offset = toTarget.copy(ctx.me.flight.position).sub(a.points[a.next]);
  const side = offset.dot(normal);
  const crossed = Number.isFinite(a.side) && a.side < 0 !== side < 0;
  a.side = side;
  if (!crossed) return null;
  const off = offset.addScaledVector(normal, -side).length();
  if (off >= RING_RADIUS) return off;
  a.next++;
  a.side = NaN;
  return off;
}

/**
 * A drill through a course of rings (see layRings) that wants every ring flown through: a ring
 * missed starts the attempt over with `missLine`, a pilot lost with "Again". With `drift` (units/s, 0 at rest)
 * the pilot starts turned to the first ring, drifting at it; with `coils` each ring's core throws it on.
 */
function ringDrill(line: string, praise: string, keys: Command[], course: readonly [number, number, number][], missLine: string, drift: number | null = null, coils = false): Drill {
  return {
    line,
    praise,
    keys,
    autopilot: true,
    enter(ctx, a, markers) {
      layRings(ctx, a, markers, course);
      if (drift !== null) headFor(ctx, a.points[0], drift);
    },
    done(ctx, a, markers) {
      const off = passRing(ctx, a);
      if (off === null) return false;
      if (off >= RING_RADIUS) {
        a.warned = true;
        return false;
      }
      markers.highlight(a.next);
      if (coils && off < RING_RADIUS * CORE_SHARE) ctx.boost(a.normals[a.next - 1]);
      return a.next >= a.points.length;
    },
    fail: (ctx, a) => (a.warned ? missLine : lost(ctx, a) ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => t('Ring {n}/{total}', { n: a.next + 1, total: a.points.length }),
  };
}

/** The markers of the curve drill not passed yet, each with its sphere; passed ones are gone. */
function curveMarkers(a: Attempt, markers: Markers) {
  markers.clear();
  for (const point of a.points.slice(a.next)) {
    markers.buoy(point);
    markers.zone(point, CURVE_ZONE);
  }
}

/** Seconds the full-speed drill gives its course: its racing line at LINE_PACE, and LINE_SPARE. */
const lineTime = (a: Attempt) => (a.track ? a.track.length / LINE_PACE : 0) + LINE_SPARE;

/** Turns the pilot to a point and sets it drifting there at `speed`. */
function headFor(ctx: SchoolContext, point: THREE.Vector3, speed: number) {
  const flight = ctx.me.flight;
  flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(flight.position, point, flight.up(new THREE.Vector3())));
  drift(ctx, speed);
}

/**
 * Where the rings of a course (in the pilot's frame) lie for a pilot at `position` turned by
 * `orientation`: ahead of it, or, where they would reach out beyond COURSE_ROOM of the arena's
 * edge, towards the arena's center instead, and the pilot turns to the first ring. With the rock
 * of a `field`, a course whose way would run through rock (within COURSE_CLEAR of it) tilts up or
 * down by COURSE_TILTS, the first way clear of rock (or the one least in it): out of a sheet of
 * ice, say.
 */
export function ringCourse(position: THREE.Vector3, orientation: THREE.Quaternion, course: readonly (readonly [number, number, number])[], field?: AsteroidField): THREE.Vector3[] {
  const frame = orientation.clone();
  const place = ([x, y, z]: readonly [number, number, number]) => new THREE.Vector3(x, y, z).applyQuaternion(frame).add(position);
  if (position.lengthSq() > 1 && course.some((point) => place(point).length() > ARENA_LIMIT * COURSE_ROOM)) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
    frame.setFromRotationMatrix(new THREE.Matrix4().lookAt(position, new THREE.Vector3(), up));
  }
  if (!field) return course.map(place);
  const straight = frame.clone();
  let best: THREE.Vector3[] = [];
  let least = Infinity;
  // a tilted course starts COURSE_RUN farther on where the arena has room for it, so the pilot
  // has room to climb or dive into it
  for (const [tilt, run] of COURSE_TILTS.flatMap((tilt) => (tilt ? [[tilt, COURSE_RUN], [tilt, 0]] : [[0, 0]]))) {
    frame.copy(straight).multiply(tilted.setFromAxisAngle(sideways, tilt));
    const points = course.map(([x, y, z]) => place([x, y, z - run]));
    if (points.some((point) => point.length() > ARENA_LIMIT * COURSE_ROOM)) continue;
    // the way from the pilot through the rings, looked at every COURSE_CLEAR
    let blocked = 0;
    let from = position;
    for (const point of points) {
      const steps = Math.ceil(from.distanceTo(point) / COURSE_CLEAR);
      for (let i = 1; i <= steps; i++) if (field.overlap(scratch.lerpVectors(from, point, i / steps), COURSE_CLEAR)) blocked++;
      from = point;
    }
    if (blocked < least) {
      least = blocked;
      best = points;
    }
    if (blocked === 0) break;
  }
  return best.length ? best : course.map(place);
}
/** A course's way keeps this clear of rock (units, 180 m, the room a ring keeps, see layRings), or it tilts (rad: straight, then 15°, 30° and 45° up and down). */
const COURSE_CLEAR = RING_RADIUS * 1.5;
/** A tilted course starts this much farther from the pilot (units, 800 m). */
const COURSE_RUN = 16000;
const COURSE_TILTS = [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79];
const sideways = new THREE.Vector3(1, 0, 0);
const tilted = new THREE.Quaternion();

/** Lays out a course of rings for the pilot (see ringCourse), each facing the way from the one before. */
function layRings(ctx: SchoolContext, a: Attempt, markers: Markers, course: readonly [number, number, number][]) {
  stop(ctx);
  a.points = ringCourse(ctx.me.flight.position, ctx.me.flight.orientation, course, ctx.field).map((point) => clear(ctx, point, RING_RADIUS * 1.5));
  a.normals = a.points.map((point, i) => point.clone().sub(i === 0 ? ctx.me.flight.position : a.points[i - 1]).normalize());
  a.points.forEach((point, i) => markers.ring(point, a.normals[i]));
  a.track = new RacingLine(a.points, false, ctx.me.flight.position);
  markers.highlight(0);
}

export const DRILL = {
  briefing: saying(SCHOOL.briefing),
  turn: {
    line: SCHOOL.turn,
    praise: SCHOOL_PRAISE.turn,
    // the drive's keys show beside the stick's, since the line says turning alone moves nothing
    keys: ['turn', 'drive'],
    reps: TURN_MARKERS.length,
    autopilot: true,
    enter(ctx, a, markers) {
      stop(ctx);
      const [x, y, z] = TURN_MARKERS[a.rep];
      a.points = [markers.buoy(ahead(ctx, x, y, z).sub(ctx.me.flight.position).setLength(3000).add(ctx.me.flight.position))];
    },
    // a pilot who burns to the marker has had it in the crosshair on the way
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < 0.05, 0.4) || ctx.me.flight.position.distanceTo(a.points[0]) < REACHED,
    waypoint: (_, a) => a.points[0],
    mark: () => t('Target'),
  },
  fineAim: {
    line: SCHOOL.fineAim,
    praise: SCHOOL_PRAISE.fineAim,
    keys: ['fine', 'turn'],
    autopilot: true,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = [markers.buoy(ahead(ctx, 0.12, -0.07, -1).sub(ctx.me.flight.position).setLength(8000).add(ctx.me.flight.position), 0.5)];
    },
    // touch sticks have no fine aim: there the marker only has to sit in the crosshair; a pilot
    // who burns to the marker has had it in the crosshair on the way, as in the turn drill
    done: (ctx, a) => holdFor(ctx, a, aimError(ctx, a.points[0]) < (ctx.device === 'touch' ? 0.04 : 0.015), 0.8) || ctx.me.flight.position.distanceTo(a.points[0]) < REACHED,
    waypoint: (_, a) => a.points[0],
    mark: () => t('Target'),
  },
  cockpit: {
    line: SCHOOL.cockpit,
    praise: SCHOOL_PRAISE.cockpit,
    keys: ['camera'],
    autopilot: true,
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
    autopilot: true,
    enter: (ctx) => stop(ctx),
    done: (ctx) => speed(ctx) >= FAST,
  },
  brake: {
    line: SCHOOL.brake,
    praise: SCHOOL_PRAISE.brake,
    keys: ['brake'],
    autopilot: true,
    enter(ctx) {
      if (speed(ctx) < FAST * 0.8) drift(ctx, FAST * 1.2, speed(ctx) > 10 ? ctx.me.flight.velocity : undefined);
    },
    done: (ctx) => speed(ctx) < STOPPED,
  },
  // the autopilot: the nose through an arc of markers, and the flight comes after it; once
  // steering stops, the ship flies straight on to the last
  curve: {
    line: SCHOOL.curve,
    praise: SCHOOL_PRAISE.curve,
    keys: ['turn', 'drive'],
    autopilot: true,
    enter(ctx, a, markers) {
      stop(ctx);
      a.points = ringCourse(ctx.me.flight.position, ctx.me.flight.orientation, CURVE_COURSE, ctx.field).map((point) => clear(ctx, point, CURVE_ZONE / 2));
      curveMarkers(a, markers);
      a.track = new RacingLine(a.points, false, ctx.me.flight.position);
      headFor(ctx, a.points[0], CURVE_SPEED);
    },
    done(ctx, a, markers) {
      if (ctx.me.flight.position.distanceTo(a.points[a.next]) >= CURVE_ZONE) return false;
      a.next++;
      curveMarkers(a, markers);
      return a.next >= a.points.length;
    },
    fail: (ctx, a) => (lost(ctx, a) ? SCHOOL.again : null),
    waypoint: (_, a) => a.points[a.next] ?? null,
    mark: (_, a) => t('Marker {n}/{total}', { n: a.next + 1, total: a.points.length }),
  },
  // the X where the flight crosses the next ring's plane: steered into the ring, azure, it is a pass
  rings: ringDrill(SCHOOL.rings, SCHOOL_PRAISE.rings, ['turn', 'drive', 'brake'], RING_COURSE, SCHOOL.missed),
  // at the speed limit into a bend tighter than the autopilot turns there: the racing line glows
  // orange before it, and only a brake in time makes the ring
  brakeZone: ringDrill(SCHOOL.brakeZone, SCHOOL_PRAISE.brakeZone, ['turn', 'brake', 'drive'], BRAKE_COURSE, SCHOOL.tooFast, MAX_SPEED),
  // the racing line at full speed: the drive held all the way, the autopilot bends it through the turns
  fullSpeed: {
    ...ringDrill(SCHOOL.fullSpeed, SCHOOL_PRAISE.fullSpeed, ['drive', 'turn'], LINE_COURSE, SCHOOL.missed, 0, true),
    fail: (ctx, a) => (a.warned ? SCHOOL.missed : a.seconds > lineTime(a) ? SCHOOL.tooSlow : lost(ctx, a) ? SCHOOL.again : null),
    mark: (_, a) => t('Ring {n}/{total} · {seconds} s left', { n: a.next + 1, total: a.points.length, seconds: Math.max(0, Math.ceil(lineTime(a) - a.seconds)) }),
  },
  // the rings of a race are coils: only their core throws a ship on
  coil: {
    line: SCHOOL.coil,
    praise: SCHOOL_PRAISE.coil,
    keys: ['drive', 'turn', 'fine'],
    autopilot: true,
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
    autopilot: true,
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
    keys: ['hook', 'turn', 'drive'],
    autopilot: true,
    // the drift past the rock is what the cable swings: the autopilot leaves it alone until the hook bites
    keepsDrift: (_, a) => !a.warned,
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
    keys: ['fire', 'turn', 'fine'],
    autopilot: true,
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
    autopilot: true,
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
    keys: ['turn', 'drive', 'brake'],
    autopilot: true,
    // the shadow of the rock nearest as the drill begins: the marker stays behind that one
    enter(ctx, a) {
      const rock = nearestAsteroid(ctx);
      if (!rock) return;
      a.points = [rock.object.position];
      a.reach = rock.radius;
    },
    done: (ctx, a) => holdFor(ctx, a, ctx.me.inShadow, 1),
    waypoint: (_, a) => (a.points.length ? shadowOf(a.points[0], a.reach) : null),
    mark: () => t('Shadow'),
  },
  impact: {
    line: SCHOOL.impact,
    praise: SCHOOL_PRAISE.impact,
    keys: ['brake', 'turn', 'slide'],
    autopilot: true,
    enter(ctx, a) {
      // between a rock and the field's center, heading for the rock at 100 m/s
      const facing = faceRock(ctx, 14000);
      if (!facing) return;
      drift(ctx, 2000, facing.outward);
      a.points = [facing.rock.object.position];
      a.reach = ctx.me.flight.position.distanceTo(facing.rock.object.position);
    },
    // at rest, or past the rock and flying away from it: braking or steering away before the
    // warning even comes up is good flying too
    done(ctx, a) {
      if (!a.points.length) return true;
      const away = toTarget.copy(a.points[0]).sub(ctx.me.flight.position).dot(ctx.me.flight.velocity) < 0;
      return holdFor(ctx, a, !ctx.impactAhead && (speed(ctx) < STOPPED || away), 1);
    },
  },
  // free drift: flying like a real spaceship, for the dogfight
  freeDrift: {
    line: SCHOOL.freeDrift,
    praise: SCHOOL_PRAISE.freeDrift,
    keys: ['autopilot'],
    autopilot: true,
    done: (ctx) => !ctx.autopilot,
    autopilotAfter: false,
  },
  drift: {
    line: SCHOOL.drift,
    praise: SCHOOL_PRAISE.drift,
    keys: [],
    autopilot: false,
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
    autopilot: false,
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
    autopilot: false,
    enter: (ctx, a) => drift(ctx, a.rep === 0 ? 1500 : 2400),
    // counts once the burn has taken out the drift along the course; a burn by hand never
    // hits the flight direction exactly, so some sideways drift is allowed to remain
    done: (ctx, a) => ctx.me.flight.velocity.dot(a.forward) < STOPPED && !a.usedBrake,
    // the S brake does not count: the attempt starts over the moment it is pressed
    fail(ctx, a) {
      a.brakeLetGo ||= !ctx.braking;
      a.usedBrake ||= ctx.braking && a.brakeLetGo;
      return a.usedBrake ? SCHOOL.byHand : null;
    },
  },
  stopAt: {
    line: SCHOOL.stopAt,
    praise: SCHOOL_PRAISE.stopAt,
    repLine: SCHOOL.stopAtFar,
    keys: ['turn', 'drive', 'brake'],
    reps: 2,
    autopilot: true,
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
    autopilot: false,
    done: (ctx) => ctx.autopilot,
    autopilotAfter: true,
  },
  chase: sparring(SCHOOL.chase, SCHOOL_PRAISE.chase, ['turn', 'drive', 'brake', 'fire'], false, 0.1),
  evade: sparring(SCHOOL.evade, SCHOOL_PRAISE.evade, ['turn', 'drive', 'slide', 'fire'], true, 0.05),
  duel: sparring(SCHOOL.duel, SCHOOL_PRAISE.duel, ['turn', 'drive', 'brake', 'slide', 'fire'], true, 0.2),
  // the arsenal: what a clone carries besides its laser, and what it finds out there
  torpedo: {
    line: SCHOOL.torpedo,
    praise: SCHOOL_PRAISE.torpedo,
    keys: ['turn', 'torpedo'],
    autopilot: true,
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
    autopilot: true,
    enter(ctx, a) {
      stop(ctx);
      incoming(ctx, a, clear(ctx, ahead(ctx, 0, 0, -30000), 2000));
    },
    done: (ctx, a) => launched(ctx, a) && ctx.torpedoesDown > a.count,
    // a hit, or a torpedo gone without one (past, burnt out, broken on rock)
    fail: (ctx, a) => (ctx.me.hull < a.reach ? SCHOOL.torpedoHit : a.lit && ctx.torpedoes === 0 && ctx.torpedoesDown === a.count ? SCHOOL.torpedoPast : null),
    waypoint: (ctx) => ctx.incoming,
    mark: () => t('Torpedo'),
  },
  overdrive: {
    line: SCHOOL.overdrive,
    praise: SCHOOL_PRAISE.overdrive,
    keys: ['overdrive'],
    autopilot: true,
    // the overdrive ready, however recently it was fired, and room ahead to fly off with it
    enter(ctx) {
      stop(ctx);
      ctx.readyOverdrive();
      faceOpenSpace(ctx, OVERDRIVE_ROOM);
    },
    done: (ctx) => speed(ctx) > OVERDRIVE_FAST,
  },
  probe: {
    line: SCHOOL.probe,
    praise: SCHOOL_PRAISE.probe,
    keys: ['turn', 'drive', 'brake'],
    autopilot: true,
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
    keys: ['turn', 'drive', 'hook'],
    autopilot: true,
    enter(ctx) {
      stop(ctx);
      ctx.spawnBot(clear(ctx, ahead(ctx, 0, 0, -12000), 2000), false, 0.2);
    },
    done: (ctx) => ctx.hooked && !!ctx.bot && ctx.bot.flight.position.distanceTo(ctx.me.flight.position) < HOOKED_CLOSE,
    // the runner got away beyond the hook's reach, or crashed: once more
    fail: (ctx) => (ctx.bot && (!ctx.bot.alive || (!ctx.hooked && ctx.bot.flight.position.distanceTo(ctx.me.flight.position) > HOOK_ESCAPED)) ? SCHOOL.again : null),
    leave: (ctx) => ctx.removeBot(),
    waypoint: (ctx) => (ctx.bot?.alive ? ctx.bot.flight.position : null),
    mark: () => t('Hook it'),
  },
  // the drone beyond the blast's reach (800 m), so the pilot has to fly close first
  nova: atDrone(SCHOOL.nova, SCHOOL_PRAISE.nova, NOVA_DRONE, true),
  // the tactician: how to win a dogfight, and how not to lose one
  // past fast debris with a dodge: sliding alone does not get there in time
  kick: debris(SCHOOL.kick, SCHOOL_PRAISE.kick, KICK_DEBRIS_START, KICK_DEBRIS_SPEED, true),
  // the kick as a weapon: a drone beside the pilot, past a rock, shoved into the stone
  shove: {
    line: SCHOOL.shove,
    praise: SCHOOL_PRAISE.shove,
    keys: ['dodge'],
    enter(ctx, a) {
      stop(ctx);
      const facing = faceRock(ctx, SHOVE_AHEAD);
      if (!facing) return;
      const rock = facing.rock;
      const flight = ctx.me.flight;
      // the pilot off the rock's right, the drone abreast between them, its way just clear of the stone
      const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(flight.orientation);
      flight.position.addScaledVector(left, -(rock.radius + ctx.me.radius + SHOVE_CLEAR + SHOVE_ABREAST));
      drift(ctx, SHOVE_DRIFT);
      // the rock, and the way the two drift past it, whichever way the nose turns meanwhile
      a.points = [rock.object.position, flight.forward()];
      a.reach = rock.radius;
      ctx.spawnDrone(flight.position.clone().addScaledVector(left, SHOVE_ABREAST), flight.velocity);
      if (ctx.drone) ctx.drone.hull = SHOVE_DRONE_HULL;
    },
    done(ctx, a) {
      const drone = ctx.drone;
      if (!a.points.length) return true;
      return !!drone && drone.shovedBy === ctx.me && (!drone.alive || !!ctx.field.overlap(drone.flight.position, drone.radius * 1.1));
    },
    // the rock left behind along the drift, and the drone with it
    fail: (ctx, a) => (a.points.length && toTarget.subVectors(ctx.me.flight.position, a.points[0]).dot(a.points[1]) > a.reach + SHOVE_ABREAST * 2 ? SCHOOL.again : null),
    waypoint: (ctx) => (ctx.drone?.alive ? ctx.drone.flight.position : null),
    mark: () => t('Shove it'),
  },
  // a bot sits on the pilot's tail and fires: the armored nose has to come round to it
  onTail: sparring(SCHOOL.onTail, SCHOOL_PRAISE.onTail, ['turn', 'slide', 'fire'], true, TAIL_SKILL, 6000),
  // a kill without ever overheating the laser
  bursts: {
    ...sparring(SCHOOL.bursts, SCHOOL_PRAISE.bursts, ['turn', 'drive', 'fire'], true, BURST_SKILL),
    fail: (ctx, a) => (ctx.me.overheated ? SCHOOL.tooHot : botLost(ctx, a) ? SCHOOL.again : null),
  },
  // free drift in a dogfight: sliding past a bot, the nose turned onto it, firing sideways or
  // back; then the autopilot on again to leave
  slideShot: {
    line: SCHOOL.slideShot,
    praise: SCHOOL_PRAISE.slideShot,
    keys: ['autopilot', 'turn', 'fire'],
    autopilot: true,
    enter(ctx, a) {
      stop(ctx);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
      ctx.spawnBot(clear(ctx, ahead(ctx, ...SLIDE_BOT), 2000), true, SLIDE_SKILL);
      drift(ctx, SLIDE_SPEED);
      a.count = 0;
      a.reach = ctx.bot?.hull ?? 0;
    },
    done(ctx, a) {
      const bot = ctx.bot;
      if (!bot) return true;
      // a hit is the bot's hull going down; it counts with the nose well off the flight, in free drift
      const flight = ctx.me.flight;
      const sideways = !ctx.autopilot && speed(ctx) > SLIDE_MOVING && flight.angleTo(flight.velocity) > SLIDE_ANGLE;
      if (bot.hull < a.reach && sideways) a.count++;
      a.reach = bot.hull;
      return a.count >= SLIDE_HITS && ctx.autopilot;
    },
    fail(ctx, a) {
      if (ctx.bot && !ctx.bot.alive && a.count < SLIDE_HITS) return SCHOOL.slideShotStraight;
      return ctx.bot && ctx.bot.flight.position.distanceTo(ctx.me.flight.position) > COURSE_LOST ? SCHOOL.again : null;
    },
    leave: (ctx) => ctx.removeBot(),
    waypoint: (ctx) => (ctx.bot?.alive ? ctx.bot.flight.position : null),
    mark: () => t('Bot'),
    autopilotAfter: true,
  },
  // a better bot hunts the pilot: a rock between them hides the pilot from its sensors
  cover: {
    line: SCHOOL.cover,
    praise: SCHOOL_PRAISE.cover,
    keys: ['turn', 'drive', 'brake', 'slide'],
    autopilot: true,
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
    keys: ['turn', 'drive', 'brake', 'slide'],
    autopilot: true,
    enter(ctx, a) {
      const behind = takeCover(ctx, a, COVER_DRONE);
      if (behind) incoming(ctx, a, behind);
    },
    // its lock lost, or the torpedo broken on the rock; one on the hull or shot down is no cover
    done: (ctx, a) => !a.points.length || (launched(ctx, a) && ctx.me.hull >= a.reach && ctx.torpedoesDown === a.count && (ctx.torpedoes === 0 || !ctx.tracked)),
    fail(ctx, a) {
      if (ctx.me.hull < a.reach) return SCHOOL.torpedoCoverHit;
      return ctx.torpedoesDown > a.count ? SCHOOL.hideInstead : null;
    },
    waypoint: (_, a) => a.points[1] ?? null,
    mark: () => t('Cover'),
  },
  // an orbit about the black hole: the readout says when the path is one, free drift flies it
  orbit: {
    line: SCHOOL.orbit,
    praise: SCHOOL_PRAISE.orbit,
    keys: ['drive', 'turn', 'autopilot'],
    arena: 'hole',
    autopilot: true,
    autopilotAfter: true,
    enter(ctx, a) {
      const flight = ctx.me.flight;
      const center = ctx.field.well?.position ?? ORIGIN;
      flight.position.copy(center).add(ORBIT_START);
      flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(flight.position, scratch.copy(flight.position).add(ORBIT_NOSE), UP));
      drift(ctx, ORBIT_DRIFT);
      a.points = [flight.position.clone()];
      a.swept = 0;
    },
    // half a turn about the hole in a stable orbit; whatever breaks the orbit starts the count again
    done(ctx, a) {
      const center = ctx.field.well?.position ?? ORIGIN;
      const now = scratch.subVectors(ctx.me.flight.position, center);
      const before = toTarget.subVectors(a.points[0], center);
      a.swept = ctx.orbit === 'stable' ? a.swept + before.angleTo(now) : 0;
      a.points[0].copy(ctx.me.flight.position);
      return a.swept >= ORBIT_SWEEP;
    },
    fail: (ctx) => (ctx.me.flight.position.length() > ARENA_LIMIT ? SCHOOL.again : null),
    leave: (ctx) => ctx.setAutopilot(true),
  },
  exam: sparring(SCHOOL.exam, SCHOOL_PRAISE.exam, ['turn', 'drive', 'brake', 'slide', 'dodge', 'fire'], true, EXAM_SKILL),
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
 * or drone goes, `away` units off, or null without a rock.
 */
function takeCover(ctx: SchoolContext, a: Attempt, away = COVER_GUNNER): THREE.Vector3 | null {
  stop(ctx);
  // a rock whose gunner sees the pilot from the start: hidden already, there is nothing to learn
  const facing = faceRock(ctx, COVER_STANDOFF, (rock, start, orientation) => ctx.field.lineOfSight(clear(ctx, coverSpots(rock, start, orientation, away).gunner, 2000), start));
  if (!facing) return null;
  const rock = facing.rock;
  const { lee, gunner } = coverSpots(rock, ctx.me.flight.position, ctx.me.flight.orientation, away);
  a.points = [rock.object.position, lee];
  return clear(ctx, gunner, 2000);
}

/** The cover drills' spots for a pilot facing a rock: its lee ahead and to the left, and the gunner or drone `away` units off to the right. */
export function coverSpots(rock: Asteroid, pilot: THREE.Vector3, orientation: THREE.Quaternion, away: number): { lee: THREE.Vector3; gunner: THREE.Vector3 } {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
  return { lee: rock.object.position.clone().addScaledVector(right, -(rock.radius + COVER_STANDOFF)), gunner: pilot.clone().addScaledVector(right, away) };
}

/** A drill against the target drone at rest `distance` ahead, done once it is gone; for the nova drill the clone holds a core first. */
function atDrone(line: string, praise: string, distance: number, nova = false): Drill {
  return {
    line,
    praise,
    keys: nova ? ['turn', 'drive', 'fire'] : ['fire'],
    autopilot: true,
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

/** The sparring bot is gone without the pilot's kill: it crashed on its own. */
const botLost = (ctx: SchoolContext, a: Attempt) => !!ctx.bot && !ctx.bot.alive && ctx.me.kills <= a.count;

/**
 * A drill against a sparring bot, armed or not, of a skill (see Bot), `at` units along the
 * pilot's axis (negative: ahead, positive: on its tail). The laser starts the fight cool.
 */
function sparring(line: string, praise: string, keys: Command[], armed: boolean, skill: number, at = -8000): Drill {
  return {
    line,
    praise,
    keys,
    enter(ctx, a) {
      stop(ctx);
      ctx.me.heat = 0;
      ctx.me.overheated = false;
      ctx.spawnBot(clear(ctx, ahead(ctx, 0, 0, at), 2000), armed, skill);
      a.count = ctx.me.kills;
    },
    // the bot down by the pilot's hand; crashed on its own, it counts for nothing
    done: (ctx, a) => !!ctx.bot && !ctx.bot.alive && ctx.me.kills > a.count,
    fail: (ctx, a) => (botLost(ctx, a) ? SCHOOL.again : null),
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
    // debris that burst on rock on its way is past as well: the rock took it
    done: (ctx, a) => burst.has(a.points[0]) || (local(ctx, a.points[0]).z > 1500 && (!kick || ctx.dodges > a.count)),
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
 * The completed courses as the browser kept them (none: no course), or null when the entry cannot
 * be read as a list of names (it counts as none); a name this game does not know is passed over
 * (a later one may have added it).
 */
export function coursesFrom(text: string | null): Set<SchoolCourse> | null {
  if (text === null) return new Set();
  try {
    const kept: unknown = JSON.parse(text);
    if (!Array.isArray(kept) || !kept.every((course) => typeof course === 'string')) return null;
    return new Set(SCHOOL_COURSES.filter((course) => kept.includes(course)));
  } catch {
    return null;
  }
}

/**
 * The drills of each course, in the order a Host needs them. Basic training: turning, then the
 * drive that the turn alone lacks and the brake, aiming, a curve with the autopilot, stopping at
 * a point and the rocks, all with the autopilot on. The racer, in the order a race runs: the start, the rings and the X
 * where the flight crosses them, their coils, the racing line's brake zones, the line at full
 * speed, and the hook. The gladiator: the laser, its heat and firing in bursts, free drift like a
 * real spaceship, dodging, and the dogfight last. The arsenal: torpedoes (launching one, shooting
 * one down), the overdrive, the hook on a ship, then a probe, whose colors name the nova core
 * that follows it. The tactician: defending first (a bot on the tail, the kick), then attacking
 * (shooting sideways in free drift, the shove into rock), then cover from a hunter and from a
 * torpedo, an orbit about the black hole of the Event Horizon (a place the alarms leave a ship
 * alone), and an exam against a bot as good as the field's middling one.
 */
const COURSES: Record<SchoolCourse, Drill[]> = {
  basic: [DRILL.briefing, DRILL.turn, DRILL.drive, DRILL.brake, DRILL.fineAim, DRILL.cockpit, DRILL.curve, DRILL.stopAt, DRILL.impact, saying(SCHOOL.basicDone)],
  racer: [saying(SCHOOL.racer), DRILL.start, DRILL.rings, DRILL.coil, DRILL.brakeZone, DRILL.fullSpeed, DRILL.hook, saying(SCHOOL.racerDone)],
  gladiator: [
    saying(SCHOOL.gladiator),
    DRILL.shoot,
    DRILL.shootMoving,
    DRILL.overheat,
    DRILL.shadow,
    DRILL.bursts,
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
  arsenal: [saying(SCHOOL.arsenal), DRILL.torpedo, DRILL.torpedoDown, DRILL.overdrive, DRILL.hookShip, DRILL.probe, DRILL.nova, saying(SCHOOL.arsenalDone)],
  tactician: [saying(SCHOOL.tactician), DRILL.onTail, DRILL.kick, DRILL.slideShot, DRILL.shove, DRILL.cover, DRILL.torpedoCover, DRILL.orbit, DRILL.exam, saying(SCHOOL.tacticianDone)],
};

/** Each drill's name, its key in DRILL; a course's opening and closing words are "opening" and "closing". */
/**
 * How an attempt stands in this moment: done (true), failed (the line to say) or neither
 * (null). The drill done goes first, so what does it counts even when it also ends the means:
 * the last torpedo's hit, the kill with the shot that overheats the laser. A missed ring or a
 * drive lit too early fails in the moment it happens, before the drill can be done.
 */
export function judge(drill: Drill, ctx: SchoolContext, attempt: Attempt, markers: Markers): true | string | null {
  if (drill.done(ctx, attempt, markers)) return true;
  return drill.fail?.(ctx, attempt) ?? null;
}

const DRILL_NAMES = new Map<Drill, string>(Object.entries(DRILL).map(([name, drill]) => [drill as Drill, name]));
const drillName = (course: SchoolCourse, index: number) => DRILL_NAMES.get(COURSES[course][index]) ?? (index === 0 ? 'opening' : 'closing');

/**
 * Progress a browser keeps as a drill's number instead of its name counts the drills of this
 * order: the tactician's without the shove drill and with one more number before the exam that
 * leads to the exam too, its bursts (which the gladiator teaches) going on at the slide shot; the
 * other courses as they are.
 */
const NUMBERED: Partial<Record<SchoolCourse, string[]>> = {
  tactician: ['opening', 'kick', 'onTail', 'slideShot', 'slideShot', 'cover', 'torpedoCover', 'exam', 'exam', 'closing'],
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

  /** Moves the drifting props; a chunk of debris that meets rock in `field` bursts there (see burst). */
  update(dt: number, field: AsteroidField) {
    this.clock += dt;
    this.kit.blink(this.clock);
    for (const item of this.moving) {
      const { mesh, position, velocity } = item;
      if (burst.has(position)) continue;
      position.addScaledVector(velocity, dt);
      // a chunk of 15 m meeting a rock at 60 m/s or more goes to dust, as wreckage does
      if (mesh.userData.spin && field.overlap(position, mesh.scale.x * DEBRIS_FILL)) {
        burst.add(position);
        mesh.visible = false;
      }
    }
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

  /** The name a browser keeps for the drill a Host has reached, so drills added to a course later do not move it. */
  static keep(course: SchoolCourse, index: number): string {
    return drillName(course, index);
  }

  /** The drill a kept name (or number, see NUMBERED) stands for in a course; undefined for none. */
  static reached(course: SchoolCourse, kept: unknown): number | undefined {
    const name = Number.isInteger(kept) ? (NUMBERED[course]?.[kept as number] ?? (kept as number)) : kept;
    if (typeof name === 'number') return name >= 0 && name < COURSES[course].length ? name : undefined;
    const index = COURSES[course].findIndex((_, i) => drillName(course, i) === name);
    return index >= 0 ? index : undefined;
  }

  /** Whether the autopilot is on at the starting drill: as the drills before it left it. */
  get startsWithAutopilot() {
    let on = true;
    for (let i = 0; i < this.index; i++) on = this.drills[i].autopilotAfter ?? on;
    return on;
  }

  /** The arena the current drill is flown in (see Drill.arena); null for the school's home. */
  get arena(): ArenaId | null {
    return this.drills[Math.min(this.index, this.drills.length - 1)].arena ?? null;
  }

  /** Group of the drills' props; the game adds it to the scene. */
  get root(): THREE.Object3D {
    return this.markers.root;
  }

  get finished() {
    return this.index >= this.drills.length;
  }

  /** The ideal line of a course (its rings, or the curve drill's markers) while its drill counts, with the next ring or marker; null without one. */
  get track(): { line: RacingLine; next: number } | null {
    const a = this.attempt;
    return a?.live && a.track && a.next < a.points.length ? { line: a.track, next: a.next } : null;
  }

  /** The next ring of a ring course while its drill counts, and the one after it, for the HUD's brackets; null without a ring course. */
  get nextRing(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live && a.normals.length ? (a.points[a.next] ?? null) : null;
  }

  get ringAfter(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live && a.normals.length ? (a.points[a.next + 1] ?? null) : null;
  }

  /** Which way the next ring of a ring course faces, for where the flight crosses its plane; null without one. */
  get nextNormal(): THREE.Vector3 | null {
    const a = this.attempt;
    return a?.live ? (a.normals[a.next] ?? null) : null;
  }

  /**
   * Whether a ship touches the housings of a ring still standing in a ring course (see
   * touchRing; the rings passed are gone); moves it out and sets `normal` when it does.
   */
  /** Each ring still standing (see touchesRing) handed to `visit`: its center, facing and opening's radius. */
  eachRing(visit: (center: THREE.Vector3, facing: THREE.Vector3, radius: number) => void) {
    const a = this.attempt;
    if (!a?.live || !a.normals.length) return;
    for (let i = a.next; i < a.points.length; i++) visit(a.points[i], a.normals[i], RING_RADIUS);
  }

  touchesRing(position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
    const a = this.attempt;
    if (!a?.live || !a.normals.length) return false;
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
    ctx.keepDrift = false;
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
      if (drill.autopilot !== undefined && ctx.autopilot !== drill.autopilot) ctx.setAutopilot(drill.autopilot);
      drill.enter?.(ctx, attempt, this.markers);
    }
    ctx.keepDrift = drill.keepsDrift?.(ctx, attempt) ?? false;
    attempt.seconds += ctx.dt;
    this.markers.update(ctx.dt, ctx.field);

    // a drill done counts once the clone has lived through it for SURVIVE seconds: a clone that
    // dies right after (flung into a rock off the hook, say) does the drill again
    if (Number.isNaN(attempt.doneAt)) {
      const verdict = judge(drill, ctx, attempt, this.markers);
      if (verdict === true) attempt.doneAt = attempt.seconds;
      else if (verdict) {
        this.pending = [verdict];
        this.restart = true;
        return null;
      }
    }
    if (attempt.seconds - attempt.doneAt >= SURVIVE) {
      if (attempt.rep + 1 < (drill.reps ?? 1)) {
        this.begin(ctx, attempt.rep + 1);
      } else {
        drill.leave?.(ctx);
        // the target drone stays with no drill after its own, where a sparring bot could take it for prey
        ctx.removeDrone();
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
    this.attempt = { rep, live: false, seconds: 0, held: 0, forward: ctx.me.flight.forward(), points: [], normals: [], next: 0, track: null, side: NaN, warned: false, usedBrake: false, brakeLetGo: false, reach: 0, jinkSide: 0, jinks: 0, lastShot: 0, lit: false, litAt: -Infinity, count: -1, early: false, doneAt: NaN, swept: 0 };
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
