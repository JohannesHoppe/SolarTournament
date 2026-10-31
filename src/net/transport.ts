/**
 * Message transport between the players of a tournament. Two implementations:
 * - Trystero: WebRTC data channels between browsers, found via public Nostr relays.
 *   No server of our own.
 * - Local: BroadcastChannel between tabs of the same browser, for development and tests.
 */
import { msg } from '../i18n/i18n';
import relayList from './relays.json';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Handler = (data: any, from: string) => void;

export interface Transport {
  readonly selfId: string;
  /** Sends to one peer, or to everyone when `to` is omitted. */
  send(type: string, data: Json, to?: string): void;
  on(type: string, handler: Handler): void;
  /** Casts a peer out: nothing it sends is taken any more, and nothing is sent to it. */
  block(peer: string): void;
  isBlocked(peer: string): boolean;
  onPeerJoin(handler: (id: string) => void): void;
  onPeerLeave(handler: (id: string) => void): void;
  peers(): string[];
  leave(): void;
  /** Why the TURN relay is not available (the HUD names it), or null when it is or not needed. */
  readonly relayOff: string | null;
}

/**
 * The version of what goes over the network. Every push goes live while Hosts keep tabs of the
 * build before open, and a build checks every message by its own rules (see validate.ts): one
 * that sends a key the other lacks, or a value the other takes for a lie, would drop the other's
 * states and fields whole. So builds of different protocols never meet: they play in rooms and
 * a lobby of their own. A change to a message that a build before it would read otherwise (a
 * key added, removed or required, a bound narrowed, a meaning changed) raises it by one.
 */
export const PROTOCOL = 2;
/** Identifies the game and its protocol on the signaling relays and between local tabs; peers with other app ids never meet. */
const APP_ID = `solartournament-2584-p${PROTOCOL}`;
/**
 * The public Nostr relays every browser announces itself on, checked every week by
 * tools/relays/check.ts (`npm run relays`): all browsers of a build share them, so two Hosts
 * meet as long as one of them works for both.
 */
const SIGNALING_RELAYS: string[] = relayList.relays;
/** How long the list's relays have to open a connection (ms) before Trystero's own relays take over. */
const RELAY_PATIENCE_MS = 10_000;
/** No relay of the list answered in this browser: from now on it uses Trystero's own choice. */
let listFailed = false;
/**
 * The STUN server a browser asks for its own public address: only Cloudflare's, which hosts
 * the game anyway, so no further company learns who plays (the privacy policy names it).
 */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
/** Cloudflare's TURN relay comes with credentials from the game's own Pages Function (functions/turn.ts); a slow answer is not waited for (ms). */
const TURN_PATH = '/turn';
const TURN_PATIENCE_MS = 3000;
/** The credentials hold an hour (functions/turn.ts); fresh ones are fetched well before (ms). */
const TURN_REFRESH_MS = 50 * 60 * 1000;

/** Why functions/turn.ts hands out no relay, in the words the HUD translates (the function names nothing else; what an upstream answered stays in its log); any other answer goes to the console. */
const RELAY_REASONS = [msg('foreign site'), msg('not set up'), msg('monthly budget spent'), msg('budget unreadable'), msg('Cloudflare answered')];

function relayReason(off: string): string {
  const reason = RELAY_REASONS.find((known) => off.startsWith(known));
  if (reason !== off) console.warn(`SolarTournament: TURN relay off: ${off.slice(0, 80)}`);
  return reason ?? msg('no relay');
}

/**
 * The relays a browser may use: STUN, and Cloudflare's TURN relay for networks that block
 * direct connections (strict firewalls, carrier-grade NAT). Without an answer from /turn (the
 * dev server, a project without a TURN key) the game connects with STUN alone.
 */
async function iceServers(): Promise<{ servers: RTCIceServer[]; off: string | null }> {
  let answer: Response;
  try {
    answer = await fetch(TURN_PATH, { signal: AbortSignal.timeout(TURN_PATIENCE_MS), cache: 'no-store' });
  } catch {
    return { servers: ICE_SERVERS, off: msg('no answer') };
  }
  try {
    const { iceServers: relays, off } = (await answer.json()) as { iceServers?: RTCIceServer[]; off?: unknown };
    if (Array.isArray(relays) && relays.length) return { servers: [...ICE_SERVERS, ...relays], off: null };
    return { servers: ICE_SERVERS, off: typeof off === 'string' ? relayReason(off) : msg('no relay') };
  } catch {
    // not the game's function (the dev server answers with a page)
    return { servers: ICE_SERVERS, off: null };
  }
}
/** No message is bigger than this (bytes): the largest, a full asteroid field, is about 15 KB. */
const MAX_MESSAGE_BYTES = 64 * 1024;
/**
 * Trystero rooms open in this browser: a tournament and the lobby can be open at once, and the
 * relays only go to sleep when the last of them is left.
 */
let openRooms = 0;

/**
 * Keeps the relays asleep while no Trystero room is open. Trystero's pause only holds sockets
 * that close afterwards; a reconnect already scheduled when the last room is left would open
 * a new socket anyway. So while no room is open, a socket to another host comes back already
 * closed, which sends Trystero back to waiting until the next room resumes the relays.
 */
