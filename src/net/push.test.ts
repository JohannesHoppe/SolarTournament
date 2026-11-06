import { describe, expect, it } from 'vitest';
import { checkSubscription, DAILY_WRITES, handle, MAX_SUBSCRIPTIONS, OPEN_HEARTBEAT, PUSH_GAP, sendAll, TOURNAMENT_FORGET, vapidOf, type PushStore } from '../../functions/push';
import { freshKeys, toBase64Url, type Subscription } from './webpush';
import { pushText } from './pushtext';
import type { Locale } from '../i18n/i18n';

/** The function's store as a few maps, its writes counted as D1's would be. */
function memoryStore() {
  const days = new Map<string, number>();
  const rooms = new Map<string, number>();
  const subs = new Map<string, Subscription & { locale: Locale; from?: number }>();
  let last = -Infinity;
  let waiting = false;
  const store: PushStore = {
    async spend(day, rows) {
      const writes = (days.get(day) ?? 0) + rows + 1;
      if (writes > DAILY_WRITES) return false;
      days.set(day, writes);
      return true;
    },
    async heard(room, now) {
      const before = rooms.get(room) ?? null;
      rooms.set(room, now);
      return before;
    },
    lastPush: async () => last,
    setLastPush: async (now) => void (last = now),
    waiting: async () => waiting,
    setWaiting: async (value) => void (waiting = value),
    stats: async () => ({ subscribers: subs.size, writes: 0, open: 0, heardToday: rooms.size, lastPush: last, pushes: 0 }),
    subscriptions: async (open) => [...subs.values()].filter((s) => (s.from ?? 1) <= open),
    countSubscriptions: async () => subs.size,
    openCount: async (now) => [...rooms.values()].filter((heard) => heard >= now - TOURNAMENT_FORGET).length,
    subscribe: async (s, locale, from) => void subs.set(s.endpoint, { ...s, locale, from }),
    unsubscribe: async (endpoint) => void subs.delete(endpoint),
    fromOf: async (endpoint) => subs.get(endpoint)?.from ?? null,
  };
  return { store, days, rooms, subs };
}

const subscription = (n: number) => ({ endpoint: `https://push.example.net/send/${n}`, keys: { p256dh: toBase64Url(new Uint8Array(65).fill(4)), auth: toBase64Url(new Uint8Array(16).fill(n % 256)) } });

describe('the notification when a public tournament opens', () => {
  it('takes only a well-formed subscription over https', () => {
    expect(checkSubscription(subscription(1))).toEqual(subscription(1));
    expect(checkSubscription({ ...subscription(1), endpoint: 'http://push.example.net/x' })).toBeNull();
    expect(checkSubscription({ ...subscription(1), keys: { p256dh: 'abc', auth: 'abc' } })).toBeNull();
    expect(checkSubscription('nonsense')).toBeNull();
  });

  it('keeps and forgets a subscription, in the language the Host chose', async () => {
    const { store, subs } = memoryStore();
    expect((await handle(store, { subscribe: subscription(1), locale: 'de' }, 1000)).status).toBe(200);
    expect(subs.get(subscription(1).endpoint)?.locale).toBe('de');
    await handle(store, { subscribe: subscription(2), locale: 'xx' }, 1000);
    expect(subs.get(subscription(2).endpoint)?.locale).toBe('en');
    await handle(store, { unsubscribe: subscription(1).endpoint }, 1000);
    expect(subs.has(subscription(1).endpoint)).toBe(false);
  });

  it('notifies of a new tournament, never again of one still open, and at most once every PUSH_GAP', async () => {
    const { store } = memoryStore();
    await handle(store, { subscribe: subscription(1), locale: 'en' }, 0);
    expect((await handle(store, { open: 'kessler-s-revenge-k7m2pq' }, 1000)).send).toHaveLength(1);
    await handle(store, { open: 'alpha123' }, 1001);
    // the same tournament's heartbeats send nothing
    expect((await handle(store, { open: 'alpha123' }, 1120)).send).toBeUndefined();
    // another one within the gap neither: it waits
    expect((await handle(store, { open: 'beta4567' }, 1200)).send).toBeUndefined();
    expect((await handle(store, { open: 'beta4567' }, 1320)).send).toBeUndefined();
    // the gap's end: the next word of any open tournament announces the one that waited, once
    expect((await handle(store, { open: 'alpha123' }, 1000 + PUSH_GAP)).send).toHaveLength(1);
    expect((await handle(store, { open: 'beta4567' }, 1000 + PUSH_GAP + 60)).send).toBeUndefined();
    // after a gap with nothing waiting, a new one goes out at once
    expect((await handle(store, { open: 'gamma890' }, 1000 + 2 * PUSH_GAP)).send).toHaveLength(1);
    // one gone longer than TOURNAMENT_FORGET counts as new again
    expect((await handle(store, { open: 'alpha123' }, 1120 + TOURNAMENT_FORGET + 3 * PUSH_GAP)).send).toHaveLength(1);
  });

  it('never loses a tournament that opened within the gap: it is announced within the gap and a heartbeat', async () => {
    const { store } = memoryStore();
    await handle(store, { subscribe: subscription(1), locale: 'en' }, 0);
    expect((await handle(store, { open: 'first-room' }, 1000)).send).toHaveLength(1);
    // a second opens a minute later; its own heartbeats carry it past the gap
    await handle(store, { open: 'second-room' }, 1060);
    let sent = 0;
    let at = 1060;
    for (; at < 1060 + PUSH_GAP + OPEN_HEARTBEAT; at += OPEN_HEARTBEAT) if ((await handle(store, { open: 'second-room' }, at)).send) sent++;
    expect(sent).toBe(1);
  });

  it('refuses a room that is not a code and anything it does not know', async () => {
    const { store } = memoryStore();
    expect((await handle(store, { open: 'a b; DROP' }, 0)).status).toBe(400);
    expect((await handle(store, { what: 1 }, 0)).status).toBe(400);
    expect((await handle(store, null, 0)).status).toBe(400);
  });

  it('keeps no room code, only its hash', async () => {
    const { store, rooms } = memoryStore();
    await handle(store, { open: 'secretroom1' }, 0);
    expect([...rooms.keys()].some((key) => key.includes('secretroom1'))).toBe(false);
  });

  it('writes nothing beyond the day’s budget, and starts again the next day', async () => {
    const { store, days } = memoryStore();
    days.set('1970-01-01', DAILY_WRITES - 1);
    expect((await handle(store, { open: 'alpha123' }, 1000)).status).toBe(503);
    expect((await handle(store, { open: 'alpha123' }, 24 * 60 * 60 + 1000)).status).toBe(200);
  });

  it('takes no subscription beyond MAX_SUBSCRIPTIONS', async () => {
    const { store, subs } = memoryStore();
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) subs.set(`x${i}`, { ...subscription(i), endpoint: `x${i}`, locale: 'en' });
    expect((await handle(store, { subscribe: subscription(1), locale: 'en' }, 0)).status).toBe(503);
  });

  it('sends each Host the notification in its language and forgets a subscription the push service says is gone', async () => {
    const { store, subs } = memoryStore();
    const keys = await freshKeys();
    const target = { endpoint: 'https://push.example.net/send/gone', keys: { p256dh: toBase64Url(keys.publicKey), auth: toBase64Url(new Uint8Array(16).fill(7)) }, locale: 'de' as Locale };
    subs.set(target.endpoint, target);
    const sent: string[] = [];
    await sendAll(store, [target], 1, { keys: await freshKeys(), subject: 'https://solartournament.games' }, 1000, async (url: string | URL | Request) => {
      sent.push(String(url));
      return new Response(null, { status: 410 });
    });
    expect(sent).toEqual([target.endpoint]);
    expect(subs.has(target.endpoint)).toBe(false);
    expect(pushText('de', 1).title).not.toBe(pushText('en', 1).title);
    expect(pushText('en', 3).title).toBe('3 public tournaments are open');
    expect(pushText('de', 2).title).toContain('2');
    expect(pushText('fr', 1).url).toBe('/#tournaments');
  });
});

