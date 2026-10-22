import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { Bot } from '../ship/bots';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import { bounceOff, impactDamage } from '../ship/impact';
import { MAX_HULL, type Ship } from '../ship/ship';
import { coilPush, ringCrossing } from '../game/race';
import type { RacingLine } from '../game/racingline';

/** A ship's hit radius (units, 17 m), as the game's hulls have it. */
const SHIP_RADIUS = 340;
/** The simulation steps at 30 frames a second, a slow browser's rate. */
const STEP = 1 / 30;

/** A course to fly: rings in order, each at a point facing along `normals`, with a coil in its core, and the ideal line the racer flies along (gate i of the line is ring i, around for rings past its last gate). */
export interface Rings {
  points: readonly THREE.Vector3[];
  normals: readonly THREE.Vector3[];
  radius: number;
  core: number;
  line: RacingLine;
}

/** How a flight went: the rings passed, how far off each center, the seconds it took, the hull left, and whether the ship was lost (its hull gone on rock, or in a massive body). */
export interface Flight {
  passed: number;
  offs: number[];
  seconds: number;
  hull: number;
  crashed: boolean;
}

/**
 * A racing bot of the given skill flies a course of rings in a field, with the game's flight
 * model, gravity, coils and rock collisions (it bounces off and the hull takes what an impact
 * does), from `start` facing `facing`, until it passed every ring, was lost, or `limit` seconds
 * are up. The field's rocks move on with the time. Only the bot's own flight counts: no other
 * ships.
 */
export function flyRings(field: AsteroidField, rings: Rings, start: THREE.Vector3, facing: THREE.Vector3, skill: number, speed: number, limit: number): Flight {
  const flight = new FlightModel();
  flight.reset(start, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(start, facing.clone().add(start), new THREE.Vector3(0, 1, 0))));
  const ship = { id: 'pilot', flight, radius: SHIP_RADIUS, alive: true, protectedUntil: 0, allyOf: () => false } as unknown as Ship;
  const bot = new Bot(ship, skill);
  bot.raceSpeed = speed;
  const gravity = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const before = new THREE.Vector3();
  const path = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const surface = new THREE.Vector3();
  const offs: number[] = [];
  let hull = MAX_HULL;
  let seconds = 0;
  const result = (crashed: boolean): Flight => ({ passed: offs.length, offs, seconds, hull, crashed });
  while (offs.length < rings.points.length && seconds < limit) {
    const next = offs.length;
    bot.waypoint = rings.line.target(flight.position, next % rings.line.gateCount, flight.velocity.length(), field, goal);
    const controls = bot.think(seconds, [ship], field, [bot]);
    field.gravity(flight.position, gravity);
    before.copy(flight.position);
    flight.update(STEP, controls, gravity);
    field.update(STEP);
    seconds += STEP;
    if (field.insideWell(flight.position, SHIP_RADIUS)) return result(true);
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
    const off = ringCrossing(rings.points[next], rings.normals[next], rings.radius, before, flight.position);
    if (off === null) continue;
    offs.push(off);
    if (off < rings.core) coilPush(flight.velocity, rings.normals[next], MAX_SPEED);
  }
  return result(false);
}
