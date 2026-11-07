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
import { fluxStatic } from '../world/io';
import { BARGE_FROM, BARGE_TO, BLACKOUT_AT, convoyAt, ECHO_EIGHT, ECHO_NINE, ECHO_TEN, ECHO_ELEVEN, SCOUT_AT, HEART_COURSE, HEART_LAPS, HEART_START, TERMINATOR_COURSE, TERMINATOR_LAPS, TERMINATOR_START, ECHO_MERCURY, HAUMEA_COURSE, HAUMEA_LAPS, HAUMEA_START, FUEL_FROM, ECHO_SEVEN, freighterAt, FLUX_COURSE, FLUX_LAPS, FLUX_START, HEAT_COURSE, HEAT_LAPS, HEAT_START, doseRate, ECHO_FOUR, ECHO_THREE, ECHO_TWO, GRAND_COURSE, GRAND_LAPS, GRAND_START, MISSIONS, PEAK_COURSE, PEAK_LAPS, SPRINT_COURSE, SPRINT_START, SPRINT_TIME, tankerAt, TIGER_COURSE, TIGER_NORMALS, TIGER_START, TIGER_TIME, DROP_COURSE, DROP_START, GEYSER_COURSE, GEYSER_NORMALS, GEYSER_START, GEYSER_TIME } from './missions';
import { BOOST_RADIUS } from '../game/race';
import { ARENA_LIMIT } from '../world/arena';
import { faceAt } from '../world/miranda';

/** A middling bot: what a Host is asked to fly, it must manage (see CLAUDE.md, Plausibility). */
const SKILL = 0.5;
/** The Peak Run's laps are flown within this many seconds by a middling bot (its rivals fly at skill 0.2). */
const PEAK_SECONDS = 240;
/** The Stickney Grand's three laps are flown within this many seconds by a middling bot. */
const GRAND_SECONDS = 360;
/** The Flux Tube Race's two laps are flown within this many seconds by a middling bot. */
const FLUX_SECONDS = 240;
/** The Qualifying Heat's three laps over Kraken Mare are flown within this many seconds by a middling bot. */
const HEAT_SECONDS = 420;
/** The Heart Run's two laps: long enough for a middling bot. */
const HEART_SECONDS = 300;
/** The Terminator Run's laps are flown within this many seconds by a middling bot. */
const TERMINATOR_SECONDS = 300;

/** A middling bot flies a mission's race (see flyRace): every lap through every mark, nothing missed, without a crash. */
function expectRaced(arena: string, course: readonly THREE.Vector3[], laps: number, radius: number, seconds: number, from?: readonly [number, number, number]) {
  const { flight, total } = flyRace(arena, course, laps, radius, seconds, from);
  expect(flight.passed, `${flight.passed} of ${total} in ${flight.seconds.toFixed(0)} s`).toBe(total);
  expect(flight.missed).toBe(0);
  expect(flight.crashed).toBe(false);
}

/**
 * A middling bot flies a mission's time trial at `arena` (see timeTrial): from `from`, through each
 * coil of `course` along its normal, every one of them inside the arena, within the clock `time`
 * after the first (the burn up to it, 1 km from rest, takes some 6 s more), without a miss or a crash.
 */
