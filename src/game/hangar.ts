import type { ShipType } from '../assets';
import { msg } from '../i18n/i18n';

/**
 * The hangar: Solar Coins, the currency of the United Solar States, and what a Host buys with
 * them for its ships. Every point a Host scores in a round (solo or online) is paid out in
 * coins at its end. Each of the two interceptors has its upgrades, each in LEVELS steps: five
 * that change how the ship flies and fights, two that only change how it looks. A Host who has
 * bought every upgrade of both interceptors is given the third ship, the Sovereign: a trophy that
 * flies like a fully upgraded interceptor and looks like nothing else.
 *
 * Online, an upgrade counts for at most ONLINE_LEVEL of its steps, so a Host who has played a
 * lot meets newcomers almost on equal terms; the looks always count in full. What a Host owns
 * lives in its browser (see the privacy policy): a value no Host can own there is not used, and
 * the game names whoever put it there (see hangarFrom); online the cap holds for everyone anyway.
 */

/**
 * The ships of the Games a Host flies: the two interceptors, which have upgrades, the Sovereign
 * once earned, and the Magpie once the campaign is done (the campaign's own hull in its last
 * stage, see campaign/campaign).
 */
export type TournamentShip = ShipType;
export type HangarShip = Exclude<TournamentShip, 'sovereign' | 'magpie'>;
/** The trophies: ships that fly with every upgrade and wear every look, earned rather than bought. */
export const trophy = (ship: TournamentShip): ship is 'sovereign' | 'magpie' => ship === 'sovereign' || ship === 'magpie';
export const HANGAR_SHIPS: readonly HangarShip[] = ['human', 'alien'];

export type UpgradeId = 'radiators' | 'thrusters' | 'drive' | 'tubes' | 'plating' | 'neon' | 'flame';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  /** What each step does, in a few words. */
  note: string;
  /** Coins for each step, in order. */
  prices: readonly number[];
  /** Only the looks change. */
  looks: boolean;
}

/** Steps of every upgrade. */
export const LEVELS = 3;
/** Online every upgrade counts for at most this many of its steps. */
export const ONLINE_LEVEL = 1;
/** What a round's points are worth in coins: one each. */
export const COINS_PER_POINT = 1;

/**
 * The upgrades. What they do per step: radiators shed heat 15 % faster, the thrusters push and
 * turn 8 % harder, the main drive pushes 5 % harder (the speed limit stays), the torpedo tubes
 * hold one more torpedo at the first and at the third step, the plating takes 7 % of every
 * damage away. The neon trim lights a strip along both flanks, adds one across the stern, then
 * a running light (see Ship.outfit); the drive flame burns azure, violet, then white-hot.
 */
export const UPGRADES: readonly Upgrade[] = [
  { id: 'radiators', name: msg('Radiators'), note: msg('Your laser cools faster'), prices: [1000, 2500, 5000], looks: false },
  { id: 'thrusters', name: msg('Thrusters'), note: msg('Sharper turns and sidesteps'), prices: [1000, 2500, 5000], looks: false },
  { id: 'drive', name: msg('Main drive'), note: msg('More push, same speed limit'), prices: [1000, 2500, 5000], looks: false },
  { id: 'tubes', name: msg('Torpedo tubes'), note: msg('More torpedoes per ship'), prices: [1500, 3000, 6000], looks: false },
  { id: 'plating', name: msg('Plating'), note: msg('Every hit hurts less'), prices: [1500, 3000, 6000], looks: false },
  { id: 'neon', name: msg('Neon trim'), note: msg('Light strips along both flanks'), prices: [500, 1500, 3000], looks: true },
  { id: 'flame', name: msg('Drive flame'), note: msg('Azure, violet, white-hot'), prices: [500, 1500, 3000], looks: true },
];

/**
 * The gear: what a stock ship does not carry at all, bought for each interceptor on its own (the
 * Sovereign carries all of it). The hook (harpoon, cable and winch), the nanobots that mend the
 * drive and the thrusters (see ship/ship, NANO_WAIT), the self-destruct that takes a rival close
 * by along. Online it counts in full: an advantage on purpose, bought with the coins of rounds
 * played. The flight school lends its training clones the hook for its drills.
 */
export type GearId = 'hook' | 'nanobots' | 'selfDestruct';

export interface Gear {
  id: GearId;
  name: string;
  note: string;
  price: number;
}

