import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAIN_THRUST, OVERDRIVE_PUSH, OVERDRIVE_SECONDS, RCS_THRUST } from './flight';
import { feltLoad, G } from './ship';
import { EXTREME_G, extremeAfter, HAND_LAG, HAND_WOBBLE, StrainHand } from './strainhand';
import { Randomizer } from '../random';
import { IDLE } from '../input/input';

const STEP = 1 / 60;

/** The bite after `seconds` under a steady load of `g`. */
function biteUnder(g: number, seconds: number) {
  let bite = 0;
  for (let t = 0; t < seconds; t += STEP) bite = extremeAfter(bite, g * G, STEP);
  return bite;
}

describe("a clone's hands under extreme g", () => {
  it('fly through everything ordinary hard flying asks: a full burn, a race bend, the overdrive', () => {
    // the drive's full push with the thrusters' full on top
    expect(biteUnder(feltLoad(new THREE.Vector3(RCS_THRUST, 0, -MAIN_THRUST)) / G, 30)).toBe(0);
    // the overdrive's shove, spread over its time
    expect(OVERDRIVE_PUSH / OVERDRIVE_SECONDS / G).toBeLessThan(EXTREME_G);
    expect(biteUnder(OVERDRIVE_PUSH / OVERDRIVE_SECONDS / G, OVERDRIVE_SECONDS)).toBe(0);
    // the hardest race bend the simulated Host flies (34 g, the Throat's carve), held long
    expect(biteUnder(34, 10)).toBe(0);
  });

  it('bite past the onset: a carve deep in air at 40 g, full in half a second, gone a second after', () => {
    expect(biteUnder(40, 0.5)).toBeGreaterThan(0.99);
    let bite = 1;
    for (let t = 0; t < 1; t += STEP) bite = extremeAfter(bite, 10 * G, STEP);
    expect(bite).toBe(0);
  });

  it('pass the stick on untouched unbitten, and late and unsteady but never lost at the full bite', () => {
    const hand = new StrainHand();
    const out = { ...IDLE };
    const random = new Randomizer(3);
    const draw = () => random.nextFloat();
    const stick = { ...IDLE, yaw: 0.5, pitch: -0.3 };
    expect(hand.step(stick, 0, STEP, draw, out)).toEqual(stick);
    // a step of the stick at the full bite: answered after about HAND_LAG, never more than a wobble off
    const swing = { ...IDLE, yaw: -0.5, pitch: -0.3 };
    hand.step(swing, 1, STEP, draw, out);
    expect(out.yaw).toBeGreaterThan(0);
    let wobble = 0;
    for (let t = 0; t < 3; t += STEP) {
      hand.step(swing, 1, STEP, draw, out);
      if (t > 4 * HAND_LAG) wobble = Math.max(wobble, Math.abs(out.yaw - swing.yaw), Math.abs(out.pitch - swing.pitch));
    }
    expect(wobble).toBeGreaterThan(0);
    expect(wobble).toBeLessThan(5 * HAND_WOBBLE);
  });
});
