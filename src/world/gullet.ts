import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { CLIFF_X, onPlace, TERRACE } from './ceres';
import { boxUv, hazardSurface, industrialSurface, propagandaTexture, signTexture, surfaced } from '../view/surfaces';
import { smokeTexture } from '../view/textures';

/**
 * The Gullet (docs/campaign/STORY.md, "The Gullet"): Kesh's dive in the market gallery of
 * Occator, a scene in person (see campaign/scenes). A low cave cut into the rock behind the
 * market's mouth, its walls and ceiling lined with the Rockborn's patched plating: the long
 * counter of welded hull plate with its scratched top, stools before it, shelves of bottles
 * behind it lit from below, the bar's name in sickly green neon over them, a Rockborn slogan and
 * a Victory Cola sign half dead on the side walls, two old screens running the Ministry's
 * propaganda, a few tables, cables hanging from the ceiling, smoke hanging in the light, and in
 * the floor past the counter's end a stair going down to a heavy door under a hazard-striped
 * frame: the Pit. Worn and lived in; only the neon, the screens, the bottles' glow and the lamps
 * are light, and the sun's never reaches in (see ScenePlan.indoors). Built in its own frame (the floor's middle at
 * the origin, y up, the counter towards -x) and set at GULLET in the world.
 */

/** Where the Gullet lies at Occator: in the rock of the wall's first step, 200 m behind the market's mouth, level with it. */
export const GULLET = onPlace(CLIFF_X + 4000, TERRACE + 2400, 0);
/** The room's inner half extents (units: 14 m long, 9 m wide, 2.8 m high, a low cave). */
const HALF = new THREE.Vector3(140, 28, 90);
/** Where the clone stands, on the guests' side a step behind the stools, and its eyes' height over the floor (units, 1.7 m). */
export const GULLET_EYE_AT = new THREE.Vector3(-36, 0, -6);
export const GULLET_EYE = 34;
/** Where the people stand (units, in the Gullet's frame): Kesh behind her counter. */
export const GULLET_SPOTS = { keeper: new THREE.Vector3(-88, 0, -6) } as const;
/** The counter: its middle along x, how deep, how high (units: 0.8 m, 1 m), and from where to where along z. */
const COUNTER_X = -70;
const COUNTER_DEPTH = 16;
const COUNTER_HEIGHT = 20;
const COUNTER_FROM = -64;
const COUNTER_TO = 52;
/**
 * The stairwell down to the Pit, cut into the floor along the wall at +z past the counter's end,
 * where the clone sees it over its shoulder: from where its stair begins (x) and its inner side
 * (z) to its far end at WELL_END, where the door is, and how deep it goes (units, 2.8 m).
 */
const WELL_FROM = new THREE.Vector2(-40, 50);
const WELL_END = 10;
const WELL_DEPTH = 56;
const WELL_STEPS = 8;
/** The lamps: color, how bright (three.js's intensity), how far (units) and where. */
const LAMPS: readonly { color: number; intensity: number; reach: number; at: readonly [number, number, number] }[] = [
  // the bar's green over the counter
  { color: 0x8dffa0, intensity: 1, reach: 150, at: [-80, 48, -6] },
  // a warm bulb over the tables
  { color: 0xffc890, intensity: 1.3, reach: 220, at: [40, 50, 10] },
  // the red over the Pit's door
  { color: 0xff3020, intensity: 1.6, reach: 90, at: [-2, -14, 69] },
  // the slogan's magenta along its wall
  { color: 0xff4fd0, intensity: 0.7, reach: 100, at: [50, 40, -80] },
];
const GULLET_SEED = 7360;

const walls = { key: 'gullet', seed: GULLET_SEED, tint: 0x8c867c, texts: ['GALLERY 1', 'AIR 3', 'NO CREDIT', 'ROCKBORN', 'PUMP 4', 'KESH'] } as const;
const hull = { key: 'gullet-counter', seed: GULLET_SEED + 1, tint: 0x8a4f3c, texts: ['HULL 2209', 'NAVY SURPLUS', 'DO NOT WELD', 'BAY 6'] } as const;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const cylinder = (top: number, bottom: number, height: number, sides: number, x: number, y: number, z: number) => new THREE.CylinderGeometry(top, bottom, height, sides).translate(x, y, z).toNonIndexed();

