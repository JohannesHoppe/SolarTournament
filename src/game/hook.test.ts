import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import { HOOK_PULL, HOOK_RANGE, pullOn } from './hook';
import { HOOK_FLING, HOOK_STANDOFF } from './school';
import { SAFE_IMPACT } from '../ship/impact';

const DT = 1 / 120;

/** A ship 200 m from the anchor at the origin, passing it sideways at `speed`. */
function passing(speed: number) {
  const flight = new FlightModel();
  flight.position.set(4000, 0, 0);
  flight.velocity.set(0, 0, speed);
  return flight;
}

/** Flies `seconds` on the cable: the cable pulls, the ship moves on its velocity. */
function fly(flight: FlightModel, seconds: number, reeling: boolean, floor = 0) {
  let length: number | null = flight.position.length();
  const anchor = new THREE.Vector3();
  for (let t = 0; t < seconds && length !== null; t += DT) {
    length = pullOn(flight, anchor, length, reeling, 1, floor, MAX_SPEED, DT);
    flight.position.addScaledVector(flight.velocity, DT);
  }
  return length;
}

describe('the hook', () => {
  it('swings a passing ship around the rock, at the cable length and the same speed', () => {
    const flight = passing(2000);
    fly(flight, 3, false);
    expect(flight.position.length()).toBeCloseTo(4000, -2);
    expect(flight.velocity.length()).toBeCloseTo(2000, -2);
    // a quarter turn and more: the cable bent the course
    expect(flight.position.x).toBeLessThan(4000);
  });

  it('reels a ship in, and the swing gets faster as the cable gets shorter', () => {
    const flight = passing(1000);
    const length = fly(flight, 2, true, 1000)!;
    expect(length).toBeLessThan(4000);
    expect(flight.velocity.length()).toBeGreaterThan(1000);
  });

  it('pulls a ship at rest towards the anchor with the winch, and stops short of the rock', () => {
    const flight = passing(0);
    fly(flight, 0.5, true, 1000);
    expect(flight.velocity.x).toBeCloseTo(-HOOK_PULL * 0.5, -1);
    fly(flight, 20, true, 3000);
    expect(flight.position.length()).toBeGreaterThan(2500);
  });

  it('lets a ship go: no pull without reeling and a slack cable', () => {
    const flight = passing(0);
    flight.velocity.set(-500, 0, 0);
    fly(flight, 1, false);
    expect(flight.velocity.x).toBe(-500);
  });

  it('snaps far beyond its range', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE * 2, 0, 0);
    expect(pullOn(flight, new THREE.Vector3(), HOOK_RANGE, true, 1, 0, MAX_SPEED, DT)).toBeNull();
  });

  it('never reels a ship at rest into its rock: from the full range it comes to rest at the floor', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE, 0, 0);
    let closest = Infinity;
    let length: number | null = HOOK_RANGE;
    for (let t = 0; t < 20 && length !== null; t += DT) {
      length = pullOn(flight, new THREE.Vector3(), length, true, 1, 3000, MAX_SPEED, DT);
      flight.position.addScaledVector(flight.velocity, DT);
      closest = Math.min(closest, flight.position.length());
    }
    // within two meters of the floor, 70 m off the rock in the game, and at rest there
    expect(closest).toBeGreaterThan(3000 - 40);
    expect(flight.velocity.length()).toBeLessThan(SAFE_IMPACT);
  });

  it('keeps the speed of a ship let go before the floor: a jump', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE, 0, 0);
    fly(flight, 1.2, true, 3000);
    const speed = flight.velocity.length();
    expect(speed).toBeGreaterThan(HOOK_PULL);
    fly(flight, 1, false);
    expect(flight.velocity.length()).toBeCloseTo(speed);
  });

  // plausibility: the flight school's hook drill (see school.ts) must work at every rock of the belt
  for (const reach of [2000, 5000, 11000]) {
    it(`flings a pilot of the hook drill faster than it asks around a rock reaching ${reach / 20} m`, () => {
      const floor = reach + 1400;
      const flight = new FlightModel();
      flight.position.set(reach + HOOK_STANDOFF, 0, 0);
      flight.velocity.set(0, 0, 1000);
      let length: number | null = flight.position.length();
      for (let t = 0; t < 3 && length !== null; t += DT) {
        length = pullOn(flight, new THREE.Vector3(), length, true, 1, floor, MAX_SPEED, DT);
        flight.position.addScaledVector(flight.velocity, DT);
        expect(flight.position.length()).toBeGreaterThan(reach);
      }
      expect(flight.velocity.length()).toBeGreaterThan(HOOK_FLING);
    });
  }
});
