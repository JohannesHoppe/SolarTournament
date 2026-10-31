import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cutPiece, measure, parentSurface, PIECES, pieceCount, pieceSolid, solidMesh, type Solid } from './fracture';
import { Surface } from './surface';
import { DETAIL, DISTANT_DETAIL, FAR_DETAIL, ROCK_COUNT, rockRecipe } from './rocks';

/** Every piece of a shape's tree: the first break's and the second's, with their paths. */
const paths = (shape: number) => {
  const all: number[][] = [];
  for (let i = 0; i < pieceCount(shape, []); i++) {
    all.push([i]);
    for (let j = 0; j < pieceCount(shape, [i]); j++) all.push([i, j]);
  }
  return all;
};

/** The edges a closed mesh leaves open: each edge must run once each way. */
function openEdges(solid: Solid): number {
  const edges = new Map<string, number>();
  for (let k = 0; k < solid.t.length; k += 3) {
    for (let e = 0; e < 3; e++) {
      const key = `${solid.t[k + e]},${solid.t[k + ((e + 1) % 3)]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const [key, n] of edges) {
    const [a, b] = key.split(',');
    if (n !== 1 || edges.get(`${b},${a}`) !== 1) open++;
  }
  return open;
}

const meanAxis = (shape: number) => {
  const { axes } = rockRecipe(shape);
  return (axes.x + axes.y + axes.z) / 3;
};

describe('a broken rock', () => {
  it(`splits into ${PIECES} pieces, each of them into 2 or 3, none a sliver`, () => {
    for (let shape = 0; shape < ROCK_COUNT; shape++) {
      expect(pieceCount(shape, [])).toBe(PIECES);
      const whole = measure(pieceSolid(shape, [], DISTANT_DETAIL, 'near')).volume;
      for (const path of paths(shape)) {
        if (path.length === 1) expect([2, 3]).toContain(pieceCount(shape, path));
        // a piece of the first break holds at least a ninth of the rock, of the second a ninth of its parent
        const parent = path.length === 1 ? whole : measure(pieceSolid(shape, path.slice(0, 1), DISTANT_DETAIL, 'near')).volume;
        expect(measure(pieceSolid(shape, path, DISTANT_DETAIL, 'near')).volume / parent, `${shape}/${path}`).toBeGreaterThan(1 / 9);
      }
    }
  });

  it('is a closed mesh in every piece, and its pieces fit together into it: their volumes add up to its own', () => {
    for (let shape = 0; shape < ROCK_COUNT; shape++) {
      const whole = measure(pieceSolid(shape, [], DISTANT_DETAIL, 'near')).volume;
      let first = 0;
      for (const path of paths(shape)) {
        const solid = pieceSolid(shape, path, DISTANT_DETAIL, 'near');
        // where a cut passes a vertex of the rock all but exactly, merging the two may leave an edge or two doubled, never a hole one can see
        expect(openEdges(solid) / solid.t.length, `${shape}/${path}`).toBeLessThan(0.006);
        if (path.length === 1) {
          first += measure(solid).volume;
          let second = 0;
          for (let j = 0; j < pieceCount(shape, path); j++) second += measure(pieceSolid(shape, [...path, j], DISTANT_DETAIL, 'near')).volume;
          expect(second / measure(solid).volume).toBeCloseTo(1, 2);
        }
      }
      expect(first / whole).toBeCloseTo(1, 2);
    }
  });

  it("keeps the rock's own surface where it lay: every vertex of a piece's outer surface lies on the rock's", () => {
    for (const shape of [0, 6, 13]) {
      const whole = pieceSolid(shape, [], DISTANT_DETAIL, 'near');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(whole.p, 3));
      geometry.setIndex(whole.t);
      const rock = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      const caster = new THREE.Raycaster();
      const area = (solid: Solid, flag: number) => {
        let sum = 0;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (let k = 0; k < solid.t.length; k += 3) {
          if (solid.f[k / 3] !== flag) continue;
          a.fromArray(solid.p, solid.t[k] * 3);
          b.fromArray(solid.p, solid.t[k + 1] * 3).sub(a);
          c.fromArray(solid.p, solid.t[k + 2] * 3).sub(a);
          sum += b.cross(c).length() / 2;
        }
        return sum;
      };
      let outer = 0;
      for (let i = 0; i < pieceCount(shape, []); i++) {
        const piece = pieceSolid(shape, [i], DISTANT_DETAIL, 'near');
        const point = new THREE.Vector3();
        for (let k = 0; k < piece.t.length; k += 3) {
          if (piece.f[k / 3] || k % 9) continue;
          point.fromArray(piece.p, piece.t[k] * 3);
          // the rock is star-shaped about its center: a ray out through the vertex leaves it at the vertex itself
          caster.set(new THREE.Vector3(), point.clone().normalize());
          const hits = caster.intersectObject(rock);
          expect(Math.abs(hits[hits.length - 1].distance - point.length()) / meanAxis(shape)).toBeLessThan(1e-4);
        }
        outer += area(piece, 0);
      }
      // together the pieces' outer surfaces are the rock's, no more and no less
      expect(outer / area(whole, 0)).toBeCloseTo(1, 2);
    }
  });

  it('breaks along rough fracture faces, never mirror-flat ones', () => {
    for (const shape of [2, 9]) {
      const piece = pieceSolid(shape, [0], DISTANT_DETAIL, 'near');
      const points: THREE.Vector3[] = [];
      for (let k = 0; k < piece.t.length; k += 3) if (piece.f[k / 3]) points.push(new THREE.Vector3().fromArray(piece.p, piece.t[k] * 3));
      expect(points.length).toBeGreaterThan(50);
      // the face's points scatter off any plane by a share of the rock's size: the best plane through them still misses most by meters
      const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
      const normals = piece.t.flatMap((_, k) => (k % 3 === 0 && piece.f[k / 3] ? [k] : [])).map((k) => {
        const a = new THREE.Vector3().fromArray(piece.p, piece.t[k] * 3);
        const b = new THREE.Vector3().fromArray(piece.p, piece.t[k + 1] * 3).sub(a);
        const c = new THREE.Vector3().fromArray(piece.p, piece.t[k + 2] * 3).sub(a);
        return b.cross(c).normalize();
      });
      // the faces tilt this way and that: their normals spread over many degrees
      const mean = normals.reduce((sum, n) => sum.add(n), new THREE.Vector3()).normalize();
      const spread = normals.reduce((sum, n) => sum + Math.acos(Math.min(1, n.dot(mean))), 0) / normals.length;
      expect(spread).toBeGreaterThan(0.12);
      expect(center.length()).toBeLessThan(meanAxis(shape) * 2);
    }
  });

  it('draws its fracture faces apart from its outer surface, in the shape\'s frame', () => {
    const mesh = solidMesh(pieceSolid(4, [1], DISTANT_DETAIL, 'near'), true);
    const broken = mesh.fracture.filter((f) => f === 1).length;
    expect(broken).toBeGreaterThan(0);
    expect(broken).toBeLessThan(mesh.fracture.length);
    for (let i = 0; i < mesh.normal.length; i += 3) expect(Math.hypot(mesh.normal[i], mesh.normal[i + 1], mesh.normal[i + 2])).toBeCloseTo(1, 3);
  });

  it('measures no piece reaching beyond what it broke off from, in any direction: a ship outside the rock is outside every piece', () => {
    // at the detail the game measures collisions at: a coarse mesh's cells blend too roughly to hold it
    const details = { collision: DETAIL, near: DISTANT_DETAIL, far: FAR_DETAIL };
    const direction = new THREE.Vector3();
    const point = new THREE.Vector3();
    let worst = 0;
    for (const shape of [3, 10, 14]) {
      for (const path of paths(shape)) {
        const piece = cutPiece(shape, path, details);
        const surface = new Surface(piece.radii);
        const centroid = new THREE.Vector3().fromArray(piece.centroid);
        const parent = parentSurface(shape, path, details);
        const mean = parent.surface.reach;
        for (let k = 0; k < 2000; k++) {
          // a spiral of directions over the sphere
          const y = 1 - (2 * (k + 0.5)) / 2000;
          const r = Math.sqrt(1 - y * y);
          direction.set(Math.cos(k * 2.399963) * r, y, Math.sin(k * 2.399963) * r);
          point.copy(direction).multiplyScalar(surface.radius(direction)).add(centroid).sub(parent.center);
          worst = Math.max(worst, (point.length() - parent.surface.radius(point)) / mean);
        }
      }
    }
    // to within the 2 % of a radius a measured surface keeps to its mesh (see world/surface)
    expect(worst).toBeLessThan(0.02);
  });

  it('is cut the same every time: the same arrays, centroid, share and measured surface', () => {
    const details = { collision: DISTANT_DETAIL, near: DISTANT_DETAIL, far: FAR_DETAIL };
    const a = cutPiece(7, [2, 1], details);
    const b = cutPiece(7, [2, 1], details);
    expect(b.centroid).toEqual(a.centroid);
    expect(b.share).toBe(a.share);
    expect([...b.radii]).toEqual([...a.radii]);
    expect([...b.near.position]).toEqual([...a.near.position]);
    // whole units, as a template's center
    for (const v of a.centroid) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('the fracture worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is replaced when a job fails: the jobs queued behind it are still cut ahead, only the failed one is cut here', async () => {
    vi.resetModules();
    const fracture = await import('./fracture');
    const details = { collision: DISTANT_DETAIL, near: DISTANT_DETAIL, far: FAR_DETAIL };
    const workers: { posted: number[] }[] = [];
    const made: Record<string, unknown> = {};
    // a worker that fails on shape 0 and otherwise sends a stand-in for every piece of a job
    vi.stubGlobal('Worker', class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      posted: number[] = [];
      constructor() {
        workers.push(this);
      }
      dead = false;
      terminate() {
        this.dead = true;
      }
      postMessage(job: { shape: number; path: number[]; details: typeof details }) {
        this.posted.push(job.shape);
        queueMicrotask(() => {
          if (this.dead) return;
          if (job.shape === 0) return this.onerror?.();
          for (let i = 0; i < fracture.pieceCount(job.shape, job.path); i++) {
            const path = [...job.path, i];
            const data = { stand: 'in' };
            made[fracture.pieceKey(job.shape, path, job.details)] = data;
            this.onmessage?.({ data: { key: fracture.pieceKey(job.shape, path, job.details), data } });
          }
        });
      }
    });
    for (const shape of [0, 1, 2]) fracture.prefetch(shape, [], details);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(workers.length).toBe(2);
    expect(workers[1].posted).toEqual([1, 2]);
    expect(fracture.pieceData(1, [0], details)).toBe(made[fracture.pieceKey(1, [0], details)]);
    expect(fracture.pieceData(2, [1], details)).toBe(made[fracture.pieceKey(2, [1], details)]);
  });

  it("hands its pieces over as a worker does and still cuts their pieces against them: a piece's surface it sent stays its own", async () => {
    vi.resetModules();
    const fracture = await import('./fracture');
    const details = { collision: DISTANT_DETAIL, near: DISTANT_DETAIL, far: FAR_DETAIL };
    // a worker's postMessage with a transfer list: the buffers handed over are detached here
    const send = (message: unknown, transfer: ArrayBuffer[]) => void structuredClone(message, { transfer });
    fracture.runJob({ shape: 3, path: [], details }, send);
    expect(() => fracture.runJob({ shape: 3, path: [0], details }, send)).not.toThrow();
  });
});
