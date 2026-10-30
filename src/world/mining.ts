import * as THREE from 'three';
import { Randomizer } from '../random';
import { attachment, type Asteroid, type AsteroidField, type Attachment } from './asteroids';
import { SUN_DIRECTION } from './space';
import { hazeUniforms } from '../view/haze';
import { rockTone } from './rocks';
import { boxUv, shine, surfaced, wornSurface, type Wear } from '../view/surfaces';

/**
 * The Rockborn's mining in the Belt: rigs with work lights on some of its rocks, cutting lasers
 * slicing them with sparks where they bite, dust rising from drill holes, rocks cut half away
 * with smooth faces and lit tunnels, beacon buoys marking the claims, the miners' neon graffiti,
 * and dust between the rocks that glows against the sun. Scenery only: nothing of it collides,
 * pulls or breaks, and what stands on a rock is built in that rock's own frame and turns with it
 * (a rock that breaks takes its dressing along). Where it all stands follows from the field's
 * seed, so every browser sees the same claims.
 *
 * Everything is drawn in a handful of draw calls: the dressing of every claimed rock is merged
 * into one geometry per material, each vertex carrying the slot of its rock, and the vertex
 * shaders place it by that rock's matrix from a shared uniform array (see ROCK_GLSL), refreshed
 * once a frame.
 */

/** Rocks with a claim on them (at most SLOTS, the uniform array's length). */
const CLAIMS = 10;
const SLOTS = 12;
/** Of the claims: so many carry a rig (the first ones), so many of those a cutting laser; up to FACES of the others are cut half away (those with room for a face); the PAINTED slots carry graffiti (one slogan each). */
const RIGS = 6;
const CUTTERS = 4;
const FACES = 3;
const PAINTED = [1, 3, 5, 6, 8, 9];
/** One meter in world units. */
const M = 20;
/**
 * A cut face is flat within FACE_TOLERANCE of the rock's mean radius: it lies where the measured
 * surface reaches its plane, never more than that above it, so a ship touching the face touches
 * the rock's surface within that margin (about 3 to 10 m; the measured surface itself is within 2 %).
 */
export const FACE_TOLERANCE = 0.03;
/** The smallest a point of light, a beam or a mote is drawn (device pixels): smaller ones crawl from pixel to pixel; they dim instead. */
const MIN_PIXELS = 2.5;
/** The graffiti: the Rockborn's own words, painted in English as they are. */
const SLOGANS = ['ROCKBORN', 'MARS PAYS\nNOTHING', 'WE DIG,\nYOU DIE', 'THE BELT\nREMEMBERS', 'NO WALL\nIN SPACE', 'OUR ORE,\nNOT OUR VOTE'];
/** Their neon paints: magenta, cyan, acid green, hot pink, violet, sun orange. */
const PAINTS = [0xff2bd6, 0x22e8ff, 0x7dff3a, 0xff3d7f, 0xa45bff, 0xff9d00];
/** Lamps: low-pressure sodium, white floodlight, the red light on a rig's top, a buoy's amber. */
const SODIUM = new THREE.Color(1.0, 0.55, 0.16);
const WHITE = new THREE.Color(0.85, 0.92, 1.0);
const RED = new THREE.Color(1.0, 0.12, 0.08);
const AMBER = new THREE.Color(1.0, 0.62, 0.05);
/** Sparks per cutting laser, motes of dust per drill hole. */
const SPARKS = 72;
const MOTES = 56;
/** A spark flies SPARK_LIFE seconds; a mote of drill dust rises DUST_LIFE seconds at DUST_RISE (units/s, 3 m/s) up to about 50 m, spreading. */
const SPARK_LIFE = 0.9;
const DUST_LIFE = 16;
const DUST_RISE = 3 * M;
/** How long a cutting laser takes to sweep along its cut and back (s): slow, a steady saw. */
const SWEEP_SECONDS = 9;
/**
 * Dust between the rocks: CLOUDS soft clouds of 250 to 700 m in the field, faint in the sun's
 * side light and glowing when the eye looks towards the sun (forward scattering, Henyey and
 * Greenstein's phase with DUST_G).
 */
const CLOUDS = 60;
const DUST_G = 0.55;
/**
 * The steel of the rigs and buoys: second-hand plating, riveted and patched, rusting from its
 * seams, grimy, dented, chipped and stenciled with the claims' marks. One tile of it covers
 * STEEL_TILE (units, 6 m) on every face, twice that along a beam (so a slim beam is not cut into
 * short plates); hazard paint runs in stripes STRIPE long (1.2 m, on a beam twice that) across
 * it, and the Belt's dust darkens the steel towards the rock, fully at the ground and none
 * SOIL_REACH (12 m) above it.
 */
const STEEL_SEED = 2584;
const STEEL_WEAR: Wear = { rust: 0.6, chips: 0.4, grime: 0.6, scratches: 0.6, seams: 0.6, dents: 0.8, stencils: ['CLAIM 07', 'NO STEP', 'HI-PRESS', 'RB-12', 'ORE 3'], roughness: 0.72, metalness: 0.3 };
const STEEL_TILE = 6 * M;
const STRIPE = 1.2 * M;
const SOIL_REACH = 12 * M;
/** The drill dust a ship flies through (see dustAt): the plume is DUST_REACH high (units, 50 m) and DUST_WIDTH wide at its foot, widening as it rises. */
const DUST_REACH = 50 * M;
const DUST_WIDTH = 14 * M;

/**
 * A rock's place in the world for the vertex shaders: `rocks[slot]` is its matrix (zero once it
 * is gone, which puts its dressing out of sight), `rock` the slot of the vertex.
 */
const ROCK_GLSL = /* glsl */ `
  uniform mat4 rocks[${SLOTS}];
  attribute float rock;
  mat4 rockMatrix() { return rocks[int(rock + 0.5)]; }
  bool rockGone(mat4 m) { return dot(m[0].xyz, m[0].xyz) < 1e-12; }
  const vec4 OUT_OF_SIGHT = vec4(0.0, 0.0, 2.0, 1.0);
`;

/** How bright a point `px` device pixels wide is drawn at least MIN_PIXELS wide: dimmer by the area it gains, but never below a quarter, so a far lamp still shows. */
const DIM_GLSL = /* glsl */ `
  float dimmed(float px) { return max(min(1.0, px * px / ${(MIN_PIXELS * MIN_PIXELS).toFixed(2)}), 0.25); }
  float pixels(float size, float depth) { return size * projectionMatrix[1][1] * viewport * 0.5 / depth; }
`;

/** Where along its cut a cutting laser bites at a time: back and forth between its two ends, slowing at each. */
const SWEEP_GLSL = /* glsl */ `
  float sweep(vec2 s, float t) { return 0.5 - 0.5 * cos(6.2831853 * (t / s.x + s.y)); }
`;

/** Henyey and Greenstein's phase of dust with DUST_G, for the cosine between the view and the sun, scaled to 1 looking straight at the sun. */
const PHASE_GLSL = /* glsl */ `
  float phase(float c) { return ${Math.pow(1 - DUST_G, 3).toFixed(4)} / pow(${(1 + DUST_G * DUST_G).toFixed(4)} - ${(2 * DUST_G).toFixed(4)} * c, 1.5); }
`;

const lightVertex = /* glsl */ `
  ${ROCK_GLSL}
  uniform float time;
  uniform float viewport;
  attribute vec3 tint;
  attribute float size;
  attribute vec3 blink;
  varying vec3 vColor;
  ${DIM_GLSL}
  void main() {
    mat4 m = rockMatrix();
    if (rockGone(m)) { gl_Position = OUT_OF_SIGHT; gl_PointSize = 0.0; return; }
    vec4 mv = viewMatrix * (m * vec4(position, 1.0));
    float px = pixels(size, -mv.z);
    float on = 1.0;
    // a blinking light fades in and out over a tenth of its period: slow, never a flicker
    if (blink.x > 0.0) {
      float c = fract(time / blink.x + blink.y);
      on = smoothstep(0.0, 0.1, c) * (1.0 - smoothstep(blink.z, blink.z + 0.1, c));
    }
    vColor = tint * on * dimmed(px);
    gl_PointSize = max(px, ${MIN_PIXELS.toFixed(1)}) * 4.0;
    gl_Position = projectionMatrix * mv;
  }
`;

/** A lamp: a hot core and a soft halo four times its size. */
const lightFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float glow = exp(-d * d * 30.0) * 1.6 + exp(-d * d * 6.0) * 0.35;
    gl_FragColor = vec4(vColor * glow * (1.0 - smoothstep(0.85, 1.0, d)), 1.0);
  }
