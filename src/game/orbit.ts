import * as THREE from 'three';
import type { Well } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { MAIN_THRUST, MAX_SPEED } from '../ship/flight';
import { type AlarmLevel, WELL_CRITICAL, wellLevel } from './alarms';

/**
 * The flight computer's orbit readout near a massive body. It keeps asking: if the ship went
 * into free drift now, with nothing but the body's pull on it, where would it fly? Without
 * thrust a ship in a well of one body flies a conic section about its center: an ellipse
 * around it, or a fall into it, or a hyperbola away for good. The two numbers that decide
 * whether that path is safe are its nearest point to the center (periapsis) and its farthest
 * (apoapsis). The pull of the field's rocks is left out: next to the hole's it is a rounding error.
 *
 * A path is a stable orbit when it is bound (it comes back), when its periapsis stays outside
 * the reach where the body's pull alone takes WELL_CRITICAL of the drive's thrust (so from any
 * point of it a full burn away still gets the ship out, with the rest to spare; see
 * escapeLoad), and when its apoapsis stays inside the arena (no clock of the arena's edge ever
 * runs). With the autopilot on such a path is ORBIT READY; in free drift it is flown: STABLE
 * ORBIT, and the well's alarms are quiet, since the ship falls around the body and never into it.
 */
export type OrbitState = 'ready' | 'stable' | 'falls' | 'leaves';

/** The conic a ship would fly without thrust about a well's center (units, units/s). */
export interface Orbit {
  /** Its nearest distance from the center: 0 for a fall straight in. */
  periapsis: number;
  /** Its farthest distance from the center; Infinity for a path that never comes back. */
  apoapsis: number;
  /** The speed of a circular orbit at the ship's distance. */
  circular: number;
  /** The speed away from the center (negative: towards it). */
  radial: number;
}

/**
 * Entering an orbit takes this share of room beyond the bounds (a periapsis this much farther
 * out, an apoapsis this much farther in); an orbit already held keeps its state up to the
 * bounds themselves, so a path right on one does not flicker in and out of it.
 */
export const ORBIT_SLACK = 0.02;

const arm = new THREE.Vector3();
const spin = new THREE.Vector3();

/** The well's strength: its pull times the square of the distance (units³/s²). */
export const wellMu = (well: Well) => well.surfaceGravity * well.radius * well.radius;

/** The conic a ship at `position` with `velocity` flies about the well's center without thrust, into `out`. */
export function orbitOf(well: Well, position: THREE.Vector3, velocity: THREE.Vector3, out: Orbit): Orbit {
  const mu = wellMu(well);
  arm.subVectors(position, well.position);
  const r = Math.max(arm.length(), 1);
  const energy = velocity.lengthSq() / 2 - mu / r;
  const h2 = spin.crossVectors(arm, velocity).lengthSq();
  // the eccentricity, from the energy and the angular momentum; p is the semi-latus rectum
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h2) / (mu * mu)));
  const p = h2 / mu;
  out.periapsis = p / (1 + e);
  // bound: the two ends of the major axis, -mu/energy long (a fall straight in too: its apoapsis is where it stops climbing)
  out.apoapsis = energy < 0 ? -mu / energy - out.periapsis : Infinity;
  out.circular = Math.sqrt(mu / r);
  out.radial = arm.dot(velocity) / r;
  return out;
}

/**
 * The nearest a stable orbit may come to the well's center (units): where the pull alone
 * takes WELL_CRITICAL of `thrust`, and never inside the body.
 */
export const safePeriapsis = (well: Well, thrust: number) => Math.max(well.radius, Math.sqrt(wellMu(well) / (WELL_CRITICAL * Math.max(thrust, 1))));

/** The farthest a stable orbit may reach from the well's center (units): the arena's edge, measured from the arena's center. */
export const orbitRoom = (well: Well) => ARENA_LIMIT - well.position.length();

