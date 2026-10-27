import * as THREE from 'three';
import type { Controls } from '../input/input';

/** Display scale: one world unit is 5 cm, a ship is about 35 m long. */
export const METERS_PER_UNIT = 0.05;
/** Acceleration of the main drive at full thrust (units/s²): 127.5 m/s², 13 g. Hard and quick: the speed limit is two seconds away, and so is a stop. */
export const MAIN_THRUST = 2550;
/** Acceleration of the maneuvering thrusters along any axis (units/s²): 40 m/s², about 4 g, so a sidestep left and right throws off an aim. */
export const RCS_THRUST = 800;
/** Tournament rule: no ship's own push makes it faster than this (units/s, 250 m/s); the flight computer cuts any push of drive and thrusters beyond it. Gravity is no push of the ship's and pulls it past. */
export const MAX_SPEED = 5000;
/** The overdrive's shove along the nose (units/s, 150 m/s): past the tournament's limit, see Game.overdrive. */
export const OVERDRIVE_PUSH = 3000;
/**
 * Rotation rates the flight computer allows (rad/s) and how fast the thrusters reach them
 * (rad/s²): full rate in an eighth of a second, so the nose snaps where it is sent and
 * stops where it should; a half turn takes about a second.
 */
export const MAX_TURN_RATE = 3;
const MAX_ROLL_RATE = 3.2;
const TURN_ACCELERATION = 24;
/** How fast the visible drive output follows the thrust command (1/s): the flame is there at once and dies a little slower. */
const THROTTLE_RISE = 40;
const THROTTLE_FALL = 12;

const rotation = new THREE.Quaternion();
const axis = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const acceleration = new THREE.Vector3();
const targetRate = new THREE.Vector3();
const AXES = ['x', 'y', 'z'] as const;

/**
 * Newtonian flight model. The main drive pushes along the nose, the maneuvering thrusters
 * rotate the ship and push it slightly along every axis. Nothing slows the ship down:
 * to stop, the pilot flips the ship around and burns against the flight direction.
 * The flight computer damps rotation, so the ship stops turning when no turn is commanded.
 */
export class FlightModel {
  readonly position = new THREE.Vector3();
  readonly orientation = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  /** Rotation rate in ship space (rad/s): x = pitch, y = yaw, z = roll. */
  readonly angularVelocity = new THREE.Vector3();
  /** Thruster translation command in ship space of the last update, for effects. */
  readonly rcs = new THREE.Vector3();
  /** Rotation thrust of the last update in ship space, per axis -1..1 (x = pitch, y = yaw, z = roll), for effects: speeding up a turn and stopping it alike. */
  readonly turnThrust = new THREE.Vector3();
  /** The ship flies at the tournament's speed limit, so the flight computer holds the drive back. */
  limited = false;
  /** Visible main drive output 0..1. */
  throttle = 0;
  /** Health of the main drive and the maneuvering thrusters, 0..1. */
  driveFactor = 1;
  thrusterFactor = 1;

  reset(position: THREE.Vector3, orientation: THREE.Quaternion) {
    this.position.copy(position);
    this.orientation.copy(orientation);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.rcs.set(0, 0, 0);
    this.turnThrust.set(0, 0, 0);
    this.throttle = 0;
    this.driveFactor = this.thrusterFactor = 1;
  }

  /** Acceleration from the own engines in the last update (units/s²), what the pilot feels. */
  properAcceleration = 0;

