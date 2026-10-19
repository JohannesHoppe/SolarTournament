import * as THREE from 'three';
import type { Controls } from '../input/input';

/** Acceleration of the main drive at full thrust (units/s²): 70 m/s², about 7 g. */
export const MAIN_THRUST = 1400;
/** Acceleration of the maneuvering thrusters along any axis (units/s²): 10 m/s², about 1 g. */
export const RCS_THRUST = 200;
/** Rotation rates the flight computer allows (rad/s) and how fast the thrusters reach them (rad/s²). */
const MAX_TURN_RATE = 1.6;
const MAX_ROLL_RATE = 1.8;
const TURN_ACCELERATION = 6;
/** How fast the visible drive output follows the thrust command (1/s). */
const THROTTLE_RESPONSE = 8;

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
      this.angularVelocity[k] += THREE.MathUtils.clamp(targetRate[k] - this.angularVelocity[k], -maxStep, maxStep);
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
    this.properAcceleration = acceleration.length();
    if (push) acceleration.add(push);
    acceleration.applyQuaternion(this.orientation).add(gravity);
    this.velocity.addScaledVector(acceleration, dt);
    this.position.addScaledVector(this.velocity, dt);
    this.throttle += (thrust - this.throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt));
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
  steer(direction: THREE.Vector3, gain = 2.5): { yaw: number; pitch: number } {
    inverse.copy(this.orientation).invert();
    local.copy(direction).normalize().applyQuaternion(inverse);
    // local: -Z is ahead, +X right, +Y up
    let yaw = Math.atan2(local.x, -local.z);
    const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    if (local.z > 0 && Math.abs(local.x) < 1e-3) yaw = Math.PI; // straight behind: pick a side
    return { yaw: THREE.MathUtils.clamp(yaw * gain, -1, 1), pitch: THREE.MathUtils.clamp(pitch * gain, -1, 1) };
  }

  /**
   * Commands for a head-over flip towards a world direction: the ship rolls until the
   * direction lies straight above its canopy, then pulls the nose up and over. The last
   * stretch is ordinary steering, where the roll angle would be meaningless.
   */
  flip(direction: THREE.Vector3, gain = 2.5): { yaw: number; pitch: number; roll: number } {
    inverse.copy(this.orientation).invert();
    local.copy(direction).normalize().applyQuaternion(inverse);
    const off = Math.acos(THREE.MathUtils.clamp(-local.z, -1, 1));
    if (off < FLIP_STEER_ANGLE) return { ...this.steer(direction, gain), roll: 0 };
    // a goal behind and below is reached faster by pulling straight up and over than by
    // rolling half around first; the steering at the end takes out what is left
    const behind = Math.PI - off;
    const rollError = local.y < 0 && behind < FLIP_PULL_THROUGH ? 0 : Math.atan2(local.x, local.y);
    const aligned = Math.max(0, 1 - Math.abs(rollError) / FLIP_ROLL_TOLERANCE);
    return {
      yaw: 0,
      pitch: THREE.MathUtils.clamp(off * gain, 0, 1) * aligned,
      roll: THREE.MathUtils.clamp(rollError * gain, -1, 1),
    };
  }
}

/** Below this angle between nose and goal (rad) the flip ends in ordinary steering. */
const FLIP_STEER_ANGLE = 0.35;
/** The nose only pulls up once the roll is this close to the goal (rad). */
const FLIP_ROLL_TOLERANCE = 0.6;
/** A goal below and within this angle of straight behind (rad, 70°) is reached by pulling up without rolling. */
const FLIP_PULL_THROUGH = 1.2;
