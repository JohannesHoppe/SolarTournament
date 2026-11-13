import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIDGE_HALF, bridgePlacements, CRACK_GROUND_HALF, CRACK_JUPITER, CRACK_SUN, CRACK_TRACK, crackRelief, gorgeMiddle, RIFT_DEPTH, riftDepth, riftHeight, riftMiddle, TRACK_LIFT } from './crack';
import { LAND } from './europa';
import { reliefOutside } from '../test/field';
import { GATE_RADIUS } from '../game/race';
import { bendRadius } from '../game/racingline';
import { expectGatesApart, expectStartsClear, raceWorld } from '../test/track';
import { SHIP_RADIUS } from '../test/pilot';

const KM = 20000;
const length = (way: readonly THREE.Vector3[]) => way.reduce((sum, point, i) => sum + (i ? point.distanceTo(way[i - 1]) : 0), 0);

describe("Europa's Crack as a race world", () => {
  it('keeps its relief inside its box over the whole of its 23 km', () => {
    expect(reliefOutside(crackRelief, CRACK_GROUND_HALF, 1000)).toEqual([]);
  });

  it('lays a track of some 26 km from a start to a finish, every point of it over the ground and within it', () => {
    const { points, gates } = CRACK_TRACK;
    console.info(`the Crack's track: ${(length(points) / KM).toFixed(1)} km, ${gates.length} gates`);
    expect(length(points)).toBeGreaterThan(24 * KM);
    expect(gates[0]).toBeGreaterThan(0);
    expect(gates[gates.length - 1]).toBe(points.length - 1);
    for (const point of points) {
      // at least 20 m over the ground beneath it, its rubble, rafts and ridges counted, and on the ground's box
      expect(point.y - riftHeight(point.x, point.z), `${point.toArray()}`).toBeGreaterThan(400);
      expect(Math.abs(point.x)).toBeLessThan(CRACK_GROUND_HALF.x - 4000);
      expect(Math.abs(point.z)).toBeLessThan(CRACK_GROUND_HALF.z - 4000);
    }
  });

  it("runs some 9 km and more low over the rift's floor, a valley wider than it is deep, and some 40 % of it over the open ice", () => {
    const { points } = CRACK_TRACK;
    let floor = 0;
    let open = 0;
    for (let i = 1; i < points.length; i++) {
      const step = points[i].distanceTo(points[i - 1]);
      const { x, y, z } = points[i];
      const depth = riftDepth(z) * (Math.abs(x - riftMiddle(z)) < 20000 ? 1 : 0);
      if (depth > RIFT_DEPTH * 0.95 && y - riftHeight(x, z) < TRACK_LIFT + 500) {
        floor += step;
        // its floor wider than 180 m, and its rims some 400 m apart or more
        let left = 0;
        while (riftHeight(x - left, z) < LAND - RIFT_DEPTH + 600 && left < 20000) left += 100;
        let right = 0;
        while (riftHeight(x + right, z) < LAND - RIFT_DEPTH + 600 && right < 20000) right += 100;
        expect(left + right, `${points[i].toArray()}`).toBeGreaterThan(3600);
      }
      if (depth < RIFT_DEPTH * 0.1) open += step;
    }
    const all = length(points);
    console.info(`on the rift's floor ${(floor / KM).toFixed(1)} km, over the open ice ${((open / all) * 100).toFixed(0)} %`);
    expect(floor).toBeGreaterThan(9 * KM);
    expect(open / all).toBeGreaterThan(0.35);
    expect(open / all).toBeLessThan(0.48);
    // the rift's floor some 500 m wide where it runs full, its rims some 900 m apart
    const z = -2.8 * KM;
    expect(riftHeight(riftMiddle(z), z)).toBeLessThan(LAND - RIFT_DEPTH + 600);
    expect(riftHeight(riftMiddle(z) + 20000, z)).toBeGreaterThan(LAND - 400);
  });

  it('heads its long straight at Jupiter, low over the horizon, the sun low behind it', () => {
    const toward = CRACK_JUPITER.clone().normalize();
    const elevation = Math.asin(toward.y);
    expect(elevation).toBeGreaterThan(0.14);
    expect(elevation).toBeLessThan(0.26);
    // along the second segment the track heads within 10° of it
    const ahead = new THREE.Vector3(0, 0, -1);
    expect(new THREE.Vector3(toward.x, 0, toward.z).normalize().dot(ahead)).toBeGreaterThan(Math.cos(0.17));
    expect(CRACK_SUN.dot(ahead)).toBeLessThan(0);
    expect(CRACK_SUN.y).toBeGreaterThan(0.15);
  });

  it('lays slabs of ice across the rift high enough to fly under, the track passing beneath every one', () => {
    const slabs = bridgePlacements(0);
    expect(slabs.length).toBeGreaterThanOrEqual(3);
    const { points, branches } = CRACK_TRACK;
    const ways = [points, ...branches.map((branch) => branch.points)];
    for (const slab of slabs) {
      const under = slab.position.y - BRIDGE_HALF.y;
      const below = ways.flat().filter((point) => Math.abs(point.z - slab.position.z) < BRIDGE_HALF.z && Math.abs(point.x - slab.position.x) < 4000);
      expect(below.length, `the slab at ${slab.position.z}`).toBeGreaterThan(0);
      for (const point of below) expect(under - point.y, `${point.toArray()}`).toBeGreaterThan(SHIP_RADIUS * 1.5);
    }
  });

  it('cuts its gorge 600 m deep or more between sheer walls, the risky way through it', () => {
    let deepest = 0;
    for (let z = -1 * KM; z > -4 * KM; z -= 1000) {
      const floor = riftHeight(gorgeMiddle(z), z);
      deepest = Math.max(deepest, Math.min(riftHeight(gorgeMiddle(z) - 6000, z), riftHeight(gorgeMiddle(z) + 6000, z)) - floor);
    }
    expect(deepest).toBeGreaterThan(12000);
  });

  it('stands its gates 1 km apart or more, the first the start and the last the finish', () => {
    const { course: c } = raceWorld('crack');
    expectGatesApart(c);
    // a gate stands on the ground, its opening down to it; only where the track rises out of the rift is one flown higher
    const aloft = c.points.filter((point) => point.y - riftHeight(point.x, point.z) >= GATE_RADIUS);
    expect(aloft.length).toBeLessThanOrEqual(3);
  });

  it('prints a grid and new clones clear of the ground, the walls, the slabs and the station, along the track', () => expectStartsClear('crack'));

  it('splits twice into two ways that join again, one shorter and riskier, every point of either over the ground', () => {
    const { points, branches } = CRACK_TRACK;
    const { course } = raceWorld('crack');
    expect(branches.length).toBeGreaterThanOrEqual(2);
    branches.forEach((branch, b) => {
      const own = points.slice(branch.split, branch.join + 1);
      const other = [points[branch.split], ...branch.points, points[branch.join]];
      const [risky, safe] = branch.risky ? [other, own] : [own, other];
      console.info(`a branch: ${(length(risky) / KM).toFixed(2)} km the risky way, ${(length(safe) / KM).toFixed(2)} km the safe way, ${branch.gates.length} gates on each`);
      expect(length(risky)).toBeLessThan(length(safe) - 6000);
      expect(branch.gates.length).toBeGreaterThan(0);
      for (const point of branch.points) {
        expect(point.y - riftHeight(point.x, point.z), `${point.toArray()}`).toBeGreaterThan(400);
        expect(Math.abs(point.x)).toBeLessThan(CRACK_GROUND_HALF.x - 4000);
      }
      // the other way bends nowhere tighter than its tight bend (500 m), measured over 100 m either way
      for (let i = 1; i < other.length - 1; i++) expect(bendRadius(other[i - 1], other[i], other[i + 1]), `point ${i}`).toBeGreaterThan(9000);
      // and its gates stand well apart from the track's own, their rings far from touching
      for (const { gate } of branch.gates) expect(course.gatePoint(gate, 1 << b).distanceTo(course.points[gate]), `gate ${gate}`).toBeGreaterThan(GATE_RADIUS * 2.5);
    });
  });

  it('stands the gates of every way through the branches 600 m apart or more, across the tight bend too', () => {
    const { course } = raceWorld('crack');
    expect(course.branches).toBe(CRACK_TRACK.branches.length);
    for (let ways = 0; ways < 1 << course.branches; ways++) {
      const { points } = course.lap(ways);
      for (let i = 1; i < points.length; i++) expect(points[i].distanceTo(points[i - 1]), `ways ${ways} gate ${i}`).toBeGreaterThan(12000);
    }
  });
});
