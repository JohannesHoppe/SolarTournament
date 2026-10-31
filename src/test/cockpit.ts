import * as THREE from 'three';
import { IDLE, pointerAxis, type Controls } from '../input/input';
import { flyByNose, FlightModel, MAX_TURN_RATE } from '../ship/flight';
import { assistAim, Brake } from '../ship/computer';
import type { Recording } from '../recorder';
import type { RacingLine } from '../game/racingline';

/** The simulation steps at 60 frames a second. */
export const STEP = 1 / 60;

/** Where the ship was at a moment: its flight (unit), nose and speed (units/s). */
export interface Sample {
  t: number;
  path: THREE.Vector3;
  nose: THREE.Vector3;
  speed: number;
  /** The Host's turn input of the step (0 when centered). */
  input: number;
}

/**
 * The own ship as the game flies it, without the game: the flight model, and the autopilot (or,
 * in free drift, the Host's controls straight to the ship; the brake while it is held), as
 * Game.flightComputer does. No gravity unless a test sets it.
 */
export class Cockpit {
  readonly flight = new FlightModel();
  readonly brake = new Brake();
  readonly out: Controls = { ...IDLE };
  readonly gravity = new THREE.Vector3();
  readonly samples: Sample[] = [];
  autopilot = true;
  t = 0;

  /** At the origin, the nose ahead (-Z), flying at `speed` (units/s) along `heading` (ahead by default). */
  constructor(speed = 0, heading = new THREE.Vector3(0, 0, -1)) {
    this.flight.reset(new THREE.Vector3(), new THREE.Quaternion());
    this.flight.velocity.copy(heading).normalize().multiplyScalar(speed);
  }

  /** One step with the Host's controls, the brake held or not. */
  step(controls: Readonly<Controls>, dt = STEP, braking = false) {
    if (braking) this.brake.fly(this.flight, controls, this.flight.driveFactor, this.out);
    else {
      this.brake.release();
      if (this.autopilot) flyByNose(this.flight, controls, this.gravity, this.out);
      else Object.assign(this.out, controls);
    }
    this.flight.update(dt, this.out, this.gravity);
    this.t += dt;
    const speed = this.flight.velocity.length();
    this.samples.push({
      t: this.t,
      path: this.flight.velocity.clone().divideScalar(Math.max(speed, 1e-6)),
      nose: this.flight.forward(),
      speed,
      input: Math.hypot(controls.yaw, controls.pitch),
    });
  }

  /** Flies `seconds` with the controls a function gives each step. */
  fly(seconds: number, input: (cockpit: Cockpit) => Partial<Controls> = () => ({})) {
    const end = this.t + seconds - STEP / 2;
    while (this.t < end) this.step({ ...IDLE, ...input(this) });
  }
}

/** Yaw and pitch of a world direction off the nose (rad; right and up positive), as the crosshair shows it: the chase camera looks along the nose. */
function bearing(cockpit: Cockpit, direction: THREE.Vector3, target = { yaw: 0, pitch: 0 }) {
  const local = cockpit.flight.toLocalDirection(direction, scratch).normalize();
  target.yaw = Math.atan2(local.x, -local.z);
  target.pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
  return target;
}
const scratch = new THREE.Vector3();
/** The hand lets go within FINE (rad, about 1°) of its goal, and short of that pushes at least NUDGE (full deflections), just past the dead zone. */
const FINE = 0.017;
const NUDGE = 0.1;
/** The eye leads with how fast the gap changes, LEAD seconds ahead, read over DRIFT_SMOOTH seconds. */
const LEAD = 0.3;
const DRIFT_SMOOTH = 0.1;
/** The hand's spring is integrated in steps no longer than this (s). */
const SPRING_STEP = 1 / 240;
const want = { yaw: 0, pitch: 0 };

/**
 * A Host's hand on the mouse: it sees how far off the crosshair (the nose) its goal is, and moves
 * the pointer to turn the nose onto it, as a person does. It reacts a moment late (`reaction`,
 * s), moves the pointer in eased strokes (a critically damped spring of `stroke` seconds), pushes
 * harder the farther off the goal is, and has learned how fast the nose answers: it closes the
 * gap at about `gain` per second (as much deflection as turns the nose that fast), and so
 * overshoots a little and corrects back. Its pointer offset becomes turn input through the game's
 * own dead zone (see pointerAxis).
 */
