import type { FieldState } from '../world/asteroids';
import type { ShipState } from '../ship/ship';
import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import { fieldState, id, isRecord, MAX_COORDINATE, MAX_COUNT, MAX_FIELD_TIME, num, ROUND_LIMIT, shipState, UNIT_LENGTH, vec } from './validate';

/** Ship states go out this often (Hz); the receivers predict the motion in between. */
const STATE_RATE = 15;
/**
 * A newcomer waits this long for the peers already in the room before deciding who leads (ms).
 * Over the internet the first WebRTC connections take a few seconds.
 */
const SETTLE_MS = 6000;
/**
 * A peer that has sent nothing for this long cannot lead (ms): a lead browser in a hidden tab
 * runs no frames and sends nothing, so the next one takes over until it is back. A peer that
 * comes back from such a silence follows the others for as long again before it may lead, so
 * it first takes over the round clock and field time that ran on without it.
 */
const LIVENESS_MS = 2500;
/** Places per tournament: Hosts and bots together; with bots, the lead browser fills free places. */
export const TOURNAMENT_SIZE = 8;
/** Ships one peer may run: its own and the bots of a lead browser, at most a full tournament. */
const MAX_SHIPS_PER_PEER = TOURNAMENT_SIZE;
/** One shooter cannot hit the same ship more often than its laser fires (s); well below the cooldown, for network jitter. */
const MIN_HIT_INTERVAL = 0.1;
/** Hits per peer and second: every ship it runs firing as fast as the laser allows, each beam through a few ships. */
const MAX_HITS_PER_SECOND = MAX_SHIPS_PER_PEER * 12;
/** Asteroid hits per peer and second, generous for several ships firing at once. */
const MAX_ROCK_HITS_PER_SECOND = 20;
/** Destructions per peer and second: the ships one browser runs die a few times a minute, never this often. */
const MAX_DESTRUCTIONS_PER_SECOND = 4;

/**
 * Round clock of the lead browser: which round is running, how many seconds are left, and the
 * field time, so every browser turns and moves the asteroids alike.
 */
export type RoundState = { id: number; left: number; field: number };

export type Vec = number[];

/** The peer that runs a ship, read from its id: "p:<peer>" for a Host, "b:<peer>:<n>" for a bot. */
export function ownerOf(shipId: string): string | null {
  const match = /^(?:p:([A-Za-z0-9]+)|b:([A-Za-z0-9]+):\d+)$/.exec(shipId);
  return match ? (match[1] ?? match[2]) : null;
}

const seconds = () => performance.now() / 1000;

/** A token bucket per peer: at most `rate` messages per second, in bursts of up to `rate`. */
class Budget {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private readonly rate: number) {}

  spend(peer: string) {
    const now = seconds();
    const bucket = this.buckets.get(peer) ?? { tokens: this.rate, at: now };
    bucket.tokens = Math.min(this.rate, bucket.tokens + (now - bucket.at) * this.rate);
    bucket.at = now;
    this.buckets.set(peer, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
  }

  forget(peer: string) {
    this.buckets.delete(peer);
  }
}

/**
 * The tournament protocol between peers. Every peer simulates its own ship (and the lead
 * browser its bots) and sends their states. The shooter decides whether a beam hit and tells
 * the owner of the ship it hit; the owner applies the damage and announces a destruction.
 * Asteroid hits go to everyone, fragments are deterministic. The lead browser (the peer
 * longest in the room that is still sending) runs the bots and the round clock and brings
 * newcomers up to date.
 *
 * Nothing that arrives is trusted: every message is checked (see validate.ts), messages about
 * a ship only count from the peer that runs it, and every kind of message has a rate limit.
 */
