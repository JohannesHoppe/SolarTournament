import * as THREE from 'three';
import type { Controls } from '../input/input';
import { acos, atan2, cos, exp, hypot, sin } from '../detmath';
import { angleTo, setFromAxisAngle } from '../detthree';

/** Display scale: one world unit is 5 cm, a ship is about 35 m long. */
export const METERS_PER_UNIT = 0.05;
/** Acceleration of the main drive at full thrust (units/s²): 127.5 m/s², 13 g. Hard and quick: the speed limit is two seconds away, and so is a stop. */
export const MAIN_THRUST = 2550;
/** Acceleration of the maneuvering thrusters along any axis (units/s²): 100 m/s², about 10 g, so a sidestep throws off an aim and a flight at the limit bends hard round with the drive. */
export const RCS_THRUST = 2000;
/** Tournament rule: no ship's own push makes it faster than this (units/s, 250 m/s); the flight computer cuts any push of drive and thrusters beyond it. Gravity is no push of the ship's and pulls it past. */
export const MAX_SPEED = 5000;
/**
 * The overdrive's shove (units/s, 200 m/s): past the tournament's limit, see Game.overdrive. Rammed
 * from behind at that much faster, a drive or a flank goes down and the rammer's armored nose holds
 * (see impact's RAM_SCALE).
 */
export const OVERDRIVE_PUSH = 4000;
/** After the overdrive the main drive glows and gives no thrust for this long (s). */
export const OVERDRIVE_DRIVE_COOLDOWN = 4;
/**
 * Rotation rates the flight computer allows (rad/s) and how fast the thrusters reach them
 * (rad/s²): full rate in an eighth of a second, so the nose snaps where it is sent and
 * stops where it should; a half turn takes about a second.
 */
export const MAX_TURN_RATE = 3;
export const MAX_ROLL_RATE = 3.2;
export const TURN_ACCELERATION = 24;
/** How fast the visible drive output follows the thrust command (1/s): the flame is there at once and dies a little slower. */
const THROTTLE_RISE = 40;
const THROTTLE_FALL = 12;

