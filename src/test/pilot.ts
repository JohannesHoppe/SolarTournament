import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { Bot, evenSkills } from '../ship/bots';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import type { Controls } from '../input/input';
import { bounceOff, impactDamage } from '../ship/impact';
import { COOLING_SHADOW, COOLING_SUN, MAX_HEAT, MAX_HULL, type Ship } from '../ship/ship';
import { airBurn, airHeat, altitudeIn, dragOn } from '../world/air';
import { approachGate, coilPush, ringCrossing } from '../game/race';
import type { RacingLine } from '../game/racingline';

/** A ship's hit radius (units, 17 m), as the game's hulls have it. */
export const SHIP_RADIUS = 340;
/** The simulation steps at 30 frames a second, a slow browser's rate. */
export const STEP = 1 / 30;
/** A crossing of a ring's plane beside it counts as a miss within this many of its radii of its center. */
const MISS_REACH = 4;

/** A course to fly: rings in order, each at a point facing along `normals`, with a coil in its core, and the ideal line the racer flies along (gate i of the line is ring i, around for rings past its last gate). */
export interface Rings {
  points: readonly THREE.Vector3[];
  normals: readonly THREE.Vector3[];
  radius: number;
  core: number;
  line: RacingLine;
  /** Markers without a coil's housings (the curve drill's spheres): the racer flies the line alone, with no approach to a ring's center. */
  open?: boolean;
}

/** How a flight went: the rings passed, how far off each center, how often it missed the next ring (crossed its plane beside it, the way the course goes, within MISS_REACH of its radius), the seconds it took, the hull left, and whether the ship was lost (its hull gone on rock, or in a massive body). */
export interface Flight {
  passed: number;
  offs: number[];
  missed: number;
  seconds: number;
  hull: number;
  crashed: boolean;
}

/**
 * What flies a ship along a course, step by step: the commands for the flight model, from the
 * flight as it is, the ring it heads for, the seconds flown and the gravity at the ship.
 */
export type Driver = (flight: FlightModel, next: number, seconds: number, gravity: THREE.Vector3) => Readonly<Controls>;

/** Looks at a flight after each step (of `step` seconds) and ends it by returning true. */
export type Each = (flight: FlightModel, step: number) => boolean;

/** A ship at `start`, facing `facing`, drifting that way at `drift` (units/s). */
export function startFlight(start: THREE.Vector3, facing: THREE.Vector3, drift = 0): FlightModel {
  const flight = new FlightModel();
  flight.reset(start, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(start, facing.clone().add(start), new THREE.Vector3(0, 1, 0))));
  flight.velocity.copy(facing).setLength(drift);
  return flight;
}

/**
 * A racing bot of the given skill flies a course of rings in a field (see flyCourse), from
 * `start` facing `facing` and drifting that way at `drift` (units/s). `each` sees the flight
 * after every step and ends it by returning true.
 */
export function flyRings(field: AsteroidField, rings: Rings, start: THREE.Vector3, facing: THREE.Vector3, skill: number, speed: number, limit: number, drift = 0, each?: Each): Flight {
  const flight = startFlight(start, facing, drift);
  // the hull's heat the bot reads, as its HUD shows it (see flyCourse)
  const ship = { id: 'pilot', flight, radius: SHIP_RADIUS, alive: true, protectedUntil: 0, strain: 0, heat: 0, allyOf: () => false, get cooling() { return coolingAt(field, flight.position); } } as unknown as Ship;
  const bot = new Bot(ship, evenSkills(skill));
  bot.raceSpeed = speed;
  const goal = new THREE.Vector3();
  return flyCourse(field, rings, flight, (flight, next, seconds) => {
    // as the game's racers do: along the line, and near a ring for its center where the way would clip the rim
    rings.line.target(flight.position, next % rings.line.gateCount, flight.velocity.length(), field, goal);
    bot.waypoint = rings.open ? goal : approachGate(rings.points[next], rings.normals[next], rings.radius, flight.position, flight.velocity, SHIP_RADIUS, goal);
    return bot.think(seconds, [ship], field);
  }, limit, undefined, each, ship);
}

