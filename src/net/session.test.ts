import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session';
import type { Transport } from './transport';

/** A transport that only delivers what the test hands it. */
class FakeTransport implements Transport {
  readonly relayOff = null;
  readonly handlers = new Map<string, (data: unknown, from: string) => void>();
  readonly connected: string[] = [];
  /** What the session sent, in order: to everyone (`to` undefined) or one peer. */
  readonly sent: { type: string; data: unknown; to?: string }[] = [];
  constructor(readonly selfId: string) {}
  send(type: string, data: unknown, to?: string) {
    this.sent.push({ type, data, to });
  }
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

/** Runs a session's frames from one second to another, every tenth of a second, after `each` let its peers speak. */
function frames(session: Session, from: number, to: number, each: (time: number) => void) {
  for (let time = from; time < to; time += 0.1) {
    at(time);
    each(time);
    session.tick();
  }
}

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

  it('is not taken by a peer that shows up later claiming to be older, however low its id, where others vote', () => {
    const { session, transport } = joined('z');
    frames(session, 1, 7, (time) => transport.states('h', time - 0.5, 'z'));
    expect(session.isLead).toBe(true);
    // a stranger says it has been here for hours and sends a round clock, as a lead does
    frames(session, 7, 15, (time) => {
      transport.states('h', time - 0.5, 'z');
      transport.states('a', 10000 + time, 'a', true);
    });
    expect(session.isLead).toBe(true);
    expect(session.leadId).toBe('z');
  });

  it('does not step back for a peer that shows up later claiming to have joined just after it, as if the two had come at once', () => {
    const { session, transport } = joined('z');
    frames(session, 1, 9, (time) => transport.states('h', time - 0.5, 'z'));
    expect(session.isLead).toBe(true);
    // first heard at 9 s, it says it came half a second after this browser, and sends a round clock
    frames(session, 9, 15, (time) => {
      transport.states('h', time - 0.5, 'z');
      transport.states('a', time - 0.5, 'a', true);
    });
    expect(session.isLead).toBe(true);
    expect(session.leadId).toBe('z');
    // and it cannot have come long before it was first heard: no place ahead of those here
    expect(session.joinedTime('a')).toBeGreaterThanOrEqual(9 - 6);
    expect(session.joinedTime('a')).toBeGreaterThan(session.joinedTime('h'));
  });

  it('takes the field only from the lead it elects, not from any peer that was here before it', () => {
    const { session, transport } = joined('n');
    const synced: string[] = [];
    session.onSync = (field) => synced.push(field.k);
    const field = (k: string) => ({ f: { k, t: 5, a: [], x: [] }, w: [], p: [], q: [] });
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    transport.handlers.get('y')!({ ...field('fake'), g: 50.1 }, 'h2');
    expect(synced).toEqual([]);
    transport.handlers.get('y')!({ ...field('real'), g: 100.1 }, 'old');
    expect(synced).toEqual(['real']);
  });

