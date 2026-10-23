import * as THREE from 'three';
import type { Controls } from '../input/input';

/** Acceleration of the main drive at full thrust (units/s²): 127.5 m/s², 13 g. Hard and quick: the speed limit is two seconds away, and so is a stop. */
export const MAIN_THRUST = 2550;
/** Acceleration of the maneuvering thrusters along any axis (units/s²): 40 m/s², about 4 g, so a sidestep left and right throws off an aim. */
export const RCS_THRUST = 800;
/** Tournament rule: no ship flies faster than this (units/s, 250 m/s); the flight computer cuts any push beyond it. */
export const MAX_SPEED = 5000;
/** The overdrive's shove along the nose (units/s, 150 m/s): past the tournament's limit, see Game.overdrive. */
export const OVERDRIVE_PUSH = 3000;
/**
 * Rotation rates the flight computer allows (rad/s) and how fast the thrusters reach them
 * (rad/s²): full rate in an eighth of a second, so the nose snaps where the stick points and
 * stops where the stick stops; a half turn takes about a second.
 */
export const MAX_TURN_RATE = 3;
const MAX_ROLL_RATE = 3.2;
const TURN_ACCELERATION = 24;
/** How fast the visible drive output follows the thrust command (1/s): the flame is there at once and dies a little slower. */
const THROTTLE_RISE = 40;
const THROTTLE_FALL = 12;

const rotation = new THREE.Quaternion();
const axis = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const acceleration = new THREE.Vector3();
const targetRate = new THREE.Vector3();

/**
 * Newtonian flight model. The main drive pushes along the nose, the maneuvering thrusters
 * rotate the ship and push it slightly along every axis. Nothing slows the ship down:
 * to stop, the pilot flips the ship around and burns against the flight direction.
 * The flight computer damps rotation, so the ship stops turning when the stick is released.
 */
export class FlightModel {
  readonly position = new THREE.Vector3();
  readonly orientation = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  /** Rotation rate in ship space (rad/s): x = pitch, y = yaw, z = roll. */
  readonly angularVelocity = new THREE.Vector3();
  /** Thruster translation command in ship space of the last update, for effects. */
  readonly rcs = new THREE.Vector3();
  /** Rotation thrust of the last update in ship space, per axis -1..1 (x = pitch, y = yaw, z = roll), for effects: speeding up a turn and stopping it alike. */
  readonly turnThrust = new THREE.Vector3();
  /** The ship flies at the tournament's speed limit, so the flight computer holds the drive back. */
  limited = false;
  /** Visible main drive output 0..1. */
  throttle = 0;
  /** Health of the main drive and the maneuvering thrusters, 0..1. */
  driveFactor = 1;
  thrusterFactor = 1;

  reset(position: THREE.Vector3, orientation: THREE.Quaternion) {
    this.position.copy(position);
    this.orientation.copy(orientation);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.rcs.set(0, 0, 0);
    this.turnThrust.set(0, 0, 0);
    this.throttle = 0;
    this.driveFactor = this.thrusterFactor = 1;
  }

  /** Acceleration from the own engines in the last update (units/s²), what the pilot feels. */
  properAcceleration = 0;

  /**
   * Advances one step. Disturbances (e.g. venting air) are given in ship space: a push in
   * units/s² and a spin in rad/s² that the flight computer has to fight with the thrusters.
   */
  update(dt: number, controls: Controls, gravity: THREE.Vector3, push?: THREE.Vector3, spin?: THREE.Vector3) {
    const thrusters = this.thrusterFactor;
    targetRate.set(controls.pitch * MAX_TURN_RATE, -controls.yaw * MAX_TURN_RATE, -controls.roll * MAX_ROLL_RATE).multiplyScalar(0.3 + 0.7 * thrusters);
    const maxStep = TURN_ACCELERATION * thrusters * dt;
    for (const k of ['x', 'y', 'z'] as const) {
      const step = THREE.MathUtils.clamp(targetRate[k] - this.angularVelocity[k], -maxStep, maxStep);
      this.angularVelocity[k] += step;
      this.turnThrust[k] = maxStep > 0 ? step / maxStep : 0;
    }
    if (spin) this.angularVelocity.addScaledVector(spin, dt);
    const rate = this.angularVelocity.length();
    if (rate > 1e-6) {
      this.orientation.multiply(rotation.setFromAxisAngle(axis.copy(this.angularVelocity).divideScalar(rate), rate * dt));
      this.orientation.normalize();
    }

    const thrust = THREE.MathUtils.clamp(controls.thrust, 0, 1) * this.driveFactor;
    this.rcs.set(controls.strafeX, controls.strafeY, -controls.strafeZ).clampLength(0, 1);
    acceleration
      .copy(this.rcs).multiplyScalar(RCS_THRUST * thrusters)
      .add(local.set(0, 0, -MAIN_THRUST * thrust));
    // the tournament's speed limit: at MAX_SPEED the flight computer takes out every push that
    // would make the ship faster; turning, braking and sidestepping go on
    let drive = thrust;
    const speed = this.velocity.length();
    if (speed >= MAX_SPEED) {
      const course = this.toLocalDirection(this.velocity, local).divideScalar(speed);
      const faster = acceleration.dot(course);
      if (faster > 0) acceleration.addScaledVector(course, -faster);
      // the drive along the nose dies by the share of it that points along the course
      drive = thrust * (1 - Math.max(0, -course.z));
    }
    this.limited = speed >= MAX_SPEED;
    this.properAcceleration = acceleration.length();
    if (push) acceleration.add(push);
    acceleration.applyQuaternion(this.orientation).add(gravity);
    this.velocity.addScaledVector(acceleration, dt);
    // a step that crosses the limit ends on it, however long the frame was; at or past the
    // limit (after an overdrive) a push across the course turns the flight but never adds speed
    const limit = Math.max(speed, MAX_SPEED);
    if (this.velocity.lengthSq() > limit * limit) this.velocity.setLength(limit);
    this.position.addScaledVector(this.velocity, dt);
    this.throttle += (drive - this.throttle) * (1 - Math.exp(-(drive > this.throttle ? THROTTLE_RISE : THROTTLE_FALL) * dt));
  }

