import { ARENA_LIMIT } from '../world/arena';
import { FIELD_RADIUS } from '../world/asteroids';

/**
 * Last Clone Standing: every Host has CLONES clones for the round, and a ship whose last clone
 * died is out. The last one with a clone left wins.
 */
export const CLONES = 3;
/**
 * The tournament turns a solar flare onto the arena: magnetic coils on the arena's edge hold
 * its plasma as a shell that closes in. From FLARE_START (s of field time) the shell shrinks
 * from the arena's edge to FLARE_MIN (units, about 560 m from the center) at FLARE_END, and
 * stays there. A ship outside takes FLARE_HEAT heat and FLARE_BURN hull per second: about
 * 17 s from a whole hull to nothing, and the laser locks from the heat long before.
 */
export const FLARE_START = 60;
export const FLARE_END = 240;
export const FLARE_MIN = FIELD_RADIUS * 0.25;
export const FLARE_HEAT = 40;
export const FLARE_BURN = 6;
/** Bots turn back, and new clones are printed, within this share of the flare's radius. */
export const FLARE_KEEP = 0.7;

/** The flare's radius at a field time (units): the arena's edge until it starts, then shrinking evenly. */
export function flareRadius(seconds: number): number {
  const progress = Math.min(1, Math.max(0, (seconds - FLARE_START) / (FLARE_END - FLARE_START)));
  return ARENA_LIMIT + (FLARE_MIN - ARENA_LIMIT) * progress;
}

/** Clones a ship has left of the round's CLONES. */
export const clonesLeft = (ship: { deaths: number }) => Math.max(0, CLONES - ship.deaths);

/** Whether a ship has lost its last clone. */
export const isOut = (ship: { deaths: number }) => ship.deaths >= CLONES;