const rotation = new THREE.Quaternion();
const axis = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const acceleration = new THREE.Vector3();
const before = new THREE.Vector3();
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
      this.orientation.multiply(setFromAxisAngle(rotation, axis.copy(this.angularVelocity).divideScalar(rate), rate * dt));
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
    before.copy(this.velocity);
    this.velocity.addScaledVector(acceleration, dt);
    // a step that crosses the limit ends on it, however long the frame was; at or past the
    // limit (after an overdrive, or a fall into a well) a push across the course turns the
    // flight but never adds speed
    const limit = Math.max(speed, MAX_SPEED);
    if (this.velocity.lengthSq() > limit * limit) {
      const pushed = acceleration.length() * dt;
      this.velocity.setLength(limit);
      // the ship is held at the limit: a drag that takes a little each step (a planet's air)
      // leaves the drive only that little to give back, so the flame and the load on the clone
      // are the share of the push the limit let through
      const share = pushed > 1e-9 ? Math.min(1, this.velocity.distanceTo(before) / pushed) : 0;
      this.limited = true;
      this.properAcceleration *= share;
      drive *= share;
    }
    // gravity is no push of the ship's: the limit holds only against its own, so a well pulls
    // a ship past it, and the flight computer never brakes the speed it gained
    this.velocity.addScaledVector(gravity, dt);
    this.position.addScaledVector(this.velocity, dt);
    this.throttle += (drive - this.throttle) * (1 - exp(-(drive > this.throttle ? THROTTLE_RISE : THROTTLE_FALL) * dt));
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
  noseAngleTo(direction: THREE.Vector3) {
    return angleTo(this.forward(local), direction);
  }

  /**
   * Yaw and pitch commands that turn the nose towards a world direction, as the flight
   * computer and the bots use them.
   */
  steer<T extends { yaw: number; pitch: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0 } as T): T {
    this.toLocalDirection(direction, local).normalize();
    // local: -Z is ahead, +X right, +Y up
    let yaw = atan2(local.x, -local.z);
    const pitch = atan2(local.y, hypot(local.x, local.z));
    if (local.z > 0 && Math.abs(local.x) < 1e-3) yaw = Math.PI; // straight behind: pick a side
    target.yaw = THREE.MathUtils.clamp(yaw * gain, -1, 1);
    target.pitch = THREE.MathUtils.clamp(pitch * gain, -1, 1);
    return target;
  }

  /**
   * Yaw, pitch and roll commands that turn the ship into a whole attitude, nose and roll alike
   * (`goal`, a world orientation), the shortest way round; how far it still is (rad) is returned
   * in `target.off`. Writes into `target`.
   */
  attitude<T extends { yaw: number; pitch: number; roll: number; off?: number }>(goal: THREE.Quaternion, gain = 2.5, target: T = { yaw: 0, pitch: 0, roll: 0 } as T): T {
    // the turn still to make, in the ship's own frame, as an axis times its angle
    inverse.copy(this.orientation).invert().multiply(goal);
    if (inverse.w < 0) inverse.set(-inverse.x, -inverse.y, -inverse.z, -inverse.w);
    const sine = hypot(inverse.x, inverse.y, inverse.z);
    const angle = 2 * atan2(sine, inverse.w);
    const scale = sine > 1e-9 ? angle / sine : 2;
    // the rate the commands ask for is (pitch, -yaw, -roll) in ship space (see update)
    target.pitch = THREE.MathUtils.clamp(inverse.x * scale * gain, -1, 1);
    target.yaw = THREE.MathUtils.clamp(-inverse.y * scale * gain, -1, 1);
    target.roll = THREE.MathUtils.clamp((-inverse.z * scale * gain * MAX_TURN_RATE) / MAX_ROLL_RATE, -1, 1);
    target.off = angle;
    return target;
  }

  /**
   * Commands for a flip towards a world direction: a flat turn, the nose swung round sideways,
   * level, and only at the end up or down as far as the direction lies above or below (a goal
   * steeply above or below is steered to straight away), with no roll of its own:
   * the flight computer holds the ship upright meanwhile (keepUpright, in ship/computer), so it
   * swings round about the arena's up and a ground beside it stays where it was; the shortest way
   * round, a goal straight behind turned to one side. Writes into `target` (yaw, pitch and roll),
   * so the flight computer needs no new object per frame.
   */
  flip<T extends { yaw: number; pitch: number; roll: number }>(direction: THREE.Vector3, gain = 2.5, target: T = { yaw: 0, pitch: 0, roll: 0 } as T): T {
    this.steer(direction, gain, target);
    // level until the nose has swung round to within FLIP_LEVEL of the goal's bearing; then (or
    // for a goal steeply above or below, FLIP_STEEP) ordinary steering takes the rest
    this.toLocalDirection(direction, local).normalize();
    const bearing = Math.abs(atan2(local.x, -local.z));
    const steep = Math.abs(atan2(local.y, hypot(local.x, local.z))) > FLIP_STEEP;
    if (bearing > FLIP_LEVEL && !steep) target.pitch = 0;
    target.roll = 0;
    return target;
  }
}


/** A flip swings the nose round level until it is within this angle (rad, about 25°) of the goal's bearing. */
const FLIP_LEVEL = 0.45;
/** A goal more than this angle (rad, 45°) above or below the ship's level is steered to at once. */
const FLIP_STEEP = Math.PI / 4;

/** The flight counts as on the nose within this angle (rad, 15°). */
export const ON_NOSE = (15 * Math.PI) / 180;
/**
 * The autopilot lets the nose lead the flight only as far as it brings the flight back within
 * ON_NOSE of it in this time (s) once the Host stops turning (see leadLimit): the slip it allows
 * is the slip it takes out that fast.
 */
