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
import { atan2, cos, hypot, pow, sin } from '../detmath';
import { rotateX, rotateY, rotateZ } from '../detthree';
import { BUS_DENSITY, CUBIC, ENGINE_SHARE, FAIRING_SHEET, SQUARE, STACK_DENSITY, TANK_WALL, WING_SHEET, type JunkBuild } from './junk';

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
/** A segment of the keel's girder (see keel): its type among the hull's templates, its half extents (units, laid out unscaled: 60 m long, 12 m square). */
export const KEEL_TYPE = 8;
export const KEEL_HALF = new THREE.Vector3(600, 120, 120);
/** The half extents of each hull template's collider box (units, before an arena scales it), in the order of hullSet: a section, a torn section, an engine block, a bridge tower, a truss, the three painted sections, and the keel's segments, whole and ravaged. */
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
  KEEL_HALF,
  KEEL_HALF,
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
      const length = hypot(dx, dr);
      if (length === 0) continue;
      nx -= dr / length;
      nr += dx / length;
    }
    const length = (hypot(nx, nr) || 1) * (inward ? -1 : 1);
    for (let j = 0; j <= segments; j++) {
      const angle = start + (sweep * j) / segments;
      positions.push(x, radius * sin(angle), radius * cos(angle));
      normals.push(nx / length, (nr / length) * sin(angle), (nr / length) * cos(angle));
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
  rotateZ(revolve(Array.from({ length: 6 }, (_, i) => [depth * pow(i / 5, 2), radius * (i / 5)] as const), 12), Math.PI / 2);

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
 * boxes and cylinders listed in `outline`, the details around them left out; and as the box around
 * each part of it drawn in foil, solar cells or paint besides (`userData.parts`, see
 * AsteroidField.attach), which an ellipsoid alone would cut short at a wing's tip or a stage's end.
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
    // what it is built of (see world/junk), in the template's frame before it is centered on its bulk
    const build: JunkBuild = { kind, sheets: 0, core: 0, hard: null, ply: 0 };
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
        if (shredded) rotateZ(rotateX(wing, r.range(-0.6, 0.6)), r.range(-0.25, 0.25));
        wings.push(wing.translate(start + piece * (k + 0.5), shredded ? r.range(-0.03, 0.03) * L : 0, 0));
        build.sheets += piece * 0.96 * L * 0.14 * SQUARE * WING_SHEET;
      }
      outline.push(...wings);
      // the bus and its boom are its core; the wing's panels are sheet
      build.core = busLength * L * 0.03 * L * 0.15 * CUBIC * BUS_DENSITY;
      build.hard = { min: x0 - L * 0.01, max: start };
      build.ply = WING_SHEET;
      const middle = x0 + busLength / 2;
      // the wing's drive at the boom's end
      parts.push(tint(new THREE.BoxGeometry(L * 0.012, L * 0.02, L * 0.024).translate(start - L * 0.006, 0, 0), DARK));
      // the phased array underneath, facing Earth
      parts.push(tint(new THREE.BoxGeometry(busLength * 0.86, L * 0.003, L * 0.12).translate(middle, -L * 0.0165, 0), DARK));
      // two dishes on short masts and a star tracker with its black baffle on top
      for (const side of [1, -1]) {
        const at = new THREE.Vector3(x0 + busLength * (side > 0 ? 0.22 : 0.45), L * 0.015, side * L * 0.04);
        parts.push(tint(new THREE.CylinderGeometry(L * 0.0018, L * 0.0018, L * 0.012, 6).translate(at.x, at.y + L * 0.006, at.z), METAL));
        parts.push(tint(rotateZ(rotateX(dish(L * 0.022, L * 0.007), d.range(-0.5, 0.5)), d.range(-0.5, 0.5)).translate(at.x, at.y + L * 0.012, at.z), WHITE));
      }
      parts.push(tint(new THREE.BoxGeometry(L * 0.014, L * 0.01, L * 0.014).translate(x0 + busLength * 0.8, L * 0.02, -L * 0.045), DARK));
      parts.push(tint(rotateX(new THREE.CylinderGeometry(L * 0.006, L * 0.0045, L * 0.014, 10, 1, true), 0.5).translate(x0 + busLength * 0.8, L * 0.029, -L * 0.04), BLACK));
      // the white radiator standing off the bus's flank
      parts.push(tint(new THREE.BoxGeometry(busLength * 0.8, L * 0.024, L * 0.002).translate(middle, 0, L * 0.0765), WHITE));
      // thrusters at the bus's front corners
      for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        parts.push(tint(rotateZ(new THREE.CylinderGeometry(L * 0.0015, L * 0.004, L * 0.008, 8, 1, true), Math.PI / 2).translate(x0 - L * 0.003, y * L * 0.01, z * L * 0.06), BLACK));
      }
      if (shredded) {
        // the foil torn open, its flaps sticking out from the bus
        for (let k = 0; k < 4; k++) {
          const flap = new THREE.BoxGeometry(L * d.range(0.03, 0.06), L * 0.0008, L * d.range(0.02, 0.04));
          rotateZ(rotateY(flap.translate(flap.parameters.width / 2, 0, 0), d.range(0, Math.PI * 2)), d.range(-0.8, 0.8));
          foiled.push(flap.translate(x0 + busLength * d.range(0.1, 0.9), (d.nextFloat() < 0.5 ? 1 : -1) * L * 0.015, d.range(-0.06, 0.06) * L));
        }
      }
    } else if (kind === 'stage') {
      // a spent upper stage: its tank, the payload adapter's ring at the front, the engine at the back
      const R = L * 0.13;
      // the tank (its barrel and domes), the adapter's ring and the bell are sheet, two walls deep
      // through the tank; the thrust frame and the engine's chamber its core, weighing a share of the sheet
      const walls = (2 * Math.PI * R * L * 0.72 + 2 * Math.PI * R * R + 2 * Math.PI * R * 1.04 * L * 0.08 + Math.PI * R * 1.3 * hypot(L * 0.22, R * 0.6)) * SQUARE * TANK_WALL;
      build.sheets = walls * (1 + ENGINE_SHARE);
      build.hard = { min: L * 0.26, max: L * 0.345 };
      build.ply = 2 * TANK_WALL;
      outline.push(rotateZ(new THREE.CylinderGeometry(R, R, L * 0.72, 16), Math.PI / 2).translate(-L * 0.1, 0, 0));
      outline.push(rotateZ(new THREE.CylinderGeometry(R * 1.04, R * 1.04, L * 0.08, 16, 1, true), Math.PI / 2).translate(-L * 0.44, 0, 0));
      outline.push(rotateZ(new THREE.CylinderGeometry(R * 0.35, R * 0.95, L * 0.22, 16, 1, true), Math.PI / 2).translate(L * 0.37, 0, 0));
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
      // all of it a shell: half a barrel and half its ogive nose (a cone's frustum as near)
      build.sheets = (Math.PI * R * L * 0.6 + (Math.PI * R * 1.15 * hypot(L * 0.4, R * 0.85)) / 2) * SQUARE * FAIRING_SHEET;
      build.ply = FAIRING_SHEET;
      outline.push(rotateZ(new THREE.CylinderGeometry(R, R, L * 0.6, 16, 1, true, 0, Math.PI), Math.PI / 2).translate(-L * 0.2, 0, 0));
      outline.push(rotateZ(new THREE.CylinderGeometry(R * 0.15, R, L * 0.4, 16, 1, true, Math.PI, Math.PI), -Math.PI / 2).translate(L * 0.3, 0, 0));
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
      // a block of packed satellites: core through and through
      build.core = layers * L * 0.7 * L * 0.025 * L * 0.3 * CUBIC * STACK_DENSITY;
      build.hard = 'all';
      for (let k = 0; k < layers; k++) {
        const y = (k - (layers - 1) / 2) * L * 0.04;
        const loose = k === layers - 1 ? 0.35 : r.range(-0.04, 0.04);
        outline.push(rotateY(new THREE.BoxGeometry(L * 0.7, L * 0.025, L * 0.3), loose).translate(0, y, 0));
        foiled.push(rotateY(new THREE.BoxGeometry(L * 0.7, L * 0.028, L * 0.29).translate(0, -L * 0.003, 0), loose).translate(0, y, 0));
        wings.push(rotateY(wingUv(new THREE.BoxGeometry(L * 0.64, L * 0.005, L * 0.26), L * 0.26).translate(L * 0.02, L * 0.0135, 0), loose).translate(0, y, 0));
        for (const side of [1, -1]) parts.push(tint(rotateY(new THREE.BoxGeometry(L * 0.012, L * 0.02, L * 0.03).translate(side * L * 0.352, -L * 0.002, 0), loose).translate(0, y, 0), DARK));
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
    // its core's span in the frame centered on its bulk, as its collisions see it
    const hard = build.hard;
    group.userData.junk = { ...build, hard: hard === null || hard === 'all' ? hard : { min: hard.min - middle.x, max: hard.max - middle.x } } satisfies JunkBuild;
    const size = box.getSize(new THREE.Vector3());
    // the collision ellipsoid hugs the bulk of the piece, never thinner than a few percent of it
    group.add(collider(new THREE.Vector3(size.x * 0.48, Math.max(size.y * 0.42, L * 0.06), Math.max(size.z * 0.42, L * 0.06)).round()));
    // and every part of it drawn in foil, cells or paint as the box around it (a wing's panels, a
    // stage's barrel and its ends: an ellipsoid cuts off the corners of a long shape), rounded to
    // whole units, so the shape collides as far as it is seen, the same on every browser
    group.userData.parts = [...new Set([...outline, ...foiled, ...wings, ...painted])].map((part) => {
      part.computeBoundingBox();
      const bounds = part.boundingBox!;
      return { center: bounds.getCenter(new THREE.Vector3()).sub(middle).round(), half: bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5).ceil() };
    });
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
  inside: THREE.BufferGeometry[];
  livery: THREE.BufferGeometry[];
  lights: THREE.BufferGeometry[];
  failing: [THREE.BufferGeometry[], THREE.BufferGeometry[]];
  glass: THREE.BufferGeometry[];
  garden: THREE.BufferGeometry[];
  beacons: number[];
  decals: THREE.Mesh[];
}

