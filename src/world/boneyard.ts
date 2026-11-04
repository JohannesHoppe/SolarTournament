import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { boxUv, hazardSurface, industrialSurface, ravagedSurface, signTexture, solarWing, surfaced, WING_BACK, WING_FRONT, wornSurface } from '../view/surfaces';
import { DEPOT } from '../ship/models';
import { setFromEuler } from '../detthree';
import { acos, atan2, cos, hypot, sin } from '../detmath';
import { BAY_HALF_HEIGHT, BAY_HALF_WIDTH, DEPOT_LAYOUT, DEPOT_PARTS, DEPOT_RADIUS, DEPOT_TYPE, type DepotPart, PAD, PAD_RADIUS, PSYCHE_BELOW, PSYCHE_CENTER, PSYCHE_RADIUS, RACK_BOXES, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, TETHER_TOP, YARD_SEED } from './yard';

/**
 * How the Boneyard on Psyche looks (the campaign's first place; where things stand in
 * world/yard): racks of dead fighters, forty thousand hulls in the yard, of which the field holds
 * the rows around the yard office, and Psyche below, a metal world 226 km across. The racks are
 * field pieces of their own kind ('rack'), solid, colliding as their box.
 */

/** A dead fighter in a rack: about the interceptors' size (units, 35 m long). */
const FIGHTER_LENGTH = 700;
/** Fighters a full rack holds. */
const SLOTS = 6;
/** The cap of Psyche that is built (rad): out to the field's horizon (some 18.6° around the point beneath it) and a little beyond. */
const PSYCHE_CAP = acos(PSYCHE_RADIUS / (PSYCHE_RADIUS + PSYCHE_BELOW)) + 0.04;
/** Psyche lies far beyond most of what flies: it is drawn at this depth (clip space, a share of the way to the far plane), in front of the stars. */
const BEHIND_ALL = 0.99999;
/** Turns a shape lying in the xy plane flat onto the floor (a quarter turn about x), and a plane facing +z out along -x (a quarter turn about y). */
const FLAT = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const FACING_OUT = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);

const block = (x: number, y: number, z: number, cx = 0, cy = 0, cz = 0) => new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed();

/** A dead fighter, low poly: fuselage, cockpit, the two drive bells' housings, stub wings and a fin; nose along -x, lying slightly askew, now and then a wing gone. */
function fighter(r: Randomizer, x: number, y: number, z: number, into: THREE.BufferGeometry[]) {
  const L = FIGHTER_LENGTH;
  const parts = [block(L, L * 0.16, L * 0.2, 0, 0, 0), block(L * 0.3, L * 0.08, L * 0.12, -L * 0.22, L * 0.1, 0)];
  for (const side of [-1, 1]) {
    parts.push(block(L * 0.3, L * 0.14, L * 0.12, L * 0.32, 0, side * L * 0.16));
    if (r.nextFloat() > 0.15) parts.push(block(L * 0.34, L * 0.03, L * 0.4, L * 0.1, -L * 0.02, side * L * 0.3));
  }
  parts.push(block(L * 0.18, L * 0.22, L * 0.025, L * 0.36, L * 0.16, 0));
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(setFromEuler(new THREE.Quaternion(), r.range(-0.05, 0.05), r.range(-0.08, 0.08), r.range(-0.06, 0.06)));
  for (const part of parts) into.push(part.applyMatrix4(turn).translate(x, y, z));
}

const noUv = (geometry: THREE.BufferGeometry) => {
  if (geometry.hasAttribute('uv')) geometry.deleteAttribute('uv');
  return geometry;
};

/**
 * The racks: girders (posts at both ends and at every cradle, rails along top and bottom, cross
 * braces), a cradle under each slot and the fighters in them; a full rack, one with gaps, an
 * empty frame. Each within its collider box (RACK_BOXES), which is its collision shape.
 */
