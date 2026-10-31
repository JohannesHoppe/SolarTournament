import type { ShipState } from '../ship/ship';
import { KNOCKED, type AsteroidState, type FieldState, type ShovedState } from '../world/asteroids';
import type { WreckState } from '../world/wrecks';
import { KINDS, type ProbeState } from '../game/items';
import { MAX_LOOKS } from '../game/hangar';
import { TINTS } from '../ship/tints';
import type { FlagsState } from '../game/flags';
import type { FleetState } from '../game/fleet';

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
const MAX_NAME = 16;
/** Scores, kills, deaths and round numbers. */
export const MAX_COUNT = 1e6;
/** Field times and times in the room (s): far beyond any session. */
export const MAX_FIELD_TIME = 1e7;
/** Seconds left in a round, either way (s). */
export const ROUND_LIMIT = 3600;
/** Ship and rock ids are short ("p:abc…", "b:abc…:2", "12.0.1"). */
const MAX_ID = 64;
/**
 * A field's snapshot never lists more rocks than this, alive or broken: the largest fields have
 * 90 pieces, and each breaks into up to 3, twice (90 · (1 + 3 + 9) = 1170).
 */
const MAX_ROCKS = 1200;
/** Probes in flight at once, and the seconds a probe drifts at most (see game/items). */
const MAX_PROBES = 64;
const MAX_PROBE_SECONDS = 200;
/** Torpedoes a clone holds: its load with every tube, and two from each probe it took, far below this. */
const MAX_TORPEDOES = 99;
/** Lists of ids (the probes taken in a round: one every 25 s and the dead clones' ones) stay below this. */
const MAX_IDS = 200;
/** The arena never holds more pieces of wreckage than this (MAX_WRECKS in world/wrecks, with room). */
const MAX_WRECK_PIECES = 100;

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A finite number within bounds, or null. */
export function num(x: unknown, min: number, max: number): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null;
}

/** A whole number within bounds, or null: counts index lists, a fraction would point between them. */
export function int(x: unknown, min: number, max: number): number | null {
  return Number.isInteger(x) ? num(x, min, max) : null;
}

/** A vector of `length` finite numbers within ±limit, or null. */
export function vec(x: unknown, length: number, limit: number): number[] | null {
  if (!Array.isArray(x) || x.length !== length) return null;
  return x.every((v) => num(v, -limit, limit) !== null) ? (x as number[]) : null;
}

/** A list of at most `max` entries, each passing `check`, or null when it is no list or any entry fails. */
function listOf<T>(x: unknown, max: number, check: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(x) || x.length > max) return null;
  const list = x.map(check);
  return list.some((entry) => entry === null) ? null : (list as T[]);
}

