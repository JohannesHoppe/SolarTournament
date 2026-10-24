import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { tangentDirections } from './surface';
import { impostorDirections, impostorGeometry, impostorMaterial, IMPOSTOR_VIEWS } from '../view/impostor';

/** Fixed seed: every client builds the same rock shapes, so their measured surfaces match (see world/surface). */
const ROCK_SEED = 2584;
const ROCK_COUNT = 16;
/** Edge subdivisions of the base icosahedron a rock's surface is measured from (20 · 33² ≈ 22 000 triangles): never drawn, built once per shape and kept only for Surface (see world/asteroids, world/surface), so collisions stay identical however light the drawn mesh is. */
export const DETAIL = 32;
/** Subdivisions of the mesh drawn up close (20 · 10² = 2000 triangles): the fine relief (crags, small craters) lives in a baked normal map (see normalAtlas), not in the mesh, so this stays low. */
export const NEAR_DETAIL = 9;
/** Subdivisions of the mesh drawn afar, where even the coarse shape barely shows (20 · 5² = 500 triangles). */
export const FAR_DETAIL = 4;
/** Subdivisions for a coarse field built quickly (e.g. in tests): 20 · 7² ≈ 1000 triangles each. */
export const DISTANT_DETAIL = 6;
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

/** Everything a rock shape is built from, drawn once from its seed (see rockRecipe) and shared by every detail level, the normal map and the impostor atlas alike. */
interface RockRecipe {
  noiseSeed: number;
  composition: Composition;
  axes: THREE.Vector3;
  roughness: number;
  frequency: number;
  ridged: boolean;
  craters: Crater[];
}

const recipes = new Map<number, RockRecipe>();

/** The fixed recipe of a rock shape (its composition, proportions, roughness and craters), the same on every call and every browser. */
function rockRecipe(index: number): RockRecipe {
  let recipe = recipes.get(index);
  if (recipe) return recipe;
  const r = new Randomizer(ROCK_SEED * 7919 + index * 104729);
  const noiseSeed = r.nextInt();
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
    craters.push({ center: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), width, depth: width * r.range(0.18, 0.35) });
  }
  recipe = { noiseSeed, composition, axes, roughness, frequency, ridged, craters };
  recipes.set(index, recipe);
  return recipe;
}

/**
 * The rock's relief and shading at a direction from its center (unit vector): how far the
 * surface reaches there, as a share added to 1 (so the point is `direction * axes * (1 + bump)`),
 * and `shade`, the patchy, grainy, crater-fresh tint (multiplied onto the composition's color).
 * The same formula a mesh's vertices, its normal map and its impostor's albedo are built from,
 * so all three agree on the shape wherever they sample it.
 */
function surfaceSample(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3): { bump: number; shade: number } {
  const x = direction.x * recipe.frequency, y = direction.y * recipe.frequency, z = direction.z * recipe.frequency;
  // large lumps, plus sharp crags and boulders on a smaller scale
  let height = recipe.roughness * noise.fractal(x, y, z, 5, recipe.ridged);
  height += 0.04 * noise.fractal(x * 7 + 31, y * 7, z * 7, 3, true);
  let crater = 0;
  for (const c of recipe.craters) crater += craterHeight(direction, c);
  height += crater;

  // patchy surface, fine grain, and fresh, brighter material inside craters
  const patch = 0.75 + 0.6 * noise.fractal(x * 2 + 17, y * 2, z * 2, 3);
  const grain = 0.9 + 0.2 * noise.sample(x * 40, y * 40 + 5, z * 40);
  const fresh = crater < 0 ? 1 - crater * 1.5 : 1;
  return { bump: height, shade: patch * grain * fresh };
}

/** The rock's actual surface point in the direction (unit vector) `direction`, written into `target`, and its shade there. */
function surfacePoint(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3, target: THREE.Vector3): { point: THREE.Vector3; shade: number } {
  const { bump, shade } = surfaceSample(noise, recipe, direction);
  target.set(direction.x * recipe.axes.x * (1 + bump), direction.y * recipe.axes.y * (1 + bump), direction.z * recipe.axes.z * (1 + bump));
  return { point: target, shade };
}

