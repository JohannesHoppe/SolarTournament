import * as THREE from 'three';
import { raySphere, type AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import type { Effects } from '../view/effects';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASING_PLAIN, shine, torpedoCasing } from '../view/surfaces';
import { MASS } from '../world/bodies';
import { LOCK_DEPTH } from '../world/air';

/** Torpedoes a fresh clone carries. */
export const TORPEDOES = 2;
/** A torpedo leaves the tube this much faster than its ship (units/s, 40 m/s). */
export const TORPEDO_LAUNCH = 800;
/**
 * Its top speed (units/s, 360 m/s): a notch above a ship's 250 m/s, so a ship flying straight
 * is caught at 110 m/s, and below an overdrive's 400 m/s. As for a ship, a push beyond it adds
 * no speed.
 */
export const TORPEDO_TOP_SPEED = 7200;
/** Its main drive along its flight (units/s², 20 g): from a standing launch to top speed in under 2 s, quick on a straight line. */
export const TORPEDO_THRUST = 3924;
/**
 * Its thrusters across its flight, and against it to brake (units/s², 9 g): less than the nearly 10 g
 * a ship turns with at the speed limit (see gripAt), so a hard turn at the right moment leaves it wide. At top speed it turns on a
 * circle of about 1.5 km; one that went past brakes and comes round again.
 */
export const TORPEDO_LATERAL = 1766;
/** How hard it steers for the velocity it wants (1/s): a gap of 100 m/s asks for 10 g. */
const STEER_GAIN = 2;
/** Its seeker reads the target's velocity this late (s, the time constant of its smoothing): a jink is seen only after it began. */
const SEEKER_LAG = 0.4;
/** Its drive and thrusters follow the steering this late again (s): a jink at the last moment is answered too late. */
const STEER_LAG = 0.25;
/**
 * The moment to break (s before the hit at the closing speed): a hard turn started 0.6 to 2 s
 * before the hit makes a torpedo overshoot, a dodge 0.6 to 1.2 s before; Nicole calls it here.
 */
export const TORPEDO_BREAK = 1.5;
/**
 * Its motor burns this long (s); then a torpedo in free flight is gone, so one shaken off a few
 * times dies on its own. One on a hook's rope hangs on as a mass without a motor, and one let go
 * from it flies on as a bomb for FLING_CREDIT seconds more.
 */
export const TORPEDO_LIFETIME = 15;
/**
 * A torpedo on a hook's rope (see game/hook) is a deliberate dirty trick: a bomb on a string.
 * Its fuse goes off on every ship, the one holding it included, and while it is held, or for
 * FLING_CREDIT seconds (s) after it was let go, a ship it goes off on is the holder's kill.
 */
export const FLING_CREDIT = 3;
/** Its own radius, for the laser that shoots it down and for the rock it strikes (units, 6 m). It goes off at a ship's hull (see strikes). */
export const TORPEDO_RADIUS = 120;
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
  /** Whether it is in sight of a point, where that is more than a clear line to its center (a part of the battleship, see Fleet.inSight). */
  inSight?(from: THREE.Vector3, field: AsteroidField): boolean;
}

/** Whether a seeker at `from` sees what it homes on: in an arena's haze no farther than a lock reaches (see world/air). */
export const seesTarget = (target: Homing, from: THREE.Vector3, field: AsteroidField) => (target.inSight ? target.inSight(from, field) : field.lineOfSight(from, target.flight.position, LOCK_DEPTH));

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
  /** The push of its drive and thrusters this moment (units/s²), following its steering late (see STEER_LAG). */
  push: THREE.Vector3;
  /** The target's velocity as its seeker reads it, late (see SEEKER_LAG). */
  seen: THREE.Vector3;
  bornAt: number;
  /** This browser decides where it goes off (its shooter is a ship this browser runs). */
  own: boolean;
  mesh: THREE.Mesh;
}

/** What flies a torpedo (see flyTorpedo): where it is, how fast, its push, and the target's velocity as its seeker reads it. */
export interface TorpedoFlight {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly push: THREE.Vector3;
  readonly seen: THREE.Vector3;
}

