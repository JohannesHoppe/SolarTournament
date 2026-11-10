import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import { Randomizer } from '../random';
import { ARENA_LIMIT } from '../world/arena';
import type { AsteroidField, CircuitName, CourseForm } from '../world/asteroids';
import { GateKit } from '../world/gates';
import { bendRadius, BOW_RADIUS, CLEARANCE, RacingLine } from './racingline';
import { inGrip, WELL_CAUTION } from './alarms';

/** Gates of a lap, and laps of a race. */
export const GATES = 8;
export const LAPS = 3;
/** The grid lies before the pink gate, and its first crossing starts the race: the race ends at the pink gate, LAPS laps later. */
export const FINISH_GATES = GATES * LAPS + 1;

/** The lap a ship flies after passing `gates` gates (1 to LAPS). */
export const lapOf = (gates: number) => Math.min(LAPS, Math.floor(Math.max(0, gates - 1) / GATES) + 1);

/**
 * One gate a lap may be left out: a racer that flies through the gate after its next one has
 * skipped its next, and its skip for that lap is spent (`skipLap`, the lap it was spent in; -1
 * before any). Never the pink gate, which starts, counts and ends the laps. A missed gate costs
 * its points, not the race: turning back is only for the second miss in a lap.
 */
export const canSkip = (gates: number, skipLap: number) => gates % GATES !== 0 && skipLap !== lapOf(gates);
/**
 * Radius of a gate's opening (units, 120 m): wide enough for a pack of 35 m ships, and for a
 * racer coming in at speed a little off its center to pass the coil's solid housings.
 */
export const GATE_RADIUS = 2400;
/**
 * The course is the arena's own form (see CourseForm), drawn at its size for this distance (units,
 * 2 km), or a smooth loop around the field's center at about this distance, swelling and shrinking
 * by up to COURSE_SWELL of it twice around; either rises and falls by up to COURSE_RISE. The gates
 * sit on it, each starting up to COURSE_JITTER (rad, about 2°) off its even place.
 */
const COURSE_RADIUS = 40000;
const COURSE_SWELL = 0.04;
const COURSE_JITTER = 0.04;
/** The loop is laid through this many points, and the gates (see Course). */
const LOOP_POINTS = 144;
/** The loop's distances from the center tried (units, 1.8 to 2.2 km), the turns of its swell tried (half a turn apart, see Course), and the points along it where rock is looked for. */
const LOOP_RADII = [40000, 38000, 42000, 36000, 44000];
const LOOP_TURNS = 8;
/** Every course lies within this share of the arena's edge: a race's loop (see Course) and a ring course of the flight school (see ringCourse); every course fits ahead of a pilot in the middle. */
export const COURSE_ROOM = 0.85;
/** The heights of the loop above the field's plane tried (units, 0 and 600 m up and down): over a flat ring of rock, it may run above or below it. */
const LOOP_LIFTS = [0, 12000, -12000];
/**
 * In a planet's air the loop keeps to its cloud deck (see world/air), which runs through the
 * field's plane: it dives up to COURSE_RISE (200 m) into the clouds and climbs out of them twice
 * a lap, never deep enough for the air to heat a hull at the tournament's limit.
 */
const AIR_LIFTS = [0];
const LOOP_CHECKS = 256;
/**
 * The gates are coils: a ship that flies through the inner third of a ring (BOOST_RADIUS,
 * 40 m from its center) is pulled through by the ring's magnetic field and leaves it
 * BOOST_PUSH faster (units/s, 40 m/s), along the way it went through, though never faster
 * than the tournament's limit plus that push (see Game.boost). Off-center the field would drag
 * the hull into the coil, so the ring only fires for a ship in its core.
 */
