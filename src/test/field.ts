import * as THREE from 'three';
import { AsteroidField, type TemplateSet } from '../world/asteroids';
import { fractureSet } from '../world/fracture';
import { createRocks, DISTANT_DETAIL, FAR_DETAIL } from '../world/rocks';
import { planMining, standClaims, type Plan } from '../world/mining';
import { fieldSolid, obstacleSolid, type Probes, type Solid } from '../game/items';

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
  const field = new AsteroidField({ rock: rocks, ice: rocks, debris: { near: shapes(detail), far: [] }, hull: { near: hulls.map(box), far: [], box: true } });
  // the Belt's rigs and buoys stand solid on their rocks, as the game dresses them (see world/mining)
  const generate = field.generate.bind(field);
  field.generate = (layout) => {
    generate(layout);
    if (layout.key !== 'belt') return;
    const plan = claims.get(detail) ?? claims.set(detail, planMining(field)).get(detail)!;
    standClaims(field, plan);
  };
  return field;
}

/** The Belt's mining plan by the rocks' detail, made once for all tests (it follows from the layout and the shapes). */
const claims = new Map<number, Plan>();

const probeSolids = new WeakMap<AsteroidField, { solids: Solid[]; shared: Solid[] }>();

/** Moves the probes a step in a field, they and their slots bouncing off its pieces and its battleship (see game/items, Probes.update). */
export function driftProbes(probes: Probes, dt: number, now: number, field: AsteroidField) {
  let pair = probeSolids.get(field);
  if (!pair) {
    const shared = [fieldSolid(field), obstacleSolid(field)];
    probeSolids.set(field, (pair = { solids: shared, shared }));
  }
  probes.update(dt, now, field, pair.solids, pair.shared);
}
