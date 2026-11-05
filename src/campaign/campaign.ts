import type { Drill } from '../game/school';
import { STOCK, type Perks } from '../game/hangar';
import { TORPEDOES } from '../game/torpedoes';
import { MISSIONS } from './missions';

/**
 * Lot 7731, the solo campaign (see docs/campaign/): the Host's state on the road to the Games,
 * the ship as far as it is fitted, and what a mission pays (its missions in campaign/missions,
 * each a run of drills on the flight school's machinery, see FlightSchool). Solo only: nothing of
 * it reaches an online round.
 */

export { MISSIONS };

/** The Bond the Host signed with the yard: what it owes (☉). The yard adds what it fits on credit. */
export const BOND = 25000;
/** The most the Bond can grow to with what the yard fits on credit (☉). */
export const BOND_MAX = 100_000;
/** The yard's cut of every payout while the Bond is unpaid (a share). */
export const YARD_CUT = 0.4;

/**
 * The hull in rack 7731 as the yard sold it: a fighter below any of the Games', its drive at
 * SCRAP_DRIVE of the thrust (a cracked bell), its thrusters at SCRAP_THRUSTERS, no laser, no
 * torpedoes, no overdrive and no dodge (the thrusters cannot take the overload), and one fin
 * of two: its radiators shed FIN_RADIATOR less (each fin is that share of them), and in air it
 * cannot hold its course (see world/air, finSpin). A ship for space only.
 */
export const SCRAP_DRIVE = 0.6;
export const SCRAP_THRUSTERS = 0.5;
/** The share of a ship's radiators each of its two fins is. */
export const FIN_RADIATOR = 0.25;
/**
 * The mining cutter (chapter 1): a laser that reaches CUTTER_REACH of the Games' (400 m) and puts
 * CUTTER_HEAT of a stock shot's heat into the radiators (35 % a shot), made for rock.
 */
export const CUTTER_REACH = 0.04;
export const CUTTER_HEAT = 1.75;

/** What the yard can fit to the hull. */
export type Part = 'cutter';
const PARTS: readonly Part[] = ['cutter'];

/** How the campaign's ship flies as far as it is fitted (see Perks). */
export function hullOf(campaign: Campaign): Perks {
  const hull: Perks = { ...STOCK, drive: SCRAP_DRIVE, thrusters: SCRAP_THRUSTERS, torpedoes: -TORPEDOES, laser: false, overdrive: false, dodge: false, fins: 1, cooling: 1 - FIN_RADIATOR };
  if (campaign.parts.includes('cutter')) Object.assign(hull, { laser: true, laserReach: CUTTER_REACH, laserHeat: CUTTER_HEAT });
  return hull;
}

export type MissionId = 'coldBoot' | 'lamplighter' | 'liveTarget' | 'canisterSweep' | 'cutter' | 'firstCut' | 'dockingLane';

export interface Mission {
  id: MissionId;
  /** Its name, shown over its drills as a flight school course's is. */
  name: string;
  drills: Drill[];
  /** What it pays the first time (☉, before the yard's cut). */
  pay: number;
  /** What it changes in the campaign the first time it is done: a part fitted, the Bond grown. */
  fit?: (campaign: Campaign) => void;
  /** Where its clones are printed and face, if not where the place's story starts (see ArenaProfile.start). */
  start?: { at: readonly [number, number, number]; toward: readonly [number, number, number] };
}

/** The campaign as the browser keeps it: the missions done, the drill reached in the running one, the wallet, what the Bond still asks, the parts fitted. */
export interface Campaign {
  done: MissionId[];
  /** The drill reached in the next mission (0: its start). */
  step: number;
  coins: number;
  bond: number;
  parts: Part[];
}

export const freshCampaign = (): Campaign => ({ done: [], step: 0, coins: 0, bond: BOND, parts: [] });

/** A campaign from what the browser kept; anything it cannot read is a fresh start, a mission or part it does not know is passed over. */
export function campaignFrom(text: string | null): Campaign {
  const fresh = freshCampaign();
  if (!text) return fresh;
  try {
    const kept = JSON.parse(text) as Partial<Campaign>;
    const ids = new Set<string>(MISSIONS.map((mission) => mission.id));
    const done = Array.isArray(kept.done) ? kept.done.filter((id): id is MissionId => typeof id === 'string' && ids.has(id)) : [];
    const parts = Array.isArray(kept.parts) ? PARTS.filter((part) => kept.parts!.includes(part)) : [];
    const number = (value: unknown, fallback: number, max: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback);
    return { done, step: number(kept.step, 0, 1000), coins: number(kept.coins, 0, 10_000_000), bond: number(kept.bond, BOND, BOND_MAX), parts };
  } catch {
    return fresh;
  }
}

/** The next mission of the story, or null once every mission built is done. */
export const nextMission = (campaign: Campaign): Mission | null => MISSIONS.find((mission) => !campaign.done.includes(mission.id)) ?? null;

/**
 * A mission done: it counts, what it fits is fitted, its pay less `fine` (what the Host lost on
 * the job: the tourists' hits of Live Target) goes to the Host's wallet less the yard's cut while
 * the Bond is unpaid (the cut pays the Bond off), and the next mission starts at its beginning.
 * Returns what the Host kept and what the yard took.
 */
export function complete(campaign: Campaign, mission: Mission, fine = 0): { kept: number; cut: number } {
  const first = !campaign.done.includes(mission.id);
  if (first) {
    campaign.done.push(mission.id);
    mission.fit?.(campaign);
  }
  campaign.step = 0;
  const pay = first ? Math.max(0, mission.pay - fine) : 0;
  const cut = Math.min(campaign.bond, Math.round(pay * YARD_CUT));
  campaign.bond -= cut;
  campaign.coins += pay - cut;
  return { kept: pay - cut, cut };
}
