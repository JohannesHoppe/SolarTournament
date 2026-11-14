import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tiledGround } from './groundlod';
import { flatGrid } from './boneyard';
import { sin } from '../detmath';

/** A ground of 150 by 100 cells of 25 m, rolling hills and a cliff, as reliefGround lays it. */
function ground() {
  const half = new THREE.Vector3(37500, 5000, 25000);
  const geometry = flatGrid(half, 500);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, 400 * sin(x / 3000) + 300 * sin(z / 2000) + (x > 5000 ? 2000 : 0));
  }
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