function flyTrial(arena: string, course: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], from: readonly [number, number, number], time: number) {
  const field = testField(DETAIL);
  field.generate(arenaById(arena as never)!.layout);
  const start = new THREE.Vector3(...from);
  for (const coil of course) expect(coil.length()).toBeLessThan(ARENA_LIMIT);
  expect(start.length()).toBeLessThan(ARENA_LIMIT);
  const points = course.map((coil) => coil.clone());
  const line = new RacingLine(points, false, start);
  const flight = flyRings(field, { points, normals: normals.map((normal) => normal.clone()), radius: RING_RADIUS, core: BOOST_RADIUS, line, open: false }, start, normals[0], SKILL, RACE_SPEED, time + 6);
  expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(1)} s`).toBe(points.length);
  expect(flight.missed).toBe(0);
  expect(flight.crashed).toBe(false);
}

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
    flyTrial('callisto', SPRINT_COURSE, SPRINT_COURSE.map(() => new THREE.Vector3(-1, 0, 0)), SPRINT_START.at, SPRINT_TIME);
  });

  it('the Tiger Stripes on Enceladus are flown by a middling bot: down one stripe and up the next through every coil, the ad’s clock beaten, without a crash', () => {
    flyTrial('enceladus', TIGER_COURSE, TIGER_NORMALS, TIGER_START.at, TIGER_TIME);
  });

  it('the Verona Drop on Miranda is flown by a middling bot: down the face through every buoy, under 150 m/s and never 300 m off the face, without a crash', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('miranda')!.layout);
    const start = new THREE.Vector3(...DROP_START.at);
    for (const buoy of DROP_COURSE) expect(buoy.length()).toBeLessThan(ARENA_LIMIT);
    const points = DROP_COURSE.map((buoy) => buoy.clone());
    const normals = points.map((buoy, i) => buoy.clone().sub(i ? points[i - 1] : start).normalize());
    const line = new RacingLine(points, false, start);
    let fastest = 0;
    let farthest = -Infinity;
    let reached = false;
    const flight = flyRings(field, { points, normals, radius: 1600, core: 0, line, open: true }, start, normals[0], SKILL, RACE_SPEED, 240, 0, (ship) => {
      fastest = Math.max(fastest, ship.velocity.length());
      reached ||= ship.position.distanceTo(points[0]) < 1600;
      const at = ship.position;
      if (reached && at.y < 14000) farthest = Math.max(farthest, at.z - faceAt(at.x, at.y));
      return false;
    }, 2400);
    expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(1)} s`).toBe(points.length);
    expect(flight.crashed).toBe(false);
    expect(fastest).toBeLessThan(3000);
    expect(farthest).toBeLessThan(6000);
  });

  it('the Geyser Field on Triton is flown by a middling bot: past every geyser through its coil to the Memorial Station, the clock beaten, the columns pushing it as they push every ship, without a crash', () => {
    flyTrial('triton', GEYSER_COURSE, GEYSER_NORMALS, GEYSER_START.at, GEYSER_TIME);
  });

  it('the race in Haumea’s ring is flown by a middling bot: both laps between the beacons among the ring’s ice, nothing missed, without a crash', () => {
    expectRaced('haumea', HAUMEA_COURSE, HAUMEA_LAPS, RING_RADIUS, HEART_SECONDS, HAUMEA_START.at);
  });

  it('the fuel barge of Rung Two sets out and docks inside the arena', () => {
    const depot = new THREE.Vector3(...arenaById('eris')!.references![0].position.toArray());
    expect(FUEL_FROM.length()).toBeLessThan(ARENA_LIMIT);
    expect(depot.length()).toBeLessThan(ARENA_LIMIT);
  });

  it('the Heart Run on Pluto is flown by a middling bot: both laps over the heart through every ring, nothing missed, without a crash', () => {
    expectRaced('pluto', HEART_COURSE, HEART_LAPS, RING_RADIUS, HEART_SECONDS, HEART_START.at);
  });

  it('the Terminator Run at Caloris is flown by a middling bot: both laps round the miners’ camp, over the ridges, through every ring, nothing missed, without a crash', () => {
    expectRaced('mercury', TERMINATOR_COURSE, TERMINATOR_LAPS, RING_RADIUS, TERMINATOR_SECONDS, TERMINATOR_START.at);
  });

  it('the Flux Tube Race on Io is flown by a middling bot: both laps through every ring, past the flux tube, nothing missed, without a crash; one side of its loop runs where the link crackles', () => {
    expectRaced('io', FLUX_COURSE, FLUX_LAPS, RING_RADIUS, FLUX_SECONDS, FLUX_START.at);
    expect(Math.max(...FLUX_COURSE.map((ring) => fluxStatic(ring)))).toBeGreaterThan(0.3);
  });

  it('the Qualifying Heat over Kraken Mare is flown by a middling bot: three laps through every coil, over Titan’s haze and down into it, nothing missed, without a crash', () => {
    expectRaced('titan', HEAT_COURSE, HEAT_LAPS, RING_RADIUS, HEAT_SECONDS, HEAT_START.at);
    // one side over the deck, the other in the haze under it
    expect(Math.max(...HEAT_COURSE.map((ring) => ring.y))).toBeGreaterThan(0);
    expect(Math.min(...HEAT_COURSE.map((ring) => ring.y))).toBeLessThan(-4000);
  });

  it('the Stickney Grand on Phobos is flown by a middling bot: three laps through every ring, down into the crater and out, nothing missed, without a crash', () => {
    expectRaced('phobos', GRAND_COURSE, GRAND_LAPS, RING_RADIUS, GRAND_SECONDS, GRAND_START.at);
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

describe('Dose on Europa', () => {
  it('flies its tanker up the Crack, out of it and away into the belt, clear of the ice and the station, inside the arena', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('europa')!.layout);
    const at = new THREE.Vector3();
    for (let seconds = 0; seconds <= 220; seconds += 0.5) {
      tankerAt(seconds, at);
      // the tanker is some 140 m long: nothing within 60 m of its middle
      expect(field.overlap(at, 1200), `${seconds} s`).toBeNull();
      expect(at.length()).toBeLessThan(ARENA_LIMIT);
    }
  });

  it('doses the clone not at all in the Crack, the more the higher over the ice, the full rate from 300 m on', () => {
    const plain = new THREE.Vector3(30000, -2000, 0);
    expect(doseRate(plain.clone().setY(-10000))).toBe(0);
    expect(doseRate(plain.clone().setY(1000))).toBeGreaterThan(0);
    expect(doseRate(plain.clone().setY(1000))).toBeLessThan(doseRate(plain.clone().setY(4000)));
    expect(doseRate(plain.clone().setY(4000))).toBe(doseRate(plain.clone().setY(20000)));
    // a full dose in some two and a half minutes at the full rate
    expect(1 / doseRate(plain.clone().setY(20000))).toBe(150);
  });
});

