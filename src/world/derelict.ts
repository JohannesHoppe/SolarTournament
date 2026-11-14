import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { ARENAS, sternAt } from './arenas';
import { MASS } from './bodies';
import { BREACH_CORE, BREACH_DECK_COUNT, BREACH_EDGE, HULL_BOXES } from './shapes';
import { cos, sin } from '../detmath';
import { setFromAxisAngle, setFromEuler } from '../detthree';
import { FROZEN_NEAR, frostMaterial, frostShader, frozenSurface, frozenUv, loadFrozen, type FrozenCell } from '../view/frozen';

/**
 * The break of the world ship PAAA 01 (see README, "The universe"): ice crystals still escaping
 * from both torn ends as a slow mist, and the ship's dead around the two breaches, settlers in
 * everyday clothes and crew in coveralls, and as many of the crew in the ship's light emergency
 * suits, who fought the leak from inside until the hull broke and blew them out with the air:
 * caught on the torn plating and the broken decks, and drifting out of the breaches, thick right
 * outside them and thinning with the distance, rimed with frost that glints in the sun, turning
 * slowly. Scenery: the mist only patters on a hull flying through it (see mistDensity), and a ship
 * that meets one of the dead knocks it away by the two masses (see Derelict.meet), on every
 * browser by its own reckoning, nothing of it shared or scored.
 */

/** The stern half's axis, pointing away from the break. */
const STERN_AXIS = new THREE.Vector3(...sternAt(1), 0).sub(new THREE.Vector3(...sternAt(0), 0)).normalize();

/**
 * The two jets of mist: where each leaves inside a torn end of the hull, from the tanks bared in
 * its breach (units; 2800 past the torn section's middle, at x -14200 on the bow, at sternAt(9200),
 * 3000 to the side, on the stern), and the way it drifts, out of the breach into the gap between
 * the halves.
 */
const JETS = [
  { from: new THREE.Vector3(-14200, 0, 0), along: new THREE.Vector3(1, 0, 0) },
  { from: new THREE.Vector3(...sternAt(9200), 3000), along: STERN_AXIS.clone().negate() },
] as const;
/** A jet reaches MIST_REACH (units, 450 m) from its torn end, widening from a radius of MIST_START (units, 70 m, the hull's) to MIST_END (units, 200 m). */
const MIST_REACH = 9000;
const MIST_START = 1400;
const MIST_END = 4000;
/** The crystals drift out at MIST_SPEED (units/s, 4 m/s): one crosses its jet in a little under two minutes. */
const MIST_SPEED = 80;
/** Crystals in both jets together on the full picture (fewer on a cheaper one, see setParticles); every MIST_VEIL-th of them a faint, wide veil instead of a speck. */
const MIST_CRYSTALS = 3000;
const MIST_VEIL = 7;
/** A speck's size (units, 1.5 m) and how large it may grow on screen (device px); a veil's size (units, 50 m) and its cap. */
const SPECK_SIZE = 30;
const SPECK_PIXELS = 5;
const VEIL_SIZE = 1000;
const VEIL_PIXELS = 160;

/** How thick a jet's mist is at `s`, the share of its reach (0 at its torn end): swelling in, thinning out. */
const along = (s: number) => THREE.MathUtils.smoothstep(s, 0, 0.08) * (1 - s);

/** The welded structures the torn ends belong to (see world/arenas, derelict): the bow 0, the stern 1. The jets ride with them. */
export const JET_WELDS = [0, 1] as const;

/** A jet in the world: where it leaves its torn end and the way it drifts. */
export interface Jet {
  from: THREE.Vector3;
  along: THREE.Vector3;
}

const offset = new THREE.Vector3();
/**
 * How thick the mist is at `point` (0..1): what the crystals there would make of it, on the
 * jets' axes in full, fading out to their edges and their reach. The shader below spreads the
 * crystals by the same shape. `jets` are the torn ends where the halves are now (as laid out
 * by default).
 */
export function mistDensity(point: THREE.Vector3, jets: readonly Jet[] = JETS): number {
  let density = 0;
  for (const jet of jets) {
    offset.subVectors(point, jet.from);
    const t = offset.dot(jet.along);
    if (t <= 0 || t >= MIST_REACH) continue;
    const s = t / MIST_REACH;
    const radius = MIST_START + (MIST_END - MIST_START) * s;
    const across = offset.addScaledVector(jet.along, -t).length();
    density = Math.max(density, (1 - THREE.MathUtils.smoothstep(across, radius * 0.7, radius)) * along(s));
  }
  return density;
}