export function rackSet(): TemplateSet {
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(YARD_SEED), 2), color: 0x8a8f96 });
  const paint = new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(YARD_SEED + 1, DEPOT), 2), color: 0x7d8466 });
  const depot = depotLooks();
  const near = RACK_BOXES.map((half, type) => {
    if (type >= DEPOT_TYPE) return depotPart(DEPOT_PARTS[type - DEPOT_TYPE], half, steel, depot);
    const r = new Randomizer(YARD_SEED + 10 + type);
    const girders: THREE.BufferGeometry[] = [];
    const hulls: THREE.BufferGeometry[] = [];
    const slot = RACK_LENGTH / SLOTS;
    for (const y of [-half.y + 20, half.y - 20]) for (const z of [-half.z + 20, half.z - 20]) girders.push(block(RACK_LENGTH, 40, 40, 0, y, z));
    for (let k = 0; k <= SLOTS; k++) {
      const x = -half.x + k * slot;
      for (const z of [-half.z + 20, half.z - 20]) girders.push(block(40, RACK_HEIGHT, 40, x, 0, z));
      girders.push(block(30, 30, RACK_DEPTH, x, half.y - 20, 0), block(30, 30, RACK_DEPTH, x, -half.y + 20, 0));
    }
    for (let k = 0; k < SLOTS; k++) {
      const x = -half.x + (k + 0.5) * slot;
      // a cradle across the rack, and the fighter on it unless the slot stands empty
      girders.push(block(slot * 0.6, 30, RACK_DEPTH * 0.8, x, -half.y * 0.35, 0));
      const filled = type === 0 ? r.nextFloat() > 0.08 : type === 1 ? r.nextFloat() > 0.5 : false;
      if (filled) fighter(r, x, -half.y * 0.35 + FIGHTER_LENGTH * 0.12, 0, hulls);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(boxUv(mergeGeometries(girders.map(noUv)), 400), steel));
    if (hulls.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(hulls.map(noUv)), 400), paint));
    return withCollider(group, half);
  });
  return { near, far: [], box: true };
}

/** The depot's plating: one tile of it every this far (units, 34 m), the scale of its plates of 2 and 4 m. */
const PLATING_TILE = 680;

/** The depot's materials besides the racks' steel: its plating, lit windows, the pad's paint, the lamps, the bay's sign. */
function depotLooks() {
  // the yard's floodlights on its masts light the depot from every side: its plating faintly lit by itself, so its shadow side never goes black
  const steelSurface = industrialSurface(YARD_SEED);
  // the world ship's kind of plating, centuries old and fought over: courses of plates, rivets, hatches, pits and craters, soot, holes punched through; at its true scale (a tile 34 m)
  const hull = ravagedSurface(YARD_SEED + 5);
  const plating = new THREE.MeshStandardMaterial({ map: hull.map, roughnessMap: hull.orm, roughness: 1, metalness: 0.3, normalMap: hull.normal, color: 0xc4bcae, emissive: 0x2c2a26 });
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(1.3), toneMapped: false });
  const hazard = new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 1), emissive: 0x3a3000, emissiveIntensity: 0.6 });
  const pad = new THREE.MeshStandardMaterial({ ...surfaced(steelSurface, 1), color: 0x5d6068, emissive: 0x9098a8, emissiveMap: steelSurface.map, emissiveIntensity: 0.5 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.15).multiplyScalar(3), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false });
  const light = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.9, 1).multiplyScalar(1.6), toneMapped: false });
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('BAY 3', '#ff9d00'), toneMapped: false });
  const office = new THREE.MeshBasicMaterial({ map: signTexture('RASK SALVAGE', '#ff9d00'), toneMapped: false });
  const radiator = new THREE.MeshStandardMaterial({ ...surfaced(steelSurface, 1), color: 0xdde3e8, emissive: 0x23272b });
  const wing = solarWing();
  const solar = new THREE.MeshStandardMaterial({ map: wing.map, roughnessMap: wing.orm, metalnessMap: wing.orm, roughness: 1, metalness: 1, emissive: 0x0a0e18, side: THREE.DoubleSide });
  return { plating, windows, hazard, pad, lamp, beacon, light, sign, office, radiator, solar };
}

/** A lattice within a box along its long axis: four rails at its corners and braces between them every `step` units. */
function lattice(half: THREE.Vector3, step: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const along = half.y > half.x && half.y > half.z ? 'y' : half.x > half.z ? 'x' : 'z';
  const length = half[along] * 2;
  const rail = Math.min(half.x, half.y, half.z) * 0.25;
  const [a, b] = along === 'y' ? ['x', 'z'] : along === 'x' ? ['y', 'z'] : ['x', 'y'];
  const at = (u: number, w: number, s: number) => {
    const p = { x: 0, y: 0, z: 0 };
    p[a as 'x'] = u;
    p[b as 'x'] = w;
    p[along] = s;
    return p;
  };
  const size = (alongSize: number, across: number) => {
    const s = { x: across, y: across, z: across };
    s[along] = alongSize;
    return s;
  };
  for (const u of [-1, 1]) {
    for (const w of [-1, 1]) {
      const p = at(u * (half[a as 'x'] - rail / 2), w * (half[b as 'x'] - rail / 2), 0);
      const s = size(length, rail);
      parts.push(block(s.x, s.y, s.z, p.x, p.y, p.z));
    }
  }
  for (let s = -half[along] + step / 2; s < half[along]; s += step) {
    for (const [width, depth] of [[half[a as 'x'] * 2, rail * 0.6], [rail * 0.6, half[b as 'x'] * 2]]) {
      const p = at(0, 0, s);
      const box = { x: 0, y: 0, z: 0 };
      box[a as 'x'] = width;
      box[b as 'x'] = depth;
      box[along] = rail * 0.6;
      parts.push(block(box.x, box.y, box.z, p.x, p.y, p.z));
    }
  }
  return parts;
}