/**
 * Whether an orbit fits the arena at all: a circle between the safe periapsis of a whole drive
 * and the arena's edge, flown no faster than the speed limit. About the black hole it does;
 * about Jupiter, whose center lies far below its arena, no orbit around it fits inside, and
 * its air would brake any orbit anyway, so the readout shows only at the hole.
 */
export function orbitable(well: Well | null): well is Well {
  if (!well) return false;
  const room = orbitRoom(well);
  return room > safePeriapsis(well, MAIN_THRUST) && Math.sqrt(wellMu(well) / room) <= MAX_SPEED;
}

/**
 * What the readout says of a conic: STABLE ORBIT in free drift (`drifting`), ORBIT READY with
 * the autopilot on; else what is wrong with it: it falls into the safe periapsis, or it leaves
 * the arena, whichever it meets first. `held`: the state before was an orbit (see ORBIT_SLACK).
 */
export function orbitState(orbit: Orbit, safe: number, room: number, drifting: boolean, held: boolean): OrbitState {
  const slack = held ? 0 : ORBIT_SLACK;
  const low = orbit.periapsis < safe * (1 + slack);
  const high = orbit.apoapsis > room * (1 - slack);
  // both: moving out, it leaves before it comes back to fall; moving in, it falls first
  if (low && (!high || orbit.radial < 0)) return 'falls';
  if (high) return 'leaves';
  return drifting ? 'stable' : 'ready';
}

const reading: Orbit = { periapsis: 0, apoapsis: 0, circular: 0, radial: 0 };

/**
 * The readout for a ship: its conic about the well (into `out`) and its state, with a drive of
 * `thrust` (less when damaged: its safe periapsis lies farther out), in free drift or not, and
 * whether its state before was an orbit.
 */
export function readOrbit(well: Well, position: THREE.Vector3, velocity: THREE.Vector3, thrust: number, drifting: boolean, held: boolean, out: Orbit = reading): OrbitState {
  orbitOf(well, position, velocity, out);
  return orbitState(out, safePeriapsis(well, thrust), orbitRoom(well), drifting, held);
}

/**
 * The well's alarm at a hold of `load` (see escapeLoad): none while the ship flies a stable
 * orbit, since it falls around the body and never into it; at once again, by the hold, as soon
 * as anything (a burn, a ram, a hit) has put it on a path that is none.
 */
export const wellAlarmLevel = (load: number, state: OrbitState | null): AlarmLevel | null => (state === 'stable' ? null : wellLevel(load));

/** The same line of Nicole's comes again only after this many seconds: a Host on the edge of an orbit hears it once, not on every flicker. */
export const ORBIT_CALL_GAP = 20;

/**
 * When Nicole speaks of the orbit: "Orbit ready" when the path becomes one with the autopilot
 * on (coming from no orbit, not from the orbit flown), "Entering stable orbit" when the ship
 * flies one in free drift; each at most once in ORBIT_CALL_GAP seconds. A line Nicole could not
 * say yet (she was speaking) is tried again every frame while the path stays what it names.
 */
export class OrbitCalls {
  private state: OrbitState | null = null;
  /** The line due and not said yet. */
  private due: OrbitLine | null = null;
  private readonly saidAt: Record<OrbitLine, number> = { ready: -Infinity, stable: -Infinity };

  /**
   * The state of this frame (null: no readout) and `say`, which speaks a line and tells whether
   * it was spoken; returns the line said now, if any.
   */
  update(state: OrbitState | null, now: number, say: (line: OrbitLine) => boolean = SPOKEN): OrbitLine | null {
    const was = this.state;
    this.state = state;
    if (state !== was) {
      const fresh = state === 'stable' || (state === 'ready' && was !== 'stable') ? state : null;
      this.due = fresh && now - this.saidAt[fresh] >= ORBIT_CALL_GAP ? fresh : null;
    }
    const line = this.due;
    if (!line || !say(line)) return null;
    this.saidAt[line] = now;
    this.due = null;
    return line;
  }

  reset() {
    this.state = null;
    this.due = null;
  }
}

type OrbitLine = 'ready' | 'stable';
const SPOKEN = () => true;