export const GEAR: readonly Gear[] = [
  { id: 'hook', name: msg('Hook'), note: msg('Harpoon, cable and winch'), price: 2000 },
  { id: 'nanobots', name: msg('Nanobots'), note: msg('They mend the drive and the thrusters'), price: 3000 },
  { id: 'selfDestruct', name: msg('Self-destruct'), note: msg('Takes a rival close by along'), price: 4000 },
];

/** The self-destruct (see Game.selfDestructOwn): held this long (s) it goes off, and takes every ship within this (units, 60 m, about two ship lengths) along. */
export const SELF_DESTRUCT_HOLD = 1;
export const SELF_DESTRUCT_RADIUS = 1200;

/** What a Host owns: its coins, the steps of every upgrade of each interceptor, the gear of each, and the ship it flies. */
export interface Hangar {
  coins: number;
  levels: Record<HangarShip, Record<UpgradeId, number>>;
  gear: Record<HangarShip, Record<GearId, boolean>>;
  ship: TournamentShip;
}

/** How a ship flies and fights with its upgrades: multipliers on the stock ship, and torpedoes on top. */
export interface Perks {
  cooling: number;
  thrusters: number;
  drive: number;
  torpedoes: number;
  /** Share of every damage the hull takes. */
  damage: number;
  /** The looks: neon trim and drive flame, 0 (stock) to LEVELS. */
  neon: number;
  flame: number;
  /** The gear the ship carries (see GEAR). */
  hook: boolean;
  nanobots: boolean;
  selfDestruct: boolean;
  /** What every ship of the Games has and the campaign's scrap hull lacks until it is fitted (see campaign/campaign): the laser, the overdrive, the dodge. */
  laser: boolean;
  overdrive: boolean;
  dodge: boolean;
  /** The fins on its struts (see world/air, FINS): radiators, and in air what keeps it on its course. */
  fins: number;
  /** The laser's reach (a share of LASER_RANGE) and the heat of a shot (a share of a stock shot's): the campaign's mining cutter reaches short and runs hot. */
  laserReach: number;
  laserHeat: number;
  /** A look: plates welded over the thrusters' housings (the campaign's hull once Pim has welded its thrusters up, see campaign/campaign); only a hull that carries them shows them. */
  patched: boolean;
  /** A look: the depot's grey ground off and the scout's old livery under it (the campaign's hull from Scout Two on, see campaign/campaign); only a hull that carries it shows it. */
  stripped: boolean;
  /** The left flank without its armor panels (the campaign's hull until they are fitted): a beam from that side counts double (see Ship.laserHit). */
  bareFlank: boolean;
  /** A look: the campaign's hull in its last stage, the Magpie (from chapter 13 on, and the tournament's Magpie, see MAGPIE_LOOKS); only a hull that carries it shows it. */
  magpie: boolean;
}

export const STOCK: Readonly<Perks> = {
  cooling: 1,
  thrusters: 1,
  drive: 1,
  torpedoes: 0,
  damage: 1,
  neon: 0,
  flame: 0,
  hook: false,
  nanobots: false,
  selfDestruct: false,
  laser: true,
  overdrive: true,
  dodge: true,
  fins: 2,
  laserReach: 1,
  laserHeat: 1,
  patched: false,
  stripped: false,
  bareFlank: false,
  magpie: false,
};

/** How the Magpie looks wherever it flies in the Games: the campaign's hull in its last stage, welded, its old livery bared, both flanks closed. */
export const MAGPIE_LOOKS = { patched: true, stripped: true, bareFlank: false, magpie: true } as const satisfies Partial<Perks>;

/** A ship's perks with its hull's looks: the Magpie always in its last stage (see MAGPIE_LOOKS), whoever flies it. */
export const hullLooks = (type: ShipType, perks: Perks): Perks => (type === 'magpie' ? { ...perks, ...MAGPIE_LOOKS } : perks);

/**
 * A bot's ship: stock, with the hook and the nanobots, so a round's rivals hook and mend as a
 * Host who bought them does; no bot carries the self-destruct, since no bot decides when to blow
 * itself up.
 */
export const BOT_GEAR: Readonly<Perks> = { ...STOCK, hook: true, nanobots: true };

/** What each step of the radiators adds to their cooling (a share of the stock's). */
export const RADIATOR_STEP = 0.15;
/** What each step of the thrusters adds to their push (a share of the stock's). */
export const THRUSTER_STEP = 0.08;
/** What each step of the main drive adds to its push (a share of the stock's). */
export const DRIVE_STEP = 0.05;
/** What each step of the plating takes off every hit (a share of it). */
export const PLATING_STEP = 0.07;

