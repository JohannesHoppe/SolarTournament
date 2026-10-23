import * as THREE from 'three';
import { FIELD_RADIUS } from './asteroids';

/** Ships beyond this distance from the center have a few seconds to come back. */
export const ARENA_LIMIT = FIELD_RADIUS * 1.5;
/** Seconds a ship may stay beyond ARENA_LIMIT before it is lost: enough to flip, burn off an outward drift of 100 m/s or more and fly back in. */
export const ARENA_GRACE = 20;
/** Spacing of the grid lines on the arena's edge: 600 m, wide enough not to distract. */
const GRID_SPACING = 12000;
/** Inside, the grid shows up within this distance of the pilot (units). */
const GRID_REACH = 30000;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Thin lines where the sphere cuts the planes of a world-space grid, one pixel wide at any
// distance. Inside the arena they light up only near the pilot, so the middle of the field
// stays clean; outside the whole edge shows, so the way back is always in sight.
const fragment = /* glsl */ `
  uniform float spacing;
  uniform float reach;
  uniform float outside;
  uniform vec3 inColor;
  uniform vec3 outColor;
  varying vec3 vWorld;
  void main() {
    vec3 cell = vWorld / spacing;
    vec3 line = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
    float grid = 1.0 - min(min(line.x, line.y), line.z);
    if (grid <= 0.0) discard;
    float near = 1.0 - smoothstep(0.0, reach, distance(vWorld, cameraPosition));
    float strength = mix(0.03 + 0.5 * near, 0.14 + 0.5 * near, outside);
    vec3 color = mix(inColor, outColor, outside);
    gl_FragColor = vec4(color * grid * strength, 1.0);
  }
`;

/** The arena's edge: a thin grid on the sphere a ship must not leave for long. */
export class Arena {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        spacing: { value: GRID_SPACING },
        reach: { value: GRID_REACH },
        outside: { value: 0 },
        inColor: { value: new THREE.Color(0.35, 0.55, 1) },
        outColor: { value: new THREE.Color(1, 0.55, 0.2) },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(ARENA_LIMIT, 128, 64), this.material);
    this.mesh.frustumCulled = false;
  }

  /** The grid turns orange while the pilot is outside. */
  update(camera: THREE.Camera) {
    this.material.uniforms.outside.value = camera.position.length() > ARENA_LIMIT ? 1 : 0;
  }
}
