import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { letteringTexture, PAINT_ASPECT, type Lettering } from '../view/lettering';

/**
 * What the hull of the world ship PAAA 01 carries besides its plating (see hullSet in
 * world/shapes): its name and registry painted on (see view/lettering), the rows of windows its
 * emergency power still lights (a few runs on failing circuits stutter), the red beacons
 * blinking slowly, the shattered biodomes on its back with their frozen gardens, and the frost
 * on the side turned away from the sun. All of it rides on the hull's pieces, so it moves with
 * a piece a comet shoves. Look only: the collisions are the pieces' boxes.
 */

/** How bright the windows burn on the emergency power. */
const WINDOW_LIGHT = 1.3;
/** A run of windows hangs on a failing circuit at this chance; the rest burn steady (or stay dark, see windowTexture). */
export const FAILING_SHARE = 0.15;
/**
 * The failing circuits: each stutters in bursts, when the sum of three slow waves at its own
 * phase runs above FAILING_THRESHOLD (a burst of a second or so every half minute), at
 * FAILING_RATE changes a second, dipping to FAILING_DIP of its light.
 */
const FAILING_THRESHOLD = 2.1;
const FAILING_RATE = 9;
const FAILING_DIP = 0.15;
const failing: THREE.MeshBasicMaterial[] = [];

/** The materials of the windows: one for the steady runs, two failing circuits that stutter apart. */
export function windowMaterials(map: THREE.Texture): { steady: THREE.MeshBasicMaterial; failing: THREE.MeshBasicMaterial[] } {
  const make = () => new THREE.MeshBasicMaterial({ map, color: new THREE.Color().setScalar(WINDOW_LIGHT), toneMapped: false });
  const circuits = [make(), make()];
  failing.push(...circuits);
  return { steady: make(), failing: circuits };
}

/** A hash of a whole number to 0..1, for the stutter of a failing circuit (look only). */
const flip = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** A beacon blinks once every BEACON_PERIOD (s), its flash fading in and out over a fifth of it; its glow is BEACON_GLOW across (units, 12 m) and never smaller than BEACON_MIN_PIXELS. */
const BEACON_PERIOD = 2.4;
const BEACON_GLOW = 240;
const BEACON_MIN_PIXELS = 3;
/** The beacons' clock and the picture's height (device px), shared by every piece's beacons. */
const beaconUniforms = { time: { value: 0 }, viewport: { value: 1000 } };

/** The stutter of the failing windows and the beacons' blinking, at field time `time` (s). */
export function animateHull(time: number) {
  failing.forEach((material, i) => {
    const t = time + i * 47;
    const burst = Math.sin(t * 0.21) + Math.sin(t * 0.53 + 1.3) + Math.sin(t * 1.37 + 0.7) > FAILING_THRESHOLD;
    material.color.setScalar(WINDOW_LIGHT * (burst && flip(Math.floor(t * FAILING_RATE)) < 0.5 ? FAILING_DIP : 1));
  });
  beaconUniforms.time.value = time;
}

/** The picture's height in device pixels: the beacons keep their glow's size in the world with it. */
export function sizeBeacons(height: number) {
  beaconUniforms.viewport.value = height;
}

const beaconVertex = /* glsl */ `
  attribute float phase;
  uniform float time;
  uniform float viewport;
  varying float vLight;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    float cycle = fract(time / ${BEACON_PERIOD.toFixed(2)} + phase);
    vLight = smoothstep(0.0, 0.06, cycle) * (1.0 - smoothstep(0.08, 0.2, cycle));
    gl_PointSize = max(${BEACON_MIN_PIXELS.toFixed(1)}, ${BEACON_GLOW.toFixed(1)} * projectionMatrix[1][1] * viewport * 0.5 / -view.z);
  }
`;

const beaconFragment = /* glsl */ `
  varying float vLight;
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float d = dot(at, at) * 4.0;
    float glow = (exp(-d * 5.0) * 0.5 + exp(-d * 60.0)) * (1.0 - smoothstep(0.8, 1.0, d));
    gl_FragColor = vec4(vec3(1.0, 0.1, 0.04) * glow * (0.08 + 1.6 * vLight), 1.0);
  }
`;

const beaconMaterial = new THREE.ShaderMaterial({
  uniforms: beaconUniforms,
  vertexShader: beaconVertex,
  fragmentShader: beaconFragment,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  toneMapped: false,
});

/** Red beacons at `positions` (a piece's own units), each blinking at a phase of its own. */
export function beacons(positions: number[], r: Randomizer): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(positions.filter((_, i) => i % 3 === 0).map(() => r.nextFloat()), 1));
  return new THREE.Points(geometry, beaconMaterial);
}

/**
 * Frost on the hull's side turned away from the sun: patches of white rime in its shadow, the
 * sun keeping its own side bare. Patched into the hull's materials (see hullSet); `frost` is 1
 * while the derelict is in play (see setHullFrost), 0 elsewhere, where the same sections stand.
 */
