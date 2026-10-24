import * as THREE from 'three';
import { Randomizer } from '../random';
import { MAX_SPEED } from '../ship/flight';
import { ARENA_GRACE, ARENA_LIMIT } from './arena';

/** Seed of the belt's layout, so every Host sees the same sky. */
const BELT_SEED = 2584;
/** Rocks of the belt, spread evenly over the rock shapes. */
const BELT_ROCKS = 480;
/**
 * The belt starts beyond the reach of any ship: one that leaves the arena at top speed is lost
 * before it gets there, and one faster than that (after an overdrive) is lost the moment it
 * reaches it (see Game.keepInArena), so the belt needs no collisions (units, 9.4 km).
 */
export const BELT_INNER = ARENA_LIMIT + ARENA_GRACE * MAX_SPEED + 20000;
/** The belt ends well before the camera's far plane (units, 17.5 km). */
const BELT_OUTER = 350000;
/** The spread of the belt around the arena's horizon plane (units, 3 km): heights are the sum of three draws, so most rocks lie within 1.5 km of the plane, none beyond 4.5 km. */
const BELT_THICKNESS = 60000;
/** Rocks of the belt are scaled like the field's, up to a little bigger (template radius 40 to 55 m). */
const MIN_SCALE = 2;
const MAX_SCALE = 9;
/**
 * Rocks closer than this (units) draw as real, low-poly geometry; the rest of the ring (most of
 * it: this is a small share of the belt's area) draws as a billboard (see view/impostor), far
 * cheaper and, at that distance, no different to look at. Set beyond where a ship coasting past
 * the arena's limit, still alive in its grace period, could end up (see BELT_INNER).
 */
const BELT_NEAR = BELT_INNER * 1.4;

/**
 * The asteroid belt beyond the arena. The field is one dense patch of a belt that goes on
 * all around, flat in the arena's horizon plane. Its rocks are scenery: they lie where no
 * ship can reach them, so they neither collide, pull nor break, and they cast no shadows.
 * One instanced mesh per rock shape and distance tier (near or billboard, see BELT_NEAR) keeps
 * the whole belt to a handful of draw calls.
 */
export class Belt {
  readonly group = new THREE.Group();

  constructor(near: THREE.Mesh[], impostor: THREE.Mesh[]) {
    const r = new Randomizer(BELT_SEED);
    const perShape = Math.ceil(BELT_ROCKS / near.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    const size = new THREE.Vector3();
    for (let shape = 0; shape < near.length; shape++) {
      const nearMatrices: THREE.Matrix4[] = [];
      const farMatrices: THREE.Matrix4[] = [];
      for (let i = 0; i < perShape; i++) {
        const angle = r.range(0, Math.PI * 2);
        // evenly over the ring's area, thickest in the middle of the plane
        const radius = Math.sqrt(r.range(BELT_INNER * BELT_INNER, BELT_OUTER * BELT_OUTER));
        const height = (r.nextFloat() + r.nextFloat() + r.nextFloat() - 1.5) * BELT_THICKNESS;
        position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        rotation.setFromAxisAngle(axis.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), r.range(0, Math.PI * 2));
        size.setScalar(r.range(MIN_SCALE, MAX_SCALE));
        (radius < BELT_NEAR ? nearMatrices : farMatrices).push(matrix.compose(position, rotation, size).clone());
      }
      if (nearMatrices.length) this.group.add(instancedOf(near[shape], nearMatrices));
      if (farMatrices.length) this.group.add(instancedOf(impostor[shape], farMatrices));
    }
  }

  /** Draws `share` of the belt's rocks (see view/quality): a thinner belt, the same rocks where it is drawn. */
  setShare(share: number) {
    for (const mesh of this.group.children as THREE.InstancedMesh[]) mesh.count = Math.round(mesh.instanceMatrix.count * share);
  }
}

/** An instanced copy of a template at every one of `matrices`. */
function instancedOf(template: THREE.Mesh, matrices: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(template.geometry, template.material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.computeBoundingSphere();
  return mesh;
}
