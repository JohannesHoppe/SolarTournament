import { describe, expect, it } from 'vitest';
import { BOND, BOND_MAX, CUTTER_HEAT, CUTTER_REACH, campaignFrom, complete, trialPassed, FIN_RADIATOR, freshCampaign, hullOf, LASER_PRICE, MISSIONS, OVERHAUL_PRICE, PANELS_PRICE, PLATING_PRICE, RADIATORS_PRICE, TUBE_PRICE, DRIVE_ONE_PRICE, SECOND_TUBE_PRICE, THRUSTERS_ONE_PRICE, PLATING_TWO_PRICE, DRIVE_TWO_PRICE, OVERDRIVE_PRICE, THRUSTERS_TWO_PRICE, THRUSTERS_THREE_PRICE, PLATING_THREE_PRICE, DRIVE_THREE_PRICE, nextMission, PATCHED_THRUSTERS, RANKS, rankOf, ratingsOf, SCRAP_DRIVE, SCRAP_THRUSTERS, YARD_CUT } from './campaign';
import { TORPEDOES } from '../game/torpedoes';
import { DRIVE_STEP, PLATING_STEP, RADIATOR_STEP, STOCK, THRUSTER_STEP } from '../game/hangar';
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
    expect(campaignFrom(JSON.stringify({ done: ['later', MISSIONS[0].id], step: -4, coins: 'x', bond: 1e9, ratings: -3, parts: ['cutter', 'warp'], modules: ['radar', 'psychic'], choices: ['quietManSpared', 'mercy'] }))).toEqual({ done: [MISSIONS[0].id], step: 0, coins: 0, bond: BOND_MAX, ratings: 0, parts: ['cutter'], modules: ['radar'], held: false, choices: ['quietManSpared'] });
  });

  it('counts a mission’s ratings once and in full, and names the rank they raise the Host to', () => {
    const campaign = freshCampaign();
    expect(rankOf(campaign.ratings)).toBe('Unrated');
    const ranks: string[] = [];
    for (const mission of MISSIONS) {
      const done = complete(campaign, mission);
      expect(done.ratings).toBe(ratingsOf(mission, campaign));
      if (done.rank) ranks.push(done.rank);
    }
    // chapter 1 lifts the Host into the background of the feeds, chapter 2 onto the local ones, chapter 4 onto the regional ones, Hollow Jack's bounty to a sponsor's notice, chapter 10 into prime time, the Ring Trials to a Contender
    expect(campaign.ratings).toBe(MISSIONS.reduce((sum, mission) => sum + ratingsOf(mission, campaign), 0));
    expect(ranks).toEqual(['Background', 'Local Feed', 'Regional Feed', 'Sponsored', 'Prime Time', 'Contender']);
    expect(complete(campaign, MISSIONS[1]).ratings).toBe(0);
    expect(RANKS.map((rank) => rank.from)).toEqual([...RANKS.map((rank) => rank.from)].sort((a, b) => a - b));
    expect(rankOf(49)).toBe('Unrated');
    expect(rankOf(12000)).toBe('Contender');
  });

  it('has Nicole start as a salvaged unit: none of her modules installed, none by the missions before chapter 3, targeting with its laser, the racing line at the Stickney Grand, the radar in Pilot Episode, the threat warnings in Dose, her own voice at Enceladus and the wells at Pluto', () => {
    const campaign = freshCampaign();
    expect(campaign.modules).toEqual([]);
    for (const mission of MISSIONS) {
      if (mission.id === 'surplus') expect(campaign.modules).toEqual([]);
      if (mission.id === 'stickneyGrand') expect(campaign.modules).toEqual(['targeting']);
      if (mission.id === 'pilotEpisode') expect(campaign.modules).toEqual(['targeting', 'racingLine']);
      if (mission.id === 'dose') expect(campaign.modules).toEqual(['targeting', 'racingLine', 'radar']);
      if (mission.id === 'voiceTwo') expect(campaign.modules).toEqual(['targeting', 'racingLine', 'radar', 'threat']);
      complete(campaign, mission);
    }
    expect(campaign.modules).toEqual(['targeting', 'racingLine', 'radar', 'threat', 'voice', 'wells']);
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

  it('pays the Quiet Man’s full ratings for him shot down, fewer for him let go, and keeps the choice', () => {
    const quiet = MISSIONS.find((mission) => mission.id === 'quietMan')!;
    const shot = freshCampaign();
    expect(complete(shot, quiet).ratings).toBe(250);
    const spared = { ...freshCampaign(), choices: ['quietManSpared' as const] };
    expect(complete(spared, quiet).ratings).toBe(100);
    expect(campaignFrom(JSON.stringify(spared)).choices).toEqual(['quietManSpared']);
  });

  it('fits a torpedo tube at Io, one torpedo a clone, and Main Drive I, the drive a step past stock, each paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 500, bond: 20000, parts: ['drive' as const] };
    expect(hullOf(campaign).torpedoes).toBe(-TORPEDOES);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'tubeFitting')!);
    expect(STOCK.torpedoes + TORPEDOES + hullOf(campaign).torpedoes).toBe(1);
    expect([campaign.coins, campaign.bond]).toEqual([0, 20000 + TUBE_PRICE - 500]);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'mainDrive')!);
    expect(hullOf(campaign).drive).toBeCloseTo(STOCK.drive + DRIVE_STEP, 10);
    expect(campaign.bond).toBe(20000 + TUBE_PRICE - 500 + DRIVE_ONE_PRICE);
  });

  it('gives Nicole her own voice back at Enceladus, for nothing: the module, and no part', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000 };
    complete(campaign, MISSIONS.find((mission) => mission.id === 'voiceTwo')!);
    expect(campaign.modules).toContain('voice');
    expect(campaign.bond).toBe(20000);
  });

  it('passes a trial of the Ring Trials by its mode: a place on the podium, the side leading, the battleship down', () => {
    const outcome = { place: 3, sideLeads: false, battleshipDown: false };
    expect(trialPassed({ mode: 'race', arena: 'rings', podium: 3 }, outcome)).toBe(true);
    expect(trialPassed({ mode: 'deathmatch', arena: 'rings', podium: 2 }, outcome)).toBe(false);
    expect(trialPassed({ mode: 'flag', arena: 'rings', podium: 1 }, outcome)).toBe(false);
    expect(trialPassed({ mode: 'flag', arena: 'rings', podium: 1 }, { ...outcome, sideLeads: true })).toBe(true);
    expect(trialPassed({ mode: 'fleet', arena: 'rings', podium: 1 }, { ...outcome, battleshipDown: true })).toBe(true);
    expect(MISSIONS.filter((mission) => mission.trial).map((mission) => mission.trial!.mode)).toEqual(['race', 'deathmatch', 'flag', 'fleet']);
  });

  it('fits the overdrive and Thrusters II at Miranda, Thrusters III after the Derelict: the Loose’s hack, and the thrusters two steps past stock, each paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['thrusters' as const, 'thrustersOne' as const] };
    expect(hullOf(campaign).overdrive).toBe(false);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'amongTheLoose')!);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'thrustersTwo')!);
    expect(hullOf(campaign).overdrive).toBe(true);
    expect(hullOf(campaign).thrusters).toBeCloseTo(STOCK.thrusters + 2 * THRUSTER_STEP, 10);
    expect(campaign.bond).toBe(20000 + OVERDRIVE_PRICE + THRUSTERS_TWO_PRICE);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'thrustersThree')!);
    expect(hullOf(campaign).thrusters).toBeCloseTo(STOCK.thrusters + 3 * THRUSTER_STEP, 10);
    expect(campaign.bond).toBe(20000 + OVERDRIVE_PRICE + THRUSTERS_TWO_PRICE + THRUSTERS_THREE_PRICE);
  });

  it('fits Main Drive III and Radiators III on the Ladder: each the hangar’s third step, each paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['drive' as const, 'driveOne' as const, 'driveTwo' as const, 'radiators' as const, 'radiatorsTwo' as const] };
    const before = hullOf(campaign).cooling;
    complete(campaign, MISSIONS.find((mission) => mission.id === 'driveThree')!);
    expect(hullOf(campaign).drive).toBeCloseTo(STOCK.drive + 3 * DRIVE_STEP, 10);
    expect(hullOf(campaign).cooling).toBeCloseTo(before + RADIATOR_STEP, 10);
    expect(campaign.bond).toBe(20000 + 2 * DRIVE_THREE_PRICE);
  });

  it('fits Plating III at Pluto: every hit hurts three of the hangar’s steps less, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['plating' as const, 'platingTwo' as const] };
    complete(campaign, MISSIONS.find((mission) => mission.id === 'platingThree')!);
    expect(hullOf(campaign).damage).toBeCloseTo(STOCK.damage - 3 * PLATING_STEP, 10);
    expect(campaign.bond).toBe(20000 + PLATING_THREE_PRICE);
  });

  it('fits Main Drive II and Radiators II at Iapetus: each the hangar’s second step, each paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['drive' as const, 'driveOne' as const, 'radiators' as const] };
    const before = hullOf(campaign).cooling;
    complete(campaign, MISSIONS.find((mission) => mission.id === 'driveTwo')!);
    expect(hullOf(campaign).drive).toBeCloseTo(STOCK.drive + 2 * DRIVE_STEP, 10);
    expect(hullOf(campaign).cooling).toBeCloseTo(before + RADIATOR_STEP, 10);
    expect(campaign.bond).toBe(20000 + 2 * DRIVE_TWO_PRICE);
  });

  it('fits Plating II at Enceladus: every hit hurts two steps of the hangar less than a stock ship’s, paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['plating' as const] };
    complete(campaign, MISSIONS.find((mission) => mission.id === 'platingTwo')!);
    expect(hullOf(campaign).damage).toBeCloseTo(STOCK.damage - 2 * PLATING_STEP, 10);
    expect(campaign.bond).toBe(20000 + PLATING_TWO_PRICE);
  });

  it('fits the second tube and Thrusters I at Titan: two torpedoes, a stock ship’s, and the thrusters a step past stock, each paid as the laser is', () => {
    const campaign = { ...freshCampaign(), coins: 0, bond: 20000, parts: ['tube' as const, 'thrusters' as const] };
    complete(campaign, MISSIONS.find((mission) => mission.id === 'secondTube')!);
    expect(STOCK.torpedoes + TORPEDOES + hullOf(campaign).torpedoes).toBe(2);
    complete(campaign, MISSIONS.find((mission) => mission.id === 'thrustersOne')!);
    expect(hullOf(campaign).thrusters).toBeCloseTo(STOCK.thrusters + THRUSTER_STEP, 10);
    expect(campaign.bond).toBe(20000 + SECOND_TUBE_PRICE + THRUSTERS_ONE_PRICE);
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

  it('gives every mission a name and drills to fly, a trial at least its briefing before its round', () => {
    for (const mission of MISSIONS) {
      expect(mission.name).not.toBe('');
      expect(mission.drills.length).toBeGreaterThan(mission.trial ? 0 : 1);
      for (const drill of mission.drills) expect(drill.line).not.toBe('');
    }
  });
});