export const BOOST_RADIUS = GATE_RADIUS / 3;
export const BOOST_PUSH = 800;
/** A ring that fired glows white this long (s). */
const BOOST_FLASH = 0.35;
/** Up and down along the loop (units, up to 200 m), so the course is not flat. */
const COURSE_RISE = 4000;
/**
 * Over a thin disk with open space above and below it (a ring's layer, see FieldLayout.open) the
 * loop runs through the disk's plane and dives up and down by this much instead (units, 300 m):
 * a lap crosses the layer four times, about a quarter of it within the layer, at no more than
 * about 18°, its dives no tighter than 2.7 km (on the loop's tightest distance, 1.8 km).
 */
const COURSE_DIVE = 6000;
/**
 * A gate keeps GATE_ROOM (units, 200 m) clear of rock, and four times as much of an arena's
 * massive body and out of its grip (see crowded), and stays off the stretches where the racing line bows around
 * rock: the bow, the bends into it and out, and GATE_RUN (units, 300 m) more; a rock counts as
 * soon as its reach plus clearance reaches into the loop. It also stays out of the loop's bends tighter
 * than GATE_BEND (units, 1.5 km, measured over BEND_ARC, 120 m, to either side), and GATE_CLEAR
 * times BEND_ARC (360 m) clear of them: there the racing line
 * runs at its tightest, and a gate in it leaves a pilot no room to swing wide; on a circuit the
 * gates sit on its straights and where its bends open out. To find such a place
 * a gate moves along the loop, back and forth by GATE_STEP (units, 80 m) more each try, up to
 * GATE_TRIES tries (about 720 m either way).
 */
const GATE_ROOM = 4000;
const GATE_RUN = 6000;
const GATE_TRIES = 18;
const GATE_STEP = 1600;
/** Two gates lie at least this far apart along the course (units, 1.2 km), so a racer has room to line up for each. */
const GATE_GAP = 24000;
const GATE_BEND = 30000;
const BEND_ARC = 2400;
const GATE_CLEAR = 3;
/** The variant search builds the racing lines of this many of its best loops, at most (see Course). */
const LINE_TRIES = 32;
/**
 * The grid lies GRID_BEFORE (units, 300 m) before the first gate; a racer's new clone starts
 * RESPAWN_PAST (units, 120 m, a gate's radius) beyond the last gate it passed, within the rock
 * free room the gate keeps (GATE_ROOM).
 */
const GRID_BEFORE = -6000;
const RESPAWN_PAST = GATE_RADIUS;
/** Points for every gate passed, and for the places at the finish; a kill in a race is worth less (see Game). */
export const GATE_POINTS = 20;
export const PLACE_POINTS = [1000, 800, 650, 500, 400, 300, 200, 100];

/**
 * The modes a round can be played in (Last Clone Standing is 'survival', see survival.ts;
 * Capture the Flag is 'flag', see flags.ts; the President's Fleet, every Host against his
 * battleships, is 'fleet', see fleet.ts), and what a tournament room plays: one of them, or
 * all of them in turn.
 */
export type RoundMode = 'deathmatch' | 'race' | 'survival' | 'flag' | 'fleet';
export type RoomMode = RoundMode | 'mixed';
/** Every mode, in the order a mixed room plays them. */
export const ROUND_MODES: readonly RoundMode[] = ['deathmatch', 'race', 'survival', 'flag', 'fleet'];

/**
 * Whether a round takes `start` (on the round's real-time clock) as its start: a solo round
 * always does (a pause or a skipped intro moves it); online a round's start, once `known`,
 * moves only by up to `snap` (the jitter the lead's clock is smoothed by), so an end the lead
 * brings forward never moves the race's time or the probes' schedule.
 */
export const takesStart = (online: boolean, known: number | null, start: number, snap: number) => !online || known === null || Math.abs(start - known) <= snap;

/** The mode of a round: a mixed room starts with a deathmatch and then plays every mode in turn. */
export const modeOfRound = (mode: RoomMode, round: number): RoundMode => (mode === 'mixed' ? ROUND_MODES[round % ROUND_MODES.length] : mode);

const crossing = new THREE.Vector3();
const toGate = new THREE.Vector3();
const through = new THREE.Vector3();
const probe = new THREE.Vector3();
const paceFrom = new THREE.Vector3();
const paceTo = new THREE.Vector3();

