import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { TemplateSet } from './asteroids';
import { boxUv, hazardSurface, industrialSurface, STATION_TILE, stationSurface, surfaced, wornSurface } from '../view/surfaces';
import { letteringTexture, PAINT_ASPECT } from '../view/lettering';
import { DEPOT } from '../ship/models';
import { setFromEuler } from '../detthree';
import { acos, atan2, cos, exp, hypot, sin } from '../detmath';
import { BAY_BACK, BAY_HALF_WIDTH, BAY_MOUTH, CRATER_CREST, CRATER_HEIGHT, CRATER_RADIUS, DEPOT_LAYOUT, DEPOT_PARTS, DEPOT_TYPE, type DepotPart, PAD, PAD_RADIUS, PSYCHE_BELOW, PSYCHE_CENTER, PSYCHE_RADIUS, RACK_BOXES, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, TANK_RADIUS, YARD_SEED } from './yard';

/**
 * How the Boneyard on Psyche looks (the campaign's first place; where things stand in
 * world/yard): racks of dead fighters, forty thousand hulls in the yard, of which the field holds
 * the rows around the yard office, and Psyche below, a metal world 226 km across. The racks are
 * field pieces of their own kind ('rack'), solid, colliding as their box.
 */

/** A dead fighter in a rack: about the interceptors' size (units, 35 m long). */
const FIGHTER_LENGTH = 700;
/** Fighters a tier of a rack holds, its tiers and how far apart (units, 15 m). */
const SLOTS = 6;
const TIERS = 3;
const TIER_HEIGHT = 300;
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
 * The racks: girders (posts at both ends and at every cradle, rails along top and bottom and at
 * every tier, cross braces), three tiers of cradles and the fighters on them; a full rack, one with gaps, an
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
    for (let tier = 0; tier < TIERS; tier++) {
      const y = -half.y + 40 + tier * TIER_HEIGHT;
      // the tier's rails along the rack
      if (tier > 0) for (const z of [-half.z + 20, half.z - 20]) girders.push(block(RACK_LENGTH, 30, 30, 0, y, z));
      for (let k = 0; k < SLOTS; k++) {
        const x = -half.x + (k + 0.5) * slot;
        // a cradle across the rack, and the fighter on it unless the slot stands empty
        girders.push(block(slot * 0.6, 30, RACK_DEPTH * 0.8, x, y, 0));
        const filled = type === 0 ? r.nextFloat() > 0.08 : type === 1 ? r.nextFloat() > 0.5 : false;
        if (filled) fighter(r, x, y + FIGHTER_LENGTH * 0.12, 0, hulls);
      }
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(boxUv(mergeGeometries(girders.map(noUv)), 400), steel));
    if (hulls.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(hulls.map(noUv)), 400), paint));
    return withCollider(group, half);
  });
  return { near, far: [], box: true };
}

/** The depot's plating: one tile of it every this far (units, 8 m), the scale of its plates of 0.5 to 2 m (see stationSurface). */
const PLATING_TILE = STATION_TILE;

/** The yard's grime over everything, at a scale of its own: one tile every MACRO_TILE units (150 m), so the plating's tile never shows as a pattern. */
const MACRO_TILE = 3000;

/**
 * The grime of decades over the whole depot, drawn once: broad patches darkened by soot and
 * dirt, bleached ones where the sun stood longest, long rust smears running down; multiplied over
 * every module's plating at MACRO_TILE (see platingOf).
 */
function grimeTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 512;
  const [element, g] = sheet(size);
  g.fillStyle = '#e8e6e2';
  g.fillRect(0, 0, size, size);
  const r = new Randomizer(YARD_SEED + 60);
  const blot = (x: number, y: number, radius: number, color: string) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const gradient = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = gradient;
        g.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
  };
  for (let k = 0; k < 40; k++) blot(r.range(0, size), r.range(0, size), r.range(30, 140), `rgba(40, 34, 28, ${r.range(0.15, 0.45)})`);
  for (let k = 0; k < 14; k++) blot(r.range(0, size), r.range(0, size), r.range(40, 120), `rgba(255, 250, 238, ${r.range(0.2, 0.4)})`);
  for (let k = 0; k < 30; k++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const length = r.range(60, 260);
    const streak = g.createLinearGradient(0, y, 0, y + length);
    streak.addColorStop(0, `rgba(120, 58, 24, ${r.range(0.25, 0.5)})`);
    streak.addColorStop(1, 'rgba(120, 58, 24, 0)');
    g.fillStyle = streak;
    g.fillRect(x, y, r.range(4, 18), length);
  }
  const texture = tiled(element, 1);
  texture.channel = 1;
  return texture;
}

/** Patches and damage over the plating, at a scale of their own: one tile every PATCH_TILE units (40 m). */
const PATCH_TILE = 800;

/**
 * What decades of small impacts left on the depot, drawn once with transparency: plates welded
 * over holes as a stopgap, in another steel or paint, a bead of weld all round with the heat's
 * straw and blue beside it, a few welded crooked or over another patch; and holes nobody
 * bothered with, torn open, their edges bent inward and bright, dark inside. Laid over every
 * module's plating at PATCH_TILE (see platingOf).
 */
function patchTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 1024;
  const [element, g] = sheet(size);
  const r = new Randomizer(YARD_SEED + 61);
  const steels = ['#8d8a83', '#6f6a5f', '#9a8f7a', '#7a4a36', '#5e6670', '#a39f95'];
  for (let k = 0; k < 26; k++) {
    const w = r.range(30, 150);
    const h = r.range(24, 110);
    const x = r.range(w, size - w);
    const y = r.range(h, size - h);
    const tilt = r.range(-0.25, 0.25);
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    // the heat's tint around the bead
    g.strokeStyle = 'rgba(150, 120, 70, 0.35)';
    g.lineWidth = 9;
    g.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    g.strokeStyle = 'rgba(70, 90, 140, 0.3)';
    g.lineWidth = 4;
    g.strokeRect(-w / 2 - 7, -h / 2 - 7, w + 14, h + 14);
    // the plate itself, a little grimy, its corners cut
    g.fillStyle = steels[r.nextInt() % steels.length];
    g.beginPath();
    const cut = Math.min(w, h) * 0.15;
    g.moveTo(-w / 2 + cut, -h / 2);
    g.lineTo(w / 2 - cut, -h / 2);
    g.lineTo(w / 2, -h / 2 + cut);
    g.lineTo(w / 2, h / 2 - cut);
    g.lineTo(w / 2 - cut, h / 2);
    g.lineTo(-w / 2 + cut, h / 2);
    g.lineTo(-w / 2, h / 2 - cut);
    g.lineTo(-w / 2, -h / 2 + cut);
    g.closePath();
    g.fill();
    for (let s = 0; s < 6; s++) {
      g.fillStyle = `rgba(30, 26, 22, ${r.range(0.05, 0.2)})`;
      g.fillRect(r.range(-w / 2, w / 2 - 10), r.range(-h / 2, h / 2 - 10), r.range(8, w / 2), r.range(4, h / 3));
    }
    // the weld bead: a ragged, bright-and-dark seam along the edge
    g.lineWidth = 3;
    g.setLineDash([3, 2]);
    g.strokeStyle = 'rgba(205, 198, 182, 0.9)';
    g.stroke();
    g.setLineDash([2, 3]);
    g.strokeStyle = 'rgba(40, 36, 30, 0.8)';
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }
  for (let k = 0; k < 18; k++) {
    // a hole left as it is: torn, its petals bent in and scoured bright, dark inside
    const x = r.range(20, size - 20);
    const y = r.range(20, size - 20);
    const radius = r.range(4, 18);
    const petals = 7 + (r.nextInt() % 5);
    g.fillStyle = 'rgba(60, 52, 44, 0.45)';
    g.beginPath();
    g.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let p = 0; p <= petals * 2; p++) {
      const a = (p / (petals * 2)) * Math.PI * 2;
      const reach = radius * (p % 2 ? r.range(1.1, 1.6) : r.range(0.6, 0.9));
      if (p === 0) g.moveTo(x + reach * cos(a), y + reach * sin(a));
      else g.lineTo(x + reach * cos(a), y + reach * sin(a));
    }
    g.closePath();
    g.fillStyle = 'rgba(190, 184, 170, 0.95)';
    g.fill();
    g.fillStyle = 'rgba(6, 6, 7, 1)';
    g.beginPath();
    g.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  return tiled(element, 4);
}

/** Each module's paint: its own surface (seed, stencils) and base tint, so no two modules share a pattern. */
const MODULE_PAINT: Record<'hall' | 'hab' | 'tower' | 'printer' | 'crusher' | 'tank', { seed: number; tint: number; texts: readonly string[] }> = {
  hall: { seed: YARD_SEED + 21, tint: 0xd9cfba, texts: ['BAY 3', 'NO SMOKING', 'CLAMP 3-A', 'DANGER', 'MIND THE GAP'] },
  hab: { seed: YARD_SEED + 22, tint: 0xffffff, texts: ['HAB 2', 'COUCHES 1-40', 'AIRLOCK', 'O2 LOW?', 'PSYCHE 4'] },
  tower: { seed: YARD_SEED + 23, tint: 0xaab5c0, texts: ['OFFICE', 'RASK SALVAGE', 'NO ENTRY', 'MOW-2584'] },
  printer: { seed: YARD_SEED + 24, tint: 0xc7a184, texts: ['PRINTER HALL', 'BIOHAZARD', 'FEED 07', 'RACK 7700-7799'] },
  crusher: { seed: YARD_SEED + 25, tint: 0xb8a070, texts: ['CRUSHER', 'KEEP CLEAR', 'DANGER'] },
  tank: { seed: YARD_SEED + 26, tint: 0xd6d2c8, texts: ['O2', 'H2O', 'FUEL', 'NO SMOKING'] },
};
const PAINT_OF: Partial<Record<DepotPart, keyof typeof MODULE_PAINT>> = {
  hallLeft: 'hall',
  hallRight: 'hall',
  hallBack: 'hall',
  hallRoof: 'hall',
  habLeft: 'hab',
  habRight: 'hab',
  tower: 'tower',
  cab: 'tower',
  printer: 'printer',
  crusher: 'crusher',
  tankA: 'tank',
  tankB: 'tank',
  tankC: 'tank',
};

const platings = new Map<string, THREE.MeshStandardMaterial>();
let grime: THREE.Texture | null = null;
let patches: THREE.Texture | null = null;

