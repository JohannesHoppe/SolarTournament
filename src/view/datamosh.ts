import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/**
 * The clone dies and its video stream loses every key frame: the last picture from the
 * cockpit stays and rots. A video codec mostly sends motion (where each 16-pixel block of the
 * picture before moves) and what changed (the residual); without a key frame, the motion and
 * the changes of the new pictures are laid onto the old one. Here the camera's turn gives each
 * block its motion vector, each block adds a crooked drift of its own, and what changes from
 * frame to frame (the explosion, the kill cam's ships) burns in as a residual. A cut of the
 * camera sends no residual, so the old picture lives on in the new place. Blocks with a fresh
 * key come back, more and more, until the picture is clean.
 */
const MoshShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** The clean picture of the frame before, for the residual. */
    tPrevious: { value: null as THREE.Texture | null },
    /** The rotting picture as it was shown last frame. */
    tMosh: { value: null as THREE.Texture | null },
    /** The camera's turn since the last frame: from a view ray now to the same ray before. */
    turn: { value: new THREE.Matrix3() },
    /** Half the view's width and height at depth 1. */
    lens: { value: new THREE.Vector2(1, 1) },
    /** How far each block drifts on its own this frame (pixels). */
    drift: { value: 0 },
    /** The share of blocks that get a fresh key this frame. */
    refresh: { value: 0 },
    /** 1 on a camera cut: the frame brings no residual. */
    cut: { value: 0 },
    seed: { value: 0 },
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
    uniform sampler2D tPrevious;
    uniform sampler2D tMosh;
    uniform mat3 turn;
    uniform vec2 lens;
    uniform float drift;
    uniform float refresh;
    uniform float cut;
    uniform float seed;
    uniform vec2 resolution;
    varying vec2 vUv;

    const float BLOCK = 16.0;

    // changes every frame
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed * 43.17) * 43758.5453);
    }

    // the same for a block as long as the picture rots
    float fixedHash(vec2 p) {
      return fract(sin(dot(p, vec2(39.3468, 11.135))) * 24634.6345);
    }

    void main() {
      vec2 block = floor(vUv * resolution / BLOCK);
      vec2 center = (block + 0.5) * BLOCK / resolution;
      // one motion vector per block, like a codec's: where the block's view ray pointed before
      vec3 before = turn * vec3((center * 2.0 - 1.0) * lens, -1.0);
      vec2 from = before.z < 0.0 ? (before.xy / -before.z / lens) * 0.5 + 0.5 : center;
      vec2 motion = from - center + (vec2(fixedHash(block), fixedHash(block + 17.0)) - 0.5) * drift / resolution;
      vec3 now = texture2D(tDiffuse, vUv).rgb;
      vec3 mosh = texture2D(tMosh, vUv + motion).rgb;
      // what changed since the last frame lands on the old picture
      mosh += (now - texture2D(tPrevious, vUv).rgb) * (1.0 - cut);
      if (hash(block) < refresh) mosh = now;
      gl_FragColor = vec4(clamp(mosh, 0.0, 1.0), 1.0);
    }
  `,
};

/** How long the picture rots after the clone's death (s): through the start of the kill cam. */
const MOSH_SECONDS = 2.2;
/** Each block's own drift (pixels per frame at 60 frames a second), at the start. */
const DRIFT = 6;
/** A turn (rad) or a jump (units) of the camera from one frame to the next that counts as a cut. */
const CUT_ANGLE = 0.3;
const CUT_DISTANCE = 2000;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const relative = new THREE.Quaternion();
const rotation = new THREE.Matrix4();

/** A pass after the picture is finished (before the glitch): the dead clone's last picture rots. */
export class Datamosh extends Pass {
  private readonly quad = new FullScreenQuad(new THREE.ShaderMaterial({ ...MoshShader, uniforms: THREE.UniformsUtils.clone(MoshShader.uniforms) }));
  private readonly copier = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms) }));
  private readonly previous = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly moshes = [new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })];
  private current = 0;
  private startedAt = -Infinity;
  /** The first frame of a mosh freezes the picture instead of rotting it. */
  private fresh = false;
  private readonly lastQuaternion = new THREE.Quaternion();
  private readonly lastPosition = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super();
    this.enabled = false;
  }

  /** The clone dies: its last picture stays and rots. Reduced motion keeps the clean picture. */
  trigger() {
    if (reducedMotion.matches) return;
    this.startedAt = performance.now() / 1000;
    this.fresh = true;
    this.enabled = true;
  }

  /** The next picture is the one that freezes: the kill cam waits for it. */
  get freezing() {
    return this.enabled && this.fresh;
  }

  stop() {
    this.enabled = false;
  }

  /** Switches the pass off once the picture is clean again. */
  update() {
    if (this.enabled && performance.now() / 1000 - this.startedAt >= MOSH_SECONDS) this.enabled = false;
  }

  setSize(width: number, height: number) {
    for (const target of [this.previous, ...this.moshes]) target.setSize(width, height);
    (this.quad.material as THREE.ShaderMaterial).uniforms.resolution.value.set(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number) {
    const camera = this.camera;
    if (this.fresh) {
      this.fresh = false;
      this.copy(renderer, readBuffer.texture, this.moshes[this.current]);
      this.copy(renderer, readBuffer.texture, this.previous);
      this.lastQuaternion.copy(camera.quaternion);
      this.lastPosition.copy(camera.position);
    }
    const uniforms = (this.quad.material as THREE.ShaderMaterial).uniforms;
    const progress = Math.min(1, (performance.now() / 1000 - this.startedAt) / MOSH_SECONDS);
    // frames of 60 a second, so a fast screen rots no faster
    const frames = Math.min(4, deltaTime * 60);
    relative.copy(this.lastQuaternion).invert().multiply(camera.quaternion);
    uniforms.turn.value.setFromMatrix4(rotation.makeRotationFromQuaternion(relative));
    const cut = 2 * Math.acos(Math.min(1, Math.abs(relative.w))) > CUT_ANGLE || camera.position.distanceTo(this.lastPosition) > CUT_DISTANCE;
    uniforms.cut.value = cut ? 1 : 0;
    const height = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    uniforms.lens.value.set(height * camera.aspect, height);
    uniforms.drift.value = DRIFT * frames * (1 - progress);
    // keys come back slowly at first, then the picture heals within the last moments
    uniforms.refresh.value = Math.min(1, (0.003 + 0.25 * progress ** 3) * frames);
    uniforms.seed.value = Math.random() * 1000;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.tPrevious.value = this.previous.texture;
    uniforms.tMosh.value = this.moshes[this.current].texture;
    this.current = 1 - this.current;
    renderer.setRenderTarget(this.moshes[this.current]);
    this.quad.render(renderer);
    this.copy(renderer, this.moshes[this.current].texture, this.renderToScreen ? null : writeBuffer);
    this.copy(renderer, readBuffer.texture, this.previous);
    this.lastQuaternion.copy(camera.quaternion);
    this.lastPosition.copy(camera.position);
  }

  private copy(renderer: THREE.WebGLRenderer, from: THREE.Texture, to: THREE.WebGLRenderTarget | null) {
    (this.copier.material as THREE.ShaderMaterial).uniforms.tDiffuse.value = from;
    renderer.setRenderTarget(to);
    this.copier.render(renderer);
  }
}
