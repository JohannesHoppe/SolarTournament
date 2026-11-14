import * as THREE from 'three';

/**
 * A drive's plume as the eye sees it: the exhaust of a fusion drive is plasma hot enough to glow,
 * so the cone a plume burns in (see ship/plume, game/fleet) is drawn as what it is, a glow behind
 * the bell, white-hot in its core and fading along its length to its reach, so a pilot sees where
 * not to sit. One open cone per drive in additive light; its brightness follows the drive's
 * throttle, and a faint shimmer runs down it (still with reduced motion). It fades where it comes
 * close to the camera, so a plume flown into veils the view instead of blinding it.
 */

/** How bright the plume is at its end against its core (the danger falls with the square of the distance; the glow is kept readable to the end). */
const TAIL = 0.1;
/** How bright the glow is at its core (added light; the wall of the cone is seen twice through its middle). */
const BRIGHTNESS = 1.6;
/** Within this distance of the camera (units, 60 m) the glow fades out, gone at a quarter of it. */
const NEAR = 1200;

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERTEX = /* glsl */ `
  attribute float along;
  varying float vAlong;
  varying float vFacing;
  varying float vDepth;
  void main() {
    vAlong = along;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec3 normalView = normalize(normalMatrix * normal);
    vFacing = abs(dot(normalView, normalize(-view.xyz)));
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float core;
  uniform float time;
  uniform float near;
  varying float vAlong;
  varying float vFacing;
  varying float vDepth;
  void main() {
    // white-hot in its core, falling off along its length, never quite gone before its end
    float fall = core / max(core, vAlong);
    float glow = max(fall * fall, ${TAIL.toFixed(2)} * (1.0 - vAlong)) * smoothstep(1.0, 0.8, vAlong);
    // thicker seen through its middle than at its rim, whose edge goes soft
    float body = vFacing * vFacing;
    // a faint shimmer running down it
    float shimmer = 0.85 + 0.15 * sin(vAlong * 60.0 - time * 9.0);
    float fade = smoothstep(near * 0.25, near, vDepth);
    float a = strength * glow * body * shimmer * fade * ${BRIGHTNESS.toFixed(2)};
    vec3 hot = mix(color, vec3(1.0, 0.9, 0.75), fall * fall * 0.5);
    // added onto the picture at full alpha: light, not a veil
    gl_FragColor = vec4(hot * a, 1.0);
  }
`;

/** One cone of a reach and spread, shared by every plume of that size: its tip at the origin, opening along +Z, `along` its share of the reach. */
const cones = new Map<string, THREE.BufferGeometry>();

function cone(reach: number, spread: number, start: number): THREE.BufferGeometry {
  const key = `${reach}:${spread}:${start}`;
  let geometry = cones.get(key);
  if (geometry) return geometry;
  const radial = 20;
  const rings = 24;
  geometry = new THREE.CylinderGeometry(start + reach * spread, start, reach, radial, rings, true);
  // the cylinder's axis is Y, centered: turn it onto +Z, starting at the origin
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, reach / 2);
  const position = geometry.getAttribute('position');
  const along = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) along[i] = position.getZ(i) / reach;
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  cones.set(key, geometry);
  return geometry;
}

export class PlumeLook {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { color: { value: THREE.Color }; strength: { value: number }; core: { value: number }; time: { value: number }; near: { value: number } };

  /** A plume `reach` long (units), spreading by `spread` per unit, full within `core` (units) of where it starts, `start` wide there, glowing in `color`. */
  constructor(reach: number, spread: number, core: number, start: number, color: THREE.ColorRepresentation) {
    this.uniforms = { color: { value: new THREE.Color(color) }, strength: { value: 0 }, core: { value: core / reach }, time: { value: 0 }, near: { value: NEAR } };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(cone(reach, spread, start), material);
    this.mesh.name = 'plume';
    this.mesh.frustumCulled = true;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** How bright it glows now (0 hides it), at `time` (s) for its shimmer. */
  set(strength: number, time: number) {
    this.uniforms.strength.value = strength;
    if (!still) this.uniforms.time.value = time;
    this.mesh.visible = strength > 0;
  }

  /** Its glow's tint (a drive's flame color). */
  tint(color: THREE.Color) {
    this.uniforms.color.value.copy(color);
  }
}
