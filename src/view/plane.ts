import * as THREE from 'three';
import { ARENA_LIMIT } from '../world/arena';
import { footOf, heightOf } from '../world/reference';
import { cos, sin } from '../detmath';
import { setWideLines, WIDE, WIDE_VERTEX, wideSegments } from './wide';

/** The grid on the reference plane: a ring every RING (units, 500 m) out to the arena's edge, a spoke every SPOKES-th of a turn (30°). */
const RING = 10000;
const SPOKES = 12;
/** Segments of a ring's circle: smooth enough up close at the arena's edge. */
const RING_SEGMENTS = 160;
/**
 * The grid shows within GRID_REACH (units, 1.5 km) of the point straight below or above the ship,
 * farther the higher the ship flies (GRID_HEIGHT of its height more), so from far off it shows a
 * wider patch; it grows from GRID_STRENGTH to GRID_HIGH once the ship is HIGH (units, 1 km) off
 * the plane, where it is all there is to tell up from down.
 */
const GRID_REACH = 30000;
const GRID_HEIGHT = 1.5;
const GRID_STRENGTH = 0.09;
const GRID_HIGH = 0.16;
const HIGH = 20000;
/** The drop lines show within DROP_REACH of the ship (units, 3 km), fading out towards it. */
const DROP_REACH = 60000;
const DROP_STRENGTH = 0.22;
/** Drop lines at most: ships, rings, the waypoint and the own ship. */
export const MAX_DROPS = 40;
/** A drop's tick on the plane: a cross this share of its distance from the camera across, so it keeps its size on screen. */
const TICK = 0.012;
/** Up close to the camera the lines fade in between these distances (units, 10 to 60 m), so nothing sweeps across the view. */
const NEAR_FROM = 200;
const NEAR_TO = 1200;
/** Around the crosshair the lines give way within CLEAR (px), fully within half of it. */
const CLEAR = 46;

