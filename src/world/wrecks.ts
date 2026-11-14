import * as THREE from 'three';
import { raySphere, type Asteroid, type AsteroidField } from './asteroids';
import { Randomizer, textSeed } from '../random';
import { BELT_INNER } from './belt';
import { surfaced, wornSurface, wreckInnards, type Wear } from '../view/surfaces';
import { hazeUniforms } from '../view/haze';
import { contact } from './bodies';
import { atan2, cos, exp, hypot, sin } from '../detmath';
import { setFromAxisAngle, setFromEuler } from '../detthree';

/** A wreck's plating: the old paint of a fighter torn off, blackened, scored and rusting (see wornSurface). */
const TORN: Wear = { rust: 0.7, chips: 0.9, grime: 1, scratches: 0.8, seams: 0.7, stencils: ['07', 'NO STEP'], roughness: 0.7, metalness: 0.3 };
/** A piece's plating repeats about once across it (its geometry is of unit size, see pieceGeometry). */
const WRECK_TILE = 0.9;
/** The innards' tile spans its piece: two or three frames across, besides the ones built under it. */
const INNARDS_TILE = 2;

/**
 * Pieces a destroyed ship breaks into: its hulk (the first, see HULK_MASS) and four plates torn
 * off its skin. The rest of its 60 t (fuel, the reactor's mass burnt, a cloud of small bits that
 * only glint) leaves nothing to collide with.
 */
const PIECES_PER_SHIP = 5;
/** Pieces in the arena at most (twelve ships' worth); the oldest go first. */
const MAX_WRECKS = 60;
/** Glowing edges of fresh wreckage cool down with this time constant (s). */
const GLOW_TIME = 4;
/**
 * The hulk: the drive and the frame it hangs in, torn off behind the cockpit (kg, 24 t, two
 * fifths of the 60 t interceptor), a crumpled section of the hull about 10 m across with the
 * drive's bell on it (its radius HULK_REACH of the ship's).
 */
const HULK_MASS = 24_000;
const HULK_REACH = 0.3;
/** A plate's radius as a share of the ship's: 1.7 to 3.5 m, a few square meters to 40 of its skin. */
const PLATE_REACH = [0.1, 0.2] as const;
/**
 * A plate's mass per square meter of its area (kg/m²): the armored skin, about 2.5 cm of
 * steel's worth, 200 kg a square meter; a plate weighs 2 to 8 t. Its drawn skin is that thin
 * (PLATE_SKIN, m), the frames torn off with it deeper under it.
 */
const PLATE_AREAL = 200;
const PLATE_SKIN = [0.03, 0.06] as const;
/**
 * How fast the pieces fly apart, on top of the ship's own velocity (units/s): a ship that dies
 * whole (crushed on rock, rammed, its hull breached by the laser, burnt) breaks up slowly, its
 * plates drifting off at 2 to 8 m/s; one whose reactor goes critical, a warhead, a self-destruct
 * or a nova throws them at 20 to 40 m/s. The hulk takes a sixth of a plate's kick. The kicks are
 * evened out by the pieces' masses, so their momentum together stays the ship's.
 */
const DRIFT_SPREAD = [40, 160] as const;
const BLAST_SPREAD = [400, 800] as const;
const HULK_KICK = 1 / 6;
/** Laser hits a plate takes before it shatters, and the hulk (a beam holes a plate, the hulk is the drive's own block). */
const PLATE_HITS = 2;
const HULK_HITS = 6;
/** A plate or the hulk meeting rock (or a world's ground) this fast or faster crumples there and is gone (units/s, 30 m/s); slower it clangs off it, keeping WRECK_ON_ROCK of the speed it met it at. */
export const WRECK_CRUMPLE = 600;
const WRECK_ON_ROCK = 0.2;
/** What a laser's hit gives a piece it does not shatter (kg·units/s: a plate of 4 t about 1 m/s): the metal it boils off pushes it along the beam. */
const LASER_SHOVE = 80_000;
/** Meters per world unit. */
const METERS = 0.05;
/** A piece flies in fixed steps of its own age (s), so its path is the same at any frame rate. */
const WRECK_STEP = 1 / 30;