/**
 * A torn section's breach (template units, as a share of its half length): whole up to a bulkhead
 * BREACH_BULKHEAD from its middle, from there on open, its plating torn off between
 * BREACH_EDGE[0] and BREACH_EDGE[1] of the way to the end of its box, its decks broken off between
 * BREACH_DECKS[0] and BREACH_DECKS[1]. The core's cross-section is BREACH_CORE of the box's.
 */
export const BREACH_BULKHEAD = -0.05;
export const BREACH_EDGE = [0.62, 0.99] as const;
const BREACH_DECKS = [0.3, 0.92] as const;
export const BREACH_CORE = 0.8;
/** Decks inside a section: the floor and the ceiling and BREACH_DECK_COUNT - 1 between them. */
export const BREACH_DECK_COUNT = 5;
/** The plating's thickness (template units, 2.8 m on the derelict's 7-fold sections). */
const SKIN = 8;
const BREACH_SEED = DEBRIS_SEED + 6;

/** A wall's outward side and the axis across it: up, down, and the two flanks. */
const WALLS = [
  { normal: new THREE.Vector3(0, 1, 0), across: new THREE.Vector3(0, 0, 1), turn: 0 },
  { normal: new THREE.Vector3(0, -1, 0), across: new THREE.Vector3(0, 0, 1), turn: Math.PI },
  { normal: new THREE.Vector3(0, 0, 1), across: new THREE.Vector3(0, 1, 0), turn: Math.PI / 2 },
  { normal: new THREE.Vector3(0, 0, -1), across: new THREE.Vector3(0, 1, 0), turn: -Math.PI / 2 },
] as const;