/**
 * Whether a gate at `point` lies too close to rock or to the arena's massive body: within
 * GATE_ROOM of the farthest reach of a rock (however the rock turns, the tip of a long one
 * sweeps around it), or four times that of the massive body, or where its pull alone would
 * sound the CAUTION of the escape gauge (see inGrip).
 */
export function crowded(field: AsteroidField, point: THREE.Vector3): boolean {
  const room = GATE_ROOM;
  for (const rock of field.asteroids.values()) if (rock.object.position.distanceTo(point) < rock.radius + room) return true;
  return field.insideWell(point, room * 4) || inGrip(field.well, point, WELL_CAUTION);
}

/** A coil's throw presses the clone into its seat: its g-force strain (see Ship.strain) rises at least to this. */
export const BOOST_STRAIN = 0.3;

/** A coil throws a velocity on along its axis, the way it flies along it, by BOOST_PUSH; never beyond `limit` plus that push (a faster ship keeps its speed). */
export function coilPush(velocity: THREE.Vector3, axis: THREE.Vector3, limit: number) {
  through.copy(axis);
  if (through.dot(velocity) < 0) through.negate();
  const before = velocity.length();
  velocity.addScaledVector(through, BOOST_PUSH);
  const cap = Math.max(before, limit + BOOST_PUSH);
  if (velocity.length() > cap) velocity.setLength(cap);
}

/**
 * How far from the center of a ring (at `point`, facing `normal`, of `radius`) a ship moving
 * from `from` to `to` flew through it, either way (a ring is a ring); null when it did not.
 */
export function ringCrossing(point: THREE.Vector3, normal: THREE.Vector3, radius: number, from: THREE.Vector3, to: THREE.Vector3): number | null {
  const before = toGate.subVectors(from, point).dot(normal);
  const after = crossing.subVectors(to, point).dot(normal);
  if (before < 0 === after < 0) return null;
  // where the path pierces the ring's plane, inside the ring
  crossing.subVectors(to, from).multiplyScalar(before / (before - after)).add(from);
  const off = crossing.distanceTo(point);
  return off < radius ? off : null;
}

/**
 * A racing bot within APPROACH_NEAR (units, 150 m) of its next gate's plane but beside its
 * opening first flies for a point APPROACH_FAR (200 m) before the gate on its axis (see
 * approachGate), so it never runs into the coil's housings from the side.
 */
const APPROACH_NEAR = 3000;
const APPROACH_FAR = 4000;
/** A racer passes a gate this many ship radii inside its rim (about 34 m), or flies for its center first (see approachGate). */
const APPROACH_CLEAR = 2;
const lateral = new THREE.Vector3();

/**
 * Where a racer near its next gate (at `gate`, facing `axis`, of `radius`) flies for: one that
 * would not pass its opening with room to spare would fly into the coil's housings. Beside the
 * opening it flies for a point on the gate's axis APPROACH_FAR before it first; in front of it,
 * but on a way that crosses the gate's plane nearer the rim than APPROACH_CLEAR ship radii (or
 * there already), it flies for the gate's center; otherwise for its `waypoint`. Writes into
 * `waypoint` and returns it.
 */
export function approachGate(gate: THREE.Vector3, axis: THREE.Vector3, radius: number, position: THREE.Vector3, velocity: THREE.Vector3, shipRadius: number, waypoint: THREE.Vector3): THREE.Vector3 {
  const offset = lateral.subVectors(position, gate);
  // the side it comes from: the gate counts either way
  const along = offset.dot(axis);
  if (Math.abs(along) > APPROACH_NEAR) return waypoint;
  offset.addScaledVector(axis, -along);
  const beside = offset.length();
  if (beside >= radius) return waypoint.copy(gate).addScaledVector(axis, (along < 0 ? -1 : 1) * APPROACH_FAR);
  // where its way crosses the gate's plane, flying on as it does
  const toward = velocity.dot(axis) * (along < 0 ? 1 : -1);
  const safe = radius - shipRadius * APPROACH_CLEAR;
  if (toward > 0) offset.addScaledVector(velocity, Math.abs(along) / toward).addScaledVector(axis, -offset.dot(axis));
  if (beside < safe && offset.length() < safe) return waypoint;
  return waypoint.copy(gate);
}