`;

const beamVertex = /* glsl */ `
  ${ROCK_GLSL}
  uniform float time;
  uniform float viewport;
  attribute vec3 bite0;
  attribute vec3 bite1;
  attribute vec2 sweepAt;
  attribute vec2 corner;
  varying float vAlong;
  varying float vSide;
  varying float vBright;
  ${DIM_GLSL}
  ${SWEEP_GLSL}
  void main() {
    mat4 m = rockMatrix();
    if (rockGone(m)) { gl_Position = OUT_OF_SIGHT; return; }
    vec3 from = (m * vec4(position, 1.0)).xyz;
    vec3 to = (m * vec4(mix(bite0, bite1, sweep(sweepAt, time)), 1.0)).xyz;
    vec3 p = mix(from, to, corner.x);
    vec3 side = normalize(cross(to - from, cameraPosition - p));
    vec4 mv = viewMatrix * vec4(p, 1.0);
    // half a meter wide, at least MIN_PIXELS, dimmer by what it gains
    float px = pixels(${(0.5 * M).toFixed(1)}, -mv.z);
    float width = ${(0.5 * M).toFixed(1)} * max(px, ${MIN_PIXELS.toFixed(1)}) / px;
    vBright = dimmed(px);
    vAlong = corner.x;
    vSide = corner.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + side * corner.y * width * 0.5, 1.0);
  }
`;

/** A cutting laser: invisible in vacuum but for the dust of its own cut, so faint along its way and bright where it bites. */
const beamFragment = /* glsl */ `
  varying float vAlong;
  varying float vSide;
  varying float vBright;
  void main() {
    float across = 1.0 - vSide * vSide;
    float bite = smoothstep(0.75, 1.0, vAlong);
    vec3 color = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.95, 0.9), across * across);
    gl_FragColor = vec4(color * across * (0.18 + 1.6 * bite) * vBright, 1.0);
  }
`;

const moteVertex = /* glsl */ `
  ${ROCK_GLSL}
  uniform float time;
  uniform float viewport;
  uniform vec3 sun;
  uniform vec3 sunColor;
  attribute vec3 bite0;
  attribute vec3 bite1;
  attribute vec2 sweepAt;
  attribute vec3 up;
  attribute vec4 seed;
  attribute float kind;
  varying vec3 vColor;
  varying float vSoft;
  ${DIM_GLSL}
  ${SWEEP_GLSL}
  ${PHASE_GLSL}
  void main() {
    mat4 m = rockMatrix();
    if (rockGone(m)) { gl_Position = OUT_OF_SIGHT; gl_PointSize = 0.0; return; }
    vec3 normal = normalize(mat3(m) * up);
    vec3 spread = mat3(m) * seed.xyz;
    spread = length(spread) > 0.0 ? normalize(spread) : normal;
    vec3 world;
    float size;
    if (kind < 0.5) {
      // a spark: flung from where the laser bit when it was struck off, straight on, cooling
      float age = fract(time / ${SPARK_LIFE.toFixed(2)} + seed.w);
      vec3 from = (m * vec4(mix(bite0, bite1, sweep(sweepAt, time - age * ${SPARK_LIFE.toFixed(2)})), 1.0)).xyz;
      float speed = (8.0 + 32.0 * fract(seed.w * 7.31)) * ${M.toFixed(1)};
      world = from + normalize(normal * 1.3 + spread) * speed * age * ${SPARK_LIFE.toFixed(2)};
      size = ${(0.9 * M).toFixed(1)};
      vColor = mix(vec3(1.0, 0.95, 0.75), vec3(1.0, 0.25, 0.05), age) * (1.0 - age) * 2.0;
      vSoft = 0.0;
    } else {
      // a mote of drill dust: rising from the hole, spreading and thinning, lit by the sun
      float age = fract(time / ${DUST_LIFE.toFixed(1)} + seed.w);
      float t = age * ${DUST_LIFE.toFixed(1)};
      vec3 from = (m * vec4(bite0, 1.0)).xyz;
      world = from + normal * ${DUST_RISE.toFixed(1)} * t + spread * ${(0.9 * M).toFixed(1)} * t;
      size = ${(3 * M).toFixed(1)} + ${(1.6 * M).toFixed(1)} * t;
      float c = dot(normalize(world - cameraPosition), sun);
      float fade = smoothstep(0.0, 0.08, age) * (1.0 - age);
      vColor = sunColor * vec3(0.95, 0.78, 0.58) * (0.04 + 0.5 * phase(c)) * fade;
      vSoft = 1.0;
    }
    vec4 mv = viewMatrix * vec4(world, 1.0);
    float px = pixels(size, -mv.z);
    vColor *= dimmed(px);
    gl_PointSize = max(px, ${MIN_PIXELS.toFixed(1)});
    gl_Position = projectionMatrix * mv;
  }
`;

const moteFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vSoft;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float a = mix(exp(-d * d * 4.0), exp(-d * d * 2.5) * (1.0 - d), vSoft);
    gl_FragColor = vec4(vColor * a * step(d, 1.0), 1.0);
  }
`;

const glowVertex = /* glsl */ `
  ${ROCK_GLSL}
  attribute vec4 cell;
  attribute vec3 tint;
  attribute vec2 sweepAt;
  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vTint;
  varying vec2 vSweep;
  void main() {
    mat4 m = rockMatrix();
    if (rockGone(m)) { gl_Position = OUT_OF_SIGHT; return; }
    vUv = uv;
    vCell = cell;
    vTint = tint;
    vSweep = sweepAt;
    gl_Position = projectionMatrix * viewMatrix * (m * vec4(position, 1.0));
  }
`;

/** Paint and light on a rock (see decal): its cell of the atlas, in its color; a fresh cut glows where the laser just passed. */
const glowFragment = /* glsl */ `
  uniform sampler2D atlas;
  uniform float time;
  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vTint;
  varying vec2 vSweep;
  ${SWEEP_GLSL}
  void main() {
    if (vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) discard;
    float heat = 1.0;
    if (vSweep.x > 0.0) heat = 0.3 + 2.5 * exp(-abs(sweep(vSweep, time) - (vUv.x - 0.06) / 0.88) * 9.0);
    gl_FragColor = vec4(vTint * texture2D(atlas, vCell.xy + vUv * vCell.zw).r * heat, 1.0);
  }
`;

const cloudVertex = /* glsl */ `
  uniform vec3 sun;
  uniform vec3 sunColor;
  attribute vec4 cloud;
  attribute vec4 look;
  varying vec2 vUv;
  varying vec2 vCorner;
  varying vec3 vColor;
  ${PHASE_GLSL}
  void main() {
    vec4 center = viewMatrix * vec4(cloud.xyz, 1.0);
    // out of the way from close up (no wall of fog in a pilot's face), and gone before the far plane
    float distance = length(center.xyz);
    float near = smoothstep(cloud.w * 0.9, cloud.w * 2.2, distance);
    float far = 1.0 - smoothstep(200000.0, 260000.0, distance);
    vColor = sunColor * vec3(1.0, 0.8, 0.6) * (0.02 + 1.1 * phase(dot(normalize(cloud.xyz - cameraPosition), sun))) * near * far * look.w;
    float turn = look.z;
    vec2 corner = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * position.xy;
    vCorner = position.xy;
    vUv = look.xy + (position.xy * 0.5 + 0.5) * 0.5;
    gl_Position = projectionMatrix * (center + vec4(corner * cloud.w, 0.0, 0.0));
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec2 vCorner;
  varying vec3 vColor;
  void main() {
    float edge = 1.0 - smoothstep(0.6, 1.0, length(vCorner));
    gl_FragColor = vec4(vColor * texture2D(map, vUv).r * edge, 1.0);
  }
`;

/** Geometry gathered for one material: plain arrays, merged into one BufferGeometry (see Kit.geometry). */
class Kit {
  readonly attributes = new Map<string, { size: number; values: number[] }>();
  constructor(sizes: Record<string, number>) {
    for (const [name, size] of Object.entries(sizes)) this.attributes.set(name, { size, values: [] });
  }
  push(name: string, ...values: number[]) {
    this.attributes.get(name)!.values.push(...values);
  }
  get count() {
    const position = this.attributes.get('position')!;
    return position.values.length / position.size;
  }
  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    for (const [name, { size, values }] of this.attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    return geometry;
  }
}

