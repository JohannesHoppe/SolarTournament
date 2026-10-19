import type { FieldState } from '../world/asteroids';
import type { ShipState } from '../ship/ship';
import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import { fieldState, id, num, shipState, vec } from './validate';

/** Ship states go out this often (Hz); the receivers predict the motion in between. */
const STATE_RATE = 15;
/**
 * A newcomer waits this long for the peers already in the room before deciding who leads (ms).
 * Over the internet the first WebRTC connections take a few seconds.
 */
const SETTLE_MS = 6000;
/**
 * A peer that has sent nothing for this long cannot lead (ms): a lead browser in a hidden tab
 * runs no frames and sends nothing, so the next one takes over until it is back.
 */
const LIVENESS_MS = 2500;
/** Places per tournament: Hosts and bots together; with bots, the lead browser fills free places. */
export const TOURNAMENT_SIZE = 8;
/** Ships one peer may run: its own and the bots of a lead browser, at most a full tournament. */
const MAX_SHIPS_PER_PEER = TOURNAMENT_SIZE;
/** A shooter cannot hit more often than its laser fires (s); a little below the cooldown for jitter. */
const MIN_HIT_INTERVAL = 0.15;
/** Asteroid hits per peer and second, generous for several ships firing at once. */
const MAX_ROCK_HITS_PER_SECOND = 20;

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

/**
 * The tournament protocol between peers. Every peer simulates its own ship (and the lead
 * browser its bots) and sends their states. The shooter decides whether a beam hit and tells
 * the owner of the ship it hit; the owner applies the damage and announces a destruction.
 * Asteroid hits go to everyone, fragments are deterministic. The lead browser (the peer
 * longest in the room that is still sending) runs the bots and the round clock and brings
 * newcomers up to date.
 *
 * Nothing that arrives is trusted: every message is checked (see validate.ts), and messages
 * about a ship only count from the peer that runs it.
 */