  /** A world direction in ship space (-Z ahead, +X right, +Y up). */
  toLocalDirection(direction: THREE.Vector3, target = new THREE.Vector3()) {
    return target.copy(direction).applyQuaternion(inverse.copy(this.orientation).invert());
  }

  /** A world point in ship space, relative to the ship's center. */
  toLocal(point: THREE.Vector3, target = new THREE.Vector3()) {
    return this.toLocalDirection(target.subVectors(point, this.position), target);
  }

  /** A point in ship space in the world. */
  toWorld(point: THREE.Vector3, target = new THREE.Vector3()) {
    return target.copy(point).applyQuaternion(this.orientation).add(this.position);
  }

  forward(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.orientation);
  }

  up(target = new THREE.Vector3()) {
    return target.set(0, 1, 0).applyQuaternion(this.orientation);
  }

  /** Angle between the nose and a world direction (rad). */
  angleTo(direction: THREE.Vector3) {
    return this.forward(local).angleTo(direction);
  }

  /**
   * Yaw and pitch commands that turn the nose towards a world direction, as the flight
   * computer and the bots use them.
   */
  steer<T extends { yaw: number; pitch: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0 } as T): T {
    this.toLocalDirection(direction, local).normalize();
    // local: -Z is ahead, +X right, +Y up
    let yaw = Math.atan2(local.x, -local.z);
    const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    if (local.z > 0 && Math.abs(local.x) < 1e-3) yaw = Math.PI; // straight behind: pick a side
    target.yaw = THREE.MathUtils.clamp(yaw * gain, -1, 1);
    target.pitch = THREE.MathUtils.clamp(pitch * gain, -1, 1);
    return target;
  }

  /**
   * Commands for a head-over flip towards a world direction: the ship rolls until the
   * direction lies straight above its canopy, then pulls the nose up and over. The last
   * stretch is ordinary steering, where the roll angle would be meaningless. Writes into
   * `target` (yaw, pitch and roll), so the flight computer needs no new object per frame.
   */
  flip<T extends { yaw: number; pitch: number; roll: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0, roll: 0 } as T): T {
    this.toLocalDirection(direction, local).normalize();
    const off = Math.acos(THREE.MathUtils.clamp(-local.z, -1, 1));
    if (off < FLIP_STEER_ANGLE) {
      this.steer(direction, gain, target);
      target.roll = 0;
      return target;
    }
    // a goal behind and below is reached faster by pulling straight up and over than by
    // rolling half around first; the steering at the end takes out what is left
    const behind = Math.PI - off;
    const rollError = local.y < 0 && behind < FLIP_PULL_THROUGH ? 0 : Math.atan2(local.x, local.y);
    const aligned = Math.max(0, 1 - Math.abs(rollError) / FLIP_ROLL_TOLERANCE);
    target.yaw = 0;
    target.pitch = THREE.MathUtils.clamp(off * gain, 0, 1) * aligned;
    target.roll = THREE.MathUtils.clamp(rollError * gain, -1, 1);
    return target;
  }
}

/**
 * Path steering leads the nose at most this far into a turn (rad, 60°), so the way ahead stays
 * in view; the main drive then bends the path with sin 60° of its thrust.
 */