export const LEAD_TIME = 1;
/**
 * Below this speed (units/s, 1 m/s) the ship counts as at rest: the autopilot holds it still
 * (from half of it down it takes out the speed along the nose too; above AUTO_REST that speed is
 * kept, however slow). Up to AUTO_MOVING (10 m/s) the hold of gravity and of the nose's lead
 * blends into flying.
 */
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
  flight.velocity.set(sin(lead), 0, -cos(lead)).multiplyScalar(speed);
  const idle: Controls = { yaw: 0, pitch: 0, roll: 0, thrust: driving ? 1 : 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false };
  const out: Controls = { ...idle };
  const none = new THREE.Vector3();
  for (let t = 0; t < limit; t += LEAD_DT) {
    const now = sense(flight);
    if (path.dot(nose) > cos(ON_NOSE)) return t;
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
  const side = hypot(across.x, across.y);
  if (side < 1e-6) return;
  const x = across.x / side;
  const y = across.y / side;
  const away = -(out.yaw * x + out.pitch * y);
  if (away <= 0) return;
  const slip = acos(THREE.MathUtils.clamp(path.dot(nose), -1, 1));
  const thrusters = flight.thrusterFactor;
  const allowed = Math.sqrt(2 * TURN_ACCELERATION * thrusters * Math.max(0, lead - slip)) / (MAX_TURN_RATE * (0.3 + 0.7 * thrusters));
  if (away <= allowed) return;
  // the turn nearest the Host's that turns away no faster than allowed: on the line where it
  // turns away at exactly that rate, the point nearest the Host's turn, `t` along the line from
  // there (along (-y, x), square to the flight). The hold only takes back what the Host turns:
  // each axis stays between nothing and the Host's own command, so it never turns the nose on
  // an axis the Host does not (a level turn with the nose up or down would otherwise pitch
  // towards the flight, which lies a little above or below the nose, and spiral into a climb
  // or a dive)
  const yaw = out.yaw + x * (away - allowed);
  const pitch = out.pitch + y * (away - allowed);
  let low = -Infinity;
  let high = Infinity;
  for (const [at, step, command] of [
    [yaw, -y, out.yaw],
    [pitch, x, out.pitch],
  ]) {
    const from = Math.min(0, command) - at;
    const to = Math.max(0, command) - at;
    if (Math.abs(step) < 1e-9) {
      if (from > 1e-9 || to < -1e-9) return stop(out, moving);
      continue;
    }
    low = Math.max(low, Math.min(from / step, to / step));
    high = Math.min(high, Math.max(from / step, to / step));
  }
  if (low > high) return stop(out, moving);
  const t = THREE.MathUtils.clamp(0, low, high);
  out.yaw = THREE.MathUtils.lerp(out.yaw, yaw - y * t, moving);
  out.pitch = THREE.MathUtils.lerp(out.pitch, pitch + x * t, moving);
}