export class Hand {
  readonly pointer = { x: 0, y: 0 };
  private readonly speed = { x: 0, y: 0 };
  private readonly seen: { yaw: number; pitch: number }[] = [];
  /** The gap as last seen, and how fast it changes as the eye reads it (rad/s, smoothed). */
  private readonly last = { x: 0, y: 0 };
  private readonly drift = { x: 0, y: 0 };

  constructor(
    private readonly gain = 2,
    private readonly reaction = 0.2,
    private readonly stroke = 0.15,
    private readonly step = STEP,
  ) {}

  /** One step of the hand towards `goal` (a world direction): the controls it gives. */
  steer(cockpit: Cockpit, goal: THREE.Vector3): Partial<Controls> {
    bearing(cockpit, goal, want);
    return this.move(want.yaw, want.pitch, MAX_TURN_RATE * (0.3 + 0.7 * cockpit.flight.thrusterFactor));
  }

  /**
   * One step of the hand, seeing the goal `yaw` and `pitch` (rad) off the crosshair, the nose
   * turning at `rate` (rad/s) for full deflection: the controls it gives.
   */
  move(yaw: number, pitch: number, rate: number): Partial<Controls> {
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.seen.push({ yaw, pitch });
    const late = this.seen.length > Math.round(this.reaction / this.step) ? this.seen.shift()! : { yaw: 0, pitch: 0 };
    const omega = 4.7 / this.stroke;
    for (const [axis, seen] of [
      ['x', late.yaw],
      ['y', late.pitch],
    ] as const) {
      // the eye sees how fast the gap closes or opens too, and leads with it
      const drift = (seen - this.last[axis]) / this.step;
      this.last[axis] = seen;
      this.drift[axis] += (drift - this.drift[axis]) * Math.min(1, this.step / DRIFT_SMOOTH);
      const error = seen + this.drift[axis] * LEAD;
      // a hand pushes past the dead zone for anything it still sees off, and lets go within a degree
      const aim = Math.abs(error) < FINE ? 0 : Math.sign(error) * Math.min(1.4, NUDGE + (Math.abs(error) * this.gain) / rate);
      // the spring in short steps, so a slow frame rate does not make it ring
      const steps = Math.ceil(this.step / SPRING_STEP);
      for (let i = 0; i < steps; i++) {
        this.speed[axis] += (omega * omega * (aim - this.pointer[axis]) - 2 * omega * this.speed[axis]) * (this.step / steps);
        this.pointer[axis] += this.speed[axis] * (this.step / steps);
      }
    }
    return { yaw: pointerAxis(this.pointer.x), pitch: pointerAxis(this.pointer.y) };
  }
}

/** How a hand flew a line: how close it came to each of its points (units), and the seconds it took. */
export interface LineFlight {
  closest: number[];
  seconds: number;
}

/**
 * A Host's hand flies a racing line through `points` (empty space, no rocks), as a Host follows
 * the ribbon on screen: it turns the nose at the line a little ahead of the ship (0.8 s of
 * flight, at least 100 m), with the drive held or not, until it is past the last point (its
 * plane square to the way from the point before) or `limit` seconds are up.
 */
export function flyLine(cockpit: Cockpit, line: RacingLine, points: readonly THREE.Vector3[], thrust: number, limit: number): LineFlight {
  const hand = new Hand();
  const ahead = new THREE.Vector3();
  const closest = points.map(() => Infinity);
  const start = cockpit.t;
  let along = 0;
  const last = points[points.length - 1];
  const way = last.clone().sub(points[points.length - 2] ?? new THREE.Vector3());
  while (cockpit.t - start < limit && ahead.subVectors(cockpit.flight.position, last).dot(way) < 0) {
    // where the ship is along the line: the nearest point a little around the last
    const position = cockpit.flight.position;
    let best = Infinity;
    for (let s = Math.max(0, along - 2000); s <= Math.min(line.length, along + 4000); s += 50) {
      const d = line.point(s, ahead).distanceToSquared(position);
      if (d < best) {
        best = d;
        along = s;
      }
    }
    line.point(along + Math.max(2000, cockpit.flight.velocity.length() * 0.8), ahead).sub(position).normalize();
    cockpit.step({ ...IDLE, ...hand.steer(cockpit, ahead), thrust });
    points.forEach((point, i) => (closest[i] = Math.min(closest[i], point.distanceTo(cockpit.flight.position))));
  }
  return { closest, seconds: cockpit.t - start };
}

