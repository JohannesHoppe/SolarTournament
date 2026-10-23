import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { canvas, toTexture } from '../view/textures';
import { boxUv, ravagedSurface, surfaced, wornSurface, type Wear } from '../view/surfaces';

/**
 * The shapes the arenas are built from besides rock: chunks of ice, the debris of a station
 * and the hull sections of a wrecked world ship. Ice collides with its measured surface, as the
 * rocks do (see world/surface); debris and hull carry an invisible collider box whose size is
 * computed, so the collision shape is the same on every browser: an ellipsoid of 90 % of the box
 * for debris (see AsteroidField), the box itself for the hull.
 */

/** The collision ellipsoid of a piece that is no box is this share of its collider box (see AsteroidField). */
export const SHAPE_FILL = 0.9;
/** Seeds of the shapes: fixed, so every browser builds the same debris and hull. */
const DEBRIS_SEED = 7351;
const DEBRIS_COUNT = 8;
/** Mean size of a debris template (units, about 45 m), like the rock templates, so arenas scale both alike. */
const DEBRIS_SIZE = 900;
/** Hull templates are as long as this (units, 100 m) before an arena scales them up. */
const HULL_LENGTH = 2000;

/** An invisible box whose `fill` (90 % for rock-like pieces, all of it for a box piece) is the collision shape with these semi-axes. */
function collider(semiAxes: THREE.Vector3, fill = SHAPE_FILL): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry((semiAxes.x * 2) / fill, (semiAxes.y * 2) / fill, (semiAxes.z * 2) / fill));
  box.userData.collider = true;
  box.visible = false;
  return box;
}

/** Ice: the rock shapes, frozen. Clean, pale and glossy, with a cold glow in the shadow. */
export function iceSet(rocks: TemplateSet): TemplateSet {
  const material = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.3, metalness: 0.15, emissive: 0x0d1a2e, emissiveIntensity: 1 });
  const freeze = (object: THREE.Object3D) => new THREE.Mesh((object as THREE.Mesh).geometry, material);
  return { near: rocks.near.map(freeze), far: rocks.far.map(freeze) };
}

/** A deck of windows: lit ones in runs, with dark stretches where the power is out (a wreck's emergency power still runs). */
function windowTexture(seed: number): THREE.CanvasTexture {
  const r = new Randomizer(seed);
  const [element, ctx] = canvas(256, 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, element.width, element.height);
  let lit = true;
  for (let x = 0; x < element.width; x += 4) {
    if (r.nextFloat() < 0.12) lit = !lit;
    if (!lit || r.nextFloat() < 0.2) continue;
    ctx.fillStyle = r.nextFloat() < 0.85 ? '#ffd9a0' : '#9fc4ff';
    ctx.fillRect(x, 0, 3, element.height);
  }
  return tiled(element);
}

