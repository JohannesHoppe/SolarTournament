import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { sternAt } from './arenas';
import { MASS } from './bodies';
import { cos, sin } from '../detmath';
import { setFromAxisAngle, setFromEuler } from '../detthree';
import { FROZEN_NEAR, frostMaterial, frozenSurface, frozenUv, loadFrozen, type FrozenCell } from '../view/frozen';

/**
 * The break of the world ship PAAA 01 (see README, "The universe"): ice crystals still escaping
 * from both torn ends as a slow mist, and the ship's dead drifting frozen in it and between the
 * halves, settlers in everyday clothes and crew in coveralls, and as many of the crew in the ship's light emergency suits, who fought the leak from inside until the hull broke and blew them out with the air, most of those where the breach was, some caught on
 * the torn plating at the ends, blown out when it broke, rimed with frost, turning slowly. Scenery:
 * the mist only patters on a hull flying through it (see mistDensity), and a ship that meets one
 * of the dead knocks it away by the two masses (see Derelict.meet), on every browser by its own
 * reckoning, nothing of it shared or scored.
 */

/** The stern half's axis, pointing away from the break. */
const STERN_AXIS = new THREE.Vector3(...sternAt(1), 0).sub(new THREE.Vector3(...sternAt(0), 0)).normalize();

/**
 * The two jets of mist: where each leaves a torn end of the hull (units; the bow's torn section
 * ends 2800 units past its middle, at x -14200, the stern's at sternAt(9200), 3000 to the side)
 * and the way it drifts, into the gap between the halves.
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
 * The dead, by what they look like: each kind one of MakeHuman's figures of the frozen dead (its
 * number, see view/frozen, loadFrozen: a man or a woman, young or old, in everyday clothes, the
 * crew's coveralls or under an old helmet, posed in free fall or against the cold; or, half of them,
 * the crew in the ship's light emergency suits, `breach` the ones blown out where the hull broke),
 * how many of them (on the full picture; fewer on a cheaper one, see setParticles), and how the
 * figure built in code that stands in for it until it has loaded is dressed and posed. A pair counts
 * as one: two holding on to each other. 360 bodies in all.
 */
const DEAD_KINDS = [
  { dress: 'everyday', pose: 'crouch', count: 30, breach: false },
  { dress: 'everyday', pose: 'spread', count: 28, breach: false },
  { dress: 'work', pose: 'curled', count: 25, breach: false },
  { dress: 'work', pose: 'reach', count: 22, breach: false },
  { dress: 'everyday', pose: 'spread', count: 20, breach: false },
  { dress: 'everyday', pose: 'curled', count: 20, breach: false },
  { dress: 'work', pose: 'crouch', count: 20, breach: false },
  { dress: 'everyday', pose: 'pair', count: 15, breach: false },
  { dress: 'suit', pose: 'reach', count: 30, breach: true },
  { dress: 'suit', pose: 'spread', count: 30, breach: true },
  { dress: 'suit', pose: 'crouch', count: 30, breach: true },
  { dress: 'suit', pose: 'curled', count: 30, breach: true },
  { dress: 'suit', pose: 'reach', count: 30, breach: true },
  { dress: 'suit', pose: 'spread', count: 30, breach: true },
] as const;
type Dress = (typeof DEAD_KINDS)[number]['dress'];
type Pose = 'crouch' | 'spread' | 'curled' | 'reach' | 'embrace';
const DEAD_TOTAL = DEAD_KINDS.reduce((sum, kind) => sum + kind.count, 0);
/** Beyond any distance a body is drawn at (units): the far level's reach. */
const FROZEN_BEYOND = 1e9;
/** The fewest of each kind drawn on the cheapest picture (a share of them). */
const DEAD_LEAST = 0.4;

/**
 * Where the dead are: CAUGHT of them on the torn plating at the ends, the rest in GROUPS that were
 * blown out of the same deck together, each some GROUP_REACH (units, 15 m) about its middle:
 * IN_JETS of the groups in the jets of mist (where the air rushed out with them), the rest
 * drifting across the gap between the halves, where the ships fly. The crew who fought the leak in
 * their suits were where the hull broke: BREACH_CAUGHT of them still on the torn plating, and of
 * the rest BREACH_IN_JETS in the mist's groups.
 */
