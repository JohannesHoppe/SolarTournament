/**
 * Web Push from the server side, on the platform's WebCrypto alone: a message encrypted for one
 * browser's subscription (RFC 8291, the content coding aes128gcm of RFC 8188) and the VAPID
 * token that tells the browser's push service who sends it (RFC 8292). Shared by the Pages
 * Functions that send pushes; nothing here runs in the game's page.
 */

const text = new TextEncoder();

/** Bytes as base64url without padding, as Web Push writes keys and tokens. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (padded or not) as bytes. */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF (RFC 5869) with SHA-256, for outputs of at most one block (32 bytes), all Web Push needs. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, join(info, new Uint8Array([1])))).slice(0, length);
}

/** A P-256 key pair as Web Push keeps it: the public key uncompressed (65 bytes), the private scalar (32 bytes). */
export interface RawKeys {
  publicKey: Uint8Array<ArrayBuffer>;
  privateKey: Uint8Array<ArrayBuffer>;
}

/** A private P-256 key for WebCrypto from its raw scalar and public point. */
function privateJwk(keys: RawKeys): JsonWebKey {
  return { kty: 'EC', crv: 'P-256', d: toBase64Url(keys.privateKey), x: toBase64Url(keys.publicKey.slice(1, 33)), y: toBase64Url(keys.publicKey.slice(33, 65)), ext: true };
}

/** A fresh key pair for one message (RFC 8291 wants a new one every time). */
export async function freshKeys(): Promise<RawKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey, privateKey: fromBase64Url(jwk.d!) };
}

/** Where a browser takes its pushes and the keys it handed out with its subscription (PushSubscription.toJSON()). */
export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The record size written into the header; one record holds every message the game sends. */
const RECORD_SIZE = 4096;

/**
 * A message encrypted for one subscription, ready as a push's body: the header (salt, record
 * size, the sender's one-time public key) and the single record, padded with the delimiter
 * 0x02. `sender` and `salt` are fresh unless given (the tests give RFC 8291's example).
 */
export async function encryptPush(message: Uint8Array, subscription: Subscription['keys'], sender?: RawKeys, salt?: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const as = sender ?? (await freshKeys());
  const nonceSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaPublic = fromBase64Url(subscription.p256dh);
  const auth = fromBase64Url(subscription.auth);

  const ownKey = await crypto.subtle.importKey('jwk', privateJwk(as), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const theirKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirKey }, ownKey, 256));

  const ikm = await hkdf(auth, ecdh, join(text.encode('WebPush: info\0'), uaPublic, as.publicKey), 32);
  const cek = await hkdf(nonceSalt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(nonceSalt, ikm, text.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, join(message, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(nonceSalt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = as.publicKey.length;
  return join(header, as.publicKey, record);
}

/** Who sends the pushes, as the push services see it: the VAPID key pair and a contact (an https address). */
export interface Vapid {
  keys: RawKeys;
  subject: string;
}

/** How long a VAPID token holds (s); RFC 8292 allows up to a day. */
const VAPID_TTL = 12 * 60 * 60;

/** The VAPID token for one push service (its origin is the audience), signed with ES256. */
export async function vapidToken(endpoint: string, vapid: Vapid, nowSeconds: number): Promise<string> {
  const head = toBase64Url(text.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(text.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowSeconds) + VAPID_TTL, sub: vapid.subject })));
  const key = await crypto.subtle.importKey('jwk', privateJwk(vapid.keys), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto signs as r || s, the very form a JWT carries
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text.encode(`${head}.${claims}`)));
  return `${head}.${claims}.${toBase64Url(signature)}`;
}

/** How long a push service keeps a message for a browser that is offline (s): an open tournament is news for a few minutes only. */
export const PUSH_TTL = 10 * 60;

/** A push to one subscription as a fetch's arguments. */
export async function pushRequest(subscription: Subscription, message: string, vapid: Vapid, nowSeconds: number): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPush(text.encode(message), subscription.keys);
  const token = await vapidToken(subscription.endpoint, vapid, nowSeconds);
  return {
    url: subscription.endpoint,
    init: {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${toBase64Url(vapid.keys.publicKey)}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_TTL),
        Urgency: 'normal',
      },
      body,
    },
  };
}
