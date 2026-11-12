import { msg } from '../i18n/i18n';
import type { Perks } from '../game/hangar';

/**
 * Scars (docs/campaign/STORY.md, "Scars"): the Host remembers every death of its clones, and some
 * deaths teach. Each of the campaign's clones lost (in a job, a trial's round, the Pit) counts
 * towards the scar of what killed it; at SCAR_TIERS deaths of a kind the scar deepens a tier, and
 * every clone printed from then on flies with what the Host learned. Only in the campaign: nothing
 * of it reaches a tournament's hull.
 *
 * - Stone Memory (rock, wreckage, a ram, a shove into rock): the impact warning comes
 *   STONE_SECONDS earlier a tier.
 * - Flinch (a beam): the clone turns the armor into a line of fire before it knows why; every hit
 *   hurts FLINCH less a tier.
 * - Burn Scar (a planet's air, a flare, a drive's plume, the battleship's exhaust): the clone runs
 *   the radiators at their edge, BURN more cooling a tier.
 * - Blast Nerves (a torpedo, a blast, a nova, a comet's head and shower, a battery, a
 *   self-destruct): the thrusters kick BLAST harder a tier.
 * - Undertow (a massive body's well): the drive pushes UNDERTOW harder a tier.
 */
export type Scar = 'stone' | 'flinch' | 'burn' | 'blast' | 'undertow';
export const SCAR_KINDS: readonly Scar[] = ['stone', 'flinch', 'burn', 'blast', 'undertow'];

/** Deaths of a kind for each tier of its scar: the first after three, the second after ten, the last after twenty-five. */
export const SCAR_TIERS: readonly number[] = [3, 10, 25];

/** Stone Memory: seconds the impact warning comes earlier per tier. */
export const STONE_SECONDS = 0.5;
/** Flinch: the share of every hit's damage taken off per tier. */
export const FLINCH = 0.03;
/** Burn Scar: the radiators' cooling added per tier (a share of a stock ship's). */
export const BURN = 0.04;
/** Blast Nerves: the thrusters' push added per tier (a share of a stock ship's). */
export const BLAST = 0.03;
/** Undertow: the main drive's push added per tier (a share of a stock ship's). */
export const UNDERTOW = 0.03;

/** What the job board calls each scar, and what it does. */
export const SCAR_NAMES: Record<Scar, string> = { stone: msg('Stone Memory'), flinch: msg('Flinch'), burn: msg('Burn Scar'), blast: msg('Blast Nerves'), undertow: msg('Undertow') };
export const SCAR_EFFECTS: Record<Scar, string> = {
  stone: msg('the impact warning {seconds} s earlier'),
  flinch: msg('every hit {percent} % softer'),
  burn: msg('the radiators {percent} % cooler'),
  blast: msg('the thrusters {percent} % harder'),
  undertow: msg('the drive {percent} % harder'),
};

/** The scar a clone's death counts towards: by what killed it (the game's cause of death, see Game.shipDestroyed, and what struck it), or null for one that teaches nothing (the arena's edge). */
export function scarOf(cause: string | null, what: string | undefined): Scar | null {
  switch (cause) {
    case 'rock':
    case 'wreck':
    case 'ram':
    case 'knockout':
      return 'stone';
    case 'air':
    case 'flare':
    case 'plume':
    case 'exhaust':
      return 'burn';
    case 'blast':
    case 'nova':
    case 'self':
    case 'shower':
    case 'comet':
    case 'battery':
      return 'blast';
    case 'well':
      return 'undertow';
    case null:
      return what === 'torpedo' ? 'blast' : what === 'laser' ? 'flinch' : null;
    default:
      return null;
  }
}

/** The tier of a scar after `deaths` of its kind: 0 (none yet) to SCAR_TIERS.length. */
export const scarTier = (deaths: number): number => SCAR_TIERS.filter((from) => deaths >= from).length;

/** The deaths of each kind, as the campaign keeps them (see Campaign.scars). */
export type Scars = Record<Scar, number>;
export const freshScars = (): Scars => ({ stone: 0, flinch: 0, burn: 0, blast: 0, undertow: 0 });

/** The most deaths of a kind the browser keeps: the last tier and far beyond. */
const SCARS_MAX = 100_000;

/** Scars as the browser kept them: a count it cannot read is none. */
export function scarsFrom(kept: unknown): Scars {
  const scars = freshScars();
  if (typeof kept !== 'object' || kept === null) return scars;
  for (const kind of SCAR_KINDS) {
    const value = (kept as Record<string, unknown>)[kind];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) scars[kind] = Math.min(Math.floor(value), SCARS_MAX);
  }
  return scars;
}

/** What the scars do to the campaign's hull (see hullOf): Flinch, Burn Scar, Blast Nerves and Undertow, each by its tier. */
export function scarHull(hull: Perks, scars: Scars) {
  hull.damage *= 1 - FLINCH * scarTier(scars.flinch);
  hull.cooling += BURN * scarTier(scars.burn);
  hull.thrusters += BLAST * scarTier(scars.blast);
  hull.drive += UNDERTOW * scarTier(scars.undertow);
}

/** Seconds Stone Memory brings the impact warning forward. */
export const stoneSeconds = (scars: Scars) => STONE_SECONDS * scarTier(scars.stone);

/** A clone's death counted (see scarOf): the scar it deepened to a new tier, or null. */
export function scar(scars: Scars, kind: Scar | null): { kind: Scar; tier: number } | null {
  if (!kind) return null;
  const before = scarTier(scars[kind]);
  scars[kind] = Math.min(scars[kind] + 1, SCARS_MAX);
  const tier = scarTier(scars[kind]);
  return tier > before ? { kind, tier } : null;
}

/** A scar's effect in words, at its tier (through t(): see SCAR_EFFECTS). */
export function scarNumbers(kind: Scar, tier: number): { seconds: number; percent: number } {
  const share = { stone: 0, flinch: FLINCH, burn: BURN, blast: BLAST, undertow: UNDERTOW }[kind];
  return { seconds: STONE_SECONDS * tier, percent: Math.round(share * tier * 100) };
}