const CAUGHT = 0.12;
const BREACH_CAUGHT = 0.3;
const BREACH_IN_JETS = 0.85;
const GROUPS = 36;
const IN_JETS = 0.55;
const GROUP_REACH = 300;
/** The dead in the mist and the gap wander to and fro about where they were blown out, by up to DEAD_DRIFT (units, 40 m) over a few minutes, and turn at up to DEAD_SPIN (rad/s); the caught ones sway CAUGHT_SWAY (units, 1.5 m) and turn a tenth as fast. */
const DEAD_DRIFT = 800;
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
 * helmet, its visor cracked.
 */
function person(pose: Pose, dress: Dress): THREE.BufferGeometry {
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
    parts.push(part(new THREE.IcosahedronGeometry(4.2, 1).translate(head.x, head.y, head.z), 'suit', 0));
    parts.push(part(new THREE.IcosahedronGeometry(4.25, 1).scale(0.8, 0.62, 0.5).translate(head.x, head.y + 0.3, head.z + 2.2), 'visor', 0));
  } else {
    parts.push(part(new THREE.IcosahedronGeometry(2.4, 1).scale(1, 1.2, 1).translate(head.x, head.y, head.z), 'skin', 0));
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

/** The body of a kind: one person, or two holding on to each other, face to face. */
function bodyOf(kind: (typeof DEAD_KINDS)[number]): THREE.BufferGeometry {
  if (kind.pose !== 'pair') return person(kind.pose, kind.dress);
  const one = person('embrace', kind.dress);
  // the other turned about to face the first (a half turn about y, by mirroring both x and z)
  const other = person('embrace', 'work').scale(-1, 1, -1).translate(0, -1, 9);
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
 * Where one of the dead is: in a jet's frame (`jet` 0 or 1: `at` along its axis, across and up,
 * see jetFrame) or in the gap between the torn ends (`jet` -1: `at.x` the share of the way from
 * the bow's end to the stern's, `at.y` and `at.z` unused, `off` beside that point); how it wanders
 * (`drift` in the same frame) and turns. Once a ship knocked it away it flies off from where it was
 * (`shoved`, at field time `since`).
 */
interface Dead {
  jet: -1 | 0 | 1;
  at: THREE.Vector3;
  off: THREE.Vector3;
  drift: THREE.Vector3;
  rate: number;
  phase: number;
  turn: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  shoved: { since: number; from: THREE.Vector3; velocity: THREE.Vector3; turn: THREE.Quaternion; axis: THREE.Vector3; spin: number } | null;
}

/** A group of the dead (see Derelict.place): where its middle is, as a Dead's, and how it wanders. */
type Group = Pick<Dead, 'jet' | 'at' | 'off' | 'drift' | 'rate' | 'phase'>;

const UP = new THREE.Vector3(0, 1, 0);
const ACROSS = new THREE.Vector3(1, 0, 0);
/** Each jet's frame as the mist's shader builds it: a side across its axis, and up (see jetFrames). */
const sides = [new THREE.Vector3(), new THREE.Vector3()];
const ups = [new THREE.Vector3(), new THREE.Vector3()];
function jetFrames(jets: readonly Jet[]) {
  jets.forEach((jet, i) => {
    sides[i].crossVectors(jet.along, Math.abs(jet.along.y) < 0.9 ? UP : ACROSS).normalize();
    ups[i].crossVectors(sides[i], jet.along);
  });
}

/** The scenery of the break: its mist and its dead. */
export class Derelict {
  readonly group = new THREE.Group();
  /** The jets where the torn ends are now (see moveJets). */
  readonly jets: Jet[] = JETS.map((jet) => ({ from: jet.from.clone(), along: jet.along.clone() }));
  private readonly mist: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly meshes: THREE.InstancedMesh[] = [];
  /** Each kind's far level once its figure has loaded (see dress), drawing the same places as its mesh. */
  private readonly distant: (THREE.InstancedMesh | undefined)[] = [];
  /** Each of the dead, in the order of the meshes and their instances. */
  private readonly dead: Dead[] = [];
  /** Where each of the dead is now and how it is turned (see update). */
  private readonly where: THREE.Vector3[] = [];
  private readonly turned: THREE.Quaternion[] = [];
  /** The share of each kind drawn (see setParticles). */
  private share = 1;

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
      emissive: 0x0d1a2e,
      emissiveIntensity: 0.5,
    });
    // the clothes take the instance's color, the bare skin, the hair and the suits keep their own
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cloth;').replace('#include <color_vertex>', DEAD_COLOR);
    };
    material.customProgramCacheKey = () => 'derelict-dead';
    const color = new THREE.Color();
    const groups = Derelict.groups(r);
    for (const kind of DEAD_KINDS) {
      const mesh = new THREE.InstancedMesh(bodyOf(kind), material, kind.count);
      mesh.frustumCulled = false;
      for (let i = 0; i < kind.count; i++) {
        this.dead.push(this.place(r, groups, kind.breach));
        this.where.push(new THREE.Vector3());
        this.turned.push(new THREE.Quaternion());
        mesh.setColorAt(i, color.set(CLOTHES[r.nextInt() % CLOTHES.length]).lerp(RIME, r.range(0.35, 0.55)));
      }
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.update(0);
    // the figures built in code stand in for MakeHuman's until they have loaded (none in Node's tests)
    if (typeof document !== 'undefined') this.dress();
  }

  /**
   * Each kind's figure of MakeHuman in place of the one built in code, once it has loaded (see
   * view/frozen, loadFrozen): its near level for the bodies within FROZEN_NEAR of the camera, its
   * far one, sharing their places, for the rest; the frost in their shader, no instance's color.
   */
  private dress() {
    this.meshes.forEach((mesh, k) => {
      loadFrozen(k).then(
        ({ near, far }) => {
          mesh.geometry.dispose();
          mesh.geometry = near.geometry;
          mesh.material = near.maps.map((map, i) => frostMaterial(map, i > 0, [0, FROZEN_NEAR]));
          mesh.instanceColor = null;
          const distant = new THREE.InstancedMesh(
            far.geometry,
            far.maps.map((map, i) => frostMaterial(map, i > 0, [FROZEN_NEAR, FROZEN_BEYOND])),
            DEAD_KINDS[k].count,
          );
          distant.instanceMatrix = mesh.instanceMatrix;
          distant.count = mesh.count;
          distant.frustumCulled = false;
          this.distant[k] = distant;
          this.group.add(distant);
        },
        (error) => console.warn('Frozen figure failed', k, error),
      );
    });
  }

  /**
   * Where one of the dead drifts (see Dead), drawn from `r`. Those blown out of the same deck
   * drift together: in the mist and across the gap they keep to groups (see GROUPS), a group
   * wandering as one, each body turning on its own.
   */
  private place(r: Randomizer, groups: Group[], breach: boolean): Dead {
    const where = r.nextFloat();
    const axis = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    const turn = setFromEuler(new THREE.Quaternion(), r.range(0, 6.3), r.range(0, 6.3), r.range(0, 6.3));
    const spin = r.range(0.25, 1) * DEAD_SPIN * (r.nextFloat() < 0.5 ? -1 : 1);
    const scatter = (reach: number) => v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(reach);
    if (where < (breach ? BREACH_CAUGHT : CAUGHT)) {
      // caught on the torn plating at an end, on the hull's rim
      const jet = r.nextFloat() < 0.5 ? 0 : 1;
      const angle = r.range(0, 6.2832);
      const radius = r.range(0.9, 1) * MIST_START;
      const drift = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(CAUGHT_SWAY);
      return { jet, at: v(r.range(-200, 400), radius * cos(angle), radius * sin(angle)), off: new THREE.Vector3(), drift, rate: r.range(0.05, 0.12), phase: r.range(0, 6.3), turn, axis, spin: spin / 10, shoved: null };
    }
    // the suited crew mostly in the mist that rushed out of the breach with them
    const inJets = Math.round(GROUPS * IN_JETS);
    const pick = r.nextInt();
    const group = breach && r.nextFloat() < BREACH_IN_JETS ? groups[pick % inJets] : groups[pick % groups.length];
    // in a jet's frame along, across and up; in the gap beside the point on the line between the ends
    const off = group.jet < 0 ? group.off.clone().add(scatter(GROUP_REACH)) : new THREE.Vector3();
    const at = group.jet < 0 ? group.at.clone() : group.at.clone().add(scatter(GROUP_REACH));
    return { jet: group.jet, at, off, drift: group.drift, rate: group.rate, phase: group.phase, turn, axis, spin, shoved: null };
  }

  /** The groups the dead drift in (see place): GROUPS of them, IN_JETS of them in the mist, the rest across the gap. */
  private static groups(r: Randomizer): Group[] {
    return Array.from({ length: GROUPS }, (_, i) => {
      const drift = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.3, 1) * DEAD_DRIFT);
      const common = { off: new THREE.Vector3(), drift, rate: r.range(0.008, 0.02), phase: r.range(0, 6.3) };
      if (i < GROUPS * IN_JETS) {
        // in the mist: spread over its cross-section as the crystals are, more of them nearer the end
        const s = r.range(0.04, 1) * r.range(0.3, 1);
        const radius = Math.sqrt(r.nextFloat()) * (MIST_START + (MIST_END - MIST_START) * s) * 0.7;
        const angle = r.range(0, 6.2832);
        return { ...common, jet: i % 2 === 0 ? 0 : 1, at: v(s * MIST_REACH, radius * cos(angle), radius * sin(angle)) };
      }
      // across the gap where the ships fly, most of them near the line between the ends
      const wide = r.nextFloat() < 0.25 ? 4000 : 1800;
      return { ...common, jet: -1, at: v(r.range(0.15, 0.85), 0, 0), off: v(r.range(-1, 1) * wide, r.range(-1, 1) * wide * 0.8, r.range(-1, 1) * wide) };
    });
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

  /** The jets follow their halves: `motions` are the bow's and the stern's motion since the layout (see AsteroidField.weldMotion). The dead in the mist and on the plating ride with them. */
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

  /** The picture's height in device pixels: the crystals keep their size in the world with it. */
  setViewport(height: number) {
    this.mist.material.uniforms.viewport.value = height;
  }

  /** The share of the crystals drawn (see view/quality, Look.particles), and of the dead, never fewer than DEAD_LEAST of them. */
  setParticles(share: number) {
    this.mist.geometry.setDrawRange(0, Math.round(MIST_CRYSTALS * share));
    this.share = Math.max(DEAD_LEAST, share);
    this.meshes.forEach((mesh, k) => {
      mesh.count = Math.round(DEAD_KINDS[k].count * this.share);
      if (this.distant[k]) this.distant[k].count = mesh.count;
    });
  }

  /** How many of the dead there are, drawn or not. */
  get count() {
    return DEAD_TOTAL;
  }

  /** Where the `i`-th of the dead is now (see update), into `out`. */
  deadAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.where[i]);
  }

  private static readonly spun = new THREE.Quaternion();
  private static readonly matrix = new THREE.Matrix4();
  private static readonly one = new THREE.Vector3(1, 1, 1);
  private static readonly wandered = new THREE.Vector3();
  private static readonly normal = new THREE.Vector3();
  private static readonly gone = new THREE.Vector3();

  /** The mist drifting and the dead turning, at field time `time` (s). */
  update(time: number) {
    this.mist.material.uniforms.time.value = time;
    const { spun, matrix, one, wandered } = Derelict;
    jetFrames(this.jets);
    let k = 0;
    this.meshes.forEach((mesh, m) => {
      for (let i = 0; i < DEAD_KINDS[m].count; i++, k++) {
        const d = this.dead[k];
        const at = this.where[k];
        // a new round (the field's clock run back) finds the dead where they drifted before
        if (d.shoved && time < d.shoved.since) d.shoved = null;
        if (d.shoved) {
          const t = time - d.shoved.since;
          at.copy(d.shoved.from).addScaledVector(d.shoved.velocity, t);
          setFromAxisAngle(spun, d.shoved.axis, t * d.shoved.spin).multiply(d.shoved.turn);
        } else {
          const sway = sin(time * d.rate + d.phase);
          if (d.jet < 0) {
            at.copy(this.jets[0].from).lerp(this.jets[1].from, d.at.x).add(d.off).addScaledVector(d.drift, sway);
          } else {
            const jet = this.jets[d.jet];
            wandered.copy(d.at).addScaledVector(d.drift, sway);
            at.copy(jet.from).addScaledVector(jet.along, wandered.x).addScaledVector(sides[d.jet], wandered.y).addScaledVector(ups[d.jet], wandered.z);
          }
          setFromAxisAngle(spun, d.axis, time * d.spin).multiply(d.turn);
        }
        this.turned[k].copy(spun);
        if (i < mesh.count) mesh.setMatrixAt(i, matrix.compose(at, spun, one));
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * A ship at `position` moving at `velocity` (units/s), of hit radius `radius`, meets the dead at
   * field time `time`: every body it touches while closing on it is knocked away as in an elastic
   * hit of the two masses (the body leaves at nearly twice the closing speed along the line between
   * them) and tumbles off; the ship keeps its speed but for the body's share, taken out of
   * `velocity`. Returns the fastest closing speed met (units/s; 0 for none). Only what is drawn is
   * met.
   */
  meet(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, time: number): number {
    const { normal, gone } = Derelict;
    const reach = radius + DEAD_RADIUS;
    let fastest = 0;
    let k = 0;
    for (let m = 0; m < this.meshes.length; m++) {
      const drawn = this.meshes[m].count;
      for (let i = 0; i < DEAD_KINDS[m].count; i++, k++) {
        if (i >= drawn) continue;
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
    }
    return fastest;
  }
}
