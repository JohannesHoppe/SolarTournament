import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { sternAt } from './arenas';

/**
 * The break of the world ship PAAA 01 (see README, "The universe"): ice crystals still escaping
 * from both torn ends as a slow mist, and the ship's dead drifting frozen between the halves,
 * crew in work suits and settlers in everyday clothes, blown out when it broke, rimed with frost,
 * turning slowly. Scenery only: nothing here collides, and the mist only patters on a hull
 * flying through it (see mistDensity).
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
/** A jet reaches MIST_REACH (units, 450 m) from its torn end, widening from MIST_START to MIST_END across (radius, units: 70 m, the hull's, to 200 m). */
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

/** How many of the dead drift around the break, in each of the two poses. */
const DEAD_PER_POSE = 20;
/** The dead drift to and fro about where they were blown out, by up to DEAD_DRIFT (units, 60 m) over a few minutes, and turn at up to DEAD_SPIN (rad/s). */
const DEAD_DRIFT = 1200;
const DEAD_SPIN = 0.12;

/** A limb as a box `width` thick from `from` to `to`, its clothes' share `cloth` (1 dressed, 0 bare). */
function limb(from: THREE.Vector3, to: THREE.Vector3, width: number, cloth: number): THREE.BufferGeometry {
  const length = from.distanceTo(to);
  const box = new THREE.BoxGeometry(width, length, width * 0.85).translate(0, length / 2, 0);
  box.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  return dressed(box.translate(from.x, from.y, from.z), cloth);
}

/** Marks every vertex of `geometry` as dressed or bare (see Derelict's material), its own color white or the frozen skin's. */
function dressed(geometry: THREE.BufferGeometry, cloth: number): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  const count = flat.getAttribute('position').count;
  flat.setAttribute('cloth', new THREE.Float32BufferAttribute(new Array(count).fill(cloth), 1));
  const skin = new THREE.Color(0xc9ccd4);
  flat.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => (cloth ? [1, 1, 1] : skin.toArray())).flat(), 3));
  return flat;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A human body as it floats without weight, low poly (units; 1.75 m tall standing): the
 * relaxed crouch of a body in free fall (arms drifting up and forward, hips and knees bent),
 * or limp with its limbs spread. The hips at the origin; the head bare.
 */
function body(pose: 'crouch' | 'spread'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const neck = v(0, 11, 0);
  parts.push(dressed(new THREE.BoxGeometry(7.5, 11, 4.5).translate(0, 5.5, 0), 1));
  parts.push(dressed(new THREE.IcosahedronGeometry(2.4, 0).scale(1, 1.2, 1).translate(0, 14.5, pose === 'crouch' ? 0.8 : 0), 0));
  parts.push(dressed(new THREE.BoxGeometry(2, 2, 2).translate(neck.x, neck.y + 0.5, neck.z), 0));
  for (const side of [1, -1]) {
    const shoulder = v(side * 4.6, 9.8, 0);
    const hip = v(side * 2, -0.5, 0);
    const [elbow, hand, knee, foot] =
      pose === 'crouch'
        ? [v(side * 6.5, 7, 4), v(side * 6, 9, 9.5), v(side * 2.6, -7, 6.5), v(side * 2.8, -15.5, 2.5)]
        : [v(side * 10.5, 11.5, 1), v(side * 15.5, 14, 2.5), v(side * 5, -8, 1.5), v(side * 6.5, -16.5, -1.5)];
    parts.push(limb(shoulder, elbow, 2.6, 1), limb(elbow, hand, 2.2, 1), dressed(new THREE.BoxGeometry(1.6, 2, 1).translate(hand.x, hand.y, hand.z), 0));
    parts.push(limb(hip, knee, 3.4, 1), limb(knee, foot, 2.8, 1));
  }
  return mergeGeometries(parts);
}

/** What the dead wore: work suits (orange, gray, blue) and everyday clothes, all of it paled by the frost. */
const CLOTHES = [0xd8763a, 0x8c929c, 0x3f5f8f, 0x6b4f3a, 0x7a2f3f, 0x4f6b4a, 0xb0a48a, 0x2f3238] as const;
const RIME = new THREE.Color(0xe6eef6);