/**
 * Where a ship at `position`, flying on with `velocity` as it is, crosses the plane of a ring
 * (at `point`, facing `normal`, either way), written into `out`; returns how far from the
 * ring's center, or null when the flight does not reach the plane within `horizon` seconds.
 */
export function pathCrossing(position: THREE.Vector3, velocity: THREE.Vector3, point: THREE.Vector3, normal: THREE.Vector3, horizon: number, out: THREE.Vector3): number | null {
  const seconds = toGate.subVectors(point, position).dot(normal) / velocity.dot(normal);
  if (!(seconds > 0 && seconds < horizon)) return null;
  return out.copy(position).addScaledVector(velocity, seconds).distanceTo(point);
}

/**
 * The circuits a course may be laid as (CourseForm 'circuit'), as a planner lays a race track:
 * straights and bends of a set radius one after the other, headings in degrees (positive to the
 * left), lengths and radii in km. Two straights marked `free` take whatever length closes the lap,
 * so the last bend leads back into the first straight. Every bend is at least 1.2 km in radius:
 * where the racing line bows around rock in one (see RacingLine.clear), the two together still
 * bend no tighter than BOW_RADIUS, so the whole lap is flown at the speed limit.
 */
type CircuitPiece = { straight: number } | { bend: number; turn: number } | { free: true };
const CIRCUITS: Record<CircuitName, readonly CircuitPiece[]> = {
  // a long main straight into a hairpin of two bends, a fast S, the back straight, a last long bend
  grand: [{ free: true }, { bend: 1.2, turn: 90 }, { straight: 0.1 }, { bend: 1.2, turn: 90 }, { straight: 0.2 }, { bend: 1.4, turn: -40 }, { bend: 1.4, turn: 40 }, { straight: 0.3 }, { bend: 1.2, turn: 70 }, { free: true }, { bend: 1.3, turn: 110 }],
  // two long straights, a wide double bend at one end, a gentle S into a hairpin at the other
  hairpin: [{ free: true }, { bend: 1.2, turn: 90 }, { straight: 0.5 }, { bend: 1.2, turn: 110 }, { free: true }, { bend: 1.3, turn: -30 }, { bend: 1.3, turn: 30 }, { straight: 0.2 }, { bend: 1.2, turn: 160 }],
  // fast sweeping bends and one chicane
  sweep: [{ free: true }, { bend: 1.3, turn: 60 }, { straight: 0.1 }, { bend: 1.2, turn: -25 }, { bend: 1.2, turn: 25 }, { straight: 0.1 }, { bend: 1.3, turn: 140 }, { free: true }, { bend: 1.45, turn: 160 }],
};
/** A circuit's points are laid this far apart along it (units, 50 m). */
const CIRCUIT_STEP = 1000;
const KM = 20000;
const circuits = new Map<CircuitName, THREE.Vector3[]>();

/** The heading of a piece (degrees) as a direction in the field's plane. */
const along = (heading: number, out: THREE.Vector3) => out.set(cos((heading * Math.PI) / 180), 0, sin((heading * Math.PI) / 180));

/**
 * A circuit's points along it, every CIRCUIT_STEP, centered on the field's center (the middle of
 * its extent), built once: the free straights given the lengths that close it (two equations,
 * the lap's displacement along x and z).
 */