const PATH_LEAD_MAX = Math.PI / 3;
/**
 * How hard path steering bends the path at most (units/s² across it, 150 m/s², about 15 g):
 * the main drive led 60° into the turn plus the thrusters. At the speed limit that is a turn of
 * 415 m radius; the thrusters alone (4 g) would need 1.56 km.
 */
export const PATH_GRIP = MAIN_THRUST * Math.sin(PATH_LEAD_MAX) + RCS_THRUST;
/** How hard path steering bends a ship's path as its drive and thrusters are now (units/s²; see PATH_GRIP). */
export const gripOf = (flight: FlightModel) => MAIN_THRUST * flight.driveFactor * Math.sin(PATH_LEAD_MAX) + RCS_THRUST * flight.thrusterFactor;
/** The tightest turn path steering flies at a speed (units, radius), with a grip (units/s²). */
export const turnRadius = (speed: number, grip = PATH_GRIP) => (speed * speed) / grip;
/** The fastest a ship takes a bend of a radius (units/s), with a grip (units/s²). */
export const cornerSpeed = (radius: number, grip = PATH_GRIP) => Math.sqrt(grip * radius);
/**
 * Path steering takes over from a speed of PATH_ENGAGE (units/s, 20 m/s) with the nose within
 * PATH_ALIGN (rad, about 30°) of the flight, and gives the ship back below PATH_RELEASE (10 m/s)
 * or with the nose more than PATH_LOST (rad, about 115°) off it: slower, or looking elsewhere
 * (after a flip, say), the stick turns the nose.
 */
const PATH_ENGAGE = 400;
const PATH_RELEASE = 200;
const PATH_ALIGN = 0.5;
const PATH_LOST = 2;
/** The course the stick sets runs at most this far ahead of the flight (rad, about 3°), so letting go stops the turn at once. */
const PATH_LAG = 0.05;
/** The thrusters pull the flight onto the course with this gain (1/s), never harder than they push. */
const PATH_GAIN = 3;
/** The nose leads into a turn once the drive's share of it grows to this share of its thrust (0..1), not at once. */
const PATH_LEAD_ONSET = 0.25;
/** From PATH_FREE_FROM to PATH_FREE of the speed limit the drive's push along the path grows free: the limit takes it out. */
const PATH_FREE_FROM = 0.95;
const PATH_FREE = 0.99;
/** Without its push along the path wanted, the drive fires from a nose within PATH_SQUARE_FROM (cosine, about 25°) of where it should point, fully within PATH_SQUARE (about 10°). */
const PATH_SQUARE_FROM = 0.9;
const PATH_SQUARE = 0.985;
/** Steering gain of the nose onto its goal (see FlightModel.steer). */
const PATH_STEER = 2.5;

const path = new THREE.Vector3();
const nose = new THREE.Vector3();
const turn = new THREE.Vector3();
const across = new THREE.Vector3();
const demand = new THREE.Vector3();
const drive = new THREE.Vector3();
const goal = new THREE.Vector3();

/**
 * Path steering, the autopilot's way of flying: the stick sets how fast the path turns, not the
 * nose. The flight computer keeps a course (where the stick says the ship should fly) and bends
 * the flight onto it as hard as drive and thrusters allow: up to 4 g the thrusters alone, the
 * nose on the course; beyond that it leads the nose into the turn (at most PATH_LEAD_MAX) and
 * fires the main drive, so its push across the flight bends the path. The pilot's drive still
 * pushes along the path; at the speed limit the limit takes the drive's push along the path,
 * and below it, without the pilot's drive, the thrusters brake what they can of it. Letting go
 * flies straight on, and the nose settles onto the path. The pilot's own thruster input on an
 * axis goes first and leaves the course where it is: a sidestep, after which the thrusters bring
 * the flight back parallel to the course.
 */
export class PathSteering {
  /** Where the flight should go (unit length). */
  readonly course = new THREE.Vector3(0, 0, -1);
  /** Whether path steering flies the ship (see PATH_ENGAGE); otherwise the stick turns the nose. */
  engaged = false;

  /** Hands the ship back; the next take-over starts from the nose. */
  release() {
    this.engaged = false;
  }