export class Session {
  onStates: (states: ShipState[], round: RoundState | null, from: string) => void = () => {};
  onFire: (shooter: string, from: Vec, to: Vec) => void = () => {};
  onHit: (target: string, origin: Vec, direction: Vec, shooter: string) => void = () => {};
  onDestroyed: (victim: string, killer: string | null, deaths: number) => void = () => {};
  onRock: (id: string, at: number) => void = () => {};
  onSync: (field: FieldState) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};

  private nextStateAt = 0;
  /** When this peer joined, on this browser's clock (s). */
  private readonly joinedAt = seconds();
  /**
   * When each peer joined, on this browser's clock: its reported time in the room, subtracted
   * from the moment its first message arrived. Peers that joined while this one was already
   * settled are newer by definition, whatever they report.
   */
  private readonly peerJoinedAt = new Map<string, number>();
  private readonly joinedAfterMe = new Set<string>();
  private readonly lastHeard = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private readonly rockBudget = new Map<string, { tokens: number; at: number }>();
  private synced = false;
  private left = false;

  private constructor(private readonly transport: Transport, readonly room: string) {
    transport.on('s', (d, from) => this.receiveStates(d, from));
    transport.on('f', (d, from) => {
      const shooter = id(d?.i);
      const a = vec(d?.a, 3, 1e6);
      const b = vec(d?.b, 3, 1e6);
      if (shooter && a && b && ownerOf(shooter) === from) this.guard(() => this.onFire(shooter, a, b));
    });
    transport.on('h', (d, from) => {
      const target = id(d?.t);
      const shooter = id(d?.i);
      const origin = vec(d?.o, 3, 1e6);
      const direction = vec(d?.d, 3, 1.01);
      if (!target || !shooter || !origin || !direction || ownerOf(shooter) !== from) return;
      // one hit per shot at most: the laser has a cooldown
      const now = seconds();
      if (now - (this.lastHit.get(shooter) ?? -Infinity) < MIN_HIT_INTERVAL) return;
      this.lastHit.set(shooter, now);
      this.guard(() => this.onHit(target, origin, direction, shooter));
    });
    transport.on('x', (d, from) => {
      const victim = id(d?.v);
      const killer = d?.k === null ? null : id(d?.k);
      const deaths = num(d?.de, 0, 1e6);
      if (victim && killer !== undefined && deaths !== null && ownerOf(victim) === from) this.guard(() => this.onDestroyed(victim, killer, deaths));
    });
    transport.on('r', (d, from) => {
      const rock = id(d?.i);
      const at = num(d?.t, 0, 1e7);
      if (rock && at !== null && this.spendRockHit(from)) this.guard(() => this.onRock(rock, at));
    });
    transport.on('y', (d, from) => {
      // only a newcomer takes a field, once, and only from a peer that was here before it
      const field = fieldState(d?.f);
      const age = num(d?.g, 0, 1e7);
      if (!field || age === null || this.synced || !this.justJoined) return;
      this.hear(from, age);
      if ((this.peerJoinedAt.get(from) ?? Infinity) >= this.joinedAt) return;
      this.synced = true;
      this.guard(() => this.onSync(field));
    });
    transport.onPeerJoin((peer) => {
      if (this.left) return;
      if (!this.justJoined) this.joinedAfterMe.add(peer);
      this.guard(() => this.onPeerJoin(peer));
    });
    transport.onPeerLeave((peer) => {
      for (const map of [this.peerJoinedAt, this.lastHeard, this.rockBudget]) map.delete(peer);
      this.joinedAfterMe.delete(peer);
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
    let lead = this.selfId;
    let leadJoined = this.joinedAt;
    for (const peer of this.peers) {
      // peers that have not reported yet count as newer; silent peers cannot lead
      const joined = this.peerJoinedAt.get(peer) ?? Infinity;
      if (now - (this.lastHeard.get(peer) ?? -Infinity) > LIVENESS_MS / 1000) continue;
      if (joined < leadJoined || (joined === leadJoined && peer < lead)) {
        lead = peer;
        leadJoined = joined;
      }
    }
    return lead;
  }

  /** How many peers joined before this one: 0 for the first in the room. */
  rank() {
    let earlier = 0;
    for (const peer of this.peers) if ((this.peerJoinedAt.get(peer) ?? Infinity) < this.joinedAt) earlier++;
    return earlier;
  }

  /** This peer only just entered the room and does not know the others yet. */
  get justJoined() {
    return seconds() - this.joinedAt < SETTLE_MS / 1000;
  }

  /** Sends the states of the own ships when the next update is due. */
  sendStates(now: number, states: ShipState[], round: RoundState | null) {
    if (now < this.nextStateAt) return;
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

  /** `at` is the field time of the hit, so a rock breaks into the same fragments everywhere. */
  sendRock(rock: string, at: number) {
    this.transport.send('r', { i: rock, t: +at.toFixed(3) });
  }

  sendSync(to: string, field: FieldState) {
    this.transport.send('y', { f: field, g: this.age() }, to);
  }

  leave() {
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
    this.lastHeard.set(peer, now);
    if (this.peerJoinedAt.has(peer)) return;
    const joined = now - age;
    this.peerJoinedAt.set(peer, this.joinedAfterMe.has(peer) ? Math.max(joined, this.joinedAt + 1e-3) : joined);
  }

  private receiveStates(d: unknown, from: string) {
    if (this.left || typeof d !== 'object' || d === null) return;
    const message = d as { s?: unknown; r?: unknown; g?: unknown };
    const age = num(message.g, 0, 1e7);
    if (age === null || !Array.isArray(message.s) || message.s.length > MAX_SHIPS_PER_PEER) return;
    const states = message.s.map(shipState);
    // a peer only reports the ships it runs
    if (states.some((state) => state === null || ownerOf(state.id) !== from)) return;
    this.hear(from, age);
    const round = message.r === null ? null : this.roundState(message.r);
    if (round === undefined) return;
    this.guard(() => this.onStates(states as ShipState[], round, from));
  }

  private roundState(x: unknown): RoundState | undefined {
    if (typeof x !== 'object' || x === null) return undefined;
    const r = x as Record<string, unknown>;
    const round = { id: num(r.id, 0, 1e6), left: num(r.left, -3600, 3600), field: num(r.field, 0, 1e7) };
    return round.id !== null && round.left !== null && round.field !== null ? (round as RoundState) : undefined;
  }

  /** Token bucket: a peer may report a limited number of asteroid hits per second. */
  private spendRockHit(peer: string) {
    const now = seconds();
    const budget = this.rockBudget.get(peer) ?? { tokens: MAX_ROCK_HITS_PER_SECOND, at: now };
    budget.tokens = Math.min(MAX_ROCK_HITS_PER_SECOND, budget.tokens + (now - budget.at) * MAX_ROCK_HITS_PER_SECOND);
    budget.at = now;
    this.rockBudget.set(peer, budget);
    if (budget.tokens < 1) return false;
    budget.tokens--;
    return true;
  }

  /** Runs a handler unless this peer has left the room. */
  private guard(handler: () => void) {
    if (!this.left) handler();
  }
}