/** The atlas's cells (u, v, width, height): six slogans, a round glow, a tunnel's glow, a cut's line. */
const SLOGAN_CELL = (i: number) => [(i % 2) * 0.5, Math.floor(i / 2) * 0.25, 0.5, 0.25];
const ROUND_CELL = [0, 0.75, 0.25, 0.25];
const TUNNEL_CELL = [0.25, 0.75, 0.25, 0.25];
const KERF_CELL = [0.5, 0.75, 0.5, 0.25];

/** What a rock's frame needs: its slot, its measured surface, center, scale and drawn mesh. */
interface Site {
  slot: number;
  asteroid: Asteroid;
  /** World units per unit of the rock's own frame. */
  scale: number;
  /** The rock's mean radius in its own frame. */
  mean: number;
}

/** A cut face as built, in the rock's own frame (for the tests): its plane's normal and height from the center, and its outline. */
export interface Face {
  id: string;
  normal: THREE.Vector3;
  height: number;
  outline: THREE.Vector3[];
}

/** A drill hole that blows dust (see dustAt): the rock's slot, where it lies and which way is up, in the rock's frame. */
interface Hole {
  slot: number;
  at: THREE.Vector3;
  up: THREE.Vector3;
}

/** All the dressing of a field, in its rocks' own frames. */
export interface Plan {
  /** The rock of each slot. */
  ids: string[];
  steel: Kit;
  stone: Kit;
  glow: Kit;
  lights: Kit;
  beams: Kit;
  motes: Kit;
  faces: Face[];
  holes: Hole[];
  /** Where the graffiti are painted: slot, middle and the way they face, in the rock's frame. */
  paint: Hole[];
  /** Dust clouds in the world: center and radius (units), then the atlas tile, a turn and a strength. */
  clouds: number[];
  /** The solid boxes of the rigs and buoys, by slot, in their rocks' own frames (see AsteroidField.attach). */
  solids: Attachment[][];
}

/**
 * A solid box of a rig or buoy, in the part's frame (world units, placed on the rock by
 * `frame`): `half` its half extents, at `center`, turned by `turn` (none by default).
 */
function solid(plan: Plan, site: Site, frame: THREE.Matrix4, center: THREE.Vector3, half: THREE.Vector3, turn = new THREE.Quaternion()) {
  (plan.solids[site.slot] ??= []).push(attachment(frame.clone().multiply(new THREE.Matrix4().compose(center, turn, new THREE.Vector3(1, 1, 1))), half));
}

/** A beam from `from` to `to` of `thickness` (see strut) as a solid box along it. */
function solidBeam(plan: Plan, site: Site, frame: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3, thickness: number) {
  const along = to.clone().sub(from);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
  solid(plan, site, frame, from.clone().lerp(to, 0.5), v3(thickness / 2, along.length() / 2, thickness / 2), turn);
}

const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();

/** The rock's drawn mesh in its own frame (the near level, with its colors), or null. */
function drawnMesh(asteroid: Asteroid): THREE.Mesh | null {
  const object = asteroid.object instanceof THREE.LOD ? asteroid.object.levels[0].object : asteroid.object;
  let mesh: THREE.Mesh | null = null;
  object.traverse((o) => (mesh ??= o instanceof THREE.Mesh ? o : null));
  return mesh;
}

/** The point of the rock's measured surface in a direction from its center (its own frame). */
function surfaceAt(site: Site, direction: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const a = site.asteroid;
  scratch2.copy(direction).normalize();
  const radius = a.surface ? a.surface.radius(scratch2) : site.mean;
  return target.copy(scratch2).multiplyScalar(radius).add(a.center);
}

/** Two directions across `normal`. */
function across(normal: THREE.Vector3, side: THREE.Vector3, other: THREE.Vector3) {
  side.set(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0).cross(normal).normalize();
  other.crossVectors(normal, side);
}

/**
 * A footing on the rock's surface towards `direction`, `reach` (world units) around: the plane's
 * normal fitted to the surface there, the highest point of the footprint (where a platform
 * stands) and how far below it the surface falls (where its legs end).
 */
function footing(site: Site, direction: THREE.Vector3, reach: number) {
  const center = surfaceAt(site, direction, new THREE.Vector3());
  const radial = center.clone().sub(site.asteroid.center).normalize();
  const side = new THREE.Vector3();
  const other = new THREE.Vector3();
  across(radial, side, other);
  const r = reach / site.scale;
  const at = (x: number, y: number) => surfaceAt(site, scratch.copy(center).addScaledVector(side, x * r).addScaledVector(other, y * r).sub(site.asteroid.center), new THREE.Vector3());
  const normal = new THREE.Vector3().crossVectors(at(1, 0).sub(at(-1, 0)), at(0, 1).sub(at(0, -1))).normalize();
  if (normal.dot(radial) < 0) normal.negate();
  // a slope steeper than 45° is leveled towards the radial direction
  if (normal.dot(radial) < 0.7) normal.lerp(radial, 0.5).normalize();
  let top = -Infinity;
  let bottom = Infinity;
  for (let k = 0; k < 9; k++) {
    const angle = (k / 8) * Math.PI * 2;
    const p = k === 8 ? center.clone() : at(Math.cos(angle), Math.sin(angle));
    const h = p.sub(center).dot(normal);
    top = Math.max(top, h);
    bottom = Math.min(bottom, h);
  }
  return { center, normal, top, bottom };
}

/** A frame on a rock: `origin` and `up` in its own frame, with a turn about up; its matrix takes world-unit parts into the rock's frame. */
function frameOf(site: Site, origin: THREE.Vector3, up: THREE.Vector3, turn: number): THREE.Matrix4 {
  const side = new THREE.Vector3();
  const other = new THREE.Vector3();
  across(up, side, other);
  const x = side.clone().multiplyScalar(Math.cos(turn)).addScaledVector(other, Math.sin(turn));
  const z = new THREE.Vector3().crossVectors(x, up);
  return new THREE.Matrix4().makeBasis(x, up, z).setPosition(origin).multiply(new THREE.Matrix4().makeScale(1 / site.scale, 1 / site.scale, 1 / site.scale));
}

/** What a part stands on: the rock's tone around it and the height of the ground in the part's frame (units). */
interface Soil {
  tone: THREE.Color;
  ground: number;
}

/**
 * Adds a shape (in world units, placed by `frame`) to the steel kit, in a color, glowing by
 * `glow` (its own work lights on it; above 0.5 a lit pane, glowing in its own color), painted in
 * hazard stripes by `hazard` (1 all over, 'sides' only on its faces that look neither up nor
 * down), and dusted in the rock's tone towards the ground of `soil`. The steel's surface tiles
 * across its faces (see boxUv), unless the shape brings its own coordinates (`userData.mapped`).
 */
function addShape(kit: Kit, slot: number, shape: THREE.BufferGeometry, frame: THREE.Matrix4, color: THREE.Color, glow = 0.04, hazard: number | 'sides' = 0, soil: Soil | null = null) {
  const geometry = shape.index ? shape.toNonIndexed() : shape;
  if (!shape.userData.mapped) boxUv(geometry, STEEL_TILE);
  const position = geometry.getAttribute('position');
  const local = position.clone();
  const up = geometry.getAttribute('normal').clone();
  geometry.applyMatrix4(frame);
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    kit.push('position', position.getX(i), position.getY(i), position.getZ(i));
    kit.push('normal', normal.getX(i), normal.getY(i), normal.getZ(i));
    const dust = soil ? 1 - THREE.MathUtils.smoothstep(local.getY(i), soil.ground, soil.ground + SOIL_REACH) : 0;
    tint.copy(color);
    if (soil) tint.lerp(soil.tone, dust * 0.8);
    kit.push('color', tint.r, tint.g, tint.b);
    kit.push('uv', uv.getX(i), uv.getY(i));
    kit.push('glow', glow);
    kit.push('hazard', hazard === 'sides' ? (Math.abs(up.getY(i)) < 0.5 ? 1 : 0) : hazard);
    kit.push('rock', slot);
  }
  shape.dispose();
  geometry.dispose();
}

/** How far a beam's edges are cut off, as a share of its thickness: the chamfer catches the light along every edge. */
const CHAMFER = 0.18;

