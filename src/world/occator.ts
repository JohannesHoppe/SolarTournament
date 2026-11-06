import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from '../detmath';
import { Randomizer } from '../random';
import { Noise } from './noise';
import { signTexture } from '../view/surfaces';
import { groundMaterial, macroUv, patchedPlating, withCollider } from './boneyard';
import { behindAll, horizonMesh } from './horizon';
import { CEREALIA, CLIFF_X, DOMES, type HabitatDome, MARKET_HALF, MARKET_PLAN, planHeight, saltAt, STEPS, STEP_DEPTH, stepFace, stepTop, SURFACE_REACH, surfaceHeight, TERRACE, TERRACE_EDGE, TERRACE_HALF } from './ceres';

/**
 * How Occator on Ceres looks (where things are in world/ceres): the market terrace and the steps
 * of the crater's wall as one ground, the capital in them (the habitat domes, the mouths of the
 * old mine galleries in the steps' faces with the market's among them, lit windows cut into the
 * rock, the Rockborn's neon), and beyond it the crater's dark floor running out to the bright
 * salt of Cerealia Facula, the far rim, and the Ministry's launch ring hanging over the crater.
 */

/** Ceres's ground: dark grey dust, a little blue (sRGB, times the ground's photograph and dust: Ceres reflects some 9 % of the light), lit faintly by the town's own light. */
const CERES_TINT = 0xa8adb4;
const CERES_GLOW = 0x1e2026;

/** The near ground's reach (units, 9 km) and its cells (75 m). */
const NEAR_REACH = 180000;
const CELL = 1500;
/** The ground's dust and photograph laid along x and up a face alike, so a step's face is never stretched: one tile every TILE units. */
const TILE = 400;

/** The place's own axes into the world's (see world/ceres, onPlace): u along x to world z, w along z to world -x. */
const PLACE_TURN = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** Half extents in the world as the place's own (u, y, w). */
const planHalf = (half: THREE.Vector3) => new THREE.Vector3(half.z, half.y, half.x);
/** A group built along the place's own axes, turned into the world, with its collider (`half` in the world). */
function placed(group: THREE.Group, half: THREE.Vector3): THREE.Group {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.applyMatrix4(PLACE_TURN);
  });
  return withCollider(group, half);
}

/** How far beside the boxes (units, 2 km) the ground eases from their heights into the surface's. */
const EASE = 40000;

/**
 * The ground's height at the place's (u, w) on the stretch `stretch` (0 the terrace, k the wall's k-th step):
 * as its box stands while within the boxes' width, easing beside them into the surface the
 * scenery draws; the terrace's edge and what lies past the last step are the surface's.
 */
function groundHeight(stretch: number, x: number, z: number): number {
  const surface = planHeight(x, z);
  const box = stretch === 0 ? (x < TERRACE_EDGE ? surface : TERRACE) : x < stepFace(STEPS) + STEP_DEPTH ? stepTop(stretch) : surface;
  const t = Math.min(1, Math.max(0, (Math.abs(z) - TERRACE_HALF.z) / EASE));
  return box + (surface - box) * t * t * (3 - 2 * t);
}

/** The stretches of ground between the faces, along u: the terrace and the land before it, each step, the last reaching out past the crest. */
const stretches = () => Array.from({ length: STEPS + 1 }, (_, k) => [k === 0 ? -NEAR_REACH : stepFace(k), k === STEPS ? NEAR_REACH : stepFace(k + 1)] as const);

