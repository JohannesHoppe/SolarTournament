import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { block, groundMaterial, groundUv, macroUv, noUv, patchedPlating, PLATING_TILE, reliefGround, withCollider } from './boneyard';
import { boxUv, hazardSurface, industrialSurface, signTexture, surfaced, wreckInnards } from '../view/surfaces';
import { paint } from './worldship';
import { rotateX, rotateY, rotateZ } from '../detthree';
import { CALLISTO_TINT } from './valhalla';
import { BATTLE_GROUND_CELL, battleRelief, CROSS, freshIce, HALL, HULL_HALF } from './battlefield';

/**
 * How Valhalla looks as a world fought over (where things are in world/battlefield): its ground,
 * the dark dust of Callisto with bright ice where the scarps' cliffs and the cruiser's furrow
 * laid it bare; the cruiser Steadfast's two halves in the Navy's old grey-olive, sooted at their
 * torn ends, frost on their backs, the frames and cable runs of their halls lit by the last
 * emergency lamps, her name still on her flanks and in neon on the bridge tower, a tube or two
 * dead; the ice bridges over the gorges; the clones' pads round the edge.
 */

/** The Navy's plating as the cruiser wears it: grey-olive, stencilled, patched; and sooted where she broke. */
const NAVY = { seed: 5180, tint: 0x7f877a, texts: ['UEN', 'STEADFAST', 'BC-07', 'DECK 4', 'DAMAGE CONTROL', 'NO ENTRY', 'FRAME 212'] };
const SOOT = { seed: 5181, tint: 0x3b3936, texts: ['UEN', 'BC-07', 'HULL BREACH'] };
/** Ice: frost on the cruiser's back, the bridges over the gorges; bright, cold, a little blue. */
const ICE_TINT = 0xe8eef6;
const ICE_GLOW = 0x1c2026;
/** Dust and laid-bare ice on the ground, multiplied over Callisto's tint. */
const DUST = new THREE.Color(1, 1, 1);
/** Jupiter's cream glow on the ground, stronger than on the campaign's place: the fights are low over it, often in the scarps' shade. */
const BATTLE_GLOW = 0x2e2a22;
const BARE = new THREE.Color(1.45, 1.5, 1.62);

/** The ground of the arena in its box's frame (`half` its half extents): Callisto's dust, bright where the ice lies bare (see freshIce). */
export function battleGround(half: THREE.Vector3): THREE.Group {
  return reliefGround(half, battleRelief, CALLISTO_TINT, BATTLE_GLOW, BATTLE_GROUND_CELL, (x, z, color) => color.copy(DUST).lerp(BARE, freshIce(x, z)));
}

/** Old neon: dark for a moment now and then, lit for good where motion is to be reduced. */
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function failing(material: THREE.MeshBasicMaterial, mesh: THREE.Mesh) {
  if (reducedMotion) return;
  let darkUntil = 0;
  mesh.onBeforeRender = () => {
    const now = performance.now();
    if (now > darkUntil + 400 && Math.random() < 0.01) darkUntil = now + 40 + Math.random() * 260;
    material.opacity = now < darkUntil ? 0.2 : 1;
  };
}

/** Light that shines on its own: the emergency lamps, beacons. */
const glowing = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });

/** Plated geometry: the plating's texture coordinates on the parts, one mesh. */
function plated(parts: THREE.BufferGeometry[], material: THREE.Material, shift: number): THREE.Mesh {
  return new THREE.Mesh(macroUv(boxUv(mergeGeometries(parts.map(noUv)), PLATING_TILE), shift), material);
}

/**
 * A half of the cruiser Steadfast in its floor's frame (`half` the floor's half extents; the
 * floor lies at the bottom of the hull, see world/battlefield): the hull's plating as its pieces
 * collide, the hall's frames, cable runs and emergency lamps, torn plates bent out at both its
 * ends, frost on its back, her name on both flanks; `bow` the bow half, else the stern.
 */
