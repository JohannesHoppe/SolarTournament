import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { moonBeyond } from './horizon';
import { Noise } from './noise';
import { Randomizer } from '../random';
import { GROUND_HALF, groundRelief, PLUME_END, PLUME_REACH, PLUME_START, stripeRelief, surfaceHeight, VENTS } from './enceladus';

/**
 * How the Plumes at Enceladus look (where things are in world/enceladus): the ground of the field
 * as the piece it collides as (its relief, see Relief), the crater floor's photograph tinted to
 * Enceladus's white ice, the stripes' troughs a little bluer where fresh ice lines them; the plumes
 * rising from the vents as grains of ice glittering in the sun; and the polar plain beyond, drawn
 * behind everything.
 */

/** Enceladus's ice: almost pure white, the brightest ground in the solar system, lit faintly by Saturn's glow. */
const ENCELADUS_TINT = 0xf4f7fa;
const ENCELADUS_GLOW = 0x4a5058;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/enceladus gives (see reliefGround). */
export const enceladusGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, ENCELADUS_TINT, ENCELADUS_GLOW);

/** Enceladus's colors beyond the field: the plain's white snow of fallen plume grains, the stripes' troughs a little blue and grey, where fresh ice and old dust show. */
const SNOW = new THREE.Color(0.44, 0.46, 0.48);
const TROUGH = new THREE.Color(0.26, 0.3, 0.36);
const drifts = new Noise(10008);

/** The polar plain beyond the field's ground, from 3.4 km out to its horizon some 20 km away, drawn behind everything; the plumes over the field. */
export function enceladus(): THREE.Group {
  const paint = (x: number, z: number, color: THREE.Color) => {
    color.copy(SNOW).multiplyScalar(0.92 + 0.08 * drifts.fractal(x / 30000, 0.2, z / 30000, 2));
    // the troughs: below the plain, the bluer the deeper
    color.lerp(TROUGH, Math.min(1, Math.max(0, -stripeRelief(x, z) / 2400)));
  };
  return moonBeyond(GROUND_HALF.x, 20 * 20000, surfaceHeight, paint, ENCELADUS_GLOW);
}

/**
 * Jets of grains rising from vents (Enceladus's plumes, Triton's geysers), one draw call: GRAINS of
 * them shared among the vents; every HAZE_EVERY-th a faint, wide puff instead of a grain. A grain
 * rises at `rise` (units/s) to `reach` over its vent, the jet widening from `start` to `end` in
 * radius, and leaning along `wind` (units of sideways drift at the top, the jet bent by thin air);
 * bright jets add their light (ice scattering the sun), dark ones cover what is behind (dust).
 */
export interface Jets {
  vents: readonly THREE.Vector3[];
  reach: number;
  start: number;
  end: number;
  rise: number;
  wind: THREE.Vector3;
  dark: boolean;
  /** The grains' tone over the sun's light. */
  tone: THREE.Color;
  seed: number;
}
export const GRAINS = 9000;
const HAZE_EVERY = 6;
/** A grain's size (units, 2 m) and how large it may grow on screen (device px); a puff's size (units, 120 m) and its cap. */
const GRAIN_SIZE = 40;
const GRAIN_PIXELS = 5;
const PUFF_SIZE = 2400;
const PUFF_PIXELS = 220;
/** How much a puff shows at a jet's foot: vapor's faint glow, dust's thicker cover. */
const PUFF_VAPOR = 0.07;
const PUFF_DUST = 0.22;

const jetVertex = /* glsl */ `
  attribute vec4 seed;
  attribute vec3 vent;
  uniform float time;
  uniform float viewport;
  uniform vec4 shape;
  uniform vec3 wind;
  uniform float puff;
  varying float vShade;
  varying float vPuff;
  void main() {
    // shape: reach, start radius, end radius, rise
    float s = fract(seed.x + time * shape.w / shape.x);
    // spread over the jet's round section, winding slowly as it rises, bent along the wind
    float turn = seed.y * 6.2832 + s * 2.0;
    float out = sqrt(seed.z) * mix(shape.y, shape.z, s) * 0.8;
    vec3 at = vent + vec3(cos(turn) * out, s * shape.x, sin(turn) * out) + wind * s * s;
    vec4 view = modelViewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * view;
    vPuff = seed.w;
    float size = vPuff > 0.5 ? ${PUFF_SIZE.toFixed(1)} : ${GRAIN_SIZE.toFixed(1)};
    float pixels = size * projectionMatrix[1][1] * viewport * 0.5 / -view.z;
    gl_PointSize = clamp(pixels, 1.5, vPuff > 0.5 ? ${PUFF_PIXELS.toFixed(1)} : ${GRAIN_PIXELS.toFixed(1)});
    // a grain smaller than its point keeps its light, spread thinner, so it never twinkles
    float thin = min(1.0, pixels / gl_PointSize);
    vShade = (1.0 - s) * (1.0 - s) * smoothstep(0.0, 0.02, s) * (vPuff > 0.5 ? puff : 0.9 * max(thin, 0.25));
  }
`;

const jetFragment = /* glsl */ `
  uniform vec3 light;
  uniform vec3 tone;
  uniform float dark;
  varying float vShade;
  varying float vPuff;
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float d = dot(at, at) * 4.0;
    float shape = vPuff > 0.5 ? exp(-d * 2.5) * (1.0 - d) : 1.0 - smoothstep(0.25, 1.0, d);
    if (shape <= 0.0) discard;
    // a bright jet adds the sun it scatters; a dark one covers, in its own tone, lit a little
    float cover = shape * vShade;
    gl_FragColor = dark > 0.5 ? vec4(light * tone, min(1.0, cover * 4.0)) : vec4(light * tone * cover, 1.0);
  }
`;

/** The jets of `spec` over its vents, one draw call: each grain's vent, where it starts on its way up and where across. `light` is the sun's color. */
export function jets(light: THREE.Color, spec: Jets): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const r = new Randomizer(spec.seed);
  const seeds = new Float32Array(GRAINS * 4);
  const vents = new Float32Array(GRAINS * 3);
  for (let i = 0; i < GRAINS; i++) {
    seeds.set([r.nextFloat(), r.nextFloat(), r.nextFloat(), i % HAZE_EVERY === 0 ? 1 : 0], i * 4);
    spec.vents[i % spec.vents.length].toArray(vents, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  // the points lie where the shader puts them; the attribute only sizes the draw
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRAINS * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('vent', new THREE.BufferAttribute(vents, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      viewport: { value: 1000 },
      light: { value: light },
      shape: { value: new THREE.Vector4(spec.reach, spec.start, spec.end, spec.rise) },
      wind: { value: spec.wind },
      tone: { value: spec.tone },
      dark: { value: spec.dark ? 1 : 0 },
      // a puff of dust covers more than one of vapor shines
      puff: { value: spec.dark ? PUFF_DUST : PUFF_VAPOR },
    },
    vertexShader: jetVertex,
    fragmentShader: jetFragment,
    blending: spec.dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.shadowless = true;
  return points;
}

/** Enceladus's plumes: grains of ice rising at 40 m/s (a jet's vapor is far faster but the grains it carries fall back), crossing a plume in some 75 s, scattering the sun a little bluer than it shines. */
export const ENCELADUS_JETS: Jets = { vents: VENTS, reach: PLUME_REACH, start: PLUME_START, end: PLUME_END, rise: 800, wind: new THREE.Vector3(), dark: false, tone: new THREE.Color(0.85, 0.94, 1.08), seed: 10009 };
