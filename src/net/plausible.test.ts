import { describe, expect, it } from 'vitest';
import { Accusations, accusersNeeded, Plausibility } from './plausible';

const alive = (x: number, more = {}) => ({ p: [x, 0, 0], alive: true, deaths: 0, ...more });

/** A ship seen for the first time, past the grace of its first sight. */
function flying(check: Plausibility, id = 's') {
  check.state(id, alive(0), 0);
  check.state(id, alive(0), 20);
  return check;
}

describe('plausibility of what other browsers report', () => {
  it('forgive flying, lag and a single odd jump, but not jumping across the arena twice', () => {
    const check = flying(new Plausibility());
    // 250 m/s for a tenth of a second, then three seconds of silence at full speed
    expect(check.state('s', alive(500), 20.1)).toBeNull();
    expect(check.state('s', alive(15500), 23.1)).toBeNull();
    // across the arena in a tenth of a second, twice
    expect(check.state('s', alive(100000), 23.2)).toBeNull();
    expect(check.state('s', alive(0), 23.3)).toBe('teleport');
  });

  it('let a ship be printed elsewhere after a death, a new round or its nova', () => {
    const check = flying(new Plausibility());
    check.state('s', { p: [0, 0, 0], alive: false, deaths: 1 }, 21);
    check.state('s', alive(90000, { deaths: 1 }), 24);
    expect(check.state('s', alive(90000, { deaths: 1 }), 34)).toBeNull();
    check.newRound(35);
    expect(check.state('s', alive(0, { deaths: 1 }), 35.1)).toBeNull();
    expect(check.state('s', alive(90000, { deaths: 1 }), 35.2)).toBeNull();
  });

  it('take a nova only from a ship that holds a core, where it is', () => {
    const check = flying(new Plausibility());
    expect(check.nova('s', [0, 0, 0], 21)).toBe('nova');
    check.probe('s', 'nova', 21);
    expect(check.nova('s', [200000, 0, 0], 21.1)).toBe('nova');
    expect(check.nova('s', [100, 0, 0], 21.1)).toBeNull();
    // the core is spent
    expect(check.nova('s', [100, 0, 0], 21.2)).toBe('nova');
    // a state that says it holds one is as good as the probe
    check.state('s', alive(0, { nova: true }), 40);
    expect(check.nova('s', [0, 0, 0], 40.1)).toBeNull();
  });

  it('take no nova from a clone that died with it', () => {
    const check = flying(new Plausibility());
    check.state('s', alive(0, { nova: true }), 21);
    check.state('s', { p: [0, 0, 0], alive: false, deaths: 1 }, 22);
    expect(check.nova('s', [0, 0, 0], 22.1)).toBe('nova');
  });

  it('count torpedoes per clone, with the tubes allowed online, probes and some slack', () => {
    const check = flying(new Plausibility());
    for (let i = 0; i < 5; i++) expect(check.torpedo('s', 21)).toBeNull();
    expect(check.torpedo('s', 21)).toBe('torpedoes');
    check.state('s', { p: [0, 0, 0], alive: false, deaths: 1 }, 22);
    check.state('s', alive(0, { deaths: 1 }), 25);
    check.probe('s', 'torpedoes', 26);
    for (let i = 0; i < 7; i++) expect(check.torpedo('s', 27)).toBeNull();
    expect(check.torpedo('s', 27)).toBe('torpedoes');
  });

  it('let kills grow only with the deaths everyone saw, double for a nova', () => {
    const check = new Plausibility();
    check.state('s', alive(0, { kills: 3 }), 0);
    check.credit('s', 2, 1);
    expect(check.state('s', alive(0, { kills: 7 }), 2)).toBeNull();
    expect(check.state('s', alive(0, { kills: 8 }), 3)).toBe('kills');
    // a new round starts over from zero
    check.newRound(4);
    expect(check.state('s', alive(0, { kills: 0 }), 5)).toBeNull();
    expect(check.state('s', alive(0, { kills: 2 }), 6)).toBeNull();
  });
});

describe('accusations', () => {
  it('name a cheater once two browsers say so, never on its own word', () => {
    const accusations = new Accusations();
    expect(accusations.add('c', 'c', 3)).toBe(false);
    expect(accusations.add('c', 'a', 3)).toBe(false);
    expect(accusations.add('c', 'a', 3)).toBe(false);
    expect(accusations.add('c', 'b', 3)).toBe(true);
    expect(accusations.add('c', 'd', 3)).toBe(false);
    accusations.forget('b');
    expect(accusations.add('c', 'e', 3)).toBe(false);
  });

  it('take a majority of the others in a fuller tournament, so two tabs cannot vote a Host out', () => {
    expect(accusersNeeded(3)).toBe(2);
    expect(accusersNeeded(5)).toBe(3);
    expect(accusersNeeded(8)).toBe(4);
    const accusations = new Accusations();
    expect(accusations.add('v', 'x1', 6)).toBe(false);
    expect(accusations.add('v', 'x2', 6)).toBe(false);
    expect(accusations.add('v', 'h', 6)).toBe(true);
  });
});
