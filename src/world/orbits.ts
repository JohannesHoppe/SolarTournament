import * as THREE from 'three';
import { cos, cosh, log, sin, sinh } from '../detmath';

/**
 * Free flight in a body's gravity, in closed form from a start, so a piece of the field stands
 * wherever the field time puts it, alike on every browser (detmath only):
 *
 * - `kepler`: two bodies, a piece about a massive body's center (the black hole's), on whatever
 *   conic its start gives it (an ellipse, a parabola or a hyperbola), by universal variables.
 * - `hill`: a piece near a reference point on a circular orbit about a planet, in the frame that
 *   rides that point with the planet below (the Satellite Junkyard's, 5,000 km over Earth): the
 *   Clohessy–Wiltshire equations, the relative motion of two orbits that lie close together.
 */

/** Newton's steps at most, and the share of a step it stops at (both fixed, so every browser stops alike). */
const KEPLER_STEPS = 40;
const KEPLER_TOLERANCE = 1e-12;

/** The Stumpff functions C(z) and S(z) (see kepler), into `stumpff`. */
const stumpff = { c: 0, s: 0 };
function stumpffOf(z: number) {
  if (z > 1e-6) {
    const root = Math.sqrt(z);
    stumpff.c = (1 - cos(root)) / z;
    stumpff.s = (root - sin(root)) / (z * root);
  } else if (z < -1e-6) {
    const root = Math.sqrt(-z);
    stumpff.c = (cosh(root) - 1) / -z;
    stumpff.s = (sinh(root) - root) / (-z * root);
  } else {
    stumpff.c = 1 / 2 - z / 24 + (z * z) / 720;
    stumpff.s = 1 / 6 - z / 120 + (z * z) / 5040;
  }
}

/**
 * Where a piece starting at `position` with `velocity` (relative to the body's center, units
 * and units/s) is after `dt` seconds about a body of strength `mu` (units³/s², its pull times
 * the square of the distance), and how fast it moves there, into `outPosition` and
 * `outVelocity` (either may be the start's own vector).
 */
