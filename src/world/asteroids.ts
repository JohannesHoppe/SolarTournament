import * as THREE from 'three';
import { colliderBox } from '../assets';
import { Randomizer } from '../random';

export const FIELD_RADIUS = 45000;
const ASTEROID_COUNT = 40;
const MIN_SCALE = 2.5;
const MAX_SCALE = 7;
/** Rocks are not full ellipsoids; the collision shape is slightly smaller than the bounding box. */
const SHAPE_FILL = 0.9;
const SPIN_RATE = 0.04;
/** Fragments are this much smaller than their parent. */
const FRAGMENT_SCALE = 0.55;
const MAX_GENERATION = 2;
const FRAGMENT_SPEED = 150;
/** Surface gravity per unit of mean radius (1/s²): uniform density, so bigger rocks pull harder. */
const GRAVITY_PER_RADIUS = 0.004;

export const ASTEROID_POINTS = [200, 120, 80];

export interface Asteroid {
  id: string;
  object: THREE.Object3D;
  /** Radius of the bounding sphere. */
  radius: number;
  /** Average of the three semi-axes, used for gravity and effects. */
  meanRadius: number;
  /** Laser hits the rock withstands before it breaks apart. */
  hitPoints: number;
  generation: number;
  spinAxis: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Field time (s) the rock came into being, and its position and orientation then. */
  born: number;
  basePosition: THREE.Vector3;
  baseOrientation: THREE.Quaternion;
  /** Ellipsoid in the object's own coordinates. */
  center: THREE.Vector3;
  semiAxes: THREE.Vector3;
  /** World matrix inverse, refreshed every update. */
  inverse: THREE.Matrix4;
}

/**
 * A rock as it travels over the network: where it stands follows from the seed, the field
 * time and when it broke off its parent, so only those travel.
 */
export type AsteroidState = {
  id: string;
  hp: number;
  /** field time the rock was born (s) */
  b: number;
};

/** The whole field for a player who joins a running tournament. */
export type FieldState = {
  /** field time (s) */
  t: number;
  a: AsteroidState[];
};

interface Template {
  object: THREE.Object3D;
  center: THREE.Vector3;
  semiAxes: THREE.Vector3;
  /** Template scale, the object's own size factor before field scaling. */
  scale: number;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) % 2147483000 + 1;
}

const u = new THREE.Vector3();
const v = new THREE.Vector3();
const point = new THREE.Vector3();
const pull = new THREE.Vector3();
const sight = new THREE.Vector3();

/**
 * The asteroid field: few, huge rocks that take a lot of fire before they break apart and
 * pull ships gently towards them. Layout and fragments come from seeded randomness, so every
 * client produces the same field and the same fragments for the same asteroid id. Where a
 * rock stands and how it is turned is computed from the field time, not added up frame by
 * frame, so browsers that share the field time see the same field whatever their frame rate.
 */
export class AsteroidField {
  readonly group = new THREE.Group();
  readonly asteroids = new Map<string, Asteroid>();
  /** Field time (s): runs with the game; online, the lead browser's field time is shared. */
  clock = 0;
  private readonly templates: Template[];

