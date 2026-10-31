import * as THREE from 'three';
import type { Randomizer } from '../random';
import { srgbByte } from '../srgb';

/**
 * The machinery along the walls of the battleship's hangar tunnels (see game/fleet): bulkhead
 * frames, catwalks, pipes, cable bundles sagging between the frames, cable trays, ducts, tanks,
 * pumps, heat exchangers, cabinets and the small lights of their panels, in layers one in front
 * of another, every wall laid out by the battleship's seed. Looks only: it lies inside the walls'
 * colliders. Each tunnel has its emphasis, so the three read apart in the same style: the coolant
 * plant (pipes, tanks, pumps, heat exchangers), the power plant (cable bundles and trays,
 * cabinets, transformers) and the air plant (ducts, fans, machine blocks).
 */
export type Emphasis = 'coolant' | 'power' | 'air';

/** The tunnels' emphases, from the bow aft. */
export const EMPHASES: readonly Emphasis[] = ['coolant', 'power', 'air'];

/**
 * A wall in its own frame: x across the hull, the machinery from -reach to reach and the flank's
 * inside at ±edge; y up from floor to ceiling; z out of the wall towards the tunnel, 0 at the
 * clear width's edge and -depth at the wall's back plate.
 */
export type Wall = { reach: number; edge: number; floor: number; ceiling: number; depth: number; frame: THREE.Matrix4 };

/** Colors a piece (in the hull's frame), `glowing` for what shines by itself. */
export type Paint = (geometry: THREE.BufferGeometry, color: THREE.Color, glowing?: boolean) => void;

/** Cold industrial paint: dark steel and gunmetal, galvanized ducts, copper and brass pipes, black rubber, hazard yellow. */
const COLOR = {
  plate: new THREE.Color(0x5d636c),
  frame: new THREE.Color(0x3c414c),
  steel: new THREE.Color(0x6e757f),
  galvanized: new THREE.Color(0x7a8088),
  copper: new THREE.Color(0x96603f),
  brass: new THREE.Color(0x9c8650),
  rubber: new THREE.Color(0x1a1b1e),
  graphite: new THREE.Color(0x2c2f34),
  hazard: new THREE.Color(0xe6c200),
  black: new THREE.Color(0x141414),
  cabinet: new THREE.Color(0x4f5a63),
  tank: new THREE.Color(0x56616b),
  grating: new THREE.Color(0x30343a),
  ceramic: new THREE.Color(0xb8bcc2),
};
/** The panels' lights, glowing past white for the bloom: azure for information, orange (rarer) where a hand is wanted. */
const AZURE = new THREE.Color(0x0062ff).multiplyScalar(2.2);
const ORANGE = new THREE.Color(0xff9d00).multiplyScalar(2);
/** A screen's dim azure. */
const SCREEN = new THREE.Color(0x0062ff).multiplyScalar(0.3);

const Y = new THREE.Vector3(0, 1, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A tube of `sides` around a line through `points` (a pipe's bends, a cable's sag), each ring
 * across the line's direction there, turned along with it so it never twists.
 */
function sweep(points: readonly THREE.Vector3[], radius: number, sides: number): THREE.BufferGeometry {
  const n = points.length;
  const positions = new Float32Array(n * sides * 3);
  const normals = new Float32Array(n * sides * 3);
  const index: number[] = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const into = new THREE.Vector3();
  const out = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i > 0) into.subVectors(points[i], points[i - 1]).normalize();
    if (i < n - 1) out.subVectors(points[i + 1], points[i]).normalize();
    if (i === 0) tangent.copy(out);
    else if (i === n - 1) tangent.copy(into);
    else tangent.addVectors(into, out).normalize();
    if (i === 0) normal.set(Math.abs(tangent.y) > 0.9 ? 1 : 0, Math.abs(tangent.y) > 0.9 ? 0 : 1, 0);
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    binormal.crossVectors(tangent, normal);
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      radial.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
      radial.toArray(normals, (i * sides + k) * 3);
      radial.multiplyScalar(radius).add(points[i]).toArray(positions, (i * sides + k) * 3);
    }
    if (i > 0) {
      for (let k = 0; k < sides; k++) {
        const [a, b, c, d] = [(i - 1) * sides + k, (i - 1) * sides + ((k + 1) % sides), i * sides + k, i * sides + ((k + 1) % sides)];
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * sides * 2), 2));
  geometry.setIndex(index);
  return geometry;
}

/** A path through `corners` with each corner bent round over up to `bend` (a pipe's elbows). */
function rounded(corners: readonly THREE.Vector3[], bend: number): THREE.Vector3[] {
  const path = [corners[0]];
  for (let i = 1; i < corners.length - 1; i++) {
    const [a, p, b] = [corners[i - 1], corners[i], corners[i + 1]];
    const cut = Math.min(bend, a.distanceTo(p) / 2, b.distanceTo(p) / 2);
    const q0 = p.clone().addScaledVector(a.clone().sub(p).normalize(), cut);
    const q1 = p.clone().addScaledVector(b.clone().sub(p).normalize(), cut);
    path.push(q0, q0.clone().multiplyScalar(0.25).addScaledVector(p, 0.5).addScaledVector(q1, 0.25), q1);
  }
  path.push(corners[corners.length - 1]);
  return path;
}

