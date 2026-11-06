/**
 * /push: the notification when a public tournament opens. A Cloudflare Pages Function of this
 * Pages project, its subscriptions in the D1 database bound as PUSH_DB.
 *
 * - GET: the VAPID public key a browser subscribes with, or `{ key: null }` while the push is
 *   not set up (no database, no key); the game then shows no button for it.
 * - POST `{ subscribe: PushSubscription, locale }`: keeps a browser's subscription.
 * - POST `{ unsubscribe: endpoint }`: forgets it.
 * - POST `{ open: room }`: the lead browser of a public tournament says it is open, once when it
 *   starts announcing it and every OPEN_HEARTBEAT seconds after. A tournament not heard of
 *   before (or not for TOURNAMENT_FORGET seconds) is new, and a new one sends every subscriber
 *   a notification, at most one every PUSH_GAP seconds for all tournaments together.
 *
 * The VAPID keys come from the project's environment (VAPID_PUBLIC_KEY a plain variable in
 * wrangler.toml, VAPID_PRIVATE_KEY a secret in the dashboard, the raw private scalar in
 * base64url). The notification names no tournament: what a Host typed as its name never goes
 * to anyone's lock screen.
 *
 * Costs: D1 has a daily allowance of rows written; this function keeps to DAILY_WRITES of it
 * and refuses to write beyond (the game works on without, the lobby needs none of this).
 */
import { pushRequest, fromBase64Url, type Subscription, type Vapid } from '../src/net/webpush';
import { pushText } from '../src/net/pushtext';
import { LOCALES, type Locale } from '../src/i18n/i18n';

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
  setLastPush(now: number): Promise<void>;
  subscriptions(): Promise<(Subscription & { locale: Locale })[]>;
  countSubscriptions(): Promise<number>;
  subscribe(subscription: Subscription, locale: Locale, now: number): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

