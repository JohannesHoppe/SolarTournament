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
 *   Nobody can prove a tournament open (it lives between the browsers), so each word is kept
 *   with its source, a keyed hash of the sender's network that changes every day: a source
 *   counts as one open tournament, and one that had another heard within SOURCE_GAP opens no new
 *   one, so a script with one line sends no more notifications than a Host would.
 * - POST `{ more: 1 }`: a notification goes out PUSH_BATCH subscriptions a call (a function may
 *   only make so many requests); the answer to the call that started it and to each of these
 *   says whether more are left, and the lead browser asks again until none are.
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
/** Pushes sent in one call (see `more`): a free plan's function makes at most 50 requests and 50 database queries a call, and each push that finds its subscription gone deletes it. */
export const PUSH_BATCH = 25;
/** A source (see sourceOf) whose other tournament was heard within this long (s) opens no new one: a Host plays one tournament at a time. */
export const SOURCE_GAP = 60 * 60;
/** A tournament's word heard again within this long (s) is not written again: its lead says it every OPEN_HEARTBEAT. */
const HEARD_EVERY = OPEN_HEARTBEAT / 2;
/** The longest endpoint taken (characters): push services' addresses are far shorter. */
const MAX_ENDPOINT = 1000;

/** A subscription a notification goes to: its number in the table, the Host's language. */
export type Target = Subscription & { locale: Locale; id: number };

/** A notification going out over several calls: how many tournaments it says are open, when it started (a pause is judged by then), the last subscription it went to. */
export interface Pushing {
  open: number;
  at: number;
  after: number;
}

