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

/**
 * The up of a view along `course` (unit, into `out`): the ship's up made square to it, or, for a
 * course straight along the ship's up, its tail. The chase camera looks so, and the Host's input
 * turns the course about these axes, as it sees them.
 */
export function courseUp(flight: FlightModel, course: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  flight.up(out);
  if (Math.abs(out.dot(course)) > 0.99) flight.forward(out).negate();
  return out.addScaledVector(course, -out.dot(course)).normalize();
}

/**
 * Path steering leads the nose at most this far into a turn (rad, 60°), so the way ahead stays
 * in view; the main drive then bends the path with sin 60° of its thrust.
 */
const PATH_LEAD_MAX = Math.PI / 3;
/**
 * How hard path steering bends the path at most (units/s² across it, 150 m/s², about 15 g):
 * the main drive led 60° into the turn plus the thrusters. At the speed limit that is a turn of
 * 415 m radius; the thrusters alone (4 g) would need 1.56 km.
 */
export const PATH_GRIP = MAIN_THRUST * Math.sin(PATH_LEAD_MAX) + RCS_THRUST;
/** How hard path steering bends a ship's path as its drive and thrusters are now (units/s²; see PATH_GRIP). */
export const gripOf = (flight: FlightModel) => MAIN_THRUST * flight.driveFactor * Math.sin(PATH_LEAD_MAX) + RCS_THRUST * flight.thrusterFactor;
/** The tightest turn path steering flies at a speed (units, radius), with a grip (units/s²). */
export const turnRadius = (speed: number, grip = PATH_GRIP) => (speed * speed) / grip;
/** The fastest a ship takes a bend of a radius (units/s), with a grip (units/s²). */
export const cornerSpeed = (radius: number, grip = PATH_GRIP) => Math.sqrt(grip * radius);
/**
 * The course leads the flight by at most this angle (rad, 150°): turning on past it, the Host
 * moves it along as the flight comes round. So a course never lies straight behind the flight,
 * and a turn about never changes its side halfway.
 */
const COURSE_LEAD_MAX = (5 * Math.PI) / 6;
/** The flight computer pulls the flight onto the course with this gain (1/s): a third of a second per e-fold, without overshoot. */
const PATH_GAIN = 3;
/** Below this speed (units/s, 1 m/s) the ship counts as at rest: no path to bend, the course only turns the nose. Up to PATH_MOVING (10 m/s) the two blend. */
const PATH_REST = 20;
const PATH_MOVING = 200;
/** The flight counts as on its course within this angle (rad, about 20°): the speed it flies there is the speed the Host wants (see PathSteering.cruise). */
const CRUISE_ANGLE = 0.35;
/** The nose leads into a turn once the drive's share of it grows to this share of its thrust (0..1), not at once. */
const PATH_LEAD_ONSET = 0.25;
/** From PATH_FREE_FROM to PATH_FREE of the speed limit the drive's push along the path grows free: the limit takes it out. */
const PATH_FREE_FROM = 0.95;
const PATH_FREE = 0.99;
/** Without its push along the path wanted, the drive fires from a nose within PATH_SQUARE_FROM (cosine, about 25°) of where it should point, fully within PATH_SQUARE (about 10°). */
const PATH_SQUARE_FROM = 0.9;
const PATH_SQUARE = 0.985;
/** How long the nose takes to go from leading square to the path to leading as little as it can, and back (s), when the drive's push along the path becomes wanted or not. */
const PATH_OPEN_TIME = 0.4;
/** The Host's drive fires with the nose from PILOT_FROM (cosine, 100°) and fully within PILOT_FULL (cosine, 70°) of the course: a nose led into a turn still pushes, one pointing back does not. */
const PILOT_FROM = -0.17;
const PILOT_FULL = 0.34;
/** Steering gain of the nose onto its goal (see FlightModel.steer). */
const PATH_STEER = 2.5;

const path = new THREE.Vector3();
const nose = new THREE.Vector3();
const turn = new THREE.Vector3();
const across = new THREE.Vector3();
const bent = new THREE.Vector3();
const demand = new THREE.Vector3();
const rest = new THREE.Vector3();
const drive = new THREE.Vector3();
const goal = new THREE.Vector3();
const reference = new THREE.Vector3();

