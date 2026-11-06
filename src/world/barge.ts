import * as THREE from 'three';
import { sin } from '../detmath';
import { rotateX, rotateZ } from '../detthree';
import { Randomizer } from '../random';
import { type HullBox, type Pose, rayHull, touchHull } from './boxes';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { boxUv } from '../view/surfaces';

/**
 * The working hulls of the Belt the campaign meets, built alike: a flat spine, a small cab at the
 * bow, a drive pod with two bells at the stern, in the yards' patched plating, lamps along it, a
 * beacon at each end; built along x, the bow at -x, solid as the boxes they are built of. A
 * Rockborn ore barge (the escorts, chapter 3 on): its spine 240 m long carrying open hoppers
 * heaped with ore. The Tallymen's tug (Repo Men): a short spine, a winch drum on its stern
 * that reels in the cable of its harpoon, and the firm's paint.
 */

/** A kind of working hull: its spine's half length (units), how many hoppers it carries, a winch or not, its seed and its yards' paints. */
interface HullKind {
  spine: number;
  hoppers: number;
  winch: boolean;
  seed: number;
  paints: readonly { key: string; seed: number; tint: number; texts: readonly string[] }[];
}

/** The spine's half section. */
const SPINE_SECTION = new THREE.Vector3(1, 80, 220);
/** The hoppers: each HOPPER_HALF in its half extents, HOPPER_STEP apart, the ore heaped HEAP over their rim. */
const HOPPER_HALF = new THREE.Vector3(420, 200, 320);
const HOPPER_STEP = 1000;
const HEAP = 140;
/** The cab at the bow and the drive pod at the stern (half extents, units). */
const CAB_HALF = new THREE.Vector3(260, 220, 240);
const POD_HALF = new THREE.Vector3(360, 260, 300);
const BELL_RADIUS = 160;
const BELL_LENGTH = 320;
/** The ore barge: a spine of 120 m half length (units), four hoppers, in a Rockborn yard's paints. */
const BARGE: HullKind = {
  spine: 2400,
  hoppers: 4,
  winch: false,
  seed: 3301,
  paints: [
    { key: 'barge-ochre', seed: 3302, tint: 0xb08a5c, texts: ['ORE', 'OCCATOR 7', 'NO STEP', 'MAX 6 KT'] },
    { key: 'barge-green', seed: 3303, tint: 0x8c9a80, texts: ['ROCKBORN', 'BARGE 7', 'CERES', 'AIRLOCK'] },
  ],
};
/** The Tallymen's tug: a spine of 45 m half length, its winch, in the firm's dark paint and its stencils. */
const TUG: HullKind = {
  spine: 900,
  hoppers: 0,
  winch: true,
  seed: 3401,
  paints: [
    { key: 'tug-black', seed: 3402, tint: 0x55524e, texts: ['TALLYMEN', 'REPOSSESSION', 'KEEP CLEAR', 'LICENSED'] },
    { key: 'tug-violet', seed: 3403, tint: 0x6e6280, texts: ['TALLYMEN & CO', 'ALL DEBTS COLLECTED', 'WINCH'] },
  ],
};

/** The barge's length (units): the escorts keep it in mind. */
export const BARGE_LENGTH = 2 * (BARGE.spine + CAB_HALF.x + POD_HALF.x + BELL_LENGTH);
/** The tug's winch: its drum's middle on the stern (in the tug's frame) and how far round it a beam strikes it (units, 25 m). */
export const WINCH = new THREE.Vector3(TUG.spine + POD_HALF.x, POD_HALF.y + 180, 0);
export const WINCH_REACH = 500;

const built = new Map<HullKind, { root: THREE.Group; boxes: HullBox[] }>();

/** The ore barge's model and its boxes, built at its first use (a drill takes the model and poses it). */
export const barge = () => working(BARGE);
/** The Tallymen's tug, built as barge is. */
export const tug = () => working(TUG);

