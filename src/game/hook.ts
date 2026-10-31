import * as THREE from 'three';
import { raySphere, type Asteroid, type AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import type { Torpedo } from './torpedoes';
import type { Probe } from './items';
import { MASS, rope, ropeFrom, ropeOver, share, type Body } from '../world/bodies';
import { Cable, WRAP_MAX, type CablePath } from './cable';

/**
 * The hook: a harpoon on a cable, fired along the nose. It bites into a rock or a ship within
 * HOOK_RANGE (units, 1 km) after flying there at HOOK_SPEED (units/s, 2 km/s); a rock that
 * passes within HOOK_CONE of the nose counts as ahead, so the harpoon need not be aimed to the
 * meter. While the pilot holds the hook, the winch yanks the cable in with HOOK_PULL
 * (units/s², 8 g) and the cable never gets longer: a ship moving past its rock swings around
 * it, faster the shorter the cable gets (its angular momentum stays), and flies off along its
 * swing when the pilot lets go: a jump, flung across the field. Hooked to a ship, the winch
 * pulls both alike, both being of the same mass; each one's own drive pulls against it. The
 * cable wraps around the rock it bit and any other piece that comes across it, the ship then
 * swinging around the last place the cable touches (see game/cable); it snaps beyond HOOK_SNAP
 * of the range, and where wrapping is no answer (the well's body, the battleship's hull, a
 * piece sweeping through it, too many wraps). The winch stops HOOK_SLACK ship radii (about
 * 70 m) from a ship it holds, and off a rock where a ship on a cable leaving the rock's surface
 * keeps that much off its farthest reach (see floorOf); it pulls nothing beyond the limit it is
 * given (the game gives the coils' limit); while the hook is held, the flight computer burns
 * against any speed towards the cable's next hold it could no longer stop before that distance
 * (with up to HOOK_BRAKE, as late as it can): holding on never slams a ship into its rock. Letting go
 * before, the ship keeps all its speed; what it flies into is its pilot's business. In Capture
 * the Flag it also bites a core the ship may take (see Mark): the game hands the core to the
 * rules, which take it in tow on that cable (see game/flags). A sponsor probe or a torpedo it
 * bites hangs on the rope as a body; a probe the winch reels in all the way, and the ship
 * takes it when it arrives, as if it had flown through it (see game/items).
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
 * Capture the Flag (its side), or a sponsor probe or a torpedo (side -1), which then hangs on
 * the rope as a body: the winch reels a probe in to the ship, which takes it on arrival.
 */
export type Mark = { readonly team: number; readonly position: THREE.Vector3; readonly probe?: Probe; readonly torpedo?: Torpedo };

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
  /** Where the cable lies on the field's pieces, from the anchor to the owner. */
  readonly cable: Cable;
}

/** A tether for `owner` (see Tether), with a cable that lies on nothing yet. */
export const newTether = (owner: Ship, anchor: Anchor | null, flying: number, end: THREE.Vector3, length: number, line: THREE.Line): Tether => ({ owner, anchor, flying, end, length, line, cable: new Cable() });

const point = new THREE.Vector3();
const toAnchor = new THREE.Vector3();
const fromAnchor = new THREE.Vector3();
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
  // nothing straight ahead: the rock whose surface comes closest to the nose's line within HOOK_CONE;
  // a ship or a mark on the nose's line wins over it, however near it lies
  const beside = !rock?.asteroid;
  if (beside) {
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
  // the nearest ship or mark on the nose's line, short of a rock on it
  let limit = rock?.asteroid && !beside ? rock.distance : wall;
  for (const ship of ships) {
    if (ship === owner || !ship.alive) continue;
    const distance = raySphere(origin, forward, ship.flight.position, ship.radius);
    if (distance === null || distance > wall || distance >= limit) continue;
    limit = distance;
    best = { anchor: { rock: null, local: null, ship, mark: null }, distance, at: ship.flight.position.clone() };
  }
  for (const mark of marks) {
    const distance = raySphere(origin, forward, mark.position, MARK_REACH);
    if (distance === null || distance > wall || distance >= limit) continue;
    limit = distance;
    best = { anchor: { rock: null, local: null, ship: null, mark }, distance, at: mark.position.clone() };
  }
  if (!best && rock?.asteroid) {
    const at = origin.clone().addScaledVector(chosen, rock.distance);
    best = { anchor: rockAnchor(rock.asteroid, at), distance: rock.distance, at };
  }
  return best;
}