/**
 * Path steering, the autopilot's way of flying, the same at every speed: the Host's turn input
 * (mouse pointer, arrow keys, stick) moves a course, a direction in the world, and the flight
 * computer brings the flight onto it as fast as drive and thrusters allow. The course stays where
 * the Host put it while the ship and the camera swing; only the Host's input moves it, at most as
 * fast as the path can follow (see PathSteering.rate). Centered input leaves the course where it
 * is, so once the flight is on it, the ship flies straight on.
 *
 * How the flight comes round: the course's own turn carries the path along, and the flight
 * computer pulls the rest of the way, the speed held (see `cruise`). Up to 4 g the thrusters do
 * it alone, the nose on the course; beyond that it leads the nose into the turn and fires the
 * main drive, so its push across the flight bends the path. Where the drive's push along the path
 * is wanted (the Host's drive, speed given back after a turn about) or free (at the speed limit,
 * which takes it out) the nose leads as little as the bend allows, at most PATH_LEAD_MAX;
 * otherwise square to the path, so a turn adds no speed the Host did not ask for. A course behind
 * the flight is a turn about: the nose swings round against the flight and the drive burns until
 * the flight points along the course, at the speed it had. At rest the course only turns the nose,
 * and the thrusters hold the ship still. The Host's own thruster input on an axis goes first and
 * leaves the course where it is: a sidestep, after which the thrusters bring the flight back
 * parallel to the course.
 */
export class PathSteering {
  /** Where the Host wants to fly (unit length): only the Host's turn input moves it, never the camera or the nose. */
  readonly course = new THREE.Vector3(0, 0, -1);
  /** How fast the Host's input turns the course now (world axis times rad/s). */
  readonly turning = new THREE.Vector3();
  /**
   * The speed the Host flies at (units/s): it follows the speed while the flight is on its course
   * (within CRUISE_ANGLE), grows with every gain of speed, and holds through a turn, so a turn
   * about comes out as fast as it went in.
   */
  cruise = 0;
  /** A turn about is under way: the speed it cost is given back once the flight is round. */
  recovering = false;
  /** How far the drive's push along the path is wanted or free (0..1), eased (see PATH_OPEN_TIME). */
  private open = 0;
  /** The side the flight bends to (unit, across the flight), kept while the course lies nearly straight behind it, so the turn does not change sides. */
  private readonly bendSide = new THREE.Vector3(1, 0, 0);

  /**
   * The course follows the nose and the cruise the speed: in free drift, while the brake or the
   * flip turns the ship, on a swing or after a dodge. The autopilot takes over from there without
   * a jolt: the flight comes round to where the ship points.
   */
  follow(flight: FlightModel) {
    flight.forward(this.course);
    this.turning.set(0, 0, 0);
    this.cruise = flight.velocity.length();
    this.recovering = false;
  }

  /** How fast full input turns the course (rad/s): as fast as the nose turns, but never faster than drive and thrusters bend the path (see gripOf). */
  static rate(flight: FlightModel) {
    return Math.min(MAX_TURN_RATE * (0.3 + 0.7 * flight.thrusterFactor), gripOf(flight) / Math.max(flight.velocity.length(), 1e-6));
  }

  /**
   * Writes the commands for one step into `out`, from the Host's `controls` and the course. With
   * `braking` (the brake held) the computer brakes the ship to rest instead of holding its speed,
   * flipping the nose against the flight and burning, and still bends the flight onto the course
   * meanwhile: braking changes the speed, not where the Host wants to go. Let go, the autopilot
   * flies on at the speed left.
   */
  fly(flight: FlightModel, controls: Readonly<Controls>, gravity: THREE.Vector3, dt: number, out: Controls, braking = false) {
    const speed = this.turn(flight, controls, dt);
    const moving = THREE.MathUtils.smoothstep(speed, PATH_REST, PATH_MOVING);
    this.steer(flight, controls, gravity, dt, speed, moving, out, braking);
  }

