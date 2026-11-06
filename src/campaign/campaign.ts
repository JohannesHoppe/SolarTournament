import type { Drill } from '../game/school';
import type { Mood } from '../music/radio';
import type { Flavor } from '../music/songs';
import type { ArenaId } from '../world/arenas';
import { PLATING_STEP, RADIATOR_STEP, STOCK, type Perks } from '../game/hangar';
import { TORPEDOES } from '../game/torpedoes';
import { msg } from '../i18n/i18n';
import { MISSIONS } from './missions';

/**
 * Lot 7731, the solo campaign (see docs/campaign/): the Host's state on the road to the Games,
 * the ship as far as it is fitted, and what a mission pays (its missions in campaign/missions,
 * each a run of drills on the flight school's machinery, see FlightSchool). Solo only: nothing of
 * it reaches an online round.
 */

export { MISSIONS };

/** The debt the Host signed with the yard: what it owes (☉). The yard adds what it fits on credit. */
export const BOND = 25000;
/** The most the debt can grow to with what the yard fits on credit (☉). */
export const BOND_MAX = 100_000;
/** The yard's cut of every payout while the debt is unpaid (a share). */
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
/** The thrusters once Pim has welded them (chapter 1): PATCHED_THRUSTERS of a stock ship's. */
export const PATCHED_THRUSTERS = 0.7;
/** The share of a ship's radiators each of its two fins is. */
export const FIN_RADIATOR = 0.25;
/**
 * The mining cutter (chapter 1): a laser that reaches CUTTER_REACH of the Games' (400 m) and puts
 * CUTTER_HEAT of a stock shot's heat into the radiators (35 % a shot), made for rock.
 */
export const CUTTER_REACH = 0.04;
export const CUTTER_HEAT = 1.75;

/** The Navy surplus laser bought in Occator's market (chapter 3): the Games' own laser, its price (☉), what the wallet holds of it paid, the rest put on the debt. */
export const LASER_PRICE = 6000;
/** The drive's overhaul at Occator (chapter 3): a new bell of Rockborn make for the cracked one, the main drive to stock; its price (☉), paid as the laser's is. */
export const OVERHAUL_PRICE = 1600;
/** The armor panels over the bare left flank (chapter 4), at Phobos's Navy yards: their price (☉), paid as the laser's is. */
export const PANELS_PRICE = 1500;
/** Radiators I (chapter 5), from a tug yard of the Jupiter lanes: the hangar's first step of the radiators (see RADIATOR_STEP), its price (☉), paid as the laser's is. */
export const RADIATORS_PRICE = 1000;
/** Plating I (chapter 6), at Europa: the hangar's first step of the plating (see PLATING_STEP), its price (☉), paid as the laser's is. */
export const PLATING_PRICE = 1500;

/** What the yard can fit to the hull: the mining cutter, Pim's patch on the thrusters, her rebuilt thrusters, the military laser, the drive's overhaul, the armor panels, the radiators' and the plating's first steps; and the depot's grey ground off it (Scout Two). */
export type Part = 'cutter' | 'patch' | 'thrusters' | 'laser' | 'stripped' | 'drive' | 'panels' | 'radiators' | 'plating';
const PARTS: readonly Part[] = ['cutter', 'patch', 'thrusters', 'laser', 'stripped', 'drive', 'panels', 'radiators', 'plating'];
/** What the job board calls each part fitted. */
export const PART_NAMES: Record<Part, string> = { cutter: msg('the mining cutter'), patch: msg('the thrusters welded up'), thrusters: msg('the thrusters rebuilt to stock'), laser: msg('the military laser'), stripped: msg('the old livery, the paint ground off'), drive: msg('the main drive overhauled to stock'), panels: msg('armor panels on the bare flank'), radiators: msg('radiators of the first grade'), plating: msg('plating of the first grade') };

/**
 * Nicole's modules (docs/campaign/STORY.md, "Nicole's restoration"): the pieces of the HUD a
 * salvaged flight computer lacks until she installs them, each with a chapter of the story.
 * Navigation (the markers, the course marker, where the flight crosses a ring's plane), the
 * autopilot, the brake and the impact warning are hers from the prologue on, so no module stands
 * for them. Targeting: the crosshair turning orange over a hull, the ships' marks and names.
 * Racing line: the dashed line. Radar: the radar sphere. Threat: TRACKED, LOCKED, ON YOUR TAIL and
 * TORPEDO INBOUND with its countdown. Wells: the escape gauge and the orbit readout.
 */
export type Module = 'targeting' | 'racingLine' | 'radar' | 'threat' | 'wells';
const MODULES: readonly Module[] = ['targeting', 'racingLine', 'radar', 'threat', 'wells'];
/** What the job board calls each of Nicole's modules. */
export const MODULE_NAMES: Record<Module, string> = { targeting: msg('targeting'), racingLine: msg('racing line'), radar: msg('radar'), threat: msg('threat'), wells: msg('wells') };