describe('the VAPID keys from the environment', () => {
  it('takes the private key raw or as PKCS #8, and nothing unreadable', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    const pkcs8 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))));
    const raw = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!;
    const fromPkcs8 = await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: pkcs8 });
    const fromRaw = await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: raw });
    expect(fromPkcs8 && toBase64Url(fromPkcs8.keys.privateKey)).toBe(raw);
    expect(fromRaw && toBase64Url(fromRaw.keys.privateKey)).toBe(raw);
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
    for (const pasted of [pem, `"${raw}"`, JSON.stringify({ publicKey, privateKey: raw }), JSON.stringify({ kty: 'EC', crv: 'P-256', d: raw })]) {
      const found = await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: pasted });
      expect(found && toBase64Url(found.keys.privateKey)).toBe(raw);
    }
    const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    expect(await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', other.privateKey)).d! })).toBeNull();
    expect(await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: 'nonsense' })).toBeNull();
    expect(await vapidOf({ VAPID_PUBLIC_KEY: publicKey })).toBeNull();
  });
});

describe('from how many open tournaments a Host hears', () => {
  it('tells each Host only once its number is reached, and says how many are open', async () => {
    const { store } = memoryStore();
    await handle(store, { subscribe: subscription(1), locale: 'en', from: 1 }, 0);
    await handle(store, { subscribe: subscription(2), locale: 'en', from: 2 }, 0);
    await handle(store, { subscribe: subscription(3), locale: 'en', from: 99 }, 0);
    const first = await handle(store, { open: 'room-one-aaaaaa' }, 1000);
    // a number out of bounds counts as 1
    expect(first.send?.map((s) => s.endpoint).sort()).toEqual([subscription(1).endpoint, subscription(3).endpoint].sort());
    expect(first.open).toBe(1);
    // the first one is still open, its lead says so on its heartbeat
    await handle(store, { open: 'room-one-aaaaaa' }, 1000 + PUSH_GAP - 60);
    // a second one opens after the gap: two are open, the second Host hears of it too
    const second = await handle(store, { open: 'room-two-bbbbbb' }, 1000 + PUSH_GAP);
    expect(second.open).toBe(2);
    expect(second.send?.map((s) => s.endpoint).sort()).toEqual([subscription(1).endpoint, subscription(2).endpoint, subscription(3).endpoint].sort());
  });

  it('keeps the gap open when nobody asked to hear of so few', async () => {
    const { store } = memoryStore();
    await handle(store, { subscribe: subscription(1), locale: 'en', from: 3 }, 0);
    expect((await handle(store, { open: 'room-one-aaaaaa' }, 1000)).send).toBeUndefined();
    await handle(store, { subscribe: subscription(2), locale: 'en', from: 1 }, 1001);
    expect((await handle(store, { open: 'room-two-bbbbbb' }, 1002)).send).toHaveLength(1);
  });

  it('says what a subscription chose, without writing', async () => {
    const { store, days } = memoryStore();
    await handle(store, { subscribe: subscription(1), locale: 'en', from: 2 }, 0);
    const writes = [...days.values()].reduce((a, b) => a + b, 0);
    expect((await handle(store, { status: subscription(1).endpoint }, 0)).body).toEqual({ from: 2 });
    expect((await handle(store, { status: 'https://unknown' }, 0)).body).toEqual({ from: null });
    expect([...days.values()].reduce((a, b) => a + b, 0)).toBe(writes);
  });
});
