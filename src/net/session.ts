import type { FieldState, ShovedState } from '../world/asteroids';
import type { ShipState } from '../ship/ship';
import type { WreckState } from '../world/wrecks';
import { CHEATS, type Cheat } from './plausible';
import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import { roomMode } from './room';
import type { RoomMode } from '../game/race';
import type { ProbeState } from '../game/items';
import type { FlagsState } from '../game/flags';
import { TORPEDO_HITS, ZONE_HITS, type FleetState } from '../game/fleet';
import { fieldState, flagsState, fleetState, id, ids, int, probeStates, isRecord, MAX_COORDINATE, MAX_COUNT, MAX_FIELD_TIME, MAX_SPEED, num, ROUND_LIMIT, shipState, shovedState, UNIT_LENGTH, vec, wreckStates } from './validate';

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
 * A peer first heard after this browser settled joined at most this long before it was first
 * heard (s): the time a WebRTC link takes to form, as long as a newcomer waits for the others.
 */
const LINK_SLACK = SETTLE_MS / 1000;
/**
 * A peer's start over is taken up (the field sent again, see Online) at most once in this long
 * (s): an honest browser is cut off for at least CUT_OFF_MS before it starts over, so it never
 * starts over faster; a stream of them would only cost the lead its bandwidth.
 */
const PEER_RESTART_GAP = 2;
/** How often a settled browser checks its election against whom the others follow (s, see Session.reconcile). */
const RECONCILE_SECONDS = 1;
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
 * Pieces of the field the lead's battleship rams aside per second: each contact one message, a
 * piece pushed again for every frame its hull plows on into it, and a shower of fragments
 * meeting it at once.
 */
const MAX_RAMS_PER_SECOND = 60;
/** The parts of a battleship are numbered from zero, far fewer than this (see game/fleet); one message counts a laser's hit, a torpedo's or a nova core's. */
const MAX_FLEET_ZONE = 31;
/** The most hits a part takes (the reactor's): a nova core breaks a part close by outright. */
const MAX_PART_HITS = Math.max(...Object.values(ZONE_HITS));
/**
 * The field time of a peer's rock hits in a round only moves on (s): one earlier than it reported
 * before is a lie, beyond ROCK_ORDER_SLACK. That slack is a second: a browser's field clock
 * follows the lead's and may jump back by up to half a second (the game's FIELD_SNAP) when a late
 * round state arrives, and messages cross. A new round starts the field time over.
 */
const ROCK_ORDER_SLACK = 1;
/** A browser pings every peer this often (s): the scoreboard's reading is never far stale. */
const PING_INTERVAL = 1;
/** The reading shown is the median of a peer's last this many round trips, so one slow or lost packet does not jump it around. */
const PING_SAMPLES = 5;
/** Pings and pongs a peer may send per second, each: a browser pings once a second, this allows for jitter and a peer that just reconnected. */
const MAX_PING_RATE = 4;

/**
 * Round clock of the lead browser: which round is running, how many seconds are left, and the
 * field time, so every browser turns and moves the asteroids alike; the room's modes as the lead
 * plays them, so a Host who came by a link or a lobby listing that names others plays the same
 * rounds; in Capture the Flag also the sides and the cores (see game/flags), in the President's
 * Fleet the battleship (see game/fleet).
 */
export type RoundState = { id: number; left: number; field: number; m?: RoomMode; f?: FlagsState; b?: FleetState };

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
 * in the room: the others went on without it, so it takes their round and field. It also pings
 * every peer once a second with a number it echoes back, and times the pong for the scoreboard's
 * reading of the link's delay (see pingTo).
 *
 * Nothing that arrives is trusted: every message is checked (see validate.ts), messages about
 * a ship only count from the peer that runs it, and every kind of message has a rate limit.
 */
