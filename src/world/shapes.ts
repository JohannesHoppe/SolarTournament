import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';

/**
 * The shapes the arenas are built from besides rock: chunks of ice, the debris of a station
 * and the hull sections of a wrecked world ship. Each carries an invisible collider box whose
 * size is computed, not measured, so the collision ellipsoid (90 % of the box, see
 * AsteroidField) is the same on every browser.
 */

/** The collision ellipsoid is this share of the collider box (SHAPE_FILL in asteroids.ts). */
const FILL = 0.9;
/** Seeds of the shapes: fixed, so every browser builds the same debris and hull. */
const DEBRIS_SEED = 7351;
const DEBRIS_COUNT = 8;
/** Mean size of a debris template (units, about 45 m), like the rock templates, so arenas scale both alike. */
const DEBRIS_SIZE = 900;
/** Hull templates are as long as this (units, 100 m) before an arena scales them up. */
const HULL_LENGTH = 2000;
/**
 * How square the hull's cross section is (the exponent of a superellipsoid; 2 is an
 * ellipsoid). At 2.6, scaled to 96 %, the hull lies inside its collision ellipsoid along its
 * axes and reaches past it only towards its corners, by up to 9 %.
 */
const HULL_SQUARENESS = 2.6;

/** An invisible box whose 90 % is the collision ellipsoid with these semi-axes. */
function collider(semiAxes: THREE.Vector3): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry((semiAxes.x * 2) / FILL, (semiAxes.y * 2) / FILL, (semiAxes.z * 2) / FILL));
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

