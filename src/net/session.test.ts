import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session';
import { MAX_MESSAGE_BYTES, type Transport } from './transport';
import { MAX_FAMILY, MAX_ROOTS } from './validate';
import { testField } from '../test/field';
import { arenaById } from '../world/arenas';
import { KNOCKED, MAX_GENERATION, type FieldState } from '../world/asteroids';

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
  /** A peer's states: no ships, its time in the room, the round clock of a lead, the lead it follows, the peers it says came before it. */
  states(from: string, age: number, follows?: string, round = false, elders?: string[]) {
    if (!this.connected.includes(from)) this.connected.push(from);
    this.handlers.get('s')!({ s: [], r: round ? { id: 0, left: 100, field: 5 } : null, g: age, ...(follows ? { l: follows } : {}), ...(elders ? { o: elders } : {}) }, from);
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

describe('the game master in the round state', () => {
  /** The round the session passes on when a peer sends `round` with its states. */
  function heard(round: object) {
    const { session, transport } = joined('z');
    let seen: unknown = 'nothing';
    session.onStates = (_states, passed) => (seen = passed);
    transport.connected.push('h');
    transport.handlers.get('s')!({ s: [], r: { id: 3, left: -9, field: 5, ...round }, g: 1 }, 'h');
    return seen;
  }

  it('passes on a chosen arena and a round cut short', () => {
    expect(heard({ a: 'hole', c: 1 })).toMatchObject({ id: 3, left: -9, a: 'hole', c: 1 });
  });

  it('drops a message naming an arena that does not exist or a cut that is not one', () => {
    for (const bad of [{ a: 'moon' }, { a: 7 }, { a: 'toString' }, { c: 2 }, { c: true }]) expect(heard(bad)).toBe('nothing');
  });

  it('passes on what the game master as DJ put on air, and drops a word no DJ could send', () => {
    expect(heard({ d: { o: 1, t: 'Orbit Terror', f: 42.5 } })).toMatchObject({ d: { o: 1, t: 'Orbit Terror', f: 42.5 } });
    for (const bad of [{ d: { o: 1 } }, { d: { o: 0, f: 0, t: '<script>' } }, { d: 'next' }]) expect(heard(bad)).toBe('nothing');
  });
});

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
    const field = (k: string) => ({ f: { k, t: 5, a: [], x: [] }, w: [], p: [], q: [], i: 0, n: 1 });
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    transport.handlers.get('y')!({ ...field('fake'), g: 50.1 }, 'h2');
    expect(synced).toEqual([]);
    transport.handlers.get('y')!({ ...field('real'), g: 100.1 }, 'old');
    expect(synced).toEqual(['real']);
  });

  it('does not start over for the seconds it spends building the field it was sent, only for a gap in its frames', () => {
    const { session, transport } = joined('n');
    let restarts = 0;
    session.onRestart = () => restarts++;
    // building the field takes 3 s, longer than a browser may go without a frame
    session.onSync = () => at(clock / 1000 + 3);
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    session.tick();
    at(1.5);
    session.tick();
    transport.handlers.get('y')!({ f: { k: 'real', t: 5, a: [], x: [] }, w: [], p: [], q: [], i: 0, n: 1, g: 100.1 }, 'old');
    expect(clock).toBe(4500);
    at(4.6);
    session.tick();
    expect(restarts).toBe(0);
    // a gap of its own, a hidden tab, still starts it over
    at(8);
    session.tick();
    expect(restarts).toBe(1);
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

  it('starts over to take the field from the lead the others follow, when that field came while it elected another', () => {
    const { session, transport } = joined('n');
    const synced: string[] = [];
    let restarts = 0;
    session.onSync = (field) => synced.push(field.k);
    session.onRestart = () => restarts++;
    const field = (k: string, age: number) => ({ f: { k, t: 5, a: [], x: [] }, w: [], p: [], q: [], i: 0, n: 1, g: age });
    at(5);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    transport.states('liar', 10000, 'liar', true);
    // the real lead's field arrives while a liar leads here: not taken
    transport.handlers.get('y')!(field('real', 100.1), 'old');
    expect(synced).toEqual([]);
    frames(session, 5.1, 8, (time) => {
      transport.states('old', 95 + time, 'old', true);
      transport.states('h2', 45 + time, 'old');
      transport.states('liar', 9995 + time, 'liar', true);
    });
    // the others' votes move the election to the real lead, and it starts over to get its field
    expect(session.leadId).toBe('old');
    expect(restarts).toBe(1);
    at(8.5);
    transport.handlers.get('y')!(field('real', 103.5), 'old');
    expect(synced).toEqual(['real']);
    // with its field, it stays
    frames(session, 8.6, 20, (time) => {
      transport.states('old', 95 + time, 'old', true);
      transport.states('h2', 45 + time, 'old');
    });
    expect(restarts).toBe(1);
  });

  it('ranks a peer it reached only after settling by its own join time once those who came after it vouch for it, and a liar behind them all the same', () => {
    const { session, transport } = joined('n');
    // the room: 'old' leads, 's' came 50 s ago, 'h2' and 'h3' after it; this browser reaches all but 's' at once
    const room = (time: number, elders: boolean) => {
      transport.states('old', 100 + time, 'old', true, elders ? [] : undefined);
      transport.states('h2', 40 + time, 'old', false, elders ? ['old', 's'] : undefined);
      transport.states('h3', 30 + time, 'old', false, elders ? ['old', 's'] : undefined);
    };
    at(1);
    room(1, false);
    transport.handlers.get('y')!({ f: { k: 'field', t: 5, a: [], x: [] }, w: [], p: [], q: [], i: 0, n: 1, g: 101 }, 'old');
    frames(session, 1, 8, (time) => room(time, false));
    expect(session.rank()).toBe(3);
    // 's' is reached at 8 s: moved up to then, it would rank behind this browser
    frames(session, 8, 9, (time) => {
      room(time, false);
      transport.states('s', 50 + time, 'old');
      transport.states('liar', 1000 + time, 'old');
    });
    expect(session.rank()).toBe(3);
    // the others say 's' came before them, and nobody says so of the liar
    frames(session, 9, 12, (time) => {
      room(time, true);
      transport.states('s', 50 + time, 'old');
      transport.states('liar', 1000 + time, 'old');
    });
    expect(session.rank()).toBe(4);
    expect(session.joinedTime('s')).toBeLessThan(session.joinedTime('h2'));
    expect(session.joinedTime('liar')).toBeGreaterThan(0);
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

  it("takes a self-destruct only from the ship's own browser, with the field time it went off at to the millisecond", () => {
    const { transport, session } = joined('n');
    const heard: [string, number][] = [];
    session.onSelfDestruct = (ship, _position, at) => heard.push([ship, at]);
    const sd = (data: object, from: string) => transport.handlers.get('sd')!(data, from);
    sd({ s: 'p:h2', p: [1, 2, 3], t: 61.234 }, 'h2');
    sd({ s: 'p:h2', p: [1, 2, 3], t: 61.234 }, 'h3');
    for (const t of [undefined, -1, 'now', Infinity]) sd({ s: 'p:h2', p: [1, 2, 3], t }, 'h2');
    expect(heard).toEqual([['p:h2', 61.234]]);
    // what it sends: the field time to the millisecond, as the sender takes it itself
    session.sendSelfDestruct('p:n', [0, 0, 0], 61.2345678);
    expect(transport.sent.at(-1)).toEqual({ type: 'sd', data: { s: 'p:n', p: [0, 0, 0], t: 61.235 }, to: undefined });
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
    at(13);
    transport.states('a', 3.1);
    at(14);
    transport.states('a', 0.1);
    expect(restarts).toBe(2);
  });

  it('takes a state that comes late after a stall for no start over', () => {
    const { session, transport } = joined('n');
    let restarts = 0;
    session.onPeerRestart = () => restarts++;
    at(1);
    transport.states('a', 100);
    // its link stalls for three seconds, then what it sent meanwhile comes all at once
    at(5);
    for (const age of [100.1, 101, 102, 103]) transport.states('a', age);
    expect(restarts).toBe(0);
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

describe("a newcomer's snapshot", () => {
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  /** The bytes of a message as Trystero sends it: its JSON, type and data together, in UTF-8. */
  const bytes = (message: { type: string; data: unknown }) => new TextEncoder().encode(JSON.stringify({ t: message.type, d: message.data })).length;
  /** A number as long as JSON writes one: a sign and 17 digits. */
  const long = (k: number) => -(1234.5678901234567 + k / 7);
  /** The most wreckage, probes and probes taken the checks let through (see validate), with ids and numbers as long as the game writes them. */
  const wrecks = Array.from({ length: 100 }, (_, k) => ({ id: `b:abcdefghijklmnopqrst:7.${100 + k}.${k % 10}`, p: [-999999, -999999, -999999], v: [-99999, -99999, -99999], g: 12345.67 }));
  const probes = Array.from({ length: 64 }, (_, k) => ({ i: `r123.${k}`, k: 'overdrive' as const, p: [-999999, -999999, -999999], v: [-99999, -99999, -99999], u: 123.4, x: 4294967295 }));
  const taken = Array.from({ length: 200 }, (_, k) => `b:abcdefghijklmnopqrst:${k}`);

  /** The snapshot a lead sends: every message it hands the transport for the newcomer, through the wire. */
  function sent(field: FieldState) {
    // the lead came 100 s before the newcomer
    const now = clock;
    at(-99);
    const lead = joined('old');
    clock = now;
    lead.session.sendSync('n', field, wrecks, taken, probes);
    return lead.transport.sent.map((m) => ({ ...m, data: JSON.parse(JSON.stringify(m.data)) as unknown }));
  }

  /** A newcomer that follows the lead 'old' and takes its field. */
  function newcomer() {
    const { session, transport } = joined('n');
    const synced: FieldState[] = [];
    session.onSync = (field, w, p, q) => {
      synced.push(field);
      expect([w, p, q]).toEqual([wrecks, taken, probes]);
    };
    at(1);
    transport.states('old', 100, 'old', true);
    transport.states('h2', 50, 'old');
    return { session, transport, synced };
  }

  /** A field's lists in one order, to compare a snapshot joined from its parts with the whole. */
  const sorted = (field: FieldState) => {
    const by = <T>(list: readonly T[] = []) => [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { k: field.k, t: field.t, a: by(field.a), x: by(field.x), d: by(field.d), m: by(field.m) };
  };

  /** The Rings broken at `at` as far as `generations` go, every piece left knocked. */
  function broken(at: number, generations: number) {
    const field = testField();
    field.generate(arenaById('rings')!.layout);
    field.setClock(at);
    for (let pass = 0; pass < generations; pass++) for (const a of [...field.asteroids.values()]) if (!a.solid) field.shatter(a.id, at - 10 + pass * 7.777);
    for (const a of field.asteroids.values()) {
      a.shovedBy = KNOCKED;
      a.hitPoints = 123.456;
    }
    return field;
  }

  it('goes in parts under half of what a message may hold, for the Rings broken to their last pieces and every one of them knocked, and is the whole field joined', () => {
    const state = broken(1000.123, MAX_GENERATION).snapshot();
    // the whole as one message: far beyond the bound
    expect(bytes({ type: 'y', data: { f: state, w: wrecks, p: taken, q: probes, g: 100.123 } })).toBeGreaterThan(4 * MAX_MESSAGE_BYTES);
    const messages = sent(state);
    for (const message of messages) expect(bytes(message)).toBeLessThan(MAX_MESSAGE_BYTES / 2);
    // the parts in any order make the snapshot
    const { transport, synced } = newcomer();
    for (const message of [...messages].reverse()) transport.handlers.get('y')!(message.data, 'old');
    expect(synced).toHaveLength(1);
    expect(sorted(synced[0])).toEqual(sorted(JSON.parse(JSON.stringify(state)) as FieldState));
  }, 60000);

  it('goes in parts under half of what a message may hold with every list of the field at the bound of its check', () => {
    const roots = Array.from({ length: MAX_ROOTS }, (_, r) => `${100 + r}`);
    const family = (root: string) => [root, ...[0, 1, 2].flatMap((i) => [`${root}.${i}`, ...[0, 1, 2].map((j) => `${root}.${i}.${j}`)])];
    const ids = roots.flatMap(family);
    expect(ids).toHaveLength(MAX_ROOTS * MAX_FAMILY);
    const state: FieldState = {
      k: 'rings',
      t: 1234567.123,
      a: ids.map((id, k) => ({ id, hp: 123.456, b: 1234567.123 + k })),
      x: ids.map((id, k) => ({ id, b: 1234567.123 + k })),
      d: ids,
      m: ids.map((id, k) => ({ id, b: 1234567.123, p: [long(k), long(k), long(k)], v: [long(k), long(k), long(k)], q: [0.12345678901234567, -0.12345678901234567, 0.12345678901234567, -0.9701425001453319], s: [0.12345678901234567, -0.12345678901234567, 0.9846153846153847, 1.2345678901234567], c: KNOCKED })),
    };
    const messages = sent(state);
    for (const message of messages) expect(bytes(message)).toBeLessThan(MAX_MESSAGE_BYTES / 2);
    const { transport, synced } = newcomer();
    for (const message of messages) transport.handlers.get('y')!(message.data, 'old');
    expect(synced).toHaveLength(1);
    expect(sorted(synced[0])).toEqual(sorted(state));
  });

  it('is taken only once every part came: with one missing the newcomer starts over, and takes the field the lead sends it then', () => {
    const field = broken(50, 1);
    const first = sent(field.snapshot());
    expect(first.length).toBeGreaterThan(2);
    const { session, transport, synced } = newcomer();
    let restarts = 0;
    session.onRestart = () => restarts++;
    for (const message of first.slice(1)) transport.handlers.get('y')!(message.data, 'old');
    expect(synced).toEqual([]);
    frames(session, 1.1, 7.5, (time) => transport.states('old', 99 + time, 'old', true));
    expect(restarts).toBe(1);
    // the part that was missing, of the snapshot it gave up, makes no field
    transport.handlers.get('y')!(first[0].data, 'old');
    expect(synced).toEqual([]);
    // the lead sends the field again, of a later field time; a part of the old one among it is not mixed in
    field.setClock(57);
    const again = sent(field.snapshot());
    transport.handlers.get('y')!(first[1].data, 'old');
    for (const message of again) transport.handlers.get('y')!(message.data, 'old');
    expect(synced).toHaveLength(1);
    expect(synced[0].t).toBe(57);
    expect(sorted(synced[0])).toEqual(sorted(JSON.parse(JSON.stringify(field.snapshot())) as FieldState));
  }, 60000);

  it('is not taken from a part that fails its check, nor from a first part without the wreckage and probes', () => {
    const { transport, synced } = newcomer();
    const part = { f: { k: 'rings', t: 5, a: [], x: [] }, g: 100.1 };
    for (const bad of [{ i: 0, n: 0 }, { i: 1, n: 1 }, { i: -1, n: 2 }, { i: 0.5, n: 2 }, { i: 0, n: 65 }, { n: 1 }]) transport.handlers.get('y')!({ ...part, w: wrecks, p: taken, q: probes, ...bad }, 'old');
    transport.handlers.get('y')!({ ...part, i: 0, n: 1 }, 'old');
    expect(synced).toEqual([]);
    // and a good one is
    transport.handlers.get('y')!({ ...part, i: 0, n: 1, w: wrecks, p: taken, q: probes }, 'old');
    expect(synced).toHaveLength(1);
  });
});
