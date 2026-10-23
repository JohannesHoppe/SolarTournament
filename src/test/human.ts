import * as THREE from 'three';
import { IDLE, MOUSE_DEADZONE, MOUSE_FULL_DEFLECTION, pointerAxis, type Controls } from '../input/input';
import { cornerSpeed, gripOf, MAX_SPEED, PathSteering, type FlightModel } from '../ship/flight';
import { AIM_ASSIST_RANGE, assistAim, Brake, keepUpright } from '../ship/computer';
import { CAMERA_FOLLOW, CAMERA_FOV, CAMERA_TURN, CHASE_DISTANCE, CHASE_HEIGHT, chaseOrientation } from '../view/chase';
import { Randomizer } from '../random';
import { bendRadius } from '../game/racingline';
import type { AsteroidField } from '../world/asteroids';
import { flyCourse, flyRings, SHIP_RADIUS, startFlight, STEP, type Driver, type Flight, type Rings } from './pilot';
import { BOOST_RADIUS, Course, GATE_RADIUS } from '../game/race';
import { RACE_SPEED } from '../ship/bots';
import type { ArenaProfile } from '../world/arenas';

/** The screen the simulated Host looks at (pixels): the game at 1280×720, the pointer's full deflection at its share of the shorter side. */
const WIDTH = 1280;
const HEIGHT = 720;
const FULL = Math.min(WIDTH, HEIGHT) * MOUSE_FULL_DEFLECTION;
/** A Host's hand: how late it reacts (s), how long an eased stroke of the pointer takes (s), and how precisely it aims (px, one standard deviation, wandering every WOBBLE seconds). */
export interface Hands {
  reaction: number;
  stroke: number;
  noise: number;
}
/** An ordinary Host's hand. */
export const ORDINARY: Hands = { reaction: 0.25, stroke: 0.15, noise: 3 };
const WOBBLE = 0.3;
/** How much a Host's pace drops with its lag (exponent: 1 keeps the distance it flies in its lag). */
const PACE = 3;
/** A Host steers the course no faster than this share of the inverse of its lag (its reaction and its stroke): faster, every correction would swing past. */
const CALM = 0.8;
/** Pixels per radian near the screen's middle. */
const PIXELS_PER_RADIAN = HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
/** The pointer's spring is integrated in steps no longer than this (s). */
const SPRING_STEP = 1 / 240;
/** The fastest an ordinary Host races when nothing on screen says slower (units/s, 200 m/s): the drive is let go there. */
export const HUMAN_CRUISE = MAX_SPEED * 0.8;
/** A Host looks this far ahead along the ribbon (s of flight, at least LOOK_MIN units, 200 m), through the rings as the ribbon runs on. */
const LOOK = 1.6;
const LOOK_MIN = 4000;
/** What a Host reads of the racing line ahead (units, 1.28 km, as far as the ribbon reaches), in steps of RIBBON_STEP, its bends measured over 60 m to either side as the ribbon measures them. */
const RIBBON_REACH = 25600;
const RIBBON_STEP = 1600;
const BEND_SPAN = 1200;
/**
 * The ribbon glows orange where the speed passes GLOW of what its bend allows: a Host lets go of
 * the drive at the first glow. It brakes for a bend within BRAKE_SECONDS (s) of flight that is
 * too tight for its speed beyond HARD of what it allows, and holds the brake until the speed is
 * down to GLOW of that.
 */
const GLOW = 0.95;
const HARD = 1.1;
const BRAKE_SECONDS = 2.5;
/** A racing Host brakes once it flies faster than this share of its pace (see racer), back down to GLOW of it. */
const TOO_FAST = 1.3;
/** Past a ring it missed, a Host slows to this speed to turn back (units/s, 80 m/s). */
const RETURN_SPEED = 1600;
/** A Host holds the drive only while its flight points within ON_LINE of where it looks (rad, about 30°). */
const ON_LINE = 0.5;
/** Slower than this (units/s, 20 m/s) the flight points nowhere yet: the drive is held to get going. */
const ON_LINE_FROM = 400;
/** A Host rereads the ribbon every this many steps (a glance, not a computation every frame). */
const GLANCE = 4;

/** What a Host does with drive and brake. */
export type Pedal = 'drive' | 'coast' | 'brake';

