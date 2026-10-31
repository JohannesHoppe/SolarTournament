import * as THREE from 'three';
import { Randomizer } from '../random';
import { Noise, rockGeometry, rockRecipe } from './rocks';
import { measureRadii, Surface } from './surface';

/**
 * How a rock shape breaks: every shape (rock and ice share them) has a fixed tree of pieces, cut
 * from its own mesh, so the pieces of a broken rock are the rock itself split apart. The first
 * break splits it into PIECES cells around seeded points (a Voronoi split), the second splits each
 * of those again into 2 or 3. A cut between two cells is a rough surface: the plane halfway
 * between their points, made uneven by noise across it (see Cut), so a fracture face is never
 * mirror-flat. A piece is a closed mesh: the parent's outer surface where it lay (the parent's
 * very triangles, clipped where the cut crosses them) and the fresh fracture faces, the same rough
 * surface on both sides of a cut, so the pieces fit together into the parent. Everything is
 * plain arithmetic on the shapes' own vertices with seeded randomness and integer-hashed noise,
 * so every browser cuts the same pieces, measures the same surfaces and starts them in the same
 * places. Pieces are cut when a rock of their shape first breaks and kept (see FractureSet).
 */

/** Pieces a whole rock breaks into. */
export const PIECES = 3;
/** Pieces a piece of the first break breaks into: 2 or 3, by the piece's seed. */
const SUBPIECES: [number, number] = [2, 3];
/** Fixed seed of the fracture trees: every browser splits every shape alike. */
const FRACTURE_SEED = 7331;
/**
 * The smallest share of its parent's volume a piece may have (the cells' points are drawn again
 * until every piece has it, at most PLAN_TRIES times): no sliver breaks off as a piece of its own.
 */
const MIN_SHARE = 0.55;
const PLAN_TRIES = 16;
/**
 * How uneven a fracture face is: the noise lifts it by up to this share of the shape's mean
 * semi-axis off the plane between two cells (about 5 m on the template, 12 to 33 m on a rock of the Belt), in waves
 * of about a third of the rock across (WAVES per mean semi-axis), with smaller, sharper ridges on top (see Cut).
 */
const ROUGHNESS = 0.1;
const WAVES = 2.6;
/**
 * The longest edge of a fracture face's triangles, a share of the shape's mean semi-axis: fine
 * for the surface the collisions measure (see world/surface), coarser for the meshes drawn near
 * and far, coarser yet for the probe that plans the tree.
 */
const SPACING = { collision: 0.05, near: 0.1, far: 0.24, probe: 0.3 } as const;
/** The detail (icosahedron subdivisions, see world/rocks) of the mesh a tree is planned on: coarse, as it only weighs the pieces' volumes. */
const PROBE_DETAIL = 4;

/** A cut between two cells: the surface where `side` is zero, its normal from the first cell's point towards the second's. */
interface Cut {
  normal: THREE.Vector3;
  /** Two directions across the normal, the frame the noise lies in. */
  u: THREE.Vector3;
  w: THREE.Vector3;
  /** The plane's distance from the shape's center along the normal. */
  offset: number;
  noise: Noise;
  amplitude: number;
  frequency: number;
}

/** How far a point (shape units) lies on the second cell's side of a cut: positive there, negative on the first's. */
function side(cut: Cut, x: number, y: number, z: number): number {
  const n = cut.normal, u = cut.u, w = cut.w;
  return n.x * x + n.y * y + n.z * z - cut.offset - lift(cut, u.x * x + u.y * y + u.z * z, w.x * x + w.y * y + w.z * z);
}

/** How far the fracture surface lies off the cut's plane at a point of it (its coordinates along u and w): broad waves, and sharper ridges on them. */
function lift(cut: Cut, a: number, b: number): number {
  const f = cut.frequency;
  return cut.amplitude * (0.75 * cut.noise.fractal(a * f, b * f, 0.37, 3) + 0.25 * cut.noise.fractal(a * f * 2.7 + 5.1, b * f * 2.7 - 3.3, 7.77, 2, true));
}

/** A closed triangle mesh in a shape's frame: positions (xyz), triangles (three vertex indices each, counterclockwise from outside), and per triangle 1 for a fracture face, 0 for the parent's outer surface. */
export interface Solid {
  p: number[];
  t: number[];
  f: number[];
}

/** The whole shape at a detail, as a solid of shared vertices. */
function shapeSolid(index: number, detail: number): Solid {
  const geometry = rockGeometry(index, detail, false);
  const position = geometry.attributes.position;
  const p: number[] = [];
  for (let i = 0; i < position.count; i++) p.push(position.getX(i), position.getY(i), position.getZ(i));
  const t = Array.from(geometry.index!.array);
  return { p, t, f: new Array(t.length / 3).fill(0) };
}

