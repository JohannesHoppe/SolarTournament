import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RACE_SPEED } from '../ship/bots';
import { RacingLine } from '../game/racingline';
import { type Attempt, clearOfRock, PIPE_BORE, RING_RADIUS, type SchoolContext } from '../game/school';
import { arenaById } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from '../test/field';
import { flyRings } from '../test/pilot';
import { POST_AT, POST_HALF } from '../world/callisto';
import { BARGE_FROM, BARGE_TO, convoyAt, ECHO_FOUR, ECHO_THREE, ECHO_TWO, GRAND_COURSE, GRAND_LAPS, GRAND_START, MISSIONS, PEAK_COURSE, PEAK_LAPS, SPRINT_COURSE, SPRINT_START, SPRINT_TIME } from './missions';
import { BOOST_RADIUS } from '../game/race';
import { ARENA_LIMIT } from '../world/arena';

/** A middling bot: what a Host is asked to fly, it must manage (see CLAUDE.md, Plausibility). */
const SKILL = 0.5;
/** The Peak Run's laps are flown within this many seconds by a middling bot (its rivals fly at skill 0.2). */
const PEAK_SECONDS = 240;
/** The Stickney Grand's three laps are flown within this many seconds by a middling bot. */
const GRAND_SECONDS = 360;

/**
 * A middling bot flies a mission's race at `arena`: every lap through every mark of `course`
 * (its openings `radius`), laid clear of rock as the game lays them, facing along the loop, from
 * the place's start or `from`; how it went.
 */
function flyRace(arena: string, course: readonly THREE.Vector3[], laps: number, radius: number, seconds: number, from?: readonly [number, number, number]) {
  const field = testField(DETAIL);
  field.generate(arenaById(arena as never)!.layout);
  const count = course.length;
  const rings = course.map((mark) => clearOfRock(field, mark.clone(), radius * 2));
  const facings = rings.map((_, i) => rings[(i + 1) % count].clone().sub(rings[(i + count - 1) % count]).normalize());
  // every lap as one course: the same marks over again, the closed loop's line through them
  const points = Array.from({ length: count * laps }, (_, i) => rings[i % count]);
  const normals = Array.from({ length: count * laps }, (_, i) => facings[i % count]);
  const line = new RacingLine(rings, true);
  const start = new THREE.Vector3(...(from ?? arenaById(arena as never)!.start!.at));
  const flight = flyRings(field, { points, normals, radius, core: 0, line, open: false }, start, rings[0].clone().sub(start).normalize(), SKILL, RACE_SPEED, seconds);
  return { flight, total: points.length };
}