/** A beam of square section `thickness` with chamfered edges from `from` to `to` (world units, in the part's frame), its surface running along it. */
function strut(from: THREE.Vector3, to: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const length = from.distanceTo(to);
  // an octagonal prism whose corners are pulled onto a square, cut at its corners
  const beam = new THREE.CylinderGeometry(1, 1, length, 8, 1, false, Math.PI / 8).toNonIndexed();
  const position = beam.getAttribute('position');
  const h = thickness / 2;
  const c = thickness * CHAMFER;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6) continue;
    const wide = Math.abs(x) > Math.abs(z);
    position.setXYZ(i, Math.sign(x) * (wide ? h : h - c), position.getY(i), Math.sign(z) * (wide ? h - c : h));
  }
  beam.computeVertexNormals();
  boxUv(beam, STEEL_TILE * 2);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), scratch.subVectors(to, from).normalize());
  beam.applyMatrix4(new THREE.Matrix4().compose(from.clone().lerp(to, 0.5), turn, new THREE.Vector3(1, 1, 1)));
  beam.userData.mapped = true;
  return beam;
}

/** A box of world units at a place in the part's frame. */
const block = (width: number, height: number, depth: number, x: number, y: number, z: number) => new THREE.BoxGeometry(width, height, depth).translate(x, y, z);

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A point of light: where (the rock's frame), its color, its size (units) and its blink (period s, phase, share lit; no period: steady). */
function addLight(kit: Kit, slot: number, at: THREE.Vector3, color: THREE.Color, size: number, blink: [number, number, number] = [0, 0, 1]) {
  kit.push('position', at.x, at.y, at.z);
  kit.push('tint', color.r, color.g, color.b);
  kit.push('size', size);
  kit.push('blink', ...blink);
  kit.push('rock', slot);
}

/**
 * Paint or light laid onto the rock's drawn surface: the triangles of its mesh facing `normal`
 * within a box around `center` (`width` along `side`, `height` across, world units), lifted a
 * little off the surface, with texture coordinates running 0 to 1 over the box (the shader drops
 * what falls outside). It hugs the near mesh; farther out, where the far mesh is drawn, it is a
 * few pixels across.
 */
function decal(kit: Kit, site: Site, center: THREE.Vector3, normal: THREE.Vector3, side: THREE.Vector3, width: number, height: number, cell: number[], color: THREE.Color, sweepAt: [number, number] = [0, 0]) {
  const mesh = drawnMesh(site.asteroid);
  if (!mesh) return;
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const up = new THREE.Vector3().crossVectors(normal, side).normalize();
  const w = width / site.scale;
  const h = height / site.scale;
  const depth = Math.max(w, h) * 0.5;
  const lift = (0.4 * M) / site.scale;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const uvs = [0, 0, 0, 0, 0, 0];
  const face = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let t = 0; t < count; t += 3) {
    let inside = 0;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = index ? index.getX(t + k) : t + k;
      corners[k].fromBufferAttribute(position, i);
      scratch.subVectors(corners[k], center);
      const u = scratch.dot(side) / w + 0.5;
      const v = scratch.dot(up) / h + 0.5;
      uvs[k * 2] = u;
      uvs[k * 2 + 1] = v;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
      if (Math.abs(scratch.dot(normal)) < depth) inside++;
    }
    if (inside < 3 || maxU < 0 || minU > 1 || maxV < 0 || minV > 1) continue;
    face.subVectors(corners[1], corners[0]).cross(scratch.subVectors(corners[2], corners[0])).normalize();
    if (face.dot(normal) < 0.2) continue;
    for (let k = 0; k < 3; k++) {
      const p = corners[k].addScaledVector(normal, lift);
      kit.push('position', p.x, p.y, p.z);
      kit.push('uv', uvs[k * 2], uvs[k * 2 + 1]);
      kit.push('cell', ...cell);
      kit.push('tint', color.r, color.g, color.b);
      kit.push('sweepAt', ...sweepAt);
      kit.push('rock', site.slot);
    }
  }
}

/** A flat glowing disc of a cell, `radius` world units, at `at` facing `normal` (the rock's frame). */
function disc(kit: Kit, site: Site, at: THREE.Vector3, normal: THREE.Vector3, radius: number, cell: number[], color: THREE.Color) {
  const side = new THREE.Vector3();
  const other = new THREE.Vector3();
  across(normal, side, other);
  const r = radius / site.scale;
  const corner = (x: number, y: number) => {
    const p = at.clone().addScaledVector(side, x * r).addScaledVector(other, y * r);
    kit.push('position', p.x, p.y, p.z);
    kit.push('uv', (x + 1) / 2, (y + 1) / 2);
    kit.push('cell', ...cell);
    kit.push('tint', color.r, color.g, color.b);
    kit.push('sweepAt', 0, 0);
    kit.push('rock', site.slot);
  };
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) corner(x, y);
}

/** The rock's color around a direction, as its relief map paints it (see world/rocks, rockTone); dark grey for a piece that is no rock shape. */
function rockColor(site: Site, direction: THREE.Vector3): THREE.Color {
  const mesh = drawnMesh(site.asteroid);
  return (mesh && rockTone(mesh, direction)) ?? new THREE.Color(0.2, 0.19, 0.18);
}

/**
 * The rig of a claim: a platform on four legs over the rock, a lattice derrick with its drill
 * string going down into the rock, a crew hut, a boom with a cutting head; sodium lamps at the
 * platform's corners, white floodlights on the derrick, a red light on its top blinking slowly,
 * lit windows in the hut; a pool of the lamps' light on the rock around it; dust rising from the
 * drill hole beside it; and, for a cutter, the laser from the boom's head into the rock, sparks
 * where it bites and the cut glowing behind it.
 */