/**
 * The part of a solid on one side of a cut (`keep` 1: the first cell's, −1: the second's),
 * closed by a fracture face: triangles across the cut are clipped where the rough surface crosses
 * their edges (each crossing found once per edge, so neighbours share it and the mesh stays
 * closed), and the loops the clipped edges leave are filled with the rough surface itself,
 * triangulated with points no farther apart than `spacing`.
 */
export function clip(solid: Solid, cut: Cut, keep: 1 | -1, spacing: number): Solid {
  const { p: source, t: triangles, f: flags } = solid;
  const count = source.length / 3;
  const value = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const v = keep * side(cut, source[i * 3], source[i * 3 + 1], source[i * 3 + 2]);
    // a vertex exactly on the surface counts as beyond it, so every edge crosses at most once
    value[i] = v === 0 ? 1e-9 : v;
  }
  const p = source.slice();
  const t: number[] = [];
  const f: number[] = [];
  const crossings = new Map<number, number>();
  const crossing = (a: number, b: number): number => {
    const key = a < b ? a * count + b : b * count + a;
    const known = crossings.get(key);
    if (known !== undefined) return known;
    // between the vertex inside (a) and the one outside (b), narrowed down on the true surface
    const i = a < b ? a : b, o = a < b ? b : a;
    let lo = 0, hi = 1, vlo = value[i], vhi = value[o];
    let s = vlo / (vlo - vhi);
    for (let k = 0; k < 10; k++) {
      const x = source[i * 3] + (source[o * 3] - source[i * 3]) * s;
      const y = source[i * 3 + 1] + (source[o * 3 + 1] - source[i * 3 + 1]) * s;
      const z = source[i * 3 + 2] + (source[o * 3 + 2] - source[i * 3 + 2]) * s;
      const v = keep * side(cut, x, y, z);
      if (v < 0 === vlo < 0) {
        lo = s;
        vlo = v;
      } else {
        hi = s;
        vhi = v;
      }
      // the secant's guess, kept within the bracket so it never strays
      s = lo + ((hi - lo) * vlo) / (vlo - vhi);
      if (!(s > lo && s < hi)) s = (lo + hi) / 2;
    }
    const index = p.length / 3;
    for (let c = 0; c < 3; c++) p.push(source[i * 3 + c] + (source[o * 3 + c] - source[i * 3 + c]) * s);
    crossings.set(key, index);
    return index;
  };
  /** The edges the clipping leaves open, as the kept triangles run along them. */
  const open: number[] = [];
  for (let k = 0; k < triangles.length; k += 3) {
    const v = [triangles[k], triangles[k + 1], triangles[k + 2]];
    const inside = v.map((i) => value[i] < 0);
    const kept = inside.filter(Boolean).length;
    const flag = flags[k / 3];
    if (kept === 3) {
      t.push(v[0], v[1], v[2]);
      f.push(flag);
      continue;
    }
    if (kept === 0) continue;
    // turned so that the odd one out comes first
    const odd = kept === 1 ? inside.indexOf(true) : inside.indexOf(false);
    const a = v[odd], b = v[(odd + 1) % 3], c = v[(odd + 2) % 3];
    if (kept === 1) {
      const ab = crossing(a, b), ca = crossing(c, a);
      t.push(a, ab, ca);
      f.push(flag);
      open.push(ab, ca);
    } else {
      const ab = crossing(a, b), ca = crossing(c, a);
      t.push(b, c, ca, b, ca, ab);
      f.push(flag, flag);
      open.push(ca, ab);
    }
  }
  const result = weld({ p, t, f }, open, spacing * WELD);
  cap(result, open, cut, keep, spacing);
  return compact(result);
}

/** How close (a share of the fracture faces' spacing) two vertices are merged into one: where a cut passes a vertex of the parent's mesh, it crosses the edges around it all but at the vertex itself, and the loop it leaves would crumple into steps too small to fill. */
const WELD = 0.02;

/**
 * Merges every vertex within `reach` of an earlier one into it (found on a grid of that size,
 * in the order of the vertices, so every browser merges alike), drops the triangles that
 * collapse, and renames the open edges alike, dropping those that collapse.
 */