export function cruiserHalf(half: THREE.Vector3, bow: boolean): THREE.Group {
  const r = new Randomizer(bow ? 5182 : 5183);
  const group = new THREE.Group();
  const [L, H, W] = [HULL_HALF.x, HULL_HALF.y, HULL_HALF.z];
  // the hull's middle in the floor's frame
  const lift = H - half.y;
  const hallBottom = -H + half.y * 2;
  const hallTop = hallBottom + HALL.height;
  const wallX = CROSS / 2 + (L - CROSS / 2) / 2;
  const wallLength = L - CROSS / 2;
  const wallThick = W - HALL.width / 2;
  const hull = [block(L * 2, half.y * 2, W * 2, 0, -H + half.y, 0), block(L * 2, H - hallTop, W * 2, 0, (H + hallTop) / 2, 0)];
  for (const x of [-wallX, wallX]) for (const z of [-1, 1]) hull.push(block(wallLength, HALL.height, wallThick, x, (hallBottom + hallTop) / 2, z * (W - wallThick / 2)));
  // armor belts along the flanks, a meter proud of the plating, broken where the tunnel runs
  for (const x of [-wallX, wallX]) for (const z of [-1, 1]) hull.push(block(wallLength * 0.96, 120, 20, x, hallBottom - 60, z * (W + 10)));
  const sooted: THREE.BufferGeometry[] = [];
  const innards: THREE.BufferGeometry[] = [];
  // the hall's frames every 25 m: posts on its walls and a beam under its roof; the deck plates
  // of its floor; cable runs along both walls
  for (let x = -L + 250; x < L - 100; x += 500) {
    if (Math.abs(x) < CROSS / 2 + 40) continue;
    for (const z of [-1, 1]) innards.push(block(40, HALL.height, 40, x, (hallBottom + hallTop) / 2, z * (HALL.width / 2 - 20)));
    innards.push(block(40, 40, HALL.width, x, hallTop - 20, 0));
  }
  for (const z of [-1, 1]) for (const y of [hallBottom + 140, hallTop - 120]) innards.push(block(L * 2 - 200, 24, 24, 0, y, z * (HALL.width / 2 - 12)));
  // torn plates bent out at both ends: the bow's crumpled where it struck, the other end where
  // she broke apart; soot over the last stretch before each
  for (const end of [-1, 1]) {
    for (let k = 0; k < 26; k++) {
      const around = r.nextFloat();
      const onFlank = around < 0.5;
      const y = onFlank ? r.range(-H + 40, H - 40) : r.nextFloat() < 0.5 ? H - 40 : -H + 40;
      const z = onFlank ? (r.nextFloat() < 0.5 ? -1 : 1) * (W - 20) : r.range(-W + 40, W - 40);
      // never across the hall's mouth
      if (Math.abs(z) < HALL.width / 2 + 40 && y > hallBottom - 40 && y < hallTop + 40) continue;
      const plate = new THREE.BoxGeometry(r.range(140, 360), 24, r.range(160, 420)).toNonIndexed();
      const turn = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4), 1).normalize());
      sooted.push(plate.applyMatrix4(turn).translate(end * (L + r.range(0, 120)), y, z));
    }
    sooted.push(block(30, H * 2 - 40, W * 2 + 40, end * (L - 600), 0, 0));
  }
  const navy = patchedPlating('steadfast', NAVY);
  const soot = patchedPlating('steadfast-soot', SOOT);
  group.add(plated(hull, navy, bow ? 0.1 : 0.6), plated(sooted, soot, bow ? 0.3 : 0.8));
  const inside = new THREE.MeshStandardMaterial({ ...surfaced(wreckInnards(), 1.5), color: 0x9a9a88 });
  group.add(new THREE.Mesh(boxUv(mergeGeometries(innards.map(noUv)), 400), inside));
  // frost drifted on her back and in the lee of the turrets
  const frost: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 14; k++) frost.push(block(r.range(400, 1600), r.range(10, 30), r.range(300, W * 1.6), r.range(-L + 800, L - 800), H + 4, r.range(-W * 0.3, W * 0.3)));
  group.add(new THREE.Mesh(groundUv(mergeGeometries(frost.map(noUv))), groundMaterial(ICE_TINT, ICE_GLOW, 0.02)));
  // the emergency lamps along the hall, amber, every 40 m on both walls, and red beacons on her back
  const lamps: THREE.BufferGeometry[] = [];
  for (let x = -L + 400; x < L - 300; x += 800) for (const z of [-1, 1]) lamps.push(block(60, 30, 10, x + (z > 0 ? 400 : 0), hallBottom + 200, z * (HALL.width / 2 - 5)));
  group.add(new THREE.Mesh(mergeGeometries(lamps), glowing(2.6, 1.3, 0.35)));
  const beacons = [-L + 600, 0, L - 600].map((x) => block(40, 40, 40, x, H + 20, W - 100));
  group.add(new THREE.Mesh(mergeGeometries(beacons), glowing(3, 0.3, 0.2)));
  // her name on both flanks, as the Navy painted it
  group.add(paint({ emblem: true, name: 'STEADFAST', registry: 'BC-07' }, bow ? 5184 : 5185, bow ? L * 0.15 : -L * 0.2, H * 0.35, W + 22, L * 1.1));
  for (const child of group.children) child.position.y += lift;
  return withCollider(group, half);
}

