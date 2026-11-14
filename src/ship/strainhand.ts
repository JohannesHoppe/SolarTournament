import type { Controls } from '../input/input';
import { exp } from '../detmath';
import { METERS_PER_UNIT } from './flight';

/**
 * Extreme g: what still costs a clone its steadiness. The Games' clones are seasoned pilots in
 * their gel (see Ship.strain): a full burn, the hardest turn of a race, a dogfight's pulls and an
 * overdrive's shove they fly through unhindered, only their view darkening. Past EXTREME_G (g,
 * beyond the gel's 25 g and the overdrive's shove) the load bites: a carve in air at 35 to 40 g,
 * a cable's swing at 30 g, a hard ram. The bite (0..1) builds while the load stays past it, full
 * after EXTREME_ONSET seconds, and fades in EXTREME_FADE once it eases.
 */
export const EXTREME_G = 38;
const EXTREME_ONSET = 0.5;
const EXTREME_FADE = 1;
/** One standard gravity in units/s². */
const G = 9.81 / METERS_PER_UNIT;

/** The bite of extreme g (0..1) after `dt` seconds under a load of `acceleration` (units/s², see Ship feltLoad). */
export function extremeAfter(bite: number, acceleration: number, dt: number): number {
  const next = acceleration / G > EXTREME_G ? bite + dt / EXTREME_ONSET : bite - dt / EXTREME_FADE;
  return Math.max(0, Math.min(1, next));
}

/**
 * A Host's hands under extreme g: the same handicap the bite puts on a bot's aim and reflexes
 * (see ship/bots, STRAIN_AIM and STRAIN_REACTION), growing with it:
 * - heavy arms: the stick answers late, eased in with a time constant of HAND_LAG (s) at the full
 *   bite, the bot's 0.15 s of a later trigger;
 * - an unsteady hand: a slow wobble added to the stick, HAND_WOBBLE of full deflection at the full
 *   bite, its swings lasting about WOBBLE_TIME (s): the nose wanders by about half a degree, the
 *   half again a bot's aim scatters at the full bite at fighting range.
 * Never a blackout and never a loss of control: the Host still steers, only worse.
 */
export const HAND_LAG = 0.15;
export const HAND_WOBBLE = 0.025;
const WOBBLE_TIME = 0.15;

/** The stick as a clone's hands give it under extreme g, step by step; unbitten hands pass the stick on as it is and settle there. */
export class StrainHand {
  private yaw = 0;
  private pitch = 0;
  private wobbleYaw = 0;
  private wobblePitch = 0;

  /**
   * The stick `read` as the hands give it at the bite `bite` (see extremeAfter) over a step of
   * `dt` (s), into `out` (the rest of `read` copied as it is); `random` draws in [0, 1) for the
   * wobble.
   */
  step(read: Readonly<Controls>, bite: number, dt: number, random: () => number, out: Controls): Controls {
    Object.assign(out, read);
    if (bite <= 0 || dt <= 0) {
      this.yaw = read.yaw;
      this.pitch = read.pitch;
      this.wobbleYaw = this.wobblePitch = 0;
      return out;
    }
    // heavy arms: the stick eased in
    const follow = 1 - exp(-dt / (HAND_LAG * bite));
    this.yaw += (read.yaw - this.yaw) * follow;
    this.pitch += (read.pitch - this.pitch) * follow;
    // an unsteady hand: a slow random wobble, as wide as the load bites
    const keep = exp(-dt / WOBBLE_TIME);
    const kick = HAND_WOBBLE * bite * Math.sqrt(3 * (1 - keep * keep));
    this.wobbleYaw = this.wobbleYaw * keep + (random() * 2 - 1) * kick;
    this.wobblePitch = this.wobblePitch * keep + (random() * 2 - 1) * kick;
    out.yaw = Math.max(-1, Math.min(1, this.yaw + this.wobbleYaw));
    out.pitch = Math.max(-1, Math.min(1, this.pitch + this.wobblePitch));
    return out;
  }
}
