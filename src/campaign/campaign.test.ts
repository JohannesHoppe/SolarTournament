import { describe, expect, it } from 'vitest';
import { BOND, campaignFrom, complete, freshCampaign, hullOf, MISSIONS, nextMission, SCRAP_DRIVE, SCRAP_THRUSTERS, YARD_CUT } from './campaign';
import { TORPEDOES } from '../game/torpedoes';

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

  it('reads back what it keeps, and takes anything else for a fresh start', () => {
    const campaign = freshCampaign();
    campaign.step = 3;
    complete(campaign, MISSIONS[0]);
    campaign.step = 2;
    expect(campaignFrom(JSON.stringify(campaign))).toEqual(campaign);
    expect(campaignFrom(null)).toEqual(freshCampaign());
    expect(campaignFrom('{oops')).toEqual(freshCampaign());
    // a mission it does not know is passed over, a number out of reach held in it
    expect(campaignFrom(JSON.stringify({ done: ['later', MISSIONS[0].id], step: -4, coins: 'x', bond: 1e9 }))).toEqual({ done: [MISSIONS[0].id], step: 0, coins: 0, bond: BOND });
  });

  it('starts on the scrap hull: a weak drive and thrusters, no laser, torpedoes, overdrive or dodge', () => {
    const hull = hullOf(freshCampaign());
    expect(hull.drive).toBe(SCRAP_DRIVE);
    expect(hull.thrusters).toBe(SCRAP_THRUSTERS);
    expect(TORPEDOES + hull.torpedoes).toBe(0);
    expect([hull.laser, hull.overdrive, hull.dodge, hull.hook, hull.nanobots, hull.selfDestruct]).toEqual([false, false, false, false, false, false]);
  });

  it('gives every mission a name and drills to fly', () => {
    for (const mission of MISSIONS) {
      expect(mission.name).not.toBe('');
      expect(mission.drills.length).toBeGreaterThan(1);
      for (const drill of mission.drills) expect(drill.line).not.toBe('');
    }
  });
});
