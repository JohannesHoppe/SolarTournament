import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * The look of a corrupted JPEG stream, as in Johannes' REVEALED inscriptions: from a random
 * point on, every following 16-pixel block in reading order slides sideways and changes its
 * color, so one broken byte smears the rest of the picture. In a "storm" a horizontal band
 * of the picture also jumps to the top.
 */
const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0 },
    seed: { value: 0 },
    corruptions: { value: 0 },
    slice: { value: new THREE.Vector3() },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float seed;
    uniform float corruptions;
    uniform vec3 slice;
    uniform vec2 resolution;
    varying vec2 vUv;

    const float BLOCK = 16.0;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed * 43.17) * 43758.5453);
    }

    vec3 toYcc(vec3 c) {
      return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(-0.1687, -0.3313, 0.5)), dot(c, vec3(0.5, -0.4187, -0.0813)));
    }

    vec3 toRgb(vec3 y) {
      return vec3(y.x + 1.402 * y.z, y.x - 0.3441 * y.y - 0.7141 * y.z, y.x + 1.772 * y.y);
    }

    void main() {
      if (amount <= 0.0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      // pixel position, measured from the top like an image file
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * resolution;

      // storm: the band [y, y + h) moves to the top, everything above it moves down
      if (slice.x > 0.5) {
        float y = slice.y * resolution.y;
        float h = slice.z * resolution.y;
        if (px.y < h) px.y += y;
        else if (px.y < y + h) px.y -= h;
      }

      float perRow = ceil(resolution.x / BLOCK);
      float rows = ceil(resolution.y / BLOCK);
      vec2 block = floor(px / BLOCK);
      float index = block.y * perRow + block.x;

      float shift = 0.0;
      vec3 dc = vec3(0.0);
      float smear = 0.0;
      for (int i = 0; i < 3; i++) {
        if (float(i) >= corruptions) break;
        float fi = float(i);
        float at = hash(vec2(fi, 1.0)) * perRow * rows;
        if (index >= at) {
          shift += floor((hash(vec2(fi, 2.0)) - 0.5) * perRow * 0.6) * BLOCK;
          dc += (vec3(hash(vec2(fi, 3.0)), hash(vec2(fi, 4.0)), hash(vec2(fi, 5.0))) - 0.5) * vec3(0.5, 0.8, 0.8);
          smear = max(smear, step(0.6, hash(vec2(fi, 6.0))));
        }
      }
      px.x = mod(px.x + shift, resolution.x);

      // broken blocks lose their detail and keep only one averaged color
      vec2 sampleAt = px;
      if (smear > 0.0 && hash(floor(px / BLOCK) + 7.0) < 0.35) sampleAt = (floor(px / BLOCK) + 0.5) * BLOCK;

      // torn scanlines and a color split that grows with the amount
      float line = floor(px.y / 3.0);
      if (hash(vec2(line, 8.0)) < amount * 0.12) sampleAt.x += (hash(vec2(line, 9.0)) - 0.5) * resolution.x * 0.15 * amount;
      vec2 uv = vec2(sampleAt.x / resolution.x, 1.0 - sampleAt.y / resolution.y);
      vec2 split = vec2(0.006 * amount, 0.0);
      vec3 color = vec3(texture2D(tDiffuse, uv + split).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - split).b);

      color = toRgb(toYcc(color) + dc * amount);
      color += (hash(px + 11.0) - 0.5) * 0.15 * amount;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

/** Frames per second of the corruption, like the inscription's frame rate. */
const GLITCH_FPS = 20;
/** Corruptions per frame are drawn from 0..MAX_CORRUPTIONS. */
const MAX_CORRUPTIONS = 3;

/**
 * The video link between the pilot and the clone. Hits and impacts shake the clone, and the
 * picture breaks up for a moment. Every glitch frame draws 0 to 3 corruptions; when the
 * maximum comes up several frames in a row, a storm also rearranges the picture.
 */
export class Glitch {
  readonly pass = new ShaderPass(GlitchShader);
  private until = 0;
  private strength = 0;
  private nextFrame = 0;
  private stormCounter = 0;
  /** Called on every frame with the maximum number of corruptions, for the link's static noise. */
  onStatic: (strength: number) => void = () => {};

  constructor() {
    this.pass.enabled = false;
  }

  setSize(width: number, height: number) {
    this.pass.uniforms.resolution.value.set(width, height);
  }

  /** Breaks the picture up for `duration` seconds; a stronger glitch overrides a weaker one. */
  trigger(strength: number, duration: number) {
    const now = performance.now() / 1000;
    if (now < this.until && strength < this.strength) {
      this.until = Math.max(this.until, now + duration);
      return;
    }
    this.strength = strength;
    this.until = Math.max(this.until, now + duration);
    this.nextFrame = 0;
  }

  update() {
    const now = performance.now() / 1000;
    const active = now < this.until;
    this.pass.enabled = active;
    // the HUD and menus are part of the same video feed (see .glitching in style.css)
    document.body.classList.toggle('glitching', active);
    if (!active) {
      this.stormCounter = 0;
      return;
    }
    if (now < this.nextFrame) return;
    this.nextFrame = now + 1 / GLITCH_FPS;

    const uniforms = this.pass.uniforms;
    const corruptions = Math.floor(Math.random() * (MAX_CORRUPTIONS + 1) * Math.min(1, 0.5 + this.strength));
    this.stormCounter = corruptions === MAX_CORRUPTIONS ? this.stormCounter + 1 : 0;
    uniforms.seed.value = Math.random() * 1000;
    uniforms.corruptions.value = corruptions;
    uniforms.amount.value = this.strength * (0.5 + 0.5 * Math.random());
    const storm = this.stormCounter > 2 || (this.strength >= 1 && Math.random() < 0.3);
    const height = 0.05 + Math.random() * 0.2;
    uniforms.slice.value.set(storm ? 1 : 0, Math.random() * (1 - height), height);
    const style = document.body.style;
    const jolt = corruptions > 0 ? this.strength : 0;
    style.setProperty('--glitch-x', `${((Math.random() - 0.5) * 24 * jolt).toFixed(1)}px`);
    style.setProperty('--glitch-split', `${(1 + 4 * jolt * Math.random()).toFixed(1)}px`);
    style.setProperty('--glitch-hue', `${Math.round((Math.random() - 0.5) * 120 * jolt)}deg`);
    if (corruptions === MAX_CORRUPTIONS) this.onStatic(this.strength);
  }
}