/** How the campaign's ship flies as far as it is fitted (see Perks). */
export function hullOf(campaign: Campaign): Perks {
  const hull: Perks = { ...STOCK, drive: SCRAP_DRIVE, thrusters: SCRAP_THRUSTERS, torpedoes: -TORPEDOES, laser: false, overdrive: false, dodge: false, fins: 1, cooling: 1 - FIN_RADIATOR, bareFlank: true };
  if (campaign.parts.includes('cutter')) Object.assign(hull, { laser: true, laserReach: CUTTER_REACH, laserHeat: CUTTER_HEAT });
  if (campaign.parts.includes('patch')) Object.assign(hull, { thrusters: PATCHED_THRUSTERS, patched: true });
  // Pim's thruster parts from the Peak Run: the thrusters a stock ship's, strong enough for the dodge
  if (campaign.parts.includes('thrusters')) Object.assign(hull, { thrusters: STOCK.thrusters, dodge: true });
  // the Navy surplus laser in place of the cutter: the Games' own
  if (campaign.parts.includes('laser')) Object.assign(hull, { laser: true, laserReach: STOCK.laserReach, laserHeat: STOCK.laserHeat });
  if (campaign.parts.includes('stripped')) hull.stripped = true;
  // the cracked bell replaced: the drive pushes as a stock ship's
  if (campaign.parts.includes('drive')) hull.drive = STOCK.drive;
  // the left flank closed with armor panels
  if (campaign.parts.includes('panels')) hull.bareFlank = false;
  // the radiators a step up, the missing fin's share still short
  if (campaign.parts.includes('radiators')) hull.cooling += RADIATOR_STEP;
  // the plating a step up: every hit hurts less
  if (campaign.parts.includes('plating')) hull.damage -= PLATING_STEP;
  return hull;
}

export type MissionId = 'coldBoot' | 'lamplighter' | 'liveTarget' | 'canisterSweep' | 'cutter' | 'firstCut' | 'dockingLane' | 'rheasilvia' | 'claimSurvey' | 'cutAndHaul' | 'sawBrothers' | 'peakRun' | 'practiceLog' | 'occator' | 'surplus' | 'oreBarge' | 'repoMen' | 'wallRun' | 'scoutTwo' | 'overhaul' | 'stickneyGrand' | 'debtDay' | 'grooveShoot' | 'armorPanels' | 'pilotEpisode' | 'iceRun' | 'valhallaSprint' | 'callistoEcho' | 'radiators' | 'dose' | 'underTheLineae' | 'quietMan' | 'plating';

export interface Mission {
  id: MissionId;
  /** Its name, shown over its drills as a flight school course's is. */
  name: string;
  drills: Drill[];
  /** What it pays the first time (☉, before the yard's cut). */
  pay: number;
  /** The ratings it earns the first time (see RANKS), or what a choice made in it earns; the yard takes no cut of them. */
  ratings?: number | ((campaign: Campaign) => number);
  /** What it changes in the campaign the first time it is done: a part fitted, the debt grown. */
  fit?: (campaign: Campaign) => void;
  /** Its music (see Mood in src/music/radio.ts) where a drill or a scene asks for none of its own; calm without. */
  music?: Mood;
  /** Where its clones are printed and face, if not where the place's story starts (see ArenaProfile.start). */
  start?: { at: readonly [number, number, number]; toward: readonly [number, number, number] };
}

/**
 * The sound of each place of the campaign, chosen by hand (docs/campaign/STORY.md, Music): the
 * flavor its calm music and its fights are played in. The Boneyard drones warm and low over the
 * racks (drive's pedal bass) and fights in the clang of the yard (industrial); Rheasilvia travels
 * on the steady pulse of the ore lines (motorik) and fights the claim-jumpers in acid; Occator,
 * the Rockborn's capital, hums with the chords of a city at night (rave) and fights in schranz.
 */
export const PLACE_MUSIC: Partial<Record<ArenaId, { calm: Flavor; fight: Flavor }>> = {
  boneyard: { calm: 'drive', fight: 'industrial' },
  rheasilvia: { calm: 'motorik', fight: 'acid' },
  occator: { calm: 'rave', fight: 'schranz' },
  callisto: { calm: 'ebm', fight: 'hard' },
};

/**
 * The ranks of the feeds' attention (docs/campaign/STORY.md, "Rating ranks"): from how many
 * ratings on a pilot holds each. Ratings are earned by missions and never spent; the story
 * gives the last rank, Chosen, and no number does.
 */
