import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOST_PUSH, BOOST_RADIUS, Course, GATE_RADIUS, GATES } from './race';
import { RACE_SPEED } from '../ship/bots';
import { cornerSpeed, MAX_SPEED, turnRadius } from '../ship/flight';
import { BRAKE_COURSE, COIL_COURSE, CORE_SHARE, COURSE_ROOM, CURVE_COURSE, CURVE_SPEED, CURVE_ZONE, LINE_COURSE, LINE_PACE, COVER_DRONE, COVER_STANDOFF, coverSpots, facingRock, LINE_SPARE, RING_COURSE, RING_RADIUS, ringCourse, SLIDE_ANGLE, SLIDE_BOT, SLIDE_HITS, SLIDE_SPEED } from './school';
import { ARENA_LIMIT } from '../world/arena';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { flyRings, SHIP_RADIUS } from '../test/pilot';
import { bendRadius, RacingLine } from './racingline';
import { DETAIL } from '../world/rocks';
import { flyTorpedo, strikes, TORPEDO_LAUNCH, TORPEDO_LIFETIME, TORPEDO_RADIUS } from './torpedoes';

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

describe("every race course's racing line", () => {
  for (const arena of ARENAS) {
    it(`runs without stray points in ${arena.id}: two points 10 m apart along it lie within 100 m`, () => {
      const field = gameField();
      field.generate(arena.layout);
      const line = new Course(field, arena.layout.seed).line;
      const here = new THREE.Vector3();
      const there = new THREE.Vector3();
      const strays: number[] = [];
      for (let s = 0; s < line.length; s += 200) {
        line.clear(s, field, here);
        line.clear(s + 200, field, there);
        if (here.distanceTo(there) > 2000) strays.push(Math.round(s / 20));
      }
      expect(strays, 'meters along the line').toEqual([]);
    });
  }
});

/** The tightest bend of a line (units, radius), measured as the racing line's brake zones measure it: over 60 m to either side of every point 20 m apart. */
function tightest(line: RacingLine): number {
  const before = new THREE.Vector3();
  const here = new THREE.Vector3();
  const after = new THREE.Vector3();
  let radius = Infinity;
  for (let s = 1200; s < line.length - 1200; s += 400) radius = Math.min(radius, bendRadius(line.point(s - 1200, before), line.point(s, here), line.point(s + 1200, after)));
  return radius;
}

/** The racing line of a course in the pilot's frame, flown from its origin. */
const lineOf = (layout: readonly (readonly [number, number, number])[]) => new RacingLine(layout.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, new THREE.Vector3());