export function circuitPoints(name: CircuitName): THREE.Vector3[] {
  const kept = circuits.get(name);
  if (kept) return kept;
  const pieces = CIRCUITS[name];
  const step = new THREE.Vector3();
  // the displacement of everything but the free straights, and their headings
  const walk = (lengths: number[], points?: THREE.Vector3[]) => {
    const at = new THREE.Vector3();
    let heading = 0;
    let free = 0;
    for (const piece of pieces) {
      if ('bend' in piece) {
        const length = (Math.abs(piece.turn) * Math.PI * piece.bend * KM) / 180;
        const steps = Math.max(1, Math.ceil(length / CIRCUIT_STEP));
        for (let k = 0; k < steps; k++) {
          // the chord of each step, heading through its middle
          const turn = piece.turn / steps;
          const chord = 2 * piece.bend * KM * sin((Math.abs(turn) * Math.PI) / 360);
          at.addScaledVector(along(heading + turn / 2, step), chord);
          heading += turn;
          points?.push(at.clone());
        }
      } else {
        const length = 'free' in piece ? lengths[free++] : piece.straight * KM;
        const steps = Math.max(1, Math.ceil(length / CIRCUIT_STEP));
        for (let k = 0; k < steps; k++) {
          at.addScaledVector(along(heading, step), length / steps);
          points?.push(at.clone());
        }
      }
    }
    return at;
  };
  const headings: number[] = [];
  let heading = 0;
  for (const piece of pieces) {
    if ('bend' in piece) heading += piece.turn;
    else if ('free' in piece) headings.push(heading);
  }
  const rest = walk([0, 0]);
  const [a, b] = headings.map((h) => along(h, new THREE.Vector3()));
  const det = a.x * b.z - b.x * a.z;
  const lengths = [(-rest.x * b.z + rest.z * b.x) / det, (-a.x * rest.z + a.z * rest.x) / det];
  const points: THREE.Vector3[] = [];
  walk(lengths, points);
  const box = new THREE.Box3().setFromPoints(points);
  const middle = box.getCenter(new THREE.Vector3());
  for (const point of points) point.sub(middle);
  circuits.set(name, points);
  return points;
}

/**
 * The shapes a course may take instead of the loop round the center (FieldLayout.course), each
 * flat (the course's rise comes on top), its points spread along it by `angle` (a whole turn, a
 * lap), scaled by `scale` (the loop's distances tried, see LOOP_RADII):
 * - a circuit (see CIRCUITS), laid as a race track is: long straights, hairpins, fast bends, S-bends;
 * - an ellipse with the field's center at one focus, `near` from it at its nearest and `far` at
 *   its farthest (units): a course that dives towards a massive body there and swings out again,
 *   its gates closer together where it passes nearest.
 */
function formPoint(course: CourseForm, angle: number, scale: number, out: THREE.Vector3): THREE.Vector3 {
  if (course.form === 'circuit') {
    // the circuit's points spread along it by the share of a lap, between its points linearly
    const points = circuitPoints(course.layout);
    const s = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * points.length;
    const i = Math.floor(s);
    return out.lerpVectors(points[i % points.length], points[(i + 1) % points.length], s - i).multiplyScalar(scale);
  }
  const near = course.near * scale;
  const far = course.far * scale;
  const e = (far - near) / (far + near);
  const r = (near * (1 + e)) / (1 + e * cos(angle));
  return out.set(r * cos(angle), 0, r * sin(angle));
}

/** How far a form reaches from the field's center at scale 1 (units). */
function formReach(course: CourseForm): number {
  if (course.form === 'ellipse') return course.far;
  return Math.max(...circuitPoints(course.layout).map((point) => point.length()));
}

/**
 * A race course: GATES rings in a loop around the field's center (or in the arena's own form, see
 * CourseForm), rising and falling, each facing the way from the gate before. It is built from the
 * arena's freshly generated field and the arena's seed, so every browser builds the same course;
 * gates keep clear of rock as the field starts out (rocks that circle may cross the course later:
 * mind them).
 */