export function kepler(mu: number, position: THREE.Vector3, velocity: THREE.Vector3, dt: number, outPosition: THREE.Vector3, outVelocity: THREE.Vector3) {
  const r0 = position.length();
  const rootMu = Math.sqrt(mu);
  const radial = position.dot(velocity) / r0;
  // the inverse of the semi-major axis: positive bound, negative unbound
  const alpha = 2 / r0 - velocity.lengthSq() / mu;
  let chi = rootMu * Math.abs(alpha) * dt;
  if (Math.abs(alpha) < 1e-12) chi = (rootMu * dt) / r0;
  else if (alpha < 0) {
    // a hyperbola: the guess grows with the logarithm of the time, as the hyperbolic anomaly
    // does far out (Vallado's start); the bound one's guess, linear in time, overshoots
    // so far on a clearly unbound conic that Newton's steps run off to infinity
    const a = 1 / alpha;
    const sign = dt < 0 ? -1 : 1;
    const span = (-2 * mu * alpha * dt) / (r0 * radial + sign * Math.sqrt(-mu * a) * (1 - r0 * alpha));
    if (span > 0 && Number.isFinite(span)) chi = sign * Math.sqrt(-a) * log(span);
  }
  for (let k = 0; k < KEPLER_STEPS; k++) {
    const z = alpha * chi * chi;
    stumpffOf(z);
    const f = ((r0 * radial) / rootMu) * chi * chi * stumpff.c + (1 - alpha * r0) * chi * chi * chi * stumpff.s + r0 * chi - rootMu * dt;
    const slope = ((r0 * radial) / rootMu) * chi * (1 - z * stumpff.s) + (1 - alpha * r0) * chi * chi * stumpff.c + r0;
    const step = f / slope;
    chi -= step;
    if (Math.abs(step) <= KEPLER_TOLERANCE * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  stumpffOf(z);
  const f = 1 - ((chi * chi) / r0) * stumpff.c;
  const g = dt - (chi * chi * chi * stumpff.s) / rootMu;
  const px = f * position.x + g * velocity.x;
  const py = f * position.y + g * velocity.y;
  const pz = f * position.z + g * velocity.z;
  const r = Math.sqrt(px * px + py * py + pz * pz);
  const fDot = (rootMu / (r * r0)) * (z * chi * stumpff.s - chi);
  const gDot = 1 - ((chi * chi) / r) * stumpff.c;
  const vx = fDot * position.x + gDot * velocity.x;
  const vy = fDot * position.y + gDot * velocity.y;
  const vz = fDot * position.z + gDot * velocity.z;
  outPosition.set(px, py, pz);
  outVelocity.set(vx, vy, vz);
}

/**
 * The frame riding a circular orbit (see hill): `rate` its mean motion (rad/s), `up` away from
 * the planet's center, `ahead` along the orbit's flight, `normal` square to the orbit's plane
 * (up × ahead); all unit length and square to each other, in the arena's coordinates.
 */
export interface HillFrame {
  rate: number;
  up: THREE.Vector3;
  ahead: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Where a piece starting at `position` with `velocity` (in the frame riding the reference
 * orbit, from its reference point) is after `dt` seconds, and how fast it moves there, into
 * `outPosition` and `outVelocity` (either may be the start's own vector). Up and down it swings
 * once an orbit; a piece higher than the reference falls behind it, a lower one pulls ahead
 * (3/2 of the rate times its height, on average); one whose speed along the orbit is twice the
 * rate times its height less circles the reference point on an ellipse twice as long along the
 * orbit as high, once an orbit; across the orbit's plane it swings once an orbit.
 */
export function hill(frame: HillFrame, position: THREE.Vector3, velocity: THREE.Vector3, dt: number, outPosition: THREE.Vector3, outVelocity: THREE.Vector3) {
  const n = frame.rate;
  const x0 = position.dot(frame.up);
  const y0 = position.dot(frame.ahead);
  const z0 = position.dot(frame.normal);
  const u0 = velocity.dot(frame.up);
  const v0 = velocity.dot(frame.ahead);
  const w0 = velocity.dot(frame.normal);
  const angle = n * dt;
  const c = cos(angle);
  const s = sin(angle);
  const x = (4 - 3 * c) * x0 + (s / n) * u0 + (2 / n) * (1 - c) * v0;
  const y = 6 * (s - angle) * x0 + y0 - (2 / n) * (1 - c) * u0 + ((4 * s - 3 * angle) / n) * v0;
  const z = c * z0 + (s / n) * w0;
  const u = 3 * n * s * x0 + c * u0 + 2 * s * v0;
  const v = -6 * n * (1 - c) * x0 - 2 * s * u0 + (4 * c - 3) * v0;
  const w = -n * s * z0 + c * w0;
  outPosition.copy(frame.up).multiplyScalar(x).addScaledVector(frame.ahead, y).addScaledVector(frame.normal, z);
  outVelocity.copy(frame.up).multiplyScalar(u).addScaledVector(frame.ahead, v).addScaledVector(frame.normal, w);
}

/**
 * The tide a body at `position` feels in the frame riding the reference orbit (see hill), all
 * that is left of the planet's gravity once the frame's own fall takes out the rest (units/s²),
 * added into `target`: 3 rate² times its height up, and rate² times its distance across the
 * orbit's plane back towards it.
 */
export function hillTide(frame: HillFrame, position: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const n2 = frame.rate * frame.rate;
  target.addScaledVector(frame.up, 3 * n2 * position.dot(frame.up));
  return target.addScaledVector(frame.normal, -n2 * position.dot(frame.normal));
}

/** The frame's turn once an orbit as a body flying at `velocity` feels it (Coriolis: twice the rate times its velocity, turned a quarter about the orbit's axis; units/s²), added into `target`. */
export function hillTurn(frame: HillFrame, velocity: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const twice = 2 * frame.rate;
  target.addScaledVector(frame.up, twice * velocity.dot(frame.ahead));
  return target.addScaledVector(frame.ahead, -twice * velocity.dot(frame.up));
}
