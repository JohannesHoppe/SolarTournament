import * as THREE from 'three';
import type { Controls } from '../input/input';

/** Acceleration of the main drive at full thrust (units/s²): 180 m/s², about 18 g. Brutal, so a burn is felt and the top speed is reached in under three seconds. */
export const MAIN_THRUST = 3600;
/** Acceleration of the maneuvering thrusters along any axis (units/s²): 40 m/s², about 4 g, so a sidestep left and right throws off an aim. */
export const RCS_THRUST = 800;
/** Tournament rule: no ship flies faster than this (units/s, 500 m/s); the flight computer cuts any push beyond it. */
export const MAX_SPEED = 10000;
/**
 * Rotation rates the flight computer allows (rad/s) and how fast the thrusters reach them
 * (rad/s²): full rate in a sixth of a second, so the nose stops where the stick stops.
 */
const MAX_TURN_RATE = 2.2;
const MAX_ROLL_RATE = 2.4;
const TURN_ACCELERATION = 14;
/** How fast the visible drive output follows the thrust command (1/s). */
const THROTTLE_RESPONSE = 12;

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
      inverse.copy(this.orientation).invert();
      const course = local.copy(this.velocity).divideScalar(speed).applyQuaternion(inverse);
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
    // a step that crosses the limit ends on it, however long the frame was
    if (speed < MAX_SPEED && this.velocity.lengthSq() > MAX_SPEED * MAX_SPEED) this.velocity.setLength(MAX_SPEED);
    this.position.addScaledVector(this.velocity, dt);
    this.throttle += (drive - this.throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt));
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
    inverse.copy(this.orientation).invert();
    local.copy(direction).normalize().applyQuaternion(inverse);
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
    inverse.copy(this.orientation).invert();
    local.copy(direction).normalize().applyQuaternion(inverse);
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

/** Below this angle between nose and goal (rad) the flip ends in ordinary steering. */
const FLIP_STEER_ANGLE = 0.35;
/** The nose only pulls up once the roll is this close to the goal (rad). */
const FLIP_ROLL_TOLERANCE = 0.6;
/** A goal below and within this angle of straight behind (rad, 70°) is reached by pulling up without rolling. */
const FLIP_PULL_THROUGH = 1.2;