/** A cable hanging from `from` to `to`, sagging `sag` at its middle, in `segments`. */
function hanging(from: THREE.Vector3, to: THREE.Vector3, sag: number, segments: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    points.push(from.clone().lerp(to, t).setY(THREE.MathUtils.lerp(from.y, to.y, t) - 4 * sag * t * (1 - t)));
  }
  return points;
}

/** Lays out the machinery of one wall with `random`, in the tunnel's emphasis, and paints every piece. */
export function machinery(random: Randomizer, wall: Wall, emphasis: Emphasis, paint: Paint): void {
  const { reach: R, edge, floor: F, ceiling: C, depth: D } = wall;
  const chance = (p: number) => random.nextFloat() < p;
  const pick = <T>(weights: readonly (readonly [T, number])[]): T => {
    let roll = random.nextFloat() * weights.reduce((sum, [, w]) => sum + w, 0);
    for (const [item, w] of weights) if ((roll -= w) < 0) return item;
    return weights[weights.length - 1][0];
  };
  const shade = (color: THREE.Color, spread = 0.12) => color.clone().multiplyScalar(random.range(1 - spread, 1 + spread));
  const emit = (geometry: THREE.BufferGeometry, color: THREE.Color, glowing = false) => paint(geometry.applyMatrix4(wall.frame), color, glowing);
  /**
   * A box without its back, which faces into the wall where nobody looks from; `standing` on
   * the floor or a catwalk, without its bottom too.
   */
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color, standing = false) => {
    const geometry = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    // the box's faces in their order: +x, -x, +y, -y, +z, -z, two triangles each
    const kept = [0, 1, 2, 4].concat(standing ? [] : [3]);
    const index = geometry.getIndex()!.array;
    geometry.setIndex(kept.flatMap((face) => Array.from(index.slice(face * 6, face * 6 + 6))));
    emit(geometry, color);
  };
  /** A flat face towards the tunnel (a grille, a seam, a screen, a light). */
  const flat = (x0: number, x1: number, y0: number, y1: number, z: number, color: THREE.Color, glowing = false) =>
    emit(new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z), color, glowing);
  /** A thin fin across the wall at `x` (a heat exchanger's, a radiator's): its two sides only. */
  const fin = (x: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color) => {
    for (const side of [-1, 1]) emit(new THREE.PlaneGeometry(z1 - z0, y1 - y0).rotateY((side * Math.PI) / 2).translate(x + side, (y0 + y1) / 2, (z0 + z1) / 2), color);
  };
  /** A slat of a grille: its face and its top. */
  const slat = (x0: number, x1: number, y: number, z: number, color: THREE.Color) => {
    flat(x0, x1, y - 2, y + 2, z, color);
    emit(new THREE.PlaneGeometry(x1 - x0, 3).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y + 2, z - 1.5), color);
  };
  const rod = (from: THREE.Vector3, to: THREE.Vector3, r: number, sides: number, color: THREE.Color, open = true) => {
    const span = to.clone().sub(from);
    const middle = from.clone().lerp(to, 0.5);
    const geometry = new THREE.CylinderGeometry(r, r, span.length(), sides, 1, open).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, span.normalize()));
    emit(geometry.translate(middle.x, middle.y, middle.z), color);
  };
  const lamp = (x: number, y: number, z: number, color = chance(0.15) ? ORANGE : AZURE) => flat(x - 2.5, x + 2.5, y - 2.5, y + 2.5, z, color, true);
  /** Where a hose may plug in (the tops of pumps, tanks and exchangers). */
  const ports: THREE.Vector3[] = [];

  // the frames: deep ribs of the bulkhead at uneven spacing, the bays between them
  const frames: number[] = [];
  for (let x = -R + random.range(150, 450); x < R - 200; x += random.range(380, 780)) frames.push(x);
  const posts = [-R, ...frames, R];
  for (const x of frames) {
    box(x - 5, x + 5, F, C, -D, -8, COLOR.frame);
    box(x - 20, x + 20, F, C, -10, -2, shade(COLOR.frame));
  }
  // the back plate in plates of uneven height per bay, and the jambs closing it at the flanks
  for (let c = 0; c < posts.length - 1; c++) {
    let y = F;
    while (y < C) {
      const top = C - y < 360 ? C : y + random.range(160, 340);
      emit(new THREE.PlaneGeometry(posts[c + 1] - posts[c], top - y).translate((posts[c] + posts[c + 1]) / 2, (y + top) / 2, -D), shade(COLOR.plate, 0.18));
      y = top;
    }
  }
  for (const side of [-1, 1]) box(side * R, side * edge, F, C, -D, 0, COLOR.plate);

  // catwalks: one or two levels, a grating over the bays it runs along, a yellow kick plate, rails
  const walk = F + random.range(290, 330);
  const levels = emphasis === 'power' || chance(0.5) ? [walk, walk + random.range(300, 340)] : [walk];
  const walkways = levels.map(() => posts.slice(0, -1).map(() => chance(0.8)));
  levels.forEach((y, l) => {
    for (let c = 0; c < posts.length - 1; c++) {
      if (!walkways[l][c]) continue;
      const [x0, x1] = [posts[c], posts[c + 1]];
      box(x0, x1, y - 8, y, -D, -6, shade(COLOR.grating));
      flat(x0, x1, y - 14, y + 6, -2, COLOR.hazard.clone().multiplyScalar(0.6));
      slat(x0, x1, y + 102, -4, COLOR.steel);
      slat(x0, x1, y + 54, -4, COLOR.steel);
      for (let x = x0 + 25; x < x1 - 15; x += 220) flat(x - 2.5, x + 2.5, y, y + 100, -5, COLOR.steel);
    }
  });
  // ladders between the levels and up from the floor
  for (let l = 0; l < levels.length; l++) {
    if (!chance(0.7)) continue;
    const c = Math.floor(random.nextFloat() * (posts.length - 1));
    const x = posts[c] + 40;
    const [y0, y1] = [l === 0 ? F : levels[l - 1], levels[l]];
    for (const dx of [0, 34]) box(x + dx - 2, x + dx + 2, y0, y1 + 100, -14, -10, COLOR.hazard.clone().multiplyScalar(0.7), true);
    for (let y = y0 + 25; y < y1; y += 30) slat(x, x + 34, y, -11, COLOR.steel);
  }

  // what stands in the bays, on the floor and on the catwalks' back half
  type Spot = { x0: number; x1: number; y: number; high: number; back: number; front: number };
  const standing: Spot[] = [];
  for (let c = 0; c < posts.length - 1; c++) {
    const [x0, x1] = [posts[c] + (c === 0 ? 10 : 24), posts[c + 1] - (c === posts.length - 2 ? 10 : 24)];
    standing.push({ x0, x1, y: F, high: walk - F - 30, back: -D + 4, front: -10 });
    levels.forEach((y, l) => {
      if (walkways[l][c]) standing.push({ x0, x1, y, high: Math.min(190, (levels[l + 1] ?? C) - y - 40), back: -D + 4, front: -70 });
    });
  }
  const tank = (s: Spot, x0: number, x1: number) => {
    const r = Math.min((x1 - x0) / 2 - 4, (s.front - s.back) / 2 - 2, 52);
    const h = Math.min(s.high - r - 12, random.range(140, 300));
    if (r < 18 || h < 60) return;
    const [x, z] = [(x0 + x1) / 2, s.back + r + 2];
    const paintIt = pick([
      [COLOR.tank, 3],
      [COLOR.steel, 2],
      [COLOR.cabinet, 1],
    ] as const);
    const color = shade(paintIt);
    emit(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 12, 8, 1, true).translate(x, s.y + 6, z), COLOR.frame);
    emit(new THREE.CylinderGeometry(r, r, h, 8, 1, true).translate(x, s.y + 12 + h / 2, z), color);
    emit(new THREE.SphereGeometry(r, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, s.y + 12 + h, z), color);
    for (const at of [0.25, 0.8]) emit(new THREE.CylinderGeometry(r + 2, r + 2, 8, 8, 1, true).translate(x, s.y + 12 + h * at, z), COLOR.graphite);
    emit(new THREE.CircleGeometry(9, 6).translate(x, s.y + 12 + h * 0.55, z + r + 2), COLOR.brass);
    if (chance(0.5)) lamp(x + 16, s.y + 12 + h * 0.55, z + r);
    ports.push(v(x, s.y + 12 + h + r, z));
  };
  const lying = (s: Spot, x0: number, x1: number) => {
    const r = Math.min(s.high / 2 - 16, (s.front - s.back) / 2 - 2, 46);
    if (r < 18 || x1 - x0 < 3 * r) return;
    const length = x1 - x0 - 2 * r;
    const [y, z] = [s.y + 16 + r, s.back + r + 2];
    const color = shade(COLOR.tank);
    emit(new THREE.CylinderGeometry(r, r, length, 8, 1, true).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z), color);
    for (const side of [-1, 1]) emit(new THREE.SphereGeometry(r, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-side * (Math.PI / 2)).translate((x0 + x1) / 2 + (side * length) / 2, y, z), color);
    for (const at of [0.2, 0.8]) box(x0 + r + length * at - 8, x0 + r + length * at + 8, s.y, y - r * 0.5, z - r * 0.8, z + r * 0.8, COLOR.frame, true);
    ports.push(v(x0 + r + length * random.range(0.2, 0.8), y + r, z));
  };
  const pump = (s: Spot, x0: number, x1: number) => {
    const depth = Math.min(70, s.front - s.back);
    const z = s.front - depth / 2;
    const w = x1 - x0;
    const r = Math.min(22, s.high / 4);
    box(x0, x1, s.y, s.y + 12, z - depth / 2, z + depth / 2, COLOR.frame, true);
    const y = s.y + 14 + r;
    const motor = x0 + w * 0.55;
    emit(new THREE.CylinderGeometry(r, r, w * 0.45, 8).rotateZ(Math.PI / 2).translate(motor + w * 0.2, y, z), shade(COLOR.cabinet));
    for (const at of [0.5]) emit(new THREE.CylinderGeometry(r + 3, r + 3, 4, 8, 1, true).rotateZ(Math.PI / 2).translate(motor + w * 0.45 * at - w * 0.025, y, z), COLOR.graphite);
    box(motor - w * 0.12, motor, y - r * 0.6, y + r * 0.6, z - r * 0.6, z + r * 0.6, COLOR.hazard);
    const volute = shade(COLOR.steel);
    emit(new THREE.CylinderGeometry(r * 1.25, r * 1.25, r * 1.1, 8, 1, true).rotateX(Math.PI / 2).translate(x0 + w * 0.25, y + 4, z), volute);
    emit(new THREE.CircleGeometry(r * 1.25, 8).translate(x0 + w * 0.25, y + 4, z + r * 0.55), volute);
    box(motor + w * 0.15, motor + w * 0.3, y + r - 2, y + r + 14, z - 10, z + 10, COLOR.graphite, true);
    lamp(motor + w * 0.22, y + r + 7, z + 10.5);
    // the outlet up and back into the wall
    const out = x0 + w * 0.25;
    const top = Math.min(s.y + s.high + random.range(40, 160), C - 40);
    emit(sweep(rounded([v(out, y + r, z), v(out, top, z), v(out, top, -D - 5)], 20), 7, 6), shade(pick([
      [COLOR.copper, 1],
      [COLOR.steel, 2],
    ] as const)));
    emit(new THREE.CylinderGeometry(10, 10, 8, 6, 1, true).translate(out, y + r + 30, z), COLOR.steel);
    ports.push(v(motor + w * 0.1, y + r, z));
  };
  const exchanger = (s: Spot, x0: number, x1: number) => {
    const h = Math.min(s.high - 10, random.range(140, 240));
    const [z0, z1] = [s.back, Math.min(s.front, s.back + random.range(50, 80))];
    box(x0, x0 + 8, s.y, s.y + h, z0, z1, COLOR.frame, true);
    box(x1 - 8, x1, s.y, s.y + h, z0, z1, COLOR.frame, true);
    flat(x0 + 8, x1 - 8, s.y + 22, s.y + h - 22, z0 + 4, COLOR.black);
    const pitch = random.range(12, 16);
    for (let x = x0 + 8 + pitch / 2; x < x1 - 8; x += pitch) fin(x, s.y + 22, s.y + h - 22, z0 + 4, z1 - 4, shade(COLOR.galvanized, 0.06));
    const header = pick([
      [COLOR.copper, 2],
      [COLOR.brass, 1],
    ] as const);
    for (const y of [s.y + 14, s.y + h - 14]) rod(v(x0, y, z1 - 8), v(x1, y, z1 - 8), 8, 6, header);
    ports.push(v(x0 + 20, s.y + h - 6, z1 - 8));
  };
  const cabinets = (s: Spot, x0: number, x1: number) => {
    const depth = Math.min(random.range(40, 60), s.front - s.back);
    let x = x0;
    while (x1 - x >= 50) {
      const w = Math.min(x1 - x, random.range(50, 80));
      const h = Math.min(s.high - 6, random.range(150, 240));
      const front = s.back + depth;
      box(x, x + w - 2, s.y, s.y + h, s.back, front, shade(COLOR.cabinet), true);
      flat(x + w / 2 - 1, x + w / 2 + 1, s.y + 10, s.y + h - 10, front + 0.5, COLOR.black);
      if (chance(0.5)) flat(x + 8, x + w - 10, s.y + 20, s.y + 50, front + 0.5, COLOR.black);
      const lights = Math.floor(random.range(0, 3.5));
      for (let k = 0; k < lights; k++) lamp(x + 10 + k * 9, s.y + h - 18, front + 1);
      if (chance(0.6)) rod(v(x + w / 2, s.y + h, s.back + depth / 2), v(x + w / 2, C, s.back + depth / 2), 4, 4, COLOR.graphite);
      x += w;
    }
  };
  const transformer = (s: Spot, x0: number, x1: number) => {
    const h = Math.min(s.high - 40, random.range(110, 170));
    const depth = Math.min(random.range(60, 80), s.front - s.back - 14);
    if (h < 60) return;
    const face = s.back + depth;
    box(x0, x1, s.y, s.y + h, s.back, face, shade(COLOR.cabinet), true);
    for (let x = x0 + 12; x < x1 - 8; x += 16) fin(x, s.y + 12, s.y + h - 12, face, face + 12, COLOR.frame);
    for (let k = 0; k < 3; k++) {
      const x = THREE.MathUtils.lerp(x0 + 20, x1 - 20, k / 2);
      emit(new THREE.CylinderGeometry(6, 8, 26, 6, 1, true).translate(x, s.y + h + 13, s.back + depth / 2), COLOR.ceramic);
      rod(v(x, s.y + h + 26, s.back + depth / 2), v(x, C, s.back + depth / 2 - 10 + k * 6), 3.5, 4, COLOR.rubber);
    }
    flat(x0 + 10, x0 + 40, s.y + h - 40, s.y + h - 18, face + 13, COLOR.hazard);
    flat(x0 + 22, x0 + 28, s.y + h - 38, s.y + h - 20, face + 13.5, COLOR.black);
    if (chance(0.5)) lamp(x0 + 52, s.y + h - 28, face + 13, ORANGE);
  };
  const fan = (s: Spot, x0: number, x1: number) => {
    const size = Math.min(x1 - x0, s.high - 10, 150);
    if (size < 70) return;
    const face = s.back + Math.min(50, s.front - s.back);
    const [x, y] = [(x0 + x1) / 2, s.y + size / 2 + 4];
    box(x - size / 2, x + size / 2, y - size / 2, y + size / 2, s.back, face - 10, shade(COLOR.galvanized), true);
    const r = size * 0.42;
    emit(new THREE.CylinderGeometry(r, r, 12, 10, 1, true).rotateX(Math.PI / 2).translate(x, y, face - 6), COLOR.graphite);
    emit(new THREE.CircleGeometry(r, 10).translate(x, y, face - 11), COLOR.black);
    for (let k = 0; k < 3; k++) emit(new THREE.PlaneGeometry(r * 1.7, r * 0.3).rotateZ((k * Math.PI) / 3 + random.range(0, 1)).translate(x, y, face - 9), COLOR.frame);
    for (let k = -2; k <= 2; k++) flat(x - r * 0.95, x + r * 0.95, y + k * r * 0.38 - 1.5, y + k * r * 0.38 + 1.5, face, COLOR.steel);
  };
  const machine = (s: Spot, x0: number, x1: number) => {
    const h = Math.min(s.high - 10, random.range(120, 220));
    const face = Math.min(s.front - 16, s.back + random.range(60, 100));
    box(x0, x1, s.y, s.y + h * 0.7, s.back, face, shade(COLOR.cabinet), true);
    box(x0 + 10, x1 - (x1 - x0) * 0.4, s.y + h * 0.7, s.y + h, s.back, face - 20, shade(COLOR.steel), true);
    const r = Math.min((x1 - x0) * 0.22, h * 0.25);
    emit(new THREE.CylinderGeometry(r, r, 14, 10, 1, true).rotateX(Math.PI / 2).translate(x1 - r - 10, s.y + h * 0.4, face + 7), COLOR.graphite);
    emit(new THREE.CircleGeometry(r, 10).translate(x1 - r - 10, s.y + h * 0.4, face + 2), COLOR.black);
    for (let k = -1; k <= 1; k++) flat(x1 - 2 * r - 8, x1 - 12, s.y + h * 0.4 + k * r * 0.5 - 1.5, s.y + h * 0.4 + k * r * 0.5 + 1.5, face + 14, COLOR.steel);
    for (let k = 0; k < 4; k++) slat(x0 + 10, x0 + (x1 - x0) * 0.45, s.y + 18 + k * 10, face + 1, COLOR.black);
    lamp(x0 + 14, s.y + h * 0.7 - 14, face + 0.5);
    ports.push(v(x0 + 30, s.y + h, s.back + 20));
  };
  const desk = (s: Spot, x0: number, x1: number) => {
    const w = Math.min(x1 - x0, random.range(70, 110));
    const h = Math.min(s.high - 10, random.range(100, 130));
    const face = Math.min(s.front, s.back + 40);
    box(x0, x0 + w, s.y, s.y + h, s.back, face, shade(COLOR.cabinet), true);
    flat(x0 + 8, x0 + w - 8, s.y + h * 0.55, s.y + h - 10, face + 0.5, COLOR.black);
    flat(x0 + 12, x0 + w - 12, s.y + h * 0.6, s.y + h - 14, face + 1, SCREEN, true);
    const lights = 2 + Math.floor(random.range(0, 3));
    for (let k = 0; k < lights; k++) lamp(x0 + 12 + k * 10, s.y + h * 0.45, face + 0.5, k === 0 && chance(0.3) ? ORANGE : AZURE);
  };
  type Builder = (s: Spot, x0: number, x1: number) => void;
  const builders: Record<Emphasis, { floor: readonly (readonly [Builder, number, number, number])[]; walk: readonly (readonly [Builder, number, number, number])[] }> = {
    // each item: builder, weight, narrowest, widest (units)
    coolant: {
      floor: [
        [tank, 3, 70, 110],
        [lying, 2, 140, 260],
        [pump, 2, 90, 130],
        [exchanger, 3, 110, 220],
        [cabinets, 1, 60, 140],
      ],
      walk: [
        [exchanger, 2, 100, 180],
        [desk, 2, 70, 110],
        [tank, 1, 60, 90],
        [pump, 1, 90, 120],
      ],
    },
    power: {
      floor: [
        [cabinets, 4, 100, 240],
        [transformer, 3, 100, 150],
        [desk, 1, 70, 110],
        [tank, 1, 60, 90],
      ],
      walk: [
        [cabinets, 3, 60, 180],
        [desk, 3, 70, 110],
        [transformer, 1, 100, 130],
      ],
    },
    air: {
      floor: [
        [machine, 3, 130, 220],
        [fan, 3, 100, 150],
        [pump, 1, 90, 120],
        [lying, 1, 140, 220],
      ],
      walk: [
        [fan, 2, 90, 140],
        [desk, 2, 70, 110],
        [machine, 1, 120, 180],
      ],
    },
  };
  for (const s of standing) {
    const list = s.y === F ? builders[emphasis].floor : builders[emphasis].walk;
    let x = s.x0 + random.range(0, 40);
    while (x < s.x1 - 60) {
      // now and then an empty stretch, so the plate and the pipes behind show
      if (chance(0.2)) {
        x += random.range(60, 150);
        continue;
      }
      const [build, , narrow, wide] = pick(list.map((item) => [item, item[1]] as const));
      const w = Math.min(random.range(narrow, wide), s.x1 - x);
      if (w < narrow) break;
      build(s, x, x + w);
      x += w + random.range(10, 50);
    }
  }

  // pipe banks running along the wall between the catwalks and under the ceiling, in rows and in
  // depth, held by a bracket at every frame, flanged, now and then a valve with its hazard collar
  const bands: [number, number][] = [];
  let from = walk + 210;
  for (const y of levels.slice(1)) {
    bands.push([from, y - 30]);
    from = y + 30;
  }
  bands.push([from, C - 180]);
  const bank = (y: number, inFront: boolean) => {
    const big = emphasis === 'coolant' && chance(0.5);
    const r = big ? random.range(20, 30) : random.range(7, 16);
    const rows = 1 + Math.floor(random.range(0, big ? 2 : 3));
    const pitch = 2.6 * r + 6;
    // as many in depth as fit with their flanges inside the wall, three at most
    const most = Math.max(0, Math.min(2, Math.floor((D - 10 - 2.3 * r) / pitch)));
    const deep = 1 + Math.floor(random.range(0, most + 0.999));
    let [x0, x1] = [-R, R];
    if (chance(0.4) && frames.length > 2) {
      const a = Math.floor(random.nextFloat() * (frames.length - 1));
      const b = Math.min(frames.length - 1, a + 1 + Math.floor(random.range(0, 4)));
      [x0, x1] = [frames[a] + random.range(40, 120), frames[b] - random.range(40, 120)];
    }
    const zs = Array.from({ length: deep }, (_, k) => (inFront ? -4 - 1.35 * r - k * pitch : -D + 6 + r + k * pitch));
    for (let row = 0; row < rows; row++) {
      for (const z of zs) {
        const py = y + row * pitch;
        const color = shade(
          pick(
            emphasis === 'coolant'
              ? ([
                  [COLOR.copper, 3],
                  [COLOR.brass, 2],
                  [COLOR.steel, 3],
                  [COLOR.frame, 2],
                ] as const)
              : ([
                  [COLOR.copper, 1],
                  [COLOR.steel, 4],
                  [COLOR.frame, 3],
                ] as const),
          ),
        );
        const sides = r > 15 ? 8 : 6;
        if (x0 === -R) rod(v(x0, py, z), v(x1, py, z), r, sides, color);
        else {
          const end = (x: number) => pick([
            [v(x, F - 5, z), 1],
            [v(x, py, -D - 5), 2],
            [v(x, C + 5, z), 1],
          ] as const);
          emit(sweep(rounded([end(x0), v(x0, py, z), v(x1, py, z), end(x1)], 3 * r), r, sides), color);
        }
        for (let x = x0 + random.range(80, 400); r >= 10 && x < x1 - 40; x += random.range(400, 800)) emit(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 10, 6, 1, true).rotateZ(Math.PI / 2).translate(x, py, z), COLOR.graphite);
      }
    }
    const zFront = Math.max(...zs);
    const zBack = Math.min(...zs);
    for (const x of frames) if (x > x0 && x < x1) box(x - 8, x + 8, y - r - 12, y - r - 2, zBack - r, Math.min(-2, zFront + r), COLOR.frame);
    // valves on the front row, where there is room before the clear width's edge
    const room = -2 - (zFront + r);
    if (room > 2.6 * r && x1 - x0 > 300) {
      const valves = Math.floor(random.range(0, 2.6));
      for (let k = 0; k < valves; k++) {
        const x = random.range(x0 + 100, x1 - 100);
        const z = zFront;
        box(x - 1.4 * r, x + 1.4 * r, y - 1.3 * r, y + 1.3 * r, z - 1.3 * r, z + 1.3 * r, COLOR.graphite);
        rod(v(x, y, z + 1.3 * r), v(x, y, z + 2.2 * r), r * 0.15, 4, COLOR.steel, false);
        emit(new THREE.TorusGeometry(r * 1.2, r * 0.16, 3, 8).translate(x, y, z + 2.2 * r), COLOR.hazard);
        box(x - 1.2 * r, x + 1.2 * r, y - 1, y + 1, z + 2.1 * r, z + 2.3 * r, COLOR.hazard);
        for (const side of [-1, 1]) {
          for (let ring = 0; ring < 2; ring++) {
            const at = x + side * (1.6 * r + ring * 0.8 * r + 0.4 * r);
            emit(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.8 * r, 6, 1, true).rotateZ(Math.PI / 2).translate(at, y, z), ring % 2 ? COLOR.black : COLOR.hazard);
          }
        }
        if (chance(0.3)) lamp(x + 2 * r, y + 1.6 * r, z + r, ORANGE);
      }
    }
    return { y, z: zFront, r };
  };
  const banks = { coolant: 4, power: 2, air: 2 }[emphasis] + Math.floor(random.range(0, 2));
  const mains: { y: number; z: number; r: number }[] = [];
  for (let k = 0; k < banks; k++) {
    const [lo, hi] = bands[k % bands.length];
    if (hi - lo < 40) continue;
    mains.push(bank(random.range(lo, hi - 30), chance(0.35)));
  }

  // risers from the floor to the ceiling: copper and brass coolant lines, bundles of conduit, or
  // square ducts, in the frames' shadow at the back
  const risers = { coolant: 6, power: 4, air: 3 }[emphasis];
  for (let k = 0; k < risers; k++) {
    const x = random.range(-R + 40, R - 40);
    const z = random.range(-D + 14, -D + 50);
    if (emphasis === 'air') {
      const w = random.range(50, 90);
      box(x - w / 2, x + w / 2, F, C, -D, -D + w * 0.8, shade(COLOR.galvanized));
      for (let y = F + random.range(60, 200); y < C; y += random.range(180, 300)) box(x - w / 2 - 4, x + w / 2 + 4, y, y + 8, -D, -D + w * 0.8 + 4, COLOR.graphite);
    } else if (emphasis === 'power') {
      const count = 3 + Math.floor(random.range(0, 3));
      for (let i = 0; i < count; i++) rod(v(x + i * 12, F, z), v(x + i * 12, C, z), 4.5, 4, COLOR.graphite);
      for (let y = F + 120; y < C; y += random.range(120, 220)) box(x - 8, x + count * 12 - 4, y, y + 6, z - 8, z + 8, COLOR.frame);
    } else {
      const r = random.range(8, 16);
      const color = shade(chance(0.6) ? COLOR.copper : COLOR.brass);
      rod(v(x, F, z), v(x, C, z), r, 6, color);
      for (let y = F + random.range(100, 300); y < C - 50; y += random.range(250, 400)) emit(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 8, 6, 1, true).translate(x, y, z), COLOR.graphite);
    }
  }

  // cable bundles hanging in sags from frame to frame in front, cable trays with their cables
  const bundle = (y: number) => {
    const count = 3 + Math.floor(random.range(0, emphasis === 'power' ? 2.5 : 1.5));
    const cables = Array.from({ length: count }, (_, i) => ({
      r: random.range(3, emphasis === 'power' ? 9 : 6),
      dy: random.range(-6, 6),
      z: -14 - random.range(0, 26),
      more: 1 + i * 0.12 + random.range(0, 0.1),
      color: chance(0.75) ? COLOR.rubber : COLOR.graphite,
    }));
    for (let c = 0; c < posts.length - 1; c++) {
      const [xa, xb] = [posts[c] + (c === 0 ? 0 : 20), posts[c + 1] - (c === posts.length - 2 ? 0 : 20)];
      const sag = (xb - xa) * random.range(0.05, 0.11);
      for (const cable of cables) emit(sweep(hanging(v(xa, y + cable.dy, cable.z), v(xb, y + cable.dy, cable.z), sag * cable.more, xb - xa > 550 ? 4 : 3), cable.r, cable.r > 7 ? 5 : cable.r > 4.5 ? 4 : 3), cable.color);
      if (c > 0) box(posts[c] - 22, posts[c] + 22, y - 14, y - 8, -44, -2, COLOR.frame);
    }
  };
  const tray = (y: number, z0: number, z1: number) => {
    box(-R, R, y - 3, y, z0, z1, COLOR.frame);
    for (const z of [z0, z1]) box(-R, R, y, y + 10, z - 1.5, z + 1.5, COLOR.frame);
    const count = 3 + Math.floor(random.range(0, 4));
    for (let i = 0; i < count; i++) {
      const r = random.range(3, 6);
      const z = THREE.MathUtils.lerp(z0 + 6, z1 - 6, (i + 0.5) / count);
      rod(v(-R, y + r, z), v(R, y + r, z), r, 4, chance(0.7) ? COLOR.rubber : COLOR.graphite);
    }
    for (const x of frames) box(x - 4, x + 4, y - 10, y - 3, z0 - 4, z1 + 4, COLOR.frame);
  };
  const bundles = { coolant: 1, power: 2, air: 1 }[emphasis];
  const trays = { coolant: 1, power: 2, air: 1 }[emphasis];
  const cableBands = bands.flatMap(([lo, hi]) => (hi - lo > 60 ? [[lo + 40, hi]] : []));
  for (let k = 0; k < bundles; k++) {
    const [lo, hi] = cableBands[k % cableBands.length] ?? [walk + 220, C - 200];
    bundle(random.range(lo, hi));
  }
  for (let k = 0; k < trays; k++) {
    const y = random.range(walk + 200, C - 220);
    const z0 = chance(0.5) ? -D + 10 : -60;
    tray(y, z0, z0 + random.range(35, 50));
  }
  // under the catwalks, a bundle on hooks
  if (chance(0.4)) bundle(walk - 30);

  // the ceiling's edge: a pipe bank, two cable trays or a big duct along the wall's top
  if (emphasis === 'coolant') {
    const r = random.range(9, 14);
    for (let k = 0; k < 3; k++) rod(v(-R, C - 20 - r - (k % 2) * 2.4 * r, -D + 10 + r + k * 2.6 * r), v(R, C - 20 - r - (k % 2) * 2.4 * r, -D + 10 + r + k * 2.6 * r), r, 6, shade(k === 1 ? COLOR.copper : COLOR.steel));
    for (const x of frames) box(x - 6, x + 6, C - 30 - 5 * r, C, -D, Math.min(-2, -D + 20 + 8 * r), COLOR.frame);
  } else if (emphasis === 'power') {
    tray(C - 50, -D + 10, -D + 60);
    tray(C - 120, -D + 20, -D + 70);
  } else {
    const [y0, y1, z1] = [C - 140, C - 20, -D + random.range(80, 100)];
    box(-R, R, y0, y1, -D, z1, shade(COLOR.galvanized));
    for (let x = -R + random.range(100, 260); x < R - 40; x += random.range(220, 380)) box(x - 4, x + 4, y0 - 6, y1 + 6, -D, z1 + 6, COLOR.graphite);
    // drops from the duct to the fans and grilles below
    for (let x = -R + random.range(200, 600); x < R - 100; x += random.range(500, 1100)) {
      const w = random.range(60, 100);
      box(x - w / 2, x + w / 2, walk + 210, y0, -D + 4, -D + 4 + w * 0.7, shade(COLOR.galvanized));
      for (let k = 0; k < 6; k++) slat(x - w / 2 + 6, x + w / 2 - 6, walk + 242 + k * 12, -D + 6 + w * 0.7, COLOR.black);
    }
    rod(v(-R, C - 165, -40), v(R, C - 165, -40), random.range(8, 12), 6, COLOR.steel);
  }

  // hoses hanging from the plant's ports to the pipe banks and to each other
  const hoses = { coolant: 6, power: 1, air: 3 }[emphasis];
  for (let k = 0; k < hoses && ports.length > 0; k++) {
    const start = ports[Math.floor(random.nextFloat() * ports.length)];
    const main = mains.length > 0 && chance(0.6) ? mains[Math.floor(random.nextFloat() * mains.length)] : null;
    const end = main ? v(start.x + random.range(-300, 300), main.y - main.r, Math.min(-12, main.z + main.r)) : ports[Math.floor(random.nextFloat() * ports.length)].clone();
    end.x = THREE.MathUtils.clamp(end.x, -R + 20, R - 20);
    if (end.distanceTo(start) < 60) continue;
    const r = random.range(5, 9);
    const lift = v(start.x, start.y + 20, Math.min(start.z, -r - 4));
    const path = hanging(lift, end, Math.max(30, Math.abs(end.x - start.x) * 0.2), 6);
    for (const p of path) p.set(p.x, Math.max(p.y, F + r), Math.min(p.z, -r - 3));
    emit(sweep([start, ...path], r, 5), COLOR.rubber);
  }
}

