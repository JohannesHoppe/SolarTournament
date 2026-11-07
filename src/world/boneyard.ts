import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { Relief, TemplateSet } from './asteroids';
import { boxUv, hazardSurface, industrialSurface, STATION_TILE, stationSurface, surfaced, wornSurface } from '../view/surfaces';
import { letteringTexture, PAINT_ASPECT } from '../view/lettering';
import { DEPOT } from '../ship/models';
import { setFromEuler } from '../detthree';
import { acos, atan2, cos, exp, hypot, sin } from '../detmath';
import { BAY_BACK, BAY_HALF_WIDTH, BAY_HEIGHT, BAY_MOUTH, CAB_RADIUS, CRATER_CREST, DOME_RADIUS, GROUND, HAB_LIFT, HAB_RADIUS, TOWER_RADIUS, VAULT_RADIUS, CRATER_HEIGHT, CRATER_RADIUS, DEPOT_LAYOUT, DEPOT_PARTS, DEPOT_TYPE, type DepotPart, PAD, PAD_RADIUS, PSYCHE_BELOW, PSYCHE_CENTER, PSYCHE_RADIUS, RACK_BOXES, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, TANK_RADIUS, YARD_SEED, VESTA_GROUND_TYPE, OCCATOR_TYPE, WALL_TYPE, PHOBOS_TYPE, CALLISTO_TYPE, POST_TYPE, EUROPA_TYPE, STATION_TYPE, IO_TYPE, GANYMEDE_TYPE, TITAN_TYPE, ENCELADUS_TYPE, IAPETUS_TYPE, MIRANDA_TYPE, TRITON_TYPE, MEMORIAL_TYPE, PLUTO_TYPE, MOON_TYPE, BALLROOM_TYPE, MERCURY_TYPE, CAMP_TYPE, CITY_TYPES, RACK_RELIEFS } from './yard';
import { bottle, colliderOnly, hall, platform } from './highball';
import { seaPiece } from './kraken';
import { mercuryGround, minersCamp } from './caloris';
import { enceladusGround } from './plumes';
import { iapetusGround } from './twofaces';
import { mirandaGround } from './verona';
import { memorialStation, tritonGround } from './geysers';
import { plutoGround } from './heart';
import { ballroom, moonGround } from './ballroom';
import { ganymedeGround } from './yards';
import { ioGround } from './flux';
import { europaGround, scienceStation } from './lineae';
import { phobosGround } from './stickney';
import { callistoGround, listeningPost } from './valhalla';
import { wallPiece } from './solarwall';
import { occatorDome, occatorGround, occatorStep } from './occator';
import { STEPS } from './ceres';
import { vestaGround } from './rheasilvia';

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

export const block = (x: number, y: number, z: number, cx = 0, cy = 0, cz = 0) => new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed();

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

export const noUv = (geometry: THREE.BufferGeometry) => {
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
    if (type === VESTA_GROUND_TYPE) return vestaGround(half);
    if (type === OCCATOR_TYPE) return occatorGround(half);
    if (type > OCCATOR_TYPE && type <= OCCATOR_TYPE + STEPS) return occatorStep(type - OCCATOR_TYPE, half);
    if (type === WALL_TYPE) return wallPiece(half);
    if (type === PHOBOS_TYPE) return phobosGround(half);
    if (type === CALLISTO_TYPE) return callistoGround(half);
    if (type === POST_TYPE) return listeningPost(half);
    if (type === EUROPA_TYPE) return europaGround(half);
    if (type === STATION_TYPE) return scienceStation(half);
    if (type === IO_TYPE) return ioGround(half);
    if (type === GANYMEDE_TYPE) return ganymedeGround(half);
    if (type === TITAN_TYPE) return seaPiece(half);
    if (type === ENCELADUS_TYPE) return enceladusGround(half);
    if (type === IAPETUS_TYPE) return iapetusGround(half);
    if (type === MIRANDA_TYPE) return mirandaGround(half);
    if (type === TRITON_TYPE) return tritonGround(half);
    if (type === MEMORIAL_TYPE) return memorialStation(half);
    if (type === PLUTO_TYPE) return plutoGround(half);
    if (type === MOON_TYPE) return moonGround(half);
    if (type === BALLROOM_TYPE) return ballroom(half);
    if (type === MERCURY_TYPE) return mercuryGround(half);
    if (type === CAMP_TYPE) return minersCamp(half);
    if (type === CITY_TYPES.platform) return platform(half);
    if (type === CITY_TYPES.hall) return hall(half);
    if (type === CITY_TYPES.bottle) return bottle(half);
    if (type === CITY_TYPES.neck) return colliderOnly(half);
    if (type > OCCATOR_TYPE + STEPS) return occatorDome(type - OCCATOR_TYPE - STEPS - 1, half);
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
  return { near, far: [], box: true, reliefs: RACK_RELIEFS };
}

