import { mixSeed, titleFor } from './songs';

/**
 * The game master is the round's DJ (README, Radio 2584): it steps the radio back and forward
 * through the programme, or tunes it to a title of its own by typing its words. Every browser of
 * a tournament plays the same song at the same beat from the lead browser's word, carried in its
 * round state (see net/session RoundState `d`), so a newcomer hears the song where it is.
 */
export interface DjState {
  /** How far the DJ stepped the programme from its own course (songs; negative is back). */
  offset: number;
  /** A title the DJ typed, played instead of the programme's song; null for the programme's. */
  title: string | null;
  /** When the song now on air began, in seconds into the round (0: with the round). */
  from: number;
}

/** The radio as the programme runs it: no step, no title, the song from the round's start. */
export const DJ_IDLE: Readonly<DjState> = { offset: 0, title: null, from: 0 };
/** The farthest the DJ steps the programme either way (songs): far more than a tournament plays. */
export const MAX_DJ_OFFSET = 9999;
/** The longest title a DJ may type (characters): the radio's titles are two words. */
export const DJ_TITLE_MAX = 40;
/** The most words a typed title may have. */
const DJ_TITLE_WORDS = 6;
/** What a typed title may be made of: letters of any script, digits, spaces, hyphens and apostrophes. */
const TITLE_CHARS = /^[\p{L}\p{N}' -]+$/u;

/** Capitalizes each word; words start after a space, so ß or ö inside a word stay as they are. Shared with the radio page, so a title reads alike on both. */
export const tidyTitle = (title: string) => title.trim().replace(/\s+/g, ' ').replace(/(^| )(\p{L})/gu, (_, space: string, c: string) => space + c.toUpperCase());

/**
 * The title a DJ's words tune to, tidied as the radio page tidies it (the same words always give
 * the same song, see createSong), or null for words the radio does not take: empty, too long,
 * too many words, or any character beyond letters, digits, spaces, hyphens and apostrophes.
 */
export function djTitle(words: unknown): string | null {
  if (typeof words !== 'string' || words.length > DJ_TITLE_MAX * 2) return null;
  const title = tidyTitle(words);
  if (!title || title.length > DJ_TITLE_MAX || !TITLE_CHARS.test(title) || title.split(' ').length > DJ_TITLE_WORDS) return null;
  return title;
}

/**
 * The programme's song number `index` of a room whose radio is seeded by `seed`: a round plays
 * song `round + offset`. Online the seed is the room's (every browser alike); alone, a solo
 * round's own seed, whose song zero is the one the round plays undisturbed.
 */
export function programmeTitle(seed: number, index: number, online: boolean): string {
  return titleFor(online || index !== 0 ? mixSeed(seed, index) : seed);
}

/** The song a round plays now: the DJ's typed title, else the programme's song for the round and the DJ's step. */
export function djSong(dj: DjState, seed: number, round: number, online: boolean): string {
  return dj.title ?? programmeTitle(seed, round + dj.offset, online);
}

/** The DJ steps `by` songs (1 forward, -1 back): from a typed title back goes to the programme's song it interrupted. The new song starts at `now` (s into the round). */
export function djStep(dj: DjState, by: 1 | -1, now: number): DjState {
  const offset = dj.title !== null && by < 0 ? dj.offset : Math.max(-MAX_DJ_OFFSET, Math.min(MAX_DJ_OFFSET, dj.offset + by));
  return { offset, title: null, from: now };
}

/** The DJ tunes to its own `title` (see djTitle), from its start at `now` (s into the round); the programme goes on from where it was after it. */
export function djTune(dj: DjState, title: string, now: number): DjState {
  return { offset: dj.offset, title, from: now };
}

/** A new round: the programme goes on with the DJ's step, from the round's start, and a typed title is over. */
export function djNewRound(dj: DjState): DjState {
  return { offset: dj.offset, title: null, from: 0 };
}

/** The DJ's word as the lead's round state carries it (see net/session RoundState `d`): the step `o`, a typed title `t`, the song's start `f`. */
export type DjWire = { o: number; t?: string; f: number };

/** The DJ's state as the lead sends it, or undefined while the radio runs as the programme does (nothing to send). */
export function djToWire(dj: DjState): DjWire | undefined {
  if (djIdle(dj)) return undefined;
  return dj.title === null ? { o: dj.offset, f: +dj.from.toFixed(3) } : { o: dj.offset, t: dj.title, f: +dj.from.toFixed(3) };
}

/** The DJ's state a follower takes from the lead's round state; the programme's course without a word. */
export function djFromWire(wire: DjWire | undefined): DjState {
  return wire ? { offset: wire.o, title: wire.t ?? null, from: wire.f } : { ...DJ_IDLE };
}

/** Whether the radio runs as the programme would without a DJ (nothing to send). */
export function djIdle(dj: DjState): boolean {
  return dj.offset === 0 && dj.title === null && dj.from === 0;
}