export class Session {
  onStates: (states: ShipState[], round: RoundState | null, from: string) => void = () => {};
  onFire: (shooter: string, from: Vec, to: Vec) => void = () => {};
  onHit: (target: string, origin: Vec, direction: Vec, shooter: string) => void = () => {};
  onDestroyed: (victim: string, killer: string | null, deaths: number) => void = () => {};
  onRock: (id: string, at: number, round: number) => void = () => {};
  onSync: (field: FieldState) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};

  private nextStateAt = 0;
  /** When this peer joined, on this browser's clock (s). */
  private readonly joinedAt = seconds();
  /**
   * When each peer joined, on this browser's clock: its reported time in the room, subtracted
   * from the moment its first message arrived. Every peer works it out from the same reports,
   * so all of them elect the same lead; it is kept when a link drops and comes back.
   */
  private readonly peerJoinedAt = new Map<string, number>();
  private readonly lastHeard = new Map<string, number>();
  /** When a peer spoke again after a silence of more than LIVENESS_MS. */
  private readonly backAt = new Map<string, number>();
  /** When this browser last ran a frame, and when it came back from a silence of its own. */
  private lastFrameAt = 0;
  private selfBackAt = -Infinity;
  /** When each shooter last hit each ship ("shooter>target"). */
  private readonly lastHit = new Map<string, number>();
  private readonly hitBudget = new Budget(MAX_HITS_PER_SECOND);
  private readonly rockBudget = new Budget(MAX_ROCK_HITS_PER_SECOND);
  private readonly destroyBudget = new Budget(MAX_DESTRUCTIONS_PER_SECOND);
  private synced = false;
  private left = false;

  private constructor(private readonly transport: Transport, readonly room: string) {
    transport.on('s', (d, from) => this.receiveStates(d, from));
    transport.on('f', (d, from) => {
      const shooter = id(d?.i);
      const a = vec(d?.a, 3, MAX_COORDINATE);
      const b = vec(d?.b, 3, MAX_COORDINATE);
      if (shooter && a && b && ownerOf(shooter) === from) this.guard(() => this.onFire(shooter, a, b));
    });
    transport.on('h', (d, from) => {
      const target = id(d?.t);
      const shooter = id(d?.i);
      const origin = vec(d?.o, 3, MAX_COORDINATE);
      const direction = vec(d?.d, 3, UNIT_LENGTH);
      if (!target || !shooter || !origin || !direction || ownerOf(shooter) !== from || !this.hitBudget.spend(from)) return;
      // one hit per shot and ship at most: the laser has a cooldown
      const now = seconds();
      const pair = `${shooter}>${target}`;
      if (now - (this.lastHit.get(pair) ?? -Infinity) < MIN_HIT_INTERVAL) return;
      this.lastHit.set(pair, now);
      if (this.lastHit.size > 1024) for (const [key, at] of this.lastHit) if (now - at > 1) this.lastHit.delete(key);
      this.guard(() => this.onHit(target, origin, direction, shooter));
    });
    transport.on('x', (d, from) => {
      const victim = id(d?.v);
      const killer = d?.k === null ? null : id(d?.k);
      const deaths = num(d?.de, 0, MAX_COUNT);
      if (!victim || killer === undefined || deaths === null || ownerOf(victim) !== from || !this.destroyBudget.spend(from)) return;
      this.guard(() => this.onDestroyed(victim, killer, deaths));
    });
    transport.on('r', (d, from) => {
      const rock = id(d?.i);
      const at = num(d?.t, 0, MAX_FIELD_TIME);
      const round = num(d?.n, 0, MAX_COUNT);
      if (rock && at !== null && round !== null && this.rockBudget.spend(from)) this.guard(() => this.onRock(rock, at, round));
    });
    transport.on('y', (d, from) => {
      // only a newcomer takes a field, once, and only from a peer that was here before it
      const field = fieldState(d?.f);
      const age = num(d?.g, 0, MAX_FIELD_TIME);
      if (!field || age === null || this.synced || !this.justJoined) return;
      this.hear(from, age);
      if ((this.peerJoinedAt.get(from) ?? Infinity) >= this.joinedAt) return;
      this.synced = true;
      this.guard(() => this.onSync(field));
    });
    transport.onPeerJoin((peer) => {
      if (!this.left) this.guard(() => this.onPeerJoin(peer));
    });
    transport.onPeerLeave((peer) => {
      // the join time stays: a link that comes back belongs to the same peer
      this.lastHeard.delete(peer);
      this.backAt.delete(peer);
      for (const budget of [this.hitBudget, this.rockBudget, this.destroyBudget]) budget.forget(peer);
      for (const key of this.lastHit.keys()) if (ownerOf(key.slice(0, key.indexOf('>'))) === peer) this.lastHit.delete(key);
      if (!this.left) this.guard(() => this.onPeerLeave(peer));
    });
  }

  /** Joins a tournament room; `local` connects tabs of this browser instead of the internet. */
  static async join(room: string, local: boolean): Promise<Session> {
    const transport = local ? new LocalTransport(room) : await TrysteroTransport.join(room);
    return new Session(transport, room);
  }

  get selfId() {
    return this.transport.selfId;
  }

  get peers() {
    return this.transport.peers();
  }

  /**
   * The peer that has been in the room longest and is still sending leads (ties: lower id),
   * so a newcomer never takes over a running tournament. Every peer comes to the same answer
   * on its own.
   */
  get isLead() {
    return !this.justJoined && this.leadId === this.selfId;
  }

  get leadId(): string {
    const now = seconds();
    // a browser back from a silence follows the others until it has caught up
    let lead: string | null = now - this.selfBackAt < LIVENESS_MS / 1000 ? null : this.selfId;
    let leadJoined = lead ? this.joinedAt : Infinity;
    for (const peer of this.peers) {
      if (!this.isLive(peer)) continue;
      // peers that have not reported yet count as newer
      const joined = this.peerJoinedAt.get(peer) ?? Infinity;
      if (lead === null || joined < leadJoined || (joined === leadJoined && peer < lead)) {
        lead = peer;
        leadJoined = joined;
      }
    }
    return lead ?? this.selfId;
  }

  /**
   * A peer is live while it sends: heard within LIVENESS_MS, and not just back from a silence
   * (see LIVENESS_MS). The ships of a peer that is not live are not shown.
   */
  isLive(peer: string) {
    const now = seconds();
    return now - (this.lastHeard.get(peer) ?? -Infinity) <= LIVENESS_MS / 1000 && now - (this.backAt.get(peer) ?? -Infinity) >= LIVENESS_MS / 1000;
  }

  /** Whether a peer has gone quiet: nothing heard from it for LIVENESS_MS. */
  isSilent(peer: string) {
    return seconds() - (this.lastHeard.get(peer) ?? -Infinity) > LIVENESS_MS / 1000;
  }

  /**
   * How many peers joined before this one: 0 for the first in the room. While it settles, a
   * newcomer cannot know yet who came first and counts every peer it is connected to.
   */
  rank() {
    if (this.justJoined) return this.peers.length;
    let earlier = 0;
    for (const peer of this.peers) if ((this.peerJoinedAt.get(peer) ?? Infinity) < this.joinedAt) earlier++;
    return earlier;
  }

  /** This peer only just entered the room and does not know the others yet. */
  get justJoined() {
    return seconds() - this.joinedAt < SETTLE_MS / 1000;
  }

  /** Called every frame: notes when no frames ran for a while (a hidden tab), so the others went on without this browser. */
  tick() {
    const now = seconds();
    if (this.lastFrameAt && now - this.lastFrameAt > LIVENESS_MS / 1000) this.selfBackAt = now;
    this.lastFrameAt = now;
  }

  /** Whether the own states are due now; the caller builds them only then. */
  statesDue(now: number) {
    return now >= this.nextStateAt;
  }

  /** Sends the states of the own ships (see statesDue). */
  sendStates(now: number, states: ShipState[], round: RoundState | null) {
    this.nextStateAt = now + 1 / STATE_RATE;
    this.transport.send('s', { s: states, r: round, g: this.age() });
  }

  sendFire(shooter: string, from: Vec, to: Vec) {
    this.transport.send('f', { i: shooter, a: from, b: to });
  }

  sendHit(owner: string, target: string, origin: Vec, direction: Vec, shooter: string) {
    this.transport.send('h', { t: target, o: origin, d: direction, i: shooter }, owner);
  }

  /** `deaths` is the victim's death count with this death, so every peer seeds the same wreckage. */
  sendDestroyed(victim: string, killer: string | null, deaths: number) {
    this.transport.send('x', { v: victim, k: killer, de: deaths });
  }

  /** `at` is the field time of the hit and `round` the round it fell in, so a rock breaks into the same fragments everywhere. */
  sendRock(rock: string, at: number, round: number) {
    this.transport.send('r', { i: rock, t: +at.toFixed(3), n: round });
  }

  sendSync(to: string, field: FieldState) {
    this.transport.send('y', { f: field, g: this.age() }, to);
  }

  leave() {
    if (this.left) return;
    this.left = true;
    this.transport.leave();
  }

  /** Seconds this peer has been in the room, reported to the others for the lead election. */
  private age() {
    return +(seconds() - this.joinedAt).toFixed(3);
  }

  /** A peer spoke: notes when, and when it joined (only the first report counts). */
  private hear(peer: string, age: number) {
    const now = seconds();
    const last = this.lastHeard.get(peer);
    if (last !== undefined && now - last > LIVENESS_MS / 1000) this.backAt.set(peer, now);
    this.lastHeard.set(peer, now);
    if (!this.peerJoinedAt.has(peer)) this.peerJoinedAt.set(peer, now - age);
  }

  private receiveStates(d: unknown, from: string) {
    if (this.left || !isRecord(d)) return;
    const age = num(d.g, 0, MAX_FIELD_TIME);
    if (age === null || !Array.isArray(d.s) || d.s.length > MAX_SHIPS_PER_PEER) return;
    const states = d.s.map(shipState);
    // a peer only reports the ships it runs
    if (states.some((state) => state === null || ownerOf(state.id) !== from)) return;
    this.hear(from, age);
    const round = d.r === null ? null : this.roundState(d.r);
    if (round === undefined) return;
    this.guard(() => this.onStates(states as ShipState[], round, from));
  }

  private roundState(x: unknown): RoundState | undefined {
    if (!isRecord(x)) return undefined;
    const round = { id: num(x.id, 0, MAX_COUNT), left: num(x.left, -ROUND_LIMIT, ROUND_LIMIT), field: num(x.field, 0, MAX_FIELD_TIME) };
    return round.id !== null && round.left !== null && round.field !== null ? (round as RoundState) : undefined;
  }

  /** Runs a handler unless this peer has left the room. */
  private guard(handler: () => void) {
    if (!this.left) handler();
  }
}
