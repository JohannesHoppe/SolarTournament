import * as THREE from 'three';
import { courseUp, type FlightModel } from '../ship/flight';

/** Vertical field of view of the camera (degrees). */
export const CAMERA_FOV = 70;
/** How fast the chase camera follows the ship's position and turns (1/s): tight, so the ship feels direct. */
export const CAMERA_FOLLOW = 20;
export const CAMERA_TURN = 18;
/** The chase camera hangs this many ship radii above the ship and behind it. */
export const CHASE_HEIGHT = 0.75;
export const CHASE_DISTANCE = 2.6;

const look = new THREE.Matrix4();
const origin = new THREE.Vector3();
const up = new THREE.Vector3();

/**
 * Where the chase camera looks: along the autopilot's course when it has one (`course`), so the
 * screen's middle is where the Host wants to fly and the pointer's offset from it steers from
 * there, steady while the nose swings into a turn or about; else along the nose. The ship's up
 * stays up on screen.
 */
export function chaseOrientation(flight: FlightModel, course: THREE.Vector3 | null, out: THREE.Quaternion): THREE.Quaternion {
  if (!course) return out.copy(flight.orientation);
  return out.setFromRotationMatrix(look.lookAt(origin, course, courseUp(flight, course, up)));
}
