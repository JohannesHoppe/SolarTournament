import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { radialTexture } from './textures';
import { OCTAGON } from '../ship/models';

/**
 * A drive's flame as the hangar's look makes it (see game/hangar, `flame`). The look is a trace
 * emitter mixed into the propellant, as salts color a firework without changing its push: the
 * jet glows in the emitter's lines, and the whole drive shows it: the jet behind each bell, the
 * glow at the nozzles, the drive's light, the plume (view/plume), the exhaust trail and the
 * maneuvering thrusters' gas (view/effects). Stock, the drive burns as the depots fuel it (the
 * model file's flame). The first step burns xenon's blue in a smooth jet; the second argon's
 * violet-pink, its plasma fired in a train of glowing bunches that leave the nozzle and travel
 * back along the jet, widening and fading as they go; the third hydrogen's white-magenta (its
 * Balmer lines, red and violet) in a faster train, and its bells glow with their heat, yellow at
 * the throat to cherry red at the rim, as the burn goes on. How long and bright the jet burns is
 * the main drive's step (more plasma a second); the look only colors and pulses it. Looks only:
 * the push, the heat and every number the game shares stay as they are.
 *
 * One mesh per ship holds both: an open cone per nozzle in additive light, its length, taper and
 * bunches set in the vertex shader (no geometry changes as the throttle moves), and the bells'
 * glowing shells; a single draw call.
 */

/** A ring of a bell's shell: its depth and half its width and height (units), around the nozzle's middle. */
export type BellRing = { z: number; w: number; h: number };
/** A drive's nozzle as the jet starts from it: its mouth's middle (model units), its radius there, and the shells of its bell that glow with heat (inside its liner and over its outside, throat to rim). */
export type Nozzle = { x: number; y: number; z: number; r: number; bell: BellRing[][] };

/** What one step of the look burns like: the jet's core and rim, its train of bunches, its bells' heat, and the colors the rest of the drive takes. */
export type FlameLevel = {
  core: THREE.Color;
  edge: THREE.Color;
  /** Bunches of plasma along the jet at once (0: a smooth jet), and how many leave a nozzle a second. */
  bunches: number;
  rate: number;
  /** Whether its bells glow with the burn's heat. */
  hot: boolean;
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
  { core: color(1, 1, 1), edge: color(1, 1, 1), bunches: 0, rate: 0, hot: false, glow: color(1, 1, 1), glowScale: 1, plume: color(1, 0.4, 0.1), jet: color(1.1, 0.28, 0.5), trail: color(0.2, 0.28, 0.5), light: new THREE.Color(0x88bbff) },
  // xenon: the blue of its ion lines, a smooth jet
  { core: color(0.6, 0.82, 1, 3.2), edge: color(0.1, 0.32, 1, 2.6), bunches: 0, rate: 0, hot: false, glow: color(0.3, 0.6, 1.6), glowScale: 1.3, plume: color(0.12, 0.38, 1.4), jet: color(0.35, 0.62, 1.7), trail: color(0.06, 0.16, 0.7), light: new THREE.Color(0x4d8dff) },
  // argon: violet-pink, fired in bunches
  { core: color(1, 0.82, 1, 3.2), edge: color(0.7, 0.2, 1, 2.6), bunches: 5, rate: 9, hot: false, glow: color(1, 0.45, 1.6), glowScale: 1.6, plume: color(0.8, 0.3, 1.3), jet: color(0.95, 0.5, 1.5), trail: color(0.4, 0.15, 0.6), light: new THREE.Color(0xc070ff) },
  // hydrogen: white-magenta in its Balmer lines, a faster train, the bells glowing with heat
  { core: color(1, 0.92, 1, 4.5), edge: color(1, 0.25, 0.6, 2.6), bunches: 8, rate: 18, hot: true, glow: color(1.8, 0.85, 1.4), glowScale: 2.2, plume: color(1.3, 0.35, 0.7), jet: color(1.1, 0.28, 0.5), trail: color(0.55, 0.18, 0.35), light: new THREE.Color(0xff8ac8) },
];

/**
 * A stock look on an upgraded main drive (and the Sovereign's): the depots' propellant as it is,
 * its jet burning in the model file's flame's own blue-white so the drive's steps show in its
 * length and light; the stock colors everywhere else.
 */
export const STOCK_JET: FlameLevel = {
  ...FLAMES[0],
  core: color(0.8, 0.9, 1, 3),
  edge: color(0.3, 0.45, 1, 2.2),
  glow: color(0.45, 0.62, 1.1),
};

/**
 * The Magpie's drive, as Pim tuned it: the third step's train and hot bells, its emitter burning
 * in the bird's colors, a chalk-white core in a blue-green sheath (its shimmer, #3fe0c4).
 */
export const MAGPIE_FLAME: FlameLevel = {
  ...FLAMES[3],
  core: color(0.92, 1, 0.97, 4.2),
  edge: color(0.05, 0.75, 0.55, 2.6),
  glow: color(0.7, 1.6, 1.4),
  plume: color(0.25, 1.1, 0.85),
  jet: color(0.4, 1.2, 0.95),
  trail: color(0.1, 0.4, 0.32),
  light: new THREE.Color(0x3fe0c4),
};

