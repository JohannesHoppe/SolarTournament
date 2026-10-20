import type { ShipState } from '../ship/ship';
import type { AsteroidState, FieldState } from '../world/asteroids';
import type { WreckState } from '../world/wrecks';

/**
 * Checks everything that arrives from other browsers before the game touches it. Peers are
 * not trusted: a message with the wrong shape, numbers that are not finite or out of range,
 * or oversized lists is dropped as a whole, so a broken or malicious peer can neither crash
 * nor freeze the game of the others. The bounds of every peer value live here.
 */

/** No coordinate in the game comes near this (units): the arena ends at 68,000. */
export const MAX_COORDINATE = 1e6;
/** No speed in the game comes near this (units/s). */
export const MAX_SPEED = 1e5;
/** Spin rates (rad/s). */
const MAX_SPIN = 50;
/** A unit vector, with room for rounding. */
export const UNIT_LENGTH = 1.01;
/** Callsigns as the menu allows them. */
export const MAX_NAME = 16;
/** Scores, kills, deaths and round numbers. */
export const MAX_COUNT = 1e6;
/** Field times and times in the room (s): far beyond any session. */
export const MAX_FIELD_TIME = 1e7;
/** Seconds left in a round, either way (s). */
export const ROUND_LIMIT = 3600;
/** Ship and rock ids are short ("p:abc…", "b:abc…:2", "12.0.1"). */
const MAX_ID = 64;
/** A field never holds more rocks than this (40 rocks, up to 9 fragments each). */
const MAX_ROCKS = 400;
/** The arena never holds more pieces of wreckage than this (MAX_WRECKS in world/wrecks, with room). */
const MAX_WRECK_PIECES = 100;

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A finite number within bounds, or null. */
export function num(x: unknown, min: number, max: number): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null;
}

/** A vector of `length` finite numbers within ±limit, or null. */
export function vec(x: unknown, length: number, limit: number): number[] | null {
  if (!Array.isArray(x) || x.length !== length) return null;
  return x.every((v) => num(v, -limit, limit) !== null) ? (x as number[]) : null;
}

/** An id: a short string of printable characters, or null. */
export function id(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 && x.length <= MAX_ID && /^[\w.:-]+$/.test(x) ? x : null;
}

/**
 * A name as the game shows it: without control and format characters (zero-width spaces and
 * the like), trimmed, at most `max` characters; empty when nothing visible is left. The menu
 * cleans the own callsign the same way, so no peer drops it.
 */
export function cleanName(x: unknown, max = MAX_NAME): string {
  return typeof x === 'string' ? x.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, max) : '';
}

/** A ship's state; name, type, score, kills and deaths come all together or not at all (see ShipState). */
export function shipState(x: unknown): ShipState | null {
  if (!isRecord(x)) return null;
  const slowKeys = ['n', 'k', 's', 'ki', 'de'] as const;
  const present = slowKeys.filter((key) => key in x).length;
  if (present !== 0 && present !== slowKeys.length) return null;
  const slow =
    present === 0
      ? {}
      : {
          n: cleanName(x.n) || null,
          k: x.k === 'human' || x.k === 'alien' ? x.k : null,
          s: num(x.s, -MAX_COUNT, MAX_COUNT),
          ki: num(x.ki, 0, MAX_COUNT),
          de: num(x.de, 0, MAX_COUNT),
        };
  const state = {
    id: id(x.id),
    ...slow,
    p: vec(x.p, 3, MAX_COORDINATE),
    v: vec(x.v, 3, MAX_SPEED),
    q: vec(x.q, 4, UNIT_LENGTH),
    w: vec(x.w, 3, MAX_SPIN),
    th: num(x.th, 0, 1),
    a: typeof x.a === 'boolean' ? x.a : null,
    h: num(x.h, 0, 100),
    dr: num(x.dr, 0, 1),
    tr: num(x.tr, 0, 1),
    pr: num(x.pr, 0, 10),
  };
  if (Object.values(state).some((value) => value === null)) return null;
  // a quaternion of length zero cannot be normalized
  if (Math.hypot(...state.q!) < 0.5) return null;
  return state as ShipState;
}

export function asteroidState(x: unknown): AsteroidState | null {
  if (!isRecord(x)) return null;
  const rock = { id: id(x.id), hp: num(x.hp, 0, 1000), b: num(x.b, 0, MAX_FIELD_TIME) };
  return rock.id !== null && rock.hp !== null && rock.b !== null ? (rock as AsteroidState) : null;
}

/** A broken rock: its id and the field time it broke. */
function breakState(x: unknown): { id: string; b: number } | null {
  if (!isRecord(x)) return null;
  const rock = { id: id(x.id), b: num(x.b, 0, MAX_FIELD_TIME) };
  return rock.id !== null && rock.b !== null ? (rock as { id: string; b: number }) : null;
}

/** The pieces of wreckage in flight, or null. */
export function wreckStates(x: unknown): WreckState[] | null {
  if (!Array.isArray(x) || x.length > MAX_WRECK_PIECES) return null;
  const pieces = x.map((piece) => {
    if (!isRecord(piece)) return null;
    const state = { id: id(piece.id), p: vec(piece.p, 3, MAX_COORDINATE), v: vec(piece.v, 3, MAX_SPEED), g: num(piece.g, 0, MAX_FIELD_TIME) };
    return Object.values(state).some((value) => value === null) ? null : (state as WreckState);
  });
  return pieces.some((piece) => piece === null) ? null : (pieces as WreckState[]);
}

export function fieldState(x: unknown): FieldState | null {
  if (!isRecord(x) || !Array.isArray(x.a) || x.a.length > MAX_ROCKS || !Array.isArray(x.x) || x.x.length > MAX_ROCKS) return null;
  const t = num(x.t, 0, MAX_FIELD_TIME);
  const rocks = x.a.map(asteroidState);
  const broken = x.x.map(breakState);
  if (t === null || rocks.some((rock) => rock === null) || broken.some((rock) => rock === null)) return null;
  return { t, a: rocks as AsteroidState[], x: broken as { id: string; b: number }[] };
}
