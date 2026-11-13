import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CRACK_GROUND_HALF, CRACK_TRACK, crackRelief, TRACK_LIFT } from './crack';
import { CRACK_WIDTH, crackMiddle, inCrack, surfaceHeight } from './europa';
import { arenaById } from './arenas';
import { reliefOutside, testField } from '../test/field';
import { Course, GATE_RADIUS } from '../game/race';
import { SHIP_RADIUS } from '../test/pilot';
import { bendRadius } from '../game/racingline';

const crack = arenaById('crack')!;
const course = () => {
  const field = testField();
  field.generate(crack.layout);
  return { field, course: new Course(field, crack.layout.seed) };
};

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
    const { course: c } = course();
    expect(c.track).toBe(true);
    expect(c.laps).toBe(1);
    expect(c.finishGates).toBe(c.count);
    for (let i = 1; i < c.count; i++) expect(c.points[i].distanceTo(c.points[i - 1]), `gate ${i}`).toBeGreaterThan(20000);
    // a gate stands on the ground, its opening down to it; only the climb out of the Crack and the bend over its lips are flown higher
    const aloft = c.points.filter((point) => point.y - surfaceHeight(point.x, point.z) >= GATE_RADIUS);
    expect(aloft.length).toBeLessThanOrEqual(3);
  });

  it('prints a grid and new clones clear of the ground, the walls and the station, along the track', () => {
    const { field, course: c } = course();
    const at = new THREE.Vector3();
    for (let passed = 0; passed < c.count; passed++) {
      for (let slot = 0; slot < 8; slot++) {
        c.startOf(passed, slot, at);
        expect(field.overlap(at, SHIP_RADIUS), `passed ${passed} slot ${slot}`).toBeFalsy();
      }
    }
  });

  it('splits twice into two ways that join again, one shorter and riskier, every point of either over the ground', () => {
    const { points, branches } = CRACK_TRACK;
    expect(branches.length).toBeGreaterThanOrEqual(2);
    const length = (way: readonly THREE.Vector3[]) => way.reduce((sum, point, i) => sum + (i ? point.distanceTo(way[i - 1]) : 0), 0);
    for (const branch of branches) {
      const own = points.slice(branch.split, branch.join + 1);
      const other = [points[branch.split], ...branch.points, points[branch.join]];
      const [risky, safe] = branch.risky ? [other, own] : [own, other];
      console.info(`a branch: ${(length(risky) / 20000).toFixed(2)} km the risky way, ${(length(safe) / 20000).toFixed(2)} km the safe way, ${branch.gates.length} gates on each`);
      expect(length(risky)).toBeLessThan(length(safe) - 6000);
      expect(branch.gates.length).toBeGreaterThan(0);
      for (const point of branch.points) {
        expect(point.y - surfaceHeight(point.x, point.z), `${point.toArray()}`).toBeGreaterThan(400);
        expect(Math.abs(point.x)).toBeLessThan(CRACK_GROUND_HALF.x - 4000);
      }
      // the other way bends nowhere tighter than its tight bend (500 m), measured over 100 m either way
      for (let i = 1; i < other.length - 1; i++) expect(bendRadius(other[i - 1], other[i], other[i + 1]), `point ${i}`).toBeGreaterThan(9000);
      // and its gates stand well apart from the track's own, their rings far from touching
      const { course: c } = course();
      for (const { gate } of branch.gates) expect(c.gatePoint(gate, 1 << branches.indexOf(branch)).distanceTo(c.points[gate]), `gate ${gate}`).toBeGreaterThan(GATE_RADIUS * 2.5);
    }
  });

  it('stands the gates of every way through the branches 600 m apart or more, across the tight bend too', () => {
    const { course: c } = course();
    expect(c.branches).toBe(CRACK_TRACK.branches.length);
    for (let ways = 0; ways < 1 << c.branches; ways++) {
      const { points } = c.lap(ways);
      for (let i = 1; i < points.length; i++) expect(points[i].distanceTo(points[i - 1]), `ways ${ways} gate ${i}`).toBeGreaterThan(12000);
    }
  });
});
