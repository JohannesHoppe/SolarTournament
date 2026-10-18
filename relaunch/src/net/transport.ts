/**
 * Message transport between the players of a tournament. Two implementations:
 * - Trystero: WebRTC data channels between browsers, found via public Nostr relays.
 *   No server of our own.
 * - Local: BroadcastChannel between tabs of the same browser, for development and tests.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Handler = (data: any, from: string) => void;

export interface Transport {
  readonly selfId: string;
  /** Sends to one peer, or to everyone when `to` is omitted. */
  send(type: string, data: Json, to?: string): void;
  on(type: string, handler: Handler): void;
  onPeerJoin(handler: (id: string) => void): void;
  onPeerLeave(handler: (id: string) => void): void;
  peers(): string[];
  leave(): void;
}

/** Identifies the game on the signaling relays; peers with other app ids never meet. */
const APP_ID = 'solartournament-2584';

abstract class BaseTransport implements Transport {
  abstract readonly selfId: string;
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

  protected dispatch(type: string, data: unknown, from: string) {
    for (const handler of this.handlers.get(type) ?? []) handler(data, from);
  }
}

export class TrysteroTransport extends BaseTransport {
  readonly selfId: string;
  private readonly room: import('trystero').Room;
  private readonly action: import('trystero').MessageAction<Json>;
  private readonly connected = new Set<string>();

  private constructor(trystero: typeof import('trystero'), roomId: string) {
    super();
    this.selfId = trystero.selfId;
    this.room = trystero.joinRoom({ appId: APP_ID }, roomId);
    // one action for all message types keeps the channel setup small
    this.action = this.room.makeAction<Json>('st');
    this.action.onMessage = (message, { peerId }) => {
      const { t, d } = message as { t: string; d: Json };
      this.dispatch(t, d, peerId);
    };
    this.room.onPeerJoin = (id) => {
      this.connected.add(id);
      for (const handler of this.joinHandlers) handler(id);
    };
    this.room.onPeerLeave = (id) => {
      this.connected.delete(id);
      for (const handler of this.leaveHandlers) handler(id);
    };
  }

  /** Loads Trystero only when a player goes online. */
  static async join(roomId: string): Promise<TrysteroTransport> {
    return new TrysteroTransport(await import('trystero'), roomId);
  }

  send(type: string, data: Json, to?: string) {
    void this.action.send({ t: type, d: data }, to ? { target: to } : undefined).catch(() => {
      // the peer left while the message was on its way
    });
  }

  peers() {
    return [...this.connected];
  }

  leave() {
    void this.room.leave();
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

  leave() {
    clearInterval(this.heartbeat);
    this.post({ t: '_bye' });
    this.channel.close();
  }

  private post(message: { t: string; d?: Json; to?: string }) {
    try {
      this.channel.postMessage({ ...message, from: this.selfId });
    } catch {
      // channel already closed
    }
  }

  private receive(message: { t: string; d: Json; to?: string; from: string }) {
    const { t, d, to, from } = message;
    if (to && to !== this.selfId) return;
    if (t === '_bye') return this.drop(from);
    if (!this.lastSeen.has(from)) {
      this.lastSeen.set(from, performance.now() / 1000);
      // answer a newcomer, so it learns about us without waiting for the next heartbeat
      if (t === '_hello') this.post({ t: '_beat' });
      for (const handler of this.joinHandlers) handler(from);
    }
    this.lastSeen.set(from, performance.now() / 1000);
    if (!t.startsWith('_')) this.dispatch(t, d, from);
  }

  private drop(id: string) {
    if (!this.lastSeen.delete(id)) return;
    for (const handler of this.leaveHandlers) handler(id);
  }
}
