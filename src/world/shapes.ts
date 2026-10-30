import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { canvas, toTexture } from '../view/textures';
import {
  boxUv,
  foilSurface,
  LIVERY_FAIRING,
  LIVERY_LINING,
  LIVERY_STAGE,
  networkLivery,
  ravagedSurface,
  shine,
  signTexture,
  solarWing,
  surfaced,
  WING_BACK,
  WING_CELLS_ACROSS,
  WING_CELLS_ALONG,
  WING_FRONT,
  wornSurface,
  type Wear,
} from '../view/surfaces';
import type { Lettering } from '../view/lettering';
import { beacons, biodome, domeGlass, FAILING_SHARE, frosted, paint, rimed, windowMaterials } from './worldship';

/**
 * The shapes the arenas are built from besides rock and ice (see world/ice): the junk of a
 * satellite network (see debrisSet) and the hull sections of a wrecked world ship. They carry
 * an invisible collider box whose size is
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
/** The half extents of each hull template's collider box (units, before an arena scales it), in the order of hullSet: a section, a torn section, an engine block, a bridge tower, a truss, and the three painted sections. */
const SECTION_HALF = new THREE.Vector3(HULL_LENGTH * 0.5, HULL_LENGTH * 0.16, HULL_LENGTH * 0.14);
export const HULL_BOXES: readonly THREE.Vector3[] = [
  SECTION_HALF,
  SECTION_HALF,
  new THREE.Vector3(HULL_LENGTH * 0.22, HULL_LENGTH * 0.2, HULL_LENGTH * 0.2),
  new THREE.Vector3(HULL_LENGTH * 0.12, HULL_LENGTH * 0.3, HULL_LENGTH * 0.1),
  new THREE.Vector3(HULL_LENGTH * 0.5, HULL_LENGTH * 0.04, HULL_LENGTH * 0.04),
  SECTION_HALF,
  SECTION_HALF,
  SECTION_HALF,
];

/** An invisible box whose `fill` (90 % for rock-like pieces, all of it for a box piece) is the collision shape with these semi-axes. */
function collider(semiAxes: THREE.Vector3, fill = SHAPE_FILL): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry((semiAxes.x * 2) / fill, (semiAxes.y * 2) / fill, (semiAxes.z * 2) / fill));
  box.userData.collider = true;
  box.visible = false;
  return box;
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

/** How deep seams, rivets and craters look (see surfaced), and how large a tile of plating is (units, 8 m). */
const RELIEF = 2;
const TILE = 160;

/** How large a repeat of the foil's crinkles is on a satellite's bus (units, 10 m). */
const FOIL_TILE = 200;

/** The colors of the junk's hardware (see tint): its dark electronics and mounts, bare metal, white paint and insulation, black baffles and nozzles. */
const DARK = 0x34373e;
const METAL = 0x8c9098;
const WHITE = 0xdcdde0;
const BLACK = 0x141416;

/**
 * A part of the junk's hardware in its color (one color, or one by the part's own x), for the
 * material that takes its colors from the vertices and carries no texture.
 */
function tint(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((x: number) => THREE.Color)): THREE.BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  part.deleteAttribute('uv');
  const position = part.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < position.count; i++) (fixed ?? (color as (x: number) => THREE.Color)(position.getX(i))).toArray(colors, i * 3);
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return part;
}

/**
 * A body of revolution about the x axis through the profile's points [x, radius], x rising (a
 * point given twice makes a sharp edge there), from the angle `start` (at +z, turning towards +y)
 * over `sweep`. Its texture runs around it from `u[0]` to `u[1]` and along it from `v[0]` at the
 * first point's x to `v[1]` at the last's; `inward` faces it inwards (a lining).
 */