/** Turns a shape built along y to lie along x, or along z (quarter turns, no trigonometry). */
const Y_TO_X = new THREE.Matrix4().set(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const Y_TO_Z = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const turned = (geometry: THREE.BufferGeometry, axis: 'x' | 'y' | 'z') => (axis === 'x' ? geometry.applyMatrix4(Y_TO_X) : axis === 'z' ? geometry.applyMatrix4(Y_TO_Z) : geometry);
/** The plating's tile on a round module (units): one texture every this far around and along. */
const ROUND_TILE = PLATING_TILE;

/**
 * A round module along `axis`: a plated cylinder `half` long each way of radius `radius`, its ends
 * capped, steel frame rings every 400 units, and (lit) rows of windows in bands along it.
 */
function module(group: THREE.Group, radius: number, half: number, axis: 'x' | 'y' | 'z', looks: ReturnType<typeof depotLooks>, steel: THREE.Material, r: Randomizer, windows: boolean) {
  const shell = new THREE.CylinderGeometry(radius, radius, half * 2, 32, 1, false);
  const uv = shell.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * radius) / ROUND_TILE, (uv.getY(i) * half * 2) / ROUND_TILE);
  group.add(new THREE.Mesh(turned(shell, axis), looks.plating));
  const rings: THREE.BufferGeometry[] = [];
  for (let s = -half + 150; s < half; s += 400) rings.push(new THREE.CylinderGeometry(radius + 14, radius + 14, 40, 32, 1, true).translate(0, s, 0));
  for (const end of [-1, 1]) rings.push(new THREE.CylinderGeometry(radius * 0.55, radius * 0.6, 60, 24).translate(0, end * (half + 30), 0));
  group.add(new THREE.Mesh(turned(mergeGeometries(rings.map(noUv)), axis), steel));
  if (!windows) return;
  const lit: THREE.BufferGeometry[] = [];
  for (let s = -half + 350; s < half - 100; s += 400) {
    for (let k = 0; k < 16; k++) {
      if (r.nextFloat() < 0.55) continue;
      const start = (k / 16) * Math.PI * 2;
      lit.push(new THREE.CylinderGeometry(radius + 3, radius + 3, 50, 2, 1, true, start, (Math.PI * 2) / 48).translate(0, s, 0));
    }
  }
  group.add(new THREE.Mesh(turned(mergeGeometries(lit.map(noUv)), axis), looks.windows));
}

/**
 * One part of the depot within its collider box: the hangar module's plated floor (with the
 * landing pad: a disk ringed in hazard paint, lamps around it, a row of lamps leading in), its
 * ceiling lit from below with the bay's sign over the mouth, its walls and back wall; the round
 * modules (habitats and office tower with lit windows and the office's neon sign, the printer
 * hall, the node with its collar); the truss and the mast (a beacon and a dish on top) as
 * lattices; the radiator wings, pale and ribbed; the solar wings, fields of cells in frames.
 */