/** A drawn canvas as a texture repeated across a surface. */
function tiled(element: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = toTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * The plating of what broke in battle (see ravagedSurface): craters, burns with their heat
 * tint, soot and rust, the last embers glowing in a few craters. Little metalness of its own:
 * without a reflected environment, metal turns black on its shadowed side.
 */
function ravaged(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const surface = ravagedSurface(DEBRIS_SEED + 1);
  return new THREE.MeshStandardMaterial({ ...surfaced(surface, RELIEF), color, metalness: 0.35, emissive: 0xff6a1a, emissiveMap: surface.glow, emissiveIntensity: 1.6 });
}

/** How deep seams, rivets and craters look (see surfaced), and how large a tile of plating is (units, 8 m). */
const RELIEF = 2;
const TILE = 160;

/** The paint of a station's modules: off-white, worn, scorched at the edges. */
const STATION: Wear = { rust: 0.4, chips: 0.5, grime: 0.8, scratches: 0.5, seams: 0.6, stencils: ['DECK 7', 'AIRLOCK', 'O2', 'SECTOR C'], roughness: 0.75, metalness: 0.15 };

/**
 * Debris of a station: modules, plates and girders torn apart, a few boxes each, pointing
 * along their longest axis. Their emergency lights still glow.
 */
export function debrisSet(): TemplateSet {
  const r = new Randomizer(DEBRIS_SEED);
  const metal = ravaged(0xffffff);
  const paint = new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(DEBRIS_SEED, STATION), RELIEF), color: 0xd8d2c4 });
  const light = new THREE.MeshStandardMaterial({ color: 0x110805, emissive: 0xff7a1a, emissiveIntensity: 2.2 });
  const near: THREE.Object3D[] = [];
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const parts: THREE.BufferGeometry[] = [];
    const lights: THREE.BufferGeometry[] = [];
    const length = DEBRIS_SIZE * r.range(1.4, 2.4);
    const kind = i % 3;
    if (kind === 0) {
      // a module: a box with ribs, torn open at one end
      parts.push(new THREE.BoxGeometry(length, length * 0.35, length * 0.35));
      for (let rib = 0; rib < 5; rib++) parts.push(new THREE.BoxGeometry(length * 0.04, length * 0.42, length * 0.42).translate(length * (rib / 4 - 0.5) * 0.9, 0, 0));
    } else if (kind === 1) {
      // a girder: a lattice of beams
      const side = length * 0.12;
      for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(new THREE.BoxGeometry(length, side * 0.18, side * 0.18).translate(0, y * side, z * side));
      for (let k = 0; k < 8; k++) parts.push(new THREE.BoxGeometry(side * 0.15, side * 2, side * 0.15).translate(length * (k / 7 - 0.5), 0, 0));
    } else {
      // a sheet of plating with a frame, bent
      parts.push(new THREE.BoxGeometry(length, length * 0.04, length * 0.55));
      parts.push(new THREE.BoxGeometry(length * 0.6, length * 0.04, length * 0.4).rotateZ(0.5).translate(length * 0.5, length * 0.12, 0));
    }
    // loose bits and a strip of emergency lights
    const bits = 2 + (r.nextInt() % 3);
    for (let b = 0; b < bits; b++) {
      const size = length * r.range(0.08, 0.2);
      parts.push(new THREE.BoxGeometry(size, size, size).translate(r.range(-0.4, 0.4) * length, r.range(-0.1, 0.1) * length, r.range(-0.1, 0.1) * length));
    }
    lights.push(new THREE.BoxGeometry(length * 0.6, length * 0.015, length * 0.015).translate(0, length * 0.19, length * 0.1));
    const group = new THREE.Group();
    const body = new THREE.Mesh(boxUv(mergeGeometries(parts.map((p) => p.toNonIndexed())), TILE), r.nextFloat() < 0.3 ? paint : metal);
    group.add(body, new THREE.Mesh(mergeGeometries(lights), light));
    body.geometry.computeBoundingBox();
    const size = body.geometry.boundingBox!.getSize(new THREE.Vector3());
    // the collision ellipsoid hugs the bulk of the piece, not its loose bits
    group.add(collider(new THREE.Vector3(size.x * 0.48, Math.max(size.y * 0.42, length * 0.06), Math.max(size.z * 0.42, length * 0.06)).round()));
    near.push(group);
  }
  return { near, far: [] };
}

/** A box of size (x, y, z) centered at (cx, cy, cz), as a part of a hull. */
const block = (x: number, y: number, z: number, cx = 0, cy = 0, cz = 0) => new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed();

/**
 * The hull sections of a wrecked world ship, industrial and angular: boxes of plating on
 * frames, a spine, containers along the flanks, decks of lit windows, all within the section's
 * collider box, which is its collision shape. 0 a hull section, 1 a section torn off at one end
 * (still glowing where it broke), 2 an engine block with three nozzles, 3 a bridge tower,
 * 4 a long truss.
 */