function rig(plan: Plan, site: Site, r: Randomizer, cutter: boolean) {
  const direction = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
  const foot = footing(site, direction, 20 * M);
  const turn = r.range(0, Math.PI * 2);
  const frame = frameOf(site, foot.center, foot.normal, turn);
  const deck = foot.top + (3 * M) / site.scale;
  // in the part's frame: y up from the surface's center point, in world units
  const level = deck * site.scale;
  const legDepth = (foot.bottom * site.scale) - 10 * M;
  const steel = new THREE.Color(0.42, 0.4, 0.37);
  const dark = new THREE.Color(0.3, 0.3, 0.31);
  const hazard = new THREE.Color(0.85, 0.6, 0.08);
  const rust = new THREE.Color(0.55, 0.24, 0.13);
  const soil: Soil = { tone: rockColor(site, foot.normal), ground: foot.top * site.scale };
  const add = (shape: THREE.BufferGeometry, color: THREE.Color, glow = 0.04, paint: number | 'sides' = 0) => addShape(plan.steel, site.slot, shape, frame, color, glow, paint, soil);
  // platform and legs: the deck's rim in hazard stripes, its plating dark
  add(block(32 * M, 2.5 * M, 32 * M, 0, level, 0), hazard, 0.04, 'sides');
  add(block(29 * M, 0.3 * M, 29 * M, 0, level + 1.3 * M, 0), dark);
  for (const [x, z] of [[-14, -14], [14, -14], [14, 14], [-14, 14]]) add(strut(v3(x * M, level, z * M), v3(x * M * 1.15, legDepth, z * M * 1.15), 2.2 * M), steel);
  // the derrick: four corner posts leaning in, braced at three levels
  const tall = 46 * M;
  for (const [x, z] of [[-7, -7], [7, -7], [7, 7], [-7, 7]]) add(strut(v3(x * M, level, z * M), v3(x * 0.25 * M, level + tall, z * 0.25 * M), 2.2 * M), steel);
  for (const k of [0.3, 0.6, 0.88]) {
    const half = 7 * M * (1 - 0.75 * k);
    const y = level + tall * k;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) add(strut(v3(a[0] * half, y, a[1] * half), v3(b[0] * half, y, b[1] * half), 1.6 * M), steel);
  }
  // the drill string into the rock and its head over the platform, striped as a moving part
  add(new THREE.CylinderGeometry(1.2 * M, 1.2 * M, level - legDepth + tall * 0.9, 8).translate(0, (legDepth + level + tall * 0.9) / 2, 0), steel);
  add(block(5 * M, 4 * M, 5 * M, 0, level + tall * 0.9, 0), hazard, 0.04, 'sides');
  // the crew hut: a pressurized can lying on the deck, a row of lit windows along it, the control panels' screens beside them
  add(new THREE.CylinderGeometry(5 * M, 5 * M, 16 * M, 12).rotateZ(Math.PI / 2).translate(-6 * M, level + 6 * M, 10 * M), rust);
  for (const x of [-11, -7.5, -4]) add(block(2.8 * M, 1.4 * M, 0.4 * M, x * M, level + 7 * M, 15 * M), new THREE.Color(1.0, 0.72, 0.35), 1.6);
  add(block(1.6 * M, 1 * M, 0.4 * M, -0.6 * M, level + 6.6 * M, 15.1 * M), new THREE.Color(0.2, 1.0, 0.75), 1.2);
  add(block(1 * M, 0.6 * M, 0.4 * M, -0.6 * M, level + 5.3 * M, 15.1 * M), new THREE.Color(1.0, 0.35, 0.2), 1.2);
  // the cab: a box at the deck's corner beside the derrick, its window and a strip of light looking out over the rock
  add(block(6 * M, 6 * M, 6 * M, 12.5 * M, level + 4.2 * M, -10 * M), steel);
  add(block(0.4 * M, 2.6 * M, 5 * M, 15.6 * M, level + 5.2 * M, -10 * M), new THREE.Color(0.55, 0.85, 1.0), 1.4);
  add(block(0.4 * M, 0.5 * M, 5 * M, 15.6 * M, level + 2.6 * M, -10 * M), new THREE.Color(1.0, 0.62, 0.08), 1.2);
  // lamps: sodium at the platform's corners under their hoods on posts, floodlights in housings halfway up the derrick, red on its top
  for (const [x, z] of [[-15, -15], [15, -15], [15, 15], [-15, 15]]) {
    add(strut(v3(x * M, level, z * M), v3(x * M, level + 4.6 * M, z * M), 0.6 * M), dark);
    add(block(2.4 * M, 0.8 * M, 2.4 * M, x * M, level + 4.9 * M, z * M), dark);
    addLight(plan.lights, site.slot, v3(x * M, level + 4 * M, z * M).applyMatrix4(frame), SODIUM, 3 * M);
  }
  for (const [x, z] of [[-5, 5], [5, -5]]) {
    add(block(2.6 * M, 2.6 * M, 2.6 * M, x * 0.8 * M, level + tall * 0.55, z * 0.8 * M), steel);
    addLight(plan.lights, site.slot, v3(x * M, level + tall * 0.55, z * M).applyMatrix4(frame), WHITE, 3.5 * M);
  }
  add(block(1.6 * M, 1.2 * M, 1.6 * M, 0, level + tall + 0.4 * M, 0), dark);
  addLight(plan.lights, site.slot, v3(0, level + tall + 2 * M, 0).applyMatrix4(frame), RED, 2.5 * M, [2.8, r.nextFloat(), 0.45]);
  for (const x of [-11, -7.5, -4]) addLight(plan.lights, site.slot, v3(x * M, level + 7 * M, 15.5 * M).applyMatrix4(frame), SODIUM, 0.9 * M);
  // the lamps' light on the rock around the rig
  const side = v3(1, 0, 0).transformDirection(frame);
  decal(plan.glow, site, foot.center, foot.normal, side, 150 * M, 150 * M, ROUND_CELL, SODIUM.clone().multiplyScalar(0.22));
  // the drill hole beside it blows dust
  const hole = surfaceAt(site, v3(-20 * M, 0, -18 * M).applyMatrix4(frame).sub(site.asteroid.center), new THREE.Vector3());
  plan.holes.push({ slot: site.slot, at: hole, up: foot.normal.clone() });
  for (let i = 0; i < MOTES; i++) mote(plan, site.slot, hole, hole, [0, 0], foot.normal, r, 1);
  // what of it is solid: the deck, its legs and lamp posts, the derrick (a lattice too tight for
  // a ship, so a box tapering in two steps), the drill string below the deck, the hut and the cab
  solid(plan, site, frame, v3(0, level, 0), v3(16 * M, 1.25 * M, 16 * M));
  for (const [x, z] of [[-14, -14], [14, -14], [14, 14], [-14, 14]]) solidBeam(plan, site, frame, v3(x * M, level, z * M), v3(x * M * 1.15, legDepth, z * M * 1.15), 2.2 * M);
  for (const [x, z] of [[-15, -15], [15, -15], [15, 15], [-15, 15]]) solidBeam(plan, site, frame, v3(x * M, level, z * M), v3(x * M, level + 5.3 * M, z * M), 2.4 * M);
  solid(plan, site, frame, v3(0, level + tall * 0.25, 0), v3(7 * M, tall * 0.25, 7 * M));
  solid(plan, site, frame, v3(0, level + tall * 0.75 + 0.5 * M, 0), v3(4.5 * M, tall * 0.25 + 0.5 * M, 4.5 * M));
  solidBeam(plan, site, frame, v3(0, legDepth, 0), v3(0, level, 0), 2.4 * M);
  solid(plan, site, frame, v3(-6 * M, level + 6 * M, 10 * M), v3(8 * M, 5 * M, 5.2 * M));
  solid(plan, site, frame, v3(12.5 * M, level + 4.2 * M, -10 * M), v3(3.2 * M, 3 * M, 3 * M));
  if (!cutter) return;
  solidBeam(plan, site, frame, v3(0, level + tall * 0.75, 0), v3(46 * M, level + 30 * M, 0), 1.8 * M);
  solidBeam(plan, site, frame, v3(0, level, 0), v3(40 * M, level + 28 * M, 0), 1.4 * M);
  solid(plan, site, frame, v3(46 * M, level + 30 * M, 0), v3(2.5 * M, 2.5 * M, 2.5 * M));
  // the boom and its cutting head, reaching out over the rock
  const head = v3(46 * M, level + 30 * M, 0);
  add(strut(v3(0, level + tall * 0.75, 0), head, 1.8 * M), hazard, 0.04, 1);
  add(strut(v3(0, level, 0), v3(40 * M, level + 28 * M, 0), 1.4 * M), steel);
  add(new THREE.BoxGeometry(5 * M, 5 * M, 5 * M).translate(head.x, head.y, head.z), steel);
  const nozzle = head.clone().setY(head.y - 3 * M).applyMatrix4(frame);
  addLight(plan.lights, site.slot, nozzle, WHITE, 2 * M);
  // the cut runs across beneath the head, 36 m long
  const bite0 = surfaceAt(site, v3(52 * M, 0, -18 * M).applyMatrix4(frame).sub(site.asteroid.center), new THREE.Vector3());
  const bite1 = surfaceAt(site, v3(52 * M, 0, 18 * M).applyMatrix4(frame).sub(site.asteroid.center), new THREE.Vector3());
  const sweepAt: [number, number] = [SWEEP_SECONDS * r.range(0.8, 1.25), r.nextFloat()];
  for (const [along, sideOf] of [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]]) {
    plan.beams.push('position', nozzle.x, nozzle.y, nozzle.z);
    plan.beams.push('bite0', bite0.x, bite0.y, bite0.z);
    plan.beams.push('bite1', bite1.x, bite1.y, bite1.z);
    plan.beams.push('sweepAt', ...sweepAt);
    plan.beams.push('corner', along, sideOf);
    plan.beams.push('rock', site.slot);
  }
  for (let i = 0; i < SPARKS; i++) mote(plan, site.slot, bite0, bite1, sweepAt, foot.normal, r, 0);
  // the cut itself, glowing where the laser just passed (its line runs from bite0 to bite1 over the decal's middle 88 %)
  const middle = bite0.clone().lerp(bite1, 0.5);
  const along = bite1.clone().sub(bite0);
  const length = along.length() * site.scale;
  const normal = middle.clone().sub(site.asteroid.center).normalize().lerp(foot.normal, 0.5).normalize();
  decal(plan.glow, site, middle, normal, along.normalize(), length / 0.88, 4 * M, KERF_CELL, new THREE.Color(1.0, 0.45, 0.12), sweepAt);
}

/** A spark (kind 0) or a mote of drill dust (kind 1) from a cut or a hole. */
function mote(plan: Plan, slot: number, bite0: THREE.Vector3, bite1: THREE.Vector3, sweepAt: [number, number], up: THREE.Vector3, r: Randomizer, kind: number) {
  const spread = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(kind ? 0.6 : 1);
  plan.motes.push('position', bite0.x, bite0.y, bite0.z);
  plan.motes.push('bite0', bite0.x, bite0.y, bite0.z);
  plan.motes.push('bite1', bite1.x, bite1.y, bite1.z);
  plan.motes.push('sweepAt', sweepAt[0] || 1, sweepAt[1]);
  plan.motes.push('up', up.x, up.y, up.z);
  plan.motes.push('seed', spread.x, spread.y, spread.z, r.nextFloat());
  plan.motes.push('kind', kind);
  plan.motes.push('rock', slot);
}

/**
 * A rock cut half away: the Rockborn sawed a slab off it and left a smooth face. The face lies
 * where the rock's measured surface reaches up to its plane, within FACE_TOLERANCE of the
 * rock's mean radius, on the side where that leaves the largest face; its walls reach down into
 * the rock, so no gap shows beneath its edge. Two or three tunnels lead in from it, lit inside.
 */
