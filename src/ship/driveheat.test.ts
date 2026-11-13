import { describe, expect, it } from 'vitest';
import { BOOST_HEAT, BOOST_RECHARGE, BURNOUT_HEAT, DRIVE_HEAT_SHED, DriveHeat } from './driveheat';
import { MAX_SPEED } from './flight';
import { wantsBoost } from './bots';

describe("a race's boost and the drive's heat", () => {
  it('takes two shoves as close as the recharge lets them, and burns out on a third that soon', () => {
    const heat = new DriveHeat();
    expect(heat.shove(0)).toBe(false);
    expect(heat.read(0)).toBe(BOOST_HEAT);
    expect(heat.burns(BOOST_RECHARGE)).toBe(false);
    expect(heat.shove(BOOST_RECHARGE)).toBe(false);
    expect(heat.read(BOOST_RECHARGE)).toBe(BOOST_HEAT * 2 - DRIVE_HEAT_SHED * BOOST_RECHARGE);
    expect(heat.burns(BOOST_RECHARGE * 2)).toBe(true);
    expect(heat.shove(BOOST_RECHARGE * 2)).toBe(true);
    expect(heat.read(BOOST_RECHARGE * 2)).toBeGreaterThan(BURNOUT_HEAT);
  });

  it('sheds its heat by itself, never below cold, so a racer who waits may shove again', () => {
    const heat = new DriveHeat();
    heat.shove(0);
    heat.shove(BOOST_RECHARGE);
    const level = heat.read(BOOST_RECHARGE);
    // the gauge down to BURNOUT_HEAT less one shove: safe again
    const safe = BOOST_RECHARGE + (level - (BURNOUT_HEAT - BOOST_HEAT)) / DRIVE_HEAT_SHED;
    expect(heat.burns(safe - 0.5)).toBe(true);
    expect(heat.burns(safe + 0.5)).toBe(false);
    expect(heat.read(1000)).toBe(0);
    heat.reset();
    expect(heat.read(5)).toBe(0);
  });

  it('lets a bot boost only on a straight, its nose on it, not already fast, and never into a burnout', () => {
    for (const daring of [0, 0.5, 1]) {
      expect(wantsBoost(daring, true, true, MAX_SPEED * 0.8, 0)).toBe(true);
      expect(wantsBoost(daring, false, true, MAX_SPEED * 0.8, 0)).toBe(false);
      expect(wantsBoost(daring, true, false, MAX_SPEED * 0.8, 0)).toBe(false);
      expect(wantsBoost(daring, true, true, MAX_SPEED * 1.5, 0)).toBe(false);
      // whatever its nerve, never a shove that burns the drive out
      expect(wantsBoost(daring, true, true, MAX_SPEED * 0.8, BURNOUT_HEAT - BOOST_HEAT + 1)).toBe(false);
    }
    // a careful bot keeps a margin a daring one does not
    expect(wantsBoost(0, true, true, MAX_SPEED * 0.8, BURNOUT_HEAT - BOOST_HEAT - 5)).toBe(false);
    expect(wantsBoost(1, true, true, MAX_SPEED * 0.8, BURNOUT_HEAT - BOOST_HEAT - 5)).toBe(true);
  });
});