function weld(solid: Solid, open: number[], reach: number): Solid {
  const { p, t, f } = solid;
  const count = p.length / 3;
  const into = new Int32Array(count);
  const grid = new Map<number, number[]>();
  const cellKey = (x: number, y: number, z: number) => ((x + 65536) * 131072 + y + 65536) * 131072 + z + 65536;
  const cellOf = (v: number) => Math.floor(v / reach);
  for (let i = 0; i < count; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const cx = cellOf(x), cy = cellOf(y), cz = cellOf(z);
    into[i] = i;
    search: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
            const ex = p[j * 3] - x, ey = p[j * 3 + 1] - y, ez = p[j * 3 + 2] - z;
            if (ex * ex + ey * ey + ez * ez < reach * reach) {
              into[i] = j;
              break search;
            }
          }
        }
      }
    }
    if (into[i] !== i) continue;
    const key = cellKey(cx, cy, cz);
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  }
  const triangles: number[] = [];
  const flags: number[] = [];
  for (let k = 0; k < t.length; k += 3) {
    const a = into[t[k]], b = into[t[k + 1]], c = into[t[k + 2]];
    if (a === b || b === c || c === a) continue;
    triangles.push(a, b, c);
    flags.push(f[k / 3]);
  }
  let kept = 0;
  for (let k = 0; k < open.length; k += 2) {
    const a = into[open[k]], b = into[open[k + 1]];
    if (a === b) continue;
    open[kept++] = a;
    open[kept++] = b;
  }
  open.length = kept;
  return { p, t: triangles, f: flags };
}

/** Drops the vertices no triangle uses any more. */
function compact(solid: Solid): Solid {
  const used = new Int32Array(solid.p.length / 3).fill(-1);
  const p: number[] = [];
  const t = solid.t.map((i) => {
    if (used[i] < 0) {
      used[i] = p.length / 3;
      p.push(solid.p[i * 3], solid.p[i * 3 + 1], solid.p[i * 3 + 2]);
    }
    return used[i];
  });
  return { p, t, f: solid.f };
}

/**
 * Fills the loops of open edges (`open`: pairs, as the kept triangles run along them) with the
 * cut's rough surface: each loop in the cut's plane (its coordinates across the face's outward
 * normal), the outer loops with their holes triangulated, the triangles refined until no edge
 * inside is longer than `spacing` (and kept Delaunay, so none is a sliver that need not be), every
 * new point lifted onto the rough surface. The loop's own points stay as the clipping found
 * them, on the parent's triangles' edges, so the face meets the outer surface without a gap.
 */
function cap(solid: Solid, open: number[], cut: Cut, keep: 1 | -1, spacing: number) {
  const { p } = solid;
  // the face looks out along the normal on the first cell's side, against it on the second's
  const e1 = keep > 0 ? cut.u : cut.w, e2 = keep > 0 ? cut.w : cut.u;
  const next = new Map<number, number[]>();
  // the face runs along each open edge the other way round
  for (let k = 0; k < open.length; k += 2) {
    const list = next.get(open[k + 1]);
    if (list) list.push(open[k]);
    else next.set(open[k + 1], [open[k]]);
  }
  // walked edge by edge; where the walk comes back to a point it passed (two loops touching
  // there, as merged points may make them), the stretch since then is a loop of its own, so
  // every loop is simple
  const loops: number[][] = [];
  for (const start of [...next.keys()]) {
    const path: number[] = [];
    const index = new Map<number, number>();
    let at = start;
    for (;;) {
      const seen = index.get(at);
      if (seen !== undefined) {
        const loop = path.splice(seen);
        for (const v of loop) index.delete(v);
        // two edges back and forth enclose nothing
        if (loop.length >= 3) loops.push(loop);
      }
      const list = next.get(at);
      if (!list?.length) break;
      index.set(at, path.length);
      path.push(at);
      at = list.shift()!;
    }
  }
  const flat = (i: number) => new THREE.Vector2(p[i * 3] * e1.x + p[i * 3 + 1] * e1.y + p[i * 3 + 2] * e1.z, p[i * 3] * e2.x + p[i * 3 + 1] * e2.y + p[i * 3 + 2] * e2.z);
  const shapes = loops.map((loop) => {
    const points = loop.map(flat);
    return { loop, points, area: THREE.ShapeUtils.area(points), holes: [] as { loop: number[]; points: THREE.Vector2[] }[] };
  });
  const outer = shapes.filter((s) => s.area > 0).sort((a, b) => a.area - b.area);
  for (const hole of shapes.filter((s) => s.area <= 0)) {
    // within the smallest outer loop around it
    const around = outer.find((s) => insidePolygon(hole.points[0], s.points));
    // a hole in no outer loop is a tangle of the outline: filled on its own
    if (around) around.holes.push(hole);
    else outer.push({ ...hole, holes: [] });
  }
  for (const shape of outer) {
    const ids = [shape.loop, ...shape.holes.map((h) => h.loop)].flat();
    const faces = THREE.ShapeUtils.triangulateShape(
      shape.points.slice(),
      shape.holes.map((h) => h.points.slice()),
    );
    const points = [shape.points, ...shape.holes.map((h) => h.points)].flat();
    const rims = new Set<number>();
    const rim = (loop: number[], base: number) => loop.forEach((_, k) => rims.add(edgeKey(base + k, base + ((k + 1) % loop.length))));
    let base = 0;
    for (const loop of [shape.loop, ...shape.holes.map((h) => h.loop)]) {
      rim(loop, base);
      base += loop.length;
    }
    // counterclockwise, as the loops run (the triangulation turns them all one way)
    let area = 0;
    for (const [a, b, c] of faces) area += orient(points[a], points[b], points[c]);
    if (area < 0) for (const tri of faces) tri.reverse();
    // a polygon of n points and h holes takes n + 2h − 2 triangles, all turned alike; fewer, or one turned over, and its outline crosses itself
    const simple = shape.area > 0 && faces.length === points.length + 2 * shape.holes.length - 2 && faces.every(([a, b, c]) => orient(points[a], points[b], points[c]) > 0);
    const mesh = simple ? refine(points, faces, rims, spacing) : fan(points, [shape.loop, ...shape.holes.map((h) => h.loop)].map((l) => l.length));
    // the points the refinement added, lifted onto the rough surface
    for (let k = ids.length; k < mesh.points.length; k++) {
      const { x, y } = mesh.points[k];
      const a = keep > 0 ? x : y, b = keep > 0 ? y : x;
      const height = cut.offset + lift(cut, a, b);
      ids.push(p.length / 3);
      p.push(e1.x * x + e2.x * y + cut.normal.x * height, e1.y * x + e2.y * y + cut.normal.y * height, e1.z * x + e2.z * y + cut.normal.z * height);
    }
    for (const [a, b, c] of mesh.triangles) {
      solid.t.push(ids[a], ids[b], ids[c]);
      solid.f.push(1);
    }
  }
}