const projected = new THREE.Vector3();
const seen = { x: 0, y: 0 };
const sight = { x: 0, y: 0 };
const reticle = new THREE.Vector3();
const aim = new THREE.Vector3();
/** The pointer's dead zone around the screen's middle (px). */
const DEAD = MOUSE_DEADZONE * FULL;
/** An offset seen (px) as a Host's hand holds the pointer for it: scaled by `reach`, past the dead zone. */
const past = (offset: number, reach: number) => (Math.abs(offset) < 1 ? 0 : Math.sign(offset) * (DEAD + Math.abs(offset) * reach));

/**
 * A simulated Host at keyboard and mouse, flying through the game's own input pipeline: it puts
 * the mouse pointer on what it wants to fly to, as the screen shows it, and the pointer's offset
 * becomes turn input through the game's dead zone (pointerAxis); W and S are held or not; the
 * game's flight computer turns that into commands (path steering with the autopilot, the brake,
 * the upright hold), never a bot's shortcut. The chase camera follows as the game's does (along
 * the course with the autopilot, see chaseOrientation). The Host sees a quarter second late,
 * moves the pointer in eased strokes, and aims a few pixels off.
 */
export class Human {
  readonly steering = new PathSteering();
  readonly brake = new Brake();
  readonly out: Controls = { ...IDLE };
  readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, WIDTH / HEIGHT, 10, 1e7);
  /** The pointer's offset from the screen's middle (px, x right, y up), and how fast it moves. */
  readonly pointer = { x: 0, y: 0 };
  private readonly speed = { x: 0, y: 0 };
  autopilot = true;
  private readonly random: Randomizer;
  private readonly goal = new THREE.Vector3();
  private readonly look = new THREE.Quaternion();
  private readonly wobble = { x: 0, y: 0, toX: 0, toY: 0, left: 0 };
  /** What the Host saw, oldest first: it acts on what it saw its reaction time ago. */
  private readonly seen: { x: number; y: number }[] = [];

  constructor(
    flight: FlightModel,
    private readonly step = STEP,
    seed = 1,
    private readonly hands: Hands = ORDINARY,
  ) {
    this.random = new Randomizer(seed);
    this.steering.follow(flight);
    this.follow(flight, 1);
  }

  /**
   * One step: the Host looks at `mark` (a point in the world) and puts the pointer on it, with
   * `pedal` on drive, brake or neither; the flight computer flies, with the game's aim assist for
   * `ship` (a ship the Host aims at). Returns the commands for the flight model.
   */
  fly(flight: FlightModel, mark: THREE.Vector3, pedal: Pedal, gravity: THREE.Vector3, ship?: THREE.Vector3): Controls {
    this.follow(flight, 1 - Math.exp(-CAMERA_FOLLOW * this.step), 1 - Math.exp(-CAMERA_TURN * this.step));
    this.pixel(mark, seen);
    // with the autopilot the screen's middle is the course; in free drift the Host brings the
    // crosshair (the nose, at the mark's distance) onto the mark, and pushes from the middle
    if (!this.autopilot) {
      flight.forward(reticle).multiplyScalar(mark.distanceTo(flight.position)).add(flight.position);
      this.pixel(reticle, sight);
      seen.x -= sight.x;
      seen.y -= sight.y;
    }
    this.wander();
    // a Host learns how hard the course answers the pointer, and holds it no farther out than its
    // own lag lets it steer without swinging: the course turns at `rate` for a full deflection
    const answer = PathSteering.rate(flight) / (FULL / PIXELS_PER_RADIAN);
    const reach = Math.min(1, CALM / ((this.hands.reaction + this.hands.stroke) * answer));
    // and it knows the dead zone around the middle: it pushes past it for anything it sees off
    this.seen.push({ x: past(seen.x + this.wobble.x, reach), y: past(seen.y + this.wobble.y, reach) });
    const late = this.seen.length > Math.round(this.hands.reaction / this.step) ? this.seen.shift()! : { x: 0, y: 0 };
    // the hand's eased stroke towards it, a critically damped spring, never off the screen
    const omega = 4.7 / this.hands.stroke;
    const steps = Math.ceil(this.step / SPRING_STEP);
    for (const axis of ['x', 'y'] as const) {
      const half = (axis === 'x' ? WIDTH : HEIGHT) / 2;
      for (let i = 0; i < steps; i++) {
        this.speed[axis] += (omega * omega * (late[axis] - this.pointer[axis]) - 2 * omega * this.speed[axis]) * (this.step / steps);
        this.pointer[axis] = THREE.MathUtils.clamp(this.pointer[axis] + this.speed[axis] * (this.step / steps), -half, half);
      }
    }
    const controls = { ...IDLE, yaw: pointerAxis(this.pointer.x / FULL), pitch: pointerAxis(this.pointer.y / FULL), thrust: pedal === 'drive' ? 1 : 0 };
    // the brake: with the autopilot the computer brakes along the course (see PathSteering.fly),
    // in free drift it flips and burns to rest
    const braking = pedal === 'brake';
    if (braking && !this.autopilot) return this.brake.fly(flight, controls, flight.driveFactor, this.out);
    this.brake.release();
    if (this.autopilot) this.steering.fly(flight, controls, gravity, this.step, this.out, braking);
    else {
      this.steering.follow(flight);
      Object.assign(this.out, controls);
    }
    keepUpright(flight, this.out);
    // the game's aim assist, for a ship close to the nose
    if (ship && aim.subVectors(ship, flight.position).length() < AIM_ASSIST_RANGE) assistAim(flight, aim, this.out);
    return this.out;
  }

  /** The chase camera, as the game's follows the ship: `move` and `turn` of the way there this step (0..1). */
  private follow(flight: FlightModel, move: number, turn = move) {
    chaseOrientation(flight, this.autopilot ? this.steering.course : null, this.look);
    this.goal.set(0, SHIP_RADIUS * CHASE_HEIGHT, SHIP_RADIUS * CHASE_DISTANCE).applyQuaternion(this.look).add(flight.position);
    this.camera.position.lerp(this.goal, move);
    this.camera.quaternion.slerp(this.look, turn);
    this.camera.updateMatrixWorld();
  }

  /** Where a world point lies on screen from its middle (px, x right, y up); a point behind the camera sits at the edge, as the HUD holds its markers there. */
  private pixel(point: THREE.Vector3, out: { x: number; y: number }) {
    projected.copy(point).applyMatrix4(this.camera.matrixWorldInverse);
    if (projected.z < -1) {
      projected.applyMatrix4(this.camera.projectionMatrix);
      out.x = (projected.x * WIDTH) / 2;
      out.y = (projected.y * HEIGHT) / 2;
    } else {
      // beside or behind the camera: at the screen's edge, the way it lies
      const edge = 1 / Math.max(Math.abs(projected.x) / WIDTH, Math.abs(projected.y) / HEIGHT, 1e-9);
      out.x = (projected.x * edge) / 2;
      out.y = (projected.y * edge) / 2;
    }
  }

  /** A hand's imprecision: where it aims wanders by a few pixels, to a new offset every WOBBLE seconds (roughly normal, as precise as its hands). */
  private wander() {
    const w = this.wobble;
    if ((w.left -= this.step) <= 0) {
      w.left = WOBBLE;
      w.toX = this.noise();
      w.toY = this.noise();
    }
    w.x += (w.toX - w.x) * Math.min(1, this.step / WOBBLE);
    w.y += (w.toY - w.y) * Math.min(1, this.step / WOBBLE);
  }

  private noise() {
    const r = this.random;
    return (r.nextFloat() + r.nextFloat() + r.nextFloat() - 1.5) * 2 * this.hands.noise;
  }
}

