import * as THREE from 'three';
import { AsteroidField, type TemplateSet } from '../world/asteroids';
import { fractureSet } from '../world/fracture';
import { createRocks, DISTANT_DETAIL, FAR_DETAIL } from '../world/rocks';

/** The rock shapes of each detail, built once for all tests (a field only clones them). */
const built = new Map<number, THREE.Mesh[]>();
const shapes = (detail: number) => built.get(detail) ?? built.set(detail, createRocks(detail)).get(detail)!;
/** The pieces' material in tests: nothing draws them. */
const undrawn = new THREE.MeshBasicMaterial();

/**
 * A field for tests: the real rock shapes (in low detail, so it builds fast, unless the test
 * asks for another) for every kind, rock and ice breaking into pieces of themselves cut at that
 * detail (see world/fracture), and plain box pieces (hull sections 100 m long, as many as the
 * hull has) for the box collision.
 */
export function testField(detail = DISTANT_DETAIL): AsteroidField {
  const fracture = fractureSet({ collision: detail, near: detail, far: FAR_DETAIL }, () => undrawn);
  const rocks: TemplateSet = { near: shapes(detail), far: [], fracture };
  const box = () => {
    const group = new THREE.Group();
    const collider = new THREE.Mesh(new THREE.BoxGeometry(2000, 400, 400));
    collider.userData.collider = true;
    group.add(collider);
    return group;
  };
  return new AsteroidField({ rock: rocks, ice: rocks, debris: { near: shapes(detail), far: [] }, hull: { near: Array.from({ length: 8 }, box), far: [], box: true } });
}
