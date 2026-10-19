import type { AsteroidState } from '../world/asteroids';
import type { ShipState } from '../ship/ship';
import { LocalTransport, TrysteroTransport, type Transport } from './transport';

/** Ship states go out this often (Hz); the receivers predict the motion in between. */
const STATE_RATE = 15;
/**
 * A newcomer waits this long for the peers already in the room before deciding who hosts (ms).
 * Over the internet the first WebRTC connections take a few seconds.
 */
const SETTLE_MS = 6000;

/** Round clock of the host: which round is running and how many seconds are left. */
export type RoundState = { id: number; left: number };

export type Vec = number[];

/**
 * The tournament protocol between peers. Every peer simulates its own ship (and the host its
 * bots) and sends their states. The shooter decides whether a beam hit and tells the owner
 * of the ship it hit; the owner applies the damage and announces a destruction. Asteroid hits
 * go to everyone, fragments are deterministic. The host (the peer longest in the room) runs
 * the bots, the round clock and brings newcomers up to date.
 */
export class Session {
  onStates: (states: ShipState[], round: RoundState | null, from: string) => void = () => {};
  onFire: (shooter: string, from: Vec, to: Vec) => void = () => {};
  onHit: (target: string, origin: Vec, direction: Vec, shooter: string) => void = () => {};
  onDestroyed: (victim: string, killer: string | null) => void = () => {};
  onRock: (id: string) => void = () => {};
  onSync: (asteroids: AsteroidState[]) => void = () => {};
  onPeerJoin: (id: string) => void = () => {};
  onPeerLeave: (id: string) => void = () => {};

  private nextStateAt = 0;
  /** When this peer joined (ms since epoch), and what the others reported about themselves. */
  private readonly joinedAt = Date.now();
  private readonly peerJoinedAt = new Map<string, number>();

  private constructor(private readonly transport: Transport, readonly room: string) {
    transport.on('s', (d: { s: ShipState[]; r: RoundState | null; j: number }, from) => {
      this.peerJoinedAt.set(from, d.j);
      this.onStates(d.s, d.r, from);
    });
    transport.onPeerLeave((id) => this.peerJoinedAt.delete(id));
    transport.on('f', (d: { i: string; a: Vec; b: Vec }) => this.onFire(d.i, d.a, d.b));
    transport.on('h', (d: { t: string; o: Vec; d: Vec; i: string }) => this.onHit(d.t, d.o, d.d, d.i));
    transport.on('x', (d: { v: string; k: string | null }) => this.onDestroyed(d.v, d.k));
    transport.on('r', (d: { i: string }) => this.onRock(d.i));
    transport.on('y', (d: { a: AsteroidState[] }) => this.onSync(d.a));
    transport.onPeerJoin((id) => this.onPeerJoin(id));
    transport.onPeerLeave((id) => this.onPeerLeave(id));
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
   * The peer that has been in the room longest hosts (ties: lower id), so a newcomer never
   * takes over a running tournament. Every peer comes to the same answer on its own.
   */
  get isHost() {
    return this.hostId === this.selfId;
  }

  get hostId(): string {
    // peers that have not sent their join time yet count as newer
    let host = this.selfId;
    let hostJoined = this.joinedAt;
    for (const id of this.peers) {
      const joined = this.peerJoinedAt.get(id) ?? Infinity;
      if (joined < hostJoined || (joined === hostJoined && id < host)) {
        host = id;
        hostJoined = joined;
      }
    }
    return host;
  }

  /**
   * True right after joining (peers may still be connecting) and while some peers have not
   * reported their join time: the host role is not decided yet.
   */
  get settling() {
    return this.justJoined || this.peers.some((id) => !this.peerJoinedAt.has(id));
  }

  /** This peer only just entered the room and does not know the others yet. */
  get justJoined() {
    return Date.now() - this.joinedAt < SETTLE_MS;
  }

  /** Sends the states of the own ships when the next update is due. */
  sendStates(now: number, states: ShipState[], round: RoundState | null) {
    if (now < this.nextStateAt) return;
    this.nextStateAt = now + 1 / STATE_RATE;
    this.transport.send('s', { s: states, r: round, j: this.joinedAt });
  }

  sendFire(shooter: string, from: Vec, to: Vec) {
    this.transport.send('f', { i: shooter, a: from, b: to });
  }

  sendHit(owner: string, target: string, origin: Vec, direction: Vec, shooter: string) {
    this.transport.send('h', { t: target, o: origin, d: direction, i: shooter }, owner);
  }

  sendDestroyed(victim: string, killer: string | null) {
    this.transport.send('x', { v: victim, k: killer });
  }

  sendRock(id: string) {
    this.transport.send('r', { i: id });
  }

  sendSync(to: string, asteroids: AsteroidState[]) {
    this.transport.send('y', { a: asteroids }, to);
  }

  leave() {
    this.transport.leave();
  }
}

/** A short, readable room code for invitation links. */
export function newRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
