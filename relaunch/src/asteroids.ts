import * as THREE from 'three';
import { colliderRadius } from './assets';
import { Randomizer } from './random';

export const FIELD_RADIUS = 20000;
const SPIN_RATE = 0.2;
/** Fragments are this much smaller than their parent. */
const FRAGMENT_SCALE = 0.55;
const MAX_GENERATION = 2;
const FRAGMENT_SPEED = 500;
const DRIFT_DAMPING = 0.35;

export const ASTEROID_POINTS = [110, 60, 30];

export interface Asteroid {
  id: string;
  object: THREE.Object3D;
  radius: number;
  generation: number;
  spinAxis: THREE.Vector3;
  velocity: THREE.Vector3;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) % 2147483000 + 1;
}

/**
 * The asteroid field. Layout and fragments come from seeded randomness, so every client
 * produces the same field and the same fragments for the same asteroid id.
 */
export class AsteroidField {
  readonly group = new THREE.Group();
  readonly asteroids = new Map<string, Asteroid>();
  private readonly templateRadius: number[];
  private readonly spin = new THREE.Quaternion();

  constructor(private readonly templates: THREE.Object3D[]) {
    this.templateRadius = templates.map((t) => colliderRadius(t) * 0.85);
  }

  /** Builds a field of 10 asteroids per level (the original game used level 11 for a round). */
  generate(level: number) {
    this.clear();
    const r = new Randomizer(level);
    for (let i = 0; i < 10 * level; i++) {
      const position = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(FIELD_RADIUS);
      const spinAxis = new THREE.Vector3(r.range(-0.1, 0.1), r.range(-0.1, 0.1), r.range(-0.1, 0.1)).normalize();
      const type = r.nextInt() % this.templates.length;
      this.add(String(i), type, 0, position, spinAxis, new THREE.Vector3());
    }
  }

  clear() {
    for (const asteroid of this.asteroids.values()) this.group.remove(asteroid.object);
    this.asteroids.clear();
  }

  private add(id: string, type: number, generation: number, position: THREE.Vector3, spinAxis: THREE.Vector3, velocity: THREE.Vector3) {
    const object = this.templates[type].clone(true);
    const scale = Math.pow(FRAGMENT_SCALE, generation);
    object.scale.multiplyScalar(scale);
    object.position.copy(position);
    object.userData.type = type;
    this.group.add(object);
    this.asteroids.set(id, { id, object, radius: this.templateRadius[type] * scale, generation, spinAxis, velocity });
  }

  update(dt: number) {
    const damping = Math.exp(-DRIFT_DAMPING * dt);
    for (const a of this.asteroids.values()) {
      a.object.quaternion.premultiply(this.spin.setFromAxisAngle(a.spinAxis, SPIN_RATE * dt));
      if (a.velocity.lengthSq() > 1) {
        a.object.position.addScaledVector(a.velocity, dt);
        a.velocity.multiplyScalar(damping);
      }
    }
  }

  /**
   * Removes an asteroid and spawns its fragments; returns the destroyed asteroid
   * or undefined when it no longer exists (e.g. hit twice in the same moment).
   */
  destroy(id: string): Asteroid | undefined {
    const asteroid = this.asteroids.get(id);
    if (!asteroid) return undefined;
    this.group.remove(asteroid.object);
    this.asteroids.delete(id);

    if (asteroid.generation < MAX_GENERATION) {
      const r = new Randomizer(hashSeed(id));
      const count = 2 + (r.nextInt() % 2);
      for (let i = 0; i < count; i++) {
        const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const position = asteroid.object.position.clone().addScaledVector(direction, asteroid.radius * 0.5);
        const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const velocity = direction.multiplyScalar(FRAGMENT_SPEED * r.range(0.6, 1.4));
        this.add(`${id}.${i}`, r.nextInt() % this.templates.length, asteroid.generation + 1, position, spinAxis, velocity);
      }
    }
    return asteroid;
  }

  /** Nearest asteroid hit by a ray, with the distance along the ray. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { asteroid: Asteroid; distance: number } | null {
    let best: { asteroid: Asteroid; distance: number } | null = null;
    for (const asteroid of this.asteroids.values()) {
      const distance = raySphere(origin, direction, asteroid.object.position, asteroid.radius);
      if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { asteroid, distance };
    }
    return best;
  }

  /** First asteroid overlapping a sphere. */
  overlap(center: THREE.Vector3, radius: number): Asteroid | null {
    for (const asteroid of this.asteroids.values()) {
      const reach = asteroid.radius + radius;
      if (asteroid.object.position.distanceToSquared(center) < reach * reach) return asteroid;
    }
    return null;
  }
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
