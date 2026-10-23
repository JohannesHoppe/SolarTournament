import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InputRecorder } from '../recorder';
import { Cockpit, Hand, STEP, convergence, flyLine, replay } from '../test/cockpit';
import { RacingLine } from '../game/racingline';
import { CURVE_COURSE, CURVE_SPEED, CURVE_ZONE, LINE_COURSE, LINE_PACE, LINE_SPARE, RING_RADIUS } from '../game/school';
import { MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, RCS_THRUST, turnRadius } from './flight';

/** A degree (rad). */
const DEGREE = Math.PI / 180;
/** 1 m/s in units/s. */
const MS = 20;

/** A direction `yaw` right of ahead (-Z) and `pitch` up (rad). */
const direction = (yaw: number, pitch = 0) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

/** The course only moves while the Host steers: never by itself, the camera or the nose. */
function courseMovesOnlyWithInput(cockpit: Cockpit) {
  for (let i = 1; i < cockpit.samples.length; i++) {
    const sample = cockpit.samples[i];
    if (sample.input === 0) expect(sample.course.angleTo(cockpit.samples[i - 1].course)).toBeLessThan(1e-6);
  }
}

/** Once well under way (within 150° of the goal), the flight never swings back away from it by more than `slack` (rad). */
function neverSwingsBack(cockpit: Cockpit, goal: THREE.Vector3, slack = DEGREE) {
  let closest = (5 * Math.PI) / 6;
  for (const sample of cockpit.samples) {
    const off = sample.path.angleTo(goal);
    if (off > closest && closest === (5 * Math.PI) / 6) continue;
    closest = Math.min(closest, off);
    expect(off).toBeLessThan(closest + slack);
  }
}