function depotPart(part: DepotPart, half: THREE.Vector3, steel: THREE.Material, looks: ReturnType<typeof depotLooks>): THREE.Group {
  const r = new Randomizer(YARD_SEED + 100 + DEPOT_PARTS.indexOf(part));
  const group = new THREE.Group();
  const add = (parts: THREE.BufferGeometry[], material: THREE.Material, tile = 400) => {
    if (parts.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(parts.map(noUv)), tile), material));
  };
  const { shape } = DEPOT_LAYOUT[part];
  const radius = DEPOT_RADIUS[part] ?? 0;
  if (shape === 'box') add([block(half.x * 2, half.y * 2, half.z * 2)], looks.plating, PLATING_TILE);
  if (shape === 'x' || shape === 'y' || shape === 'z') module(group, radius, half[shape], shape, looks, steel, r, part !== 'printer');
  if (shape === 'lattice') add(lattice(half, part === 'truss' ? 400 : 240), steel);
  switch (part) {
    case 'floor': {
      // the pad, its local center where PAD lies: on the floor's top, at the bay's middle
      const top = half.y;
      const local = PAD.clone().sub(DEPOT_LAYOUT.floor.center);
      const disk = new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 12, 48).translate(local.x, top + 6, local.z);
      group.add(new THREE.Mesh(disk, looks.pad));
      const ring = new THREE.RingGeometry(PAD_RADIUS, PAD_RADIUS * 1.25, 48, 1).applyMatrix4(FLAT).translate(local.x, top + 13, local.z);
      const uv = ring.getAttribute('uv');
      const position = ring.getAttribute('position');
      for (let i = 0; i < uv.count; i++) {
        const angle = atan2(position.getZ(i) - local.z, position.getX(i) - local.x);
        const radial = hypot(position.getX(i) - local.x, position.getZ(i) - local.z);
        uv.setXY(i, (angle / (Math.PI * 2)) * 6, (radial - PAD_RADIUS) / (PAD_RADIUS * 0.25));
      }
      group.add(new THREE.Mesh(ring, looks.hazard));
      const lamps: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 12; k++) {
        const angle = (k / 12) * Math.PI * 2;
        lamps.push(block(24, 16, 24, local.x + PAD_RADIUS * 1.35 * cos(angle), top + 8, local.z + PAD_RADIUS * 1.35 * sin(angle)));
      }
      // a row of lamps along the bay's floor from the mouth to the pad, leading in
      for (let x = -half.x + 80; x < local.x - PAD_RADIUS * 1.5; x += 160) for (const z of [-1, 1]) lamps.push(block(30, 12, 30, x, top + 6, z * BAY_HALF_WIDTH * 0.5));
      add(lamps, looks.lamp);
      break;
    }
    case 'ceiling': {
      const panels: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 200; x < half.x; x += 400) for (const z of [-0.5, 0.5]) panels.push(block(200, 8, 300, x, -half.y - 4, z * BAY_HALF_WIDTH));
      add(panels, looks.light);
      // the bay's sign over its mouth, and the frame lamps along its edge
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(800, 200).applyMatrix4(FACING_OUT).translate(-half.x - 6, 0, 0), looks.sign));
      const edge: THREE.BufferGeometry[] = [];
      for (let z = -half.z + 60; z < half.z; z += 240) edge.push(block(20, 20, 40, -half.x - 10, -half.y + 10, z));
      add(edge, looks.lamp);
      break;
    }
    case 'back': {
      // the windows of the office behind the bay, looking into it
      const strips: THREE.BufferGeometry[] = [];
      for (let z = -BAY_HALF_WIDTH + 100; z < BAY_HALF_WIDTH - 100; z += 220) if (r.nextFloat() > 0.25) strips.push(block(8, 60, 160, -half.x - 4, BAY_HALF_HEIGHT * 0.55, z + 80));
      add(strips, looks.windows);
      break;
    }
    case 'node': {
      const ball = new THREE.SphereGeometry(DEPOT_RADIUS.node!, 32, 20);
      const uv = ball.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
      group.add(new THREE.Mesh(ball, looks.plating));
      group.add(new THREE.Mesh(new THREE.TorusGeometry(DEPOT_RADIUS.node! + 10, 24, 6, 48).applyMatrix4(FLAT), steel));
      add([block(60, 60, 60, 0, DEPOT_RADIUS.node! + 20, 0)], looks.beacon);
      break;
    }
    case 'office':
      // the yard's neon sign on the tower's face towards the lane
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(1000, 250).applyMatrix4(FACING_OUT).translate(-radius - 20, half.y * 0.45, 0), looks.office));
      break;
    case 'mast':
      add([block(80, 80, 80, 0, half.y + 40, 0)], looks.beacon);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(260, 20, 8, 0, Math.PI * 2, 0, 0.9).applyMatrix4(Y_TO_X).translate(-60, half.y * 0.5, 0), steel));
      break;
    case 'radiatorUp':
    case 'radiatorDown': {
      add([block(half.x * 2, half.y * 2, half.z * 2)], looks.radiator, 300);
      const ribs: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 50; x < half.x; x += 100) for (const side of [-1, 1]) ribs.push(block(14, half.y * 2 - 40, 10, x, 0, side * (half.z + 5)));
      add(ribs, steel);
      add([block(50, 50, 50, half.x - 40, Math.sign(DEPOT_LAYOUT[part].center.y) * (half.y - 30), 0)], looks.beacon);
      break;
    }
    case 'solarLeft':
    case 'solarRight': {
      // cells in six frames along the wing, on a spar across them
      const cells = 6;
      const width = (half.x * 2) / cells;
      for (let k = 0; k < cells; k++) {
        const x = -half.x + (k + 0.5) * width;
        for (const face of [1, -1]) {
          const plane = new THREE.PlaneGeometry(width - 40, half.z * 2 - 40).applyMatrix4(FLAT);
          if (face < 0) plane.scale(1, -1, 1);
          const uv = plane.getAttribute('uv');
          const [low, high] = face > 0 ? WING_FRONT : WING_BACK;
          for (let i = 0; i < uv.count; i++) uv.setY(i, low + uv.getY(i) * (high - low));
          group.add(new THREE.Mesh(plane.translate(x, face * (half.y + 1), 0), looks.solar));
        }
      }
      add([block(half.x * 2, half.y * 2, 60), ...Array.from({ length: cells + 1 }, (_, k) => block(30, half.y * 2 + 4, half.z * 2, -half.x + k * width, 0, 0))], steel);
      break;
    }
  }
  return withCollider(group, half);
}

