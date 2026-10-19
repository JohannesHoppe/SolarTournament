import { LocalTransport, TrysteroTransport, type Transport } from './transport';
import { num } from './validate';
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
/** Tournaments the list keeps at most, so a flood of announcements cannot swamp a browser. */
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
  /** Called whenever the list changes. */
  onChange: (listings: Listing[]) => void = () => {};
  private readonly listings = new Map<string, Listing & { heard: number }>();
  private announcement: Listing | null = null;
  private readonly timer: number;

  private constructor(private readonly transport: Transport) {
    transport.on('a', (d) => this.hear(d));
    // a newcomer learns of the own tournament at once instead of after the next round of announcements
    transport.onPeerJoin((peer) => {
      if (this.announcement) transport.send('a', this.wire(this.announcement), peer);
    });
    this.timer = window.setInterval(() => {
      if (this.announcement) transport.send('a', this.wire(this.announcement));
      this.forget();
    }, ANNOUNCE_MS);
  }

  /** Enters the lobby; `local` uses tabs of this browser instead of the internet. */
  static async open(local: boolean): Promise<Lobby> {
    return new Lobby(local ? new LocalTransport(LOBBY_ROOM) : await TrysteroTransport.join(LOBBY_ROOM));
  }

  /** Makes the own public tournament known from now on (or stops, with null). */
  announce(listing: Listing | null) {
    const first = !this.announcement && listing;
    this.announcement = listing;
    if (first) this.transport.send('a', this.wire(listing));
  }

  /** The public tournaments heard of, the fullest first. */
  list(): Listing[] {
    return [...this.listings.values()].sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name));
  }

  close() {
    clearInterval(this.timer);
    this.transport.leave();
  }

  private wire(listing: Listing) {
    return { c: listing.code, n: listing.name, h: listing.hosts, b: listing.bots, l: Math.round(listing.left) };
  }

  /** An announcement from another browser; checked like every message from a peer. */
  private hear(d: unknown) {
    if (typeof d !== 'object' || d === null) return;
    const x = d as Record<string, unknown>;
    const code = roomCode(x.c);
    const name = roomName(x.n);
    const hosts = num(x.h, 1, TOURNAMENT_SIZE);
    const left = num(x.l, -3600, 3600);
    if (!code || !name || hosts === null || left === null || typeof x.b !== 'boolean') return;
    if (!this.listings.has(code) && this.listings.size >= MAX_LISTED) return;
    this.listings.set(code, { code, name, hosts, bots: x.b, left, heard: performance.now() });
    this.onChange(this.list());
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
