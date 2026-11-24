import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flatGrid } from './boneyard';
import { gridHeight, gridOf, levelHeight, STEPS, TILE, tiledGround, type GroundGrid } from './groundlod';
import { cos, hypot, sin } from '../detmath';
import { atlasU, ATLAS_HEIGHT, ATLAS_WIDTH, BARE_ROCK, COLUMN, drapeTriangle, dustPatches, FINE_DUST, GUTTER, layTraces, routeRoad, NEUTRAL, patchAt, PATCH_SIZE, sampleRepeat, ScrapeMarks, SCRAPE_KEEP, SCRAPE_TICK, SCRAPE_TRIANGLES, STRIDE, traceAtlas, traceChunks, TRACE_KINDS, type TraceKind, type TracePlan } from './traces';

/** A ground of 160 by 120 cells of 25 m, rolling hills, a steep scarp and a pit, as reliefGround lays it. */
const land = (x: number, z: number) => 300 * sin(x / 2600) + 250 * sin(z / 1900) + (x > 12000 ? 3000 : 0) - (hypot(x + 15000, z - 8000) < 3000 ? 800 : 0);
function ground() {
  const geometry = flatGrid(new THREE.Vector3(40000, 6000, 30000), 500);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, land(position.getX(i), position.getZ(i)));
  return { geometry, grid: gridOf(geometry, geometry.parameters.widthSegments, geometry.parameters.heightSegments) };
}

const KINDS = Object.keys(TRACE_KINDS) as TraceKind[];
/** A texel as the shader decodes it (t · 255 / 256 of the byte's share, see the trace material). */
const decoded = (texel: number) => texel / 256;

describe('the traces\' atlas, read back as the GPU reads it', () => {
  const atlas = traceAtlas();
  const texel = (i: number, j: number) => decoded(atlas[j * ATLAS_WIDTH + i]);

  it('leaves the ground as it is in every gutter and at a strip\'s sides', () => {
    expect(decoded(NEUTRAL)).toBe(0.5);
    for (const kind of KINDS) {
      const left = TRACE_KINDS[kind].column * COLUMN;
      for (let j = 0; j < ATLAS_HEIGHT; j++) {
        for (const i of [0, 1, COLUMN - 2, COLUMN - 1]) expect(texel(left + i, j)).toBe(0.5);
        // a blast ring's middle lies at its column's left: only its rim fades out
        if (kind !== 'blast') expect(Math.abs(texel(left + GUTTER, j) - 0.5)).toBeLessThan(0.02);
        expect(Math.abs(texel(left + COLUMN - GUTTER - 1, j) - 0.5)).toBeLessThan(0.02);
      }
    }
    // the columns no kind takes are neutral throughout
    for (let i = KINDS.length * COLUMN; i < ATLAS_WIDTH; i++) for (let j = 0; j < ATLAS_HEIGHT; j++) expect(texel(i, j)).toBe(0.5);
  });

  it('tiles along every strip without a seam', () => {
    for (const kind of KINDS) {
      const left = TRACE_KINDS[kind].column * COLUMN;
      let inner = 0;
      let seam = 0;
      for (let i = left + GUTTER; i < left + COLUMN - GUTTER; i++) {
        for (let j = 0; j + 1 < ATLAS_HEIGHT; j++) inner = Math.max(inner, Math.abs(texel(i, j + 1) - texel(i, j)));
        seam = Math.max(seam, Math.abs(texel(i, 0) - texel(i, ATLAS_HEIGHT - 1)));
      }
      expect(seam, kind).toBeLessThanOrEqual(inner + 1 / 256);
    }
  });

  it('shows every kind: pressed darker, pushed up brighter, never beyond what a print does', () => {
    for (const kind of KINDS) {
      const left = TRACE_KINDS[kind].column * COLUMN;
      let low = 1;
      let high = 0;
      for (let i = left; i < left + COLUMN; i++) {
        for (let j = 0; j < ATLAS_HEIGHT; j++) {
          low = Math.min(low, texel(i, j));
          high = Math.max(high, texel(i, j));
        }
      }
      expect(low, kind).toBeLessThan(0.45);
      expect(low, kind).toBeGreaterThan(0.2);
      expect(high, kind).toBeGreaterThan(0.53);
      expect(high, kind).toBeLessThan(0.75);
    }
  });

  it('presses four bootprints a tile, one foot after the other', () => {
    const left = TRACE_KINDS.boots.column * COLUMN;
    // each side of the line, the prints along it: runs of pressed texels
    for (const side of [0.36, 0.64]) {
      const i = Math.round(left + GUTTER + side * (COLUMN - 2 * GUTTER));
      let runs = 0;
      let inside = texel(i, ATLAS_HEIGHT - 1) < 0.44;
      for (let j = 0; j < ATLAS_HEIGHT; j++) {
        const pressed = texel(i, j) < 0.44;
        if (pressed && !inside) runs++;
        inside = pressed;
      }
      expect(runs).toBe(2);
    }
  });

  it('maps a strip across into its kind\'s column, inside its gutters', () => {
    for (const kind of KINDS) {
      const left = (TRACE_KINDS[kind].column * COLUMN + GUTTER) / ATLAS_WIDTH;
      const right = (TRACE_KINDS[kind].column * COLUMN + COLUMN - GUTTER) / ATLAS_WIDTH;
      expect(atlasU(kind, 0)).toBeCloseTo(left, 9);
      expect(atlasU(kind, 1)).toBeCloseTo(right, 9);
    }
  });
});

