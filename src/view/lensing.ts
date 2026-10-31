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
 * lies in front of the hole (by the depth) is neither bent nor lent to the bent picture. It
 * also draws the disk's gas in front of a rock or ship inside the disk's slab, which the disk's
 * own mesh leaves out there, so the lens is on wherever the hole lies.
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
/** A bent ray's source beyond the picture's edge by this share of it or more shows the pixel's own unbent light; the fade begins half as far inside the edge (see the shader's outside). */
const EDGE_FADE = 0.04;
/**
 * The disk's gas in front of a rock or ship inside its slab, softly held below this luminance
 * (linear, before the tone mapping): a rock's dark side reads about this bright, its lit side
 * several times more, so the veil tints a rock and shows it lies in the glowing gas while its
 * shading and silhouette still read as a solid body; summed in full, kilometers of gas along
 * the plane would wash it out into a flat cut-out.
 */
const VEIL_MAX = 0.03;
/** ...and that fade spans no fewer pixels on screen than this. */
const EDGE_PIXELS = 60;

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
    float ahead(vec2 uv) {
      return nearPlane * farPlane / (farPlane - (farPlane - nearPlane) * texture2D(tDepth, uv).x);
    }
    bool beyond(float depth, vec3 r) {
      return depth > -dot(r, eye) * dot(r, axis);
    }
    // what is drawn at uv, seen along r and lying depth ahead of the camera, with the disk's gas in
    // front of it where it lies inside the gas's slab: the disk's own mesh is depth-tested at the
    // slab's far side, so a surface inside hides all of the gas along that pixel (see world/landmarks);
    // held faint (see VEIL_MAX)
    vec4 seen(vec2 uv, float depth, vec3 r) {
      vec4 color = texture2D(tDiffuse, uv);
      float at = depth / dot(r, axis);
      if (at < diskExit(eye, r)) {
        float near = diskEntry(eye, r);
        if (at > near) {
          vec3 veil = diskGas(eye, r, near, at);
          color.rgb += veil * ${VEIL_MAX} / (${VEIL_MAX} + dot(veil, vec3(0.2126, 0.7152, 0.0722)));
        }
      }
      return color;
    }
    void main() {
      vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
      vec3 rd = normalize((cameraWorld * vec4(view.xyz / view.w, 0.0)).xyz);
      float depth = ahead(vUv);
      // a ship or rock in front of the hole is seen as it is
      if (!beyond(depth, rd)) {
        gl_FragColor = seen(vUv, depth, rd);
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
      vec2 shown = vUv;
      vec3 ray = rd;
      float shownDepth = depth;
      // how far beyond the picture's edge the source lies (a share of the picture, less than 0
      // inside it): nothing is known beyond, so the bent light fades back to the pixel's own
      // unbent light about the edge (see EDGE_FADE) instead of smearing the edge's pixels across
      // the picture, and a thing the edge cuts off fades out instead of showing the cut
      float outside = -1.0;
      if (bend > 0.0) {
        float beta = theta - bend * ringAngle * ringAngle / theta;
        vec3 across = normalize(rd - toHole * c);
        for (int i = 0; i < 6; i++) {
          if (i >= samples) break;
          float angle = beta * (1.0 + 0.2 * float(i));
          vec3 r = toHole * cos(angle) + across * sin(angle);
          vec4 clip = viewProjection * vec4(r, 0.0);
          // behind the camera: as far beyond the edge as it gets
          if (clip.w <= 0.0) {
            outside = 1.0;
            break;
          }
          vec2 raw = clip.xy / clip.w * 0.5 + 0.5;
          vec2 source = clamp(raw, 0.0, 1.0);
          float there = ahead(source);
          if (beyond(there, r)) {
            shown = source;
            ray = r;
            shownDepth = there;
            outside = max(max(-raw.x, raw.x - 1.0), max(-raw.y, raw.y - 1.0));
            break;
          }
        }
      }
      vec4 color = seen(shown, shownDepth, ray);
      // (over at least EDGE_PIXELS on screen: near the Einstein ring the source races across the
      // picture as the pixel moves, and a fade over its own distance alone would be a hard seam)
      float span = max(${EDGE_FADE}, fwidth(outside) * ${EDGE_PIXELS.toFixed(1)});
      if (outside > -0.5 * span) color = mix(color, seen(vUv, depth, rd), smoothstep(-0.5 * span, span, outside));
      // the light that grazes the shadow piles up into a thin bright ring
      // squared by hand: GLSL ES leaves pow() of a negative base undefined (NaN on some GPUs)
      float ring = (theta - shadowAngle * 1.04) / (shadowAngle * 0.045 + 0.0007);
      float photon = exp(-ring * ring);
      gl_FragColor = color + vec4(vec3(1.0, 0.88, 0.7) * photon * 0.75, 0.0);
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
   * switches it off. The ring grows as the hole comes closer. On wherever the hole lies, beside
   * and behind the camera too: the disk's gas in front of a rock or ship inside its slab is the
   * lens's to draw (see seen in the shader).
   */
  update(camera: THREE.PerspectiveCamera, hole: THREE.Vector3 | null, horizon: number, depth: THREE.Texture | null) {
    if (!hole) {
      this.pass.enabled = false;
      return;
    }
    toHole.subVectors(hole, camera.position);
    const distance = toHole.length();
    camera.getWorldDirection(forward);
    const { shadow, ring } = lensAngles(horizon, distance, THREE.MathUtils.degToRad(camera.fov));
    const uniforms = this.pass.uniforms;
    uniforms.tDepth.value = depth;
    uniforms.shadowAngle.value = shadow;
    uniforms.ringAngle.value = ring;
    uniforms.bend.value = THREE.MathUtils.smoothstep(toHole.dot(forward) / distance, 0, BEND_FADE);
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
