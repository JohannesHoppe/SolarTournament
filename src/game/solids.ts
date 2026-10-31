import * as THREE from 'three';
import { raySphere } from '../world/asteroids';
import { HEAD_RADIUS } from './comet';
import { CORE_REACH } from './flags';
import { PROBE_RADIUS, type Solid } from './items';
import { TORPEDO_RADIUS } from './torpedoes';

/**
 * The solids besides the field and the battleship, in one table: the rings' housings, the
 * sponsor cores, wreckage, the probes, the torpedoes in flight and the comet's head while it
 * flies whole. Each kind has the operations some use asks of it; every use (what a probe bounces
 * off, where a beam stops, what wreckage grinds on, what sets off a torpedo, what the comet's
 * shower bursts on) names the kinds it takes and is derived from the table.
 */
export type SolidKindName = 'ring' | 'core' | 'wreck' | 'probe' | 'torpedo' | 'head';

/** What one kind of solid answers. */
export interface SolidKind {
  /**
   * Whether a sphere at `position` of `radius` touches one of this kind; `at` gets where it met
   * it: the sphere's center moved out of a ring's housing, the center itself on a ball. A
   * torpedo of `ignore` (a shooter, whose salvo flies together) is passed through. `position`
   * stays where it is.
   */
  touch?(position: THREE.Vector3, radius: number, at: THREE.Vector3, ignore: unknown): boolean;
  /** Pushes a sphere out of one of this kind (see game/items, Solid). */
  push?: Solid;
  /** How far along a beam from `origin` along `direction` the nearest one of this kind lies, nearer than `max`; null when none does. */
  ray?(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null;
}

export type SolidTable = Readonly<Record<SolidKindName, SolidKind>>;

/**
 * What a probe bounces off besides the field and the battleship. Not another probe: probes
 * drift apart on their slots. Not a torpedo: a torpedo that meets a probe goes off (see
 * TORPEDO_FUSE).
 */
export const PROBE_BOUNCES: readonly SolidKindName[] = ['ring', 'wreck', 'core', 'head'];
/** Of them, what a probe's slot bounces off as well: what every browser has alike, unlike wreckage and cores, each where its own browser has it, and a head one browser may have broken up already (see game/items, Probes.update). */
export const SLOT_BOUNCES: readonly SolidKindName[] = ['ring'];

/**
 * Where a laser's beam stops besides the field, the battleship and the ships. Wreckage and
 * torpedoes take the beam too, but the laser asks them itself (Game.fireLaser): a wreck stops it
 * as rock does, a torpedo it reaches before all else is shot down.
 */
export const BEAM_STOPS: readonly SolidKindName[] = ['ring', 'core', 'probe', 'head'];

/**
 * What wreckage grinds to dust on besides rock and hull. Wreckage meets wreckage in world/wrecks
 * (two plates clang off each other); a probe bounces off a plate ten times its mass, which does
 * not notice it (see PROBE_BOUNCES); a torpedo goes off on a plate (see TORPEDO_FUSE).
 */
export const WRECK_GRINDS: readonly SolidKindName[] = ['ring', 'core', 'head'];

/** What sets off a torpedo where it flies, besides rock and hull: everything solid, another shooter's torpedo too. */
export const TORPEDO_FUSE: readonly SolidKindName[] = ['ring', 'core', 'head', 'wreck', 'probe', 'torpedo'];

/**
 * What a piece of the comet's shower bursts on besides the field's pieces near the swarm and the
 * battleship (see Game.showerMeetsSolids). Not its own comet's head, which leads the swarm; the
 * probes and torpedoes it passes stay whole, as the README's list of what it bursts on says.
 */
export const SHOWER_BURSTS: readonly SolidKindName[] = ['ring', 'wreck', 'core'];

/** A ball that moves: a sponsor core, a piece of wreckage. */
interface Ball {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

/** Where the game's solids are, for solidTable. */
export interface SolidSources {
  /** The rings' housings (the race's gates, the bases, the flight school's rings still standing): `touch` moves `position` out and sets `normal` when it touches; `ray` the nearest within `max`. */
  rings: {
    touch(position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean;
    ray(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null;
  };
  cores(): readonly Ball[];
  /** The first piece of wreckage touching a sphere (see Wrecks.overlap). */
  wreck(position: THREE.Vector3, radius: number): { mesh: { position: THREE.Vector3 }; radius: number; velocity: THREE.Vector3 } | null;
  probes(): readonly { position: THREE.Vector3 }[];
  torpedoes(): readonly { position: THREE.Vector3; shooter: unknown }[];
  /** Where the comet's head is now (into `out`) while it flies whole, or null; its velocity into `velocity` when given. */
  head(out: THREE.Vector3, velocity?: THREE.Vector3): THREE.Vector3 | null;
}

const ringNormal = new THREE.Vector3();
const headPoint = new THREE.Vector3();
const headVelocity = new THREE.Vector3();

/**
 * A sphere at `position` of `radius` touching a ball at `center` of `reach` moving at `velocity`
 * (wreckage, a core) is pushed out onto it: `out` the ball's outward normal there, `moving` its
 * velocity; true then (see game/items, Solid).
 */
export function pushOffBall(center: THREE.Vector3, reach: number, velocity: THREE.Vector3, position: THREE.Vector3, radius: number, out: THREE.Vector3, moving: THREE.Vector3): boolean {
  out.subVectors(position, center);
  const distance = out.length();
  if (distance >= reach + radius) return false;
  if (distance > 1e-6) out.divideScalar(distance);
  else out.set(0, 1, 0);
  position.copy(center).addScaledVector(out, reach + radius);
  moving.copy(velocity);
  return true;
}

/** Whether a sphere touches one of `balls` of `reach`. */
function touchesBall(balls: readonly { position: THREE.Vector3 }[], reach: number, position: THREE.Vector3, radius: number): boolean {
  for (const ball of balls) if (ball.position.distanceTo(position) < reach + radius) return true;
  return false;
}

/** The nearest of `balls` of `reach` along a beam, nearer than `max`, or null. */
function rayBalls(balls: readonly { position: THREE.Vector3 }[], reach: number, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
  let best: number | null = null;
  for (const ball of balls) {
    const distance = raySphere(origin, direction, ball.position, reach);
    if (distance !== null && distance < (best ?? max)) best = distance;
  }
  return best;
}

/** The table of the game's solids besides the field and the battleship, from where they are. */
export function solidTable(s: SolidSources): SolidTable {
  return {
    ring: {
      touch: (position, radius, at) => s.rings.touch(at.copy(position), radius, ringNormal),
      // held in place by their stations
      push: (position, radius, out, moving) => {
        if (!s.rings.touch(position, radius, out)) return false;
        moving.set(0, 0, 0);
        return true;
      },
      ray: (origin, direction, max) => s.rings.ray(origin, direction, max),
    },
    core: {
      touch: (position, radius, at) => touchesBall(s.cores(), CORE_REACH, position, radius) && !!at.copy(position),
      // thirty times a probe's mass
      push: (position, radius, out, moving) => {
        for (const core of s.cores()) if (pushOffBall(core.position, CORE_REACH, core.velocity, position, radius, out, moving)) return true;
        return false;
      },
      ray: (origin, direction, max) => rayBalls(s.cores(), CORE_REACH, origin, direction, max),
    },
    wreck: {
      touch: (position, radius, at) => !!s.wreck(position, radius) && !!at.copy(position),
      // a plate ten times a probe's mass
      push: (position, radius, out, moving) => {
        const wreck = s.wreck(position, radius);
        return !!wreck && pushOffBall(wreck.mesh.position, wreck.radius, wreck.velocity, position, radius, out, moving);
      },
    },
    probe: {
      touch: (position, radius, at) => touchesBall(s.probes(), PROBE_RADIUS, position, radius) && !!at.copy(position),
      ray: (origin, direction, max) => rayBalls(s.probes(), PROBE_RADIUS, origin, direction, max),
    },
    torpedo: {
      touch: (position, radius, at, ignore) => {
        for (const torpedo of s.torpedoes()) {
          if (torpedo.shooter === ignore || torpedo.position.distanceTo(position) >= TORPEDO_RADIUS + radius) continue;
          at.copy(position);
          return true;
        }
        return false;
      },
    },
    head: {
      touch: (position, radius, at) => {
        const head = s.head(headPoint);
        return !!head && head.distanceTo(position) < HEAD_RADIUS + radius && !!at.copy(position);
      },
      // a mountain of ice against a probe's few tonnes
      push: (position, radius, out, moving) => {
        const head = s.head(headPoint, headVelocity);
        return !!head && pushOffBall(head, HEAD_RADIUS, headVelocity, position, radius, out, moving);
      },
      ray: (origin, direction, max) => {
        const head = s.head(headPoint);
        if (!head) return null;
        const distance = raySphere(origin, direction, head, HEAD_RADIUS);
        return distance !== null && distance < max ? distance : null;
      },
    },
  };
}

/** The operation `op` of each of `kinds`, in their order; a kind without it is a mistake in the use that names it. */
function opsOf<K extends keyof SolidKind>(table: SolidTable, kinds: readonly SolidKindName[], op: K): NonNullable<SolidKind[K]>[] {
  return kinds.map((kind) => {
    const found = table[kind][op];
    if (!found) throw new Error(`solid kind ${kind} has no ${op}`);
    return found;
  });
}

const touchedAt = new THREE.Vector3();

/**
 * Whether a sphere touches any of `kinds` (see SolidKind.touch), the first of them in their order
 * setting `at`; with `only`, just the kinds it marks true are looked at (those a caller knows to
 * lie near, see Game.showerMeetsSolids).
 */
export function touchOf(table: SolidTable, kinds: readonly SolidKindName[]) {
  const touches = opsOf(table, kinds, 'touch');
  return (position: THREE.Vector3, radius: number, at: THREE.Vector3 = touchedAt, ignore: unknown = undefined, only: Readonly<Partial<Record<SolidKindName, boolean>>> | null = null): boolean => {
    for (let i = 0; i < touches.length; i++) {
      if (only && !only[kinds[i]]) continue;
      if (touches[i](position, radius, at, ignore)) return true;
    }
    return false;
  };
}

/** How far along a beam (within `max`) the nearest of `kinds` lies, or null when none does nearer than `max`. */
export function rayOf(table: SolidTable, kinds: readonly SolidKindName[]) {
  const rays = opsOf(table, kinds, 'ray');
  return (origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null => {
    let best = max;
    let found = false;
    for (const ray of rays) {
      const distance = ray(origin, direction, best);
      if (distance !== null && distance < best) {
        best = distance;
        found = true;
      }
    }
    return found ? best : null;
  };
}

/** The Solids a body bounces off among `kinds`, in their order (see game/items). */
export function pushesOf(table: SolidTable, kinds: readonly SolidKindName[]): Solid[] {
  return opsOf(table, kinds, 'push');
}