describe('path steering: the pointer sets the course', () => {
  it('at rest turns the nose onto the course and keeps the ship where it is', () => {
    const ship = new Cockpit(0);
    ship.fly(0.5, () => ({ yaw: 0.5 }));
    const released = ship.t;
    ship.fly(1.5);
    const nose = convergence(ship.samples, ship.steering.course, released, DEGREE, 'nose');
    expect(nose.seconds).toBeLessThan(0.3);
    expect(nose.overshoot).toBeLessThan(DEGREE);
    expect(ship.flight.velocity.length()).toBeLessThan(0.5 * MS);
    courseMovesOnlyWithInput(ship);
  });

  it('at rest a hand puts the nose on a marker, and the ship stays at rest', () => {
    const ship = new Cockpit(0);
    const marker = direction(0.7, -0.25);
    const hand = new Hand();
    ship.fly(4, (cockpit) => hand.steer(cockpit, marker));
    const nose = convergence(ship.samples, marker, 0, 2 * DEGREE, 'nose');
    expect(nose.seconds).toBeLessThan(3);
    expect(nose.noseOff).toBeLessThan(2 * DEGREE);
    expect(ship.flight.velocity.length()).toBeLessThan(0.5 * MS);
  });

  it('brings the flight onto a course the pointer set, held off center, without overshoot', () => {
    const ship = new Cockpit(100 * MS);
    ship.fly(1, () => ({ yaw: 0.6, pitch: 0.3 }));
    const released = ship.t;
    ship.fly(3);
    const flight = convergence(ship.samples, ship.steering.course, released);
    expect(flight.seconds).toBeLessThan(1);
    expect(flight.overshoot).toBeLessThan(2 * DEGREE);
    expect(flight.noseOff).toBeLessThan(DEGREE);
    courseMovesOnlyWithInput(ship);
  });

  it('follows a hand sweeping the pointer with eased strokes, overshoot and corrections', () => {
    const ship = new Cockpit(120 * MS);
    const goal = direction(1.2, 0.35);
    const hand = new Hand();
    ship.fly(6, (cockpit) => hand.steer(cockpit, goal));
    const flight = convergence(ship.samples, goal);
    expect(flight.seconds).toBeLessThan(4);
    expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    expect(flight.noseOff).toBeLessThan(1.5 * DEGREE);
    courseMovesOnlyWithInput(ship);
  });

  it('turns about on its own when the course lies behind, at the speed it had', () => {
    const ship = new Cockpit(150 * MS);
    const back = new THREE.Vector3(0, 0, 1);
    ship.steering.course.copy(back);
    ship.fly(5);
    const flight = convergence(ship.samples, back);
    expect(flight.seconds).toBeLessThan(3);
    expect(flight.overshoot).toBeLessThan(DEGREE);
    expect(flight.noseOff).toBeLessThan(DEGREE);
    expect(ship.flight.velocity.length()).toBeGreaterThan(145 * MS);
    neverSwingsBack(ship, back);
  });

  it('turns about when a hand swings the pointer round to a target behind', () => {
    const ship = new Cockpit(150 * MS);
    const target = direction(Math.PI - 0.05);
    const hand = new Hand();
    ship.fly(7, (cockpit) => hand.steer(cockpit, target));
    const flight = convergence(ship.samples, target);
    expect(flight.seconds).toBeLessThan(5);
    expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    expect(flight.noseOff).toBeLessThan(1.5 * DEGREE);
    courseMovesOnlyWithInput(ship);
  });

  it('takes over from free drift where the nose points, without a jolt', () => {
    // sliding sideways: the nose ahead, the flight to the right
    const ship = new Cockpit(80 * MS, new THREE.Vector3(1, 0, 0));
    ship.autopilot = false;
    ship.fly(0.5);
    const nose = ship.flight.forward();
    ship.autopilot = true;
    ship.step({ yaw: 0, pitch: 0, roll: 0, thrust: 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false });
    expect(ship.steering.course.angleTo(nose)).toBeLessThan(0.01);
    ship.fly(4);
    const flight = convergence(ship.samples, nose);
    expect(flight.seconds).toBeLessThan(2.5);
    expect(flight.overshoot).toBeLessThan(2 * DEGREE);
    expect(flight.noseOff).toBeLessThan(DEGREE);
  });

  it('switches between autopilot and free drift in a turn with no jump beyond what drive and thrusters do', () => {
    const ship = new Cockpit(150 * MS);
    const goal = direction(1.5, 0.2);
    const hand = new Hand();
    const velocity = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    // the most a step can change: the drive and every thruster at once, the turn rate
    const push = (MAIN_THRUST + RCS_THRUST * Math.sqrt(3)) * STEP * 1.001;
    const turn = MAX_TURN_RATE * Math.SQRT2 * STEP * 1.001;
    for (let i = 0; i < 240; i++) {
      // T pressed every few frames, as fast as a hand can
      if (i % 7 === 0) ship.autopilot = !ship.autopilot;
      velocity.copy(ship.flight.velocity);
      orientation.copy(ship.flight.orientation);
      const controls = { yaw: 0, pitch: 0, roll: 0, thrust: 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false, ...hand.steer(ship, goal) };
      ship.step(controls);
      expect(ship.flight.velocity.distanceTo(velocity)).toBeLessThan(push);
      expect(ship.flight.orientation.angleTo(orientation)).toBeLessThan(turn);
      for (const command of [ship.out.yaw, ship.out.pitch, ship.out.thrust, ship.out.strafeX, ship.out.strafeY, ship.out.strafeZ]) expect(Math.abs(command)).toBeLessThanOrEqual(1);
    }
  });

  it('holds the course against gravity across the flight', () => {
    const ship = new Cockpit(100 * MS);
    ship.gravity.set(0, -196.2, 0);
    ship.fly(4);
    expect(ship.samples.at(-1)!.path.angleTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(DEGREE);
  });
});

describe('path steering at full speed', () => {
  it('turns at the speed limit about four times tighter than the thrusters alone, and stops turning when let go', () => {
    const ship = new Cockpit(MAX_SPEED);
    ship.fly(1.5, () => ({ yaw: 1 }));
    // a steady turn: the radius from how fast the path turns
    const v0 = ship.flight.velocity.clone();
    ship.fly(0.5, () => ({ yaw: 1 }));
    const radius = ship.flight.velocity.length() / (v0.angleTo(ship.flight.velocity) / 0.5);
    expect(ship.flight.velocity.length()).toBeGreaterThan(MAX_SPEED * 0.97);
    expect(radius).toBeLessThan(turnRadius(MAX_SPEED) * 1.15);
    expect(radius).toBeLessThan(turnRadius(MAX_SPEED, RCS_THRUST) / 3);
    // the nose leads into the turn: to the right of the path
    expect(ship.flight.toLocalDirection(ship.flight.velocity, new THREE.Vector3()).x).toBeLessThan(0);
    const released = ship.t;
    ship.fly(2);
    const flight = convergence(ship.samples, ship.steering.course, released);
    expect(flight.seconds).toBeLessThan(0.6);
    expect(flight.overshoot).toBeLessThan(DEGREE);
    expect(flight.noseOff).toBeLessThan(DEGREE);
  });

  it('takes a race bend at full drive as a hand steers it, keeping its speed', () => {
    const ship = new Cockpit(MAX_SPEED);
    const hand = new Hand();
    for (const goal of [direction(0.45), direction(-0.2, 0.25)]) {
      const from = ship.t;
      ship.fly(4, (cockpit) => ({ ...hand.steer(cockpit, goal), thrust: 1 }));
      const flight = convergence(ship.samples, goal, from);
      expect(flight.seconds).toBeLessThan(3);
      expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    }
    expect(Math.min(...ship.samples.map((sample) => sample.speed))).toBeGreaterThan(MAX_SPEED * 0.97);
  });
});

describe("a Host's hand on the flight school's lines", () => {
  /** A course's points in the pilot's frame, and its racing line from the origin. */
  const course = (layout: readonly (readonly [number, number, number])[]) => {
    const points = layout.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return { points, line: new RacingLine(points, false, new THREE.Vector3()) };
  };

  it('steers the curve at 100 m/s through every marker and flies straight on', () => {
    const { points, line } = course(CURVE_COURSE);
    const ship = new Cockpit(CURVE_SPEED);
    const flight = flyLine(ship, line, points, 0, 40);
    for (const closest of flight.closest) expect(closest).toBeLessThan(CURVE_ZONE);
  });

  it('flies the full-speed line at full drive through every ring, in time', () => {
    const { points, line } = course(LINE_COURSE);
    const ship = new Cockpit(0);
    const flight = flyLine(ship, line, points, 1, 40);
    for (const closest of flight.closest) expect(closest).toBeLessThan(RING_RADIUS * 0.5);
    expect(flight.seconds).toBeLessThan(line.length / LINE_PACE + LINE_SPARE);
  });
});

describe('the input recorder', () => {
  it('records a flight that replays the same through path steering', () => {
    const ship = new Cockpit(120 * MS);
    const hand = new Hand();
    const goal = direction(-1, 0.3);
    const recorder = new InputRecorder();
    const flight = ship.flight;
    for (let i = 0; i < 300; i++) {
      const controls = { yaw: 0, pitch: 0, roll: 0, thrust: 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false, ...hand.steer(ship, goal) };
      const frame = {
        t: ship.t,
        dt: STEP,
        mode: 'autopilot' as const,
        controls,
        pointer: [hand.pointer.x, hand.pointer.y] as [number, number],
        gravity: [0, 0, 0] as [number, number, number],
        position: flight.position.toArray(),
        velocity: flight.velocity.toArray(),
        orientation: flight.orientation.toArray() as [number, number, number, number],
        course: ship.steering.course.toArray(),
        cruise: ship.steering.cruise,
        recovering: ship.steering.recovering,
        drive: 1,
        thrusters: 1,
      };
      ship.step(controls);
      recorder.add({ ...frame, out: { ...ship.out } });
    }
    const replayed = replay(JSON.parse(recorder.json()));
    expect(replayed.flown).toBe(300);
    expect(replayed.position).toBeLessThan(1e-6);
    expect(replayed.cockpit.flight.position.distanceTo(flight.position)).toBeLessThan(1e-6);
  });
});