/** The dead's vertex color: the chunk's own, with the instance's color mixed in by the vertex's share of clothes (the template holds the include, not the chunk's text). */
const DEAD_COLOR = `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = color * mix(vec3(1.0), instanceColor.rgb, cloth);
#endif`;

/** The scenery of the break: its mist and its dead. */
export class Derelict {
  readonly group = new THREE.Group();
  /** The jets where the torn ends are now (see moveJets). */
  readonly jets: Jet[] = JETS.map((jet) => ({ from: jet.from.clone(), along: jet.along.clone() }));
  private readonly mist: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly dead: THREE.InstancedMesh[] = [];
  /** Each of the dead: where it was blown out, how it drifts and how it turns. */
  private readonly drifts: { at: THREE.Vector3; drift: THREE.Vector3; rate: number; phase: number; turn: THREE.Quaternion; axis: THREE.Vector3; spin: number }[] = [];

  constructor(light: THREE.Color) {
    const r = new Randomizer(7101);
    this.mist = this.buildMist(r, light);
    this.group.add(this.mist);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: 0x0d1a2e, emissiveIntensity: 0.5 });
    // the clothes take the instance's color, the bare skin keeps its own
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float cloth;')
        .replace('#include <color_vertex>', DEAD_COLOR);
    };
    material.customProgramCacheKey = () => 'derelict-dead';
    const color = new THREE.Color();
    for (const pose of ['crouch', 'spread'] as const) {
      const mesh = new THREE.InstancedMesh(body(pose), material, DEAD_PER_POSE);
      mesh.frustumCulled = false;
      for (let i = 0; i < DEAD_PER_POSE; i++) {
        // blown out where it broke: along the gap between the torn ends, nearer the ends
        const u = r.nextFloat() < 0.5 ? r.range(0, 0.35) : r.range(0.65, 1);
        const at = JETS[0].from.clone().lerp(JETS[1].from, u).add(v(r.range(-2500, 2500), r.range(-2200, 2200), r.range(-2800, 2800)));
        const drift = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.3, 1) * DEAD_DRIFT);
        const axis = v(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6.3), r.range(0, 6.3), r.range(0, 6.3)));
        this.drifts.push({ at, drift, rate: r.range(0.008, 0.02), phase: r.range(0, 6.3), turn, axis, spin: r.range(0.25, 1) * DEAD_SPIN * (r.nextFloat() < 0.5 ? -1 : 1) });
        mesh.setColorAt(i, color.set(CLOTHES[r.nextInt() % CLOTHES.length]).lerp(RIME, r.range(0.25, 0.4)));
      }
      this.dead.push(mesh);
      this.group.add(mesh);
    }
    this.update(0);
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

  /** The jets follow their halves: `motions` are the bow's and the stern's motion since the layout (see AsteroidField.weldMotion). */
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

  /** The share of the crystals drawn (see view/quality, Look.particles). */
  setParticles(share: number) {
    this.mist.geometry.setDrawRange(0, Math.round(MIST_CRYSTALS * share));
  }

  private static readonly at = new THREE.Vector3();
  private static readonly spun = new THREE.Quaternion();
  private static readonly matrix = new THREE.Matrix4();
  private static readonly one = new THREE.Vector3(1, 1, 1);

  /** The mist drifting and the dead turning, at field time `time` (s). */
  update(time: number) {
    this.mist.material.uniforms.time.value = time;
    const { at, spun, matrix, one } = Derelict;
    this.dead.forEach((mesh, m) => {
      for (let i = 0; i < DEAD_PER_POSE; i++) {
        const d = this.drifts[m * DEAD_PER_POSE + i];
        at.copy(d.at).addScaledVector(d.drift, Math.sin(time * d.rate + d.phase));
        spun.setFromAxisAngle(d.axis, time * d.spin).multiply(d.turn);
        mesh.setMatrixAt(i, matrix.compose(at, spun, one));
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}
