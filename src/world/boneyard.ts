import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { boxUv, industrialSurface, surfaced, wornSurface } from '../view/surfaces';
import { DEPOT } from '../ship/models';
import { setFromEuler } from '../detthree';
import { acos, sin } from '../detmath';
import { PSYCHE_BELOW, PSYCHE_CENTER, PSYCHE_RADIUS, RACK_BOXES, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, YARD_SEED } from './yard';

/**
 * How the Boneyard on Psyche looks (the campaign's first place; where things stand in
 * world/yard): racks of dead fighters, forty thousand hulls in the yard, of which the field holds
 * the rows around the yard office, and Psyche below, a metal world 226 km across. The racks are
 * field pieces of their own kind ('rack'), solid, colliding as their box.
 */

/** A dead fighter in a rack: about the interceptors' size (units, 35 m long). */
const FIGHTER_LENGTH = 700;
/** Fighters a full rack holds. */
const SLOTS = 6;
/** The cap of Psyche that is built (rad): out to the field's horizon (some 18.6° around the point beneath it) and a little beyond. */
const PSYCHE_CAP = acos(PSYCHE_RADIUS / (PSYCHE_RADIUS + PSYCHE_BELOW)) + 0.04;
/** Psyche lies far beyond most of what flies: it is drawn at this depth (clip space, a share of the way to the far plane), in front of the stars. */
const BEHIND_ALL = 0.99999;

const block = (x: number, y: number, z: number, cx = 0, cy = 0, cz = 0) => new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed();

/** A dead fighter, low poly: fuselage, cockpit, the two drive bells' housings, stub wings and a fin; nose along -x, lying slightly askew, now and then a wing gone. */
function fighter(r: Randomizer, x: number, y: number, z: number, into: THREE.BufferGeometry[]) {
  const L = FIGHTER_LENGTH;
  const parts = [block(L, L * 0.16, L * 0.2, 0, 0, 0), block(L * 0.3, L * 0.08, L * 0.12, -L * 0.22, L * 0.1, 0)];
  for (const side of [-1, 1]) {
    parts.push(block(L * 0.3, L * 0.14, L * 0.12, L * 0.32, 0, side * L * 0.16));
    if (r.nextFloat() > 0.15) parts.push(block(L * 0.34, L * 0.03, L * 0.4, L * 0.1, -L * 0.02, side * L * 0.3));
  }
  parts.push(block(L * 0.18, L * 0.22, L * 0.025, L * 0.36, L * 0.16, 0));
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(setFromEuler(new THREE.Quaternion(), r.range(-0.05, 0.05), r.range(-0.08, 0.08), r.range(-0.06, 0.06)));
  for (const part of parts) into.push(part.applyMatrix4(turn).translate(x, y, z));
}

const noUv = (geometry: THREE.BufferGeometry) => {
  if (geometry.hasAttribute('uv')) geometry.deleteAttribute('uv');
  return geometry;
};

/**
 * The racks: girders (posts at both ends and at every cradle, rails along top and bottom, cross
 * braces), a cradle under each slot and the fighters in them; a full rack, one with gaps, an
 * empty frame. Each within its collider box (RACK_BOXES), which is its collision shape.
 */
export function rackSet(): TemplateSet {
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(YARD_SEED), 2), color: 0x8a8f96 });
  const paint = new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(YARD_SEED + 1, DEPOT), 2), color: 0x7d8466 });
  const near = RACK_BOXES.map((half, type) => {
    const r = new Randomizer(YARD_SEED + 10 + type);
    const girders: THREE.BufferGeometry[] = [];
    const hulls: THREE.BufferGeometry[] = [];
    const slot = RACK_LENGTH / SLOTS;
    for (const y of [-half.y + 20, half.y - 20]) for (const z of [-half.z + 20, half.z - 20]) girders.push(block(RACK_LENGTH, 40, 40, 0, y, z));
    for (let k = 0; k <= SLOTS; k++) {
      const x = -half.x + k * slot;
      for (const z of [-half.z + 20, half.z - 20]) girders.push(block(40, RACK_HEIGHT, 40, x, 0, z));
      girders.push(block(30, 30, RACK_DEPTH, x, half.y - 20, 0), block(30, 30, RACK_DEPTH, x, -half.y + 20, 0));
    }
    for (let k = 0; k < SLOTS; k++) {
      const x = -half.x + (k + 0.5) * slot;
      // a cradle across the rack, and the fighter on it unless the slot stands empty
      girders.push(block(slot * 0.6, 30, RACK_DEPTH * 0.8, x, -half.y * 0.35, 0));
      const filled = type === 0 ? r.nextFloat() > 0.08 : type === 1 ? r.nextFloat() > 0.5 : false;
      if (filled) fighter(r, x, -half.y * 0.35 + FIGHTER_LENGTH * 0.12, 0, hulls);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(boxUv(mergeGeometries(girders.map(noUv)), 400), steel));
    if (hulls.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(hulls.map(noUv)), 400), paint));
    const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
    collider.userData.collider = true;
    collider.visible = false;
    group.add(collider);
    return group;
  });
  return { near, far: [], box: true };
}

/**
 * Psyche under the yard: a metal world, dark grey with a brownish cast, its craters (dark floors,
 * rims lit on one side) drawn on a canvas in code.
 */
export function psyche(): THREE.Group {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#4b4741';
  g.fillRect(0, 0, size * 2, size);
  const r = new Randomizer(YARD_SEED + 50);
  for (let k = 0; k < 900; k++) {
    const x = r.range(0, size * 2);
    const y = r.range(0, size);
    const radius = Math.min(80, 2 + 120 * r.nextFloat() * r.nextFloat() * r.nextFloat());
    g.fillStyle = `rgba(20, 18, 16, ${0.25 + 0.3 * r.nextFloat()})`;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(150, 140, 125, ${0.15 + 0.25 * r.nextFloat()})`;
    g.lineWidth = Math.max(1, radius * 0.12);
    g.beginPath();
    g.arc(x, y, radius, Math.PI * 0.9, Math.PI * 1.9);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // only the cap the field sees, out to a little beyond its horizon, its map laid on from above
  // (a sphere's own mapping would pinch to a point right under the field)
  const geometry = new THREE.SphereGeometry(PSYCHE_RADIUS, 256, 48, 0, Math.PI * 2, 0, PSYCHE_CAP);
  const reach = PSYCHE_RADIUS * sin(PSYCHE_CAP);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) uv.setXY(i, 0.5 + position.getX(i) / (2 * reach), 0.5 + position.getZ(i) / (2 * reach));
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0.2, color: 0xd6cec2, transparent: true, depthWrite: false });
  // drawn behind everything else, in front of the sky, which it hides: whatever flies is drawn over it
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n  gl_Position.z = gl_Position.w * ${BEHIND_ALL};`);
  };
  const body = new THREE.Mesh(geometry, material);
  body.position.copy(PSYCHE_CENTER);
  body.renderOrder = -2;
  body.frustumCulled = false;
  body.userData.shadowless = true;
  const group = new THREE.Group();
  group.add(body);
  return group;
}
