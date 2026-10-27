import * as THREE from 'three';
import { raySphere, type AsteroidField } from './asteroids';
import { Randomizer, textSeed } from '../random';
import { BELT_INNER } from './belt';
import { boxUv, surfaced, wornSurface, type Wear } from '../view/surfaces';

/** A wreck's plating: the old paint of a fighter torn off, blackened, scored and rusting (see wornSurface). */
const TORN: Wear = { rust: 0.7, chips: 0.9, grime: 1, scratches: 0.8, seams: 0.7, stencils: ['07', 'NO STEP'], roughness: 0.7, metalness: 0.3 };
/** A piece's plating repeats about once across it (its geometry is of unit size, see chunkGeometry). */
const WRECK_TILE = 0.9;

/** Pieces a destroyed ship breaks into. */
const PIECES_PER_SHIP = 5;
/** Pieces in the arena at most (twelve ships' worth); the oldest go first. */
const MAX_WRECKS = 60;
/** Glowing edges of fresh wreckage cool down with this time constant (s). */
const GLOW_TIME = 4;
/** Speed the pieces fly apart with (units/s, 20 m/s), on top of the ship's own. */
const SPREAD_SPEED = 400;
/** A piece flies in fixed steps of its own age (s), so its path is the same at any frame rate. */
const WRECK_STEP = 1 / 30;

export interface Wreck {
  /** "<ship id>.<death count>.<piece>": the same piece on every browser. */
  id: string;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinRate: number;
  radius: number;
  bornAt: number;
  /** Where its flight stands after `steps` fixed steps of WRECK_STEP since it was born (the mesh shows it on to the frame's moment). */
  at: THREE.Vector3;
  steps: number;
}

/** A piece of wreckage as it travels to a browser that joins: where it is, how it drifts, how long it has glowed (s). */
export type WreckState = { id: string; p: number[]; v: number[]; g: number };

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
  return boxUv(geometry, WRECK_TILE);
}

const gravity = new THREE.Vector3();
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();
const spin = new THREE.Quaternion();
const HOT = new THREE.Color(1, 0.35, 0.08);

/**
 * Debris of destroyed ships. It keeps drifting with the wreck's momentum, falls towards the
 * asteroids, rips open hulls that run into it and blocks laser beams. The pieces are seeded
 * by the destroyed ship and its death count, so every client breaks a ship into the same
 * pieces, and they fly in fixed steps of their age (WRECK_STEP), so their paths do not depend
 * on the frame rate. Online, the owner of the destroyed ship tells where it broke up, a piece
 * shot or rammed goes on every screen (see Game.remoteWreck), and a browser that joins takes
 * the pieces in flight. The paths still differ a little between browsers (where each saw the
 * ship break up, its own game clock, the rocks' gravity at its own field time), and each
 * browser takes a piece away on its own where it grinds into rock, falls into a massive body or
 * drifts into the belt, without telling the others: the debris is about the same everywhere,
 * not exactly.
 */
export class Wrecks {
  readonly group = new THREE.Group();
  readonly list: Wreck[] = [];

  spawn(id: string, deaths: number, position: THREE.Vector3, velocity: THREE.Vector3, shipRadius: number, now: number) {
    const r = new Randomizer(textSeed(`${id}#${deaths}`));
    // the pieces of one ship cool down together: they share one material
    const material = new THREE.MeshStandardMaterial({
      ...surfaced(wornSurface(13, TORN), 1),
      color: 0x6a6e66,
      emissive: HOT,
      flatShading: true,
    });
    material.userData.pieces = PIECES_PER_SHIP;
    for (let i = 0; i < PIECES_PER_SHIP; i++) {
      const radius = shipRadius * r.range(0.1, 0.3);
      const mesh = new THREE.Mesh(chunkGeometry(r), material);
      mesh.scale.setScalar(radius);
      const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      mesh.position.copy(position).addScaledVector(direction, shipRadius * 0.4);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.list.push({
        id: `${id}.${deaths}.${i}`,
        mesh,
        velocity: direction.multiplyScalar(SPREAD_SPEED * r.range(0.3, 1)).add(velocity),
        spinAxis: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
        spinRate: r.range(0.5, 3),
        radius,
        bornAt: now,
        at: mesh.position.clone(),
        steps: 0,
      });
    }
    while (this.list.length > MAX_WRECKS) this.remove(this.list[0]);
  }