  it('settles two browsers that each lead alone and meet only after settling: the higher id steps back', () => {
    const higher = joined('z');
    at(7);
    higher.session.tick();
    frames(higher.session, 7, 12, (time) => higher.transport.states('a', 20 + time, 'a', true));
    expect(higher.session.isLead).toBe(false);
    expect(higher.session.leadId).toBe('a');
    at(0);
    const lower = joined('a');
    at(7);
    lower.session.tick();
    frames(lower.session, 7, 12, (time) => lower.transport.states('z', 20 + time, 'z', true));
    expect(lower.session.leadId).toBe('a');
    expect(lower.session.isLead).toBe(true);
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

  it('gives up leading alone when the room it reached only after settling follows another', () => {
    const { session, transport } = joined('n');
    at(6.1);
    session.tick();
    expect(session.isLead).toBe(true);
    // the room's lead and another Host connect late: lined up behind it, until it sees whom they follow
    const room = (time: number) => {
      transport.states('a', 100 + time, 'a', true);
      transport.states('b', 50 + time, 'a');
    };
    frames(session, 7, 20, room);
    expect(session.leadId).toBe('a');
    expect(session.isLead).toBe(false);
  });

  it('follows the lead the others follow, also one it heard of only after settling', () => {
    const { session, transport } = joined('n');
    // only a peer that does not lead is reached while settling
    frames(session, 1, 6.5, (time) => transport.states('b', 50 + time, 'a'));
    frames(session, 6.5, 12, (time) => {
      transport.states('a', 100 + time, 'a', true);
      transport.states('b', 50 + time, 'a');
    });
    expect(session.leadId).toBe('a');
  });

  it('takes rock hits in the order of a round, with a second for a field clock that jumps back', () => {
    const { transport, session } = joined('n');
    const taken: number[] = [];
    session.onRock = (_, time) => taken.push(time);
    const hit = (time: number, round: number) => transport.handlers.get('r')!({ i: 'r1', t: time, n: round, s: 'p:x' }, 'x');
    hit(100, 2);
    hit(99.4, 2);
    hit(98, 2);
    hit(5, 3);
    expect(taken).toEqual([100, 99.4, 5]);
  });

  it("takes a ram of the battleship only from the lead that flies it, checked, and no faster than its budget", () => {
    const { transport, session } = joined('n');
    const rammed: string[] = [];
    session.onRam = (state) => rammed.push(state.id);
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    const ram = (id: string, from: string, extra = {}) => transport.handlers.get('br')!({ m: { id, b: 40, p: [0, 0, 0], v: [10, 0, 0], q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: -1, ...extra }, n: 2 }, from);
    ram('7', 'h2');
    ram('8', 'old', { q: [0, 0, 0, 0] });
    ram('9', 'old');
    expect(rammed).toEqual(['9']);
    for (let i = 0; i < 200; i++) ram(`9.${i}`, 'old');
    expect(rammed.length).toBeLessThan(100);
  });

  it("takes a contact of the field's pieces only from the lead, checked, and no faster than its budget", () => {
    const { transport, session } = joined('n');
    const knocked: string[] = [];
    session.onKnock = (state) => knocked.push(state.id);
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    const knock = (id: string, from: string, extra = {}) => transport.handlers.get('fk')!({ m: { id, b: 40, p: [0, 0, 0], v: [10, 0, 0], q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: -2, ...extra }, n: 2 }, from);
    knock('7', 'h2');
    knock('8', 'old', { c: -3 });
    knock('9', 'old');
    expect(knocked).toEqual(['9']);
    for (let i = 0; i < 200; i++) knock(`9.${i}`, 'old');
    expect(knocked.length).toBeLessThan(80);
  });

  it('hands the field again to a peer that starts over twice within seconds', () => {
    const { session, transport } = joined('n');
    let restarts = 0;
    session.onPeerRestart = () => restarts++;
    at(1);
    transport.states('a', 100);
    at(10);
    transport.states('a', 0.1);
    at(14);
    transport.states('a', 0.1);
    expect(restarts).toBe(2);
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

describe('the ping to a peer', () => {
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers a peer\'s ping with a pong naming the same number', () => {
    const { transport } = joined('me');
    transport.handlers.get('pi')!({ n: 3 }, 'a');
    expect(transport.sent).toEqual([{ type: 'po', data: { n: 3 }, to: 'a' }]);
  });

  it('answers no ping without a number within range, and sends no pong for it', () => {
    const { transport } = joined('me');
    for (const bad of [{ n: 'nope' }, { n: -1 }, {}]) transport.handlers.get('pi')!(bad, 'a');
    expect(transport.sent.filter((m) => m.type === 'po')).toEqual([]);
  });

  it('answers a peer\'s pings only up to the rate limit', () => {
    const { transport } = joined('me');
    for (let i = 0; i < 10; i++) transport.handlers.get('pi')!({ n: i }, 'a');
    const pongs = transport.sent.filter((m) => m.type === 'po');
    expect(pongs.length).toBeGreaterThan(0);
    expect(pongs.length).toBeLessThan(10);
  });

  it('times the round trip from a sent ping to its matching pong, in milliseconds', () => {
    const { session, transport } = joined('me');
    transport.connected.push('a');
    at(1);
    session.tick(); // pings every peer once a round (see PING_INTERVAL)
    expect(session.pingTo('a')).toBeNull();
    const ping = transport.sent.find((m) => m.type === 'pi' && m.to === 'a')!;
    at(1.042);
    transport.handlers.get('po')!({ n: (ping.data as { n: number }).n }, 'a');
    expect(session.pingTo('a')).toBeCloseTo(42, 0);
  });

  it('ignores a pong that answers an older ping than the one outstanding', () => {
    const { session, transport } = joined('me');
    transport.connected.push('a');
    at(1);
    session.tick(); // sends the first ping, number 1
    at(2);
    session.tick(); // sends a fresh one, number 2; number 1 is no longer outstanding
    transport.handlers.get('po')!({ n: 1 }, 'a');
    expect(session.pingTo('a')).toBeNull();
  });
});
