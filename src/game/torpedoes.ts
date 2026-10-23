import * as THREE from 'three';
import { raySphere, type AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import type { Effects } from '../view/effects';
import { warheadBands } from '../view/surfaces';
import { MASS } from '../world/bodies';

/** Torpedoes a fresh clone carries. */
export const TORPEDOES = 2;
/** A torpedo leaves the tube this much faster than its ship (units/s, 40 m/s). */
const LAUNCH_SPEED = 800;
/** Its drive pushes with 6 g (units/s²), and it closes in on its target with up to CLOSING (units/s, 200 m/s). */
const THRUST = 1177;
const CLOSING = 4000;
/**
 * Its motor burns this long (s); then a torpedo in free flight is gone. One on a hook's rope
 * hangs on as a mass without a motor, and one let go from it flies on as a bomb for
 * FLING_CREDIT seconds more.
 */
const LIFETIME = 12;
/**
 * A torpedo on a hook's rope (see game/hook) is a deliberate dirty trick: a bomb on a string.
 * Its fuse goes off on every ship, the one holding it included, and while it is held, or for
 * FLING_CREDIT seconds (s) after it was let go, a ship it goes off on is the holder's kill.
 */
export const FLING_CREDIT = 3;
/** Its own radius, for the laser that shoots it down (units, 6 m), and how close it has to come to a ship to go off (units, beyond the hull). */
export const TORPEDO_RADIUS = 120;
const FUSE = 150;
/** Hull points a torpedo takes from the ship it hits, whatever side it hits: armor does not stop it. */
export const TORPEDO_DAMAGE = 60;
/** A torpedo locks on a ship (or a part of the President's battleship) within this angle of the nose (rad, about 17°) and this distance (units, 3 km), in sight. */
export const LOCK_ANGLE = 0.3;
export const LOCK_DISTANCE = 60000;
/** Torpedoes remembered after they went off, for hits told late: more than all clones of a tournament carry. */
const GONE_MEMORY = 32;

/** What a torpedo homes on: a ship, or a part of the President's battleship (see Fleet.beacons). */
export interface Homing {
  readonly id: string;
  readonly name: string;
  readonly alive: boolean;
  readonly radius: number;
  readonly flight: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 };
}

export interface Torpedo {
  /** "<shooter id>.<shot>": the same torpedo on every browser. */
  id: string;
  shooter: Ship;
  /** A torpedo is a body (see world/bodies): a tonne. */
  readonly mass: number;
  /** The ship whose hook holds it, or null; the last ship that let it go from its hook, and when (-Infinity: never). */
  holder: Ship | null;
  flinger: Ship | null;
  releasedAt: number;
  target: Homing | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  bornAt: number;
  /** This browser decides where it goes off (its shooter is a ship this browser runs). */
  own: boolean;
  mesh: THREE.Mesh;
}

/** Whether a torpedo is a bomb on a string: on a hook's rope, or let go from one within FLING_CREDIT. */
export const onString = (torpedo: Torpedo, now: number) => !!torpedo.holder || now - torpedo.releasedAt < FLING_CREDIT;

/** Whose kill a ship a torpedo goes off on is: the holder's (or flinger's) while it is on a string, otherwise its shooter's. */
export function creditOf(torpedo: Torpedo, now: number): Ship {
  return torpedo.holder ?? (onString(torpedo, now) && torpedo.flinger ? torpedo.flinger : torpedo.shooter);
}

/** The ship a torpedo's fuse goes off on, or null: any ship but its shooter and the shooter's side, or on a string any ship at all. */
export function fused(torpedo: Torpedo, ships: readonly Ship[], now: number): Ship | null {
  const string = onString(torpedo, now);
  let hit: Ship | null = null;
  for (const ship of ships) {
    if (!ship.alive || (!string && (ship === torpedo.shooter || ship.allyOf(torpedo.shooter)))) continue;
    if (ship.flight.position.distanceTo(torpedo.position) < ship.radius + FUSE) hit = ship;
  }
  return hit;
}

const intercept = new THREE.Vector3();
const wanted = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const exhaust = new THREE.Vector3();

/**
 * Torpedoes: few, slow to start and homing. A torpedo flies on every browser alike from its
 * launch, but only the browser of its shooter decides when it goes off: on a ship (then that
 * ship's browser takes the damage), on the President's battleship (then every browser counts
 * the hits on its parts), on a rock, or burnt out. A laser beam shoots one down,
 * wherever it is fired.
 */
export class Torpedoes {
  readonly group = new THREE.Group();
  readonly list: Torpedo[] = [];
  /** The last torpedoes gone (see recent). */
  private readonly gone: Torpedo[] = [];
  private readonly geometry = new THREE.CylinderGeometry(25, 40, 260, 6).rotateX(Math.PI / 2);
  private readonly material = new THREE.MeshStandardMaterial({ map: warheadBands(), emissive: 0xff3300, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3, flatShading: true });

