import * as THREE from 'three';
import type { TemplateSet } from './asteroids';
import { fractureSet } from './fracture';
import { iceImpostor, iceMaterial } from './ice';
import { ROCK_COUNT } from './rocks';

/**
 * Ice: the rock shapes, frozen (see world/ice). Each shape's meshes are the rock's own geometry
 * with an ice material (see iceMaterial); the collisions measure the rock's very shapes, and the
 * billboards show the rock's silhouette in the ice's colors. It lives apart from world/ice, whose
 * relief bake runs in a worker: the fracture it needs starts a worker of its own, and a worker
 * cannot be built that starts the one it is started from.
 */
export function iceSet(rocks: TemplateSet): TemplateSet {
  const freeze = (closeUp: boolean) => (object: THREE.Object3D, index: number) => new THREE.Mesh((object as THREE.Mesh).geometry, iceMaterial(index, closeUp));
  const impostor = rocks.impostor ? Array.from({ length: ROCK_COUNT }, (_, i) => iceImpostor(i)) : undefined;
  // a broken chunk splits as the rock of its shape does, its pieces in ice
  const pieceMaterials = new Map<string, THREE.Material>();
  const pieceMaterial = (index: number, closeUp: boolean) => {
    const key = `${index}:${closeUp}`;
    return pieceMaterials.get(key) ?? pieceMaterials.set(key, iceMaterial(index, closeUp, true)).get(key)!;
  };
  const fracture = rocks.fracture && fractureSet(rocks.fracture.details, pieceMaterial);
  return { near: rocks.near.map(freeze(true)), far: rocks.far.map(freeze(false)), impostor, collision: rocks.collision, fracture };
}
