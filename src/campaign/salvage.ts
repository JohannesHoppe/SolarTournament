import { msg } from '../i18n/i18n';
import { Randomizer } from '../random';
import type { Perks } from '../game/hangar';
import { KIN, standingTier, type People, type Standing } from './standing';

/**
 * Rask's counter (docs/campaign/STORY.md, "Rask's counter"): parts pulled from the racks' dead
 * fighters, each with its quirk, a gain bought with a loss. After every job flown (the first time
 * or again) the counter shows SALVAGE_OFFER others, picked from SALVAGE by the jobs flown so far, so
 * every browser sees the same counter after the same jobs. A part goes into its slot, one a slot;
 * one bought for a slot already taken replaces the other, which goes back to the racks for
 * nothing. A part needs what it is fitted to (a laser for a coil, a tube for a rack). Paid from
 * the wallet alone, never on the debt. Beside them, each people that counts the Host as Kin sells
 * its own part there (see kinOffer). Only in the campaign: nothing of it reaches a tournament's
 * hull.
 */
export type Slot = 'coil' | 'drive' | 'thrusters' | 'plating' | 'radiators' | 'rack';

export type SalvageId = 'navyCoil' | 'coldCoil' | 'hotInjector' | 'tugBell' | 'tugNozzles' | 'loosePuffers' | 'tallyPlate' | 'wallSlab' | 'iceFins' | 'feederSails' | 'cellRack' | 'crackedMagazine' | 'rockbornLens' | 'navyPlate' | 'laneBell' | 'circuitPuffers' | 'looseRack' | 'feederFins';

/** What a part changes on the hull: shares added to the hull's (see Perks; damage is the share of a hit taken, so less is better). */
export interface Salvage {
  id: SalvageId;
  name: string;
  /** Where it came from, as Rask tells it. */
  story: string;
  slot: Slot;
  /** What the hull must have fitted before it takes the part: a laser, a drive overhauled, the thrusters rebuilt, the panels, radiators of a grade, a tube. */
  needs: 'laser' | 'drive' | 'thrusters' | 'panels' | 'radiators' | 'tube';
  price: number;
  change: Partial<Record<'laserReach' | 'laserHeat' | 'drive' | 'thrusters' | 'damage' | 'cooling' | 'torpedoes', number>>;
  /** A people's own part, sold only to those it counts as Kin and always on the counter for them (see campaign/standing): never among the racks' turning parts. */
  kin?: People;
}