  constructor(private readonly effects: Effects) {}

  launch(id: string, shooter: Ship, target: Homing | null, position: THREE.Vector3, velocity: THREE.Vector3, now: number, own: boolean) {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.copy(position);
    this.group.add(mesh);
    this.list.push({ id, shooter, mass: MASS.torpedo, holder: null, flinger: null, releasedAt: -Infinity, target, position: mesh.position, velocity: velocity.clone(), bornAt: now, own, mesh });
  }

  /** The launch velocity of a torpedo from a ship: the ship's own and a push out of the tube. */
  static launchVelocity(ship: Ship): THREE.Vector3 {
    return ship.flight.forward(new THREE.Vector3()).multiplyScalar(LAUNCH_SPEED).add(ship.flight.velocity);
  }

  /**
   * Flies every torpedo: it turns its push towards where its target will be and closes in.
   * For the own ones, `detonate` is called where they go off (with the ship they hit, or null).
   */
  update(dt: number, now: number, field: AsteroidField, ships: readonly Ship[], detonate: (torpedo: Torpedo, hit: Ship | null) => void) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const torpedo = this.list[i];
      // its seeker needs a clear line: a ship that slips behind a rock loses it for good
      if (torpedo.target && (!torpedo.target.alive || !field.lineOfSight(torpedo.position, torpedo.target.flight.position))) torpedo.target = null;
      const target = torpedo.target;
      if (target) {
        // lead the target: where it will be when the torpedo closes the distance
        const distance = intercept.subVectors(target.flight.position, torpedo.position).length();
        intercept.addScaledVector(target.flight.velocity, distance / CLOSING).normalize();
        wanted.copy(target.flight.velocity).addScaledVector(intercept, CLOSING);
      } else {
        wanted.copy(torpedo.velocity).setLength(torpedo.velocity.length() + THRUST * dt);
      }
      // the motor pushes while it burns (on a rope too, against whatever pulls it, see game/hook)
      const burning = now - torpedo.bornAt < LIFETIME;
      if (burning) torpedo.velocity.add(wanted.sub(torpedo.velocity).clampLength(0, THRUST * dt));
      torpedo.position.addScaledVector(torpedo.velocity, dt);
      torpedo.mesh.lookAt(exhaust.copy(torpedo.position).add(torpedo.velocity));
      // a short bright trail behind it
      if (burning && Math.random() < dt * 30) this.effects.puff(nozzle.copy(torpedo.velocity).setLength(-160).add(torpedo.position), exhaust.copy(torpedo.velocity).multiplyScalar(0.6), 60);
      const spent = !burning && !torpedo.holder && now - torpedo.releasedAt > FLING_CREDIT;
      // another browser decides where its torpedo goes off; one whose word never came is gone after its time
      if (!torpedo.own) {
        if (spent && now - torpedo.bornAt > LIFETIME + 2 && now - torpedo.releasedAt > FLING_CREDIT + 2) this.remove(torpedo);
        continue;
      }
      const hit = fused(torpedo, ships, now);
      // a part of the battleship it homes on sets it off as a ship does, its hull as a rock does
      const reached = !!target && target.flight.position.distanceTo(torpedo.position) < target.radius + FUSE;
      const struck = reached || !!field.obstacle?.touches(torpedo.position, TORPEDO_RADIUS) || field.overlap(torpedo.position, TORPEDO_RADIUS) || field.insideWell(torpedo.position, TORPEDO_RADIUS);
      if (hit || struck || spent) detonate(torpedo, hit);
    }
  }

  /** The first torpedo a beam passes through, with the distance along it. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, shooter: Ship, now: number): { torpedo: Torpedo; distance: number } | null {
    let best: { torpedo: Torpedo; distance: number } | null = null;
    for (const torpedo of this.list) {
      // a ship does not shoot down its own torpedo leaving the tube
      if (torpedo.shooter === shooter && now - torpedo.bornAt < 0.5) continue;
      const distance = raySphere(origin, direction, torpedo.position, TORPEDO_RADIUS);
      if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { torpedo, distance };
    }
    return best;
  }

  find(id: string): Torpedo | null {
    return this.list.find((torpedo) => torpedo.id === id) ?? null;
  }

  /** A torpedo in flight or gone a moment ago, where it went off: its hit is told after it is gone. */
  recent(id: string): Torpedo | null {
    return this.find(id) ?? this.gone.find((torpedo) => torpedo.id === id) ?? null;
  }

  remove(torpedo: Torpedo) {
    const index = this.list.indexOf(torpedo);
    if (index < 0) return;
    this.list.splice(index, 1);
    this.group.remove(torpedo.mesh);
    this.gone.push(torpedo);
    if (this.gone.length > GONE_MEMORY) this.gone.shift();
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
    this.gone.length = 0;
  }
}