/**
 * The jet's length at full throttle on a stock main drive (units, 15 m), the share it keeps idling
 * (a pilot flame) and how much longer an overdrive's shove draws it out. Each step of the main
 * drive draws it DRIVE_LENGTH longer and DRIVE_LIGHT brighter (see FlameLook.burn).
 */
const FLAME_LENGTH = 300;
const IDLE_LENGTH = 0.3;
const SHOVE_LENGTH = 1.6;
export const DRIVE_LENGTH = 0.15;
export const DRIVE_LIGHT = 0.2;
/** How bright the jet idles, against full throttle. */
const IDLE_STRENGTH = 0.25;
/** Within this distance of the camera (units, 10 m) the jet fades out, gone at a third of it. */
const NEAR = 200;
/** How far the jet narrows towards its tail, and how much wider a bunch swells than the jet around it, near the mouth and at the tail. */
const TAPER = 0.3;
const SWELL = 0.1;
const SWELL_TAIL = 0.6;
/** How the train runs during an overdrive's shove: this many times faster, with a second train between the bunches. */
const SHOVE_RATE = 2.5;
/** How fast a bell heats to the burn's glow and cools off it (s). */
const HEAT_UP = 3;
const COOL_OFF = 5;

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The train of bunches at `along` of the jet: 1 in a bunch's middle; a second train between them as `dense` rises. */
const BUNCH = /* glsl */ `
  uniform float bunches;
  uniform float travel;
  uniform float dense;
  float bunch(float along) {
    if (bunches < 0.5) return 0.0;
    float a = fract(along * bunches - travel) - 0.5;
    float b = fract(along * bunches - travel + 0.5) - 0.5;
    return max(exp(-a * a / 0.012), dense * exp(-b * b / 0.012));
  }
`;

