import * as THREE from 'three';
import type { Well } from '../world/asteroids';

/**
 * The flight computer's alarms, tiered like a fighter's master caution: CAUTION (something to
 * watch: a calm chime), WARNING (act soon: a faster double beep, Nicole speaks), CRITICAL (act
 * now: a siren, a pulsing red edge, Nicole urgent). During a frame the game raises what is
 * wrong; the alarms keep one entry per danger and rank them, the worst first, and only the
 * worst one sounds. Any part of the game raises its own through `Game.alarms.raise`, with a
 * direction and a countdown where it has them (a comet, a solar flare's front).
 */
export type AlarmLevel = 'caution' | 'warning' | 'critical';
export const ALARM_RANK: Record<AlarmLevel, number> = { caution: 1, warning: 2, critical: 3 };

/**
 * The tone of a danger that has a beep of its own (an impact ahead, a torpedo, a nose on the
 * own ship, a nova core); any other alarm sounds the tone of its level.
 */
export type AlarmTone = 'impact' | 'torpedo' | 'tail' | 'locked' | 'tracked' | 'nova';

/** What a part of the game reports: a danger by its id, how bad, what the HUD says, where it comes from and in how many seconds. */
export interface AlarmRaise {
  id: string;
  level: AlarmLevel;
  /** The line in the HUD's alarm list, translated; empty when the danger shows elsewhere (the lock warning). */
  text: string;
  /** Where the danger comes from (world direction from the own ship, need not be unit length). */
  direction?: THREE.Vector3 | null;
  /** Seconds until it hits, shown behind the text. */
  seconds?: number | null;
  tone?: AlarmTone | null;
}

/** A danger as the alarms keep it: raised this frame or not, and at which level the frame before. */
export interface Alarm {
  id: string;
  level: AlarmLevel;
  text: string;
  readonly direction: THREE.Vector3;
  hasDirection: boolean;
  seconds: number | null;
  tone: AlarmTone | null;
  active: boolean;
  /** The level it had the frame before (null: it was not raised), to tell a new or worse alarm. */
  was: AlarmLevel | null;
}

export class Alarms {
  private readonly byId = new Map<string, Alarm>();
  /** The alarms raised in the frame that ended, the worst first (see finish). */
  readonly list: Alarm[] = [];

  /** A new frame: every alarm waits to be raised again. */
  begin() {
    for (const alarm of this.byId.values()) {
      alarm.was = alarm.active ? alarm.level : null;
      alarm.active = false;
    }
  }

  raise(report: AlarmRaise) {
    let alarm = this.byId.get(report.id);
    if (!alarm) {
      alarm = { id: report.id, level: report.level, text: '', direction: new THREE.Vector3(), hasDirection: false, seconds: null, tone: null, active: false, was: null };
      this.byId.set(report.id, alarm);
    }
    // the same danger raised twice in a frame keeps its worst
    if (alarm.active && ALARM_RANK[alarm.level] >= ALARM_RANK[report.level]) return;
    alarm.active = true;
    alarm.level = report.level;
    alarm.text = report.text;
    alarm.hasDirection = !!report.direction;
    if (report.direction) alarm.direction.copy(report.direction);
    alarm.seconds = report.seconds ?? null;
    alarm.tone = report.tone ?? null;
  }

  /** Ranks the alarms raised this frame into `list`, the worst first (by level, then the soonest countdown). */
  finish() {
    const list = this.list;
    list.length = 0;
    for (const alarm of this.byId.values()) if (alarm.active) list.push(alarm);
    list.sort((a, b) => ALARM_RANK[b.level] - ALARM_RANK[a.level] || (a.seconds ?? Infinity) - (b.seconds ?? Infinity));
  }

  /** The worst alarm of the frame, or null. */
  get top(): Alarm | null {
    return this.list[0] ?? null;
  }

  /** Whether an alarm came up this frame or got worse. */
  rose(alarm: Alarm) {
    return alarm.was === null || ALARM_RANK[alarm.level] > ALARM_RANK[alarm.was];
  }
}

/** Seconds between the chimes of a CAUTION that stays up. */
const CAUTION_REPEAT = 5;
/** Seconds between the double beeps of a WARNING. */
const WARNING_REPEAT = 1;
/** Seconds between the two notes of the CRITICAL siren. */
const SIREN_STEP = 0.28;

/** Seconds between the beeps of a danger with a countdown: a sixth of the seconds left, within `shortest` and `longest`. */
export const countdownBeat = (seconds: number, shortest: number, longest: number) => THREE.MathUtils.clamp(seconds / 6, shortest, longest);

/**
 * Sounds the worst alarm in the headset, and only that one: a danger with a beep of its own
 * beeps it (faster as an impact or a torpedo comes closer), any other the tone of its level. A
 * new worst alarm sounds at once.
 */
export class AlarmTones {
  private next = 0;
  private high = false;
  private id: string | null = null;
  private level: AlarmLevel | null = null;

