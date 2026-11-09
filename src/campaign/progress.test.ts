import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AGAIN_SHARE, BLACK_PRINT_PRICE, BOND, BOND_MAX, buySalvage, campaignFrom, complete, counterOf, flownAgain, freshCampaign, hullOf, master, MEDAL_SHARE, MISSIONS, PRINT_PRICE, printClone, sideTrips, YARD_CUT, placeBet, settleBet, buyRumor, pitNight, nextMission } from './campaign';
import { BET_ODDS, PIT_PURSE, pitWave, RUMOR_PRICE, RUMORS } from './gullet';
import { FLINCH, BURN, scar, SCAR_TIERS, scarOf, scarTier, stoneSeconds, STONE_SECONDS } from './scars';
import { fitSalvage, SALVAGE, salvageOffer, SALVAGE_OFFER } from './salvage';
import { KIN, PLACE_PEOPLE, STANDING_FIRST, STANDING_TIERS, standingTier } from './standing';
import { BOUNTY_TIERS, COURIER_PLACES, patrolsAt, SMUGGLE_ASIDE, SMUGGLE_CIRCLE, SMUGGLE_SIGHT, smuggleLane, wantedName } from './missions';
import { SILENT_RANGE } from '../ship/ship';
import { arenaById } from '../world/arenas';
import { testField } from '../test/field';
import { DETAIL } from '../world/rocks';

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

describe('scars', () => {
  it('count each death by what killed it, deepen at their tiers, and change the campaign’s hull only', () => {
    expect(scarOf('rock', 'gate')).toBe('stone');
    expect(scarOf(null, 'laser')).toBe('flinch');
    expect(scarOf(null, 'torpedo')).toBe('blast');
    expect(scarOf('air', undefined)).toBe('burn');
    expect(scarOf('well', undefined)).toBe('undertow');
    expect(scarOf('space', undefined)).toBeNull();
    const campaign = freshCampaign();
    const plain = hullOf(campaign);
    const tiers: number[] = [];
    for (let k = 0; k < SCAR_TIERS[SCAR_TIERS.length - 1] + 5; k++) {
      const deeper = scar(campaign.scars, 'flinch');
      if (deeper) tiers.push(k + 1);
    }
    expect(tiers).toEqual(SCAR_TIERS);
    expect(scarTier(campaign.scars.flinch)).toBe(3);
    expect(hullOf(campaign).damage).toBeCloseTo(plain.damage * (1 - 3 * FLINCH));
    for (let k = 0; k < SCAR_TIERS[0]; k++) scar(campaign.scars, 'burn');
    expect(hullOf(campaign).cooling).toBeCloseTo(plain.cooling + BURN);
    for (let k = 0; k < SCAR_TIERS[1]; k++) scar(campaign.scars, 'stone');
    expect(stoneSeconds(campaign.scars)).toBeCloseTo(2 * STONE_SECONDS);
    expect(campaignFrom(JSON.stringify(campaign)).scars).toEqual(campaign.scars);
    expect(campaignFrom(JSON.stringify({ scars: { stone: -3, flinch: 'many', burn: 4.7 } })).scars).toEqual({ stone: 0, flinch: 0, burn: 4, blast: 0, undertow: 0 });
  });
});

describe('prints', () => {
  it('cost a clone’s price from the wallet, what it lacks on the debt, and the back room less', () => {
    const campaign = freshCampaign();
    campaign.coins = 100;
    expect(printClone(campaign)).toEqual({ paid: PRINT_PRICE, owed: 0 });
    campaign.coins = 15;
    expect(printClone(campaign)).toEqual({ paid: 15, owed: PRINT_PRICE - 15 });
    expect(campaign.bond).toBe(BOND + PRINT_PRICE - 15);
    campaign.blackPrint = true;
    expect(printClone(campaign)).toEqual({ paid: 0, owed: BLACK_PRINT_PRICE });
    // a held debt stands as it is: the rest on the house
    campaign.held = true;
    expect(printClone(campaign)).toEqual({ paid: 0, owed: 0 });
    campaign.held = false;
    campaign.bond = BOND_MAX;
    expect(printClone(campaign).owed).toBe(0);
  });
});