/** What the logic needs of the database; D1 in the function, a map in the tests. */
export interface PushStore {
  /** Counts `rows` against the day's writes; false (and nothing counted) once DAILY_WRITES would be passed. */
  spend(day: string, rows: number): Promise<boolean>;
  /** When a tournament was heard of last, or null. */
  lastHeard(room: string): Promise<number | null>;
  /** Keeps a tournament as heard of now, from `source` (see sourceOf; null for none known). */
  heard(room: string, now: number, source: string | null): Promise<void>;
  /** Whether a tournament other than `room` was heard of from `source` since `since`. */
  sourceBusy(source: string, room: string, since: number): Promise<boolean>;
  /** The time of the last notification, or -Infinity. */
  lastPush(): Promise<number>;
  /** Keeps the time of a notification. */
  setLastPush(now: number): Promise<void>;
  /** Counts the pushes sent. */
  countPushes(pushes: number): Promise<void>;
  /** The notification still going out (see `more`), or null. */
  pushing(): Promise<Pushing | null>;
  /** Starts a notification's next calls (null: it went to everyone). */
  setPushing(pushing: Pushing | null): Promise<void>;
  /** Moves the notification going out on from the subscription `after` to `next` (-1: done); false if another call moved it first. */
  advance(after: number, next: number): Promise<boolean>;
  /** Whether a new tournament waits to be announced (heard within the gap). */
  waiting(): Promise<boolean>;
  setWaiting(waiting: boolean): Promise<void>;
  /** The figures of the admin page (functions/admin.ts). */
  stats(day: string, now: number): Promise<PushStats>;
  /** The next `limit` subscriptions after the one numbered `after` (-1: from the first) that asked to hear of `open` tournaments or fewer and are not paused at `now`, in the order of their numbers. */
  subscriptions(open: number, now: number, after: number, limit: number): Promise<Target[]>;
  countSubscriptions(): Promise<number>;
  /** The tournaments heard of within TOURNAMENT_FORGET, those of one source counted once. */
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
export type PushAnswer = { status: number; body: unknown; send?: Target[]; open?: number };

/**
 * The function's rules on a POST's body, at `now` (s), from `source` (see sourceOf; null when not
 * known): subscribe, unsubscribe, pause, or a tournament open (and whether that sends the
 * notification to `send`), or the next of a notification's calls. Every write is counted first;
 * an endpoint not subscribed writes nothing.
 */
export async function handle(store: PushStore, body: unknown, now: number, source: string | null = null): Promise<PushAnswer> {
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  if (typeof body !== 'object' || body === null) return { status: 400, body: { error: 'bad request' } };
  const request = body as { subscribe?: unknown; locale?: unknown; from?: unknown; unsubscribe?: unknown; status?: unknown; open?: unknown; snooze?: unknown; until?: unknown; more?: unknown };

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
    if ((await store.fromOf(request.snooze)) === null) return { status: 404, body: { error: 'not subscribed' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.snooze(request.snooze, until);
    return { status: 200, body: { ok: true } };
  }

  if ('subscribe' in request) {
    const subscription = checkSubscription(request.subscribe);
    if (!subscription) return { status: 400, body: { error: 'bad subscription' } };
    const locale = LOCALES.includes(request.locale as Locale) ? (request.locale as Locale) : 'en';
    const from = Number.isInteger(request.from) && (request.from as number) >= 1 && (request.from as number) <= MAX_FROM ? (request.from as number) : 1;
    // a Host already subscribed changes its choice however full the table is
    if ((await store.fromOf(subscription.endpoint)) === null && (await store.countSubscriptions()) >= MAX_SUBSCRIPTIONS) return { status: 503, body: { error: 'full' } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.subscribe(subscription, locale, from, now);
    return { status: 200, body: { ok: true } };
  }

  if ('unsubscribe' in request) {
    if (!isText(request.unsubscribe, MAX_ENDPOINT)) return { status: 400, body: { error: 'bad request' } };
    if ((await store.fromOf(request.unsubscribe)) === null) return { status: 200, body: { ok: true } };
    if (!(await store.spend(day, 1))) return { status: 503, body: { error: 'budget spent' } };
    await store.unsubscribe(request.unsubscribe);
    return { status: 200, body: { ok: true } };
  }

  if ('open' in request) {
    // a room's code: six to 64 small letters, digits and dashes (roomCode in src/net/room.ts)
    if (typeof request.open !== 'string' || !/^[a-z0-9-]{6,64}$/.test(request.open)) return { status: 400, body: { error: 'bad request' } };
    const room = await roomKey(request.open);
    const before = await store.lastHeard(room);
    // a word said again at once changes nothing, and writes nothing
    if (before !== null && now - before < HEARD_EVERY) return { status: 200, body: { ok: true } };
    const fresh = before === null || now - before > TOURNAMENT_FORGET;
    // one source, one tournament at a time: a new one beside another is not kept at all
    if (fresh && source !== null && (await store.sourceBusy(source, room, now - SOURCE_GAP))) return { status: 200, body: { ok: true } };
    // the tournament's row, and the rows of those gone for a day
    if (!(await store.spend(day, 2))) return { status: 503, body: { error: 'budget spent' } };
    await store.heard(room, now, source);
    const waiting = await store.waiting();
    // a heartbeat: a notification whose calls stopped (its lead left) is carried on by this lead
    if (!fresh && !waiting) return { status: 200, body: { ok: true, more: (await store.pushing()) !== null } };
    if (now - (await store.lastPush()) < PUSH_GAP) {
      // within the gap: a new one waits for the gap's end, announced by the next word of any open tournament
      if (fresh && !waiting && (await store.spend(day, 1))) await store.setWaiting(true);
      return { status: 200, body: { ok: true } };
    }
    // the gap, the count, a waiting one done, and the calls to come
    if (!(await store.spend(day, 6))) return { status: 200, body: { ok: true } };
    if (waiting) await store.setWaiting(false);
    const open = await store.openCount(now);
    const send = await store.subscriptions(open, now, -1, PUSH_BATCH);
    // nobody asked to hear of this many: the gap stays open for the next
    if (!send.length) return { status: 200, body: { ok: true } };
    await store.setLastPush(now);
    await store.countPushes(send.length);
    const more = send.length === PUSH_BATCH;
    await store.setPushing(more ? { open, at: now, after: send[send.length - 1].id } : null);
    return { status: 200, body: { ok: true, more }, send, open };
  }

  if ('more' in request) {
    // the next of a notification's calls; the first to take it sends it, a second call at once finds it taken
    const pushing = await store.pushing();
    if (!pushing) return { status: 200, body: { ok: true, more: false } };
    const send = await store.subscriptions(pushing.open, pushing.at, pushing.after, PUSH_BATCH);
    const next = send.length === PUSH_BATCH ? send[send.length - 1].id : -1;
    if (!(await store.spend(day, 2))) return { status: 503, body: { error: 'budget spent' } };
    if (!(await store.advance(pushing.after, next))) return { status: 200, body: { ok: true, more: true } };
    if (!send.length) return { status: 200, body: { ok: true, more: false } };
    await store.countPushes(send.length);
    return { status: 200, body: { ok: true, more: next >= 0 }, send, open: pushing.open };
  }

  return { status: 400, body: { error: 'bad request' } };
}

/**
 * Where a request comes from, as a keyed hash that changes every day: the sender's network (an
 * IPv4 address, the first 64 bits of an IPv6 one, which a single line is handed), hashed with
 * the secret `key` and the day, so neither the table nor anyone reading it can tell an address
 * from it, nor follow a source from one day to the next. Null when the address is not known.
 */
export async function sourceOf(address: string | null, key: string, day: string): Promise<string | null> {
  if (!address) return null;
  let network = address.trim().toLowerCase();
  if (network.includes(':')) {
    const [head, tail = ''] = network.split('::');
    const left = head ? head.split(':') : [];
    const right = network.includes('::') && tail ? tail.split(':') : [];
    const groups = network.includes('::') ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
    network = groups
      .slice(0, 4)
      .map((group) => group.replace(/^0+(?=.)/, ''))
      .join(':');
  }
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(`${day} ${network}`)));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
      db
        .prepare('CREATE TABLE IF NOT EXISTS tournaments (room TEXT PRIMARY KEY, heard INTEGER NOT NULL, source TEXT)')
        .bind()
        .run()
        // a table made before sources were kept gets the column; one that has it refuses, and that is fine
        .then(() => db.prepare('ALTER TABLE tournaments ADD COLUMN source TEXT').bind().run())
        .catch(() => undefined),
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
    async lastHeard(room) {
      const row = await (await run('SELECT heard FROM tournaments WHERE room = ?1', room)).first<{ heard: number }>();
      return row?.heard ?? null;
    },
    async heard(room, now, source) {
      await (await run('INSERT INTO tournaments (room, heard, source) VALUES (?1, ?2, ?3) ON CONFLICT(room) DO UPDATE SET heard = ?2, source = ?3', room, now, source)).run();
      // the tournaments gone for a day are of no use any more, nor their sources
      await (await run('DELETE FROM tournaments WHERE heard < ?1', now - 24 * 60 * 60)).run();
    },
    async sourceBusy(source, room, since) {
      return (await (await run('SELECT 1 AS busy FROM tournaments WHERE source = ?1 AND room <> ?2 AND heard >= ?3 LIMIT 1', source, room, since)).first<{ busy: number }>()) !== null;
    },
    async lastPush() {
      const row = await (await run("SELECT value FROM state WHERE key = 'lastPush'")).first<{ value: number }>();
      return row?.value ?? -Infinity;
    },
    async setLastPush(now) {
      await (await run("INSERT INTO state (key, value) VALUES ('lastPush', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1", now)).run();
    },
    async countPushes(pushes) {
      await (await run("INSERT INTO state (key, value) VALUES ('pushes', ?1) ON CONFLICT(key) DO UPDATE SET value = value + ?1", pushes)).run();
    },
    async pushing() {
      const { results } = await (await run("SELECT key, value FROM state WHERE key IN ('pushOpen', 'pushAt', 'pushAfter')")).all<{ key: string; value: number }>();
      const value = (key: string) => results.find((row) => row.key === key)?.value;
      const after = value('pushAfter');
      return after === undefined || after < 0 ? null : { open: value('pushOpen') ?? 1, at: value('pushAt') ?? 0, after };
    },
    async setPushing(pushing) {
      if (!pushing) await (await run("INSERT INTO state (key, value) VALUES ('pushAfter', -1) ON CONFLICT(key) DO UPDATE SET value = -1")).run();
      else await (await run("INSERT INTO state (key, value) VALUES ('pushOpen', ?1), ('pushAt', ?2), ('pushAfter', ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value", pushing.open, pushing.at, pushing.after)).run();
    },
    async advance(after, next) {
      return (await (await run("UPDATE state SET value = ?2 WHERE key = 'pushAfter' AND value = ?1 RETURNING value", after, next)).first<{ value: number }>()) !== null;
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
      const row = await (await run('SELECT COUNT(DISTINCT COALESCE(source, room)) AS n FROM tournaments WHERE heard >= ?1', now - TOURNAMENT_FORGET)).first<{ n: number }>();
      return row?.n ?? 0;
    },
    async subscriptions(open, now, after, limit) {
      const { results } = await (await run('SELECT rowid AS id, endpoint, p256dh, auth, locale FROM subscriptions WHERE from_open <= ?1 AND snoozed <= ?2 AND rowid > ?3 ORDER BY rowid LIMIT ?4', open, now, after, limit)).all<{ id: number; endpoint: string; p256dh: string; auth: string; locale: Locale }>();
      return results.map(({ id, endpoint, p256dh, auth, locale }) => ({ id, endpoint, keys: { p256dh, auth }, locale }));
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
  const source = await sourceOf(request.headers.get('cf-connecting-ip'), env.VAPID_PRIVATE_KEY!, new Date(now * 1000).toISOString().slice(0, 10));
  const answer = await handle(store, body, now, source);
  if (answer.send?.length) waitUntil(sendAll(store, answer.send, answer.open ?? 1, vapid, now));
  return json(answer.body, answer.status);
};

/** The few parts of a Pages Function's context used here. */
type PagesFunction<E> = (context: { env: E; request: Request; waitUntil(promise: Promise<unknown>): void }) => Response | Promise<Response>;
