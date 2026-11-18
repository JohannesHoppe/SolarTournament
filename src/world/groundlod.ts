import * as THREE from 'three';

/**
 * A world's ground as it is drawn: its full grid cut into square tiles of TILE cells, each tile in
 * levels of detail that take every STEPS-th row and column of the grid, the level chosen each frame
 * by how far the tile's nearest point lies from the camera: the coarsest whose faces stray from the
 * full grid's points by no more than TOLERANCE pixels on a picture PICTURE pixels high (measured
 * square to the faces, so a steep face counts by how far it moves sideways). Up close a tile
 * draws every cell, exactly the triangles of the full grid; a tile out of view (of the camera, or
 * of the sun's shadow map) is not drawn at all. Where two tiles of different levels meet, a skirt
 * hanging down from each tile's edges closes the gap; the camera is always above the ground, so a
 * skirt is only ever seen through such a gap. Only the looks: the field collides with the relief
 * itself (see world/asteroids, Relief), never with this mesh.
 */
const TILE = 64;
/** The levels' steps: every cell of the grid, every second, every fourth, … */
const STEPS = [1, 2, 4, 8, 16];
/** How far (px) a coarser level may put the ground from where the full grid has it, on a picture PICTURE px high. */
export const TOLERANCE = 2;
const PICTURE = 1440;

/** The pixels a stray of `error` units shows at `distance` units from a camera with `projectionY` (its projection matrix's element 5) on a picture PICTURE px high. */
export function strayPixels(error: number, distance: number, projectionY: number): number {
  return (error * (PICTURE / 2) * projectionY) / Math.max(distance, 1e-6);
}
/** A skirt reaches this far (units, 1 m) below the widest gap it may have to close. */
const SKIRT_MARGIN = 20;

/** A tile's levels: it picks its own by the camera's distance to its box (see the comment above). */
class GroundTile extends THREE.LOD {
  /** The tile's box in its own frame. */
  readonly box = new THREE.Box3();
  /** How far each level's faces stray from the full grid at most (units), never less than a finer level's. */
  errors: number[] = [];
  private level = 0;

  private static readonly eye = new THREE.Vector3();
  private static readonly inverse = new THREE.Matrix4();

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive);
    this.box.copy(source.box);
    this.errors = source.errors;
    return this;
  }

  override update(camera: THREE.Camera) {
    const levels = this.levels;
    if (levels.length < 2) return;
    const { eye, inverse } = GroundTile;
    eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse.copy(this.matrixWorld).invert());
    const scale = this.matrixWorld.getMaxScaleOnAxis();
    const distance = this.box.distanceToPoint(eye) * scale;
    const projectionY = camera.projectionMatrix.elements[5];
    let level = 0;
    while (level + 1 < levels.length && strayPixels(this.errors[level + 1] * scale, distance, projectionY) <= TOLERANCE) level++;
    for (let i = 0; i < levels.length; i++) levels[i].object.visible = i === level;
    this.level = level;
  }

  override getCurrentLevel(): number {
    return this.level;
  }
}

/** The rows or columns a level of step `step` takes from `from` to `to`: every step-th, and always the last. */
function lines(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i += step) out.push(i);
  out.push(to);
  return out;
}