describe('the patches of fine dust and bare rock', () => {
  const data = dustPatches();

  it('tile without a seam, read with the GPU\'s linear filter and repeat', () => {
    let inner = 0;
    for (let j = 0; j < PATCH_SIZE; j++) for (let i = 0; i + 1 < PATCH_SIZE; i++) inner = Math.max(inner, Math.abs(data[j * PATCH_SIZE + i + 1] - data[j * PATCH_SIZE + i]), Math.abs(data[i * PATCH_SIZE + j] - data[(i + 1) * PATCH_SIZE + j]));
    for (let k = 0; k < PATCH_SIZE; k++) {
      expect(Math.abs(data[k * PATCH_SIZE] - data[k * PATCH_SIZE + PATCH_SIZE - 1])).toBeLessThanOrEqual(inner);
      expect(Math.abs(data[k] - data[(PATCH_SIZE - 1) * PATCH_SIZE + k])).toBeLessThanOrEqual(inner);
    }
    // a read straddling the wrap lies between the texels on either side
    const at = sampleRepeat(data, PATCH_SIZE, PATCH_SIZE, 0, 0.3);
    const left = data[Math.floor(0.3 * PATCH_SIZE) * PATCH_SIZE + PATCH_SIZE - 1] / 255;
    const right = data[Math.floor(0.3 * PATCH_SIZE) * PATCH_SIZE] / 255;
    expect(at).toBeGreaterThanOrEqual(Math.min(left, right) - 0.02);
    expect(at).toBeLessThanOrEqual(Math.max(left, right) + 0.02);
  });

  it('lay fine dust and bare rock side by side over a ground, each over a good share of it', () => {
    let fine = 0;
    let bare = 0;
    let count = 0;
    for (let x = -80000; x < 80000; x += 700) {
      for (let z = -80000; z < 80000; z += 700) {
        const p = patchAt(data, x, z);
        if (p > (FINE_DUST[0] + FINE_DUST[1]) / 2) fine++;
        if (p < (BARE_ROCK[0] + BARE_ROCK[1]) / 2) bare++;
        count++;
      }
    }
    expect(fine / count).toBeGreaterThan(0.08);
    expect(fine / count).toBeLessThan(0.45);
    expect(bare / count).toBeGreaterThan(0.08);
    expect(bare / count).toBeLessThan(0.45);
  });
});

