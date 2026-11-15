import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { radialTexture } from './textures';

/**
 * A drive's flame as the hangar's look makes it (see game/hangar, `flame`): the plasma mix a
 * Host pays for burns in its own color, and the whole drive shows it: the jet behind each bell,
 * the glow at the nozzles, the drive's light, the plume (view/plume), the exhaust trail and the
 * maneuvering thrusters' puffs (view/effects). Stock, the drive burns as the depots fuel it; the
 * first step burns azure, the second violet with shock diamonds standing in the jet, the third
 * white-hot, longer, with a glow over the whole stern. Looks only: the push, the heat and every
 * number the game shares stay as they are.
 *
 * The jet is one mesh per ship, an open cone per nozzle in additive light, its length, taper
 * and diamonds set in the vertex shader, so a ship's jets are a single draw call and no
 * geometry changes as the throttle moves.
 */

/** A drive's nozzle as the jet starts from it: its mouth's middle (model units) and its radius there. */
export type Nozzle = { x: number; y: number; z: number; r: number };

/** What one step of the look burns like: the jet's core and rim, its length (times FLAME_LENGTH), its shock diamonds, and the colors the rest of the drive takes. */
export type FlameLevel = {
  core: THREE.Color;
  edge: THREE.Color;
  length: number;
  diamonds: number;
  /** The nozzles' glow: its tint over the glow's texture and its size against stock. */
  glow: THREE.Color;
  glowScale: number;
  plume: THREE.Color;
  /** The color the maneuvering thrusters' gas cools to away from the nozzle (white-hot at its mouth, see view/effects). */
  jet: THREE.Color;
  /** The exhaust trail's puffs. */
  trail: THREE.Color;
  /** The drive's light thrown on the hull and on whatever is near. */
  light: THREE.Color;
};

const color = (r: number, g: number, b: number, scale = 1) => new THREE.Color(r, g, b).multiplyScalar(scale);

/**
 * The steps of the look (linear light, not tone mapped, so the bright parts bloom). Stock has no
 * jet of its own (the model file's flame burns); its colors are the drive's as the depots fuel it:
 * an orange plume, the thrusters' hydrogen cooling to rose (its red and blue-green lines), a
 * faint cool blue trail.
 */
export const FLAMES: readonly FlameLevel[] = [
  { core: color(1, 1, 1), edge: color(1, 1, 1), length: 0, diamonds: 0, glow: color(1, 1, 1), glowScale: 1, plume: color(1, 0.4, 0.1), jet: color(1.1, 0.28, 0.5), trail: color(0.2, 0.28, 0.5), light: new THREE.Color(0x88bbff) },
  // azure: a hotter core of white-blue in the game's azure (its readable shade, #4d91ff, on the rim)
  { core: color(0.6, 0.85, 1, 3.2), edge: color(0.07, 0.29, 1, 2.6), length: 1, diamonds: 0, glow: color(0.3, 0.6, 1.6), glowScale: 1.3, plume: color(0.1, 0.35, 1.4), jet: color(0.35, 0.65, 1.7), trail: color(0.05, 0.16, 0.7), light: new THREE.Color(0x3d8bff) },
  // violet: a mix that burns violet, the jet standing in shock diamonds
  { core: color(1, 0.78, 1, 3.2), edge: color(0.45, 0.04, 1, 2.6), length: 1.3, diamonds: 4, glow: color(1, 0.35, 1.7), glowScale: 1.6, plume: color(0.75, 0.15, 1.3), jet: color(0.9, 0.5, 1.7), trail: color(0.35, 0.08, 0.6), light: new THREE.Color(0xb050ff) },
  // white-hot: the hottest mix, a long white jet in a warm sheath, the stern lit by it
  { core: color(1, 1, 1, 4.5), edge: color(1, 0.88, 0.7, 2.6), length: 1.6, diamonds: 5, glow: color(1.9, 1.7, 1.45), glowScale: 2.3, plume: color(1.2, 1, 0.8), jet: color(1.5, 1.45, 1.35), trail: color(0.5, 0.45, 0.4), light: new THREE.Color(0xfff0dc) },
];