export class Course {
  readonly root = new THREE.Group();
  readonly points: THREE.Vector3[] = [];
  readonly normals: THREE.Vector3[] = [];
  /** The ideal line through the centers of the gates, around the loop (bowing around rock as it lies, see RacingLine.clear). */
  readonly line: RacingLine;
  /** The windings of each gate (see GateKit): their glow tells the pilot which gate is which. */
  private readonly rings: THREE.Mesh[] = [];
  private readonly kit = new GateKit(GATE_RADIUS);
  /** The next gate's coil glows in the tournament's orange, the one after it in blue, the rest faintly; the start and finish is pink. */
  private readonly next = this.kit.coilMaterial(0xff8c00, 2.6);
  private readonly after = this.kit.coilMaterial(0x4d91ff, 2);
  private readonly faint = this.kit.coilMaterial(0x2a4e8c, 0.9, true);
  private readonly finish = this.kit.coilMaterial(0xff4da6, 2.4);
  private readonly fired = this.kit.coilMaterial(0xffe6bf, 4);
  /** Until when each ring glows from its coil firing (game time, s). */
  private readonly flashUntil: number[] = new Array<number>(GATES).fill(-Infinity);

  constructor(field: AsteroidField, seed: number) {
    const r = new Randomizer(seed * 7 + 3);
    const start = r.range(0, Math.PI * 2);
    const jitter = Array.from({ length: GATES }, () => r.range(-COURSE_JITTER, COURSE_JITTER));
    const shape = { lift: 0, radius: COURSE_RADIUS, swell: 0, phase: 0 };
    // through a ring's layer, diving up and down through it (see COURSE_DIVE)
    const dives = !!field.layout?.open;
    const rise = dives ? COURSE_DIVE : COURSE_RISE;
    const form = field.layout?.course ?? null;
    const loop = (angle: number, out: THREE.Vector3) => {
      if (form) {
        formPoint(form, angle, shape.radius / COURSE_RADIUS, out);
        // the swell's turns turn the whole form about the center instead
        const turn = shape.phase * 2;
        const x = out.x * cos(turn) - out.z * sin(turn);
        const z = out.x * sin(turn) + out.z * cos(turn);
        return out.set(x, shape.lift + sin(angle * 2 + start) * rise, z);
      }
      const distance = shape.radius * (1 + shape.swell * sin(angle * 2 + shape.phase));
      return out.set(cos(angle) * distance, shape.lift + sin(angle * 2 + start) * rise, sin(angle) * distance);
    };
    // of LOOP_LIFTS heights (only the plane's through a ring's layer), LOOP_RADII distances, swells
    // and turns of the swell, the loops ranked by how deep their gates lie in rock or in the racing
    // line's bows around it, then by how far they run through rock
    const candidates: { shape: typeof shape; angles: number[]; badness: number; intrusion: number }[] = [];
    for (const lift of dives ? [0] : field.air ? AIR_LIFTS : LOOP_LIFTS) {
      for (const radius of LOOP_RADII) {
        // a form drawn larger than fits within COURSE_ROOM of the edge is never tried
        if (form && formReach(form) * (radius / COURSE_RADIUS) > ARENA_LIMIT * COURSE_ROOM) continue;
        for (const swell of form ? [COURSE_SWELL] : [0, COURSE_SWELL]) {
          for (let turn = 0; turn < (swell ? LOOP_TURNS : 1); turn++) {
            Object.assign(shape, { lift, radius, swell, phase: (turn / LOOP_TURNS) * Math.PI });
            candidates.push({ shape: { ...shape }, ...this.layout(field, loop, start, jitter) });
          }
        }
      }
    }
    candidates.sort((a, b) => (Math.abs(a.badness - b.badness) > 1e-9 ? a.badness - b.badness : a.intrusion - b.intrusion));
    // of the best LINE_TRIES, the first whose racing line, bowed around the rock, bends nowhere
    // tighter than BOW_RADIUS (where a bow meets a bend of the loop, it may), else the gentlest
    let chosen: { angles: number[]; line: RacingLine } | null = null;
    const best = { ...shape };
    let gentlest = -Infinity;
    for (const candidate of candidates.slice(0, LINE_TRIES)) {
      Object.assign(shape, candidate.shape);
      const line = this.lineAlong(loop, candidate.angles);
      const tightest = line.tightest(field);
      if (tightest > gentlest) {
        gentlest = tightest;
        chosen = { angles: candidate.angles, line };
        Object.assign(best, candidate.shape);
      }
      if (tightest >= BOW_RADIUS) break;
    }
    Object.assign(shape, best);
    for (const angle of chosen!.angles) {
      const point = loop(angle, new THREE.Vector3());
      this.points.push(point);
      this.normals.push(loop(angle + 1e-4, new THREE.Vector3()).sub(point).normalize());
    }
    for (let i = 0; i < GATES; i++) {
      const gate = this.kit.build(this.points[i], this.normals[i], this.faint);
      this.rings.push(gate.coil);
      this.root.add(gate.root);
    }
    this.line = chosen!.line;
  }