function revolve(profile: readonly (readonly [number, number])[], segments: number, options: { start?: number; sweep?: number; u?: readonly [number, number]; v?: readonly [number, number]; inward?: boolean } = {}): THREE.BufferGeometry {
  const { start = 0, sweep = Math.PI * 2, u = [0, 1], v = [0, 1], inward = false } = options;
  const first = profile[0][0];
  const last = profile[profile.length - 1][0];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  profile.forEach(([x, radius], i) => {
    // the normal in the profile's plane: the mean of the segments on either side that have a length
    let nx = 0;
    let nr = 0;
    for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
      if (a < 0 || b >= profile.length) continue;
      const dx = profile[b][0] - profile[a][0];
      const dr = profile[b][1] - profile[a][1];
      const length = Math.hypot(dx, dr);
      if (length === 0) continue;
      nx -= dr / length;
      nr += dx / length;
    }
    const length = (Math.hypot(nx, nr) || 1) * (inward ? -1 : 1);
    for (let j = 0; j <= segments; j++) {
      const angle = start + (sweep * j) / segments;
      positions.push(x, radius * Math.sin(angle), radius * Math.cos(angle));
      normals.push(nx / length, (nr / length) * Math.sin(angle), (nr / length) * Math.cos(angle));
      uvs.push(u[0] + ((u[1] - u[0]) * j) / segments, v[0] + (v[1] - v[0]) * (last === first ? i / (profile.length - 1) : (x - first) / (last - first)));
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      if (inward) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Texture coordinates of a solar wing's box `width` wide (see solarWing): the cells on its top
 * face, square, the white sheet on its bottom face, the gray frame on its edges (a white edge
 * beside the dark cells would flicker afar, in a stack layer upon layer).
 */
function wingUv(box: THREE.BoxGeometry, width: number): THREE.BoxGeometry {
  const position = box.attributes.position;
  const normal = box.attributes.normal;
  const uv = box.attributes.uv;
  const repeat = (width / WING_CELLS_ACROSS) * WING_CELLS_ALONG;
  for (let i = 0; i < position.count; i++) {
    const ny = normal.getY(i);
    const [from, to] = ny > 0.5 ? WING_FRONT : ny < -0.5 ? WING_BACK : [WING_FRONT[1], WING_FRONT[1]];
    const across = THREE.MathUtils.clamp(position.getZ(i) / width + 0.5, 0, 1);
    uv.setXY(i, position.getX(i) / repeat, from + (to - from) * across);
  }
  return box;
}

/** A small parabolic dish `radius` across its rim and `depth` deep, opening along +y. */
const dish = (radius: number, depth: number) =>
  revolve(Array.from({ length: 6 }, (_, i) => [depth * (i / 5) ** 2, radius * (i / 5)] as const), 12).rotateZ(Math.PI / 2);

/** Merges parts into one geometry (all without an index). */
const merged = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));

/** The kinds of junk among the templates, in turn: a satellite, an upper stage, a fairing half, a stack, a shredded satellite, a stage, a satellite, a stack with its neon. */
const JUNK_KINDS = ['satellite', 'stage', 'fairing', 'stack', 'shredded', 'stage', 'satellite', 'sign'] as const;
/** The foil each template's satellites are wrapped in, by template (see JUNK_KINDS). */
const FOIL_TONES = ['gold', 'gold', 'gold', 'silver', 'gold', 'gold', 'silver', 'gold'] as const;

/**
 * The junk of the Orbital Freedom Network, its mega-constellation rotting in orbit, each
 * template pointing along its longest axis: a flat satellite with its single long solar wing
 * (whole, or shredded, its wing broken off in pieces and its foil torn), a spent upper stage with
 * its cold engine, half of a payload fairing, a stack of flat satellites that was never released,
 * one of them still lighting the network's name in neon. A satellite's bus is wrapped in
 * crinkled gold or silver foil (see foilSurface) and carries its antennas: the flat phased array
 * underneath, two dishes and a star tracker on top, a white radiator on its flank, thrusters at
 * its front; its wing shows deep blue cells on the front and a white sheet behind (see
 * solarWing). The stages and fairings wear the network's livery laid once around each (see
 * networkLivery); a stage closes in domes at both ends, an adapter ring at the front, at the back
 * its thrust frame, pressure bottles and an engine whose bell darkens from the copper of its
 * throat through the heat's tint to soot. The solar cells and the foil are glossy: as a piece
 * turns, they flash in the sun.
 *
 * Each collides as an ellipsoid hugging its bulk (see SHAPE_FILL), measured from its outline: the
 * boxes and cylinders listed in `outline`, the details around them left out.
 */
export function debrisSet(): TemplateSet {
  const r = new Randomizer(DEBRIS_SEED);
  // the details have a sequence of their own, so the outlines draw the same numbers whatever details there are
  const d = new Randomizer(DEBRIS_SEED + 2);
  const foils = { gold: foilSurface('gold'), silver: foilSurface('silver') };
  const foil = (tone: 'gold' | 'silver') => new THREE.MeshStandardMaterial({ map: foils[tone].map, normalMap: foils[tone].normalMap, roughness: 0.44, metalness: 0.7, envMap: shine(), envMapIntensity: 0.7 });
  const foilMaterials = { gold: foil('gold'), silver: foil('silver') };
  const panels = solarWing();
  const cells = new THREE.MeshStandardMaterial({ map: panels.map, roughnessMap: panels.orm, metalnessMap: panels.orm, roughness: 1, metalness: 1, envMap: shine(), envMapIntensity: 0.4 });
  const livery = new THREE.MeshStandardMaterial({ ...surfaced(networkLivery(), RELIEF), envMap: shine(), envMapIntensity: 0.5 });
  const hardware = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3, envMap: shine(), envMapIntensity: 0.5, side: THREE.DoubleSide });
  const neon = new THREE.MeshBasicMaterial({ map: signTexture('ORBITAL FREEDOM', '#ff4fd8'), color: new THREE.Color().setScalar(1.5), toneMapped: false });
  const near: THREE.Object3D[] = [];
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const length = DEBRIS_SIZE * r.range(1.4, 2.4);
    const L = length;
    const kind = JUNK_KINDS[i];
    const group = new THREE.Group();
    /** What the collision ellipsoid hugs; drawn only where a part also lands in one of the lists below. */
    const outline: THREE.BufferGeometry[] = [];
    const foiled: THREE.BufferGeometry[] = [];
    const painted: THREE.BufferGeometry[] = [];
    const parts: THREE.BufferGeometry[] = [];
    const wings: THREE.BufferGeometry[] = [];
    if (kind === 'satellite' || kind === 'shredded') {
      // a flat bus, a boom and the single wing reaching on to the far end, the wing cut into pieces when shredded (some missing, the rest bent)
      const shredded = kind === 'shredded';
      const x0 = -L / 2;
      const busLength = L * 0.26;
      const bus = new THREE.BoxGeometry(busLength, L * 0.03, L * 0.15).translate(x0 + busLength / 2, 0, 0);
      const boom = new THREE.BoxGeometry(L * 0.04, L * 0.008, L * 0.008).translate(x0 + busLength + L * 0.02, 0, 0);
      outline.push(bus, boom);
      foiled.push(bus);
      parts.push(tint(boom, METAL));
      const start = x0 + busLength + L * 0.04;
      const pieces = shredded ? 4 : 1;
      const piece = (L / 2 - start) / pieces;
      for (let k = 0; k < pieces; k++) {
        if (shredded && k > 0 && r.nextFloat() < 0.35) continue;
        const wing = wingUv(new THREE.BoxGeometry(piece * 0.96, L * 0.006, L * 0.14), L * 0.14);
        if (shredded) wing.rotateX(r.range(-0.6, 0.6)).rotateZ(r.range(-0.25, 0.25));
        wings.push(wing.translate(start + piece * (k + 0.5), shredded ? r.range(-0.03, 0.03) * L : 0, 0));
      }
      outline.push(...wings);
      const middle = x0 + busLength / 2;
      // the wing's drive at the boom's end
      parts.push(tint(new THREE.BoxGeometry(L * 0.012, L * 0.02, L * 0.024).translate(start - L * 0.006, 0, 0), DARK));
      // the phased array underneath, facing Earth
      parts.push(tint(new THREE.BoxGeometry(busLength * 0.86, L * 0.003, L * 0.12).translate(middle, -L * 0.0165, 0), DARK));
      // two dishes on short masts and a star tracker with its black baffle on top
      for (const side of [1, -1]) {
        const at = new THREE.Vector3(x0 + busLength * (side > 0 ? 0.22 : 0.45), L * 0.015, side * L * 0.04);
        parts.push(tint(new THREE.CylinderGeometry(L * 0.0018, L * 0.0018, L * 0.012, 6).translate(at.x, at.y + L * 0.006, at.z), METAL));
        parts.push(tint(dish(L * 0.022, L * 0.007).rotateX(d.range(-0.5, 0.5)).rotateZ(d.range(-0.5, 0.5)).translate(at.x, at.y + L * 0.012, at.z), WHITE));
      }
      parts.push(tint(new THREE.BoxGeometry(L * 0.014, L * 0.01, L * 0.014).translate(x0 + busLength * 0.8, L * 0.02, -L * 0.045), DARK));
      parts.push(tint(new THREE.CylinderGeometry(L * 0.006, L * 0.0045, L * 0.014, 10, 1, true).rotateX(0.5).translate(x0 + busLength * 0.8, L * 0.029, -L * 0.04), BLACK));
      // the white radiator standing off the bus's flank
      parts.push(tint(new THREE.BoxGeometry(busLength * 0.8, L * 0.024, L * 0.002).translate(middle, 0, L * 0.0765), WHITE));
      // thrusters at the bus's front corners
      for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        parts.push(tint(new THREE.CylinderGeometry(L * 0.0015, L * 0.004, L * 0.008, 8, 1, true).rotateZ(Math.PI / 2).translate(x0 - L * 0.003, y * L * 0.01, z * L * 0.06), BLACK));
      }
      if (shredded) {
        // the foil torn open, its flaps sticking out from the bus
        for (let k = 0; k < 4; k++) {
          const flap = new THREE.BoxGeometry(L * d.range(0.03, 0.06), L * 0.0008, L * d.range(0.02, 0.04));
          flap.translate(flap.parameters.width / 2, 0, 0).rotateY(d.range(0, Math.PI * 2)).rotateZ(d.range(-0.8, 0.8));
          foiled.push(flap.translate(x0 + busLength * d.range(0.1, 0.9), (d.nextFloat() < 0.5 ? 1 : -1) * L * 0.015, d.range(-0.06, 0.06) * L));
        }
      }
    } else if (kind === 'stage') {
      // a spent upper stage: its tank, the payload adapter's ring at the front, the engine at the back
      const R = L * 0.13;
      outline.push(new THREE.CylinderGeometry(R, R, L * 0.72, 16).rotateZ(Math.PI / 2).translate(-L * 0.1, 0, 0));
      outline.push(new THREE.CylinderGeometry(R * 1.04, R * 1.04, L * 0.08, 16, 1, true).rotateZ(Math.PI / 2).translate(-L * 0.44, 0, 0));
      outline.push(new THREE.CylinderGeometry(R * 0.35, R * 0.95, L * 0.22, 16, 1, true).rotateZ(Math.PI / 2).translate(L * 0.37, 0, 0));
      painted.push(revolve([[-L * 0.46, R], [L * 0.26, R]], 32, { v: [LIVERY_STAGE[1], LIVERY_STAGE[0]] }));
      parts.push(tint(revolve([[-L * 0.474, 0], [-L * 0.47, R * 0.55], [-L * 0.465, R * 0.85], [-L * 0.46, R]], 32), 0xc9c5ba));
      parts.push(tint(revolve([[-L * 0.48, R * 0.3], [-L * 0.48, R * 0.47], [-L * 0.472, R * 0.62]], 24), METAL));
      parts.push(tint(revolve([[-L * 0.48, R * 1.04], [-L * 0.4, R * 1.04]], 32), (x) => new THREE.Color(x < -L * 0.474 ? DARK : 0xb4b6ba)));
      parts.push(tint(revolve([[L * 0.26, R], [L * 0.285, R * 0.85], [L * 0.3, R * 0.55], [L * 0.31, R * 0.2], [L * 0.312, 0]], 32), 0x4c4844));
      parts.push(tint(revolve([[L * 0.27, R * 0.75], [L * 0.33, R * 0.25]], 16), DARK));
      // pressure bottles on the thrust frame, the attitude thrusters' pods on the tank
      for (const side of [1, -1]) {
        parts.push(tint(new THREE.SphereGeometry(R * 0.14, 10, 8).translate(L * 0.3, R * 0.55, side * R * 0.5), WHITE));
        parts.push(tint(new THREE.BoxGeometry(L * 0.04, L * 0.012, L * 0.03).translate(L * 0.2, side * (R + L * 0.006), 0), DARK));
      }
      // the engine: combustion chamber, throat and bell, copper at the throat, tinted by the heat, black with soot at the rim
      parts.push(tint(revolve([[L * 0.31, 0], [L * 0.31, R * 0.2], [L * 0.335, R * 0.22], [L * 0.345, R * 0.14]], 16), 0x7a4c30));
      const throat = L * 0.345;
      const exit = L * 0.48;
      const bell = Array.from({ length: 12 }, (_, k) => [throat + ((exit - throat) * k) / 11, R * 0.14 + R * 0.81 * Math.sqrt(k / 11)] as const);
      const copper = new THREE.Color(0x6e4630);
      const heat = new THREE.Color(0x4a4868);
      const soot = new THREE.Color(0x232326);
      parts.push(
        tint(revolve(bell, 32), (x) => {
          const s = (x - throat) / (exit - throat);
          if (s > 0.97) return new THREE.Color(0x77787e);
          return s < 0.35 ? copper.clone().lerp(heat, s / 0.35) : heat.clone().lerp(soot, (s - 0.35) / 0.65);
        }),
      );
    } else if (kind === 'fairing') {
      // half of a payload fairing: a shell open on one side, its ogive nose, lined inside
      const R = L * 0.2;
      outline.push(new THREE.CylinderGeometry(R, R, L * 0.6, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(-L * 0.2, 0, 0));
      outline.push(new THREE.CylinderGeometry(R * 0.15, R, L * 0.4, 16, 1, true, Math.PI, Math.PI).rotateZ(-Math.PI / 2).translate(L * 0.3, 0, 0));
      const shell = (scale: number): [number, number][] => [
        [-L * 0.5, R * scale],
        [L * 0.1, R * scale],
        ...Array.from({ length: 10 }, (_, k): [number, number] => {
          const t = (k + 1) / 10;
          return [L * 0.1 + L * 0.4 * t, R * scale * (0.15 + 0.85 * Math.sqrt(1 - t * t))];
        }),
      ];
      painted.push(revolve([...shell(1), [L * 0.5, 0]], 24, { sweep: Math.PI, u: [1, 0], v: LIVERY_FAIRING }));
      painted.push(revolve(shell(0.985), 24, { sweep: Math.PI, v: LIVERY_LINING, inward: true }));
      // the separation rails along its open edges, the ring at its base
      for (const side of [1, -1]) parts.push(tint(new THREE.BoxGeometry(L * 0.6, L * 0.012, L * 0.01).translate(-L * 0.2, L * 0.006, side * R), DARK));
      parts.push(tint(revolve([[-L * 0.5, R * 0.96], [-L * 0.5, R * 1.015], [-L * 0.49, R * 1.015]], 24, { sweep: Math.PI }), METAL));
    } else {
      // a stack of flat satellites as they were launched, never released, held by four posts under a lid:
      // each a bus in foil with its wing folded on top, latched to the posts, packed so close that only a hairline shows between them (afar, a gap would flicker)
      const layers = 9;
      for (let k = 0; k < layers; k++) {
        const y = (k - (layers - 1) / 2) * L * 0.04;
        const loose = k === layers - 1 ? 0.35 : r.range(-0.04, 0.04);
        outline.push(new THREE.BoxGeometry(L * 0.7, L * 0.025, L * 0.3).rotateY(loose).translate(0, y, 0));
        foiled.push(new THREE.BoxGeometry(L * 0.7, L * 0.028, L * 0.29).translate(0, -L * 0.003, 0).rotateY(loose).translate(0, y, 0));
        wings.push(wingUv(new THREE.BoxGeometry(L * 0.64, L * 0.005, L * 0.26), L * 0.26).translate(L * 0.02, L * 0.0135, 0).rotateY(loose).translate(0, y, 0));
        for (const side of [1, -1]) parts.push(tint(new THREE.BoxGeometry(L * 0.012, L * 0.02, L * 0.03).translate(side * L * 0.352, -L * 0.002, 0).rotateY(loose).translate(0, y, 0), DARK));
      }
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const post = new THREE.BoxGeometry(L * 0.02, L * 0.4, L * 0.02).translate(x * L * 0.33, 0, z * L * 0.14);
        outline.push(post);
        parts.push(tint(post, METAL));
      }
      const lid = new THREE.BoxGeometry(L * 0.66, L * 0.006, L * 0.26).translate(0, L * 0.2, 0);
      outline.push(lid);
      parts.push(tint(lid, DARK));
      if (kind === 'sign') {
        // the network's name, still lit in neon on the stack's flank
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.6, L * 0.15), neon);
        sign.position.set(0, 0, L * 0.155);
        group.add(sign);
      }
    }
    const meshes: THREE.Mesh[] = [];
    if (foiled.length) meshes.push(new THREE.Mesh(boxUv(merged(foiled), FOIL_TILE), foilMaterials[FOIL_TONES[i]]));
    if (painted.length) meshes.push(new THREE.Mesh(merged(painted), livery));
    if (parts.length) meshes.push(new THREE.Mesh(merged(parts), hardware));
    if (wings.length) meshes.push(new THREE.Mesh(merged(wings), cells));
    group.add(...meshes);
    const box = new THREE.Box3();
    for (const part of outline) {
      part.computeBoundingBox();
      box.union(part.boundingBox!);
    }
    // centered on its bulk, where the collision ellipsoid sits
    const middle = box.getCenter(new THREE.Vector3());
    for (const part of group.children) part.position.sub(middle);
    const size = box.getSize(new THREE.Vector3());
    // the collision ellipsoid hugs the bulk of the piece, never thinner than a few percent of it
    group.add(collider(new THREE.Vector3(size.x * 0.48, Math.max(size.y * 0.42, L * 0.06), Math.max(size.z * 0.42, L * 0.06)).round()));
    near.push(group);
  }
  return { near, far: [] };
}