/**
 * A plate of a wall `wall` (see WALLS), `thick` through, `width` across, from `from` on for
 * `length` along the hull, `out` from the middle along the wall's normal and `at` across it, its
 * far end bent by `bend` (rad) towards the wall's outside (negative: inwards).
 */
function plate(wall: (typeof WALLS)[number], from: number, length: number, thick: number, width: number, out: number, at: number, bend = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(length, thick, width).translate(length / 2, 0, 0);
  rotateZ(geometry, bend);
  rotateX(geometry, wall.turn);
  return geometry.translate(from + wall.normal.x * out, wall.normal.y * out + wall.across.y * at, wall.normal.z * out + wall.across.z * at).toNonIndexed();
}

/**
 * The open end of a torn section, within its box (`half`, template units): the hull's walls torn
 * off in strips of plating at uneven lengths, many of their ends bent out by the blast of the air
 * leaving or curled in, its linings, decks, partitions, frames and pipes bared and broken off
 * deeper inside, a bulkhead closing the dark at the back. The section stays solid as its box.
 */
function breach(half: THREE.Vector3, into: HullParts) {
  const r = new Randomizer(BREACH_SEED);
  const back = half.x * BREACH_BULKHEAD;
  const hy = half.y * BREACH_CORE;
  const hz = half.z * BREACH_CORE;
  const { parts, inside } = into;
  // the bulkhead at the back, dark where the light hardly reaches
  inside.push(block(SKIN, hy * 2, hz * 2, back + SKIN / 2));
  for (const wall of WALLS) {
    const span = wall.normal.y ? hz : hy - SKIN;
    const out = (wall.normal.y ? hy : hz) - SKIN / 2;
    for (let at = -span; at < span; ) {
      const width = Math.min(r.range(30, 80), span - at);
      const middle = at + width / 2;
      at += width;
      const end = half.x * r.range(BREACH_EDGE[0], BREACH_EDGE[1]);
      const tip = r.nextFloat() < 0.6 ? r.range(25, 60) : 0;
      parts.push(plate(wall, back, end - tip - back, SKIN, width, out, middle));
      // the lining inside it, torn short of the plating
      inside.push(plate(wall, back, end - tip - back - r.range(10, 80), 3, width - 2, out - SKIN / 2 - 2, middle));
      if (tip) parts.push(plate(wall, end - tip, tip, SKIN, width * r.range(0.6, 1), out, middle + r.range(-0.15, 0.15) * width, (r.nextFloat() < 0.75 ? 1 : -0.7) * r.range(0.25, 0.9)));
    }
  }
  // the decks, each broken off in pieces across, some bent down where they broke
  const storey = (hy * 2) / BREACH_DECK_COUNT;
  for (let k = 1; k < BREACH_DECK_COUNT; k++) {
    const y = -hy + k * storey;
    for (let at = -hz + SKIN; at < hz - SKIN; ) {
      const width = Math.min(r.range(110, 220), hz - SKIN - at);
      const middle = at + width / 2;
      at += width;
      const end = half.x * r.range(BREACH_DECKS[0], BREACH_DECKS[1]);
      const tip = r.nextFloat() < 0.4 ? r.range(30, 70) : 0;
      inside.push(plate(WALLS[0], back, end - tip - back, 6, width, y, middle));
      if (tip) inside.push(plate(WALLS[0], end - tip, tip, 6, width, y, middle, -r.range(0.2, 0.7)));
    }
    // partitions between this deck and the one below, torn short
    for (let p = 0; p < 3; p++) {
      const length = r.range(0.15, 0.6) * half.x;
      inside.push(block(length, storey - 6, 4, back + length / 2, y - storey / 2, r.range(-0.9, 0.9) * hz));
    }
  }
  // the frames inside, bare rings of girders, and outside, as on the rest of the hull
  for (let x = back + 70; x < half.x * 0.5; x += 150) {
    inside.push(block(24, 20, hz * 2 - SKIN * 2, x, hy - SKIN - 10), block(24, 20, hz * 2 - SKIN * 2, x, -hy + SKIN + 10));
    for (const side of [1, -1]) inside.push(block(24, hy * 2 - SKIN * 2, 20, x, 0, side * (hz - SKIN - 10)));
  }
  const rib = (half.z * 0.98 - hz) / 2;
  for (let x = back + 90; x < half.x * 0.55; x += (half.x * 2) / 7) {
    for (const side of [1, -1]) {
      parts.push(block(60, half.y - hy, half.z * 1.96, x, side * (hy + (half.y - hy) / 2)));
      parts.push(block(60, hy * 2, rib * 2, x, 0, side * (hz + rib)));
    }
  }
  // the livery's band along each flank, torn off with the plating
  for (const side of [1, -1]) {
    const end = half.x * r.range(0.3, 0.75);
    into.livery.push(block(end - back, half.y * 0.72, half.z * 0.1, (end + back) / 2, half.y * 0.45, side * half.z * 0.95));
  }
  // pipes and cable runs along the ceiling and the flanks, broken off and sagging out of the breach
  for (let p = 0; p < 8; p++) {
    const wall = WALLS[p % 4];
    const span = wall.normal.y ? hz : hy;
    const end = half.x * r.range(0.5, 0.97);
    const sag = r.range(40, 70);
    const out = (wall.normal.y ? hy : hz) - SKIN - 12;
    const at = r.range(-0.8, 0.8) * span;
    inside.push(plate(wall, back, end - sag - back, 8, 8, out, at), plate(wall, end - sag, sag, 8, 8, out, at, -r.range(0.3, 1)));
  }
}

