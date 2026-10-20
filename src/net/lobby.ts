import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import { num, ROUND_LIMIT } from './validate';
import { roomCode, roomName } from './room';
import { TOURNAMENT_SIZE } from './session';

/**
 * The lobby: one shared room on the same relays as the tournaments, where public tournaments
 * make themselves known. The lead browser of a public tournament announces it every few
 * seconds; a Host looking at the list of tournaments listens. Private tournaments never enter
 * the lobby.
 */
const LOBBY_ROOM = 'lobby';
/** A public tournament announces itself this often (ms), and to every newcomer at once. */
const ANNOUNCE_MS = 5000;
/** A tournament not heard of for this long (ms) has emptied or gone private: it leaves the list. */
const FORGET_MS = 16000;
/**
 * A tournament's announcements count only from the browser that announced it last; another one
 * takes over a listing once that browser has been quiet this long (ms), as when a tournament's
 * lead moves on.
 */
const TAKEOVER_MS = 2 * ANNOUNCE_MS;
/**
 * The lobby counts as listening once it has been open this long (ms): the first connections to
 * the other browsers take a few seconds, so an empty list before that says nothing yet.
 */
const SETTLE_MS = 6000;
/** Tournaments the list keeps at most; beyond it the one heard of longest ago goes. */
const MAX_LISTED = 50;

/** A public tournament as the lobby lists it. */
export interface Listing {
  code: string;
  name: string;
  /** Hosts whose clones fly. */
  hosts: number;
  bots: boolean;
  /** Seconds left in the running round. */
  left: number;
}

export class Lobby {
  /** Called when a tournament comes, goes, or changes its name, Hosts or rules. */
  onChange: (listings: Listing[]) => void = () => {};
  private readonly listings = new Map<string, Listing & { heard: number; from: string }>();
  private announcement: Listing | null = null;
  private readonly timer: number;
  private readonly settleTimer: number;
  private readonly openedAt = performance.now();

  private constructor(private readonly transport: Transport) {
    transport.on('a', (d, from) => this.hear(d, from));
    // a newcomer learns of the own tournament at once instead of after the next round of announcements
    transport.onPeerJoin((peer) => {
      if (this.announcement) transport.send('a', this.wire(this.announcement), peer);
    });
    this.timer = window.setInterval(() => {
      if (this.announcement) transport.send('a', this.wire(this.announcement));
      this.forget();
    }, ANNOUNCE_MS);
    // once settled, an empty list means there is none
    this.settleTimer = window.setTimeout(() => this.onChange(this.list()), SETTLE_MS);
  }

  /** Enters the lobby; `local` uses tabs of this browser instead of the internet. */
  static async open(local: boolean): Promise<Lobby> {
    return new Lobby(local ? new LocalTransport(LOBBY_ROOM) : await TrysteroTransport.join(LOBBY_ROOM));
  }

  /** Whether the lobby has listened long enough for an empty list to mean something. */
  get settled() {
    return performance.now() - this.openedAt >= SETTLE_MS;
  }

  /** Makes the own public tournament known from now on (or stops, with null). */
  announce(listing: Listing | null) {
    const first = !this.announcement && listing;
    this.announcement = listing;
    if (first) this.transport.send('a', this.wire(listing));
  }

  /** The public tournaments heard of, the fullest first; the time left counts on from the last announcement. */
  list(): Listing[] {
    const now = performance.now();
    return [...this.listings.values()]
      .sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name))
      .map(({ code, name, hosts, bots, left, heard }) => ({ code, name, hosts, bots, left: left - (now - heard) / 1000 }));
  }

  close() {
    clearInterval(this.timer);
    clearTimeout(this.settleTimer);
    this.transport.leave();
  }

  private wire(listing: Listing) {
    return { c: listing.code, n: listing.name, h: Math.min(listing.hosts, TOURNAMENT_SIZE), b: listing.bots, l: Math.round(listing.left) };
  }

  /**
   * An announcement from another browser; checked like every message from a peer. A browser
   * leads one tournament at a time, so its newest announcement replaces its earlier one.
   */
  private hear(d: unknown, from: string) {
    if (typeof d !== 'object' || d === null) return;
    const x = d as Record<string, unknown>;
    const code = roomCode(x.c);
    const name = roomName(x.n);
    const hosts = num(x.h, 1, TOURNAMENT_SIZE);
    const left = num(x.l, -ROUND_LIMIT, ROUND_LIMIT);
    if (!code || !name || hosts === null || left === null || typeof x.b !== 'boolean') return;
    const now = performance.now();
    const known = this.listings.get(code);
    if (known && known.from !== from && now - known.heard < TAKEOVER_MS) return;
    let changed = !known || known.name !== name || known.hosts !== hosts || known.bots !== x.b;
    for (const [other, listing] of this.listings) {
      if (other === code || listing.from !== from) continue;
      this.listings.delete(other);
      changed = true;
    }
    if (!known && this.listings.size >= MAX_LISTED) {
      let oldest: string | null = null;
      for (const [other, listing] of this.listings) if (!oldest || listing.heard < this.listings.get(oldest)!.heard) oldest = other;
      if (oldest) this.listings.delete(oldest);
    }
    this.listings.set(code, { code, name, hosts, bots: x.b, left, heard: now, from });
    if (changed) this.onChange(this.list());
  }

  private forget() {
    const now = performance.now();
    let changed = false;
    for (const [code, listing] of this.listings) {
      if (now - listing.heard < FORGET_MS) continue;
      this.listings.delete(code);
      changed = true;
    }
    if (changed) this.onChange(this.list());
  }
}
