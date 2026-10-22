import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';

/** Samples of the line between two gates, for its length and for finding the point nearest a ship. */
const SAMPLES = 48;
/** An open line (the flight school's rings) runs on this far beyond its last gate (units, 300 m). */
const RUN_OUT = 6000;
/** The line keeps this far from the farthest reach of a rock (units, 60 m: three and a half ship radii), and from a massive body. */
const CLEARANCE = 1200;
/** Within this distance along the line of a gate (units, 80 m: a gate's radius) the line bows less, and through the gate not at all. */
const GATE_FADE = 1600;
/** A racer looks this far ahead along the line for where to fly (seconds of its flight), at least LOOK_MIN (units, 100 m). */
const LOOK_SECONDS = 0.8;
const LOOK_MIN = 2000;

/** Passes of bowing around one rock after another (see clear). */
const BOW_PASSES = 3;

const sample = new THREE.Vector3();
const plain = new THREE.Vector3();
const cluster = new THREE.Sphere();
const tangent = new THREE.Vector3();
const off = new THREE.Vector3();

/**
 * The ideal line of a course: a smooth curve (centripetal Catmull-Rom) through the center of
 * every gate, where its coil fires, in the order they are flown; closed for a race's loop, open
 * for the flight school's rings, from a lead-in point before the first. Positions on it are
 * given by their distance along it (units), so the racing line's dots sit on it at fixed
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
   * The point at distance `s`, bowed out around the rock of `field` as it lies now: a point
   * within CLEARANCE of a rock's farthest reach (however it turns, the tip of a long rock sweeps
   * around it) or of a massive body moves out sideways, square to the line, onto a circle around
   * it. Square to the line, every point of a stretch moves out to the same side, so the line
   * bows around the rock in one smooth arc.
   */
  clear(s: number, field: AsteroidField, out: THREE.Vector3): THREE.Vector3 {
    // around a closed loop, `s` may run past its length (the next lap)
    if (this.closed) s = ((s % this.length) + this.length) % this.length;
    this.point(s, out);
    this.point(s + 1, tangent).sub(out).normalize();
    plain.copy(out);
    // around one rock may lead into the next: a few passes, and where the gap between rocks is
    // too narrow, around all of them at once
    for (let pass = 0; pass < BOW_PASSES; pass++) {
      for (const rock of field.asteroids.values()) this.bow(out, rock.object.position, rock.radius + CLEARANCE);
    }
    let inside = null;
    for (const rock of field.asteroids.values()) {
      if (rock.object.position.distanceTo(out) >= rock.radius + CLEARANCE) continue;
      inside = rock;
      break;
    }
    if (inside) {
      cluster.center.copy(inside.object.position);
      cluster.radius = inside.radius + CLEARANCE;
      for (let grown = true, round = 0; grown && round < BOW_PASSES * 2; round++) {
        grown = false;
        for (const rock of field.asteroids.values()) {
          const reach = rock.radius + CLEARANCE;
          const apart = rock.object.position.distanceTo(cluster.center);
          if (apart >= cluster.radius + reach || apart + reach <= cluster.radius) continue;
          // the smallest sphere around both
          const radius = (apart + cluster.radius + reach) / 2;
          cluster.center.lerp(rock.object.position, (radius - cluster.radius) / apart);
          cluster.radius = radius;
          grown = true;
        }
      }
      this.bow(out.copy(plain), cluster.center, cluster.radius);
    }
    if (field.well) this.bow(out, field.well.position, field.well.radius + CLEARANCE * 2);
    // through a gate the line runs through its center, whatever lies beside it: the bow fades out towards it
    let gap = Infinity;
    for (const gate of this.gates) {
      const d = Math.abs(s - gate);
      gap = Math.min(gap, d, this.closed ? this.length - d : Infinity);
    }
    return out.lerp(plain, 1 - THREE.MathUtils.smoothstep(gap, 0, GATE_FADE));
  }

  /**
   * How far along the line a ship on its way to gate `next` is: the point nearest it on the
   * stretch from the gate before (or the start of an open line) to that gate, but at least
   * `before` (units) short of the gate. Around a closed loop it may run past `length`.
   */
  progress(position: THREE.Vector3, next: number, before: number): number {
    const from = next > 0 ? this.gates[next - 1] : this.closed ? this.gates[this.gates.length - 1] : 0;
    let to = this.gates[next];
    if (to <= from) to += this.length;
    return Math.min(this.closest(position, from, to), to - before);
  }

  /**
   * Where a racer on its way to gate `next`, at `position` and `speed` (units/s), flies for: a
   * point on the line (bowed around rock) a little ahead of it; past the gate's plane without
   * having gone through it, a point that far before the gate, to come at it again.
   */
  target(position: THREE.Vector3, next: number, speed: number, field: AsteroidField, out: THREE.Vector3): THREE.Vector3 {
    const look = Math.max(LOOK_MIN, speed * LOOK_SECONDS);
    if (this.beyond(position, next)) return this.clear(this.progress(position, next, look), field, out);
    return this.clear(this.progress(position, next, 0) + look, field, out);
  }

  /** Whether `position` lies past the plane of gate `next`, square to the line there. */
  private beyond(position: THREE.Vector3, next: number): boolean {
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
