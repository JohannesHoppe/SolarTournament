import * as THREE from 'three';
import { Randomizer } from '../random';
import type { AsteroidField } from '../world/asteroids';
import { GateKit } from '../world/gates';
import { BOW_RADIUS, CLEARANCE, RacingLine } from './racingline';

/** Gates of a lap, and laps of a race. */
export const GATES = 8;
export const LAPS = 3;
/** The grid lies before the pink gate, and its first crossing starts the race: the race ends at the pink gate, LAPS laps later. */
export const FINISH_GATES = GATES * LAPS + 1;

/** The lap a ship flies after passing `gates` gates (1 to LAPS). */
export const lapOf = (gates: number) => Math.min(LAPS, Math.floor(Math.max(0, gates - 1) / GATES) + 1);
/**
 * Radius of a gate's opening (units, 120 m): wide enough for a pack of 35 m ships, and for a
 * racer coming in at speed a little off its center to pass the coil's solid housings.
 */
export const GATE_RADIUS = 2400;
/**
 * The course is a smooth loop around the field's center at about this distance (units, 2 km),
 * swelling and shrinking by up to COURSE_SWELL of it twice around and rising and falling by up to
 * COURSE_RISE: a lap of about 12.5 km that bends no tighter than about 1.5 km, so the racing
 * line, bowed around rock (see RacingLine.clear), can be flown at the speed limit. The gates sit
 * on the loop, about 1.5 km apart, each up to COURSE_JITTER (rad, about 2°) off its even place.
 */
const COURSE_RADIUS = 40000;
const COURSE_SWELL = 0.04;
const COURSE_JITTER = 0.04;
/** The loop is laid through this many points, and the gates (see Course). */
const LOOP_POINTS = 48;
/** The loop's distances from the center tried (units, 1.8 to 2.2 km), the turns of its swell tried (half a turn apart, see Course), and the points along it where rock is looked for. */
const LOOP_RADII = [40000, 38000, 42000, 36000, 44000];
const LOOP_TURNS = 8;
/** The heights of the loop above the field's plane tried (units, 0 and 600 m up and down): over a flat ring of rock, it may run above or below it. */
const LOOP_LIFTS = [0, 12000, -12000];
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
 * massive body (see crowded), and stays off the stretches where the racing line bows around
 * rock: the bow, the bends into it and out, and GATE_RUN (units, 100 m) more; a rock counts once
 * its reach plus clearance comes within RUN_ROOM (units, 100 m) of the loop. To find such a place
 * a gate moves along the loop, back and forth by GATE_STEP (units, 80 m) more each try, up to
 * GATE_TRIES tries (about 720 m either way).
 */
const GATE_ROOM = 4000;
const GATE_RUN = 6000;
const GATE_TRIES = 18;
const GATE_STEP = 1600;
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

/**
 * Whether a gate at `point` lies too close to rock or to the arena's massive body: within
 * GATE_ROOM of the farthest reach of a rock (however the rock turns, the tip of a long one
 * sweeps around it), or four times that of the massive body.
 */