/** How fast the radiators shed heat at a place, as the game has it (see Ship.cooling): in the shade under a planet's cloud deck, else in the sun (rocks' shadows left out). */
const coolingAt = (field: AsteroidField, position: THREE.Vector3) => (field.air && altitudeIn(field.air, position) < 0 ? COOLING_SHADOW : COOLING_SUN);

/**
 * A ship flies a course of rings in a field, with the game's flight model, gravity, coils and
 * rock collisions (it bounces off and the hull takes what an impact does), and in a planet's air
 * its drag and heat (the radiators shed what they can, what they cannot burns the hull, see
 * Game.friction), as `driver` commands it, until it passed every ring, was lost, or `limit`
 * seconds are up. The field's rocks move on with the time. Only this ship's flight counts: no
 * other ships. `onMiss` hears of every miss; `each` sees the flight after every step and ends it
 * by returning true; `hot`, if given, holds the hull's heat as it goes (a racing bot reads it).
 */
export function flyCourse(field: AsteroidField, rings: Rings, flight: FlightModel, driver: Driver, limit: number, onMiss?: (ring: number, off: number) => void, each?: Each, hot: { heat: number } = { heat: 0 }): Flight {
  const gravity = new THREE.Vector3();
  const before = new THREE.Vector3();
  const path = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const surface = new THREE.Vector3();
  const offs: number[] = [];
  let hull = MAX_HULL;
  let seconds = 0;
  let missed = 0;
  const result = (crashed: boolean): Flight => ({ passed: offs.length, offs, missed, seconds, hull, crashed });
  while (offs.length < rings.points.length && seconds < limit) {
    const next = offs.length;
    field.gravity(flight.position, gravity);
    if (field.air) dragOn(field.air, flight.position, flight.velocity, STEP, gravity);
    const controls = driver(flight, next, seconds, gravity);
    before.copy(flight.position);
    flight.update(STEP, controls, gravity);
    field.update(STEP);
    seconds += STEP;
    if (field.insideWell(flight.position, SHIP_RADIUS)) return result(true);
    if (field.air) {
      // the radiators shed, then the air heats, as the game steps a ship (see Ship.update, Game.friction)
      const radiators = { heat: Math.max(0, hot.heat - coolingAt(field, flight.position) * STEP), overheated: false, cooling: coolingAt(field, flight.position) };
      hull -= airBurn(radiators, airHeat(altitudeIn(field.air, flight.position), flight.velocity.length()) * STEP, STEP, MAX_HEAT);
      hot.heat = radiators.heat;
      if (hull <= 0) return result(true);
    }
    // as the game does: a fast ship stops where its path first touched rock, and bounces off
    const moved = flight.position.distanceTo(before);
    const hit = moved > SHIP_RADIUS ? field.raycast(before, path.subVectors(flight.position, before).divideScalar(moved), moved) : null;
    if (hit) flight.position.copy(before).addScaledVector(path, Math.max(0, hit.distance - 1));
    const rock = field.overlap(flight.position, SHIP_RADIUS);
    if (rock && field.resolve(rock, flight.position, SHIP_RADIUS, normal)) {
      field.surfaceVelocity(rock, surface.copy(flight.position).addScaledVector(normal, -SHIP_RADIUS), surface);
      hull -= impactDamage(bounceOff(flight.velocity, surface, normal));
      if (hull <= 0) return result(true);
    }
    if (each?.(flight, STEP)) return result(false);
    // where it crossed the next ring's plane, inside the ring or beside it
    const off = ringCrossing(rings.points[next], rings.normals[next], Infinity, before, flight.position);
    if (off === null) continue;
    // a miss: the way through the ring's plane beside it, coming at it the way the course goes
    // and near it (crossings on the way back, or far out, are not attempts)
    if (off >= rings.radius) {
      if (off < rings.radius * MISS_REACH && path.subVectors(flight.position, before).dot(rings.normals[next]) > 0) {
        missed++;
        onMiss?.(next, off);
      }
      continue;
    }
    offs.push(off);
    if (off < rings.core) coilPush(flight.velocity, rings.normals[next], MAX_SPEED);
  }
  return result(false);
}