export class Session {
  /** Ship states of a peer, with the time it sent them on its own clock (seconds its page has run), or null when it named none. */
  onStates: (states: ShipState[], round: RoundState | null, from: string, sent: number | null) => void = () => {};
  onFire: (shooter: string, from: Vec, to: Vec) => void = () => {};
  onHit: (target: string, origin: Vec, direction: Vec, shooter: string) => void = () => {};
  /** `position` and `velocity` are where the victim broke up, on its owner's screen. */
  onDestroyed: (victim: string, killer: string | null, deaths: number, position: Vec | null, velocity: Vec | null, nova: boolean) => void = () => {};
  /** `shooter` is the ship whose beam hit the rock, one the sender runs. */
  onRock: (id: string, at: number, round: number, shooter: string) => void = () => {};
  /** A piece of wreckage was shot or rammed on another browser. */
  onWreck: (id: string) => void = () => {};
  /** A ship of another browser hit a part of the President's battleship in a round (see game/fleet). */
  onFleetHit: (zone: number, round: number, shooter: string, count: number, nova: boolean) => void = () => {};
  /** The lead browser's battleship rammed a piece of the field in a round: the piece's motion since (see game/fleet). */
  onRam: (state: ShovedState, round: number) => void = () => {};
  /** A ship of another browser launched a torpedo, at a target or none. */
  onTorpedo: (id: string, shooter: string, target: string | null, position: Vec, velocity: Vec) => void = () => {};
  /**
   * A torpedo went off or was shot down, where: told by the browser that launched it (`shooter`
   * null), by the browser whose ship `holder` took it on its hook (and decides for it since),
   * or by one whose ship `shooter` shot it down.
   */
  onTorpedoGone: (id: string, position: Vec, shooter: string | null, holder: string | null) => void = () => {};
  /** Another browser's torpedo hit a ship this browser runs. */
  onTorpedoHit: (target: string, shooter: string, torpedo: string) => void = () => {};
  /** A ship of another browser took a probe, in the third of a race its browser names (see placeBucket). */
  onProbe: (probe: string, ship: string, bucket: number) => void = () => {};
  /** A ship of another browser set off its nova core, here. */
  onNova: (ship: string, position: Vec) => void = () => {};
  /** A ship of another browser hooked a rock (a point in the rock's frame), a ship, a core of Capture the Flag (its side), a torpedo or a sponsor probe (by id), with this much cable out; or let go (null). */
  onHook: (ship: string, hold: { rock: string | null; local: Vec | null; target: string | null; core: number | null; torpedo: string | null; probe: string | null; length: number } | null) => void = () => {};
  /** Another browser says a ship cheats (see plausible.ts). */
  onCheat: (ship: string, from: string) => void = () => {};
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
  /**
   * Peers that showed up after this browser settled claiming to be older than the lead: lined up
   * behind it (see plausibleJoin), and never close enough to it to make it step back.
   */
  private readonly linedUp = new Set<string>();
  /** Peers first heard after this browser settled: their join time is no earlier than LINK_SLACK before that, and never a tie with the lead (see plausibleJoin). */
  private readonly late = new Set<string>();
  /** The lead each peer says it follows (its states carry it), checked against the own election (see reconcile). */
  private readonly follows = new Map<string, string>();
  /** The join time each peer last claimed, on this browser's clock: believed for a peer most others follow (see reconcile). */
  private readonly claimed = new Map<string, number>();
  /** When the own election is next checked against whom the others follow (s). */
  private nextReconcile = 0;
  /** When each peer's start over was last taken up (see PEER_RESTART_GAP). */
  private readonly peerRestartedAt = new Map<string, number>();
  /** The latest field time of each peer's rock hits in each round ("peer:round", see ROCK_ORDER_SLACK). */
  private readonly lastRockAt = new Map<string, number>();
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
  private readonly ramBudget = new Budget(MAX_RAMS_PER_SECOND);
  private readonly stateBudget = new Budget(STATE_RATE * 3);
  private readonly beamBudget = new Budget(MAX_HITS_PER_SECOND);
  private readonly pingBudget = new Budget(MAX_PING_RATE);
  private readonly pongBudget = new Budget(MAX_PING_RATE);
  /** When every peer is next pinged (see tick). */
  private nextPingAt = 0;
  /** The number of the ping outstanding to each peer: a pong naming any other is stale and ignored. */
  private readonly pingSeq = new Map<string, number>();
  /** When the outstanding ping to each peer went out, on this browser's clock (s). */
  private readonly pingSentAt = new Map<string, number>();
  /** Each peer's last few round trips (ms, see PING_SAMPLES), for the median pingTo reads. */
  private readonly pingSamples = new Map<string, number[]>();
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
      if (this.spaced(`${shooter}>${target}`)) this.guard(() => this.onHit(target, origin, direction, shooter));
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
    transport.on('bh', (d, from) => {
      const shooter = id(d?.i);
      const zone = int(d?.z, 0, MAX_FLEET_ZONE);
      const round = int(d?.n, 0, MAX_COUNT);
      // a nova core's hits on a part are at most all the part takes, a torpedo's TORPEDO_HITS
      const nova = d?.v === 1;
      const count = int(d?.c, 1, nova ? MAX_PART_HITS : TORPEDO_HITS);
      if (!shooter || zone === null || round === null || count === null || ownerOf(shooter) !== from || !this.hitBudget.spend(from)) return;
      // a laser hits one part a shot, as often as it fires; a torpedo's blast and a nova each part once
      if (!this.spaced(nova ? `${shooter}>*${zone}` : count > 1 ? `${shooter}>@${zone}` : `${shooter}>@`)) return;
      this.guard(() => this.onFleetHit(zone, round, shooter, count, nova));
    });
    transport.on('br', (d, from) => {
      // only the lead flies the battleship, so only the lead rams with it
      const state = shovedState(d?.m);
      const round = int(d?.n, 0, MAX_COUNT);
      if (!state || round === null || from !== this.leadId || !this.ramBudget.spend(from)) return;
      this.guard(() => this.onRam(state, round));
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
      if (!torpedo || !position || !this.torpedoBudget.spend(from)) return;
      // the browser that launched it says where it went off, or the one of a ship of its own that
      // took it on its hook (the game checks that it did); any other only for a ship of its own
      // that shot it down (a torpedo's id is its shooter's and a number, see game.fireTorpedo)
      const holder = d?.h === undefined ? null : id(d.h);
      if (holder && ownerOf(holder) === from) this.guard(() => this.onTorpedoGone(torpedo, position, null, holder));
      else if (ownerOf(torpedo.slice(0, torpedo.lastIndexOf('.'))) === from) this.guard(() => this.onTorpedoGone(torpedo, position, null, null));
      else {
        const shooter = id(d?.s);
        if (shooter && ownerOf(shooter) === from) this.guard(() => this.onTorpedoGone(torpedo, position, shooter, null));
      }
    });
    transport.on('ic', (d, from) => {
      const probe = id(d?.c);
      const ship = id(d?.s);
      // a browser that names no third took it in the middle
      const bucket = d?.b === undefined ? 1 : int(d.b, 0, 2);
      if (probe && ship && bucket !== null && ownerOf(ship) === from && this.torpedoBudget.spend(from)) this.guard(() => this.onProbe(probe, ship, bucket));
    });
    transport.on('hk', (d, from) => {
      const ship = id(d?.s);
      if (!ship || ownerOf(ship) !== from || !this.torpedoBudget.spend(from)) return;
      if (d?.x) {
        this.guard(() => this.onHook(ship, null));
        return;
      }
      // a rock with a point on it, a ship, a core, a torpedo or a probe; and the cable out
      const rock = d?.r === undefined ? null : id(d.r);
      const local = d?.l === undefined ? null : vec(d.l, 3, MAX_COORDINATE);
      const target = d?.t === undefined ? null : id(d.t);
      const core = d?.c === undefined ? null : int(d.c, 0, 1);
      const torpedo = d?.o === undefined ? null : id(d.o);
      const probe = d?.p === undefined ? null : id(d.p);
      const length = num(d?.n, 0, MAX_COORDINATE);
      if (length === null || [rock, target, core, torpedo, probe].filter((hold) => hold !== null).length !== 1 || (rock !== null) !== (local !== null)) return;
      this.guard(() => this.onHook(ship, { rock, local, target, core, torpedo, probe, length }));
    });
    transport.on('nv', (d, from) => {
      const ship = id(d?.s);
      const position = vec(d?.p, 3, MAX_COORDINATE);
      if (ship && position && ownerOf(ship) === from && this.torpedoBudget.spend(from)) this.guard(() => this.onNova(ship, position));
    });
    transport.on('ch', (d, from) => {
      const ship = id(d?.s);
      if (ship && CHEATS.includes(d?.r) && this.cheatBudget.spend(from)) this.guard(() => this.onCheat(ship, from));
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
      const shooter = id(d?.s);
      if (!rock || at === null || round === null || !shooter || ownerOf(shooter) !== from || !this.rockBudget.spend(from)) return;
      // a peer's hits in a round come in the order of its field time: one dated before the last
      // it sent would take another Host's points (see game.remoteRock)
      const key = `${from}:${round}`;
      const last = this.lastRockAt.get(key) ?? -Infinity;
      if (at < last - ROCK_ORDER_SLACK) return;
      if (last === -Infinity && this.lastRockAt.size > 256) this.lastRockAt.clear();
      this.lastRockAt.set(key, Math.max(last, at));
      this.guard(() => this.onRock(rock, at, round, shooter));
    });
    transport.on('pi', (d, from) => {
      const seq = int(d?.n, 0, MAX_COUNT);
      if (seq === null || !this.pingBudget.spend(from)) return;
      this.transport.send('po', { n: seq }, from);
    });
    transport.on('po', (d, from) => {
      const seq = int(d?.n, 0, MAX_COUNT);
      if (seq === null || !this.pongBudget.spend(from) || seq !== this.pingSeq.get(from)) return;
      const sentAt = this.pingSentAt.get(from);
      if (sentAt === undefined) return;
      this.pingSentAt.delete(from);
      const samples = this.pingSamples.get(from) ?? [];
      samples.push((seconds() - sentAt) * 1000);
      if (samples.length > PING_SAMPLES) samples.shift();
      this.pingSamples.set(from, samples);
    });
    transport.on('y', (d, from) => {
      // only a browser that just joined or started over takes a field, once, and only from the
      // lead it elects, a peer that was here before it
      const field = fieldState(d?.f);
      const wrecks = wreckStates(d?.w);
      const taken = ids(d?.p);
      const probes = probeStates(d?.q);
      const age = num(d?.g, 0, MAX_FIELD_TIME);
      if (!field || !wrecks || !taken || !probes || age === null) return;
      this.hear(from, age);
      if (this.synced || seconds() - this.startedAt >= SETTLE_MS / 1000) return;
      if (from !== this.leadId || (this.peerJoinedAt.get(from) ?? Infinity) >= this.startedAt) return;
      this.synced = true;
      this.guard(() => this.onSync(field, wrecks, taken, probes));
    });
    transport.onPeerJoin((peer) => {
      if (!this.left) this.guard(() => this.onPeerJoin(peer));
    });
    transport.onPeerLeave((peer) => {
      // join time and last word stay: a link that comes back belongs to the same peer
      this.backAt.delete(peer);
      for (const budget of [this.hitBudget, this.rockBudget, this.destroyBudget, this.wreckBudget, this.torpedoBudget, this.cheatBudget, this.ramBudget, this.stateBudget, this.beamBudget, this.pingBudget, this.pongBudget]) budget.forget(peer);
      for (const key of this.lastHit.keys()) if (ownerOf(key.slice(0, key.indexOf('>'))) === peer) this.lastHit.delete(key);
      this.pingSeq.delete(peer);
      this.pingSentAt.delete(peer);
      this.pingSamples.delete(peer);
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
    const waits = this.startedOver(seconds()) && this.peers.length > 0;
    return !this.justJoined && !waits && this.leadId === this.selfId;
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
  private isLive(peer: string) {
    const now = seconds();
    const heard = now - (this.lastHeard.get(peer) ?? -Infinity) <= LIVENESS_MS / 1000;
    return heard && (this.startedOver(now) || now - (this.backAt.get(peer) ?? -Infinity) >= LIVENESS_MS / 1000);
  }

  /** This browser started over within the last two LIVENESS_MS: it was the one that was gone. */
  private startedOver(now: number) {
    return now - this.restartedAt < (2 * LIVENESS_MS) / 1000;
  }

  /** Whether a peer has gone quiet: nothing heard from it for LIVENESS_MS. */
  isSilent(peer: string) {
    return seconds() - (this.lastHeard.get(peer) ?? -Infinity) > LIVENESS_MS / 1000;
  }

  /**
   * The link's delay to a peer (ms): the median of its last few round trips (see PING_SAMPLES),
   * so one slow or lost ping does not jump the reading around; null before the first pong.
   */
  pingTo(peer: string): number | null {
    const samples = this.pingSamples.get(peer);
    if (!samples?.length) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
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

  /**
   * Whether a peer (or this browser) holds one of the tournament's places: fewer than
   * TOURNAMENT_SIZE of the peers here joined before it. Only they fly, and only they vote on a
   * cheater (see Online.accuse): a browser cannot buy itself a place by saying it flies.
   */
  seated(peer: string): boolean {
    const joined = this.joinedTime(peer);
    if (joined === Infinity) return false;
    let earlier = peer !== this.selfId && this.startedAt < joined ? 1 : 0;
    for (const other of this.peers) if (other !== peer && (this.peerJoinedAt.get(other) ?? Infinity) < joined) earlier++;
    return earlier < TOURNAMENT_SIZE;
  }

  /** When a peer (or this browser) joined or last started over, on this browser's clock (s); Infinity for one not heard of. */
  joinedTime(peer: string | null): number {
    if (peer === this.selfId) return this.startedAt;
    return (peer === null ? undefined : this.peerJoinedAt.get(peer)) ?? Infinity;
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
    if (!this.justJoined && now >= this.nextReconcile) {
      this.nextReconcile = now + RECONCILE_SECONDS;
      this.reconcile();
    }
    if (now >= this.nextPingAt) {
      this.nextPingAt = now + PING_INTERVAL;
      for (const peer of this.peers) this.sendPing(peer);
    }
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

  /** Sends the states of the own ships (see statesDue), with the time they go out on this page's clock (see SenderClock). */
  sendStates(now: number, states: ShipState[], round: RoundState | null) {
    this.nextStateAt = now + 1 / STATE_RATE;
    this.transport.send('s', { s: states, r: round, g: this.age(), l: this.leadId, c: +seconds().toFixed(3) });
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

  /** A ship of this browser hit a part of the battleship `count` times; `v: 1` when its nova core did it. */
  sendFleetHit(zone: number, round: number, shooter: string, count: number, nova: boolean) {
    this.transport.send('bh', { z: zone, n: round, i: shooter, c: count, ...(nova ? { v: 1 } : {}) });
  }

  sendTorpedo(torpedo: string, shooter: string, target: string | null, position: Vec, velocity: Vec) {
    this.transport.send('tl', { i: torpedo, s: shooter, t: target, p: position, v: velocity });
  }

  /** A ship of this browser hooked a rock, a ship, a core or a torpedo, or let go (null). */
  sendHook(ship: string, hold: { rock: string; local: Vec } | { target: string } | { core: number } | { torpedo: string } | { probe: string } | null, length = 0) {
    if (!hold) this.transport.send('hk', { s: ship, x: 1 });
    else if ('rock' in hold) this.transport.send('hk', { s: ship, r: hold.rock, l: hold.local, n: length });
    else if ('core' in hold) this.transport.send('hk', { s: ship, c: hold.core, n: length });
    else if ('torpedo' in hold) this.transport.send('hk', { s: ship, o: hold.torpedo, n: length });
    else if ('probe' in hold) this.transport.send('hk', { s: ship, p: hold.probe, n: length });
    else this.transport.send('hk', { s: ship, t: hold.target, n: length });
  }

  sendNova(ship: string, position: Vec) {
    this.transport.send('nv', { s: ship, p: position });
  }

  /** Tells everyone that a ship of another browser did something no honest browser reports. */
  sendCheat(ship: string, cheat: Cheat) {
    this.transport.send('ch', { s: ship, r: cheat });
  }

  /** The tournament has named a peer a cheater: it is cast out (see Transport.block). */
  castOut(peer: string) {
    this.transport.block(peer);
  }

  isCastOut(peer: string) {
    return this.transport.isBlocked(peer);
  }

  sendProbe(probe: string, ship: string, bucket: number) {
    this.transport.send('ic', { c: probe, s: ship, b: bucket });
  }

  /** A torpedo went off where it was (told by the browser that launched it, or that of `holder`, whose hook took it), or the own ship `shooter` shot it down there. */
  sendTorpedoGone(torpedo: string, position: Vec, shooter: string | null, holder: string | null = null) {
    this.transport.send('tg', { i: torpedo, p: position, ...(shooter ? { s: shooter } : {}), ...(holder ? { h: holder } : {}) });
  }

  /** Tells the browser that runs `target` that the own torpedo `torpedo` of `shooter` hit it. */
  sendTorpedoHit(owner: string, target: string, shooter: string, torpedo: string) {
    this.transport.send('tk', { t: target, s: shooter, i: torpedo }, owner);
  }

  /** `at` is the field time of the hit and `round` the round it fell in, so a rock breaks into the same fragments everywhere; `shooter` fired the beam. */
  sendRock(rock: string, at: number, round: number, shooter: string) {
    this.transport.send('r', { i: rock, t: +at.toFixed(3), n: round, s: shooter });
  }

  /** The lead's battleship rammed a piece of the field in `round`: its motion since (see game/fleet, Fleet.ram). */
  sendRam(state: ShovedState, round: number) {
    this.transport.send('br', { m: state, n: round });
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

  /** Pings a peer once (see tick): its pong times the round trip (see pingTo). A stale pong (an older number) is ignored, so only the latest ping in flight to it counts. */
  private sendPing(peer: string) {
    const seq = (this.pingSeq.get(peer) ?? 0) + 1;
    this.pingSeq.set(peer, seq);
    this.pingSentAt.set(peer, seconds());
    this.transport.send('pi', { n: seq }, peer);
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
   * behind the lead instead, clearly behind, so it can never make the lead step back as one of
   * two that joined at once (see receiveStates).
   */
  private plausibleJoin(peer: string, joined: number): number {
    if (this.justJoined) return joined;
    // nor can it have come much before this browser first heard it: its link forms within
    // LINK_SLACK, so a claim to be older is moved up to then (a peer that really was here longer
    // is believed once most of the others follow it, see reconcile), and it never ties with the
    // lead (see receiveStates)
    this.late.add(peer);
    joined = Math.max(joined, seconds() - LINK_SLACK);
    const lead = this.leadId;
    const leadJoined = lead === this.selfId ? this.startedAt : (this.peerJoinedAt.get(lead) ?? this.startedAt);
    if (joined >= leadJoined || peer === lead) return joined;
    this.linedUp.add(peer);
    return leadJoined + 2 * RESTART_SLACK;
  }

  /**
   * Checks the own election against whom the others follow (their states say), once settled and
   * every RECONCILE_SECONDS from then on. A newcomer believed every join time it heard while it
   * settled, so a peer that lied about its age might lead it alone; and a browser that reached the
   * others only after it settled lined them up behind its own lead (see plausibleJoin), so it
   * might lead alone itself. When most of the live peers that follow another follow one peer, and
   * not the one this browser elects, that one's own claim is believed and the one it would have
   * elected lines up behind it; a browser that led alone starts over, behind them, and takes
   * their world. A peer's vote for itself does not count, so a single liar never gets a majority.
   * Browsers that each lead alone (two that reached each other only after settling) have no vote
   * between them: the one with the higher id steps back, as two that joined at once do, so they
   * never play on in two worlds; a liar can take the lead of such a room of two this way, never
   * one where others vote.
   */
  private reconcile() {
    const votes = new Map<string, number>();
    let reporters = 0;
    let rival: string | null = null;
    for (const peer of this.peers) {
      const followed = this.follows.get(peer);
      if (!this.isLive(peer) || followed === undefined) continue;
      // another browser that leads by itself
      if (followed === peer) {
        if (rival === null || peer < rival) rival = peer;
        continue;
      }
      reporters++;
      votes.set(followed, (votes.get(followed) ?? 0) + 1);
    }
    // browsers that each lead alone, with nobody to vote between them, cannot tell an honest
    // older one from a liar: they settle it as two that joined at once, the higher id steps back
    if (reporters === 0 && rival !== null && this.isLead && rival < this.selfId) {
      this.restart();
      return;
    }
    let best: string | null = null;
    let most = 0;
    for (const [peer, count] of votes) {
      if (count > most) {
        best = peer;
        most = count;
      }
    }
    const lead = this.leadId;
    if (best === null || best === lead || best === this.selfId || most * 2 <= reporters || !this.peers.includes(best) || !this.isLive(best)) return;
    const claim = Math.min(this.claimed.get(best) ?? Infinity, this.peerJoinedAt.get(best) ?? Infinity);
    if (!Number.isFinite(claim)) return;
    this.linedUp.delete(best);
    this.peerJoinedAt.set(best, claim);
    if (lead === this.selfId) {
      this.restart();
      return;
    }
    if ((this.peerJoinedAt.get(lead) ?? Infinity) <= claim) {
      this.peerJoinedAt.set(lead, claim + 2 * RESTART_SLACK);
      this.linedUp.add(lead);
    }
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
    this.claimed.set(peer, joined);
    const known = this.peerJoinedAt.get(peer);
    if (known === undefined) this.peerJoinedAt.set(peer, this.plausibleJoin(peer, joined));
    else if (joined > known + RESTART_SLACK) {
      // the peer started over: it was the one that was gone
      this.peerJoinedAt.set(peer, joined);
      if (now - (this.peerRestartedAt.get(peer) ?? -Infinity) >= PEER_RESTART_GAP) {
        this.peerRestartedAt.set(peer, now);
        this.guard(() => this.onPeerRestart(peer));
      }
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
    const followed = d.l === undefined ? null : id(d.l);
    if (followed) this.follows.set(from, followed);
    const round = d.r === null ? null : this.roundState(d.r);
    if (round === undefined) return;
    // two browsers lead at once because their join times lie too close to tell apart over the
    // network: the one with the higher id steps back (a peer that came clearly later, or was
    // lined up behind the lead, cannot make the lead step back by sending a round clock)
    const tie = !this.linedUp.has(from) && !this.late.has(from) && Math.abs((this.peerJoinedAt.get(from) ?? Infinity) - this.startedAt) <= RESTART_SLACK;
    if (round && tie && this.isLead && this.isLive(from) && from < this.selfId) this.restart();
    const sent = d.c === undefined ? null : num(d.c, 0, MAX_FIELD_TIME);
    if (sent === null && d.c !== undefined) return;
    this.guard(() => this.onStates(states as ShipState[], round, from, sent));
  }

  private roundState(x: unknown): RoundState | undefined {
    if (!isRecord(x)) return undefined;
    const round = { id: int(x.id, 0, MAX_COUNT), left: num(x.left, MIN_ROUND_LEFT, ROUND_LIMIT), field: num(x.field, 0, MAX_FIELD_TIME) };
    if (round.id === null || round.left === null || round.field === null) return undefined;
    const state = round as RoundState;
    if (x.m !== undefined) {
      const mode = roomMode(x.m);
      if (mode !== x.m) return undefined;
      state.m = mode;
    }
    if (x.f !== undefined) {
      const flags = flagsState(x.f);
      if (!flags) return undefined;
      state.f = flags;
    }
    if (x.b !== undefined) {
      const fleet = fleetState(x.b);
      if (!fleet) return undefined;
      state.b = fleet;
    }
    return state;
  }

  /** Whether a hit `pair` ("shooter>what") comes at least MIN_HIT_INTERVAL after the last; notes it. */
  private spaced(pair: string): boolean {
    const now = seconds();
    if (now - (this.lastHit.get(pair) ?? -Infinity) < MIN_HIT_INTERVAL) return false;
    this.lastHit.set(pair, now);
    if (this.lastHit.size > 1024) for (const [key, at] of this.lastHit) if (now - at > 1) this.lastHit.delete(key);
    return true;
  }

  /** Runs a handler unless this peer has left the room. */
  private guard(handler: () => void) {
    if (!this.left) handler();
  }
}