const spheres = new Map<number, THREE.BufferGeometry>();

/** The unit sphere every rock of a detail starts from, with shared vertices; built once per detail, as it takes most of a rock's time. */
function sphere(detail: number): THREE.BufferGeometry {
  let geometry = spheres.get(detail);
  if (!geometry) {
    geometry = new THREE.IcosahedronGeometry(1, detail);
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    geometry = mergeVertices(geometry);
    spheres.set(detail, geometry);
  }
  return geometry;
}

/** The direction a cube face (0..5) and its two coordinates (-1..1) on it stand for: the same scheme world/surface's cubeFace uses, so an atlas baked here and sampled the same way in a shader agree on every cell. */
function faceDirection(face: number, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  if (face === 0) out.set(1, s, t);
  else if (face === 1) out.set(-1, s, t);
  else if (face === 2) out.set(s, 1, t);
  else if (face === 3) out.set(s, -1, t);
  else if (face === 4) out.set(s, t, 1);
  else out.set(s, t, -1);
  return out.normalize();
}

/** The finite-difference normal at a direction, from the same recipe a mesh's vertices come from (see surfacePoint): the true surface normal there, independent of how many triangles draw it. */
function bakedNormal(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const side = bakedNormal.side, across = bakedNormal.across;
  const p0 = bakedNormal.p0, p1 = bakedNormal.p1, p2 = bakedNormal.p2, nearby = bakedNormal.nearby;
  tangentDirections(direction, side, across);
  surfacePoint(noise, recipe, direction, p0);
  nearby.copy(direction).addScaledVector(side, NORMAL_STEP).normalize();
  surfacePoint(noise, recipe, nearby, p1).point.sub(p0);
  nearby.copy(direction).addScaledVector(across, NORMAL_STEP).normalize();
  surfacePoint(noise, recipe, nearby, p2).point.sub(p0);
  out.crossVectors(p1, p2).normalize();
  if (out.dot(direction) < 0) out.negate();
  return out;
}
bakedNormal.side = new THREE.Vector3();
bakedNormal.across = new THREE.Vector3();
bakedNormal.p0 = new THREE.Vector3();
bakedNormal.p1 = new THREE.Vector3();
bakedNormal.p2 = new THREE.Vector3();
bakedNormal.nearby = new THREE.Vector3();

/** The step to either side for a baked normal (share of the way out, about 3°), as world/asteroids.ts uses for a collision normal. */
const NORMAL_STEP = 0.05;

/**
 * Where cell (i, j) of tile `tile` lies in the data of an atlas of `tiles` square tiles of
 * `res` cells laid out side by side (a texture `tiles · res` wide, `res` high): row j runs across
 * every tile, as WebGL reads a DataTexture row by row.
 */
export function atlasOffset(tile: number, tiles: number, res: number, i: number, j: number): number {
  return ((j * tiles + tile) * res + i) * 4;
}

/** Edge length, in cells, of each of a normal atlas's 6 faces. */
export const ATLAS_RES = 48;
const normalAtlases = new Map<number, THREE.DataTexture>();

/**
 * An object-space normal map for a rock shape, as a 6-face cube atlas (laid out side by side):
 * the true surface normal (see bakedNormal) at every cell's direction, encoded as a color. A
 * shader samples it by the direction from the rock's own center (no UV unwrap, so no seams,
 * because a rock is star-shaped around its center: every direction meets its surface once),
 * then turns the sampled normal into world space with the object's own normalMatrix, exactly as
 * it would a vertex normal. Baked once per shape and reused by every mesh and LOD level of it.
 */
