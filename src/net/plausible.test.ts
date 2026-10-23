import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Accusations, accusersNeeded, beamShare, Evidence, Plausibility, SenderClock, Strikes, type Margins, type Seen } from './plausible';
import { honestFlight, type Roughness } from '../test/honest';

const alive = (x: number, more = {}) => ({ p: [x, 0, 0], alive: true, ...more });
const dead = { p: [0, 0, 0], alive: false };
const v = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A ship seen for the first time, past the grace of its first sight. */
function flying(check: Plausibility, id = 's') {
  check.state(id, alive(0), 0);
  check.state(id, alive(0), 20);
  return check;
}

/** An orientation as a state sends it: the nose turned `angle` (rad) to the left of straight ahead (-z). */
const facing = (angle: number) => new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), angle).toArray();
/** A state at rest at the origin, its nose turned `angle`, spinning `w` (ship space). */
const posed = (angle: number, w = [0, 0, 0]): Seen => ({ p: [0, 0, 0], alive: true, q: facing(angle), w });
/** The ship's states 15 times a second, past the grace of its first sight, ending at t = 20. */
function steady(check: Plausibility, angle = 0) {
  check.state('s', posed(angle), 0);
  for (let t = 19; t <= 20; t += 1 / 15) check.state('s', posed(angle), t);
  return 20;
}