/** How the flight came onto a direction: when it stayed within `tolerance` for good, and how far it swung past. */
export interface Convergence {
  /** Seconds from `from` until the flight stays within the tolerance of the direction, Infinity if never. */
  seconds: number;
  /** The farthest the flight swung past the direction (rad), against the side it came from. */
  overshoot: number;
  /** The nose's angle off the direction at the end (rad). */
  noseOff: number;
}

/** How the flight (or the nose) of `samples` (from time `from` on) came onto `direction`. */
export function convergence(samples: readonly Sample[], direction: THREE.Vector3, from = 0, tolerance = 0.035, of: 'path' | 'nose' = 'path'): Convergence {
  const after = samples.filter((s) => s.t >= from);
  let settled = Infinity;
  for (let i = after.length - 1; i >= 0; i--) {
    if (after[i][of].angleTo(direction) > tolerance) break;
    settled = after[i].t - from;
  }
  // the side it came from: where the flight was when it got within 30° of the direction
  const approach = after.find((s) => s[of].angleTo(direction) < 0.5);
  let overshoot = 0;
  if (approach) {
    const side = approach[of].clone().addScaledVector(direction, -approach[of].dot(direction));
    if (side.lengthSq() > 1e-10) {
      side.normalize();
      for (const s of after) if (s.t >= approach.t) overshoot = Math.max(overshoot, -s[of].dot(side));
    }
  }
  return { seconds: settled, overshoot: Math.asin(Math.min(1, overshoot)), noseOff: after.at(-1)!.nose.angleTo(direction) };
}

/** The slip of a sample: the angle between the flight and the nose (rad). */
export const slip = (sample: Sample) => sample.path.angleTo(sample.nose);

/** A replayed flight: what the autopilot did with the recorded input, and how far that is from what was recorded. */
export interface Replay {
  cockpit: Cockpit;
  /** Steps the autopilot flew. */
  flown: number;
  /** The largest distance (units) and velocity difference (units/s) between replay and recording after an autopilot step. */
  position: number;
  velocity: number;
}

/**
 * Replays a recording (see recorder.ts) through the flight model and the autopilot: every step
 * the autopilot flew is flown again from the recorded input; a step flown otherwise (free drift,
 * brake, flip, a swing) takes the recorded state as it was. The roll comes from the recording's
 * commands (the game adds it to the autopilot's), the aim assist is flown again toward the ship it
 * pulled onto.
 */
export function replay(recording: Recording): Replay {
  const cockpit = new Cockpit();
  const flight = cockpit.flight;
  let flown = 0;
  let position = 0;
  let velocity = 0;
  const frames = recording.frames;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (i > 0) {
      const last = frames[i - 1];
      if (last.mode === 'autopilot') {
        position = Math.max(position, flight.position.distanceTo(scratch.fromArray(frame.position)));
        velocity = Math.max(velocity, flight.velocity.distanceTo(scratch.fromArray(frame.velocity)));
      }
    }
    if (frame.mode !== 'autopilot' || frames[i - 1]?.mode !== 'autopilot') {
      flight.position.fromArray(frame.position);
      flight.velocity.fromArray(frame.velocity);
      flight.orientation.fromArray(frame.orientation);
    }
    flight.driveFactor = frame.drive;
    flight.thrusterFactor = frame.thrusters;
    cockpit.gravity.fromArray(frame.gravity);
    if (frame.mode !== 'autopilot') continue;
    flyByNose(flight, frame.controls, cockpit.gravity, cockpit.out);
    cockpit.out.roll = frame.out.roll;
    if (frame.aim) assistAim(flight, scratch.fromArray(frame.aim), cockpit.out);
    flight.update(frame.dt, cockpit.out, cockpit.gravity);
    flown++;
  }
  return { cockpit, flown, position, velocity };
}
