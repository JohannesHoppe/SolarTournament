import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOST_RADIUS, canSkip, Course, GATE_RADIUS, GATES, lapOf, modeOfRound, ROUND_MODES, takesStart } from './race';
import { ARENAS, RACE_ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { MAX_SPEED, turnRadius } from '../ship/flight';
import { bendRadius } from './racingline';
import { densityIn } from '../world/air';
import { touchRing } from '../world/gates';

const course = (arena = ARENAS[0]) => {
  const field = testField();
  field.generate(arena.layout);
  return new Course(field, arena.layout.seed);
};

/** A short hash per arena of the numbers `read` takes from its course, each arena's field fresh. */
function hashPerArena(read: (field: ReturnType<typeof testField>, course: Course, v: THREE.Vector3) => number[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  const v = new THREE.Vector3();
  for (const arena of RACE_ARENAS) {
    const field = testField();
    field.generate(arena.layout);
    hashes[arena.id] = createHash('sha256').update(Float64Array.from(read(field, new Course(field, arena.layout.seed), v))).digest('hex').slice(0, 16);
  }
  return hashes;
}

describe('the race course', () => {
  it('is the same on every browser for the same arena', () => {
    const a = course();
    const b = course();
    expect(a.points.map((p) => p.toArray())).toEqual(b.points.map((p) => p.toArray()));
    expect(a.points).toHaveLength(GATES);
  });

  it('lays out the very same course in every arena, gates and racing line to the last bit', () => {
    const hashes = hashPerArena((field, { points, line }, v) => {
      const values: number[] = points.flatMap((p) => p.toArray());
      for (let s = 0; s < line.length; s += 400) values.push(...line.clear(s, field, v).toArray());
      return values;
    });
    expect(hashes).toEqual({
      belt: '4548275b53de3c4b',
      rings: '12b7d627ea098b9b',
      junkyard: 'd0509f083fbedab3',
      giant: '1cd64decf1861ab0',
      derelict: 'b85ad9dcd96b2eef',
      crack: '10f331ef438e512c',
      throat: '5c8c7ac694c3203c',
    });
  });

  it('bows its racing line around the rock the same way as the field moves on, to the last bit', () => {
    const hashes = hashPerArena((field, { line }, v) => {
      const values: number[] = [];
      for (const time of [0, 0.5, 40, 41, 120, 300]) {
        field.setClock(time);
        for (let s = 0; s < line.length; s += 500) values.push(...line.clear(s, field, v).toArray());
      }
      return values;
    });
    expect(hashes).toEqual({
      belt: '4798c06b4f2eeae4',
      rings: '3624f8ed4b4a7158',
      junkyard: '20234dbcd0ce36e1',
      giant: '72a8e02d41a0854f',
      derelict: '777d0a716818840b',
      crack: '9596d7592bb9a672',
      throat: '4ab2c884b68d6e2e',
    });
  });

  it("dives through the Rings of Saturn's layer of grains, its gates above, within and below it", () => {
    const rings = ARENAS.find((arena) => arena.id === 'rings')!;
    const layer = rings.grains!;
    const heights = course(rings).points.map((point) => point.y);
    expect(heights.some((y) => y > layer)).toBe(true);
    expect(heights.some((y) => y < -layer)).toBe(true);
    expect(heights.some((y) => Math.abs(y) < layer)).toBe(true);
  });

  it('keeps its gates clear of rock as the field starts out', () => {
    for (const arena of ARENAS) {
      const field = testField();
      field.generate(arena.layout);
      const gates = new Course(field, arena.layout.seed);
      const blocked = gates.points.filter((point) => field.overlap(point, GATE_RADIUS));
      expect(blocked.length, arena.id).toBe(0);
    }
  });

  it("starts a racer's new clone clear of the gate it passed, of its housings and of rock, past its plane", () => {
    // a ship's hit radius (17 m)
    const ship = 340;
    for (const arena of ARENAS) {
      const field = testField();
      field.generate(arena.layout);
      const gates = new Course(field, arena.layout.seed);
      for (let passed = 1; passed <= GATES; passed++) {
        const gate = passed - 1;
        for (let slot = 0; slot < 8; slot++) {
          const at = gates.startOf(passed, slot, new THREE.Vector3());
          expect(touchRing(gates.points[gate], gates.normals[gate], GATE_RADIUS, at.clone(), ship, new THREE.Vector3()), `${arena.id} gate ${gate} slot ${slot}`).toBe(false);
          expect(field.overlap(at, ship), `${arena.id} gate ${gate} slot ${slot}`).toBeFalsy();
          expect(at.clone().sub(gates.points[gate]).dot(gates.normals[gate])).toBeGreaterThan(0);
        }
      }
    }
  });

  it('counts a gate either way, but only inside its ring', () => {
    const c = course();
    const gate = c.points[0];
    const normal = c.normals[0];
    const before = gate.clone().addScaledVector(normal, -500);
    const after = gate.clone().addScaledVector(normal, 500);
    expect(c.crossing(0, before, after)).toBeCloseTo(0);
    expect(c.crossing(0, after, before)).toBeCloseTo(0);
    expect(c.crossing(0, before, before.clone().addScaledVector(normal, 400))).toBeNull();
    const side = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    expect(c.crossing(0, before.clone().addScaledVector(side, GATE_RADIUS * 1.5), after.clone().addScaledVector(side, GATE_RADIUS * 1.5))).toBeNull();
    // how far off the center it went through decides whether the coil fires
    expect(c.crossing(0, before.clone().addScaledVector(side, BOOST_RADIUS / 2), after.clone().addScaledVector(side, BOOST_RADIUS / 2))).toBeCloseTo(BOOST_RADIUS / 2);
    expect(c.crossing(0, before.clone().addScaledVector(side, BOOST_RADIUS * 2), after.clone().addScaledVector(side, BOOST_RADIUS * 2))!).toBeGreaterThan(BOOST_RADIUS);
  });

  it('bends gently enough everywhere to be flown at the speed limit with the autopilot, in an air with its lift', () => {
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const arena of RACE_ARENAS) {
      // the line bots fly and the HUD shows: the loop bowed around the field's rock
      const field = testField();
      field.generate(arena.layout);
      const { line } = new Course(field, arena.layout.seed);
      let worst = Infinity;
      for (let s = 0; s < line.length; s += 400) {
        const bend = bendRadius(line.clear(s - 1000, field, a), line.clear(s, field, b), line.clear(s + 1000, field, c));
        // a quarter more room than the tightest turn at the limit in the air there, for a pilot who is not perfect
        const tightest = turnRadius(MAX_SPEED, { driveFactor: 1, thrusterFactor: 1, airDensity: densityIn(field.air, b) }) * 1.25;
        worst = Math.min(worst, bend / tightest);
      }
      expect(worst, arena.id).toBeGreaterThan(1);
    }
  });

  it('bends in the Throat where only the air carves a ship round at the speed limit', () => {
    // its tightest bend: tighter than the autopilot turns at the limit without air, wider than with Titan's
    const throat = RACE_ARENAS.find((arena) => arena.id === 'throat')!;
    const field = testField();
    field.generate(throat.layout);
    const { line } = new Course(field, throat.layout.seed);
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let least = Infinity;
    for (let s = 0; s < line.length; s += 400) least = Math.min(least, bendRadius(line.clear(s - 1000, field, a), line.clear(s, field, b), line.clear(s + 1000, field, c)));
    expect(least).toBeLessThan(turnRadius(MAX_SPEED));
  });
});

describe('the mode of a round', () => {
  it('follows the room: one mode, or every mode in turn starting with a deathmatch', () => {
    expect(modeOfRound('race', 3)).toBe('race');
    expect(modeOfRound('deathmatch', 3)).toBe('deathmatch');
    const turns = ROUND_MODES.map((_, round) => modeOfRound('mixed', round));
    expect(turns[0]).toBe('deathmatch');
    expect(new Set(turns)).toEqual(new Set(ROUND_MODES));
    expect(modeOfRound('mixed', ROUND_MODES.length)).toBe('deathmatch');
  });
});

describe('the start of a round', () => {
  it('online, is kept once known: the lead smooths it by a jitter, but an end it brings forward never moves it', () => {
    // the first clock of a round names its start
    expect(takesStart(true, null, 100, 0.25)).toBe(true);
    expect(takesStart(true, 100, 100.1, 0.25)).toBe(true);
    // a race all finished, a side that won: the end comes 200 s sooner, the start stays
    expect(takesStart(true, 100, -100, 0.25)).toBe(false);
    expect(takesStart(true, 100, 130, 0.25)).toBe(false);
  });

  it('solo, follows the end: a pause or a skipped intro moves both', () => {
    expect(takesStart(false, 100, 160, 0.25)).toBe(true);
  });
});

describe('leaving a gate out', () => {
  it('allows one skip a lap, never the pink gate, and a new one in the next lap', () => {
    // in lap 1 (gates 1..8 passed means the next is gate 2..8, then the pink one)
    expect(canSkip(1, -1)).toBe(true);
    expect(canSkip(5, -1)).toBe(true);
    // the pink gate (next index 0) starts and counts the laps: never left out
    expect(canSkip(0, -1)).toBe(false);
    expect(canSkip(GATES, -1)).toBe(false);
    // spent in lap 1: no second skip in it, a fresh one in lap 2
    expect(canSkip(3, lapOf(3))).toBe(false);
    expect(canSkip(GATES + 2, lapOf(3))).toBe(true);
  });
});