/** Rings a fan (see fan) lays inside its loop. */
const FAN_RINGS = 3;

/**
 * Fills loops whose outline crosses itself, where no triangulation of the polygon exists (a cut
 * grazing an earlier fracture face, rarely): each loop on its own, in rings shrinking towards its
 * middle and a fan around that. Where the outline crosses itself the triangles overlap a little,
 * but every edge of the loop gets its triangle, so the piece stays closed. `loops` are the
 * lengths of the loops, one after the other in `source`. Returns the points (the loops' first)
 * and the triangles, as refine does.
 */
function fan(source: THREE.Vector2[], loops: number[]) {
  const points = source.slice();
  const triangles: number[][] = [];
  let base = 0;
  for (const n of loops) {
    const middle = new THREE.Vector2();
    for (let k = 0; k < n; k++) middle.add(points[base + k]);
    middle.divideScalar(n);
    let ring = Array.from({ length: n }, (_, k) => base + k);
    for (let r = 1; r < FAN_RINGS; r++) {
      const share = 1 - r / FAN_RINGS;
      const inner = ring.map((_, k) => {
        points.push(source[base + k].clone().sub(middle).multiplyScalar(share).add(middle));
        return points.length - 1;
      });
      for (let k = 0; k < n; k++) {
        const a = ring[k], b = ring[(k + 1) % n], c = inner[(k + 1) % n], d = inner[k];
        triangles.push([a, b, c], [a, c, d]);
      }
      ring = inner;
    }
    points.push(middle);
    const center = points.length - 1;
    for (let k = 0; k < n; k++) triangles.push([ring[k], ring[(k + 1) % n], center]);
    base += n;
  }
  return { points, triangles };
}

/** Whether a point lies inside a polygon (even-odd rule). */
function insidePolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const edgeKey = (a: number, b: number) => (a < b ? a * 1048576 + b : b * 1048576 + a);
const orient = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Whether `d` lies inside the circle through the counterclockwise triangle a, b, c. */
function inCircle(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): boolean {
  const ax = a.x - d.x, ay = a.y - d.y, bx = b.x - d.x, by = b.y - d.y, cx = c.x - d.x, cy = c.y - d.y;
  const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
  return det > 1e-9 * (ax * ax + ay * ay + bx * bx + by * by + cx * cx + cy * cy) ** 2;
}

/** How often the refinement splits every edge that is still too long, at most. */
const REFINE_PASSES = 24;

/**
 * A polygon's triangulation, counterclockwise, refined: every edge inside longer than `spacing`
 * split at its middle, the longest first, and edges flipped after every split until every pair
 * of triangles is Delaunay again, so no triangle is a sliver that need not be; the edges of
 * `rims` (the polygon's own) are never split or flipped. Returns the points (the polygon's
 * first, in order) and the triangles.
 */