/** A grid of xs by zs, each corner where `place(i, j)` puts it (with its texture coordinates); wound to face up when its rows climb along x, towards -x when they climb along y. */
function sheet(xs: number[], zs: number[], place: (i: number, j: number) => [number, number, number, number, number]): THREE.BufferGeometry {
  const positions = new Float32Array(xs.length * zs.length * 3);
  const uvs = new Float32Array(xs.length * zs.length * 2);
  zs.forEach((_, j) => xs.forEach((_, i) => {
    const [x, y, z, u, v] = place(i, j);
    positions.set([x, y, z], (j * xs.length + i) * 3);
    uvs.set([u, v], (j * xs.length + i) * 2);
  }));
  const index: number[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i;
      const b = a + xs.length;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/**
 * The terrace and the wall's steps as one ground, in the terrace box's frame (its half extents
 * `half` in the world), built along the place's axes: each stretch between two faces a sheet of world/ceres's heights on a grid of 75 m, and
 * each step's face a wall of its own between the stretches below and above it (so its rock is
 * lit as a wall, never smeared into the ground), easing beside the boxes into the surface the
 * scenery draws; its dust and photograph laid along the ground and up the faces alike.
 */
export function occatorGround(half: THREE.Vector3): THREE.Group {
  const center = new THREE.Vector3((TERRACE_EDGE + CLIFF_X) / 2, TERRACE - TERRACE_HALF.y, 0);
  const zs: number[] = [];
  for (let z = -NEAR_REACH; z <= NEAR_REACH; z += CELL) zs.push(z);
  const parts: THREE.BufferGeometry[] = [];
  stretches().forEach(([x0, x1], k) => {
    const xs: number[] = [];
    for (let x = x0; x < x1; x += CELL) xs.push(x);
    xs.push(x1);
    parts.push(sheet(xs, zs, (i, j) => {
      const y = groundHeight(k, xs[i], zs[j]);
      return [xs[i] - center.x, y - center.y, zs[j] - center.z, zs[j] / TILE, xs[i] / TILE];
    }));
    // the face rising to this stretch from the one below, facing the field
    if (k > 0) {
      parts.push(sheet([0, 1], zs, (i, j) => {
        const y = groundHeight(i === 0 ? k - 1 : k, x0, zs[j]);
        return [x0 - center.x, y - center.y, zs[j] - center.z, zs[j] / TILE, y / TILE];
      }));
    }
  });
  const geometry = macroUv(mergeGeometries(parts), 0.5, TILE);
  const mesh = new THREE.Mesh(geometry, groundMaterial(CERES_TINT, CERES_GLOW, 0.02));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return placed(new THREE.Group().add(mesh), half);
}

/** The town's materials: lit windows, the dark of a gallery's mouth, the lamps, the domes' glass. */
function townLooks() {
  const windows = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(1.4), toneMapped: false });
  const cold = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1).multiplyScalar(1.2), toneMapped: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x050506 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.15).multiplyScalar(3), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(3), toneMapped: false });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.15, metalness: 0.6, emissive: new THREE.Color(1, 0.7, 0.4), emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
  return { windows, cold, dark, lamp, beacon, glass };
}
type TownLooks = ReturnType<typeof townLooks>;
let looks: TownLooks | null = null;

/** The Rockborn's paints of their domes: patched plating in their own colors, stencils of the capital. */
const DOME_PAINTS = [
  { seed: 3101, tint: 0xc9b9a0, texts: ['OCCATOR', 'RING 4', 'AIRLOCK', 'HAB 12', 'CERES FREE'] },
  { seed: 3102, tint: 0xa9b8b0, texts: ['HAB 7', 'ROCKBORN', 'O2', 'NO WALL', 'MARKET'] },
  { seed: 3103, tint: 0xc7a184, texts: ['HAB 31', 'CLINIC', 'WATER', 'DOCK 2'] },
];

/** Neon of the capital: what is written along the steps' faces (text, color, on which step, how wide in units). */
const NEON: readonly { text: string; color: string; step: number; z: number; width: number }[] = [
  { text: 'MARKET · NAVY SURPLUS', color: '#ff9d00', step: 1, z: 0, width: 2600 },
  { text: 'NO WALL IN SPACE', color: '#ff3cac', step: 2, z: -7000, width: 9000 },
  { text: 'ROCKBORN', color: '#4d91ff', step: 3, z: 9000, width: 7000 },
  { text: 'OCCATOR', color: '#ff9d00', step: 4, z: -14000, width: 8000 },
];

