import { GATES } from './race';

/** A lap time as 1:02.34, rounded to hundredths before the minutes are split off (59.996 s is 1:00.00). */
export function lapClock(seconds: number): string {
  const hundredths = Math.round(seconds * 100);
  return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}

/**
 * The best lap a Host flew in an arena: its time from the pink gate round to the pink gate
 * (s), and the split at each gate of the lap (s after the pink gate; index 0 unused).
 */
export interface BestLap {
  time: number;
  splits: number[];
}

/** What passing a gate meant for the lap: a split against the best one, a lap done (perhaps the best), or the first lap begun. */
export type LapEvent = { kind: 'start' } | { kind: 'split'; gate: number; split: number; delta: number | null } | { kind: 'lap'; time: number; delta: number | null; best: boolean };

/**
 * Times the own racer's laps in one arena: a lap runs from one crossing of the pink gate to
 * the next. Each gate gives a split against the best lap's, and a lap faster than the best
 * becomes the best.
 */
export class LapTimer {
  /** Race time when the running lap began, null before the first crossing of the pink gate. */
  private start: number | null = null;
  private splits: number[] = [];

  constructor(public best: BestLap | null) {}

  /** The own ship flew through gate `gate` of the lap (0: the pink one) at race time `t`. */
  pass(gate: number, t: number): LapEvent | null {
    if (gate === 0) {
      const begun = this.start;
      const splits = this.splits;
      this.start = t;
      this.splits = new Array<number>(GATES).fill(0);
      if (begun === null) return { kind: 'start' };
      const time = t - begun;
      const best = !this.best || time < this.best.time;
      const delta = this.best ? time - this.best.time : null;
      if (best) this.best = { time, splits };
      return { kind: 'lap', time, delta, best };
    }
    if (this.start === null) return null;
    const split = t - this.start;
    this.splits[gate] = split;
    const before = this.best?.splits[gate];
    return { kind: 'split', gate, split, delta: before ? split - before : null };
  }

  /** Seconds of the running lap, or null before it began. */
  lapTime(t: number): number | null {
    return this.start === null ? null : t - this.start;
  }
}

/** The best laps of every arena as kept in this browser, checked: whatever does not fit is dropped, and only time and splits are kept. */
export function parseLaps(text: string | null): Record<string, BestLap> {
  const laps: Record<string, BestLap> = {};
  try {
    const kept = JSON.parse(text ?? '{}') as Record<string, Partial<BestLap>>;
    for (const [arena, lap] of Object.entries(kept)) {
      const numbers = (list: unknown): list is number[] => Array.isArray(list) && list.every((n) => typeof n === 'number' && Number.isFinite(n));
      if (typeof lap?.time !== 'number' || !(lap.time > 0) || !numbers(lap.splits) || lap.splits.length !== GATES) continue;
      laps[arena] = { time: lap.time, splits: lap.splits };
    }
  } catch {
    // nothing readable kept: no best laps
  }
  return laps;
}