function working(kind: HullKind): { root: THREE.Group; boxes: readonly HullBox[] } {
  const kept = built.get(kind);
  if (kept) return kept;
  const SPINE_HALF = kind.spine;
  const PAINTS = kind.paints;
  const r = new Randomizer(kind.seed);
  const root = new THREE.Group();
  const boxes: HullBox[] = [];
  const box = (center: THREE.Vector3, half: THREE.Vector3) => {
    boxes.push({ center, half, turn: new THREE.Quaternion() });
    const geometry = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2).translate(center.x, center.y, center.z).toNonIndexed();
    const paint = PAINTS[boxes.length % PAINTS.length];
    root.add(new THREE.Mesh(macroUv(boxUv(geometry, PLATING_TILE), r.range(0, 1)), patchedPlating(paint.key, paint)));
  };
  box(new THREE.Vector3(0, 0, 0), new THREE.Vector3(SPINE_HALF, SPINE_SECTION.y, SPINE_SECTION.z));
  // the hoppers on the spine, open on top, the ore heaped in them
  const ore = new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 1, metalness: 0.15, flatShading: true });
  for (let k = 0; k < kind.hoppers; k++) {
    const x = -SPINE_HALF + 700 + k * HOPPER_STEP;
    box(new THREE.Vector3(x, SPINE_SECTION.y + HOPPER_HALF.y, 0), HOPPER_HALF);
    const heap = new THREE.IcosahedronGeometry(1, 1);
    const position = heap.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const lumpy = 0.75 + 0.5 * r.nextFloat();
      position.setXYZ(i, position.getX(i) * HOPPER_HALF.x * 0.95 * lumpy, Math.max(0, position.getY(i)) * HEAP * lumpy, position.getZ(i) * HOPPER_HALF.z * 0.95 * lumpy);
    }
    heap.computeVertexNormals();
    const pile = new THREE.Mesh(heap.translate(x, SPINE_SECTION.y + HOPPER_HALF.y * 2, 0), ore);
    root.add(pile);
  }
  // the cab at the bow, the drive pod at the stern and its two bells
  box(new THREE.Vector3(-SPINE_HALF - CAB_HALF.x, CAB_HALF.y - SPINE_SECTION.y, 0), CAB_HALF);
  box(new THREE.Vector3(SPINE_HALF + POD_HALF.x, 0, 0), POD_HALF);
  for (const side of [-1, 1]) {
    const bell = rotateZ(new THREE.CylinderGeometry(BELL_RADIUS * 0.5, BELL_RADIUS, BELL_LENGTH, 12, 1, true), Math.PI / 2);
    const at = new THREE.Vector3(SPINE_HALF + POD_HALF.x * 2 + BELL_LENGTH / 2, 0, side * 160);
    const paint = PAINTS[1];
    root.add(new THREE.Mesh(macroUv(boxUv(bell.translate(at.x, at.y, at.z).toNonIndexed(), PLATING_TILE), 0.3), patchedPlating(paint.key, paint)));
    boxes.push({ center: at, half: new THREE.Vector3(BELL_LENGTH / 2, BELL_RADIUS, BELL_RADIUS), turn: new THREE.Quaternion() });
  }
  // the cab's windows, lamps along the spine, a red beacon at each end
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.55).multiplyScalar(1.3), toneMapped: false });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.15).multiplyScalar(3), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false });
  for (let k = 0; k < 6; k++) {
    const angle = (k / 5 - 0.5) * 1.6;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(20, 50, 70), windows);
    pane.position.set(-SPINE_HALF - CAB_HALF.x * 2 - 4, CAB_HALF.y * 1.3 - SPINE_SECTION.y, sin(angle) * CAB_HALF.z * 0.8);
    root.add(pane);
  }
  for (let x = -SPINE_HALF + 200; x < SPINE_HALF; x += 600) {
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 20), lamp);
      light.position.set(x, 0, side * (SPINE_SECTION.z + 12));
      root.add(light);
    }
  }
  for (const x of [-SPINE_HALF - CAB_HALF.x, SPINE_HALF + POD_HALF.x]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(30, 8, 6), beacon);
    light.position.set(x, (x < 0 ? CAB_HALF.y * 2 - SPINE_SECTION.y : POD_HALF.y) + 30, 0);
    root.add(light);
  }
  // an antenna mast over the cab
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 300, 6).translate(0, 150, 0), patchedPlating(PAINTS[1].key, PAINTS[1]));
  mast.position.set(-SPINE_HALF - CAB_HALF.x, CAB_HALF.y * 2 - SPINE_SECTION.y, 0);
  root.add(mast);
  if (kind.winch) {
    // the winch on the stern: a drum across the hull in its frame, wound with cable, hazard lamps on its cheeks
    const drum = rotateX(new THREE.CylinderGeometry(160, 160, 500, 16), Math.PI / 2).translate(WINCH.x, WINCH.y, WINCH.z);
    root.add(new THREE.Mesh(macroUv(boxUv(drum.toNonIndexed(), PLATING_TILE), 0.6), patchedPlating(PAINTS[0].key, PAINTS[0])));
    const wound = rotateX(new THREE.CylinderGeometry(170, 170, 380, 16, 1, true), Math.PI / 2).translate(WINCH.x, WINCH.y, WINCH.z);
    root.add(new THREE.Mesh(wound, new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6, metalness: 0.7 })));
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(260, 360, 30).translate(WINCH.x, WINCH.y - 60, side * 270), patchedPlating(PAINTS[0].key, PAINTS[0]));
      root.add(cheek);
      const warn = new THREE.Mesh(new THREE.SphereGeometry(26, 8, 6), lamp);
      warn.position.set(WINCH.x, WINCH.y + 200, side * 270);
      root.add(warn);
    }
    boxes.push({ center: WINCH.clone(), half: new THREE.Vector3(160, 160, 250), turn: new THREE.Quaternion() });
  }
  const made = { root, boxes };
  built.set(kind, made);
  return made;
}

/** Whether a sphere touches the tug posed by `pose` (see touchBarge). */
export function touchTug(pose: Pose, position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
  return touchHull(tug().boxes, pose, position, radius, normal);
}

/** How far along a beam the tug posed by `pose` stops it (see rayBarge). */
export function rayTug(pose: Pose, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
  return rayHull(tug().boxes, pose, origin, direction, max);
}

/** Whether a sphere touches the barge posed by `pose`: moves it out and sets the outward `normal` (see world/boxes). */
export function touchBarge(pose: Pose, position: THREE.Vector3, radius: number, normal: THREE.Vector3): boolean {
  return touchHull(barge().boxes, pose, position, radius, normal);
}

/** How far along a beam the barge posed by `pose` stops it, nearer than `max`; null when it does not. */
export function rayBarge(pose: Pose, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
  return rayHull(barge().boxes, pose, origin, direction, max);
}