/** A box of size (x, y, z) centered at (cx, cy, cz), as a part of a hull. */
const block = (x: number, y: number, z: number, cx = 0, cy = 0, cz = 0) => new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed();

/**
 * What the world ship PAAA 01 carries painted along its flanks (see view/lettering), by hull
 * template (5, 6, 7): its motto split where it broke, PER ASPERA on the bow, AD ASTRA on the
 * stern, the emblem of the united Earth that built it and its registry near the bridge, the
 * registry again on the stern.
 */
export const HULL_PAINT: Record<number, Lettering> = {
  5: { name: 'PER ASPERA' },
  6: { emblem: true, registry: 'PAAA 01' },
  7: { name: 'AD ASTRA', registry: 'PAAA 01' },
};
/**
 * A biodome's radius and how high it rises over its ring (template units; 37 m and 22 m on the
 * derelict, whose sections are scaled 7-fold): a flat cupola between two frames over the spine,
 * under the top of the collider box.
 */
const DOME_RADIUS = 105;
const DOME_RISE = 0.6;
/** The livery's paint on the band along the flanks: off-white, worn, chipped and scratched over the centuries, the name's dark blue reading clearly on it. */
const LIVERY: Wear = { rust: 0.15, chips: 0.5, grime: 0.6, scratches: 0.6, seams: 0.35, stencils: [], roughness: 0.75, metalness: 0.1 };
/**
 * A tile of the hull's plating (template units; about 34 m on the derelict, whose sections are
 * scaled 7-fold): plates in courses of 2 and 4 m, rivets 40 cm apart (see ravagedSurface).
 */
