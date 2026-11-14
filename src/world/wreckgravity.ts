import * as THREE from 'three';
import { ARENAS } from './arenas';
import type { Asteroid } from './asteroids';
import { massOf } from './bodies';
import { HULL_BOXES } from './shapes';
import { log } from '../detmath';

/**
 * The gravity of the Derelict's wreck (see README, "The Derelict"), for the dead that fall freely
 * about it (see world/derelict). Every box of the hull is a uniform rod along its longest side,
 * of the box's mass by the field's own rule (world/bodies, massOf: a hull section 13.6 million
 * tonnes, the bow 49.8 in all, the stern 45.1), its pull in closed form; the sum over both halves.
 * In meters and seconds. Only `+ - * /` and the square root in the pull, so every browser reckons
 * the same bits; the potential (for the tests and for whether a body is bound) takes detmath's log.
 */

/** The constant of gravitation (m³/(kg s²)). */
export const GRAVITATION = 6.674e-11;
/** Meters per world unit. */
export const METERS = 0.05;

/** A box of the hull as its pull sees it: a rod from `from` along `along` (unit) for `length` (m), G times its mass per meter (`pull`), and the box itself (m) for keeping clear of it. */
export interface Rod {
  from: THREE.Vector3;
  along: THREE.Vector3;
  length: number;
  pull: number;
  mass: number;
  weld: number;
  center: THREE.Vector3;
  inverse: THREE.Quaternion;
  half: THREE.Vector3;
}

const PIECES = ARENAS.find((arena) => arena.id === 'derelict')!.layout.placements!;

/** The wreck's rods, one for each box of its hull, in the layout (m). */
export const WRECK: readonly Rod[] = PIECES.map((piece) => {
  const half = HULL_BOXES[piece.type].clone().multiplyScalar(piece.scale);
  const mass = massOf({ meanRadius: (half.x + half.y + half.z) / 3, kind: 'hull' } as Pick<Asteroid, 'meanRadius' | 'kind'>);
  const long = half.x >= half.y && half.x >= half.z ? new THREE.Vector3(1, 0, 0) : half.y >= half.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const length = 2 * Math.max(half.x, half.y, half.z) * METERS;
  const along = long.applyQuaternion(piece.orientation);
  const center = piece.position.clone().multiplyScalar(METERS);
  return {
    from: center.clone().addScaledVector(along, -length / 2),
    along,
    length,
    pull: (GRAVITATION * mass) / length,
    mass,
    weld: piece.weld ?? 0,
    center,
    inverse: piece.orientation.clone().invert(),
    half: half.multiplyScalar(METERS),
  };
});

/** Each half's mass (kg), the bow's and the stern's. */
export const HALF_MASS = [0, 1].map((weld) => WRECK.filter((rod) => rod.weld === weld).reduce((sum, rod) => sum + rod.mass, 0));

const offset = new THREE.Vector3();
const across = new THREE.Vector3();

/**
 * The wreck's pull at `p` (m) into `out` (m/s²). A uniform rod's pull splits into one along it,
 * G λ (1/r1 − 1/r2), and one towards it, G λ S / d with S = (L − x)/r2 + x/r1 (x along the rod
 * from its start, d off its line, r1 and r2 to its ends); S/d² is reckoned in a form that never
 * cancels off the rod's ends, where d may be nearly 0.
 */
export function wreckPull(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.set(0, 0, 0);
  for (const rod of WRECK) {
    offset.subVectors(p, rod.from);
    const x = offset.dot(rod.along);
    across.copy(offset).addScaledVector(rod.along, -x);
    const d2 = across.lengthSq();
    const L = rod.length;
    const r1 = Math.sqrt(x * x + d2);
    const r2 = Math.sqrt((L - x) * (L - x) + d2);
    let k: number;
    if (x > L) k = (x * x - (x - L) * (x - L)) / ((x * r2 + (x - L) * r1) * r1 * r2);
    else if (x < 0) k = ((L - x) * (L - x) - x * x) / (((L - x) * r1 - x * r2) * r1 * r2);
    else k = ((L - x) / r2 + x / r1) / d2;
    out.addScaledVector(rod.along, rod.pull * (1 / r1 - 1 / r2)).addScaledVector(across, -rod.pull * k);
  }
  return out;
}

/** The wreck's potential at `p` (m), per kilogram (J/kg): −G λ ln((r1 + r2 + L)/(r1 + r2 − L)) summed over its rods. */
export function wreckPotential(p: THREE.Vector3): number {
  let potential = 0;
  for (const rod of WRECK) {
    const r1 = p.distanceTo(rod.from);
    const r2 = offset.copy(rod.from).addScaledVector(rod.along, rod.length).distanceTo(p);
    potential -= rod.pull * log((r1 + r2 + rod.length) / (r1 + r2 - rod.length));
  }
  return potential;
}

const local = new THREE.Vector3();
/** How far `p` (m) lies outside the nearest box of the hull (m; 0 inside one). */
export function hullClearance(p: THREE.Vector3): number {
  let least = Infinity;
  for (const rod of WRECK) {
    local.subVectors(p, rod.center).applyQuaternion(rod.inverse);
    local.set(Math.max(0, Math.abs(local.x) - rod.half.x), Math.max(0, Math.abs(local.y) - rod.half.y), Math.max(0, Math.abs(local.z) - rod.half.z));
    least = Math.min(least, local.length());
  }
  return least;
}


/**
 * A body falling freely about the wreck, stepped on a grid of field time FALL_STEP (s) apart by
 * velocity Verlet (a leapfrog: symplectic, so its energy only wobbles, never drifts off), always
 * from where it was at field time 0: the same steps, the same bits on every browser, however the
 * frames fall and wherever a snapshot sets the clock.
 */
export const FALL_STEP = 10;

export class FreeFall {
  /** Where it is (m) and how fast (m/s) at step `step`, and its pull there; where it was a step before. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private readonly pull = new THREE.Vector3();
  readonly before = new THREE.Vector3();
  step = 0;

  constructor(
    readonly start: THREE.Vector3,
    readonly speed: THREE.Vector3,
  ) {
    this.reset();
  }

  private reset() {
    this.position.copy(this.start);
    this.before.copy(this.start);
    this.velocity.copy(this.speed);
    wreckPull(this.position, this.pull);
    this.step = 0;
  }

  /** One step of FALL_STEP. */
  advance() {
    const h = FALL_STEP;
    this.before.copy(this.position);
    this.velocity.addScaledVector(this.pull, h / 2);
    this.position.addScaledVector(this.velocity, h);
    wreckPull(this.position, this.pull);
    this.velocity.addScaledVector(this.pull, h / 2);
    this.step++;
  }

  /** Where it is at field time `time` (s), into `out` (m): stepped to the step after it, between that and the one before. */
  at(time: number, out: THREE.Vector3): THREE.Vector3 {
    const t = Math.max(0, time);
    const target = Math.floor(t / FALL_STEP) + 1;
    if (target < this.step) this.reset();
    while (this.step < target) this.advance();
    return out.lerpVectors(this.before, this.position, t / FALL_STEP - (target - 1));
  }

  /** Its energy per kilogram (J/kg): what the leapfrog keeps. */
  energy(): number {
    return this.velocity.lengthSq() / 2 + wreckPotential(this.position);
  }
}
