import * as THREE from 'three';
import { AsteroidField, FIELD_RADIUS, type Placement, type TemplateSet } from '../world/asteroids';
import { fractureSet } from '../world/fracture';
import { RACK_BOXES, RACK_RELIEFS } from '../world/yard';
import { createRocks, DETAIL, DISTANT_DETAIL, FAR_DETAIL } from '../world/rocks';
import { claimsOf, planMining, standClaims, type Claim, type Plan } from '../world/mining';
import { fieldSolid, obstacleSolid, type Probes, type Solid } from '../game/items';

/** The rock shapes of each detail, built once for all tests (a field only clones them). */
const built = new Map<number, THREE.Mesh[]>();
const shapes = (detail: number) => built.get(detail) ?? built.set(detail, createRocks(detail)).get(detail)!;
/** The pieces' material in tests: nothing draws them. */
const undrawn = new THREE.MeshBasicMaterial();
/** Plain hull boxes (half extents, units): 100 m long, 20 m square, as many as the hull has shapes. */
const PLAIN_HULLS = Array.from({ length: 8 }, () => new THREE.Vector3(1000, 200, 200));

/** A box piece of these half extents: its collider alone. */
function box(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  collider.userData.collider = true;
  group.add(collider);
  return group;
}
/**
 * The templates of every yard's box (see RACK_BOXES), built once for all tests as the module
 * loads (a field only clones them): three.js names every object it makes with Math.random, which
 * the campaign's jobs seed for the hands of their pilots (see test/jobsuite), so how many
 * templates there are never changes how a job is flown.
 */
const RACKS = RACK_BOXES.map(box);

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
  const field = new AsteroidField({ rock: rocks, ice: rocks, debris: { near: shapes(detail), far: [] }, hull: { near: hulls.map(box), far: [], box: true }, rack: { near: RACKS, far: [], box: true, reliefs: RACK_RELIEFS } });
  // the Belt's and Rheasilvia's rigs and buoys stand solid on their rocks, as the game dresses them (see world/mining)
  const generate = field.generate.bind(field);
  field.generate = (layout) => {
    generate(layout);
    if (!MINED.includes(layout.key)) return;
    const key = `${layout.key}:${detail}`;
    standClaims(field, claims.get(key) ?? claims.set(key, planMining(field)).get(key)!);
  };
  return field;
}

/** The layouts the game dresses with the Rockborn's mining (see Game.enterArena). */
const MINED = ['belt', 'rheasilvia'];

/** The claims of a field `testField` dressed, as the game's Mining reads them (see world/mining, claimsOf); none for another layout. */
export function claimsIn(field: AsteroidField, detail: number): Claim[] {
  const plan = field.layout ? claims.get(`${field.layout.key}:${detail}`) : undefined;
  return plan ? claimsOf(plan, field) : [];
}

/** A ship's radius in the ground tests (units, 17 m). */
const GROUND_SHIP = 340;

/**
 * A field of nothing but a moon's ground (its `placement`, see reliefPiece), and the points (x, z)
 * of `points` where it does not collide as `surface` gives it: a ship just under the ground
 * should touch it, one just over it fly free. Also the field, for more of a test's own.
 */
export function groundField(key: string, placement: Placement, surface: (x: number, z: number) => number, points: readonly (readonly [number, number])[]): { field: AsteroidField; misses: string[] } {
  const field = testField(DETAIL);
  field.generate({ key, seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: FIELD_RADIUS, inner: 0, spin: 0, toughness: 800, placements: [placement] });
  const misses: string[] = [];
  for (const [x, z] of points) {
    const ground = surface(x, z);
    if (!field.overlap(new THREE.Vector3(x, ground + GROUND_SHIP - 60, z), GROUND_SHIP)) misses.push(`${x}, ${z}: not touched just under the ground`);
    if (field.overlap(new THREE.Vector3(x, ground + GROUND_SHIP + 200, z), GROUND_SHIP)) misses.push(`${x}, ${z}: touched just over the ground`);
  }
  return { field, misses };
}

/** The points of a moon's ground, sampled every `step` over its box's square, where its relief leaves the box (above its top or below its bottom). */
export function reliefOutside(relief: (x: number, z: number) => number, half: THREE.Vector3, step: number): string[] {
  const outside: string[] = [];
  for (let x = -half.x; x <= half.x; x += step) {
    for (let z = -half.z; z <= half.z; z += step) {
      const top = relief(x, z);
      if (top > half.y || top < -half.y) outside.push(`${x}, ${z}: ${top}`);
    }
  }
  return outside;
}

/** The mining plans by layout and the rocks' detail, made once for all tests (they follow from the layout and the shapes). */
const claims = new Map<string, Plan>();

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
