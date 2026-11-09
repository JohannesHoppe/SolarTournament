import { msg } from '../i18n/i18n';
import type { ArenaId } from '../world/arenas';

/**
 * Standing with the system's peoples (docs/campaign/STORY.md, "Standing"): the side jobs on the
 * job board (courier runs, ambushes, mining runs, smuggling runs and bounties) are flown for the
 * people of their place, who remember who flew for them. Each earns STANDING_FIRST the first time
 * and STANDING_AGAIN on every flight again; a bounty BOUNTY_STANDING. At the tiers of STANDING_TIERS
 * a people trusts the Host more: from Known on they hand out their smuggling runs and the second
 * bounty of a place, from Trusted on its third, and to Kin they sell a part of their own at
 * Rask's counter (see campaign/salvage, Salvage.kin).
 */
export type People = 'rockborn' | 'navy' | 'lanes' | 'circuit' | 'loose' | 'feeders';
export const PEOPLES: readonly People[] = ['rockborn', 'navy', 'lanes', 'circuit', 'loose', 'feeders'];

/** Whose a place is: the Rockborn's claims and capital and their depots on the Long Ladder, the Navy's towns, the crews of the Jupiter lanes, the Circuit's fans round Saturn, the Loose of the outer dark, the Feeders. */
export const PLACE_PEOPLE: Partial<Record<ArenaId, People>> = {
  rheasilvia: 'rockborn',
  occator: 'rockborn',
  haumea: 'rockborn',
  eris: 'rockborn',
  phobos: 'navy',
  triton: 'navy',
  callisto: 'lanes',
  europa: 'lanes',
  io: 'lanes',
  ganymede: 'lanes',
  titan: 'circuit',
  enceladus: 'circuit',
  iapetus: 'circuit',
  miranda: 'loose',
  pluto: 'loose',
  lantern: 'feeders',
  granary: 'feeders',
};

/** What the job board calls each people. */
export const PEOPLE_NAMES: Record<People, string> = { rockborn: msg('the Rockborn'), navy: msg('the Navy towns'), lanes: msg('the lane crews'), circuit: msg('the Circuit'), loose: msg('the Loose'), feeders: msg('the Feeders') };

/** Standing for a side job the first time, again, and for a bounty (each time it is first taken). */
export const STANDING_FIRST = 3;
export const STANDING_AGAIN = 1;
export const BOUNTY_STANDING = 4;
/** From how much standing a people counts the Host as Known, Trusted and Kin. */
export const STANDING_TIERS: readonly number[] = [6, 15, 30];
export const STANDING_NAMES: readonly string[] = [msg('Stranger'), msg('Known'), msg('Trusted'), msg('Kin')];
export const KNOWN = 1;
export const TRUSTED = 2;
export const KIN = 3;

/** The tier a people holds the Host at (0 Stranger to 3 Kin). */
export const standingTier = (points: number) => STANDING_TIERS.filter((from) => points >= from).length;

export type Standing = Record<People, number>;
export const freshStanding = (): Standing => ({ rockborn: 0, navy: 0, lanes: 0, circuit: 0, loose: 0, feeders: 0 });

const STANDING_MAX = 100_000;

/** Standing as the browser kept it: a value it cannot read is none. */
export function standingFrom(kept: unknown): Standing {
  const standing = freshStanding();
  if (typeof kept !== 'object' || kept === null) return standing;
  for (const people of PEOPLES) {
    const value = (kept as Record<string, unknown>)[people];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) standing[people] = Math.min(Math.floor(value), STANDING_MAX);
  }
  return standing;
}

/** Standing earned at a place: added to its people, the tier newly reached returned (or null). */
export function earnStanding(standing: Standing, place: ArenaId, points: number): { people: People; tier: number } | null {
  const people = PLACE_PEOPLE[place];
  if (!people || points <= 0) return null;
  const before = standingTier(standing[people]);
  standing[people] = Math.min(standing[people] + points, STANDING_MAX);
  const tier = standingTier(standing[people]);
  return tier > before ? { people, tier } : null;
}

/** The tier the Host holds at a place's people (0 where the place has none). */
export const tierAt = (standing: Standing, place: ArenaId) => {
  const people = PLACE_PEOPLE[place];
  return people ? standingTier(standing[people]) : 0;
};