/**
 * A module's plating in three layers that never line up: its own station surface (see
 * stationSurface) in its tint every PLATING_TILE, the patches and holes of patchTexture every
 * PATCH_TILE, the yard's grime multiplied over both every MACRO_TILE (both read with the
 * geometry's second texture coordinates, see macroUv); faintly lit by the yard's floodlights so
 * its shadow side never goes black. A hab container's own color comes in its vertices.
 */
function platingOf(part: DepotPart): THREE.MeshStandardMaterial {
  const name = PAINT_OF[part] ?? 'hall';
  const kept = platings.get(name);
  if (kept) return kept;
  const paint = MODULE_PAINT[name];
  const hull = stationSurface(paint.seed, paint.texts);
  grime ??= grimeTexture();
  patches ??= patchTexture();
  // the grime rides in the AO slot only for its texture coordinates of channel 1; it darkens the color itself, not the ambient light
  const material = new THREE.MeshStandardMaterial({ map: hull.map, roughnessMap: hull.orm, metalnessMap: hull.orm, roughness: 1, metalness: 1, normalMap: hull.normal, color: paint.tint, emissive: 0x2c2a26, aoMap: grime, aoMapIntensity: 0, vertexColors: name === 'hab' });
  const patchMap = patches;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.patchMap = { value: patchMap };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D patchMap;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  vec4 mended = texture2D( patchMap, vAoMapUv * ${(MACRO_TILE / PATCH_TILE).toFixed(3)} + 0.31 );
  diffuseColor.rgb = mix( diffuseColor.rgb, mended.rgb, mended.a );
  diffuseColor.rgb *= texture2D( aoMap, vAoMapUv ).rgb;`,
      );
  };
  platings.set(name, material);
  return material;
}

/** The second texture coordinates the patches and the grime are read with: the first ones (one unit every `tile`) at MACRO_TILE, shifted by `shift` so neighbouring parts differ. */
function macroUv(geometry: THREE.BufferGeometry, shift: number, tile = PLATING_TILE): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv');
  const uv1 = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    uv1[i * 2] = (uv.getX(i) * tile) / MACRO_TILE + shift;
    uv1[i * 2 + 1] = (uv.getY(i) * tile) / MACRO_TILE + shift * 0.61;
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return geometry;
}

/** The depot's materials besides the platings and the racks' steel: lit windows, the pad and its hazard ring, the lamps, the bay's painted number, cables. */
function depotLooks() {
  const steelSurface = industrialSurface(YARD_SEED);
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(1.3), toneMapped: false });
  const hazard = new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 1), emissive: 0x3a3000, emissiveIntensity: 0.6 });
  const pad = new THREE.MeshStandardMaterial({ ...surfaced(steelSurface, 1), color: 0x5d6068, emissive: 0x9098a8, emissiveMap: steelSurface.map, emissiveIntensity: 0.5 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.15).multiplyScalar(3), toneMapped: false });
  const flood = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(3), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false });
  const light = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.9, 1).multiplyScalar(1.6), toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.15).multiplyScalar(2), toneMapped: false });
  // the bay's number painted over the hall's door in the yard's stencil, weathered (see view/lettering)
  const sign = new THREE.MeshStandardMaterial({ map: letteringTexture({ name: 'BAY 3' }, YARD_SEED + 7), transparent: true, opacity: 0.9, depthWrite: false, roughness: 0.85, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  // cables of rubber gone grey and cracked
  const cable = new THREE.MeshStandardMaterial({ ...surfaced(steelSurface, 1), color: 0x2a2826, roughness: 1, metalness: 0 });
  return { windows, hazard, pad, lamp, flood, beacon, light, glow, sign, cable };
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
  for (const u of [-1, 1]) {
    for (const w of [-1, 1]) {
      const p = at(u * (half[a as 'x'] - rail / 2), w * (half[b as 'x'] - rail / 2), 0);
      const s = { x: rail, y: rail, z: rail };
      s[along] = length;
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

/** A square canvas to draw a texture on, and the texture of one, repeating, in sRGB. */
function sheet(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return [element, element.getContext('2d')!];
}
function tiled(element: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** An eighth of a turn about y, so a four-sided funnel stands square. */
const EIGHTH_TURN = new THREE.Matrix4().set(Math.SQRT1_2, 0, Math.SQRT1_2, 0, 0, 1, 0, 0, -Math.SQRT1_2, 0, Math.SQRT1_2, 0, 0, 0, 0, 1);

/** Turns a shape built along y to lie along x (a quarter turn, no trigonometry). */
const Y_TO_X = new THREE.Matrix4().set(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/**
 * A cable hanging between two points, sagging in Psyche's weak pull by `sag` units, or from a
 * point down by `sag` when `to` is null: ripped out of a hole, its end dangling.
 */
function cable(from: THREE.Vector3, to: THREE.Vector3 | null, sag: number, radius = 8): THREE.BufferGeometry {
  const end = to ?? from.clone().add(new THREE.Vector3(sag * 0.2, -sag, sag * 0.1));
  const middle = from.clone().lerp(end, 0.5);
  middle.y -= to ? sag : sag * 0.2;
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, middle, end), 12, radius, 5, false);
}

/** Cables torn out of a face (local x = `x`, facing ±x by `facing`) or slung along it: a few, dangling. */
function cablesOn(r: Randomizer, half: THREE.Vector3, count: number): THREE.BufferGeometry[] {
  const list: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const side = r.nextFloat() < 0.5 ? -1 : 1;
    const z = side * (half.z + 6);
    const x = r.range(-half.x * 0.9, half.x * 0.9);
    const y = r.range(-half.y * 0.2, half.y * 0.9);
    if (r.nextFloat() < 0.5) list.push(cable(new THREE.Vector3(x, y, z), null, r.range(80, 260), r.range(4, 9)));
    else list.push(cable(new THREE.Vector3(x, y, z), new THREE.Vector3(x + r.range(-400, 400), y + r.range(-100, 100), z), r.range(40, 160), r.range(5, 10)));
  }
  return list;
}

/** A plated box `half` large, with its second texture coordinates for patches and grime. */
const platedBox = (half: THREE.Vector3, shift: number, cx = 0, cy = 0, cz = 0) => macroUv(boxUv(block(half.x * 2, half.y * 2, half.z * 2, cx, cy, cz), PLATING_TILE), shift);

/**
 * One part of the depot within its collider box (see world/yard): the hangar hall's walls with
 * buttresses outside, its roof with lights underneath, hazard paint and lamps round the door and
 * the bay's number painted over it, the pad in its back half; the habitation blocks of stacked
 * containers in faded colors with lit windows and catwalks; the office tower with its lift
 * shaft, and the glazed cab of Rask's office on top; the crane's boom with its hook; the printer
 * hall with its glowing stacks; the crusher and its hopper; the tanks on their legs; the dish;
 * the floodlight masts. Cables hang out of the walls everywhere.
 */
function depotPart(part: DepotPart, half: THREE.Vector3, steel: THREE.Material, looks: ReturnType<typeof depotLooks>): THREE.Group {
  const r = new Randomizer(YARD_SEED + 100 + DEPOT_PARTS.indexOf(part));
  const group = new THREE.Group();
  const add = (parts: THREE.BufferGeometry[], material: THREE.Material, tile = 400) => {
    if (parts.length) group.add(new THREE.Mesh(boxUv(mergeGeometries(parts.map((p) => noUv(p.index ? p.toNonIndexed() : p))), tile), material));
  };
  const shift = DEPOT_PARTS.indexOf(part) * 0.37;
  const center = DEPOT_LAYOUT[part].center;
  const local = (point: THREE.Vector3) => point.clone().sub(center);
  const plated = (geometries: THREE.BufferGeometry[]) => group.add(new THREE.Mesh(mergeGeometries(geometries), platingOf(part)));
  const hang = (count: number) => {
    const list = cablesOn(r, half, count);
    if (list.length) group.add(new THREE.Mesh(mergeGeometries(list.map(noUv)), looks.cable));
  };
  switch (DEPOT_LAYOUT[part].shape) {
    case 'ground':
      group.add(crater());
      break;
    case 'wall': {
      plated([platedBox(half, shift)]);
      // buttresses on the outside, the door's frame in hazard paint at the front
      const outward = part === 'hallBack' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(center.z));
      const ribs: THREE.BufferGeometry[] = [];
      if (part === 'hallBack') for (let z = -half.z + 150; z < half.z; z += 450) ribs.push(block(60, half.y * 2, 50, half.x + 30, 0, z));
      else for (let x = -half.x + 100; x < half.x; x += 400) ribs.push(block(50, half.y * 2, 60, x, 0, outward.z * (half.z + 30)));
      add(ribs, steel);
      if (part !== 'hallBack') add([block(30, half.y * 2, half.z * 2 + 4, -half.x - 15, 0, 0)], looks.hazard, 200);
      if (part === 'hallBack') {
        // the windows of the hall's control room, looking down on the pad; and the pad itself, in front of the wall
        const strips: THREE.BufferGeometry[] = [];
        for (let z = -BAY_HALF_WIDTH + 100; z < BAY_HALF_WIDTH - 100; z += 220) if (r.nextFloat() > 0.25) strips.push(block(8, 70, 160, -half.x - 4, half.y * 0.45, z + 80));
        add(strips, looks.windows);
        pad(group, local(PAD), looks);
      }
      hang(part === 'hallBack' ? 3 : 5);
      break;
    }
    case 'roof': {
      plated([platedBox(half, shift)]);
      const panels: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 250; x < half.x; x += 400) for (const z of [-0.5, 0.5]) panels.push(block(200, 8, 300, x, -half.y - 4, z * BAY_HALF_WIDTH));
      add(panels, looks.light);
      add([block(30, 40, half.z * 2, -half.x - 15, -half.y + 20, 0)], looks.hazard, 200);
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(half.z * 1.4, (half.z * 1.4) / PAINT_ASPECT).applyMatrix4(FACING_OUT).translate(-half.x - 0.5, half.y * 0.1, 0), looks.sign));
      const edge: THREE.BufferGeometry[] = [];
      for (let z = -half.z + 60; z < half.z; z += 240) edge.push(block(20, 20, 40, -half.x - 10, -half.y - 10, z));
      add(edge, looks.lamp);
      // vents and a beacon on top
      add([block(120, 60, 120, half.x * 0.4, half.y + 30, -half.z * 0.5), block(120, 60, 120, -half.x * 0.2, half.y + 30, half.z * 0.6)], steel);
      add([block(50, 50, 50, half.x - 60, half.y + 25, 0)], looks.beacon);
      break;
    }
    case 'stack': {
      // containers 15 m long, 5 m high and deep, stacked in courses, a few missing, each in a faded color of its own
      const containers: THREE.BufferGeometry[] = [];
      const lit: THREE.BufferGeometry[] = [];
      const colors = [[0.62, 0.64, 0.5], [0.66, 0.42, 0.32], [0.5, 0.56, 0.64], [0.7, 0.68, 0.62], [0.64, 0.58, 0.42]];
      const L = 300;
      const H = 100;
      for (let y = -half.y; y < half.y - 1; y += H) {
        for (let x = -half.x; x < half.x - 1; x += L) {
          for (let z = -half.z; z < half.z - 1; z += H) {
            if (r.nextFloat() < 0.06 && y > -half.y) continue;
            const box = macroUv(boxUv(block(L - 8, H - 8, H - 8, x + L / 2, y + H / 2, z + H / 2), PLATING_TILE), shift);
            const tone = colors[r.nextInt() % colors.length];
            const count = box.getAttribute('position').count;
            box.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: count * 3 }, (_, i) => tone[i % 3]), 3));
            containers.push(box);
            const outer = z + H >= half.z - 1 ? 1 : z <= -half.z + 1 ? -1 : 0;
            if (outer && r.nextFloat() < 0.4) lit.push(block(40, 30, 6, x + L * r.range(0.2, 0.8), y + H * 0.55, outer * (half.z + 2)));
          }
        }
      }
      plated(containers);
      add(lit, looks.windows);
      // catwalks along every second course, ladders up their ends
      const walks: THREE.BufferGeometry[] = [];
      for (let y = -half.y + 2 * H; y < half.y; y += 2 * H) for (const side of [-1, 1]) walks.push(block(half.x * 2, 8, 40, 0, y, side * (half.z + 20)));
      for (const side of [-1, 1]) walks.push(block(20, half.y * 2, 20, side * (half.x + 10), 0, half.z + 20));
      add(walks, steel);
      hang(6);
      break;
    }
    case 'tower': {
      plated([platedBox(half, shift)]);
      const shaft = lattice(new THREE.Vector3(80, half.y, 80), 200).map((g) => g.translate(-half.x - 80, 0, 0));
      add([...shaft, ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => block(40, half.y * 2, 40, sx * (half.x + 10), 0, sz * (half.z + 10))))], steel);
      const lit: THREE.BufferGeometry[] = [];
      for (let y = -half.y + 200; y < half.y - 100; y += 160) if (r.nextFloat() < 0.35) lit.push(block(6, 40, 60, -half.x - 3, y, r.range(-half.z * 0.6, half.z * 0.6)));
      add(lit, looks.windows);
      hang(4);
      break;
    }
    case 'cab': {
      // Rask's office: a band of glass all round under a plated roof, its lights on
      plated([platedBox(new THREE.Vector3(half.x, half.y * 0.25, half.z), shift, 0, half.y * 0.75, 0), platedBox(new THREE.Vector3(half.x, half.y * 0.2, half.z), shift, 0, -half.y * 0.8, 0)]);
      const glass: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        glass.push(block(6, half.y * 0.9, half.z * 2 - 40, side * (half.x - 3), -half.y * 0.05, 0));
        glass.push(block(half.x * 2 - 40, half.y * 0.9, 6, 0, -half.y * 0.05, side * (half.z - 3)));
      }
      add(glass, looks.windows);
      add([block(20, 300, 20, half.x * 0.6, half.y + 150, half.z * 0.6), block(60, 60, 60, half.x * 0.6, half.y + 330, half.z * 0.6)], steel);
      add([block(40, 40, 40, half.x * 0.6, half.y + 380, half.z * 0.6)], looks.beacon);
      break;
    }
    case 'lattice': {
      add(lattice(half, 240), steel);
      // the crane's trolley and its hook, hanging on two cables over the yard
      const x = -half.x + 300;
      add([block(140, 60, 140, x, -half.y - 30, 0), block(120, 120, 80, x, -half.y - 700, 0)], steel);
      group.add(new THREE.Mesh(mergeGeometries([-30, 30].map((dz) => noUv(cable(new THREE.Vector3(x, -half.y - 60, dz), new THREE.Vector3(x, -half.y - 640, dz), 0, 5)))), looks.cable));
      break;
    }
    case 'hall': {
      plated([platedBox(half, shift)]);
      const stacks: THREE.BufferGeometry[] = [];
      const tops: THREE.BufferGeometry[] = [];
      for (const [dx, dz] of [[-0.5, -0.3], [0, 0.4], [0.5, -0.2]]) {
        stacks.push(new THREE.CylinderGeometry(70, 90, 500, 12).translate(dx * half.x, half.y + 250, dz * half.z));
        tops.push(new THREE.CylinderGeometry(60, 60, 10, 12).translate(dx * half.x, half.y + 505, dz * half.z));
      }
      add(stacks, steel);
      add(tops, looks.glow);
      const louvers: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 150; x < half.x; x += 300) for (let k = 0; k < 4; k++) louvers.push(block(160, 10, 12, x, -half.y * 0.2 + k * 30, half.z + 6));
      add(louvers, steel);
      hang(6);
      break;
    }
    case 'crusher': {
      plated([platedBox(half, shift)]);
      // the hopper: an open funnel of four sides on top, hazard stripes round its rim
      const hopper = new THREE.CylinderGeometry(half.x * 1.1, half.x * 0.5, 400, 4, 1, true).translate(0, half.y + 200, 0);
      hopper.applyMatrix4(EIGHTH_TURN);
      group.add(new THREE.Mesh(macroUv(hopper, shift, 1), platingOf(part)));
      add([block(half.x * 2.2, 40, 30, 0, half.y + 400, half.z * 1.1), block(half.x * 2.2, 40, 30, 0, half.y + 400, -half.z * 1.1)], looks.hazard, 200);
      hang(3);
      break;
    }
    case 'tank': {
      const ball = new THREE.SphereGeometry(TANK_RADIUS, 24, 16);
      const uv = ball.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * TANK_RADIUS) / PLATING_TILE, (uv.getY(i) * Math.PI * TANK_RADIUS) / PLATING_TILE);
      group.add(new THREE.Mesh(macroUv(ball, shift), platingOf(part)));
      const legs: THREE.BufferGeometry[] = [];
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) legs.push(block(30, 700, 30, sx * TANK_RADIUS * 0.6, -350, sz * TANK_RADIUS * 0.6));
      legs.push(new THREE.TorusGeometry(TANK_RADIUS + 6, 12, 6, 32).applyMatrix4(FLAT).toNonIndexed());
      add(legs, steel);
      break;
    }
    case 'dish': {
      add(lattice(half, 160), steel);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(320, 24, 8, 0, Math.PI * 2, 0, 0.8).applyMatrix4(Y_TO_X).translate(-200, half.y, 0), steel));
      add([block(40, 40, 40, 0, half.y + 60, 0)], looks.beacon);
      break;
    }
    case 'mast': {
      add(lattice(half, 200), steel);
      // a head of floodlights at the top, turned on the yard
      add([block(240, 40, 120, 0, half.y + 20, 0)], steel);
      add([block(220, 10, 100, 0, half.y - 6, 0)], looks.flood);
      add([block(30, 30, 30, 0, half.y + 60, 0)], looks.beacon);
      break;
    }
  }
  return withCollider(group, half);
}

/** The pad in the hangar hall, centered at `at` on the floor (local to the part it is drawn with): a disk ringed in hazard paint, lamps round it, a row of lamps leading in from the door. */
function pad(group: THREE.Group, at: THREE.Vector3, looks: ReturnType<typeof depotLooks>) {
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 12, 48).translate(at.x, at.y + 6, at.z), looks.pad));
  const ring = new THREE.RingGeometry(PAD_RADIUS, PAD_RADIUS * 1.25, 48, 1).applyMatrix4(FLAT).translate(at.x, at.y + 13, at.z);
  const uv = ring.getAttribute('uv');
  const position = ring.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const angle = atan2(position.getZ(i) - at.z, position.getX(i) - at.x);
    const radial = hypot(position.getX(i) - at.x, position.getZ(i) - at.z);
    uv.setXY(i, (angle / (Math.PI * 2)) * 6, (radial - PAD_RADIUS) / (PAD_RADIUS * 0.25));
  }
  group.add(new THREE.Mesh(ring, looks.hazard));
  const lamps: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 12; k++) {
    const angle = (k / 12) * Math.PI * 2;
    lamps.push(block(24, 16, 24, at.x + PAD_RADIUS * 1.35 * cos(angle), at.y + 8, at.z + PAD_RADIUS * 1.35 * sin(angle)));
  }
  for (let x = at.x - (BAY_BACK - BAY_MOUTH) / 2 + 80; x < at.x - PAD_RADIUS * 1.5; x += 160) for (const z of [-1, 1]) lamps.push(block(30, 12, 30, x, at.y + 6, z * BAY_HALF_WIDTH * 0.5));
  group.add(new THREE.Mesh(mergeGeometries(lamps), looks.lamp));
}

/** A piece's looks with its collider box (half extents `half`), the shape it collides as. */
function withCollider(group: THREE.Group, half: THREE.Vector3): THREE.Group {
  const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  collider.userData.collider = true;
  collider.visible = false;
  group.add(collider);
  return group;
}

/** Psyche's ground: one tile of it every GROUND_TILE units (200 m), with the yard's grime over it. */
const GROUND_TILE = 4000;

/**
 * Psyche's ground in the crater: metal dust gone dark, pebbles and the pits of small impacts, the
 * tracks of haulers and cranes scraped through it, oil and coolant spilled.
 */
function groundTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 1024;
  const [element, g] = sheet(size);
  g.fillStyle = '#4a4640';
  g.fillRect(0, 0, size, size);
  const r = new Randomizer(YARD_SEED + 70);
  for (let k = 0; k < 14000; k++) {
    const shade = r.range(-1, 1);
    g.fillStyle = shade > 0 ? `rgba(150, 142, 128, ${0.25 * shade})` : `rgba(14, 12, 10, ${-0.35 * shade})`;
    const s = r.range(1, 4);
    g.fillRect(r.range(0, size), r.range(0, size), s, s);
  }
  for (let k = 0; k < 120; k++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const radius = 2 + 30 * r.nextFloat() * r.nextFloat();
    g.fillStyle = `rgba(18, 16, 14, ${r.range(0.25, 0.5)})`;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(150, 140, 125, ${r.range(0.2, 0.4)})`;
    g.lineWidth = Math.max(1, radius * 0.15);
    g.beginPath();
    g.arc(x, y, radius, Math.PI * 0.9, Math.PI * 1.9);
    g.stroke();
  }
  for (let k = 0; k < 6; k++) {
    // a hauler's tracks: two scraped bands running across, a little bright
    const y = r.range(0, size);
    for (const offset of [0, 26]) {
      g.fillStyle = 'rgba(120, 114, 104, 0.25)';
      g.fillRect(0, y + offset, size, 9);
      g.fillStyle = 'rgba(20, 18, 16, 0.2)';
      for (let x = 0; x < size; x += 12) g.fillRect(x, y + offset, 4, 9);
    }
  }
  for (let k = 0; k < 10; k++) {
    g.fillStyle = `rgba(8, 7, 6, ${r.range(0.3, 0.55)})`;
    g.beginPath();
    g.ellipse(r.range(0, size), r.range(0, size), r.range(8, 50), r.range(6, 30), r.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  return tiled(element, 8);
}

/** The ground's fine detail (dust, grit and pebbles): one tile every DUST_TILE units (20 m). */
const DUST_TILE = 400;

/** The dust of the crater floor up close: grains of metal dust in many greys, grit, pebbles with their shadows on the side away from the sun's usual side. */
function dustTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 512;
  const [element, g] = sheet(size);
  g.fillStyle = '#8a857c';
  g.fillRect(0, 0, size, size);
  const r = new Randomizer(YARD_SEED + 72);
  for (let k = 0; k < 30000; k++) {
    const shade = r.range(-1, 1);
    g.fillStyle = shade > 0 ? `rgba(220, 212, 196, ${0.22 * shade})` : `rgba(20, 18, 15, ${-0.3 * shade})`;
    g.fillRect(r.range(0, size), r.range(0, size), 1, 1);
  }
  for (let k = 0; k < 700; k++) {
    const x = r.range(0, size);
    const y = r.range(0, size);
    const radius = 0.8 + 3.5 * r.nextFloat() * r.nextFloat();
    g.fillStyle = 'rgba(12, 11, 9, 0.45)';
    g.beginPath();
    g.ellipse(x + radius * 0.5, y + radius * 0.4, radius * 1.1, radius * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    const tone = Math.floor(r.range(70, 170));
    g.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 10})`;
    g.beginPath();
    g.ellipse(x, y, radius, radius * 0.8, r.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  return tiled(element, 8);
}

/** A crater of the yard's floor: its middle, radius (units) and depth; its rim raised a third of its depth. */
type Pit = { x: number; z: number; radius: number; depth: number };

/**
 * The pits of the crater floor, from the yard's seed: many small, few large (20 to 300 m
 * across), none where the racks and the depot stand (the yard was cleared there), fewer towards
 * the crater's wall.
 */
function pits(): Pit[] {
  const r = new Randomizer(YARD_SEED + 73);
  const list: Pit[] = [];
  const yard = (x: number, z: number, reach: number) => x > -YARD_CLEAR_X - reach && x < BAY_BACK + 9000 + reach && Math.abs(z) < YARD_CLEAR_Z + reach;
  while (list.length < 220) {
    const radius = 400 + 5600 * r.nextFloat() * r.nextFloat() * r.nextFloat();
    const angle = r.range(0, Math.PI * 2);
    const distance = Math.sqrt(r.nextFloat()) * (CRATER_RADIUS - radius);
    const x = cos(angle) * distance;
    const z = sin(angle) * distance;
    if (yard(x, z, radius)) continue;
    list.push({ x, z, radius, depth: radius * r.range(0.08, 0.16) });
  }
  return list;
}
/** The cleared yard (units): the racks' rows and the lane out to the depot. */
const YARD_CLEAR_X = 25000;
const YARD_CLEAR_Z = 23000;

/** How high the floor stands at (x, z) over its flat level: down in a pit's bowl, up on its rim. */
function relief(list: readonly Pit[], x: number, z: number): number {
  let height = 0;
  for (const pit of list) {
    const d = hypot(x - pit.x, z - pit.z) / pit.radius;
    if (d > 1.8) continue;
    if (d < 1) height += pit.depth * (d * d - 1) + pit.depth * 0.33 * d * d * d * d;
    else height += pit.depth * 0.33 * exp(-((d - 1) * (d - 1)) / 0.08);
  }
  return height;
}

/**
 * The crater the yard lies in, local to the ground's box: its floor (the box's top) out to
 * CRATER_RADIUS, pitted by smaller craters (see pits; the yard itself cleared and flat), and its
 * wall rising from there to the crest CRATER_HEIGHT high at CRATER_CREST and falling away outside,
 * lumpy; scenery beyond the yard, collided with as the flat floor. Its ground in three layers
 * that never line up: dust and pebbles every DUST_TILE, small pits, tracks and spills every
 * GROUND_TILE, the yard's grime every MACRO_TILE.
 */
function crater(): THREE.Group {
  const half = DEPOT_LAYOUT.ground.half;
  const group = new THREE.Group();
  grime ??= grimeTexture();
  const middle = groundTexture();
  // the sun stands low over the crater: Psyche's bright metal dust and the yard's floodlights keep the floor from going black
  const material = new THREE.MeshStandardMaterial({ map: dustTexture(), roughness: 0.9, metalness: 0.15, color: 0xffffff, emissive: 0x2e2a26, aoMap: grime, aoMapIntensity: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.middleMap = { value: middle };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D middleMap;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  diffuseColor.rgb *= texture2D( middleMap, vAoMapUv * ${(MACRO_TILE / GROUND_TILE).toFixed(3)} ).rgb * 2.2;
  diffuseColor.rgb *= texture2D( aoMap, vAoMapUv ).rgb;`,
      );
  };
  const list = pits();
  const reach = CRATER_RADIUS + 2000;
  const floor = new THREE.PlaneGeometry(reach * 2, reach * 2, 320, 320).applyMatrix4(FLAT);
  const position = floor.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, relief(list, position.getX(i), position.getZ(i)));
  floor.computeVertexNormals();
  floor.translate(0, half.y, 0);
  const wall = new THREE.LatheGeometry(
    [
      new THREE.Vector2(CRATER_CREST + 60000, -2000),
      new THREE.Vector2(CRATER_CREST + 15000, CRATER_HEIGHT * 0.6),
      new THREE.Vector2(CRATER_CREST, CRATER_HEIGHT),
      new THREE.Vector2(CRATER_RADIUS + 9000, CRATER_HEIGHT * 0.55),
      new THREE.Vector2(CRATER_RADIUS + 2000, 300),
      new THREE.Vector2(CRATER_RADIUS, 0),
    ],
    160,
  ).translate(0, half.y, 0);
  // the wall lumpy: its height varies around the crater, smoothly
  const r = new Randomizer(YARD_SEED + 71);
  const bumps = Array.from({ length: 9 }, () => [r.range(0, Math.PI * 2), r.range(0.05, 0.25), 1 + Math.floor(r.range(0, 7))]);
  const wallPosition = wall.getAttribute('position');
  for (let i = 0; i < wallPosition.count; i++) {
    const y = wallPosition.getY(i) - half.y;
    if (y <= 0) continue;
    const angle = atan2(wallPosition.getZ(i), wallPosition.getX(i));
    let k = 1;
    for (const [phase, depth, waves] of bumps) k += depth * sin(waves * angle + phase);
    wallPosition.setY(i, half.y + y * k);
  }
  wall.computeVertexNormals();
  for (const geometry of [floor, wall]) {
    const p = geometry.getAttribute('position');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) / DUST_TILE;
      uv[i * 2 + 1] = p.getZ(i) / DUST_TILE;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    macroUv(geometry, 0.5, DUST_TILE);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.add(boulders(list, half.y, material));
  return group;
}