/** Lit windows and neon strips on dark plating, as an emissive map (a wreck's emergency power still runs). */
function windowTexture(seed: number, tint: string): THREE.CanvasTexture {
  const r = new Randomizer(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < 32; row++) {
    if (r.nextFloat() < 0.45) continue;
    const y = row * 8 + 3;
    for (let x = 0; x < canvas.width; x += 6) {
      // runs of lit windows with dark stretches where the power is out
      if (r.nextFloat() < 0.55) continue;
      ctx.fillStyle = r.nextFloat() < 0.85 ? '#ffd9a0' : '#9fc4ff';
      ctx.globalAlpha = r.range(0.3, 1);
      ctx.fillRect(x, y, 3, 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = tint;
  for (let i = 0; i < 3; i++) ctx.fillRect(0, Math.floor(r.range(0.1, 0.9) * canvas.height), canvas.width, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Panels on the plating: a grey that varies from panel to panel, as a color map. */
function platingTexture(seed: number): THREE.CanvasTexture {
  const r = new Randomizer(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < canvas.height; y += 8) {
    for (let x = 0; x < canvas.width; x += 16) {
      const shade = Math.floor(r.range(70, 120));
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade + 6})`;
      ctx.fillRect(x, y, 16, 8);
    }
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  for (let y = 0; y <= canvas.height; y += 8) ctx.strokeRect(0, y, canvas.width, 0);
  for (let x = 0; x <= canvas.width; x += 16) ctx.strokeRect(x, 0, 0, canvas.height);
  // scorch marks of the battle that broke it
  for (let i = 0; i < 12; i++) {
    const x = r.range(0, canvas.width);
    const y = r.range(0, canvas.height);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r.range(8, 30));
    gradient.addColorStop(0, 'rgba(10, 6, 4, 0.85)');
    gradient.addColorStop(1, 'rgba(10, 6, 4, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Debris of a station: modules, plates and girders torn apart, a few boxes each, pointing
 * along their longest axis. Their emergency lights still glow.
 */
export function debrisSet(): TemplateSet {
  const r = new Randomizer(DEBRIS_SEED);
  const metal = new THREE.MeshStandardMaterial({ map: platingTexture(DEBRIS_SEED), roughness: 0.55, metalness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7, metalness: 0.2 });
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
    const body = new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed())), r.nextFloat() < 0.3 ? paint : metal);
    group.add(body, new THREE.Mesh(mergeGeometries(lights), light));
    body.geometry.computeBoundingBox();
    const size = body.geometry.boundingBox!.getSize(new THREE.Vector3());
    // the collision ellipsoid hugs the bulk of the piece, not its loose bits
    group.add(collider(new THREE.Vector3(size.x * 0.48, Math.max(size.y * 0.42, length * 0.06), Math.max(size.z * 0.42, length * 0.06)).round()));
    near.push(group);
  }
  return { near, far: [] };
}

/**
 * The hull sections of a wrecked world ship, each an ellipsoid of plating with panel lines,
 * lit windows and a strip of neon, so its collision shape is the hull itself:
 * 0 a hull section, 1 a section torn off at one end, 2 an engine block, 3 a bridge tower,
 * 4 a long spar.
 */
export function hullSet(): TemplateSet {
  const plating = platingTexture(DEBRIS_SEED + 1);
  plating.repeat.set(8, 3);
  const windows = windowTexture(DEBRIS_SEED + 2, '#ff9d00');
  const material = new THREE.MeshStandardMaterial({ map: plating, emissiveMap: windows, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.6, metalness: 0.6 });
  // where it broke, the hull still glows
  const tornWindows = windowTexture(DEBRIS_SEED + 2, '#ff9d00');
  const ctx = (tornWindows.image as HTMLCanvasElement).getContext('2d')!;
  const glow = ctx.createLinearGradient(tornWindows.image.width * 0.82, 0, tornWindows.image.width, 0);
  glow.addColorStop(0, 'rgba(255, 90, 0, 0)');
  glow.addColorStop(1, 'rgba(255, 120, 20, 1)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, tornWindows.image.width, tornWindows.image.height);
  const torn = material.clone();
  torn.emissiveMap = tornWindows;
  const engine = new THREE.MeshStandardMaterial({ color: 0x24262c, emissive: 0x2a6cff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.8 });
  const L = HULL_LENGTH;
  const shapes: [THREE.Vector3, boolean][] = [
    [new THREE.Vector3(L * 0.5, L * 0.16, L * 0.14), false],
    [new THREE.Vector3(L * 0.5, L * 0.16, L * 0.14), true],
    [new THREE.Vector3(L * 0.22, L * 0.2, L * 0.2), false],
    [new THREE.Vector3(L * 0.12, L * 0.3, L * 0.1), false],
    [new THREE.Vector3(L * 0.5, L * 0.04, L * 0.04), false],
  ];
  const near = shapes.map(([axes, broken], i) => {
    const geometry = new THREE.SphereGeometry(1, 96, 48);
    geometry.rotateZ(Math.PI / 2);
    // the texture's rows run along the hull (decks of windows), not around it
    const uv = geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k));
    const position = geometry.attributes.position;
    const p = new THREE.Vector3();
    for (let k = 0; k < position.count; k++) {
      p.fromBufferAttribute(position, k);
      // a squarish hull (a superellipsoid), kept close to the collision ellipsoid
      const squarish = Math.pow(Math.abs(p.x) ** HULL_SQUARENESS + Math.abs(p.y) ** HULL_SQUARENESS + Math.abs(p.z) ** HULL_SQUARENESS, 1 / HULL_SQUARENESS);
      p.divideScalar(squarish).multiplyScalar(0.96);
      // a torn section ends in a jagged break, inside the ellipsoid
      if (broken && p.x > 0.55) {
        const jag = 0.55 + 0.25 * Math.abs(Math.sin(p.y * 23 + p.z * 17));
        p.x = Math.min(p.x, jag);
      }
      position.setXYZ(k, p.x * axes.x, p.y * axes.y, p.z * axes.z);
    }
    geometry.computeVertexNormals();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, i === 2 ? engine : broken ? torn : material));
    group.add(collider(axes.clone().round()));
    return group;
  });
  return { near, far: [] };
}