  /** The line along the loop through every gate at `angles`: the loop's points between the gates. */
  private lineAlong(loop: (angle: number, out: THREE.Vector3) => THREE.Vector3, angles: readonly number[]): RacingLine {
    const through: THREE.Vector3[] = [];
    const at: number[] = [];
    for (let i = 0; i < GATES; i++) {
      at.push(through.length);
      through.push(loop(angles[i], new THREE.Vector3()));
      const to = i + 1 < GATES ? angles[i + 1] : angles[0] + Math.PI * 2;
      const steps = Math.max(1, Math.round(((to - angles[i]) / (Math.PI * 2)) * LOOP_POINTS));
      for (let k = 1; k < steps; k++) through.push(loop(angles[i] + ((to - angles[i]) * k) / steps, new THREE.Vector3()));
    }
    return new RacingLine(through, true, undefined, undefined, at);
  }

  /**
   * The gates on a loop (`loop`: a point at an angle around the center): each near its even place
   * (from `start`, `jitter` off it), away from rock, from the arena's massive body and from the
   * stretches where the racing line bows around rock (the bow, as wide as a circle of BOW_RADIUS
   * makes it, the S-bends of that radius into it and out, and GATE_RUN more): a gate there would
   * pin the line onto the loop in the middle of a bend. It moves back and forth along the loop;
   * where every place is in a bow, it takes the place least deep in one. Returns the gates'
   * angles, how deep they lie in rock or bows together (rad, 0 for none), and how far the loop
   * runs into rock all along (units, summed over LOOP_CHECKS points).
   */
  private layout(field: AsteroidField, loop: (angle: number, out: THREE.Vector3) => THREE.Vector3, start: number, jitter: readonly number[]) {
    const bows: { angle: number; half: number }[] = [];
    let intrusion = 0;
    // the loop's points where rock is looked for: they depend on the layout alone, so they are
    // taken once for all the rocks
    const samples = new Float64Array(LOOP_CHECKS * 3);
    for (let k = 0; k < LOOP_CHECKS; k++) loop((k / LOOP_CHECKS) * Math.PI * 2, probe).toArray(samples, k * 3);
    // how far along the loop a step of angle goes there (units per rad), for stretches given in units
    const pace = (angle: number) => loop(angle + 1e-3, paceTo).distanceTo(loop(angle - 1e-3, paceFrom)) / 2e-3;
    const bowAround = (center: THREE.Vector3, reach: number) => {
      let deepest = -Infinity;
      let deepestAt = 0;
      for (let k = 0; k < LOOP_CHECKS; k++) {
        const dx = samples[k * 3] - center.x, dy = samples[k * 3 + 1] - center.y, dz = samples[k * 3 + 2] - center.z;
        const depth = reach - Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (depth > 0) intrusion += depth;
        if (depth > deepest) {
          deepest = depth;
          deepestAt = k;
        }
      }
      if (deepest <= 0) return;
      const angle = (deepestAt / LOOP_CHECKS) * Math.PI * 2;
      bows.push({ angle, half: (2 * Math.sqrt(BOW_RADIUS * deepest) + GATE_RUN) / pace(angle) });
    };
    for (const rock of field.asteroids.values()) bowAround(rock.object.position, rock.radius + CLEARANCE);
    if (field.well) bowAround(field.well.position, field.well.radius + CLEARANCE * 2);
    // how far into a bow a gate at `angle` would lie (rad, 0 outside every bow)
    const inBow = (angle: number) => {
      let deepest = 0;
      for (const bow of bows) deepest = Math.max(deepest, bow.half - Math.abs(atan2(sin(angle - bow.angle), cos(angle - bow.angle))));
      return deepest;
    };
    // how far a gate at `angle` lies inside a bend tighter than GATE_BEND (0 outside, up to 1)
    const inBend = (angle: number) => {
      const arc = BEND_ARC / pace(angle);
      let radius = Infinity;
      for (let k = -GATE_CLEAR; k <= GATE_CLEAR; k++) {
        const at = angle + k * arc;
        radius = Math.min(radius, bendRadius(loop(at - arc, paceFrom), loop(at, probe), loop(at + arc, paceTo)));
      }
      return Math.max(0, 1 - radius / GATE_BEND);
    };
    const spacing = (Math.PI * 2) / GATES;
    const angles: number[] = [];
    let badness = 0;
    for (let i = 0; i < GATES; i++) {
      const even = start + i * spacing + jitter[i];
      let angle = even;
      let worst = Infinity;
      for (let attempt = 0; attempt <= GATE_TRIES && worst > 0; attempt++) {
        const step = pace(even);
        const tried = even + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * (GATE_STEP / step);
        // never nearer than GATE_GAP along the course to the gate before it (or, for the last, the first)
        const gap = Math.min(i > 0 ? tried - angles[i - 1] : Infinity, i === GATES - 1 ? angles[0] + Math.PI * 2 - tried : Infinity) * step;
        const bad = (crowded(field, loop(tried, probe)) || gap < GATE_GAP ? Math.PI : 0) + inBow(tried) + inBend(tried);
        if (bad < worst) {
          worst = bad;
          angle = tried;
        }
      }
      angles.push(angle);
      badness += worst;
    }
    // a bow around rock in one of the loop's tight bends bends the line tighter yet
    for (const bow of bows) badness += inBend(bow.angle);
    return { angles, badness, intrusion };
  }