describe("the flight school's courses", () => {
  // the pilot starts in the middle, and at the arena's edge with its nose outwards; a drill that
  // starts the pilot drifting, or at rest facing the course, turns it to the first ring or marker
  const starts = [
    { name: 'from the middle', position: new THREE.Vector3(0, 0, 0), facing: new THREE.Vector3(0, 0, -1) },
    { name: 'from the edge, facing out', position: new THREE.Vector3(ARENA_LIMIT * 0.9, 0, 0), facing: new THREE.Vector3(1, 0, 0) },
  ];
  const drills = [
    // the curve: the bot at the drill's speed through every marker's sphere (crossing the plane square to the way there inside it passes within it)
    { drill: 'curve', layout: CURVE_COURSE, radius: CURVE_ZONE, core: 0, speed: CURVE_SPEED, drift: CURVE_SPEED, seconds: 60 },
    { drill: 'ring', layout: RING_COURSE, radius: RING_RADIUS, core: 0, speed: RACE_SPEED, drift: null, seconds: 60 },
    { drill: 'coil', layout: COIL_COURSE, radius: RING_RADIUS, core: RING_RADIUS * CORE_SHARE, speed: RACE_SPEED, drift: null, seconds: 60 },
    { drill: 'brake', layout: BRAKE_COURSE, radius: RING_RADIUS, core: 0, speed: RACE_SPEED, drift: MAX_SPEED, seconds: 60 },
    // the full-speed drill: within its time, which the line's length sets
    { drill: 'full-speed', layout: LINE_COURSE, radius: RING_RADIUS, core: BOOST_RADIUS, speed: RACE_SPEED, drift: 0, seconds: 0 },
  ];
  for (const { drill, layout, radius, core, speed, drift, seconds } of drills) {
    for (const start of starts) {
      it(`lays the ${drill} drill inside the arena and lets a middling bot fly it ${start.name}, missing nothing`, () => {
        const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(start.position, start.facing.clone().add(start.position), new THREE.Vector3(0, 1, 0)));
        const points = ringCourse(start.position, turn, layout);
        for (const point of points) expect(point.length()).toBeLessThan(ARENA_LIMIT * COURSE_ROOM);
        const normals = points.map((point, i) => point.clone().sub(i === 0 ? start.position : points[i - 1]).normalize());
        // the game lays the rings clear of rock; here they fly in empty space
        const line = new RacingLine(points, false, start.position);
        const facing = drift !== null ? normals[0] : start.facing;
        const limit = seconds || line.length / LINE_PACE + LINE_SPARE;
        const flight = flyRings(gameField(), { points, normals, radius, core, line, open: drill === 'curve' }, start.position, facing, SKILL, speed, limit, drift ?? 0);
        expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(0)} of ${limit.toFixed(0)} s`).toBe(points.length);
        expect(flight.missed).toBe(0);
        // the coil drill wants every ring through its core
        if (drill === 'coil') for (const off of flight.offs) expect(off).toBeLessThan(RING_RADIUS * CORE_SHARE);
      });
    }
  }

  it('bends the brake drill tighter than path steering turns at the speed limit, so its racing line glows orange there', () => {
    const line = lineOf(BRAKE_COURSE);
    expect(turnRadius(MAX_SPEED)).toBeGreaterThan(tightest(line));
    expect(cornerSpeed(tightest(line))).toBeLessThan(MAX_SPEED * 0.95);
  });

  it('bends the full-speed drill no tighter than path steering turns at the speed limit plus a coil, and the curve no tighter than at the speed limit', () => {
    expect(cornerSpeed(tightest(lineOf(LINE_COURSE)))).toBeGreaterThan(MAX_SPEED + BOOST_PUSH);
    expect(cornerSpeed(tightest(lineOf(CURVE_COURSE)))).toBeGreaterThan(MAX_SPEED);
  });

  it('lets the slide shot drill fire sideways: drifting past the bot, it lies within 1 km and more than 60° off the flight for seconds', () => {
    const bot = new THREE.Vector3(...SLIDE_BOT);
    const pilot = new THREE.Vector3();
    const flight = new THREE.Vector3(0, 0, -SLIDE_SPEED);
    let seconds = 0;
    for (let t = 0; t < 30; t += 0.1) {
      pilot.copy(flight).multiplyScalar(t);
      const toBot = bot.clone().sub(pilot);
      if (toBot.length() < 20000 && toBot.angleTo(flight) > SLIDE_ANGLE) seconds += 0.1;
    }
    expect(seconds).toBeGreaterThan(SLIDE_HITS);
  });

  it('sends the cover drill’s torpedo at a pilot sitting still in about 6 s', () => {
    const pilot = { position: new THREE.Vector3(), velocity: new THREE.Vector3() };
    const torpedo = { position: new THREE.Vector3(COVER_DRONE, 0, 0), velocity: new THREE.Vector3(-TORPEDO_LAUNCH, 0, 0), push: new THREE.Vector3(), seen: new THREE.Vector3() };
    let seconds = 0;
    while (torpedo.position.length() > SHIP_RADIUS && seconds < TORPEDO_LIFETIME) {
      flyTorpedo(torpedo, pilot, 1 / 60);
      seconds += 1 / 60;
    }
    expect(seconds).toBeGreaterThan(5.5);
    expect(seconds).toBeLessThan(7);
  });

  it('lets a middling bot reach cover from the cover drill’s torpedo behind every rock near the middle of the belt, before it hits', () => {
    const field = gameField();
    field.generate(ARENAS.find((arena) => arena.id === 'belt')!.layout);
    const start = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const rocks = [...field.asteroids.values()].sort((p, q) => p.object.position.length() - q.object.position.length());
    const outcomes: string[] = [];
    let tried = 0;
    for (const rock of rocks) {
      if (tried === 8) break;
      if (!facingRock(field, rock, COVER_STANDOFF, SHIP_RADIUS * 4, start, outward)) continue;
      const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(start, rock.object.position, new THREE.Vector3(0, 1, 0)));
      const { lee, gunner } = coverSpots(rock, start, orientation, COVER_DRONE);
      // a drone that starts in rock or out of sight asks nothing of the pilot
      if (field.overlap(gunner, 2000) || !field.lineOfSight(gunner, start)) continue;
      tried++;
      const torpedo = { position: gunner.clone(), velocity: start.clone().sub(gunner).setLength(TORPEDO_LAUNCH), push: new THREE.Vector3(), seen: new THREE.Vector3() };
      const before = new THREE.Vector3();
      let outcome = 'neither';
      let time = 0;
      const toLee = lee.clone().sub(start).normalize();
      // the bot dashes for the lee as for a ring there; the torpedo homes on it until a rock is between them
      flyRings(field, { points: [lee], normals: [toLee], radius: RING_RADIUS, core: 0, line: new RacingLine([lee], false, start) }, start.clone(), outward, SKILL, RACE_SPEED, TORPEDO_LIFETIME, 0, (flight, step) => {
        time += step;
        before.copy(torpedo.position);
        flyTorpedo(torpedo, flight, step);
        if (strikes(before, torpedo.position, flight, SHIP_RADIUS, step)) outcome = 'hit';
        else if (!field.lineOfSight(torpedo.position, flight.position) || field.overlap(torpedo.position, TORPEDO_RADIUS)) outcome = 'covered';
        return outcome !== 'neither';
      });
      outcomes.push(`${outcome} after ${time.toFixed(1)} s behind a rock of ${Math.round(rock.radius / 20)} m`);
    }
    expect(tried).toBe(8);
    expect(outcomes.filter((outcome) => !outcome.startsWith('covered')), outcomes.join('; ')).toEqual([]);
  });
});