function guardRelays() {
  if ((window.WebSocket as { guarded?: boolean }).guarded) return;
  const Native = window.WebSocket;
  class Guarded extends Native {
    static readonly guarded = true;
    constructor(url: string | URL, protocols?: string | string[]) {
      if (openRooms === 0 && new URL(url, location.href).host !== location.host) return closedSocket(String(url));
      super(url, protocols);
    }
  }
  window.WebSocket = Guarded;
}

/** A WebSocket that never connects: closed from the start, it reports its close as soon as someone listens. */
function closedSocket(url: string): WebSocket {
  const socket = { url, readyState: 3, send() {}, close() {}, addEventListener() {}, removeEventListener() {} } as unknown as WebSocket;
  Object.defineProperty(socket, 'onclose', {
    set: (handler: ((event: CloseEvent) => void) | null) => setTimeout(() => handler?.(new CloseEvent('close'))),
  });
  return socket;
}

abstract class BaseTransport implements Transport {
  abstract readonly selfId: string;
  relayOff: string | null = null;
  protected readonly handlers = new Map<string, Handler[]>();
  protected joinHandlers: ((id: string) => void)[] = [];
  protected leaveHandlers: ((id: string) => void)[] = [];

  abstract send(type: string, data: Json, to?: string): void;
  abstract peers(): string[];
  abstract leave(): void;

  on(type: string, handler: Handler) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  onPeerJoin(handler: (id: string) => void) {
    this.joinHandlers.push(handler);
  }

  onPeerLeave(handler: (id: string) => void) {
    this.leaveHandlers.push(handler);
  }

  /** Peers cast out of the tournament (see block). */
  protected readonly blocked = new Set<string>();
  /** The same peers as a list, kept for the messages that carry it. */
  protected blockedList: string[] = [];

  /** Casts a peer out: nothing it sends is taken any more, and nothing is sent to it; to this browser it has left. */
  block(peer: string) {
    if (this.blocked.has(peer)) return;
    this.blocked.add(peer);
    this.blockedList = [...this.blocked];
    this.forget(peer);
    for (const handler of this.leaveHandlers) handler(peer);
  }

  isBlocked(peer: string) {
    return this.blocked.has(peer);
  }

  /** A peer is gone for good: no longer one of peers(), and its leaving is not told again. */
  protected abstract forget(peer: string): void;

  protected dispatch(type: string, data: unknown, from: string) {
    if (this.blocked.has(from)) return;
    for (const handler of this.handlers.get(type) ?? []) handler(data, from);
  }
}

export class TrysteroTransport extends BaseTransport {
  readonly selfId: string;
  private room!: import('trystero').Room;
  private action!: import('trystero').MessageAction<Json>;
  private readonly connected = new Set<string>();
  private targets: string[] | null = null;
  /** Trystero reads it for every new connection, so fresh credentials reach the next one too. */
  private readonly rtcConfig: RTCConfiguration;
  private readonly refresh: number;
  private readonly fallback: number;
  private left = false;

  private constructor(
    private readonly trystero: typeof import('trystero'),
    private readonly roomId: string,
    relays: { servers: RTCIceServer[]; off: string | null },
  ) {
    super();
    this.selfId = trystero.selfId;
    // the relays were put to sleep when the last room was left
    if (openRooms++ === 0) trystero.resumeRelayReconnection();
    this.rtcConfig = { iceServers: relays.servers };
    this.relayOff = relays.off;
    this.open(listFailed ? undefined : SIGNALING_RELAYS);
    this.fallback = window.setTimeout(() => void this.fallBack(), RELAY_PATIENCE_MS);
    this.refresh = window.setInterval(() => void this.renewRelays(), TURN_REFRESH_MS);
  }

  /** Joins the room over the given signaling relays (none: Trystero's own choice from its built-in list). */
  private open(relayUrls?: string[]) {
    this.room = this.trystero.joinRoom(
      { appId: APP_ID, rtcConfig: this.rtcConfig, maxReceiveBytes: MAX_MESSAGE_BYTES, relayConfig: relayUrls ? { urls: relayUrls } : undefined },
      this.roomId,
    );
    // one action for all message types keeps the channel setup small
    this.action = this.room.makeAction<Json>('st');
    this.action.onMessage = (message, { peerId }) => {
      const { t, d } = (message ?? {}) as { t?: unknown; d?: Json };
      if (typeof t === 'string') this.dispatch(t, d ?? null, peerId);
    };
    this.room.onPeerJoin = (id) => {
      // a peer cast out stays out, however often it connects
      if (this.blocked.has(id)) return;
      this.connected.add(id);
      this.retarget();
      for (const handler of this.joinHandlers) handler(id);
    };
    this.room.onPeerLeave = (id) => {
      if (!this.connected.delete(id)) return;
      this.retarget();
      for (const handler of this.leaveHandlers) handler(id);
    };
  }