function refine(source: THREE.Vector2[], faces: number[][], rims: Set<number>, spacing: number) {
  const points = source.slice();
  const triangles: number[][] = [];
  const edges = new Map<number, number[]>();
  const place = (k: number, tri: number[]) => {
    triangles[k] = tri;
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(tri[e], tri[(e + 1) % 3]);
      const list = edges.get(key);
      if (list) list.push(k);
      else edges.set(key, [k]);
    }
  };
  const unplace = (k: number) => {
    const tri = triangles[k];
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(tri[e], tri[(e + 1) % 3]);
      const list = edges.get(key)!;
      list.splice(list.indexOf(k), 1);
      if (!list.length) edges.delete(key);
    }
  };
  faces.forEach((tri, k) => place(k, tri));
  /** The third point of triangle k if it runs a → b, else −1. */
  const corner = (k: number, a: number, b: number) => {
    const tri = triangles[k];
    const at = tri.indexOf(a);
    return tri[(at + 1) % 3] === b ? tri[(at + 2) % 3] : -1;
  };
  /** The two triangles on an edge inside, the one running a → b first, with their third points; null on a rim. */
  const across = (a: number, b: number) => {
    const key = edgeKey(a, b);
    const list = edges.get(key);
    if (!list || list.length !== 2 || rims.has(key)) return null;
    let [k1, k2] = list;
    if (corner(k1, a, b) < 0) [k1, k2] = [k2, k1];
    const c = corner(k1, a, b), d = corner(k2, b, a);
    return c < 0 || d < 0 ? null : { k1, k2, c, d };
  };
  const legalize = (stack: number[]) => {
    for (let guard = 0; stack.length && guard < 100000; guard++) {
      const b = stack.pop()!, a = stack.pop()!;
      const pair = across(a, b);
      if (!pair) continue;
      const { k1, k2, c, d } = pair;
      if (!inCircle(points[a], points[b], points[c], points[d])) continue;
      if (orient(points[a], points[d], points[c]) <= 0 || orient(points[d], points[b], points[c]) <= 0) continue;
      unplace(k1);
      unplace(k2);
      place(k1, [a, d, c]);
      place(k2, [d, b, c]);
      stack.push(a, d, d, b, b, c, c, a);
    }
  };
  const all: number[] = [];
  for (const key of edges.keys()) all.push(Math.floor(key / 1048576), key % 1048576);
  legalize(all);
  const limit = spacing * spacing;
  const length = (key: number) => points[Math.floor(key / 1048576)].distanceToSquared(points[key % 1048576]);
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    const long = [...edges.keys()].filter((key) => !rims.has(key) && edges.get(key)!.length === 2 && length(key) > limit);
    if (!long.length) break;
    long.sort((x, y) => length(y) - length(x) || x - y);
    for (const key of long) {
      if (!edges.has(key) || length(key) <= limit) continue;
      const a = Math.floor(key / 1048576), b = key % 1048576;
      const pair = across(a, b);
      if (!pair) continue;
      const { k1, k2, c, d } = pair;
      const m = points.length;
      points.push(new THREE.Vector2((points[a].x + points[b].x) / 2, (points[a].y + points[b].y) / 2));
      unplace(k1);
      unplace(k2);
      place(k1, [a, m, c]);
      place(k2, [b, m, d]);
      place(triangles.length, [m, b, c]);
      place(triangles.length, [m, a, d]);
      legalize([a, c, c, b, b, d, d, a]);
    }
  }
  return { points, triangles };
}

/** A solid's volume and centroid (shape units), from the tetrahedra its triangles span with the origin. */
export function measure(solid: Solid): { volume: number; centroid: THREE.Vector3 } {
  const { p, t } = solid;
  let volume = 0, x = 0, y = 0, z = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    const v = (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
    volume += v;
    x += (v * (p[a] + p[b] + p[c])) / 4;
    y += (v * (p[a + 1] + p[b + 1] + p[c + 1])) / 4;
    z += (v * (p[a + 2] + p[b + 2] + p[c + 2])) / 4;
  }
  return { volume, centroid: new THREE.Vector3(x / volume, y / volume, z / volume) };
}

/** A split of a solid into cells around points: the cut between every pair, and each cell's cuts with the side it keeps. */
interface Split {
  cells: { cut: Cut; keep: 1 | -1 }[][];
}

const randomDirection = (r: Randomizer) => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();

/** The cuts between cells around `sites`, rough by `amplitude` (shape units) in waves of `frequency`, their noise seeded by `r`. */
function voronoi(sites: THREE.Vector3[], amplitude: number, frequency: number, r: Randomizer): Split {
  const cells: Split['cells'] = sites.map(() => []);
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const normal = sites[j].clone().sub(sites[i]).normalize();
      const u = new THREE.Vector3(), w = new THREE.Vector3();
      u.set(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0).cross(normal).normalize();
      w.crossVectors(normal, u);
      const offset = normal.dot(sites[i].clone().add(sites[j]).multiplyScalar(0.5));
      const cut: Cut = { normal, u, w, offset, noise: new Noise(r.nextInt()), amplitude, frequency };
      cells[i].push({ cut, keep: 1 });
      cells[j].push({ cut, keep: -1 });
    }
  }
  return { cells };
}

