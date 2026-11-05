import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from '../detmath';
import { rotateY, rotateZ, setRotation } from '../detthree';
import { Randomizer } from '../random';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { CAB_RADIUS, DEPOT_LAYOUT } from './yard';
import { boxUv, industrialSurface, signTexture, surfaced } from '../view/surfaces';

/**
 * Rask's office (docs/campaign/STORY.md, section 3): the inside of the round, glazed cab on top of
 * the depot's tower, where the clone climbs out for the scenes that count (see campaign/scenes).
 * The cab's floor and dome are its plating seen from inside; the glass all around looks out on
 * the yard as it is. Inside: the desk, his chair and two for visitors, a row of filing cabinets
 * and a safe along the wall, the crane's console under the window over the yard, a lamp hanging
 * from the dome, the ashtray with a cigar still burning, and his neon sign. Everything worn, some
 * of it patched; only the lamp, the console's screens, the ember and the neon are light. Built in
 * the cab's frame (its middle, the floor at FLOOR), y up, the yard towards -x.
 */

/** The cab's middle in the world, and how far below it its floor lies (units: the floor's top, see world/boneyard, 'cab'). */
export const CAB = DEPOT_LAYOUT.cab.center;
export const FLOOR = -80;
/** Where the clone stands, a few steps before the desk (units), and its eyes' height over the floor (units, 1.7 m). */
export const DOOR = new THREE.Vector3(-CAB_RADIUS + 215, 0, 0);
export const EYE = 34;
/** Where the desk stands, by the glass over the yard, and its size (units: 1.1 m by 2.4 m, 0.8 m high). */
const DESK = new THREE.Vector3(-CAB_RADIUS + 140, 0, 0);
const DESK_SIZE = new THREE.Vector3(22, 16, 48);
/** Where the people stand in the office (units, in the cab's frame): Rask behind his desk, a visitor by the window. */
export const SPOTS = { desk: new THREE.Vector3(-CAB_RADIUS + 105, 0, 0), window: new THREE.Vector3(-CAB_RADIUS + 120, 0, -52) } as const;
/** How bright the lamp over the desk lights the room (three.js's intensity). */
const LAMP_LIGHT = 2.5;
/** How far the lamp's light reaches (units, 20 m): the office, not the yard. */
const LAMP_REACH = 400;
/** The seed of the office's wear. */
const OFFICE_SEED = 7340;

const paint = { key: 'office', seed: OFFICE_SEED, tint: 0xb9ab92, texts: ['RASK SALVAGE', 'PRIVATE', 'CASH ONLY', 'NO REFUNDS', 'MOW-2584'] } as const;
const wood = { key: 'office-desk', seed: OFFICE_SEED + 1, tint: 0x8a6a4c, texts: ['RASK', 'DESK 1', 'PROPERTY OF THE YARD'] } as const;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

/** The office, built once. */
let built: THREE.Group | null = null;

