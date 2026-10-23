import * as THREE from 'three';
import type { Controls } from '../input/input';
import { MAIN_THRUST, RCS_THRUST, type FlightModel } from './flight';

/** The upright hold rolls at full rate from this roll error on (1/rad): firm, without overshooting. */
const UPRIGHT_GAIN = 1.2;
/** The upright hold fades out between these steepness values of the nose (sine of the climb angle: about 45° and 65°). */
const UPRIGHT_LET_GO = 0.7;
const UPRIGHT_FREE = 0.9;
/** The brake burns once the nose is this close to retrograde (rad); the flip lets the drive fire there too. */
export const BRAKE_BURN_ANGLE = 0.2;
/** The brake eases the burn over the last BRAKE_EASE seconds of full thrust (s). */
const BRAKE_EASE = 0.3;
/** Below this speed the brake counts the ship as at rest (units/s, 1 m/s). */
export const BRAKE_REST = 20;
/** Once at rest, the brake only burns again above this speed (units/s, 2 m/s). */
const BRAKE_RESUME = 40;
/**
 * Below this speed the brake stops the ship with the thrusters alone and does not turn it
 * (units/s, 50 m/s): the thrusters take it out in about the time a flip would take. A brake
 * that started a flip goes on flipping and burning down to BRAKE_SETTLE (units/s, 15 m/s),
 * though the thrusters take out drift during the turn; only the last few m/s are left to the
 * thrusters, so a slow drift that wanders in direction cannot make the ship flip back and forth.
 */
const BRAKE_FINE = 1000;
const BRAKE_SETTLE = 300;

/** The aim assist takes ships within this angle of the nose (rad, about 4°) and this distance (units, 2 km). */
export const AIM_ASSIST_ANGLE = 0.07;
export const AIM_ASSIST_RANGE = 40000;
/** How hard the aim assist pulls at most (0..1), and the steering gain it pulls with. */
const AIM_ASSIST_STRENGTH = 0.85;
const AIM_ASSIST_GAIN = 6;

const up = new THREE.Vector3();
const assistSteer = { yaw: 0, pitch: 0 };

/**
 * Aim assist: a ship `toTarget` away (world, from the ship) within AIM_ASSIST_ANGLE of the nose
 * pulls the nose onto it, the firmer the closer it already is, and the less the commands in `out`
 * turn the nose elsewhere. The bots aim with a computer too; the pilot still pulls the trigger.
 */
export function assistAim(flight: FlightModel, toTarget: THREE.Vector3, out: Controls): Controls {
  const angle = flight.angleTo(toTarget);
  if (angle >= AIM_ASSIST_ANGLE) return out;
  flight.steer(toTarget, AIM_ASSIST_GAIN, assistSteer);
  const pull = AIM_ASSIST_STRENGTH * (1 - angle / AIM_ASSIST_ANGLE) * (1 - THREE.MathUtils.smoothstep(Math.hypot(out.yaw, out.pitch), 0.3, 0.8));
  out.yaw += (assistSteer.yaw - out.yaw) * pull;
  out.pitch += (assistSteer.pitch - out.pitch) * pull;
  return out;
}
const drift = new THREE.Vector3();
const retrograde = new THREE.Vector3();

/**
 * The Host does not roll; the flight computer keeps the ship upright to the arena (its north pole
 * is up), so there is always a horizon. In steep climbs and dives it lets go, so a loop is not
 * fought halfway through. Writes the roll into `out`.
 */
export function keepUpright(flight: FlightModel, out: Controls): Controls {
  flight.toLocalDirection(up.set(0, 1, 0), up);
  // the ship's nose is -Z, so |up.z| is how steeply it points up or down
  const hold = 1 - THREE.MathUtils.smoothstep(Math.abs(up.z), UPRIGHT_LET_GO, UPRIGHT_FREE);
  out.roll = THREE.MathUtils.clamp(Math.atan2(up.x, up.y) * UPRIGHT_GAIN, -1, 1) * hold;
  return out;
}

/**
 * The brake (held): the flight computer flips the ship head over and burns against the flight
 * until it is at rest, the thrusters taking out the drift across the nose; slow, the thrusters
 * stop it alone. At rest it holds still until gravity has pulled the ship clearly out of rest.
 */
export class Brake {
  /** The ship is at rest. */
  rested = false;
  /** The brake is flipping the ship to burn (see BRAKE_FINE). */
  private flipping = false;

  /** The brake let go. */
  release() {
    this.rested = this.flipping = false;
  }

  /**
   * Writes the commands for one step into `out`, from the Host's `controls` and the health of
   * the drive (`drive`, 0..1: a damaged drive pushes less, so the burn eases off later).
   */
  fly(flight: FlightModel, controls: Readonly<Controls>, drive: number, out: Controls): Controls {
    const speed = flight.velocity.length();
    // at rest the brake holds still until gravity has pulled the ship clearly out of rest, so
    // it does not flicker between resting and burning; the ship rights itself meanwhile
    if (speed < (this.rested ? BRAKE_RESUME : BRAKE_REST)) {
      this.rested = true;
      this.flipping = false;
      keepUpright(flight, Object.assign(out, controls)).thrust = 0;
      return out;
    }
    this.rested = false;
    // the drift in ship space (the nose is -Z): +Z is the speed the drive brakes once flipped
    flight.toLocalDirection(flight.velocity, drift);
    retrograde.copy(flight.velocity).negate();
    const aligned = flight.angleTo(retrograde) < BRAKE_BURN_ANGLE;
    this.flipping = speed > BRAKE_FINE || (this.flipping && speed > BRAKE_SETTLE);
    if (this.flipping) {
      flight.flip(retrograde, 3, Object.assign(out, controls));
      // the burn eases off at the end, so the ship comes to rest instead of reversing
      out.thrust = aligned ? Math.min(1, Math.max(0, drift.z) / (MAIN_THRUST * Math.max(drive, 0.05) * BRAKE_EASE)) : 0;
    } else {
      // the last few m/s: the nose stays where it is and the thrusters stop the ship, so a slow
      // drift that wanders in direction cannot make the ship flip back and forth
      keepUpright(flight, Object.assign(out, controls)).thrust = 0;
      out.strafeZ = THREE.MathUtils.clamp(drift.z / (RCS_THRUST * BRAKE_EASE), -1, 1);
    }
    // the thrusters take out the drift across the nose, which the drive cannot reach
    out.strafeX = THREE.MathUtils.clamp(-drift.x / (RCS_THRUST * BRAKE_EASE), -1, 1);
    out.strafeY = THREE.MathUtils.clamp(-drift.y / (RCS_THRUST * BRAKE_EASE), -1, 1);
    return out;
  }
}