/** A quarter turn about y: a plane facing +z turned to face -u, towards the field from a step's face. */
const FACING_FIELD = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);

/**
 * What a step's face carries, in its box's frame (`world` its half extents in the world; built
 * along the place's axes, the face at -u):
 * the mouths of the old mine galleries (dark, lit inside, lamps over them), rows of windows cut
 * into the rock, the capital's neon; on the first step the market's mouth over the terrace.
 */
export function occatorStep(step: number, world: THREE.Vector3): THREE.Group {
  looks ??= townLooks();
  const half = planHalf(world);
  const group = new THREE.Group();
  const r = new Randomizer(3200 + step);
  const face = -half.x;
  // the box's own frame: its middle stands half its height over the terrace's base
  const yOf = (y: number) => y - (stepTop(step) - half.y);
  const top = yOf(stepTop(step));
  const foot = top - (stepTop(step) - (step === 1 ? TERRACE : stepTop(step - 1)));
  const dark: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  const cold: THREE.BufferGeometry[] = [];
  const lamps: THREE.BufferGeometry[] = [];
  const mouth = (z: number, y: number, w: number, h: number) => {
    dark.push(new THREE.BoxGeometry(40, h * 2, w * 2).translate(face - 10, y, z));
    // the gallery's lights running in, and lamps over its mouth
    for (let k = 1; k <= 3; k++) lit.push(new THREE.BoxGeometry(10, 20, w * 1.6).translate(face - 20 + k * 2, y + h * 0.7, z));
    for (const side of [-1, 1]) lamps.push(new THREE.BoxGeometry(40, 40, 40).translate(face - 30, y + h + 60, z + side * w * 0.8));
  };
  if (step === 1) mouth(MARKET_PLAN.z, yOf(MARKET_PLAN.y), MARKET_HALF.x, MARKET_HALF.y);
  for (let k = 0; k < 5; k++) {
    const z = r.range(-1, 1) * (half.z - 3000);
    if (step === 1 && Math.abs(z - MARKET_PLAN.z) < 6000) continue;
    mouth(z, foot + r.range(600, 1400), r.range(300, 700), r.range(250, 450));
  }
  // windows cut into the rock in rows, warm and now and then cold
  for (let row = 0; row < 6; row++) {
    const y = foot + 600 + row * ((top - foot - 900) / 6);
    for (let z = -half.z + 800; z < half.z - 800; z += r.range(500, 1600)) {
      if (r.nextFloat() < 0.4) continue;
      const strip = new THREE.BoxGeometry(12, 80, r.range(120, 600)).translate(face - 8, y, z);
      (r.nextFloat() < 0.2 ? cold : lit).push(strip);
    }
  }
  const add = (list: THREE.BufferGeometry[], material: THREE.Material) => {
    if (list.length) group.add(new THREE.Mesh(mergeGeometries(list.map((g) => g.toNonIndexed())), material));
  };
  add(dark, looks.dark);
  add(lit, looks.windows);
  add(cold, looks.cold);
  add(lamps, looks.lamp);
  // the capital's neon on this step's face
  for (const sign of NEON.filter((n) => n.step === step)) {
    const plane = new THREE.PlaneGeometry(sign.width, sign.width / 4).applyMatrix4(FACING_FIELD).translate(face - 30, top - (top - foot) * 0.3, sign.z);
    group.add(new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: signTexture(sign.text, sign.color), transparent: true, toneMapped: false, side: THREE.DoubleSide })));
  }
  return placed(group, world);
}

/**
 * A habitat dome in its box's frame (`half` its half extents, the box inside the half sphere on
 * the ground): a half sphere of patched plating in a Rockborn paint, a band of glass round it lit
 * warm from inside, ribs, lamps round its foot, an antenna with its beacon on top.
 */
