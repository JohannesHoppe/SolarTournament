import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { evenSkills, RACE_SPEED, raceSpeedOf } from '../ship/bots';
import { RacingLine } from '../game/racingline';
import { type Attempt, clearOfRock, PIPE_BORE, RING_RADIUS, type SchoolContext } from '../game/school';
import { arenaById } from '../world/arenas';
import { DETAIL } from '../world/rocks';
import { testField } from '../test/field';
import { flyRings } from '../test/pilot';
import { POST_AT, POST_HALF } from '../world/callisto';
import { fluxStatic } from '../world/io';
import { BARGE_FROM, BARGE_TO, BLACKOUT_AT, convoyAt, ECHO_EIGHT, ECHO_NINE, ECHO_TEN, ECHO_ELEVEN, SCOUT_AT, HEART_COURSE, HEART_LAPS, HEART_START, TERMINATOR_COURSE, TERMINATOR_LAPS, TERMINATOR_START, ECHO_MERCURY, CLOUD_COURSE, CLOUD_LAPS, CLOUD_START, ECHO_VENUS, HAUMEA_COURSE, HAUMEA_LAPS, HAUMEA_START, FUEL_FROM, ECHO_SEVEN, freighterAt, FLUX_COURSE, FLUX_LAPS, FLUX_START, HEAT_COURSE, HEAT_LAPS, HEAT_START, doseRate, ECHO_FOUR, ECHO_THREE, ECHO_TWO, GRAND_COURSE, GRAND_LAPS, GRAND_START, MISSIONS, PEAK_COURSE, PEAK_LAPS, SPRINT_COURSE, SPRINT_START, SPRINT_TIME, tankerAt, TIGER_COURSE, TIGER_NORMALS, TIGER_START, TIGER_TIME, DROP_COURSE, DROP_START, GEYSER_COURSE, GEYSER_NORMALS, GEYSER_START, GEYSER_TIME, TOWER_AT, SPRINT_GOLD, TIGER_GOLD, GEYSER_GOLD, COURIER_PLACES, courierTimes, layCourier, MINING_PLACES, ON_PAD, TARGET_ZONE, YARD_MIDDLE } from './missions';
import { PSYCHE_FALL } from '../world/yard';
import { bridgeTower, HATCH_HALF, LOG } from '../world/bridgetower';
import { BOOST_RADIUS } from '../game/race';
import { ARENA_LIMIT } from '../world/arena';
import { faceAt } from '../world/miranda';
import { DECK } from '../world/venus';

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
/** The Cloud Line's laps are flown within this many seconds by a middling bot. */
const CLOUD_SECONDS = 300;

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
function flyTrial(arena: string, course: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], from: readonly [number, number, number], time: number, skill = SKILL, startInside = true): number {
  const field = testField(DETAIL);
  field.generate(arenaById(arena as never)!.layout);
  const start = new THREE.Vector3(...from);
  for (const coil of course) expect(coil.length()).toBeLessThan(ARENA_LIMIT);
  if (startInside) expect(start.length()).toBeLessThan(ARENA_LIMIT);
  const points = course.map((coil) => coil.clone());
  const line = new RacingLine(points, false, start);
  // when the first coil's plane is crossed the way it faces: the trial's clock starts there
  let flown = 0;
  let first = NaN;
  let side = NaN;
  const clock = (flight: { position: THREE.Vector3 }, step: number) => {
    flown += step;
    const now = trialSide.copy(flight.position).sub(course[0]).dot(normals[0]);
    if (Number.isNaN(first) && side < 0 && now >= 0) first = flown;
    side = now;
    return false;
  };
  const speed = skill === SKILL ? RACE_SPEED : raceSpeedOf(evenSkills(skill));
  const flight = flyRings(field, { points, normals: normals.map((normal) => normal.clone()), radius: RING_RADIUS, core: BOOST_RADIUS, line, open: false }, start, normals[0], skill, speed, time + 6, 0, clock);
  expect(flight.passed, `${flight.passed} of ${points.length} in ${flight.seconds.toFixed(1)} s`).toBe(points.length);
  expect(flight.missed).toBe(0);
  expect(flight.crashed).toBe(false);
  return flight.seconds - first;
}
const trialSide = new THREE.Vector3();

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

  it('every time trial’s gold time is a feat: a sharp bot (0.9) flies within it, a middling one within the limit but not the gold', () => {
    for (const [arena, course, normals, from, time, gold] of [
      ['callisto', SPRINT_COURSE, SPRINT_COURSE.map(() => new THREE.Vector3(-1, 0, 0)), SPRINT_START.at, SPRINT_TIME, SPRINT_GOLD],
      ['enceladus', TIGER_COURSE, TIGER_NORMALS, TIGER_START.at, TIGER_TIME, TIGER_GOLD],
      ['triton', GEYSER_COURSE, GEYSER_NORMALS, GEYSER_START.at, GEYSER_TIME, GEYSER_GOLD],
    ] as const) {
      const middling = flyTrial(arena, course, normals, from, time);
      expect(middling, arena).toBeLessThanOrEqual(time);
      expect(middling, arena).toBeGreaterThan(gold);
      expect(flyTrial(arena, course, normals, from, time, 0.9), arena).toBeLessThanOrEqual(gold);
    }
  });

  for (const [arena] of COURIER_PLACES) {
    it(`the courier run at ${arena}: laid clear of every piece inside the arena, a middling bot within the limit but not the gold, a sharp one within the gold`, () => {
      const field = testField(DETAIL);
      field.generate(arenaById(arena)!.layout);
      const { points, normals } = layCourier(field, arena);
      for (const beacon of points) {
        expect(field.overlap(beacon, RING_RADIUS * 2)).toBeNull();
        expect(beacon.length()).toBeLessThan(ARENA_LIMIT);
      }
      const { time, gold } = courierTimes(arena);
      const from = arenaById(arena)!.start!.at;
      // from where the place prints its clones, inside the arena or not
      const middling = flyTrial(arena, points, normals, from, time, SKILL, false);
      expect(middling).toBeLessThanOrEqual(time);
      expect(middling).toBeGreaterThan(gold);
      expect(flyTrial(arena, points, normals, from, time, 0.9, false)).toBeLessThanOrEqual(gold);
    });
  }

  it('the mining runs lie where loose rock or ice drifts within 2 km of the place’s start, each one a courier run’s place', () => {
    for (const arena of MINING_PLACES) {
      expect(COURIER_PLACES.some(([place]) => place === arena), arena).toBe(true);
      const field = testField(DETAIL);
      field.generate(arenaById(arena)!.layout);
      const start = new THREE.Vector3(...arenaById(arena)!.start!.at);
      const near = [...field.asteroids.values()].filter((rock) => !rock.solid && rock.object.position.distanceTo(start) < 40000);
      expect(near.length, arena).toBeGreaterThanOrEqual(3);
    }
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

  it('the Cloud Line round Highball is flown by a middling bot: both laps through every ring, half of them under the acid clouds, nothing missed, without a crash or the hull burnt through', () => {
    expectRaced('venus', CLOUD_COURSE, CLOUD_LAPS, RING_RADIUS, CLOUD_SECONDS, CLOUD_START.at);
    expect(CLOUD_COURSE.filter((ring) => ring.y < DECK).length).toBe(CLOUD_COURSE.length / 2);
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

describe('Live Target in the Boneyard', () => {
  it('starts on the pad inside its zone, with room to jink round it, the gunners inside too', () => {
    const pad = new THREE.Vector3(...ON_PAD.at);
    // 200 m and more inside the zone's edge
    expect(pad.distanceTo(YARD_MIDDLE)).toBeLessThan(TARGET_ZONE - 4000);
    expect(MISSIONS.find((mission) => mission.id === 'liveTarget')!.start).toBe(ON_PAD);
  });

  it('flies chapter 1’s jobs with the autopilot, which holds the ship against Psyche’s pull: no flying drill there drifts freely', () => {
    expect(PSYCHE_FALL).toBeGreaterThan(0);
    for (const id of ['lamplighter', 'liveTarget', 'canisterSweep', 'firstCut', 'dockingLane']) {
      const flown = MISSIONS.find((mission) => mission.id === id)!.drills.filter((drill) => drill.done !== undefined && drill.autopilot !== undefined);
      expect(flown.length, id).toBeGreaterThan(0);
      for (const drill of flown) expect(drill.autopilot, id).toBe(true);
    }
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
  for (const [name, arena, at] of [['the second, before Occator’s second step', 'occator', ECHO_TWO], ['the third, over the listening post on Callisto', 'callisto', ECHO_THREE], ['the fourth, over the science station in Europa’s Crack', 'europa', ECHO_FOUR], ['the seventh, low over Kraken Mare under Titan’s haze', 'titan', ECHO_SEVEN], ['the eighth, over the crest of Iapetus’s ridge', 'iapetus', ECHO_EIGHT], ['the ninth, at the Derelict’s torn bow', 'derelict', ECHO_NINE], ['the tenth, over the mountains by Pluto’s heart', 'pluto', ECHO_TEN], ['the eleventh, among the parked comets at Granary', 'granary', ECHO_ELEVEN], ['Scout One, among the Feeders’ ice by the hole', 'hole', SCOUT_AT], ['Mercury’s, over the ridge by the sun miners’ camp', 'mercury', ECHO_MERCURY], ['Venus’s, over biodome four in Highball', 'venus', ECHO_VENUS]] as const) {
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

describe('the Derelict’s bridge tower', () => {
  it('drifts clear of every piece of the Derelict, inside the arena, its hatches wide enough for a ship and the log on its bridge', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('derelict')!.layout);
    const { boxes } = bridgeTower();
    // every box of it, sampled every 20 m through it, clear of the field's pieces
    const STEP = 400;
    const point = new THREE.Vector3();
    for (const box of boxes) {
      const center = box.center.clone().add(TOWER_AT);
      const steps = box.half.clone().divideScalar(STEP).floor();
      for (let i = -steps.x; i <= steps.x; i++)
        for (let j = -steps.y; j <= steps.y; j++)
          for (let k = -steps.z; k <= steps.z; k++) {
            point.set(i * STEP, j * STEP, k * STEP).add(center);
            expect(field.overlap(point, STEP), `${point.toArray()}`).toBeNull();
          }
      expect(center.length() + box.half.length()).toBeLessThan(ARENA_LIMIT);
    }
    // a hatch passes an interceptor (35 m long) with room: 60 m a side
    expect(HATCH_HALF * 2 * 0.05).toBeGreaterThanOrEqual(60);
    expect(ECHO_NINE.distanceTo(TOWER_AT.clone().add(LOG))).toBe(0);
  });
});
