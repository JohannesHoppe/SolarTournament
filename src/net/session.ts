import type { FieldState } from '../world/asteroids';
import type { ShipState } from '../ship/ship';
import type { WreckState } from '../world/wrecks';
import { CHEATS, type Cheat } from './plausible';
import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import type { ProbeState } from '../game/items';
import { fieldState, id, ids, int, probeStates, isRecord, MAX_COORDINATE, MAX_COUNT, MAX_FIELD_TIME, MAX_SPEED, num, ROUND_LIMIT, shipState, UNIT_LENGTH, vec, wreckStates } from './validate';

/** Ship states go out this often (Hz); the receivers predict the motion in between, and take at most three times as many. */
const STATE_RATE = 15;
/**
 * A newcomer waits this long for the peers already in the room before deciding who leads (ms).
 * Over the internet the first WebRTC connections take a few seconds.
 */
const SETTLE_MS = 6000;
/**
 * A peer that has sent nothing for this long cannot lead (ms): a lead browser in a hidden tab
 * runs no frames and sends nothing, so the next one takes over. A peer that speaks again after
 * such a silence counts as live only after as long again, so that it can report first whether
 * it started over (see Session.restart).
 */
const LIVENESS_MS = 2500;
/**
 * A browser that ran no frames or heard none of its peers for this long starts over (ms). It
 * judges itself cut off sooner than the others judge it silent, so the one whose link failed
 * is the one that starts over, not the ones that went on without it.
 */
const CUT_OFF_MS = 2000;
/** A reported join time this much later than the known one means the peer started over (s); well above network jitter. */
const RESTART_SLACK = 1;
/**
 * Seconds left in a round reported by a lead browser, at the least: the results after a round
 * last 12 s, a clock far below would hold everyone on the scoreboard.
 */
const MIN_ROUND_LEFT = -60;
/** Places per tournament: Hosts and bots together; with bots, the lead browser fills free places. */
export const TOURNAMENT_SIZE = 8;
/** Ships one peer may run: its own and the bots of a lead browser, at most a full tournament. */
const MAX_SHIPS_PER_PEER = TOURNAMENT_SIZE;
/** One shooter cannot hit the same ship more often than its laser fires (s); below the cooldown of a twin laser (0.09 s), for network jitter. */
const MIN_HIT_INTERVAL = 0.07;
/** Hits per peer and second, and as many beams: every ship it runs firing as fast as the laser allows, each beam through a few ships. */
const MAX_HITS_PER_SECOND = MAX_SHIPS_PER_PEER * 12;
/** Asteroid hits per peer and second, generous for several ships firing at once. */
const MAX_ROCK_HITS_PER_SECOND = 20;
/** Destructions per peer and second: a nova core can take every ship one browser runs at once, but each dies only once a clone. */
const MAX_DESTRUCTIONS_PER_SECOND = MAX_SHIPS_PER_PEER;
/** Cheat reports per peer and second: a browser reports each cheater once. */
const MAX_CHEAT_REPORTS_PER_SECOND = 2;
/** Pieces of wreckage one peer's ships shoot or ram per second, generous for several ships firing at once. */
const MAX_WRECK_HITS_PER_SECOND = 20;
/** Torpedo launches, hits, torpedoes gone and probes taken, per peer and second: a few of each per clone, eight ships at most. */
const MAX_TORPEDO_EVENTS_PER_SECOND = 12;

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
 * Asteroid hits and wreckage shot or rammed go to everyone, fragments and the pieces of a
 * wreck are deterministic. The lead browser (the peer
 * longest in the room that is still sending) runs the bots and the round clock and brings
 * newcomers up to date. A browser that lost the others for a while starts over as the newest
 * in the room: the others went on without it, so it takes their round and field.
 *
 * Nothing that arrives is trusted: every message is checked (see validate.ts), messages about
 * a ship only count from the peer that runs it, and every kind of message has a rate limit.
 */
