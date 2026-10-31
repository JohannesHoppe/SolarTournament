import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InputRecorder } from '../recorder';
import { Cockpit, Hand, STEP, convergence, flyLine, replay, slip } from '../test/cockpit';
import { RacingLine } from '../game/racingline';
import { CURVE_COURSE, CURVE_SPEED, CURVE_ZONE, LINE_COURSE, LINE_PACE, LINE_SPARE, RING_RADIUS } from '../game/school';
import { flyByNose, FlightModel, LEAD_TIME, leadLimit, MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, ON_NOSE, OVERDRIVE_PUSH, RCS_THRUST, turnRadius } from './flight';
import { IDLE } from '../input/input';
import { assistAim } from './computer';
import { arenaById } from '../world/arenas';
import { ARENA_LIMIT } from '../world/arena';
import { PLAUSIBLE_SPEED } from '../net/plausible';

/** A degree (rad). */
const DEGREE = Math.PI / 180;
/** 1 m/s in units/s. */
const MS = 20;

/** A direction `yaw` right of ahead (-Z) and `pitch` up (rad). */
const direction = (yaw: number, pitch = 0) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

/** Seconds from `from` until the flight stays within ON_NOSE of the nose for good. */
function backOnNose(cockpit: Cockpit, from: number) {
  let settled = Infinity;
  const after = cockpit.samples.filter((s) => s.t >= from);
  for (let i = after.length - 1; i >= 0 && slip(after[i]) <= ON_NOSE; i--) settled = after[i].t - from;
  return settled;
}

/** The stick held full to the right until the nose has turned `angle` (rad) from where it pointed: the time it took. */
function turnBy(cockpit: Cockpit, angle: number, thrust = 0) {
  const start = cockpit.flight.forward();
  const from = cockpit.t;
  while (cockpit.flight.forward().angleTo(start) < angle && cockpit.t - from < 20) cockpit.step({ ...IDLE, yaw: 1, thrust });
  return cockpit.t - from;
}

