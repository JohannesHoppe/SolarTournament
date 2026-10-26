import * as THREE from 'three';
import { bandsVertex, fbm, noise3 } from './landmarks';
import { FLARE_RADIUS } from '../game/survival';

/**
 * How the solar flare's plasma looks (see game/survival for where it is): a sphere of roiling
 * fire, darker red where it is thin, orange where it boils, white-hot filaments and tongues of
 * flame twisting through it; seen edge on, at its front, it glows brightest. It is added onto the
 * picture, and a ship inside sees fire all around.
 */
const fragment = /* glsl */ `
  uniform float time;
  uniform float strength;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  ${noise3}
  ${fbm}
  void main() {
    // features of about 350 m on the 13.5 km sphere, boiling and drifting
    vec3 p = normalize(vLocal) * 40.0;
    float roil = fbm(p + vec3(0.0, time * 0.15, time * 0.1), 1.0);
    float warp = fbm(p * 1.7 + roil * 2.0 - vec3(time * 0.2), 1.0);
    // filaments: the ridges of a warped noise, thin and white-hot
    float filaments = pow(1.0 - abs(noise(p * 6.0 + warp * 3.0) * 2.0 - 1.0), 6.0);
    vec3 color = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.04), smoothstep(0.25, 0.75, warp));
    color = mix(color, vec3(1.0, 0.9, 0.7), filaments * 0.8);
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    // seen up close the sphere fills the sky, nearly all of it at a slant: only its very rim glows
    // clamped: rounding can carry facing a hair over 1, and pow() of a negative base is undefined
    float edge = pow(max(1.0 - facing, 0.0), 6.0);
    float glow = strength * (0.2 + 0.6 * warp + 0.5 * filaments) * (0.6 + 0.8 * edge);
    gl_FragColor = vec4(color * glow * 1.3, 1.0);
  }
`;

export class FlareView {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { time: { value: 0 }, strength: { value: 0 } };
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: bandsVertex,
      fragmentShader: fragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(FLARE_RADIUS, 128, 64), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * The plasma at `center`, as strong as `strength` (0 hidden, 1 full), seen from `eye`; `time`
   * (s) lets it boil. Only the near surface is drawn: its far side lies beyond the camera's reach
   * and would cut a disk into the picture.
   */
  show(center: THREE.Vector3, strength: number, time: number, eye: THREE.Vector3) {
    this.mesh.visible = strength > 0;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(center);
    this.material.side = eye.distanceTo(center) < FLARE_RADIUS ? THREE.BackSide : THREE.FrontSide;
    this.uniforms.strength.value = strength;
    this.uniforms.time.value = time;
  }

  hide() {
    this.mesh.visible = false;
  }
}