// The flight computer's projection: lines a few pixels wide (see view/wide) in the HUD's azure over everything, fading with
// the distance from the ship, up close to the camera and around the crosshair. They are blended
// as a screen (color times what is not lit yet), so over a bright rock or the sun they all but vanish.
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform vec3 ship;
  uniform float reach;
  uniform float strength;
  uniform vec2 crosshair;
  uniform float clear;
  varying vec3 vWorld;
  void main() {
    float far = 1.0 - smoothstep(reach * 0.35, reach, distance(vWorld, ship));
    float near = smoothstep(${NEAR_FROM.toFixed(1)}, ${NEAR_TO.toFixed(1)}, distance(vWorld, cameraPosition));
    float aside = smoothstep(clear * 0.5, clear, distance(gl_FragCoord.xy, crosshair));
    float a = strength * far * near * aside;
    if (a < 0.004) discard;
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

const foot = new THREE.Vector3();
const crosshair = new THREE.Vector3();

/**
 * The reference plane in the flight computer's projection (see world/reference): a faint polar
 * grid on it around the ship, and drop lines from ships, rings and the waypoint straight down or
 * up to it, each with a small cross where it meets the plane, as a tactical display shows what
 * is above and below. HUD, not world: drawn over everything, never hidden by rock. Built once;
 * the drops are rewritten in place every frame.
 */
export class ReferencePlane {
  readonly group = new THREE.Group();
  private readonly grid: THREE.Mesh;
  private readonly drops: THREE.Mesh;
  private readonly gridMaterial = material(GRID_REACH, GRID_STRENGTH);
  private readonly dropMaterial = material(DROP_REACH, DROP_STRENGTH);
  private readonly materials = [this.gridMaterial, this.dropMaterial];
  /** Segments of the rings, before the spokes: a plain grid draws only these (see setDetail). */
  private readonly ringSegments: number;
  private readonly segments: number;
  /** The drops' segments, rewritten every frame: three a drop (the line, the tick's two bars). */
  private readonly dropStarts: THREE.InstancedBufferAttribute;
  private readonly dropEnds: THREE.InstancedBufferAttribute;
  private count = 0;

  constructor() {
    const segments: number[][] = [];
    for (let radius = RING; radius < ARENA_LIMIT; radius += RING) {
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
        segments.push([cos(a) * radius, 0, sin(a) * radius, cos(b) * radius, 0, sin(b) * radius]);
      }
    }
    this.ringSegments = segments.length;
    const outer = Math.floor((ARENA_LIMIT - 1) / RING) * RING;
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      segments.push([cos(a) * RING, 0, sin(a) * RING, cos(a) * outer, 0, sin(a) * outer]);
    }
    this.segments = segments.length;
    const grid = wideSegments(segments.length);
    segments.forEach(([ax, ay, az, bx, by, bz], i) => {
      grid.starts.setXYZ(i, ax, ay, az);
      grid.ends.setXYZ(i, bx, by, bz);
    });
    this.grid = new THREE.Mesh(grid.geometry, this.gridMaterial);
    const drops = wideSegments(MAX_DROPS * 3, true);
    this.dropStarts = drops.starts;
    this.dropEnds = drops.ends;
    this.drops = new THREE.Mesh(drops.geometry, this.dropMaterial);
    for (const lines of [this.grid, this.drops]) {
      // over everything, after the world
      lines.frustumCulled = false;
      lines.renderOrder = 10;
      this.group.add(lines);
    }
  }

  /** The grid with its spokes, or (`full` false, for slow devices) only its rings. */
  setDetail(full: boolean) {
    (this.grid.geometry as THREE.InstancedBufferGeometry).instanceCount = full ? this.segments : this.ringSegments;
  }

  /** Starts this frame's drop lines. */
  clearDrops() {
    this.count = 0;
  }

  /** A drop line from `point` to the plane, with its tick seen from `camera`; ignored once MAX_DROPS are laid or when it lies in the plane. */
  drop(point: THREE.Vector3, camera: THREE.Camera) {
    if (this.count >= MAX_DROPS || Math.abs(heightOf(point)) < 1) return;
    footOf(point, foot);
    const half = foot.distanceTo(camera.position) * TICK * 0.5;
    const s = this.dropStarts;
    const e = this.dropEnds;
    const i = this.count * 3;
    s.setXYZ(i, point.x, point.y, point.z);
    e.setXYZ(i, foot.x, foot.y, foot.z);
    s.setXYZ(i + 1, foot.x - half, foot.y, foot.z);
    e.setXYZ(i + 1, foot.x + half, foot.y, foot.z);
    s.setXYZ(i + 2, foot.x, foot.y, foot.z - half);
    e.setXYZ(i + 2, foot.x, foot.y, foot.z + half);
    this.count++;
  }

  /**
   * Shows the plane around the ship at `ship` (or hides it all, `show` false), with the drops laid
   * since clearDrops, keeping clear of the crosshair at `aim` (a world point) in a picture of
   * `width` × `height` CSS pixels at `ratio` device pixels each.
   */
  update(show: boolean, ship: THREE.Vector3, camera: THREE.Camera, aim: THREE.Vector3, width: number, height: number, ratio: number) {
    // the wide lines' measure, for the orbit's line too, whether the plane shows or not
    setWideLines(width, height, ratio);
    this.group.visible = show;
    if (!show) return;
    const high = THREE.MathUtils.smoothstep(Math.abs(heightOf(ship)), 0, HIGH);
    crosshair.copy(aim).project(camera);
    for (const each of this.materials) {
      const uniforms = each.uniforms;
      uniforms.crosshair.value.set(((crosshair.x + 1) / 2) * width * ratio, ((crosshair.y + 1) / 2) * height * ratio);
      uniforms.clear.value = crosshair.z < 1 ? CLEAR * ratio : 0;
    }
    // the drops fade with their distance from the ship, the grid around the point below or above it
    this.dropMaterial.uniforms.ship.value.copy(ship);
    footOf(ship, this.gridMaterial.uniforms.ship.value);
    this.gridMaterial.uniforms.reach.value = GRID_REACH + Math.abs(heightOf(ship)) * GRID_HEIGHT;
    this.gridMaterial.uniforms.strength.value = THREE.MathUtils.lerp(GRID_STRENGTH, GRID_HIGH, high);
    (this.drops.geometry as THREE.InstancedBufferGeometry).instanceCount = this.count * 3;
    for (const attribute of [this.dropStarts, this.dropEnds]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * 9);
      attribute.needsUpdate = true;
    }
  }
}

/** The lines' material: the HUD's azure, over everything, fading beyond `reach` of the ship. */
function material(reach: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0.3, 0.57, 1) },
      ship: { value: new THREE.Vector3() },
      reach: { value: reach },
      strength: { value: strength },
      crosshair: { value: new THREE.Vector2() },
      clear: { value: 0 },
      ...WIDE,
    },
    vertexShader: WIDE_VERTEX,
    fragmentShader: fragment,
    // a screen: the lines add what the picture has not lit yet
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
}