const frostUniforms = { frost: { value: 0 }, frostSun: { value: SUN_DIRECTION.clone() } };
/** The rime's color, and the faint cold glow it keeps in the shadow (as ice does). */
const RIME = 'vec3(0.86, 0.91, 0.98)';
const RIME_GLOW = 'vec3(0.015, 0.025, 0.045)';
/** No drift: the hull where it was laid out (see frosted). */
const STILL = { value: new THREE.Vector3() };
/** Every frosted material, and whether it is the plating's (see frosted). */
const frostedPlating = new WeakMap<THREE.Material, boolean>();
/** Each welded body's drift and its copies of the frosted materials (see weldFrost). */
const welds = new Map<number, { drift: { value: THREE.Vector3 }; copies: Map<THREE.Material, THREE.Material> }>();

/**
 * Gives the pieces of welded body `weld` (a half of the world ship, the junkyard's hub; see
 * Placement.weld) their own copies of the frosted materials, all of them sharing one drift,
 * and returns that drift for the field to set: how far the body has drifted from where it was
 * laid out (units). The copies share their shader with the originals; only the drift differs.
 */
export function weldFrost(object: THREE.Object3D, weld: number): THREE.Vector3 {
  let body = welds.get(weld);
  if (!body) welds.set(weld, (body = { drift: { value: new THREE.Vector3() }, copies: new Map() }));
  const { drift, copies } = body;
  const own = (material: THREE.Material) => {
    const plating = frostedPlating.get(material);
    if (plating === undefined || !(material instanceof THREE.MeshStandardMaterial)) return material;
    let copy = copies.get(material);
    if (!copy) copies.set(material, (copy = frosted(material.clone(), plating, drift)));
    return copy;
  };
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  return drift.value;
}

/**
 * With `plating` (the hull's plating, see ravagedSurface), the frost gathers in the plating's
 * recesses on either side (their depth in the red of the roughness map), deepest in the shadow,
 * and the plating's tone varies in patches about a hundred meters across: plates replaced over
 * the centuries, soot of the battle. So neighboring stretches never look alike, and nothing that
 * large can shimmer.
 *
 * The patches lie where the hull was laid out: `drift` is how far its body has drifted since
 * (units, see weldFrost), so they ride on the hull a comet shoves.
 */
export function frosted<M extends THREE.MeshStandardMaterial>(material: M, plating = false, drift = STILL): M {
  if (plating) material.defines = { ...material.defines, PLATING: '' };
  frostedPlating.set(material, plating);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, frostUniforms, { frostDrift: drift });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 frostDrift;\nvarying vec3 vFrostNormal;\nvarying vec3 vFrostAt;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFrostNormal = mat3(modelMatrix) * objectNormal;\nvFrostAt = (modelMatrix * vec4(transformed, 1.0)).xyz - frostDrift;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float frost;
        uniform vec3 frostSun;
        varying vec3 vFrostNormal;
        varying vec3 vFrostAt;
        float rime;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // patches tens of meters across, so they never shimmer, waves at odd angles and
        // frequencies so they never line up; thicker where the plating is dark (craters, seams)
        vec3 p = vFrostAt * 0.0011;
        float patches = 0.5 + 0.2 * sin(p.x * 1.7 + p.y * 0.6 + sin(p.z * 2.3 + p.y))
          + 0.17 * sin(p.y * 2.9 - p.z * 1.1 + sin(p.x * 1.3 + p.z))
          + 0.13 * sin((p.z - p.x) * 4.7 + sin(p.y * 3.1));
        patches += 0.25 * (0.5 - dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2)));
        float shade = smoothstep(0.05, -0.4, dot(normalize(vFrostNormal), frostSun));
        rime = shade * (0.55 + 0.45 * smoothstep(0.25, 0.65, patches));
        #ifdef PLATING
          vec3 q = vFrostAt * 0.0027;
          float tone = 0.5 + 0.25 * sin(q.x * 0.9 + sin(q.y * 1.7 + q.z)) * sin(q.z * 1.3 + q.y * 0.7)
            + 0.25 * sin(q.x * 2.3 + q.z * 1.9 + 1.7 + sin(q.y * 2.1));
          diffuseColor.rgb *= mix(vec3(0.74, 0.72, 0.7), vec3(1.06), tone);
          rime = max(rime, texture2D(roughnessMap, vRoughnessMapUv).r * (0.45 + 0.55 * shade));
        #endif
        rime *= frost;
        diffuseColor.rgb = mix(diffuseColor.rgb, ${RIME}, rime * 0.75);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, rime);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, rime);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += ${RIME_GLOW} * rime;`);
  };
  material.customProgramCacheKey = () => (plating ? 'frosted-plating' : 'frosted');
  return material;
}

/** The frost on the hull's shadow side, on while the derelict is in play. */
export function setHullFrost(on: boolean) {
  frostUniforms.frost.value = on ? 1 : 0;
}

/** Painted parts: a decal over the plating, a hair off it so it never fights with it. */
const PAINT_LIFT = 0.5;

/**
 * The paint of a stretch of hull as a decal on both flanks, each reading the right way from
 * outside: `length` long and an eighth of that high (see PAINT_ASPECT), centered on (x, y) of
 * the flanks at ±`z`. Transparent and lit like the hull; it casts no shadow of its own.
 */
export function paint(lettering: Lettering, seed: number, x: number, y: number, z: number, length: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    map: letteringTexture(lettering, seed),
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    roughness: 0.8,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      // seen up close, a texel spans many pixels and filtering draws an edge of the paint as a
      // blurred staircase; there the edge is redrawn where its coverage crosses one half, a
      // pixel wide, smooth along the shape's true outline. Soft fading and the picture from
      // afar keep the coverage as filtered.
      float coverage = sampledDiffuseColor.a;
      float texels = length(fwidth(vMapUv * vec2(textureSize(map, 0))));
      float edge = smoothstep(0.15, 0.4, fwidth(coverage) / max(texels, 1e-4)) * smoothstep(1.0, 0.5, texels);
      float crisp = clamp((coverage - 0.5) / max(fwidth(coverage), 1e-4) + 0.5, 0.0, 1.0);
      diffuseColor.a = opacity * mix(coverage, crisp, edge);`,
    );
  };
  material.customProgramCacheKey = () => 'paint';
  // both flanks in one draw call
  const flanks = [1, -1].map((side) => {
    const plane = new THREE.PlaneGeometry(length, length / PAINT_ASPECT);
    if (side < 0) plane.rotateY(Math.PI);
    return plane.translate(x, y, side * (z + PAINT_LIFT));
  });
  const decal = new THREE.Mesh(mergeGeometries(flanks), material);
  decal.userData.shadowless = true;
  return decal;
}