export function occatorDome(index: number, half: THREE.Vector3): THREE.Group {
  looks ??= townLooks();
  const dome: HabitatDome = DOMES[index];
  const group = new THREE.Group();
  const base = -half.y;
  const paint = DOME_PAINTS[index % DOME_PAINTS.length];
  const shell = new THREE.SphereGeometry(dome.radius, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, base, 0);
  const uv = shell.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * dome.radius) / 400, (uv.getY(i) * Math.PI * dome.radius * 0.5) / 400);
  group.add(new THREE.Mesh(macroUv(shell, index * 0.37), patchedPlating(`occator-dome-${index % DOME_PAINTS.length}`, paint)));
  // the band of glass, a little proud of the shell, and the town's light through it
  const band = new THREE.SphereGeometry(dome.radius * 1.004, 40, 2, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.08).translate(0, base, 0);
  group.add(new THREE.Mesh(band, looks.glass));
  const lamps: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    lamps.push(new THREE.BoxGeometry(30, 30, 30).translate(dome.radius * 1.02 * cos(a), base + 20, dome.radius * 1.02 * sin(a)));
  }
  group.add(new THREE.Mesh(mergeGeometries(lamps.map((g) => g.toNonIndexed())), looks.lamp));
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(10, 14, 400, 6).translate(0, base + dome.radius + 200, 0), patchedPlating(`occator-dome-${index % DOME_PAINTS.length}`, paint)));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40).translate(0, base + dome.radius + 420, 0), looks.beacon));
  return withCollider(group, half);
}

/** Ceres's colors: dark grey dust, a little blue, in broad patches; the salt of the faculae bright, nearly white. */
const DUST = new THREE.Color(0.075, 0.078, 0.085);
const DARKER = new THREE.Color(0.055, 0.057, 0.062);
const SALT = new THREE.Color(0.55, 0.54, 0.5);
const tone = new Noise(3004);

/**
 * Ceres beyond the near ground, drawn behind everything (whatever flies is drawn over it): the
 * crater's floor and far rim and the land beyond (see surfaceHeight) from 6 km out, the
 * faculae's salt bright on the dark floor; and the Ministry's launch ring hanging over the
 * crater. Scenery only.
 */
export function ceres(): THREE.Group {
  const surface = horizonMesh({
    rings: 180,
    spokes: 360,
    first: 120000,
    reach: SURFACE_REACH,
    height: surfaceHeight,
    paint: (x, z, color) => {
      const patch = 0.5 + 0.5 * tone.fractal(x / 300000, 0.5, z / 300000, 4);
      color.copy(DUST).lerp(DARKER, patch * 0.8).lerp(SALT, saltAt(x, z));
    },
    glow: CERES_GLOW,
  });
  return new THREE.Group().add(surface, launchRing());
}

/** The Ministry's launch ring over Occator (units): 25 km over the crater's middle, 6 km across, its opening turned towards the town. */
const RING_AT = new THREE.Vector3(CEREALIA.x, 500000, CEREALIA.z);
const RING_RADIUS = 60000;

/**
 * The launch ring: a torus of the Ministry's polished armor, its coils lit in a row of blue
 * lamps round it, a beacon blinking red at its top; scenery only, drawn behind all that flies.
 */
function launchRing(): THREE.Group {
  const group = new THREE.Group();
  const armor = behindAll(new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.25, metalness: 0.9, emissive: 0x10141c, transparent: true, depthWrite: false }));
  const torus = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 3000, 16, 96), armor);
  const lamps: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    lamps.push(new THREE.BoxGeometry(1400, 1400, 1400).translate((RING_RADIUS - 3000) * cos(a), (RING_RADIUS - 3000) * sin(a), 0));
  }
  const lit = new THREE.Mesh(mergeGeometries(lamps.map((g) => g.toNonIndexed())), behindAll(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.55, 1).multiplyScalar(2.5), toneMapped: false, transparent: true, depthWrite: false })));
  for (const mesh of [torus, lit]) {
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    mesh.userData.shadowless = true;
  }
  group.add(torus, lit);
  group.position.copy(RING_AT);
  // its opening (the torus's axis, z) turned towards the town
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), RING_AT.clone().negate().normalize());
  return group;
}
