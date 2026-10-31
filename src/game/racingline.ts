import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { MAX_SPEED, turnRadius } from '../ship/flight';

/** Samples of the line between two gates, for its length and for finding the point nearest a ship. */
const SAMPLES = 48;
/** An open line (the flight school's rings) runs on this far beyond its last gate (units, 300 m). */
const RUN_OUT = 6000;
/** The line keeps this far from the farthest reach of a rock (units, 100 m: six ship radii, room for a Host's hand), and twice as far from a massive body. */
export const CLEARANCE = 2000;
/** Within this distance along the line of a gate (units, 80 m, two thirds of a gate's 120 m radius) the line runs through the gate's center, whatever lies beside it. */
const GATE_FADE = 1600;
/**
 * Around rock the line bends no tighter than this (units, about 730 m): a quarter more than the
 * autopilot's tightest turn at the speed limit (see turnRadius), so a Host holding the drive on
 * the line never meets a bend the flight cannot follow.
 */
export const BOW_RADIUS = Math.ceil(turnRadius(MAX_SPEED) * 1.25);
/** The line bows around rock as it lies at most this long ago (s of field time): it moves slowly, so the bows are laid anew every so often. */
const BOW_REFRESH = 1;
/**
 * Points of the bowed line every BOW_STEP (units, 100 m), relaxed BOW_PASSES times when the bows
 * are laid for a field (see bowAround), and BOW_KEEP_PASSES times from the bows before as the
 * rocks move on; each pass eases a bow's bending by BOW_EASE of its fourth difference.
 */
const BOW_STEP = 2000;
const BOW_PASSES = 2000;
const BOW_KEEP_PASSES = 200;
const BOW_EASE = 0.1;
/** How far a rock's reach may lie off the plain line and still be one the line bows around (units, 500 m): the bows move the line towards it. */
const BOW_REACH = 10000;
/** A racer looks this far ahead along the line for where to fly (seconds of its flight), at least LOOK_MIN (units, 100 m). */
const LOOK_SECONDS = 0.8;
const LOOK_MIN = 2000;
/**
 * Before it is through its next gate, a racer looks no farther than this past it (units, 50 m):
 * a point far around the corner after a gate pulls it off the gate's center towards the rim
 * before it gets there.
 */
const LOOK_PAST = 1000;
/** A racer past a gate it missed comes back for a point this many turn radii before it (see target). */
const RETURN_ROOM = 2;

const sample = new THREE.Vector3();
const tangent = new THREE.Vector3();
const off = new THREE.Vector3();
const chord = new THREE.Vector3();
const point = new THREE.Vector3();
const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const p3 = new THREE.Vector3();

