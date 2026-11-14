import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARCH_CLEARANCE, ARCH_HALF, BENDS, CANYON_LINE, LANDMARKS, legStart, RIG_HALF, SIGN_HALF, STRAIT, THROAT_AIR, THROAT_GROUND_HALF, THROAT_TRACK, throatGround, throatRelief, throatSea, BEACON_HALF, TRACK_LIFT, WRECK_HALF } from './throat';
import { airStep, altitudeIn, densityIn, reachIn, safeSpeed, SIGHT_DEPTH } from './air';
import { RADIATE, MAX_HEAT } from '../ship/ship';
import { reliefOutside } from '../test/field';
import { LIFT_MOST, liftAt, MAX_SPEED, turnRadius } from '../ship/flight';
import { expectGatesApart, expectStartsClear, raceWorld } from '../test/track';

const M = 20;
const KM = 20000;
const lengthOf = (points: readonly THREE.Vector3[]) => points.reduce((sum, p, i) => sum + (i ? p.distanceTo(points[i - 1]) : 0), 0);
const over = (p: THREE.Vector3) => throatGround(p.x, p.z) - throatSea(p.x, p.z);
/** The tightest radius of a line between two of its samples (units). */
const tightest = (line: typeof STRAIT, from: number, to: number) => {
  let radius = Infinity;
  for (let i = Math.max(5, from); i < Math.min(line.x.length - 5, to); i++) radius = Math.min(radius, 1 / Math.abs(line.curve[i]));
  return radius;
};

