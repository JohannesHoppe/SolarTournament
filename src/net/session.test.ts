import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session';
import type { Transport } from './transport';

/** A transport that only delivers what the test hands it. */
class FakeTransport implements Transport {
  readonly relayOff = null;
  readonly handlers = new Map<string, (data: unknown, from: string) => void>();
  readonly connected: string[] = [];
  constructor(readonly selfId: string) {}
  send() {}
  on(type: string, handler: (data: unknown, from: string) => void) {
    this.handlers.set(type, handler);
  }
  block() {}
  isBlocked() {
    return false;
  }
  onPeerJoin() {}
  onPeerLeave() {}
  peers() {
    return this.connected;
  }
  leave() {}
  /** A peer's states: no ships, its time in the room, the round clock of a lead, the lead it follows. */
  states(from: string, age: number, follows?: string, round = false) {
    if (!this.connected.includes(from)) this.connected.push(from);
    this.handlers.get('s')!({ s: [], r: round ? { id: 0, left: 100, field: 5 } : null, g: age, ...(follows ? { l: follows } : {}) }, from);
  }
}

let clock = 0;
const at = (seconds: number) => (clock = seconds * 1000);

function joined(self: string) {
  const transport = new FakeTransport(self);
  const created = new (Session as unknown as new (transport: Transport, room: string) => Session)(transport, 'room');
  return { session: created, transport };
}

describe('the lead browser', () => {
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is not taken by a peer that shows up later claiming to be older, however low its id', () => {
    const { session, transport } = joined('z');
    at(7);
    session.tick();
    expect(session.isLead).toBe(true);
    // a stranger says it has been here for hours and sends a round clock, as a lead does
    for (const time of [8, 8.1, 8.2]) {
      at(time);
      transport.states('a', 10000, 'a', true);
      session.tick();
    }
    expect(session.isLead).toBe(true);
    expect(session.leadId).toBe('z');
  });

  it('is the one most of the others follow, for a newcomer a liar told it was older', () => {
    const { session, transport } = joined('n');
    at(5);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    transport.states('liar', 10000, 'liar', true);
    expect(session.leadId).toBe('liar');
    at(6.5);
    transport.states('old', 101.5, 'old', true);
    transport.states('h2', 51.5, 'old');
    transport.states('liar', 10001.5, 'liar', true);
    at(7);
    session.tick();
    expect(session.leadId).toBe('old');
  });

  it('gives a vote only to the first Hosts in the room, as many as the tournament has places', () => {
    const { session, transport } = joined('me');
    at(1);
    // eight peers came before this browser, a ninth after it
    for (let i = 0; i < 8; i++) transport.states(`p${i}`, 100 - i, 'p0');
    transport.states('late', 0.5, 'p0');
    expect(session.seated('p0')).toBe(true);
    expect(session.seated('p7')).toBe(true);
    expect(session.seated('me')).toBe(false);
    expect(session.seated('late')).toBe(false);
    expect(session.seated('stranger')).toBe(false);
  });
});
