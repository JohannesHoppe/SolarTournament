import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { rotateY, rotateZ, setFromEuler } from '../detthree';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { block, groundMaterial, lattice, macroUv, noUv, patchedPlating, PLATING_TILE, withCollider } from './boneyard';
import { iceTug } from './barge';
import { moonBeyond } from './horizon';
import { Noise } from './noise';
import { throatGround, throatSea } from './throat';
import { boxUv, industrialSurface, signTexture, surfaced } from '../view/surfaces';

/**
 * How the Throat's landmarks look (where they stand in world/throat, LANDMARKS), each built in its
 * box of the yards' set, x across the strait, y up, z along it, the box's middle at the origin:
 * the drilling rig on its stilts in the methane, the sponsor's sign on its pylon, an arch of rock,
 * the beacon tower on the Mesa's tip, the ice tug's wreck beached on the bank; and Titan's land
 * beyond the race world's ground out to the horizon, its basins opening into the sea.
 */

/** 1 m in units. */
const M = 20;

/** The gas company's rig in its yard's patched plating and stencils, and the steel of its derrick. */
const RIG_PAINT = { key: 'kraken-rig', seed: 9201, tint: 0x9a8a6a, texts: ['KRAKEN GAS', 'RIG 9', 'NO SPARKS', 'METHANE', 'KEEP CLEAR'] };
const STEEL_SEED = 9202;

/** Lamps of the landmarks: work lights in sodium orange, red beacons, the sign's neon red. */
const lamp = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.15).multiplyScalar(3), toneMapped: false });
const beacon = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(4), toneMapped: false });
const steel = () => new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(STEEL_SEED), 2), color: 0x7b776e });

/** The drilling rig: four legs on the methane's bed, a deck of two levels on them, the derrick and a flare stack over it, work lights all round. */
export function drillingRig(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const plating = patchedPlating(RIG_PAINT.key, RIG_PAINT);
  const bottom = -half.y;
  const deck = bottom + half.y * 0.95;
  const legs: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) legs.push(new THREE.CylinderGeometry(4 * M, 5 * M, deck - bottom, 12).translate(x * (half.x - 8 * M), (bottom + deck) / 2, z * (half.z - 8 * M)).toNonIndexed());
  // braces between the legs, low and halfway up
  for (const y of [bottom + 25 * M, bottom + 55 * M]) {
    legs.push(block(half.x * 2 - 16 * M, 3 * M, 3 * M, 0, y, half.z - 8 * M), block(half.x * 2 - 16 * M, 3 * M, 3 * M, 0, y, -half.z + 8 * M));
    legs.push(block(3 * M, 3 * M, half.z * 2 - 16 * M, half.x - 8 * M, y, 0), block(3 * M, 3 * M, half.z * 2 - 16 * M, -half.x + 8 * M, y, 0));
  }
  group.add(new THREE.Mesh(macroUv(boxUv(mergeGeometries(legs.map(noUv)), PLATING_TILE), 0.2), plating));
  // the deck in two levels, the upper one smaller, a crane's boom over its side
  const decks = [block(half.x * 2, 10 * M, half.z * 2, 0, deck + 5 * M, 0), block(half.x * 1.2, 14 * M, half.z * 1.1, -half.x * 0.3, deck + 17 * M, 0)];
  group.add(new THREE.Mesh(macroUv(boxUv(mergeGeometries(decks), PLATING_TILE), 0.6), plating));
  const derrickBase = deck + 24 * M;
  const derrickHeight = half.y - derrickBase;
  const derrick = lattice(new THREE.Vector3(9 * M, derrickHeight / 2, 9 * M), 12 * M).map((part) => part.translate(half.x * 0.35, derrickBase + derrickHeight / 2, 0));
  const flare = lattice(new THREE.Vector3(3 * M, derrickHeight * 0.4, 3 * M), 10 * M).map((part) => part.translate(-half.x * 0.8, derrickBase + derrickHeight * 0.4, half.z * 0.6));
  const boom = rotateZ(block(70 * M, 3 * M, 3 * M), 0.35).translate(-half.x * 0.6, deck + 30 * M, -half.z * 0.5);
  group.add(new THREE.Mesh(boxUv(mergeGeometries([...derrick, ...flare, boom].map(noUv)), 400), steel()));
  // the flare's flame of burning gas, work lights round the deck, a beacon on the derrick's top
  const flame = new THREE.Mesh(new THREE.ConeGeometry(4 * M, 18 * M, 8).translate(-half.x * 0.8, derrickBase + derrickHeight * 0.8 + 9 * M, half.z * 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.5, 0.12).multiplyScalar(4), toneMapped: false, transparent: true, opacity: 0.85 }));
  group.add(flame);
  const lights = lamp();
  for (let k = 0; k < 12; k++) {
    const angle = (k / 12) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.BoxGeometry(2 * M, 1.5 * M, 2 * M), lights);
    light.position.set(cos(angle) * half.x * 0.98, deck + 11 * M, sin(angle) * half.z * 0.98);
    group.add(light);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(3 * M, 8, 6), beacon());
  top.position.set(half.x * 0.35, half.y - 2 * M, 0);
  group.add(top);
  return withCollider(group, half);
}