/** The jet's length at full throttle and length 1 (units, 10 m), the share it keeps idling (a pilot flame) and how much longer an overdrive's shove draws it out. */
const FLAME_LENGTH = 200;
const IDLE_LENGTH = 0.3;
const SHOVE_LENGTH = 1.6;
/** How bright the jet idles, against full throttle. */
const IDLE_STRENGTH = 0.25;
/** Within this distance of the camera (units, 10 m) the jet fades out, gone at a third of it. */
const NEAR = 200;
/** How far the jet narrows towards its tail, and how deep a shock diamond pinches it. */
const TAPER = 0.3;
const PINCH = 0.15;

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERTEX = /* glsl */ `
  attribute float along;
  attribute vec3 mouth;
  uniform float reach;
  uniform float diamonds;
  varying float vAlong;
  varying float vFacing;
  varying float vDepth;
  void main() {
    vAlong = along;
    // the cone's ring at the mouth, narrowed towards the tail and pinched between its diamonds
    float wave = 0.5 + 0.5 * cos((along * diamonds - 0.5) * 6.2832);
    float width = mix(1.0, ${TAPER.toFixed(2)}, along) * (1.0 - ${PINCH.toFixed(2)} * step(0.5, diamonds) * (1.0 - wave) * (1.0 - along));
    vec3 p = vec3(mouth.xy + (position.xy - mouth.xy) * width, mouth.z + along * reach);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vec3 normalView = normalize(normalMatrix * normal);
    vFacing = abs(dot(normalView, normalize(-view.xyz)));
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 core;
  uniform vec3 edge;
  uniform float strength;
  uniform float diamonds;
  uniform float time;
  varying float vAlong;
  varying float vFacing;
  varying float vDepth;
  void main() {
    float fall = 1.0 - vAlong;
    // thick seen through its middle, soft at its rim
    float body = vFacing * vFacing * vFacing;
    // the shock diamonds: small bright knots standing in the jet's core
    float knot = diamonds > 0.5 ? pow(0.5 + 0.5 * cos((vAlong * diamonds - 0.5) * 6.2832), 12.0) * fall * body : 0.0;
    float flicker = 0.9 + 0.1 * sin(time * 47.0 + vAlong * 23.0) * sin(time * 31.0);
    // white-hot at the mouth and in the knots, the mix's color along the rest
    float hot = clamp(body * pow(fall, 4.0) + knot * 1.5, 0.0, 1.0);
    vec3 c = mix(edge, core, hot);
    float a = strength * (body * pow(fall, 1.2) + knot) * flicker * smoothstep(${(NEAR * 0.3).toFixed(1)}, ${NEAR.toFixed(1)}, vDepth);
    // light added onto the picture; its alpha as bright as it is, so on the title screen's
    // see-through pad it shows over the scene behind instead of covering it
    vec3 light = c * a;
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

/**
 * The jets' cones of a hull's nozzles: rings from the mouth (along 0) to the tail (along 1). Their
 * buffers are made once per set of nozzles and shared; each ship's jets are a geometry of their
 * own over them, so their bounds follow how far its jets reach (see FlameLook.burn).
 */
const cones = new Map<string, THREE.BufferGeometry>();

function jets(nozzles: readonly Nozzle[]): THREE.BufferGeometry {
  const key = JSON.stringify(nozzles);
  const kept = cones.get(key);
  if (kept) return share(kept);
  const radial = 16;
  const rings = 24;
  const position: number[] = [];
  const normal: number[] = [];
  const along: number[] = [];
  const mouth: number[] = [];
  const index: number[] = [];
  for (const nozzle of nozzles) {
    const first = position.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      // every ring lies at the mouth: the shader moves it back along the jet and scales it
      for (let k = 0; k <= radial; k++) {
        const angle = (k / radial) * Math.PI * 2;
        const c = cos(angle);
        const s = sin(angle);
        position.push(nozzle.x + c * nozzle.r, nozzle.y + s * nozzle.r, nozzle.z);
        normal.push(c, s, 0);
        along.push(ring / rings);
        mouth.push(nozzle.x, nozzle.y, nozzle.z);
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let k = 0; k < radial; k++) {
        const a = first + ring * (radial + 1) + k;
        const b = a + radial + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('mouth', new THREE.Float32BufferAttribute(mouth, 3));
  geometry.setIndex(index);
  // the mouths' bounds; FlameLook.burn moves its far side out as far as the jets reach
  const box = new THREE.Box3();
  for (const nozzle of nozzles) box.expandByPoint(new THREE.Vector3(nozzle.x - nozzle.r, nozzle.y - nozzle.r, nozzle.z)).expandByPoint(new THREE.Vector3(nozzle.x + nozzle.r, nozzle.y + nozzle.r, nozzle.z));
  geometry.boundingBox = box;
  cones.set(key, geometry);
  return share(geometry);
}

/** A geometry of its own over another's buffers (drawn from the same buffers on the GPU), with bounds of its own. */
function share(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  geometry.boundingBox = source.boundingBox!.clone();
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

let glowTexture: THREE.Texture | null = null;

/**
 * The glow at the nozzles of an upgraded drive: a round, soft light of plain white on black for
 * additive blending, so the look's tint (`glow`) shows as it is; made once, and only where a page
 * can draw it (null in Node).
 */
export function brightGlow(): THREE.Texture | null {
  if (!glowTexture && typeof document !== 'undefined') {
    glowTexture = radialTexture([
      [0, '#ffffff'],
      [0.1, '#a0a0a0'],
      [0.35, '#303030'],
      [0.7, '#080808'],
      [1, '#000000'],
    ]);
  }
  return glowTexture;
}

export class FlameLook {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    core: { value: new THREE.Color() },
    edge: { value: new THREE.Color() },
    strength: { value: 0 },
    reach: { value: 0 },
    diamonds: { value: 0 },
    time: { value: 0 },
  };
  private level: FlameLevel = FLAMES[0];

  constructor(nozzles: readonly Nozzle[]) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      forceSinglePass: true,
    });
    this.mesh = new THREE.Mesh(jets(nozzles), material);
    this.mesh.name = 'flameJet';
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** The look's step: its colors and diamonds (stock draws no jet). */
  wear(step: number) {
    this.level = FLAMES[step];
    this.uniforms.core.value.copy(this.level.core);
    this.uniforms.edge.value.copy(this.level.edge);
    this.uniforms.diamonds.value = this.level.diamonds;
  }

  /** Burns at a throttle (0..1) with a shove's share left (0..1), at `time` (s) for its flicker; hidden on a stock drive, a dead one or out of sight. */
  burn(throttle: number, shove: number, time: number, shown: boolean) {
    const length = this.level.length;
    this.mesh.visible = shown && length > 0;
    if (!this.mesh.visible) return;
    const draw = 1 + (SHOVE_LENGTH - 1) * shove;
    const reach = FLAME_LENGTH * length * (IDLE_LENGTH + (1 - IDLE_LENGTH) * throttle) * draw;
    this.uniforms.reach.value = reach;
    // its bounds reach as far as the jets do, for the frustum's culling and the title pad's frame
    const { boundingBox: box, boundingSphere: sphere } = this.mesh.geometry;
    if (box && sphere && !box.isEmpty()) {
      box.max.z = box.min.z + reach;
      box.getBoundingSphere(sphere);
    }
    this.uniforms.strength.value = (IDLE_STRENGTH + (1 - IDLE_STRENGTH) * throttle) * (1 + 0.5 * shove);
    if (!still) this.uniforms.time.value = time;
  }
}
