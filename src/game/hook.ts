import * as THREE from 'three';
import { raySphere, type Asteroid, type AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import type { FlightModel } from '../ship/flight';

/**
 * The hook: a harpoon on a cable, fired along the nose. It bites into a rock or a ship within
 * HOOK_RANGE (units, 1 km) after flying there at HOOK_SPEED (units/s, 2 km/s); a rock that
 * passes within HOOK_CONE of the nose counts as ahead, so the harpoon need not be aimed to the
 * meter. While the pilot holds the hook, the winch yanks the cable in with HOOK_PULL
 * (units/s², 8 g) and the cable never gets longer: a ship moving past its rock swings around
 * it, faster the shorter the cable gets (its angular momentum stays), and flies off along its
 * swing when the pilot lets go: a jump, flung across the field. Hooked to a ship, the winch
 * pulls both alike, both being of the same mass; each one's own drive pulls against it. The
 * cable snaps beyond HOOK_SNAP of the range; the winch stops HOOK_SLACK ship radii (about 70 m)
 * from where the hook bit (see pivotOf, floorOf), pulls nothing beyond the limit it is given
 * (the game gives the coils' limit); while the hook is held, the flight computer burns against
 * any speed towards the anchor it could no longer stop before that distance (with up to
 * HOOK_BRAKE, as late as it can): holding on never slams a ship into its rock. Letting go
 * before, the ship keeps all its speed; what it flies into is its pilot's business.
 */
export const HOOK_RANGE = 20000;
const HOOK_SPEED = 40000;
/** The flight computer brakes a reeled ship's closing speed with up to this (units/s², 12 g, nearly the main drive), as late as it can, so it comes to rest at the floor. */
const HOOK_BRAKE = 2350;
/** Aim of the harpoon (rad, about 3°): a rock whose surface passes this close to the nose's line is hit. */
const HOOK_CONE = 0.05;
export const HOOK_PULL = 1570;
const HOOK_SNAP = 1.5;
const HOOK_SLACK = 4;
/** After the hook is let go, it is ready again after this long (s): the cable is reeled back. */
export const HOOK_RECHARGE = 1.2;

/** What a hook holds on to: a point on a rock (in the rock's own frame, so it turns and drifts with it), or a ship. */
export type Anchor = { rock: Asteroid; local: THREE.Vector3; ship: null } | { rock: null; local: null; ship: Ship };

/** A hook of a ship: the harpoon in flight (`flying` seconds left), or holding (`length` of cable out). */
export interface Tether {
  owner: Ship;
  anchor: Anchor | null;
  /** Seconds the harpoon still flies; 0 once it holds, or for a miss that is reeled back. */
  flying: number;
  /** Where a harpoon that hits nothing ends (world), drawn while it flies. */
  readonly end: THREE.Vector3;
  length: number;
  line: THREE.Line;
}

const point = new THREE.Vector3();
const toAnchor = new THREE.Vector3();
const spin = new THREE.Quaternion();
const nose = new THREE.Vector3();
const toward = new THREE.Vector3();
const heading = new THREE.Vector3();
const chosen = new THREE.Vector3();
const relative = new THREE.Vector3();

/** Where an anchor is now (world), or null when what it held is gone. */
export function anchorPoint(anchor: Anchor, out: THREE.Vector3): THREE.Vector3 | null {
  if (anchor.ship) return anchor.ship.alive ? out.copy(anchor.ship.flight.position) : null;
  const object = anchor.rock.object;
  if (!object.parent) return null;
  return out.copy(anchor.local).applyQuaternion(object.quaternion).add(object.position);
}

/** An anchor on a rock at a world point: kept in the rock's frame. */
function rockAnchor(rock: Asteroid, at: THREE.Vector3): Anchor {
  const local = at.clone().sub(rock.object.position).applyQuaternion(spin.copy(rock.object.quaternion).invert());
  return { rock, local, ship: null };
}

/**
 * What the hook of `owner` bites, fired along its nose: the nearest rock or ship within reach,
 * the point it bites and how far it is; null for nothing.
 */
export function aimHook(owner: Ship, field: AsteroidField, ships: readonly Ship[]): { anchor: Anchor; distance: number; at: THREE.Vector3 } | null {
  const origin = owner.nose(nose);
  const forward = owner.flight.forward(heading);
  // the direction the harpoon flies: the nose's, or towards a rock beside it
  chosen.copy(forward);
  let rock = field.raycast(origin, forward, HOOK_RANGE);
  // nothing straight ahead: the rock whose surface comes closest to the nose's line within HOOK_CONE
  if (!rock?.asteroid) {
    let nearest = HOOK_CONE;
    for (const asteroid of field.asteroids.values()) {
      const line = toward.subVectors(asteroid.object.position, origin);
      const distance = line.length();
      if (distance - asteroid.radius > HOOK_RANGE) continue;
      const off = line.angleTo(forward) - Math.asin(Math.min(1, asteroid.radius / distance));
      if (off >= nearest) continue;
      const hit = field.raycast(origin, line.divideScalar(distance), HOOK_RANGE);
      if (hit?.asteroid !== asteroid) continue;
      nearest = off;
      rock = hit;
      chosen.copy(line);
    }
  }
  let best: { anchor: Anchor; distance: number; at: THREE.Vector3 } | null = null;
  if (rock?.asteroid) {
    const at = origin.clone().addScaledVector(chosen, rock.distance);
    best = { anchor: rockAnchor(rock.asteroid, at), distance: rock.distance, at };
  }
  for (const ship of ships) {
    if (ship === owner || !ship.alive) continue;
    const distance = raySphere(origin, forward, ship.flight.position, ship.radius);
    if (distance === null || distance > HOOK_RANGE || (best && distance >= best.distance)) continue;
    best = { anchor: { rock: null, local: null, ship }, distance, at: ship.flight.position.clone() };
  }
  return best;
}

/** The seconds a harpoon flies to bite at `distance`. */
export const flightTime = (distance: number) => distance / HOOK_SPEED;

/**
 * The cable's pull on (the flight of) one ship this browser runs, hanging from `anchor` (moving
 * with `anchorVelocity`) with `length` of cable out: the winch, while `reeling`, pulls it in; a
 * taut cable takes the ship's speed away from the anchor and keeps it at the cable's length.
 * Every speed counts against the anchor's, so two ships flying side by side are pulled as two
 * at rest. Hooked to another ship, `share` is half: the other ship takes the other half on its
 * own browser. Returns the length the cable has now, or null when it snapped.
 */
export function pullOn(flight: FlightModel, anchorAt: THREE.Vector3, anchorVelocity: THREE.Vector3, length: number, reeling: boolean, share: number, floor: number, speedLimit: number, dt: number): number | null {
  toAnchor.subVectors(anchorAt, flight.position);
  const distance = toAnchor.length();
  if (distance < 1) return length;
  if (distance > floor + HOOK_RANGE * HOOK_SNAP) return null;
  toAnchor.divideScalar(distance);
  relative.subVectors(flight.velocity, anchorVelocity);
  // the winch takes in the slack, and while held pulls, never past the limit; and the flight
  // computer burns against the closing speed it could no longer stop before the floor (two
  // ships each their share of it)
  let cable = Math.min(length, distance);
  const closing = relative.dot(toAnchor);
  const stoppable = Math.sqrt(2 * HOOK_BRAKE * Math.max(0, distance - floor));
  if (reeling && closing > stoppable) flight.velocity.addScaledVector(toAnchor, -Math.min(closing - stoppable, HOOK_BRAKE * dt) * share);
  else if (reeling && distance > floor && relative.length() < speedLimit) flight.velocity.addScaledVector(toAnchor, Math.min(HOOK_PULL * dt, stoppable - closing));
  cable = Math.max(floor, cable);
  // a taut cable: no moving away from the anchor, and no farther than the cable
  if (distance > cable) {
    const away = -relative.dot(toAnchor);
    if (away > 0) flight.velocity.addScaledVector(toAnchor, away * share);
    flight.position.addScaledVector(toAnchor, (distance - cable) * share);
  }
  return cable;
}

/**
 * Where the cable pulls from: for a hooked ship that ship; for a rock its center, the cable
 * wrapped around the rock, so a ship swings around the rock and never through it. Null when
 * what it held is gone.
 */
export function pivotOf(anchor: Anchor, out: THREE.Vector3): THREE.Vector3 | null {
  if (anchor.ship) return anchorPoint(anchor, out);
  return anchor.rock.object.parent ? out.copy(anchor.rock.object.position) : null;
}

/** How close the winch reels a ship to the pivot (see pivotOf): HOOK_SLACK ship radii off a ship, or that far beyond a rock's farthest reach. */
export const floorOf = (ship: Ship, anchor: Anchor) => ship.radius * HOOK_SLACK + (anchor.rock ? anchor.rock.radius : 0);

/** The cables of all hooks out, as lines from each owner's nose; reused from hook to hook. */
export class Cables {
  readonly group = new THREE.Group();
  private readonly material = new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1).multiplyScalar(2), transparent: true, opacity: 0.8, toneMapped: false });
  private readonly spare: THREE.Line[] = [];

  /** A line for a new hook. */
  take(): THREE.Line {
    const line = this.spare.pop() ?? new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), this.material);
    line.frustumCulled = false;
    this.group.add(line);
    return line;
  }

  /** A hook is gone: its line waits for the next one. */
  give(line: THREE.Line) {
    this.group.remove(line);
    this.spare.push(line);
  }

  /** Draws a cable from a nose to a point. */
  static draw(line: THREE.Line, from: THREE.Vector3, to: THREE.Vector3) {
    const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, from.x, from.y, from.z);
    position.setXYZ(1, to.x, to.y, to.z);
    position.needsUpdate = true;
  }
}

/** Where a tether's far end is drawn now: the anchor, the harpoon on its way there, or the end of a miss. */
export function cableEnd(tether: Tether, from: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const target = tether.anchor ? anchorPoint(tether.anchor, point) : null;
  const end = target ?? tether.end;
  if (tether.flying <= 0) return out.copy(end);
  // the harpoon is on its way: drawn the share of the way it has flown
  const total = from.distanceTo(end);
  const left = tether.flying * HOOK_SPEED;
  return out.lerpVectors(from, end, total > 0 ? Math.max(0, 1 - left / total) : 1);
}