  constructor(objects: THREE.Object3D[]) {
    this.templates = objects.map((object) => {
      const box = colliderBox(object);
      // rounded to whole units, so tiny floating point differences between browsers vanish
      return {
        object,
        center: box.getCenter(new THREE.Vector3()).round(),
        semiAxes: box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * SHAPE_FILL).round(),
        scale: Math.max(object.scale.x, object.scale.y, object.scale.z),
      };
    });
  }

  generate(seed: number) {
    this.clear();
    this.clock = 0;
    const r = new Randomizer(seed);
    const direction = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const type = r.nextInt() % this.templates.length;
      const scale = r.range(MIN_SCALE, MAX_SCALE);
      const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      // a few attempts to keep the rocks apart; the sequence is seeded, so it stays deterministic
      for (let attempt = 0; attempt < 8; attempt++) {
        direction.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        position.copy(direction).multiplyScalar(FIELD_RADIUS * Math.cbrt(r.nextFloat()));
        if (!this.overlap(position, this.boundingRadius(type, scale) * 1.3)) break;
      }
      this.add(String(i), type, scale, 0, 0, position, spinAxis, new THREE.Vector3());
    }
  }

  clear() {
    for (const asteroid of this.asteroids.values()) this.group.remove(asteroid.object);
    this.asteroids.clear();
  }

  private boundingRadius(type: number, scale: number) {
    const t = this.templates[type];
    return (t.center.length() + Math.max(t.semiAxes.x, t.semiAxes.y, t.semiAxes.z)) * t.scale * scale;
  }

  private add(id: string, type: number, scale: number, generation: number, born: number, position: THREE.Vector3, spinAxis: THREE.Vector3, velocity: THREE.Vector3) {
    const template = this.templates[type];
    const object = template.object.clone(true);
    object.scale.multiplyScalar(scale);
    object.traverse((o) => (o.castShadow = o.receiveShadow = o instanceof THREE.Mesh));
    this.group.add(object);
    const s = template.scale * scale;
    const meanRadius = ((template.semiAxes.x + template.semiAxes.y + template.semiAxes.z) / 3) * s;
    const asteroid: Asteroid = {
      id,
      object,
      radius: this.boundingRadius(type, scale),
      meanRadius,
      hitPoints: Math.round(4 + meanRadius / 800),
      generation,
      spinAxis,
      velocity,
      born,
      basePosition: position.clone(),
      baseOrientation: object.quaternion.clone(),
      center: template.center,
      semiAxes: template.semiAxes,
      inverse: new THREE.Matrix4(),
    };
    this.asteroids.set(id, asteroid);
    object.userData.type = type;
    object.userData.scale = scale;
    this.place(asteroid);
  }

  /** Puts a rock where the field time says: drifted along its velocity, turned about its axis. */
  private place(a: Asteroid) {
    const age = this.clock - a.born;
    a.object.position.copy(a.basePosition).addScaledVector(a.velocity, age);
    a.object.quaternion.setFromAxisAngle(a.spinAxis, SPIN_RATE * age).multiply(a.baseOrientation);
    a.object.updateMatrixWorld(true);
    a.inverse.copy(a.object.matrixWorld).invert();
  }

  update(dt: number) {
    this.setClock(this.clock + dt);
  }

  /** Moves the field to a field time, e.g. the lead browser's. */
  setClock(time: number) {
    this.clock = time;
    for (const asteroid of this.asteroids.values()) this.place(asteroid);
  }

  /**
   * One laser hit, at a field time (by default now; online, the shooter's). Returns the
   * asteroid when it breaks apart (its fragments are already in the field), otherwise undefined.
   */
  hit(id: string, at = this.clock): Asteroid | undefined {
    const asteroid = this.asteroids.get(id);
    if (!asteroid) return undefined;
    asteroid.hitPoints--;
    return asteroid.hitPoints <= 0 ? this.destroy(id, at) : undefined;
  }

  /** Breaks a rock at a field time: the fragments start from where it stood then. */
  private destroy(id: string, at: number): Asteroid | undefined {
    const asteroid = this.asteroids.get(id);
    if (!asteroid) return undefined;
    this.group.remove(asteroid.object);
    this.asteroids.delete(id);

    if (asteroid.generation < MAX_GENERATION) {
      const r = new Randomizer(hashSeed(id));
      const count = 2 + (r.nextInt() % 2);
      const scale = asteroid.object.userData.scale * FRAGMENT_SCALE;
      const origin = asteroid.basePosition.clone().addScaledVector(asteroid.velocity, at - asteroid.born);
      for (let i = 0; i < count; i++) {
        const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const position = origin.clone().addScaledVector(direction, asteroid.meanRadius * 0.6);
        const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const velocity = direction.multiplyScalar(FRAGMENT_SPEED * r.range(0.6, 1.4)).add(asteroid.velocity);
        this.add(`${id}.${i}`, r.nextInt() % this.templates.length, scale, asteroid.generation + 1, at, position, spinAxis, velocity);
      }
    }
    return asteroid;
  }

  /** The field time and every rock's hits and birth, for a player who joins a running tournament. */
  snapshot(): FieldState {
    return {
      t: +this.clock.toFixed(3),
      a: [...this.asteroids.values()].map((a) => ({ id: a.id, hp: a.hitPoints, b: +a.born.toFixed(3) })),
    };
  }

  /**
   * Rebuilds the field from a snapshot: breaks the parents of every listed fragment at the
   * fragment's birth (the fragments are deterministic), removes rocks that are gone, takes
   * over the hits and the field time.
   */
  restore(state: FieldState) {
    const listed = new Map(state.a.map((s) => [s.id, s]));
    const ensure = (id: string, at: number) => {
      if (this.asteroids.has(id)) return;
      const dot = id.lastIndexOf('.');
      if (dot < 0) return;
      const parent = id.slice(0, dot);
      ensure(parent, listed.get(parent)?.b ?? at);
      this.destroy(parent, at);
    };
    for (const rock of state.a) ensure(rock.id, rock.b);
    for (const id of [...this.asteroids.keys()]) {
      if (listed.has(id)) continue;
      this.group.remove(this.asteroids.get(id)!.object);
      this.asteroids.delete(id);
    }
    for (const rock of state.a) {
      const asteroid = this.asteroids.get(rock.id);
      if (asteroid) asteroid.hitPoints = rock.hp;
    }
    this.setClock(state.t);
  }

  /** Nearest asteroid hit by a ray, with the distance along the ray. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { asteroid: Asteroid; distance: number } | null {
    let best: { asteroid: Asteroid; distance: number } | null = null;
    for (const asteroid of this.asteroids.values()) {
      if (raySphere(origin, direction, asteroid.object.position, asteroid.radius) === null) continue;
      const distance = rayEllipsoid(asteroid, origin, direction);
      if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { asteroid, distance };
    }
    return best;
  }

  /** True when no asteroid lies between two points. */
  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const distance = from.distanceTo(to);
    if (distance < 1) return true;
    return this.raycast(from, sight.subVectors(to, from).divideScalar(distance), distance) === null;
  }

  /** First asteroid whose surface is closer than radius to a point. */
  overlap(center: THREE.Vector3, radius: number): Asteroid | null {
    for (const asteroid of this.asteroids.values()) {
      const reach = asteroid.radius + radius;
      if (asteroid.object.position.distanceToSquared(center) > reach * reach) continue;
      if (ellipsoidContact(asteroid, center, radius)) return asteroid;
    }
    return null;
  }

  /**
   * Pushes a sphere out of an asteroid. Returns the outward surface normal when they
   * touched (and moves center onto the surface), otherwise null.
   */
  resolve(asteroid: Asteroid, center: THREE.Vector3, radius: number, normal = new THREE.Vector3()): THREE.Vector3 | null {
    const contact = ellipsoidContact(asteroid, center, radius);
    if (!contact) return null;
    // gradient of the inflated ellipsoid, transformed back into the world
    normal.copy(contact.local).divide(contact.axes).divide(contact.axes).transformDirection(asteroid.object.matrixWorld);
    point.copy(contact.local).divideScalar(contact.length).add(asteroid.center).applyMatrix4(asteroid.object.matrixWorld);
    center.copy(point).addScaledVector(normal, 1);
    return normal;
  }

  /** Velocity of a rock's surface at a point (units/s): its drift plus its spin. */
  surfaceVelocity(asteroid: Asteroid, point: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    const arm = pull.subVectors(point, asteroid.object.position);
    return target.copy(asteroid.spinAxis).multiplyScalar(SPIN_RATE).cross(arm).add(asteroid.velocity);
  }

  /** Sum of the asteroids' gravitational pull at a point (units/s²). */
  gravity(position: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    target.set(0, 0, 0);
    for (const asteroid of this.asteroids.values()) {
      pull.subVectors(asteroid.object.position, position);
      const distance = Math.max(pull.length(), asteroid.meanRadius);
      const surfaceGravity = GRAVITY_PER_RADIUS * asteroid.meanRadius;
      const strength = (surfaceGravity * asteroid.meanRadius * asteroid.meanRadius) / (distance * distance);
      target.addScaledVector(pull.normalize(), strength);
    }
    return target;
  }
}