function cutFace(plan: Plan, site: Site, r: Randomizer) {
  const center = site.asteroid.center;
  const tolerance = FACE_TOLERANCE * site.mean;
  const side = new THREE.Vector3();
  const other = new THREE.Vector3();
  const height = (normal: THREE.Vector3, x: number, y: number, reach: number) => {
    scratch.copy(normal).multiplyScalar(reach).addScaledVector(side, x).addScaledVector(other, y);
    return surfaceAt(site, scratch, new THREE.Vector3()).sub(center).dot(normal);
  };
  let best: Face | null = null;
  let bestArea = 0;
  const ANGLES = 20;
  for (let attempt = 0; attempt < 32; attempt++) {
    const normal = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    across(normal, side, other);
    const reach = surfaceAt(site, normal, new THREE.Vector3()).sub(center).length();
    // the plane: the highest point within the cone the face may cover
    const cone = 0.7 * site.mean;
    let top = -Infinity;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (i * i + j * j <= 16) top = Math.max(top, height(normal, (i / 4) * cone, (j / 4) * cone, reach));
    // the outline: out along each angle while the surface stays within the tolerance below the plane
    const radii: number[] = [];
    for (let k = 0; k < ANGLES; k++) {
      const angle = (k / ANGLES) * Math.PI * 2;
      let rho = 0;
      for (let step = 1; step <= 24; step++) {
        const at = (step / 24) * cone;
        const h = height(normal, Math.cos(angle) * at, Math.sin(angle) * at, reach);
        if (h < top - tolerance) break;
        rho = at;
      }
      radii.push(rho);
    }
    // no spikes: each radius no longer than its neighbours' mean by more than a fifth
    const smooth = radii.map((rho, k) => Math.min(rho, 1.2 * (radii[(k + ANGLES - 1) % ANGLES] + radii[(k + 1) % ANGLES]) / 2));
    const area = smooth.reduce((sum, rho) => sum + rho * rho, 0);
    if (area <= bestArea || Math.min(...smooth) < 0.08 * site.mean) continue;
    bestArea = area;
    best = {
      id: site.asteroid.id,
      normal: normal.clone(),
      height: top,
      outline: smooth.map((rho, k) => {
        const angle = (k / ANGLES) * Math.PI * 2;
        return center.clone().addScaledVector(normal, top).addScaledVector(side, Math.cos(angle) * rho).addScaledVector(other, Math.sin(angle) * rho);
      }),
    };
  }
  if (!best) return;
  plan.faces.push(best);
  const { normal, outline } = best;
  across(normal, side, other);
  const color = rockColor(site, normal).multiplyScalar(1.7);
  const middle = center.clone().addScaledVector(normal, best.height);
  const depth = tolerance + (6 * M) / site.scale;
  const texel = 1 / (40 * M / site.scale);
  const uvOf = (p: THREE.Vector3) => [scratch.subVectors(p, middle).dot(side) * texel, scratch.dot(other) * texel];
  // the face catches the light of the tunnels' lamps, most in its middle
  const push = (p: THREE.Vector3, n: THREE.Vector3, uv: number[], tint = color, glow = 0.03) => {
    plan.stone.push('position', p.x, p.y, p.z);
    plan.stone.push('normal', n.x, n.y, n.z);
    plan.stone.push('color', tint.r, tint.g, tint.b);
    plan.stone.push('uv', uv[0], uv[1]);
    plan.stone.push('glow', glow);
    plan.stone.push('rock', site.slot);
  };
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k];
    const b = outline[(k + 1) % outline.length];
    push(middle, normal, uvOf(middle), color, 0.12);
    push(a, normal, uvOf(a));
    push(b, normal, uvOf(b));
    // the wall below this edge, facing out
    const out = new THREE.Vector3().subVectors(b, a).cross(normal).normalize().negate();
    if (out.dot(scratch.subVectors(a, middle)) < 0) out.negate();
    const a2 = a.clone().addScaledVector(normal, -depth);
    const b2 = b.clone().addScaledVector(normal, -depth);
    const wall = color.clone().multiplyScalar(0.8);
    const ua = [k * 0.5, 0], ub = [(k + 1) * 0.5, 0], ua2 = [k * 0.5, depth * texel], ub2 = [(k + 1) * 0.5, depth * texel];
    push(a, out, ua, wall);
    push(a2, out, ua2, wall);
    push(b2, out, ub2, wall);
    push(a, out, ua, wall);
    push(b2, out, ub2, wall);
    push(b, out, ub, wall);
  }
  // tunnels: a dark mouth, the warm light deep inside, a lamp at the mouth
  // spread over the face, each halfway out along an edge of the outline
  const tunnels = 2 + (r.nextInt() % 2);
  const dark = new THREE.Color(0.012, 0.01, 0.01);
  const first = r.nextInt() % outline.length;
  for (let i = 0; i < tunnels; i++) {
    const toward = outline[(first + Math.round((i * outline.length) / tunnels)) % outline.length];
    const reach = toward.distanceTo(middle);
    const radius = Math.min(r.range(8, 14) * M, reach * site.scale * 0.22);
    const at = middle.clone().lerp(toward, 0.55);
    // lifted off the face far enough that depth never mixes them up from afar
    const mouth = at.clone().addScaledVector(normal, (1 * M) / site.scale);
    const local = radius / site.scale;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2;
      const a1 = ((k + 1) / 12) * Math.PI * 2;
      push(mouth, normal, [0, 0], dark, 0);
      push(mouth.clone().addScaledVector(side, Math.cos(a0) * local).addScaledVector(other, Math.sin(a0) * local), normal, [0, 0], dark, 0);
      push(mouth.clone().addScaledVector(side, Math.cos(a1) * local).addScaledVector(other, Math.sin(a1) * local), normal, [0, 0], dark, 0);
    }
    disc(plan.glow, site, at.clone().addScaledVector(normal, (1.6 * M) / site.scale), normal, radius * 0.9, TUNNEL_CELL, new THREE.Color(1.0, 0.6, 0.25));
    addLight(plan.lights, site.slot, at.clone().addScaledVector(normal, (2.5 * M) / site.scale), SODIUM, 2.5 * M);
  }
}

/** Neon graffiti of the Rockborn on a rock: a slogan in a paint of its own, sprayed across its face, glowing faintly. */
function graffiti(plan: Plan, site: Site, r: Randomizer, slogan: number) {
  const direction = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
  const foot = footing(site, direction, 30 * M);
  const side = new THREE.Vector3();
  const other = new THREE.Vector3();
  across(foot.normal, side, other);
  const turn = r.range(-0.3, 0.3);
  side.multiplyScalar(Math.cos(turn)).addScaledVector(other, Math.sin(turn)).normalize();
  const width = Math.min(1.1 * site.mean * site.scale, 130 * M);
  decal(plan.glow, site, foot.center, foot.normal, side, width, width / 2, SLOGAN_CELL(slogan), new THREE.Color(PAINTS[slogan % PAINTS.length]).multiplyScalar(0.55));
  plan.paint.push({ slot: site.slot, at: foot.center, up: foot.normal });
}

/** A buoy marking a claim: a can in orange and black stripes on a mast anchored in the rock, its amber light blinking slowly. */
function buoy(plan: Plan, site: Site, r: Randomizer) {
  const direction = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
  const foot = footing(site, direction, 4 * M);
  const frame = frameOf(site, foot.center, foot.normal, r.range(0, Math.PI));
  const tall = r.range(18, 34) * M;
  const deep = foot.bottom * site.scale - 4 * M;
  const soil: Soil = { tone: rockColor(site, foot.normal), ground: foot.top * site.scale };
  addShape(plan.steel, site.slot, strut(v3(0, deep, 0), v3(0, tall, 0), 1.5 * M), frame, new THREE.Color(0.42, 0.41, 0.4), 0.04, 0, soil);
  addShape(plan.steel, site.slot, new THREE.CylinderGeometry(2.2 * M, 2.2 * M, 5 * M, 10).translate(0, tall, 0), frame, new THREE.Color(0.9, 0.4, 0.06), 0.1, 1);
  // its mast and its can, solid
  solidBeam(plan, site, frame, v3(0, deep, 0), v3(0, tall, 0), 1.5 * M);
  solid(plan, site, frame, v3(0, tall, 0), v3(2.2 * M, 2.5 * M, 2.2 * M));
  addLight(plan.lights, site.slot, v3(0, tall + 3.5 * M, 0).applyMatrix4(frame), AMBER, 2.2 * M, [r.range(3, 4.5), r.nextFloat(), 0.3]);
}

