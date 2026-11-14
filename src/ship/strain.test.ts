import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, MAIN_THRUST, OVERDRIVE_PUSH, OVERDRIVE_SECONDS, overdriveStep } from './flight';
import { feltLoad, G, Seat, strainAfter } from './ship';
import { JOLT_TIME } from '../world/bodies';
import { CABLE_BREAK, cablePull } from '../game/hook';
import type { Controls } from '../input/input';

const STEP = 1 / 60;
const IDLE: Controls = { yaw: 0, pitch: 0, roll: 0, thrust: 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false };

/** A step of a flight with its seat: `pulls` the outside pulls (gravity among them, `fall` gravity alone), `kick` speed given from outside before it. */
function step(flight: FlightModel, seat: Seat, pulls: THREE.Vector3, fall: THREE.Vector3, controls = IDLE, kick?: THREE.Vector3) {
  if (kick) flight.velocity.add(kick);
  flight.fall.copy(fall);
  seat.before(flight, pulls, STEP);
  flight.update(STEP, controls, pulls);
  return seat.after(flight, STEP);
}

describe("the clone's body under g, whatever pushes its hull", () => {
  it('bears a pull-up worse than the drive, and greys out fast beyond the harsh load', () => {
    const push = MAIN_THRUST;
    expect(feltLoad(new THREE.Vector3(0, 0, -push))).toBeCloseTo(push, 6);
    expect(feltLoad(new THREE.Vector3(0, push, 0))).toBeCloseTo(push * 1.2, 6);
    expect(feltLoad(new THREE.Vector3(push, 0, 0))).toBeLessThan(feltLoad(new THREE.Vector3(0, push, 0)));
    // the drive's full push: full strain within 5 s
    let strain = 0;
    for (let t = 0; t < 5; t += STEP) strain = strainAfter(strain, feltLoad(new THREE.Vector3(0, 0, -push)), STEP);
    expect(strain).toBeGreaterThan(0.99);
    // 40 g, a carve in air: beyond the gel's harsh load every g counts four times, full strain within a second
    strain = 0;
    for (let t = 0; t < 1; t += STEP) strain = strainAfter(strain, 40 * G, STEP);
    expect(strain).toBe(1);
  });

  it('feels no gravity in free fall, but the hover field and a blow', () => {
    const flight = new FlightModel();
    const seat = new Seat();
    const fall = new THREE.Vector3(0, -G, 0);
    // falling at 1 g: nothing
    for (let t = 0; t < 1; t += STEP) expect(step(flight, seat, fall, fall).length()).toBeLessThan(1e-6);
    // held up by a push of 1 g besides gravity (the hover field): the clone feels its weight
    const held = new THREE.Vector3(0, 0, 0);
    let felt = 0;
    for (let t = 0; t < 1; t += STEP) felt = step(flight, seat, held, fall).y;
    expect(felt / G).toBeCloseTo(1, 1);
  });

  it('passes a jolt on over its gel: its peak the speed over JOLT_TIME, all of it in the end', () => {
    const flight = new FlightModel();
    const seat = new Seat();
    const none = new THREE.Vector3();
    step(flight, seat, none, none);
    // a blow of 60 m/s sideways (the dodge's)
    const blow = 60 / 0.05;
    const peak = step(flight, seat, none, none, IDLE, new THREE.Vector3(blow, 0, 0)).x;
    expect(peak).toBeCloseTo((blow * STEP) / JOLT_TIME / STEP, 0);
    let sum = peak * STEP;
    let strain = strainAfter(0, feltLoad(seat.felt), STEP);
    for (let t = 0; t < 2; t += STEP) {
      sum += step(flight, seat, none, none).x * STEP;
      strain = strainAfter(strain, feltLoad(seat.felt), STEP);
    }
    expect(sum).toBeCloseTo(blow, -1);
    // a dodge strains the clone a little, never to the edge
    expect(strain).toBeLessThan(0.3);
  });

  it("feels a blow's spin as the cockpit's swing round the hull's middle (see ship/blow)", () => {
    const flight = new FlightModel();
    const seat = new Seat();
    const none = new THREE.Vector3();
    step(flight, seat, none, none);
    // a blow on the nose's corner sets the hull spinning at 6 rad/s about its up axis
    flight.angularVelocity.y += 6;
    let sum = 0;
    for (let t = 0; t < 2; t += STEP) {
      flight.fall.set(0, 0, 0);
      seat.before(flight, none, STEP);
      // (the flight computer's rate control takes the spin out within the step: the clone feels only the blow's)
      flight.update(STEP, IDLE, none);
      sum += seat.after(flight, STEP).length() * STEP;
    }
    // the cockpit, under the canopy about 15 % of the hull ahead of its middle, swung sideways at 6 rad/s times that
    expect(sum).toBeGreaterThan(6 * 105 * 0.9);
  });

  it("feels the overdrive's shove at about 25 g over its seconds, and the swing on a cable", () => {
    const flight = new FlightModel();
    const seat = new Seat();
    const none = new THREE.Vector3();
    step(flight, seat, none, none);
    const pending = new THREE.Vector3(0, 0, -OVERDRIVE_PUSH);
    let left = OVERDRIVE_SECONDS;
    let most = 0;
    let strain = 0;
    while (left > 0) {
      const before = flight.velocity.clone();
      left = overdriveStep(flight.velocity, pending, left, STEP);
      const kick = flight.velocity.clone().sub(before);
      flight.velocity.copy(before);
      most = Math.max(most, step(flight, seat, none, none, IDLE, kick).length());
      strain = strainAfter(strain, feltLoad(seat.felt), STEP);
    }
    expect(flight.velocity.length()).toBeCloseTo(OVERDRIVE_PUSH, 0);
    expect(most / G).toBeGreaterThan(20);
    expect(most / G).toBeLessThan(27);
    // pressed into the seat, short of greying out
    expect(strain).toBeGreaterThan(0.1);
    expect(strain).toBeLessThan(0.6);
  });
});

describe("the hook's cable", () => {
  const ship = 60000;
  /** The pull a cable gives over `seconds` of steps that each change an interceptor's speed by `perStep` (units/s). */
  const pullOver = (perStep: number, seconds: number) => {
    let pull = 0;
    const before = new THREE.Vector3();
    const after = new THREE.Vector3(perStep, 0, 0);
    for (let t = 0; t < seconds; t += STEP) pull = cablePull(pull, before, after, ship, STEP);
    return pull;
  };

  it('holds a swing of 20 g and tears in one of 40 g', () => {
    expect(pullOver(20 * G * STEP, 1)).toBeLessThan(CABLE_BREAK);
    expect(pullOver(20 * G * STEP, 1) / G).toBeCloseTo(20, 0);
    expect(pullOver(40 * G * STEP, 1)).toBeGreaterThan(CABLE_BREAK);
  });

  it('tears when it stops a ship flying off at 150 m/s, and holds one at 30 m/s', () => {
    const jerk = (speed: number) => cablePull(0, new THREE.Vector3(), new THREE.Vector3(speed / 0.05, 0, 0), ship, STEP);
    expect(jerk(150)).toBeGreaterThan(CABLE_BREAK);
    expect(jerk(30)).toBeLessThan(CABLE_BREAK);
  });

  it('pulls a probe, 60 kg on it, by its mass: never near its load', () => {
    let pull = 0;
    for (let t = 0; t < 1; t += STEP) pull = cablePull(pull, new THREE.Vector3(), new THREE.Vector3((32 * G * STEP), 0, 0), 60, STEP);
    expect(pull).toBeLessThan(CABLE_BREAK / 100);
  });
});