const PLATING_TILE = 96;

/**
 * The hull's plating in `color` (see ravagedSurface): its relief as a normal map, frost and dust
 * in its recesses, its tone varying across the hull (see frosted). Little metalness of its own:
 * without a reflected environment, metal turns black on its shadowed side.
 */
function plating(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const surface = ravagedSurface(DEBRIS_SEED + 1);
  return frosted(new THREE.MeshStandardMaterial({ map: surface.map, roughnessMap: surface.orm, metalnessMap: surface.orm, roughness: 1, metalness: 1, normalMap: surface.normal, color }), true);
}

/** What a hull template is built of before it is merged: plating, the runs of windows (steady and on the two failing circuits), the domes' glass and gardens, beacons, paint. */
interface HullParts {
  parts: THREE.BufferGeometry[];
  livery: THREE.BufferGeometry[];
  lights: THREE.BufferGeometry[];
  failing: [THREE.BufferGeometry[], THREE.BufferGeometry[]];
  glass: THREE.BufferGeometry[];
  garden: THREE.BufferGeometry[];
  beacons: number[];
  decals: THREE.Mesh[];
}

/**
 * The hull sections of the world ship PAAA 01 (see README, "The universe"), industrial and
 * angular: boxes of plating on frames, a spine, containers along the flanks, a smooth band of
 * plating on each flank carrying the livery, rows of windows below it, all within the section's
 * collider box, which is its collision shape. 0 a hull section, 1 a section torn off at one end,
 * 2 an engine block with three nozzles, 3 a bridge tower, 4 a long truss; 5, 6 and 7 hull
 * sections with the ship's paint (see HULL_PAINT). The sections carry shattered biodomes on
 * their backs. The ship died long ago: its plating, its break and its drive are cold and dark,
 * frost grows on its shadow side, and only the emergency power still lights some of its windows
 * and its red beacons (see world/worldship).
 */
