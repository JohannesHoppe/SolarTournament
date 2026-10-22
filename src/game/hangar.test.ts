import { describe, expect, it } from 'vitest';
import { buy, complete, emptyHangar, HANGAR_SHIPS, LEVELS, nextPrice, ONLINE_LEVEL, parseHangar, payOut, perksOf, sovereignEarned, STOCK, UPGRADES } from './hangar';

/** A hangar with every upgrade of both interceptors bought. */
function maxed() {
  const hangar = emptyHangar();
  for (const ship of HANGAR_SHIPS) for (const upgrade of UPGRADES) hangar.levels[ship][upgrade.id] = LEVELS;
  return hangar;
}

describe('the hangar', () => {
  it('pays a round out in coins and buys the steps of an upgrade in order, while the coins last', () => {
    const hangar = emptyHangar();
    expect(payOut(hangar, 1200)).toBe(1200);
    expect(payOut(hangar, -300)).toBe(0);
    expect(buy(hangar, 'human', 'radiators')).toBe(true);
    expect(hangar.coins).toBe(200);
    expect(nextPrice(hangar, 'human', 'radiators')).toBe(2500);
    expect(buy(hangar, 'human', 'radiators')).toBe(false);
    // the other interceptor has its own steps
    expect(hangar.levels.alien.radiators).toBe(0);
  });

  it('stops at the last step', () => {
    const hangar = maxed();
    hangar.coins = 1e9;
    expect(nextPrice(hangar, 'alien', 'neon')).toBeNull();
    expect(buy(hangar, 'alien', 'neon')).toBe(false);
  });

  it('gives the Sovereign only for both interceptors complete', () => {
    const hangar = maxed();
    expect(sovereignEarned(hangar)).toBe(true);
    hangar.levels.alien.flame = LEVELS - 1;
    expect(complete(hangar, 'human')).toBe(true);
    expect(sovereignEarned(hangar)).toBe(false);
  });

  it('makes an upgraded ship better, and online only up to the cap, but its looks in full', () => {
    const hangar = maxed();
    expect(perksOf(emptyHangar(), 'human', false)).toEqual(STOCK);
    const solo = perksOf(hangar, 'human', false);
    const online = perksOf(hangar, 'human', true);
    expect(solo.cooling).toBeGreaterThan(online.cooling);
    expect(online.cooling).toBeCloseTo(1 + 0.15 * ONLINE_LEVEL);
    expect(solo.damage).toBeLessThan(1);
    expect(solo.torpedoes).toBe(2);
    expect(online.neon).toBe(LEVELS);
    // the Sovereign flies like a complete interceptor, whatever was bought
    expect(perksOf(emptyHangar(), 'sovereign', false)).toEqual(solo);
  });

  it('keeps only what fits from the browser, and the Sovereign only when earned', () => {
    expect(parseHangar('nonsense')).toEqual(emptyHangar());
    const kept = parseHangar(JSON.stringify({ coins: 50.7, levels: { human: { neon: 9, drive: -2, tubes: 1.5 } }, ship: 'sovereign' }));
    expect(kept.coins).toBe(50);
    expect(kept.levels.human.neon).toBe(LEVELS);
    expect(kept.levels.human.drive).toBe(0);
    expect(kept.levels.human.tubes).toBe(0);
    expect(kept.ship).toBe('human');
    expect(parseHangar(JSON.stringify({ ...maxed(), ship: 'sovereign' })).ship).toBe('sovereign');
  });
});
