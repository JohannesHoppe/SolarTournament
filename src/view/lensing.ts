import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DISK_UNIFORMS, HOLE_SHADOW, diskGas } from '../world/landmarks';

/**
 * The black hole bends light: a pass over the rendered picture that moves every pixel around
 * the hole as a gravitational lens would. A source at angle β from the hole shows at θ with
 * β = θ − θE²/θ: the stars and the disk behind it wrap around into a ring (the Einstein ring,
 * θE), a mirrored image shows inside it, and the middle is the hole's shadow. The hole has no
 * mesh, so the disk's far side behind it is in the picture to be bent into the halo over and
 * under the shadow; the shadow is black but for the disk's near side crossing in front of it,
 * its gas summed along each pixel's ray up to the shadow (see world/landmarks, diskGas). What
 * lies in front of the hole (by the depth) is neither bent nor lent to the bent picture.
 *
 * Every angle is measured along each pixel's own ray, around the line to the hole: the shadow
 * and the photon ring are cones about it, so wherever the hole stands, in the middle of the
 * picture, at its edge or beside the camera with only the shadow's rim in view, they keep a
 * round thing's outline as the perspective draws it, black with a crisp edge and the thin
 * bright ring along it.
 */

/** The Einstein ring by the horizon's angle (see Lensing.update): EINSTEIN times it, as HOLE_SHADOW times it is the shadow. */
const EINSTEIN = 2.4;
/**
 * The bend fades out as the hole comes abeam (the cosine of the angle between the camera's
 * axis and the line to the hole, from BEND_FADE down to 0, about 73° to 90°): the light it would
 * bend there comes from beside or behind the camera, out of the picture. The shadow and the
 * photon ring stay, unbent.
 */
const BEND_FADE = 0.3;