export class Session {
  onStates: (states: ShipState[], round: RoundState | null, from: string) => void = () => {};
  onFire: (shooter: string, from: Vec, to: Vec) => void = () => {};
  onHit: (target: string, origin: Vec, direction: Vec, shooter: string) => void = () => {};
  /** `position` and `velocity` are where the victim broke up, on its owner's screen. */
  onDestroyed: (victim: string, killer: string | null, deaths: number, position: Vec | null, velocity: Vec | null, nova: boolean) => void = () => {};
  onRock: (id: string, at: number, round: number) => void = () => {};
  /** A piece of wreckage was shot or rammed on another browser. */
  onWreck: (id: string) => void = () => {};
  /** A ship of another browser launched a torpedo, at a target or none. */
  onTorpedo: (id: string, shooter: string, target: string | null, position: Vec, velocity: Vec) => void = () => {};
  /** A torpedo went off or was shot down, where. */
  onTorpedoGone: (id: string, position: Vec) => void = () => {};
  /** Another browser's torpedo hit a ship this browser runs. */
  onTorpedoHit: (target: string, shooter: string, torpedo: string) => void = () => {};
  /** A ship of another browser took a probe. */
  onProbe: (probe: string, ship: string) => void = () => {};
  /** A ship of another browser set off its nova core, here. */
  onNova: (ship: string, position: Vec) => void = () => {};
  /** Another browser says a ship cheats (see plausible.ts). */
  onCheat: (ship: string, cheat: Cheat, from: string) => void = () => {};
  /** The lead's field, the wreckage in flight, and the probes taken this round. */
  onSync: (field: FieldState, wrecks: WreckState[], probesTaken: string[], probes: ProbeState[]) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};
  /** This browser started over (see restart): it takes the round and field of the lead browser again. */
  onRestart: () => void = () => {};
  /** Another peer started over and waits for the field. */
  onPeerRestart: (id: string) => void = () => {};

  private nextStateAt = 0;
  /** When this peer entered the room, on this browser's clock (s). */
  private readonly joinedAt = seconds();
  /** When this peer joined or last started over, on this browser's clock (s): its place in the election. */
  private startedAt = this.joinedAt;
  private restartedAt = -Infinity;
  /**
   * When each peer joined or last started over, on this browser's clock: its reported time in
   * the room, subtracted from the moment its message arrived. Every peer works it out from the
   * same reports, so all of them elect the same lead. A report can only move it later (the
   * peer started over), never earlier, so no peer can push itself ahead of the others.
   */
  private readonly peerJoinedAt = new Map<string, number>();
  /** When each peer last spoke; kept when its link drops, so its return is noticed. */
  private readonly lastHeard = new Map<string, number>();
  /** When any peer last spoke. */
  private lastHeardAny = -Infinity;
  /** When a peer spoke again after a silence of more than LIVENESS_MS. */
  private readonly backAt = new Map<string, number>();
  /** When this browser last ran a frame. */
  private lastFrameAt = 0;
  /** The lead this browser followed at the last frame. */
  private followed: string | null = null;
  /** When each shooter last hit each ship ("shooter>target"). */
  private readonly lastHit = new Map<string, number>();
  private readonly hitBudget = new Budget(MAX_HITS_PER_SECOND);
  private readonly rockBudget = new Budget(MAX_ROCK_HITS_PER_SECOND);
  private readonly destroyBudget = new Budget(MAX_DESTRUCTIONS_PER_SECOND);
  private readonly wreckBudget = new Budget(MAX_WRECK_HITS_PER_SECOND);
  private readonly torpedoBudget = new Budget(MAX_TORPEDO_EVENTS_PER_SECOND);
  private readonly cheatBudget = new Budget(MAX_CHEAT_REPORTS_PER_SECOND);
  private readonly stateBudget = new Budget(STATE_RATE * 3);
  private readonly beamBudget = new Budget(MAX_HITS_PER_SECOND);
  private synced = false;
  private left = false;

  private constructor(private readonly transport: Transport, readonly room: string) {
    transport.on('s', (d, from) => this.receiveStates(d, from));
    transport.on('f', (d, from) => {
      const shooter = id(d?.i);
      const a = vec(d?.a, 3, MAX_COORDINATE);
      const b = vec(d?.b, 3, MAX_COORDINATE);
      if (shooter && a && b && ownerOf(shooter) === from && this.beamBudget.spend(from)) this.guard(() => this.onFire(shooter, a, b));
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
      const position = vec(d?.p, 3, MAX_COORDINATE);
      const velocity = vec(d?.u, 3, MAX_SPEED);
      if (!victim || killer === undefined || deaths === null || ownerOf(victim) !== from || !this.destroyBudget.spend(from)) return;
      this.guard(() => this.onDestroyed(victim, killer, deaths, position, velocity, d?.n === 1));
    });
    transport.on('w', (d, from) => {
      const wreck = id(d?.i);
      if (wreck && this.wreckBudget.spend(from)) this.guard(() => this.onWreck(wreck));
    });
    transport.on('tl', (d, from) => {
      const torpedo = id(d?.i);
      const shooter = id(d?.s);
      const target = d?.t === null ? null : id(d?.t);
      const position = vec(d?.p, 3, MAX_COORDINATE);
      const velocity = vec(d?.v, 3, MAX_SPEED);
      if (!torpedo || !shooter || target === undefined || !position || !velocity || ownerOf(shooter) !== from || !this.torpedoBudget.spend(from)) return;
      this.guard(() => this.onTorpedo(torpedo, shooter, target, position, velocity));
    });
    transport.on('tg', (d, from) => {
      const torpedo = id(d?.i);
      const position = vec(d?.p, 3, MAX_COORDINATE);
      if (torpedo && position && this.torpedoBudget.spend(from)) this.guard(() => this.onTorpedoGone(torpedo, position));
    });
    transport.on('ic', (d, from) => {
      const probe = id(d?.c);
      const ship = id(d?.s);
      if (probe && ship && ownerOf(ship) === from && this.torpedoBudget.spend(from)) this.guard(() => this.onProbe(probe, ship));
    });
    transport.on('nv', (d, from) => {
      const ship = id(d?.s);
      const position = vec(d?.p, 3, MAX_COORDINATE);
      if (ship && position && ownerOf(ship) === from && this.torpedoBudget.spend(from)) this.guard(() => this.onNova(ship, position));
    });
    transport.on('ch', (d, from) => {
      const ship = id(d?.s);
      const cheat = CHEATS.find((c) => c === d?.r);
      if (ship && cheat && this.cheatBudget.spend(from)) this.guard(() => this.onCheat(ship, cheat, from));
    });
    transport.on('tk', (d, from) => {
      const target = id(d?.t);
      const shooter = id(d?.s);
      const torpedo = id(d?.i);
      if (target && shooter && torpedo && ownerOf(shooter) === from && this.torpedoBudget.spend(from)) this.guard(() => this.onTorpedoHit(target, shooter, torpedo));
    });
    transport.on('r', (d, from) => {
      const rock = id(d?.i);
      const at = num(d?.t, 0, MAX_FIELD_TIME);
      const round = num(d?.n, 0, MAX_COUNT);
      if (rock && at !== null && round !== null && this.rockBudget.spend(from)) this.guard(() => this.onRock(rock, at, round));
    });
    transport.on('y', (d, from) => {
      // only a browser that just joined or started over takes a field, once, and only from a
      // peer that was here before it
      const field = fieldState(d?.f);
      const wrecks = wreckStates(d?.w);
      const taken = ids(d?.p);
      const probes = probeStates(d?.q);
      const age = num(d?.g, 0, MAX_FIELD_TIME);
      if (!field || !wrecks || !taken || !probes || age === null) return;
      this.hear(from, age);
      if (this.synced || seconds() - this.startedAt >= SETTLE_MS / 1000) return;
      if ((this.peerJoinedAt.get(from) ?? Infinity) >= this.startedAt) return;
      this.synced = true;
      this.guard(() => this.onSync(field, wrecks, taken, probes));
    });
    transport.onPeerJoin((peer) => {
      if (!this.left) this.guard(() => this.onPeerJoin(peer));
    });
    transport.onPeerLeave((peer) => {
      // join time and last word stay: a link that comes back belongs to the same peer
      this.backAt.delete(peer);
      for (const budget of [this.hitBudget, this.rockBudget, this.destroyBudget, this.wreckBudget, this.torpedoBudget, this.cheatBudget, this.stateBudget, this.beamBudget]) budget.forget(peer);
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

  get relayOff() {
    return this.transport.relayOff;
  }

  /**
   * The peer that has been in the room longest (without starting over) and is still sending
   * leads (ties: lower id), so a newcomer never takes over a running tournament. Every peer
   * comes to the same answer on its own.
   */
  get isLead() {
    // a browser that has just started over waits to hear the others first (see isLive)
    const startedOver = seconds() - this.restartedAt < (2 * LIVENESS_MS) / 1000 && this.peers.length > 0;
    return !this.justJoined && !startedOver && this.leadId === this.selfId;
  }

  get leadId(): string {
    let lead = this.selfId;
    let leadJoined = this.startedAt;
    for (const peer of this.peers) {
      if (!this.isLive(peer)) continue;
      // peers that have not reported yet count as newer
      const joined = this.peerJoinedAt.get(peer) ?? Infinity;
      if (joined < leadJoined || (joined === leadJoined && peer < lead)) {
        lead = peer;
        leadJoined = joined;
      }
    }
    return lead;
  }

  /**
   * A peer is live while it sends: heard within LIVENESS_MS, and not just back from a silence
   * (see LIVENESS_MS). A browser that has just started over itself was the one that was gone:
   * the others count as live as soon as it hears them, so it does not lead in the meantime.
   */
  isLive(peer: string) {
    const now = seconds();
    const heard = now - (this.lastHeard.get(peer) ?? -Infinity) <= LIVENESS_MS / 1000;
    const startedOver = now - this.restartedAt < (2 * LIVENESS_MS) / 1000;
    return heard && (startedOver || now - (this.backAt.get(peer) ?? -Infinity) >= LIVENESS_MS / 1000);
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
    for (const peer of this.peers) if ((this.peerJoinedAt.get(peer) ?? Infinity) < this.startedAt) earlier++;
    return earlier;
  }

  /** This peer only just entered the room and does not know the others yet. */
  get justJoined() {
    return seconds() - this.joinedAt < SETTLE_MS / 1000;
  }

  /** Called every frame, before anything is sent: notices when this browser has to start over (see restart). */
  tick() {
    const now = seconds();
    // no frames ran for a while (a hidden tab, a sleeping device): the others went on without it
    if (this.lastFrameAt && now - this.lastFrameAt > CUT_OFF_MS / 1000 && this.peers.length > 0) this.restart();
    this.lastFrameAt = now;
    // the lead changed to a peer this browser could not hear for a while: two groups that lost
    // each other meet again, and the one whose lead is not the oldest takes the other's world
    const lead = this.leadId;
    if (lead === this.followed) return;
    const back = this.backAt.get(lead);
    const merge = this.followed !== null && lead !== this.selfId && back !== undefined && now - back < (2 * LIVENESS_MS) / 1000;
    if (merge && now - this.restartedAt > (2 * LIVENESS_MS) / 1000) this.restart();
    this.followed = this.leadId;
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

  /**
   * `deaths` is the victim's death count with this death, so every peer seeds the same wreckage,
   * where the victim broke up; `n: 1` when the killer's nova core did it (it counts double).
   */
  sendDestroyed(victim: string, killer: string | null, deaths: number, position: Vec, velocity: Vec, nova: boolean) {
    this.transport.send('x', { v: victim, k: killer, de: deaths, p: position, u: velocity, ...(nova ? { n: 1 } : {}) });
  }

  sendWreck(wreck: string) {
    this.transport.send('w', { i: wreck });
  }

  sendTorpedo(torpedo: string, shooter: string, target: string | null, position: Vec, velocity: Vec) {
    this.transport.send('tl', { i: torpedo, s: shooter, t: target, p: position, v: velocity });
  }

  sendNova(ship: string, position: Vec) {
    this.transport.send('nv', { s: ship, p: position });
  }

  /** Tells everyone that a ship of another browser did something no honest browser reports. */
  sendCheat(ship: string, cheat: Cheat) {
    this.transport.send('ch', { s: ship, r: cheat });
  }

  sendProbe(probe: string, ship: string) {
    this.transport.send('ic', { c: probe, s: ship });
  }

  sendTorpedoGone(torpedo: string, position: Vec) {
    this.transport.send('tg', { i: torpedo, p: position });
  }

  /** Tells the browser that runs `target` that the own torpedo `torpedo` of `shooter` hit it. */
  sendTorpedoHit(owner: string, target: string, shooter: string, torpedo: string) {
    this.transport.send('tk', { t: target, s: shooter, i: torpedo }, owner);
  }

  /** `at` is the field time of the hit and `round` the round it fell in, so a rock breaks into the same fragments everywhere. */
  sendRock(rock: string, at: number, round: number) {
    this.transport.send('r', { i: rock, t: +at.toFixed(3), n: round });
  }

  sendSync(to: string, field: FieldState, wrecks: WreckState[], probesTaken: string[], probes: ProbeState[]) {
    this.transport.send('y', { f: field, w: wrecks, p: probesTaken, q: probes, g: this.age() }, to);
  }

  leave() {
    if (this.left) return;
    this.left = true;
    this.transport.leave();
  }

  /** Seconds since this peer joined or last started over, reported to the others for the lead election. */
  private age() {
    return +(seconds() - this.startedAt).toFixed(3);
  }

  /**
   * Starts over as the newest peer in the room: this browser lost the others for a while, and
   * they went on without it. It gives up the lead (and with it the bots, which the next lead
   * adopts), takes its place behind all others, and takes round and field from the lead again.
   */
  private restart() {
    const now = seconds();
    this.startedAt = this.restartedAt = now;
    this.synced = false;
    this.guard(() => this.onRestart());
  }

  /**
   * The join time of a peer heard for the first time. A peer that shows up after this browser
   * has settled was not in the room before it: a claim to have been here longer than the
   * current lead is a lie (it would take the lead and the places of everyone), so it lines up
   * behind the lead instead.
   */
  private plausibleJoin(peer: string, joined: number): number {
    if (this.justJoined) return joined;
    const lead = this.leadId;
    const leadJoined = lead === this.selfId ? this.startedAt : (this.peerJoinedAt.get(lead) ?? this.startedAt);
    return joined < leadJoined && peer !== lead ? leadJoined + RESTART_SLACK / 2 : joined;
  }

  /** A peer spoke: notes when, and when it joined or started over. */
  private hear(peer: string, age: number) {
    const now = seconds();
    const last = this.lastHeard.get(peer);
    const cutOff = now - this.lastHeardAny > CUT_OFF_MS / 1000;
    this.lastHeardAny = now;
    if (last !== undefined && now - last > LIVENESS_MS / 1000) this.backAt.set(peer, now);
    this.lastHeard.set(peer, now);
    const joined = now - age;
    const known = this.peerJoinedAt.get(peer);
    if (known === undefined) this.peerJoinedAt.set(peer, this.plausibleJoin(peer, joined));
    else if (joined > known + RESTART_SLACK) {
      // the peer started over: it was the one that was gone
      this.peerJoinedAt.set(peer, joined);
      this.guard(() => this.onPeerRestart(peer));
    } else if (last !== undefined && cutOff) {
      // a peer this browser knew speaks again after it heard nobody for a while: its own link was down
      this.restart();
    }
  }

  private receiveStates(d: unknown, from: string) {
    if (this.left || !isRecord(d) || !this.stateBudget.spend(from)) return;
    const age = num(d.g, 0, MAX_FIELD_TIME);
    if (age === null || !Array.isArray(d.s) || d.s.length > MAX_SHIPS_PER_PEER) return;
    const states = d.s.map(shipState);
    // a peer only reports the ships it runs
    if (states.some((state) => state === null || ownerOf(state.id) !== from)) return;
    this.hear(from, age);
    const round = d.r === null ? null : this.roundState(d.r);
    if (round === undefined) return;
    // two browsers lead at once because their join times lie too close to tell apart over the
    // network: the one with the higher id steps back (a peer that came clearly later cannot
    // make the lead step back by sending a round clock)
    const tie = Math.abs((this.peerJoinedAt.get(from) ?? Infinity) - this.startedAt) <= RESTART_SLACK;
    if (round && tie && this.isLead && this.isLive(from) && from < this.selfId) this.restart();
    this.guard(() => this.onStates(states as ShipState[], round, from));
  }

  private roundState(x: unknown): RoundState | undefined {
    if (!isRecord(x)) return undefined;
    const round = { id: int(x.id, 0, MAX_COUNT), left: num(x.left, MIN_ROUND_LEFT, ROUND_LIMIT), field: num(x.field, 0, MAX_FIELD_TIME) };
    return round.id !== null && round.left !== null && round.field !== null ? (round as RoundState) : undefined;
  }

  /** Runs a handler unless this peer has left the room. */
  private guard(handler: () => void) {
    if (!this.left) handler();
  }
}