const mistVertex = /* glsl */ `
  attribute vec4 seed;
  uniform float time;
  uniform float viewport;
  uniform vec3 from[2];
  uniform vec3 along[2];
  varying float vAlpha;
  varying float vVeil;
  void main() {
    int jet = seed.w < 0.5 ? 0 : 1;
    vec3 axis = along[jet];
    vec3 side = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 up = cross(side, axis);
    float s = fract(seed.x + time * ${(MIST_SPEED / MIST_REACH).toFixed(6)});
    // spread over the jet's cross-section, turning slowly as it drifts
    float angle = seed.y * 6.2832 + s * 1.5;
    float radius = sqrt(seed.z) * mix(${MIST_START.toFixed(1)}, ${MIST_END.toFixed(1)}, s) * 0.85;
    vec3 at = from[jet] + axis * s * ${MIST_REACH.toFixed(1)} + (side * cos(angle) + up * sin(angle)) * radius;
    vec4 view = modelViewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * view;
    vVeil = mod(floor(seed.y * 1000.0), ${MIST_VEIL.toFixed(1)}) < 0.5 ? 1.0 : 0.0;
    float size = vVeil > 0.5 ? ${VEIL_SIZE.toFixed(1)} : ${SPECK_SIZE.toFixed(1)};
    float pixels = size * projectionMatrix[1][1] * viewport * 0.5 / -view.z;
    gl_PointSize = clamp(pixels, 1.5, vVeil > 0.5 ? ${VEIL_PIXELS.toFixed(1)} : ${SPECK_PIXELS.toFixed(1)});
    // a speck smaller than its point keeps its light, spread thinner, so it never twinkles
    float spread = min(1.0, pixels / gl_PointSize);
    vAlpha = smoothstep(0.0, 0.08, s) * (1.0 - s) * (vVeil > 0.5 ? 0.025 : 0.8 * max(spread, 0.25));
  }
`;

const mistFragment = /* glsl */ `
  uniform vec3 light;
  varying float vAlpha;
  varying float vVeil;
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float d = dot(at, at) * 4.0;
    float shape = vVeil > 0.5 ? exp(-d * 3.0) * (1.0 - d) : 1.0 - smoothstep(0.3, 1.0, d);
    if (shape <= 0.0) discard;
    // ice scatters the sun a little bluer than it shines
    gl_FragColor = vec4(light * vec3(0.8, 0.92, 1.1) * shape * vAlpha, 1.0);
  }
`;

/**
 * The dead, by what they look like: each kind one of the figures of the frozen dead (its number,
 * see view/frozen, loadFrozen: MakeHuman's, a man or a woman, young or old, in everyday clothes,
 * the crew's coveralls or under an old helmet, posed in free fall or against the cold; or the
 * crew in the ship's light emergency suits, `suited`), how many of them (on the full picture;
 * fewer on a cheaper one, see setParticles), and how the figure built in code is dressed and
 * posed that stands in for it beyond FROZEN_NEAR and until it has loaded. A pair counts as one:
 * two holding on to each other. 196 in all, 204 bodies.
 */
const DEAD_KINDS = [
  { dress: 'everyday', pose: 'crouch', count: 14, suited: false },
  { dress: 'everyday', pose: 'spread', count: 13, suited: false },
  { dress: 'work', pose: 'curled', count: 12, suited: false },
  { dress: 'work', pose: 'reach', count: 11, suited: false },
  { dress: 'everyday', pose: 'spread', count: 10, suited: false },
  { dress: 'everyday', pose: 'curled', count: 10, suited: false },
  { dress: 'work', pose: 'crouch', count: 10, suited: false },
  { dress: 'everyday', pose: 'pair', count: 8, suited: false },
  { dress: 'suit', pose: 'reach', count: 18, suited: true },
  { dress: 'suit', pose: 'spread', count: 18, suited: true },
  { dress: 'suit', pose: 'crouch', count: 18, suited: true },
  { dress: 'suit', pose: 'curled', count: 18, suited: true },
  { dress: 'suit', pose: 'reach', count: 18, suited: true },
  { dress: 'suit', pose: 'spread', count: 18, suited: true },
] as const;
type Dress = (typeof DEAD_KINDS)[number]['dress'];
type Pose = 'crouch' | 'spread' | 'curled' | 'reach' | 'embrace';
const DEAD_TOTAL = DEAD_KINDS.reduce((sum, kind) => sum + kind.count, 0);
/** The index of each kind's first body among all of the dead. */
const FIRST = DEAD_KINDS.map((_, k) => DEAD_KINDS.slice(0, k).reduce((sum, kind) => sum + kind.count, 0));
/** The fewest of each kind drawn on the cheapest picture (a share of them). */
const DEAD_LEAST = 0.4;
/** At most NEAR_MOST of the dead, the nearest within FROZEN_NEAR of the camera, are drawn as their whole figures; the rest as the low figure built in code. */
const NEAR_MOST = 16;
/** A body's height (units, 1.75 m): it is drawn only while it stands at least a pixel high on the picture. */
const BODY_HEIGHT = 35;

/**
 * Where the breaches are: each torn section's box (see world/shapes, HULL_BOXES, and the derelict's
 * layout in world/arenas) ends MOUTH (units, 210 m) beyond where its jet of mist leaves it (at 40 %
 * of its half length); the plating is torn off over the last EDGE_FROM (units, 133 m) of it, the
 * decks deeper inside, and its core is CORE_UP high and CORE_ACROSS wide (half of each, units,
 * 90 m and 78 m).
 */
