import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * The black hole bends light: a pass over the rendered picture that moves every pixel around
 * the hole as a gravitational lens would. A source at angle β from the hole shows at θ with
 * β = θ − θE²/θ: the stars and the disk behind it wrap around into a ring (the Einstein ring,
 * θE), a mirrored image shows inside it, and the middle stays black: the hole's shadow. What
 * lies in front of the hole (by the depth) is neither bent nor lent to the bent picture.
 */
const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** The scene's depth, and the hole's depth in it: only what lies behind the hole is bent. */
    tDepth: { value: null as THREE.Texture | null },
    holeDepth: { value: 1 },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    aspect: { value: 1 },
    /** The Einstein ring and the shadow, as shares of the screen height. */
    ring: { value: 0 },
    shadow: { value: 0 },
    /** How many steps the ray is marched outward looking for its source (see Look.lens, view/quality): fewer leaves the bend coarser, never unbent. */
    samples: { value: 6 },
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
    uniform sampler2D tDepth;
    uniform float holeDepth;
    uniform vec2 center;
    uniform float aspect;
    uniform float ring;
    uniform float shadow;
    uniform int samples;
    varying vec2 vUv;
    void main() {
      // a ship or rock in front of the hole is seen as it is
      if (texture2D(tDepth, vUv).x < holeDepth) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 d = (vUv - center) * vec2(aspect, 1.0);
      float theta = length(d);
      if (theta < shadow) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      float beta = theta - ring * ring / theta;
      vec2 along = (d / theta) / vec2(aspect, 1.0);
      // the lens bends only light from behind the hole: where a ship or rock in front of it
      // covers the source, the light is looked for a little farther out on the same ray, and
      // where none is found the pixel shows unbent; so nothing near is ever seen twice
      vec4 color = texture2D(tDiffuse, vUv);
      for (int i = 0; i < 6; i++) {
        if (i >= samples) break;
        vec2 source = clamp(center + along * beta * (1.0 + 0.2 * float(i)), 0.0, 1.0);
        if (texture2D(tDepth, source).x >= holeDepth) {
          color = texture2D(tDiffuse, source);
          break;
        }
      }
      // the light that grazes the shadow piles up into a thin bright ring
      // squared by hand: GLSL ES leaves pow() of a negative base undefined (NaN on some GPUs)
      float ring = (theta - shadow * 1.05) / (shadow * 0.08 + 0.0005);
      float photon = exp(-ring * ring);
      gl_FragColor = color + vec4(vec3(1.0, 0.75, 0.45) * photon * 0.8, 0.0);
    }
  `,
};

const projected = new THREE.Vector3();
const toHole = new THREE.Vector3();
const forward = new THREE.Vector3();

export class Lensing {
  readonly pass = new ShaderPass(shader);

  constructor() {
    this.pass.enabled = false;
  }

  /** The picture's quality (see view/quality, Look.lens): how many steps the ray marches outward for its source. */
  setSamples(samples: number) {
    this.pass.uniforms.samples.value = samples;
  }

  /**
   * Aims the lens at a hole of the given horizon radius (units), seen by the camera; null
   * switches it off. The ring grows as the hole comes closer.
   */
  update(camera: THREE.PerspectiveCamera, hole: THREE.Vector3 | null, horizon: number, depth: THREE.Texture | null) {
    if (!hole) {
      this.pass.enabled = false;
      return;
    }
    toHole.subVectors(hole, camera.position);
    const distance = toHole.length();
    camera.getWorldDirection(forward);
    // behind the camera there is nothing to bend on screen
    if (toHole.dot(forward) <= 0) {
      this.pass.enabled = false;
      return;
    }
    projected.copy(hole).project(camera);
    const uniforms = this.pass.uniforms;
    uniforms.center.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    uniforms.tDepth.value = depth;
    uniforms.holeDepth.value = projected.z * 0.5 + 0.5;
    // the picture's own shape: a camera showing a cut of a wider view (the menu's preview) has the wider one's aspect
    uniforms.aspect.value = camera.view?.enabled ? camera.view.width / camera.view.height : camera.aspect;
    // the hole's angular radius as a share of the screen height
    const angular = Math.atan(horizon / distance) / THREE.MathUtils.degToRad(camera.fov);
    uniforms.shadow.value = angular * 1.3;
    uniforms.ring.value = angular * 2.4;
    this.pass.enabled = true;
  }
}
