import { describe, expect, it } from 'vitest';
import { THROAT_GROUND_HALF, THROAT_TRACK, throatGround, throatHalfWidth, throatMiddle, throatRelief, throatSea, TRACK_LIFT } from './throat';
import { altitudeIn, densityIn, safeSpeed } from './air';
import { TITAN_AIR } from './titan';
import { COOLING_SHADOW } from '../ship/ship';
import { reliefOutside } from '../test/field';
import { LIFT_MOST, liftAt, MAX_SPEED } from '../ship/flight';
import { expectGatesApart, expectStartsClear, raceWorld } from '../test/track';

describe("Kraken Mare's Throat as a race world", () => {
  it('keeps its relief inside its box over the whole of its 22 km', () => {
    expect(reliefOutside(throatRelief, THROAT_GROUND_HALF, 1000)).toEqual([]);
  });

  it('lays a track of some 25 km from a start to a finish, every point of it 45 m over the open water of the strait', () => {
    const { points, gates } = THROAT_TRACK;
    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    console.info(`the Throat's track: ${(length / 20000).toFixed(1)} km, ${gates.length} gates`);
    expect(length).toBeGreaterThan(23 * 20000);
    expect(gates[0]).toBeGreaterThan(0);
    expect(gates[gates.length - 1]).toBe(points.length - 1);
    for (const point of points) {
      // over the open water, never over a bank, and on the ground's box
      expect(throatGround(point.x, point.z), `${point.toArray()}`).toBe(throatSea(point.x, point.z));
      expect(point.y - throatSea(point.x, point.z)).toBeCloseTo(TRACK_LIFT);
      expect(Math.abs(point.x - throatMiddle(point.z))).toBeLessThan(throatHalfWidth(point.z) / 2);
      expect(Math.abs(point.x)).toBeLessThan(THROAT_GROUND_HALF.x - 4000);
      expect(Math.abs(point.z)).toBeLessThan(THROAT_GROUND_HALF.z - 4000);
    }
  });

  it('flies in an air that holds the speed limit without burning the hull, down to the water, and lifts as hard as the flight computer takes', () => {
    const at = THROAT_TRACK.points[Math.floor(THROAT_TRACK.points.length / 2)];
    expect(densityIn(TITAN_AIR, at)).toBeGreaterThan(1);
    // the radiators' cooling in the air, the sun hidden (see world/air, safeSpeed)
    for (const height of [at.y, throatSea(at.x, at.z)]) expect(safeSpeed(altitudeIn(TITAN_AIR, at.clone().setY(height)), COOLING_SHADOW)).toBe(MAX_SPEED);
    expect(liftAt(densityIn(TITAN_AIR, at), MAX_SPEED)).toBeGreaterThanOrEqual(LIFT_MOST);
  });

  it('stands its gates 1 km apart or more, the first the start and the last the finish', () => expectGatesApart(raceWorld('throat').course));

  it('prints a grid and new clones over the water, clear of the banks, along the track', () => expectStartsClear('throat', (at) => at.y - throatGround(at.x, at.z)));
});