/** The bridge tower on the stern half's back (`half` its half extents): plated, its windows dark but for two lit by emergency power, her name over them in neon gone half dead, a mast with a beacon. */
export function cruiserTower(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.add(plated([block(half.x * 2, half.y * 2, half.z * 2), block(half.x * 2.3, 40, half.z * 2.2, 0, half.y * 0.4, 0)], patchedPlating('steadfast', NAVY), 0.4));
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.15, metalness: 0.6 });
  group.add(new THREE.Mesh(block(10, 120, half.z * 1.7, -half.x - 5, half.y * 0.55, 0), glass));
  group.add(new THREE.Mesh(mergeGeometries([block(12, 100, 160, -half.x - 6, half.y * 0.55, -200), block(12, 100, 160, -half.x - 6, half.y * 0.55, 260)]), glowing(1.6, 1.1, 0.55)));
  const neon = new THREE.MeshBasicMaterial({ map: signTexture('STEADFAST', '#4d91ff', [2, 6]), transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(rotateY(new THREE.PlaneGeometry(half.z * 1.8, half.z * 0.45), -Math.PI / 2).translate(-half.x - 12, half.y * 0.05, 0), neon);
  failing(neon, sign);
  group.add(sign);
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(5186), 2), color: 0x6f736f });
  group.add(new THREE.Mesh(boxUv(block(16, 500, 16, half.x * 0.4, half.y + 250, 0), 400), steel));
  group.add(new THREE.Mesh(block(30, 30, 30, half.x * 0.4, half.y + 510, 0), glowing(3, 0.3, 0.2)));
  return withCollider(group, half);
}

/** A turret on the bow half's back (`half` its half extents): a plated drum with two barrels, one snapped short. */
export function cruiserTurret(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const drum = new THREE.CylinderGeometry(half.x, half.x * 1.05, half.y * 2, 18).toNonIndexed();
  group.add(plated([drum, block(half.x * 1.4, half.y, half.z * 1.2, -half.x * 0.3, half.y * 0.5, 0)], patchedPlating('steadfast', NAVY), 0.7));
  const barrels = [-1, 1].map((side) => rotateZ(new THREE.CylinderGeometry(14, 18, side < 0 ? 700 : 320, 10), Math.PI / 2).translate(-half.x - (side < 0 ? 350 : 160), half.y * 0.3, side * 80).toNonIndexed());
  group.add(plated(barrels, patchedPlating('steadfast-soot', SOOT), 0.2));
  return withCollider(group, half);
}

/** An ice bridge over a gorge (`half` its half extents): a slab of old ice, its underside hung with a few icicles. */
export function iceBridge(half: THREE.Vector3): THREE.Group {
  const r = new Randomizer(5187);
  const parts = [block(half.x * 2, half.y * 2, half.z * 2)];
  for (let k = 0; k < 12; k++) parts.push(rotateX(new THREE.ConeGeometry(r.range(20, 50), r.range(60, 140), 6), Math.PI).translate(r.range(-half.x * 0.6, half.x * 0.6), -half.y - 40, r.range(-half.z * 0.8, half.z * 0.8)).toNonIndexed());
  const mesh = new THREE.Mesh(groundUv(mergeGeometries(parts.map(noUv))), groundMaterial(ICE_TINT, ICE_GLOW, 0.02));
  mesh.castShadow = mesh.receiveShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

/** A clone's pad (`half` its half extents, its top the deck): a deck of steel on a plated pedestal sunk into the ice, a hazard ring, lamps round its edge. */
export function clonePad(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.add(plated([block(half.x * 1.9, half.y * 2 - 40, half.z * 1.9, 0, -20, 0)], patchedPlating('navy-post', { seed: 5101, tint: 0x8c9480, texts: ['UEN', 'PRINT BAY', 'KEEP CLEAR'] }), 0.5));
  const steel = industrialSurface(5188);
  const deck = new THREE.MeshStandardMaterial({ ...surfaced(steel, 1), color: 0x5d6068, emissive: 0x6a7080, emissiveMap: steel.map, emissiveIntensity: 0.35 });
  group.add(new THREE.Mesh(boxUv(block(half.x * 2, 40, half.z * 2, 0, half.y - 20, 0), 400), deck));
  const hazard = new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 1), emissive: 0x3a3000, emissiveIntensity: 0.6 });
  const stripes = [-1, 1].flatMap((side) => [block(half.x * 2, 4, 60, 0, half.y + 2, side * (half.z - 30)), block(60, 4, half.z * 2 - 120, side * (half.x - 30), half.y + 2, 0)]);
  group.add(new THREE.Mesh(boxUv(mergeGeometries(stripes), 120), hazard));
  const lamps = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => block(30, 20, 30, sx * (half.x - 15), half.y + 10, sz * (half.z - 15))));
  group.add(new THREE.Mesh(mergeGeometries(lamps), glowing(3, 1.86, 0.45)));
  return withCollider(group, half);
}
