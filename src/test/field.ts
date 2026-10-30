import * as THREE from 'three';
import { AsteroidField, type TemplateSet } from '../world/asteroids';
import { fractureSet } from '../world/fracture';
import { createRocks, DISTANT_DETAIL, FAR_DETAIL } from '../world/rocks';

/** The rock shapes of each detail, built once for all tests (a field only clones them). */
const built = new Map<number, THREE.Mesh[]>();
const shapes = (detail: number) => built.get(detail) ?? built.set(detail, createRocks(detail)).get(detail)!;
/** The pieces' material in tests: nothing draws them. */
const undrawn = new THREE.MeshBasicMaterial();
/** Plain hull boxes (half extents, units): 100 m long, 20 m square, as many as the hull has shapes. */
const PLAIN_HULLS = Array.from({ length: 8 }, () => new THREE.Vector3(1000, 200, 200));

/**
 * A field for tests: the real rock shapes (in low detail, so it builds fast, unless the test
 * asks for another) for every kind, rock and ice breaking into pieces of themselves cut at that
 * detail (see world/fracture), and box pieces for the box collision: plain hull sections 100 m
 * long, as many as the hull has, or with `hulls` boxes of these half extents (HULL_BOXES, the
 * world ship's own).
 */
export function testField(detail = DISTANT_DETAIL, hulls: readonly THREE.Vector3[] = PLAIN_HULLS): AsteroidField {
  const fracture = fractureSet({ collision: detail, near: detail, far: FAR_DETAIL }, () => undrawn);
  const rocks: TemplateSet = { near: shapes(detail), far: [], fracture };
  const box = (half: THREE.Vector3) => {
    const group = new THREE.Group();
    const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
    collider.userData.collider = true;
    group.add(collider);
    return group;
  };
  return new AsteroidField({ rock: rocks, ice: rocks, debris: { near: shapes(detail), far: [] }, hull: { near: hulls.map(box), far: [], box: true } });
}