/** Linear light (0 to 1, in 4096 steps) as an sRGB byte; past 1 a light's glow shows as its color at full. */
const SRGB = Uint8Array.from({ length: 4097 }, (_, i) => srgbByte(i / 4096));
const srgbOf = (c: number) => SRGB[Math.round(Math.min(1, Math.max(0, c)) * 4096)];

/**
 * A wall's machinery drawn flat, as seen straight on from the tunnel: each texel takes the
 * baked color of the piece nearest the tunnel over it (an orthographic view along the wall's z,
 * depth-tested in code), so the wall seen from outside the battleship is one textured plate
 * instead of tens of thousands of triangles (see game/fleet). The picture fills `height` rows
 * of `pixels` (RGBA, sRGB, `width` wide) from `row` up, the wall's -edge to edge across it and
 * its floor to ceiling up it; where no piece lies, `background` shows.
 */
export class Elevation {
  private readonly nearest: Float32Array;
  private readonly inverse: THREE.Matrix4;
  private readonly corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** The three corners' colors of the triangle being drawn (linear RGB, one after another). */
  private readonly tint = new Float32Array(9);

  constructor(
    private readonly wall: Wall,
    private readonly pixels: Uint8Array,
    private readonly width: number,
    private readonly row: number,
    private readonly height: number,
    background: THREE.Color,
  ) {
    this.nearest = new Float32Array(width * height).fill(-Infinity);
    this.inverse = wall.frame.clone().invert();
    const [r, g, b] = [srgbOf(background.r), srgbOf(background.g), srgbOf(background.b)];
    for (let o = row * width * 4; o < (row + height) * width * 4; o += 4) [pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]] = [r, g, b, 255];
  }

  /** Draws a piece, in the hull's frame and with its baked colors (linear RGB), into the picture. */
  draw(geometry: THREE.BufferGeometry) {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const { edge, floor, ceiling } = this.wall;
    const [a, b, c] = this.corner;
    const tint = this.tint;
    const { width, height, nearest, pixels } = this;
    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const at = index ? index.getX(t + k) : t + k;
        const p = this.corner[k].fromBufferAttribute(position, at).applyMatrix4(this.inverse);
        p.set(((p.x + edge) / (2 * edge)) * width, ((p.y - floor) / (ceiling - floor)) * height, p.z);
        tint[k * 3] = color.getX(at);
        tint[k * 3 + 1] = color.getY(at);
        tint[k * 3 + 2] = color.getZ(at);
      }
      const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const wa = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
          if (wa < 0) continue;
          const wb = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
          const wc = 1 - wa - wb;
          if (wb < 0 || wc < 0) continue;
          const z = wa * a.z + wb * b.z + wc * c.z;
          const i = y * width + x;
          if (z <= nearest[i]) continue;
          nearest[i] = z;
          const o = ((this.row + y) * width + x) * 4;
          pixels[o] = srgbOf(wa * tint[0] + wb * tint[3] + wc * tint[6]);
          pixels[o + 1] = srgbOf(wa * tint[1] + wb * tint[4] + wc * tint[7]);
          pixels[o + 2] = srgbOf(wa * tint[2] + wb * tint[5] + wc * tint[8]);
        }
      }
    }
  }
}
