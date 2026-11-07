import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import { Randomizer } from '../random';
import { behindAll } from './horizon';
import { iceTug } from './barge';
import { lightCone } from './solarwall';

/**
 * Lantern and Granary (the campaign's chapter 17, see docs/campaign/), the game's own planets X
 * and XI out on the Long Ladder, both flown in open space.
 *
 * Lantern, some 200 AU out: a world the size of Mars, its thick hydrogen air holding in its
 * core's heat over an ocean of warm, dark water; from space a black disk against the stars, its
 * night lit by lightning deep in its air and by the flares of the settlers' heat wells. Kiln, its
 * station, is a ring of settlers' beacons over it (COURIER_BUOYS).
 *
 * Granary, some 350 AU out: a small, cold ice world in a ring that is not natural, the Feeders'
 * store of comets parked round it (the field's ice); the Feeders' tugs watch it, each sweeping a
 * sensor cone (SENSOR_ANGLE wide, SENSOR_REACH long) across the ring; the comet bound for the
 * Ninth lies at the ring's far side (COMET_AT). The tugs are scenery: the cones are what matters.
 */

/** Lantern below the field: some 30° across, black, drawn behind everything. */
const LANTERN_DISTANCE = 250000;
export const LANTERN_AT = new THREE.Vector3(0.2, -1, -0.3).normalize().multiplyScalar(LANTERN_DISTANCE);
const LANTERN_SIZE = LANTERN_DISTANCE * sin(0.26);
/** Its night's lights: FLARES heat wells and LIGHTNING bolts' places on the face towards the field. */
const FLARES = 140;
const LIGHTNING = 60;

/** The settlers' beacons at Kiln, in the order a courier calls at them (units). */
export const COURIER_BUOYS: readonly THREE.Vector3[] = [
  [40000, 3000, 20000],
  [10000, -4000, 45000],
  [-30000, 2000, 30000],
  [-45000, -2000, -10000],
  [-10000, 4000, -45000],
  [30000, -3000, -35000],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
/** Where the HUD marks Kiln: the beacons' middle. */
export const KILN_MARK = new THREE.Vector3(0, 0, 0);

/** Granary below the field: some 10° across, its ice grey-white. */
const GRANARY_DISTANCE = 230000;
export const GRANARY_AT = new THREE.Vector3(-0.3, -1, 0.2).normalize().multiplyScalar(GRANARY_DISTANCE);
const GRANARY_SIZE = GRANARY_DISTANCE * sin(0.087);

/** The Feeders' tugs watching the store: where each lies, its sensor cone sweeping round it once every SWEEP seconds, tilted DIP below the level, its phase its own. */
export const TUGS: readonly THREE.Vector3[] = [
  [15000, 2000, 25000],
  [-20000, -1000, 5000],
  [5000, 1500, -30000],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
export const SENSOR_ANGLE = 0.22;
export const SENSOR_REACH = 50000;
const SWEEP = 22;
const DIP = -0.08;
/** The comet bound for the Ninth: the field's piece nearest this point is it. */
export const COMET_AT = new THREE.Vector3(-50000, 0, -40000);
/** Where the hull slips in from: the store's near side. */
export const GRANARY_FROM = new THREE.Vector3(55000, 0, 35000);

/** Where tug `i`'s sensor looks at field time `time`: a unit vector into `out`. */
export function sensorAim(i: number, time: number, out: THREE.Vector3): THREE.Vector3 {
  const phase = (2 * Math.PI * time) / SWEEP + i * 2.1;
  return out.set(cos(phase), DIP, sin(phase)).normalize();
}

const toward = new THREE.Vector3();
const aim = new THREE.Vector3();

/** Whether a point is held in tug `i`'s sensor cone at field time `time`. */
export function inCone(i: number, point: THREE.Vector3, time: number): boolean {
  toward.subVectors(point, TUGS[i]);
  const along = toward.dot(sensorAim(i, time, aim));
  if (along <= 0 || along > SENSOR_REACH) return false;
  const off = toward.addScaledVector(aim, -along).length();
  return atan2(off, along) < SENSOR_ANGLE;
}

/** Whether a point is held in any tug's sensor cone at field time `time`. */
export const inSensor = (point: THREE.Vector3, time: number) => TUGS.some((_, i) => inCone(i, point, time));

/** A body below a field: a ball in `color`, faintly lit by `glow`, drawn behind everything. */
function ball(at: THREE.Vector3, size: number, color: number, glow: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 64, 32), behindAll(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: glow })));
  mesh.position.copy(at);
  mesh.userData.shadowless = true;
  return mesh;
}

