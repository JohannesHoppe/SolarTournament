import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flatGrid } from './boneyard';
import { gridHeight, gridOf } from './groundlod';
import { cos, hypot, sin } from '../detmath';
import { atlasU, ATLAS_HEIGHT, ATLAS_WIDTH, BARE_ROCK, COLUMN, crossings, dustPatches, FINE_DUST, GUTTER, layTraces, NEUTRAL, patchAt, PATCH_SIZE, sampleRepeat, ScrapeMarks, SCRAPES, traceAtlas, traceGeometries, TRACE_KINDS, type TraceKind, type TracePlan } from './traces';

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
  it('reads the height a ground draws at a point, on its very faces', () => {
    const { geometry, grid } = ground();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (let k = 0; k < 400; k++) {
      const x = -39000 + ((k * 7919) % 78000);
      const z = -29000 + ((k * 104729) % 58000);
      ray.set(new THREE.Vector3(x, 20000, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(gridHeight(grid, x, z)).toBeCloseTo(hit.point.y, 2);
    }
  });

  it('cuts a line wherever it crosses a face\'s edge, so the ground is straight between the cuts', () => {
    const { grid } = ground();
    for (let k = 0; k < 200; k++) {
      const ax = -30000 + ((k * 3571) % 60000);
      const az = -20000 + ((k * 2903) % 40000);
      const bx = ax + 3000 * cos(k);
      const bz = az + 3000 * sin(k);
      const ts = [0, ...crossings(grid, ax, az, bx, bz), 1];
      for (let i = 0; i + 1 < ts.length; i++) {
        const at = (t: number) => gridHeight(grid, ax + (bx - ax) * t, az + (bz - az) * t);
        const [t0, t1] = [ts[i], ts[i + 1]];
        for (const f of [0.25, 0.5, 0.75]) expect(at(t0 + (t1 - t0) * f)).toBeCloseTo(at(t0) + (at(t1) - at(t0)) * f, 3);
      }
    }
  });

  const plan: TracePlan = { seed: 4900, sites: [{ x: -20000, z: -5000, size: 900, busy: 0.8, pads: 2 }, { x: 5000, z: 15000, size: 600, busy: 0.3 }], ways: [{ kind: 'crawler', points: [-30000, -20000, 0, -20000], passes: 3 }] };

  it('lays every vertex of every strip on the ground as drawn, inside it', () => {
    const { grid } = ground();
    const { wide, fine } = traceGeometries(plan, grid);
    for (const geometry of [wide, fine]) {
      const position = geometry.getAttribute('position');
      expect(position.count).toBeGreaterThan(100);
      for (let i = 0; i < position.count; i++) {
        const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
        expect(y).toBeCloseTo(gridHeight(grid, x, z), 2);
        expect(Math.abs(x)).toBeLessThan(40000);
        expect(Math.abs(z)).toBeLessThan(30000);
      }
      const trace = geometry.getAttribute('trace');
      for (let i = 0; i < trace.count; i++) {
        expect(trace.getX(i)).toBeGreaterThan(0);
        expect(trace.getX(i)).toBeLessThanOrEqual(1);
      }
    }
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

  it('marks a world with nobody on it only far out: lone lines of prints and an old landing', () => {
    const { grid } = ground();
    const { trails, rings } = layTraces({ seed: 4902, sites: [], wilds: 3, landings: 1 }, grid);
    expect(rings.length).toBe(1);
    expect(trails.filter((trail) => trail.kind === 'boots').length).toBeGreaterThanOrEqual(3);
    expect(trails.every((trail) => trail.kind === 'boots' || trail.kind === 'rover')).toBe(true);
  });
});

describe('a ship\'s scrape marks', () => {
  const up = new THREE.Vector3(0, 1, 0);

  it('lay a strip under the hull along its way, starting anew after a gap', () => {
    const marks = new ScrapeMarks();
    const position = marks.mesh.geometry.getAttribute('position');
    const born = marks.mesh.geometry.getAttribute('born');
    const ship = {};
    for (let k = 0; k <= 10; k++) marks.add(ship, new THREE.Vector3(k * 100, 0, 0), up, k * 0.05);
    // ten segments, each 6 m across the way, flat on the ground
    let made = 0;
    for (let s = 0; s < SCRAPES; s++) if (born.getX(s * 4) > -1) made++;
    expect(made).toBe(10);
    expect(Math.abs(position.getZ(0) - position.getZ(1))).toBeCloseTo(120, 6);
    expect(position.getY(0)).toBe(0);
    // a second later the hull touches down elsewhere: no segment bridges the gap
    marks.add(ship, new THREE.Vector3(5000, 0, 0), up, 1.5);
    marks.add(ship, new THREE.Vector3(5100, 0, 0), up, 1.55);
    let longest = 0;
    for (let s = 0; s < SCRAPES; s++) longest = Math.max(longest, Math.abs(position.getX(s * 4 + 2) - position.getX(s * 4)));
    expect(longest).toBeLessThan(200);
  });

  it('keeps the last SCRAPES segments, the oldest overwritten first, and clears them for a new arena', () => {
    const marks = new ScrapeMarks();
    const born = marks.mesh.geometry.getAttribute('born');
    const ship = {};
    for (let k = 0; k <= SCRAPES + 20; k++) marks.add(ship, new THREE.Vector3(k * 50, 0, 0), up, k * 0.05);
    let oldest = Infinity;
    for (let s = 0; s < SCRAPES; s++) oldest = Math.min(oldest, born.getX(s * 4));
    expect(oldest).toBeCloseTo(21 * 0.05, 6);
    marks.clear();
    for (let s = 0; s < SCRAPES; s++) expect(born.getX(s * 4)).toBeLessThan(-1);
  });
});
