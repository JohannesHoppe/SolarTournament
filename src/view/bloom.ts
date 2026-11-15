import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/** What glows: the luminance (linear, before the tone mapping) above which a pixel spills its light into the bloom. */
export const BLOOM_THRESHOLD = 0.88;

/**
 * The bloom's levels below its resolution (see Bloom): the first at a quarter of it, each next
 * at half the last's, the deepest at 1/256.
 */
const LEVELS = 7;
/**
 * How much of the light above the threshold each level spills, from the tightest glow to the
 * widest (linear, before the tone mapping; a level's glow sums to its weight). Fitted (least
 * squares, none below 0) to the glow of a bright dot in a blur of five gaussians (σ about 4, 14,
 * 40, 104 and 256 pixels of a full-resolution picture, weighted 1.22 down to 0.94, 5.4 together)
 * at the full and the half resolution: within 12 % of it at every distance out to 800 pixels.
 */
const WEIGHTS = [1.02, 0.78, 0.73, 0.74, 0.74, 0.54, 0.72];

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Into the first level from the picture: nine taps of the picture, each the mean of a block of
 * two by two of its pixels at the bloom's own resolution, each kept only above the threshold (as
 * smoothly as over a hundredth of luminance), weighted as a tent over 6 × 6 pixels.
 */
