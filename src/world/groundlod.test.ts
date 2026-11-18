import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { strayPixels, tiledGround, TOLERANCE } from './groundlod';
import { flatGrid } from './boneyard';
import { sin } from '../detmath';

/** Rolling hills and a cliff. */
const hills = (x: number, z: number) => 400 * sin(x / 3000) + 300 * sin(z / 2000) + (x > 5000 ? 2000 : 0);

/** A ground of 150 by 100 cells of 25 m of `relief`, as reliefGround lays it. */
function ground(relief = hills) {
  const half = new THREE.Vector3(37500, 5000, 25000);
  const geometry = flatGrid(half, 500);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, relief(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  const tiles = tiledGround(geometry, geometry.parameters.widthSegments, geometry.parameters.heightSegments, new THREE.MeshBasicMaterial());
  tiles.updateMatrixWorld(true);
  return { geometry, tiles: tiles.children as THREE.LOD[] };
}

/** Each of a geometry's faces as its three corners' positions, rounded, in a set. */
function faces(geometry: THREE.BufferGeometry, skip = (_: THREE.Vector3[]) => false): Set<string> {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const out = new Set<string>();
  for (let i = 0; i < index.count; i += 3) {
    const corners = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)));
    if (!skip(corners)) out.add(corners.map((c) => `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.z)}`).join('|'));
  }
  return out;
}

describe('the ground in tiles', () => {
  it('draws exactly the full grid\'s faces at the finest level, wound alike', () => {
    const { geometry, tiles } = ground();
    const full = faces(geometry);
    const finest = new Set<string>();
    // a skirt's face hangs straight down: two of its corners stand one above the other
    const skirt = (corners: THREE.Vector3[]) => corners.some((c, i) => corners.some((o, k) => k > i && c.x === o.x && c.z === o.z));
    for (const tile of tiles) for (const face of faces((tile.levels[0].object as THREE.Mesh).geometry, skirt)) finest.add(face);
    expect(finest).toEqual(full);
  });

  it('draws fewer faces at each coarser level, and the coarser only farther away', () => {
    const { tiles } = ground();
    const tile = tiles[0];
    const counts = tile.levels.map((level) => (level.object as THREE.Mesh).geometry.getIndex()!.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1]);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 10, 700000);
    let last = 0;
    for (const distance of [0, 2000, 20000, 100000, 400000]) {
      camera.position.set(-37500, 2000, -25000 - distance);
      camera.updateMatrixWorld();
      tile.update(camera);
      expect(tile.getCurrentLevel()).toBeGreaterThanOrEqual(last);
      last = tile.getCurrentLevel();
    }
    camera.position.set(-36000, 1000, -24000);
    camera.updateMatrixWorld();
    tile.update(camera);
    expect(tile.getCurrentLevel()).toBe(0);
    expect(last).toBeGreaterThan(0);
  });
});

/** A tile's own grid points (no skirt's) and each level's faces over them, from its meshes. */
function tileFaces(tile: THREE.LOD, level: number): THREE.Vector3[][] {
  const geometry = (tile.levels[level].object as THREE.Mesh).geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const out: THREE.Vector3[][] = [];
  for (let i = 0; i < index.count; i += 3) {
    const corners = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)));
    // a skirt's face stands upright: its normal has no height
    const normal = new THREE.Vector3().crossVectors(corners[1].clone().sub(corners[0]), corners[2].clone().sub(corners[0]));
    if (Math.abs(normal.y) > 1e-6 * normal.length()) out.push(corners);
  }
  return out;
}

/** A chase camera's lens at `position`, looking at `target`. */
function cameraAt(position: THREE.Vector3, target: THREE.Vector3) {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 10, 700000);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

describe('the ground\'s levels by the pixels they stray', () => {
  it('knows how far each level strays: no grid point lies farther off the level\'s faces than its error', () => {
    const { geometry, tiles } = ground();
    const position = geometry.getAttribute('position');
    const point = new THREE.Vector3();
    const plane = new THREE.Plane();
    for (const tile of tiles) {
      const box = (tile as unknown as { box: THREE.Box3 }).box;
      const errors = (tile as unknown as { errors: number[] }).errors;
      for (let level = 1; level < tile.levels.length; level++) {
        const faces = tileFaces(tile, level);
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i);
          if (point.x < box.min.x || point.x > box.max.x || point.z < box.min.z || point.z > box.max.z) continue;
          // the face whose footprint holds the point: the distance to its plane is what shows
          const face = faces.find(([a, b, c]) => {
            const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
            const u = ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / d;
            const v = ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / d;
            return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
          })!;
          expect(face).toBeDefined();
          plane.setFromCoplanarPoints(face[0], face[1], face[2]);
          expect(Math.abs(plane.distanceToPoint(point))).toBeLessThanOrEqual(errors[level] + 1e-3);
        }
      }
    }
  });

  it('draws the coarsest level within the pixel bound, never one beyond it', () => {
    const { tiles } = ground();
    const eye = new THREE.Vector3();
    let coarse = 0;
    for (let k = 0; k < 40; k++) {
      // low over the ground, high above it, and far out beside it
      const camera = cameraAt(new THREE.Vector3(-40000 + k * 2100, hills(-40000 + k * 2100, 1000 * k - 20000) + [60, 400, 4000, 40000][k % 4], 1000 * k - 20000), new THREE.Vector3(0, 0, 0));
      for (const tile of tiles) {
        tile.update(camera);
        const level = tile.getCurrentLevel();
        const errors = (tile as unknown as { errors: number[] }).errors;
        const distance = (tile as unknown as { box: THREE.Box3 }).box.distanceToPoint(eye.setFromMatrixPosition(camera.matrixWorld));
        const y = camera.projectionMatrix.elements[5];
        expect(strayPixels(errors[level], distance, y)).toBeLessThanOrEqual(TOLERANCE);
        if (level + 1 < tile.levels.length) expect(strayPixels(errors[level + 1], distance, y)).toBeGreaterThan(TOLERANCE);
        coarse += level;
      }
    }
    expect(coarse).toBeGreaterThan(0);
  });

  it('draws a flat tile coarse close by while a rugged one keeps its detail', () => {
    // flat for x below 0, rugged beyond
    const { tiles } = ground((x, z) => (x < 0 ? 0 : 600 * sin(x / 300) * sin(z / 400)));
    const flat = tiles[0];
    const rugged = tiles[tiles.length - 1];
    for (const tile of [flat, rugged]) {
      const center = (tile as unknown as { box: THREE.Box3 }).box.getCenter(new THREE.Vector3());
      tile.update(cameraAt(center.clone().add(new THREE.Vector3(0, 2000, 0)), center.clone().setY(-1)));
    }
    expect(flat.getCurrentLevel()).toBe(flat.levels.length - 1);
    expect(rugged.getCurrentLevel()).toBe(0);
  });
});