  /**
   * Advances one step. Disturbances (e.g. venting air) are given in ship space: a push in
   * units/s² and a spin in rad/s² that the flight computer has to fight with the thrusters.
   */
  update(dt: number, controls: Controls, gravity: THREE.Vector3, push?: THREE.Vector3, spin?: THREE.Vector3) {
    const thrusters = this.thrusterFactor;
    targetRate.set(controls.pitch * MAX_TURN_RATE, -controls.yaw * MAX_TURN_RATE, -controls.roll * MAX_ROLL_RATE).multiplyScalar(0.3 + 0.7 * thrusters);
    const maxStep = TURN_ACCELERATION * thrusters * dt;
    for (const k of AXES) {
      const step = THREE.MathUtils.clamp(targetRate[k] - this.angularVelocity[k], -maxStep, maxStep);
      this.angularVelocity[k] += step;
      this.turnThrust[k] = maxStep > 0 ? step / maxStep : 0;
    }
    if (spin) this.angularVelocity.addScaledVector(spin, dt);
    const rate = this.angularVelocity.length();
    if (rate > 1e-6) {
      this.orientation.multiply(rotation.setFromAxisAngle(axis.copy(this.angularVelocity).divideScalar(rate), rate * dt));
      this.orientation.normalize();
    }

    const thrust = THREE.MathUtils.clamp(controls.thrust, 0, 1) * this.driveFactor;
    this.rcs.set(controls.strafeX, controls.strafeY, -controls.strafeZ).clampLength(0, 1);
    acceleration
      .copy(this.rcs).multiplyScalar(RCS_THRUST * thrusters)
      .add(local.set(0, 0, -MAIN_THRUST * thrust));
    // the tournament's speed limit: at MAX_SPEED the flight computer takes out every push that
    // would make the ship faster; turning, braking and sidestepping go on
    let drive = thrust;
    const speed = this.velocity.length();
    if (speed >= MAX_SPEED) {
      const course = this.toLocalDirection(this.velocity, local).divideScalar(speed);
      const faster = acceleration.dot(course);
      if (faster > 0) acceleration.addScaledVector(course, -faster);
      // the drive along the nose dies by the share of it that points along the course
      drive = thrust * (1 - Math.max(0, -course.z));
    }
    this.limited = speed >= MAX_SPEED;
    this.properAcceleration = acceleration.length();
    if (push) acceleration.add(push);
    acceleration.applyQuaternion(this.orientation);
    this.velocity.addScaledVector(acceleration, dt);
    // a step that crosses the limit ends on it, however long the frame was; at or past the
    // limit (after an overdrive, or a fall into a well) a push across the course turns the
    // flight but never adds speed
    const limit = Math.max(speed, MAX_SPEED);
    if (this.velocity.lengthSq() > limit * limit) this.velocity.setLength(limit);
    // gravity is no push of the ship's: the limit holds only against its own, so a well pulls
    // a ship past it, and the flight computer never brakes the speed it gained
    this.velocity.addScaledVector(gravity, dt);
    this.position.addScaledVector(this.velocity, dt);
    this.throttle += (drive - this.throttle) * (1 - Math.exp(-(drive > this.throttle ? THROTTLE_RISE : THROTTLE_FALL) * dt));
  }

  /** A world direction in ship space (-Z ahead, +X right, +Y up). */
  toLocalDirection(direction: THREE.Vector3, target = new THREE.Vector3()) {
    return target.copy(direction).applyQuaternion(inverse.copy(this.orientation).invert());
  }

  /** A world point in ship space, relative to the ship's center. */
  toLocal(point: THREE.Vector3, target = new THREE.Vector3()) {
    return this.toLocalDirection(target.subVectors(point, this.position), target);
  }

  /** A point in ship space in the world. */
  toWorld(point: THREE.Vector3, target = new THREE.Vector3()) {
    return target.copy(point).applyQuaternion(this.orientation).add(this.position);
  }

  forward(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.orientation);
  }

  up(target = new THREE.Vector3()) {
    return target.set(0, 1, 0).applyQuaternion(this.orientation);
  }

  /** Angle between the nose and a world direction (rad). */
  angleTo(direction: THREE.Vector3) {
    return this.forward(local).angleTo(direction);
  }

  /**
   * Yaw and pitch commands that turn the nose towards a world direction, as the flight
   * computer and the bots use them.
   */
  steer<T extends { yaw: number; pitch: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0 } as T): T {
    this.toLocalDirection(direction, local).normalize();
    // local: -Z is ahead, +X right, +Y up
    let yaw = Math.atan2(local.x, -local.z);
    const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    if (local.z > 0 && Math.abs(local.x) < 1e-3) yaw = Math.PI; // straight behind: pick a side
    target.yaw = THREE.MathUtils.clamp(yaw * gain, -1, 1);
    target.pitch = THREE.MathUtils.clamp(pitch * gain, -1, 1);
    return target;
  }

  /**
   * Commands for a head-over flip towards a world direction: the ship rolls until the
   * direction lies straight above its canopy, then pulls the nose up and over. The last
   * stretch is ordinary steering, where the roll angle would be meaningless. Writes into
   * `target` (yaw, pitch and roll), so the flight computer needs no new object per frame.
   */
  flip<T extends { yaw: number; pitch: number; roll: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0, roll: 0 } as T): T {
    this.toLocalDirection(direction, local).normalize();
    const off = Math.acos(THREE.MathUtils.clamp(-local.z, -1, 1));
    if (off < FLIP_STEER_ANGLE) {
      this.steer(direction, gain, target);
      target.roll = 0;
      return target;
    }
    // a goal behind and below is reached faster by pulling straight up and over than by
    // rolling half around first; the steering at the end takes out what is left
    const behind = Math.PI - off;
    const rollError = local.y < 0 && behind < FLIP_PULL_THROUGH ? 0 : Math.atan2(local.x, local.y);
    const aligned = Math.max(0, 1 - Math.abs(rollError) / FLIP_ROLL_TOLERANCE);
    target.yaw = 0;
    target.pitch = THREE.MathUtils.clamp(off * gain, 0, 1) * aligned;
    target.roll = THREE.MathUtils.clamp(rollError * gain, -1, 1);
    return target;
  }
}