export interface Wreck {
  /** "<ship id>.<death count>.<piece>": the same piece on every browser. */
  id: string;
  /** Its skin's and its innards' materials, shared by the pieces of its ship (see pieceGeometry). */
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
  velocity: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinRate: number;
  radius: number;
  /** Its mass (kg): the hulk HULK_MASS, a plate by its area (see PLATE_AREAL). */
  mass: number;
  /** Whether it is the hulk (the first piece of a ship). */
  hulk: boolean;
  /** Laser hits it still takes before it shatters (see PLATE_HITS). */
  hits: number;
  bornAt: number;
  /** Where its flight stands after `steps` fixed steps of WRECK_STEP since it was born (the mesh shows it on to the frame's moment). */
  at: THREE.Vector3;
  steps: number;
}

/** A piece of wreckage as it travels to a browser that joins: where it is, how it drifts, how long it has glowed (s). */
export type WreckState = { id: string; p: number[]; v: number[]; g: number };

/**
 * A piece's shape as it is built: corners with their normal, texture coordinates, soot (a
 * vertex color the paint is multiplied with) and heat (how much of the glow of a fresh break it
 * shows), in triangles; the skin's (group 0: the outer plating and the torn edges) and the
 * innards' (group 1: the inner face and its frames).
 */
class Shape {
  readonly parts = [new Part(), new Part()];

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const all = (key: 'position' | 'normal' | 'uv' | 'color' | 'heat') => this.parts.flatMap((part) => part[key]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(all('position'), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(all('normal'), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(all('uv'), 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(all('color'), 3));
    geometry.setAttribute('heat', new THREE.Float32BufferAttribute(all('heat'), 1));
    const skin = this.parts[0].heat.length;
    geometry.addGroup(0, skin, 0);
    geometry.addGroup(skin, this.parts[1].heat.length, 1);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** A corner of a piece's shape. */
type Corner = { p: THREE.Vector3; n: THREE.Vector3; u: number; v: number; soot: number; heat: number };

class Part {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly uv: number[] = [];
  readonly color: number[] = [];
  readonly heat: number[] = [];

  triangle(...corners: [Corner, Corner, Corner]) {
    for (const c of corners) {
      this.position.push(c.p.x, c.p.y, c.p.z);
      this.normal.push(c.n.x, c.n.y, c.n.z);
      this.uv.push(c.u, c.v);
      this.color.push(c.soot, c.soot * 0.94, c.soot * 0.88);
      this.heat.push(c.heat);
    }
  }

  /** A quad, its winding turned to face where its first corner's normal points. */
  quad(a: Corner, b: Corner, c: Corner, d: Corner) {
    const facing = edge.subVectors(b.p, a.p).cross(other.subVectors(c.p, a.p)).dot(a.n);
    if (facing < 0) [b, d] = [d, b];
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }
}

const edge = new THREE.Vector3();
const other = new THREE.Vector3();

/** The rings a piece's faces are laid in, from its middle (0) to the torn edge (1), with the soot on the plating there and the glow of the break. */
const RINGS = [
  { at: 0, soot: 1, heat: 0 },
  { at: 0.55, soot: 0.8, heat: 0 },
  { at: 0.92, soot: 0.35, heat: 0 },
  { at: 1, soot: 0.15, heat: 1 },
];

/**
 * A piece of a fighter's hull torn out by the blast, of unit size (scaled to its radius): a
 * slightly curved plate, its outline jagged with teeth and notches and bent up and down where
 * it tore, a skin of the fighter's worn paint on the outside, sooted towards the break, the
 * hull's innards on the inside with two stringers and a frame torn off with it; the torn edges
 * and the frames' ends glow with the heat of the break. It reaches about as far as the radius
 * its collisions take (a little beyond, at its teeth), as a plate thinner than it is wide.
 */
function pieceGeometry(r: Randomizer, thick: number): THREE.BufferGeometry {
  const shape = new Shape();
  const [skin, innards] = shape.parts;
  const corners = 11 + Math.floor(r.range(0, 4));
  const stretch = r.range(0.85, 1.1);
  const bow = r.range(0.04, 0.09);
  const outline = Array.from({ length: corners }, (_, i) => {
    const angle = ((i + r.range(-0.3, 0.3)) / corners) * Math.PI * 2;
    // every other corner a tooth's root, now and then a notch torn deep
    const reach = r.range(0.75, 1.15) * (i % 2 ? r.range(0.7, 0.88) : 1) * (r.nextFloat() < 0.15 ? 0.65 : 1);
    return { x: cos(angle) * reach * stretch, z: sin(angle) * reach, bend: r.range(-0.07, 0.07) };
  });
  // the plate's surface: bowed as a hull is, its normal from that bow
  const surface = (x: number, z: number) => -bow * (x * x + z * z);
  const corner = (x: number, z: number, side: number, ring: (typeof RINGS)[number], bend: number): Corner => ({
    p: new THREE.Vector3(x, surface(x, z) + (side * thick) / 2 + bend * ring.at * ring.at * ring.at, z),
    n: new THREE.Vector3(2 * bow * x * side, side, 2 * bow * z * side).normalize(),
    u: x / (side > 0 ? WRECK_TILE : INNARDS_TILE),
    v: z / (side > 0 ? WRECK_TILE : INNARDS_TILE),
    soot: ring.soot,
    heat: ring.heat,
  });
  // the outer face and the inner, ring by ring
  for (const [part, side] of [[skin, 1], [innards, -1]] as const) {
    const ring = RINGS.map((ring) => outline.map((o) => corner(o.x * ring.at, o.z * ring.at, side, ring, o.bend)));
    for (let k = 1; k < RINGS.length; k++) {
      for (let i = 0; i < corners; i++) {
        const j = (i + 1) % corners;
        part.quad(ring[k - 1][i], ring[k][i], ring[k][j], ring[k - 1][j]);
      }
    }
  }
  // the torn edge between them, flat per facet, facing out
  const edgeRing = RINGS[RINGS.length - 1];
  let around = 0;
  for (let i = 0; i < corners; i++) {
    const o = outline[i];
    const q = outline[(i + 1) % corners];
    const quad = [corner(o.x, o.z, 1, edgeRing, o.bend), corner(q.x, q.z, 1, edgeRing, q.bend), corner(q.x, q.z, -1, edgeRing, q.bend), corner(o.x, o.z, -1, edgeRing, o.bend)];
    const normal = new THREE.Vector3().subVectors(quad[1].p, quad[0].p).cross(new THREE.Vector3().subVectors(quad[3].p, quad[0].p)).normalize();
    if (normal.x * (o.x + q.x) + normal.z * (o.z + q.z) < 0) normal.negate();
    const length = hypot(q.x - o.x, q.z - o.z);
    quad.forEach((c, k) => {
      c.n.copy(normal);
      c.u = (around + (k === 1 || k === 2 ? length : 0)) / WRECK_TILE;
      c.v = c.p.y / WRECK_TILE;
      c.soot = 0.45;
      // hottest along the skin, where the metal tore
      c.heat = k < 2 ? 1 : 0.6;
    });
    skin.quad(quad[0], quad[1], quad[2], quad[3]);
    around += length;
  }
  // two stringers along the plate and a frame across it, under the inner face, their torn ends glowing
  const reach = Math.min(...outline.map((o) => hypot(o.x, o.z))) * 0.9;
  const ribs = [
    { along: 'x' as const, at: r.range(0.22, 0.4), half: reach * r.range(0.7, 1) },
    { along: 'x' as const, at: -r.range(0.22, 0.4), half: reach * r.range(0.7, 1) },
    { along: 'z' as const, at: r.range(-0.2, 0.2), half: reach * r.range(0.6, 1) },
  ];
  // their tops just inside the plate, where it bows away from them too
  for (const rib of ribs) beam(innards, rib.along, rib.at, rib.half, -thick / 2 + 0.01, r.range(0.1, 0.17));
  return shape.geometry();
}

/** A frame of the hull's structure under a piece: a box `half` to either side along x or z, its top at `top`, `depth` deep, 0.06 wide; its two ends glow as the edges do. */
function beam(part: Part, along: 'x' | 'z', at: number, half: number, top: number, depth: number) {
  // a point of the box in its own axes: s along it, w across (both -1..1), h down (0 at its top, 1 at its bottom)
  const point = (s: number, w: number, h: number) => {
    const y = top - h * depth;
    return along === 'x' ? new THREE.Vector3(s * half, y, at + w * 0.03) : new THREE.Vector3(at + w * 0.03, y, s * half);
  };
  const middle = point(0, 0, 0.5);
  // its bottom, its two sides and its two ends (its top lies inside the plate), each with its four corners in turn
  const faces: { end: boolean; c: [number, number, number][] }[] = [
    { end: false, c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { end: false, c: [[-1, 1, 0], [1, 1, 0], [1, 1, 1], [-1, 1, 1]] },
    { end: false, c: [[-1, -1, 0], [1, -1, 0], [1, -1, 1], [-1, -1, 1]] },
    { end: true, c: [[1, -1, 0], [1, 1, 0], [1, 1, 1], [1, -1, 1]] },
    { end: true, c: [[-1, -1, 0], [-1, 1, 0], [-1, 1, 1], [-1, -1, 1]] },
  ];
  for (const { end, c } of faces) {
    const points = c.map(([s, w, h]) => point(s, w, h));
    const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(4);
    const normal = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[3], points[0])).normalize();
    if (normal.dot(center.sub(middle)) < 0) normal.negate();
    const corners = points.map((p): Corner => ({ p, n: normal.clone(), u: (along === 'x' ? p.x : p.z) / INNARDS_TILE, v: (end ? p.y : along === 'x' ? p.z + p.y : p.x + p.y) / INNARDS_TILE, soot: end ? 0.4 : 0.85, heat: end ? 1 : 0 }));
    part.quad(corners[0], corners[1], corners[2], corners[3]);
  }
}

/** Faces around the hulk's crumpled hull, and its rings along it from the drive's end to the torn one (x, its soot and its glow). */
const HULK_SIDES = 12;
const HULK_RINGS = [
  { x: -0.72, soot: 0.9, heat: 0 },
  { x: -0.2, soot: 1, heat: 0 },
  { x: 0.35, soot: 0.7, heat: 0 },
  { x: 0.62, soot: 0.3, heat: 0.4 },
  { x: 0.78, soot: 0.15, heat: 1 },
];

/**
 * A fighter's hulk, of unit size (scaled to its radius): the drive and the frame it hangs in,
 * the aft section of the hull torn off behind the cockpit. A crumpled tube of the fighter's
 * worn paint, dented in where it was struck, its innards on the inside, the forward end torn
 * jagged and glowing where it broke, the drive's bell flaring from the other end; it reaches
 * about as far as the radius its collisions take.
 */
function hulkGeometry(r: Randomizer): THREE.BufferGeometry {
  const shape = new Shape();
  const [skin, innards] = shape.parts;
  const radius = r.range(0.42, 0.5);
  // the crumple: each face's corner pushed in or out a little, one side dented deep
  const dent = r.range(0, Math.PI * 2);
  const crumple = HULK_RINGS.map((ring, k) => Array.from({ length: HULK_SIDES }, (_, i) => {
    const angle = (i / HULK_SIDES) * Math.PI * 2;
    const toward = cos(angle - dent);
    const dented = toward > 0.6 ? 1 - 0.35 * (toward - 0.6) * (k / (HULK_RINGS.length - 1)) * 2.5 : 1;
    return { x: ring.x + (k === HULK_RINGS.length - 1 ? r.range(-0.14, 0.1) : r.range(-0.02, 0.02)), reach: radius * r.range(0.9, 1.06) * dented };
  }));
  const corner = (k: number, i: number, side: number): Corner => {
    const angle = (i / HULK_SIDES) * Math.PI * 2;
    const c = crumple[k][i % HULK_SIDES];
    const reach = c.reach + (side > 0 ? 0 : -0.04);
    const ring = HULK_RINGS[k];
    return {
      p: new THREE.Vector3(c.x, cos(angle) * reach, sin(angle) * reach),
      n: new THREE.Vector3(0, cos(angle) * side, sin(angle) * side),
      u: c.x / WRECK_TILE,
      v: (angle * radius) / (side > 0 ? WRECK_TILE : INNARDS_TILE),
      soot: ring.soot,
      heat: ring.heat,
    };
  };
  for (const [part, side] of [[skin, 1], [innards, -1]] as const) {
    for (let k = 1; k < HULK_RINGS.length; k++) {
      for (let i = 0; i < HULK_SIDES; i++) part.quad(corner(k - 1, i, side), corner(k, i, side), corner(k, i + 1, side), corner(k - 1, i + 1, side));
    }
  }
  // the torn end's rim between skin and innards, glowing
  const last = HULK_RINGS.length - 1;
  for (let i = 0; i < HULK_SIDES; i++) {
    const quad = [corner(last, i, 1), corner(last, i + 1, 1), corner(last, i + 1, -1), corner(last, i, -1)];
    for (const c of quad) {
      c.n.set(1, 0, 0);
      c.heat = 1;
      c.soot = 0.4;
    }
    skin.quad(quad[0], quad[1], quad[2], quad[3]);
  }
  // the drive's bell: from a throat inside the aft end, flaring out behind it, sooted from its fire
  const throat = radius * 0.45;
  const mouth = radius * 0.8;
  const bell = (x: number, reach: number, i: number, inside: boolean): Corner => {
    const angle = (i / HULK_SIDES) * Math.PI * 2;
    const flare = atan2(mouth - throat, 0.22);
    const side = inside ? -1 : 1;
    return {
      p: new THREE.Vector3(x, cos(angle) * reach, sin(angle) * reach),
      n: new THREE.Vector3(-sin(flare) * side, cos(angle) * cos(flare) * side, sin(angle) * cos(flare) * side),
      u: x / WRECK_TILE,
      v: (angle * reach) / WRECK_TILE,
      soot: inside ? 0.25 : 0.6,
      heat: 0,
    };
  };
  for (let i = 0; i < HULK_SIDES; i++) {
    for (const inside of [false, true]) skin.quad(bell(-0.7, throat, i, inside), bell(-0.95, mouth, i, inside), bell(-0.95, mouth, i + 1, inside), bell(-0.7, throat, i + 1, inside));
  }
  // the aft bulkhead closing the hull round the bell's throat
  for (let i = 0; i < HULK_SIDES; i++) {
    const a = corner(0, i, 1);
    const b = corner(0, i + 1, 1);
    const ta = bell(-0.72, throat, i, false);
    const tb = bell(-0.72, throat, i + 1, false);
    for (const c of [a, b, ta, tb]) c.n.set(-1, 0, 0);
    skin.quad(a, ta, tb, b);
  }
  // two frames across the inside, their torn ends glowing at the break
  for (const at of [r.range(-0.4, -0.1), r.range(0.1, 0.4)]) beam(innards, 'z', at, radius * 0.85, radius * 0.2, r.range(0.08, 0.12));
  return shape.geometry();
}

/**
 * The glow of a fresh break, only where its `heat` attribute says (the torn edges and the
 * frames' ends, fading over a thin rim of the plating): the material's emissive times the
 * square of that heat. Shared program for every wreck's materials.
 */
function heated<M extends THREE.MeshStandardMaterial>(material: M): M {
  material.onBeforeCompile = (shader) => {
    hazeUniforms(shader, material);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float heat;\nvarying float vHeat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHeat = heat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeat;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vHeat * vHeat;');
  };
  material.customProgramCacheKey = () => 'wreck-heat';
  return material;
}

const gravity = new THREE.Vector3();
const apart = new THREE.Vector3();
const plateA = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: 1 };
const plateB = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: 1 };
/** Two torn plates meeting keep this share of the speed they met at: bent steel, not rubber. */
const WRECK_RESTITUTION = 0.3;
/** The pieces of one ship pass each other this long after it broke (s), flying apart from the same spot. */
const SIBLING_SECONDS = 2;
/** The plates meet on the last this many steps of the grid of a long gap at most (1 s, see Wrecks.update). */
const MEET_STEPS = 30;

/** Flies a plate up to game time `time` in the fixed steps of its age, falling into a well or towards the ground of a place, where there is one. */
function fly(wreck: Wreck, time: number, field: AsteroidField) {
  const age = time - wreck.bornAt;
  while ((wreck.steps + 1) * WRECK_STEP <= age) {
    wreck.velocity.addScaledVector(field.gravity(wreck.at, gravity), WRECK_STEP);
    wreck.at.addScaledVector(wreck.velocity, WRECK_STEP);
    wreck.steps++;
  }
}

/** Where a plate flown up to `time` is then (into `target`): its last fixed step and on. */
function at(wreck: Wreck, time: number, target: THREE.Vector3): THREE.Vector3 {
  return target.copy(wreck.at).addScaledVector(wreck.velocity, time - wreck.bornAt - wreck.steps * WRECK_STEP);
}
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();
const normal = new THREE.Vector3();
const surface = new THREE.Vector3();
const surfacePoint = new THREE.Vector3();
const relativeVelocity = new THREE.Vector3();
const touching = new THREE.Vector3();
const spin = new THREE.Quaternion();
/** The glow of a break as it cools (linear colors): orange the moment it tore, a dull red as it fades, never white. */
const HOT = new THREE.Color(1, 0.26, 0.03);
const DULL = new THREE.Color(0.6, 0.04, 0.01);
/** The glow's strength the moment a piece tore off (it falls with GLOW_TIME). */
const GLOW = 1.2;

/**
 * Debris of destroyed ships. It keeps drifting with the wreck's momentum, falls towards the
 * asteroids, rips open hulls that run into it and blocks laser beams. The pieces are seeded
 * by the destroyed ship and its death count, so every client breaks a ship into the same
 * pieces, and they fly in fixed steps of their age (WRECK_STEP) and meet each other on a grid of
 * game time as far apart, so their paths and meetings do not depend
 * on the frame rate. Online, the owner of the destroyed ship tells where it broke up, a piece
 * shot or rammed goes on every screen (see Game.remoteWreck), and a browser that joins takes
 * the pieces in flight. The paths still differ a little between browsers (where each saw the
 * ship break up, its own game clock, the rocks' gravity at its own field time), and each
 * browser takes a piece away on its own where it grinds into rock, falls into a massive body or
 * drifts into the belt, without telling the others: the debris is about the same everywhere,
 * not exactly.
 */
export class Wrecks {
  readonly group = new THREE.Group();
  readonly list: Wreck[] = [];

