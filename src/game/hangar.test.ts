import { describe, expect, it } from 'vitest';
import { buy, complete, emptyHangar, HANGAR_SHIPS, hangarFrom, keepable, LEVELS, MAX_LOOKS, nextPrice, ONLINE_LEVEL, packLooks, payOut, perksOf, sovereignEarned, STOCK, unpackLooks, UPGRADES, WALLET } from './hangar';

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
    hangar.coins = WALLET;
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

  it('tells other browsers its looks and its radiators online, so they heat it in the air as its own browser does', () => {
    const online = perksOf(maxed(), 'human', true);
    const seen = unpackLooks(packLooks(online));
    expect(seen.cooling).toBeCloseTo(online.cooling);
    expect(seen.neon).toBe(online.neon);
    expect(seen.flame).toBe(online.flame);
    expect(packLooks(online)).toBeLessThanOrEqual(MAX_LOOKS);
    expect(unpackLooks(packLooks(STOCK))).toEqual(STOCK);
    // the Sovereign's too, its looks in full and its radiators at the cap
    expect(packLooks(perksOf(emptyHangar(), 'sovereign', true))).toBe(MAX_LOOKS);
  });

  it('holds in its wallet what the hangar sells, and no more', () => {
    expect(WALLET).toBe(113_000);
    const hangar = emptyHangar();
    hangar.coins = WALLET - 500;
    expect(payOut(hangar, 2000)).toBe(500);
    expect(hangar.coins).toBe(WALLET);
    expect(payOut(hangar, 2000)).toBe(0);
    expect(hangar.coins).toBe(WALLET);
  });

  it('never keeps what it reads as an edit, whatever is bought, paid or earned', () => {
    const hangar = emptyHangar();
    const honest = () => {
      const read = hangarFrom(JSON.stringify(keepable(hangar)));
      expect(read.cheated).toBe(false);
      expect(read.unreadable).toEqual([]);
      expect(read.hangar).toEqual(hangar);
    };
    honest();
    // a full wallet, everything bought step by step with payouts at the wallet's edge, the Sovereign flown
    for (let round = 0; round < 40; round++) {
      payOut(hangar, 50_000);
      honest();
      for (const ship of HANGAR_SHIPS) for (const upgrade of UPGRADES) if (buy(hangar, ship, upgrade.id)) honest();
    }
    expect(sovereignEarned(hangar)).toBe(true);
    hangar.ship = 'sovereign';
    honest();
    payOut(hangar, 1e9);
    honest();
    // what no Host can own is put right before it is kept
    Object.assign(hangar, { coins: WALLET * 2, ship: 'sovereign' });
    hangar.levels.human.drive = LEVELS + 2;
    hangar.levels.alien.neon = -1;
    keepable(hangar);
    expect(hangar.coins).toBe(WALLET);
    expect(hangar.levels.human.drive).toBe(LEVELS);
    expect(hangar.ship).toBe('human');
    honest();
  });
});

describe('the hangar as the browser keeps it', () => {
  const kept = (entry: object) => hangarFrom(JSON.stringify(entry));

  it('reads back what the game keeps, and nothing kept as stock', () => {
    const hangar = maxed();
    hangar.coins = 4321;
    hangar.ship = 'sovereign';
    expect(hangarFrom(JSON.stringify(hangar))).toEqual({ hangar, cheated: false, unreadable: [] });
    expect(hangarFrom(null)).toEqual({ hangar: emptyHangar(), cheated: false, unreadable: [] });
    // what is missing is stock, what this game does not know is passed over
    expect(kept({ coins: 1200, ship: 'human' }).hangar).toEqual({ ...emptyHangar(), coins: 1200 });
    expect(kept({ coins: 5, levels: { human: { warp: 9 }, frigate: { neon: 7 } }, ship: 'frigate', paint: 'gold' })).toEqual({ hangar: { ...emptyHangar(), coins: 5 }, cheated: false, unreadable: [] });
    // coins within the wallet are the Host's business, whatever they are
    for (const coins of [WALLET, -300, 50.7]) expect(kept({ coins })).toEqual({ hangar: { ...emptyHangar(), coins }, cheated: false, unreadable: [] });
  });

  it('calls coins beyond the wallet an edit', () => {
    expect(kept({ coins: WALLET + 1 }).cheated).toBe(true);
    expect(kept({ coins: 999_999_999, ship: 'human' }).cheated).toBe(true);
  });

  it('calls a step below none or beyond the last an edit', () => {
    for (const level of [LEVELS + 1, -1, 99]) expect(kept({ levels: { alien: { drive: level } } }).cheated).toBe(true);
  });

  it('calls the Sovereign without both interceptors complete an edit', () => {
    const hangar = maxed();
    hangar.levels.alien.flame = LEVELS - 1;
    expect(kept({ ...hangar, ship: 'sovereign' }).cheated).toBe(true);
    expect(kept({ ...emptyHangar(), ship: 'sovereign' }).cheated).toBe(true);
  });

  it('takes what it cannot read as stock, and never as an edit', () => {
    for (const text of ['nonsense', '{"coins": 12', '[]', '42', 'null', '"hangar"']) expect(hangarFrom(text)).toEqual({ hangar: emptyHangar(), cheated: false, unreadable: ['entry'] });
    expect(kept({ coins: '100', levels: { human: 3, alien: { drive: 1.5, tubes: '2', neon: null, flame: 2 } } })).toEqual({
      hangar: { ...emptyHangar(), levels: { human: emptyHangar().levels.human, alien: { ...emptyHangar().levels.alien, flame: 2 } } },
      cheated: false,
      unreadable: ['coins', 'levels.human', 'levels.alien.drive', 'levels.alien.tubes', 'levels.alien.neon'],
    });
    expect(kept({ levels: [] }).unreadable).toEqual(['levels']);
    // a Sovereign beside a step that cannot be read is no edit either: it flies the human interceptor
    const hangar = maxed();
    expect(kept({ ...hangar, levels: { ...hangar.levels, alien: { ...hangar.levels.alien, drive: 'x' } }, ship: 'sovereign' })).toMatchObject({ cheated: false, hangar: { ship: 'human' } });
  });

  it('is no edit any more once it is put back', () => {
    expect(kept({ ...emptyHangar(), coins: WALLET * 10 }).cheated).toBe(true);
    expect(kept({ ...emptyHangar(), coins: 300 })).toMatchObject({ cheated: false, hangar: { coins: 300 } });
  });
});