export function normalAtlas(index: number): THREE.DataTexture {
  let atlas = normalAtlases.get(index);
  if (atlas) return atlas;
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const data = new Uint8Array(6 * ATLAS_RES * ATLAS_RES * 4);
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j < ATLAS_RES; j++) {
      const t = ((j + 0.5) / ATLAS_RES) * 2 - 1;
      for (let i = 0; i < ATLAS_RES; i++) {
        const s = ((i + 0.5) / ATLAS_RES) * 2 - 1;
        faceDirection(face, s, t, direction);
        bakedNormal(noise, recipe, direction, normal);
        const o = atlasOffset(face, 6, ATLAS_RES, i, j);
        data[o] = Math.round((normal.x * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
  }
  atlas = new THREE.DataTexture(data, ATLAS_RES * 6, ATLAS_RES, THREE.RGBAFormat);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  normalAtlases.set(index, atlas);
  return atlas;
}

/** The GLSL that samples a shape's normal atlas by an object-space direction (see normalAtlas), as a chunk patched into a MeshStandardMaterial by applyRockRelief. */
const ROCK_NORMAL_GLSL = /* glsl */ `
vec3 rockNormal( vec3 dir ) {
  vec3 adir = abs( dir );
  float face; vec2 st;
  if ( adir.x >= adir.y && adir.x >= adir.z ) {
    face = dir.x >= 0.0 ? 0.0 : 1.0;
    st = vec2( dir.y, dir.z ) / adir.x;
  } else if ( adir.y >= adir.z ) {
    face = dir.y >= 0.0 ? 2.0 : 3.0;
    st = vec2( dir.x, dir.z ) / adir.y;
  } else {
    face = dir.z >= 0.0 ? 4.0 : 5.0;
    st = vec2( dir.x, dir.y ) / adir.z;
  }
  vec2 uv = clamp( st * 0.5 + 0.5, rockInset, 1.0 - rockInset );
  vec2 atlasUv = vec2( ( face + uv.x ) / 6.0, uv.y );
  return texture2D( rockNormalAtlas, atlasUv ).xyz * 2.0 - 1.0;
}
`;

/**
 * Patches a rock or ice material to shade with the shape's baked normal map instead of its
 * (low-poly) mesh normal: an object-space cube lookup by the direction from the rock's own
 * center (see normalAtlas, ROCK_NORMAL_GLSL), so the fine relief looks the same at any detail.
 */
export function applyRockRelief(material: THREE.MeshStandardMaterial, index: number) {
  const atlas = normalAtlas(index);
  const axes = rockRecipe(index).axes.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockNormalAtlas = { value: atlas };
    shader.uniforms.rockAxes = { value: axes };
    shader.uniforms.rockInset = { value: 0.5 / ATLAS_RES };
    // an instance's own turn (the belt draws its rocks instanced) is not in normalMatrix, so it
    // goes to the fragment as the three columns of instanceMatrix, the identity otherwise
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPosition;\nvarying vec3 vRockTurnX;\nvarying vec3 vRockTurnY;\nvarying vec3 vRockTurnZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvRockPosition = position;\n#ifdef USE_INSTANCING\n\tvRockTurnX = instanceMatrix[0].xyz;\n\tvRockTurnY = instanceMatrix[1].xyz;\n\tvRockTurnZ = instanceMatrix[2].xyz;\n#else\n\tvRockTurnX = vec3( 1.0, 0.0, 0.0 );\n\tvRockTurnY = vec3( 0.0, 1.0, 0.0 );\n\tvRockTurnZ = vec3( 0.0, 0.0, 1.0 );\n#endif',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        // normalMatrix has no fragment-side declaration unless a material's own normalMap is
        // in object space (ours never is: the rock's normal comes from this atlas instead), so
        // it is declared here; three.js sets it for every object regardless of a material's own
        // uniforms, by name, so no extra uniform value is needed on our side.
        `#include <common>\nuniform mat3 normalMatrix;\nuniform sampler2D rockNormalAtlas;\nuniform vec3 rockAxes;\nuniform float rockInset;\nvarying vec3 vRockPosition;\nvarying vec3 vRockTurnX;\nvarying vec3 vRockTurnY;\nvarying vec3 vRockTurnZ;\n${ROCK_NORMAL_GLSL}`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normalize( normalMatrix * ( mat3( vRockTurnX, vRockTurnY, vRockTurnZ ) * rockNormal( normalize( vRockPosition / rockAxes ) ) ) );');
  };
}

/**
 * One rock: a squashed or stretched ellipsoid, roughened by fractal noise and pocked with
 * craters, colored by its composition, and shaded by its baked normal map (see applyRockRelief)
 * regardless of `detail`.
 */
function createRock(index: number, detail: number): THREE.Mesh {
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const geometry = sphere(detail).clone();

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const [red, green, blue] = recipe.composition.color;
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).normalize();
    const { shade } = surfacePoint(noise, recipe, direction, point);
    position.setXYZ(i, point.x, point.y, point.z);
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
    roughness: recipe.composition.roughness,
    metalness: recipe.composition.metalness,
  });
  applyRockRelief(material, index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `rock-${index}`;
  return mesh;
}