/** Turns a plane facing +z to face +x, -z or -x (a quarter, half or three quarters about y, no trigonometry). */
const FACING = {
  x: new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1),
  '-z': new THREE.Matrix4().set(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1),
  '-x': new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1),
  z: new THREE.Matrix4(),
} as const;

/** A tube flickering as old neon does: off for a few frames now and then, held lit where motion is to be reduced. */
const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function flicker(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, often: number) {
  if (still) return;
  let off = 0;
  mesh.onBeforeRender = () => {
    if (off > 0) off--;
    else if (Math.random() < often) off = 1 + Math.floor(Math.random() * 6);
    mesh.material.opacity = off > 0 ? 0.25 : 1;
  };
}

/** The Gullet, built once. */
let built: THREE.Group | null = null;

export function gullet(): THREE.Group {
  if (built) return built;
  const r = new Randomizer(GULLET_SEED);
  const root = new THREE.Group();
  const plated = (parts: THREE.BufferGeometry[], look: typeof walls | typeof hull) => {
    const geometry = mergeGeometries(parts.map((part) => boxUv(part, PLATING_TILE / 4)));
    root.add(new THREE.Mesh(macroUv(geometry, r.range(0, 1), PLATING_TILE / 4), patchedPlating(look.key, look)));
  };
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(GULLET_SEED), 0.6), color: 0x55524c });
  const metal = (parts: THREE.BufferGeometry[]) => root.add(new THREE.Mesh(mergeGeometries(parts.map((part) => boxUv(part, 40))), steel));
  const light = (parts: THREE.BufferGeometry[], color: THREE.Color) => root.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color, toneMapped: false })));
  const sign = (texture: THREE.Texture, width: number, height: number, facing: keyof typeof FACING, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height).applyMatrix4(FACING[facing]).translate(x, y, z), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
    root.add(mesh);
    return mesh;
  };
  const { x: hx, y: hy, z: hz } = HALF;
  const wall = 4;
  const [wx, wz, ex] = [WELL_FROM.x, WELL_FROM.y, WELL_END];

  // the cave: the floor round the stairwell's hole, the ceiling, the four walls; the stairwell's
  // own walls and floor below, down to the Pit's door
  plated(
    [
      box(wx + hx, wall, hz * 2, (wx - hx) / 2, -wall / 2, 0),
      box(hx - ex, wall, hz * 2, (ex + hx) / 2, -wall / 2, 0),
      box(ex - wx, wall, wz + hz, (wx + ex) / 2, -wall / 2, (wz - hz) / 2),
      box(hx * 2, wall, hz * 2, 0, hy * 2 + wall / 2, 0),
      box(hx * 2, hy * 2, wall, 0, hy, -hz - wall / 2),
      box(hx * 2, hy * 2, wall, 0, hy, hz + wall / 2),
      box(wall, hy * 2, hz * 2, -hx - wall / 2, hy, 0),
      box(wall, hy * 2, hz * 2, hx + wall / 2, hy, 0),
      box(ex - wx, WELL_DEPTH, wall, (wx + ex) / 2, -WELL_DEPTH / 2, wz - wall / 2),
      box(ex - wx, wall, hz - wz, (wx + ex) / 2, -WELL_DEPTH - wall / 2, (wz + hz) / 2),
      box(wall, WELL_DEPTH, hz - wz, wx - wall / 2, -WELL_DEPTH / 2, (wz + hz) / 2),
      box(wall, WELL_DEPTH, hz - wz, ex + wall / 2, -WELL_DEPTH / 2, (wz + hz) / 2),
      box(ex - wx, WELL_DEPTH, wall, (wx + ex) / 2, -WELL_DEPTH / 2, hz + wall / 2),
    ],
    walls,
  );
  // the steps down, from the floor at the stairwell's near edge to its foot before the door
  const run = (ex - wx - 16) / WELL_STEPS;
  const rise = WELL_DEPTH / WELL_STEPS;
  const steps: THREE.BufferGeometry[] = [];
  for (let k = 0; k < WELL_STEPS; k++) {
    const top = -(k + 1) * rise;
    steps.push(box(run, top + WELL_DEPTH, hz - wz - 6, wx + (k + 0.5) * run, (top - WELL_DEPTH) / 2, (wz + hz) / 2));
  }
  metal(steps);
  // the Pit's heavy door at the stairwell's foot, in a frame of hazard paint, its sign over it
  const door = new THREE.Vector3(ex - 1.5, -WELL_DEPTH + 20, (wz + hz) / 2);
  metal([box(3, 40, 28, door.x, door.y, door.z), box(2, 3, 20, door.x - 2, door.y + 8, door.z), box(2, 3, 20, door.x - 2, door.y - 8, door.z), box(3, 6, 3, door.x - 2.5, door.y, door.z - 10)]);
  const hazard = new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 0.4) });
  root.add(
    new THREE.Mesh(
      mergeGeometries([box(2, 4, 36, door.x - 1, door.y + 22, door.z), box(2, 44, 4, door.x - 1, door.y, door.z - 16), box(2, 44, 4, door.x - 1, door.y, door.z + 16)].map((part) => boxUv(part, 16))),
      hazard,
    ),
  );
  sign(signTexture('THE PIT', '#ff3b3b'), 30, 7.5, '-x', door.x - 2.5, door.y + 29, door.z);
  // a rail along the stairwell's open side, so nobody walks into it
  metal([box(ex - wx, 1.4, 1.4, (wx + ex) / 2, 20, wz + 1), box(1.4, 20, 1.4, wx + 2, 10, wz + 1), box(1.4, 20, 1.4, (wx + ex) / 2, 10, wz + 1), box(1.4, 20, 1.4, ex - 2, 10, wz + 1)]);

  // the counter of welded hull plate, its top of scratched steel overhanging the guests' side, a
  // foot rail along it, a plate welded over a hole in its front
  const length = COUNTER_TO - COUNTER_FROM;
  const middle = (COUNTER_TO + COUNTER_FROM) / 2;
  plated([box(COUNTER_DEPTH - 2, COUNTER_HEIGHT - 1.6, length, COUNTER_X, (COUNTER_HEIGHT - 1.6) / 2, middle), box(0.8, 8, 14, COUNTER_X + COUNTER_DEPTH / 2, 9, middle + 18)], hull);
  metal([box(COUNTER_DEPTH + 4, 1.6, length + 2, COUNTER_X + 2, COUNTER_HEIGHT - 0.8, middle), new THREE.CylinderGeometry(0.8, 0.8, length, 8).applyMatrix4(ALONG_Z).translate(COUNTER_X + COUNTER_DEPTH / 2 + 4, 4, middle).toNonIndexed()]);
  // glasses, a bottle and an ashtray on it
  metal([cylinder(1.3, 1.1, 3, 8, COUNTER_X + 3, COUNTER_HEIGHT + 1.5, -18), cylinder(1.3, 1.1, 3, 8, COUNTER_X + 4, COUNTER_HEIGHT + 1.5, 14), cylinder(3, 2.6, 0.8, 12, COUNTER_X + 2, COUNTER_HEIGHT + 0.4, 30)]);
  // stools before it, one knocked over
  const stools: THREE.BufferGeometry[] = [];
  for (const z of [-48, -28, -8, 12, 32]) stools.push(cylinder(5, 5, 1.4, 12, COUNTER_X + 22, 15, z), cylinder(0.9, 1.6, 14, 8, COUNTER_X + 22, 7, z), cylinder(4, 4, 0.6, 12, COUNTER_X + 22, 0.3, z));
  stools.push(new THREE.CylinderGeometry(0.9, 1.6, 14, 8).applyMatrix4(ALONG_X).translate(COUNTER_X + 40, 2, 42).toNonIndexed(), new THREE.CylinderGeometry(5, 5, 1.4, 12).applyMatrix4(ALONG_X).translate(COUNTER_X + 47.7, 5, 42).toNonIndexed());
  metal(stools);

  // the shelves behind the counter, the bottles on them lit from below by a strip under each
  const shelves: THREE.BufferGeometry[] = [];
  const strips: THREE.BufferGeometry[] = [];
  const bottles: THREE.BufferGeometry[] = [];
  const glass = [new THREE.Color(0.9, 0.55, 0.15), new THREE.Color(0.25, 0.75, 0.3), new THREE.Color(0.55, 0.3, 0.12), new THREE.Color(0.75, 0.8, 0.85), new THREE.Color(0.6, 0.15, 0.2)];
  for (const y of [14, 23, 32]) {
    shelves.push(box(8, 1, length - 10, -hx + 4, y, middle));
    strips.push(box(0.6, 0.5, length - 12, -hx + 8, y - 0.8, middle));
    for (let z = COUNTER_FROM + 8; z < COUNTER_TO - 6; z += r.range(2.6, 5)) {
      if (r.nextFloat() < 0.15) continue;
      const tall = r.range(5, 8);
      const bottle = new THREE.CylinderGeometry(r.range(0.7, 1.3), r.range(1.1, 1.6), tall, 7).translate(-hx + r.range(3, 6), y + 0.5 + tall / 2, z).toNonIndexed();
      // brighter at the foot, where the strip lights it
      const tint = glass[Math.floor(r.range(0, glass.length))];
      const position = bottle.getAttribute('position');
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const lit = 0.75 - (0.45 * (position.getY(i) - y)) / tall;
        colors[i * 3] = tint.r * lit;
        colors[i * 3 + 1] = tint.g * lit;
        colors[i * 3 + 2] = tint.b * lit;
      }
      bottle.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      bottles.push(bottle);
    }
  }
  metal([...shelves, box(2, 34, 2, -hx + 4, 17, COUNTER_FROM + 4), box(2, 34, 2, -hx + 4, 17, COUNTER_TO - 4)]);
  light(strips, new THREE.Color(1, 0.8, 0.5).multiplyScalar(0.9));
  root.add(new THREE.Mesh(mergeGeometries(bottles), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // the neon: the bar's name over the shelves, a slogan of the Rockborn on one side wall, a
  // Victory Cola sign half dead on the other
  flicker(sign(signTexture('THE GULLET', '#4dff6a'), 64, 14, 'x', -hx + 1, hy * 2 - 7.5, middle), 0.004);
  sign(signTexture('THE ROCK REMEMBERS', '#ff3cac'), 76, 19, 'z', 50, 38, -hz + 1);
  flicker(sign(signTexture('VICTORY COLA', '#ff3b3b', [1, 2, 4, 9]), 52, 13, '-z', -14, 40, hz - 1), 0.03);
  // two old screens running the Ministry's propaganda, in their frames
  metal([box(40, 24, 2, -28, 36, -hz + 1.5), box(36, 22, 2, 34, 34, hz - 1.5)]);
  sign(propagandaTexture('A TREMENDOUS WAR', 'MINISTRY OF WAR · ENLIST · PRINT · WIN · '), 36, 20.25, 'z', -28, 36, -hz + 2.6);
  sign(propagandaTexture('PRINT. FLY. WIN.', 'THE PRESIDENTIAL GAMES · LIVE ON LANES WATCH · '), 32, 18, '-z', 34, 34, hz - 2.6);

  // a few tables, each with its stools
  const tables: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[18, -52], [62, -14], [50, 52]] as const) {
    tables.push(cylinder(10, 10, 1.4, 14, x, 20, z), cylinder(1.4, 3.5, 20, 8, x, 10, z), cylinder(6, 6, 0.6, 12, x, 0.3, z));
    for (const [dx, dz] of [[14, 4], [-12, -8]] as const) tables.push(cylinder(4.5, 4.5, 1.4, 12, x + dx, 14, z + dz), cylinder(0.8, 1.4, 13, 8, x + dx, 6.5, z + dz));
  }
  metal(tables);
  // mugs and a deck of cards' worth of litter on them
  metal([cylinder(1.3, 1.1, 3, 8, 16, 22.2, -50), cylinder(1.3, 1.1, 3, 8, 62, 22.2, -18), cylinder(1.3, 1.1, 3, 8, 66, 22.2, -10), box(4, 0.3, 3, 48, 20.85, 54)]);

  // the ceiling's girders, a pipe along it, cables run between them and hanging slack
  const ceiling: THREE.BufferGeometry[] = [];
  for (let x = -hx + 30; x < hx; x += 50) ceiling.push(box(4, 3, hz * 2, x, hy * 2 - 1.5, 0));
  ceiling.push(new THREE.CylinderGeometry(1.4, 1.4, hx * 2, 10).applyMatrix4(ALONG_X).translate(0, hy * 2 - 4, hz - 8).toNonIndexed());
  for (let k = 0; k < 7; k++) {
    // a cable sagging between two girders, as a chain of short straight pieces
    const x0 = -hx + 30 + 50 * Math.floor(r.range(0, 5));
    const z0 = r.range(-hz + 10, hz - 10);
    const z1 = THREE.MathUtils.clamp(z0 + r.range(-30, 30), -hz + 4, hz - 4);
    const sag = r.range(4, 12);
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      const a = i / pieces;
      const b = (i + 1) / pieces;
      const [xa, xb] = [x0 + 50 * a, x0 + 50 * b];
      const [za, zb] = [z0 + (z1 - z0) * a, z0 + (z1 - z0) * b];
      const [ya, yb] = [hy * 2 - 3 - sag * 4 * a * (1 - a), hy * 2 - 3 - sag * 4 * b * (1 - b)];
      const from = new THREE.Vector3(xa, ya, za);
      const to = new THREE.Vector3(xb, yb, zb);
      const piece = new THREE.CylinderGeometry(0.35, 0.35, from.distanceTo(to), 5);
      piece.applyMatrix4(new THREE.Matrix4().makeBasis(...basisAlong(to.clone().sub(from).normalize())));
      ceiling.push(piece.translate((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2).toNonIndexed());
    }
    // and now and then an end hanging loose
    if (k % 3 === 0) ceiling.push(box(0.7, sag + 6, 0.7, x0 + 50, hy * 2 - 3 - (sag + 6) / 2, z1));
  }
  metal(ceiling);
  // bare bulbs on their cables over the tables and the counter
  light([new THREE.SphereGeometry(1.6, 8, 6).translate(40, 50, 10), new THREE.SphereGeometry(1.6, 8, 6).translate(-80, 49, -6)], new THREE.Color(1, 0.85, 0.6).multiplyScalar(3));
  metal([box(0.5, 4, 0.5, 40, 53.5, 10), box(0.5, 5, 0.5, -80, 53, -6)]);
  for (const { color, intensity, reach, at } of LAMPS) {
    const lamp = new THREE.PointLight(color, intensity, reach, 0);
    lamp.position.set(...at);
    root.add(lamp);
  }

  // smoke hanging in the light under the ceiling
  const smoke = smokeTexture();
  for (const [x, y, z, size, tint] of [[-60, 44, -10, 60, 0x9fffb4], [30, 46, 10, 80, 0xffd2a0], [80, 40, -50, 60, 0xff9fe0], [-10, 38, 40, 50, 0xffffff]] as const) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: tint, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    puff.position.set(x, y, z);
    puff.scale.setScalar(size);
    root.add(puff);
  }

  root.position.copy(GULLET);
  root.updateMatrixWorld(true);
  built = root;
  return root;
}

/** A cylinder built along y laid along x, or along z (a quarter turn about z or x, no trigonometry). */
const ALONG_X = new THREE.Matrix4().set(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const ALONG_Z = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** Three axes whose second is `along` (unit): a cylinder built along y turned to lie along it. */
function basisAlong(along: THREE.Vector3): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const side = new THREE.Vector3(0, 0, 1).cross(along);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  return [side, along.clone(), side.clone().cross(along)];
}

/** A point of the Gullet (in its frame, on its floor) in the world. */
export const inGullet = (local: THREE.Vector3, out = new THREE.Vector3()) => out.copy(local).add(GULLET);
