import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import { HOOK_PULL, HOOK_RANGE, pullOn } from './hook';

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
});
