import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { turnRadius } from '../ship/flight';

/** Samples of the line between two gates, for its length and for finding the point nearest a ship. */
const SAMPLES = 48;
/** An open line (the flight school's rings) runs on this far beyond its last gate (units, 300 m). */
const RUN_OUT = 6000;
/** The line keeps this far from the farthest reach of a rock (units, 100 m: six ship radii, room for a Host's hand), and from a massive body. */
const CLEARANCE = 2000;
/** Within this distance along the line of a gate (units, 80 m, two thirds of a gate's 120 m radius) the line bows less, and through the gate not at all. */
const GATE_FADE = 1600;
/** The swerves around rock bend no tighter than this (units, 400 m: a ship at 245 m/s takes it, see cornerSpeed), and fade out over SWERVE_FADE (units, 300 m) towards a gate. */
const BOW_RADIUS = 8000;
const SWERVE_FADE = 6000;
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

/**
 * Passes of bowing around one rock after another (see clear): BOW_PASSES_FREE always, up to
 * BOW_PASSES while the point is still within a rock's reach. Every pass moves a point only as
 * far as the rocks around it ask, so neighbouring points move alike and the line stays smooth.
 */
const BOW_PASSES_FREE = 3;
const BOW_PASSES = 8;
/** How far inside a rock's circle a point bowed onto it may lie and still count as clear (units, 1 cm): it lies on the circle only to rounding. */
const ROUNDING = 0.2;

const sample = new THREE.Vector3();
const plain = new THREE.Vector3();
const shift = new THREE.Vector3();
const aside = new THREE.Vector3();

/**
 * Adds to `shift` how far the plain line at `plain` (running along `tangent`) swerves aside for
 * a body at `center` whose reach plus clearance is `reach`: as deep as the line comes inside
 * that reach where it passes closest, fading out along the line as a cosine bump wide enough
 * that it bends no tighter than BOW_RADIUS (nor than the reach's own circle) and keeps outside
 * the circle all along.
 */
function swerve(center: THREE.Vector3, reach: number) {
  aside.subVectors(plain, center);
  const along = aside.dot(tangent);
  aside.addScaledVector(tangent, -along);
  const depth = reach - aside.length();
  if (depth <= 0) return;
  const width = Math.PI * Math.sqrt((depth * Math.max(reach, BOW_RADIUS)) / 2);
  if (Math.abs(along) >= width) return;
  // straight through the center: aside upwards (or sideways, for a line that runs up or down)
  if (aside.lengthSq() < 1) aside.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
  if (aside.lengthSq() < 1e-6) aside.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
  shift.addScaledVector(aside.normalize(), (depth * (1 + Math.cos((Math.PI * along) / width))) / 2);
}

/** Whether a point lies outside every rock's reach plus CLEARANCE. */
function clearOf(field: AsteroidField, point: THREE.Vector3): boolean {
  for (const rock of field.asteroids.values()) if (rock.object.position.distanceTo(point) < rock.radius + CLEARANCE - ROUNDING) return false;
  return true;
}
const tangent = new THREE.Vector3();
const off = new THREE.Vector3();
const chord = new THREE.Vector3();

/** The radius of the circle through three points (units): how tight a line through them bends there; Infinity on a straight. */
export function bendRadius(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const twiceArea = off.subVectors(b, a).cross(chord.subVectors(c, a)).length();
  return twiceArea < 1e-6 ? Infinity : (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (2 * twiceArea);
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

  /** An open line runs `runOut` (units) beyond its last gate: on through a ring, or not at all for a place to stop at. */
  constructor(
    gates: readonly THREE.Vector3[],
    readonly closed: boolean,
    lead?: THREE.Vector3,
    runOut = RUN_OUT,
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
    for (let i = 0; i < gates.length; i++) this.gates.push(this.arcs[(i + offset) * SAMPLES]);
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
   * The point at distance `s`, bowed out around the rock of `field` as it lies now. A rock (or a
   * massive body) whose farthest reach plus CLEARANCE comes closer to the line swerves it aside
   * square to the line, in a wide, gentle bump (see swerve) that bends no tighter than BOW_RADIUS,
   * so a Host can follow it at the speed it invites. What the swerves still leave within a rock's
   * reach (rocks close together, a swerve faded out near a gate) moves out onto a circle around
   * it. Square to the line, every point of a stretch moves out to the same side.
   */
  clear(s: number, field: AsteroidField, out: THREE.Vector3): THREE.Vector3 {
    // around a closed loop, `s` may run past its length (the next lap)
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    this.point(s, out);
    this.point(s + 1, tangent).sub(out).normalize();
    plain.copy(out);
    let gap = Infinity;
    for (const gate of this.gates) {
      const d = Math.abs(s - gate);
      gap = Math.min(gap, d, this.closed ? this.length - d : Infinity);
    }
    shift.set(0, 0, 0);
    for (const rock of field.asteroids.values()) swerve(rock.object.position, rock.radius + CLEARANCE);
    if (field.well) swerve(field.well.position, field.well.radius + CLEARANCE * 2);
    out.addScaledVector(shift, THREE.MathUtils.smoothstep(gap, 0, SWERVE_FADE));
    // around one rock may lead into the next: pass after pass, as long as a point is still
    // within some rock's reach (a few passes, more between rocks that lie close together)
    for (let pass = 0; pass < BOW_PASSES; pass++) {
      for (const rock of field.asteroids.values()) this.bow(out, rock.object.position, rock.radius + CLEARANCE);
      if (pass >= BOW_PASSES_FREE - 1 && clearOf(field, out)) break;
    }
    if (field.well) this.bow(out, field.well.position, field.well.radius + CLEARANCE * 2);
    // through a gate the line runs through its center, whatever lies beside it: the bow fades out towards it
    return out.lerp(plain, 1 - THREE.MathUtils.smoothstep(gap, 0, GATE_FADE));
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

  /** Moves `point` (on the line, running along `tangent`) out sideways to `reach` from `center`, when it lies closer. */
  private bow(point: THREE.Vector3, center: THREE.Vector3, reach: number) {
    off.subVectors(point, center);
    if (off.lengthSq() >= reach * reach) return;
    const along = off.dot(tangent);
    off.addScaledVector(tangent, -along);
    // straight through the center: out upwards (or sideways, for a line that runs up or down)
    if (off.lengthSq() < 1) off.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
    if (off.lengthSq() < 1e-6) off.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
    point.copy(center).addScaledVector(tangent, along).addScaledVector(off.normalize(), Math.sqrt(reach * reach - along * along));
  }
}
