import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { aero, cornerSpeed, FlightModel, flyByNose, gripAt, INDUCED, LIFT, LIFT_MOST, liftAt, MAIN_THRUST, MAX_SPEED, turnRadius } from './flight';
import { IDLE } from '../input/input';
import { asin, atan2, cos, sin } from '../detmath';
import { density } from '../world/air';

/** A degree (rad). */
const DEGREE = Math.PI / 180;
/** 1 g in units/s². */
const G = 196.2;
/** A frame (s). */
const DT = 1 / 120;

/** A ship flying at `speed` along -Z with its nose `slip` right of its flight, in air of `airDensity`. */
function flying(speed: number, slip: number, airDensity: number): FlightModel {
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(), new THREE.Quaternion());
  flight.velocity.set(sin(slip), 0, -cos(slip)).multiplyScalar(speed);
  flight.airDensity = airDensity;
  return flight;
}

const push = new THREE.Vector3();
/** The lift across the flight and the drag against it (units/s²) of a ship flying as `flying` sets it up. */
function liftOf(speed: number, slip: number, airDensity: number) {
  const flight = flying(speed, slip, airDensity);
  aero(flight, push);
  const path = flight.velocity.clone().normalize();
  const drag = -push.dot(path);
  return { lift: push.clone().addScaledVector(path, drag).length(), drag, towardsNose: push.dot(flight.forward()) > 0 };
}

describe('lift in air: fins and hull push the flight round towards the nose', () => {
  it('gives at most 15 g at the density under the deck at the speed limit, by the density and the speed squared', () => {
    expect(liftAt(1, MAX_SPEED) / G).toBeCloseTo(15, 5);
    expect(liftOf(MAX_SPEED, 30 * DEGREE, 1).lift).toBeCloseTo(LIFT, 3);
    expect(liftOf(MAX_SPEED, 30 * DEGREE, 1.2).lift).toBeCloseTo(1.2 * LIFT, 3);
    expect(liftOf(MAX_SPEED / 2, 30 * DEGREE, 1).lift).toBeCloseTo(LIFT / 4, 3);
    expect(liftOf(MAX_SPEED, 30 * DEGREE, 1).towardsNose).toBe(true);
  });

  it('grows with the slip as a plate does: all of it from 15° to 75°, none with the nose on the flight, square to it or behind it', () => {
    expect(liftOf(MAX_SPEED, 0, 1).lift).toBeLessThan(1e-6);
    expect(liftOf(MAX_SPEED, 5 * DEGREE, 1).lift / LIFT).toBeCloseTo(2 * sin(10 * DEGREE), 5);
    for (const slip of [15, 45, 75]) expect(liftOf(MAX_SPEED, slip * DEGREE, 1).lift).toBeCloseTo(LIFT, 3);
    expect(liftOf(MAX_SPEED, 85 * DEGREE, 1).lift).toBeLessThan(LIFT * 0.4);
    expect(liftOf(MAX_SPEED, 90 * DEGREE, 1).lift).toBeLessThan(1e-6);
    expect(liftOf(MAX_SPEED, 120 * DEGREE, 1).lift).toBe(0);
  });

  it('costs drag by the lift taken squared: a fifth of it at all of it, nothing without lift; none out of the air', () => {
    expect(liftOf(MAX_SPEED, 30 * DEGREE, 1).drag).toBeCloseTo(INDUCED * LIFT, 3);
    const half = liftOf(MAX_SPEED, 0.5 * asin(0.25), 1);
    expect(half.lift).toBeCloseTo(LIFT / 2, 3);
    expect(half.drag).toBeCloseTo((INDUCED * LIFT) / 4, 3);
    const none = liftOf(MAX_SPEED, 30 * DEGREE, 0);
    expect(Math.abs(none.lift) + Math.abs(none.drag)).toBe(0);
  });

  it('adds to the grip and so tightens the hardest turn, the more the faster, with the autopilot and in free drift', () => {
    for (const autopilot of [true, false]) {
      const thin = gripAt(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 0 }, autopilot);
      const thick = gripAt(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 }, autopilot);
      expect(thick - thin).toBeGreaterThan(LIFT * 0.9);
      expect(turnRadius(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 }, autopilot)).toBeLessThan(turnRadius(MAX_SPEED, undefined, autopilot) * 0.7);
      // a bend that slows a ship in vacuum is taken faster in air
      const bend = turnRadius(MAX_SPEED * 0.6, undefined, autopilot);
      expect(cornerSpeed(bend, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 }, autopilot)).toBeGreaterThan(MAX_SPEED * 0.6 * 1.1);
    }
    // in free drift the drive and the lift bend hardest with the nose short of square to the flight
    const best = gripAt(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 }, false);
    let top = 0;
    for (let slip = 60; slip <= 90; slip += 1) {
      const across = liftOf(MAX_SPEED, slip * DEGREE, 1).lift + MAIN_THRUST * sin(slip * DEGREE);
      expect(across).toBeLessThanOrEqual(best + 1e-6);
      top = Math.max(top, across);
    }
    expect(top).toBeGreaterThan(best - 5);
  });
});

describe('a turn in air', () => {
  /** The heading the flight turned through (rad) in `seconds` of the Host's full yaw at `speed`, the autopilot on, in air of `airDensity`. */
  function turned(speed: number, airDensity: number, seconds: number): { angle: number; speed: number } {
    const flight = new FlightModel();
    flight.reset(new THREE.Vector3(), new THREE.Quaternion());
    flight.velocity.set(0, 0, -speed);
    const none = new THREE.Vector3();
    const out = { ...IDLE };
    for (let t = 0; t < seconds; t += DT) {
      flight.airDensity = airDensity;
      flyByNose(flight, { ...IDLE, yaw: 1, thrust: 1 }, none, out);
      flight.update(DT, out, none);
    }
    return { angle: atan2(flight.velocity.x, -flight.velocity.z), speed: flight.velocity.length() };
  }

  it("is tighter at speed under Jupiter's deck than in vacuum, and the faster the tighter", () => {
    const vacuum = turned(MAX_SPEED, 0, 1);
    const deck = turned(MAX_SPEED, 1, 1);
    expect(Math.abs(deck.angle)).toBeGreaterThan(Math.abs(vacuum.angle) * 1.3);
    // the air's gain grows with the speed: at half the limit it adds less than at the limit
    const slow = turned(MAX_SPEED / 2, 1, 1).angle / turned(MAX_SPEED / 2, 0, 1).angle;
    expect(deck.angle / vacuum.angle).toBeGreaterThan(slow);
  });

  it("gives more lift the deeper under Jupiter's deck a ship flies, up to the trim of 20 g, which costs ever less drag", () => {
    expect(density(-20000)).toBeGreaterThan(2);
    const deep = { driveFactor: 1, thrusterFactor: 1, airDensity: density(-20000) };
    expect(gripAt(MAX_SPEED, deep) - gripAt(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: 1 })).toBeCloseTo(LIFT_MOST - LIFT, 3);
    const trimmed = liftOf(MAX_SPEED, 30 * DEGREE, density(-20000));
    expect(trimmed.lift).toBeCloseTo(LIFT_MOST, 3);
    expect(trimmed.drag).toBeCloseTo((INDUCED * LIFT_MOST * LIFT_MOST) / (LIFT * density(-20000)), 3);
    expect(trimmed.drag).toBeLessThan(INDUCED * LIFT);
  });
});
