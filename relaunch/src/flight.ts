import * as THREE from 'three';
import type { Controls } from './input';

/** Turn rate for yaw and pitch in rad/s. */
const TURN_RATE = 1.25;
const CRUISE_SPEED = 2000;
const BOOST_SPEED = 3600;
const BRAKE_SPEED = 500;
/** How fast the speed follows the throttle (1/s). */
const THROTTLE_RESPONSE = 2.5;
/** Visual bank and pitch tilt of the model while steering (rad). */
const MAX_BANK = 0.55;
const MAX_TILT = 0.2;
const TILT_RESPONSE = 5;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();

/**
 * Arcade flight model: the ship always flies along its nose. Steering rotates the
 * movement orientation around the ship's local axes; the model additionally banks and
 * tilts into the turn and settles back to level when the stick is released.
 */
export class FlightModel {
  readonly position = new THREE.Vector3();
  /** Orientation that defines the flight direction. */
  readonly orientation = new THREE.Quaternion();
  /** Orientation of the model including bank and tilt. */
  readonly visualOrientation = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  speed = CRUISE_SPEED;
  /** 0 = brake, 0.5 = cruise, 1 = full boost; drives the engine effects. */
  throttle = 0.5;

  private bank = 0;
  private tilt = 0;

  static readonly maxSpeed = BOOST_SPEED;

  reset(position: THREE.Vector3, orientation: THREE.Quaternion) {
    this.position.copy(position);
    this.orientation.copy(orientation);
    this.visualOrientation.copy(orientation);
    this.speed = CRUISE_SPEED;
    this.throttle = 0.5;
    this.bank = this.tilt = 0;
    this.velocity.set(0, 0, 0);
  }

  update(dt: number, controls: Controls) {
    this.orientation.multiply(turn.setFromAxisAngle(AXIS_Y, -controls.yaw * TURN_RATE * dt));
    this.orientation.multiply(turn.setFromAxisAngle(AXIS_X, controls.pitch * TURN_RATE * dt));
    this.orientation.normalize();

    const targetSpeed = controls.brake ? BRAKE_SPEED : controls.boost ? BOOST_SPEED : CRUISE_SPEED;
    const throttleBlend = 1 - Math.exp(-THROTTLE_RESPONSE * dt);
    this.speed += (targetSpeed - this.speed) * throttleBlend;
    this.throttle = this.speed <= CRUISE_SPEED
      ? 0.5 * (this.speed - BRAKE_SPEED) / (CRUISE_SPEED - BRAKE_SPEED)
      : 0.5 + 0.5 * (this.speed - CRUISE_SPEED) / (BOOST_SPEED - CRUISE_SPEED);

    this.velocity.copy(this.forward()).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    const tiltBlend = 1 - Math.exp(-TILT_RESPONSE * dt);
    this.bank += (-controls.yaw * MAX_BANK - this.bank) * tiltBlend;
    this.tilt += (controls.pitch * MAX_TILT - this.tilt) * tiltBlend;
    this.visualOrientation
      .copy(this.orientation)
      .multiply(turn.setFromAxisAngle(AXIS_Z, this.bank))
      .multiply(turn.setFromAxisAngle(AXIS_X, this.tilt));
  }

  /** Turns the flight direction towards a point, used to keep ships inside the arena. */
  steerTowards(target: THREE.Vector3, amount: number) {
    const desired = new THREE.Matrix4().lookAt(this.position, target, this.up());
    const goal = new THREE.Quaternion().setFromRotationMatrix(desired);
    this.orientation.slerp(goal, amount);
  }

  forward(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.orientation);
  }

  up(target = new THREE.Vector3()) {
    return target.set(0, 1, 0).applyQuaternion(this.orientation);
  }
}