/**
 * The rock shapes of the asteroid field, identical on every client; with a lower detail,
 * the same shapes for rocks so far away that even their coarse silhouette barely shows.
 */
export function createRocks(detail = DETAIL): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => createRock(i, detail));
}

/** Edge length, in cells, of each view tile of an impostor atlas: coarse, as a billboard only ever shows where a real mesh would be a speck of a few pixels. */
const IMPOSTOR_RES = 20;
/** Steps (then binary-search halvings) a ray marches to find the shape's surface for a given view and pixel. */
const IMPOSTOR_MARCH_STEPS = 14;
const IMPOSTOR_MARCH_REFINE = 4;

/**
 * The rock's bump at a direction, from fewer octaves and without the fine crags or the
 * patch/grain shading (see surfaceSample): enough to march a ray to the right silhouette
 * (craters, the large lumps) without paying for detail a billboard never shows mid-march; the
 * hit point's exact shade and normal are still read with the full surfaceSample/bakedNormal.
 */
function approxBump(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3): number {
  const x = direction.x * recipe.frequency, y = direction.y * recipe.frequency, z = direction.z * recipe.frequency;
  let crater = 0;
  for (const c of recipe.craters) crater += craterHeight(direction, c);
  return recipe.roughness * noise.fractal(x, y, z, 3, recipe.ridged) + crater;
}

/**
 * The impostor atlases of a rock shape (see view/impostor): `albedo` (color and silhouette
 * alpha) and `normal` (object-space, same encoding as normalAtlas), one IMPOSTOR_RES square
 * tile per fixed view direction, side by side. Each tile is filled by marching a ray from that
 * direction into the shape's own implicit surface (the same recipe a mesh's vertices come
 * from), so the silhouette and the normal agree with the real shape without rendering it.
 */
