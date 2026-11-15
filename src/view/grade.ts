import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

type Rgb = readonly [number, number, number];

/**
 * An arena's color grade, applied to the tone-mapped picture before it is encoded for the
 * screen, in linear light: `saturation` (1 leaves the colors, less washes them towards grey),
 * then `gain` (the picture's tint, multiplied in; 1, 1, 1 for none) and `lift` (a color added
 * in the shadows, fading out towards white; 0, 0, 0 for none).
 */
export interface Grade {
  gain: Rgb;
  lift: Rgb;
  saturation: number;
}

/** The grade in GLSL, on the tone-mapped color, right before the screen's encoding. No channel leaves it below 0: the encoding raises to a power, undefined for a negative base. */
const GRADE_GLSL = /* glsl */ `
  {
    vec3 graded = gl_FragColor.rgb;
    graded = max(mix(vec3(dot(graded, vec3(0.2126, 0.7152, 0.0722))), graded, gradeSaturation), 0.0);
    gl_FragColor.rgb = max(graded * gradeGain + gradeLift * (1.0 - graded), 0.0);
  }
`;

/** Where the grade goes into three.js's output shader: before its color space encoding. */
const MARK = '// color space';
/** Where the bloom goes in: on the picture's light as read, before the tone mapping. */
const READ = 'gl_FragColor = texture2D( tDiffuse, vUv );';

/**
 * The output pass (tone mapping and the screen's encoding) with the bloom's glow added to the
 * picture (see view/bloom) and the arena's grade in the same shader: no pass of their own, a few
 * operations per pixel.
 */
export class GradedOutputPass extends OutputPass {
  constructor() {
    super();
    const shader = this.material.fragmentShader;
    if (!shader.includes(MARK)) throw new Error('The output shader has no place for the grade');
    if (!shader.includes(READ)) throw new Error('The output shader has no place for the bloom');
    this.uniforms.tBloom = { value: null };
    this.uniforms.bloomOn = { value: 0 };
    this.uniforms.gradeGain = { value: new THREE.Vector3(1, 1, 1) };
    this.uniforms.gradeLift = { value: new THREE.Vector3() };
    this.uniforms.gradeSaturation = { value: 1 };
    this.material.fragmentShader = shader
      .replace('varying vec2 vUv;', 'varying vec2 vUv;\nuniform sampler2D tBloom;\nuniform float bloomOn;\nuniform vec3 gradeGain;\nuniform vec3 gradeLift;\nuniform float gradeSaturation;')
      .replace(READ, `${READ}\nif (bloomOn > 0.0) gl_FragColor.rgb += texture2D(tBloom, vUv).rgb;`)
      .replace(MARK, `${GRADE_GLSL}\n${MARK}`);
  }

  /** The bloom's glow to add (see view/bloom), null for none. */
  setBloom(glow: THREE.Texture | null) {
    this.uniforms.tBloom.value = glow;
    this.uniforms.bloomOn.value = glow ? 1 : 0;
  }

  set(grade: Grade) {
    this.uniforms.gradeGain.value.fromArray(grade.gain);
    this.uniforms.gradeLift.value.fromArray(grade.lift);
    this.uniforms.gradeSaturation.value = grade.saturation;
  }
}

/** What the grade makes of a color in linear light, the shader's arithmetic (for the tests); written into `color`. */
export function gradeColor(grade: Grade, color: THREE.Color): THREE.Color {
  const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  (['r', 'g', 'b'] as const).forEach((channel, i) => {
    const c = Math.max(luma + (color[channel] - luma) * grade.saturation, 0);
    color[channel] = Math.max(c * grade.gain[i] + grade.lift[i] * (1 - c), 0);
  });
  return color;
}