  /**
   * Breaks the ship `id` (its `deaths`th clone) up at `position`, flying at `velocity`, its hit
   * radius `shipRadius`: the hulk and the plates (see PIECES_PER_SHIP), seeded alike on every
   * browser, flying apart slowly or, `blast` (its reactor gone critical, a warhead, a
   * self-destruct, a nova), fast and glowing bright; their momentum together is the ship's.
   */
  spawn(id: string, deaths: number, position: THREE.Vector3, velocity: THREE.Vector3, shipRadius: number, now: number, blast = false) {
    const r = new Randomizer(textSeed(`${id}#${deaths}`));
    // the pieces of one ship cool down together: they share their materials
    const materials = [
      heated(new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(13, TORN), 1), color: 0x80847a, emissive: HOT, vertexColors: true })),
      heated(new THREE.MeshStandardMaterial({ ...surfaced(wreckInnards(), 1), emissive: HOT, vertexColors: true })),
    ];
    materials[0].userData.pieces = PIECES_PER_SHIP;
    // a ship crushed whole tears cold, one blown apart hot
    for (const material of materials) material.userData.heat = blast ? 1 : 0.35;
    const [slow, fast] = blast ? BLAST_SPREAD : DRIFT_SPREAD;
    const born: Wreck[] = [];
    for (let i = 0; i < PIECES_PER_SHIP; i++) {
      const hulk = i === 0;
      const radius = shipRadius * (hulk ? HULK_REACH : r.range(PLATE_REACH[0], PLATE_REACH[1]));
      // its shape and how it is turned from a stream of its own: how a piece looks never moves where it flies
      const look = new Randomizer(textSeed(`${id}#${deaths}.${i}`));
      const meters = radius * METERS;
      const geometry = hulk ? hulkGeometry(look) : pieceGeometry(look, look.range(PLATE_SKIN[0], PLATE_SKIN[1]) / meters);
      const mesh = new THREE.Mesh(geometry, materials);
      setFromEuler(mesh.quaternion, look.range(0, Math.PI * 2), look.range(0, Math.PI * 2), look.range(0, Math.PI * 2));
      mesh.scale.setScalar(radius);
      const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      mesh.position.copy(position).addScaledVector(direction, hulk ? 0 : shipRadius * 0.4);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const piece: Wreck = {
        id: `${id}.${deaths}.${i}`,
        mesh,
        velocity: direction.multiplyScalar(r.range(slow, fast) * (hulk ? HULK_KICK : 1)),
        spinAxis: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
        spinRate: r.range(0.5, 3) * (hulk ? 0.2 : 1),
        radius,
        mass: hulk ? HULK_MASS : Math.PI * meters * meters * PLATE_AREAL,
        hulk,
        hits: hulk ? HULK_HITS : PLATE_HITS,
        bornAt: now,
        at: mesh.position.clone(),
        steps: 0,
      };
      born.push(piece);
      this.list.push(piece);
    }
    // the kicks evened out by mass: together the pieces keep the ship's momentum
    const mean = apart.set(0, 0, 0);
    let mass = 0;
    for (const piece of born) {
      mean.addScaledVector(piece.velocity, piece.mass);
      mass += piece.mass;
    }
    mean.divideScalar(mass);
    for (const piece of born) piece.velocity.sub(mean).add(velocity);
    while (this.list.length > MAX_WRECKS) this.remove(this.list[0]);
  }

  /** A laser hit on `wreck`: whether it shatters now (a plate after PLATE_HITS, the hulk after HULK_HITS); a hit that does not shatters it shoves it a little along the beam's `direction` (unit). */
  hit(wreck: Wreck, direction: THREE.Vector3): boolean {
    wreck.hits--;
    if (wreck.hits <= 0) return true;
    wreck.velocity.addScaledVector(direction, LASER_SHOVE / wreck.mass);
    return false;
  }

  update(dt: number, now: number, field: AsteroidField, solid: (position: THREE.Vector3, radius: number) => boolean = () => false) {
    // the plates meet on a grid of game time WRECK_STEP apart, each flown up to it first, so
    // they meet at the same moments and places whatever the frames; a long gap (a tab in the
    // background) only on its last steps
    const last = Math.floor(now / WRECK_STEP);
    if (this.tick === null || last < this.tick || last - this.tick > MEET_STEPS) {
      // from the step a fresh piece was born on, so the first frame's length never skips its first steps
      const born = this.list.reduce((first, wreck) => Math.min(first, Math.floor(wreck.bornAt / WRECK_STEP)), last - 1);
      this.tick = Math.max(last - MEET_STEPS, born);
    }
    for (let k = this.tick + 1; k <= last; k++) {
      const time = k * WRECK_STEP;
      for (const wreck of this.list) fly(wreck, time, field);
      this.meet(time);
      // a piece that meets rock (or a world's ground) clangs off it slowly and crumples there fast
      for (let i = this.list.length - 1; i >= 0; i--) if (this.onRock(this.list[i], time, field)) this.remove(this.list[i]);
    }
    this.tick = last;
    // backwards, so removing a piece does not skip the next
    for (let i = this.list.length - 1; i >= 0; i--) {
      const wreck = this.list[i];
      const { mesh } = wreck;
      const age = now - wreck.bornAt;
      // flown on the grid alone (see above), shown on to the frame's moment
      fly(wreck, last * WRECK_STEP, field);
      at(wreck, now, mesh.position);
      mesh.quaternion.premultiply(setFromAxisAngle(spin, wreck.spinAxis, wreck.spinRate * dt));
      // the break cools: its glow fades and reddens
      const glow = exp(-age / GLOW_TIME);
      for (const material of mesh.material) {
        material.emissive.lerpColors(DULL, HOT, glow);
        material.emissiveIntensity = GLOW * glow * (material.userData.heat ?? 1);
      }
      // a piece that hits the armor of what else stands in the field (the President's
      // battleship, millions of times its mass) crumples on it; one that falls into the
      // arena's massive body is gone, and so is one that drifts off into the belt, and one that
      // hits what `solid` says (a ring's housing, a sponsor core, a comet's head)
      if (field.obstacle?.touches(mesh.position, wreck.radius) || field.insideWell(mesh.position, wreck.radius) || mesh.position.lengthSq() > BELT_INNER * BELT_INNER || solid(mesh.position, wreck.radius)) this.remove(wreck);
    }
  }

  /**
   * A piece where its flight stands at `time` (on the grid of WRECK_STEP) touching the field's
   * rock or a world's ground: pushed out onto its surface, it clangs off it keeping
   * WRECK_ON_ROCK of the speed it met it at (the surface's own motion counted); met at
   * WRECK_CRUMPLE or faster, it crumples (true: it is gone).
   */
  private onRock(wreck: Wreck, time: number, field: AsteroidField): boolean {
    if (wreck.bornAt > time) return false;
    at(wreck, time, touching);
    const rock: Asteroid | null = field.overlap(touching, wreck.radius);
    if (!rock) return false;
    position.copy(touching);
    if (!field.resolve(rock, position, wreck.radius, normal)) return false;
    field.surfaceVelocity(rock, surfacePoint.copy(position).addScaledVector(normal, -wreck.radius), surface);
    const into = relativeVelocity.subVectors(wreck.velocity, surface).dot(normal);
    if (-into >= WRECK_CRUMPLE) return true;
    // out by as much as it lay in, along its flight's fixed steps
    wreck.at.add(position.sub(touching));
    if (into < 0) wreck.velocity.addScaledVector(normal, -(1 + WRECK_ON_ROCK) * into);
    return false;
  }

  /** The last step of the grid the plates met on (see update), null before the first. */
  private tick: number | null = null;

  /**
   * Two pieces of wreckage that touch bounce off each other as two bodies of their masses
   * (see world/bodies, contact), keeping WRECK_RESTITUTION of the speed they met at: torn plates
   * clang and tumble on. The pieces of one ship fly apart from where it broke and pass each
   * other for SIBLING_SECONDS.
   */
  private meet(now: number) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.bornAt > now) continue;
      at(a, now, plateA.position);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.bornAt > now) continue;
        const reach = a.radius + b.radius;
        apart.subVectors(plateA.position, at(b, now, plateB.position));
        const distance = apart.length();
        if (distance >= reach || distance < 1e-6) continue;
        if (now - Math.max(a.bornAt, b.bornAt) < SIBLING_SECONDS && a.id.slice(0, a.id.lastIndexOf('.')) === b.id.slice(0, b.id.lastIndexOf('.'))) continue;
        apart.divideScalar(distance);
        plateA.mass = a.mass;
        plateB.mass = b.mass;
        plateA.velocity.copy(a.velocity);
        plateB.velocity.copy(b.velocity);
        if (contact(plateA, plateB, apart, WRECK_RESTITUTION, 0) <= 0) continue;
        a.velocity.copy(plateA.velocity);
        b.velocity.copy(plateB.velocity);
        // apart by half the overlap each, along their flights' fixed steps
        a.at.addScaledVector(apart, (reach - distance) / 2);
        b.at.addScaledVector(apart, -(reach - distance) / 2);
        at(a, now, plateA.position);
      }
    }
  }

  /** First wreck along a ray, with the distance along the ray. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { wreck: Wreck; distance: number } | null {
    let best: { wreck: Wreck; distance: number } | null = null;
    for (const wreck of this.list) {
      const distance = raySphere(origin, direction, wreck.mesh.position, wreck.radius);
      if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { wreck, distance };
    }
    return best;
  }

  /** First wreck touching a sphere. */
  overlap(center: THREE.Vector3, radius: number): Wreck | null {
    for (const wreck of this.list) {
      const reach = wreck.radius + radius;
      if (wreck.mesh.position.distanceToSquared(center) < reach * reach) return wreck;
    }
    return null;
  }

  find(id: string): Wreck | null {
    return this.list.find((wreck) => wreck.id === id) ?? null;
  }

  /** The pieces in flight, for a browser that joins a running tournament. */
  snapshot(now: number): WreckState[] {
    return this.list.map((wreck) => ({
      id: wreck.id,
      p: wreck.mesh.position.toArray().map(Math.round),
      v: wreck.velocity.toArray().map(Math.round),
      g: +(now - wreck.bornAt).toFixed(2),
    }));
  }

  /** Takes the pieces of a snapshot: each ship's pieces come from their seed again, then move to where the snapshot has them. */
  restore(states: readonly WreckState[], shipRadius: number, now: number) {
    this.clear();
    const wanted = new Map(states.map((state) => [state.id, state]));
    const ships = new Set<string>();
    for (const state of states) {
      const match = /^((.+)\.(\d+))\.\d+$/.exec(state.id);
      if (!match || ships.has(match[1])) continue;
      ships.add(match[1]);
      this.spawn(match[2], Number(match[3]), position.fromArray(state.p), velocity.fromArray(state.v), shipRadius, now);
      // the pieces gone in the snapshot go at once, so the cap on pieces never takes wanted ones
      for (const wreck of [...this.list]) if (!wanted.has(wreck.id)) this.remove(wreck);
    }
    for (const wreck of this.list) {
      const state = wanted.get(wreck.id)!;
      wreck.mesh.position.fromArray(state.p);
      wreck.at.fromArray(state.p);
      wreck.velocity.fromArray(state.v);
      // its steps go on from the age it has in the snapshot
      wreck.bornAt = now - state.g;
      wreck.steps = Math.floor(state.g / WRECK_STEP);
      wreck.at.addScaledVector(wreck.velocity, wreck.steps * WRECK_STEP - state.g);
    }
  }

  remove(wreck: Wreck) {
    const index = this.list.indexOf(wreck);
    if (index < 0) return;
    this.list.splice(index, 1);
    this.group.remove(wreck.mesh);
    wreck.mesh.geometry.dispose();
    const materials = wreck.mesh.material;
    if (--materials[0].userData.pieces <= 0) for (const material of materials) material.dispose();
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
  }
}
