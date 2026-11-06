import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { rotateX, rotateY, rotateZ, setFromAxisAngle } from '../detthree';
import { Randomizer } from '../random';
import { type HullBox, type Pose, rayHull, touchHull } from './boxes';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { paint } from './worldship';
import { boxUv } from '../view/surfaces';

/**
 * Patience, Captain Hedda Kroll's ore hauler (docs/campaign/STORY.md, section 7): 600 m of ore
 * bins on a spine, a ring habitat and the bridge at the bow, the workshop under the spine with
 * the clamp the Magpie docks in, the drive at the stern. Old and worked hard: every part in the
 * yards' patched plating (see world/boneyard, patchedPlating), the bins each in the paint of the
 * yard that last mended them, one of them gone. Built in code in its own frame (the bow towards
 * -x, up +y), drawn as one group, solid as boxes (see touchPatience).
 */

/** Its parts' sizes (units; 1 m is 20): the spine's half length and radius, the bins' radius, half length and spacing along the spine, how many stand on each side. */
const SPINE_HALF = 5600;
const SPINE_RADIUS = 120;
const BIN_RADIUS = 440;
const BIN_HALF = 600;
const BIN_STEP = 1500;
const BINS = 7;
const BIN_FIRST = -4200;
/** The bin left out on the port side (its yard had nothing to mend it with). */
const BIN_GONE = 4;
const BIN_Z = SPINE_RADIUS + BIN_RADIUS;
/** The ring habitat: where it stands on the spine, its radius and its tube's. */
const RING_X = -5200;
const RING_RADIUS = 1100;
const RING_TUBE = 160;
/** The bridge at the bow: its radius, half length and middle. */
const BRIDGE_RADIUS = 360;
const BRIDGE_HALF = 400;
const BRIDGE_X = -6000;
/** The workshop under the spine, and the clamp beneath it. */
const SHOP_RADIUS = 300;
const SHOP_HALF = 800;
const SHOP_X = -1500;
const SHOP_Y = -BIN_RADIUS - SHOP_RADIUS - 20;
/** Where the Magpie's clamp holds a hull, under the workshop (in Patience's frame). */
export const CLAMP = new THREE.Vector3(SHOP_X, SHOP_Y - SHOP_RADIUS - 420, 0);
/** The drive section at the stern and its three bells. */
const DRIVE_RADIUS = 600;
const DRIVE_HALF = 700;
const DRIVE_X = SPINE_HALF + DRIVE_HALF - 200;
const BELL_RADIUS = 260;
const BELL_LENGTH = 500;
/** Patience's own seed: the bins' paints, its windows, its name's weathering. */
const PATIENCE_SEED = 921;

/** The paints of the yards that mended its parts: a seed of their plating, a tint, their stencils. */
const PAINTS = [
  { key: 'patience-ochre', seed: PATIENCE_SEED + 1, tint: 0xb39462, texts: ['ORE', 'BIN', 'NO STEP', 'PATIENCE', 'VESTA DRYDOCK'] },
  { key: 'patience-rust', seed: PATIENCE_SEED + 2, tint: 0x9b6d50, texts: ['ORE', 'MAX 40 KT', 'PATIENCE', 'CERES YARD 4'] },
  { key: 'patience-blue', seed: PATIENCE_SEED + 3, tint: 0x8291a0, texts: ['ORE', 'BIN', 'HYGIEA', 'PATIENCE'] },
  { key: 'patience-grey', seed: PATIENCE_SEED + 4, tint: 0xb5b2aa, texts: ['PATIENCE', 'CREW 9', 'AIRLOCK', 'CLAMP', 'NO SMOKING'] },
] as const;

/** A collider: a box of its hull (see world/boxes), in Patience's frame. */
type Collider = HullBox;

const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Patience as built once: the group drawn, the boxes it collides as. */
let built: { root: THREE.Group; colliders: Collider[] } | null = null;