const shader = {
  uniforms: {
    ...DISK_UNIFORMS,
    /** Each pixel's ray, for the disk's near side in front of the shadow: the camera's frame, its projection undone, and where it is seen from the hole. */
    cameraWorld: { value: new THREE.Matrix4() },
    projectionInverse: { value: new THREE.Matrix4() },
    eye: { value: new THREE.Vector3() },
    /** A direction back onto the picture (the camera's projection and view), for where a bent ray's source is seen. */
    viewProjection: { value: new THREE.Matrix4() },
    /** The camera's axis in the world, and its near and far planes (units), to read the scene's depth as a distance ahead of it. */
    axis: { value: new THREE.Vector3(0, 0, -1) },
    nearPlane: { value: 1 },
    farPlane: { value: 1000 },
    /** The sphere the shadow is (units): the gas behind it is hidden. */
    shadowRadius: { value: 0 },
    tDiffuse: { value: null as THREE.Texture | null },
    /** The scene's depth: only what lies beyond the hole along a ray is bent. */
    tDepth: { value: null as THREE.Texture | null },
    /** The shadow and the Einstein ring, as the angles they span around the line to the hole (rad). */
    shadowAngle: { value: 0 },
    ringAngle: { value: 0 },
    /** How much of the bend is drawn: 1 with the hole ahead, fading to 0 as it comes abeam (see BEND_FADE). */
    bend: { value: 1 },
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
    uniform float shadowAngle;
    uniform float ringAngle;
    uniform float bend;
    uniform int samples;
    uniform mat4 cameraWorld;
    uniform mat4 projectionInverse;
    uniform mat4 viewProjection;
    uniform vec3 axis;
    uniform float nearPlane;
    uniform float farPlane;
    uniform vec3 eye;
    uniform float shadowRadius;
    varying vec2 vUv;
    ${diskGas}
    // whether what is drawn at uv, seen along the ray r, lies beyond the hole: farther ahead of
    // the camera than the point of r closest to the hole (the sky, never drawn, at the far plane)
    bool beyond(vec2 uv, vec3 r) {
      float ahead = nearPlane * farPlane / (farPlane - (farPlane - nearPlane) * texture2D(tDepth, uv).x);
      return ahead > -dot(r, eye) * dot(r, axis);
    }
    void main() {
      vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
      vec3 rd = normalize((cameraWorld * vec4(view.xyz / view.w, 0.0)).xyz);
      // a ship or rock in front of the hole is seen as it is
      if (!beyond(vUv, rd)) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec3 toHole = -normalize(eye);
      float c = dot(rd, toHole);
      float theta = acos(clamp(c, -1.0, 1.0));
      if (theta < shadowAngle) {
        // black, but for the disk's gas in front of the hole: along the pixel's ray up to the shadow's sphere (or, past its edge, the hole's nearest point)
        float b = dot(eye, rd);
        float h = b * b - dot(eye, eye) + shadowRadius * shadowRadius;
        float far = h > 0.0 ? -b - sqrt(h) : -b;
        float near = diskEntry(eye, rd);
        gl_FragColor = vec4(far > near ? diskGas(eye, rd, near, far) : vec3(0.0), 1.0);
        return;
      }
      // the lens bends only light from beyond the hole: where a ship or rock in front of it
      // covers the source, the light is looked for a little farther out on the same ray, and
      // where none is found (or it lies behind the camera) the pixel shows unbent; so nothing
      // near is ever seen twice
      vec4 color = texture2D(tDiffuse, vUv);
      if (bend > 0.0) {
        float beta = theta - bend * ringAngle * ringAngle / theta;
        vec3 across = normalize(rd - toHole * c);
        for (int i = 0; i < 6; i++) {
          if (i >= samples) break;
          float angle = beta * (1.0 + 0.2 * float(i));
          vec3 r = toHole * cos(angle) + across * sin(angle);
          vec4 clip = viewProjection * vec4(r, 0.0);
          if (clip.w <= 0.0) continue;
          vec2 source = clamp(clip.xy / clip.w * 0.5 + 0.5, 0.0, 1.0);
          if (beyond(source, r)) {
            color = texture2D(tDiffuse, source);
            break;
          }
        }
      }
      // the light that grazes the shadow piles up into a thin bright ring
      // squared by hand: GLSL ES leaves pow() of a negative base undefined (NaN on some GPUs)
      float ring = (theta - shadowAngle * 1.05) / (shadowAngle * 0.08 + 0.0007);
      float photon = exp(-ring * ring);
      gl_FragColor = color + vec4(vec3(1.0, 0.75, 0.45) * photon * 0.8, 0.0);
    }
  `,
};

const toHole = new THREE.Vector3();
const forward = new THREE.Vector3();

/**
 * The angles the lens draws for a hole of horizon `horizon` (units) at `distance` (units), seen
 * through a field of view `fov` (rad, the screen's height): the shadow and the Einstein ring are
 * HOLE_SHADOW and EINSTEIN times the horizon's angle as a share of the field of view, taken as a
 * share of the screen's height in the picture's middle and turned into the angle that spans there.
 */
export function lensAngles(horizon: number, distance: number, fov: number): { shadow: number; ring: number } {
  const share = Math.atan(horizon / distance) / fov;
  const middle = 2 * Math.tan(fov / 2);
  return { shadow: Math.atan(middle * share * HOLE_SHADOW), ring: Math.atan(middle * share * EINSTEIN) };
}

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
   * switches it off. The ring grows as the hole comes closer. Off too while the hole lies so far
   * beside or behind the camera that neither its bend nor its shadow and photon ring reach into
   * the picture.
   */
  update(camera: THREE.PerspectiveCamera, hole: THREE.Vector3 | null, horizon: number, depth: THREE.Texture | null) {
    if (!hole) {
      this.pass.enabled = false;
      return;
    }
    toHole.subVectors(hole, camera.position);
    const distance = toHole.length();
    camera.getWorldDirection(forward);
    const facing = toHole.dot(forward) / distance;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const { shadow, ring } = lensAngles(horizon, distance, fov);
    const bend = THREE.MathUtils.smoothstep(facing, 0, BEND_FADE);
    // the angle from the picture's middle to its corners (a camera showing a cut of a wider view, the menu's preview, reaches no farther than the wider one)
    const aspect = camera.view?.enabled ? camera.view.fullWidth / camera.view.fullHeight : camera.aspect;
    const corner = Math.atan(Math.tan(fov / 2) * Math.hypot(1, aspect));
    // the photon ring's outer flank lies within 1.3 times the shadow's angle
    if (bend < 1e-3 && Math.acos(THREE.MathUtils.clamp(facing, -1, 1)) - corner > shadow * 1.3) {
      this.pass.enabled = false;
      return;
    }
    const uniforms = this.pass.uniforms;
    uniforms.tDepth.value = depth;
    uniforms.shadowAngle.value = shadow;
    uniforms.ringAngle.value = ring;
    uniforms.bend.value = bend;
    uniforms.shadowRadius.value = horizon * HOLE_SHADOW;
    // the camera as this frame draws it, so the near side in the shadow sits on the disk around it
    camera.updateMatrixWorld();
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    uniforms.viewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.axis.value.copy(forward);
    uniforms.nearPlane.value = camera.near;
    uniforms.farPlane.value = camera.far;
    uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld).sub(hole);
    uniforms.diskTime.value = DISK_UNIFORMS.diskTime.value;
    uniforms.diskFine.value = DISK_UNIFORMS.diskFine.value;
    this.pass.enabled = true;
  }
}