/** A solid cut down to one cell of a split. */
function cell(solid: Solid, split: Split, index: number, spacing: number): Solid {
  let piece = solid;
  for (const { cut, keep } of split.cells[index]) piece = clip(piece, cut, keep, spacing);
  return piece;
}

/** The split of a shape's tree at one node: the whole shape (path []) or a piece of it ([i]). */
interface Node {
  split: Split;
  /** The probe's piece of this node (see PROBE_DETAIL), to plan the next split on. */
  probes: Solid[];
}

/** One shape's fracture tree, planned on the coarse probe as far as asked. */
class Tree {
  private readonly nodes = new Map<string, Node>();
  private root: Solid | null = null;
  readonly meanAxis: number;

  constructor(readonly shape: number) {
    const { axes } = rockRecipe(shape);
    this.meanAxis = (axes.x + axes.y + axes.z) / 3;
  }

  /** The split at a node (path [] for the whole shape, [i] for a piece of the first break). */
  node(path: readonly number[]): Node {
    const key = path.join('.');
    let node = this.nodes.get(key);
    if (node) return node;
    const r = new Randomizer(FRACTURE_SEED * 7919 + this.shape * 104729 + (path.length ? 1 + path[0] : 0) * 1299709);
    let probe: Solid;
    if (path.length === 0) probe = this.root ??= shapeSolid(this.shape, PROBE_DETAIL);
    else probe = this.node(path.slice(0, -1)).probes[path[path.length - 1]];
    const whole = measure(probe);
    const extent = extents(probe, whole.centroid);
    const count = path.length === 0 ? PIECES : SUBPIECES[r.nextInt() % 2];
    const amplitude = ROUGHNESS * this.meanAxis * (path.length ? 0.75 : 1);
    const frequency = WAVES / this.meanAxis;
    let best: Node | null = null, bestShare = -1;
    for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
      // points around the middle, spread across the piece's extent
      const sites = Array.from({ length: count }, () => randomDirection(r).multiply(extent).multiplyScalar(0.55).add(whole.centroid));
      const split = voronoi(sites, amplitude, frequency, r);
      const probes = sites.map((_, i) => cell(probe, split, i, SPACING.probe * this.meanAxis));
      const share = Math.min(...probes.map((s) => measure(s).volume)) * (count / whole.volume);
      if (share > bestShare) {
        best = { split, probes };
        bestShare = share;
      }
      if (share >= MIN_SHARE) break;
    }
    this.nodes.set(key, best!);
    return best!;
  }

  /** How many pieces the piece at `path` breaks into (the whole shape at []). */
  count(path: readonly number[]): number {
    return this.node(path).split.cells.length;
  }

  /** The piece at `path` cut from its parent's solid, with fracture faces of `spacing` (a share of the mean semi-axis). */
  cell(parent: Solid, path: readonly number[], spacing: number): Solid {
    return cell(parent, this.node(path.slice(0, -1)).split, path[path.length - 1], spacing * this.meanAxis);
  }
}

/** Half a solid's extent along each axis around a point. */
function extents(solid: Solid, around: THREE.Vector3): THREE.Vector3 {
  const out = new THREE.Vector3();
  for (let i = 0; i < solid.p.length; i += 3) {
    out.x = Math.max(out.x, Math.abs(solid.p[i] - around.x));
    out.y = Math.max(out.y, Math.abs(solid.p[i + 1] - around.y));
    out.z = Math.max(out.z, Math.abs(solid.p[i + 2] - around.z));
  }
  return out;
}

const trees = new Map<number, Tree>();
const tree = (shape: number) => trees.get(shape) ?? trees.set(shape, new Tree(shape)).get(shape)!;

/** How many solids a cut keeps at hand: the whole shapes and the pieces of the first break the next cuts start from, the most recently used. */
const KEPT_SOLIDS = 8;
const solids = new Map<string, Solid>();

/** A solid kept at hand (see KEPT_SOLIDS), made when missing. */
function kept(key: string, make: () => Solid): Solid {
  let solid = solids.get(key);
  if (solid) solids.delete(key);
  else solid = make();
  solids.set(key, solid);
  if (solids.size > KEPT_SOLIDS) solids.delete(solids.keys().next().value!);
  return solid;
}

/** How many pieces the piece of a shape at `path` breaks into ([] for the whole shape). */
export function pieceCount(shape: number, path: readonly number[]): number {
  return tree(shape).count(path);
}

/** A piece of a shape (shape units, in the shape's own frame) as a solid, cut from the shape's mesh of `detail` with fracture faces of `spacing` (see SPACING); the whole shape for the path []. */
export function pieceSolid(shape: number, path: readonly number[], detail: number, spacing: keyof typeof SPACING): Solid {
  if (path.length === 0) return kept(`${shape}:${detail}`, () => shapeSolid(shape, detail));
  const parent = pieceSolid(shape, path.slice(0, -1), detail, spacing);
  const make = () => tree(shape).cell(parent, path, SPACING[spacing]);
  return path.length === 1 ? kept(`${shape}:${detail}:${spacing}:${path[0]}`, make) : make();
}