/** The depot's plating: one tile of it every this far (units, 8 m), the scale of its plates of 0.5 to 2 m (see stationSurface). */
export const PLATING_TILE = STATION_TILE;

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
  hab: { seed: YARD_SEED + 22, tint: 0xb9bd9c, texts: ['HAB 2', 'COUCHES 1-40', 'AIRLOCK', 'O2 LOW?', 'PSYCHE 4'] },
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
 * its shadow side never goes black.
 */
function platingOf(part: DepotPart): THREE.MeshStandardMaterial {
  const name = PAINT_OF[part] ?? 'hall';
  return patchedPlating(name, MODULE_PAINT[name]);
}

/** The plating of platingOf in a paint of its own (`key` names it), for whatever else is built of the yards' modules (a hauler). Its geometry needs both texture coordinates (see macroUv). */
export function patchedPlating(key: string, paint: { seed: number; tint: number; texts: readonly string[] }): THREE.MeshStandardMaterial {
  const kept = platings.get(key);
  if (kept) return kept;
  const hull = stationSurface(paint.seed, paint.texts);
  grime ??= grimeTexture();
  patches ??= patchTexture();
  // the grime rides in the AO slot only for its texture coordinates of channel 1; it darkens the color itself, not the ambient light
  // both sides: a vault and a dome are seen from inside too
  const material = new THREE.MeshStandardMaterial({ map: hull.map, roughnessMap: hull.orm, metalnessMap: hull.orm, roughness: 1, metalness: 1, normalMap: hull.normal, color: paint.tint, emissive: 0x2c2a26, aoMap: grime, aoMapIntensity: 0, side: THREE.DoubleSide });
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
  platings.set(key, material);
  return material;
}