/** The seconds a harpoon flies to bite at `distance`. */
export const flightTime = (distance: number) => distance / HOOK_SPEED;

/**
 * Two hooks bit the same probe or torpedo at once, on two browsers: whether the ship that holds
 * it here keeps it against the one another browser says took it. The lower id keeps it, so
 * every browser comes to the same holder, and exactly one browser is in charge of a torpedo.
 */
export const keepsHold = (holder: string, claimant: string) => holder < claimant;

/**
 * The winch's force gives a ship HOOK_PULL, and pulls both ends of its cable alike: a body
 * lighter than a ship is pulled harder, by the ship's mass over its own, but at most
 * WINCH_LIGHT times HOOK_PULL (32 g, a core's: the cable comes in no faster), and then the
 * force is that much smaller for the heavier end. Two ships pull each other with 8 g each; a
 * probe (half a tonne) comes in at 32 g while its ship feels a quarter of a g of it.
 */
const WINCH_LIGHT = 4;
const winchOn = (body: Body, other: Body) => (HOOK_PULL * Math.min(MASS.ship, WINCH_LIGHT * Math.min(body.mass, other.mass))) / body.mass;

/**
 * The cable between `body` and its `anchor` (see world/bodies), with `length` of cable out:
 * the winch takes in any slack and, while `reeling`, pulls the body in (towards `floor`, never
 * past `speedLimit`); a taut cable is a rope (see rope): it only pulls, holds its length, and
 * splits its jerk by the two masses. Every speed counts against the anchor's, so two ships
 * flying side by side are pulled as two at rest. Only `body` is moved here, and the anchor
 * as `anchorEnd` says: 'moved' here too; 'fixed', a rock (millions of times a ship's mass:
 * hooked to one, the ship takes all of it); 'elsewhere', a body another browser runs, which
 * takes its share there from the same cable, each end pulled as by a spring (see ropeFrom).
 * Returns the length the cable has now, or null when it snapped.
 *
 * A cable wrapped around the field's pieces (`path`, see game/cable) is the same rope bent
 * over its wrap points: `length` is all of it, the body's stretch runs to the wrap point next to
 * it and the anchor's to the one next to the anchor, and the winch and the brake work along each
 * end's own stretch, `floor` the body's and `farFloor` the anchor's. The winch keeps each
 * stretch at least at its floor, paying out what the cable wraps onto a piece: a ship winding
 * its cable round a rock never comes nearer to it, and spends its swing on the winch's brake.
 */
export function pullOn(body: Body, anchor: Body, length: number, reeling: boolean, floor: number, speedLimit: number, dt: number, anchorEnd: 'moved' | 'fixed' | 'elsewhere' = 'fixed', path: CablePath | null = null, farFloor = 0): number | null {
  const moveAnchor = anchorEnd === 'moved';
  const near = path ? path.near : anchor;
  toAnchor.subVectors(near.position, body.position);
  const distance = toAnchor.length();
  if (distance < 1) return length;
  // the anchor's own stretch, and the cable between the two
  fromAnchor.subVectors(path ? path.far.position : body.position, anchor.position);
  const reach = path ? fromAnchor.length() : 0;
  const between = path ? path.between + reach : 0;
  if (distance + between > floor + HOOK_RANGE * HOOK_SNAP) return null;
  toAnchor.divideScalar(distance);
  if (path) fromAnchor.divideScalar(Math.max(reach, 1));
  else fromAnchor.copy(toAnchor).negate();
  relative.subVectors(body.velocity, near.velocity);
  // the winch takes in the slack, and while held pulls, never past the limit; and the flight
  // computer burns against the closing speed it could no longer stop before the floor (two
  // bodies each their share of it)
  let cable = Math.min(length, distance + between);
  const closing = relative.dot(toAnchor);
  const stoppable = Math.sqrt(2 * HOOK_BRAKE * Math.max(0, distance - floor));
  // (the anchor, moved here, along its own stretch)
  if (reeling && closing > stoppable) {
    const brake = Math.min(closing - stoppable, HOOK_BRAKE * dt);
    body.velocity.addScaledVector(toAnchor, -brake * share(body.mass, anchor.mass));
    if (moveAnchor) anchor.velocity.addScaledVector(fromAnchor, -brake * share(anchor.mass, body.mass));
  } else if (reeling && cable > floor + between && relative.length() < speedLimit) {
    // the winch's force gives a ship HOOK_PULL, a lighter body more (see WINCH_LIGHT); with the
    // cable in to the floor it holds, and the rope alone pulls
    const room = stoppable - closing;
    body.velocity.addScaledVector(toAnchor, Math.min(winchOn(body, anchor) * dt, room));
    if (moveAnchor && (!path || reach > farFloor)) anchor.velocity.addScaledVector(fromAnchor, Math.min(winchOn(anchor, body) * dt, room));
  }
  if (!path) {
    cable = Math.max(floor, cable);
    if (anchorEnd === 'elsewhere') ropeFrom(body, anchor, cable, dt);
    else rope(body, anchor, cable, true, moveAnchor);
    return cable;
  }
  // a rock's end lies on it for good; a moving end keeps its own floor too
  cable = Math.max(floor + path.between + (anchorEnd === 'fixed' ? reach : farFloor), cable);
  if (anchorEnd === 'elsewhere') ropeFrom(body, anchor, cable, dt, near, between);
  else ropeOver(body, anchor, near, path.far, cable - path.between, true, moveAnchor);
  return cable;
}

