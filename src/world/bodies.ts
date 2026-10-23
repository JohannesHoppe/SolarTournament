import * as THREE from 'three';
import type { Asteroid, TemplateKind } from './asteroids';

/**
 * Bodies: everything a rope pulls or a bump shoves has a position, a velocity and a mass (kg).
 * What two bodies do to each other through a rope (see rope) or a contact (see contact) is
 * split by their masses, so a light body is thrown about and a heavy one barely moves; a body
 * of infinite mass (IMMOVABLE) does not move at all. Whether a contact harms is not decided
 * here: each pair has its own rule where it is used.
 */
export interface Body {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly mass: number;
}

/** A body nothing moves: the tournament's rings, held in place by their stations. */
export const IMMOVABLE = Infinity;

/**
 * The masses of what flies (kg). An interceptor (35 m) is a fighter of 60 t, about three
 * times a fighter jet of today, for its reactor, drive and armor. A sponsor core (an armored
 * reactor canister 14 m long) a quarter of that; a sponsor probe half a tonne; a torpedo a
 * tonne (its 6 g motor makes 12 kN); a piece of wreckage five tonnes; the President's
 * battleship (745 m) 400,000 t, as heavy as the largest ships ever built on Earth.
 */
export const MASS = {
  ship: 60_000,
  core: 15_000,
  probe: 500,
  torpedo: 1_000,
  wreck: 5_000,
  battleship: 4e8,
} as const;

/**
 * Density of the field's pieces (kg/m³) over the volume of their mean radius: rock about
 * 2,000, ice 900, a station's debris (decks and frames, mostly empty) 300, the world ship's
 * hull sections (armor around empty holds) 500. A rock of 100 m is some 10 million tonnes,
 * millions of times a ship: on a rope or in a bump it does not move, and the field keeps its
 * motion (shared by every browser) as it is.
 */
const DENSITY: Record<TemplateKind, number> = { rock: 2000, ice: 900, debris: 300, hull: 500 };
/** Meters per world unit. */
const METERS = 0.05;

/** The mass of a piece of the field (kg), from its mean radius and its kind's density. */
export function massOf(piece: Pick<Asteroid, 'meanRadius' | 'kind'>): number {
  const radius = piece.meanRadius * METERS;
  return ((4 / 3) * Math.PI * radius ** 3) * DENSITY[piece.kind];
}

/** The share of an impulse between two bodies that the one of mass `mass` takes against one of mass `other`: its inverse mass over both. */
export function share(mass: number, other: number): number {
  const mine = 1 / mass;
  const theirs = 1 / other;
  return mine + theirs > 0 ? mine / (mine + theirs) : 0;
}

const line = new THREE.Vector3();
const relative = new THREE.Vector3();

/**
 * A rope of `length` between two bodies: it only pulls, never pushes. Slack, it does nothing;
 * beyond its length, the speed apart is taken from both and they are drawn back to its length,
 * each by its share (see share): momentum stays. `moveA`, `moveB`: whether that end is moved
 * here (a body run by another browser gets its share there). True when it was taut.
 */
export function rope(a: Body, b: Body, length: number, moveA = true, moveB = true): boolean {
  line.subVectors(b.position, a.position);
  const distance = line.length();
  if (distance <= length || distance < 1e-6) return false;
  line.divideScalar(distance);
  const toA = share(a.mass, b.mass);
  const toB = 1 - toA;
  const apart = -relative.subVectors(a.velocity, b.velocity).dot(line);
  const over = distance - length;
  if (moveA) {
    if (apart > 0) a.velocity.addScaledVector(line, apart * toA);
    a.position.addScaledVector(line, over * toA);
  }
  if (moveB) {
    if (apart > 0) b.velocity.addScaledVector(line, -apart * toB);
    b.position.addScaledVector(line, -over * toB);
  }
  return true;
}

/**
 * Two bodies touching, `normal` pointing from b to a: the speed at which they close is turned
 * around with `restitution` (the share of it they keep apart), and sliding along each other
 * bleeds off `friction` times that push; each body takes its share (see share). Returns how
 * fast they closed (units/s), 0 when they were parting.
 */
export function contact(a: Body, b: Body, normal: THREE.Vector3, restitution: number, friction: number, moveA = true, moveB = true): number {
  relative.subVectors(a.velocity, b.velocity);
  const approach = -relative.dot(normal);
  if (approach <= 0) return 0;
  const push = approach * (1 + restitution);
  // the change the relative velocity takes: out along the normal, and against the sliding
  relative.addScaledVector(normal, approach);
  const sliding = relative.length();
  const slide = sliding > 1e-6 ? Math.min(1, (friction * push) / sliding) : 0;
  const toA = share(a.mass, b.mass);
  if (moveA) a.velocity.addScaledVector(normal, push * toA).addScaledVector(relative, -slide * toA);
  if (moveB) b.velocity.addScaledVector(normal, -push * (1 - toA)).addScaledVector(relative, slide * (1 - toA));
  return approach;
}