/** The Host's turn held back altogether (`moving` of it): the nose waits for the flight. */
function stop(out: Controls, moving: number) {
  out.yaw *= 1 - moving;
  out.pitch *= 1 - moving;
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
  // the velocity wanted: the speed along the nose as it is (at rest, none); gravity is held off
  // across the flight, along it it changes the speed as ever (at rest, it is held off altogether).
  // The kept speed has no share of `moving`, which would brake a slow coast to rest by itself
  want.copy(nose).multiplyScalar(flight.velocity.dot(nose) * THREE.MathUtils.smoothstep(speed, AUTO_REST / 2, AUTO_REST));
  demand.subVectors(want, flight.velocity).multiplyScalar(AUTO_GAIN).sub(gravity).addScaledVector(path, gravity.dot(path) * moving);
  across.copy(demand).addScaledVector(path, -demand.dot(path));
  const sideways = across.length();
  let drive = 0;
  const free = THREE.MathUtils.smoothstep(speed / MAX_SPEED, FREE_FROM, FREE);
  const open = Math.max(pilot, free);
  if (sideways > thrusters && thrust > 0 && open > 0) {
    const share = nose.dot(across) / sideways;
    if (share > 0.05) drive = (open * moving * (sideways - thrusters)) / (thrust * share);
  }
  out.thrust = Math.max(pilot, THREE.MathUtils.clamp(drive, 0, 1));
  // the thrusters: what the drive leaves, across the flight first; the drive's push along the
  // flight is wanted as far as it is the Host's or free, so the thrusters never burn against it
  const wanted = Math.max(pilot, out.thrust * free) * thrust * nose.dot(path);
  demand.addScaledVector(nose, -out.thrust * thrust).addScaledVector(path, wanted);
  // across the flight first, wherever the nose points, with all of the thrusters if need be (in
  // a hard turn the nose leads the flight far, and a push across the nose would bend it only by
  // the lead's cosine); what they have left goes along the flight
  const along = demand.dot(path);
  across.copy(demand).addScaledVector(path, -along);
  const side = across.length();
  if (side > thrusters) across.multiplyScalar(thrusters / side);
  const room = Math.sqrt(Math.max(0, thrusters * thrusters - Math.min(side, thrusters) * Math.min(side, thrusters)));
  across.addScaledVector(path, THREE.MathUtils.clamp(along, -room, room));
  flight.toLocalDirection(across, across).divideScalar(Math.max(thrusters, 1e-6));
  if (!controls.strafeX) out.strafeX = across.x;
  if (!controls.strafeY) out.strafeY = across.y;
  if (!controls.strafeZ) out.strafeZ = -across.z;
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
 * How hard a flight at `speed` bends at most (units/s² across it). With the autopilot, the Host's
 * drive held or at the speed limit: the drive at the lead's limit (all of it from 90° on) and the
 * thrusters. In free drift (`autopilot` false) the Host turns the nose across the flight and burns:
 * the drive alone, all of it.
 */
export function gripAt(speed: number, health: Health = HEALTHY, autopilot = true): number {
  if (!autopilot) return MAIN_THRUST * health.driveFactor;
  return MAIN_THRUST * health.driveFactor * sin(Math.min(leadLimit(speed), Math.PI / 2)) + RCS_THRUST * health.thrusterFactor;
}

/** The tightest turn flown at a speed (units, radius), with the autopilot or in free drift. */
export const turnRadius = (speed: number, health: Health = HEALTHY, autopilot = true) => (speed * speed) / gripAt(speed, health, autopilot);

/** The fastest a bend of a radius is taken (units/s; found by halving, since the autopilot's grip falls with the speed), with the autopilot or in free drift. */
export function cornerSpeed(radius: number, health: Health = HEALTHY, autopilot = true): number {
  let low = 0;
  let high = LEAD_TOP;
  if (turnRadius(high, health, autopilot) <= radius) return high;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (turnRadius(mid, health, autopilot) <= radius) low = mid;
    else high = mid;
  }
  return low;
}

const sight = new THREE.Vector3();
const sideways = new THREE.Vector3();

/**
 * The overdrive's shove (OVERDRIVE_PUSH long) into `out`: along the nose, or, with whatever the
 * aim assist holds (`target`: a ship or a torpedo, where it is and how it moves), on a ram course: it first takes out the drift across the line to
 * the target (what would carry the ship past it) and puts the rest along that line, so the two
 * close straight on. A drift across larger than the shove takes all of it.
 */
export function overdriveShove(flight: FlightModel, target: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 } | null, out: THREE.Vector3): THREE.Vector3 {
  if (!target) return flight.forward(out).multiplyScalar(OVERDRIVE_PUSH);
  sight.subVectors(target.position, flight.position);
  const range = sight.length();
  if (range < 1) return flight.forward(out).multiplyScalar(OVERDRIVE_PUSH);
  sight.divideScalar(range);
  // the drift across the line of sight, relative to the target
  sideways.subVectors(flight.velocity, target.velocity);
  sideways.addScaledVector(sight, -sideways.dot(sight));
  const drift = sideways.length();
  if (drift >= OVERDRIVE_PUSH) return out.copy(sideways).multiplyScalar(-OVERDRIVE_PUSH / drift);
  return out.copy(sideways).negate().addScaledVector(sight, Math.sqrt(OVERDRIVE_PUSH * OVERDRIVE_PUSH - drift * drift));
}