  /**
   * Turns the course by the Host's input, about the up and right of the view along it (as the
   * screen shows it, see courseUp); it never pushes the course farther than COURSE_LEAD_MAX ahead of the flight (or,
   * at rest, of the nose). Sets `path` and `nose`, and returns the speed.
   */
  private turn(flight: FlightModel, controls: Readonly<Controls>, dt: number): number {
    const speed = flight.velocity.length();
    flight.forward(nose);
    if (speed > 1e-6) path.copy(flight.velocity).divideScalar(speed);
    else path.copy(this.course);
    // the screen's axes: the camera looks along the course, the ship's up kept up (see courseUp)
    const rate = PathSteering.rate(flight);
    courseUp(flight, this.course, across);
    this.turning.crossVectors(this.course, across).multiplyScalar(controls.pitch * rate).addScaledVector(across, -controls.yaw * rate);
    reference.copy(speed > PATH_REST ? path : nose);
    const before = this.course.angleTo(reference);
    this.course.addScaledVector(across.crossVectors(this.turning, this.course), dt).normalize();
    const limit = Math.max(before, COURSE_LEAD_MAX);
    if (this.course.angleTo(reference) > limit) {
      across.copy(this.course).addScaledVector(reference, -this.course.dot(reference));
      if (across.lengthSq() > 1e-12) this.course.copy(reference).multiplyScalar(Math.cos(limit)).addScaledVector(across.normalize(), Math.sin(limit));
    }
    return speed;
  }

