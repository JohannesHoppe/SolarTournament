import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { PLACES } from './arenas';
import { FlightModel, flyByNose, HOVER_HEIGHT, MAX_SPEED, type Ground } from '../ship/flight';
import { IDLE, type Controls } from '../input/input';
import { cushion, glide, groundBlow, outside } from './hover';
import { impactDamage, SAFE_IMPACT } from '../ship/impact';
import { cos, sin } from '../detmath';
import type { AsteroidField } from './asteroids';

const RADIUS = 340;
const STEP = 1 / 60;

/** The places of the campaign standing on a world's ground. */
const GROUNDED = PLACES.filter((place) => place.layout.placements?.some((piece) => piece.ground) && (place.layout.fall ?? 0) > 0);

/** A point at twice the ride height over the place's ground near its start, with nothing but ground under and beside it (the first such of a grid tried), or null. */
function clearDrop(field: AsteroidField, start: THREE.Vector3): THREE.Vector3 | null {
  const normal = new THREE.Vector3();
  for (let k = 0; k < 121; k++) {
    const at = new THREE.Vector3(start.x + (k % 11) * 2000 - 10000, start.y, start.z + Math.floor(k / 11) * 2000 - 10000);
    const height = field.groundBelow(at, normal);
    if (height === null) continue;
    at.addScaledVector(normal, RADIUS + HOVER_HEIGHT * 2 - height);
    if (!clearOf(field, at) || !clearOf(field, at.clone().addScaledVector(normal, -HOVER_HEIGHT * 2))) continue;
    return at;
  }
  return null;
}

/** Whether nothing but ground lies within three ship radii of `at`. */
function clearOf(field: AsteroidField, at: THREE.Vector3): boolean {
  const piece = field.overlap(at, RADIUS * 3);
  return !piece || !!piece.ground;
}

/**
 * A ship flown for `seconds` as the game steps it (see Game.outside, Game.collide): the outside's
 * pull and the hover field, its flight, then the ground it glides over or anything else it would
 * strike. Returns the heights of the hull's underside over the ground at each step and whether it
 * ever struck anything but ground.
 */
function fly(field: AsteroidField, flight: FlightModel, seconds: number, steer?: (flight: FlightModel, pull: THREE.Vector3, ground: Ground | null) => Controls) {
  const pull = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const heights: number[] = [];
  let struck = false;
  let touched = 0;
  let blow = 0;
  for (let t = 0; t < seconds; t += STEP) {
    const ground = outside(field, flight.position, flight.velocity, RADIUS, STEP, pull);
    flight.update(STEP, steer ? steer(flight, pull, ground) : IDLE, pull);
    const piece = field.overlap(flight.position, RADIUS);
    if (piece && field.resolve(piece, flight.position, RADIUS, normal)) {
      if (piece.ground) {
        blow = Math.max(blow, groundBlow(glide(flight.velocity, normal, STEP), field.fall));
        touched++;
      } else struck = true;
    }
    const height = field.groundBelow(flight.position, normal);
    heights.push(height === null ? NaN : height - RADIUS);
  }
  return { heights, struck, touched, blow };
}


/**
 * A ship diving at `speed` (units/s) at `angle` (rad) below the ground's plane at `drop`, its
 * nose along its flight and the autopilot holding it there, as a Host flies: the blow (units/s)
 * its hull meets the ground with, as the game steps it.
 */
function dive(field: AsteroidField, drop: THREE.Vector3, speed: number, angle: number): number {
  const up = new THREE.Vector3();
  field.groundBelow(drop, up);
  const along = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
  const flight = new FlightModel();
  const heading = along.clone().multiplyScalar(cos(angle)).addScaledVector(up, -sin(angle));
  flight.reset(drop.clone().addScaledVector(up, HOVER_HEIGHT * 6), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), heading));
  flight.velocity.copy(heading).multiplyScalar(speed);
  const out: Controls = { ...IDLE };
  return fly(field, flight, 2, (f, pull, ground) => flyByNose(f, IDLE, pull, out, ground)).blow;
}