/**
 * A biodome on the hull's back, shattered: a cupola of glass facets (a third of them blown
 * out) of `radius`, rising `rise` of it, on a ring at (x, y, z), and inside its garden, frozen when the dome broke:
 * soil, dead trees with their bare branches, shrubs, all rimed with frost. The glass goes to
 * `glass`, the ring to `parts`, the garden to `garden`.
 */
export function biodome(r: Randomizer, x: number, y: number, z: number, radius: number, rise: number, glass: THREE.BufferGeometry[], parts: THREE.BufferGeometry[], garden: THREE.BufferGeometry[]) {
  const shell = new THREE.IcosahedronGeometry(radius, 1).toNonIndexed();
  const from = shell.getAttribute('position');
  const kept: number[] = [];
  for (let f = 0; f < from.count; f += 3) {
    const top = from.getY(f) + from.getY(f + 1) + from.getY(f + 2);
    if (top <= 0 || r.nextFloat() < 0.33) continue;
    for (let k = 0; k < 3; k++) kept.push(from.getX(f + k), Math.max(0, from.getY(f + k)) * rise, from.getZ(f + k));
  }
  const pane = new THREE.BufferGeometry();
  pane.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  pane.computeVertexNormals();
  glass.push(pane.translate(x, y, z));
  parts.push(new THREE.CylinderGeometry(radius * 1.04, radius * 1.1, radius * 0.08, 16, 1, true).translate(x, y + radius * 0.02, z).toNonIndexed());
  garden.push(new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, radius * 0.06, 12).translate(x, y + radius * 0.03, z).toNonIndexed());
  // dead trees: a trunk and its bare branches, leaning as they froze
  for (let t = 0; t < 5; t++) {
    const angle = r.range(0, Math.PI * 2);
    const out = r.range(0.1, 0.6) * radius;
    const height = r.range(0.5, 0.8) * radius * rise;
    const tree: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(radius * 0.015, radius * 0.03, height, 5).translate(0, height / 2, 0)];
    for (let b = 0; b < 4; b++) {
      const length = height * r.range(0.3, 0.5);
      tree.push(
        new THREE.CylinderGeometry(radius * 0.006, radius * 0.012, length, 4)
          .translate(0, length / 2, 0)
          .rotateZ(r.range(0.5, 1.1))
          .rotateY(r.range(0, Math.PI * 2))
          .translate(0, height * r.range(0.5, 0.95), 0),
      );
    }
    const trunk = mergeGeometries(tree.map((p) => p.toNonIndexed().deleteAttribute('uv'))).rotateZ(r.range(-0.15, 0.15)).translate(x + Math.cos(angle) * out, y + radius * 0.06, z + Math.sin(angle) * out);
    garden.push(trunk);
  }
  // shrubs, rimed lumps
  for (let s = 0; s < 10; s++) {
    const angle = r.range(0, Math.PI * 2);
    const out = r.range(0.2, 0.85) * radius;
    const size = r.range(0.04, 0.09) * radius;
    garden.push(new THREE.IcosahedronGeometry(size, 0).scale(1, 0.6, 1).translate(x + Math.cos(angle) * out, y + radius * 0.06 + size * 0.4, z + Math.sin(angle) * out).toNonIndexed());
  }
}

/** The glass of the domes: clear, faintly blue, glossy, seen from both sides. */
export const domeGlass = () =>
  new THREE.MeshStandardMaterial({ color: 0xbcd8ec, transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });

/** The frozen gardens: everything rimed white, a little blue, with the cold glow ice keeps in the shadow. */
export const rimed = () => new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.85, metalness: 0, emissive: 0x0d1a2e, emissiveIntensity: 0.6 });