/**
 * The keel's girder that still spans the gap between the halves (see README, The Derelict): laid
 * out at its true size (scale 1, units) in segments of KEEL_HALF, a square lattice 12 m across of
 * four chords, a ring of girders every 10 m and a diagonal across each face of each bay, 60 m a
 * segment; HULL_BOXES from KEEL_TYPE on, whole and ravaged (a chord broken through and bent,
 * members missing, its plating torn). The sections are grown SECTION_SCALE-fold.
 */
const SECTION_SCALE = 7;
/** A chord's thickness and a lattice member's (units, 1.1 m and 0.7 m). */
const CHORD = 22;
const MEMBER = 14;
const KEEL_BAYS = 6;

/** The keel's four chords along a segment (`half`, units); a ravaged one has one broken through, its ends bent off line. */
function keelChords(half: THREE.Vector3, ravaged: boolean): THREE.BufferGeometry[] {
  const chords: THREE.BufferGeometry[] = [];
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  corners.forEach(([y, z], k) => {
    const cy = y * (half.y - CHORD / 2);
    const cz = z * (half.z - CHORD / 2);
    if (!ravaged || k !== 3) {
      chords.push(block(half.x * 2, CHORD, CHORD, 0, cy, cz));
      return;
    }
    // broken a little off the middle, both stubs bent inwards where they tore
    chords.push(block(half.x - 70, CHORD, CHORD, -half.x / 2 - 35, cy, cz));
    chords.push(rotateZ(new THREE.BoxGeometry(60, CHORD, CHORD).translate(30, 0, 0), 0.5).translate(-70, cy, cz).toNonIndexed());
    chords.push(block(half.x - 110, CHORD, CHORD, half.x / 2 + 55, cy, cz));
    chords.push(rotateZ(new THREE.BoxGeometry(50, CHORD, CHORD).translate(-25, 0, 0), -0.6).translate(110, cy, cz).toNonIndexed());
  });
  return chords;
}