describe('Rask’s counter', () => {
  it('turns after every job flown, offers only what the hull takes, and fits a part into its slot', () => {
    const campaign = freshCampaign();
    // nothing to fit a part to: an empty counter
    expect(counterOf(campaign)).toEqual([]);
    campaign.parts = ['laser', 'drive', 'thrusters', 'panels', 'radiators', 'tube'];
    const first = counterOf(campaign).map((part) => part.id);
    expect(first.length).toBe(SALVAGE_OFFER);
    expect(new Set(first).size).toBe(SALVAGE_OFFER);
    // the same counter after the same jobs, another after the next
    expect(counterOf(campaign).map((part) => part.id)).toEqual(first);
    const turns = new Set<string>();
    for (let flown = 0; flown < 20; flown++) turns.add(salvageOffer(flown, () => true, []).map((part) => part.id).join());
    expect(turns.size).toBeGreaterThan(10);
    campaign.coins = 100_000;
    const part = counterOf(campaign)[0];
    expect(buySalvage(campaign, part.id)).toBe(true);
    expect(campaign.coins).toBe(100_000 - part.price);
    expect(campaign.salvage).toEqual([part.id]);
    expect(counterOf(campaign).some((offered) => offered.id === part.id)).toBe(false);
    // a second part for the same slot replaces the first
    const other = SALVAGE.find((p) => p.slot === part.slot && p.id !== part.id && !p.kin)!;
    expect(fitSalvage(campaign.salvage, other.id)).toEqual([other.id]);
    // the hull changes as the part says
    const before = hullOf({ ...campaign, salvage: [] });
    const after = hullOf(campaign);
    for (const [key, value] of Object.entries(part.change)) expect(after[key as keyof typeof after] as number).toBeCloseTo((before[key as keyof typeof before] as number) + value);
    // a part off the counter, or one the wallet cannot pay, is not sold
    expect(buySalvage({ ...campaign, coins: 0 }, counterOf(campaign)[0].id)).toBe(false);
    expect(campaignFrom(JSON.stringify(campaign)).salvage).toEqual(campaign.salvage);
    expect(campaignFrom(JSON.stringify({ salvage: ['warp', 'navyCoil', 'coldCoil'] })).salvage).toEqual(['coldCoil']);
  });

  it('sells each people’s own part to its Kin', () => {
    const campaign = freshCampaign();
    campaign.parts = ['laser'];
    expect(counterOf(campaign).some((part) => part.kin)).toBe(false);
    campaign.standing.rockborn = STANDING_TIERS[KIN - 1];
    expect(counterOf(campaign).filter((part) => part.kin).map((part) => part.id)).toEqual(['rockbornLens']);
  });
});

describe('standing and the side jobs under the counter', () => {
  it('grows with the side jobs at a people’s places and opens their smuggling runs and bounties', () => {
    const campaign = freshCampaign();
    const story = MISSIONS.filter((m) => !m.side);
    campaign.done = story.slice(0, story.findIndex((m) => m.id === 'rheasilvia') + 1).map((m) => m.id);
    const offered = () => sideTrips(campaign).map((m) => m.id);
    expect(offered()).toContain('bounty:rheasilvia:1');
    expect(offered()).not.toContain('smuggle:rheasilvia');
    const paid = complete(campaign, mission('courier:rheasilvia'));
    expect(campaign.standing.rockborn).toBe(STANDING_FIRST);
    expect(paid.standing).toBeNull();
    complete(campaign, mission('ambush:rheasilvia'));
    expect(standingTier(campaign.standing.rockborn)).toBe(1);
    expect(offered()).toContain('smuggle:rheasilvia');
    // the second bounty once the first is done and the people know the Host
    complete(campaign, mission('bounty:rheasilvia:1'));
    expect(offered()).toContain('bounty:rheasilvia:2');
    expect(offered()).not.toContain('bounty:rheasilvia:3');
    expect(wantedName(mission('bounty:rheasilvia:2'))).not.toBe('');
    expect(mission('bounty:rheasilvia:3').pay).toBe(BOUNTY_TIERS[2].pay);
    // Occator's Rockborn are Vesta's: the same people
    expect(PLACE_PEOPLE.occator).toBe(PLACE_PEOPLE.rheasilvia);
  });

  it('pays a side job a fee on every flight again, and nothing for a story job but its medals', () => {
    const campaign = freshCampaign();
    const run = mission('courier:occator');
    complete(campaign, run);
    const coins = campaign.coins;
    const again = flownAgain(campaign, run);
    const fee = Math.round(run.pay * AGAIN_SHARE);
    expect(again.kept + again.cut).toBe(fee);
    expect(again.cut).toBe(Math.round(fee * YARD_CUT));
    expect(campaign.coins).toBe(coins + again.kept);
    expect(flownAgain(campaign, MISSIONS[1])).toMatchObject({ kept: 0, cut: 0, standing: null });
    expect(campaign.flown).toBe(3);
  });

  it('lays each smuggling run’s patrols so a silent ship slips by on the lane and a hot one is seen, the start out of their sight', () => {
    for (const [arena] of COURIER_PLACES) {
      const field = testField(DETAIL);
      field.generate(arenaById(arena)!.layout);
      const { from, drop, patrols } = smuggleLane(field, arena);
      const cutters = patrols.map(() => new THREE.Vector3());
      const point = new THREE.Vector3();
      let nearest = Infinity;
      let start = Infinity;
      for (let second = 0; second < 120; second += 0.5) {
        patrolsAt(patrols, second, cutters);
        for (const cutter of cutters) start = Math.min(start, cutter.distanceTo(from));
        for (let k = 0; k <= 50; k++) for (const cutter of cutters) nearest = Math.min(nearest, cutter.distanceTo(point.lerpVectors(from, drop, k / 50)));
      }
      expect(nearest, arena).toBeGreaterThan(SILENT_RANGE);
      expect(nearest, arena).toBeLessThan(SMUGGLE_SIGHT);
      expect(start, arena).toBeGreaterThan(SMUGGLE_SIGHT);
      // the patrols' rounds clear of the place's ground and rock
      for (const center of patrols) expect(!!field.overlap(center, SMUGGLE_CIRCLE), arena).toBe(false);
      expect(SMUGGLE_ASIDE - SMUGGLE_CIRCLE).toBeGreaterThan(SILENT_RANGE);
    }
  });
});

