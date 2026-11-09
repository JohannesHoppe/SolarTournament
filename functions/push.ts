/**
 * /push: the notification when a public tournament opens. A Cloudflare Pages Function of this
 * Pages project, its subscriptions in the D1 database bound as PUSH_DB.
 *
 * - GET: the VAPID public key a browser subscribes with, or `{ key: null }` while the push is
 *   not set up (no database, no key); the game then shows no button for it.
 * - POST `{ subscribe: PushSubscription, locale, from }`: keeps a browser's subscription, the
 *   Host's language and from how many open public tournaments on it wants to hear (1 to MAX_FROM).
 * - POST `{ unsubscribe: endpoint }`: forgets it.
 * - POST `{ status: endpoint }`: from how many open tournaments on that subscription hears (or
 *   null without one), and until when it is paused (0 when it is not).
 * - POST `{ snooze: endpoint, until }`: pauses a subscription until `until` (s since 1970, at most
 *   SNOOZE_MAX ahead), 0 to hear again at once; the notification offers it as its buttons.
 * - POST `{ open: room }`: the lead browser of a public tournament says it is open, once when it
 *   starts announcing it and every OPEN_HEARTBEAT seconds after. A tournament not heard of
 *   before (or not for TOURNAMENT_FORGET seconds) is new: the number of open ones rose, and the
 *   notification (saying how many are open) goes to every subscriber whose number is reached, at
 *   most one every PUSH_GAP seconds for all tournaments together. A new one heard within the gap
 *   is kept as waiting, and the first word of any open tournament after the gap sends it: no
 *   tournament goes unannounced, and none waits longer than the gap and a heartbeat.
 *
 * The VAPID keys come from the project's environment (VAPID_PUBLIC_KEY a plain variable in
 * wrangler.toml, VAPID_PRIVATE_KEY a secret in the dashboard, the raw private scalar in
 * base64url). The notification names no tournament: what a Host typed as its name never goes
 * to anyone's lock screen.
 *
 * Costs: D1 has a daily allowance of rows written; this function keeps to DAILY_WRITES of it
 * and refuses to write beyond (the game works on without, the lobby needs none of this).
 */
import { pushRequest, fromBase64Url, toBase64Url, type Subscription, type Vapid } from '../src/net/webpush';
import { MAX_FROM, pushText } from '../src/net/pushtext';
import { LOCALES, type Locale } from '../src/i18n/i18n';
import { HOSTS } from './turn';

/** The few calls of D1 this function makes (see Cloudflare's D1 client API). */
export interface D1Like {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } };
}

