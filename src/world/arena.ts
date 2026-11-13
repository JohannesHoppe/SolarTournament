import * as THREE from 'three';
import { FIELD_RADIUS } from './asteroids';
import { WIDE } from '../view/wide';
import { rotateX } from '../detthree';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Ships beyond this distance from the center have a few seconds to come back. */
export const ARENA_LIMIT = FIELD_RADIUS * 1.5;
/** Seconds a ship may stay beyond ARENA_LIMIT before it is lost: enough to flip, burn off an outward drift of 100 m/s or more and fly back in. */
export const ARENA_GRACE = 20;
/**
 * An edge of its own over a world (see ArenaProfile.bounds): a ship is inside within `radius`
 * of the middle across the ground (units) and under the `ceiling` (units, a height); the ground
 * itself is the floor.
 */
export interface Bounds {
  readonly radius: number;
  readonly ceiling: number;
}

/** Whether `position` lies outside the arena: beyond its own edge where it has one (`bounds`), else beyond ARENA_LIMIT. */
export function outsideArena(position: THREE.Vector3, bounds: Bounds | null | undefined): boolean {
  if (!bounds) return position.length() > ARENA_LIMIT;
  return position.x * position.x + position.z * position.z > bounds.radius * bounds.radius || position.y > bounds.ceiling;
}

/** An edge of its own shown as a wall round the middle from this far under the ceiling (units, 2 km: under any ground) up to it, and a lid over it. */
const WALL_DEPTH = 40000;

/** Spacing of the grid lines on the arena's edge: 600 m, wide enough not to distract. */
const GRID_SPACING = 12000;
/** Inside, the grid shows up within this distance of the pilot (units); on an edge of its own over a world, which runs close by everywhere, only within BOUNDS_REACH (300 m), as the pilot comes near it. */
const GRID_REACH = 30000;
const BOUNDS_REACH = 6000;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Lines where the sphere cuts the planes of a world-space grid, as wide on screen as the flight
// computer's lines in space (lineWidth device pixels, see view/wide) at any distance. Inside the
// arena they light up only near the pilot, so the middle of the field stays clean; outside the
// whole edge shows, so the way back is always in sight.
const fragment = /* glsl */ `
  uniform float lineWidth;
  uniform float spacing;
  uniform float reach;
  uniform float outside;
  uniform vec3 inColor;
  uniform vec3 outColor;
  varying vec3 vWorld;
  void main() {
    vec3 cell = vWorld / spacing;
    // a flat lid lies in a plane of the grid: its own axis does not change across it, and the
    // rounding of its height would make dust of lines there; such an axis draws none
    vec3 line = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), 1e-4);
    // full within half the width of a line's middle, fading over one pixel beyond
    float grid = clamp(0.5 * lineWidth + 0.5 - min(min(line.x, line.y), line.z), 0.0, 1.0);
    if (grid <= 0.0) discard;
    float near = 1.0 - smoothstep(0.0, reach, distance(vWorld, cameraPosition));
    float strength = mix(0.03 + 0.5 * near, 0.14 + 0.5 * near, outside);
    vec3 color = mix(inColor, outColor, outside);
    gl_FragColor = vec4(color * grid * strength, 1.0);
  }
`;

/** The arena's edge: a thin grid on the sphere a ship must not leave for long, or on the wall and lid of an edge of its own over a world. */
export class Arena {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly sphere: THREE.BufferGeometry;
  private bounds: Bounds | null = null;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        spacing: { value: GRID_SPACING },
        reach: { value: GRID_REACH },
        outside: { value: 0 },
        inColor: { value: new THREE.Color(0.35, 0.55, 1) },
        outColor: { value: new THREE.Color(1, 0.55, 0.2) },
        lineWidth: WIDE.lineWidth,
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
    });
    this.sphere = new THREE.SphereGeometry(ARENA_LIMIT, 128, 64);
    this.mesh = new THREE.Mesh(this.sphere, this.material);
    this.mesh.frustumCulled = false;
  }

  /** The edge of the arena in play: its own over a world (`bounds`), else the sphere. */
  shape(bounds: Bounds | null) {
    if (bounds === this.bounds) return;
    if (this.mesh.geometry !== this.sphere) this.mesh.geometry.dispose();
    this.bounds = bounds;
    this.material.uniforms.reach.value = bounds ? BOUNDS_REACH : GRID_REACH;
    if (!bounds) {
      this.mesh.geometry = this.sphere;
      return;
    }
    const wall = new THREE.CylinderGeometry(bounds.radius, bounds.radius, WALL_DEPTH, 128, 1, true).translate(0, bounds.ceiling - WALL_DEPTH / 2, 0);
    const lid = rotateX(new THREE.CircleGeometry(bounds.radius, 128), -Math.PI / 2).translate(0, bounds.ceiling, 0);
    this.mesh.geometry = mergeGeometries([wall.toNonIndexed(), lid.toNonIndexed()]);
  }

  /** The grid turns orange while the own pilot's ship (null: no clone flies) is outside, wherever the camera hangs. */
  update(ship: THREE.Vector3 | null) {
    this.material.uniforms.outside.value = ship && outsideArena(ship, this.bounds) ? 1 : 0;
  }
}
