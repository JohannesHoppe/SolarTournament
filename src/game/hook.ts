import * as THREE from 'three';
import { raySphere, type Asteroid, type AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import { MASS, rope, share, type Body } from '../world/bodies';

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
 * before, the ship keeps all its speed; what it flies into is its pilot's business. In Capture
 * the Flag it also bites a core the ship may take (see Mark): the game hands the core to the
 * rules, which take it in tow on that cable (see game/flags).
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
/** A mark (a core) is bitten by a harpoon passing this close to its center (units, 20 m): a little more than the canister reaches, so a core need not be hit to the meter. */
const MARK_REACH = 400;
/** After the hook is let go, it is ready again after this long (s): the cable is reeled back. */
export const HOOK_RECHARGE = 1.2;

/**
 * Something else the harpoon bites, where it is (followed as it moves): a sponsor core of
 * Capture the Flag (its side), or a sponsor probe (its id, side -1).
 */
export type Mark = { readonly team: number; readonly position: THREE.Vector3; readonly probe?: string };

/** What a hook holds on to: a point on a rock (in the rock's own frame, so it turns and drifts with it), a ship, or a core (see Mark). */
export type Anchor = { rock: Asteroid; local: THREE.Vector3; ship: null; mark: null } | { rock: null; local: null; ship: Ship; mark: null } | { rock: null; local: null; ship: null; mark: Mark };

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
function anchorPoint(anchor: Anchor, out: THREE.Vector3): THREE.Vector3 | null {
  if (anchor.mark) return out.copy(anchor.mark.position);
  if (anchor.ship) return anchor.ship.alive ? out.copy(anchor.ship.flight.position) : null;
  const object = anchor.rock.object;
  if (!object.parent) return null;
  return out.copy(anchor.local).applyQuaternion(object.quaternion).add(object.position);
}

/** An anchor on a rock at a world point: kept in the rock's frame. */
function rockAnchor(rock: Asteroid, at: THREE.Vector3): Anchor {
  const local = at.clone().sub(rock.object.position).applyQuaternion(spin.copy(rock.object.quaternion).invert());
  return { rock, local, ship: null, mark: null };
}

/**
 * What the hook of `owner` bites, fired along its nose: the nearest rock, ship or mark (a core,
 * reaching MARK_REACH from its center) within reach, the point it bites and how far it is; null
 * for nothing.
 */
export function aimHook(owner: Ship, field: AsteroidField, ships: readonly Ship[], marks: readonly Mark[] = []): { anchor: Anchor; distance: number; at: THREE.Vector3 } | null {
  const origin = owner.nose(nose);
  const forward = owner.flight.forward(heading);
  // the direction the harpoon flies: the nose's, or towards a rock beside it
  chosen.copy(forward);
  let rock = field.raycast(origin, forward, HOOK_RANGE, true);
  // the well's body or the battleship's hull on the nose's line: no ship beyond it is bitten
  const wall = rock && !rock.asteroid ? rock.distance : HOOK_RANGE;
  // nothing straight ahead: the rock whose surface comes closest to the nose's line within HOOK_CONE
  if (!rock?.asteroid) {
    let nearest = HOOK_CONE;
    for (const asteroid of field.asteroids.values()) {
      const line = toward.subVectors(asteroid.object.position, origin);
      const distance = line.length();
      if (distance - asteroid.radius > HOOK_RANGE) continue;
      const off = line.angleTo(forward) - Math.asin(Math.min(1, asteroid.radius / distance));
      if (off >= nearest) continue;
      const hit = field.raycast(origin, line.divideScalar(distance), HOOK_RANGE, true);
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
    if (distance === null || distance > wall || (best && distance >= best.distance)) continue;
    best = { anchor: { rock: null, local: null, ship, mark: null }, distance, at: ship.flight.position.clone() };
  }
  for (const mark of marks) {
    const distance = raySphere(origin, forward, mark.position, MARK_REACH);
    if (distance === null || distance > wall || (best && distance >= best.distance)) continue;
    best = { anchor: { rock: null, local: null, ship: null, mark }, distance, at: mark.position.clone() };
  }
  return best;
}

/** The seconds a harpoon flies to bite at `distance`. */
export const flightTime = (distance: number) => distance / HOOK_SPEED;

/** The winch pulls a body lighter than a ship harder, by the ship's mass over its own, but at most WINCH_LIGHT times HOOK_PULL (32 g, a core's): the cable comes in no faster. */
const WINCH_LIGHT = 4;
const winchOn = (body: Body) => HOOK_PULL * Math.min(MASS.ship / body.mass, WINCH_LIGHT);

/**
 * The cable between `body` and its `anchor` (see world/bodies), with `length` of cable out:
 * the winch takes in any slack and, while `reeling`, pulls the body in (towards `floor`, never
 * past `speedLimit`); a taut cable is a rope (see rope): it only pulls, holds its length, and
 * splits its jerk by the two masses. Every speed counts against the anchor's, so two ships
 * flying side by side are pulled as two at rest. Only `body` is moved here, and the anchor
 * when `moveAnchor`: a ship run by another browser takes its share there, from the same
 * cable. A rock is millions of times a ship's mass: hooked to one, the ship takes all of it.
 * Returns the length the cable has now, or null when it snapped.
 */
export function pullOn(body: Body, anchor: Body, length: number, reeling: boolean, floor: number, speedLimit: number, dt: number, moveAnchor = false): number | null {
  toAnchor.subVectors(anchor.position, body.position);
  const distance = toAnchor.length();
  if (distance < 1) return length;
  if (distance > floor + HOOK_RANGE * HOOK_SNAP) return null;
  toAnchor.divideScalar(distance);
  relative.subVectors(body.velocity, anchor.velocity);
  // the winch takes in the slack, and while held pulls, never past the limit; and the flight
  // computer burns against the closing speed it could no longer stop before the floor (two
  // bodies each their share of it)
  let cable = Math.min(length, distance);
  const closing = relative.dot(toAnchor);
  const stoppable = Math.sqrt(2 * HOOK_BRAKE * Math.max(0, distance - floor));
  // (the anchor, moved here, the other way)
  if (reeling && closing > stoppable) {
    const brake = Math.min(closing - stoppable, HOOK_BRAKE * dt);
    body.velocity.addScaledVector(toAnchor, -brake * share(body.mass, anchor.mass));
    if (moveAnchor) anchor.velocity.addScaledVector(toAnchor, brake * share(anchor.mass, body.mass));
  } else if (reeling && distance > floor && relative.length() < speedLimit) {
    // the winch's force gives a ship HOOK_PULL, a lighter body more (see WINCH_LIGHT)
    const room = stoppable - closing;
    body.velocity.addScaledVector(toAnchor, Math.min(winchOn(body) * dt, room));
    if (moveAnchor) anchor.velocity.addScaledVector(toAnchor, -Math.min(winchOn(anchor) * dt, room));
  }
  cable = Math.max(floor, cable);
  rope(body, anchor, cable, true, moveAnchor);
  return cable;
}

/**
 * Where the cable pulls from: for a hooked ship that ship; for a rock its center, the cable
 * wrapped around the rock, so a ship swings around the rock and never through it. Null when
 * what it held is gone.
 */
export function pivotOf(anchor: Anchor, out: THREE.Vector3): THREE.Vector3 | null {
  if (anchor.ship || anchor.mark) return anchorPoint(anchor, out);
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

  dispose() {
    for (const line of [...this.spare, ...(this.group.children as THREE.Line[])]) line.geometry.dispose();
    this.material.dispose();
  }

  /** Draws a cable from a nose (or a stern) to a point. */
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
