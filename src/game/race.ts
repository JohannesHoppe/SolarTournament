import * as THREE from 'three';
import { Randomizer } from '../random';
import type { AsteroidField } from '../world/asteroids';
import { GateKit } from '../world/gates';
import { RacingLine } from './racingline';

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
 * The course loops around the field's center at about this distance (units, 2 km), 150 m more
 * or less, through the outer rocks: a lap of about 12.5 km, gates 1 to 1.9 km apart, so the
 * bends stay gentle enough for path steering at the speed limit (see PATH_GRIP: a 415 m turn;
 * the racing line's tightest bend has 600 m and more).
 */
const COURSE_RADIUS = 40000;
const COURSE_SPREAD = 3000;
/** Every other gate lies this much closer to the center (about 1.9 km out): the loop weaves a little, past rock at speed. */
const COURSE_INNER = 0.95;
/** Each gate lies up to this angle (rad, about 5°) off its even place around the loop. */
const COURSE_JITTER = 0.08;
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
/** Up and down along the loop (units, up to 400 m), so the course is not flat. */
const COURSE_RISE = 8000;
/**
 * A gate keeps GATE_ROOM (units, 200 m) clear of rock, and four times as much of an arena's
 * massive body (see crowded); to find such a place it tries up to GATE_TRIES spots on a spiral
 * around where it would be (up and down, along the loop), a golden angle apart, SPIRAL_STEP
 * (units, 80 m) times the square root of the try out (out to about 640 m).
 */
const GATE_ROOM = 4000;
const GATE_TRIES = 64;
const SPIRAL_STEP = 1600;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
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

/** The mode of a round: a mixed room starts with a deathmatch and then plays every mode in turn. */
export const modeOfRound = (mode: RoomMode, round: number): RoundMode => (mode === 'mixed' ? ROUND_MODES[round % ROUND_MODES.length] : mode);

const crossing = new THREE.Vector3();
const toGate = new THREE.Vector3();
const through = new THREE.Vector3();

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
    for (let i = 0; i < GATES; i++) {
      const angle = start + (i / GATES) * Math.PI * 2 + r.range(-COURSE_JITTER, COURSE_JITTER);
      const distance = (COURSE_RADIUS + r.range(-COURSE_SPREAD, COURSE_SPREAD)) * (i % 2 ? COURSE_INNER : 1);
      const point = new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle * 2 + start) * COURSE_RISE, Math.sin(angle) * distance);
      // away from rock and from the arena's massive body: on a widening spiral up, down, back
      // and forth along the loop around where the gate would be, which bends the loop least
      const along = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const spot = point.clone();
      for (let attempt = 1; attempt < GATE_TRIES && crowded(field, point); attempt++) {
        const turn = attempt * GOLDEN_ANGLE;
        const reach = SPIRAL_STEP * Math.sqrt(attempt);
        point.copy(spot).addScaledVector(along, Math.cos(turn) * reach);
        point.y += Math.sin(turn) * reach;
      }
      this.points.push(point);
    }
    for (let i = 0; i < GATES; i++) {
      // each gate faces along the loop: from the gate before towards the gate after
      this.normals.push(this.points[(i + 1) % GATES].clone().sub(this.points[(i + GATES - 1) % GATES]).normalize());
      const gate = this.kit.build(this.points[i], this.normals[i], this.faint);
      this.rings.push(gate.coil);
      this.root.add(gate.root);
    }
    this.line = new RacingLine(this.points, true);
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
    this.rings.forEach((ring, i) => {
      ring.material = now < this.flashUntil[i] ? this.fired : i === next ? this.next : i === (next + 1) % GATES ? this.after : i === 0 ? this.finish : this.faint;
    });
    this.kit.blink(now);
  }

  /** Where a ship (re)starts that has passed `passed` gates, and which way it looks: before the start, or at the last gate passed, towards the next. */
  startOf(passed: number, slot: number, position: THREE.Vector3): THREE.Vector3 {
    const gate = passed === 0 ? 0 : (passed - 1) % GATES;
    const behind = passed === 0 ? -6000 : 0;
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