/** A mesh as arrays, to hand from a worker and to draw (see solidMesh). */
export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  /** 1 on a fracture face, 0 on the outer surface. */
  fracture: Float32Array;
  index: Uint16Array | Uint32Array;
}

/**
 * A solid as a mesh to draw, its positions in the shape's frame (so a material reads the
 * shape's relief map by them, see world/rocks, patchRelief): the outer surface smooth, its
 * normals averaged over its own triangles; the fracture faces `faceted` (each triangle its own
 * normal) or smooth over the face, never sharing a vertex with the outer surface, so the edge
 * between them stays sharp.
 */
export function solidMesh(solid: Solid, faceted: boolean): MeshData {
  const { p, t, f } = solid;
  const smooth = [new Float64Array(p.length), new Float64Array(p.length)];
  const faces = new Float64Array(t.length);
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    faces[k] = nx;
    faces[k + 1] = ny;
    faces[k + 2] = nz;
    const sum = smooth[f[k / 3]];
    for (const i of [a, b, c]) {
      sum[i] += nx;
      sum[i + 1] += ny;
      sum[i + 2] += nz;
    }
  }
  const position: number[] = [], normal: number[] = [], fracture: number[] = [], index: number[] = [];
  // a vertex of the solid becomes one vertex of the mesh per kind of face it lies on
  const shared = [new Int32Array(p.length / 3).fill(-1), new Int32Array(p.length / 3).fill(-1)];
  const emit = (i: number, broken: number, nx: number, ny: number, nz: number) => {
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    position.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    normal.push(nx / length, ny / length, nz / length);
    fracture.push(broken);
    return position.length / 3 - 1;
  };
  for (let k = 0; k < t.length; k += 3) {
    const broken = f[k / 3];
    for (let e = 0; e < 3; e++) {
      const i = t[k + e];
      if (broken && faceted) {
        index.push(emit(i, 1, faces[k], faces[k + 1], faces[k + 2]));
        continue;
      }
      if (shared[broken][i] < 0) shared[broken][i] = emit(i, broken, smooth[broken][i * 3], smooth[broken][i * 3 + 1], smooth[broken][i * 3 + 2]);
      index.push(shared[broken][i]);
    }
  }
  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    fracture: new Float32Array(fracture),
    index: position.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index),
  };
}

/** A mesh's arrays as a geometry (see solidMesh). */
function meshGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
  geometry.setAttribute('fracture', new THREE.BufferAttribute(mesh.fracture, 1));
  geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The details of the shapes the pieces are cut from: the surface the collisions measure, and the meshes drawn near and far (see world/rocks). */
export interface FractureDetails {
  collision: number;
  near: number;
  far: number;
}

/** A piece as arrays, the same for rock and ice, to hand from a worker (see prefetch). */
export interface PieceData {
  near: MeshData;
  far: MeshData;
  /** The piece's centroid in the shape's frame (shape units, whole). */
  centroid: number[];
  /** Half its extent along each axis around the centroid (shape units, whole). */
  semiAxes: number[];
  /** Its share of the whole shape's volume. */
  share: number;
  /** Its measured surface around the centroid (see world/surface). */
  radii: Float32Array;
}

/** Cuts a piece: its surface measured from the shape of the collisions' detail, its meshes from the drawn shapes'. */
export function cutPiece(shape: number, path: readonly number[], details: FractureDetails): PieceData {
  const collision = pieceSolid(shape, path, details.collision, 'collision');
  const { volume, centroid } = measure(collision);
  // whole units, so tiny floating point differences between browsers vanish (as a template's center)
  centroid.round();
  const whole = measure(pieceSolid(shape, [], details.collision, 'collision')).volume;
  const radii = measureRadii(collision.p, centroid);
  return {
    near: solidMesh(pieceSolid(shape, path, details.near, 'near'), true),
    far: solidMesh(pieceSolid(shape, path, details.far, 'far'), false),
    centroid: centroid.toArray(),
    semiAxes: extents(collision, centroid).round().toArray(),
    share: Math.round((volume / whole) * 1e4) / 1e4,
    radii,
  };
}

const pieceKey = (shape: number, path: readonly number[], details: FractureDetails) => `${details.collision}:${details.near}:${details.far}:${shape}:${path.join('.')}`;
const cutPieces = new Map<string, PieceData>();

/** A piece's arrays: cut already (here or by the worker, see prefetch), else cut here and now. */
export function pieceData(shape: number, path: readonly number[], details: FractureDetails): PieceData {
  const key = pieceKey(shape, path, details);
  let data = cutPieces.get(key);
  if (!data) cutPieces.set(key, (data = cutPiece(shape, path, details)));
  return data;
}

