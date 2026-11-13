import * as THREE from 'three';
import { expect } from 'vitest';
import { arenaById } from '../world/arenas';
import { testField } from './field';
import { Course } from '../game/race';
import { SHIP_RADIUS } from './pilot';

/** A race world's field and its course (see RACE_WORLDS in world/arenas), the field fresh. */
export function raceWorld(id: string): { field: ReturnType<typeof testField>; course: Course } {
  const world = arenaById(id)!;
  const field = testField();
  field.generate(world.layout);
  return { field, course: new Course(field, world.layout.seed) };
}

/** A track's course is one run from its start to its finish, its gates 1 km apart or more. */
export function expectGatesApart(course: Course): void {
  expect(course.track).toBe(true);
  expect(course.laps).toBe(1);
  expect(course.finishGates).toBe(course.count);
  for (let i = 1; i < course.count; i++) expect(course.points[i].distanceTo(course.points[i - 1]), `gate ${i}`).toBeGreaterThan(20000);
}

/** Every slot of the grid and every clone printed again along the track lies clear of the field, and as far over the ground as `over` says (units, by where it is). */
export function expectStartsClear(id: string, over: (at: THREE.Vector3) => number = () => Infinity): void {
  const { field, course } = raceWorld(id);
  const at = new THREE.Vector3();
  for (let passed = 0; passed < course.count; passed++) {
    for (let slot = 0; slot < 8; slot++) {
      course.startOf(passed, slot, at);
      expect(field.overlap(at, SHIP_RADIUS), `passed ${passed} slot ${slot}`).toBeFalsy();
      expect(over(at), `passed ${passed} slot ${slot}`).toBeGreaterThan(SHIP_RADIUS);
    }
  }
}
