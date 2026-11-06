import { describe, expect, it } from 'vitest';
import { onRequestGet, page, validAccess } from '../../functions/admin';
import { toBase64Url } from './webpush';

const text = new TextEncoder();
const part = (value: unknown) => toBase64Url(text.encode(JSON.stringify(value)));

/** A team's key pair, its keys as Access serves them, and tokens signed with it. */
async function team() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const certs = async (url: string) => (url === 'https://haushoppe.cloudflareaccess.com/cdn-cgi/access/certs' ? Response.json({ keys: [jwk] }) : new Response(null, { status: 404 }));
  const sign = async (claims: Record<string, unknown>, kid = 'k1') => {
    const unsigned = `${part({ alg: 'RS256', kid })}.${part(claims)}`;
    return `${unsigned}.${toBase64Url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, text.encode(unsigned))))}`;
  };
  return { certs, sign };
}

const NOW = 1_800_000_000;
const good = { iss: 'https://haushoppe.cloudflareaccess.com', aud: ['app-aud'], exp: NOW + 600 };

describe('the admin page', () => {
  it('lets in only a valid Access token of its team and application', async () => {
    const { certs, sign } = await team();
    expect(await validAccess(await sign(good), 'haushoppe', 'app-aud', NOW, certs)).toBe(true);
    expect(await validAccess(await sign({ ...good, aud: ['other'] }), 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    expect(await validAccess(await sign({ ...good, exp: NOW - 1 }), 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    expect(await validAccess(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' }), 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    expect(await validAccess(await sign(good, 'unknown'), 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    const token = await sign(good);
    const [head, , signature] = token.split('.');
    expect(await validAccess(`${head}.${part({ ...good, aud: ['app-aud'], exp: NOW + 99999 })}.${signature}`, 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    expect(await validAccess(null, 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
    expect(await validAccess('a.b', 'haushoppe', 'app-aud', NOW, certs)).toBe(false);
  });

  it('is not found without Access set up or without a token', async () => {
    const request = new Request('https://solartournament.games/admin');
    expect((await onRequestGet({ env: {}, request })).status).toBe(404);
    expect((await onRequestGet({ env: { ACCESS_TEAM: 'haushoppe', ACCESS_AUD: 'app-aud' }, request })).status).toBe(404);
  });

  it('shows the figures, and says what is not set up or unreadable', () => {
    const html = page({ push: { subscribers: 1234, writes: 77, open: 2, heardToday: 9, lastPush: NOW - 300, pushes: 5000 }, turnGb: 12.5, now: NOW });
    expect(html).toContain('1.234');
    expect(html).toContain('77 of 50.000');
    expect(html).toContain('5 min ago');
    expect(html).toContain('12.50 GB of 500 GB');
    const bare = page({ push: null, turnGb: null, now: NOW });
    expect(bare).toContain('not set up');
    expect(bare).toContain('unreadable');
  });
});
