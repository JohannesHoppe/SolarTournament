import { describe, expect, it } from 'vitest';
import { checkSubscription, DAILY_WRITES, handle, MAX_SUBSCRIPTIONS, PUSH_GAP, sendAll, TOURNAMENT_FORGET, vapidOf, type PushStore } from '../../functions/push';
import { freshKeys, toBase64Url, type Subscription } from './webpush';
import { pushText } from './pushtext';
import type { Locale } from '../i18n/i18n';

/** The function's store as a few maps, its writes counted as D1's would be. */
function memoryStore() {
  const days = new Map<string, number>();
  const rooms = new Map<string, number>();
  const subs = new Map<string, Subscription & { locale: Locale }>();
  let last = -Infinity;
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
    subscriptions: async () => [...subs.values()],
    countSubscriptions: async () => subs.size,
    subscribe: async (s, locale) => void subs.set(s.endpoint, { ...s, locale }),
    unsubscribe: async (endpoint) => void subs.delete(endpoint),
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
    expect((await handle(store, { open: 'alpha123' }, 1000)).send).toHaveLength(1);
    // the same tournament's heartbeats send nothing
    expect((await handle(store, { open: 'alpha123' }, 1120)).send).toBeUndefined();
    // another one within the gap neither
    expect((await handle(store, { open: 'beta4567' }, 1200)).send).toBeUndefined();
    // after the gap, a new one does
    expect((await handle(store, { open: 'gamma890' }, 1000 + PUSH_GAP)).send).toHaveLength(1);
    // one gone longer than TOURNAMENT_FORGET counts as new again
    expect((await handle(store, { open: 'alpha123' }, 1120 + TOURNAMENT_FORGET + 2 * PUSH_GAP)).send).toHaveLength(1);
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
    await sendAll(store, [target], { keys: await freshKeys(), subject: 'https://solartournament.games' }, 1000, async (url) => {
      sent.push(String(url));
      return new Response(null, { status: 410 });
    });
    expect(sent).toEqual([target.endpoint]);
    expect(subs.has(target.endpoint)).toBe(false);
    expect(pushText('de').title).not.toBe(pushText('en').title);
    expect(pushText('fr').url).toBe('/#tournaments');
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
    expect(await vapidOf({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: 'nonsense' })).toBeNull();
    expect(await vapidOf({ VAPID_PUBLIC_KEY: publicKey })).toBeNull();
  });
});