describe("Kraken Mare's Throat as a race world", () => {
  it('keeps its relief inside its box', () => {
    expect(reliefOutside(throatRelief, THROAT_GROUND_HALF, 1000)).toEqual([]);
  });

  it('lays a track of some 20 km from a start to a finish, every point of it 45 m over the open water of the strait', () => {
    const { points, gates } = THROAT_TRACK;
    const length = lengthOf(points);
    console.info(`the Throat's track: ${(length / KM).toFixed(1)} km, ${gates.length} gates`);
    expect(length).toBeGreaterThan(19 * KM);
    expect(gates[0]).toBeGreaterThan(0);
    expect(gates[gates.length - 1]).toBe(points.length - 1);
    for (const point of [...points, ...THROAT_TRACK.branches.flatMap((branch) => branch.points)]) {
      // over the open water, never over a bank, and on the ground's box
      expect(over(point), `${point.toArray()}`).toBe(0);
      expect(point.y - throatSea(point.x, point.z)).toBeCloseTo(TRACK_LIFT);
      expect(Math.abs(point.x)).toBeLessThan(THROAT_GROUND_HALF.x - 4000);
      expect(Math.abs(point.z)).toBeLessThan(THROAT_GROUND_HALF.z - 4000);
    }
  });

  it('bends in bends of their own: the Gate of 600 m, the Esses of 250 to 260 m, the Elbow of 255 m, the canyon no tighter than 280 m', () => {
    const leg = (k: number) => tightest(STRAIT, legStart(k), legStart(k + 1));
    expect(leg(BENDS.gate) / M).toBeCloseTo(600, -1);
    for (const k of [BENDS.esses - 2, BENDS.esses, BENDS.esses + 2]) {
      expect(leg(k) / M).toBeGreaterThan(245);
      expect(leg(k) / M).toBeLessThan(265);
    }
    expect(leg(BENDS.elbow) / M).toBeGreaterThan(245);
    expect(leg(BENDS.elbow) / M).toBeLessThan(265);
    expect(tightest(CANYON_LINE, 0, CANYON_LINE.x.length) / M).toBeGreaterThan(280);
    // the Esses, the Elbow and the canyon tighter than the autopilot turns at the limit in a vacuum, wider than in the Throat's air
    const air = { driveFactor: 1, thrusterFactor: 1, airDensity: densityIn(THROAT_AIR, THROAT_TRACK.points[0]) };
    const vacuum = { driveFactor: 1, thrusterFactor: 1 };
    for (const radius of [leg(BENDS.esses), leg(BENDS.elbow), tightest(CANYON_LINE, 0, CANYON_LINE.x.length)]) {
      expect(radius).toBeLessThan(turnRadius(MAX_SPEED, vacuum));
      expect(radius).toBeGreaterThan(turnRadius(MAX_SPEED, air));
    }
  });

  it('narrows between bluffs of 120 m and more, and cuts the canyon through the Mesa between walls of 300 m and more', () => {
    for (let i = legStart(BENDS.narrows); i < legStart(BENDS.narrows + 1); i += 20) {
      for (const side of [-1, 1]) {
        const beside = new THREE.Vector3(STRAIT.x[i] - STRAIT.tz[i] * side * STRAIT.width[i] * 1.6, 0, STRAIT.z[i] + STRAIT.tx[i] * side * STRAIT.width[i] * 1.6);
        expect(over(beside) / M, `narrows ${i} ${side}`).toBeGreaterThan(120);
      }
    }
    const n = CANYON_LINE.x.length;
    for (let i = Math.round(n * 0.25); i < n * 0.75; i += 20) {
      for (const side of [-1, 1]) {
        const beside = new THREE.Vector3(CANYON_LINE.x[i] - CANYON_LINE.tz[i] * side * 200 * M, 0, CANYON_LINE.z[i] + CANYON_LINE.tx[i] * side * 200 * M);
        expect(over(beside) / M, `canyon ${i} ${side}`).toBeGreaterThan(300);
      }
    }
  });

  it('banks sand up on the outside of the Elbow, not on its inside', () => {
    const i = Math.round((legStart(BENDS.elbow) + legStart(BENDS.elbow + 1)) / 2);
    const left = Math.sign(STRAIT.curve[i]);
    const at = (side: number) => new THREE.Vector3(STRAIT.x[i] - STRAIT.tz[i] * side * (STRAIT.width[i] + 30 * M), 0, STRAIT.z[i] + STRAIT.tx[i] * side * (STRAIT.width[i] + 30 * M));
    expect(over(at(-left))).toBeGreaterThan(over(at(left)) + 10 * M);
  });

  it('splits into a canyon some 900 m shorter than the Loop round the Mesa, its gates on either way 600 m apart or more', () => {
    const { points, branches } = THROAT_TRACK;
    expect(branches).toHaveLength(1);
    const [branch] = branches;
    const own = lengthOf(points.slice(branch.split, branch.join + 1));
    const way = lengthOf([points[branch.split], ...branch.points, points[branch.join]]);
    expect(own - way).toBeGreaterThan(KM * 0.8);
    expect(branch.gates.length).toBeGreaterThan(1);
    const stands = branch.gates.map(({ at }) => branch.points[at]);
    for (let k = 1; k < stands.length; k++) expect(stands[k].distanceTo(stands[k - 1])).toBeGreaterThan(600 * M);
  });

  it('flies in an air that holds the speed limit without burning the hull, clogs nothing, lifts as hard as the flight computer takes and shows 4.5 km and more', () => {
    const at = THROAT_TRACK.points[Math.floor(THROAT_TRACK.points.length / 2)];
    expect(densityIn(THROAT_AIR, at)).toBeGreaterThan(1);
    for (const height of [at.y, throatSea(at.x, at.z)]) expect(safeSpeed(THROAT_AIR, altitudeIn(THROAT_AIR, at.clone().setY(height)), RADIATE)).toBe(MAX_SPEED);
    expect(liftAt(densityIn(THROAT_AIR, at), MAX_SPEED)).toBeGreaterThanOrEqual(LIFT_MOST);
    expect(reachIn(THROAT_AIR, at, new THREE.Vector3(1, 0, 0), SIGHT_DEPTH, 20 * KM)).toBeGreaterThan(4.5 * KM);
  });

  it('never burns a hull racing at the limit, nor at the overdrive: its cold air carries heat off', () => {
    const hull = { flight: { position: THROAT_TRACK.points[40].clone(), velocity: new THREE.Vector3(MAX_SPEED, 0, 0) }, perks: { fins: 2 }, finSpin: new THREE.Vector3(), clog: 0, heat: 0, overheated: false, cooling: RADIATE };
    const step = 1 / 60;
    let burnt = 0;
    for (let t = 0; t < 150; t += step) {
      burnt += airStep(hull, THROAT_AIR, step, MAX_HEAT);
      hull.heat = Math.max(0, hull.heat - hull.cooling * step);
    }
    expect(hull.clog).toBe(0);
    expect(burnt).toBe(0);
    // two shoves 8 s apart: 450 m/s, the drag bringing the ship back to the limit in some 3 s each
    for (let t = 0; t < 16; t += step) {
      const since = t % 8;
      hull.flight.velocity.x = since < 3 ? MAX_SPEED * (1.8 - (0.8 * since) / 3) : MAX_SPEED;
      burnt += airStep(hull, THROAT_AIR, step, MAX_HEAT);
      hull.heat = Math.max(0, hull.heat - hull.cooling * step);
    }
    expect(burnt).toBe(0);
  });

  it('stands its landmarks clear of the track: the arches high over it and over its gates, the rest beside it', () => {
    const { points, branches } = THROAT_TRACK;
    const all = [...points, ...branches.flatMap((branch) => branch.points)];
    const halves = { rig: RIG_HALF, sign: SIGN_HALF, arch: ARCH_HALF, tower: BEACON_HALF, wreck: WRECK_HALF };
    for (const mark of LANDMARKS) {
      const half = halves[mark.kind];
      const reach = Math.max(half.x, half.z);
      const nearest = Math.min(...all.map((p) => Math.sqrt((p.x - mark.position.x) * (p.x - mark.position.x) + (p.z - mark.position.z) * (p.z - mark.position.z))));
      if (mark.kind === 'arch') {
        // over the water: its underside 110 m over the sea, the gates' rings nowhere under it
        expect(mark.position.y - half.y - throatSea(mark.position.x, mark.position.z)).toBeCloseTo(ARCH_CLEARANCE);
        for (const gate of THROAT_TRACK.gates) {
          const g = points[gate];
          expect(Math.sqrt((g.x - mark.position.x) * (g.x - mark.position.x) + (g.z - mark.position.z) * (g.z - mark.position.z)), `gate ${gate}`).toBeGreaterThan(ARCH_HALF.z + 60 * M);
        }
        // a ship on the line passes 65 m under it
        expect(ARCH_CLEARANCE - TRACK_LIFT).toBeGreaterThan(60 * M);
      } else expect(nearest - reach, mark.kind).toBeGreaterThan(80 * M);
    }
  });

  it('stands its gates 1 km apart or more, the first the start and the last the finish', () => expectGatesApart(raceWorld('throat').course));

  it('prints a grid and new clones over the water, clear of the banks, along the track', () => expectStartsClear('throat', (at) => at.y - throatGround(at.x, at.z)));
});
