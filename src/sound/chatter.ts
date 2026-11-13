import { CHATTER } from '../music/lines';

/**
 * Nicole's chatter in real rounds: what she says at a moment that comes again and again (the
 * round's start, a lost clone, the next clone, the round's end, a race's places, a capture). A
 * Host hears these moments dozens of times an evening; the same sentence each time is tuned out
 * by the third round. So she picks from a pool, never one of the last she said from it, often
 * says nothing at all, says less the more she has said just now, and praises seldom. Warnings
 * and alarms never pass through here: what keeps the clone alive is always said.
 */
export type ChatterMoment = keyof typeof CHATTER;

/**
 * Each moment: how often she stays silent anyway (0..1), and the least time (s) between two of
 * its lines. Praise (a pass) is rare and far apart, about once a lap of a race at most; the
 * start, the lost clone and the next clone she leaves out a good third of the time.
 */
export const CHATTER_RULES: Record<ChatterMoment, { silence: number; gap: number }> = {
  launch: { silence: 0.35, gap: 0 },
  death: { silence: 0.4, gap: 0 },
  reprint: { silence: 0.45, gap: 0 },
  roundOver: { silence: 0.3, gap: 0 },
  passed: { silence: 0.6, gap: 45 },
  lead: { silence: 0.3, gap: 30 },
  lostLead: { silence: 0.3, gap: 30 },
  passedBy: { silence: 0.6, gap: 30 },
  captured: { silence: 0.2, gap: 0 },
};

/** Least time (s) between any two lines of chatter: she is never constant. */
export const CHATTER_GAP = 6;
/** Within this long (s) after she last spoke, she stays silent more often, by CHATTER_HUSH more. */
export const CHATTER_RECENT = 20;
export const CHATTER_HUSH = 0.25;
/** She stays silent at most this often, whatever adds up, so a moment is never mute for good. */
const CHATTER_MOST_SILENT = 0.9;

/** How many of a pool's last lines she never repeats: half the pool, at most five. */
export const recentWindow = (size: number) => Math.min(5, Math.floor(size / 2));

export class Chatter {
  /** When she last said a line of chatter (s on the caller's clock), and each moment's last. */
  private lastSaid = -Infinity;
  private readonly lastOf = new Map<ChatterMoment, number>();
  /** The pools' lines said last, newest last, for no repeats. */
  private readonly recent = new Map<ChatterMoment, number[]>();

  /** `random` in [0, 1): Math.random in the game (her mood is no shared state), a fixed sequence in tests. */
  constructor(private readonly random: () => number = Math.random) {}

  /**
   * The line she says at `moment` at `now` (s, a clock that runs on through ads and pauses),
   * or null when she keeps quiet. A line returned counts as said.
   */
  line(moment: ChatterMoment, now: number): string | null {
    const rule = CHATTER_RULES[moment];
    if (now - this.lastSaid < CHATTER_GAP) return null;
    if (now - (this.lastOf.get(moment) ?? -Infinity) < rule.gap) return null;
    const hush = now - this.lastSaid < CHATTER_RECENT ? CHATTER_HUSH : 0;
    if (this.random() < Math.min(CHATTER_MOST_SILENT, rule.silence + hush)) return null;
    const pool: readonly string[] = CHATTER[moment];
    const recent = this.recent.get(moment) ?? [];
    const open = pool.map((_, i) => i).filter((i) => !recent.includes(i));
    const index = open[Math.floor(this.random() * open.length)];
    recent.push(index);
    while (recent.length > recentWindow(pool.length)) recent.shift();
    this.recent.set(moment, recent);
    this.lastSaid = now;
    this.lastOf.set(moment, now);
    return pool[index];
  }
}
