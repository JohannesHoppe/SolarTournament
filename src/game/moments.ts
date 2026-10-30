import { msg } from '../i18n/i18n';
import { ANNOUNCER_MOMENT } from '../music/lines';

/**
 * The big moments of the own pilot, made for the broadcast: a neon banner, the crowd, and for
 * the biggest the announcer. A moment itself changes no score; a streak's kills earn their
 * bonus by game/streaks, every ship's alike.
 */
export type Moment = 'double' | 'triple' | 'multi' | 'supernova' | 'revenge' | 'torpedo' | 'interception' | 'pass' | 'lead' | 'capture' | 'sunk' | 'knockout';

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
  knockout: { banner: msg('KNOCKOUT'), crowd: 0.95, lines: ANNOUNCER_MOMENT.knockout, rank: 6 },
  double: { banner: msg('DOUBLE KILL'), crowd: 0.85, rank: 5 },
  lead: { banner: msg('IN THE LEAD'), crowd: 0.8, rank: 5 },
  torpedo: { banner: msg('TORPEDO KILL'), crowd: 0.7, rank: 4 },
  interception: { banner: msg('INTERCEPTED'), crowd: 0.55, rank: 3 },
  pass: { banner: msg('OVERTAKEN'), crowd: 0.55, rank: 2 },
};

/** What the own pilot's kills and deaths add up to (see ownKill); its streak is counted with every ship's (see game/streaks). */
export class Moments {
  /** The ship that killed the own clone last, until the pilot pays it back. */
  private avenge: string | null = null;

  /** A new round: nobody to avenge. */
  reset() {
    this.avenge = null;
  }

  /** The own clone died, by `killer` (its ship id) or by nothing. */
  died(killer: string | null) {
    this.avenge = killer;
  }

  /**
   * The own pilot killed ship `victim`, the `streak`th kill of its streak (see Streaks), by a nova
   * or otherwise: the moment that makes, or null for a plain kill. A nova's victims fall at once
   * and count as one blast.
   */
  ownKill(victim: string, streak: number, nova: boolean): Moment | null {
    const revenge = victim === this.avenge;
    if (revenge) this.avenge = null;
    if (nova && streak >= 2) return 'supernova';
    if (streak >= 4) return 'multi';
    if (streak === 3) return 'triple';
    if (revenge) return 'revenge';
    if (streak === 2) return 'double';
    return null;
  }
}