/** The flight counts as on the nose within this angle (rad, 15°). */
export const ON_NOSE = (15 * Math.PI) / 180;
/**
 * The autopilot lets the nose lead the flight only as far as it brings the flight back within
 * ON_NOSE of it in this time (s) once the Host stops turning (see leadLimit): the slip it allows
 * is the slip it takes out that fast.
 */
export const LEAD_TIME = 1;
/** Below this speed (units/s, 1 m/s) the ship counts as at rest: the autopilot holds it still. Up to AUTO_MOVING (10 m/s) it blends into flying. */
const AUTO_REST = 20;
const AUTO_MOVING = 200;
/** The autopilot takes out the drift across the nose with this gain (1/s): a fifth of a second per e-fold. */
const AUTO_GAIN = 5;
/** From FREE_FROM to FREE of the speed limit the drive's push along the flight grows free: the limit takes it out. */
const FREE_FROM = 0.95;
const FREE = 0.99;
/** The lead's limit is reckoned for speeds in steps of LEAD_STEP (units/s, 10 m/s) up to LEAD_TOP (units/s, twice the limit), by simulating the recovery in steps of LEAD_DT (s). */
const LEAD_STEP = 200;
const LEAD_TOP = 2 * MAX_SPEED;
const LEAD_DT = 1 / 120;
/**
 * The reckoning takes the nose as still; a real turn ends with the nose still slowing, so it
 * reckons with this share of LEAD_TIME.
 */
const LEAD_SPARE = 0.85;
/** The reckoning tries leads LEAD_SCAN apart (rad, 3°), then narrows the first that fails down by halving. */
const LEAD_SCAN = Math.PI / 60;

const path = new THREE.Vector3();
const nose = new THREE.Vector3();
const across = new THREE.Vector3();
const demand = new THREE.Vector3();
const want = new THREE.Vector3();

/** The health of drive and thrusters a reckoning takes (see FlightModel.driveFactor). */
export type Health = Pick<FlightModel, 'driveFactor' | 'thrusterFactor'>;
const HEALTHY: Health = { driveFactor: 1, thrusterFactor: 1 };

/**
 * The autopilot: the ship flies where its nose points. The Host turns the nose as in free drift
 * (the stick is a turn rate), and the flight computer takes out the drift across the nose: the
 * thrusters push against it, and, while the Host holds the drive or the ship flies at the speed
 * limit (which takes out the drive's push along the flight), the main drive fires where they are
 * too weak: its share across the flight pulls the flight round. The speed along the nose is left
 * as it is: W adds to it, S brakes, gravity changes it as ever, and a turn costs what drift the
 * thrusters take out. At rest it holds the ship still.
 *
 * Drive and thrusters bend a fast flight slowly: the nose may lead the flight only as far as the
 * flight computer brings it back onto the nose within LEAD_TIME (see leadLimit). Turning on past
 * that, the nose waits for the flight; so the flight never slides far from the nose, the turn's
 * radius grows with the speed (see turnRadius), and free drift (the autopilot off) is where a
 * ship slides. Writes the commands for one step into `out`, from the Host's `controls` and the
 * gravity at the ship.
 */
export function flyByNose(flight: FlightModel, controls: Readonly<Controls>, gravity: THREE.Vector3, out: Controls): Controls {
  Object.assign(out, controls);
  const pilot = THREE.MathUtils.clamp(controls.thrust, 0, 1);
  // the lead's limit first: reckoning it the first time flies a ship of its own on the same scratch vectors
  const lead = THREE.MathUtils.lerp(leadLimit(flight.velocity.length(), false), leadLimit(flight.velocity.length(), true), pilot);
  const speed = sense(flight);
  const moving = THREE.MathUtils.smoothstep(speed, AUTO_REST, AUTO_MOVING);
  hold(flight, lead, moving, out);
  return bend(flight, speed, moving, pilot, gravity, controls, out);
}