/** A request to the worker: cut every piece the piece of a shape at a path breaks into. */
export type FractureJob = { shape: number; path: number[]; details: FractureDetails };

let worker: Worker | null | undefined;
const asked = new Set<string>();

/**
 * Has a background worker cut the pieces the piece at `path` breaks into (the whole shape at
 * []), so a rock breaks without the page stopping to cut them (a few hundred milliseconds a
 * piece). Where no worker runs, the pieces are cut when the rock breaks.
 */
export function prefetch(shape: number, path: readonly number[], details: FractureDetails) {
  const key = pieceKey(shape, path, details);
  if (asked.has(key) || typeof Worker === 'undefined') return;
  asked.add(key);
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./fracture.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ key: string; data: PieceData }>) => {
        if (!cutPieces.has(event.data.key)) cutPieces.set(event.data.key, event.data.data);
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
      };
    } catch {
      worker = null;
    }
  }
  worker?.postMessage({ shape, path: [...path], details } satisfies FractureJob);
}

/** Cuts every piece of a job (see prefetch) and sends each with its key, its arrays handed over, not copied. */
export function runJob(job: FractureJob, send: (message: { key: string; data: PieceData }, transfer: ArrayBuffer[]) => void) {
  for (let i = 0; i < pieceCount(job.shape, job.path); i++) {
    const path = [...job.path, i];
    const data = cutPiece(job.shape, path, job.details);
    const arrays = [data.near, data.far].flatMap((m) => [m.position, m.normal, m.fracture, m.index]);
    send({ key: pieceKey(job.shape, path, job.details), data }, [...arrays, data.radii].map((a) => a.buffer as ArrayBuffer));
  }
}

/** What the field needs of a piece (see world/asteroids): what to draw near and far, where it lay in its shape, its measured surface, its share of the shape's volume. */
export interface Piece {
  /** Drawn near and far: each a group holding the piece's mesh, placed so the group's origin is the piece's centroid. */
  near: THREE.Object3D;
  far: THREE.Object3D;
  centroid: THREE.Vector3;
  surface: Surface;
  semiAxes: THREE.Vector3;
  share: number;
}

/** A field's kinds that break along the trees (rock, ice): how many pieces a piece breaks into, a piece to place, and the cutting of a piece's pieces ahead of time. */
export interface FractureSet {
  /** The details the pieces are cut at, for another kind drawn from the same shapes (ice, see world/ice). */
  details: FractureDetails;
  count(shape: number, path: readonly number[]): number;
  piece(shape: number, path: readonly number[]): Piece;
  prefetch(shape: number, path: readonly number[]): void;
  /** Whether the pieces the piece at `path` breaks into are cut, so it breaks at once (asks the worker for them when not, see prefetch): always where no worker runs, which cuts them when it breaks. */
  ready(shape: number, path: readonly number[]): boolean;
}

/** A piece's geometries and surface, built once from its arrays and shared by rock and ice. */
const built = new Map<string, { near: THREE.BufferGeometry; far: THREE.BufferGeometry; surface: Surface }>();

/**
 * The fracture of a kind's shapes at `details`, drawn with `material` (a shape's material for
 * its pieces, near with `closeUp`, see world/rocks and world/ice).
 */
export function fractureSet(details: FractureDetails, material: (shape: number, closeUp: boolean) => THREE.Material): FractureSet {
  const placed = (geometry: THREE.BufferGeometry, mat: THREE.Material, centroid: THREE.Vector3, name: string) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.copy(centroid).negate();
    mesh.name = name;
    group.add(mesh);
    return group;
  };
  return {
    details,
    count: pieceCount,
    prefetch: (shape, path) => prefetch(shape, path, details),
    ready(shape, path) {
      if (typeof Worker === 'undefined' || worker === null) return true;
      for (let i = 0; i < pieceCount(shape, path); i++) if (!cutPieces.has(pieceKey(shape, [...path, i], details))) {
        prefetch(shape, path, details);
        return false;
      }
      return true;
    },
    piece(shape, path) {
      const data = pieceData(shape, path, details);
      const key = pieceKey(shape, path, details);
      let geometry = built.get(key);
      if (!geometry) built.set(key, (geometry = { near: meshGeometry(data.near), far: meshGeometry(data.far), surface: new Surface(data.radii) }));
      const centroid = new THREE.Vector3().fromArray(data.centroid);
      const name = `piece-${shape}-${path.join('.')}`;
      return {
        near: placed(geometry.near, material(shape, true), centroid, name),
        far: placed(geometry.far, material(shape, false), centroid, name),
        centroid,
        surface: geometry.surface,
        semiAxes: new THREE.Vector3().fromArray(data.semiAxes),
        share: data.share,
      };
    },
  };
}