interface Env {
  PUSH_DB?: D1Like;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

/** Rows written a day (UTC) beyond which the function writes nothing: half of D1's free 100,000, the rest is room for everything else the account runs. */
export const DAILY_WRITES = 50_000;
/** A lead browser repeats that its tournament is open this often (s). */
export const OPEN_HEARTBEAT = 120;
/** A tournament not heard of for this long (s) is gone; heard of again, it counts as new. */
export const TOURNAMENT_FORGET = 10 * 60;
/** At most one notification this often (s), for all tournaments together, so nobody's phone is flooded. */
export const PUSH_GAP = 15 * 60;
/** The longest pause a subscription takes (s): a day and a half, enough for a night and a morning. */
export const SNOOZE_MAX = 36 * 60 * 60;
/** Subscriptions kept at most; beyond it a new one is refused. */
export const MAX_SUBSCRIPTIONS = 5000;
/** The longest endpoint taken (characters): push services' addresses are far shorter. */
const MAX_ENDPOINT = 1000;

/** What the logic needs of the database; D1 in the function, a map in the tests. */
export interface PushStore {
  /** Counts `rows` against the day's writes; false (and nothing counted) once DAILY_WRITES would be passed. */
  spend(day: string, rows: number): Promise<boolean>;
  /** Keeps a tournament as heard of now; the time it was heard of before, or null. */
  heard(room: string, now: number): Promise<number | null>;
  /** The time of the last notification, or -Infinity. */
  lastPush(): Promise<number>;
  /** Keeps the time of a notification and counts the pushes it sends. */
  setLastPush(now: number, pushes: number): Promise<void>;
  /** Whether a new tournament waits to be announced (heard within the gap). */
  waiting(): Promise<boolean>;
  setWaiting(waiting: boolean): Promise<void>;
  /** The figures of the admin page (functions/admin.ts). */
  stats(day: string, now: number): Promise<PushStats>;
  /** The subscriptions that asked to hear of `open` tournaments or fewer and are not paused at `now`. */
  subscriptions(open: number, now: number): Promise<(Subscription & { locale: Locale })[]>;
  countSubscriptions(): Promise<number>;
  /** The tournaments heard of within TOURNAMENT_FORGET. */
  openCount(now: number): Promise<number>;
  subscribe(subscription: Subscription, locale: Locale, from: number, now: number): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
  /** From how many open tournaments on a subscription hears, or null without one. */
  fromOf(endpoint: string): Promise<number | null>;
  /** Until when a subscription is paused (0: it is not). */
  snoozedOf(endpoint: string): Promise<number>;
  /** Pauses a subscription until `until` (0: no more). */
  snooze(endpoint: string, until: number): Promise<void>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * The push services the browsers subscribe with (Chrome, Edge, Firefox, Safari and those built on
 * them): a subscription is taken only with an endpoint on one of them, so the function never posts
 * to an address someone else names.
 */
const PUSH_SERVICES = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

/** Whether an endpoint lies on one of the PUSH_SERVICES. */
function onPushService(endpoint: string): boolean {
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return false;
  }
  return PUSH_SERVICES.some((service) => (service.startsWith('.') ? host.endsWith(service) : host === service));
}

/** A subscription as a browser sends it, checked; null when anything is off. */
export function checkSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isText(endpoint, MAX_ENDPOINT) || !endpoint.startsWith('https://') || !onPushService(endpoint)) return null;
  if (!keys || !isText(keys.p256dh, 100) || !isText(keys.auth, 40)) return null;
  // a P-256 point uncompressed, an auth secret of 16 bytes
  try {
    if (fromBase64Url(keys.p256dh).length !== 65 || fromBase64Url(keys.auth).length !== 16) return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** The push's figures: subscribers, the day's writes against the budget, tournaments open now and heard of in the last day, the last notification and the pushes sent in all. */
export interface PushStats {
  subscribers: number;
  writes: number;
  open: number;
  heardToday: number;
  lastPush: number;
  pushes: number;
}

/** What a POST asks for, or why it is refused. */
export type PushAnswer = { status: number; body: unknown; send?: (Subscription & { locale: Locale })[]; open?: number };

/**
 * The function's rules on a POST's body, at `now` (s): subscribe, unsubscribe, or a tournament
 * open (and whether that sends the notification to `send`). Every write is counted first.
 */
export async function handle(store: PushStore, body: unknown, now: number): Promise<PushAnswer> {
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  if (typeof body !== 'object' || body === null) return { status: 400, body: { error: 'bad request' } };
  const request = body as { subscribe?: unknown; locale?: unknown; from?: unknown; unsubscribe?: unknown; status?: unknown; open?: unknown; snooze?: unknown; until?: unknown };

  // a read only: nothing counted against the writes
  if ('status' in request) {
    if (!isText(request.status, MAX_ENDPOINT)) return { status: 400, body: { error: 'bad request' } };
    const from = await store.fromOf(request.status);
    const snoozed = from === null ? 0 : await store.snoozedOf(request.status);
    return { status: 200, body: { from, snoozed: snoozed > now ? snoozed : 0 } };
  }

  if ('snooze' in request) {
    const until = request.until;
    if (!isText(request.snooze, MAX_ENDPOINT) || typeof until !== 'number' || !Number.isFinite(until) || until < 0 || until > now + SNOOZE_MAX) return { status: 400, body: { error: 'bad request' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.snooze(request.snooze, until);
    return { status: 200, body: { ok: true } };
  }

  if ('subscribe' in request) {
    const subscription = checkSubscription(request.subscribe);
    if (!subscription) return { status: 400, body: { error: 'bad subscription' } };
    const locale = LOCALES.includes(request.locale as Locale) ? (request.locale as Locale) : 'en';
    const from = Number.isInteger(request.from) && (request.from as number) >= 1 && (request.from as number) <= MAX_FROM ? (request.from as number) : 1;
    if ((await store.countSubscriptions()) >= MAX_SUBSCRIPTIONS) return { status: 503, body: { error: 'full' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.subscribe(subscription, locale, from, now);
    return { status: 200, body: { ok: true } };
  }

  if ('unsubscribe' in request) {
    if (!isText(request.unsubscribe, MAX_ENDPOINT)) return { status: 400, body: { error: 'bad request' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.unsubscribe(request.unsubscribe);
    return { status: 200, body: { ok: true } };
  }

  if ('open' in request) {
    // a room's code: six to 64 small letters, digits and dashes (roomCode in src/net/room.ts)
    if (typeof request.open !== 'string' || !/^[a-z0-9-]{6,64}$/.test(request.open)) return { status: 400, body: { error: 'bad request' } };
    // the tournament's row, and the rows of those gone for a day
    if (!(await store.spend(day, 2))) return { status: 503, body: { error: 'budget spent' } };
    const room = await roomKey(request.open);
    const before = await store.heard(room, now);
    const fresh = before === null || now - before > TOURNAMENT_FORGET;
    const waiting = await store.waiting();
    if (!fresh && !waiting) return { status: 200, body: { ok: true } };
    if (now - (await store.lastPush()) < PUSH_GAP) {
      // within the gap: a new one waits for the gap's end, announced by the next word of any open tournament
      if (fresh && !waiting && (await store.spend(day, 1))) await store.setWaiting(true);
      return { status: 200, body: { ok: true } };
    }
    if (!(await store.spend(day, 2))) return { status: 200, body: { ok: true } };
    if (waiting) await store.setWaiting(false);
    const open = await store.openCount(now);
    const send = await store.subscriptions(open, now);
    // nobody asked to hear of this many: the gap stays open for the next
    if (!send.length) return { status: 200, body: { ok: true } };
    await store.setLastPush(now, send.length);
    return { status: 200, body: { ok: true }, send, open };
  }

  return { status: 400, body: { error: 'bad request' } };
}

/** A room's code kept only as its hash: the database never holds a code to join by. */
async function roomKey(code: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.toLowerCase())));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The store on D1; its tables are made on the first call of an instance. */
export function d1Store(db: D1Like): PushStore {
  let ready: Promise<unknown> | null = null;
  const run = async (query: string, ...values: unknown[]) => {
    ready ??= Promise.all([
      db
        .prepare('CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, locale TEXT NOT NULL, from_open INTEGER NOT NULL, created INTEGER NOT NULL, snoozed REAL NOT NULL DEFAULT 0)')
        .bind()
        .run()
        // a table made before subscriptions could pause gets the column; one that has it refuses, and that is fine
        .then(() => db.prepare('ALTER TABLE subscriptions ADD COLUMN snoozed REAL NOT NULL DEFAULT 0').bind().run())
        .catch(() => undefined),
      db.prepare('CREATE TABLE IF NOT EXISTS tournaments (room TEXT PRIMARY KEY, heard INTEGER NOT NULL)').bind().run(),
      db.prepare('CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, writes INTEGER NOT NULL)').bind().run(),
      db.prepare('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value REAL NOT NULL)').bind().run(),
    ]);
    await ready;
    return db.prepare(query).bind(...values);
  };
  return {
    async spend(day, rows) {
      // one statement, counted only while the day stays within its writes; the counter's own row is a write too
      const row = await (await run('INSERT INTO days (day, writes) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET writes = writes + ?2 WHERE writes + ?2 <= ?3 RETURNING writes', day, rows + 1, DAILY_WRITES)).first<{ writes: number }>();
      return row !== null;
    },
    async heard(room, now) {
      const row = await (await run('SELECT heard FROM tournaments WHERE room = ?1', room)).first<{ heard: number }>();
      await (await run('INSERT INTO tournaments (room, heard) VALUES (?1, ?2) ON CONFLICT(room) DO UPDATE SET heard = ?2', room, now)).run();
      // the tournaments gone for a day are of no use any more
      await (await run('DELETE FROM tournaments WHERE heard < ?1', now - 24 * 60 * 60)).run();
      return row?.heard ?? null;
    },
    async lastPush() {
      const row = await (await run("SELECT value FROM state WHERE key = 'lastPush'")).first<{ value: number }>();
      return row?.value ?? -Infinity;
    },
    async setLastPush(now, pushes) {
      await (await run("INSERT INTO state (key, value) VALUES ('lastPush', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1", now)).run();
      await (await run("INSERT INTO state (key, value) VALUES ('pushes', ?1) ON CONFLICT(key) DO UPDATE SET value = value + ?1", pushes)).run();
    },
    async waiting() {
      const row = await (await run("SELECT value FROM state WHERE key = 'waiting'")).first<{ value: number }>();
      return (row?.value ?? 0) > 0;
    },
    async setWaiting(waiting) {
      await (await run("INSERT INTO state (key, value) VALUES ('waiting', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1", waiting ? 1 : 0)).run();
    },
    async stats(day, now) {
      const one = async <T>(query: string, ...values: unknown[]) => (await (await run(query, ...values)).first<T>()) ?? null;
      const value = async (key: string) => (await one<{ value: number }>('SELECT value FROM state WHERE key = ?1', key))?.value;
      return {
        subscribers: (await one<{ n: number }>('SELECT COUNT(*) AS n FROM subscriptions'))?.n ?? 0,
        writes: (await one<{ writes: number }>('SELECT writes FROM days WHERE day = ?1', day))?.writes ?? 0,
        open: await this.openCount(now),
        heardToday: (await one<{ n: number }>('SELECT COUNT(*) AS n FROM tournaments'))?.n ?? 0,
        lastPush: (await value('lastPush')) ?? -Infinity,
        pushes: (await value('pushes')) ?? 0,
      };
    },
    async openCount(now) {
      const row = await (await run('SELECT COUNT(*) AS n FROM tournaments WHERE heard >= ?1', now - TOURNAMENT_FORGET)).first<{ n: number }>();
      return row?.n ?? 0;
    },
    async subscriptions(open, now) {
      const { results } = await (await run('SELECT endpoint, p256dh, auth, locale FROM subscriptions WHERE from_open <= ?1 AND snoozed <= ?3 LIMIT ?2', open, MAX_SUBSCRIPTIONS, now)).all<{ endpoint: string; p256dh: string; auth: string; locale: Locale }>();
      return results.map(({ endpoint, p256dh, auth, locale }) => ({ endpoint, keys: { p256dh, auth }, locale }));
    },
    async countSubscriptions() {
      const row = await (await run('SELECT COUNT(*) AS n FROM subscriptions')).first<{ n: number }>();
      return row?.n ?? 0;
    },
    async subscribe(subscription, locale, from, now) {
      await (await run('INSERT INTO subscriptions (endpoint, p256dh, auth, locale, from_open, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, locale = ?4, from_open = ?5', subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, locale, from, now)).run();
    },
    async fromOf(endpoint) {
      const row = await (await run('SELECT from_open FROM subscriptions WHERE endpoint = ?1', endpoint)).first<{ from_open: number }>();
      return row?.from_open ?? null;
    },
    async snoozedOf(endpoint) {
      const row = await (await run('SELECT snoozed FROM subscriptions WHERE endpoint = ?1', endpoint)).first<{ snoozed: number }>();
      return row?.snoozed ?? 0;
    },
    async snooze(endpoint, until) {
      await (await run('UPDATE subscriptions SET snoozed = ?2 WHERE endpoint = ?1', endpoint, until)).run();
    },
    async unsubscribe(endpoint) {
      await (await run('DELETE FROM subscriptions WHERE endpoint = ?1', endpoint)).run();
    },
  };
}

/**
 * The private key's text as pasted into the dashboard, down to its base64: quotes, a PEM armor and
 * line breaks taken off, and from a JSON object (a JWK, or a file of both keys) its private field.
 */
function privateText(value: string): string {
  let text = value.trim().replace(/^["']|["']$/g, '');
  if (text.startsWith('{')) {
    const fields = JSON.parse(text) as Record<string, unknown>;
    const found = ['d', 'privateKey', 'private_key', 'private', 'VAPID_PRIVATE_KEY'].map((name) => fields[name]).find((field) => typeof field === 'string');
    text = typeof found === 'string' ? found : '';
  }
  return text.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
}

/**
 * The VAPID keys from the environment, or null while they are not set, unreadable or not one pair.
 * The private key is taken as its raw scalar (32 bytes) or as a PKCS #8 key, in base64 or base64url,
 * bare, as PEM or in JSON (see privateText); a test signature checks it against the public key.
 */
export async function vapidOf(env: Env): Promise<Vapid | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  try {
    const publicKey = fromBase64Url(env.VAPID_PUBLIC_KEY.trim());
    let privateKey = fromBase64Url(privateText(env.VAPID_PRIVATE_KEY));
    if (privateKey.length !== 32) {
      const key = await crypto.subtle.importKey('pkcs8', privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      privateKey = fromBase64Url((await crypto.subtle.exportKey('jwk', key)).d!);
    }
    if (publicKey.length !== 65 || privateKey.length !== 32) return null;
    return (await onePair(publicKey, privateKey)) ? { keys: { publicKey, privateKey }, subject: 'https://solartournament.games' } : null;
  } catch {
    return null;
  }
}

/** Whether the private key signs what the public key verifies. */
async function onePair(publicKey: Uint8Array<ArrayBuffer>, privateKey: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const curve = { name: 'ECDSA', namedCurve: 'P-256' };
  const signing = { name: 'ECDSA', hash: 'SHA-256' };
  const x = toBase64Url(publicKey.subarray(1, 33));
  const y = toBase64Url(publicKey.subarray(33, 65));
  const sign = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d: toBase64Url(privateKey) }, curve, false, ['sign']);
  const verify = await crypto.subtle.importKey('raw', publicKey, curve, false, ['verify']);
  const probe = new TextEncoder().encode('vapid');
  return crypto.subtle.verify(signing, verify, await crypto.subtle.sign(signing, sign, probe), probe);
}

/** Sends the notification to every subscription, each in its Host's language; forgets those the push service says are gone. */
export async function sendAll(store: PushStore, targets: (Subscription & { locale: Locale })[], open: number, vapid: Vapid, now: number, post: typeof fetch = fetch) {
  for (const target of targets) {
    try {
      const { url, init } = await pushRequest(target, JSON.stringify(pushText(target.locale, open)), vapid, now);
      const answer = await post(url, init);
      if (answer.status === 404 || answer.status === 410) await store.unsubscribe(target.endpoint);
      else if (!answer.ok) console.error(`push: the push service answered ${answer.status}`);
    } catch (error) {
      console.error(`push: ${error instanceof Error ? error.message : 'sending failed'}`);
    }
  }
}

/** The public key to subscribe with, or null and what of the setup is missing (nothing secret). */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const vapid = await vapidOf(env);
  if (env.PUSH_DB && vapid) return json({ key: env.VAPID_PUBLIC_KEY!.trim() });
  return json({ key: null, missing: !env.PUSH_DB ? 'database' : !env.VAPID_PRIVATE_KEY ? 'private key' : 'a readable key pair' });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  // only the game's own pages: a current browser says where a request comes from
  const site = request.headers.get('sec-fetch-site');
  if (!HOSTS.has(new URL(request.url).hostname) || (site !== null && site !== 'same-origin')) return json({ error: 'foreign site' }, 403);
  const vapid = await vapidOf(env);
  if (!env.PUSH_DB || !vapid) return json({ error: 'not set up' }, 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const store = d1Store(env.PUSH_DB);
  const now = Date.now() / 1000;
  const answer = await handle(store, body, now);
  if (answer.send?.length) waitUntil(sendAll(store, answer.send, answer.open ?? 1, vapid, now));
  return json(answer.body, answer.status);
};

/** The few parts of a Pages Function's context used here. */
type PagesFunction<E> = (context: { env: E; request: Request; waitUntil(promise: Promise<unknown>): void }) => Response | Promise<Response>;