  /**
   * Writes the commands for one step into `out` (from the pilot's `controls`): true while path
   * steering flies, false when the stick turns the nose (too slow, or the nose elsewhere).
   */
  fly(flight: FlightModel, controls: Readonly<Controls>, gravity: THREE.Vector3, dt: number, out: Controls): boolean {
    const speed = flight.velocity.length();
    flight.forward(nose);
    path.copy(flight.velocity).divideScalar(Math.max(speed, 1e-6));
    const off = speed > 0 ? nose.angleTo(path) : Math.PI;
    if (this.engaged ? speed < PATH_RELEASE || off > PATH_LOST : speed < PATH_ENGAGE || off > PATH_ALIGN) {
      this.engaged = false;
      return false;
    }
    if (!this.engaged) {
      // from the nose: the flight comes round to where the ship points, as without path steering
      this.engaged = true;
      this.course.copy(nose);
    }
    const thrust = MAIN_THRUST * flight.driveFactor;
    const thrusters = RCS_THRUST * flight.thrusterFactor;
    const rate = Math.min(MAX_TURN_RATE, gripOf(flight) / speed);
    // the stick turns the course about the ship's up and right axes, as it would turn the nose
    turn.set(controls.pitch * rate, -controls.yaw * rate, 0).applyQuaternion(flight.orientation);
    const before = this.course.angleTo(path);
    this.course.addScaledVector(across.crossVectors(turn, this.course), dt).normalize();
    const limit = Math.max(before, PATH_LAG);
    if (this.course.angleTo(path) > limit) {
      across.copy(this.course).addScaledVector(path, -this.course.dot(path)).normalize();
      this.course.copy(path).multiplyScalar(Math.cos(limit)).addScaledVector(across, Math.sin(limit));
    }
    // what bends the path: the stick's turn, the thrusters pulling the flight onto the course,
    // and against gravity across the flight
    demand.crossVectors(turn, flight.velocity);
    across.copy(this.course).addScaledVector(path, -this.course.dot(path)).multiplyScalar(speed * PATH_GAIN).clampLength(0, thrusters);
    demand.add(across).sub(gravity);
    demand.addScaledVector(path, -demand.dot(path));
    const bend = demand.length();
    // the thrusters bend what they can, the drive the rest. Its nose leads into the turn as
    // little as the bend allows where its push along the path is wanted (the pilot's drive) or
    // free (at the limit, which takes it out), at most PATH_LEAD_MAX; otherwise square to the
    // path, so a turn adds no speed the pilot did not ask for
    const sideways = THREE.MathUtils.clamp(bend - thrusters, 0, thrust);
    const pilot = THREE.MathUtils.clamp(controls.thrust, 0, 1);
    const open = Math.max(pilot, THREE.MathUtils.smoothstep(speed / MAX_SPEED, PATH_FREE_FROM, PATH_FREE));
    goal.copy(this.course);
    drive.set(0, 0, 0);
    if (sideways > 0) {
      const lead = Math.min(THREE.MathUtils.lerp(Math.PI / 2, Math.asin(sideways / thrust), open), THREE.MathUtils.lerp(Math.PI / 2, PATH_LEAD_MAX, open));
      goal.copy(path).multiplyScalar(Math.cos(lead)).addScaledVector(demand, Math.sin(lead) / bend);
      drive.copy(goal).multiplyScalar(Math.min(thrust, sideways / Math.sin(lead)));
      // a slight bend leads the nose only a little: it grows in with the drive's share
      goal.lerp(this.course, 1 - THREE.MathUtils.smoothstep(sideways / thrust, 0, PATH_LEAD_ONSET)).normalize();
    }
    Object.assign(out, controls);
    flight.steer(goal, PATH_STEER, out);
    // the drive fires as far as its push along the nose is wanted, and with the pilot's; where
    // its push along the path is not wanted, only once the nose is nearly square to it
    const square = THREE.MathUtils.lerp(THREE.MathUtils.smoothstep(nose.dot(across.copy(drive).normalize()), PATH_SQUARE_FROM, PATH_SQUARE), 1, open);
    out.thrust = Math.max(pilot, thrust > 0 ? THREE.MathUtils.clamp(drive.dot(nose) / thrust, 0, 1) * square : 0);
    // the thrusters: what the drive leaves of the bend, and what they can of its push along the
    // path where that is not wanted
    drive.copy(nose).multiplyScalar(out.thrust * thrust);
    const push = drive.dot(path);
    demand.sub(drive).addScaledVector(path, push * open);
    flight.toLocalDirection(demand, across).divideScalar(Math.max(thrusters, 1e-6));
    if (!controls.strafeX) out.strafeX = THREE.MathUtils.clamp(across.x, -1, 1);
    if (!controls.strafeY) out.strafeY = THREE.MathUtils.clamp(across.y, -1, 1);
    if (!controls.strafeZ) out.strafeZ = THREE.MathUtils.clamp(-across.z, -1, 1);
    return true;
  }
}

/** Below this angle between nose and goal (rad) the flip ends in ordinary steering. */
const FLIP_STEER_ANGLE = 0.35;
/** The nose only pulls up once the roll is this close to the goal (rad). */
const FLIP_ROLL_TOLERANCE = 0.6;
/** A goal below and within this angle of straight behind (rad, 70°) is reached by pulling up without rolling. */
const FLIP_PULL_THROUGH = 1.2;