const nightVertex = /* glsl */ `
  attribute float seed;
  uniform float time;
  varying float vLight;
  varying float vBolt;
  void main() {
    // a flare (seed < 0.5) glows steadily, flickering a little; a bolt (seed >= 0.5) flashes now and then
    float flicker = 0.75 + 0.25 * fract(sin((seed + floor(time * 6.0)) * 91.7) * 4371.3);
    float bolt = step(0.985, fract(sin((seed * 13.1 + floor(time * 9.0)) * 57.3) * 2113.9));
    vLight = seed < 0.5 ? flicker : bolt;
    vBolt = step(0.5, seed);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = seed < 0.5 ? 2.0 : 6.0;
  }
`;
const nightFragment = /* glsl */ `
  uniform vec3 flare;
  uniform vec3 bolt;
  varying float vLight;
  varying float vBolt;
  void main() {
    if (vLight <= 0.0) discard;
    gl_FragColor = vec4(mix(flare, bolt, vBolt) * vLight, 1.0);
  }
`;

/** Lantern's night: the black disk, the heat wells' flares and the lightning on its face towards the field. */
export function lantern(): { group: THREE.Group; material: THREE.ShaderMaterial } {
  const r = new Randomizer(17001);
  const toField = LANTERN_AT.clone().negate().normalize();
  const positions: number[] = [];
  const seeds: number[] = [];
  const at = new THREE.Vector3();
  for (let i = 0; i < FLARES + LIGHTNING; i++) {
    // a point on the face towards the field, a little off the surface
    at.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
    if (at.dot(toField) < 0.15) at.addScaledVector(toField, 0.9 - at.dot(toField)).normalize();
    at.multiplyScalar(LANTERN_SIZE * 1.002).add(LANTERN_AT);
    positions.push(at.x, at.y, at.z);
    seeds.push(i < FLARES ? r.range(0, 0.49) : r.range(0.5, 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, flare: { value: new THREE.Color(1, 0.55, 0.2).multiplyScalar(1.6) }, bolt: { value: new THREE.Color(0.75, 0.8, 1).multiplyScalar(2) } },
    vertexShader: nightVertex,
    fragmentShader: nightFragment,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const night = new THREE.Points(geometry, behindAll(material));
  night.frustumCulled = false;
  night.renderOrder = -1;
  return { group: new THREE.Group().add(ball(LANTERN_AT, LANTERN_SIZE, 0x050506, 0x000000), night), material };
}

/** Granary's store: the ice world below, the Feeders' tugs with their sensor cones (turned each frame, see update). */
export class GranaryScene {
  readonly group = new THREE.Group();
  private readonly cones: THREE.Mesh[] = [];
  private readonly aim = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.add(ball(GRANARY_AT, GRANARY_SIZE, 0xd8dce0, 0x0c0e10));
    const cone = lightCone(SENSOR_ANGLE, SENSOR_REACH, new THREE.Color(1, 0.6, 0.25).multiplyScalar(0.14));
    for (const at of TUGS) {
      const tug = iceTug().root.clone();
      tug.position.copy(at);
      this.group.add(tug);
      const copy = cone.clone();
      copy.position.copy(at);
      this.cones.push(copy);
      this.group.add(copy);
    }
  }

  /** The cones where their sensors look at field time `time`. */
  update(time: number) {
    this.cones.forEach((cone, i) => cone.quaternion.setFromUnitVectors(GranaryScene.UP, sensorAim(i, time, this.aim)));
  }
}