  /** The commands that bring the flight onto the course (see the class). */
  private steer(flight: FlightModel, controls: Readonly<Controls>, gravity: THREE.Vector3, dt: number, speed: number, moving: number, out: Controls, braking: boolean) {
    // the speed the Host wants: what the flight has on its course, held through a turn; braking,
    // the speed it has, the brake taking it down
    const cos = THREE.MathUtils.clamp(path.dot(this.course), -1, 1);
    const sin = Math.sqrt(1 - cos * cos);
    const pilot = braking ? 0 : THREE.MathUtils.clamp(controls.thrust, 0, 1);
    if (braking) {
      this.cruise = speed;
      this.recovering = false;
    } else if (speed <= PATH_REST || cos > Math.cos(CRUISE_ANGLE)) {
      if (!this.recovering || speed >= this.cruise) {
        this.cruise = speed;
        this.recovering = false;
      }
    } else if (cos < 0) this.recovering = true;
    if (cos >= 0 || pilot > 0) this.cruise = Math.max(this.cruise, speed);

    // the side the flight bends to; nearly straight behind, the side it bent to before
    across.copy(this.course).addScaledVector(path, -cos);
    if (sin > 0.2 || (cos > 0 && sin > 1e-4)) this.bendSide.copy(across.normalize());
    else {
      across.copy(this.bendSide).addScaledVector(path, -this.bendSide.dot(path));
      if (across.lengthSq() < 1e-6) across.copy(nose).addScaledVector(path, -nose.dot(path));
      if (across.lengthSq() < 1e-6) flight.up(across);
      across.normalize();
    }
    // what the flight needs: the course's turn carries the path along; the computer pulls the
    // flight onto the course (gives back speed a turn cost, brakes against a course behind) and
    // holds it against gravity across the flight; along it, gravity changes the speed as ever
    const along = braking ? -speed : cos >= 0 ? cos * Math.max(0, this.cruise - speed) : cos * (this.cruise + speed);
    demand.crossVectors(this.turning, flight.velocity)
      .addScaledVector(path, along * PATH_GAIN)
      .addScaledVector(across, this.cruise * sin * PATH_GAIN)
      .sub(gravity)
      .addScaledVector(path, gravity.dot(path));
    // at rest there is no path: the thrusters hold the ship still, against gravity too, and
    // carry it along the course at the speed it keeps
    rest.copy(this.course).multiplyScalar(braking ? 0 : this.cruise).sub(flight.velocity).multiplyScalar(PATH_GAIN).sub(gravity);
    demand.lerp(rest, 1 - moving);

    const thrust = MAIN_THRUST * flight.driveFactor;
    const thrusters = RCS_THRUST * flight.thrusterFactor;
    const total = demand.length();
    const ahead = demand.dot(path);
    bent.copy(demand).addScaledVector(path, -ahead);
    const bend = bent.length();
    // the drive's push along the path is wanted (the Host's drive, speed given back) or free (at the limit)
    const wanted = braking ? 0 : Math.max(pilot, THREE.MathUtils.smoothstep(speed / MAX_SPEED, PATH_FREE_FROM, PATH_FREE), THREE.MathUtils.smoothstep(ahead, 0, thrusters));
    // it changes over PATH_OPEN_TIME, so a drive tapped in a turn does not throw the nose about
    this.open += THREE.MathUtils.clamp(wanted - this.open, -dt / PATH_OPEN_TIME, dt / PATH_OPEN_TIME);
    const open = this.open;
    // how much of the push goes straight where it is wanted rather than led into a bend: one
    // mostly along the flight (against it in a turn about, with it to give back speed), or
    // anything at rest
    const straight = 1 - moving * (1 - THREE.MathUtils.smoothstep(Math.abs(ahead) / Math.max(total, 1e-6), 0.1, 0.5));
    // the thrusters do what they can, the drive the rest: led into the bend, or straight
    let push = 0;
    drive.set(0, 0, 0);
    const sideways = THREE.MathUtils.clamp(bend - thrusters, 0, thrust);
    if (sideways > 0 && straight < 1) {
      const lead = Math.min(THREE.MathUtils.lerp(Math.PI / 2, Math.asin(sideways / thrust), open), THREE.MathUtils.lerp(Math.PI / 2, PATH_LEAD_MAX, open));
      drive.copy(path).multiplyScalar(Math.cos(lead)).addScaledVector(bent, Math.sin(lead) / bend);
      push = Math.min(thrust, sideways / Math.sin(lead));
    }
    const excess = THREE.MathUtils.clamp(total - thrusters, 0, thrust);
    if (excess > 0 && straight > 0) {
      drive.lerp(goal.copy(demand).divideScalar(total), straight);
      push = THREE.MathUtils.lerp(push, excess, straight);
    }
    goal.copy(this.course);
    if (push > 0 && drive.lengthSq() > 1e-12) {
      drive.normalize();
      // a slight bend leads the nose only a little: it grows in with the drive's share
      goal.lerp(drive, THREE.MathUtils.smoothstep(push / thrust, 0, PATH_LEAD_ONSET));
      if (goal.lengthSq() < 1e-6) goal.copy(drive);
      goal.normalize();
    }
    Object.assign(out, controls);
    flight.steer(goal, PATH_STEER, out);
    // the course's own turn is fed forward, so the nose keeps up with it instead of trailing
    const scale = MAX_TURN_RATE * (0.3 + 0.7 * flight.thrusterFactor);
    flight.toLocalDirection(this.turning, turn);
    out.pitch = THREE.MathUtils.clamp(out.pitch + turn.x / scale, -1, 1);
    out.yaw = THREE.MathUtils.clamp(out.yaw - turn.y / scale, -1, 1);
    // the drive fires as far as its push along the nose is wanted, and with the Host's; where its
    // push along the path is not wanted, only once the nose is nearly where it should point
    const square = THREE.MathUtils.lerp(THREE.MathUtils.smoothstep(nose.dot(drive), PATH_SQUARE_FROM, PATH_SQUARE), 1, open);
    // the Host's drive pushes along the course: it fires once the nose is round to it (after a
    // brake or a flip it points back), from PILOT_FROM and fully within PILOT_FULL of the course
    const pushed = pilot * THREE.MathUtils.smoothstep(nose.dot(this.course), PILOT_FROM, PILOT_FULL);
    out.thrust = Math.max(pushed, thrust > 0 ? THREE.MathUtils.clamp((push * drive.dot(nose)) / thrust, 0, 1) * square : 0);
    // the thrusters: what the drive leaves, and what they can of its push along the path where
    // that is not wanted
    drive.copy(nose).multiplyScalar(out.thrust * thrust);
    demand.sub(drive).addScaledVector(path, drive.dot(path) * open * moving);
    flight.toLocalDirection(demand, across).divideScalar(Math.max(thrusters, 1e-6));
    if (!controls.strafeX) out.strafeX = THREE.MathUtils.clamp(across.x, -1, 1);
    if (!controls.strafeY) out.strafeY = THREE.MathUtils.clamp(across.y, -1, 1);
    if (!controls.strafeZ) out.strafeZ = THREE.MathUtils.clamp(-across.z, -1, 1);
  }
}

/** Below this angle between nose and goal (rad) the flip ends in ordinary steering. */
const FLIP_STEER_ANGLE = 0.35;
/** The nose only pulls up once the roll is this close to the goal (rad). */
const FLIP_ROLL_TOLERANCE = 0.6;
/** A goal below and within this angle of straight behind (rad, 70°) is reached by pulling up without rolling. */
const FLIP_PULL_THROUGH = 1.2;