describe('the hover field', () => {
  it.each(GROUNDED.map((place) => [place.id, place] as const))('on %s lets a graze glide unhurt and makes a steep dive at the limit a crash, as on rock', (_, place) => {
    const field = testField();
    field.generate(place.layout);
    const drop = clearDrop(field, new THREE.Vector3(...(place.start?.at ?? [0, 0, 0])))!;
    // racing low over the ground at the limit, a few degrees down: the field takes it
    expect(impactDamage(dive(field, drop, MAX_SPEED, (3 * Math.PI) / 180))).toBe(0);
    // straight down at the limit: wrecked, whatever the world's pull
    expect(impactDamage(dive(field, drop, MAX_SPEED, Math.PI / 2))).toBeGreaterThanOrEqual(100);
    // below the cushion plus what rock forgives, never hurt
    expect(impactDamage(dive(field, drop, cushion(place.layout.fall!) + SAFE_IMPACT * 0.9, Math.PI / 2))).toBe(0);
  });

  it.each(GROUNDED.map((place) => [place.id, place] as const))('holds a ship sinking onto the ground of %s within the cushion, unhurt, and settles it at the ride height', (_, place) => {
    const field = testField();
    field.generate(place.layout);
    const start = new THREE.Vector3(...(place.start?.at ?? [0, 0, 0]));
    const drop = clearDrop(field, start);
    expect(drop, 'a clear place to drop a ship onto the ground').not.toBeNull();
    const square = new THREE.Vector3();
    for (const speed of [0, cushion(place.layout.fall!) * 0.8]) {
      const flight = new FlightModel();
      flight.reset(drop!, new THREE.Quaternion());
      // straight into the ground, square to it
      field.groundBelow(drop!, square);
      flight.velocity.copy(square).multiplyScalar(-speed);
      // a soft world's field settles slowly: within forty of its time constants, √(H / 2·fall), the damping holding it back as it sinks
      const settle = Math.max(60, 40 * Math.sqrt(HOVER_HEIGHT / (2 * place.layout.fall!)));
      // the autopilot on, the stick let go: at rest it holds the ship still, as a Host leaves it (free drift slides down a slope)
      const out: Controls = { ...IDLE };
      const { heights, struck, blow } = fly(field, flight, settle, (f, pull, ground) => flyByNose(f, IDLE, pull, out, ground));
      expect(struck, `${speed / 20} m/s down: nothing but ground met`).toBe(false);
      // within the cushion the field takes the speed out before the hull meets the ground
      expect(impactDamage(blow), `${speed / 20} m/s down: met the ground at ${blow / 20} m/s`).toBe(0);
      // the hull never sinks into the ground: the field and the glide hold it on top
      expect(Math.min(...heights), `${speed / 20} m/s down`).toBeGreaterThan(-RADIUS * 0.5);
      // at rest at the ride height in the end
      // where the field carries the share of the weight square to the ground: H / √cos of the slope
      const last = heights[heights.length - 1];
      field.groundBelow(flight.position, square);
      const ride = HOVER_HEIGHT / Math.sqrt(square.y);
      expect(Math.abs(last - ride), `${speed / 20} m/s down: settled at ${last / 20} m, ${ride / 20} m on its slope; ${heights.filter((_, i) => i % 1800 === 0).map((h) => Math.round(h / 2) / 10)} ${flight.velocity.toArray().map(Math.round)}`).toBeLessThan(HOVER_HEIGHT * 0.2);
      // a slope lets it slide (only the scrape at contact holds a ship), but never up or down
      expect(Math.abs(flight.velocity.y), `${speed / 20} m/s down: still bouncing`).toBeLessThan(20);
    }
  });

  it('carries a ship flown low over the Lineae with the autopilot within its reach, along the ice plain beside the Crack', () => {
    const place = GROUNDED.find((p) => p.id === 'europa')!;
    const field = testField();
    field.generate(place.layout);
    const start = new THREE.Vector3(...place.start!.at);
    const drop = clearDrop(field, start)!;
    const flight = new FlightModel();
    flight.reset(drop, new THREE.Quaternion());
    // settle, then fly level across the place at 100 m/s, the drive held as the autopilot keeps the flight on the nose
    fly(field, flight, 30);
    flight.velocity.set(0, 0, -2000);
    const out: Controls = { ...IDLE };
    const { heights, struck } = fly(field, flight, 60, (f, pull, ground) => flyByNose(f, { ...IDLE, thrust: f.velocity.length() < 2000 ? 1 : 0 }, pull, out, ground));
    expect(struck).toBe(false);
    const flown = heights.filter((h) => !Number.isNaN(h));
    expect(flown.length).toBeGreaterThan(heights.length * 0.5);
    // riding the ground within the field's reach most of the way, never through it; a ridge ridden up at 100 m/s throws it up to some 60 m, and Europa's 0.13 g brings it down again within seconds
    const within = flown.filter((h) => h < HOVER_HEIGHT * 4).length / flown.length;
    expect(within, `${heights.filter((_, i) => i % 60 === 0).map((h) => Math.round(h / 20))}`).toBeGreaterThan(0.5);
    expect(Math.max(...flown), `${heights.filter((_, i) => i % 60 === 0).map((h) => Math.round(h / 20))} at ${flight.position.toArray().map(Math.round)} from ${drop.toArray().map(Math.round)}`).toBeLessThan(HOVER_HEIGHT * 20);
    expect(Math.min(...flown)).toBeGreaterThan(-RADIUS * 0.5);
  });
});