/**
 * What other browsers are told of a ship's upgrades (a ship state's `lo`): the looks, and the
 * radiators' step (online at most ONLINE_LEVEL), so they heat it in a planet's air as its own
 * browser does (see view/reentry); 16 × the radiators' step + 4 × the neon trim's + the drive
 * flame's, at most MAX_LOOKS.
 */
export const packLooks = (perks: Perks) => Math.min(ONLINE_LEVEL, Math.round((perks.cooling - 1) / RADIATOR_STEP)) * 16 + perks.neon * 4 + perks.flame;
export const MAX_LOOKS = (ONLINE_LEVEL + 1) * 16 - 1;
/** Another browser's ship as `lo` tells it (see packLooks): stock but for its looks and radiators. */
export const unpackLooks = (looks: number, type: ShipType): Perks => hullLooks(type, { ...STOCK, cooling: 1 + RADIATOR_STEP * (looks >> 4), neon: (looks >> 2) & 3, flame: looks & 3 });

const noLevels = (): Record<UpgradeId, number> => Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])) as Record<UpgradeId, number>;

const noGear = (): Record<GearId, boolean> => Object.fromEntries(GEAR.map((gear) => [gear.id, false])) as Record<GearId, boolean>;

export const emptyHangar = (): Hangar => ({ coins: 0, levels: { human: noLevels(), alien: noLevels() }, gear: { human: noGear(), alien: noGear() }, ship: 'human' });

/**
 * The wallet: a Host holds at most what the hangar sells, every step of every upgrade and all the
 * gear of both interceptors (131,000 coins). More would buy nothing, so a round's payout stops
 * there, and the hangar says the wallet is full.
 */
export const WALLET =
  HANGAR_SHIPS.length * (UPGRADES.reduce((sum, upgrade) => sum + upgrade.prices.reduce((a, b) => a + b, 0), 0) + GEAR.reduce((sum, gear) => sum + gear.price, 0));

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** A hangar as the browser kept it, whether a hand put in what no Host can own, and what of it could not be read. */
export interface KeptHangar {
  hangar: Hangar;
  /** Coins beyond the wallet, a step below none or beyond the last, the Sovereign flown without both interceptors complete: only an edit puts these there. */
  cheated: boolean;
  /** What could not be read and counts as stock (the entry, its coins, its levels or one of them): a half-written entry or a format of another version, never a reason to call anyone a cheater. */
  unreadable: string[];
}

/**
 * Reads a hangar the browser kept (none: stock). What is missing or unreadable is stock; an
 * upgrade, a ship or a field this game does not know is passed over. Coins below the wallet are
 * the Host's business, whatever they are.
 */
export function hangarFrom(text: string | null): KeptHangar {
  const kept: KeptHangar = { hangar: emptyHangar(), cheated: false, unreadable: [] };
  if (text === null) return kept;
  const { hangar, unreadable } = kept;
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    entry = undefined;
  }
  if (!isRecord(entry)) {
    unreadable.push('entry');
    return kept;
  }
  const { coins, levels, ship } = entry;
  if (typeof coins === 'number') {
    if (coins > WALLET) kept.cheated = true;
    else hangar.coins = coins;
  } else if (coins !== undefined) unreadable.push('coins');
  if (isRecord(levels)) {
    for (const interceptor of HANGAR_SHIPS) {
      const steps = levels[interceptor];
      if (steps === undefined) continue;
      if (!isRecord(steps)) {
        unreadable.push(`levels.${interceptor}`);
        continue;
      }
      for (const upgrade of UPGRADES) {
        const level = steps[upgrade.id];
        if (level === undefined) continue;
        if (typeof level === 'number' && (level < 0 || level > LEVELS)) kept.cheated = true;
        else if (Number.isInteger(level)) hangar.levels[interceptor][upgrade.id] = level as number;
        else unreadable.push(`levels.${interceptor}.${upgrade.id}`);
      }
    }
  } else if (levels !== undefined) unreadable.push('levels');
  const { gear } = entry;
  if (isRecord(gear)) {
    // a hangar that keeps one set of gear (not one per interceptor) carries it on both
    const shared = GEAR.some(({ id }) => gear[id] !== undefined);
    for (const interceptor of HANGAR_SHIPS) {
      const pieces = shared ? gear : gear[interceptor];
      if (pieces === undefined) continue;
      if (!isRecord(pieces)) {
        unreadable.push(`gear.`);
        continue;
      }
      for (const { id } of GEAR) {
        if (pieces[id] === undefined) continue;
        if (typeof pieces[id] === 'boolean') hangar.gear[interceptor][id] = pieces[id];
        else unreadable.push(shared ? `gear.` : `gear..`);
      }
    }
  } else if (gear !== undefined) unreadable.push('gear');
  // the Magpie is the campaign's to give (see Game.magpieEarned), which the hangar does not hold
  if (ship === 'human' || ship === 'alien' || ship === 'magpie') hangar.ship = ship;
  // the Sovereign is judged only on steps read in full: an unreadable step is no reason to call anyone a cheater
  else if (ship === 'sovereign' && !kept.cheated) {
    if (sovereignEarned(hangar)) hangar.ship = ship;
    else if (unreadable.length === 0) kept.cheated = true;
  }
  return kept;
}