/**
 * Point in the asteroid's own coordinates relative to the ellipsoid center, with the semi-axes
 * inflated by the sphere radius; the sphere touches the rock when the scaled point lies inside
 * the unit sphere.
 */
function ellipsoidContact(asteroid: Asteroid, center: THREE.Vector3, radius: number) {
  const scale = asteroid.object.matrixWorld.getMaxScaleOnAxis();
  const axes = v.copy(asteroid.semiAxes).addScalar(radius / scale);
  const local = u.copy(center).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  const length = Math.hypot(local.x / axes.x, local.y / axes.y, local.z / axes.z);
  return length < 1 ? { local, axes, length } : null;
}

const localOrigin = new THREE.Vector3();
const localEnd = new THREE.Vector3();

/** Distance along a normalized ray to the asteroid's ellipsoid surface, or null. */
function rayEllipsoid(asteroid: Asteroid, origin: THREE.Vector3, direction: THREE.Vector3): number | null {
  localOrigin.copy(origin).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  localEnd.copy(origin).add(direction).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  // one world unit along the ray in local coordinates, both scaled into the unit sphere
  const d = localEnd.sub(localOrigin).divide(asteroid.semiAxes);
  const o = localOrigin.divide(asteroid.semiAxes);
  const a = d.dot(d);
  const b = 2 * o.dot(d);
  const c = o.dot(o) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  if (near >= 0) return near;
  return (-b + root) / (2 * a) >= 0 ? 0 : null;
}

const offset = new THREE.Vector3();

/** Distance along a normalized ray to the first intersection with a sphere, or null. */
export function raySphere(origin: THREE.Vector3, direction: THREE.Vector3, center: THREE.Vector3, radius: number): number | null {
  offset.subVectors(center, origin);
  const along = offset.dot(direction);
  const distSq = offset.lengthSq() - along * along;
  const radiusSq = radius * radius;
  if (distSq > radiusSq) return null;
  const half = Math.sqrt(radiusSq - distSq);
  const near = along - half;
  if (near >= 0) return near;
  return along + half >= 0 ? 0 : null;
}
