import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadOf, plasmaOf } from './reentry';
import { safeSpeed } from '../world/air';
import { arenaById } from '../world/arenas';
import { MAX_SPEED } from '../ship/flight';
import { COOLING_SHADOW } from '../ship/ship';

const air = arenaById('giant')!.layout.air!;
/** Meters to units (1 unit = 5 cm). */
const m = (meters: number) => meters * 20;
/** A point at an altitude (units) straight above the field's center. */
const at = (altitude: number) => new THREE.Vector3(0, altitude, 0);
const ahead = (speed: number) => new THREE.Vector3(0, 0, -speed);

describe('the plasma of a ship flying hot through the air', () => {
  it('follows the heating against the radiators: a quarter where they just keep up, full at eight times', () => {
    expect(plasmaOf(0)).toBe(0);
    expect(plasmaOf(0.5)).toBe(0);
    expect(plasmaOf(1)).toBeCloseTo(0.25);
    expect(plasmaOf(2)).toBeCloseTo(0.5);
    expect(plasmaOf(8)).toBe(1);
    expect(plasmaOf(100)).toBe(1);
  });

  it('shows from the safe speed on, as the heat alarm does, and nowhere over the clouds', () => {
    for (const depth of [-800, -1500, -2500]) {
      const safe = safeSpeed(m(depth), COOLING_SHADOW);
      expect(loadOf(air, at(m(depth)), ahead(safe), COOLING_SHADOW)).toBeCloseTo(1, 5);
      expect(plasmaOf(loadOf(air, at(m(depth)), ahead(safe * 0.79), COOLING_SHADOW))).toBe(0);
    }
    expect(plasmaOf(loadOf(air, at(m(10)), ahead(MAX_SPEED), COOLING_SHADOW))).toBe(0);
    expect(plasmaOf(loadOf(air, at(m(-2000)), ahead(MAX_SPEED), COOLING_SHADOW))).toBeGreaterThan(0.6);
  });

  it('takes the flight alone: the same for every ship, wherever it is drawn', () => {
    const a = loadOf(air, at(m(-1200)), new THREE.Vector3(3000, -1000, 2000), COOLING_SHADOW);
    const b = loadOf(air, at(m(-1200)), new THREE.Vector3(-2000, 3000, -1000), COOLING_SHADOW);
    expect(a).toBeCloseTo(b, 10);
  });
});
