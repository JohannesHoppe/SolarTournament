import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOST_RADIUS } from './race';
import { MAX_SPEED } from '../ship/flight';
import { BRAKE_COURSE, COIL_COURSE, CORE_SHARE, CURVE_COURSE, CURVE_SPEED, CURVE_ZONE, LINE_COURSE, LINE_PACE, LINE_SPARE, RING_COURSE, RING_RADIUS, ringCourse } from './school';
import { testField } from '../test/field';
import { flyCourse, SHIP_RADIUS, startFlight, STEP } from '../test/pilot';
import { Human, racer } from '../test/human';
import { RacingLine } from './racingline';
import { DETAIL } from '../world/rocks';

/**
 * Playability: a Host with ordinary hands has to fly what the game asks of it. A simulated Host
 * (src/test/human.ts) steers with the mouse through the game's own input pipeline and flight
 * computer, by what the screen shows, a quarter second late and a few pixels off. What it cannot
 * fly, no Host will. The race laps are in hostrace.test.ts and hostrace2.test.ts.
 */
const gameField = () => testField(DETAIL);

describe("a simulated Host flies the flight school's drills", () => {
  const position = new THREE.Vector3();
  const facing = new THREE.Vector3(0, 0, -1);
  const drills = [
    { drill: 'curve', layout: CURVE_COURSE, radius: CURVE_ZONE, core: 0, drift: CURVE_SPEED, seconds: 60 },
    { drill: 'ring (the X)', layout: RING_COURSE, radius: RING_RADIUS, core: 0, drift: null, seconds: 60 },
    { drill: 'coil', layout: COIL_COURSE, radius: RING_RADIUS, core: RING_RADIUS * CORE_SHARE, drift: null, seconds: 60 },
    { drill: 'brake', layout: BRAKE_COURSE, radius: RING_RADIUS, core: 0, drift: MAX_SPEED, seconds: 60 },
    { drill: 'full-speed', layout: LINE_COURSE, radius: RING_RADIUS, core: BOOST_RADIUS, drift: 0, seconds: 0 },
  ];
  for (const { drill, layout, radius, core, drift, seconds } of drills) {
    it(`the ${drill} drill, missing nothing`, () => {
      const points = ringCourse(position, new THREE.Quaternion(), layout);
      const normals = points.map((point, i) => point.clone().sub(i === 0 ? position : points[i - 1]).normalize());
      const line = new RacingLine(points, false, position);
      const rings = { points, normals, radius, core, line, open: drill === 'curve' };
      const field = gameField();
      const flight = startFlight(position, drift !== null ? normals[0] : facing, drift ?? 0);
      const limit = seconds || line.length / LINE_PACE + LINE_SPARE;
      // a drill that starts drifting is flown without the drive, the others with it; the full-speed drill all the way
      const host = flyCourse(field, rings, flight, racer(field, rings, flight, drill === 'full-speed' ? Infinity : undefined, drift === null || drift === 0), limit);
      const summary = `${host.passed} of ${points.length} in ${host.seconds.toFixed(1)} of ${limit.toFixed(0)} s, ${host.missed} missed, offs ${host.offs.map((off) => (off / 20).toFixed(0)).join(', ')} m`;
      console.info(`Host in the ${drill} drill: ${summary}`);
      expect(host.passed, summary).toBe(points.length);
      expect(host.missed, summary).toBe(0);
      if (drill === 'coil') for (const off of host.offs) expect(off, summary).toBeLessThan(RING_RADIUS * CORE_SHARE);
    });
  }
});

describe('a simulated Host in open space', () => {
  /** A Host flying `seconds` with its pointer on a point the function gives, from `speed` (units/s) ahead (-Z), with the autopilot or in free drift; in free drift the point is a ship, and the aim assist pulls onto it. */
  function fly(speed: number, seconds: number, mark: (t: number) => THREE.Vector3, each: (flight: ReturnType<typeof startFlight>, t: number) => void = () => {}, autopilot = true) {
    const flight = startFlight(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), speed);
    const human = new Human(flight, STEP);
    human.autopilot = autopilot;
    const gravity = new THREE.Vector3();
    for (let t = 0; t < seconds; t += STEP) {
      flight.update(STEP, human.fly(flight, mark(t), 'coast', gravity, autopilot ? undefined : mark(t)), gravity);
      each(flight, t);
    }
    return flight;
  }

  it('turns about at 150 m/s towards a target behind, and flies at it', () => {
    const target = new THREE.Vector3(300, 0, 40000);
    const flight = fly(3000, 8, () => target);
    const off = flight.velocity.angleTo(target.clone().sub(flight.position));
    console.info(`Host turning about: ${((off * 180) / Math.PI).toFixed(1)}° off the target after 8 s, at ${(flight.velocity.length() / 20).toFixed(0)} m/s`);
    expect(off).toBeLessThan(0.05);
    expect(flight.velocity.length()).toBeGreaterThan(2400);
  });

  // the autopilot flies where the pointer is and the nose follows as the flight bends; to keep
  // the nose on a crossing ship a Host switches to free drift, where the pointer turns the nose
  it('holds a crossing bot under the crosshair long enough to hit it, in free drift', () => {
    // a bot 600 m ahead and to the right, crossing at 40 m/s
    const bot = (t: number) => new THREE.Vector3(4000 - 800 * t, 1000, -12000);
    let onHull = 0;
    const toBot = new THREE.Vector3();
    fly(
      1600,
      10,
      bot,
      (flight, t) => {
        toBot.copy(bot(t)).sub(flight.position);
        if (flight.forward().angleTo(toBot) < SHIP_RADIUS / toBot.length()) onHull += STEP;
      },
      false,
    );
    console.info(`Host on a crossing bot: the nose on its hull for ${onHull.toFixed(1)} s of 10`);
    expect(onHull).toBeGreaterThan(1.5);
  });
});