function bakeImpostor(index: number): { albedo: THREE.DataTexture; normal: THREE.DataTexture; radius: number } {
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const reach = Math.max(recipe.axes.x, recipe.axes.y, recipe.axes.z) * 1.35;
  const albedoData = new Uint8Array(IMPOSTOR_VIEWS * IMPOSTOR_RES * IMPOSTOR_RES * 4);
  const normalData = new Uint8Array(IMPOSTOR_VIEWS * IMPOSTOR_RES * IMPOSTOR_RES * 4);
  const [red, green, blue] = recipe.composition.color;

  const view = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const warped = new THREE.Vector3();
  /** Whether a point at `t` along the march (from `origin`, towards the camera along `-view`) already lies inside the shape's cheap approximate bump (see approxBump). */
  const inside = (t: number): boolean => {
    sample.copy(origin).addScaledVector(view, -t);
    const length = sample.length();
    if (length < 1e-6) return true;
    direction.copy(sample).normalize();
    warped.copy(sample).divide(recipe.axes);
    return warped.length() < 1 + approxBump(noise, recipe, direction);
  };

  impostorDirections().forEach((d, tile) => {
    view.copy(d);
    // a right/up basis across the view direction, as the shader side computes its own from the object's turn
    tangentDirections(view, right, up);
    for (let j = 0; j < IMPOSTOR_RES; j++) {
      const v = (((j + 0.5) / IMPOSTOR_RES) * 2 - 1) * reach;
      for (let i = 0; i < IMPOSTOR_RES; i++) {
        const u = (((i + 0.5) / IMPOSTOR_RES) * 2 - 1) * reach;
        origin.copy(right).multiplyScalar(u).addScaledVector(up, v).addScaledVector(view, reach * 2);
        const o = atlasOffset(tile, IMPOSTOR_VIEWS, IMPOSTOR_RES, i, j);
        // march from far along +view towards the shape (t grows from 0); first hit, refined by bisection
        let hit = -1;
        const steps = IMPOSTOR_MARCH_STEPS;
        const span = reach * 4;
        let previous = inside(0);
        for (let k = 1; k <= steps && hit < 0; k++) {
          const t = (k / steps) * span;
          const now = inside(t);
          if (now && !previous) {
            let lo = ((k - 1) / steps) * span, hi = t;
            for (let r = 0; r < IMPOSTOR_MARCH_REFINE; r++) {
              const mid = (lo + hi) / 2;
              if (inside(mid)) hi = mid; else lo = mid;
            }
            hit = hi;
          }
          previous = now;
        }
        if (hit < 0) {
          albedoData[o + 3] = 0;
          continue;
        }
        sample.copy(origin).addScaledVector(view, -hit);
        direction.copy(sample).normalize();
        const { shade } = surfacePoint(noise, recipe, direction, point);
        albedoData[o] = Math.round(Math.min(1, red * shade) * 255);
        albedoData[o + 1] = Math.round(Math.min(1, green * shade) * 255);
        albedoData[o + 2] = Math.round(Math.min(1, blue * shade) * 255);
        albedoData[o + 3] = 255;
        bakedNormal(noise, recipe, direction, normal);
        normalData[o] = Math.round((normal.x * 0.5 + 0.5) * 255);
        normalData[o + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        normalData[o + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        normalData[o + 3] = 255;
      }
    }
  });

  const albedo = new THREE.DataTexture(albedoData, IMPOSTOR_RES * IMPOSTOR_VIEWS, IMPOSTOR_RES, THREE.RGBAFormat);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.minFilter = albedo.magFilter = THREE.LinearFilter;
  albedo.generateMipmaps = false;
  albedo.needsUpdate = true;
  const normalMap = new THREE.DataTexture(normalData, IMPOSTOR_RES * IMPOSTOR_VIEWS, IMPOSTOR_RES, THREE.RGBAFormat);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.minFilter = normalMap.magFilter = THREE.LinearFilter;
  normalMap.generateMipmaps = false;
  normalMap.needsUpdate = true;
  return { albedo, normal: normalMap, radius: reach };
}

const impostors = new Map<number, THREE.Mesh>();

/**
 * A billboard template for a rock shape (see view/impostor): a quad with a material sampling
 * this shape's baked impostor atlases. Built once per shape and cloned (sharing geometry and
 * material) for every field rock, ice piece and belt instance of it.
 */
function rockImpostor(index: number): THREE.Mesh {
  let impostor = impostors.get(index);
  if (impostor) return impostor;
  const { albedo, normal, radius } = bakeImpostor(index);
  impostor = new THREE.Mesh(impostorGeometry(radius), impostorMaterial(albedo, normal, IMPOSTOR_RES, radius));
  impostor.name = `rock-impostor-${index}`;
  impostors.set(index, impostor);
  return impostor;
}

/** A billboard template for every rock shape (see rockImpostor), in shape order, reused by rock, ice and the belt alike. */
export function createImpostors(): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => rockImpostor(i));
}