/**
 * A segment of the keel's girder (`half`, units), whole or `ravaged`: chords, rings and a
 * diagonal across each face of each bay, plating over part of it, pipes and a cable run inside,
 * carrying nothing; all of it within the segment's box, its collider.
 */
function keel(half: THREE.Vector3, into: HullParts, ravaged: boolean) {
  const r = new Randomizer(BREACH_SEED + (ravaged ? 2 : 1));
  const { parts, inside } = into;
  parts.push(...keelChords(half, ravaged));
  const bay = (half.x * 2 - MEMBER) / KEEL_BAYS;
  const ring = (k: number) => -half.x + MEMBER / 2 + k * bay;
  const y = half.y - CHORD / 2;
  const z = half.z - CHORD / 2;
  for (let k = 0; k <= KEEL_BAYS; k++) {
    const x = ring(k);
    parts.push(block(MEMBER, MEMBER, z * 2, x, y), block(MEMBER, MEMBER, z * 2, x, -y));
    parts.push(block(MEMBER, y * 2, MEMBER, x, 0, z), block(MEMBER, y * 2, MEMBER, x, 0, -z));
  }
  for (let k = 0; k < KEEL_BAYS; k++) {
    const middle = (ring(k) + ring(k + 1)) / 2;
    const zig = k % 2 ? 1 : -1;
    for (let face = 0; face < 4; face++) {
      // a ravaged segment lost some of its members
      if (ravaged && r.nextFloat() < 0.3) continue;
      const side = face % 2 ? 1 : -1;
      if (face < 2) {
        // across a flank: in its x-y plane
        const angle = atan2(zig * y * 2, bay);
        parts.push(rotateZ(new THREE.BoxGeometry(hypot(bay, y * 2), MEMBER, MEMBER), angle).translate(middle, 0, side * z).toNonIndexed());
      } else {
        // across the top or the bottom: in its x-z plane
        const angle = atan2(zig * z * 2, bay);
        parts.push(rotateY(new THREE.BoxGeometry(hypot(bay, z * 2), MEMBER, MEMBER), -angle).translate(middle, side * y, 0).toNonIndexed());
      }
    }
  }
  if (ravaged) {
    // plating torn off but for a few plates, one bent off the face
    parts.push(block(bay * 1.6, 6, z * 1.6, ring(1), y + 4, r.range(-0.2, 0.2) * z));
    parts.push(rotateZ(new THREE.BoxGeometry(bay, 6, z * 1.2).translate(bay / 2, 0, 0), -0.35).translate(ring(4), y - 10, 0).toNonIndexed());
  } else {
    // a deck's worth of plating on top, a run of it down one flank
    parts.push(block(bay * 4.2, 6, z * 2 + CHORD, ring(1) + bay * 2.1, y + 4));
    parts.push(block(bay * 2.5, y * 1.4, 6, ring(3) + bay * 1.25, -y * 0.2, z + 4));
  }
  // two pipes and a cable run, sagging between the rings where its hangers tore
  for (const side of [1, -1]) inside.push(block(half.x * 2 - 20, 9, 9, 0, -y + 30, side * 45));
  for (let k = 0; k < KEEL_BAYS; k++) {
    const sag = r.range(20, 60);
    const from = ring(k);
    const angle = atan2(sag, bay / 2);
    const length = hypot(bay / 2, sag);
    inside.push(rotateZ(new THREE.BoxGeometry(length, 5, 5).translate(length / 2, 0, 0), -angle).translate(from, y - 20, -40).toNonIndexed());
    inside.push(rotateZ(new THREE.BoxGeometry(length, 5, 5).translate(-length / 2, 0, 0), angle).translate(from + bay, y - 20, -40).toNonIndexed());
  }
}