/** Where the cable is made fast (the bite on a rock, the ship, the core, probe or torpedo), or null when what it held is gone. */
export const pivotOf = (anchor: Anchor, out: THREE.Vector3): THREE.Vector3 | null => anchorPoint(anchor, out);

/**
 * How close the winch reels a ship along a cable that leaves a piece's surface (from the bite,
 * or a wrap point, see game/cable): so far that the ship, even on a cable leaving the surface
 * flat at the piece's farthest reach R, keeps HOOK_SLACK ship radii (h) off that reach:
 * √((R + h)² − R²). A ship winding its cable round the rock thus circles it at h, as far as
 * the winch ever reels it in.
 */
export const clearOf = (ship: Pick<Ship, 'radius'>, rock: Pick<Asteroid, 'radius'>) => Math.sqrt((rock.radius + ship.radius * HOOK_SLACK) ** 2 - rock.radius ** 2);

/**
 * How close the winch reels a ship to where its cable is made fast: HOOK_SLACK ship radii off
 * a ship (or a torpedo), clear of a rock (see clearOf); a probe all the way in, to one ship
 * radius, well within the reach that takes it.
 */
export const floorOf = (ship: Pick<Ship, 'radius'>, anchor: Anchor) => (anchor.mark?.probe ? ship.radius : anchor.rock ? clearOf(ship, anchor.rock) : ship.radius * HOOK_SLACK);

/** Points of a cable's line: its two ends and a wrap point each (see game/cable). */
const LINE_POINTS = WRAP_MAX + 2;

/** The cables of all hooks out, as lines from each owner's nose; reused from hook to hook. */
export class Cables {
  readonly group = new THREE.Group();
  private readonly material = new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1).multiplyScalar(2), transparent: true, opacity: 0.8, toneMapped: false });
  private readonly spare: THREE.Line[] = [];

  /** A line for a new hook. */
  take(): THREE.Line {
    const line = this.spare.pop() ?? new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: LINE_POINTS }, () => new THREE.Vector3())), this.material);
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

  /** Draws a cable from a nose (or a stern) to a point, over the wrap points of `cable` (from its end to its start). */
  static draw(line: THREE.Line, from: THREE.Vector3, to: THREE.Vector3, cable: Cable | null = null) {
    const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const wraps = cable ? cable.count : 0;
    position.setXYZ(0, from.x, from.y, from.z);
    for (let i = 0; i < wraps; i++) {
      const at = cable!.at(wraps - 1 - i);
      position.setXYZ(i + 1, at.x, at.y, at.z);
    }
    position.setXYZ(wraps + 1, to.x, to.y, to.z);
    position.needsUpdate = true;
    line.geometry.setDrawRange(0, wraps + 2);
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