/** The sponsor's sign: a plated pylon, and over it the brand in neon as a wide panel facing along the strait, lit on both sides. */
export function sponsorSign(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const plating = patchedPlating(RIG_PAINT.key, RIG_PAINT);
  const pylon = block(half.x * 1.6, half.y * 2 - 30 * M, half.z * 1.6, 0, -15 * M, 0);
  group.add(new THREE.Mesh(macroUv(boxUv(pylon, PLATING_TILE), 0.4), plating));
  const neon = new THREE.MeshBasicMaterial({ map: signTexture('VICTORY COLA', '#ff2a3a'), color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  // a panel each way, back to back, so the brand reads the right way round from both
  for (const turn of [0, Math.PI]) group.add(new THREE.Mesh(rotateY(new THREE.PlaneGeometry(130 * M, 32 * M), turn).translate(0, half.y - 14 * M, 0), neon));
  const frame = block(132 * M, 1.5 * M, 1.5 * M, 0, half.y - 30.5 * M, 0);
  group.add(new THREE.Mesh(boxUv(frame, 400), steel()));
  return withCollider(group, half);
}

/** The rock of the arches: Titan's water ice, hard as rock at its cold, under a crust of the haze's dark sand. */
const ARCH_TINT = 0x8a6e52;
const ARCH_GLOW = 0x3a2410;
const archNoise = new Noise(9203);

/** An arch of rock across the strait: a slab spanning from bluff to bluff, its faces broken and its underside sagging into a curve. */
export function rockArch(half: THREE.Vector3): THREE.Group {
  const geometry = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2, 48, 6, 8);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // the underside rises towards the middle, the whole of it broken up by the noise
    const share = Math.abs(x) / half.x;
    const sag = y < 0 ? half.y * 0.8 * (1 - share * share) : 0;
    const rough = archNoise.fractal(x / 1200, y / 1200, z / 1200, 3) * 9 * M;
    position.setXYZ(i, x, y + sag * 0.6 + rough * 0.4, z + rough);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(boxUv(geometry.toNonIndexed(), 3000), groundMaterial(ARCH_TINT, ARCH_GLOW, 0.02));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

/** The beacon tower on the Mesa's tip: a lattice mast in hazard steel, a red beacon at its top and work lights halfway, marking where the canyon splits off. */
export function beaconTower(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const mast = lattice(new THREE.Vector3(half.x * 0.8, half.y - 4 * M, half.z * 0.8), 10 * M).map((part) => part.translate(0, -4 * M, 0));
  group.add(new THREE.Mesh(boxUv(mergeGeometries(mast.map(noUv)), 400), steel()));
  const base = block(half.x * 2, 8 * M, half.z * 2, 0, -half.y + 4 * M, 0);
  group.add(new THREE.Mesh(macroUv(boxUv(base, PLATING_TILE), 0.1), patchedPlating(RIG_PAINT.key, RIG_PAINT)));
  const top = new THREE.Mesh(new THREE.SphereGeometry(4 * M, 10, 8), beacon());
  top.position.y = half.y - 4 * M;
  group.add(top);
  const lights = lamp();
  for (const y of [0, half.y * 0.5]) {
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(2 * M, 2 * M, 2 * M), lights);
      light.position.set(x * half.x * 0.85, y, z * half.z * 0.85);
      group.add(light);
    }
  }
  return withCollider(group, half);
}

/** The ice tug's wreck: one of the Jupiter lanes' tugs (see world/barge), run aground long ago, half sunk in the sand, rolled over on its side and broken at the nose. */
export function tugWreck(half: THREE.Vector3): THREE.Group {
  const tug = iceTug().root.clone();
  // built along x, its bow at -x: turned to lie along z, rolled, its nose down, sunk to its hoppers
  const scale = (half.z * 2) / 4300;
  tug.scale.setScalar(scale);
  const turned = new THREE.Group().add(tug);
  // a quarter turn about y lays its length along z; then rolled 20° onto its side, its nose 5° down
  setFromEuler(turned.quaternion, -0.09, Math.PI / 2, 0.35, 'YXZ');
  turned.position.y = -half.y * 0.35;
  return withCollider(new THREE.Group().add(turned), half);
}

/** Titan's dark land beyond the race world's ground and the methane where its basins open into the sea. */
const SAND = new THREE.Color(0.32, 0.24, 0.16);
const DUNE = new THREE.Color(0.42, 0.32, 0.21);
const METHANE = new THREE.Color(0.05, 0.035, 0.02);
const tone = new Noise(9204);

/** The land beyond the Throat's ground out to its horizon some 30 km away, drawn behind everything (see moonBeyond). */
export function throatBeyond(half: THREE.Vector3): THREE.Group {
  return moonBeyond(Math.min(half.x, half.z), 30 * 20000, throatGround, (x, z, color) => {
    if (throatGround(x, z) <= throatSea(x, z) + 1) color.copy(METHANE);
    else color.copy(SAND).lerp(DUNE, Math.max(0, tone.fractal(x / 30000, 0.5, z / 30000, 3)));
  }, 0x2a1a0c);
}
