import type { ShipState } from '../ship/ship';
import type { AsteroidState, FieldState } from '../world/asteroids';

/**
 * Checks everything that arrives from other browsers before the game touches it. Peers are
 * not trusted: a message with the wrong shape, numbers that are not finite or out of range,
 * or oversized lists is dropped as a whole, so a broken or malicious peer can neither crash
 * nor freeze the game of the others.
 */

/** No coordinate in the game comes near this (units): the arena ends at 68,000. */
const MAX_COORDINATE = 1e6;
/** No speed in the game comes near this (units/s). */
const MAX_SPEED = 1e5;
/** Spin rates (rad/s). */
const MAX_SPIN = 50;
/** Callsigns as the menu allows them. */
export const MAX_NAME = 16;
/** Scores, kills and deaths of one round. */
const MAX_COUNT = 1e6;
/** Ship and rock ids are short ("p:abc…", "b:abc…:2", "12.0.1"). */
const MAX_ID = 64;
/** A field never holds more rocks than this (40 rocks, up to 9 fragments each). */
const MAX_ROCKS = 400;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

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

/** A callsign: trimmed, without control characters, at most MAX_NAME characters. */
function name(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const clean = x.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_NAME);
  return clean || null;
}

export function shipState(x: unknown): ShipState | null {
  if (!isRecord(x)) return null;
  const state = {
    id: id(x.id),
    n: name(x.n),
    k: x.k === 'human' || x.k === 'alien' ? x.k : null,
    p: vec(x.p, 3, MAX_COORDINATE),
    v: vec(x.v, 3, MAX_SPEED),
    q: vec(x.q, 4, 1.01),
    w: vec(x.w, 3, MAX_SPIN),
    th: num(x.th, 0, 1),
    a: typeof x.a === 'boolean' ? x.a : null,
    h: num(x.h, 0, 100),
    dr: num(x.dr, 0, 1),
    tr: num(x.tr, 0, 1),
    s: num(x.s, -MAX_COUNT, MAX_COUNT),
    ki: num(x.ki, 0, MAX_COUNT),
    de: num(x.de, 0, MAX_COUNT),
    pr: num(x.pr, 0, 10),
  };
  if (Object.values(state).some((value) => value === null)) return null;
  // a quaternion of length zero cannot be normalized
  if (Math.hypot(...state.q!) < 0.5) return null;
  return state as ShipState;
}

export function asteroidState(x: unknown): AsteroidState | null {
  if (!isRecord(x)) return null;
  const rock = { id: id(x.id), hp: num(x.hp, 0, 1000), b: num(x.b, 0, 1e7) };
  return rock.id !== null && rock.hp !== null && rock.b !== null ? (rock as AsteroidState) : null;
}

export function fieldState(x: unknown): FieldState | null {
  if (!isRecord(x) || !Array.isArray(x.a) || x.a.length > MAX_ROCKS) return null;
  const t = num(x.t, 0, 1e7);
  const rocks = x.a.map(asteroidState);
  if (t === null || rocks.some((rock) => rock === null)) return null;
  return { t, a: rocks as AsteroidState[] };
}
