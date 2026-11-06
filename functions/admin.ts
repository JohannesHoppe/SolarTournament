/**
 * GET /admin: Johannes' page of the game's figures (push subscribers and sends, open public
 * tournaments, the day's writes against the database's budget, the month's TURN traffic against
 * its budget). A Cloudflare Pages Function of this Pages project, behind Cloudflare Access: the
 * page answers only a request that carries a valid Access token for this application, checked
 * here against the team's keys (ACCESS_TEAM, the team's name in `<team>.cloudflareaccess.com`,
 * and ACCESS_AUD, the application's audience tag, both plain variables in wrangler.toml).
 * Without them, or without a valid token, it answers 404, as if there were no such page.
 */
import { d1Store, DAILY_WRITES, PUSH_GAP, type D1Like, type PushStats } from './push';
import { fromBase64Url } from '../src/net/webpush';
import { monthlyGb, MONTHLY_BUDGET_GB, type TurnEnv } from './turn';

interface Env extends TurnEnv {
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
  PUSH_DB?: D1Like;
}

/** How long the team's keys are trusted before they are fetched again (ms); Access rotates them every few weeks. */
const KEYS_MEMORY_MS = 60 * 60 * 1000;

let keys: { team: string; at: number; list: (JsonWebKey & { kid?: string })[] } | null = null;

const b64urlJson = (value: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>;

/**
 * Whether `token` is a valid Access token of the application `aud` of the team `team` at `nowSeconds`:
 * signed RS256 by one of the team's keys, issued by the team, for this audience, not expired.
 */
export async function validAccess(token: string | null, team: string, aud: string, nowSeconds: number, fetchKeys: (url: string) => Promise<Response> = fetch): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const head = b64urlJson(parts[0]);
    const claims = b64urlJson(parts[1]);
    if (head.alg !== 'RS256') return false;
    const issuer = `https://${team}.cloudflareaccess.com`;
    if (claims.iss !== issuer) return false;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return false;
    if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return false;
    if (!keys || keys.team !== team || Date.now() - keys.at > KEYS_MEMORY_MS) {
      const answer = await fetchKeys(`${issuer}/cdn-cgi/access/certs`);
      if (!answer.ok) return false;
      keys = { team, at: Date.now(), list: ((await answer.json()) as { keys?: (JsonWebKey & { kid?: string })[] }).keys ?? [] };
    }
    const jwk = keys.list.find((key) => key.kid === head.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}

/** The figures as they stand; a figure that cannot be read is null. */
export interface Figures {
  push: PushStats | null;
  turnGb: number | null;
  now: number;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const number = (value: number) => value.toLocaleString('de-DE');
const ago = (seconds: number) => (seconds < 120 ? `${Math.round(seconds)} s ago` : seconds < 7200 ? `${Math.round(seconds / 60)} min ago` : `${Math.round(seconds / 3600)} h ago`);

/** The page: one table of figures, readable on a phone, dark like the game. */
export function page({ push, turnGb, now }: Figures): string {
  const rows: [string, string][] = push
    ? [
        ['Push subscribers', number(push.subscribers)],
        ['Pushes sent in all', number(push.pushes)],
        ['Last notification', Number.isFinite(push.lastPush) ? `${new Date(push.lastPush * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC (${ago(now - push.lastPush)})` : 'none yet'],
        ['Next notification possible', Number.isFinite(push.lastPush) && now - push.lastPush < PUSH_GAP ? `in ${Math.ceil((PUSH_GAP - (now - push.lastPush)) / 60)} min` : 'now'],
        ['Public tournaments open now', number(push.open)],
        ['Public tournaments in the last day', number(push.heardToday)],
        ['Database rows written today', `${number(push.writes)} of ${number(DAILY_WRITES)}`],
      ]
    : [['Push', 'not set up (no database bound)']];
  rows.push(['TURN traffic this month', turnGb === null ? 'unreadable' : `${turnGb.toFixed(2)} GB of ${number(MONTHLY_BUDGET_GB)} GB`]);
  const table = rows.map(([name, value]) => `<tr><th>${escape(name)}</th><td>${escape(value)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Admin · SolarTournament</title><style>
:root { color-scheme: dark; }
body { margin: 0; padding: 16px; background: #02030a; color: #e8edf8; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
h1 { font-size: 1.3rem; color: #4d91ff; margin: 0 0 16px; }
table { border-collapse: collapse; width: 100%; max-width: 640px; }
th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #1b2440; vertical-align: top; }
th { font-weight: 400; color: #9aa6bd; }
td { font-variant-numeric: tabular-nums; }
</style></head><body><h1>SolarTournament · figures</h1><table>${table}</table></body></html>`;
}

export async function onRequestGet({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const missing = new Response('Not found', { status: 404 });
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return missing;
  const now = Date.now() / 1000;
  if (!(await validAccess(request.headers.get('cf-access-jwt-assertion'), env.ACCESS_TEAM, env.ACCESS_AUD, now))) return missing;
  let push: PushStats | null = null;
  try {
    if (env.PUSH_DB) push = await d1Store(env.PUSH_DB).stats(new Date(now * 1000).toISOString().slice(0, 10), now);
  } catch (error) {
    console.error(`admin: ${error instanceof Error ? error.message : 'the database answered nothing'}`);
  }
  const { gb } = await monthlyGb(env);
  return new Response(page({ push, turnGb: Number.isFinite(gb) ? gb : null, now }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
