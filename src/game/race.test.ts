import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Course, GATE_RADIUS, GATES, modeOfRound } from './race';
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
      expect(blocked.length, arena.id).toBeLessThanOrEqual(1);
    }
  });

  it('counts a gate either way, but only inside its ring', () => {
    const c = course();
    const gate = c.points[0];
    const normal = c.normals[0];
    const before = gate.clone().addScaledVector(normal, -500);
    const after = gate.clone().addScaledVector(normal, 500);
    expect(c.crossed(0, before, after)).toBe(true);
    expect(c.crossed(0, after, before)).toBe(true);
    expect(c.crossed(0, before, before.clone().addScaledVector(normal, 400))).toBe(false);
    const side = new THREE.Vector3(0, 1, 0).cross(normal).normalize().multiplyScalar(GATE_RADIUS * 1.5);
    expect(c.crossed(0, before.clone().add(side), after.clone().add(side))).toBe(false);
  });
});

describe('the mode of a round', () => {
  it('follows the room: one mode, or both in turn starting with a deathmatch', () => {
    expect(modeOfRound('race', 3)).toBe('race');
    expect(modeOfRound('deathmatch', 3)).toBe('deathmatch');
    expect([0, 1, 2, 3].map((round) => modeOfRound('mixed', round))).toEqual(['deathmatch', 'race', 'deathmatch', 'race']);
  });
});