  update(dt: number, now: number, field: AsteroidField) {
    // backwards, so removing a piece does not skip the next
    for (let i = this.list.length - 1; i >= 0; i--) {
      const wreck = this.list[i];
      const { mesh, at } = wreck;
      const age = now - wreck.bornAt;
      while ((wreck.steps + 1) * WRECK_STEP <= age) {
        wreck.velocity.addScaledVector(field.gravity(at, gravity), WRECK_STEP);
        at.addScaledVector(wreck.velocity, WRECK_STEP);
        wreck.steps++;
      }
      mesh.position.copy(at).addScaledVector(wreck.velocity, age - wreck.steps * WRECK_STEP);
      mesh.quaternion.premultiply(spin.setFromAxisAngle(wreck.spinAxis, wreck.spinRate * dt));
      mesh.material.emissiveIntensity = 2 * Math.exp(-(now - wreck.bornAt) / GLOW_TIME);
      // debris that hits a rock grinds to dust, debris that falls into the arena's massive body
      // is gone, and so is debris that drifts off into the belt
      if (field.overlap(mesh.position, wreck.radius) || field.insideWell(mesh.position, wreck.radius) || mesh.position.lengthSq() > BELT_INNER * BELT_INNER) this.remove(wreck);
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

  find(id: string): Wreck | null {
    return this.list.find((wreck) => wreck.id === id) ?? null;
  }

  /** The pieces in flight, for a browser that joins a running tournament. */
  snapshot(now: number): WreckState[] {
    return this.list.map((wreck) => ({
      id: wreck.id,
      p: wreck.mesh.position.toArray().map(Math.round),
      v: wreck.velocity.toArray().map(Math.round),
      g: +(now - wreck.bornAt).toFixed(2),
    }));
  }

  /** Takes the pieces of a snapshot: each ship's pieces come from their seed again, then move to where the snapshot has them. */
  restore(states: readonly WreckState[], shipRadius: number, now: number) {
    this.clear();
    const wanted = new Map(states.map((state) => [state.id, state]));
    const ships = new Set<string>();
    for (const state of states) {
      const match = /^((.+)\.(\d+))\.\d+$/.exec(state.id);
      if (!match || ships.has(match[1])) continue;
      ships.add(match[1]);
      this.spawn(match[2], Number(match[3]), position.fromArray(state.p), velocity.fromArray(state.v), shipRadius, now);
      // the pieces gone in the snapshot go at once, so the cap on pieces never takes wanted ones
      for (const wreck of [...this.list]) if (!wanted.has(wreck.id)) this.remove(wreck);
    }
    for (const wreck of this.list) {
      const state = wanted.get(wreck.id)!;
      wreck.mesh.position.fromArray(state.p);
      wreck.at.fromArray(state.p);
      wreck.velocity.fromArray(state.v);
      // its steps go on from the age it has in the snapshot
      wreck.bornAt = now - state.g;
      wreck.steps = Math.floor(state.g / WRECK_STEP);
      wreck.at.addScaledVector(wreck.velocity, wreck.steps * WRECK_STEP - state.g);
    }
  }

  remove(wreck: Wreck) {
    const index = this.list.indexOf(wreck);
    if (index < 0) return;
    this.list.splice(index, 1);
    this.group.remove(wreck.mesh);
    wreck.mesh.geometry.dispose();
    const material = wreck.mesh.material;
    if (--material.userData.pieces <= 0) material.dispose();
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
  }
}