/**
 * A Host racing a course of rings as the screen shows it (see flyCourse): it puts the pointer on
 * the ribbon about LOOK seconds ahead, through the rings as the ribbon runs on, and past a ring it
 * missed on the way back the game's line shows, slowed down to turn. It holds the drive up to its
 * pace (`cruise`, less for slower hands, see PACE), lets it go where the ribbon ahead glows
 * orange, brakes for a bend far too fast for it, and brakes back when the coils threw it far past
 * its pace. `drive` false never touches the drive (a drill that starts drifting).
 */
export function racer(field: AsteroidField, rings: Rings, flight: FlightModel, cruise = HUMAN_CRUISE, drive = true, seed = 1, hands = ORDINARY): Driver {
  // a Host with slower hands races slower: as fast as the ordinary Host, for its lag
  const lag = ORDINARY.reaction + ORDINARY.stroke;
  const pace = cruise * Math.min(1, (lag / (hands.reaction + hands.stroke)) ** PACE);
  const human = new Human(flight, STEP, seed, hands);
  const mark = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let pedal: Pedal = 'coast';
  let glance = 0;
  /** The speed the ribbon close ahead allows, as last read. */
  let slowest = Infinity;
  return (flight, next, _seconds, gravity) => {
    const line = rings.line;
    const gate = next % line.gateCount;
    const speed = flight.velocity.length();
    // the ribbon ahead; past a ring missed, the way back to it, as the game's racers come back,
    // slowed down to turn
    const missed = line.beyond(flight.position, gate);
    if (missed) line.target(flight.position, gate, speed, field, mark);
    else line.clear(line.progress(flight.position, gate, 0) + Math.max(LOOK_MIN, speed * LOOK), field, mark);
    if (glance++ % GLANCE === 0) {
      // the ribbon ahead: orange where its bend is too tight for the speed
      const grip = gripOf(flight);
      const from = line.progress(flight.position, gate, 0);
      let glow = false;
      slowest = Infinity;
      for (let s = from; s < from + RIBBON_REACH; s += RIBBON_STEP) {
        const allowed = cornerSpeed(bendRadius(line.clear(s - BEND_SPAN, field, a), line.clear(s, field, b), line.clear(s + BEND_SPAN, field, c)), grip);
        if (speed > allowed * GLOW) glow = true;
        if (s - from < speed * BRAKE_SECONDS) slowest = Math.min(slowest, allowed);
      }
      // a Host brakes for a bend far too fast for it, and holds the brake until it is slow enough
      if (missed) slowest = Math.min(slowest, RETURN_SPEED);
      // thrown far past its pace (by the coils), a Host brakes back to what it can handle
      if (drive) slowest = Math.min(slowest, pace * TOO_FAST);
      const braking = speed > slowest * (pedal === 'brake' ? GLOW : HARD);
      // and it holds the drive only while the ship flies about where it looks, not through a turn
      const onLine = speed < ON_LINE_FROM || flight.velocity.angleTo(a.subVectors(mark, flight.position)) < ON_LINE;
      pedal = braking ? 'brake' : drive && !glow && !missed && onLine && speed < pace ? 'drive' : 'coast';
    }
    return human.fly(flight, mark, pedal, gravity);
  };
}