const prefilter = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, step: { value: new THREE.Vector2() }, threshold: { value: BLOOM_THRESHOLD } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 step;
    uniform float threshold;
    varying vec2 vUv;
    vec3 bright(vec2 offset) {
      vec3 c = texture2D(tDiffuse, vUv + offset * step).rgb;
      return c * smoothstep(threshold, threshold + 0.01, dot(c, vec3(0.2126, 0.7152, 0.0722)));
    }
    void main() {
      vec3 sum = bright(vec2(0.0)) * 4.0
        + (bright(vec2(-1.0, 0.0)) + bright(vec2(1.0, 0.0)) + bright(vec2(0.0, -1.0)) + bright(vec2(0.0, 1.0))) * 2.0
        + bright(vec2(-1.0, -1.0)) + bright(vec2(1.0, -1.0)) + bright(vec2(-1.0, 1.0)) + bright(vec2(1.0, 1.0));
      gl_FragColor = vec4(sum / 16.0, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

/** One level down: the mean of the four texels under the pixel and of four blocks around them (five taps). */
const down = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec3 sum = texture2D(tDiffuse, vUv).rgb * 4.0
        + texture2D(tDiffuse, vUv + vec2(-texel.x, -texel.y)).rgb
        + texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y)).rgb
        + texture2D(tDiffuse, vUv + vec2(-texel.x, texel.y)).rgb
        + texture2D(tDiffuse, vUv + vec2(texel.x, texel.y)).rgb;
      gl_FragColor = vec4(sum / 8.0, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

/** One level up: the level below spread by a tent of nine taps, plus this level's own light by its weight. */
const up = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, tLevel: { value: null }, texel: { value: new THREE.Vector2() }, own: { value: new THREE.Vector2() }, weight: { value: 1 }, below: { value: 1 } },
  vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLevel;
    uniform vec2 texel;
    uniform vec2 own;
    uniform float weight;
    uniform float below;
    varying vec2 vUv;
    void main() {
      vec3 sum = texture2D(tDiffuse, vUv).rgb * 4.0
        + (texture2D(tDiffuse, vUv + vec2(-texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb
          + texture2D(tDiffuse, vUv + vec2(0.0, -texel.y)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb) * 2.0
        + texture2D(tDiffuse, vUv - texel).rgb + texture2D(tDiffuse, vUv + texel).rgb
        + texture2D(tDiffuse, vUv + vec2(-texel.x, texel.y)).rgb + texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y)).rgb;
      vec3 level = texture2D(tLevel, vUv - own).rgb + texture2D(tLevel, vUv + own).rgb
        + texture2D(tLevel, vUv + vec2(-own.x, own.y)).rgb + texture2D(tLevel, vUv + vec2(own.x, -own.y)).rgb;
      gl_FragColor = vec4(sum / 16.0 * below + level * 0.25 * weight, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

function level(name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  return target;
}

/**
 * The bloom: the light above the threshold, blurred into a glow and added to the picture. It is
 * a chain of small textures (a dual filter): the picture's bright light is taken into the first
 * level at a quarter of the bloom's resolution, then halved level by level down to the deepest,
 * each step a small blur of five taps; back up, each level's light by its weight is added to the
 * level below spread by a tent of nine taps, so the tight glow of the first level and the ever
 * wider ones of the deeper levels sum into one glow with a long soft skirt. Every level is drawn
 * once, at a sixteenth of the bloom's pixels or fewer, so its whole cost is a few taps per pixel
 * of the picture. The output pass adds the first level to the picture, spread up to the picture's
 * resolution by the hardware's linear filter (see view/grade), so the bloom writes no pixel of the
 * picture itself.
 *
 * The bloom's resolution is a share of the picture's (see Look.bloom in view/quality): at half
 * the resolution its levels fill a quarter of the pixels, each texel twice as wide, so its glow
 * reaches twice as far on screen and looks a little softer.
 */
export class Bloom extends Pass {
  private scale = 1;
  private readonly full = new THREE.Vector2(1, 1);
  private readonly downs = Array.from({ length: LEVELS }, (_, i) => level(`bloom.down${i}`));
  private readonly ups = Array.from({ length: LEVELS - 1 }, (_, i) => level(`bloom.up${i}`));
  private readonly quad = new FullScreenQuad();
  private readonly clearColor = new THREE.Color();
  /** The level weights (see WEIGHTS), open to experiments in the browser. */
  readonly weights = [...WEIGHTS];

  /** `into` adds the glow to the picture (the output pass, see view/grade). */
  constructor(private readonly into: { setBloom(glow: THREE.Texture | null): void }) {
    super();
    this.needsSwap = false;
    into.setBloom(this.glow);
  }

  /** The glow the output pass adds: the first level on the way back up. */
  get glow(): THREE.Texture {
    return this.ups[0].texture;
  }

  setScale(scale: number) {
    this.scale = scale;
    this.enabled = scale > 0;
    this.into.setBloom(this.enabled ? this.glow : null);
    if (scale > 0) this.setSize(this.full.x, this.full.y);
  }

  setSize(width: number, height: number) {
    this.full.set(width, height);
    let x = Math.max(1, Math.round((width * this.scale) / 4));
    let y = Math.max(1, Math.round((height * this.scale) / 4));
    for (let i = 0; i < LEVELS; i++) {
      this.downs[i].setSize(x, y);
      if (i < LEVELS - 1) this.ups[i].setSize(x, y);
      x = Math.max(1, Math.round(x / 2));
      y = Math.max(1, Math.round(y / 2));
    }
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const oldColor = renderer.getClearColor(this.clearColor).getHex();
    const oldAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      this.quad.material = material;
      renderer.setRenderTarget(target);
      renderer.clear();
      this.quad.render(renderer);
    };

    // the bright light into the first level, its taps a texel of half the bloom's resolution apart
    prefilter.uniforms.tDiffuse.value = readBuffer.texture;
    prefilter.uniforms.step.value.set(2 / (this.full.x * this.scale), 2 / (this.full.y * this.scale));
    draw(prefilter, this.downs[0]);
    for (let i = 1; i < LEVELS; i++) {
      const from = this.downs[i - 1];
      down.uniforms.tDiffuse.value = from.texture;
      down.uniforms.texel.value.set(1 / from.width, 1 / from.height);
      draw(down, this.downs[i]);
    }
    // back up: the deepest level by its weight alone, then each above it
    let below = this.downs[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; i--) {
      up.uniforms.tDiffuse.value = below.texture;
      up.uniforms.texel.value.set(1 / below.width, 1 / below.height);
      up.uniforms.tLevel.value = this.downs[i].texture;
      up.uniforms.own.value.set(0.5 / this.downs[i].width, 0.5 / this.downs[i].height);
      up.uniforms.weight.value = this.weights[i];
      up.uniforms.below.value = i === LEVELS - 2 ? this.weights[LEVELS - 1] : 1;
      draw(up, this.ups[i]);
      below = this.ups[i];
    }

    renderer.setClearColor(oldColor, oldAlpha);
    renderer.autoClear = oldAutoClear;
  }

  dispose() {
    for (const target of [...this.downs, ...this.ups]) target.dispose();
    this.quad.dispose();
  }
}