describe('a master’s run', () => {
  it('pays its bonus once for a job flown clean, untouched and, with a gold time, within it', () => {
    const campaign = freshCampaign();
    const job = MISSIONS.find((m) => m.pay > 0 && !m.trial && !m.drills.some((drill) => drill.gold !== undefined))!;
    complete(campaign, job);
    expect(master(campaign, job, true, false, false)).toBeNull();
    expect(master(campaign, job, false, true, false)).toBeNull();
    const bonus = master(campaign, job, true, true, false);
    expect(bonus).toBe(Math.round(job.pay * MEDAL_SHARE) - Math.round(Math.round(job.pay * MEDAL_SHARE) * YARD_CUT));
    expect(master(campaign, job, true, true, false)).toBeNull();
    const timed = MISSIONS.find((m) => m.pay > 0 && !m.trial && m.drills.some((drill) => drill.gold !== undefined))!;
    expect(master(campaign, timed, true, true, false)).toBeNull();
    expect(master(campaign, timed, true, true, true)).not.toBeNull();
    expect(campaignFrom(JSON.stringify(campaign)).masters).toEqual([job.id]);
  });
});

describe('the Gullet', () => {
  it('takes a bet on a job done with a gold time, pays it double on gold, and keeps it otherwise', () => {
    const campaign = freshCampaign();
    const timed = MISSIONS.find((m) => m.pay > 0 && m.drills.some((drill) => drill.gold !== undefined))!;
    campaign.coins = 1000;
    expect(placeBet(campaign, timed, 500)).toBe(false);
    campaign.done = [timed.id];
    expect(placeBet(campaign, timed, 300)).toBe(false);
    expect(placeBet(campaign, timed, 500)).toBe(true);
    expect(campaign.coins).toBe(500);
    expect(placeBet(campaign, timed, 100)).toBe(false);
    expect(campaignFrom(JSON.stringify(campaign)).bet).toEqual({ mission: timed.id, stake: 500 });
    expect(settleBet(campaign, timed, true)).toBe(500 * BET_ODDS);
    expect(campaign.coins).toBe(500 + 500 * BET_ODDS);
    expect(campaign.bet).toBeNull();
    placeBet(campaign, timed, 100);
    expect(settleBet(campaign, MISSIONS[0], true)).toBe(0);
    expect(settleBet(campaign, timed, true)).toBeNull();
    // a job without a gold time takes no bet
    expect(placeBet(campaign, MISSIONS[0], 100)).toBe(false);
  });

  it('sells rumors for a drink, each opening a side job before its people trust the Host', () => {
    const campaign = freshCampaign();
    const story = MISSIONS.filter((m) => !m.side);
    campaign.done = story.slice(0, story.findIndex((m) => m.id === 'occator') + 1).map((m) => m.id);
    expect(sideTrips(campaign).some((m) => m.id === 'smuggle:occator')).toBe(false);
    campaign.coins = RUMOR_PRICE;
    expect(buyRumor(campaign)).toBe(RUMORS[0].word);
    expect(campaign.coins).toBe(0);
    expect(sideTrips(campaign).some((m) => m.id === 'smuggle:occator')).toBe(true);
    expect(buyRumor(campaign)).toBeNull();
    expect(campaignFrom(JSON.stringify({ rumors: 99 })).rumors).toBe(RUMORS.length);
  });

  it('pays the Pit’s waves in cash and keeps its record; harder waves the longer the night', () => {
    const campaign = freshCampaign();
    expect(pitNight(campaign, 3)).toEqual({ purse: 3 * PIT_PURSE, record: true });
    expect(pitNight(campaign, 2)).toEqual({ purse: 2 * PIT_PURSE, record: false });
    expect(campaign.pit).toBe(3);
    expect(campaign.bond).toBe(BOND);
    expect(pitWave(1).count).toBe(1);
    expect(pitWave(20).count).toBe(5);
    expect(pitWave(20).skill).toBeLessThanOrEqual(0.85);
    expect(pitWave(3).skill).toBeGreaterThan(pitWave(2).skill);
    // the Pit is never the story's next job, nor on the board's lists
    const all = freshCampaign();
    all.done = MISSIONS.filter((m) => !m.side && !m.pit).map((m) => m.id);
    expect(nextMission(all)).toBeNull();
    expect(sideTrips(all).some((m) => m.pit)).toBe(false);
  });
});
