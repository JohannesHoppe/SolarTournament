/**
 * The development log: what happened in a round, as data, so a balance problem is read from
 * events instead of guessed. It exists only in development (`npm run dev`, the browser tests and
 * the balance runs); in production `devlog` is null and every call site (`devlog?.…`) costs
 * nothing, not even its arguments. A ring buffer of LOG_CAPACITY events, cleared at the start of
 * every round; read it from the console as `game.log` (see the README of e2e/ and CLAUDE.md).
 */

/** A bot's decision (see Bot.think): what it does now and why. */
export interface DecisionEvent {
  kind: 'decision';
  t: number;
  ship: string;
  /** The bot's skill, the mean of aim, reflexes and daring. */
  skill: number;
  decision: string;
  reason: string;
}

/** Two ships touching (see Game.collideShips): how fast they closed, the impulse each took, and what came of it. */
export interface ContactEvent {
  kind: 'contact';
  t: number;
  a: string;
  b: string;
  /** Closing speed and the impulse on each ship (m/s). */
  closing: number;
  impulse: number;
  outcome: 'bump' | 'shove' | 'ram';
  /** Hull each ship lost to it. */
  hullA: number;
  hullB: number;
}

/** A ship that died: cause, where, how fast, and what it and its killer had decided just before. */
export interface DeathEvent {
  kind: 'death';
  t: number;
  ship: string;
  /** Skill of a bot, null for a Host. */
  skill: number | null;
  /** rock, hull, gate, wreck, ram, knockout, laser, torpedo, nova, plume, flare, comet, shower, well, space, battery, exhaust, blast, remote. */
  cause: string;
  /** For a knockout: what the shoved ship crashed into. */
  into: string | null;
  killer: string | null;
  /** How far the killer was (m). */
  range: number | null;
  /** Position (m), speed (m/s) and the speed of the impact that killed it (m/s; 0 when nothing struck). */
  position: [number, number, number];
  speed: number;
  impact: number;
  /** More about it: where a gate was struck. */
  note: string | null;
  /** The victim's decision at its death, and the decisions of victim and killer in the DECISION_WINDOW before. */
  doing: string | null;
  decisions: DecisionEvent[];
}

/** A shove (see Game.shoved): who struck whom how hard. A knockout shows as a death with cause "knockout". */
export interface ShoveEvent {
  kind: 'shove';
  t: number;
  by: string;
  ship: string;
  closing: number;
}

/** A bot's act that is no lasting decision: a shove, a hook, a torpedo. */
export interface ActEvent {
  kind: 'act';
  t: number;
  ship: string;
  act: string;
  detail: string;
}

export type LogEvent = DecisionEvent | ContactEvent | DeathEvent | ShoveEvent | ActEvent;

/** Events kept (about a round's worth of eight bots changing their minds every second or so). */
const LOG_CAPACITY = 20000;
/** A death is linked to the decisions of victim and killer this long before it (s). */
const DECISION_WINDOW = 3;

const round1 = (value: number) => Math.round(value * 10) / 10;

export class DevLog {
  private readonly buffer: LogEvent[] = [];
  private next = 0;
  /** The round the events belong to. */
  mode = '';
  arena = '';
  /** The last decision of each ship, so only a change is logged. */
  private readonly current = new Map<string, string>();

  /** A new round: an empty log. */
  begin(mode: string, arena: string) {
    this.buffer.length = 0;
    this.next = 0;
    this.current.clear();
    this.mode = mode;
    this.arena = arena;
  }

  add(event: LogEvent) {
    if (this.buffer.length < LOG_CAPACITY) this.buffer.push(event);
    else this.buffer[this.next] = event;
    this.next = (this.next + 1) % LOG_CAPACITY;
  }

  /** A bot's decision, logged when it changes (decision or reason). */
  decide(t: number, ship: string, skill: number, decision: string, reason: string) {
    const key = `${decision}|${reason}`;
    if (this.current.get(ship) === key) return;
    this.current.set(ship, key);
    this.add({ kind: 'decision', t: round1(t), ship, skill: round1(skill), decision, reason });
  }

  /** What a ship decided last. */
  doing(ship: string): string | null {
    return this.current.get(ship)?.split('|')[0] ?? null;
  }

  /** A death, linked to the decisions of victim and killer in the DECISION_WINDOW before it. */
  death(event: Omit<DeathEvent, 'kind' | 'decisions' | 'doing'>) {
    const decisions = this.events().filter((e): e is DecisionEvent => e.kind === 'decision' && e.t >= event.t - DECISION_WINDOW && (e.ship === event.ship || e.ship === event.killer));
    this.add({ kind: 'death', ...event, doing: this.doing(event.ship), decisions });
  }

  /** Every event of the round, oldest first. */
  events(): LogEvent[] {
    return this.buffer.length < LOG_CAPACITY ? this.buffer.slice() : [...this.buffer.slice(this.next), ...this.buffer.slice(0, this.next)];
  }

  /** The events of a kind, or those a test accepts: `game.log.filter('death')`, `game.log.filter((e) => e.ship === 'Kessler')`. */
  filter(by: LogEvent['kind'] | ((event: LogEvent) => boolean)): LogEvent[] {
    return this.events().filter(typeof by === 'string' ? (e) => e.kind === by : by);
  }

  /**
   * The round in numbers: deaths by cause, by cause per ship, by the victim's decision, and
   * after which decisions of victim or killer; contacts by outcome; shoves and knockouts.
   */
  summary() {
    const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);
    const deaths: Record<string, number> = {};
    const byShip: Record<string, Record<string, number>> = {};
    const whileDoing: Record<string, number> = {};
    const afterDecision: Record<string, number> = {};
    const contacts: Record<string, number> = {};
    let shoves = 0;
    for (const e of this.events()) {
      if (e.kind === 'death') {
        count(deaths, e.cause);
        count((byShip[e.ship] ??= {}), e.cause);
        count(whileDoing, e.doing ?? 'none');
        for (const decision of new Set(e.decisions.map((d) => `${d.ship === e.ship ? 'victim' : 'killer'}: ${d.decision}`))) count(afterDecision, decision);
      } else if (e.kind === 'contact') count(contacts, e.outcome);
      else if (e.kind === 'shove') shoves++;
    }
    return { mode: this.mode, arena: this.arena, deaths, byShip, whileDoing, afterDecision, contacts, shoves, knockouts: deaths.knockout ?? 0 };
  }

  /** The whole log as JSON, to save or attach. */
  json(): string {
    return JSON.stringify({ mode: this.mode, arena: this.arena, summary: this.summary(), events: this.events() });
  }
}

/** The log in development, null in production. */
export const devlog: DevLog | null = import.meta.env.DEV ? new DevLog() : null;