/** Patience's model and colliders, built at its first use. */
export function patience(): { root: THREE.Group; colliders: readonly Collider[] } {
  if (built) return built;
  const r = new Randomizer(PATIENCE_SEED);
  const root = new THREE.Group();
  const colliders: Collider[] = [];
  const box = (center: THREE.Vector3, half: THREE.Vector3, turn = new THREE.Quaternion()) => colliders.push({ center, half, turn });
  const plated = (geometry: THREE.BufferGeometry, paint: (typeof PAINTS)[number], shift: number) => {
    const mesh = new THREE.Mesh(macroUv(boxUv(geometry.toNonIndexed(), PLATING_TILE), shift), patchedPlating(paint.key, paint));
    root.add(mesh);
    return mesh;
  };
  /** A drum along x: a cylinder of `radius` and half length `half` around (x, y, z), its caps on. */
  const drum = (radius: number, half: number, x: number, y: number, z: number, look: (typeof PAINTS)[number], segments = 12) => {
    const geometry = rotateZ(new THREE.CylinderGeometry(radius, radius, half * 2, segments), Math.PI / 2).translate(x, y, z);
    plated(geometry, look, r.range(0, 1));
    box(new THREE.Vector3(x, y, z), new THREE.Vector3(half, radius, radius));
  };

  // the spine, the bins on both flanks, the gone one's empty saddle left
  drum(SPINE_RADIUS, SPINE_HALF, 0, 0, 0, PAINTS[3], 8);
  for (let i = 0; i < BINS; i++) {
    const x = BIN_FIRST + i * BIN_STEP;
    for (const side of [-1, 1]) {
      if (side < 0 && i === BIN_GONE) continue;
      drum(BIN_RADIUS, BIN_HALF, x, 0, side * BIN_Z, PAINTS[Math.floor(r.range(0, 3))], 14);
    }
  }
  // the ring habitat on four spokes, as boxes around it
  const ring = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 10, 32);
  rotateY(ring, Math.PI / 2);
  plated(ring.translate(RING_X, 0, 0), PAINTS[3], 0.4);
  const segments = 16;
  for (let k = 0; k < segments; k++) {
    const angle = (k / segments) * Math.PI * 2;
    const turn = setFromAxisAngle(new THREE.Quaternion(), X_AXIS, angle);
    box(new THREE.Vector3(RING_X, RING_RADIUS * cos(angle), RING_RADIUS * sin(angle)), new THREE.Vector3(RING_TUBE, RING_TUBE, (Math.PI * RING_RADIUS) / segments + RING_TUBE / 2), turn);
  }
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = rotateX(new THREE.CylinderGeometry(40, 40, RING_RADIUS, 6), angle).translate(RING_X, (RING_RADIUS / 2) * cos(angle), (RING_RADIUS / 2) * sin(angle));
    plated(spoke, PAINTS[3], 0.7);
  }
  // the bridge at the bow with its dome, the workshop under the spine, the drive at the stern
  drum(BRIDGE_RADIUS, BRIDGE_HALF, BRIDGE_X, 0, 0, PAINTS[3]);
  const dome = new THREE.SphereGeometry(BRIDGE_RADIUS, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  plated(rotateZ(dome, Math.PI / 2).translate(BRIDGE_X - BRIDGE_HALF, 0, 0), PAINTS[3], 0.2);
  box(new THREE.Vector3(BRIDGE_X - BRIDGE_HALF - BRIDGE_RADIUS / 2, 0, 0), new THREE.Vector3(BRIDGE_RADIUS / 2, BRIDGE_RADIUS, BRIDGE_RADIUS));
  drum(SHOP_RADIUS, SHOP_HALF, SHOP_X, SHOP_Y, 0, PAINTS[1]);
  drum(DRIVE_RADIUS, DRIVE_HALF, DRIVE_X, 0, 0, PAINTS[1], 16);
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2;
    const bell = rotateZ(new THREE.CylinderGeometry(BELL_RADIUS * 0.45, BELL_RADIUS, BELL_LENGTH, 14, 1, true), Math.PI / 2);
    plated(bell.translate(DRIVE_X + DRIVE_HALF + BELL_LENGTH / 2, 300 * cos(angle), 300 * sin(angle)), PAINTS[1], 0.9);
    box(new THREE.Vector3(DRIVE_X + DRIVE_HALF + BELL_LENGTH / 2, 300 * cos(angle), 300 * sin(angle)), new THREE.Vector3(BELL_LENGTH / 2, BELL_RADIUS, BELL_RADIUS));
  }
  // the clamp: two arms down from the workshop and the cradle between them
  for (const side of [-1, 1]) {
    const arm = new THREE.BoxGeometry(80, 420, 80).translate(CLAMP.x + side * 500, SHOP_Y - SHOP_RADIUS - 210, 0);
    plated(arm, PAINTS[0], 0.5);
    box(new THREE.Vector3(CLAMP.x + side * 500, SHOP_Y - SHOP_RADIUS - 210, 0), new THREE.Vector3(40, 210, 40));
  }
  // its name and registry on the foremost bins' flanks (see view/lettering)
  root.add(paint({ name: 'PATIENCE', registry: 'MV 0921' }, PATIENCE_SEED, BIN_FIRST, 0, BIN_Z + BIN_RADIUS + 2, BIN_HALF * 2));
  // lit windows along the bridge and the ring, and red beacons at bow and stern
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(1.3), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false });
  for (let k = 0; k < 10; k++) {
    if (r.nextFloat() < 0.3) continue;
    const angle = (k / 10) * Math.PI - Math.PI / 2;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 30), windows);
    pane.position.set(BRIDGE_X - BRIDGE_HALF * 0.4, (BRIDGE_RADIUS + 2) * sin(angle), (BRIDGE_RADIUS + 2) * cos(angle));
    root.add(pane);
  }
  for (let k = 0; k < 24; k++) {
    if (r.nextFloat() < 0.4) continue;
    const angle = (k / 24) * Math.PI * 2;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(24, 30, 50), windows);
    pane.position.set(RING_X - RING_TUBE - 2, RING_RADIUS * cos(angle), RING_RADIUS * sin(angle));
    root.add(pane);
  }
  for (const x of [BRIDGE_X - BRIDGE_HALF - BRIDGE_RADIUS, DRIVE_X]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(24, 8, 6), beacon);
    lamp.position.set(x, x > 0 ? DRIVE_RADIUS + 20 : 0, 0);
    root.add(lamp);
  }
  built = { root, colliders };
  return built;
}

/**
 * Whether a sphere of `radius` at `position` touches Patience, posed by `pose` (its world
 * matrix's position and turn): moves the sphere out of the box it touches and sets the outward
 * `normal` (both in the world), as the rings' housings do (see touchRing).
 */
export function touchPatience(pose: Pose, position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
  return touchHull(patience().colliders, pose, position, radius, normal);
}

/** How far along a beam Patience, posed by `pose`, stops it, nearer than `max`; null when it does not. */
export function rayPatience(pose: Pose, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
  return rayHull(patience().colliders, pose, origin, direction, max);
}