/** Where a torpedo's target is and how fast it flies. */
export interface Mover {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

const aim = new THREE.Vector3();
const command = new THREE.Vector3();
const course = new THREE.Vector3();
const across = new THREE.Vector3();
const from = new THREE.Vector3();
const step = new THREE.Vector3();
const previous = new THREE.Vector3();

/** Whether a torpedo is a bomb on a string: on a hook's rope, or let go from one within FLING_CREDIT. */
export const onString = (torpedo: Torpedo, now: number) => !!torpedo.holder || now - torpedo.releasedAt < FLING_CREDIT;

/** Whose kill a ship a torpedo goes off on is: the holder's (or flinger's) while it is on a string, otherwise its shooter's. */
export function creditOf(torpedo: Torpedo, now: number): Ship {
  return torpedo.holder ?? (onString(torpedo, now) && torpedo.flinger ? torpedo.flinger : torpedo.shooter);
}

/**
 * The ship a torpedo's fuse goes off on, or null: the hull of any ship its step from `before`
 * passed (see strikes) but its shooter's, or on a string any ship at all. A hull of the
 * shooter's own side sets it off as any other (friendly fire).
 */
export function fused(torpedo: Torpedo, before: THREE.Vector3, ships: readonly Ship[], now: number, dt: number): Ship | null {
  const string = onString(torpedo, now);
  let hit: Ship | null = null;
  for (const ship of ships) {
    if (!ship.alive || (!string && ship === torpedo.shooter)) continue;
    if (strikes(before, torpedo.position, ship.flight, ship.radius, dt)) hit = ship;
  }
  return hit;
}

const nozzle = new THREE.Vector3();
const exhaust = new THREE.Vector3();

/**
 * Bounds a push to what a torpedo can give, in place: along its flight (`course`, unit length)
 * up to TORPEDO_THRUST forwards and TORPEDO_LATERAL backwards, never more than stops it within
 * `dt`; across it up to TORPEDO_LATERAL. Its main drive only pushes it on, nose first.
 */
function bound(push: THREE.Vector3, speed: number, dt: number): THREE.Vector3 {
  const along = push.dot(course);
  across.copy(push).addScaledVector(course, -along).clampLength(0, TORPEDO_LATERAL);
  return push.copy(across).addScaledVector(course, THREE.MathUtils.clamp(along, -Math.min(TORPEDO_LATERAL, speed / dt), TORPEDO_THRUST));
}

/**
 * One step of a torpedo's flight, the same on every browser. With a target it wants to fly at
 * its top speed towards where the target will be when it gets there, the target's velocity as
 * its seeker reads it held: the first time t with |aim + v t| = top · t. A target faster than
 * the torpedo (an overdrive) is chased where it is. It steers for that velocity, its push follows
 * the steering STEER_LAG late, bounded by its drive and thrusters (see bound). Without a target
 * it burns on straight ahead.
 */
export function flyTorpedo(torpedo: TorpedoFlight, target: Mover | null, dt: number) {
  const { position, velocity, push, seen } = torpedo;
  const speed = velocity.length();
  if (target) {
    seen.lerp(target.velocity, 1 - Math.exp(-dt / SEEKER_LAG));
    aim.subVectors(target.position, position);
    const a = seen.lengthSq() - TORPEDO_TOP_SPEED * TORPEDO_TOP_SPEED;
    const b = aim.dot(seen);
    if (a < 0) aim.addScaledVector(seen, (b + Math.sqrt(b * b - a * aim.lengthSq())) / -a);
    command.copy(aim).setLength(TORPEDO_TOP_SPEED).sub(velocity).multiplyScalar(STEER_GAIN);
  } else {
    command.copy(velocity).setLength(TORPEDO_THRUST);
  }
  // the direction of its flight; nearly at rest, where it wants to go
  if (speed > 1) course.copy(velocity).divideScalar(speed);
  else course.copy(command).normalize();
  push.lerp(bound(command, speed, dt), 1 - Math.exp(-dt / STEER_LAG));
  bound(push, speed, dt);
  velocity.addScaledVector(push, dt);
  const limit = Math.max(speed, TORPEDO_TOP_SPEED);
  if (velocity.lengthSq() > limit * limit) velocity.setLength(limit);
  position.addScaledVector(velocity, dt);
}

/**
 * Whether a torpedo that flew from `before` to `after` within `dt` passed within `radius` of a
 * target (at `target` now, flying at its velocity): the closest approach along the step in the
 * target's frame, so a fast pass between two frames goes off all the same.
 */
export function strikes(before: THREE.Vector3, after: THREE.Vector3, target: Mover, radius: number, dt: number): boolean {
  from.copy(before).addScaledVector(target.velocity, dt);
  step.subVectors(after, from);
  const length = step.lengthSq();
  const along = length > 0 ? THREE.MathUtils.clamp(aim.subVectors(target.position, from).dot(step) / length, 0, 1) : 0;
  return from.addScaledVector(step, along).distanceToSquared(target.position) < radius * radius;
}

/** A torpedo's length (units, 13 m), its body's radius (units, 1.5 m) and how far its fins reach out (units, 2.9 m): looks only, its radius for every rule is TORPEDO_RADIUS. */
const LENGTH = 260;
const BODY = 30;
const FIN_REACH = 58;
/** Sides around its round parts: smooth at the closest look, a few hundred triangles. */
const AROUND = 24;

/** The casing's row of a point along the axis (z, nose +LENGTH/2): 0 at the nose's tip, 1 at the nozzle's lip (see torpedoCasing). */
const casingRow = (z: number) => (LENGTH / 2 - z) / LENGTH;

/**
 * A round part: the profile `[radius, z]` turned about the axis, painted from the casing by
 * where it lies along it. Built along y and turned onto z with the rest (see torpedoGeometry).
 */
function turned(profile: readonly [number, number][]): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(profile.map(([radius, z]) => new THREE.Vector2(radius, z)), AROUND);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setY(i, 1 - casingRow(position.getY(i)));
  return geometry.toNonIndexed();
}

