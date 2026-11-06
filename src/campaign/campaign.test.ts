import { describe, expect, it } from 'vitest';
import { BOND, BOND_MAX, CUTTER_HEAT, CUTTER_REACH, campaignFrom, complete, FIN_RADIATOR, freshCampaign, hullOf, LASER_PRICE, MISSIONS, OVERHAUL_PRICE, PANELS_PRICE, PLATING_PRICE, RADIATORS_PRICE, nextMission, PATCHED_THRUSTERS, RANKS, rankOf, SCRAP_DRIVE, SCRAP_THRUSTERS, YARD_CUT } from './campaign';
import { TORPEDOES } from '../game/torpedoes';
import { PLATING_STEP, RADIATOR_STEP, STOCK } from '../game/hangar';
import { CUTTER_PRICE } from './missions';

describe('the campaign Lot 7731', () => {
  it('starts with the debt owed and the first mission next', () => {
    const campaign = freshCampaign();
    expect(campaign.bond).toBe(BOND);
    expect(nextMission(campaign)?.id).toBe(MISSIONS[0].id);
  });

  it('pays a mission once, less the yard’s cut while the debt is unpaid, the cut paying it off', () => {
    const campaign = freshCampaign();
    const mission = { ...MISSIONS[0], pay: 1000 };
    expect(complete(campaign, mission)).toMatchObject({ kept: 1000 * (1 - YARD_CUT), cut: 1000 * YARD_CUT });
    expect(campaign.coins).toBe(600);
    expect(campaign.bond).toBe(BOND - 400);
    // done once: flown again it pays nothing
    expect(complete(campaign, mission)).toMatchObject({ kept: 0, cut: 0 });
    expect(campaign.done).toEqual([mission.id]);
    // a debt nearly paid takes only what is left
    campaign.bond = 100;
    campaign.done = [];
    expect(complete(campaign, mission)).toMatchObject({ kept: 900, cut: 100 });
    expect(campaign.bond).toBe(0);
  });

  it('takes what the Host lost on the job off the pay before the yard takes its cut, never below nothing', () => {
    const campaign = freshCampaign();
    const mission = { ...MISSIONS[0], pay: 300 };
    // seven hits of the tourists at ☉ 10 each
    expect(complete(campaign, mission, 70)).toMatchObject({ kept: Math.round(230 * (1 - YARD_CUT)), cut: Math.round(230 * YARD_CUT) });
    campaign.done = [];
    expect(complete(campaign, mission, 500)).toMatchObject({ kept: 0, cut: 0 });
  });

  it('reads back what it keeps, and takes anything else for a fresh start', () => {
    const campaign = freshCampaign();
    campaign.step = 3;
    complete(campaign, MISSIONS[0]);
    campaign.step = 2;
    expect(campaignFrom(JSON.stringify(campaign))).toEqual(campaign);
    expect(campaignFrom(null)).toEqual(freshCampaign());
    expect(campaignFrom('{oops')).toEqual(freshCampaign());
    // a mission it does not know is passed over, a number out of reach held in it
    expect(campaignFrom(JSON.stringify({ done: ['later', MISSIONS[0].id], step: -4, coins: 'x', bond: 1e9, ratings: -3, parts: ['cutter', 'warp'], modules: ['radar', 'psychic'] }))).toEqual({ done: [MISSIONS[0].id], step: 0, coins: 0, bond: BOND_MAX, ratings: 0, parts: ['cutter'], modules: ['radar'], held: false });
  });

  it('counts a mission’s ratings once and in full, and names the rank they raise the Host to', () => {
    const campaign = freshCampaign();
    expect(rankOf(campaign.ratings)).toBe('Unrated');
    const ranks: string[] = [];
    for (const mission of MISSIONS) {
      const done = complete(campaign, mission);
      expect(done.ratings).toBe(mission.ratings ?? 0);
      if (done.rank) ranks.push(done.rank);
    }
    // chapter 1 lifts the Host into the background of the feeds, chapter 2 onto the local ones, chapter 4 onto the regional ones
    expect(campaign.ratings).toBe(MISSIONS.reduce((sum, mission) => sum + (mission.ratings ?? 0), 0));
    expect(ranks).toEqual(['Background', 'Local Feed', 'Regional Feed']);
    expect(complete(campaign, MISSIONS[1]).ratings).toBe(0);
    expect(RANKS.map((rank) => rank.from)).toEqual([...RANKS.map((rank) => rank.from)].sort((a, b) => a - b));
    expect(rankOf(49)).toBe('Unrated');
    expect(rankOf(12000)).toBe('Contender');
  });

  it('has Nicole start as a salvaged unit: none of her modules installed, none by the missions before chapter 3, targeting with its laser, the racing line at the Stickney Grand and the radar in Pilot Episode', () => {
    const campaign = freshCampaign();
    expect(campaign.modules).toEqual([]);
    for (const mission of MISSIONS) {
      if (mission.id === 'surplus') expect(campaign.modules).toEqual([]);
      if (mission.id === 'stickneyGrand') expect(campaign.modules).toEqual(['targeting']);
      if (mission.id === 'pilotEpisode') expect(campaign.modules).toEqual(['targeting', 'racingLine']);
      complete(campaign, mission);
    }
    expect(campaign.modules).toEqual(['targeting', 'racingLine', 'radar']);
    expect(campaignFrom(JSON.stringify({ done: [] })).modules).toEqual([]);
  });

  it('grinds the depot’s grey off in Scout Two: the old livery shows on the hull from then on', () => {
    const campaign = freshCampaign();
    expect(hullOf(campaign).stripped).toBe(false);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'scoutTwo')!);
    expect(hullOf(campaign).stripped).toBe(true);
    expect(campaignFrom(JSON.stringify({ parts: ['stripped'] })).parts).toEqual(['stripped']);
  });

  it('overhauls the drive in Overhaul: a stock ship’s push, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 1000, bond: 20000 };
    expect(hullOf(campaign).drive).toBe(SCRAP_DRIVE);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'overhaul')!);
    expect(hullOf(campaign).drive).toBe(STOCK.drive);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + OVERHAUL_PRICE - 1000]);
  });

  it('takes no cut once Debt Day has the benefactor hold the debt: its own pay and every one after kept in full, the debt as it stands', () => {
    const campaign = { ...freshCampaign(), bond: 20000 };
    const debtDay = MISSIONS.find((mission) => mission.id === 'debtDay')!;
    const paid = complete(campaign, debtDay);
    expect(campaign.held).toBe(true);
    expect([paid.kept, paid.cut, campaign.bond]).toEqual([debtDay.pay, 0, 20000]);
    const later = complete(campaign, MISSIONS.find((mission) => mission.id === 'stickneyGrand')!);
    expect(later.cut).toBe(0);
  });

  it('starts with a bare left flank and closes it with Armor Panels, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 500, bond: 20000 };
    expect(hullOf(campaign).bareFlank).toBe(true);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'armorPanels')!);
    expect(hullOf(campaign).bareFlank).toBe(false);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + PANELS_PRICE - 500]);
  });

  it('fits Radiators I at Callisto: the radiators a step up, the missing fin still short of a stock ship, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 400, bond: 20000 };
    const before = hullOf(campaign).cooling;
    complete(campaign, MISSIONS.find((mission) => mission.id === 'radiators')!);
    expect(hullOf(campaign).cooling).toBeCloseTo(before + RADIATOR_STEP, 10);
    expect(hullOf(campaign).cooling).toBeLessThan(1);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + RADIATORS_PRICE - 400]);
  });

  it('fits Plating I at Europa: every hit hurting a step less, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 400, bond: 20000 };
    const before = hullOf(campaign).damage;
    complete(campaign, MISSIONS.find((mission) => mission.id === 'plating')!);
    expect(hullOf(campaign).damage).toBeCloseTo(before - PLATING_STEP, 10);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + PLATING_PRICE - 400]);
  });

  it('fits the military laser in Surplus: paid from the wallet as far as it holds, the rest on the debt, the Games\' own laser in place of the cutter', () => {
    const campaign = { ...freshCampaign(), coins: 2500, bond: 20000, parts: ['cutter' as const] };
    complete(campaign, MISSIONS.find((mission) => mission.id === 'surplus')!);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + LASER_PRICE - 2500]);
    const hull = hullOf(campaign);
    expect([hull.laser, hull.laserReach, hull.laserHeat]).toEqual([true, 1, 1]);
    const rich = { ...freshCampaign(), coins: 9000, parts: [] };
    complete(rich, MISSIONS.find((mission) => mission.id === 'surplus')!);
    expect([rich.coins, rich.bond]).toEqual([9000 - LASER_PRICE, BOND]);
  });

  it('starts on the scrap hull: a weak drive and thrusters, no laser, torpedoes, overdrive or dodge', () => {
    const hull = hullOf(freshCampaign());
    expect(hull.drive).toBe(SCRAP_DRIVE);
    expect(hull.thrusters).toBe(SCRAP_THRUSTERS);
    expect(TORPEDOES + hull.torpedoes).toBe(0);
    expect([hull.laser, hull.overdrive, hull.dodge, hull.hook, hull.nanobots, hull.selfDestruct]).toEqual([false, false, false, false, false, false]);
    // one fin of two: a quarter less radiator, and no course to hold in air
    expect(hull.fins).toBe(1);
    expect(hull.cooling).toBe(1 - FIN_RADIATOR);
  });

  it('fits the mining cutter on the debt: a laser of short reach that runs hot', () => {
    const campaign = freshCampaign();
    const cutter = MISSIONS.find((mission) => mission.id === 'cutter')!;
    complete(campaign, cutter);
    expect(campaign.parts).toEqual(['cutter']);
    expect(campaign.bond).toBe(BOND + CUTTER_PRICE);
    const hull = hullOf(campaign);
    expect([hull.laser, hull.laserReach, hull.laserHeat]).toEqual([true, CUTTER_REACH, CUTTER_HEAT]);
    // done once, fitted once
    complete(campaign, cutter);
    expect(campaign.bond).toBe(BOND + CUTTER_PRICE);
  });

  it('has Pim weld the thrusters up when the hull is docked, free, the debt untouched, and her welds show', () => {
    const campaign = freshCampaign();
    expect(hullOf(campaign).patched).toBe(false);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'coldBoot')!);
    expect(hullOf(campaign).patched).toBe(true);
    expect(campaign.parts).toEqual(['patch']);
    expect(campaign.bond).toBe(BOND);
    expect(hullOf(campaign).thrusters).toBe(PATCHED_THRUSTERS);
  });

  it('gives every mission a name and drills to fly', () => {
    for (const mission of MISSIONS) {
      expect(mission.name).not.toBe('');
      expect(mission.drills.length).toBeGreaterThan(1);
      for (const drill of mission.drills) expect(drill.line).not.toBe('');
    }
  });
});