  /**
   * When no relay of the list has answered, joins again over Trystero's own choice. Trystero
   * picks its relays when the first room opens, so the room is only joined again while it is the
   * only one open; otherwise the next room this browser opens takes Trystero's choice.
   */
  private async fallBack() {
    if (this.left || listFailed) return;
    const sockets = Object.values(this.trystero.getRelaySockets() as Record<string, WebSocket>);
    if (sockets.some((socket) => socket.readyState === WebSocket.OPEN)) return;
    listFailed = true;
    console.warn("SolarTournament: no relay of the list answered, falling back to Trystero's own relays");
    if (openRooms > 1) return;
    await this.room.leave();
    if (!this.left) this.open();
  }

  protected forget(peer: string) {
    this.connected.delete(peer);
    this.retarget();
  }

  /** Who a message to everyone goes to: all, or, once a peer is cast out, the peers still here. */
  private retarget() {
    this.targets = this.blocked.size ? [...this.connected] : null;
  }

  /** Loads Trystero only when a player goes online, and asks for the TURN relay meanwhile. */
  static async join(roomId: string): Promise<TrysteroTransport> {
    guardRelays();
    const [trystero, relays] = await Promise.all([import('trystero'), iceServers()]);
    return new TrysteroTransport(trystero, roomId, relays);
  }

  send(type: string, data: Json, to?: string) {
    // to everyone but a peer cast out (see block)
    const target = to ? (this.blocked.has(to) ? [] : [to]) : this.targets;
    if (target?.length === 0) return;
    void this.action.send({ t: type, d: data }, target ? { target } : undefined).catch(() => {
      // the peer left while the message was on its way
    });
  }

  peers() {
    return [...this.connected];
  }

  /** Hands fresh TURN credentials to the connections that are open and to those still to come. */
  private async renewRelays() {
    const { servers, off } = await iceServers();
    if (this.left) return;
    this.rtcConfig.iceServers = servers;
    this.relayOff = off;
    for (const connection of Object.values(this.room.getPeers())) {
      try {
        connection.setConfiguration({ ...connection.getConfiguration(), iceServers: servers });
      } catch {
        // a connection that closed meanwhile takes no configuration
      }
    }
  }

  /**
   * Leaves the room; with the last open room it also closes the connections to the signaling
   * relays: outside a tournament and the lobby the game talks to no relay at all.
   */
  leave() {
    if (this.left) return;
    this.left = true;
    clearInterval(this.refresh);
    clearTimeout(this.fallback);
    void this.room.leave();
    if (--openRooms > 0) return;
    this.trystero.pauseRelayReconnection();
    for (const socket of Object.values(this.trystero.getRelaySockets() as Record<string, WebSocket>)) socket.close();
  }
}

/** Peers that stay silent this long (s) count as gone. */
const LOCAL_TIMEOUT = 4;

export class LocalTransport extends BaseTransport {
  readonly selfId = Math.random().toString(36).slice(2, 10);
  private readonly channel: BroadcastChannel;
  private readonly lastSeen = new Map<string, number>();
  private readonly heartbeat: number;

  constructor(roomId: string) {
    super();
    this.channel = new BroadcastChannel(`${APP_ID}:${roomId}`);
    this.channel.onmessage = (e) => this.receive(e.data);
    this.post({ t: '_hello' });
    this.heartbeat = window.setInterval(() => {
      this.post({ t: '_beat' });
      const now = performance.now() / 1000;
      for (const [id, seen] of this.lastSeen) if (now - seen > LOCAL_TIMEOUT) this.drop(id);
    }, 1000);
    window.addEventListener('pagehide', () => this.leave());
  }

  send(type: string, data: Json, to?: string) {
    this.post({ t: type, d: data, to });
  }

  peers() {
    return [...this.lastSeen.keys()];
  }

  protected forget(peer: string) {
    this.lastSeen.delete(peer);
  }

  leave() {
    clearInterval(this.heartbeat);
    this.post({ t: '_bye' });
    this.channel.close();
  }

  private post(message: { t: string; d?: Json; to?: string }) {
    if (message.to && this.blocked.has(message.to)) return;
    try {
      // the channel reaches every tab: a peer cast out reads past what is not meant for it
      this.channel.postMessage({ ...message, from: this.selfId, skip: this.blockedList.length ? this.blockedList : undefined });
    } catch {
      // channel already closed
    }
  }

  private receive(message: { t: string; d: Json; to?: string; from: string; skip?: string[] }) {
    const { t, d, to, from, skip } = message;
    if ((to && to !== this.selfId) || skip?.includes(this.selfId) || this.blocked.has(from)) return;
    if (t === '_bye') return this.drop(from);
    const known = this.lastSeen.has(from);
    this.lastSeen.set(from, performance.now() / 1000);
    if (!known) {
      // answer a newcomer, so it learns about us without waiting for the next heartbeat
      if (t === '_hello') this.post({ t: '_beat' });
      for (const handler of this.joinHandlers) handler(from);
    }
    if (!t.startsWith('_')) this.dispatch(t, d, from);
  }

  private drop(id: string) {
    if (!this.lastSeen.delete(id)) return;
    for (const handler of this.leaveHandlers) handler(id);
  }
}
