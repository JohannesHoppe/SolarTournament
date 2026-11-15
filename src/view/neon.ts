import * as THREE from 'three';

/**
 * The neon trim's light as the hangar's look makes it (see game/hangar, `neon`; the tubes and
 * their rails are built in ship/models, lightStrips): tubes of tinted white burning in the
 * pilot's tint, a soft spill of their light on the hull around them, now and then a tube that
 * buzzes and dips as old neon does, and a light chasing along them towards the stern: slowly on
 * the third step, fast and bright for every step while an overdrive's shove burns. Every tube of
 * every step is one mesh in one draw call: each vertex knows the step it comes with (`tier`) and
 * the shader leaves out what a ship has not bought. Flicker and the chase stand still with
 * reduced motion.
 */

/** How bright the tubes burn by the steps of the look: brighter with each, blooming from the first. */
const BRIGHTNESS = [0, 1.6, 2, 2.4];
/** How bright the spill on the hull is against its tube. */
const SPILL = 0.9;
/** The chase light: pulses on a tube's length at once, how many lengths they run a second on the third step and during a shove. */
const PULSES = 2;
const RUN = 0.5;
const SHOVE_RUN = 3;

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
    // a tube of a step not bought: out of the picture, its triangles fall away
    gl_Position = tier > level ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 tint;
  uniform float brightness;
  uniform float phase;
  uniform float chase;
  uniform float shove;
  uniform float time;
  varying float vAlong;
  varying float vAcross;
  varying float vSeed;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    // the chase light: a pulse with a short front and a long tail behind it, running towards the stern
    float d = fract(vAlong * ${PULSES.toFixed(1)} - phase) - 0.75;
    float pulse = d > 0.0 ? exp(-(d / 0.04) * (d / 0.04)) : exp(d / 0.12);
    float light = mix(1.0, 0.6 + 0.6 * pulse, chase) + shove * 1.5 * pulse;
    // old neon: a tube now and then buzzes and dips for a moment
    float buzz = hash(floor(time * 14.0) + vSeed * 91.7);
    light *= buzz > 0.985 ? 0.35 : 1.0;
    // the tube a tinted white, its spill on the hull the tint alone, falling off across it
    float spill = abs(vAcross);
    vec3 tube = tint + 0.25;
    vec3 c = (spill > 0.0 ? tint * ${SPILL.toFixed(2)} * exp(-spill * spill * 4.0) : tube) * brightness * light;
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
      // the spill lies on the hull: pulled towards the camera, so it never fights the plates
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  /** The look's step and the pilot's tint. */
  wear(step: number, tint: THREE.Color) {
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
