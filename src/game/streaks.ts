/**
 * Kill streaks: kills of one ship close after each other make a streak (two a double kill, three
 * a triple, more a multi kill), and the crowd pays for the show: a streak's kills earn a bonus
 * on top of their points. Every ship alike, bots and other browsers' Hosts too; each browser
 * scores the ships it runs (see Game.shipDestroyed), so a remote victim's kill counts in its
 * killer's streak when its browser hears of it. A kill of the own side neither earns a bonus
 * nor counts in a streak, a streak ends with the killer's clone, and nothing counts after the
 * round's end. The own pilot's streak also makes its big moments (see game/moments).
 */

/** Kills of a ship this close after each other (s) make a streak: long enough for a second target in the same fight, too short for the next fight. */
export const STREAK_SECONDS = 4;

/**
 * The bonus for a streak's kill, as a share of a kill's points (500, 200 in a race) by the
 * streak's length: half a kill more for the second (a double kill pays 1,250 for two), a whole
 * kill more for the third and every one after (a triple kill 2,250 for three). So a streak's
 * kill pays at most twice a kill, as a nova's does, never more: the nova stays the biggest
 * show for its single blast. A nova's kills, already counted double, earn no bonus but count
 * in the streak.
 */
export const STREAK_BONUS: readonly number[] = [0, 0, 0.5, 1];

/** The bonus a kill makes, `streak` long (this kill the streak's last), worth `killPoints`, by a nova or not. */
export function streakBonus(streak: number, killPoints: number, nova: boolean): number {
  if (nova) return 0;
  return Math.round(STREAK_BONUS[Math.min(streak, STREAK_BONUS.length - 1)] * killPoints);
}

/** Each ship's run of kills in the round, by its id. */
export class Streaks {
  private readonly runs = new Map<string, { length: number; last: number }>();

  /** Ship `id` killed one of the other side at `now` (s): how long its streak is with this kill. */
  kill(id: string, now: number): number {
    const run = this.runs.get(id);
    const length = run && now - run.last <= STREAK_SECONDS ? run.length + 1 : 1;
    this.runs.set(id, { length, last: now });
    return length;
  }

  /** Ship `id`'s clone died: its streak is over. */
  end(id: string) {
    this.runs.delete(id);
  }

  /** A new round: no streaks. */
  reset() {
    this.runs.clear();
  }
}