describe('the traces on the ground', () => {
  it('reads the height a ground draws at a point, on its very faces, at every level of its tiles', () => {
    const { geometry, grid } = ground();
    const tiles = tiledGround(geometry, grid.nx, grid.nz, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    tiles.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (let level = 0; level < STEPS.length; level++) {
      // each tile drawn at this level alone, its skirts aside
      const drawn = (tiles.children as THREE.LOD[]).map((tile) => tile.levels[Math.min(level, tile.levels.length - 1)].object);
      for (let k = 0; k < 400; k++) {
        const x = -39000 + ((k * 7919) % 78000);
        const z = -29000 + ((k * 104729) % 58000);
        ray.set(new THREE.Vector3(x, 20000, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(drawn, false)[0];
        expect(hit).toBeDefined();
        expect(levelHeight(grid, level, x, z)).toBeCloseTo(hit.point.y, 1);
        if (level === 0) expect(gridHeight(grid, x, z)).toBeCloseTo(hit.point.y, 2);
      }
    }
  });

  it('cuts a triangle at every edge of the faces, so each piece lies flat in one face', () => {
    const { grid } = ground();
    const triangle = new Float64Array(3 * STRIDE);
    let pieces = 0;
    for (let k = 0; k < 300; k++) {
      const ax = -30000 + ((k * 3571) % 60000);
      const az = -20000 + ((k * 2903) % 40000);
      // from slivers inside a face to triangles across several cells
      const size = 50 + ((k * 37) % 2000);
      const corners = [ax, az, ax + size * cos(k), az + size * sin(k), ax + size * cos(k + 2), az + size * sin(k + 2.3)];
      for (let c = 0; c < 3; c++) triangle.set([corners[c * 2], corners[c * 2 + 1], c, 0, 1, 0], c * STRIDE);
      let covered = 0;
      drapeTriangle(grid, triangle, (piece, count) => {
        pieces++;
        const at = (i: number) => [piece[i * STRIDE], piece[i * STRIDE + 1]];
        for (let i = 1; i + 1 < count; i++) {
          const [p, q, r] = [at(0), at(i), at(i + 1)];
          covered += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
          // the ground between the corners is the plane through them: straight between the cuts
          for (const [u, v] of [[1 / 3, 1 / 3], [0.6, 0.2], [0.1, 0.8], [0.45, 0.45]]) {
            const x = p[0] + (q[0] - p[0]) * u + (r[0] - p[0]) * v;
            const z = p[1] + (q[1] - p[1]) * u + (r[1] - p[1]) * v;
            const h = (cx: number, cz: number) => gridHeight(grid, cx, cz);
            expect(h(x, z)).toBeCloseTo(h(p[0], p[1]) + (h(q[0], q[1]) - h(p[0], p[1])) * u + (h(r[0], r[1]) - h(p[0], p[1])) * v, 2);
          }
        }
      });
      // the pieces cover the triangle, no more and no less
      const whole = Math.abs((corners[2] - corners[0]) * (corners[5] - corners[1]) - (corners[4] - corners[0]) * (corners[3] - corners[1])) / 2;
      expect(covered).toBeCloseTo(whole, -1);
    }
    expect(pieces).toBeGreaterThan(600);
  });

  const plan: TracePlan = { seed: 4900, sites: [{ x: -20000, z: -5000, size: 900, busy: 0.8, pads: 2 }, { x: 5000, z: 15000, size: 600, busy: 0.3 }], ways: [{ kind: 'crawler', points: [-30000, -20000, 0, -20000], passes: 3 }] };

  it('lays every strip on the ground as drawn, inside its triangles too, at every level of its tile', () => {
    const { grid } = ground();
    const chunks = traceChunks(plan, grid, true);
    let sampled = 0;
    let worst = 0;
    let bent = 0;
    for (const chunk of chunks) {
      for (const geometry of [chunk.wide, chunk.fine]) {
        if (!geometry) continue;
        const position = geometry.getAttribute('position');
        const coarse = geometry.getAttribute('coarse');
        const index = geometry.getIndex()!;
        const trace = geometry.getAttribute('trace');
        for (let i = 0; i < trace.count; i++) {
          expect(trace.getX(i)).toBeGreaterThan(0);
          expect(trace.getX(i)).toBeLessThanOrEqual(1);
          expect(Math.abs(position.getX(i))).toBeLessThan(40000);
          expect(Math.abs(position.getZ(i))).toBeLessThan(30000);
        }
        for (let t = 0; t < index.count; t += 3) {
          const v = [0, 1, 2].map((k) => index.getX(t + k));
          // every piece lies in the chunk's own tile
          const middle = [0, 2].map((axis) => v.reduce((sum, i) => sum + position.getComponent(i, axis), 0) / 3);
          const tile = Math.floor((middle[1] - grid.z0) / grid.cellZ / TILE) * Math.ceil(grid.nx / TILE) + Math.floor((middle[0] - grid.x0) / grid.cellX / TILE);
          expect(tile).toBe(chunk.tile);
          for (const [a, b] of [[0, 0], [1 / 3, 1 / 3], [0.7, 0.2], [0.15, 0.7], [0.5, 0.5]]) {
            const mix = (get: (i: number) => number) => get(v[0]) + (get(v[1]) - get(v[0])) * a + (get(v[2]) - get(v[0])) * b;
            const x = mix((i) => position.getX(i));
            const z = mix((i) => position.getZ(i));
            const y = mix((i) => position.getY(i));
            expect(y).toBeCloseTo(gridHeight(grid, x, z), 2);
            for (let level = 1; level < STEPS.length; level++) {
              const off = mix((i) => coarse.getComponent(i, level - 1));
              const miss = Math.abs(y + off - levelHeight(grid, level, x, z));
              // a tile's last coarse cell, where its rows or columns run out, is not square: its faces bend across a finest face
              if (squareAt(grid, level, x, z)) expect(miss).toBeLessThan(0.01);
              else bent = Math.max(bent, miss);
              worst = Math.max(worst, squareAt(grid, level, x, z) ? miss : 0);
            }
            sampled++;
          }
        }
      }
    }
    expect(sampled).toBeGreaterThan(10000);
    expect(worst).toBeLessThan(0.01);
    // and there by no more than the lift towards the camera covers, 10 cm
    expect(bent).toBeLessThan(2);
  });

  it('lays the same traces every time, from the plan\'s seed', () => {
    const { grid } = ground();
    expect(JSON.stringify(layTraces(plan, grid))).toBe(JSON.stringify(layTraces(plan, grid)));
    expect(JSON.stringify(layTraces({ ...plan, seed: 4901 }, grid))).not.toBe(JSON.stringify(layTraces(plan, grid)));
  });

  it('keeps every trace off slopes too steep for it, and thick round its sites, thinning out', () => {
    const { grid } = ground();
    const { trails, rings } = layTraces(plan, grid);
    expect(rings.length).toBeGreaterThanOrEqual(3);
    const site = plan.sites[0];
    let near = 0;
    let far = 0;
    for (const { kind, points } of trails) {
      expect(points.length % 2).toBe(0);
      for (let i = 0; i + 3 < points.length; i += 2) {
        const run = hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1]);
        const rise = Math.abs(gridHeight(grid, points[i + 2], points[i + 3]) - gridHeight(grid, points[i], points[i + 1]));
        expect(rise).toBeLessThanOrEqual(TRACE_KINDS[kind].slope * run + 1e-6);
        const d = hypot(points[i] - site.x, points[i + 1] - site.z);
        if (d < 4000) near += run;
        else if (d > 8000 && d < 12000) far += run;
      }
    }
    // per area, the traces within 200 m of the site lie more than three times as thick as from 400 to 600 m out
    expect(near / (Math.PI * 4000 * 4000)).toBeGreaterThan((3 * far) / (Math.PI * (12000 * 12000 - 8000 * 8000)));
  });

  it('runs a road from every site to the nearest other, whichever site that one is nearest to', () => {
    const flat: GroundGrid = { x0: -40000, z0: -30000, cellX: 500, cellZ: 500, nx: 160, nz: 120, height: () => 0 };
    // the third site's nearest is the first, whose own nearest is the second
    const sites = [
      { x: 0, z: 0, size: 600, busy: 0.2 },
      { x: 4000, z: 0, size: 600, busy: 0.2 },
      { x: -20000, z: 0, size: 600, busy: 0.2 },
    ];
    const { trails } = layTraces({ seed: 4903, sites, wilds: 0, landings: 0 }, flat);
    const reaches = (from: (typeof sites)[number], to: (typeof sites)[number]) =>
      trails.some(({ kind, points }) => {
        if (kind === 'boots' || kind === 'slide') return false;
        const start = hypot(points[0] - from.x, points[1] - from.z);
        const end = hypot(points[points.length - 2] - to.x, points[points.length - 1] - to.z);
        return start < from.size + 100 && end < to.size + 1000;
      });
    expect(reaches(sites[0], sites[1])).toBe(true);
    expect(reaches(sites[2], sites[0])).toBe(true);
  });

  it('marks a world with nobody on it only far out: lone lines of prints and an old landing', () => {
    const { grid } = ground();
    const { trails, rings } = layTraces({ seed: 4902, sites: [], wilds: 3, landings: 1 }, grid);
    expect(rings.length).toBe(1);
    expect(trails.filter((trail) => trail.kind === 'boots').length).toBeGreaterThanOrEqual(3);
    expect(trails.every((trail) => trail.kind === 'boots' || trail.kind === 'rover')).toBe(true);
  });

  it('weathers only what nobody walks again: the same traces, faded far from the sites and kept fresh round them', () => {
    const { grid } = ground();
    const still = layTraces(plan, grid);
    const weathered = layTraces({ ...plan, weathering: 0.5 }, grid);
    expect(weathered.trails.length).toBe(still.trails.length);
    const site = plan.sites[0];
    for (let k = 0; k < still.trails.length; k++) {
      const [a, b] = [still.trails[k], weathered.trails[k]];
      expect(b.points).toEqual(a.points);
      const ratio = b.strength / a.strength;
      expect(ratio).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(ratio).toBeLessThanOrEqual(1 + 1e-9);
      if (hypot(a.points[0] - site.x, a.points[1] - site.z) < site.size) expect(ratio).toBeGreaterThan(0.99);
    }
    const lonely = layTraces({ seed: 4902, sites: [], wilds: 3, landings: 1, weathering: 0.6 }, grid);
    const fresh = layTraces({ seed: 4902, sites: [], wilds: 3, landings: 1 }, grid);
    lonely.trails.forEach((trail, k) => expect(trail.strength).toBeCloseTo(fresh.trails[k].strength * 0.4, 9));
  });
});

/** Whether the coarse cell of the level STEPS[`level`] at (x, z) is square, its diagonal running along the finest cells' (see world/groundlod, levelHeight). */
function squareAt(grid: GroundGrid, level: number, x: number, z: number): boolean {
  const step = STEPS[level];
  const side = (g: number, n: number) => {
    const first = Math.min(Math.floor(g / TILE), Math.ceil(n / TILE) - 1) * TILE;
    const last = Math.min(n, first + TILE);
    const from = first + Math.floor(Math.min(g - first, last - first - 1e-6) / step) * step;
    return Math.min(from + step, last) - from;
  };
  return side((x - grid.x0) / grid.cellX, grid.nx) === side((z - grid.z0) / grid.cellZ, grid.nz);
}

describe('a ship\'s scrape marks', () => {
  const up = new THREE.Vector3(0, 1, 0);
  const tick = SCRAPE_TICK + 0.01;
  /** The triangles laid, as their corners' laying times and counts. */
  const laid = (marks: ScrapeMarks) => {
    const age = marks.mesh.geometry.getAttribute('age');
    const out: { born: number; order: number }[] = [];
    for (let t = 0; t < SCRAPE_TRIANGLES; t++) if (age.getX(t * 3) > -1) out.push({ born: age.getX(t * 3), order: age.getY(t * 3) });
    return out;
  };

  it('lay a strip under the hull along its way, a stretch at most every tick, starting anew after a gap', () => {
    const marks = new ScrapeMarks();
    const position = marks.mesh.geometry.getAttribute('position');
    const ship = {};
    // a stretch every tick: two triangles each on a flat top
    for (let k = 0; k <= 10; k++) marks.add(ship, new THREE.Vector3(k * 100, 0, 0), up, k * tick, null);
    expect(laid(marks).length).toBe(20);
    // the first stretch 6 m across the way, flat on the ground
    const across = [0, 1, 2].map((k) => position.getZ(k));
    expect(Math.max(...across) - Math.min(...across)).toBeCloseTo(120, 6);
    for (let i = 0; i < 6; i++) expect(position.getY(i)).toBe(0);
    // steps quicker than a tick lay nothing more
    for (let k = 1; k <= 5; k++) marks.add(ship, new THREE.Vector3(1000 + k * 100, 0, 0), up, 10 * tick + k * 0.01, null);
    expect(laid(marks).length).toBe(20);
    // a second later the hull touches down elsewhere: no stretch bridges the gap
    marks.add(ship, new THREE.Vector3(5000, 0, 0), up, 13 * tick, null);
    marks.add(ship, new THREE.Vector3(5100, 0, 0), up, 14 * tick, null);
    let longest = 0;
    for (let t = 0; t < laid(marks).length; t++) {
      const xs = [0, 1, 2].map((k) => position.getX(t * 3 + k));
      longest = Math.max(longest, Math.max(...xs) - Math.min(...xs));
    }
    expect(longest).toBeLessThan(200);
  });

  it('lie on the ground as drawn, inside their triangles too', () => {
    const { geometry, grid } = ground();
    const marks = new ScrapeMarks();
    const position = marks.mesh.geometry.getAttribute('position');
    const drawn = { grid, toWorld: new THREE.Matrix4(), fromWorld: new THREE.Matrix4() };
    void geometry;
    const ship = {};
    for (let k = 0; k <= 200; k++) {
      const x = -30000 + k * 150;
      const z = 2000 * sin(k / 20);
      marks.add(ship, new THREE.Vector3(x, gridHeight(grid, x, z), z), up, k * tick, drawn);
    }
    const count = laid(marks).length;
    expect(count).toBeGreaterThan(400);
    for (let t = 0; t < count; t++) {
      const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, t * 3 + k));
      for (const [a, b] of [[1 / 3, 1 / 3], [0.7, 0.2], [0.1, 0.8]]) {
        const at = p[0].clone().addScaledVector(p[1].clone().sub(p[0]), a).addScaledVector(p[2].clone().sub(p[0]), b);
        expect(at.y).toBeCloseTo(gridHeight(grid, at.x, at.z), 2);
      }
    }
  });

  it('keep the last triangles, every one faded before its place is taken, and clear them for a new arena', () => {
    const { grid } = ground();
    const drawn = { grid, toWorld: new THREE.Matrix4(), fromWorld: new THREE.Matrix4() };
    const marks = new ScrapeMarks();
    const age = marks.mesh.geometry.getAttribute('age');
    const ships = [{}, {}, {}];
    let head = 0;
    for (let k = 0; k < 4000; k++) {
      const before = Float32Array.from(age.array as Float32Array);
      for (const [n, ship] of ships.entries()) {
        const x = -35000 + ((k * 400) % 70000);
        const z = -20000 + n * 15000 + 1000 * sin(k / 7);
        marks.add(ship, new THREE.Vector3(x, gridHeight(grid, x, z), z), up, k * tick, drawn);
      }
      for (let t = 0; t < SCRAPE_TRIANGLES; t++) {
        const [old, now] = [before[t * 6 + 1], age.getY(t * 3)];
        if (now !== old) {
          head = Math.max(head, now + 1);
          // what it took the place of had faded out: as many laid after it as fade a mark
          if (old > -1) expect(now - old).toBeGreaterThanOrEqual(SCRAPE_KEEP);
        }
      }
    }
    expect(head).toBeGreaterThan(2 * SCRAPE_TRIANGLES);
    marks.clear();
    expect(laid(marks).length).toBe(0);
    expect(marks.mesh.visible).toBe(false);
  });
});

