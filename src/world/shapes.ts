import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { canvas, toTexture } from '../view/textures';
import { boxUv, ravagedSurface, signTexture, solarCells, surfaced, wornSurface, type Wear } from '../view/surfaces';
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

/**
 * The plating of what broke in battle (see ravagedSurface): craters, burns with their heat
 * tint, soot and rust, with `embers` the last embers glowing in a few craters (a fresh wreck;
 * an old one has long gone cold). Little metalness of its own: without a reflected environment,
 * metal turns black on its shadowed side.
 */
function ravaged(color: THREE.ColorRepresentation, embers: boolean): THREE.MeshStandardMaterial {
  const surface = ravagedSurface(DEBRIS_SEED + 1);
  const glow = embers ? { emissive: 0xff6a1a, emissiveMap: surface.glow, emissiveIntensity: 1.6 } : {};
  return new THREE.MeshStandardMaterial({ ...surfaced(surface, RELIEF), color, metalness: 0.35, ...glow });
}

/** How deep seams, rivets and craters look (see surfaced), and how large a tile of plating is (units, 8 m). */
const RELIEF = 2;
const TILE = 160;

/** The paint of the Orbital Freedom Network's stages and fairings: white once, sooted by the burns, its name stenciled on. */
const NETWORK: Wear = { rust: 0.1, chips: 0.4, grime: 0.55, scratches: 0.5, seams: 0.5, stencils: ['ORBITAL FREEDOM', 'OFN-7', 'NO STEP', 'INTERNET FOR ALL'], roughness: 0.6, metalness: 0.15 };

/** The kinds of junk among the templates, in turn: a satellite, an upper stage, a fairing half, a stack, a shredded satellite, a stage, a satellite, a stack with its neon. */
const JUNK_KINDS = ['satellite', 'stage', 'fairing', 'stack', 'shredded', 'stage', 'satellite', 'sign'] as const;

/**
 * The junk of the Orbital Freedom Network, its mega-constellation rotting in orbit, each
 * template pointing along its longest axis: a flat satellite with its single long solar wing
 * (whole, or shredded, its wing broken off in pieces), a spent upper stage with its cold engine
 * bell, half of a payload fairing, a stack of flat satellites that was never released, one of
 * them still lighting the network's name in neon. The solar cells are glossy: as a piece turns,
 * they flash in the sun. Each collides as an ellipsoid hugging its bulk (see SHAPE_FILL).
 */