export function hullSet(): TemplateSet {
  const metal = ravaged(0xb8bec8);
  const dark = ravaged(0x4a4e57);
  const windows = new THREE.MeshBasicMaterial({ map: windowTexture(DEBRIS_SEED + 2), color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), toneMapped: false });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.35, 0.05).multiplyScalar(2), toneMapped: false });
  const drive = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.5, 1).multiplyScalar(1.4), toneMapped: false });
  const r = new Randomizer(DEBRIS_SEED + 3);
  const L = HULL_LENGTH;

  /** A section's body: a core on frames, a spine on top, containers and window decks on both flanks. */
  const section = (half: THREE.Vector3, end: number, parts: THREE.BufferGeometry[], lights: THREE.BufferGeometry[]) => {
    const start = -half.x;
    const length = end - start;
    const middle = (start + end) / 2;
    parts.push(block(length, half.y * 1.6, half.z * 1.6, middle));
    for (let x = start + 40; x < end; x += length / 7) parts.push(block(60, half.y * 2, half.z * 2, x));
    parts.push(block(length * 0.9, half.y * 0.2, half.z * 0.5, middle, half.y * 0.9));
    for (const side of [1, -1]) {
      for (let x = start + 120; x < end - 160; x += r.range(160, 260)) {
        parts.push(block(r.range(90, 150), half.y * r.range(0.35, 0.6), half.z * 0.16, x, r.range(-0.3, 0.3) * half.y, side * half.z * 0.88));
      }
      for (const deck of [-0.45, -0.15, 0.15, 0.45]) lights.push(block(length * r.range(0.5, 0.9), 10, 6, middle + r.range(-0.1, 0.1) * length, deck * half.y, side * half.z * 0.81));
    }
  };

  const shapes: [THREE.Vector3, (half: THREE.Vector3, parts: THREE.BufferGeometry[], lights: THREE.BufferGeometry[], glow: THREE.BufferGeometry[]) => void][] = [
    [new THREE.Vector3(L * 0.5, L * 0.16, L * 0.14), (half, parts, lights) => section(half, half.x, parts, lights)],
    [
      new THREE.Vector3(L * 0.5, L * 0.16, L * 0.14),
      (half, parts, lights, glow) => {
        // the hull ends at 40 % of the length, torn plates reach on to the end of the box
        section(half, half.x * 0.4, parts, lights);
        for (let k = 0; k < 9; k++) {
          const length = r.range(0.2, 0.6) * half.x;
          parts.push(block(length, r.range(10, 30), half.z * r.range(0.4, 1.4), half.x * 0.4 + length / 2, r.range(-0.75, 0.75) * half.y, r.range(-0.3, 0.3) * half.z));
        }
        glow.push(block(20, half.y * 1.5, half.z * 1.5, half.x * 0.4 + 12));
      },
    ],
    [
      new THREE.Vector3(L * 0.22, L * 0.2, L * 0.2),
      (half, parts, _, glow) => {
        parts.push(block(half.x * 1.2, half.y * 2, half.z * 2, -half.x * 0.4));
        // three nozzles out of the back, their throats still glowing
        for (const [y, z] of [[0.45, 0], [-0.3, 0.45], [-0.3, -0.45]]) {
          const nozzle = new THREE.CylinderGeometry(half.y * 0.32, half.y * 0.48, half.x * 0.8, 8, 1, true).rotateZ(Math.PI / 2).translate(half.x * 0.6, y * half.y, z * half.z).toNonIndexed();
          parts.push(nozzle);
          glow.push(new THREE.CircleGeometry(half.y * 0.3, 8).rotateY(Math.PI / 2).translate(half.x * 0.25, y * half.y, z * half.z).toNonIndexed());
        }
      },
    ],
    [
      new THREE.Vector3(L * 0.12, L * 0.3, L * 0.1),
      (half, parts, lights) => {
        // stepped levels, a bridge on top, and a mast
        for (let level = 0; level < 4; level++) {
          const shrink = 1 - level * 0.18;
          parts.push(block(half.x * 2 * shrink, half.y * 0.4, half.z * 2 * shrink, 0, -half.y + half.y * 0.2 + level * half.y * 0.4));
          lights.push(block(half.x * 2 * shrink + 2, 8, half.z * 1.2 * shrink, 0, -half.y + half.y * 0.32 + level * half.y * 0.4));
        }
        parts.push(block(16, half.y * 0.4, 16, 0, half.y * 0.8));
      },
    ],
    [
      new THREE.Vector3(L * 0.5, L * 0.04, L * 0.04),
      (half, parts) => {
        // a truss: four rails and their struts
        for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(block(half.x * 2, 14, 14, 0, y * (half.y - 7), z * (half.z - 7)));
        for (let x = -half.x; x <= half.x; x += half.x / 10) parts.push(block(10, half.y * 2, 10, x), block(10, 10, half.z * 2, x));
      },
    ],
  ];
  const near = shapes.map(([half, build]) => {
    const parts: THREE.BufferGeometry[] = [];
    const lights: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    build(half, parts, lights, glow);
    const group = new THREE.Group();
    const body = mergeGeometries(parts.map((p) => p.deleteAttribute('uv')));
    group.add(new THREE.Mesh(boxUv(body, TILE), half.y < L * 0.05 ? dark : metal));
    if (lights.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(lights.map((p) => p.deleteAttribute('uv'))), 400), windows));
    if (glow.length) group.add(new THREE.Mesh(mergeGeometries(glow.map((p) => p.deleteAttribute('uv'))), half.x < L * 0.3 ? drive : ember));
    group.add(collider(half.clone().round(), 1));
    return group;
  });
  return { near, far: [], box: true };
}