const VERTEX = /* glsl */ `
  attribute float along;
  attribute float kind;
  attribute vec3 mouth;
  uniform float reach;
  varying float vAlong;
  varying float vKind;
  varying float vFacing;
  varying float vDepth;
  ${BUNCH}
  void main() {
    vAlong = along;
    vKind = kind;
    vec3 p = position;
    if (kind < 0.5) {
      // the cone's ring at the mouth, moved back along the jet, narrowed towards the tail and
      // swelling where a bunch passes, the more the farther it has travelled
      float width = mix(1.0, ${TAPER.toFixed(2)}, along) * (1.0 + mix(${SWELL.toFixed(2)}, ${SWELL_TAIL.toFixed(2)}, along) * bunch(along));
      p = vec3(mouth.xy + (position.xy - mouth.xy) * width, mouth.z + along * reach);
    }
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
  uniform float heat;
  uniform float time;
  varying float vAlong;
  varying float vKind;
  varying float vFacing;
  varying float vDepth;
  ${BUNCH}
  void main() {
    vec3 light;
    if (vKind > 0.5) {
      // a bell glowing with heat: plain thermal light, yellow at the hot throat to cherry red at the rim
      light = mix(vec3(1.6, 0.95, 0.25), vec3(0.7, 0.05, 0.02), vAlong) * heat * (0.6 + 0.4 * vFacing);
    } else {
      float fall = 1.0 - vAlong;
      // thick seen through its middle, soft at its rim
      float body = vFacing * vFacing * vFacing;
      // a pulsed jet glows in its bunches, fading as they travel back; a smooth one all along
      float pulsed = step(0.5, bunches);
      float b = bunch(vAlong) * pow(fall, 0.8);
      float flicker = 0.9 + 0.1 * sin(time * 47.0 + vAlong * 23.0) * sin(time * 31.0);
      float hot = clamp(body * pow(fall, 4.0) + b * 1.2, 0.0, 1.0);
      float a = strength * (body * pow(fall, 1.2) * (1.0 - 0.45 * pulsed) + b * 1.4 * (0.4 + 0.6 * body)) * flicker;
      light = mix(edge, core, hot) * a;
    }
    light *= smoothstep(${(NEAR * 0.3).toFixed(1)}, ${NEAR.toFixed(1)}, vDepth);
    // light added onto the picture; its alpha as bright as it is, so on the title screen's
    // see-through pad it shows over the scene behind instead of covering it
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

/**
 * The jets' cones of a hull's nozzles (rings from the mouth, along 0, to the tail, along 1; kind
 * 0) and their bells' shells (along 0 at the throat to 1 at the rim; kind 1). Their buffers are
 * made once per set of nozzles and shared; each ship's jets are a geometry of their own over them,
 * so their bounds follow how far its jets reach (see FlameLook.burn).
 */
const cones = new Map<string, THREE.BufferGeometry>();

function jets(nozzles: readonly Nozzle[]): THREE.BufferGeometry {
  const key = JSON.stringify(nozzles);
  const kept = cones.get(key);
  if (kept) return share(kept);
  const radial = 16;
  const rings = 40;
  const position: number[] = [];
  const normal: number[] = [];
  const along: number[] = [];
  const kind: number[] = [];
  const mouth: number[] = [];
  const index: number[] = [];
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, a: number, k: number, nozzle: Nozzle) => {
    position.push(x, y, z);
    normal.push(nx, ny, 0);
    along.push(a);
    kind.push(k);
    mouth.push(nozzle.x, nozzle.y, nozzle.z);
    box.expandByPoint(corner.set(x, y, z));
  };
  // rows of `count` + 1 vertices (the last closing the round), joined into quads
  const strip = (first: number, rows: number, count: number) => {
    for (let row = 0; row + 1 < rows; row++) {
      for (let k = 0; k < count; k++) {
        const a = first + row * (count + 1) + k;
        const b = a + count + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  for (const nozzle of nozzles) {
    // the jet: every ring lies at the mouth; the shader moves it back along the jet and scales it
    let first = position.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      for (let k = 0; k <= radial; k++) {
        const angle = (k / radial) * Math.PI * 2;
        const c = cos(angle);
        const s = sin(angle);
        vertex(nozzle.x + c * nozzle.r, nozzle.y + s * nozzle.r, nozzle.z, c, s, ring / rings, 0, nozzle);
      }
    }
    strip(first, rings + 1, radial);
    // the bell's shells, in its own octagon
    for (const shell of nozzle.bell) {
      first = position.length / 3;
      const throat = shell[0].z;
      const rim = shell[shell.length - 1].z;
      for (const ring of shell) {
        for (let k = 0; k <= OCTAGON.length; k++) {
          const [ox, oy] = OCTAGON[k % OCTAGON.length];
          const length = Math.sqrt(ox * ox + oy * oy);
          vertex(nozzle.x + ox * ring.w, nozzle.y + oy * ring.h, ring.z, ox / length, oy / length, (ring.z - throat) / (rim - throat), 1, nozzle);
        }
      }
      strip(first, shell.length, OCTAGON.length);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('kind', new THREE.Float32BufferAttribute(kind, 1));
  geometry.setAttribute('mouth', new THREE.Float32BufferAttribute(mouth, 3));
  geometry.setIndex(index);
  // the bells and the mouths; FlameLook.burn moves the far side out as far as the jets reach
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

/** How much longer and brighter the jet and the flame burn at a main drive's step (see DRIVE_LENGTH, DRIVE_LIGHT). */
export const driveLength = (step: number) => 1 + DRIVE_LENGTH * step;
export const driveLight = (step: number) => 1 + DRIVE_LIGHT * step;

export class FlameLook {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    core: { value: new THREE.Color() },
    edge: { value: new THREE.Color() },
    strength: { value: 0 },
    reach: { value: 0 },
    bunches: { value: 0 },
    travel: { value: 0 },
    dense: { value: 0 },
    heat: { value: 0 },
    time: { value: 0 },
  };
  private level: FlameLevel = FLAMES[0];
  /** Where the jets start (the mouths' depth, units). */
  private readonly mouth: number;

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
    this.mouth = nozzles[0]?.z ?? 0;
  }

  /** The look: its colors and its train (stock draws no jet). */
  wear(level: FlameLevel) {
    this.level = level;
    this.uniforms.core.value.copy(this.level.core);
    this.uniforms.edge.value.copy(this.level.edge);
    this.uniforms.bunches.value = this.level.bunches;
    if (!this.level.hot) this.uniforms.heat.value = 0;
  }

  /**
   * Burns for `dt` (s) at a throttle (0..1) with a shove's share left (0..1), on a main drive of
   * `drive` steps, at `time` (s) for its flicker; hidden on a stock look, a dead drive or out of sight.
   */
  burn(dt: number, throttle: number, shove: number, drive: number, time: number, shown: boolean) {
    const level = this.level;
    // the bells heat with the burn and cool off it, seen or not
    if (level.hot) {
      const heat = this.uniforms.heat.value;
      this.uniforms.heat.value = heat + (throttle - heat) * Math.min(1, dt / (throttle > heat ? HEAT_UP : COOL_OFF));
    }
    this.mesh.visible = shown && level !== FLAMES[0];
    if (!this.mesh.visible) return;
    const draw = 1 + (SHOVE_LENGTH - 1) * shove;
    const reach = FLAME_LENGTH * driveLength(drive) * (IDLE_LENGTH + (1 - IDLE_LENGTH) * throttle) * draw;
    this.uniforms.reach.value = reach;
    // its bounds reach as far as the jets do, for the frustum's culling and the title pad's frame
    const { boundingBox: box, boundingSphere: sphere } = this.mesh.geometry;
    if (box && sphere && !box.isEmpty()) {
      box.max.z = this.mouth + reach;
      box.getBoundingSphere(sphere);
    }
    this.uniforms.strength.value = (IDLE_STRENGTH + (1 - IDLE_STRENGTH) * throttle) * (1 + 0.5 * shove) * driveLight(drive);
    // the train runs faster and denser during a shove; it stands still with reduced motion
    this.uniforms.dense.value = shove;
    if (still) return;
    this.uniforms.travel.value = (this.uniforms.travel.value + dt * level.rate * (1 + (SHOVE_RATE - 1) * shove)) % 1;
    this.uniforms.time.value = time;
  }
}
