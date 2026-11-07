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
 * The plumes' grains on the full picture (fewer on a cheaper one, see Landmarks.setGrains), shared
 * among the vents; every HAZE_EVERY-th of them a faint, wide puff of vapor instead of a grain. A
 * grain rises at RISE (units/s, 40 m/s, a jet's vapor is far faster but the grains it carries
 * fall back), crossing its plume in some 75 s.
 */
export const PLUME_GRAINS = 9000;
const HAZE_EVERY = 6;
const RISE = 800;
/** A grain's size (units, 2 m) and how large it may grow on screen (device px); a puff's size (units, 120 m) and its cap. */
const GRAIN_SIZE = 40;
const GRAIN_PIXELS = 5;
const PUFF_SIZE = 2400;
const PUFF_PIXELS = 220;

const plumeVertex = /* glsl */ `
  attribute vec4 seed;
  attribute vec3 vent;
  uniform float time;
  uniform float viewport;
  varying float vShade;
  varying float vPuff;
  void main() {
    float s = fract(seed.x + time * ${(RISE / PLUME_REACH).toFixed(6)});
    // spread over the plume's round section, winding slowly as it rises
    float turn = seed.y * 6.2832 + s * 2.0;
    float out = sqrt(seed.z) * mix(${PLUME_START.toFixed(1)}, ${PLUME_END.toFixed(1)}, s) * 0.8;
    vec3 at = vent + vec3(cos(turn) * out, s * ${PLUME_REACH.toFixed(1)}, sin(turn) * out);
    vec4 view = modelViewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * view;
    vPuff = seed.w;
    float size = vPuff > 0.5 ? ${PUFF_SIZE.toFixed(1)} : ${GRAIN_SIZE.toFixed(1)};
    float pixels = size * projectionMatrix[1][1] * viewport * 0.5 / -view.z;
    gl_PointSize = clamp(pixels, 1.5, vPuff > 0.5 ? ${PUFF_PIXELS.toFixed(1)} : ${GRAIN_PIXELS.toFixed(1)});
    // a grain smaller than its point keeps its light, spread thinner, so it never twinkles
    float thin = min(1.0, pixels / gl_PointSize);
    vShade = (1.0 - s) * (1.0 - s) * smoothstep(0.0, 0.02, s) * (vPuff > 0.5 ? 0.07 : 0.9 * max(thin, 0.25));
  }
`;

const plumeFragment = /* glsl */ `
  uniform vec3 light;
  varying float vShade;
  varying float vPuff;
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float d = dot(at, at) * 4.0;
    float shape = vPuff > 0.5 ? exp(-d * 2.5) * (1.0 - d) : 1.0 - smoothstep(0.25, 1.0, d);
    if (shape <= 0.0) discard;
    // the grains scatter the sun forward, a little bluer than it shines
    gl_FragColor = vec4(light * vec3(0.85, 0.94, 1.08) * shape * vShade, 1.0);
  }
`;

/** The plumes over the vents, one draw call: each grain's vent, where it starts on its way up and where across. `light` is the sun's color. */
export function plumes(light: THREE.Color): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const r = new Randomizer(10009);
  const seeds = new Float32Array(PLUME_GRAINS * 4);
  const vents = new Float32Array(PLUME_GRAINS * 3);
  for (let i = 0; i < PLUME_GRAINS; i++) {
    seeds.set([r.nextFloat(), r.nextFloat(), r.nextFloat(), i % HAZE_EVERY === 0 ? 1 : 0], i * 4);
    VENTS[i % VENTS.length].toArray(vents, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  // the points lie where the shader puts them; the attribute only sizes the draw
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLUME_GRAINS * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('vent', new THREE.BufferAttribute(vents, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, viewport: { value: 1000 }, light: { value: light } },
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.shadowless = true;
  return points;
}
