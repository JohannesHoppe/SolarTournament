import * as THREE from 'three';
import { raySphere, type AsteroidField } from './asteroids';
import { Randomizer } from '../random';

const PIECES_PER_SHIP = 5;
const MAX_WRECKS = 60;
/** Glowing edges of fresh wreckage cool down with this time constant (s). */
const GLOW_TIME = 4;
const SPREAD_SPEED = 400;

export interface Wreck {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinRate: number;
  radius: number;
  bornAt: number;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) % 2147483000 + 1;
}

/** A jagged chunk of hull plating: an icosahedron with displaced corners. */
function chunkGeometry(r: Randomizer): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.attributes.position;
  const corner = new THREE.Vector3();
  const offsets = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    corner.fromBufferAttribute(position, i);
    // vertices of the same corner share one displacement, so the chunk stays closed
    const key = corner.toArray().map((v) => v.toFixed(3)).join();
    if (!offsets.has(key)) offsets.set(key, r.range(0.45, 1.25));
    corner.multiplyScalar(offsets.get(key)!);
    // flattened: plating, not boulders
    position.setXYZ(i, corner.x, corner.y * 0.5, corner.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const gravity = new THREE.Vector3();
const spin = new THREE.Quaternion();
const HOT = new THREE.Color(1, 0.35, 0.08);

/**
 * Debris of destroyed ships. It keeps drifting with the wreck's momentum, falls towards the
 * asteroids, rips open hulls that run into it and blocks laser beams. The pieces are seeded
 * by the destroyed ship and its death count, so every client sees the same debris.
 */
export class Wrecks {
  readonly group = new THREE.Group();
  readonly list: Wreck[] = [];

  spawn(id: string, deaths: number, position: THREE.Vector3, velocity: THREE.Vector3, shipRadius: number, now: number) {
    const r = new Randomizer(hashSeed(`${id}#${deaths}`));
    for (let i = 0; i < PIECES_PER_SHIP; i++) {
      const radius = shipRadius * r.range(0.1, 0.3);
      const mesh = new THREE.Mesh(chunkGeometry(r), new THREE.MeshStandardMaterial({
        color: 0x3a3d42,
        metalness: 0.7,
        roughness: 0.45,
        emissive: HOT,
        flatShading: true,
      }));
      mesh.scale.setScalar(radius);
      const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      mesh.position.copy(position).addScaledVector(direction, shipRadius * 0.4);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.list.push({
        mesh,
        velocity: direction.multiplyScalar(SPREAD_SPEED * r.range(0.3, 1)).add(velocity),
        spinAxis: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
        spinRate: r.range(0.5, 3),
        radius,
        bornAt: now,
      });
    }
    while (this.list.length > MAX_WRECKS) this.remove(this.list[0]);
  }

  update(dt: number, now: number, field: AsteroidField) {
    for (const wreck of [...this.list]) {
      const { mesh } = wreck;
      wreck.velocity.addScaledVector(field.gravity(mesh.position, gravity), dt);
      mesh.position.addScaledVector(wreck.velocity, dt);
      mesh.quaternion.premultiply(spin.setFromAxisAngle(wreck.spinAxis, wreck.spinRate * dt));
      mesh.material.emissiveIntensity = 2 * Math.exp(-(now - wreck.bornAt) / GLOW_TIME);
      // debris that hits a rock grinds to dust
      if (field.overlap(mesh.position, wreck.radius)) this.remove(wreck);
    }
  }

  /** First wreck along a ray, with the distance along the ray. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { wreck: Wreck; distance: number } | null {
    let best: { wreck: Wreck; distance: number } | null = null;
    for (const wreck of this.list) {
      const distance = raySphere(origin, direction, wreck.mesh.position, wreck.radius);
      if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { wreck, distance };
    }
    return best;
  }

  /** First wreck touching a sphere. */
  overlap(center: THREE.Vector3, radius: number): Wreck | null {
    for (const wreck of this.list) {
      const reach = wreck.radius + radius;
      if (wreck.mesh.position.distanceToSquared(center) < reach * reach) return wreck;
    }
    return null;
  }

  remove(wreck: Wreck) {
    const index = this.list.indexOf(wreck);
    if (index < 0) return;
    this.list.splice(index, 1);
    this.group.remove(wreck.mesh);
    wreck.mesh.geometry.dispose();
    wreck.mesh.material.dispose();
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
  }
}
