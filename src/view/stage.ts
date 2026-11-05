import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Cast } from '../music/lines';
import { setFromEuler } from '../detthree';

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
  ) {
    this.root.add(set);
    for (const { who, at, facing } of people) {
      loadFigure(who).then(
        (figure) => {
          const person = figure.clone();
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