/** A piece's looks with its collider box (half extents `half`), the shape it collides as. */
function withCollider(group: THREE.Group, half: THREE.Vector3): THREE.Group {
  const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  collider.userData.collider = true;
  collider.visible = false;
  group.add(collider);
  return group;
}

/**
 * Psyche under the yard: a metal world, dark grey with a brownish cast, its craters (dark floors,
 * rims lit on one side) drawn on a canvas in code.
 */
export function psyche(): THREE.Group {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#4b4741';
  g.fillRect(0, 0, size * 2, size);
  const r = new Randomizer(YARD_SEED + 50);
  for (let k = 0; k < 900; k++) {
    const x = r.range(0, size * 2);
    const y = r.range(0, size);
    const radius = Math.min(80, 2 + 120 * r.nextFloat() * r.nextFloat() * r.nextFloat());
    g.fillStyle = `rgba(20, 18, 16, ${0.25 + 0.3 * r.nextFloat()})`;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(150, 140, 125, ${0.15 + 0.25 * r.nextFloat()})`;
    g.lineWidth = Math.max(1, radius * 0.12);
    g.beginPath();
    g.arc(x, y, radius, Math.PI * 0.9, Math.PI * 1.9);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // only the cap the field sees, out to a little beyond its horizon, its map laid on from above
  // (a sphere's own mapping would pinch to a point right under the field)
  const geometry = new THREE.SphereGeometry(PSYCHE_RADIUS, 256, 48, 0, Math.PI * 2, 0, PSYCHE_CAP);
  const reach = PSYCHE_RADIUS * sin(PSYCHE_CAP);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) uv.setXY(i, 0.5 + position.getX(i) / (2 * reach), 0.5 + position.getZ(i) / (2 * reach));
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0.2, color: 0xd6cec2, transparent: true, depthWrite: false });
  // drawn behind everything else, in front of the sky, which it hides: whatever flies is drawn over it
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n  gl_Position.z = gl_Position.w * ${BEHIND_ALL};`);
  };
  const body = new THREE.Mesh(geometry, material);
  body.position.copy(PSYCHE_CENTER);
  body.renderOrder = -2;
  body.frustumCulled = false;
  body.userData.shadowless = true;
  const group = new THREE.Group();
  group.add(body);
  // the depot's tether, from the truss's foot down to Psyche's surface: scenery, nothing flies that far down
  const length = TETHER_TOP.y + PSYCHE_BELOW;
  const cable = new THREE.CylinderGeometry(30, 30, length, 8, 1, true);
  // the steel's tile around the cable once, along it every 20 m
  const cableUv = cable.getAttribute('uv');
  for (let i = 0; i < cableUv.count; i++) cableUv.setY(i, (cableUv.getY(i) * length) / 400);
  const tether = new THREE.Mesh(cable, new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(YARD_SEED), 1), color: 0x8a8f96 }));
  tether.position.set(TETHER_TOP.x, TETHER_TOP.y - length / 2, TETHER_TOP.z);
  group.add(tether);
  return group;
}
