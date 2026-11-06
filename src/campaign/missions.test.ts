import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RACE_SPEED } from '../ship/bots';
import { RacingLine } from '../game/racingline';
import { type Attempt, clearOfRock, PIPE_BORE, RING_RADIUS, type SchoolContext } from '../game/school';
import { arenaById } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from '../test/field';
import { flyRings } from '../test/pilot';
import { BARGE_FROM, BARGE_TO, ECHO_TWO, GRAND_COURSE, GRAND_LAPS, GRAND_START, MISSIONS, PEAK_COURSE, PEAK_LAPS } from './missions';
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

describe('the second echo at Occator', () => {
  it('lies before the wall’s second step, clear of every piece of the place, inside the arena', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('occator')!.layout);
    expect(field.overlap(ECHO_TWO, 800)).toBeNull();
    expect(ECHO_TWO.length()).toBeLessThan(ARENA_LIMIT);
  });
});