/** Boulders on the crater floor: how many, and their size from 0.5 to 6 m (units). */
const BOULDERS = 24000;
const BOULDER_MIN = 10;
const BOULDER_MAX = 120;

/**
 * Boulders strewn over the crater floor, thrown out by its pits, and pushed to the yard's edges
 * where the yard was cleared: facetted lumps of Psyche's metal in a few shapes, many small and
 * few large, half sunk into the dust, more of them round each pit's rim. Scenery only (they are
 * smaller than anything that collides), one draw call.
 */
function boulders(list: readonly Pit[], top: number, ground: THREE.Material): THREE.InstancedMesh {
  const r = new Randomizer(YARD_SEED + 74);
  const shape = new THREE.IcosahedronGeometry(1, 0);
  const p = shape.getAttribute('position');
  // a lumpy shape: each corner pushed in or out a little, flattened towards its base
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * r.range(0.8, 1.2), p.getY(i) * r.range(0.5, 0.8), p.getZ(i) * r.range(0.8, 1.2));
  shape.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * 0.3 + 0.5;
    uv[i * 2 + 1] = p.getZ(i) * 0.3 + 0.5;
  }
  shape.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const material = (ground as THREE.MeshStandardMaterial).clone();
  material.aoMap = null;
  material.onBeforeCompile = () => {};
  material.color.set(0x8a837a);
  material.flatShading = true;
  const mesh = new THREE.InstancedMesh(shape, material, BOULDERS);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yardX = (x: number) => x > -YARD_CLEAR_X && x < BAY_BACK + 9000;
  for (let k = 0; k < BOULDERS; k++) {
    let x: number;
    let z: number;
    if (k % 3 === 0 && list.length) {
      // round a pit's rim
      const pit = list[r.nextInt() % list.length];
      const a = r.range(0, Math.PI * 2);
      const d = pit.radius * r.range(0.9, 1.6);
      x = pit.x + cos(a) * d;
      z = pit.z + sin(a) * d;
    } else {
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.nextFloat()) * CRATER_RADIUS;
      x = cos(a) * d;
      z = sin(a) * d;
    }
    // the yard itself was cleared: only a few small ones in it, pushed against the racks' feet
    const inYard = yardX(x) && Math.abs(z) < YARD_CLEAR_Z;
    const size = BOULDER_MIN + (BOULDER_MAX - BOULDER_MIN) * r.nextFloat() * r.nextFloat() * r.nextFloat() * (inYard ? 0.3 : 1);
    if (inYard && r.nextFloat() < 0.7) {
      scale.setScalar(0);
    } else {
      scale.set(size * r.range(0.8, 1.3), size * r.range(0.7, 1.1), size * r.range(0.8, 1.3));
    }
    setFromEuler(rotation, r.range(-0.3, 0.3), r.range(0, Math.PI * 2), r.range(-0.3, 0.3));
    position.set(x, top + relief(list, x, z) + size * 0.25, z);
    mesh.setMatrixAt(k, matrix.compose(position, rotation, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Psyche beyond the crater's wall: a metal world, dark grey with a brownish cast, its craters
 * (dark floors, rims lit on one side) drawn on a canvas in code; drawn behind everything.
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
  return group;
}
