import { msg } from '../i18n/i18n';
import { ANNOUNCER_MOMENT } from '../music/lines';

/**
 * The big moments of the own pilot, made for the broadcast: a neon banner, the crowd, and for
 * the biggest the announcer. Only the show: no moment changes a score.
 */
export type Moment = 'double' | 'triple' | 'multi' | 'supernova' | 'revenge' | 'torpedo' | 'interception' | 'pass' | 'lead' | 'capture' | 'sunk';

/**
 * Each moment: its banner, how loud the crowd gets (0..1; 1 erupts), the announcer's lines (for
 * the biggest), and its rank: a banner gives way only to one of the same rank or higher.
 */
export const MOMENTS: Record<Moment, { banner: string; crowd: number; lines?: readonly string[]; rank: number }> = {
  multi: { banner: msg('MULTI KILL'), crowd: 1, lines: ANNOUNCER_MOMENT.multi, rank: 9 },
  supernova: { banner: msg('SUPERNOVA'), crowd: 1, lines: ANNOUNCER_MOMENT.supernova, rank: 9 },
  triple: { banner: msg('TRIPLE KILL'), crowd: 1, lines: ANNOUNCER_MOMENT.triple, rank: 8 },
  sunk: { banner: msg('BATTLESHIP DOWN'), crowd: 1, rank: 8 },
  capture: { banner: msg('CORE CAPTURED'), crowd: 1, rank: 7 },
  revenge: { banner: msg('REVENGE'), crowd: 0.9, lines: ANNOUNCER_MOMENT.revenge, rank: 6 },
  double: { banner: msg('DOUBLE KILL'), crowd: 0.85, rank: 5 },
  lead: { banner: msg('IN THE LEAD'), crowd: 0.8, rank: 5 },
  torpedo: { banner: msg('TORPEDO KILL'), crowd: 0.7, rank: 4 },
  interception: { banner: msg('INTERCEPTED'), crowd: 0.55, rank: 3 },
  pass: { banner: msg('OVERTAKEN'), crowd: 0.55, rank: 2 },
};

/** Kills of the own pilot this close after each other (s) make a streak: two a double kill, three a triple, more a multi kill. */
export const STREAK_SECONDS = 4;

/** What the own pilot's kills and deaths add up to (see ownKill). */
export class Moments {
  private streak = 0;
  private lastKill = -Infinity;
  /** The ship that killed the own clone last, until the pilot pays it back. */
  private avenge: string | null = null;

  /** A new round: no streak, nobody to avenge. */
  reset() {
    this.streak = 0;
    this.lastKill = -Infinity;
    this.avenge = null;
  }

  /** The own clone died, by `killer` (its ship id) or by nothing. */
  died(killer: string | null) {
    this.streak = 0;
    this.lastKill = -Infinity;
    this.avenge = killer;
  }

  /**
   * The own pilot killed ship `victim` at `now` (s), by a nova or otherwise: the moment that makes,
   * or null for a plain kill. A nova's victims fall at once and count as one blast.
   */
  ownKill(victim: string, now: number, nova: boolean): Moment | null {
    this.streak = now - this.lastKill <= STREAK_SECONDS ? this.streak + 1 : 1;
    this.lastKill = now;
    const revenge = victim === this.avenge;
    if (revenge) this.avenge = null;
    if (nova && this.streak >= 2) return 'supernova';
    if (this.streak >= 4) return 'multi';
    if (this.streak === 3) return 'triple';
    if (revenge) return 'revenge';
    if (this.streak === 2) return 'double';
    return null;
  }
}
