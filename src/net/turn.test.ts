import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../functions/turn';

const env = { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account', TURN_ANALYTICS_TOKEN: 'analytics' };
const request = () => new Request('https://solartournament.games/turn', { headers: { 'sec-fetch-site': 'same-origin' } });

describe('the TURN credentials of /turn (functions/turn.ts)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names only a fixed reason when the analytics cannot be read: what they answered stays in the log', async () => {
    const secret = 'account 1234abcd has no access to zone internal-billing';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: secret }], data: null }), { status: 200 }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const answer = await onRequestGet({ env, request: request() });
    const text = await answer.text();
    expect(JSON.parse(text)).toEqual({ iceServers: [], off: 'budget unreadable' });
    expect(text).not.toContain('1234abcd');
    expect(log.mock.calls.flat().join(' ')).toContain(secret);
  });
});