describe('the races of the campaign', () => {
  it('the Peak Run on Rheasilvia is flown by a middling bot: both laps through the bore of every pipe round the claims, nothing missed, without a crash', () => {
    const { flight, total } = flyRace('rheasilvia', PEAK_COURSE, PEAK_LAPS, PIPE_BORE, PEAK_SECONDS);
    expect(flight.passed, `${flight.passed} of ${total} in ${flight.seconds.toFixed(0)} s`).toBe(total);
    expect(flight.missed).toBe(0);
  });

  it('the Valhalla Sprint on Callisto is flown by a middling bot: from its start through every coil in a straight line over the ridges, the clock beaten, without a crash', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('callisto')!.layout);
    const start = new THREE.Vector3(...SPRINT_START.at);
    const way = new THREE.Vector3(-1, 0, 0);
    for (const coil of SPRINT_COURSE) expect(coil.length()).toBeLessThan(ARENA_LIMIT);
    expect(start.length()).toBeLessThan(ARENA_LIMIT);
    const points = SPRINT_COURSE.map((coil) => coil.clone());
    const line = new RacingLine(points, false, start);
    // the clock runs from the first coil: the burn up to it (1 km from rest) takes some 6 s of it
    const flight = flyRings(field, { points, normals: points.map(() => way), radius: RING_RADIUS, core: BOOST_RADIUS, line, open: false }, start, way, SKILL, RACE_SPEED, SPRINT_TIME + 6);
    expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(1)} s`).toBe(points.length);
    expect(flight.missed).toBe(0);
    expect(flight.crashed).toBe(false);
  });

  it('the Stickney Grand on Phobos is flown by a middling bot: three laps through every ring, down into the crater and out, nothing missed, without a crash', () => {
    const { flight, total } = flyRace('phobos', GRAND_COURSE, GRAND_LAPS, RING_RADIUS, GRAND_SECONDS, GRAND_START.at);
    expect(flight.passed, `${flight.passed} of ${total} in ${flight.seconds.toFixed(0)} s`).toBe(total);
    expect(flight.missed).toBe(0);
    expect(flight.crashed).toBe(false);
  });
});

describe('the Saw Brothers’ music', () => {
  it('stays the claim’s calm while the brothers saw undisturbed and turns to the fight once the pilot comes near or one is down', () => {
    const drill = MISSIONS.find((mission) => mission.id === 'sawBrothers')!.drills.find((d) => d.turn)!;
    const site = new THREE.Vector3(1000, 0, 0);
    const at = (x: number, jumpersDown = 0) => drill.turn!({ me: { flight: { position: new THREE.Vector3(x, 0, 0) } }, jumpersDown } as unknown as SchoolContext, { site } as Attempt);
    expect(at(1000 + 30000)).toBeUndefined();
    expect(at(1000 + 20000)).toBe('fight');
    expect(at(1000 + 30000, 1)).toBe('fight');
  });
});

describe('the Ore Barge out of Occator', () => {
  it('flies a lane clear of the capital: no piece of the place within 150 m of the barge’s middle anywhere on it, inside the arena', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('occator')!.layout);
    const point = new THREE.Vector3();
    for (let k = 0; k <= 100; k++) {
      point.lerpVectors(BARGE_FROM, BARGE_TO, k / 100);
      expect(field.overlap(point, 3000), `at ${k} %`).toBeNull();
      expect(point.length()).toBeLessThan(ARENA_LIMIT);
    }
  });
});

describe('the Ice Run over Valhalla', () => {
  it('flies its convoy on a lane clear of the ground and the listening post, inside the arena, from its start to its end', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('callisto')!.layout);
    const at = new THREE.Vector3();
    for (let seconds = 0; seconds <= 240; seconds += 1) {
      for (let tug = 0; tug < 3; tug++) {
        convoyAt(tug, seconds, at);
        // a tug is some 100 m long: nothing within 75 m of its middle, and room to be dragged off the lane
        expect(field.overlap(at, 1500), `${tug} at ${seconds} s`).toBeNull();
        expect(at.length()).toBeLessThan(ARENA_LIMIT);
      }
    }
  });
});

describe('the echoes', () => {
  for (const [name, arena, at] of [['the second, before Occator’s second step', 'occator', ECHO_TWO], ['the third, over the listening post on Callisto', 'callisto', ECHO_THREE], ['the fourth, over the science station in Europa’s Crack', 'europa', ECHO_FOUR]] as const) {
    it(`${name}: clear of every piece of the place, inside the arena`, () => {
      const field = testField(DETAIL);
      field.generate(arenaById(arena)!.layout);
      expect(field.overlap(at, 800)).toBeNull();
      expect(at.length()).toBeLessThan(ARENA_LIMIT);
    });
  }

  it('the third hangs over the listening post, which stands solid on Callisto’s ground', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('callisto')!.layout);
    // a ship flying down onto the post meets its roof long before the ground
    const hit = field.raycast(ECHO_THREE, new THREE.Vector3(0, -1, 0), 10000);
    expect(hit).not.toBeNull();
    expect(ECHO_THREE.y - hit!.distance).toBeGreaterThan(POST_AT.y - POST_HALF.y + 300);
  });
});