/** The keel's segment from afar: its chords and a plate over its top. */
function keelFar(half: THREE.Vector3, ravaged: boolean): THREE.BufferGeometry[] {
  return [...keelChords(half, ravaged), block(half.x * 1.2, 6, half.z * 2 - 4, 0, half.y - 4)];
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
  // the inside of the ship, bared at its torn ends: decks, frames and linings in dull paint
  const inner = plating(0x34373d);
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
      // whole up to a bulkhead short of the middle, torn open from there to the end of the box
      section(half, half.x * BREACH_BULKHEAD, into, false);
      breach(half, into);
    },
    (half, { parts }) => {
      parts.push(block(half.x * 1.2, half.y * 2, half.z * 2, -half.x * 0.4));
      // three nozzles out of the back, cold
      for (const [y, z] of [[0.45, 0], [-0.3, 0.45], [-0.3, -0.45]]) {
        parts.push(rotateZ(new THREE.CylinderGeometry(half.y * 0.32, half.y * 0.48, half.x * 0.8, 8, 1, true), Math.PI / 2).translate(half.x * 0.6, y * half.y, z * half.z).toNonIndexed());
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
    (half, into) => keel(half, into, false),
    (half, into) => keel(half, into, true),
  ];
  const flat = (geometries: THREE.BufferGeometry[]) => mergeGeometries(geometries.map((p) => (p.hasAttribute('uv') ? p.deleteAttribute('uv') : p)));
  // each part takes the plating at its own place, mirrored or not, so neighbors never show the same stretch of it
  const plated = (geometries: THREE.BufferGeometry[], tile: number) =>
    mergeGeometries(
      geometries.map((p) => {
        const uv = boxUv(p, tile).getAttribute('uv');
        const [du, dv, mirror] = [uvs.nextFloat(), uvs.nextFloat(), uvs.nextFloat() < 0.5 ? -1 : 1];
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * mirror + du, uv.getY(i) + dv);
        return p;
      }),
    );
  // the keel's girder is laid out at its true size, the sections grown 7-fold: the plating keeps its true scale on both
  const tileOf = (i: number) => (i >= KEEL_TYPE ? PLATING_TILE * SECTION_SCALE : PLATING_TILE);
  const near = HULL_BOXES.map((half, i) => {
    const into: HullParts = { parts: [], inside: [], livery: [], lights: [], failing: [[], []], glass: [], garden: [], beacons: [], decals: [] };
    builds[i](half, into);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(plated(into.parts, tileOf(i)), half.y < L * 0.05 ? dark : metal));
    if (into.inside.length) group.add(new THREE.Mesh(plated(into.inside, tileOf(i)), inner));
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
  // the keel's girder from afar: its chords and its plating, no lattice (see keelFar)
  const far: THREE.Object3D[] = [];
  for (let i = KEEL_TYPE; i < HULL_BOXES.length; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(plated(keelFar(HULL_BOXES[i], i > KEEL_TYPE), tileOf(i)), metal));
    far[i] = group;
  }
  return { near, far, box: true };
}