describe('a road between two sites', () => {
  // a cliff 100 m high along x = 0, a ramp up it only where |z − 8 km| < 2 km (rise 0.15 a unit run)
  const ramped = (x: number, z: number) => (Math.abs(z - 160000) < 40000 ? Math.min(2000, Math.max(0, (x + 6667) * 0.15)) : x > 0 ? 2000 : 0);
  const sheer = (x: number) => (x > 0 ? 2000 : 0);
  const anywhere = () => true;
  const limit = TRACE_KINDS.rover.slope;

  it('goes round a cliff to its ramp and arrives, every stretch within the vehicle\'s slope', () => {
    const points = routeRoad(-100000, 0, 100000, 0, 2000, limit, anywhere, ramped);
    expect(points).not.toBeNull();
    const way = points!;
    expect(hypot(way[way.length - 2] - 100000, way[way.length - 1])).toBeLessThan(2000 + 400);
    expect(Math.max(...way.filter((_, i) => i % 2))).toBeGreaterThan(120000);
    for (let i = 2; i + 1 < way.length; i += 2) {
      const run = hypot(way[i] - way[i - 2], way[i + 1] - way[i - 1]);
      expect(Math.abs(ramped(way[i], way[i + 1]) - ramped(way[i - 2], way[i - 1]))).toBeLessThanOrEqual(limit * run + 1e-6);
    }
  });

  it('is never laid where no vehicle gets through: a road leading nowhere is no road', () => {
    expect(routeRoad(-100000, 0, 100000, 0, 2000, limit, anywhere, sheer)).toBeNull();
  });
});
