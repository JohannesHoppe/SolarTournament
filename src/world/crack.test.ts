import { describe, expect, it } from 'vitest';
import { CRACK_GROUND_HALF, CRACK_TRACK, crackRelief, TRACK_LIFT } from './crack';
import { CRACK_WIDTH, crackMiddle, inCrack, surfaceHeight } from './europa';
import { reliefOutside } from '../test/field';
import { GATE_RADIUS } from '../game/race';
import { expectGatesApart, expectStartsClear, raceWorld } from '../test/track';

describe("Europa's Crack as a race world", () => {
  it('keeps its relief inside its box over the whole of its 20 km', () => {
    expect(reliefOutside(crackRelief, CRACK_GROUND_HALF, 1000)).toEqual([]);
  });

  it('lays a track of some 26 km from a start to a finish, every point of it over the ground and within it', () => {
    const { points, gates } = CRACK_TRACK;
    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    console.info(`the Crack's track: ${(length / 20000).toFixed(1)} km, ${gates.length} gates`);
    expect(length).toBeGreaterThan(24 * 20000);
    expect(gates[0]).toBeGreaterThan(0);
    expect(gates[gates.length - 1]).toBe(points.length - 1);
    for (const point of points) {
      // at least 20 m over the ground beneath it, its rubble and ridges counted, and on the ground's box
      expect(point.y - surfaceHeight(point.x, point.z), `${point.toArray()}`).toBeGreaterThan(400);
      expect(Math.abs(point.x)).toBeLessThan(CRACK_GROUND_HALF.x - 4000);
      expect(Math.abs(point.z)).toBeLessThan(CRACK_GROUND_HALF.z - 4000);
    }
  });

  it("runs some 14 km down the Crack low over its floor, then out over the plain", () => {
    const { points } = CRACK_TRACK;
    const inside = points.filter((point) => inCrack(point.x, point.z) > 0.9 && point.y - surfaceHeight(point.x, point.z) < TRACK_LIFT + 500);
    expect(inside.length * 100).toBeGreaterThan(13000);
    for (const point of inside) expect(Math.abs(point.x - crackMiddle(point.z))).toBeLessThan(CRACK_WIDTH / 10);
  });

  it('stands its gates 1 km apart or more, the first the start and the last the finish', () => {
    const { course: c } = raceWorld('crack');
    expectGatesApart(c);
    // a gate stands on the ground, its opening down to it; only the climb out of the Crack and the bend over its lips are flown higher
    const aloft = c.points.filter((point) => point.y - surfaceHeight(point.x, point.z) >= GATE_RADIUS);
    expect(aloft.length).toBeLessThanOrEqual(3);
  });

  it('prints a grid and new clones clear of the ground, the walls and the station, along the track', () => expectStartsClear('crack'));
});
