/**
 * GET /turn: short-lived credentials for Cloudflare's TURN relay, for players whose networks
 * block direct connections between browsers. A Cloudflare Pages Function of this Pages
 * project: the TURN key stays here, on the server, and never reaches a browser. The key comes
 * from the project's environment (TURN_KEY_ID, and the secret TURN_KEY_API_TOKEN); without
 * them the answer is an empty list, and the game connects with STUN alone.
 *
 * Cloudflare sets no spending cap on TURN, so this function sets its own: it reads the
 * relay's outbound traffic of the month from Cloudflare's analytics (CLOUDFLARE_ACCOUNT_ID,
 * and the secret TURN_ANALYTICS_TOKEN with the permission Account Analytics Read) and hands
 * out nothing beyond MONTHLY_BUDGET_GB. Whatever cannot be read counts as spent: the relay
 * rather stops than costs money.
 */

interface Env {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  TURN_ANALYTICS_TOKEN?: string;
}

/** How long the credentials hold (s): longer than an evening of rounds. */
const TTL = 6 * 60 * 60;

/** Outbound relay traffic a month (GB) after which no credentials go out: below the 1,000 GB Cloudflare gives free, leaving room for credentials already handed out. */
const MONTHLY_BUDGET_GB = 800;

/** How long one reading of the month's traffic is trusted (ms): the analytics lag minutes behind anyway. */
const USAGE_MEMORY_MS = 5 * 60 * 1000;

/**
 * Only the game's own domains hand out credentials: their zone's rate limit guards them,
 * the raw Pages addresses have none (and the game sends their visitors on anyway).
 */
const HOSTS = new Set(['solartournament.games', 'test.solartournament.games']);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The last reading of the month's outbound traffic (GB), per instance of the function. */
let usage = { gb: Infinity, at: -Infinity };

/** The relay's outbound traffic of the current month (GB, UTC), or Infinity when it cannot be read. */
async function monthlyGb(env: Env): Promise<number> {
  if (Date.now() - usage.at < USAGE_MEMORY_MS) return usage.gb;
  let gb = Infinity;
  if (env.CLOUDFLARE_ACCOUNT_ID && env.TURN_ANALYTICS_TOKEN) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const answer = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.TURN_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: 'query ($account: String!, $from: Date!, $to: Date!) { viewer { accounts(filter: { accountTag: $account }) { callsTurnUsageAdaptiveGroups(filter: { date_geq: $from, date_leq: $to }, limit: 1) { sum { egressBytes } } } } }',
          variables: { account: env.CLOUDFLARE_ACCOUNT_ID, from: `${today.slice(0, 8)}01`, to: today },
        }),
      });
      if (answer.ok) {
        const body = (await answer.json()) as { errors?: unknown[] | null; data?: { viewer?: { accounts?: { callsTurnUsageAdaptiveGroups?: { sum?: { egressBytes?: number } }[] }[] } } };
        const account = body.data?.viewer?.accounts?.[0];
        // an account without traffic this month has no group at all
        if (!body.errors?.length && account) gb = (account.callsTurnUsageAdaptiveGroups?.[0]?.sum?.egressBytes ?? 0) / 1e9;
      }
    } catch {
      // unreadable counts as spent
    }
  }
  usage = { gb, at: Date.now() };
  return gb;
}

export async function onRequestGet({ env, request }: { env: Env; request: Request }): Promise<Response> {
  // a page of another site that asks gets nothing (browsers say where a request comes from)
  const site = request.headers.get('sec-fetch-site');
  if (!HOSTS.has(new URL(request.url).hostname) || (site !== null && site !== 'same-origin')) return json({ iceServers: [] }, 403);
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ iceServers: [] });
  if ((await monthlyGb(env)) >= MONTHLY_BUDGET_GB) return json({ iceServers: [] });
  const answer = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TTL }),
  });
  if (!answer.ok) return json({ iceServers: [] });
  const { iceServers } = (await answer.json()) as { iceServers: { urls: string[]; username?: string; credential?: string }[] };
  // browsers block port 53, and a TURN address on it only times out
  return json({ iceServers: iceServers.map((server) => ({ ...server, urls: server.urls.filter((url) => !/:53\b/.test(url)) })).filter((server) => server.urls.length) });
}