describe('plausibility of what other browsers report', () => {
  it('forgive flying and lag, but not a jump across the arena', () => {
    const check = flying(new Plausibility());
    // 250 m/s for a tenth of a second, then three seconds of silence at full speed
    expect(check.state('s', alive(500), 20.1)).toEqual([]);
    expect(check.state('s', alive(15500), 23.1)).toEqual([]);
    // across the arena in a tenth of a second
    expect(check.state('s', alive(100000), 23.2)).toEqual(['teleport']);
  });

  it('let a ship be printed elsewhere after a death it saw, a new round or its nova', () => {
    const check = flying(new Plausibility());
    check.died('s', 21);
    check.state('s', dead, 21);
    check.state('s', alive(90000), 24);
    expect(check.state('s', alive(90000), 34)).toEqual([]);
    check.newRound(35);
    expect(check.state('s', alive(0), 35.1)).toEqual([]);
    expect(check.state('s', alive(90000), 35.2)).toEqual([]);
  });

  it('take no new clone from a state alone: dying and living again in its own states does not let a ship jump', () => {
    const check = flying(new Plausibility());
    check.state('s', dead, 21);
    expect(check.state('s', alive(100000), 21.1)).toEqual(['teleport']);
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

  it("keep a nova core held through a start over, of the ship's browser or this one, until a new round", () => {
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
    expect(check.state('s', alive(100000), 22.1)).toEqual([]);
    expect(check.torpedo('s', 22.2)).toBeNull();
  });

  it('let kills grow only with the deaths everyone saw, double for a nova, and forgive kills told of a moment late', () => {
    const check = new Plausibility();
    check.state('s', alive(0, { kills: 3 }), 0);
    check.credit('s', 2, 1);
    expect(check.state('s', alive(0, { kills: 7 }), 2)).toEqual([]);
    // a nova takes four ships: its state shows eight kills before the victims' browsers tell of them
    expect(check.state('s', alive(0, { kills: 15 }), 3)).toEqual([]);
    check.credit('s', 8, 4);
    expect(check.state('s', alive(0, { kills: 15 }), 7)).toEqual([]);
    // kills nobody died for, for longer than the reports take
    expect(check.state('s', alive(0, { kills: 18 }), 8)).toEqual([]);
    expect(check.state('s', alive(0, { kills: 18 }), 11.5)).toEqual(['kills']);
    // a new round starts over from zero
    check.newRound(12);
    expect(check.state('s', alive(0, { kills: 0 }), 13)).toEqual([]);
    expect(check.state('s', alive(0, { kills: 2 }), 14)).toEqual([]);
  });

  it('remember who came close lately, for the kills of a shove', () => {
    const check = new Plausibility();
    for (let t = 0; t <= 2; t += 0.1) {
      check.state('a', alive(t * 5000), t);
      check.state('b', alive(t * 5000 + 400), t);
    }
    // three seconds later the shoved ship crashes 2 km away from its shover
    for (let t = 2; t <= 5; t += 0.1) {
      check.state('a', alive(10000 - (t - 2) * 5000), t);
      check.state('b', alive(10400 + (t - 2) * 10000), t);
    }
    expect(check.met('a', 'b', 30000)).toBe(true);
    expect(check.met('a', 'c', 30000)).toBe(false);
    for (let t = 5; t <= 11; t += 0.1) {
      check.state('a', alive(-200000), t);
      check.state('b', alive(200000), t);
    }
    expect(check.met('a', 'b', 30000)).toBe(false);
  });
});

describe("a ship's nose", () => {
  it('turns no faster than its spin says: a nose that swings round between two states is a cheat', () => {
    const check = new Plausibility();
    const t = steady(check);
    // half a turn in a fifteenth of a second, and a quarter, both said to be still
    expect(check.state('s', posed(Math.PI), t + 1 / 15)).toEqual(['spin']);
    expect(check.state('s', posed(Math.PI / 2), t + 2 / 15)).toEqual(['spin']);
  });

  it('turns as fast as its spin says, when the spin grows no faster than thrusters and blows make it', () => {
    const check = new Plausibility();
    let t = steady(check);
    // the stick slammed over: 4.5 rad/s, reached in an eighth of a second
    let angle = 0;
    for (let i = 1; i <= 15; i++) {
      t += 1 / 15;
      const rate = Math.min(4.5, i * 2.5);
      angle += rate / 15;
      expect(check.state('s', posed(angle, [0, rate, 0]), t)).toEqual([]);
    }
    // a spin of 40 rad/s out of nowhere, with the nose turned as it says
    t += 1 / 15;
    expect(check.state('s', posed(angle + 40 / 15, [0, 40, 0]), t)).toEqual(['spin']);
  });

  it('forgives a shove that spins the hull between two states', () => {
    const check = new Plausibility();
    let t = steady(check);
    // a shove sets it spinning at 6 rad/s, the flight computer catches it again within a quarter of a second
    let angle = 0;
    for (const rate of [6, 4.4, 2.8, 1.2, 0]) {
      t += 1 / 15;
      angle += rate / 15;
      expect(check.state('s', posed(angle, [0, rate, 0]), t)).toEqual([]);
    }
  });

  it('allows for the time a jammed link held the states back, as their sender counts it', () => {
    const check = new Plausibility();
    const clock = new SenderClock();
    check.state('s', posed(0), 0, clock.sent('p', 100, 0.05));
    for (let t = 19; t <= 20; t += 1 / 15) check.state('s', posed(0, [0, 4, 0]), t + 0.05, clock.sent('p', 100 + t, t + 0.05));
    // two seconds of turning at 4 rad/s arrive at once
    let cheats: string[] = [];
    let angle = 0;
    for (let i = 1; i <= 30; i++) {
      angle += 4 / 15;
      cheats = cheats.concat(check.state('s', posed(angle, [0, 4, 0]), 22.05 + i * 0.001, clock.sent('p', 120 + i / 15, 22.05 + i * 0.001)));
    }
    expect(cheats).toEqual([]);
  });

  it('takes a beam only along a nose the ship could have had, from where it was', () => {
    const check = new Plausibility();
    const t = steady(check);
    // straight ahead, short and long, from a muzzle beside the nose
    check.beam('s', v(120, -34, -200), v(0, 0, -400));
    check.beam('s', v(-120, -34, -200), v(0, 0, -60000));
    expect(check.state('s', posed(0), t + 1 / 15)).toEqual([]);
    // square to the nose, which was still before and after
    check.beam('s', v(0, 0, -200), v(20000, 0, -200));
    expect(check.state('s', posed(0), t + 2 / 15)).toEqual(['aim']);
    // from 5 km away
    check.beam('s', v(100000, 0, 0), v(100000, 0, -20000));
    expect(check.state('s', posed(0), t + 3 / 15)).toEqual(['aim']);
  });

  it('takes a beam fired while the nose swung round with its spin', () => {
    const check = new Plausibility();
    let t = steady(check);
    let angle = 0;
    for (let i = 1; i <= 10; i++) {
      t += 1 / 15;
      const before = angle;
      angle += 4.2 / 15;
      // fired halfway through the turn between two states
      const nose = v(0, 0, -1).applyAxisAngle(v(0, 1, 0), (before + angle) / 2);
      check.beam('s', v(0, 0, 0), nose.multiplyScalar(30000));
      expect(check.state('s', posed(angle, [0, 4.2, 0]), t)).toEqual([]);
    }
  });

  it('judges no nose across a new clone, a new round or a start over', () => {
    const check = new Plausibility();
    const t = steady(check);
    check.died('s', t);
    check.state('s', { ...posed(0), alive: false }, t + 0.05);
    expect(check.state('s', posed(Math.PI), t + 3)).toEqual([]);
    check.newRound(t + 4);
    expect(check.state('s', posed(0), t + 4.1)).toEqual([]);
  });
});

describe("a sender's clock", () => {
  it('counts the time between states as they were sent, not as they arrived', () => {
    const clock = new SenderClock();
    expect(clock.sent('p', 10, 100.05)).toBe(10);
    expect(clock.sent('p', 11, 101.05)).toBeCloseTo(11);
    // a stall: the states of three seconds arrive at once
    expect(clock.sent('p', 12, 104.05)).toBeCloseTo(12);
    expect(clock.sent('p', 14, 104.06)).toBeCloseTo(14);
  });

  it('gives a peer that says its states are newer than they are no time to fly', () => {
    const check = new Plausibility();
    const clock = new SenderClock();
    for (let t = 0; t <= 20; t += 0.5) check.state('s', alive(0), t, clock.sent('p', t, t + 0.05));
    // a state that claims ten seconds passed when a tenth did, five kilometers off
    expect(check.state('s', alive(100000), 20.15, clock.sent('p', 30, 20.15))).toEqual(['teleport']);
  });

  it('lets an honest ship whose states were held up by the link arrive where it flew meanwhile', () => {
    const check = new Plausibility();
    const clock = new SenderClock();
    const at = (t: number) => alive(t * 8000);
    for (let t = 0; t <= 20; t += 0.1) check.state('s', at(t), t + 0.05, clock.sent('p', t, t + 0.05));
    // at 400 m/s, the states of three seconds wait in the link and arrive at once
    let cheats: string[] = [];
    for (let t = 20.1; t <= 23; t += 0.1) cheats = cheats.concat(check.state('s', at(t), 23.05, clock.sent('p', t, 23.05)));
    expect(cheats).toEqual([]);
    // on the arrival clock alone, the same burst would look like a jump
    const naive = new Plausibility();
    for (let t = 0; t <= 20; t += 0.1) naive.state('s', at(t), t);
    naive.state('s', at(20), 20.05);
    expect(naive.state('s', at(23), 20.06)).toEqual(['teleport']);
  });
});

describe('honest flights', () => {
  /** Flies honest ships through rough rounds and links: what the checks find, and how close they came. */
  function fly(rough: Roughness, seeds: number, seconds: number) {
    const cheats: string[] = [];
    const margins: Margins = {};
    for (let seed = 1; seed <= seeds; seed++) {
      const check = new Plausibility();
      const clock = new SenderClock();
      for (const message of honestFlight(seed, seconds, rough)) {
        if (message.kind === 'beam') check.beam('s', message.from, message.to);
        else cheats.push(...check.state('s', message.seen, message.at, clock.sent('p', message.clock, message.at)));
      }
      for (const [cheat, share] of Object.entries(check.margins)) margins[cheat as keyof Margins] = Math.max(margins[cheat as keyof Margins] ?? 0, share);
    }
    return { cheats, margins };
  }

  it('never look like cheats: slammed sticks, flips, path steering, beams, blows, stutters and stalls', () => {
    for (const rough of [
      { blows: 1000, stutter: 1000, stalls: 1000, wrecked: false },
      { blows: 2, stutter: 3, stalls: 10, wrecked: false },
      { blows: 1, stutter: 1, stalls: 4, wrecked: true },
    ]) {
      const { cheats, margins } = fly(rough, 6, 60);
      expect(cheats).toEqual([]);
      // with room to spare
      for (const share of Object.values(margins)) expect(share).toBeLessThan(0.8);
    }
  });
});

describe('strikes', () => {
  it('report a ship only for what it does again and again, not for a burst of one moment', () => {
    const strikes = new Strikes();
    // a lag spike: ten bad beams within half a second count once
    for (let i = 0; i < 10; i++) expect(strikes.add('s', 'aim', 10 + i * 0.05)).toBe(false);
    expect(strikes.count('s', 'aim')).toBe(1);
    expect(strikes.add('s', 'aim', 11)).toBe(false);
    expect(strikes.add('s', 'teleport', 11.5)).toBe(false);
    expect(strikes.add('s', 'aim', 12)).toBe(true);
  });

  it('forget what lies too far back, and start over with a new round', () => {
    const strikes = new Strikes();
    strikes.add('s', 'spin', 0);
    strikes.add('s', 'spin', 20);
    expect(strikes.add('s', 'spin', 40)).toBe(false);
    strikes.add('s', 'hit', 50);
    strikes.add('s', 'hit', 51);
    strikes.newRound();
    expect(strikes.add('s', 'hit', 52)).toBe(false);
  });
});

describe('evidence of what a ship did', () => {
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
    expect(evidence.launched('s', 24)).toBe(true);
    expect(evidence.launched('s', 26)).toBe(false);
    evidence.forget('s');
    expect(evidence.blasted('s', v(500), 20000, 11)).toBe(false);
  });

  it('takes a hit on the own ship from a beam that starts near its shooter and passes near the ship', () => {
    const ahead = v(1, 0, 0);
    expect(beamShare(v(0), ahead, v(10000), v(50000, 5000))).toBeLessThan(1);
    // from 2 km beside its shooter, or past the ship by 2 km, or from behind the ship
    expect(beamShare(v(0, 40000), ahead, v(0), v(50000, 40000))).toBeGreaterThan(1);
    expect(beamShare(v(0), ahead, v(0), v(50000, 40000))).toBeGreaterThan(1);
    expect(beamShare(v(0), ahead, v(0), v(-50000))).toBeGreaterThan(1);
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
