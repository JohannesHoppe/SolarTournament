import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOST_RADIUS, Course, GATE_RADIUS, GATES, modeOfRound, ROUND_MODES } from './race';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';

const course = (arena = ARENAS[0]) => {
  const field = testField();
  field.generate(arena.layout);
  return new Course(field, arena.layout.seed);
};

describe('the race course', () => {
  it('is the same on every browser for the same arena', () => {
    const a = course();
    const b = course();
    expect(a.points.map((p) => p.toArray())).toEqual(b.points.map((p) => p.toArray()));
    expect(a.points).toHaveLength(GATES);
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

  it('weaves in and out of the thick of the field', () => {
    const distances = course().points.map((p) => Math.hypot(p.x, p.z));
    const inner = distances.filter((_, i) => i % 2 === 1);
    const outer = distances.filter((_, i) => i % 2 === 0);
    expect(Math.max(...inner)).toBeLessThan(Math.min(...outer));
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
