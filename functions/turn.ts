/**
 * GET /turn: short-lived credentials for Cloudflare's TURN relay, for players whose networks
 * block direct connections between browsers. A Cloudflare Pages Function of this Pages
 * project: the TURN key stays here, on the server, and never reaches a browser. The key comes
 * from the project's environment (TURN_KEY_ID, and the secret TURN_KEY_API_TOKEN); without
 * them the answer is an empty list, and the game connects with STUN alone.
 */

interface Env {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/** How long the credentials hold (s): longer than an evening of rounds. */
const TTL = 6 * 60 * 60;

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ iceServers: [] });
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