const TORN = ARENAS.find((arena) => arena.id === 'derelict')!.layout.placements!.find((piece) => piece.type === 1)!;
const TORN_HALF = HULL_BOXES[1].clone().multiplyScalar(TORN.scale);
const MOUTH = TORN_HALF.x * 0.6;
const EDGE_FROM = (1 - BREACH_EDGE[0]) * TORN_HALF.x;
const CORE_UP = TORN_HALF.y * BREACH_CORE;
const CORE_ACROSS = TORN_HALF.z * BREACH_CORE;
/** The hull's boxes as laid out, for keeping the dead out of them (see clearOfHull). */
const HULL = ARENAS.find((arena) => arena.id === 'derelict')!.layout.placements!.map((piece) => ({
  center: piece.position,
  inverse: piece.orientation.clone().invert(),
  half: HULL_BOXES[piece.type].clone().multiplyScalar(piece.scale),
}));

/**
 * How the dead lie about the breaches, reckoned from the break (see README, "The Derelict"): the
 * air rushing out of a torn deck carried its people out at a few m/s, and the ship broke long
 * ago, so whoever left that fast is thousands of kilometers away by now. What is left is what
 * left slowly. A half of the hull of some 50 million tonnes holds on to a body that leaves it
 * slower than its escape speed, about 0.1 m/s a few hundred meters off its torn end (its mass
 * spread along its 2 km; the sun's tide only pulls apart what strays tens of kilometers off):
 * those swing out and back on slow loops about their
 * half, hours long, each passing again where it set out, so they lie thickest right outside the
 * breach and thin out with the distance, a few out to a kilometer. CAUGHT of the dead (SUITED_CAUGHT
 * of the suited crew, who were at the leak) never left: they hang on the torn plating, in the
 * mouth of the breach and on the broken decks inside. Of the rest, NEAR_SHARE lie within NEAR_OUT
 * (units, 60 m) of the mouth, MID_SHARE out to MID_OUT (units, 250 m) and the rest out to FAR_OUT
 * (units, 1 km); TOGETHER of them were blown out of a deck with another, within GROUP_REACH
 * (units, 15 m) of it.
 */
const CAUGHT = 0.18;
const SUITED_CAUGHT = 0.4;
const NEAR_SHARE = 0.6;
const MID_SHARE = 0.28;
const NEAR_OUT = 1200;
const MID_OUT = 5000;
const FAR_OUT = 20000;
const TOGETHER = 0.45;
const GROUP_REACH = 300;
/**
 * Within a round their slow loops are slow drifts: a body sways about its place by up to
 * DEAD_DRIFT (units, 25 m) at DEAD_RATE (rad/s: once in half an hour to an hour), at most about
 * 0.1 m/s, as fast as a body bound to its half moves this close to it; the caught ones sway
 * CAUGHT_SWAY (units, 1.5 m) on
 * the plating. They tumble at up to DEAD_SPIN (rad/s), the spin the blast gave them never
 * damped in vacuum; the caught ones turn a tenth as fast.
 */
const DEAD_DRIFT = 500;
const DEAD_RATE = [0.0018, 0.0035] as const;
const CAUGHT_SWAY = 30;
const DEAD_SPIN = 0.12;
/** A body as the ships meet it: a ball of DEAD_RADIUS (units, 0.9 m) of DEAD_MASS (kg) against a ship of MASS.ship. */
const DEAD_RADIUS = 18;
const DEAD_MASS = 90;
/** A body knocked away tumbles at its closing speed over DEAD_TUMBLE (rad per unit/s: 150 m/s tumbles it at about 3 rad/s), at most DEAD_TUMBLE_MOST. */
const DEAD_TUMBLE = 0.001;
const DEAD_TUMBLE_MOST = 4;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A part of a body: `geometry` (each face 0..1 in its texture coordinates) in `cell` of the
 * frozen dead's atlas (see view/frozen), its share of clothes `cloth` (1 takes the instance's
 * color in full, 0 keeps the atlas's own).
 */
function part(geometry: THREE.BufferGeometry, cell: FrozenCell, cloth: number): THREE.BufferGeometry {
  const mapped = frozenUv(geometry, cell);
  const flat = mapped.index ? mapped.toNonIndexed() : mapped;
  const count = flat.getAttribute('position').count;
  flat.setAttribute('cloth', new THREE.Float32BufferAttribute(new Array(count).fill(cloth), 1));
  flat.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3));
  return flat;
}

/** A limb as a box `width` thick from `from` to `to`. */
function limb(from: THREE.Vector3, to: THREE.Vector3, width: number, cell: FrozenCell, cloth: number): THREE.BufferGeometry {
  const length = from.distanceTo(to);
  const box = new THREE.BoxGeometry(width, length, width * 0.85).translate(0, length / 2, 0);
  box.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), to.clone().sub(from).normalize()));
  return part(box.translate(from.x, from.y, from.z), cell, cloth);
}

