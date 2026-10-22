import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import { HOOK_PULL, HOOK_RANGE, pullOn } from './hook';
import { HOOK_FLING, HOOK_STANDOFF } from './school';
import { SAFE_IMPACT } from '../ship/impact';

const DT = 1 / 120;
/** An anchor at the origin, at rest (never changed by the tests). */
const AT_REST = new THREE.Vector3();

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
  for (let t = 0; t < seconds && length !== null; t += DT) {
    length = pullOn(flight, AT_REST, AT_REST, length, reeling, 1, floor, MAX_SPEED, DT);
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
    expect(pullOn(flight, AT_REST, AT_REST, HOOK_RANGE, true, 1, 0, MAX_SPEED, DT)).toBeNull();
  });

  it('never reels a ship at rest into its rock: from the full range it comes to rest at the floor', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE, 0, 0);
    let closest = Infinity;
    let length: number | null = HOOK_RANGE;
    for (let t = 0; t < 20 && length !== null; t += DT) {
      length = pullOn(flight, AT_REST, AT_REST, length, true, 1, 3000, MAX_SPEED, DT);
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

  it('pulls two ships flying side by side as it pulls two at rest, and never slams them together', () => {
    const run = (cruise: number) => {
      const a = new FlightModel();
      const b = new FlightModel();
      a.position.set(-3000, 0, 0);
      b.position.set(3000, 0, 0);
      a.velocity.set(0, 0, cruise);
      b.velocity.set(0, 0, cruise);
      let length: number | null = 6000;
      let closest = Infinity;
      for (let t = 0; t < 4 && length !== null; t += DT) {
        length = pullOn(a, b.position, b.velocity, length, true, 0.5, 1360, MAX_SPEED, DT);
        if (length !== null) length = pullOn(b, a.position, a.velocity, length, true, 0.5, 1360, MAX_SPEED, DT);
        a.position.addScaledVector(a.velocity, DT);
        b.position.addScaledVector(b.velocity, DT);
        closest = Math.min(closest, a.position.distanceTo(b.position));
      }
      return { a: a.velocity.clone(), b: b.velocity.clone(), closest };
    };
    const still = run(0);
    const cruising = run(3000);
    // the same pull on both, whatever they fly at together
    expect(cruising.a.x).toBeCloseTo(still.a.x, 0);
    expect(cruising.b.x).toBeCloseTo(still.b.x, 0);
    // and alike on both (within 1 m/s: one is pulled after the other)
    expect(Math.abs(cruising.a.x + cruising.b.x)).toBeLessThan(20);
    // two hulls (17 m each) never touch
    expect(cruising.closest).toBeGreaterThan(680);
  });

  // plausibility: the flight school's hook drill (see school.ts) must work at every rock of the belt
  for (const reach of [2000, 5000, 11000]) {
    it(`flings a pilot of the hook drill faster than it asks around a rock reaching ${reach / 20} m`, () => {
      // the winch's floor: about 70 m (four ship radii) beyond the rock's reach
      const floor = reach + 1400;
      const flight = new FlightModel();
      flight.position.set(reach + HOOK_STANDOFF, 0, 0);
      flight.velocity.set(0, 0, 1000);
      let length: number | null = flight.position.length();
      for (let t = 0; t < 3 && length !== null; t += DT) {
        length = pullOn(flight, AT_REST, AT_REST, length, true, 1, floor, MAX_SPEED, DT);
        flight.position.addScaledVector(flight.velocity, DT);
        // never closer than the floor (within two meters), so never into the rock
        expect(flight.position.length()).toBeGreaterThan(floor - 40);
      }
      expect(flight.velocity.length()).toBeGreaterThan(HOOK_FLING);
    });
  }
});
