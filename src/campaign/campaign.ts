import { msg } from '../i18n/i18n';
import { CAMPAIGN } from '../music/lines';
import { DRILL, saying, type Drill } from '../game/school';

/**
 * Lot 7731, the solo campaign (see docs/campaign/): the Host's state on the road to the Games and
 * its missions, each a run of drills on the flight school's machinery (see FlightSchool). Solo
 * only: nothing of it reaches an online round.
 */

/** The Bond the Host signed with the yard: what it owes (☉). */
export const BOND = 25000;
/** The yard's cut of every payout while the Bond is unpaid (a share). */
export const YARD_CUT = 0.4;

export type MissionId = 'coldBoot';

export interface Mission {
  id: MissionId;
  /** Its name, shown over its drills as a flight school course's is. */
  name: string;
  drills: Drill[];
  /** What it pays the first time (☉, before the yard's cut). */
  pay: number;
}

/** A drill of the flight school with Nicole's campaign line instead of the school's, once, without the school's praise. */
const told = (drill: Drill, line: string): Drill => ({ ...drill, line, praise: undefined, reps: 1, repLine: undefined });

/** The missions in the order the story runs them. */
export const MISSIONS: readonly Mission[] = [
  {
    // the first link into the hull in rack 7731, and out of the rack to the yard office's beacon
    id: 'coldBoot',
    name: msg('Cold Boot'),
    drills: [saying(CAMPAIGN.coldBoot), told(DRILL.turn, CAMPAIGN.coldBootTurn), told(DRILL.drive, CAMPAIGN.coldBootDrive), told(DRILL.brake, CAMPAIGN.coldBootBrake), told(DRILL.stopAt, CAMPAIGN.coldBootStop), saying(CAMPAIGN.coldBootDone)],
    pay: 0,
  },
];

/** The campaign as the browser keeps it: the missions done, the drill reached in the running one, the wallet and what the Bond still asks. */
export interface Campaign {
  done: MissionId[];
  /** The drill reached in the next mission (0: its start). */
  step: number;
  coins: number;
  bond: number;
}

export const freshCampaign = (): Campaign => ({ done: [], step: 0, coins: 0, bond: BOND });

/** A campaign from what the browser kept; anything it cannot read is a fresh start, a mission it does not know is passed over. */
export function campaignFrom(text: string | null): Campaign {
  const fresh = freshCampaign();
  if (!text) return fresh;
  try {
    const kept = JSON.parse(text) as Partial<Campaign>;
    const ids = new Set<string>(MISSIONS.map((mission) => mission.id));
    const done = Array.isArray(kept.done) ? kept.done.filter((id): id is MissionId => typeof id === 'string' && ids.has(id)) : [];
    const number = (value: unknown, fallback: number, max: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback);
    return { done, step: number(kept.step, 0, 1000), coins: number(kept.coins, 0, 10_000_000), bond: number(kept.bond, BOND, BOND) };
  } catch {
    return fresh;
  }
}

/** The next mission of the story, or null once every mission built is done. */
export const nextMission = (campaign: Campaign): Mission | null => MISSIONS.find((mission) => !campaign.done.includes(mission.id)) ?? null;

/**
 * A mission done: it counts, its pay goes to the Host's wallet less the yard's cut while the
 * Bond is unpaid (the cut pays the Bond off), and the next mission starts at its beginning.
 * Returns what the Host kept and what the yard took.
 */
export function complete(campaign: Campaign, mission: Mission): { kept: number; cut: number } {
  const first = !campaign.done.includes(mission.id);
  if (first) campaign.done.push(mission.id);
  campaign.step = 0;
  const pay = first ? mission.pay : 0;
  const cut = Math.min(campaign.bond, Math.round(pay * YARD_CUT));
  campaign.bond -= cut;
  campaign.coins += pay - cut;
  return { kept: pay - cut, cut };
}