/** Where a pose puts one side's (`side` 1 the left, -1 the right) elbow, hand, knee and foot (units, the hips at the origin, the front towards +z). */
function joints(pose: Pose, side: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const s = side;
  switch (pose) {
    // the relaxed crouch of a body in free fall: arms drifting up and forward, hips and knees bent
    case 'crouch':
      return [v(s * 6.5, 7, 4), v(s * 6, 9, 9.5), v(s * 2.6, -7, 6.5), v(s * 2.8, -15.5, 2.5)];
    // limp, limbs spread
    case 'spread':
      return [v(s * 10.5, 11.5, 1), v(s * 15.5, 14, 2.5), v(s * 5, -8, 1.5), v(s * 6.5, -16.5, -1.5)];
    // curled up against the cold, knees to the chest, arms round them
    case 'curled':
      return [v(s * 5, 6, 5), v(s * 2.5, 3, 9), v(s * 2.2, 4, 8), v(s * 2.4, -4, 4.5)];
    // one arm out as if for a handhold, the other and the legs trailing
    case 'reach':
      return s > 0 ? [v(8, 13, 4), v(12, 17, 9), v(2.5, -8, -2), v(3, -16, -4)] : [v(-6, 6, -2), v(-7, 1, -1), v(-2.5, -7.5, -3), v(-3, -15.5, -5)];
    // holding on to another: the arms round its back
    case 'embrace':
      return [v(s * 6, 9, 4.5), v(s * 3, 9, 10), v(s * 2.4, -7, 4), v(s * 2.6, -15, 1)];
  }
}

/**
 * A human body frozen in `pose`, low poly (units; 1.75 m tall standing, the hips at the origin,
 * the front towards +z), dressed in `dress`: everyday clothes or a work suit tinted by the
 * instance's color, hair on a bare head; or the ship's light emergency suit with its air pack and a
 * helmet, its visor cracked. Its head and helmet are spheres of `detail` (0: twenty faces, as the
 * distant figure has them: some 220 triangles in all).
 */
function person(pose: Pose, dress: Dress, detail: number): THREE.BufferGeometry {
  const suited = dress === 'suit';
  const fabric: FrozenCell = suited ? 'suit' : dress === 'work' ? 'work' : 'cloth';
  const cloth = suited ? 0.15 : 1;
  const bare: FrozenCell = suited ? 'suit' : 'skin';
  const curled = pose === 'curled';
  const head = v(0, curled ? 13.5 : 14.5, curled ? 2.5 : pose === 'crouch' ? 0.8 : 0);
  const parts: THREE.BufferGeometry[] = [];
  const thick = suited ? 1.35 : 1;
  // chest and belly, a suit's torso one piece with its air pack on the back
  if (suited) {
    parts.push(part(new THREE.BoxGeometry(9.5, 12, 6.5).translate(0, 5.5, 0), fabric, cloth));
    parts.push(part(new THREE.BoxGeometry(8, 9, 3.5).translate(0, 6.5, -5), 'suit', 0));
  } else {
    parts.push(part(new THREE.BoxGeometry(7.5, 6, 4.6).translate(0, 8, 0), fabric, cloth));
    parts.push(part(new THREE.BoxGeometry(6.8, 5.5, 4.2).translate(0, 2.75, 0), fabric, cloth));
  }
  parts.push(part(new THREE.BoxGeometry(2, 2, 2).translate(0, 11.5, 0), bare, 0));
  if (suited) {
    // the helmet, and its visor in front, cracked
    parts.push(part(new THREE.IcosahedronGeometry(4.2, detail).translate(head.x, head.y, head.z), 'suit', 0));
    parts.push(part(new THREE.IcosahedronGeometry(4.25, detail).scale(0.8, 0.62, 0.5).translate(head.x, head.y + 0.3, head.z + 2.2), 'visor', 0));
  } else {
    parts.push(part(new THREE.IcosahedronGeometry(2.4, detail).scale(1, 1.2, 1).translate(head.x, head.y, head.z), 'skin', 0));
    // the hair over the crown and the back of the head, ice in it
    parts.push(part(new THREE.IcosahedronGeometry(2.55, 0).scale(1, 1.05, 1).translate(head.x, head.y + 0.6, head.z - 0.6), 'hair', 0));
  }
  for (const side of [1, -1]) {
    const shoulder = v(side * 4.6 * (suited ? 1.15 : 1), 9.8, 0);
    const hip = v(side * 2, -0.5, 0);
    const [elbow, hand, knee, foot] = joints(pose, side);
    parts.push(limb(shoulder, elbow, 2.6 * thick, fabric, cloth), limb(elbow, hand, 2.2 * thick, fabric, cloth));
    parts.push(part(new THREE.BoxGeometry(1.6 * thick, 2, 1 * thick).translate(hand.x, hand.y, hand.z), bare, 0));
    parts.push(limb(hip, knee, 3.4 * thick, fabric, cloth), limb(knee, foot, 2.8 * thick, fabric, cloth));
    // a shoe or a boot
    parts.push(part(new THREE.BoxGeometry(2.4 * thick, 1.6, 4.2).translate(foot.x, foot.y, foot.z + 1), suited ? 'suit' : 'hair', 0));
  }
  return mergeGeometries(parts);
}

