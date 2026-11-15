import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Cast } from '../music/lines';
import { setFromEuler } from '../detthree';
import { boxUv, industrialSurface, surfaced } from './surfaces';

/**
 * A scene in person (see campaign/scenes): a set the clone stands in, the people there in the
 * flesh, and the clone's own eyes. The Host looks around with the stick it steers with (the mouse,
 * a gamepad's stick, a finger), the head turning as far as a head turns; the clone does not walk.
 */

/** How far the clone's head turns from where it first looks (rad): about 100° to either side, 50° up and down. */
const YAW_LIMIT = 1.75;
const PITCH_LIMIT = 0.85;
/** How fast the head turns at full stick (rad/s). */
const TURN_RATE = 1.4;
/** A person's figure is built in meters (see tools/people); the world counts in units of 5 cm. */
const UNITS_PER_METER = 20;

/** Where a person stands in a scene: on the floor at `at` (world units), facing `facing` (rad about y, 0 towards +z). */
export interface Placement {
  who: Cast;
  at: THREE.Vector3;
  facing: number;
}

/**
 * Magnetic boots, which everyone in a scene wears, the clone too: the rooms stand in a pull of a few
 * hundredths of a g at most (Psyche's 0.015 g, Ceres's 0.03 g, less aboard Patience as she hangs
 * over Vesta), where a careless step carries a body up to the ceiling; in the Ballroom, under the
 * Moon's sixth of a g, the guests keep them on to dance. Under each foot a thick sole plate of worn steel
 * locks onto the deck, a lamp along its outer edge lit while it holds. In meters, the figure's frame
 * (it faces +z): the feet lie about 0.16 m either side of the middle, heel at -0.05 m, toes at 0.22 m.
 */
const BOOT = { width: 0.15, length: 0.35, height: 0.06, apart: 0.16, middle: 0.085, sink: 0.015 } as const;
let boots: THREE.Group | null = null;

/** The pair of boots' sole plates, built once and shared by every figure (a clone each time). */
function magBoots(): THREE.Group {
  if (boots) return boots;
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(7742), 0.3), color: 0x7a766c, metalness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.12).multiplyScalar(2), toneMapped: false });
  const sole = boxUv(new THREE.BoxGeometry(BOOT.width, BOOT.height, BOOT.length), 0.5);
  const strip = new THREE.BoxGeometry(0.008, 0.012, BOOT.length * 0.8);
  boots = new THREE.Group();
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(sole, steel);
    plate.position.set(side * BOOT.apart, BOOT.height / 2 - BOOT.sink, BOOT.middle);
    const light = new THREE.Mesh(strip, lamp);
    light.position.set(side * (BOOT.apart + BOOT.width / 2 + 0.003), BOOT.height * 0.55 - BOOT.sink, BOOT.middle);
    boots.add(plate, light);
  }
  return boots;
}

const loader = new GLTFLoader();
/** The people's figures as fetched (`public/assets/people/<who>.glb`), once each. */
const figures = new Map<Cast, Promise<THREE.Group>>();

/** Fetches a person's figure, once. */
export function loadFigure(who: Cast): Promise<THREE.Group> {
  let figure = figures.get(who);
  if (!figure) {
    figure = loader.loadAsync(`${import.meta.env.BASE_URL}assets/people/${who}.glb`).then((gltf) => gltf.scene);
    figures.set(who, figure);
  }
  return figure;
}

export class Stage {
  readonly root = new THREE.Group();
  private yaw = 0;
  private pitch = 0;

  /**
   * The set (built in place in the world), the people placed in it, and the clone's eyes at `eye`
   * looking along `look` (rad about y, 0 towards -z, as a camera looks).
   */
  constructor(
    set: THREE.Object3D,
    people: readonly Placement[],
    private readonly eye: THREE.Vector3,
    private readonly look: number,
    /** The set is shut in rock: the world's sun and sky light none of it (see ScenePlan.indoors). */
    readonly indoors = false,
  ) {
    this.root.add(set);
    for (const { who, at, facing } of people) {
      loadFigure(who).then(
        (figure) => {
          const person = figure.clone();
          person.add(magBoots().clone());
          person.scale.setScalar(UNITS_PER_METER);
          person.position.copy(at);
          setFromEuler(person.quaternion, 0, facing, 0);
          this.root.add(person);
        },
        (error) => console.warn('Figure failed', who, error),
      );
    }
  }

  /** The Host's stick turns the clone's head (rate per second, as it turns a ship's nose). */
  turnHead(yaw: number, pitch: number, dt: number) {
    this.yaw = THREE.MathUtils.clamp(this.yaw - yaw * TURN_RATE * dt, -YAW_LIMIT, YAW_LIMIT);
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch * TURN_RATE * dt, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** The camera at the clone's eyes, looking where its head is turned. */
  pose(camera: THREE.Camera) {
    camera.position.copy(this.eye);
    setFromEuler(camera.quaternion, this.pitch, this.look + this.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  }

  /** The set and the people leave the world (the figures and the set stay cached for the next time). */
  remove() {
    this.root.removeFromParent();
  }
}
