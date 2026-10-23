import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TORPEDO_LIFETIME } from '../game/torpedoes';
import { Accusations, accusersNeeded, Evidence, Plausibility } from './plausible';

const alive = (x: number, more = {}) => ({ p: [x, 0, 0], alive: true, ...more });
const dead = { p: [0, 0, 0], alive: false };

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

  it('let a ship be printed elsewhere after a death it saw, a new round or its nova', () => {
    const check = flying(new Plausibility());
    check.died('s', 21);
    check.state('s', dead, 21);
    check.state('s', alive(90000), 24);
    expect(check.state('s', alive(90000), 34)).toBeNull();
    check.newRound(35);
    expect(check.state('s', alive(0), 35.1)).toBeNull();
    expect(check.state('s', alive(90000), 35.2)).toBeNull();
  });

  it('take no new clone from a state alone: dying and living again in its own states does not let a ship jump', () => {
    const check = flying(new Plausibility());
    check.state('s', dead, 21);
    expect(check.state('s', alive(100000), 21.1)).toBeNull();
    check.state('s', dead, 21.2);
    expect(check.state('s', alive(0), 21.3)).toBe('teleport');
  });

  it('take a nova only from a ship that took a core, where it is', () => {
    const check = flying(new Plausibility());
    expect(check.nova('s', [0, 0, 0], 21)).toBe('nova');
    check.probe('s', 'nova', 21);
    expect(check.nova('s', [200000, 0, 0], 21.1)).toBe('nova');
    expect(check.nova('s', [100, 0, 0], 21.1)).toBeNull();
    // the core is spent
    expect(check.nova('s', [100, 0, 0], 21.2)).toBe('nova');
  });

  it("take no core on a ship's own word, unless it holds one when first seen or just took a probe of unknown contents", () => {
    const check = flying(new Plausibility());
    check.state('s', alive(0, { nova: true }), 40);
    expect(check.nova('s', [0, 0, 0], 40.1)).toBe('nova');
    // a ship first seen with a core took it before this browser came
    check.state('t', alive(0, { nova: true }), 41);
    expect(check.nova('t', [0, 0, 0], 41.1)).toBeNull();
    // a probe this browser did not have: it may have held a core
    check.probe('s', null, 50);
    check.state('s', alive(0, { nova: true }), 51);
    expect(check.nova('s', [0, 0, 0], 51.1)).toBeNull();
  });

  it('take no nova from a clone that died with it', () => {
    const check = flying(new Plausibility());
    check.probe('s', 'nova', 21);
    check.died('s', 22);
    expect(check.nova('s', [0, 0, 0], 22.1)).toBe('nova');
  });

  it('count torpedoes per clone, with the tubes allowed online, probes and some slack; a clone is new only after a death it saw', () => {
    const check = flying(new Plausibility());
    for (let i = 0; i < 5; i++) expect(check.torpedo('s', 21)).toBeNull();
    expect(check.torpedo('s', 21)).toBe('torpedoes');
    // dying and living again in its own states gives no fresh load
    check.state('s', dead, 21.5);
    check.state('s', alive(0), 21.6);
    expect(check.torpedo('s', 21.7)).toBe('torpedoes');
    check.died('s', 22);
    check.state('s', dead, 22);
    check.state('s', alive(0), 25);
    check.probe('s', 'torpedoes', 26);
    for (let i = 0; i < 7; i++) expect(check.torpedo('s', 27)).toBeNull();
    expect(check.torpedo('s', 27)).toBe('torpedoes');
  });

  it("give a fresh load only to a clone seen after the respawn's delay, even when lag brings its first state together with the death", () => {
    const check = flying(new Plausibility());
    for (let i = 0; i < 3; i++) check.torpedo('s', 21);
    // the death and the next clone's first states arrive bunched, a moment apart
    check.died('s', 30);
    check.state('s', dead, 30.01);
    check.state('s', alive(50000), 30.02);
    // its states go on: the first one past the delay brings the fresh load
    check.state('s', alive(50000), 32.1);
    for (let i = 0; i < 3; i++) expect(check.torpedo('s', 33 + i)).toBeNull();
  });

  it('keep a nova core held through a start over, of the ship\'s browser or this one, until a new round', () => {
    const check = new Plausibility();
    check.state('s', alive(0, { nova: true }), 0);
    check.state('s', alive(0, { nova: true }), 20);
    check.reprint('s', 21);
    check.state('s', alive(0, { nova: true }), 22);
    check.lostSight(23);
    check.state('s', alive(0, { nova: true }), 24);
    expect(check.nova('s', [0, 0, 0], 25)).toBeNull();
    const next = new Plausibility();
    next.state('t', alive(0, { nova: true }), 0);
    next.newRound(1);
    next.state('t', alive(0, { nova: true }), 2);
    expect(next.nova('t', [0, 0, 0], 3)).toBe('nova');
  });

  it('give a browser that started over a new clone, without forgetting its kills', () => {
    const check = flying(new Plausibility());
    for (let i = 0; i < 5; i++) check.torpedo('s', 21);
    check.reprint('s', 22);
    expect(check.state('s', alive(100000), 22.1)).toBeNull();
    expect(check.torpedo('s', 22.2)).toBeNull();
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

describe('evidence of what a ship did', () => {
  const v = (x: number, y = 0) => new THREE.Vector3(x, y, 0);

  it('counts a beam where it ended and along its way, for a few seconds', () => {
    const evidence = new Evidence();
    evidence.beam('s', v(0), v(100000), 10);
    expect(evidence.beamEnded('s', v(100000, 5000), 20000, 11)).toBe(true);
    expect(evidence.beamEnded('s', v(50000), 20000, 11)).toBe(false);
    expect(evidence.beamPassed('s', v(50000, 10000), 11)).toBe(true);
    expect(evidence.beamPassed('s', v(50000, 30000), 11)).toBe(false);
    expect(evidence.beamEnded('s', v(100000), 20000, 16)).toBe(false);
    expect(evidence.beamEnded('t', v(100000), 20000, 11)).toBe(false);
  });

  it('counts where a torpedo went off, and a launch while the torpedo may fly', () => {
    const evidence = new Evidence();
    evidence.blast('s', v(0), 10);
    evidence.launch('s', 10);
    expect(evidence.blasted('s', v(500), 20000, 11)).toBe(true);
    expect(evidence.launched('s', 10 + TORPEDO_LIFETIME + 2)).toBe(true);
    expect(evidence.launched('s', 10 + TORPEDO_LIFETIME + 4)).toBe(false);
    evidence.forget('s');
    expect(evidence.blasted('s', v(500), 20000, 11)).toBe(false);
  });
});

describe('accusations', () => {
  it('forget what was said in the last round, so single false reports never add up over rounds', () => {
    const accusations = new Accusations();
    expect(accusations.add('c', 'a', true, 3)).toBe(false);
    accusations.newRound();
    expect(accusations.add('c', 'b', true, 3)).toBe(false);
    expect(accusations.add('c', 'a', true, 3)).toBe(true);
  });

  it('name a cheater once two Hosts who fly say so, never on its own word', () => {
    const accusations = new Accusations();
    expect(accusations.add('c', 'c', true, 3)).toBe(false);
    expect(accusations.add('c', 'a', true, 3)).toBe(false);
    expect(accusations.add('c', 'a', true, 3)).toBe(false);
    expect(accusations.add('c', 'b', true, 3)).toBe(true);
    expect(accusations.add('c', 'd', true, 3)).toBe(false);
    accusations.forget('b');
    expect(accusations.add('c', 'e', true, 3)).toBe(false);
  });

  it('take a majority of the others in a fuller round, so two tabs cannot vote a Host out', () => {
    expect(accusersNeeded(3)).toBe(2);
    expect(accusersNeeded(5)).toBe(3);
    expect(accusersNeeded(8)).toBe(4);
    const accusations = new Accusations();
    expect(accusations.add('v', 'x1', true, 6)).toBe(false);
    expect(accusations.add('v', 'x2', true, 6)).toBe(false);
    expect(accusations.add('v', 'h', true, 6)).toBe(true);
  });

  it('give watching Hosts no vote: a cheater coming in to watch with many tabs cannot take the majority', () => {
    const accusations = new Accusations();
    // three pilots fly; the accused is one of them, four tabs of a cheater only watch
    for (const tab of ['w1', 'w2', 'w3', 'w4']) expect(accusations.add('h', tab, false, 3)).toBe(false);
    expect(accusations.add('h', 'p1', true, 3)).toBe(false);
    expect(accusations.add('h', 'p2', true, 3)).toBe(true);
  });
});
