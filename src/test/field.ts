import * as THREE from 'three';
import { AsteroidField, type TemplateSet } from '../world/asteroids';
import { createRocks, DISTANT_DETAIL } from '../world/rocks';

/**
 * A field for tests: the real rock shapes (in low detail, so it builds fast) for every kind,
 * and plain box pieces (hull sections 100 m long, as many as the hull has) for the box collision.
 */
export function testField(): AsteroidField {
  const rocks: TemplateSet = { near: createRocks(DISTANT_DETAIL), far: [] };
  const box = () => {
    const group = new THREE.Group();
    const collider = new THREE.Mesh(new THREE.BoxGeometry(2000, 400, 400));
    collider.userData.collider = true;
    group.add(collider);
    return group;
  };
  return new AsteroidField({ rock: rocks, ice: rocks, debris: rocks, hull: { near: Array.from({ length: 5 }, box), far: [], box: true } });
}
