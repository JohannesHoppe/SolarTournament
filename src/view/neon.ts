import * as THREE from 'three';

/**
 * The neon trim's light as the hangar's look makes it (see game/hangar, `neon`; the stripes are
 * laid on the hull in ship/models, racingStripes): racing stripes down the top of the hull from
 * nose to stern, glowing in the pilot's tint, a little brighter and whiter along their edges as
 * neon is, now and then a stripe that buzzes and dips as old neon does, and a light chasing along
 * them towards the stern: slowly on the third step, fast and bright for every step while an
 * overdrive's shove burns. The stripes of every step are one mesh in one draw call: each vertex
 * knows the step it belongs to (`tier`) and the shader leaves out every other step's. Flicker and
 * the chase stand still with reduced motion.
 */

/** How bright the stripes burn by the steps of the look: blooming from the first. */
const BRIGHTNESS = [0, 1.2, 1.3, 1.4];
/** The chase light: pulses on the ship's length at once, how many lengths they run a second on the third step and during a shove. */
const PULSES = 2;
const RUN = 0.5;
const SHOVE_RUN = 3;
/** The share of a fourteenth of a second a stripe burns steady through, the rest it dips: rarely, and on a worn trim four times as often. */
const STEADY = 0.985;
const WORN_STEADY = 0.94;

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERTEX = /* glsl */ `
  attribute float tier;
  attribute float along;
  attribute float across;
  attribute float seed;
  uniform float level;
  varying float vAlong;
  varying float vAcross;
  varying float vSeed;
  void main() {
    vAlong = along;
    vAcross = across;
    vSeed = seed;
    // a stripe of another step: out of the picture, its triangles fall away
    gl_Position = abs(tier - level) > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 tint;
  uniform float brightness;
  uniform float phase;
  uniform float chase;
  uniform float shove;
  uniform float time;
  uniform float steady;
  varying float vAlong;
  varying float vAcross;
  varying float vSeed;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    // the chase light: a pulse with a short front and a long tail behind it, running towards the stern
    float d = fract(vAlong * ${PULSES.toFixed(1)} - phase) - 0.75;
    float pulse = d > 0.0 ? exp(-(d / 0.04) * (d / 0.04)) : exp(d / 0.12);
    float light = mix(1.0, 0.6 + 0.6 * pulse, chase) + shove * 1.5 * pulse;
    // old neon: a stripe now and then buzzes and dips for a moment
    float buzz = hash(floor(time * 14.0) + vSeed * 91.7);
    light *= buzz > steady ? 0.35 : 1.0;
    // the stripe in the tint, its edges brighter and whiter, as a neon tube's outline
    float edge = smoothstep(0.7, 1.0, abs(vAcross));
    vec3 c = (tint * (0.75 + 0.5 * edge) + 0.3 * edge) * brightness * light;
    // light added onto the picture; its alpha as bright as it is, so on the title screen's
    // see-through pad it shows over the scene behind instead of covering it
    gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
  }
`;

export class NeonLook {
  readonly material: THREE.ShaderMaterial;
  private readonly uniforms = {
    tint: { value: new THREE.Color() },
    level: { value: 0 },
    brightness: { value: 0 },
    phase: { value: 0 },
    chase: { value: 0 },
    shove: { value: 0 },
    time: { value: 0 },
    steady: { value: STEADY },
  };
  private run = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      toneMapped: false,
      forceSinglePass: true,
      side: THREE.DoubleSide,
      // the stripes lie on the hull: pulled towards the camera, so they never fight the plates
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  /** The look's step, the pilot's tint, and whether the stripes are worn (a hand-laid trim's, buzzing far more often). */
  wear(step: number, tint: THREE.Color, worn: boolean) {
    this.uniforms.steady.value = worn ? WORN_STEADY : STEADY;
    this.uniforms.level.value = step;
    this.uniforms.brightness.value = BRIGHTNESS[step];
    this.uniforms.chase.value = step >= 3 ? 1 : 0;
    this.uniforms.tint.value.copy(tint);
  }

  /** Moves the chase light on by `dt` (s), fast with a shove's share left (0..1); at `time` (s) for the buzz. */
  burn(dt: number, shove: number, time: number) {
    this.uniforms.shove.value = shove;
    if (still) return;
    this.run = (this.run + dt * (RUN + (SHOVE_RUN - RUN) * shove) * PULSES) % 1;
    this.uniforms.phase.value = this.run;
    this.uniforms.time.value = time;
  }
}
