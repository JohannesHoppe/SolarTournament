import { describe, expect, it } from 'vitest';
import { encryptPush, freshKeys, fromBase64Url, pushRequest, toBase64Url, vapidToken, type Vapid } from './webpush';

const strip = (value: string) => value.replace(/\s+/g, '');

// the example of RFC 8291, section 5 and appendix A
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: strip('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'),
  ciphertext: strip('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ'),
};

describe('Web Push', () => {
  it("encrypts RFC 8291's example to its very bytes", async () => {
    const body = await encryptPush(fromBase64Url(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { publicKey: fromBase64Url(RFC.asPublic), privateKey: fromBase64Url(RFC.asPrivate) }, fromBase64Url(RFC.salt));
    const header = fromBase64Url(RFC.header);
    expect(body.length).toBe(86 + fromBase64Url(RFC.ciphertext).length);
    expect(toBase64Url(body.slice(0, 86))).toBe(toBase64Url(header));
    expect(toBase64Url(body.slice(86))).toBe(RFC.ciphertext);
  });

  it('takes a fresh key and salt for every message', async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const a = await encryptPush(new Uint8Array([1, 2, 3]), keys);
    const b = await encryptPush(new Uint8Array([1, 2, 3]), keys);
    expect(toBase64Url(a.slice(0, 86))).not.toBe(toBase64Url(b.slice(0, 86)));
  });

  it('signs a VAPID token the push service can verify, for its origin, within a day', async () => {
    const vapid: Vapid = { keys: await freshKeys(), subject: 'https://solartournament.games' };
    const now = 1_800_000_000;
    const token = await vapidToken('https://push.example.net/send/abc', vapid, now);
    const [head, claims, signature] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(head)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(claims)));
    expect(body.aud).toBe('https://push.example.net');
    expect(body.sub).toBe('https://solartournament.games');
    expect(body.exp - now).toBeGreaterThan(0);
    expect(body.exp - now).toBeLessThanOrEqual(24 * 60 * 60);
    const key = await crypto.subtle.importKey('raw', vapid.keys.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64Url(signature), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
  });

  it('builds the push: the encrypted body and the headers a push service asks for', async () => {
    const vapid: Vapid = { keys: await freshKeys(), subject: 'https://solartournament.games' };
    const { url, init } = await pushRequest({ endpoint: 'https://push.example.net/send/abc', keys: { p256dh: RFC.uaPublic, auth: RFC.auth } }, 'A tournament is open', vapid, 1_800_000_000);
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://push.example.net/send/abc');
    expect(init.method).toBe('POST');
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${toBase64Url(vapid.keys.publicKey)}$`));
    expect(Number(headers.TTL)).toBeGreaterThan(0);
    // header (86 bytes), the message and its delimiter, the 16-byte tag
    expect((init.body as Uint8Array).length).toBe(86 + 'A tournament is open'.length + 1 + 16);
  });
});