export function hullSet(): TemplateSet {
  const metal = plating(0xb8bec8);
  const dark = plating(0x4a4e57);
  const uvs = new Randomizer(DEBRIS_SEED + 5);
  const windows = windowMaterials(windowTexture(DEBRIS_SEED + 2));
  const glass = domeGlass();
  const garden = rimed();
  const livery = frosted(new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(DEBRIS_SEED + 4, LIVERY), RELIEF), color: 0xc4c0b4 }));
  const r = new Randomizer(DEBRIS_SEED + 3);
  const L = HULL_LENGTH;

  /** A section's body: a core on frames, a spine on top, containers, the livery's band and window decks on both flanks, biodomes on its back with `domes`. */
  const section = (half: THREE.Vector3, end: number, into: HullParts, domes: boolean) => {
    const { parts } = into;
    const start = -half.x;
    const length = end - start;
    const middle = (start + end) / 2;
    const frame = length / 7;
    parts.push(block(length, half.y * 1.6, half.z * 1.6, middle));
    // the frames stop a hair short of the band's face, so the two never fight
    for (let x = start + 40; x < end; x += frame) parts.push(block(60, half.y * 2, half.z * 1.96, x));
    // the spine on top, broken by the domes where they sit
    if (domes) for (let k = 0; k < 7; k += 2) parts.push(block(frame - 60, half.y * 0.2, half.z * 0.5, start + 40 + (k + 0.5) * frame, half.y * 0.9));
    else parts.push(block(length * 0.9, half.y * 0.2, half.z * 0.5, middle, half.y * 0.9));
    for (const side of [1, -1]) {
      for (let x = start + 120; x < end - 160; x += r.range(160, 260)) {
        parts.push(block(r.range(90, 150), half.y * r.range(0.35, 0.6), half.z * 0.16, x, r.range(-0.3, 0.3) * half.y, side * half.z * 0.88));
      }
      // the band the livery is painted on, flush with the collider's flank
      into.livery.push(block(length * 0.94, half.y * 0.72, half.z * 0.1, middle, half.y * 0.45, side * half.z * 0.95));
      for (const deck of [-0.62, -0.38, -0.14]) {
        const run = block(length * r.range(0.5, 0.9), 10, 6, middle + r.range(-0.1, 0.1) * length, deck * half.y, side * half.z * 0.81);
        const circuit = r.nextFloat();
        (circuit < FAILING_SHARE ? into.failing[circuit < FAILING_SHARE / 2 ? 0 : 1] : into.lights).push(run);
      }
    }
    // beacons at both ends of the spine and on each flank's middle above the band
    into.beacons.push(start + 60, half.y, 0, end - 60, half.y, 0, middle, half.y * 0.86, half.z, middle, half.y * 0.86, -half.z);
    if (!domes) return;
    // a dome between every other pair of frames
    for (let k = 1; k < 7; k += 2) biodome(r, start + 40 + (k + 0.5) * frame, half.y * 0.8, 0, DOME_RADIUS, DOME_RISE, into.glass, parts, into.garden);
  };
  const painted = (type: number) => (half: THREE.Vector3, into: HullParts) => {
    section(half, half.x, into, true);
    into.decals.push(paint(HULL_PAINT[type], DEBRIS_SEED + 10 + type, 0, half.y * 0.45, half.z, half.x * 1.8));
  };

  // each built within its collider box (see HULL_BOXES)
  const builds: ((half: THREE.Vector3, into: HullParts) => void)[] = [
    (half, into) => section(half, half.x, into, true),
    (half, into) => {
      // the hull ends at 40 % of the length, torn plates reach on to the end of the box
      section(half, half.x * 0.4, into, false);
      for (let k = 0; k < 9; k++) {
        const length = r.range(0.2, 0.6) * half.x;
        into.parts.push(block(length, r.range(10, 30), half.z * r.range(0.4, 1.4), half.x * 0.4 + length / 2, r.range(-0.75, 0.75) * half.y, r.range(-0.3, 0.3) * half.z));
      }
    },
    (half, { parts }) => {
      parts.push(block(half.x * 1.2, half.y * 2, half.z * 2, -half.x * 0.4));
      // three nozzles out of the back, cold
      for (const [y, z] of [[0.45, 0], [-0.3, 0.45], [-0.3, -0.45]]) {
        parts.push(new THREE.CylinderGeometry(half.y * 0.32, half.y * 0.48, half.x * 0.8, 8, 1, true).rotateZ(Math.PI / 2).translate(half.x * 0.6, y * half.y, z * half.z).toNonIndexed());
      }
    },
    (half, { parts, lights, beacons }) => {
      // stepped levels, a bridge on top, and a mast with a beacon
      for (let level = 0; level < 4; level++) {
        const shrink = 1 - level * 0.18;
        parts.push(block(half.x * 2 * shrink, half.y * 0.4, half.z * 2 * shrink, 0, -half.y + half.y * 0.2 + level * half.y * 0.4));
        lights.push(block(half.x * 2 * shrink + 2, 8, half.z * 1.2 * shrink, 0, -half.y + half.y * 0.32 + level * half.y * 0.4));
      }
      parts.push(block(16, half.y * 0.4, 16, 0, half.y * 0.8));
      beacons.push(0, half.y - 4, 0);
    },
    (half, { parts }) => {
      // a truss: four rails and their struts
      for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(block(half.x * 2, 14, 14, 0, y * (half.y - 7), z * (half.z - 7)));
      for (let x = -half.x; x <= half.x; x += half.x / 10) parts.push(block(10, half.y * 2, 10, x), block(10, 10, half.z * 2, x));
    },
    painted(5),
    painted(6),
    painted(7),
  ];
  const flat = (geometries: THREE.BufferGeometry[]) => mergeGeometries(geometries.map((p) => (p.hasAttribute('uv') ? p.deleteAttribute('uv') : p)));
  // each part takes the plating at its own place, mirrored or not, so neighbors never show the same stretch of it
  const plated = (geometries: THREE.BufferGeometry[]) =>
    mergeGeometries(
      geometries.map((p) => {
        const uv = boxUv(p, PLATING_TILE).getAttribute('uv');
        const [du, dv, mirror] = [uvs.nextFloat(), uvs.nextFloat(), uvs.nextFloat() < 0.5 ? -1 : 1];
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * mirror + du, uv.getY(i) + dv);
        return p;
      }),
    );
  const near = HULL_BOXES.map((half, i) => {
    const into: HullParts = { parts: [], livery: [], lights: [], failing: [[], []], glass: [], garden: [], beacons: [], decals: [] };
    builds[i](half, into);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(plated(into.parts), half.y < L * 0.05 ? dark : metal));
    if (into.livery.length) group.add(new THREE.Mesh(boxUv(flat(into.livery), TILE), livery));
    if (into.lights.length) group.add(new THREE.Mesh(boxUv(flat(into.lights), 400), windows.steady));
    into.failing.forEach((runs, i) => runs.length && group.add(new THREE.Mesh(boxUv(flat(runs), 400), windows.failing[i])));
    if (into.glass.length) {
      const pane = new THREE.Mesh(flat(into.glass), glass);
      pane.userData.shadowless = true;
      group.add(pane);
    }
    if (into.garden.length) group.add(new THREE.Mesh(flat(into.garden), garden));
    if (into.beacons.length) group.add(beacons(into.beacons, r));
    for (const decal of into.decals) group.add(decal);
    group.add(collider(half.clone().round(), 1));
    return group;
  });
  return { near, far: [], box: true };
}