describe('the autopilot: the ship flies where its nose points', () => {
  it('at rest turns the nose as the stick says, and keeps the ship where it is', () => {
    const ship = new Cockpit(0);
    ship.fly(0.5, () => ({ yaw: 0.5 }));
    const turned = ship.flight.forward().angleTo(new THREE.Vector3(0, 0, -1));
    expect(turned).toBeGreaterThan(0.5 * MAX_TURN_RATE * 0.5 * 0.8);
    const nose = ship.flight.forward();
    ship.fly(1);
    // let go, the nose stops where it is
    expect(ship.flight.forward().angleTo(nose)).toBeLessThan(0.1);
    expect(ship.flight.velocity.length()).toBeLessThan(0.5 * MS);
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

  it('brings the flight onto the nose once the stick is let go, without swinging past', () => {
    const ship = new Cockpit(100 * MS);
    ship.fly(1, () => ({ yaw: 0.6, pitch: 0.3 }));
    const released = ship.t;
    ship.fly(3);
    const nose = ship.flight.forward();
    const flight = convergence(ship.samples, nose, released);
    expect(backOnNose(ship, released)).toBeLessThan(LEAD_TIME);
    expect(flight.seconds).toBeLessThan(1.5);
    expect(flight.overshoot).toBeLessThan(2 * DEGREE);
  });

  it('follows a hand that turns the nose to a goal, with eased strokes, overshoot and corrections', () => {
    const ship = new Cockpit(120 * MS);
    const goal = direction(1.2, 0.35);
    const hand = new Hand();
    ship.fly(6, (cockpit) => hand.steer(cockpit, goal));
    const flight = convergence(ship.samples, goal);
    expect(flight.seconds).toBeLessThan(4);
    expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    expect(flight.noseOff).toBeLessThan(1.5 * DEGREE);
  });

  it('turns about at 150 m/s as a Host does it: the brake, the nose round to a target behind, the drive back to the speed it had', () => {
    const ship = new Cockpit(150 * MS);
    const target = direction(Math.PI - 0.05);
    const hand = new Hand();
    // S held until the ship rests: the brake flips it against the flight and burns
    while (!ship.brake.rested && ship.t < 5) ship.step({ ...IDLE }, STEP, true);
    const rested = ship.t;
    // then the nose onto the target, W held until the speed is back
    let driving = true;
    ship.fly(8 - rested, (cockpit) => {
      driving &&= cockpit.flight.velocity.length() < 150 * MS;
      return { ...hand.steer(cockpit, target), thrust: driving ? 1 : 0 };
    });
    const flight = convergence(ship.samples, target);
    console.info(`Turning about at 150 m/s: at rest after ${rested.toFixed(1)} s, on the target within 2° after ${flight.seconds.toFixed(1)} s`);
    expect(flight.seconds).toBeLessThan(6);
    expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    expect(flight.noseOff).toBeLessThan(1.5 * DEGREE);
    expect(ship.flight.velocity.length()).toBeGreaterThan(145 * MS);
  });

  it('takes over from free drift where the nose points, the nose left where it is', () => {
    // sliding: the nose ahead, the flight 45° to the right
    const ship = new Cockpit(80 * MS, new THREE.Vector3(1, 0, -1));
    ship.autopilot = false;
    ship.fly(0.5);
    const nose = ship.flight.forward();
    ship.autopilot = true;
    const from = ship.t;
    ship.fly(4);
    expect(ship.flight.forward().angleTo(nose)).toBeLessThan(DEGREE);
    const flight = convergence(ship.samples, nose, from);
    expect(flight.seconds).toBeLessThan(2.5);
    expect(flight.overshoot).toBeLessThan(2 * DEGREE);
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
      const controls = { ...IDLE, ...hand.steer(ship, goal) };
      ship.step(controls);
      expect(ship.flight.velocity.distanceTo(velocity)).toBeLessThan(push);
      expect(ship.flight.orientation.angleTo(orientation)).toBeLessThan(turn);
      for (const command of [ship.out.yaw, ship.out.pitch, ship.out.thrust, ship.out.strafeX, ship.out.strafeY, ship.out.strafeZ]) expect(Math.abs(command)).toBeLessThanOrEqual(1);
    }
  });

  it('holds the flight on the nose against gravity across it', () => {
    const ship = new Cockpit(100 * MS);
    ship.gravity.set(0, -196.2, 0);
    ship.fly(4);
    expect(ship.samples.at(-1)!.path.angleTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(DEGREE);
  });

  it(`at any speed, after a hard turn, has the flight back within ${Math.round(ON_NOSE / DEGREE)}° of the nose within ${LEAD_TIME} s, and never lets the nose lead it farther than its limit`, () => {
    for (const speed of [30, 60, 100, 150, 200, 250].map((v) => v * MS)) {
      const ship = new Cockpit(speed);
      turnBy(ship, Math.PI / 2);
      const released = ship.t;
      ship.fly(3);
      const widest = Math.max(...ship.samples.map(slip));
      expect(widest, `${speed / MS} m/s`).toBeLessThan(leadLimit(speed) + 2 * DEGREE);
      expect(backOnNose(ship, released), `${speed / MS} m/s`).toBeLessThan(LEAD_TIME + 0.05);
    }
  });
});

describe('the autopilot at full speed', () => {
  it('turns at the speed limit more than twice as tight as the thrusters alone, and has the flight back on the nose after a 90° turn', () => {
    const ship = new Cockpit(MAX_SPEED);
    const seconds = turnBy(ship, Math.PI / 2);
    // a steady turn: the radius from how fast the flight turns
    const v0 = ship.samples.at(-31)!.path;
    const radius = MAX_SPEED / (v0.angleTo(ship.samples.at(-1)!.path) / (30 * STEP));
    const released = ship.t;
    ship.fly(3);
    const back = backOnNose(ship, released);
    console.info(`At the speed limit: a 90° turn of the nose takes ${seconds.toFixed(1)} s, on a radius of ${(radius / MS).toFixed(0)} m (thrusters alone ${(turnRadius(MAX_SPEED, { driveFactor: 0, thrusterFactor: 1 }) / MS).toFixed(0)} m); the flight is back within ${Math.round(ON_NOSE / DEGREE)}° of the nose ${back.toFixed(2)} s after letting go, the slip at most ${(Math.max(...ship.samples.map(slip)) / DEGREE).toFixed(0)}°`);
    expect(ship.flight.velocity.length()).toBeGreaterThan(MAX_SPEED * 0.97);
    expect(radius).toBeLessThan(turnRadius(MAX_SPEED) * 1.1);
    expect(radius).toBeLessThan((MAX_SPEED * MAX_SPEED) / RCS_THRUST / 2);
    expect(back).toBeLessThan(LEAD_TIME + 0.05);
    expect(convergence(ship.samples, ship.flight.forward(), released).overshoot).toBeLessThan(DEGREE);
  });

  it('takes a race bend at full drive as a hand steers it, keeping its speed', () => {
    const ship = new Cockpit(MAX_SPEED);
    const hand = new Hand();
    for (const goal of [direction(0.45), direction(-0.2, 0.25)]) {
      const from = ship.t;
      ship.fly(5, (cockpit) => ({ ...hand.steer(cockpit, goal), thrust: 1 }));
      const flight = convergence(ship.samples, goal, from);
      expect(flight.seconds).toBeLessThan(4);
      expect(flight.overshoot).toBeLessThan(3 * DEGREE);
    }
    expect(Math.min(...ship.samples.map((sample) => sample.speed))).toBeGreaterThan(MAX_SPEED * 0.97);
  });
});

describe('free drift', () => {
  it('turns the nose and nothing else: the flight keeps its direction and speed', () => {
    const ship = new Cockpit(MAX_SPEED);
    ship.autopilot = false;
    turnBy(ship, Math.PI / 2);
    ship.fly(2);
    const last = ship.samples.at(-1)!;
    expect(last.path.angleTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-6);
    expect(Math.abs(last.speed - MAX_SPEED)).toBeLessThan(1e-6);
    expect(slip(last)).toBeGreaterThan(Math.PI / 2 - 0.1);
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
  it('records a flight that replays the same through the autopilot', () => {
    const ship = new Cockpit(120 * MS);
    const hand = new Hand();
    const goal = direction(-1, 0.3);
    const recorder = new InputRecorder();
    const flight = ship.flight;
    for (let i = 0; i < 300; i++) {
      const controls = { ...IDLE, ...hand.steer(ship, goal) };
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

  it('replays the aim assist toward the ship it pulled the nose onto', () => {
    const ship = new Cockpit(80 * MS);
    const flight = ship.flight;
    // a rival 3° off the nose, inside the assist's cone (AIM_ASSIST_ANGLE)
    const rival = direction(3 * DEGREE).multiplyScalar(2000 * MS);
    const recorder = new InputRecorder();
    for (let i = 0; i < 120; i++) {
      const aim = rival.clone().sub(flight.position);
      flyByNose(flight, IDLE, ship.gravity, ship.out);
      assistAim(flight, aim, ship.out);
      recorder.add({
        t: ship.t,
        dt: STEP,
        mode: 'autopilot',
        controls: { ...IDLE },
        pointer: null,
        aim: aim.toArray(),
        out: { ...ship.out },
        gravity: [0, 0, 0],
        position: flight.position.toArray(),
        velocity: flight.velocity.toArray(),
        orientation: flight.orientation.toArray() as [number, number, number, number],
        drive: 1,
        thrusters: 1,
      });
      flight.update(STEP, ship.out, ship.gravity);
      ship.t += STEP;
    }
    const recording = JSON.parse(recorder.json());
    const replayed = replay(recording);
    expect(flight.angleTo(rival.clone().sub(flight.position))).toBeLessThan(1 * DEGREE);
    expect(replayed.cockpit.flight.position.distanceTo(flight.position)).toBeLessThan(1e-6);
    // without the pull the replay flies another way: the recording needs its aim
    for (const frame of recording.frames) delete frame.aim;
    expect(replay(recording).cockpit.flight.position.distanceTo(flight.position)).toBeGreaterThan(1);
  });
});

/**
 * A ship dropped towards the black hole of Event Horizon from `distance` (units) at `speed`
 * (units/s), its nose on the hole and its drive at `thrust`, until it touches the horizon or
 * `seconds` pass. Returns its speed after every step.
 */
function fall(distance: number, speed: number, thrust: number, seconds = 30) {
  const well = arenaById('hole')!.layout.well!;
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(distance, 0, 0).add(well.position), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)));
  flight.velocity.set(-speed, 0, 0);
  const gravity = new THREE.Vector3();
  const controls = { ...IDLE, thrust };
  const speeds: number[] = [];
  for (let t = 0; t < seconds && flight.position.distanceTo(well.position) > well.radius; t += STEP) {
    gravity.subVectors(well.position, flight.position);
    const r = Math.max(gravity.length(), well.radius);
    gravity.setLength((well.surfaceGravity * well.radius * well.radius) / (r * r));
    flight.update(STEP, controls, gravity);
    speeds.push(flight.velocity.length());
  }
  return speeds;
}

describe('the speed limit', () => {
  it('holds against the own drive and thrusters: a full burn never passes it', () => {
    const flight = new FlightModel();
    flight.reset(new THREE.Vector3(), new THREE.Quaternion());
    const controls = { ...IDLE, thrust: 1, strafeZ: 1, strafeX: 1 };
    for (let t = 0; t < 5; t += STEP) flight.update(STEP, controls, new THREE.Vector3());
    expect(flight.velocity.length()).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
    expect(flight.velocity.length()).toBeGreaterThan(MAX_SPEED * 0.999);
  });

  it("holds only against the ship's own push: a well pulls it past, and the flight computer never brakes that back", () => {
    // at the limit, the drive burning towards the hole from 1.5 km
    const burning = fall(30000, MAX_SPEED, 1);
    expect(Math.max(...burning)).toBeGreaterThan(MAX_SPEED * 1.3);
    // drifting in, the speed only grows on the way down
    const drifting = fall(30000, MAX_SPEED, 0);
    for (let i = 1; i < drifting.length; i++) expect(drifting[i]).toBeGreaterThanOrEqual(drifting[i - 1] - 1e-6);
    expect(drifting[drifting.length - 1]).toBeGreaterThan(MAX_SPEED * 1.3);
  });

  it("keeps a fall into the black hole inside the cheat checks' bound on speed", () => {
    // from the arena's edge at the limit plus an overdrive's shove, burning all the way down
    const speeds = fall(ARENA_LIMIT, MAX_SPEED + OVERDRIVE_PUSH, 1, 60);    expect(Math.max(...speeds)).toBeLessThan(PLAUSIBLE_SPEED * 0.7);
  });
});