/**
 * How long (s) the autopilot takes to bring a flight at `speed` (units/s) that trails the nose by
 * `lead` (rad) back within ON_NOSE of it, the nose held still, with no gravity, coasting or with
 * the Host's drive held (`driving`); at most `limit` seconds. The reckoning behind leadLimit.
 */
export function recovery(speed: number, lead: number, limit: number, driving: boolean): number {
  const flight = new FlightModel();
  flight.reset(new THREE.Vector3(), new THREE.Quaternion());
  flight.velocity.set(Math.sin(lead), 0, -Math.cos(lead)).multiplyScalar(speed);
  const idle: Controls = { yaw: 0, pitch: 0, roll: 0, thrust: driving ? 1 : 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false };
  const out: Controls = { ...idle };
  const none = new THREE.Vector3();
  for (let t = 0; t < limit; t += LEAD_DT) {
    const now = sense(flight);
    if (path.dot(nose) > Math.cos(ON_NOSE)) return t;
    Object.assign(out, idle);
    bend(flight, now, THREE.MathUtils.smoothstep(now, AUTO_REST, AUTO_MOVING), idle.thrust, none, idle, out);
    // the nose stays where it is: no turn
    out.yaw = out.pitch = out.roll = 0;
    flight.update(LEAD_DT, out, none);
  }
  return limit;
}

/** Sets `path` and `nose` for a step, and returns the speed. */
function sense(flight: FlightModel): number {
  const speed = flight.velocity.length();
  flight.forward(nose);
  if (speed > 1e-6) path.copy(flight.velocity).divideScalar(speed);
  else path.copy(nose);
  return speed;
}

/**
 * Holds the Host's turn to the lead's limit: the nose turns away from the flight no faster than
 * the thrusters can stop it at the limit, and not at all beyond it. A nose already beyond it
 * (switched on in a slide, after a shove, the brake or a flip) stays where it is while the flight
 * comes round, and turns towards the flight freely.
 */
function hold(flight: FlightModel, lead: number, moving: number, out: Controls) {
  if (moving <= 0 || lead >= Math.PI) return;
  // the flight in ship space: the turn towards it in yaw and pitch (+X right, +Y up)
  flight.toLocalDirection(path, across);
  const side = Math.hypot(across.x, across.y);
  if (side < 1e-6) return;
  const x = across.x / side;
  const y = across.y / side;
  const away = -(out.yaw * x + out.pitch * y);
  if (away <= 0) return;
  const slip = Math.acos(THREE.MathUtils.clamp(path.dot(nose), -1, 1));
  const thrusters = flight.thrusterFactor;
  const allowed = Math.sqrt(2 * TURN_ACCELERATION * thrusters * Math.max(0, lead - slip)) / (MAX_TURN_RATE * (0.3 + 0.7 * thrusters));
  const back = Math.max(0, away - allowed) * moving;
  out.yaw = THREE.MathUtils.clamp(out.yaw + x * back, -1, 1);
  out.pitch = THREE.MathUtils.clamp(out.pitch + y * back, -1, 1);
}

/**
 * Drive and thrusters take out the drift across the nose (at rest, every drift): the thrusters
 * first, the drive where they are too weak and its push along the flight is wanted (the Host's
 * drive) or free (at the speed limit). The Host's drive fires along the nose as ever, and the
 * Host's own thruster input on an axis goes first.
 */
function bend(flight: FlightModel, speed: number, moving: number, pilot: number, gravity: THREE.Vector3, controls: Readonly<Controls>, out: Controls): Controls {
  const thrust = MAIN_THRUST * flight.driveFactor;
  const thrusters = RCS_THRUST * flight.thrusterFactor;
  // the velocity wanted: the speed along the nose as it is; gravity is held off across the
  // flight, along it it changes the speed as ever (at rest, it is held off altogether)
  want.copy(nose).multiplyScalar(flight.velocity.dot(nose) * moving);
  demand.subVectors(want, flight.velocity).multiplyScalar(AUTO_GAIN).sub(gravity).addScaledVector(path, gravity.dot(path) * moving);
  across.copy(demand).addScaledVector(path, -demand.dot(path));
  const sideways = across.length();
  let drive = 0;
  const open = Math.max(pilot, THREE.MathUtils.smoothstep(speed / MAX_SPEED, FREE_FROM, FREE));
  if (sideways > thrusters && thrust > 0 && open > 0) {
    const share = nose.dot(across) / sideways;
    if (share > 0.05) drive = (open * moving * (sideways - thrusters)) / (thrust * share);
  }
  out.thrust = Math.max(pilot, THREE.MathUtils.clamp(drive, 0, 1));
  // the thrusters: what the drive leaves, across the flight first
  demand.addScaledVector(nose, -out.thrust * thrust);
  flight.toLocalDirection(demand, across).divideScalar(Math.max(thrusters, 1e-6));
  const side = Math.hypot(across.x, across.y);
  if (side > 1) across.multiplyScalar(1 / side);
  const room = Math.sqrt(Math.max(0, 1 - Math.min(1, side * side)));
  if (!controls.strafeX) out.strafeX = across.x;
  if (!controls.strafeY) out.strafeY = across.y;
  if (!controls.strafeZ) out.strafeZ = THREE.MathUtils.clamp(-across.z, -room, room);
  return out;
}

