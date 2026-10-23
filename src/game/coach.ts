import { storageGet, storageSet } from '../storage';
import { TIPS } from '../music/lines';

/** Nicole's tips, by name (see TIPS). */
export type Tip = keyof typeof TIPS;

/** How often each tip is given before a Host has heard enough of it: the briefing of a mode once, a tip of the fight a few times, until it sits. */
const TIMES: Partial<Record<Tip, number>> = { race: 1, deathmatch: 1, survival: 1, flag: 1, fleet: 1 };
const TIP_TIMES = 3;
/** How often this browser has heard each tip, so a Host who knows a thing is not told again. */
const TIPS_KEY = 'solartournament.tips';

/**
 * Nicole as a coach in real rounds: the briefing of a mode the first time a Host plays it, and
 * a tip the moment it matters (a ship on the tail, a hot laser, a torpedo coming). Each tip is
 * given only a few times, then the Host is trusted with it.
 */
export class Coach {
  private readonly heard: Partial<Record<Tip, number>> = {};
  /** Tips given in this round: one is given at most once a round. */
  private readonly given = new Set<Tip>();

  constructor() {
    try {
      const kept: unknown = JSON.parse(storageGet(TIPS_KEY) ?? '{}');
      if (kept && typeof kept === 'object') for (const tip of Object.keys(TIPS) as Tip[]) if (Number.isInteger((kept as Record<string, unknown>)[tip])) this.heard[tip] = (kept as Record<Tip, number>)[tip];
    } catch {
      // a broken entry: every tip again
    }
  }

  /** A new round: every tip may come once more. */
  newRound() {
    this.given.clear();
  }

  /** Whether a tip is still due: not given this round, and heard fewer times than it is given. */
  due(tip: Tip) {
    return !this.given.has(tip) && (this.heard[tip] ?? 0) < (TIMES[tip] ?? TIP_TIMES);
  }

  /** Gives a tip that is still due through `say` (false: it could not be said, and it stays due); true when it was given. */
  give(tip: Tip, say: (line: string) => boolean): boolean {
    if (!this.due(tip) || !say(TIPS[tip])) return false;
    this.given.add(tip);
    this.heard[tip] = (this.heard[tip] ?? 0) + 1;
    storageSet(TIPS_KEY, JSON.stringify(this.heard));
    return true;
  }
}
