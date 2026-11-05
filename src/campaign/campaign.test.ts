import { describe, expect, it } from 'vitest';
import { BOND, BOND_MAX, CUTTER_HEAT, CUTTER_REACH, campaignFrom, complete, FIN_RADIATOR, freshCampaign, hullOf, MISSIONS, nextMission, PATCHED_THRUSTERS, SCRAP_DRIVE, SCRAP_THRUSTERS, YARD_CUT } from './campaign';
import { TORPEDOES } from '../game/torpedoes';
import { CUTTER_PRICE } from './missions';

describe('the campaign Lot 7731', () => {
  it('starts with the Bond owed and the first mission next', () => {
    const campaign = freshCampaign();
    expect(campaign.bond).toBe(BOND);
    expect(nextMission(campaign)?.id).toBe(MISSIONS[0].id);
  });

  it('pays a mission once, less the yard’s cut while the Bond is unpaid, the cut paying it off', () => {
    const campaign = freshCampaign();
    const mission = { ...MISSIONS[0], pay: 1000 };
    expect(complete(campaign, mission)).toEqual({ kept: 1000 * (1 - YARD_CUT), cut: 1000 * YARD_CUT });
    expect(campaign.coins).toBe(600);
    expect(campaign.bond).toBe(BOND - 400);
    // done once: flown again it pays nothing
    expect(complete(campaign, mission)).toEqual({ kept: 0, cut: 0 });
    expect(campaign.done).toEqual([mission.id]);
    // a Bond nearly paid takes only what is left
    campaign.bond = 100;
    campaign.done = [];
    expect(complete(campaign, mission)).toEqual({ kept: 900, cut: 100 });
    expect(campaign.bond).toBe(0);
  });

  it('takes what the Host lost on the job off the pay before the yard takes its cut, never below nothing', () => {
    const campaign = freshCampaign();
    const mission = { ...MISSIONS[0], pay: 300 };
    // seven hits of the tourists at ☉ 10 each
    expect(complete(campaign, mission, 70)).toEqual({ kept: Math.round(230 * (1 - YARD_CUT)), cut: Math.round(230 * YARD_CUT) });
    campaign.done = [];
    expect(complete(campaign, mission, 500)).toEqual({ kept: 0, cut: 0 });
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
    expect(campaignFrom(JSON.stringify({ done: ['later', MISSIONS[0].id], step: -4, coins: 'x', bond: 1e9, parts: ['cutter', 'warp'] }))).toEqual({ done: [MISSIONS[0].id], step: 0, coins: 0, bond: BOND_MAX, parts: ['cutter'] });
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

  it('fits the mining cutter on the Bond: a laser of short reach that runs hot', () => {
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

  it('has Pim weld the thrusters up when the hull is docked, free, the Bond untouched', () => {
    const campaign = freshCampaign();
    complete(campaign, MISSIONS.find((mission) => mission.id === 'coldBoot')!);
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