/** The body of a kind: one person, or two holding on to each other, face to face; its head as round as `detail` (see person). */
function bodyOf(kind: (typeof DEAD_KINDS)[number], detail: number): THREE.BufferGeometry {
  if (kind.pose !== 'pair') return person(kind.pose, kind.dress, detail);
  const one = person('embrace', kind.dress, detail);
  // the other turned about to face the first (a half turn about y, by mirroring both x and z)
  const other = person('embrace', 'work', detail).scale(-1, 1, -1).translate(0, -1, 9);
  return mergeGeometries([one, other]).translate(0, 0, -4.5);
}

/** What the dead wore: work suits (orange, gray, blue) and everyday clothes, all of it paled by the frost. */
const CLOTHES = [0xd8763a, 0x8c929c, 0x3f5f8f, 0x6b4f3a, 0x7a2f3f, 0x4f6b4a, 0xb0a48a, 0x2f3238] as const;
const RIME = new THREE.Color(0xe6eef6);

/** The dead's vertex color: the chunk's own, with the instance's color mixed in by the vertex's share of clothes (the template holds the include, not the chunk's text). */
const DEAD_COLOR = `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = color * mix(vec3(1.0), instanceColor.rgb, cloth);
#endif`;

/**
 * Where one of the dead is: by its breach (`breach` 0 the bow's, 1 the stern's), `at` from the
 * mouth along the breach's axis out of the hull, across and up (see breachFrames), and how it
 * sways (`drift` in the same frame) and turns. Once a ship knocked it away it flies off from where
 * it was (`shoved`, at field time `since`).
 */
interface Dead {
  breach: 0 | 1;
  at: THREE.Vector3;
  drift: THREE.Vector3;
  rate: number;
  phase: number;
  turn: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  shoved: { since: number; from: THREE.Vector3; velocity: THREE.Vector3; turn: THREE.Quaternion; axis: THREE.Vector3; spin: number } | null;
}

const UP = new THREE.Vector3(0, 1, 0);
const ACROSS = new THREE.Vector3(1, 0, 0);
/** Each breach's frame, as the mist's shader builds its jet's: its mouth, a side across its axis, and up (see breachFrames). */
const mouths = [new THREE.Vector3(), new THREE.Vector3()];
const sides = [new THREE.Vector3(), new THREE.Vector3()];
const ups = [new THREE.Vector3(), new THREE.Vector3()];
function breachFrames(jets: readonly Jet[]) {
  jets.forEach((jet, i) => {
    mouths[i].copy(jet.from).addScaledVector(jet.along, MOUTH);
    sides[i].crossVectors(jet.along, Math.abs(jet.along.y) < 0.9 ? UP : ACROSS).normalize();
    ups[i].crossVectors(sides[i], jet.along);
  });
}
/** A point `at` of breach `b`'s frame in the world, into `out`. */
function framed(jets: readonly Jet[], b: number, at: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(mouths[b]).addScaledVector(jets[b].along, at.x).addScaledVector(sides[b], at.y).addScaledVector(ups[b], at.z);
}

const inBox = new THREE.Vector3();
/** Whether a body at `point` (as laid out) lies clear of every box of the hull. */
function clearOfHull(point: THREE.Vector3): boolean {
  return HULL.every(({ center, inverse, half }) => {
    inBox.subVectors(point, center).applyQuaternion(inverse);
    return Math.abs(inBox.x) > half.x + DEAD_RADIUS || Math.abs(inBox.y) > half.y + DEAD_RADIUS || Math.abs(inBox.z) > half.z + DEAD_RADIUS;
  });
}

/** One kind's instanced bodies: its whole figure for the nearest (`dressed` once it has loaded, else the one built in code), its low one for the rest (see Derelict.draw). */
interface Level {
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  dressed: boolean;
}

/** The scenery of the break: its mist and its dead. */
export class Derelict {
  readonly group = new THREE.Group();
  /** The jets where the torn ends are now (see moveJets). */
  readonly jets: Jet[] = JETS.map((jet) => ({ from: jet.from.clone(), along: jet.along.clone() }));
  private readonly mist: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Each kind's two levels. */
  private readonly levels: Level[] = [];
  /** Each kind's near level (see Level), its whole figure once loaded. */
  readonly meshes: THREE.InstancedMesh[] = [];
  /** How many kinds wear their whole figure (see dress). */
  dressed = 0;
  /** Each of the dead, in the order of the kinds. */
  private readonly dead: Dead[] = [];
  /** Each one's kind, and the color of its clothes. */
  private readonly kindOf: number[] = [];
  private readonly colors: THREE.Color[] = [];
  /** Where each of the dead is now and how it is turned (see update). */
  private readonly where: THREE.Vector3[] = [];
  private readonly turned: THREE.Quaternion[] = [];
  /** How many of each kind are drawn (see setParticles), and which of all are drawn whole now (see draw). */
  private readonly drawn: number[] = DEAD_KINDS.map((kind) => kind.count);
  private readonly whole = new Uint8Array(DEAD_TOTAL);
  private readonly nearest: number[] = [];
  private viewport = 1000;

