import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import { angleTo } from '../detthree';
import { describe, expect, it } from 'vitest';
import { BOOST_PUSH, BOOST_RADIUS, Course, COURSE_ROOM, GATE_RADIUS } from './race';
import { Bot, evenSkills, RACE_SPEED } from '../ship/bots';
import { cornerSpeed, MAIN_THRUST, MAX_SPEED, OVERDRIVE_DRIVE_COOLDOWN, OVERDRIVE_PUSH, OVERDRIVE_SECONDS, overdriveShove, overdriveStep, turnRadius } from '../ship/flight';
import { wellEscape } from './alarms';
import { BRAKE_COURSE, COIL_COURSE, CORE_SHARE, CURVE_COURSE, CURVE_SPEED, CURVE_ZONE, LINE_COURSE, LINE_PACE, COVER_DRONE, COVER_STANDOFF, coverSpots, facingRock, LINE_SPARE, ORBIT_DRIFT, ORBIT_NOSE, ORBIT_START, ORBIT_SWEEP, RESCUE_DRIVE, RESCUE_START, rescueFree, RING_COURSE, RING_RADIUS, ringCourse, SLIDE_ANGLE, SLIDE_BOT, SLIDE_HITS, SLIDE_SPEED, clearOfRock } from './school';
import { ARENA_LIMIT } from '../world/arena';
import { arenaById, DEFAULT_ARENA, RACE_ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { flyCourse, flyRings, SHIP_RADIUS, startFlight } from '../test/pilot';
import { type Orbit, type OrbitState, readOrbit, wellMu } from './orbit';
import { IDLE } from '../input/input';
import type { Ship } from '../ship/ship';
import { bendRadius, RacingLine } from './racingline';
import { DETAIL } from '../world/rocks';
import { flyTorpedo, strikes, TORPEDO_LAUNCH, TORPEDO_LIFETIME, TORPEDO_RADIUS } from './torpedoes';

/** The rocks as the game collides with them: their reach decides where gates lie and how the line bows. */
const gameField = () => testField(DETAIL);
const scratch = new THREE.Vector3();

/**
 * Plausibility: every course has to be flyable by a bot of middling skill (0.5) at the pace of
 * a tournament race. What such a bot cannot fly, a Host will not fly either.
 */
const SKILL = 0.5;
/** A track from a start to a finish over a world (some 26 km) is given this long (s): flown at a race's pace with its bends, climbs and the time to get up to speed. */
const TRACK_TIME = 160;

describe('every race course', () => {
  for (const arena of RACE_ARENAS) {
    // a track's every way through its branches (see Course.branches), each flown whole
    const branches = arena.layout.course?.form === 'track' ? (arena.layout.course.branches?.length ?? 0) : 0;
    for (let ways = 0; ways < 1 << branches; ways++) {
      const way = branches ? ` on the ways ${ways.toString(2).padStart(branches, '0')} through its branches` : '';
      it(`is flown by a middling bot in ${arena.id}${way}: a lap through every gate without a crash, in time`, () => {
        const field = gameField();
        field.generate(arena.layout);
        const course = new Course(field, arena.layout.seed);
        // a lap: every gate in turn, and the pink one again; on a track from the start to the finish
        const lap = course.lap(ways);
        const start = course.startOf(0, 0, new THREE.Vector3());
        const flight = flyRings(field, { ...lap, radius: GATE_RADIUS, core: BOOST_RADIUS, line: course.lineOf(ways) }, start, course.startHeading(0, new THREE.Vector3()), SKILL, RACE_SPEED, course.track ? TRACK_TIME : 90);
        if (branches) console.info(`${arena.id}, ways ${ways}: ${flight.passed} gates in ${flight.seconds.toFixed(0)} s`);
        expect(flight.crashed, `crashed after gate ${flight.passed}`).toBe(false);
        expect(flight.passed, `${flight.passed} of ${lap.points.length} gates in ${flight.seconds.toFixed(0)} s`).toBe(lap.points.length);
      });
    }
  }
});

describe("every race course's racing line", () => {
  for (const arena of RACE_ARENAS) {
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

    // a race world has no edge: its track keeps over its ground (see world/crack.test)
    if (!arena.open) it(`stays inside the arena in ${arena.id}: within COURSE_ROOM of its edge`, () => {
      const field = gameField();
      field.generate(arena.layout);
      const course = new Course(field, arena.layout.seed);
      for (const point of course.points) expect(point.length()).toBeLessThan(ARENA_LIMIT * COURSE_ROOM);
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
      it(`lays the ${drill} drill inside the ${DEFAULT_ARENA.id} arena and lets a middling bot fly it ${start.name}, missing nothing`, () => {
        // the flight school's arena, its rock as it starts out; the pilot where no rock is
        const field = gameField();
        field.generate(DEFAULT_ARENA.layout);
        const position = clearOfRock(field, start.position.clone(), SHIP_RADIUS * 3);
        const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, start.facing.clone().add(position), new THREE.Vector3(0, 1, 0)));
        // the rings laid clear of rock, as the game lays them
        const points = ringCourse(position, turn, layout, field).map((point) => clearOfRock(field, point, drill === 'curve' ? CURVE_ZONE / 2 : RING_RADIUS * 1.5));
        for (const point of points) expect(point.length()).toBeLessThan(ARENA_LIMIT * COURSE_ROOM);
        const normals = points.map((point, i) => point.clone().sub(i === 0 ? position : points[i - 1]).normalize());
        const line = new RacingLine(points, false, position);
        const facing = drift !== null ? normals[0] : start.facing;
        const limit = seconds || line.length / LINE_PACE + LINE_SPARE;
        const flight = flyRings(field, { points, normals, radius, core, line, open: drill === 'curve' }, position, facing, SKILL, speed, limit, drift ?? 0);
        expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(0)} of ${limit.toFixed(0)} s`).toBe(points.length);
        expect(flight.missed).toBe(0);
        // the coil drill wants every ring through its core
        if (drill === 'coil') for (const off of flight.offs) expect(off).toBeLessThan(RING_RADIUS * CORE_SHARE);
      });
    }
  }

  it('bends the brake drill tighter than the autopilot turns at the speed limit, so its racing line glows orange there', () => {
    const line = lineOf(BRAKE_COURSE);
    expect(turnRadius(MAX_SPEED)).toBeGreaterThan(tightest(line));
    expect(cornerSpeed(tightest(line))).toBeLessThan(MAX_SPEED * 0.95);
  });

  it('bends the full-speed drill no tighter than the autopilot turns at the speed limit plus a coil, and the curve no tighter than at the speed limit', () => {
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
      if (toBot.length() < 20000 && angleTo(toBot, flight) > SLIDE_ANGLE) seconds += 0.1;
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

  it(`lets a middling bot reach cover from the cover drill’s torpedo behind every rock near the middle of the ${DEFAULT_ARENA.id} arena, before it hits`, () => {
    const field = gameField();
    field.generate(DEFAULT_ARENA.layout);
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

  it('lets a middling bot fly the orbit drill at the Event Horizon: from the drill’s start to ORBIT READY, then half a turn about the hole in free drift, stable all the way', () => {
    const field = gameField();
    field.generate(arenaById('hole')!.layout);
    const well = field.well!;
    const start = well.position.clone().add(ORBIT_START);
    const flight = startFlight(start, ORBIT_NOSE, ORBIT_DRIFT);
    // the ship as the bot reads it, its drive whole
    const ship = { id: 'pilot', flight, radius: SHIP_RADIUS, alive: true, protectedUntil: 0, strain: 0, heat: 0, drive: 1, cooling: 1, allyOf: () => false } as unknown as Ship;
    const bot = new Bot(ship, evenSkills(SKILL));
    // it flies the circle it starts on at the speed of a circular orbit there, for a point 30° ahead on it
    const radius = ORBIT_START.length();
    bot.raceSpeed = Math.sqrt(wellMu(well) / radius);
    const ahead = new THREE.Vector3();
    const arm = new THREE.Vector3();
    const before = start.clone();
    const reading: Orbit = { periapsis: 0, apoapsis: 0, circular: 0, radial: 0 };
    let state: OrbitState = 'falls';
    let readyAt = -1;
    let seconds = 0;
    let swept = 0;
    const broken: string[] = [];
    // no ring to fly: one far beyond the arena that the flight never reaches
    const nowhere = new THREE.Vector3(0, 0, ARENA_LIMIT * 3);
    const rings = { points: [nowhere], normals: [new THREE.Vector3(0, 0, 1)], radius: 1, core: 0, line: new RacingLine([nowhere], false, start) };
    const result = flyCourse(
      field,
      rings,
      flight,
      (flight, _, time) => {
        // free drift once the readout says ready: the hand off every control
        if (readyAt >= 0) return IDLE;
        arm.subVectors(flight.position, well.position);
        const angle = atan2(arm.x, arm.y) + Math.PI / 6;
        bot.waypoint = ahead.set(sin(angle) * radius, cos(angle) * radius, 0).add(well.position);
        return bot.think(time, [ship], field);
      },
      120,
      undefined,
      (flight, step) => {
        seconds += step;
        state = readOrbit(well, flight.position, flight.velocity, MAIN_THRUST, readyAt >= 0, state === 'ready' || state === 'stable', reading);
        if (readyAt < 0 && state === 'ready') readyAt = seconds;
        if (readyAt >= 0 && seconds > readyAt) {
          if (state !== 'stable') broken.push(`${state} after ${(seconds - readyAt).toFixed(1)} s`);
          swept += angleTo(arm.subVectors(before, well.position), scratch.subVectors(flight.position, well.position));
        }
        before.copy(flight.position);
        return swept >= ORBIT_SWEEP;
      },
    );
    expect(result.crashed, `crashed after ${seconds.toFixed(1)} s`).toBe(false);
    expect(readyAt, 'seconds to ORBIT READY').toBeGreaterThanOrEqual(0);
    expect(readyAt).toBeLessThan(20);
    expect(broken).toEqual([]);
    expect(swept, `swept ${((swept * 180) / Math.PI).toFixed(0)}° in ${seconds.toFixed(0)} s`).toBeGreaterThanOrEqual(ORBIT_SWEEP);
  });

  it('lets a Host fly the rescue drill at the Event Horizon: burning away on a hurt drive, the overdrive fired a second after Nicole calls it gets out, the drive alone falls in', () => {
    const field = gameField();
    field.generate(arenaById('hole')!.layout);
    const well = field.well!;
    const up = new THREE.Vector3(0, 1, 0);
    const start = well.position.clone().addScaledVector(up, rescueFree(well) * RESCUE_START);
    const late = 1;
    const fly = (overdrive: boolean) => {
      const flight = startFlight(start, up);
      const gravity = new THREE.Vector3();
      const controls = { ...IDLE, thrust: 1 };
      let calledAt = -1;
      let coldUntil = 0;
      const shove = new THREE.Vector3();
      let shoving = 0;
      for (let t = 0; t < 60; t += 1 / 30) {
        flight.driveFactor = t < coldUntil ? 0 : RESCUE_DRIVE;
        const verdict = wellEscape(well, flight.position, flight.velocity, flight.forward(), RESCUE_DRIVE, Math.max(0, coldUntil - t), true, coldUntil === 0);
        if (verdict === 'overdrive' && calledAt < 0) calledAt = t;
        if (overdrive && calledAt >= 0 && coldUntil === 0 && t >= calledAt + late) {
          // nothing on the crosshair: the shove puts the flight onto the nose's line (see overdriveShove), over its seconds
          overdriveShove(flight, { position: flight.forward().multiplyScalar(OVERDRIVE_PUSH).add(flight.position), velocity: new THREE.Vector3() }, shove);
          shoving = OVERDRIVE_SECONDS;
          coldUntil = t + OVERDRIVE_DRIVE_COOLDOWN;
        }
        shoving = overdriveStep(flight.velocity, shove, shoving, 1 / 30);
        field.gravity(flight.position, gravity);
        flight.update(1 / 30, controls, gravity);
        const r = flight.position.distanceTo(well.position);
        if (r < well.radius) return { out: false, calledAt };
        if (r > rescueFree(well) * 2) return { out: true, calledAt };
      }
      return { out: false, calledAt };
    };
    const rescued = fly(true);
    expect(rescued.calledAt, 'Nicole calls the overdrive at once').toBeLessThan(0.5);
    expect(rescued.out).toBe(true);
    expect(fly(false).out).toBe(false);
  });
});