export function crowded(field: AsteroidField, point: THREE.Vector3): boolean {
  const room = GATE_ROOM;
  for (const rock of field.asteroids.values()) if (rock.object.position.distanceTo(point) < rock.radius + room) return true;
  return field.insideWell(point, room * 4);
}

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
 * A race course: GATES rings in a loop around the field's center, rising and falling, each
 * facing the way from the gate before. It is built from the arena's freshly generated field
 * and the arena's seed, so every browser builds the same course; gates keep clear of rock as
 * the field starts out (rocks that circle may cross the course later: mind them).
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
    const loop = (angle: number, out: THREE.Vector3) => {
      const distance = shape.radius * (1 + shape.swell * Math.sin(angle * 2 + shape.phase));
      return out.set(Math.cos(angle) * distance, shape.lift + Math.sin(angle * 2 + start) * rise, Math.sin(angle) * distance);
    };
    // of LOOP_LIFTS heights (only the plane's through a ring's layer), LOOP_RADII distances, swells and turns of the swell, the loop whose
    // gates lie least deep in rock or in the racing line's bows around it, then the one that runs
    // through least rock
    let best = { ...shape };
    let bestAngles: number[] = [];
    let least = [Infinity, Infinity];
    for (const lift of dives ? [0] : LOOP_LIFTS) {
      for (const radius of LOOP_RADII) {
        for (const swell of [0, COURSE_SWELL]) {
          for (let turn = 0; turn < (swell ? LOOP_TURNS : 1); turn++) {
            Object.assign(shape, { lift, radius, swell, phase: (turn / LOOP_TURNS) * Math.PI });
            const { angles, badness, intrusion } = this.layout(field, loop, start, jitter);
            if (badness < least[0] - 1e-9 || (badness < least[0] + 1e-9 && intrusion < least[1])) {
              least = [badness, intrusion];
              best = { ...shape };
              bestAngles = angles;
            }
          }
        }
      }
    }
    Object.assign(shape, best);
    const angles = bestAngles;
    for (const angle of angles) {
      const point = loop(angle, new THREE.Vector3());
      this.points.push(point);
      this.normals.push(loop(angle + 1e-4, new THREE.Vector3()).sub(point).normalize());
    }
    for (let i = 0; i < GATES; i++) {
      const gate = this.kit.build(this.points[i], this.normals[i], this.faint);
      this.rings.push(gate.coil);
      this.root.add(gate.root);
    }
    // the line runs along the loop, through every gate: the loop's points between the gates
    const through: THREE.Vector3[] = [];
    const at: number[] = [];
    for (let i = 0; i < GATES; i++) {
      at.push(through.length);
      through.push(this.points[i]);
      const to = i + 1 < GATES ? angles[i + 1] : angles[0] + Math.PI * 2;
      const steps = Math.max(1, Math.round(((to - angles[i]) / (Math.PI * 2)) * LOOP_POINTS));
      for (let k = 1; k < steps; k++) through.push(loop(angles[i] + ((to - angles[i]) * k) / steps, new THREE.Vector3()));
    }
    this.line = new RacingLine(through, true, undefined, undefined, at);
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
    const bowAround = (center: THREE.Vector3, reach: number) => {
      let deepest = -Infinity;
      let angle = 0;
      for (let k = 0; k < LOOP_CHECKS; k++) {
        const depth = reach - loop((k / LOOP_CHECKS) * Math.PI * 2, probe).distanceTo(center);
        if (depth > 0) intrusion += depth;
        if (depth > deepest) {
          deepest = depth;
          angle = (k / LOOP_CHECKS) * Math.PI * 2;
        }
      }
      const radius = loop(angle, probe).setY(0).length();
      if (deepest > 0 && radius > 0) bows.push({ angle, half: (2 * Math.sqrt(BOW_RADIUS * deepest) + GATE_RUN) / radius });
    };
    for (const rock of field.asteroids.values()) bowAround(rock.object.position, rock.radius + CLEARANCE);
    if (field.well) bowAround(field.well.position, field.well.radius + CLEARANCE * 2);
    // how far into a bow a gate at `angle` would lie (rad, 0 outside every bow)
    const inBow = (angle: number) => {
      let deepest = 0;
      for (const bow of bows) deepest = Math.max(deepest, bow.half - Math.abs(Math.atan2(Math.sin(angle - bow.angle), Math.cos(angle - bow.angle))));
      return deepest;
    };
    const spacing = (Math.PI * 2) / GATES;
    const angles: number[] = [];
    let badness = 0;
    for (let i = 0; i < GATES; i++) {
      const even = start + i * spacing + jitter[i];
      let angle = even;
      let worst = Infinity;
      for (let attempt = 0; attempt <= GATE_TRIES && worst > 0; attempt++) {
        const step = loop(even, probe).length();
        const tried = even + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * (GATE_STEP / step);
        const bad = (crowded(field, loop(tried, probe)) ? Math.PI : 0) + inBow(tried);
        if (bad < worst) {
          worst = bad;
          angle = tried;
        }
      }
      angles.push(angle);
      badness += worst;
    }
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