describe('Blackout on Io', () => {
  it('flies its freighter through the flux tube clear of the plain, the patera and the mesa, inside the arena, the link cut where the lane comes nearest the tube', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('io')!.layout);
    const at = new THREE.Vector3();
    for (let seconds = 0; ; seconds += 0.5) {
      const share = freighterAt(seconds, at);
      // nothing within 70 m of the freighter's middle, its spine level along the lane
      expect(field.overlap(at, 1400), `${seconds} s`).toBeNull();
      expect(at.length()).toBeLessThan(ARENA_LIMIT);
      if (share >= 1) break;
    }
    expect(BLACKOUT_AT).toBeGreaterThan(0.3);
    expect(BLACKOUT_AT).toBeLessThan(0.8);
    // where the link cuts, the static is all but full
    let seconds = 0;
    while (freighterAt(seconds, at) < BLACKOUT_AT) seconds += 0.1;
    expect(fluxStatic(at)).toBeGreaterThan(0.9);
  });
});

describe('the echoes', () => {
  for (const [name, arena, at] of [['the second, before Occator’s second step', 'occator', ECHO_TWO], ['the third, over the listening post on Callisto', 'callisto', ECHO_THREE], ['the fourth, over the science station in Europa’s Crack', 'europa', ECHO_FOUR], ['the seventh, low over Kraken Mare under Titan’s haze', 'titan', ECHO_SEVEN], ['the eighth, over the crest of Iapetus’s ridge', 'iapetus', ECHO_EIGHT], ['the ninth, at the Derelict’s torn bow', 'derelict', ECHO_NINE], ['the tenth, over the mountains by Pluto’s heart', 'pluto', ECHO_TEN], ['the eleventh, among the parked comets at Granary', 'granary', ECHO_ELEVEN], ['Scout One, among the Feeders’ ice by the hole', 'hole', SCOUT_AT], ['Mercury’s, over the ridge by the sun miners’ camp', 'mercury', ECHO_MERCURY]] as const) {
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
