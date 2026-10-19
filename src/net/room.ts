/**
 * A tournament room as its link describes it: the code the browsers meet under, the name its
 * creator gave it, whether the lobby lists it, and whether bots fill the free places. All of it
 * lives in the link's fragment (after the #), so it never reaches a server, and whoever follows
 * the link knows the room's rules even when nobody else is in it: a room can be played forever.
 */
export interface Room {
  code: string;
  name: string;
  /** Listed in the lobby for everyone; a private room is only found through its link. */
  public: boolean;
  /** Bots fill the places no Host takes. */
  bots: boolean;
}

/** Longest room name (characters). */
export const ROOM_NAME_MAX = 32;
/** Characters of the random part of a code: no 0/o, 1/l/i, so a code read aloud survives. */
const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/**
 * Random characters behind the name: a private room gets 20 (about 99 bits, far beyond
 * guessing from the public relays), a public one 6, enough that two rooms of the same name
 * never meet.
 */
const PRIVATE_RANDOM = 20;
const PUBLIC_RANDOM = 6;
/** The readable part of a code, from the room's name. */
const SLUG_MAX = 24;

/** A new room, with a code from the room's name and the browser's cryptographic random source. */
export function newRoom(name: string, isPublic: boolean, bots: boolean): Room {
  const clean = roomName(name) || 'Tournament';
  const bytes = crypto.getRandomValues(new Uint8Array(isPublic ? PUBLIC_RANDOM : PRIVATE_RANDOM));
  const random = Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
  const slug = clean.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, SLUG_MAX);
  return { code: slug ? `${slug}-${random}` : random, name: clean, public: isPublic, bots };
}

/** A room name as the game shows it: without control characters, at most ROOM_NAME_MAX characters. */
export function roomName(x: unknown): string {
  return typeof x === 'string' ? x.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, ROOM_NAME_MAX) : '';
}

/** A room code as it arrives in a link or the lobby, or null when it is not one. */
export function roomCode(x: unknown): string | null {
  const code = typeof x === 'string' ? x.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
  return code.length >= 6 && code.length <= 64 ? code : null;
}

/** The room a link's fragment names (`#t=code&n=name&pub=1&bots=0`), or null without one. */
export function roomFromFragment(fragment: string): Room | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const code = roomCode(params.get('t'));
  if (!code) return null;
  return { code, name: roomName(params.get('n')) || 'Tournament', public: params.get('pub') === '1', bots: params.get('bots') !== '0' };
}

/** The fragment that names a room, for the address bar and the invitation link. */
export function roomFragment(room: Room): string {
  const params = new URLSearchParams({ t: room.code, n: room.name });
  if (room.public) params.set('pub', '1');
  if (!room.bots) params.set('bots', '0');
  return '#' + params.toString();
}