  constructor(light: THREE.Color) {
    const r = new Randomizer(7101);
    this.mist = this.buildMist(r, light);
    this.group.add(this.mist);
    const surface = frozenSurface();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: surface.map,
      roughnessMap: surface.orm,
      metalnessMap: surface.orm,
      bumpMap: surface.bump,
      bumpScale: 0.6,
      roughness: 1,
      metalness: 1,
    });
    // the clothes take the instance's color, the bare skin, the hair and the suits keep their own; the frost over all of it
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cloth;').replace('#include <color_vertex>', DEAD_COLOR);
      frostShader(shader);
    };
    material.customProgramCacheKey = () => 'derelict-dead';
    breachFrames(this.jets);
    const last: (THREE.Vector3 | null)[] = [null, null];
    DEAD_KINDS.forEach((kind, k) => {
      const level = (detail: number) => {
        const mesh = new THREE.InstancedMesh(bodyOf(kind, detail), material, kind.count);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.visible = false;
        this.group.add(mesh);
        return mesh;
      };
      const near = level(1);
      this.levels.push({ near, far: level(0), dressed: false });
      this.meshes.push(near);
      for (let i = 0; i < kind.count; i++) {
        const d = this.place(r, kind.suited, last);
        this.dead.push(d);
        this.kindOf.push(k);
        this.colors.push(new THREE.Color(CLOTHES[r.nextInt() % CLOTHES.length]).lerp(RIME, r.range(0.35, 0.55)));
        this.where.push(new THREE.Vector3());
        this.turned.push(new THREE.Quaternion());
      }
    });
    this.update(0);
    // the figures built in code stand in for MakeHuman's until they have loaded (none in Node's tests)
    if (typeof document !== 'undefined') this.dress();
  }

  /** Each kind's whole figure in place of the one built in code for its near level, once it has loaded (see view/frozen, loadFrozen): the frost in its shader, no instance's color. */
  private dress() {
    this.levels.forEach((level, k) => {
      loadFrozen(k).then(
        (figure) => {
          const { near } = level;
          near.geometry.dispose();
          near.geometry = figure.geometry;
          near.material = figure.maps.map((map, i) => frostMaterial(map, i > 0));
          near.instanceColor = null;
          level.dressed = true;
          this.dressed++;
        },
        (error) => console.warn('Frozen figure failed', k, error),
      );
    });
  }

  /**
   * Where one of the dead lies (see Dead and CAUGHT), drawn from `r`: caught on the torn plating,
   * in the breach's mouth or on a broken deck, or blown out of the mouth (from anywhere across it)
   * and drifting about its breach, alone or with the last one blown out there (`last`, by breach),
   * never in the hull wherever it sways.
   */
  private place(r: Randomizer, suited: boolean, last: (THREE.Vector3 | null)[]): Dead {
    const breach = r.nextFloat() < 0.5 ? 0 : 1;
    const axis = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    const turn = setFromEuler(new THREE.Quaternion(), r.range(0, 6.3), r.range(0, 6.3), r.range(0, 6.3));
    const spin = r.range(0.25, 1) * DEAD_SPIN * (r.nextFloat() < 0.5 ? -1 : 1);
    const toward = () => v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    const phase = r.range(0, 6.3);
    if (r.nextFloat() < (suited ? SUITED_CAUGHT : CAUGHT)) {
      const drift = toward().multiplyScalar(CAUGHT_SWAY);
      const where = r.nextFloat();
      const wall = r.nextInt() % 4;
      const sign = wall % 2 === 0 ? 1 : -1;
      let at: THREE.Vector3;
      if (where < 0.5) {
        // on the outside of the torn plating, short of its ragged edge
        const along = r.range(-EDGE_FROM, -100);
        at = wall < 2 ? v(along, r.range(-1, 1) * CORE_ACROSS, sign * (CORE_UP + 25)) : v(along, sign * (CORE_ACROSS + 25), r.range(-1, 1) * CORE_UP);
      } else if (where < 0.8) {
        // lying on a broken deck inside
        const deck = 1 + (r.nextInt() % (BREACH_DECK_COUNT - 1));
        at = v(r.range(-0.5, -0.08) * TORN_HALF.x, r.range(-0.85, 0.85) * CORE_ACROSS, -CORE_UP + (deck * 2 * CORE_UP) / BREACH_DECK_COUNT + 22);
      } else {
        // in the mouth, against the plating's inside
        const along = r.range(-500, 100);
        at = wall < 2 ? v(along, r.range(-0.9, 0.9) * CORE_ACROSS, sign * (CORE_UP - 60)) : v(along, sign * (CORE_ACROSS - 60), r.range(-0.9, 0.9) * CORE_UP);
      }
      return { breach, at, drift, rate: r.range(0.05, 0.12), phase, turn, axis, spin: spin / 10, shoved: null };
    }
    const drift = toward().multiplyScalar(r.range(0.2, 1) * DEAD_DRIFT);
    const rate = r.range(DEAD_RATE[0], DEAD_RATE[1]);
    const world = new THREE.Vector3();
    const swayed = new THREE.Vector3();
    const clear = (at: THREE.Vector3) =>
      [1, -1].every((s) => clearOfHull(framed(JETS, breach, swayed.copy(at).addScaledVector(drift, s), world))) && clearOfHull(framed(JETS, breach, at, world));
    const prev = last[breach];
    if (prev && r.nextFloat() < TOGETHER) {
      for (let tries = 0; tries < 20; tries++) {
        const at = prev.clone().addScaledVector(toward(), r.range(0.3, 1) * GROUP_REACH);
        if (clear(at)) return { breach, at, drift, rate, phase, turn, axis, spin, shoved: null };
      }
    }
    for (;;) {
      // how far out of the mouth: thick close by, thinning with the distance
      const share = r.nextFloat();
      const x = r.nextFloat();
      const [out, cone] = share < NEAR_SHARE ? [20 + (NEAR_OUT - 20) * x * x, 1] : share < NEAR_SHARE + MID_SHARE ? [NEAR_OUT + (MID_OUT - NEAR_OUT) * x * x, 1.3] : [MID_OUT + (FAR_OUT - MID_OUT) * x, 1.9];
      const tilt = cone * r.nextFloat();
      const around = r.range(0, 6.2832);
      const at = v(cos(tilt), sin(tilt) * cos(around), sin(tilt) * sin(around))
        .multiplyScalar(out)
        .add(v(0, r.range(-0.9, 0.9) * CORE_ACROSS, r.range(-0.9, 0.9) * CORE_UP));
      if (!clear(at)) continue;
      last[breach] = at;
      return { breach, at, drift, rate, phase, turn, axis, spin, shoved: null };
    }
  }

  /** The crystals of both jets (see mistVertex): where each starts on its way, where across, which jet. */
  private buildMist(r: Randomizer, light: THREE.Color): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const seeds = new Float32Array(MIST_CRYSTALS * 4);
    for (let i = 0; i < MIST_CRYSTALS; i++) seeds.set([r.nextFloat(), r.nextFloat(), r.nextFloat(), i % 2], i * 4);
    const geometry = new THREE.BufferGeometry();
    // the points lie where the shader puts them; the attribute only sizes the draw
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIST_CRYSTALS * 3), 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        viewport: { value: 1000 },
        from: { value: this.jets.map((jet) => jet.from) },
        along: { value: this.jets.map((jet) => jet.along) },
        light: { value: light },
      },
      vertexShader: mistVertex,
      fragmentShader: mistFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  /** The jets follow their halves: `motions` are the bow's and the stern's motion since the layout (see AsteroidField.weldMotion). The dead ride with them. */
  moveJets(motions: readonly THREE.Matrix4[]) {
    this.jets.forEach((jet, i) => {
      jet.from.copy(JETS[i].from).applyMatrix4(motions[i]);
      jet.along.copy(JETS[i].along).transformDirection(motions[i]);
    });
  }

  /** How thick the mist is at `point` where the torn ends are now. */
  mistAt(point: THREE.Vector3): number {
    return mistDensity(point, this.jets);
  }

  /** The picture's height in device pixels: the crystals keep their size in the world with it, and the dead are drawn as far as they stand a pixel high on it. */
  setViewport(height: number) {
    this.mist.material.uniforms.viewport.value = height;
    this.viewport = height;
  }

  /** The share of the crystals drawn (see view/quality, Look.particles), and of the dead, never fewer than DEAD_LEAST of them. */
  setParticles(share: number) {
    this.mist.geometry.setDrawRange(0, Math.round(MIST_CRYSTALS * share));
    DEAD_KINDS.forEach((kind, k) => (this.drawn[k] = Math.round(kind.count * Math.max(DEAD_LEAST, share))));
  }

  /** How many of the dead there are, drawn or not. */
  get count() {
    return DEAD_TOTAL;
  }

  /** Where the `i`-th of the dead is now (see update), into `out`. */
  deadAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.where[i]);
  }

  /** How the `i`-th of the dead is turned now (see update), into `out`. */
  deadTurn(i: number, out: THREE.Quaternion): THREE.Quaternion {
    return out.copy(this.turned[i]);
  }

  /** Where the mouth of breach `b` (0 the bow's, 1 the stern's) is now, into `out`. */
  mouth(b: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.jets[b].from).addScaledVector(this.jets[b].along, MOUTH);
  }

  /** Whether the `i`-th of the dead is drawn on this picture (see setParticles): the first of each kind are. */
  private shown(i: number): boolean {
    const k = this.kindOf[i];
    return i - FIRST[k] < this.drawn[k];
  }

  private static readonly spun = new THREE.Quaternion();
  private static readonly matrix = new THREE.Matrix4();
  private static readonly one = new THREE.Vector3(1, 1, 1);
  private static readonly swayed = new THREE.Vector3();
  private static readonly normal = new THREE.Vector3();
  private static readonly gone = new THREE.Vector3();

  /** The mist drifting and the dead swaying and turning, at field time `time` (s). */
  update(time: number) {
    this.mist.material.uniforms.time.value = time;
    const { spun, swayed } = Derelict;
    breachFrames(this.jets);
    this.dead.forEach((d, k) => {
      const at = this.where[k];
      // a new round (the field's clock run back) finds the dead where they drifted before
      if (d.shoved && time < d.shoved.since) d.shoved = null;
      if (d.shoved) {
        const t = time - d.shoved.since;
        at.copy(d.shoved.from).addScaledVector(d.shoved.velocity, t);
        setFromAxisAngle(spun, d.shoved.axis, t * d.shoved.spin).multiply(d.shoved.turn);
      } else {
        framed(this.jets, d.breach, swayed.copy(d.at).addScaledVector(d.drift, sin(time * d.rate + d.phase)), at);
        setFromAxisAngle(spun, d.axis, time * d.spin).multiply(d.turn);
      }
      this.turned[k].copy(spun);
    });
  }

  /**
   * The dead as `camera` sees them: the NEAR_MOST nearest within FROZEN_NEAR as their whole
   * figures, the rest as the low ones built in code as far as a body stands a pixel high on the
   * picture, none beyond. Only the instances drawn are handed to the GPU.
   */
  draw(camera: THREE.PerspectiveCamera) {
    const { matrix, one } = Derelict;
    const eye = camera.position;
    // a body BODY_HEIGHT tall is a pixel high this far away
    const reach = (BODY_HEIGHT * camera.projectionMatrix.elements[5] * this.viewport) / 2;
    const nearest = this.nearest;
    nearest.length = 0;
    this.whole.fill(0);
    const distance = (k: number) => this.where[k].distanceToSquared(eye);
    for (let k = 0; k < DEAD_TOTAL; k++) {
      if (!this.shown(k) || distance(k) >= FROZEN_NEAR * FROZEN_NEAR) continue;
      // kept sorted by distance, at most NEAR_MOST of them
      let i = nearest.length;
      while (i > 0 && distance(nearest[i - 1]) > distance(k)) i--;
      if (i < NEAR_MOST) nearest.splice(i, 0, k);
      if (nearest.length > NEAR_MOST) nearest.length = NEAR_MOST;
    }
    for (const k of nearest) this.whole[k] = 1;
    for (const { near, far } of this.levels) near.count = far.count = 0;
    for (let k = 0; k < DEAD_TOTAL; k++) {
      if (!this.shown(k)) continue;
      const level = this.levels[this.kindOf[k]];
      const mesh = this.whole[k] ? level.near : distance(k) < reach * reach ? level.far : null;
      if (!mesh) continue;
      const slot = mesh.count++;
      mesh.setMatrixAt(slot, matrix.compose(this.where[k], this.turned[k], one));
      // the figures built in code take the color of the clothes from the instance
      if (mesh === level.far || !level.dressed) mesh.setColorAt(slot, this.colors[k]);
    }
    for (const { near, far } of this.levels) {
      for (const mesh of [near, far]) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * A ship at `position` moving at `velocity` (units/s), of hit radius `radius`, meets the dead at
   * field time `time`: every body it touches while closing on it is knocked away as in an elastic
   * hit of the two masses (the body leaves at nearly twice the closing speed along the line between
   * them) and tumbles off; the ship keeps its speed but for the body's share, taken out of
   * `velocity`. Returns the fastest closing speed met (units/s; 0 for none). Only the dead this
   * picture draws are met.
   */
  meet(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, time: number): number {
    const { normal, gone } = Derelict;
    const reach = radius + DEAD_RADIUS;
    let fastest = 0;
    for (let k = 0; k < DEAD_TOTAL; k++) {
      if (!this.shown(k)) continue;
      const at = this.where[k];
      normal.subVectors(at, position);
      const distance = normal.length();
      if (distance >= reach || distance === 0) continue;
      normal.divideScalar(distance);
      const d = this.dead[k];
      const own = d.shoved ? d.shoved.velocity : gone.set(0, 0, 0);
      const closing = velocity.dot(normal) - own.dot(normal);
      if (closing <= 0) continue;
      const total = MASS.ship + DEAD_MASS;
      const body = gone.copy(own).addScaledVector(normal, ((2 * MASS.ship) / total) * closing);
      velocity.addScaledVector(normal, ((-2 * DEAD_MASS) / total) * closing);
      const axis = new THREE.Vector3().crossVectors(normal, velocity);
      if (axis.lengthSq() < 1e-9) axis.copy(d.axis);
      d.shoved = { since: time, from: at.clone(), velocity: body.clone(), turn: this.turned[k].clone(), axis: axis.normalize(), spin: Math.min(DEAD_TUMBLE_MOST, closing * DEAD_TUMBLE) };
      fastest = Math.max(fastest, closing);
    }
    return fastest;
  }
}