/**
 * The dressing of a field, in its rocks' own frames: which rocks carry what follows from the
 * layout's seed, and how it stands on them from their measured surfaces, so it is the same on
 * every browser. Clouds of dust fill the space between the rocks.
 */
export function planMining(field: AsteroidField): Plan {
  const layout = field.layout!;
  const r = new Randomizer(layout.seed * 7919 + 2584);
  const rocks = [...field.asteroids.values()].filter((a) => a.generation === 0 && !a.solid && a.kind === 'rock');
  // the claims: rocks drawn in a shuffled order
  const order = rocks.map((a) => ({ a, key: r.nextInt() })).sort((x, y) => x.key - y.key).map(({ a }) => a);
  const claimed = order.slice(0, Math.min(CLAIMS, SLOTS, order.length));
  const plan: Plan = {
    ids: claimed.map((a) => a.id),
    steel: new Kit({ position: 3, normal: 3, color: 3, uv: 2, glow: 1, hazard: 1, rock: 1 }),
    stone: new Kit({ position: 3, normal: 3, color: 3, uv: 2, glow: 1, rock: 1 }),
    glow: new Kit({ position: 3, uv: 2, cell: 4, tint: 3, sweepAt: 2, rock: 1 }),
    lights: new Kit({ position: 3, tint: 3, size: 1, blink: 3, rock: 1 }),
    beams: new Kit({ position: 3, bite0: 3, bite1: 3, sweepAt: 2, corner: 2, rock: 1 }),
    motes: new Kit({ position: 3, bite0: 3, bite1: 3, sweepAt: 2, up: 3, seed: 4, kind: 1, rock: 1 }),
    faces: [],
    holes: [],
    paint: [],
    clouds: [],
    solids: [],
  };
  // each claim draws from its own sequence, so one claim's dressing never shifts another's
  claimed.forEach((asteroid, slot) => {
    const scale = asteroid.object.scale.x;
    const site: Site = { slot, asteroid, scale, mean: asteroid.meanRadius / scale };
    const own = new Randomizer(layout.seed * 7919 + 131 * (slot + 1));
    if (slot < RIGS) rig(plan, site, own, slot < CUTTERS);
    // the faces on the first rocks without a rig that leave room for one
    else if (plan.faces.length < FACES) cutFace(plan, site, own);
    if (PAINTED.includes(slot)) graffiti(plan, site, own, PAINTED.indexOf(slot));
    for (let i = 0, n = 2 + (own.nextInt() % 2); i < n; i++) buoy(plan, site, own);
  });
  // dust between the rocks, kept clear of them
  for (let i = 0, tries = 0; i < CLOUDS && tries < CLOUDS * 20; tries++) {
    const at = v3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(layout.radius * 1.15);
    const size = r.range(250, 700) * M;
    if (rocks.some((a) => a.object.position.distanceTo(at) < a.radius + size * 0.35)) continue;
    plan.clouds.push(at.x, at.y, at.z, size, (r.nextInt() % 2) * 0.5, (r.nextInt() % 2) * 0.5, r.range(0, Math.PI * 2), r.range(0.6, 1));
    i++;
  }
  return plan;
}

/** The rigs and buoys of a plan stand solid on their rocks in `field` (see AsteroidField.attach); the plan made for its layout when none is given. */
export function standClaims(field: AsteroidField, plan: Plan = planMining(field)) {
  plan.ids.forEach((id, slot) => field.attach(id, plan.solids[slot] ?? []));
}