/** The cells of a tile: its column and row, and the grid's columns `x0` to `x1` and rows `z0` to `z1` it spans. */
interface TileSpan {
  tx: number;
  tz: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * How far each level of a tile strays from the full grid (see the comment above) over the whole
 * tile, never less than a finer level's, and how far straight up or down along the tile's edges
 * (`edge`, what a skirt has to close); `height` is the full grid's at a vertex, `cellX` and
 * `cellZ` its cells' size.
 */
function strays({ x0, x1, z0, z1 }: TileSpan, height: (ix: number, iz: number) => number, cellX: number, cellZ: number): { errors: number[]; edge: number } {
  const errors: number[] = [];
  let edge = 0;
  const tilt = (gx: number, gz: number) => 1 / Math.sqrt(1 + gx * gx + gz * gz);
  for (const step of STEPS) {
    const cols = lines(x0, x1, step);
    const rows = lines(z0, z1, step);
    let most = 0;
    for (let r = 0; r + 1 < rows.length; r++) {
      for (let c = 0; c + 1 < cols.length; c++) {
        const [ca, cb, ra, rb] = [cols[c], cols[c + 1], rows[r], rows[r + 1]];
        const ha = height(ca, ra);
        const hb = height(ca, rb);
        const hc = height(cb, rb);
        const hd = height(cb, ra);
        // each face's slope, for how far a point lies off its plane rather than above or below it
        const lower = tilt((hd - ha) / ((cb - ca) * cellX), (hb - ha) / ((rb - ra) * cellZ));
        const upper = tilt((hc - hb) / ((cb - ca) * cellX), (hc - hd) / ((rb - ra) * cellZ));
        for (let iz = ra; iz <= rb; iz++) {
          for (let ix = ca; ix <= cb; ix++) {
            const u = (ix - ca) / (cb - ca);
            const v = (iz - ra) / (rb - ra);
            // the two faces of the coarse cell, split as the full grid's are: (a, b, d) and (b, c, d)
            const first = u + v <= 1;
            const h = first ? ha + u * (hd - ha) + v * (hb - ha) : hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
            const off = Math.abs(height(ix, iz) - h);
            // a steep face is off the full grid mostly sideways: the distance to its plane is what shows
            most = Math.max(most, off * (first ? lower : upper));
            // a gap between two tiles opens straight down: the skirts close it by the height
            if (ix === x0 || ix === x1 || iz === z0 || iz === z1) edge = Math.max(edge, off);
          }
        }
      }
    }
    errors.push(Math.max(most, errors.length ? errors[errors.length - 1] : 0));
  }
  return { errors, edge };
}

/**
 * A grid laid out as world/boneyard's flatGrid lays it, as something to stand on: its first
 * vertex at (`x0`, `z0`), cells `cellX` by `cellZ`, `nx` by `nz` of them, `height` the grid's at a
 * vertex. `at` gives the height at any point as the finest level draws it (the cell's two faces
 * split as THREE.PlaneGeometry splits them, from (ix, iz) to (ix + 1, iz) and (ix, iz + 1)), held to
 * the grid's border; `cell` gives a point's place on the grid in cells, for finding where a line
 * crosses the faces' edges (the grid's lines and each cell's diagonal, along which ix + iz is whole).
 */
export interface GroundGrid {
  x0: number;
  z0: number;
  cellX: number;
  cellZ: number;
  nx: number;
  nz: number;
  height(ix: number, iz: number): number;
}

/** The height of `grid` at (x, z) as its finest level draws it (see GroundGrid). */
export function gridHeight(grid: GroundGrid, x: number, z: number): number {
  const gx = Math.min(grid.nx, Math.max(0, (x - grid.x0) / grid.cellX));
  const gz = Math.min(grid.nz, Math.max(0, (z - grid.z0) / grid.cellZ));
  const ix = Math.min(grid.nx - 1, Math.floor(gx));
  const iz = Math.min(grid.nz - 1, Math.floor(gz));
  const u = gx - ix;
  const v = gz - iz;
  const hb = grid.height(ix, iz + 1);
  const hd = grid.height(ix + 1, iz);
  // the faces (a, b, d) and (b, c, d), as the grid's index and the levels' errors take them
  if (u + v <= 1) {
    const ha = grid.height(ix, iz);
    return ha + u * (hd - ha) + v * (hb - ha);
  }
  const hc = grid.height(ix + 1, iz + 1);
  return hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
}

/** The grid of a flatGrid geometry `full` of `nx` by `nz` cells, its heights its vertices' y. */
export function gridOf(full: THREE.BufferGeometry, nx: number, nz: number): GroundGrid {
  const position = full.getAttribute('position');
  return {
    x0: position.getX(0),
    z0: position.getZ(0),
    cellX: position.getX(1) - position.getX(0),
    cellZ: position.getZ(nx + 1) - position.getZ(0),
    nx,
    nz,
    height: (ix, iz) => position.getY(ix + iz * (nx + 1)),
  };
}

/**
 * The ground of `full`, a grid of `nx` by `nz` cells laid out as world/boneyard's flatGrid lays it
 * (a vertex `ix + iz * (nx + 1)`, its faces wound as THREE.PlaneGeometry winds them), in tiles of
 * levels drawn with `material` (see the comment above). Each tile's vertices are the full grid's
 * with all their attributes, so its finest level is the full grid's very faces, lit alike.
 */
export function tiledGround(full: THREE.BufferGeometry, nx: number, nz: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const position = full.getAttribute('position');
  const height = (ix: number, iz: number) => position.getY(ix + iz * (nx + 1));
  const cellX = position.getX(1) - position.getX(0);
  const cellZ = position.getZ(nx + 1) - position.getZ(0);
  const tilesX = Math.ceil(nx / TILE);
  const tilesZ = Math.ceil(nz / TILE);
  const tiles: TileSpan[] = [];
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) tiles.push({ tx, tz, x0: tx * TILE, x1: Math.min(nx, (tx + 1) * TILE), z0: tz * TILE, z1: Math.min(nz, (tz + 1) * TILE) });
  }
  const measured = tiles.map((tile) => strays(tile, height, cellX, cellZ));
  const names = Object.keys(full.attributes);

  for (const { tx, tz, x0, x1, z0, z1 } of tiles) {
    const w = x1 - x0 + 1;
    const d = z1 - z0 + 1;
    // the gap a skirt may have to close: this tile's edges and its neighbours' strayed apart
    let neighbours = 0;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nxt = tx + ox;
      const nzt = tz + oz;
      if (nxt >= 0 && nxt < tilesX && nzt >= 0 && nzt < tilesZ) neighbours = Math.max(neighbours, measured[nzt * tilesX + nxt].edge);
    }
    const drop = measured[tz * tilesX + tx].edge + neighbours + SKIRT_MARGIN;
    // the skirts hang from the edges inside the ground, never from its outer border
    const edges: [number, number][][] = [];
    if (z0 > 0) edges.push(Array.from({ length: w }, (_, i) => [x0 + i, z0]));
    if (z1 < nz) edges.push(Array.from({ length: w }, (_, i) => [x0 + i, z1]));
    if (x0 > 0) edges.push(Array.from({ length: d }, (_, i) => [x0, z0 + i]));
    if (x1 < nx) edges.push(Array.from({ length: d }, (_, i) => [x1, z0 + i]));
    const count = w * d + edges.reduce((sum, edge) => sum + edge.length, 0);

    // the tile's vertices: the grid's, then each skirt's lowered copies of its edge
    const sources: number[] = [];
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) sources.push(ix + iz * (nx + 1));
    for (const edge of edges) for (const [ix, iz] of edge) sources.push(ix + iz * (nx + 1));
    const geometry = new THREE.BufferGeometry();
    for (const name of names) {
      const from = full.getAttribute(name) as THREE.BufferAttribute;
      const size = from.itemSize;
      const array = new Float32Array(count * size);
      sources.forEach((s, i) => {
        for (let k = 0; k < size; k++) array[i * size + k] = from.array[s * size + k];
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    const tilePosition = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = w * d; i < count; i++) tilePosition.setY(i, tilePosition.getY(i) - drop);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const local = (ix: number, iz: number) => ix - x0 + (iz - z0) * w;
    const lod = new GroundTile();
    lod.box.copy(geometry.boundingBox!);
    STEPS.forEach((step, level) => {
      const cols = lines(x0, x1, step);
      const rows = lines(z0, z1, step);
      // a level no coarser than the one before (a tile narrower than the step) adds nothing
      if (level > 0 && cols.length === lines(x0, x1, STEPS[level - 1]).length && rows.length === lines(z0, z1, STEPS[level - 1]).length) return;
      const index: number[] = [];
      for (let r = 0; r + 1 < rows.length; r++) {
        for (let c = 0; c + 1 < cols.length; c++) {
          const a = local(cols[c], rows[r]);
          const b = local(cols[c], rows[r + 1]);
          const cc = local(cols[c + 1], rows[r + 1]);
          const dd = local(cols[c + 1], rows[r]);
          index.push(a, b, dd, b, cc, dd);
        }
      }
      // the skirts at this level's points along each edge, facing both ways
      let base = w * d;
      for (const edge of edges) {
        const horizontal = edge[0][1] === edge[edge.length - 1][1];
        const picks = horizontal ? cols.map((ix) => ix - x0) : rows.map((iz) => iz - z0);
        for (let p = 0; p + 1 < picks.length; p++) {
          const [a, b] = [edge[picks[p]], edge[picks[p + 1]]];
          const top0 = local(a[0], a[1]);
          const top1 = local(b[0], b[1]);
          const low0 = base + picks[p];
          const low1 = base + picks[p + 1];
          index.push(top0, top1, low1, top0, low1, low0, top0, low1, top1, top0, low0, low1);
        }
        base += edge.length;
      }
      const levelGeometry = new THREE.BufferGeometry();
      for (const name of names) levelGeometry.setAttribute(name, geometry.getAttribute(name));
      levelGeometry.setIndex(index);
      levelGeometry.boundingBox = geometry.boundingBox;
      levelGeometry.boundingSphere = geometry.boundingSphere;
      lod.addLevel(new THREE.Mesh(levelGeometry, material), level);
    });
    // the levels a narrow tile leaves out are its coarsest: their errors go with them
    lod.errors = measured[tz * tilesX + tx].errors.slice(0, lod.levels.length);
    group.add(lod);
  }
  return group;
}
