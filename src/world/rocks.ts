import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';

/** Fixed seed: every client builds the same rock shapes, so collision ellipsoids match. */
const ROCK_SEED = 2584;
const ROCK_COUNT = 16;
/** Edge subdivisions of the base icosahedron: 20 · 33² ≈ 22 000 triangles per rock. */
const DETAIL = 32;
/** Mean radius of a template in world units (40 to 55 m); the field scales it by 2.5 to 7. */
const MIN_RADIUS = 800;
const MAX_RADIUS = 1100;

interface Composition {
  color: [number, number, number];
  roughness: number;
  metalness: number;
}

/** Carbon-rich, stony, iron-bearing and metallic rocks, as in the real asteroid belt. */
const COMPOSITIONS: Composition[] = [
  { color: [0.09, 0.085, 0.08], roughness: 0.95, metalness: 0 },
  { color: [0.24, 0.2, 0.16], roughness: 0.92, metalness: 0 },
  { color: [0.26, 0.16, 0.11], roughness: 0.9, metalness: 0.05 },
  { color: [0.28, 0.28, 0.3], roughness: 0.6, metalness: 0.6 },
];

/**
 * Smooth 3D value noise in [-1, 1]. It uses integer hashing and polynomial blending only,
 * no transcendental functions, so every browser computes exactly the same shapes.
 */
class Noise {
  constructor(private readonly seed: number) {}

  private lattice(x: number, y: number, z: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h & 0xffff) / 32767.5 - 1;
  }

  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const n = (dx: number, dy: number, dz: number) => this.lattice(xi + dx, yi + dy, zi + dz);
    return lerp(
      lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v),
      lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v),
      w,
    );
  }

  /** Fractal noise: octaves of halving size and amplitude. Ridged noise gives sharp crests. */
  fractal(x: number, y: number, z: number, octaves: number, ridged = false): number {
    let sum = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      const s = this.sample(x * frequency, y * frequency, z * frequency);
      sum += amplitude * (ridged ? 1 - 2 * Math.abs(s) : s);
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum;
  }
}

interface Crater {
  center: THREE.Vector3;
  /** Rim radius as chord length on the unit sphere. */
  width: number;
  depth: number;
}

/** Height of a bowl-shaped crater with a raised rim at a point of the unit sphere. */
function craterHeight(direction: THREE.Vector3, crater: Crater): number {
  const t = direction.distanceTo(crater.center) / crater.width;
  if (t >= 1.5) return 0;
  if (t < 1) return crater.depth * (t * t - 1) + crater.depth * 0.25 * t * t * t * t;
  const rim = (1.5 - t) / 0.5;
  return crater.depth * 0.25 * rim * rim;
}

/**
 * One rock: a squashed or stretched ellipsoid, roughened by fractal noise and pocked with
 * craters, colored by its composition.
 */
function createRock(index: number): THREE.Mesh {
  const r = new Randomizer(ROCK_SEED * 7919 + index * 104729);
  const noise = new Noise(r.nextInt());
  const composition = COMPOSITIONS[r.nextInt() % COMPOSITIONS.length];

  const axes = new THREE.Vector3(1, r.range(0.6, 1), r.range(0.45, 0.85));
  if (r.nextFloat() < 0.35) axes.x *= r.range(1.3, 1.9);
  const radius = r.range(MIN_RADIUS, MAX_RADIUS);
  axes.multiplyScalar((3 * radius) / (axes.x + axes.y + axes.z));

  const roughness = r.range(0.1, 0.24);
  const frequency = r.range(1.1, 2.1);
  const ridged = r.nextFloat() < 0.4;
  const craters: Crater[] = [];
  const craterCount = 8 + (r.nextInt() % 22);
  for (let i = 0; i < craterCount; i++) {
    // many small craters, few large ones
    const size = r.nextFloat();
    const width = 0.06 + 0.42 * size * size * size;
    craters.push({
      center: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(),
      width,
      depth: width * r.range(0.18, 0.35),
    });
  }

  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, DETAIL);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const direction = new THREE.Vector3();
  const [red, green, blue] = composition.color;
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).normalize();
    const x = direction.x * frequency, y = direction.y * frequency, z = direction.z * frequency;
    // large lumps, plus sharp crags and boulders on a smaller scale
    let height = roughness * noise.fractal(x, y, z, 5, ridged);
    height += 0.04 * noise.fractal(x * 7 + 31, y * 7, z * 7, 3, true);
    let crater = 0;
    for (const c of craters) crater += craterHeight(direction, c);
    height += crater;
    position.setXYZ(i, direction.x * axes.x * (1 + height), direction.y * axes.y * (1 + height), direction.z * axes.z * (1 + height));

    // patchy surface, fine grain, and fresh, brighter material inside craters
    const patch = 0.75 + 0.6 * noise.fractal(x * 2 + 17, y * 2, z * 2, 3);
    const grain = 0.9 + 0.2 * noise.sample(x * 40, y * 40 + 5, z * 40);
    const fresh = crater < 0 ? 1 - crater * 1.5 : 1;
    const shade = patch * grain * fresh;
    colors[i * 3] = red * shade;
    colors[i * 3 + 1] = green * shade;
    colors[i * 3 + 2] = blue * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: composition.roughness,
    metalness: composition.metalness,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `rock-${index}`;
  return mesh;
}

/** The rock shapes of the asteroid field, identical on every client. */
export function createRocks(): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => createRock(i));
}