/** A flat fin or strake at an angle about the axis: its root `base` out from the axis between the two points of `root` along it, its tip `reach` out between those of `tip`, `thickness` thick. */
function fin(angle: number, root: [number, number], tip: [number, number], base: number, reach: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(base, root[0]), new THREE.Vector2(base, root[1]), new THREE.Vector2(reach, tip[1]), new THREE.Vector2(reach, tip[0])]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).translate(0, 0, -thickness / 2);
  const out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const side = new THREE.Vector3(-Math.cos(angle), 0, Math.sin(angle));
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(out, new THREE.Vector3(0, 1, 0), side));
  // its paint: the casing's plain strip at its place along the body
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, CASING_PLAIN / 2, 1 - casingRow(position.getY(i)));
  return geometry;
}

/** A part lit by its own color (the glow material, see Torpedoes): vertex colors brighter than white, for the bloom. */
function glowing(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  part.deleteAttribute('uv');
  part.deleteAttribute('normal');
  const colors = new Float32Array(part.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return part;
}

/** The seeker's eye (a red glow behind the glass) and the motor's throat (orange-white heat), linear colors above 1 so the bloom takes them. */
const SEEKER_GLOW = new THREE.Color(1.1, 0.06, 0.03);
const NOZZLE_GLOW = new THREE.Color(1.3, 0.55, 0.16);

/**
 * A torpedo as built: a round body ending in an ogive nose with the seeker's dark window at its
 * tip, a boat tail narrowing to the nozzle's bell, four strakes along the body and four fins
 * at the tail, crossed at 45° to them. Two groups: the painted casing (0) and what glows (1),
 * the seeker's eye and the motor's throat. Its nose points along +z, as lookAt turns it.
 */
function torpedoGeometry(): THREE.BufferGeometry {
  const half = LENGTH / 2;
  const nose: [number, number][] = [];
  for (let k = 0; k <= 8; k++) {
    const s = k / 8;
    nose.push([9 + (BODY - 9) * Math.cos((s * Math.PI) / 2) ** 0.85, 58 + s * (half - 12 - 58)]);
  }
  const body = [
    // the bell's outside, its lip and its inside down to the throat (inside out: faces inwards)
    turned([[12, -half + 12], [17, -half], [19, -half], [21, -half + 16]]),
    // the boat tail, the body, the nose
    turned([[21, -half + 16], [BODY, -96]]),
    turned([[BODY, -96], [BODY, 58]]),
    turned(nose),
    // the seeker's dome of dark glass
    turned(Array.from({ length: 5 }, (_, k): [number, number] => [9 * Math.cos((k / 4) * (Math.PI / 2)), half - 12 + 9 * Math.sin((k / 4) * (Math.PI / 2))])),
  ];
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2;
    body.push(fin(angle + Math.PI / 4, [-half + 10, -62], [-half + 6, -96], 18, FIN_REACH, 2.5));
    body.push(fin(angle, [-40, 50], [-28, 38], BODY - 1, BODY + 7, 3));
  }
  // the eye: a small cap of red light just through the dome's top
  const eye = new THREE.SphereGeometry(4.5, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, half - 7, 0);
  const throat = new THREE.CircleGeometry(12, AROUND).rotateX(Math.PI / 2).translate(0, -half + 12, 0);
  const casingPart = mergeGeometries(body)!;
  const glowPart = mergeGeometries([glowing(eye, SEEKER_GLOW), glowing(throat, NOZZLE_GLOW)])!;
  // the casing's parts and the glowing ones carry different attributes: put together as groups of one geometry
  const geometry = new THREE.BufferGeometry();
  const count = casingPart.attributes.position.count + glowPart.attributes.position.count;
  const join = (name: string, size: number, fill: number) => {
    const values = new Float32Array(count * size).fill(fill);
    const a = casingPart.getAttribute(name) as THREE.BufferAttribute | undefined;
    const b = glowPart.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (a) values.set(a.array as Float32Array, 0);
    if (b) values.set(b.array as Float32Array, casingPart.attributes.position.count * size);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
  };
  join('position', 3, 0);
  join('normal', 3, 0);
  join('uv', 2, 0);
  join('color', 3, 1);
  geometry.addGroup(0, casingPart.attributes.position.count, 0);
  geometry.addGroup(casingPart.attributes.position.count, glowPart.attributes.position.count, 1);
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Torpedoes: few, fast and homing, but less agile than a ship. A torpedo flies on every browser alike from its
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
  private readonly geometry = torpedoGeometry();
  /** The casing lit by the scene, a little of the sky mirrored in its metal; what glows lit by itself alone. */
  private readonly material = [
    new THREE.MeshStandardMaterial({ map: torpedoCasing(casingRow), roughness: 0.6, metalness: 0.2, envMap: shine(), envMapIntensity: 0.4 }),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  ];

  constructor(private readonly effects: Effects) {}

  launch(id: string, shooter: Ship, target: Homing | null, position: THREE.Vector3, velocity: THREE.Vector3, now: number, own: boolean) {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.copy(position);
    this.group.add(mesh);
    const seen = target ? target.flight.velocity.clone() : new THREE.Vector3();
    this.list.push({ id, shooter, mass: MASS.torpedo, holder: null, flinger: null, releasedAt: -Infinity, target, position: mesh.position, velocity: velocity.clone(), push: new THREE.Vector3(), seen, bornAt: now, own, mesh });
  }

  /** The launch velocity of a torpedo from a ship: the ship's own and a push out of the tube. */
  static launchVelocity(ship: Ship): THREE.Vector3 {
    return ship.flight.forward(new THREE.Vector3()).multiplyScalar(TORPEDO_LAUNCH).add(ship.flight.velocity);
  }

  /**
   * Flies every torpedo (see flyTorpedo). For the own ones, `detonate` is called where they go
   * off (with the ship they hit, or null).
   */
  update(dt: number, now: number, field: AsteroidField, ships: readonly Ship[], detonate: (torpedo: Torpedo, hit: Ship | null) => void) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const torpedo = this.list[i];
      // its seeker needs a clear line: a ship that slips behind a rock loses it for good
      if (torpedo.target && (!torpedo.target.alive || !seesTarget(torpedo.target, torpedo.position, field))) torpedo.target = null;
      const target = torpedo.target;
      previous.copy(torpedo.position);
      // the motor pushes while it burns (on a rope too, against whatever pulls it, see game/hook); burnt out it only drifts
      const burning = now - torpedo.bornAt < TORPEDO_LIFETIME;
      if (burning) flyTorpedo(torpedo, target?.flight ?? null, dt);
      else torpedo.position.addScaledVector(torpedo.velocity, dt);
      torpedo.mesh.lookAt(exhaust.copy(torpedo.position).add(torpedo.velocity));
      // a short bright trail behind it
      if (burning && Math.random() < dt * 30) this.effects.puff(nozzle.copy(torpedo.velocity).setLength(-160).add(torpedo.position), exhaust.copy(torpedo.velocity).multiplyScalar(0.6), 60);
      const spent = !burning && !torpedo.holder && now - torpedo.releasedAt > FLING_CREDIT;
      // another browser decides where its torpedo goes off; one whose word never came is gone after its time
      if (!torpedo.own) {
        if (spent && now - torpedo.bornAt > TORPEDO_LIFETIME + 2 && now - torpedo.releasedAt > FLING_CREDIT + 2) this.remove(torpedo);
        continue;
      }
      // it goes off at the hull of any ship it passes, its target or not
      const hit = fused(torpedo, previous, ships, now, dt);
      // a part of the battleship it homes on sets it off as a ship does, its hull as a rock does
      const reached = !!target && strikes(previous, torpedo.position, target.flight, target.radius, dt);
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