/** The lead's limit at each LEAD_STEP of speed (rad), coasting and with the drive held, each reckoned when first asked for (NaN until then; see leadLimit). */
const LEAD_STEPS = Math.ceil(LEAD_TOP / LEAD_STEP) + 1;
const leads = { coasting: new Float64Array(LEAD_STEPS).fill(NaN), driving: new Float64Array(LEAD_STEPS).fill(NaN) };

/**
 * The largest lead (rad) up to which the autopilot brings a flight at `speed` back within ON_NOSE
 * of the nose in LEAD_TIME, every smaller lead included: a nose turning away passes through every
 * lead on its way.
 */
function reckonLead(speed: number, driving: boolean): number {
  const fails = (lead: number) => recovery(speed, lead, LEAD_TIME * 2, driving) > LEAD_TIME * LEAD_SPARE;
  let low = ON_NOSE;
  while (low + LEAD_SCAN < Math.PI && !fails(low + LEAD_SCAN)) low += LEAD_SCAN;
  if (low + LEAD_SCAN >= Math.PI) return Math.PI;
  let high = low + LEAD_SCAN;
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    if (fails(mid)) high = mid;
    else low = mid;
  }
  return low;
}

/** The lead's limit at step `i` of LEAD_STEP (rad), coasting or `driving`, reckoned once. */
function leadAt(i: number, driving: boolean): number {
  const table = driving ? leads.driving : leads.coasting;
  if (Number.isNaN(table[i])) table[i] = reckonLead(i * LEAD_STEP, driving);
  return table[i];
}

/**
 * How far the nose may lead the flight at `speed` (units/s; rad, π for no limit), with the Host's
 * drive held (`driving`) or coasting: as far as the autopilot brings the flight back within
 * ON_NOSE of the nose in LEAD_TIME, with a healthy drive and thrusters, as recovery
 * reckons it. At a crawl the flight follows the nose at once; the faster the ship, the less the
 * nose may lead.
 */
export function leadLimit(speed: number, driving = true): number {
  const at = Math.min(Math.max(speed, 0) / LEAD_STEP, LEAD_STEPS - 1);
  const i = Math.min(Math.floor(at), LEAD_STEPS - 2);
  return THREE.MathUtils.lerp(leadAt(i, driving), leadAt(i + 1, driving), at - i);
}

/**
 * How hard the autopilot bends a flight at `speed` at most (units/s² across it), with the Host's
 * drive held or at the speed limit: the drive at the lead's limit (all of it from 90° on) and the
 * thrusters.
 */
export function gripAt(speed: number, health: Health = HEALTHY): number {
  return MAIN_THRUST * health.driveFactor * Math.sin(Math.min(leadLimit(speed), Math.PI / 2)) + RCS_THRUST * health.thrusterFactor;
}

/** The tightest turn the autopilot flies at a speed (units, radius). */
export const turnRadius = (speed: number, health: Health = HEALTHY) => (speed * speed) / gripAt(speed, health);

/** The fastest the autopilot takes a bend of a radius (units/s; found by halving, since the grip falls with the speed). */
export function cornerSpeed(radius: number, health: Health = HEALTHY): number {
  let low = 0;
  let high = LEAD_TOP;
  if (turnRadius(high, health) <= radius) return high;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (turnRadius(mid, health) <= radius) low = mid;
    else high = mid;
  }
  return low;
}

/** Below this angle between nose and goal (rad) the flip ends in ordinary steering. */
const FLIP_STEER_ANGLE = 0.35;
/** The nose only pulls up once the roll is this close to the goal (rad). */
const FLIP_ROLL_TOLERANCE = 0.6;
/** A goal below and within this angle of straight behind (rad, 70°) is reached by pulling up without rolling. */
const FLIP_PULL_THROUGH = 1.2;