export function office(): THREE.Group {
  if (built) return built;
  const r = new Randomizer(OFFICE_SEED);
  const root = new THREE.Group();
  const plated = (parts: THREE.BufferGeometry[], look: { key: string; seed: number; tint: number; texts: readonly string[] }) => {
    const geometry = mergeGeometries(parts.map((part) => boxUv(part, PLATING_TILE / 4)));
    root.add(new THREE.Mesh(macroUv(geometry, r.range(0, 1), PLATING_TILE / 4), patchedPlating(look.key, look)));
  };
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(OFFICE_SEED), 0.6), color: 0x6f6a62 });
  const metal = (parts: THREE.BufferGeometry[]) => root.add(new THREE.Mesh(mergeGeometries(parts.map((part) => boxUv(part, 40))), steel));
  const light = (parts: THREE.BufferGeometry[], color: THREE.Color) => root.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color, toneMapped: false })));

  // the desk: a heavy top on two pedestals of drawers, a dent and a burn in it
  const { x, z } = DESK;
  const [dw, dh, dd] = [DESK_SIZE.x, DESK_SIZE.y, DESK_SIZE.z];
  plated([box(dw, 1.6, dd, x, dh, z), box(dw - 2, dh - 1.6, 12, x, (dh - 1.6) / 2, z - dd / 2 + 7), box(dw - 2, dh - 1.6, 12, x, (dh - 1.6) / 2, z + dd / 2 - 7), box(1, dh - 3, dd - 26, x + dw / 2 - 1, (dh - 3) / 2 + 1, z)], wood);
  // his chair behind it, wide and padded, and two thin ones for whoever stands before him
  const chair = (cx: number, cz: number, width: number, back: number, turn: number) => {
    const parts = [box(width, 1.5, width, 0, 9, 0), box(width, back, 1.5, 0, 9 + back / 2, -width / 2), box(1.2, 9, 1.2, -width / 2 + 1, 4.5, -width / 2 + 1), box(1.2, 9, 1.2, width / 2 - 1, 4.5, -width / 2 + 1), box(1.2, 9, 1.2, -width / 2 + 1, 4.5, width / 2 - 1), box(1.2, 9, 1.2, width / 2 - 1, 4.5, width / 2 - 1)];
    return parts.map((part) => rotateY(part, turn).translate(cx, 0, cz));
  };
  metal([...chair(SPOTS.desk.x - 6, 0, 16, 20, Math.PI / 2), ...chair(x + 26, -14, 10, 11, -Math.PI / 2), ...chair(x + 26, 14, 10, 11, -Math.PI / 2)]);
  // filing cabinets and the safe along the wall towards the lift, one drawer hanging open
  const cabinets: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const angle = Math.PI * 0.62 + k * 0.09;
    const at = (CAB_RADIUS - 30) * 1;
    cabinets.push(rotateY(box(12, 26, 10, 0, 13, 0), -angle).translate(at * cos(angle), 0, at * sin(angle)));
    if (k === 3) cabinets.push(rotateY(box(11, 5, 8, 0, 20, 8), -angle).translate(at * cos(angle), 0, at * sin(angle)));
  }
  const safe = -Math.PI * 0.62;
  cabinets.push(rotateY(box(22, 26, 20, 0, 13, 0), -safe).translate((CAB_RADIUS - 36) * cos(safe), 0, (CAB_RADIUS - 36) * sin(safe)));
  metal(cabinets);
  // the crane's console under the window over the yard, its screens and lamps the room's light
  const console_ = new THREE.Vector3(-CAB_RADIUS + 40, 0, -70);
  metal([box(14, 18, 60, console_.x, 9, console_.z), rotateZ(box(10, 2, 60, 0, 0, 0), 0.25).translate(console_.x + 4, 18.5, console_.z)]);
  light([box(0.4, 7, 12, console_.x + 7.4, 23, console_.z - 16), box(0.4, 7, 12, console_.x + 7.4, 23, console_.z), box(0.4, 7, 12, console_.x + 7.4, 23, console_.z + 16)], new THREE.Color(0.35, 0.8, 0.55));
  light([box(1.2, 1.2, 1.2, console_.x + 5, 19.5, console_.z - 24), box(1.2, 1.2, 1.2, console_.x + 5, 19.5, console_.z + 24)], new THREE.Color(1, 0.3, 0.1).multiplyScalar(2));
  // a lamp hanging from the dome over the desk, on its cable
  metal([box(0.6, 120, 0.6, x, 150, z), new THREE.ConeGeometry(9, 6, 12, 1, true).translate(x, 88, z).toNonIndexed()]);
  light([new THREE.SphereGeometry(3, 10, 6).translate(x, 86, z)], new THREE.Color(1, 0.85, 0.6).multiplyScalar(3));
  // and its light, warm, over the desk and whoever stands at it, even out to LAMP_REACH and gone
  // beyond it, so the yard outside the glass stays as the low sun lights it
  const lamp = new THREE.PointLight(0xffd9a8, LAMP_LIGHT, LAMP_REACH, 0);
  lamp.position.set(x, 80, z);
  root.add(lamp);
  // the ashtray on the desk, a cigar in it still glowing
  metal([new THREE.CylinderGeometry(3, 2.6, 0.8, 12).translate(x + 4, dh + 1.2, z + 14).toNonIndexed(), rotateZ(new THREE.CylinderGeometry(0.45, 0.4, 5, 8), Math.PI / 2).translate(x + 6, dh + 2, z + 14).toNonIndexed()]);
  light([new THREE.SphereGeometry(0.5, 6, 4).translate(x + 8.6, dh + 2, z + 14)], new THREE.Color(1, 0.35, 0.05).multiplyScalar(3));
  // his sign over the lift's door, in neon gone a little dim
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(110, 22), new THREE.MeshBasicMaterial({ map: signTexture('RASK SALVAGE', '#ff9d00'), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  sign.position.set(CAB_RADIUS - 12, 70, 0);
  setRotation(sign, 0, -Math.PI / 2, 0);
  root.add(sign);
  // the floor patched where the desk's chair has worn it through
  plated([box(40, 0.6, 50, SPOTS.desk.x, 0.3, 0)], paint);

  root.position.set(CAB.x, CAB.y + FLOOR, CAB.z);
  root.updateMatrixWorld(true);
  built = root;
  return root;
}

/** A point of the office (in the cab's frame, on its floor) in the world. */
export const inOffice = (local: THREE.Vector3, out = new THREE.Vector3()) => out.set(CAB.x + local.x, CAB.y + FLOOR + local.y, CAB.z + local.z);