/** The radius of the circle through three points (units): how tight a line through them bends there; Infinity on a straight. */
export function bendRadius(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const twiceArea = off.subVectors(b, a).cross(chord.subVectors(c, a)).length();
  return twiceArea < 1e-6 ? Infinity : (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (2 * twiceArea);
}

/** Something the line keeps clear of, as the bows see it: a sphere (center x, y, z and radius) that holds the rock's reach plus clearance. */
interface Keep {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/**
 * The ideal line of a course: a smooth curve (centripetal Catmull-Rom) through the center of
 * every gate, where its coil fires, in the order they are flown; closed for a race's loop, open
 * for the flight school's rings, from a lead-in point before the first. Positions on it are
 * given by their distance along it (units), so the racing line's dashes sit on it at fixed
 * spacing. Where rock lies close to it as the field is now, the line bows out around it (see
 * clear): the racing line shows that way, and racing bots fly it.
 */
export class RacingLine {
  /** Its whole length (units). */
  readonly length: number;
  private readonly curve: THREE.CatmullRomCurve3;
  /** Distance along the line at each sample, and where each gate lies on it. */
  private readonly arcs: number[] = [];
  private readonly gates: number[] = [];
  /** The plain line every BOW_STEP (x, y, z), how far the bowed line lies off it there, and the points held on the plain line (through a gate). */
  private readonly plain: Float64Array;
  private readonly bows: Float64Array;
  private readonly held: Uint8Array;
  private readonly relaxed: Float64Array;
  /** The spheres each point may meet (see bowAround), kept between passes of the refresh to be reused. */
  private readonly near: Keep[][];
  private readonly step: number;
  /** The field and its clock the bows were laid for (see bowAround). */
  private bowField: AsteroidField | null = null;
  private bowClock = 0;

  /**
   * A line through `gates`, or through every point of `gates` with the gates at the indices
   * `gateAt` among them (a loop laid through points between its gates). An open line runs
   * `runOut` (units) beyond its last point: on through a ring, or not at all for a place to stop
   * at.
   */
  constructor(
    gates: readonly THREE.Vector3[],
    readonly closed: boolean,
    lead?: THREE.Vector3,
    runOut = RUN_OUT,
    gateAt: readonly number[] = gates.map((_, i) => i),
  ) {
    const points = gates.map((gate) => gate.clone());
    const offset = !closed && lead ? 1 : 0;
    if (!closed) {
      if (lead) points.unshift(lead.clone());
      const last = points[points.length - 1];
      if (runOut > 0) points.push(last.clone().sub(points[points.length - 2]).setLength(runOut).add(last));
    }
    this.curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const segments = closed ? points.length : points.length - 1;
    const total = segments * SAMPLES;
    const previous = this.curve.getPoint(0, new THREE.Vector3());
    let arc = 0;
    for (let i = 0; i <= total; i++) {
      this.curve.getPoint(i / total, sample);
      arc += sample.distanceTo(previous);
      previous.copy(sample);
      this.arcs.push(arc);
    }
    this.length = arc;
    for (const index of gateAt) this.gates.push(this.arcs[(index + offset) * SAMPLES]);
    // the points the bows are laid on: the ends of an open line and the stretch through each gate stay where they are
    const count = Math.max(2, closed ? Math.round(this.length / BOW_STEP) : Math.ceil(this.length / BOW_STEP) + 1);
    this.step = this.length / (closed ? count : count - 1);
    this.plain = new Float64Array(count * 3);
    this.bows = new Float64Array(count * 3);
    this.held = new Uint8Array(count);
    this.relaxed = new Float64Array(count * 3);
    this.near = Array.from({ length: count }, () => []);
    for (let i = 0; i < count; i++) {
      this.point(i * this.step, sample).toArray(this.plain, i * 3);
      const s = i * this.step;
      for (const gate of this.gates) {
        const d = Math.abs(s - gate);
        if (Math.min(d, closed ? this.length - d : Infinity) < Math.max(GATE_FADE, this.step * 1.01)) this.held[i] = 1;
      }
    }
    if (!closed) this.held[0] = this.held[count - 1] = 1;
  }

  get gateCount() {
    return this.gates.length;
  }

  /** The point at distance `s` along the line: around the loop for a closed one, held at the ends for an open one. */
  point(s: number, out: THREE.Vector3): THREE.Vector3 {
    const at = this.closed ? ((s % this.length) + this.length) % this.length : THREE.MathUtils.clamp(s, 0, this.length);
    const arcs = this.arcs;
    let low = 0;
    let high = arcs.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (arcs[mid] <= at) low = mid;
      else high = mid;
    }
    const span = arcs[high] - arcs[low];
    const t = (low + (span > 0 ? (at - arcs[low]) / span : 0)) / (arcs.length - 1);
    return this.curve.getPoint(Math.min(1, t), out);
  }

  /**
   * The point at distance `s`, bowed out around the rock of `field` as it lies now (see
   * bowAround): the line keeps CLEARANCE from every rock's reach (twice that from a massive body)
   * and bends no tighter than BOW_RADIUS doing it; through a gate it runs through its center.
   */
  clear(s: number, field: AsteroidField, out: THREE.Vector3): THREE.Vector3 {
    if (this.bowField !== field || Math.abs(field.clock - this.bowClock) > BOW_REFRESH) this.bowAround(field);
    const count = this.held.length;
    // around a closed loop, `s` may run past its length (the next lap)
    const at = this.closed ? ((((s % this.length) + this.length) % this.length) / this.step) : THREE.MathUtils.clamp(s / this.step, 0, count - 1);
    const i = Math.min(Math.floor(at), this.closed ? count - 1 : count - 2);
    const t = at - i;
    // a uniform Catmull-Rom spline through the bowed points around
    this.bowed(i - 1, p0);
    this.bowed(i, p1);
    this.bowed(i + 1, p2);
    this.bowed(i + 2, p3);
    const t2 = t * t;
    const t3 = t2 * t;
    return out
      .copy(p0).multiplyScalar(-0.5 * t3 + t2 - 0.5 * t)
      .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
      .addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
  }

  /** The bowed point `i` (around a closed loop, held at the ends of an open one). */
  private bowed(i: number, out: THREE.Vector3): THREE.Vector3 {
    const count = this.held.length;
    const k = this.closed ? ((i % count) + count) % count : THREE.MathUtils.clamp(i, 0, count - 1);
    return out.fromArray(this.plain, k * 3).add(point.fromArray(this.bows, k * 3));
  }

  /**
   * Lays the bows around the rock of `field` as it lies now, an elastic band: every rock whose
   * reach plus CLEARANCE comes near the plain line keeps the line out of a sphere that holds that
   * reach and is BOW_RADIUS wide (the same near side, the rest of it behind the rock), so where
   * the line wraps around it, it bends no tighter than BOW_RADIUS. Pass after pass, every point's
   * bow eases towards its neighbours' and is pushed back out of every sphere it lies in; the
   * stretch through each gate stays on the plain line. As the rocks move on, the bows before go
   * on relaxing from where they were.
   */
  private bowAround(field: AsteroidField) {
    const fresh = this.bowField !== field || field.clock < this.bowClock;
    this.bowField = field;
    this.bowClock = field.clock;
    const count = this.held.length;
    const keeps: Keep[] = [];
    const add = (center: THREE.Vector3, reach: number) => {
      // the nearest point of the plain line, and the side of the rock it lies on
      let best = Infinity;
      let nearest = 0;
      for (let i = 0; i < count; i++) {
        const d = sample.fromArray(this.plain, i * 3).distanceToSquared(center);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (Math.sqrt(best) > reach + BOW_REACH) return;
      off.fromArray(this.plain, nearest * 3).sub(center);
      if (off.lengthSq() < 1) {
        // straight through the center: out upwards (or sideways, for a line that runs up or down)
        this.bowed(nearest + 1, tangent).sub(this.bowed(nearest, sample)).normalize();
        off.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
        if (off.lengthSq() < 1e-6) off.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
      }
      off.normalize();
      const radius = Math.max(reach, BOW_RADIUS);
      sample.copy(center).addScaledVector(off, reach - radius);
      keeps.push({ x: sample.x, y: sample.y, z: sample.z, radius });
    };
    for (const rock of field.asteroids.values()) add(rock.object.position, rock.radius + CLEARANCE);
    if (field.well) add(field.well.position, field.well.radius + CLEARANCE * 2);
    const bows = this.bows;
    if (fresh || keeps.length === 0) bows.fill(0);
    if (keeps.length === 0) return;
    // the spheres each point may meet: those within reach of the plain line there, with room for the bows
    const near = this.near;
    for (let i = 0; i < count; i++) {
      sample.fromArray(this.plain, i * 3);
      const mine = near[i];
      mine.length = 0;
      for (const keep of keeps) if (Math.hypot(sample.x - keep.x, sample.y - keep.y, sample.z - keep.z) < keep.radius + BOW_REACH) mine.push(keep);
    }
    const index = (i: number) => (this.closed ? ((i % count) + count) % count : THREE.MathUtils.clamp(i, 0, count - 1));
    const before = this.relaxed;
    for (let pass = 0, passes = fresh ? BOW_PASSES : BOW_KEEP_PASSES; pass < passes; pass++) {
      before.set(bows);
      for (let i = 0; i < count; i++) {
        if (this.held[i]) continue;
        const a = index(i - 2) * 3;
        const b = index(i - 1) * 3;
        const c = index(i + 1) * 3;
        const d = index(i + 2) * 3;
        // the bows ease out their bending: a step down the fourth difference
        for (let k = 0; k < 3; k++) bows[i * 3 + k] -= BOW_EASE * (before[a + k] - 4 * before[b + k] + 6 * before[i * 3 + k] - 4 * before[c + k] + before[d + k]);
        if (near[i].length === 0) continue;
        point.fromArray(this.plain, i * 3).add(sample.fromArray(bows, i * 3));
        for (const keep of near[i]) {
          off.set(point.x - keep.x, point.y - keep.y, point.z - keep.z);
          const d = off.length();
          if (d >= keep.radius || d < 1e-6) continue;
          point.set(keep.x, keep.y, keep.z).addScaledVector(off, keep.radius / d);
        }
        point.sub(sample.fromArray(this.plain, i * 3)).toArray(bows, i * 3);
      }
      // a pass that changes nothing is the last one: the next would start from the same bows
      if (bows.every((value, k) => value === before[k])) break;
    }
  }

  /**
   * How far along the line a ship on its way to gate `next` is: the point nearest it on the
   * stretch from the gate before (or the start of an open line) to that gate, but at least
   * `before` (units) short of the gate. Around a closed loop it may run past `length`.
   */
  progress(position: THREE.Vector3, next: number, before: number): number {
    const from = this.gateBefore(next);
    return Math.min(this.closest(position, from, this.gateAfter(next, from)), this.gateAfter(next, from) - before);
  }

  /** Where along the line the gate before gate `next` is (the start of an open line). */
  private gateBefore(next: number): number {
    return next > 0 ? this.gates[next - 1] : this.closed ? this.gates[this.gates.length - 1] : 0;
  }

  /** Where along the line gate `next` is, counted on from `from` (around a closed loop past `length`). */
  private gateAfter(next: number, from: number): number {
    const to = this.gates[next];
    return to <= from ? to + this.length : to;
  }

  /**
   * Where a racer on its way to gate `next`, at `position` and `speed` (units/s), flies for: a
   * point on the line (bowed around rock) a little ahead of it, but not far past the gate; past the gate's plane without
   * having gone through it, a point before the gate far enough to line up for it again: at
   * least RETURN_ROOM turns of its radius at that speed (see turnRadius), so the way back is a
   * wide loop that comes at the gate square, not a circle around it.
   */
  target(position: THREE.Vector3, next: number, speed: number, field: AsteroidField, out: THREE.Vector3): THREE.Vector3 {
    const look = Math.max(LOOK_MIN, speed * LOOK_SECONDS);
    if (this.beyond(position, next)) return this.clear(this.progress(position, next, Math.max(look, turnRadius(speed) * RETURN_ROOM)), field, out);
    const gate = this.gateAfter(next, this.gateBefore(next));
    return this.clear(Math.min(this.progress(position, next, 0) + look, gate + LOOK_PAST), field, out);
  }

  /** Whether `position` lies past the plane of gate `next`, square to the line there. */
  beyond(position: THREE.Vector3, next: number): boolean {
    const s = this.gates[next];
    this.point(s, sample);
    this.point(s + 1, tangent).sub(sample);
    return off.subVectors(position, sample).dot(tangent) > 0;
  }

  /**
   * The distance along the line of its point nearest `position`, looked for on the stretch from
   * `from` to `to` (units along the line; `to` may run past the length of a closed line).
   */
  private closest(position: THREE.Vector3, from: number, to: number): number {
    const steps = Math.max(1, Math.ceil(((to - from) / this.length) * (this.arcs.length - 1)));
    let best = from;
    let distance = Infinity;
    for (let i = 0; i <= steps; i++) {
      const s = from + ((to - from) * i) / steps;
      const d = this.point(s, sample).distanceToSquared(position);
      if (d < distance) {
        distance = d;
        best = s;
      }
    }
    return best;
  }
}
