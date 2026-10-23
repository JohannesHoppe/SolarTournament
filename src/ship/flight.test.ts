import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IDLE, type Controls } from '../input/input';
import { FlightModel, MAX_SPEED, PathSteering, RCS_THRUST, turnRadius } from './flight';

const STEP = 1 / 60;
const none = new THREE.Vector3();

/** A ship at `speed` (units/s) flying straight ahead (-Z), with path steering. */
function flying(speed: number) {
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(), new THREE.Quaternion());
  flight.velocity.set(0, 0, -speed);
  return { flight, steering: new PathSteering(), out: { ...IDLE } as Controls };
}

/** Flies `seconds` with the stick as given; returns whether path steering flew all along. */
function fly(ship: ReturnType<typeof flying>, stick: Partial<Controls>, seconds: number) {
  let engaged = true;
  for (let t = 0; t < seconds; t += STEP) {
    const controls = { ...IDLE, ...stick };
    engaged = ship.steering.fly(ship.flight, controls, none, STEP, ship.out) && engaged;
    ship.flight.update(STEP, engaged ? ship.out : controls, none);
  }
  return engaged;
}

describe('path steering', () => {
  it('turns the path at the speed limit about four times tighter than the thrusters alone', () => {
    const ship = flying(MAX_SPEED);
    fly(ship, { yaw: 1 }, 1.5);
    // a steady turn: the radius from how fast the path turns
    const v0 = ship.flight.velocity.clone();
    expect(fly(ship, { yaw: 1 }, 0.5)).toBe(true);
    const rate = v0.angleTo(ship.flight.velocity) / 0.5;
    const radius = ship.flight.velocity.length() / rate;
    expect(ship.flight.velocity.length()).toBeGreaterThan(MAX_SPEED * 0.97);
    expect(radius).toBeLessThan(turnRadius(MAX_SPEED) * 1.15);
    expect(radius).toBeLessThan(turnRadius(MAX_SPEED, RCS_THRUST) / 3);
    // the nose leads into the turn: to the right of the path
    const lead = ship.flight.toLocalDirection(ship.flight.velocity, new THREE.Vector3());
    expect(lead.x).toBeLessThan(0);
  });

  it('flies straight on when the stick is let go, the nose settling onto the path', () => {
    const ship = flying(MAX_SPEED);
    fly(ship, { yaw: 1 }, 1.5);
    fly(ship, {}, 0.6);
    const v0 = ship.flight.velocity.clone();
    fly(ship, {}, 2);
    expect(v0.angleTo(ship.flight.velocity)).toBeLessThan(0.03);
    expect(ship.flight.angleTo(ship.flight.velocity)).toBeLessThan(0.03);
  });

  it('turns the nose with the stick when the ship hardly moves', () => {
    const ship = flying(100);
    expect(fly(ship, { yaw: 1 }, 0.5)).toBe(false);
  });
});