export const SALVAGE: readonly Salvage[] = [
  { id: 'navyCoil', name: msg('a dead Navy pilot’s laser coil'), story: msg('Reaches farther. Runs hotter. So did he.'), slot: 'coil', needs: 'laser', price: 900, change: { laserReach: 0.1, laserHeat: 0.25 } },
  { id: 'coldCoil', name: msg('a racer’s cold coil'), story: msg('Cool as a corpse, and about as far-reaching.'), slot: 'coil', needs: 'laser', price: 800, change: { laserHeat: -0.2, laserReach: -0.08 } },
  { id: 'hotInjector', name: msg('a racer’s cracked injector'), story: msg('Pushes like a dream. Cooks the radiators like a nightmare.'), slot: 'drive', needs: 'drive', price: 1200, change: { drive: 0.06, cooling: -0.06 } },
  { id: 'tugBell', name: msg('an ice tug’s slow bell'), story: msg('Slow off the line, but the nozzles around it kick.'), slot: 'drive', needs: 'drive', price: 700, change: { drive: -0.03, thrusters: 0.06 } },
  { id: 'tugNozzles', name: msg('ice-tug thruster nozzles'), story: msg('Built to shove a hundred tonnes of ice. Shoves you too.'), slot: 'thrusters', needs: 'thrusters', price: 900, change: { thrusters: 0.08, drive: -0.03 } },
  { id: 'loosePuffers', name: msg('the Loose’s hot puffers'), story: msg('Stolen twice before me. Quick, and they run hot.'), slot: 'thrusters', needs: 'thrusters', price: 1400, change: { thrusters: 0.12, cooling: -0.05 } },
  { id: 'tallyPlate', name: msg('Tallyman armor scrap'), story: msg('Heavy. The repo men never had to run.'), slot: 'plating', needs: 'panels', price: 1000, change: { damage: -0.06, thrusters: -0.05 } },
  { id: 'wallSlab', name: msg('a slab of the Solar Wall'), story: msg('Fell off a searchlight mount. Nobody asked where.'), slot: 'plating', needs: 'panels', price: 1500, change: { damage: -0.1, drive: -0.05 } },
  { id: 'iceFins', name: msg('ice-tug radiator fins'), story: msg('Shed heat like ice sheds water. Thin as foil, though.'), slot: 'radiators', needs: 'radiators', price: 900, change: { cooling: 0.08, damage: 0.03 } },
  { id: 'feederSails', name: msg('a Feeder’s heat sails'), story: msg('From the dark out past Pluto. Wide, and they drag.'), slot: 'radiators', needs: 'radiators', price: 1500, change: { cooling: 0.12, thrusters: -0.04 } },
  { id: 'cellRack', name: msg('a hollow-cell torpedo rack'), story: msg('One more fish in the tube. Warms the hull, though.'), slot: 'rack', needs: 'tube', price: 1800, change: { torpedoes: 1, cooling: -0.06 } },
  { id: 'crackedMagazine', name: msg('a cracked magazine'), story: msg('Holds one more. Holds it badly.'), slot: 'rack', needs: 'tube', price: 1300, change: { torpedoes: 1, damage: 0.05 } },
  { id: 'rockbornLens', name: msg('a Rockborn cutter’s lens'), story: msg('Ground by hand in Occator for cutting rock at range. They do not sell it to strangers.'), slot: 'coil', needs: 'laser', price: 2500, change: { laserReach: 0.12, laserHeat: 0.05 }, kin: 'rockborn' },
  { id: 'navyPlate', name: msg('Navy hull plate, signed out to nobody'), story: msg('Off a cutter that was never built. The quartermaster owes you.'), slot: 'plating', needs: 'panels', price: 3000, change: { damage: -0.12, thrusters: -0.02 }, kin: 'navy' },
  { id: 'laneBell', name: msg('a lane racer’s drive bell'), story: msg('The crews race them on rest days, for beer. Now you are crew.'), slot: 'drive', needs: 'drive', price: 3000, change: { drive: 0.08, cooling: -0.02 }, kin: 'lanes' },
  { id: 'circuitPuffers', name: msg('the Circuit’s pit-crew thrusters'), story: msg('Tuned in the pits of Titan. The fans chipped in.'), slot: 'thrusters', needs: 'thrusters', price: 3000, change: { thrusters: 0.14, cooling: -0.02 }, kin: 'circuit' },
  { id: 'looseRack', name: msg('the Loose’s harpoon rack'), story: msg('They rebuilt it for torpedoes. For family, they said.'), slot: 'rack', needs: 'tube', price: 3500, change: { torpedoes: 1, cooling: -0.02 }, kin: 'loose' },
  { id: 'feederFins', name: msg('the Feeders’ ice fins'), story: msg('Grown in the dark past Pluto. They shed heat like a comet does.'), slot: 'radiators', needs: 'radiators', price: 3000, change: { cooling: 0.15, thrusters: -0.01 }, kin: 'feeders' },
];

export const salvageById = (id: string): Salvage | undefined => SALVAGE.find((part) => part.id === id);

/** Parts on the counter at once. */
export const SALVAGE_OFFER = 3;

/** The counter after `flown` jobs: SALVAGE_OFFER parts of those the hull can take and has not fitted, picked by the jobs flown (the same for the same jobs). */
export function salvageOffer(flown: number, takes: (part: Salvage) => boolean, fitted: readonly SalvageId[]): Salvage[] {
  const open = SALVAGE.filter((part) => !part.kin && takes(part) && !fitted.includes(part.id));
  const r = new Randomizer(7731 + flown * 101);
  const offer: Salvage[] = [];
  while (offer.length < SALVAGE_OFFER && open.length) offer.push(open.splice(Math.floor(r.nextFloat() * open.length), 1)[0]);
  return offer;
}

/** The peoples' own parts on the counter: each of a people that counts the Host as Kin, that the hull can take and has not fitted. */
export const kinOffer = (standing: Standing, takes: (part: Salvage) => boolean, fitted: readonly SalvageId[]): Salvage[] =>
  SALVAGE.filter((part) => part.kin && standingTier(standing[part.kin]) >= KIN && takes(part) && !fitted.includes(part.id));

/** The parts fitted after `id` is bought: it takes its slot, the part there before goes. */
export const fitSalvage = (fitted: readonly SalvageId[], id: SalvageId): SalvageId[] => [...fitted.filter((other) => salvageById(other)!.slot !== salvageById(id)!.slot), id];

/** What the fitted parts do to the campaign's hull (see hullOf). */
export function salvageHull(hull: Perks, fitted: readonly SalvageId[]) {
  for (const id of fitted) {
    const part = salvageById(id);
    if (!part) continue;
    for (const [key, value] of Object.entries(part.change) as [keyof Salvage['change'], number][]) hull[key] += value;
  }
}

/** Parts as the browser kept them: those it knows, one a slot (the last kept wins). */
export function salvageFrom(kept: unknown): SalvageId[] {
  if (!Array.isArray(kept)) return [];
  let fitted: SalvageId[] = [];
  for (const id of kept) if (typeof id === 'string' && salvageById(id)) fitted = fitSalvage(fitted, id as SalvageId);
  return fitted;
}