  /**
   * How far from a gate's center a ship moving from `from` to `to` this frame flew through it,
   * either way (a ring is a ring); null when it did not fly through.
   */
  crossing(gate: number, from: THREE.Vector3, to: THREE.Vector3): number | null {
    return ringCrossing(this.points[gate], this.normals[gate], GATE_RADIUS, from, to);
  }

  /** A gate's coil fired (see BOOST_RADIUS): it glows white for a moment. */
  flash(gate: number, now: number) {
    this.flashUntil[gate] = now + BOOST_FLASH;
  }

  /** Shows the own pilot's next gates: the next one bright, the one after in blue, a ring that just fired white; the gates' position lights blink. */
  highlight(next: number, now: number) {
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].material = now < this.flashUntil[i] ? this.fired : i === next ? this.next : i === (next + 1) % GATES ? this.after : i === 0 ? this.finish : this.faint;
    }
    this.kit.blink(now);
  }

  /**
   * Where a ship (re)starts that has passed `passed` gates: on the grid before the start, or
   * RESPAWN_PAST beyond the last gate passed, so the eight slots, up to 111 m from the gate's
   * axis, stay clear of its housings.
   */
  startOf(passed: number, slot: number, position: THREE.Vector3): THREE.Vector3 {
    const gate = passed === 0 ? 0 : (passed - 1) % GATES;
    const behind = passed === 0 ? GRID_BEFORE : RESPAWN_PAST;
    // ships side by side, so a grid of eight does not start in one place
    const side = toGate.set(0, 1, 0).cross(this.normals[gate]).normalize();
    return position
      .copy(this.points[gate])
      .addScaledVector(this.normals[gate], behind)
      .addScaledVector(side, ((slot % 4) - 1.5) * 1400)
      .addScaledVector(crossing.set(0, 1, 0), (Math.floor(slot / 4) - 0.5) * 1400);
  }

  dispose() {
    this.root.clear();
    this.kit.dispose();
  }
}