/** A record of checked fields as the type it stands for, or null when any field failed its check. */
function complete<T>(fields: Record<string, unknown>): T | null {
  return Object.values(fields).some((value) => value === null) ? null : (fields as T);
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

/** A ship's state; name, type, score, kills, deaths and race progress come all together or not at all (see ShipState). */
export function shipState(x: unknown): ShipState | null {
  if (!isRecord(x)) return null;
  const slowKeys = ['n', 'k', 's', 'ki', 'de', 'g', 'fi', 'it', 'lo', 'co', 'to'] as const;
  const present = slowKeys.filter((key) => key in x).length;
  if (present !== 0 && present !== slowKeys.length) return null;
  const slow =
    present === 0
      ? {}
      : {
          n: cleanName(x.n) || null,
          k: x.k === 'human' || x.k === 'alien' || x.k === 'sovereign' ? x.k : null,
          s: int(x.s, -MAX_COUNT, MAX_COUNT),
          ki: int(x.ki, -MAX_COUNT, MAX_COUNT),
          de: int(x.de, 0, MAX_COUNT),
          g: int(x.g, 0, MAX_COUNT),
          fi: num(x.fi, -1, ROUND_LIMIT),
          it: int(x.it, 0, 15),
          lo: int(x.lo, 0, MAX_LOOKS),
          // a Host's tint is an entry of the palette, never a color of its own
          co: int(x.co, 0, TINTS.length - 1),
          to: int(x.to, 0, MAX_TORPEDOES),
        };
  const state = complete<ShipState>({
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
  });
  // a quaternion of length zero cannot be normalized
  return state && Math.hypot(...state.q) >= 0.5 ? state : null;
}

function asteroidState(x: unknown): AsteroidState | null {
  return isRecord(x) ? complete<AsteroidState>({ id: id(x.id), hp: num(x.hp, 0, 1000), b: num(x.b, 0, MAX_FIELD_TIME) }) : null;
}

/** A broken rock: its id and the field time it broke. */
type Break = { id: string; b: number };
function breakState(x: unknown): Break | null {
  return isRecord(x) ? complete<Break>({ id: id(x.id), b: num(x.b, 0, MAX_FIELD_TIME) }) : null;
}

/** A short list of ids (the probes taken in a round), or null. */
export function ids(x: unknown): string[] | null {
  return listOf(x, MAX_IDS, id);
}

/** The probes in flight, or null: at most four of the arena and the drops of a few dead clones. */
export function probeStates(x: unknown): ProbeState[] | null {
  return listOf(x, MAX_PROBES, (probe) => {
    if (!isRecord(probe)) return null;
    const state = complete<ProbeState>({ i: id(probe.i), k: KINDS.find((kind) => kind === probe.k) ?? null, p: vec(probe.p, 3, MAX_COORDINATE), v: vec(probe.v, 3, MAX_SPEED), u: num(probe.u, 0, MAX_PROBE_SECONDS) });
    // a sealed probe's luck is a 32-bit hash
    if (!state || probe.x === undefined) return state;
    const luck = int(probe.x, 0, 0xffffffff);
    return luck === null ? null : { ...state, x: luck };
  });
}

/** The pieces of wreckage in flight, or null. */
export function wreckStates(x: unknown): WreckState[] | null {
  return listOf(x, MAX_WRECK_PIECES, (piece) =>
    isRecord(piece) ? complete<WreckState>({ id: id(piece.id), p: vec(piece.p, 3, MAX_COORDINATE), v: vec(piece.v, 3, MAX_SPEED), g: num(piece.g, 0, MAX_FIELD_TIME) }) : null,
  );
}

/** A piece a comet, the battleship or a contact shoved (see world/asteroids, ShovedState): its motion since, with a quaternion that can be normalized, shoved by a comet's seed, RAMMED or KNOCKED (the lowest of them). */
export function shovedState(x: unknown): ShovedState | null {
  if (!isRecord(x)) return null;
  const state = complete<ShovedState>({ id: id(x.id), b: num(x.b, 0, MAX_FIELD_TIME), p: vec(x.p, 3, MAX_COORDINATE), v: vec(x.v, 3, MAX_SPEED), q: vec(x.q, 4, UNIT_LENGTH), s: vec(x.s, 4, MAX_SPIN), c: int(x.c, KNOCKED, 0xffffffff) });
  return state && Math.hypot(...state.q) >= 0.5 ? state : null;
}

export function fieldState(x: unknown): FieldState | null {
  if (!isRecord(x)) return null;
  const state = complete<FieldState>({ k: id(x.k), t: num(x.t, 0, MAX_FIELD_TIME), a: listOf(x.a, MAX_ROCKS, asteroidState), x: listOf(x.x, MAX_ROCKS, breakState) });
  if (!state || x.m === undefined) return state;
  const moved = listOf(x.m, MAX_ROCKS, shovedState);
  return moved ? { ...state, m: moved } : null;
}

/** Ships on one side of Capture the Flag: at most every place of a tournament, and those of a lead browser's bots with room. */
const MAX_SIDE = 32;
/** Captures, far beyond any round (see CAPTURES_TO_WIN). */
const MAX_CAPTURES = 99;
/** The lead's recent flag events (see EVENT_KEEP in game/flags), with room. */
const MAX_FLAG_EVENTS = 16;

/** The sides and cores of Capture the Flag as the lead browser sends them, or null. */
export function flagsState(x: unknown): FlagsState | null {
  if (!isRecord(x) || !Array.isArray(x.t) || x.t.length !== 2 || !Array.isArray(x.f) || x.f.length !== 2) return null;
  const sides = listOf(x.t, 2, (side) => listOf(side, MAX_SIDE, id));
  const captures = vec(x.c, 2, MAX_CAPTURES);
  const cores = x.f.map((core) => (core === null ? null : typeof core === 'string' ? (id(core) ?? undefined) : (vec(core, 6, MAX_COORDINATE) ?? undefined)));
  // each core in tow where the lead has it, position and velocity
  const towed = Array.isArray(x.w) && x.w.length === 2 ? x.w.map((core) => (core === null ? null : (vec(core, 6, MAX_COORDINATE) ?? undefined))) : null;
  const events = listOf(x.e, MAX_FLAG_EVENTS, (e) => {
    if (!Array.isArray(e) || e.length !== 4) return null;
    const event = [int(e[0], 1, MAX_COUNT), int(e[1], 0, 3), e[2] === null ? null : id(e[2]), int(e[3], 0, 1)] as const;
    return event[0] === null || event[1] === null || event[3] === null || (e[2] !== null && event[2] === null) ? null : (event as [number, number, string | null, number]);
  });
  if (!sides || !captures || captures.some((c) => !Number.isInteger(c) || c < 0) || cores.some((core) => core === undefined) || !towed || towed.some((core) => core === undefined) || !events) return null;
  return { t: sides, c: captures, f: cores as (string | number[] | null)[], w: towed as (number[] | null)[], e: events };
}

/** A battleship's parts, with room (see game/fleet). */
const MAX_FLEET_ZONES = 32;

/** The President's battleship as the lead browser sends it, or null. */
export function fleetState(x: unknown): FleetState | null {
  if (!isRecord(x)) return null;
  const state = complete<Omit<FleetState, 't'>>({
    d: int(x.d, 0, 1),
    p: vec(x.p, 3, MAX_COORDINATE),
    v: vec(x.v, 3, MAX_SPEED),
    q: vec(x.q, 4, UNIT_LENGTH),
    u: int(x.u, 0, 1),
    h: listOf(x.h, MAX_FLEET_ZONES, (h) => int(h, 0, MAX_COUNT)),
  });
  const target = x.t === null ? null : id(x.t);
  // the field time a comet broke up on its hull, once one did
  const rammed = x.c === undefined ? undefined : num(x.c, 0, MAX_FIELD_TIME);
  if (!state || (x.t !== null && target === null) || rammed === null || Math.hypot(...state.q) < 0.5) return null;
  return { ...state, t: target, ...(rammed === undefined ? {} : { c: rammed }) };
}
