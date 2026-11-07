import * as THREE from 'three';
import { sin, pow } from '../detmath';
import { rotateX, rotateY, rotateZ, setRotation } from '../detthree';
import type { HullBox } from './boxes';
import { armorSurface, ARMOR_TILE, lacquer, shine, signTexture } from '../view/surfaces';

/**
 * The Victory Cola yacht of Bellamy Crisp (chapter 10's Plume Yacht), fresh from the dock as only
 * what the rich own is: one long body of revolution, YACHT_HALF long on each side of its middle,
 * in the brand's red lacquer over polished plates with no rivet or scratch on them, a white band
 * and a gold ring at its waist, a lounge of warm glass on its back, two swept fins, twin drive
 * bells and the brand's neon on both flanks. Built along x, the bow at -x, as the working hulls of
 * world/barge are; solid as the boxes it is built of.
 */

/** The body's half length (units, 60 m) and its widest radius (units, 9 m). */
export const YACHT_HALF = 1200;
const YACHT_RADIUS = 180;
/** The body's profile: its radius at `t` along it (0 the bow's tip, 1 the stern), a long fine bow swelling to its widest past the middle, tapering to the stern. */
const profile = (t: number) => YACHT_RADIUS * pow(sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), 0.6) * (t < 0.3 ? pow(t / 0.3, 0.35) : 1);
/** The lacquer: Victory Cola's red, the band white, the trim gold, the brand's neon sign. */
const RED = 0xb80d22;
const WHITE = 0xf2efe8;
const GOLD = 0xe2aa3e;
const NEON = '#ff3b3b';
/** The plates' seed (see armorSurface). */
const PLATES = 10101;

let built: { root: THREE.Group; boxes: readonly HullBox[] } | null = null;

/** The yacht's model and its boxes, built at its first use (a drill takes the model and poses it). */
export function yacht(): { root: THREE.Group; boxes: readonly HullBox[] } {
  if (built) return built;
  const root = new THREE.Group();
  const plating = armorSurface(PLATES);
  const paint = (color: number) =>
    lacquer(new THREE.MeshPhysicalMaterial({ color, map: plating.map, roughnessMap: plating.orm, metalnessMap: plating.orm, roughness: 0.8, metalness: 0.5, normalMap: plating.normal, envMap: shine(), envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.06 }));
  const gold = lacquer(new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.3, envMap: shine(), envMapIntensity: 2.6, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(1.4), toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.35, 0.3).multiplyScalar(2.2), toneMapped: false });

  // the body: a lathe along x, its plates laid on at their true size
  const points: THREE.Vector2[] = [];
  const STEPS = 48;
  for (let i = 0; i <= STEPS; i++) points.push(new THREE.Vector2(Math.max(1, profile(i / STEPS)), (i / STEPS) * 2 * YACHT_HALF - YACHT_HALF));
  // the lathe's axis turned from y to x, its first point (the bow's tip) at -x
  const body = rotateZ(new THREE.LatheGeometry(points, 48), -Math.PI / 2);
  const uv = body.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * YACHT_RADIUS) / ARMOR_TILE, (uv.getY(i) * 2 * YACHT_HALF) / ARMOR_TILE);
  root.add(new THREE.Mesh(body, paint(RED)));

  // the white band at the waist and the gold ring at its stern edge
  const waist = 0.15 * YACHT_HALF;
  const band = rotateZ(new THREE.CylinderGeometry(YACHT_RADIUS * 1.01, YACHT_RADIUS * 1.01, 260, 48, 1, true), Math.PI / 2).translate(waist, 0, 0);
  root.add(new THREE.Mesh(band, paint(WHITE)));
  const ring = rotateZ(new THREE.TorusGeometry(YACHT_RADIUS * 1.02, 10, 8, 48), Math.PI / 2);
  rotateY(ring, Math.PI / 2).translate(waist + 140, 0, 0);
  root.add(new THREE.Mesh(ring, gold));

  // the lounge on its back: a long dome of warm glass behind the bow, framed in gold
  const lounge = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(420, 70, 110).translate(-0.35 * YACHT_HALF, YACHT_RADIUS * 0.82, 0);
  root.add(new THREE.Mesh(lounge, glass));
  const rim = rotateX(new THREE.TorusGeometry(1, 0.06, 6, 48), Math.PI / 2).scale(425, 200, 115).translate(-0.35 * YACHT_HALF, YACHT_RADIUS * 0.82, 0);
  root.add(new THREE.Mesh(rim, gold));

  // two fins swept back from the waist, white, edged in gold
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(520, 0);
  fin.lineTo(700, 340);
  fin.lineTo(560, 340);
  fin.closePath();
  for (const side of [-1, 1]) {
    const blade = new THREE.ExtrudeGeometry(fin, { depth: 16, bevelEnabled: false }).translate(0, 0, -8);
    rotateX(blade, (side * Math.PI) / 2).translate(waist - 200, 0, side * YACHT_RADIUS * 0.7);
    root.add(new THREE.Mesh(blade, paint(WHITE)));
  }

  // twin drive bells at the stern, glowing in their throats
  const bellAt = (side: number) => new THREE.Vector3(YACHT_HALF + 40, 0, side * 80);
  for (const side of [-1, 1]) {
    const at = bellAt(side);
    const bell = rotateZ(new THREE.CylinderGeometry(50, 85, 160, 16, 1, true), Math.PI / 2).translate(at.x, at.y, at.z);
    root.add(new THREE.Mesh(bell, gold));
    const throat = rotateY(new THREE.CircleGeometry(70, 16), Math.PI / 2).translate(at.x + 60, at.y, at.z);
    root.add(new THREE.Mesh(throat, glow));
  }

  // the brand's neon on both flanks
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('VICTORY COLA', NEON), toneMapped: false });
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(520, 130), sign);
    plate.position.set(0.45 * YACHT_HALF, 20, side * (YACHT_RADIUS + 6));
    if (side < 0) setRotation(plate, 0, Math.PI, 0);
    root.add(plate);
  }

  // what collides: the body in three boxes, the fins, the bells
  const boxes: HullBox[] = [];
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => boxes.push({ center: new THREE.Vector3(x, y, z), half: new THREE.Vector3(hx, hy, hz), turn: new THREE.Quaternion() });
  box(-0.65 * YACHT_HALF, 0, 0, 0.35 * YACHT_HALF, YACHT_RADIUS * 0.7, YACHT_RADIUS * 0.7);
  box(0.1 * YACHT_HALF, 20, 0, 0.4 * YACHT_HALF, YACHT_RADIUS, YACHT_RADIUS);
  box(0.75 * YACHT_HALF, 0, 0, 0.25 * YACHT_HALF, YACHT_RADIUS * 0.8, YACHT_RADIUS * 0.8);
  box(waist + 150, 0, 0, 350, 16, YACHT_RADIUS + 340);
  box(YACHT_HALF + 40, 0, 0, 80, 85, 170);
  built = { root, boxes };
  return built;
}