/** The second texture coordinates the patches and the grime are read with: the first ones (one unit every `tile`) at MACRO_TILE, shifted by `shift` so neighbouring parts differ. */
export function macroUv(geometry: THREE.BufferGeometry, shift: number, tile = PLATING_TILE): THREE.BufferGeometry {
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
export function lattice(half: THREE.Vector3, step: number): THREE.BufferGeometry[] {
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

/** Turns a shape built along y to lie along -x or z, and a ring lying in the xy plane to stand in the yz plane (quarter turns, no trigonometry). */
const Y_TO_MINUS_X = new THREE.Matrix4().set(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const Y_TO_Z = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const XY_TO_YZ = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** How high the habitation cylinders' saddles stand (units, 6 m; see HAB_LIFT in world/yard). */
const HAB_LIFT_DRAWN = HAB_LIFT;

/**
 * A round module's shell: an open cylinder of `radius` and `length` along `axis`, from
 * `thetaStart` round by `thetaLength` (all the way, or half of it for a vault), its plating at
 * its true scale, with the second texture coordinates for patches and grime.
 */
function roundShell(radius: number, length: number, axis: 'x' | 'y' | 'z', thetaStart: number, thetaLength: number, shift: number): THREE.BufferGeometry {
  const shell = new THREE.CylinderGeometry(radius, radius, length, 48, 1, true, thetaStart, thetaLength);
  const uv = shell.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * thetaLength * radius) / PLATING_TILE, (uv.getY(i) * length) / PLATING_TILE);
  const turned = axis === 'x' ? shell.applyMatrix4(Y_TO_X) : axis === 'z' ? shell.applyMatrix4(Y_TO_Z) : shell;
  return macroUv(turned, shift);
}

/** Texture coordinates for a curved part (a dome, a cap, a tube) from where its points lie, at the plating's scale: no pole pinched, no seam stretched. */
function planarUv(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geometry.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.7) / PLATING_TILE;
    uv[i * 2 + 1] = (p.getY(i) + p.getZ(i) * 0.3) / PLATING_TILE;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** A half ring standing in the yz plane at `x` over the ground at `base`: a vault's rib or a door's arch, `thick` units through. */
function arch(radius: number, thick: number, _width: number, x: number, base: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(radius, thick / 2, 6, 32, Math.PI).applyMatrix4(XY_TO_YZ).translate(x, base, 0);
}

/**
 * Moorings: for each pair, a cable from a point on a module down to an anchor on the ground,
 * pulled taut (Psyche's pull would never hold a module down by itself), the anchor a plate bolted
 * into the ground with a stake through it.
 */
function anchors(group: THREE.Group, looks: ReturnType<typeof depotLooks>, steel: THREE.Material, r: Randomizer, pairs: readonly (readonly [THREE.Vector3, THREE.Vector3])[]) {
  const cables: THREE.BufferGeometry[] = [];
  const plates: THREE.BufferGeometry[] = [];
  for (const [from, to] of pairs) {
    cables.push(noUv(cable(from, to, r.range(5, 20), 10)));
    plates.push(block(120, 30, 120, to.x, to.y + 15, to.z), block(30, 80, 30, to.x, to.y + 40, to.z));
  }
  group.add(new THREE.Mesh(mergeGeometries(cables), looks.cable));
  group.add(new THREE.Mesh(boxUv(mergeGeometries(plates.map(noUv)), 200), steel));
}

/** A plated box `half` large, with its second texture coordinates for patches and grime. */
const platedBox = (half: THREE.Vector3, shift: number, cx = 0, cy = 0, cz = 0) => macroUv(boxUv(block(half.x * 2, half.y * 2, half.z * 2, cx, cy, cz), PLATING_TILE), shift);

/**
 * One part of the depot within its collider box (see world/yard), round as a station in space is:
 * the hangar's vault (half a cylinder of plating with ribs, the door's arch in hazard paint with
 * lamps, the bay's number painted over it, light panels under the shell), its closed end with
 * the control room's windows and the pad in front of it, pipes along its inner walls; the
 * habitation cylinders on their saddles, their ends domed, windows in rows, a tube over to the
 * vault; the office tower, a column with its lift, and the round, glazed cab of Rask's office on
 * top under a plated dome; the crane's boom with its hook; the printer dome with its radiator
 * fins glowing dull red; the crusher and its hopper; the tanks on their legs; the dish; the floodlight masts.
 * Everything is moored to anchors in the ground by cables, and cables hang out of it everywhere.
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
      // inside the vault: pipes along the wall at hand height, and cables slung between them
      add([0.25, 0.45, 0.65].map((k) => block(half.x * 2, 24, 24, 0, -half.y + half.y * 2 * k, -Math.sign(center.z) * (half.z + 12))), steel);
      hang(4);
      break;
    }
    case 'vault': {
      // the shell over the bay: half a cylinder on the ground, from the door to past the end wall
      const length = half.x * 2;
      const base = -center.y + GROUND;
      group.add(new THREE.Mesh(roundShell(VAULT_RADIUS, length, 'x', Math.PI, Math.PI, shift).translate(0, base, 0), platingOf(part)));
      // ribs round the outside every 20 m, the door's arch in hazard paint, lamps along it
      const ribs: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 50; x < half.x; x += 400) ribs.push(arch(VAULT_RADIUS + 20, 40, 60, x, base));
      add(ribs, steel);
      add([arch(VAULT_RADIUS - 10, 50, 40, -half.x - 20, base)], looks.hazard, 200);
      const lamps: THREE.BufferGeometry[] = [];
      for (let k = 1; k < 12; k++) {
        const a = (k / 12) * Math.PI;
        lamps.push(block(30, 30, 30, -half.x - 30, base + (VAULT_RADIUS - 60) * sin(a), (VAULT_RADIUS - 60) * cos(a)));
      }
      add(lamps, looks.lamp);
      // the bay's number painted over the door, light panels under the shell, a beacon on top
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000 / PAINT_ASPECT).applyMatrix4(FACING_OUT).translate(-half.x - 25, base + VAULT_RADIUS * 0.82, 0), looks.sign));
      const panels: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 250; x < half.x; x += 400) for (const z of [-0.4, 0.4]) panels.push(block(200, 8, 260, x, base + BAY_HEIGHT + 60, z * BAY_HALF_WIDTH));
      add(panels, looks.light);
      add([block(50, 50, 50, half.x * 0.5, base + VAULT_RADIUS + 25, 0)], looks.beacon);
      anchors(group, looks, steel, r, [-1, 1].flatMap((side) => [-0.7, 0, 0.7].map((k) => [new THREE.Vector3(k * half.x, base + VAULT_RADIUS * 0.7, side * VAULT_RADIUS * 0.7), new THREE.Vector3(k * half.x, base, side * (VAULT_RADIUS + 700))] as const)));
      break;
    }
    case 'end': {
      // the vault's closed end: half a disc of plating, the control room's windows in it looking down on the pad
      const base = -center.y + GROUND;
      group.add(new THREE.Mesh(macroUv(planarUv(new THREE.CircleGeometry(VAULT_RADIUS, 48, 0, Math.PI).applyMatrix4(FACING_OUT).translate(0, base, 0)), shift), platingOf(part)));
      const strips: THREE.BufferGeometry[] = [];
      for (let z = -BAY_HALF_WIDTH + 100; z < BAY_HALF_WIDTH - 100; z += 220) if (r.nextFloat() > 0.25) strips.push(block(8, 70, 160, -half.x - 4, base + BAY_HEIGHT * 0.75, z + 80));
      add(strips, looks.windows);
      pad(group, local(PAD), looks);
      hang(3);
      break;
    }
    case 'hab': {
      // a cylinder lying on its saddles, its ends domed, rows of windows along it, a tube over to the vault
      const radius = HAB_RADIUS;
      group.add(new THREE.Mesh(roundShell(radius, half.x * 2, 'x', 0, Math.PI * 2, shift), platingOf(part)));
      for (const end of [-1, 1]) {
        const cap = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(end > 0 ? Y_TO_X : Y_TO_MINUS_X).translate(end * half.x, 0, 0);
        group.add(new THREE.Mesh(macroUv(planarUv(cap), shift), platingOf(part)));
      }
      const saddles: THREE.BufferGeometry[] = [];
      for (const x of [-0.6, 0, 0.6]) saddles.push(block(80, HAB_LIFT_DRAWN, radius * 1.4, x * half.x, -radius - HAB_LIFT_DRAWN / 2 + 40, 0), arch(radius + 12, 30, 80, x * half.x, 0));
      add(saddles, steel);
      const lit: THREE.BufferGeometry[] = [];
      for (let x = -half.x + 80; x < half.x - 40; x += 120) for (const a of [0.35, -0.35]) if (r.nextFloat() < 0.45) lit.push(block(50, 30, 6, x, radius * sin(a) * 0.98, radius * cos(a) * 0.98 * -Math.sign(center.z)));
      add(lit, looks.windows);
      const tube = new THREE.CylinderGeometry(80, 80, 360, 12).applyMatrix4(Y_TO_Z).translate(0, -radius * 0.3, Math.sign(center.z) * -(radius + 160));
      group.add(new THREE.Mesh(macroUv(planarUv(tube), shift), platingOf(part)));
      anchors(group, looks, steel, r, [-0.8, 0.8].map((k) => [new THREE.Vector3(k * half.x, radius * 0.6, Math.sign(center.z) * radius * 0.6), new THREE.Vector3(k * half.x, -center.y + GROUND, Math.sign(center.z) * (radius + 600))] as const));
      hang(3);
      break;
    }
    case 'tower': {
      // a column with a lift running up its side, guyed to the ground on four sides
      group.add(new THREE.Mesh(roundShell(TOWER_RADIUS, half.y * 2, 'y', 0, Math.PI * 2, shift), platingOf(part)));
      add(lattice(new THREE.Vector3(80, half.y, 80), 200).map((g) => g.translate(-TOWER_RADIUS - 80, 0, 0)), steel);
      const rings: THREE.BufferGeometry[] = [];
      for (let y = -half.y + 200; y < half.y; y += 400) rings.push(new THREE.TorusGeometry(TOWER_RADIUS + 10, 14, 6, 32).applyMatrix4(FLAT).translate(0, y, 0));
      add(rings, steel);
      const lit: THREE.BufferGeometry[] = [];
      for (let y = -half.y + 200; y < half.y - 100; y += 160) if (r.nextFloat() < 0.35) {
        const a = r.range(0, Math.PI * 2);
        lit.push(block(30, 40, 30, (TOWER_RADIUS + 2) * cos(a), y, (TOWER_RADIUS + 2) * sin(a)));
      }
      add(lit, looks.windows);
      anchors(group, looks, steel, r, [0, 1, 2, 3].map((k) => {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        return [new THREE.Vector3(TOWER_RADIUS * cos(a), half.y * 0.6, TOWER_RADIUS * sin(a)), new THREE.Vector3(1400 * cos(a), -half.y, 1400 * sin(a))] as const;
      }));
      hang(3);
      break;
    }
    case 'cab': {
      // Rask's office: a ring of glass under a plated dome, a floor below, an antenna and its beacon on top
      const floor = new THREE.CylinderGeometry(CAB_RADIUS, CAB_RADIUS * 0.8, half.y * 0.6, 32).translate(0, -half.y * 0.7, 0);
      group.add(new THREE.Mesh(macroUv(planarUv(floor), shift), platingOf(part)));
      add([new THREE.CylinderGeometry(CAB_RADIUS - 6, CAB_RADIUS - 6, half.y * 0.9, 32, 1, true).translate(0, 0, 0)], looks.windows);
      const roof = new THREE.SphereGeometry(CAB_RADIUS, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, half.y * 0.45, 0);
      group.add(new THREE.Mesh(macroUv(planarUv(roof), shift), platingOf(part)));
      add([block(20, 300, 20, CAB_RADIUS * 0.3, half.y + 300, 0), block(60, 60, 60, CAB_RADIUS * 0.3, half.y + 460, 0)], steel);
      add([block(40, 40, 40, CAB_RADIUS * 0.3, half.y + 510, 0)], looks.beacon);
      break;
    }
    case 'dome': {
      // the printer hall: a dome on the ground, ribbed, with its stacks glowing and anchors round its foot
      const base = -center.y + GROUND;
      const dome = new THREE.SphereGeometry(DOME_RADIUS, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, base, 0);
      group.add(new THREE.Mesh(macroUv(planarUv(dome), shift), platingOf(part)));
      const ribs: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 8; k++) ribs.push(arch(DOME_RADIUS + 15, 30, 50, 0, base).applyMatrix4(new THREE.Matrix4().set(cos(k * Math.PI / 8), 0, sin(k * Math.PI / 8), 0, 0, 1, 0, 0, -sin(k * Math.PI / 8), 0, cos(k * Math.PI / 8), 0, 0, 0, 0, 1)));
      add(ribs, steel);
      // the printers' waste heat goes out the only way it can in vacuum, as light: radiator fins on a
      // mast over the dome, their faces glowing a dull red; and the valves that vent the vats now and then
      const top = base + DOME_RADIUS;
      const fins: THREE.BufferGeometry[] = [block(80, 500, 80, 0, top + 200, 0)];
      const glowing: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        fins.push(block(1400, 20, 360, 0, top + 300 + side * 120, 0));
        glowing.push(block(1360, 4, 330, 0, top + 300 + side * 120 + 12, 0), block(1360, 4, 330, 0, top + 300 + side * 120 - 12, 0));
      }
      for (const [dx, dz] of [[-0.45, -0.3], [0.2, 0.5], [0.5, -0.35]]) fins.push(new THREE.CylinderGeometry(30, 40, 80, 8).translate(dx * DOME_RADIUS * 0.8, base + DOME_RADIUS * 0.75 + 40, dz * DOME_RADIUS * 0.8));
      add(fins, steel);
      add(glowing, looks.glow);
      anchors(group, looks, steel, r, [0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2;
        return [new THREE.Vector3(DOME_RADIUS * 0.75 * cos(a), base + DOME_RADIUS * 0.6, DOME_RADIUS * 0.75 * sin(a)), new THREE.Vector3((DOME_RADIUS + 500) * cos(a), base, (DOME_RADIUS + 500) * sin(a))] as const;
      }));
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
export function withCollider(group: THREE.Group, half: THREE.Vector3): THREE.Group {
  const collider = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  collider.userData.collider = true;
  collider.visible = false;
  group.add(collider);
  return group;
}

/**
 * Psyche's ground at a middle scale: a real photograph of a planetary surface, the Moon's valley
 * of Taurus-Littrow as the Lunar Reconnaissance Orbiter's narrow angle camera mapped it (see
 * public/assets/psyche/README.md): small craters, boulders, the scars of their tracks, bright
 * fresh ejecta, its broad shading taken out and its edges made to tile. Laid on at half its scale
 * (GROUND_TILE, 1.2 km a tile, its pixels 60 cm), tinted to Psyche's metal by the material.
 */
const GROUND_TILE = 24576;
function groundPhoto(): THREE.Texture {
  const texture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'assets/psyche/ground-2k.jpg');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
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
 * that never line up: dust and pebbles every DUST_TILE, the photograph of a real surface
 * every GROUND_TILE (see groundPhoto), the yard's grime every MACRO_TILE.
 */
/**
 * A world's ground in the three layers of the crater floor (dust and pebbles, the photograph of a
 * real surface, the grime), in `color` and lit a little by `emissive` (a light that keeps it from
 * going black where the sun stands low); its geometries take their texture coordinates from
 * groundUv.
 */
export function groundMaterial(color: number, emissive: number, metalness: number): THREE.MeshStandardMaterial {
  grime ??= grimeTexture();
  const middle = groundPhoto();
  const material = new THREE.MeshStandardMaterial({ map: dustTexture(), roughness: 0.9, metalness, color, emissive, aoMap: grime, aoMapIntensity: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.middleMap = { value: middle };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D middleMap;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  diffuseColor.rgb *= texture2D( middleMap, vAoMapUv * ${(MACRO_TILE / GROUND_TILE).toFixed(4)} ).rgb * 2.0;
  diffuseColor.rgb *= texture2D( aoMap, vAoMapUv ).rgb;`,
      );
  };
  return material;
}

/** A ground's texture coordinates for groundMaterial: laid on from above, its dust every DUST_TILE, the photograph and the grime on the second set. */
export function groundUv(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geometry.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / DUST_TILE;
    uv[i * 2 + 1] = p.getZ(i) / DUST_TILE;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return macroUv(geometry, 0.5, DUST_TILE);
}

/** A square grid lying flat (in x and z) over a box's footprint (`half` its half extents), in cells of `cell` (units). */
export function flatGrid(half: THREE.Vector3, cell: number): THREE.PlaneGeometry {
  const cells = Math.round((half.x * 2) / cell);
  const geometry = new THREE.PlaneGeometry(half.x * 2, half.z * 2, cells, cells);
  // laid flat: the plane's y into -z
  geometry.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  return geometry;
}

/** The ground's grid of a relief piece by default: cells of RELIEF_CELL (units, 75 m) over its square. */
const RELIEF_CELL = 1500;

/**
 * A ground whose top is a relief (see Relief), in its box's frame (`half` its half extents): the
 * relief on a grid of `cell` (units, 75 m unless a place needs it finer), in groundMaterial's
 * layers in `color` lit a little by `emissive`; the yards' set gives the field the same relief
 * (RACK_RELIEFS in world/yard), so it collides as this very ground; `shade` gives each vertex a tone of its own over the tint.
 */
export function reliefGround(half: THREE.Vector3, relief: Relief, color: number, emissive: number, cell = RELIEF_CELL, shade?: (x: number, z: number, color: THREE.Color) => void): THREE.Group {
  const geometry = flatGrid(half, cell);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, Math.min(half.y, relief(position.getX(i), position.getZ(i))));
  geometry.computeVertexNormals();
  const material = groundMaterial(color, emissive, 0.04);
  // a ground of more than one tone: each vertex's own over the tint (Iapetus's two faces)
  if (shade) {
    const tone = new THREE.Color();
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      shade(position.getX(i), position.getZ(i), tone);
      tone.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    material.vertexColors = true;
    // the faint glow takes the vertex's tone too: soot stays dark however the ice is lit
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;');
    };
    material.customProgramCacheKey = () => 'ground-toned';
  }
  const mesh = new THREE.Mesh(groundUv(geometry), material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

function crater(): THREE.Group {
  const half = DEPOT_LAYOUT.ground.half;
  const group = new THREE.Group();
  // the sun stands low over the crater: Psyche's bright metal dust and the yard's floodlights keep the floor from going black
  const material = groundMaterial(0xe6ddd0, 0x2e2a26, 0.15);
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
    const mesh = new THREE.Mesh(groundUv(geometry), material);
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