  play(top: Alarm | null, now: number, sound: { beep(frequency: number, duration?: number, volume?: number, delay?: number): void }) {
    if (!top) {
      this.id = this.level = null;
      return;
    }
    if (top.id !== this.id || top.level !== this.level) {
      this.id = top.id;
      this.level = top.level;
      this.next = now;
    }
    if (now < this.next) return;
    switch (top.tone ?? top.level) {
      case 'impact':
        sound.beep(980, 0.05, 0.12);
        this.next = now + countdownBeat(top.seconds ?? 3, 0.1, 0.5);
        break;
      case 'torpedo':
        sound.beep(1480, 0.05, 0.16);
        this.next = now + countdownBeat(top.seconds ?? Infinity, 0.07, 0.6);
        break;
      case 'tail':
        sound.beep(1760, 0.04, 0.14);
        this.next = now + 0.08;
        break;
      case 'locked':
        sound.beep(1560, 0.04, 0.1);
        this.next = now + 0.1;
        break;
      case 'tracked':
        sound.beep(1170, 0.04, 0.1);
        this.next = now + 0.35;
        break;
      case 'nova':
        this.high = !this.high;
        sound.beep(this.high ? 1320 : 880, 0.2, 0.18);
        this.next = now + 0.25;
        break;
      case 'caution':
        // a calm falling chime
        sound.beep(880, 0.12, 0.08);
        sound.beep(660, 0.18, 0.08, 0.14);
        this.next = now + CAUTION_REPEAT;
        break;
      case 'warning':
        sound.beep(1040, 0.07, 0.12);
        sound.beep(1040, 0.07, 0.12, 0.12);
        this.next = now + WARNING_REPEAT;
        break;
      case 'critical':
        this.high = !this.high;
        sound.beep(this.high ? 1180 : 790, SIREN_STEP * 0.9, 0.16);
        this.next = now + SIREN_STEP;
        break;
    }
  }
}

/**
 * How hard a gravity well holds a ship, as a share of what its drive can do (1: the drive can
 * no longer get it out). It is the well's pull at the ship's distance plus the deceleration it
 * would need to stop its fall before the body (v² / 2s for the speed towards it), over the
 * drive's thrust; a ship moving away only counts the pull.
 */
export function escapeLoad(well: Well, position: THREE.Vector3, velocity: THREE.Vector3, thrust: number): number {
  const distance = Math.max(position.distanceTo(well.position), 1);
  const pull = (well.surfaceGravity * well.radius * well.radius) / (distance * distance);
  const gap = Math.max(1, distance - well.radius);
  // the speed towards the well's center
  const inward = -(velocity.x * (position.x - well.position.x) + velocity.y * (position.y - well.position.y) + velocity.z * (position.z - well.position.z)) / distance;
  const braking = inward > 0 ? (inward * inward) / (2 * gap) : 0;
  return (pull + braking) / Math.max(thrust, 1);
}

/** The escape gauge shows from this load on (a share of the drive's thrust), before the first alarm. */
export const WELL_GAUGE = 0.08;
/** CAUTION from this load: the pull is felt; Nicole names the well. */
export const WELL_CAUTION = 0.15;
/** WARNING from this load: Nicole wants a burn away from it. */
export const WELL_WARNING = 0.35;
/** CRITICAL from this load: full burn now, or never. */
export const WELL_CRITICAL = 0.6;
/** From this load on the drive can no longer get the ship out: the point of no return. */
export const WELL_LOST = 1;

/** Below this load the well has let go: Nicole warns again from CAUTION on the next time. */
export const WELL_RELEASE = 0.1;

export function wellLevel(load: number): AlarmLevel | null {
  return load >= WELL_CRITICAL ? 'critical' : load >= WELL_WARNING ? 'warning' : load >= WELL_CAUTION ? 'caution' : null;
}

/** The hull is failing at or below this (of MAX_HULL 100): one more hit may be the last. */
export const HULL_CRITICAL = 30;
/** An impact this close (seconds) is CRITICAL; farther it is a WARNING. */
export const IMPACT_CRITICAL = 1.5;
/** Outside the field, the last seconds before the clone is lost are CRITICAL. */
export const FIELD_CRITICAL = 3;
/** The heartbeat's strength (0..1, like the g-force strain) with a failing hull, and deep in a well (from WELL_CRITICAL). */
export const HEART_HULL = 0.6;
export const HEART_WELL = 0.85;
/** Short glitches of the link per second on average while an alarm is CRITICAL. */
export const CRITICAL_GLITCHES = 0.5;
/** Death this close (seconds of impact, or a well past return) silences the radio for SILENCE_SECONDS, at most once every SILENCE_COOLDOWN seconds. */
export const SILENCE_BEFORE = 0.8;
export const SILENCE_SECONDS = 1.2;
export const SILENCE_COOLDOWN = 8;