/** Hands from quick to slow, as the race tests fly them: reaction 0.2 to 0.35 s, strokes 0.12 to 0.2 s, aim 2 to 5 px off. */
export const SPREAD: Hands[] = [{ reaction: 0.2, stroke: 0.12, noise: 2 }, ORDINARY, { reaction: 0.3, stroke: 0.18, noise: 4 }, { reaction: 0.35, stroke: 0.2, noise: 5 }];
/** The seeds of each hand's imprecision the race tests fly. */
export const SEEDS = [1, 2];
/** A lap is given this long (s): the slowest hands race slower. */
export const LAP_LIMIT = 160;

/** An arena's race course as the game lays it out in `field` as it starts: where the grid's first slot is, which way it faces, and a lap of rings (the pink gate again at its end). */
export function lapOf(field: AsteroidField, arena: ArenaProfile) {
  field.generate(arena.layout);
  const course = new Course(field, arena.layout.seed);
  const rings: Rings = { points: [...course.points, course.points[0]], normals: [...course.normals, course.normals[0]], radius: GATE_RADIUS, core: BOOST_RADIUS, line: course.line };
  return { start: course.startOf(0, 0, new THREE.Vector3()), facing: course.normals[0], rings };
}

/** A lap of an arena's race by every hand of SPREAD with every seed of SEEDS, and by a racing bot of `skill`, each in the field as it starts. */
export function raceLaps(field: AsteroidField, arena: ArenaProfile, skill: number) {
  const laps: { hands: Hands; seed: number; flight: Flight }[] = [];
  for (const hands of SPREAD) {
    for (const seed of SEEDS) {
      const { start, facing, rings } = lapOf(field, arena);
      const flight = startFlight(start, facing);
      laps.push({ hands, seed, flight: flyCourse(field, rings, flight, racer(field, rings, flight, undefined, true, seed, hands), LAP_LIMIT) });
    }
  }
  const { start, facing, rings } = lapOf(field, arena);
  return { laps, bot: flyRings(field, rings, start, facing, skill, RACE_SPEED, LAP_LIMIT) };
}