export function debrisSet(): TemplateSet {
  const r = new Randomizer(DEBRIS_SEED);
  const metal = ravaged(0xffffff, false);
  const paint = new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(DEBRIS_SEED, NETWORK), RELIEF), color: 0xe4e0d8, side: THREE.DoubleSide });
  const cells = new THREE.MeshStandardMaterial({ map: solarCells(), color: 0xc8d4ff, roughness: 0.22, metalness: 0.35 });
  const bus = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.45, metalness: 0.5 });
  const neon = new THREE.MeshBasicMaterial({ map: signTexture('ORBITAL FREEDOM', '#ff4fd8'), color: new THREE.Color().setScalar(1.5), toneMapped: false });
  const near: THREE.Object3D[] = [];
  /** A satellite along x from `x0`: its flat bus, a boom and the single wing reaching on to `x1`, the wing cut into `pieces` (shredded: some missing, the rest bent). */
  const satellite = (length: number, x0: number, x1: number, shredded: boolean, y = 0, frames: THREE.BufferGeometry[] = [], wings: THREE.BufferGeometry[] = []) => {
    const busLength = length * 0.26;
    frames.push(new THREE.BoxGeometry(busLength, length * 0.03, length * 0.15).translate(x0 + busLength / 2, y, 0));
    frames.push(new THREE.BoxGeometry(length * 0.04, length * 0.008, length * 0.008).translate(x0 + busLength + length * 0.02, y, 0));
    const start = x0 + busLength + length * 0.04;
    const pieces = shredded ? 4 : 1;
    const piece = (x1 - start) / pieces;
    for (let k = 0; k < pieces; k++) {
      if (shredded && k > 0 && r.nextFloat() < 0.35) continue;
      const wing = new THREE.BoxGeometry(piece * 0.96, length * 0.006, length * 0.14);
      if (shredded) wing.rotateX(r.range(-0.6, 0.6)).rotateZ(r.range(-0.25, 0.25));
      wings.push(wing.translate(start + piece * (k + 0.5), y + (shredded ? r.range(-0.03, 0.03) * length : 0), 0));
    }
    return { frames, wings };
  };
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const length = DEBRIS_SIZE * r.range(1.4, 2.4);
    const kind = JUNK_KINDS[i];
    const group = new THREE.Group();
    const body: THREE.BufferGeometry[] = [];
    let frames: THREE.BufferGeometry[] = [];
    let wings: THREE.BufferGeometry[] = [];
    let bell: THREE.BufferGeometry | null = null;
    if (kind === 'satellite' || kind === 'shredded') {
      ({ frames, wings } = satellite(length, -length / 2, length / 2, kind === 'shredded'));
    } else if (kind === 'stage') {
      // a spent upper stage: tank, interstage ring, a cold engine bell at the back
      const radius = length * 0.13;
      body.push(new THREE.CylinderGeometry(radius, radius, length * 0.72, 16).rotateZ(Math.PI / 2).translate(-length * 0.1, 0, 0));
      body.push(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, length * 0.08, 16, 1, true).rotateZ(Math.PI / 2).translate(-length * 0.44, 0, 0));
      bell = new THREE.CylinderGeometry(radius * 0.35, radius * 0.95, length * 0.22, 16, 1, true).rotateZ(Math.PI / 2).translate(length * 0.37, 0, 0);
    } else if (kind === 'fairing') {
      // half of a payload fairing: a shell open on one side, its ogive nose
      const radius = length * 0.2;
      body.push(new THREE.CylinderGeometry(radius, radius, length * 0.6, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(-length * 0.2, 0, 0));
      // (turned the other way, its narrow end ahead: the other half of its circle lies on the shell's side)
      body.push(new THREE.CylinderGeometry(radius * 0.15, radius, length * 0.4, 16, 1, true, Math.PI, Math.PI).rotateZ(-Math.PI / 2).translate(length * 0.3, 0, 0));
    } else {
      // a stack of flat satellites as they were launched, never released, held by four posts
      const layers = 9;
      for (let k = 0; k < layers; k++) {
        const y = (k - (layers - 1) / 2) * length * 0.04;
        const loose = k === layers - 1 ? 0.35 : r.range(-0.04, 0.04);
        frames.push(new THREE.BoxGeometry(length * 0.7, length * 0.025, length * 0.3).rotateY(loose).translate(0, y, 0));
      }
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) frames.push(new THREE.BoxGeometry(length * 0.02, length * 0.4, length * 0.02).translate(x * length * 0.33, 0, z * length * 0.14));
      // the stack's own wing, folded flat on top
      wings.push(new THREE.BoxGeometry(length * 0.66, length * 0.006, length * 0.26).translate(0, length * 0.2, 0));
      if (kind === 'sign') {
        // the network's name, still lit in neon on the stack's flank
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.6, length * 0.15), neon);
        sign.position.set(0, 0, length * 0.155);
        group.add(sign);
      }
    }
    const meshOf = (parts: THREE.BufferGeometry[], material: THREE.Material) => new THREE.Mesh(boxUv(mergeGeometries(parts.map((p) => p.toNonIndexed())), TILE), material);
    const meshes: THREE.Mesh[] = [];
    if (body.length) meshes.push(meshOf(body, paint));
    if (bell) meshes.push(meshOf([bell], metal));
    if (frames.length) meshes.push(meshOf(frames, bus));
    if (wings.length) {
      // the cells' texture runs along the wing, one cell texture per wing's width
      const wing = mergeGeometries(wings.map((p) => p.toNonIndexed()));
      meshes.push(new THREE.Mesh(boxUv(wing, length * 0.14), cells));
    }
    group.add(...meshes);
    const box = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!);
    }
    // centered on its bulk, where the collision ellipsoid sits
    const middle = box.getCenter(new THREE.Vector3());
    for (const part of group.children) part.position.sub(middle);
    const size = box.getSize(new THREE.Vector3());
    // the collision ellipsoid hugs the bulk of the piece, never thinner than a few percent of it
    group.add(collider(new THREE.Vector3(size.x * 0.48, Math.max(size.y * 0.42, length * 0.06), Math.max(size.z * 0.42, length * 0.06)).round()));
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
  const metal = frosted(ravaged(0xb8bec8, false));
  const dark = frosted(ravaged(0x4a4e57, false));
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

  const SECTION = new THREE.Vector3(L * 0.5, L * 0.16, L * 0.14);
  const shapes: [THREE.Vector3, (half: THREE.Vector3, into: HullParts) => void][] = [
    [SECTION, (half, into) => section(half, half.x, into, true)],
    [
      SECTION,
      (half, into) => {
        // the hull ends at 40 % of the length, torn plates reach on to the end of the box
        section(half, half.x * 0.4, into, false);
        for (let k = 0; k < 9; k++) {
          const length = r.range(0.2, 0.6) * half.x;
          into.parts.push(block(length, r.range(10, 30), half.z * r.range(0.4, 1.4), half.x * 0.4 + length / 2, r.range(-0.75, 0.75) * half.y, r.range(-0.3, 0.3) * half.z));
        }
      },
    ],
    [
      new THREE.Vector3(L * 0.22, L * 0.2, L * 0.2),
      (half, { parts }) => {
        parts.push(block(half.x * 1.2, half.y * 2, half.z * 2, -half.x * 0.4));
        // three nozzles out of the back, cold
        for (const [y, z] of [[0.45, 0], [-0.3, 0.45], [-0.3, -0.45]]) {
          parts.push(new THREE.CylinderGeometry(half.y * 0.32, half.y * 0.48, half.x * 0.8, 8, 1, true).rotateZ(Math.PI / 2).translate(half.x * 0.6, y * half.y, z * half.z).toNonIndexed());
        }
      },
    ],
    [
      new THREE.Vector3(L * 0.12, L * 0.3, L * 0.1),
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
    ],
    [
      new THREE.Vector3(L * 0.5, L * 0.04, L * 0.04),
      (half, { parts }) => {
        // a truss: four rails and their struts
        for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(block(half.x * 2, 14, 14, 0, y * (half.y - 7), z * (half.z - 7)));
        for (let x = -half.x; x <= half.x; x += half.x / 10) parts.push(block(10, half.y * 2, 10, x), block(10, 10, half.z * 2, x));
      },
    ],
    [SECTION, painted(5)],
    [SECTION, painted(6)],
    [SECTION, painted(7)],
  ];
  const flat = (geometries: THREE.BufferGeometry[]) => mergeGeometries(geometries.map((p) => (p.hasAttribute('uv') ? p.deleteAttribute('uv') : p)));
  const near = shapes.map(([half, build]) => {
    const into: HullParts = { parts: [], livery: [], lights: [], failing: [[], []], glass: [], garden: [], beacons: [], decals: [] };
    build(half, into);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(boxUv(flat(into.parts), TILE), half.y < L * 0.05 ? dark : metal));
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