/** A subscription as a browser sends it, checked; null when anything is off. */
export function checkSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isText(endpoint, MAX_ENDPOINT) || !endpoint.startsWith('https://')) return null;
  if (!keys || !isText(keys.p256dh, 100) || !isText(keys.auth, 40)) return null;
  // a P-256 point uncompressed, an auth secret of 16 bytes
  try {
    if (fromBase64Url(keys.p256dh).length !== 65 || fromBase64Url(keys.auth).length !== 16) return null;
  } catch {
    return null;
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** What a POST asks for, or why it is refused. */
export type PushAnswer = { status: number; body: unknown; send?: (Subscription & { locale: Locale })[] };

/**
 * The function's rules on a POST's body, at `now` (s): subscribe, unsubscribe, or a tournament
 * open (and whether that sends the notification to `send`). Every write is counted first.
 */
export async function handle(store: PushStore, body: unknown, now: number): Promise<PushAnswer> {
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  if (typeof body !== 'object' || body === null) return { status: 400, body: { error: 'bad request' } };
  const request = body as { subscribe?: unknown; locale?: unknown; unsubscribe?: unknown; open?: unknown };

  if ('subscribe' in request) {
    const subscription = checkSubscription(request.subscribe);
    if (!subscription) return { status: 400, body: { error: 'bad subscription' } };
    const locale = LOCALES.includes(request.locale as Locale) ? (request.locale as Locale) : 'en';
    if ((await store.countSubscriptions()) >= MAX_SUBSCRIPTIONS) return { status: 503, body: { error: 'full' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.subscribe(subscription, locale, now);
    return { status: 200, body: { ok: true } };
  }

  if ('unsubscribe' in request) {
    if (!isText(request.unsubscribe, MAX_ENDPOINT)) return { status: 400, body: { error: 'bad request' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.unsubscribe(request.unsubscribe);
    return { status: 200, body: { ok: true } };
  }

  if ('open' in request) {
    // a room's code: six to 32 letters or digits (see src/net/room.ts)
    if (typeof request.open !== 'string' || !/^[a-z0-9]{6,32}$/i.test(request.open)) return { status: 400, body: { error: 'bad request' } };
    // the tournament's row, and the rows of those gone for a day
    if (!(await store.spend(day, 2))) return { status: 503, body: { error: 'budget spent' } };
    const room = await roomKey(request.open);
    const before = await store.heard(room, now);
    const fresh = before === null || now - before > TOURNAMENT_FORGET;
    if (!fresh || now - (await store.lastPush()) < PUSH_GAP) return { status: 200, body: { ok: true } };
    if (!(await store.spend(day, 1))) return { status: 200, body: { ok: true } };
    await store.setLastPush(now);
    return { status: 200, body: { ok: true }, send: await store.subscriptions() };
  }

  return { status: 400, body: { error: 'bad request' } };
}

/** A room's code kept only as its hash: the database never holds a code to join by. */
async function roomKey(code: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.toLowerCase())));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The store on D1; its tables are made on the first call of an instance. */
function d1Store(db: D1Like): PushStore {
  let ready: Promise<unknown> | null = null;
  const run = async (query: string, ...values: unknown[]) => {
    ready ??= Promise.all([
      db.prepare('CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, locale TEXT NOT NULL, created INTEGER NOT NULL)').bind().run(),
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
    async setLastPush(now) {
      await (await run("INSERT INTO state (key, value) VALUES ('lastPush', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1", now)).run();
    },
    async subscriptions() {
      const { results } = await (await run('SELECT endpoint, p256dh, auth, locale FROM subscriptions LIMIT ?1', MAX_SUBSCRIPTIONS)).all<{ endpoint: string; p256dh: string; auth: string; locale: Locale }>();
      return results.map(({ endpoint, p256dh, auth, locale }) => ({ endpoint, keys: { p256dh, auth }, locale }));
    },
    async countSubscriptions() {
      const row = await (await run('SELECT COUNT(*) AS n FROM subscriptions')).first<{ n: number }>();
      return row?.n ?? 0;
    },
    async subscribe(subscription, locale, now) {
      await (await run('INSERT INTO subscriptions (endpoint, p256dh, auth, locale, created) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, locale = ?4', subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, locale, now)).run();
    },
    async unsubscribe(endpoint) {
      await (await run('DELETE FROM subscriptions WHERE endpoint = ?1', endpoint)).run();
    },
  };
}

/**
 * The VAPID keys from the environment, or null while they are not set or unreadable. The private
 * key is taken as its raw scalar (32 bytes) or as a PKCS #8 key, either in base64 or base64url.
 */
export async function vapidOf(env: Env): Promise<Vapid | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  try {
    const publicKey = fromBase64Url(env.VAPID_PUBLIC_KEY.trim());
    let privateKey = fromBase64Url(env.VAPID_PRIVATE_KEY.trim());
    if (privateKey.length !== 32) {
      const key = await crypto.subtle.importKey('pkcs8', privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      privateKey = fromBase64Url((await crypto.subtle.exportKey('jwk', key)).d!);
    }
    return publicKey.length === 65 && privateKey.length === 32 ? { keys: { publicKey, privateKey }, subject: 'https://solartournament.games' } : null;
  } catch {
    return null;
  }
}

/** Sends the notification to every subscription, each in its Host's language; forgets those the push service says are gone. */
export async function sendAll(store: PushStore, targets: (Subscription & { locale: Locale })[], vapid: Vapid, now: number, post: typeof fetch = fetch) {
  for (const target of targets) {
    try {
      const { url, init } = await pushRequest(target, JSON.stringify(pushText(target.locale)), vapid, now);
      const answer = await post(url, init);
      if (answer.status === 404 || answer.status === 410) await store.unsubscribe(target.endpoint);
      else if (!answer.ok) console.error(`push: the push service answered ${answer.status}`);
    } catch (error) {
      console.error(`push: ${error instanceof Error ? error.message : 'sending failed'}`);
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => json({ key: env.PUSH_DB && (await vapidOf(env)) ? env.VAPID_PUBLIC_KEY!.trim() : null });

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
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
  if (answer.send?.length) waitUntil(sendAll(store, answer.send, vapid, now));
  return json(answer.body, answer.status);
};

/** The few parts of a Pages Function's context used here. */
type PagesFunction<E> = (context: { env: E; request: Request; waitUntil(promise: Promise<unknown>): void }) => Response | Promise<Response>;