/** The atlas of paint and glows (see SLOGAN_CELL and the cells after it): white on black, its red channel read. */
function atlasTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const r = new Randomizer(2584);
  // the slogans, sprayed: letters a little askew, a soft halo, paint running down here and there
  SLOGANS.forEach((slogan, i) => {
    const [u, v, w, h] = SLOGAN_CELL(i).map((x) => x * size);
    const lines = slogan.split('\n');
    const lineHeight = (h * 0.8) / Math.max(lines.length, 1.6);
    ctx.save();
    ctx.translate(u, size - v - h);
    ctx.font = `italic 900 ${Math.round(lineHeight * 0.92)}px "Arial Black", Impact, sans-serif`;
    ctx.textBaseline = 'middle';
    lines.forEach((line, k) => {
      const width = ctx.measureText(line).width;
      const fit = Math.min(1, (w * 0.88) / width);
      let x = (w - width * fit) / 2;
      const y = h / 2 + (k - (lines.length - 1) / 2) * lineHeight;
      for (const letter of line) {
        const advance = ctx.measureText(letter).width * fit;
        ctx.save();
        ctx.translate(x + advance / 2, y + r.range(-3, 3));
        ctx.rotate(r.range(-0.07, 0.07));
        ctx.scale(fit, 1);
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(letter, 0, 0);
        ctx.restore();
        if (letter !== ' ' && r.nextFloat() < 0.35) {
          const dx = x + advance * r.range(0.3, 0.7);
          const length = r.range(0.2, 0.55) * lineHeight;
          // a run of paint: thick where it leaves the letter, thinning, a drop at its end
          const top = y + lineHeight * 0.3;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(dx - 4, top);
          ctx.lineTo(dx + 4, top);
          ctx.lineTo(dx + 1.5, top + length);
          ctx.lineTo(dx - 1.5, top + length);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(dx, top + length, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        x += advance;
      }
    });
    ctx.restore();
  });
  const cellRect = (cell: number[]) => cell.map((x) => x * size);
  // a round glow
  {
    const [u, v, w, h] = cellRect(ROUND_CELL);
    const g = ctx.createRadialGradient(u + w / 2, size - v - h / 2, 0, u + w / 2, size - v - h / 2, w / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.2, 'rgb(120,120,120)');
    g.addColorStop(0.5, 'rgb(28,28,28)');
    g.addColorStop(0.8, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(u, size - v - h, w, h);
  }
  // a tunnel's glow: bright deep inside, falling off to a dark rim
  {
    const [u, v, w, h] = cellRect(TUNNEL_CELL);
    const g = ctx.createRadialGradient(u + w / 2, size - v - h / 2, 0, u + w / 2, size - v - h / 2, w / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.3, 'rgb(170,170,170)');
    g.addColorStop(0.75, 'rgb(25,25,25)');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(u, size - v - h, w, h);
  }
  // a cut: a thin bright line along the cell's middle, soft at its ends
  {
    const [u, v, w, h] = cellRect(KERF_CELL);
    const g = ctx.createLinearGradient(0, size - v - h, 0, size - v);
    g.addColorStop(0.3, '#000');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(0.7, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(u + w * 0.04, size - v - h, w * 0.92, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Soft clouds of dust, four variants in a 2 × 2 atlas, from seeded value noise. */
function cloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const tile = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const r = new Randomizer(1977);
  const grid = 8;
  for (let t = 0; t < 4; t++) {
    const octaves = [grid, grid * 2, grid * 4].map((n) => Array.from({ length: (n + 1) * (n + 1) }, () => r.nextFloat()));
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        let value = 0;
        let weight = 0.55;
        [grid, grid * 2, grid * 4].forEach((n, o) => {
          const gx = (x / tile) * n;
          const gy = (y / tile) * n;
          const ix = Math.floor(gx);
          const iy = Math.floor(gy);
          const fx = gx - ix;
          const fy = gy - iy;
          const at = (i: number, j: number) => octaves[o][Math.min(j, n) * (n + 1) + Math.min(i, n)];
          const sx = fx * fx * (3 - 2 * fx);
          const sy = fy * fy * (3 - 2 * fy);
          value += weight * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
          weight *= 0.5;
        });
        const dx = (x / tile) * 2 - 1;
        const dy = (y / tile) * 2 - 1;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
        const density = Math.max(0, Math.min(1, (value - 0.25) * 1.6)) * falloff * falloff;
        const i = ((Math.floor(t / 2) * tile + y) * size + (t % 2) * tile + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(density * 255);
        image.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Fine parallel saw marks for a cut face: light and dark bands, read as the face's color map. */
function sawTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const r = new Randomizer(311);
  for (let y = 0; y < 128; y++) {
    const shade = Math.round(205 + r.range(-25, 25) + 20 * Math.sin(y * 0.4));
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, 128, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Hazard paint: dark stripes across a part's surface coordinates, STRIPE long, diagonal. Each
 * edge is smoothed over the pixel it falls in, and where a pixel spans a whole stripe the paint
 * turns to its mean, so the stripes never crawl or shimmer on a small screen.
 */
const HAZARD_GLSL = /* glsl */ `
  if (vHazard > 0.0) {
    float x = (vPaint.x + vPaint.y) * ${(STEEL_TILE / STRIPE).toFixed(2)};
    float w = max(fwidth(x), 1e-4);
    float band = clamp((abs(fract(x) - 0.5) - 0.25) / w + 0.5, 0.0, 1.0);
    band = mix(band, 0.5, smoothstep(0.35, 0.7, w));
    diffuseColor.rgb *= mix(1.0, 0.08, band * vHazard);
  }
`;

/**
 * A lit material whose vertices stand in their rock's frame (see ROCK_GLSL), glowing by their
 * `glow`: a little in their surface's color (the work lights on them), a lit pane (glow above
 * 0.5) in its own color. With `hazard`, its vertices carry a `hazard` share of hazard stripes.
 */
function rockBound(material: THREE.MeshStandardMaterial, rocks: THREE.IUniform, hazard = false): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    hazeUniforms(shader, material);
    shader.uniforms.rocks = rocks;
    const paint = hazard ? 'attribute float hazard;\nvarying float vHazard;\nvarying vec2 vPaint;' : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROCK_GLSL}\nattribute float glow;\nvarying float vGlow;\n${paint}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n\tmat4 rockFrame = rockMatrix();\n\tobjectNormal = normalize( mat3( rockFrame ) * objectNormal );\n\tvGlow = glow;${hazard ? '\n\tvHazard = hazard;\n\tvPaint = uv;' : ''}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = ( rockFrame * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlow;\n${hazard ? 'varying float vHazard;\nvarying vec2 vPaint;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${hazard ? HAZARD_GLSL : ''}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += ( vGlow > 0.5 ? vColor.rgb : diffuseColor.rgb ) * vGlow;');
  };
  material.customProgramCacheKey = () => (hazard ? 'mining-steel' : 'mining');
  return material;
}

/** The Rockborn's mining in the Belt, built for its field (see planMining) and kept in step with its rocks. */
export class Mining {
  readonly group = new THREE.Group();
  private readonly rocks: THREE.IUniform<THREE.Matrix4[]> = { value: Array.from({ length: SLOTS }, () => new THREE.Matrix4().makeScale(0, 0, 0)) };
  private readonly time = { value: 0 };
  private readonly viewport = { value: 1000 };
  private readonly sun = { value: SUN_DIRECTION.clone() };
  private readonly sunColor = { value: new THREE.Color(1, 0.94, 0.87) };
  private plan: Plan | null = null;
  private layoutKey: string | null = null;
  private motes: THREE.Points | null = null;
  private clouds: THREE.Mesh<THREE.InstancedBufferGeometry> | null = null;
  private share = 1;
  /** The drill holes in the world this frame: position and up (see dustAt). */
  private readonly holes: { at: THREE.Vector3; up: THREE.Vector3; live: boolean }[] = [];

  /** Builds the dressing of `field` (once per layout), or hides it for an arena without one. */
  dress(field: AsteroidField | null) {
    this.group.visible = !!field;
    if (!field) return;
    if (field.layout?.key === this.layoutKey && this.plan) {
      // a field generated anew in the same layout: its rigs and buoys stand again
      const plan = this.plan;
      standClaims(field, plan);
      return;
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
    }
    this.layoutKey = field.layout!.key;
    const plan = planMining(field);
    this.plan = plan;
    // the rigs and buoys are solid, standing on their rocks
    standClaims(field, plan);
    this.holes.length = 0;
    for (let i = 0; i < plan.holes.length; i++) this.holes.push({ at: new THREE.Vector3(), up: new THREE.Vector3(), live: false });
    const rocks = this.rocks;
    const steel = new THREE.Mesh(plan.steel.geometry(), rockBound(new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(STEEL_SEED, STEEL_WEAR), 1.5), vertexColors: true, envMap: shine(), envMapIntensity: 0.35 }), rocks, true));
    const stone = new THREE.Mesh(plan.stone.geometry(), rockBound(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, flatShading: false, map: sawTexture() }), rocks));
    for (const mesh of [steel, stone]) mesh.receiveShadow = true;
    const additive = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };
    const common = { rocks, time: this.time, viewport: this.viewport };
    const glow = new THREE.Mesh(plan.glow.geometry(), new THREE.ShaderMaterial({
      uniforms: { ...common, atlas: { value: atlasTexture() } },
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      ...additive,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    }));
    const lights = new THREE.Points(plan.lights.geometry(), new THREE.ShaderMaterial({ uniforms: common, vertexShader: lightVertex, fragmentShader: lightFragment, ...additive }));
    const beams = new THREE.Mesh(plan.beams.geometry(), new THREE.ShaderMaterial({ uniforms: common, vertexShader: beamVertex, fragmentShader: beamFragment, ...additive, side: THREE.DoubleSide }));
    const motes = new THREE.Points(plan.motes.geometry(), new THREE.ShaderMaterial({
      uniforms: { ...common, sun: this.sun, sunColor: this.sunColor },
      vertexShader: moteVertex,
      fragmentShader: moteFragment,
      ...additive,
    }));
    this.motes = motes;
    // the clouds: one quad, instanced
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    const cloudData = new THREE.InstancedInterleavedBuffer(new Float32Array(plan.clouds), 8, 1);
    quad.setAttribute('cloud', new THREE.InterleavedBufferAttribute(cloudData, 4, 0));
    quad.setAttribute('look', new THREE.InterleavedBufferAttribute(cloudData, 4, 4));
    quad.instanceCount = plan.clouds.length / 8;
    const clouds = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      uniforms: { sun: this.sun, sunColor: this.sunColor, map: { value: cloudTexture() } },
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      ...additive,
    }));
    this.clouds = clouds;
    for (const object of [steel, stone, glow, lights, beams, motes, clouds]) {
      object.frustumCulled = false;
      this.group.add(object);
    }
    this.setShare(this.share);
  }

  /** Moves the dressing with its rocks at field time `time`; a rock gone takes its dressing out of sight. */
  update(field: AsteroidField, time: number) {
    const plan = this.plan;
    if (!this.group.visible || !plan) return;
    this.time.value = time;
    plan.ids.forEach((id, slot) => {
      const asteroid = field.asteroids.get(id);
      const matrix = this.rocks.value[slot];
      if (asteroid) matrix.copy(asteroid.object.matrixWorld);
      else matrix.makeScale(0, 0, 0);
    });
    plan.holes.forEach((hole, i) => {
      const world = this.holes[i];
      const matrix = this.rocks.value[hole.slot];
      world.live = field.asteroids.has(plan.ids[hole.slot]);
      world.at.copy(hole.at).applyMatrix4(matrix);
      world.up.copy(hole.up).transformDirection(matrix);
    });
  }

  /** The sun's color and strength in the arena (see ArenaProfile.sun), which lights the dust. */
  setSun(color: number, intensity: number) {
    this.sunColor.value.set(color).multiplyScalar(intensity / 3.2);
  }

  /** The picture's height in device pixels: points and beams keep their size in the world with it. */
  setViewport(height: number) {
    this.viewport.value = height;
  }

  /** The share of the sparks, drill dust and dust clouds drawn (see view/quality, Look.particles). */
  setShare(share: number) {
    this.share = share;
    if (this.motes) this.motes.geometry.setDrawRange(0, Math.round(this.motes.geometry.getAttribute('position').count * share));
    if (this.clouds && this.plan) this.clouds.geometry.instanceCount = Math.round((this.plan.clouds.length / 8) * share);
  }

  /**
   * How thick the drill dust is at a point (0 none, 1 in the heart of a plume): in a cone
   * rising DUST_REACH from each hole, DUST_WIDTH wide at its foot and twice that at its top,
   * thinning outwards and upwards. Only the plumes: the clouds between the rocks are too thin to
   * be felt.
   */
  dustAt(point: THREE.Vector3): number {
    if (!this.group.visible) return 0;
    let thickest = 0;
    for (const hole of this.holes) {
      if (!hole.live) continue;
      scratch.subVectors(point, hole.at);
      const along = scratch.dot(hole.up);
      if (along < -DUST_WIDTH * 0.5 || along > DUST_REACH) continue;
      const height = Math.max(0, along) / DUST_REACH;
      const width = DUST_WIDTH * (1 + height);
      const off = scratch.addScaledVector(hole.up, -along).length();
      if (off > width) continue;
      thickest = Math.max(thickest, (1 - off / width) * (1 - height));
    }
    return thickest;
  }
}
