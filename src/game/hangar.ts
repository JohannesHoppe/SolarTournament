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
 * lives in its browser (see the privacy policy): it can be cheated, and that costs nobody but
 * the cheater, since the online cap holds for everyone.
 */

/** The two interceptors, which have upgrades; every ship a Host can fly is a ShipType (the Sovereign too, once earned). */
export type HangarShip = Exclude<ShipType, 'sovereign'>;
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
  { id: 'tubes', name: msg('Torpedo tubes'), note: msg('More torpedoes per clone'), prices: [1500, 3000, 6000], looks: false },
  { id: 'plating', name: msg('Plating'), note: msg('Every hit hurts less'), prices: [1500, 3000, 6000], looks: false },
  { id: 'neon', name: msg('Neon trim'), note: msg('Light strips along both flanks'), prices: [500, 1500, 3000], looks: true },
  { id: 'flame', name: msg('Drive flame'), note: msg('Azure, violet, white-hot'), prices: [500, 1500, 3000], looks: true },
];

/** What a Host owns: its coins, the steps of every upgrade of each interceptor, and the ship it flies. */
export interface Hangar {
  coins: number;
  levels: Record<HangarShip, Record<UpgradeId, number>>;
  ship: ShipType;
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
}

export const STOCK: Readonly<Perks> = { cooling: 1, thrusters: 1, drive: 1, torpedoes: 0, damage: 1, neon: 0, flame: 0 };

const noLevels = (): Record<UpgradeId, number> => Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])) as Record<UpgradeId, number>;

export const emptyHangar = (): Hangar => ({ coins: 0, levels: { human: noLevels(), alien: noLevels() }, ship: 'human' });

/** A hangar as the browser kept it: whatever does not fit is dropped, nothing beyond the steps there are. */
export function parseHangar(text: string | null): Hangar {
  const hangar = emptyHangar();
  if (!text) return hangar;
  try {
    const kept = JSON.parse(text) as Partial<Hangar>;
    if (Number.isFinite(kept.coins) && kept.coins! >= 0) hangar.coins = Math.floor(kept.coins!);
    for (const ship of HANGAR_SHIPS) {
      for (const upgrade of UPGRADES) {
        const level = kept.levels?.[ship]?.[upgrade.id];
        if (Number.isInteger(level)) hangar.levels[ship][upgrade.id] = Math.max(0, Math.min(LEVELS, level!));
      }
    }
    if (kept.ship === 'human' || kept.ship === 'alien' || (kept.ship === 'sovereign' && sovereignEarned(hangar))) hangar.ship = kept.ship;
  } catch {
    // a broken entry starts the hangar over
  }
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

/** Every upgrade of an interceptor bought to its last step. */
export const complete = (hangar: Hangar, ship: HangarShip) => UPGRADES.every((upgrade) => hangar.levels[ship][upgrade.id] >= LEVELS);

/** The Sovereign is earned: both interceptors complete. */
export const sovereignEarned = (hangar: Hangar) => HANGAR_SHIPS.every((ship) => complete(hangar, ship));

/** Pays out a round: its points in coins (never negative). Returns the coins paid. */
export function payOut(hangar: Hangar, points: number): number {
  const coins = Math.max(0, Math.floor(points * COINS_PER_POINT));
  hangar.coins += coins;
  return coins;
}

/** Torpedoes a clone carries beyond the standard load for the steps of its tubes: one for every two. */
export const tubeTorpedoes = (level: number) => Math.ceil(level / 2);

/** How a ship flies with the steps it has (the Sovereign: every step), online at most ONLINE_LEVEL of each but the looks. */
export function perksOf(hangar: Hangar, ship: ShipType, online: boolean): Perks {
  const step = (id: UpgradeId) => {
    const level = ship === 'sovereign' ? LEVELS : hangar.levels[ship][id];
    return online ? Math.min(level, ONLINE_LEVEL) : level;
  };
  const look = (id: UpgradeId) => (ship === 'sovereign' ? LEVELS : hangar.levels[ship][id]);
  return {
    cooling: 1 + 0.15 * step('radiators'),
    thrusters: 1 + 0.08 * step('thrusters'),
    drive: 1 + 0.05 * step('drive'),
    torpedoes: tubeTorpedoes(step('tubes')),
    damage: 1 - 0.07 * step('plating'),
    neon: look('neon'),
    flame: look('flame'),
  };
}
