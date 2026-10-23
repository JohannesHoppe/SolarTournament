import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOST_RADIUS, Course, GATE_RADIUS, GATES } from './race';
import { RACE_SPEED } from '../ship/bots';
import { COIL_COURSE, CORE_SHARE, COURSE_ROOM, RING_COURSE, RING_RADIUS, ringCourse } from './school';
import { ARENA_LIMIT } from '../world/arena';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { flyRings } from '../test/pilot';
import { RacingLine } from './racingline';
import { DETAIL } from '../world/rocks';

/** The rocks as the game collides with them: their reach decides where gates lie and how the line bows. */
const gameField = () => testField(DETAIL);

/**
 * Plausibility: every course has to be flyable by a bot of middling skill (0.5) at the pace of
 * a tournament race. What such a bot cannot fly, a Host will not fly either.
 */
const SKILL = 0.5;

describe('every race course', () => {
  for (const arena of ARENAS) {
    it(`is flown by a middling bot in ${arena.id}: a lap through every gate without a crash, in time`, () => {
      const field = gameField();
      field.generate(arena.layout);
      const course = new Course(field, arena.layout.seed);
      // a lap: every gate in turn, and the pink one again
      const lap = [...course.points, course.points[0]];
      const normals = [...course.normals, course.normals[0]];
      const start = course.startOf(0, 0, new THREE.Vector3());
      const flight = flyRings(field, { points: lap, normals, radius: GATE_RADIUS, core: BOOST_RADIUS, line: course.line }, start, course.normals[0], SKILL, RACE_SPEED, 90);
      expect(flight.crashed, `crashed after gate ${flight.passed}`).toBe(false);
      expect(flight.passed, `${flight.passed} of ${GATES + 1} gates in ${flight.seconds.toFixed(0)} s`).toBe(GATES + 1);
    });
  }
});

describe("the flight school's ring courses", () => {
  // the pilot starts at rest: in the middle, and at the arena's edge with its nose outwards
  const starts = [
    { name: 'from the middle', position: new THREE.Vector3(0, 0, 0), facing: new THREE.Vector3(0, 0, -1) },
    { name: 'from the edge, facing out', position: new THREE.Vector3(ARENA_LIMIT * 0.9, 0, 0), facing: new THREE.Vector3(1, 0, 0) },
  ];
  for (const [drill, layout, core] of [['ring', RING_COURSE, false], ['coil', COIL_COURSE, true]] as const) {
    for (const start of starts) {
      it(`lays the ${drill} drill inside the arena and lets a middling bot fly it ${start.name}`, () => {
        const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(start.position, start.facing.clone().add(start.position), new THREE.Vector3(0, 1, 0)));
        const points = ringCourse(start.position, turn, layout);
        for (const point of points) expect(point.length()).toBeLessThan(ARENA_LIMIT * COURSE_ROOM);
        const normals = points.map((point, i) => point.clone().sub(i === 0 ? start.position : points[i - 1]).normalize());
        // the game lays the rings clear of rock; here they fly in empty space
        const line = new RacingLine(points, false, start.position);
        const flight = flyRings(gameField(), { points, normals, radius: RING_RADIUS, core: RING_RADIUS * CORE_SHARE, line }, start.position, start.facing, SKILL, RACE_SPEED, 60);
        expect(flight.passed, `${flight.passed} of ${points.length} rings in ${flight.seconds.toFixed(0)} s`).toBe(points.length);
        // the coil drill wants every ring through its core
        if (core) for (const off of flight.offs) expect(off).toBeLessThan(RING_RADIUS * CORE_SHARE);
      });
    }
  }
});