export const RANKS: readonly { name: string; from: number }[] = [
  { name: msg('Unrated'), from: 0 },
  // seen in a crowd shot
  { name: msg('Background'), from: 50 },
  { name: msg('Local Feed'), from: 250 },
  { name: msg('Regional Feed'), from: 1200 },
  { name: msg('Sponsored'), from: 3500 },
  { name: msg('Prime Time'), from: 7000 },
  { name: msg('Contender'), from: 12000 },
];

/** The rank a pilot holds with these ratings (its English name, see RANKS). */
export const rankOf = (ratings: number): string => RANKS.reduce((rank, step) => (ratings >= step.from ? step.name : rank), RANKS[0].name);

/** The campaign as the browser keeps it: the missions done, the drill reached in the running one, the wallet, what the debt still asks, the ratings, the parts fitted, Nicole's modules installed. */
export interface Campaign {
  done: MissionId[];
  /** The drill reached in the next mission (0: its start). */
  step: number;
  coins: number;
  bond: number;
  ratings: number;
  parts: Part[];
  modules: Module[];
  /** The debt bought by an anonymous benefactor (Debt Day, chapter 4): from then on nobody takes a cut, and the debt stands as it is. */
  held: boolean;
  /** What the Host chose where the story asks (see Choice), for what remembers it later. */
  choices: Choice[];
}

/** The choices the story asks of the Host: the Quiet Man let go when he turned away (The Quiet Man, chapter 6). */
export type Choice = 'quietManSpared';
const CHOICES: readonly Choice[] = ['quietManSpared'];

export const freshCampaign = (): Campaign => ({ done: [], step: 0, coins: 0, bond: BOND, ratings: 0, parts: [], modules: [], held: false, choices: [] });

/** A campaign from what the browser kept; anything it cannot read is a fresh start, a mission or part it does not know is passed over. */
export function campaignFrom(text: string | null): Campaign {
  const fresh = freshCampaign();
  if (!text) return fresh;
  try {
    const kept = JSON.parse(text) as Partial<Campaign>;
    const ids = new Set<string>(MISSIONS.map((mission) => mission.id));
    const done = Array.isArray(kept.done) ? kept.done.filter((id): id is MissionId => typeof id === 'string' && ids.has(id)) : [];
    const parts = Array.isArray(kept.parts) ? PARTS.filter((part) => kept.parts!.includes(part)) : [];
    const modules = Array.isArray(kept.modules) ? MODULES.filter((module) => kept.modules!.includes(module)) : [];
    const choices = Array.isArray(kept.choices) ? CHOICES.filter((choice) => kept.choices!.includes(choice)) : [];
    const number = (value: unknown, fallback: number, max: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback);
    return { done, step: number(kept.step, 0, 1000), coins: number(kept.coins, 0, 10_000_000), bond: number(kept.bond, BOND, BOND_MAX), ratings: number(kept.ratings, 0, 1_000_000), parts, modules, held: kept.held === true, choices };
  } catch {
    return fresh;
  }
}

/** The next mission of the story, or null once every mission built is done. */
export const nextMission = (campaign: Campaign): Mission | null => MISSIONS.find((mission) => !campaign.done.includes(mission.id)) ?? null;

/**
 * A mission done: it counts, what it fits is fitted, its pay less `fine` (what the Host lost on
 * the job: the tourists' hits of Live Target) goes to the Host's wallet less the yard's cut while
 * the debt is unpaid (the cut pays the debt off), its ratings count in full, and the next
 * mission starts at its beginning. Returns what the Host kept, what the yard took, the ratings
 * earned and the rank reached, if the ratings raised it.
 */
/** The ratings a mission earns the first time, for the choices the campaign holds. */
export const ratingsOf = (mission: Mission, campaign: Campaign): number => (typeof mission.ratings === 'function' ? mission.ratings(campaign) : (mission.ratings ?? 0));

export function complete(campaign: Campaign, mission: Mission, fine = 0): { kept: number; cut: number; ratings: number; rank: string | null } {
  const first = !campaign.done.includes(mission.id);
  if (first) {
    campaign.done.push(mission.id);
    mission.fit?.(campaign);
  }
  campaign.step = 0;
  const pay = first ? Math.max(0, mission.pay - fine) : 0;
  // the debt's holder takes its cut until the benefactor holds the debt
  const cut = campaign.held ? 0 : Math.min(campaign.bond, Math.round(pay * YARD_CUT));
  campaign.bond -= cut;
  campaign.coins += pay - cut;
  const ratings = first ? ratingsOf(mission, campaign) : 0;
  const before = rankOf(campaign.ratings);
  campaign.ratings += ratings;
  const rank = rankOf(campaign.ratings);
  return { kept: pay - cut, cut, ratings, rank: rank !== before ? rank : null };
}