/** A hangar as no Host could own it put right before it is kept: coins within the wallet, every step within its upgrade, the Sovereign only when earned. */
export function keepable(hangar: Hangar): Hangar {
  hangar.coins = Math.min(hangar.coins, WALLET);
  for (const ship of HANGAR_SHIPS) for (const upgrade of UPGRADES) hangar.levels[ship][upgrade.id] = Math.max(0, Math.min(LEVELS, Math.floor(hangar.levels[ship][upgrade.id])));
  if (hangar.ship === 'sovereign' && !sovereignEarned(hangar)) hangar.ship = 'human';
  return hangar;
}

/** The price of the next step of an upgrade of a ship, or null when it is complete. */
export function nextPrice(hangar: Hangar, ship: HangarShip, id: UpgradeId): number | null {
  const level = hangar.levels[ship][id];
  return level < LEVELS ? UPGRADES.find((upgrade) => upgrade.id === id)!.prices[level] : null;
}

/** Buys the next step of an upgrade: true when the coins sufficed. */
export function buy(hangar: Hangar, ship: HangarShip, id: UpgradeId): boolean {
  const price = nextPrice(hangar, ship, id);
  if (price === null || price > hangar.coins) return false;
  hangar.coins -= price;
  hangar.levels[ship][id]++;
  return true;
}

/** Buys a piece of gear for an interceptor: true when the coins sufficed and it did not carry it yet. */
export function buyGear(hangar: Hangar, ship: HangarShip, id: GearId): boolean {
  const price = GEAR.find((gear) => gear.id === id)!.price;
  if (hangar.gear[ship][id] || price > hangar.coins) return false;
  hangar.coins -= price;
  hangar.gear[ship][id] = true;
  return true;
}

/** Every upgrade of an interceptor bought to its last step. */
export const complete = (hangar: Hangar, ship: HangarShip) => UPGRADES.every((upgrade) => hangar.levels[ship][upgrade.id] >= LEVELS);

/** The Sovereign is earned: both interceptors complete. */
export const sovereignEarned = (hangar: Hangar) => HANGAR_SHIPS.every((ship) => complete(hangar, ship));

/** Pays out a round: its points in coins (never negative), as far as the wallet holds them. Returns the coins paid. */
export function payOut(hangar: Hangar, points: number): number {
  const coins = Math.max(0, Math.min(Math.floor(points * COINS_PER_POINT), WALLET - hangar.coins));
  hangar.coins += coins;
  return coins;
}

/** Torpedoes a clone carries beyond the standard load for the steps of its tubes: one for every two. */
export const tubeTorpedoes = (level: number) => Math.ceil(level / 2);

/** How a ship flies with the steps it has (a trophy: every step), online at most ONLINE_LEVEL of each but the looks. */
export function perksOf(hangar: Hangar, ship: TournamentShip, online: boolean): Perks {
  const step = (id: UpgradeId) => {
    const level = trophy(ship) ? LEVELS : hangar.levels[ship][id];
    return online ? Math.min(level, ONLINE_LEVEL) : level;
  };
  const look = (id: UpgradeId) => (trophy(ship) ? LEVELS : hangar.levels[ship][id]);
  const gear = (id: GearId) => trophy(ship) || hangar.gear[ship][id];
  return hullLooks(ship, {
    ...STOCK,
    cooling: 1 + RADIATOR_STEP * step('radiators'),
    thrusters: 1 + THRUSTER_STEP * step('thrusters'),
    drive: 1 + DRIVE_STEP * step('drive'),
    torpedoes: tubeTorpedoes(step('tubes')),
    damage: 1 - PLATING_STEP * step('plating'),
    neon: look('neon'),
    flame: look('flame'),
    // the gear counts in full online too (see GEAR)
    hook: gear('hook'),
    nanobots: gear('nanobots'),
    selfDestruct: gear('selfDestruct'),
  });
}
