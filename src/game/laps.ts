import * as THREE from 'three';
import { GATES } from './race';

/** The ghost keeps the own ship's pose this often (s of race time): smooth enough to fly against. */
export const GHOST_STEP = 0.1;
/** A ghost keeps at most this many poses (300 s of a lap): a lap that takes longer keeps no ghost. */
const GHOST_MAX = 3000;
/** Numbers per pose: position (units, whole) and orientation (quaternion, three decimals). */
const POSE = 7;

/** A lap time as 1:02.34, rounded to hundredths before the minutes are split off (59.996 s is 1:00.00). */
export function lapClock(seconds: number): string {
  const hundredths = Math.round(seconds * 100);
  return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}

/**
 * The best lap a Host flew in an arena: its time from the pink gate round to the pink gate
 * (s), the split at each gate of the lap (s after the pink gate; index 0 unused), and the
 * ghost, the poses of the own ship every GHOST_STEP seconds of it.
 */
export interface BestLap {
  time: number;
  splits: number[];
  ghost: number[];
}

/** What passing a gate meant for the lap: a split against the best one, a lap done (perhaps the best), or the first lap begun. */
export type LapEvent = { kind: 'start' } | { kind: 'split'; gate: number; split: number; delta: number | null } | { kind: 'lap'; time: number; delta: number | null; best: boolean };

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const turn = new THREE.Quaternion();

/**
 * Times the own racer's laps in one arena: a lap runs from one crossing of the pink gate to
 * the next. Each gate gives a split against the best lap's, and a lap faster than the best
 * becomes the best, with the ghost recorded on the way.
 */
export class LapTimer {
  /** Race time when the running lap began, null before the first crossing of the pink gate. */
  private start: number | null = null;
  private splits: number[] = [];
  private ghost: number[] = [];
  private nextPose = 0;
  /** The splits and ghost of the lap that just ended (see begin). */
  private finished: { splits: number[]; ghost: number[] } = { splits: [], ghost: [] };

  constructor(public best: BestLap | null) {}

  /** The own ship flew through gate `gate` of the lap (0: the pink one) at race time `t`. */
  pass(gate: number, t: number): LapEvent | null {
    if (gate === 0) {
      const begun = this.start;
      this.begin(t);
      if (begun === null) return { kind: 'start' };
      const time = t - begun;
      const best = !this.best || time < this.best.time;
      const delta = this.best ? time - this.best.time : null;
      if (best) this.best = { time, splits: this.finished.splits, ghost: this.finished.ghost };
      return { kind: 'lap', time, delta, best };
    }
    if (this.start === null) return null;
    const split = t - this.start;
    this.splits[gate] = split;
    const before = this.best?.splits[gate];
    return { kind: 'split', gate, split, delta: before ? split - before : null };
  }

  /** A lap begins: the one that ended keeps its splits and its ghost (unless it ran too long for one). */
  private begin(t: number) {
    this.finished = { splits: this.splits, ghost: this.ghost.length < GHOST_MAX * POSE ? this.ghost : [] };
    this.start = t;
    this.splits = new Array<number>(GATES).fill(0);
    this.ghost = [];
    this.nextPose = t;
  }

  /** Seconds of the running lap, or null before it began. */
  lapTime(t: number): number | null {
    return this.start === null ? null : t - this.start;
  }

  /** Keeps the own ship's pose for the ghost, every GHOST_STEP seconds of the running lap. */
  record(t: number, position: THREE.Vector3, orientation: THREE.Quaternion) {
    if (this.start === null) return;
    while (t >= this.nextPose && this.ghost.length < GHOST_MAX * POSE) {
      this.ghost.push(Math.round(position.x), Math.round(position.y), Math.round(position.z), +orientation.x.toFixed(3), +orientation.y.toFixed(3), +orientation.z.toFixed(3), +orientation.w.toFixed(3));
      this.nextPose += GHOST_STEP;
    }
  }

  /** Where the best lap's ghost is at race time `t` of the running lap; false when there is none, or it is through. */
  ghostAt(t: number, position: THREE.Vector3, orientation: THREE.Quaternion): boolean {
    const ghost = this.best?.ghost;
    if (!ghost || this.start === null) return false;
    const k = (t - this.start) / GHOST_STEP;
    const i = Math.floor(k);
    if (i < 0 || (i + 1) * POSE + POSE > ghost.length) return false;
    const a = i * POSE;
    const b = a + POSE;
    const f = k - i;
    position.lerpVectors(from.fromArray(ghost, a), to.fromArray(ghost, b), f);
    orientation.fromArray(ghost, a + 3).slerp(turn.fromArray(ghost, b + 3), f).normalize();
    return true;
  }
}

/** The best laps of every arena as kept in this browser, checked: whatever does not fit is dropped. */
export function parseLaps(text: string | null): Record<string, BestLap> {
  const laps: Record<string, BestLap> = {};
  try {
    const kept = JSON.parse(text ?? '{}') as Record<string, Partial<BestLap>>;
    for (const [arena, lap] of Object.entries(kept)) {
      const numbers = (list: unknown): list is number[] => Array.isArray(list) && list.every((n) => typeof n === 'number' && Number.isFinite(n));
      if (typeof lap?.time !== 'number' || !(lap.time > 0) || !numbers(lap.splits) || lap.splits.length !== GATES || !numbers(lap.ghost) || lap.ghost.length % POSE !== 0) continue;
      laps[arena] = { time: lap.time, splits: lap.splits, ghost: lap.ghost };
    }
  } catch {
    // nothing readable kept: no best laps
  }
  return laps;
}
