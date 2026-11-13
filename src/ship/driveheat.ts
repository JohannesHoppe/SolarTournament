/**
 * The overdrive in a race: a boost with a risk (see Game.overdrive). It recharges in
 * BOOST_RECHARGE seconds (s, 8) instead of the 20 of every other mode, and the main drive keeps
 * burning after it; instead every shove heats the drive by BOOST_HEAT on a gauge of its own (40
 * of BURNOUT_HEAT, 100), which sheds DRIVE_HEAT_SHED a second (1). Past BURNOUT_HEAT the drive
 * burns out: it gives no thrust for BURNOUT_SECONDS (s, 6) and the hull loses BURNOUT_DAMAGE (20
 * points). So two shoves as close together as the recharge lets them are safe (40, then 72), a
 * third that soon is not (104); a racer who waits until the gauge is down to 60 may shove again.
 * The boost never takes a ship faster than the tournament's limit plus one shove (see
 * BOOST_CAP in Game), so it lifts a racer back to speed out of a bend rather than piling speed on
 * speed.
 */
export const BOOST_RECHARGE = 8;
export const BOOST_HEAT = 40;
export const DRIVE_HEAT_SHED = 1;
export const BURNOUT_HEAT = 100;
export const BURNOUT_SECONDS = 6;
export const BURNOUT_DAMAGE = 20;

/** The drive's heat gauge in a race (see BOOST_HEAT): its level as of a game time, shedding by itself. */
export class DriveHeat {
  private level = 0;
  private at = 0;

  /** The gauge's level at game time `now` (0 cold, BURNOUT_HEAT and more burnt out). */
  read(now: number): number {
    return Math.max(0, this.level - DRIVE_HEAT_SHED * Math.max(0, now - this.at));
  }

  /** Whether a shove at `now` would take the gauge past BURNOUT_HEAT. */
  burns(now: number): boolean {
    return this.read(now) + BOOST_HEAT > BURNOUT_HEAT;
  }

  /** A shove at `now` heats the drive; returns whether it burned out. */
  shove(now: number): boolean {
    this.level = this.read(now) + BOOST_HEAT;
    this.at = now;
    return this.level > BURNOUT_HEAT;
  }

  /** A fresh drive: cold. */
  reset() {
    this.level = 0;
    this.at = 0;
  }
}
