import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * The black hole bends light: a pass over the rendered picture that moves every pixel around
 * the hole as a gravitational lens would. A source at angle β from the hole shows at θ with
 * β = θ − θE²/θ: the stars and the disk behind it wrap around into a ring (the Einstein ring,
 * θE), a mirrored image shows inside it, and the middle stays black: the hole's shadow.
 */
const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    aspect: { value: 1 },
    /** The Einstein ring and the shadow, as shares of the screen height. */
    ring: { value: 0 },
    shadow: { value: 0 },
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
    uniform vec2 center;
    uniform float aspect;
    uniform float ring;
    uniform float shadow;
    varying vec2 vUv;
    void main() {
      vec2 d = (vUv - center) * vec2(aspect, 1.0);
      float theta = length(d);
      if (theta < shadow) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      float beta = theta - ring * ring / theta;
      vec2 source = center + (d / theta) * beta / vec2(aspect, 1.0);
      vec4 color = texture2D(tDiffuse, clamp(source, 0.0, 1.0));
      // the light that grazes the shadow piles up into a thin bright ring
      float photon = exp(-pow((theta - shadow * 1.05) / (shadow * 0.08 + 0.0005), 2.0));
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

  /**
   * Aims the lens at a hole of the given horizon radius (units), seen by the camera; null
   * switches it off. The ring grows as the hole comes closer.
   */
  update(camera: THREE.PerspectiveCamera, hole: THREE.Vector3 | null, horizon: number) {
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
    uniforms.aspect.value = camera.aspect;
    // the hole's angular radius as a share of the screen height
    const angular = Math.atan(horizon / distance) / THREE.MathUtils.degToRad(camera.fov);
    uniforms.shadow.value = angular * 1.3;
    uniforms.ring.value = angular * 2.4;
    this.pass.enabled = true;
  }
}
