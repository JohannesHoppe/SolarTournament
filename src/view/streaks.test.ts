import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { flowAt, flowRate, stillStale } from './streaks';
import { METERS_PER_UNIT } from '../ship/flight';

const FOCAL = 500;
const RATE = 1;
const out = { x: 0, y: 0 };

describe('motion streaks', () => {
  it('stream out of the middle when the ship flies where the camera looks', () => {
    // the camera looks along -z
    flowAt(200, 0, 0, 0, -1, RATE, FOCAL, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeCloseTo(0);
    // up on screen streams further up (the screen's y runs down)
    flowAt(0, 100, 0, 0, -1, RATE, FOCAL, out);
    expect(out.y).toBeLessThan(0);
    // the focus itself stands still
    flowAt(0, 0, 0, 0, -1, RATE, FOCAL, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0);
  });

  it('stream out of the Course point wherever it lies on screen', () => {
    // flying 20° right of the view: the focus is right of the middle, at focal × tan 20°
    const a = (20 * Math.PI) / 180;
    const focus = FOCAL * Math.tan(a);
    flowAt(focus, 0, Math.sin(a), 0, -Math.cos(a), RATE, FOCAL, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0);
    flowAt(focus + 100, 0, Math.sin(a), 0, -Math.cos(a), RATE, FOCAL, out);
    expect(out.x).toBeGreaterThan(0);
    flowAt(focus - 100, 0, Math.sin(a), 0, -Math.cos(a), RATE, FOCAL, out);
    expect(out.x).toBeLessThan(0);
  });

  it('stream across the screen, away from the side the ship slides to', () => {
    // sliding right, square to the view: everything streams left alike
    flowAt(-300, 100, 1, 0, 0, RATE, FOCAL, out);
    const left = out.x;
    expect(left).toBeLessThan(0);
    expect(out.y).toBeCloseTo(0);
    flowAt(300, -100, 1, 0, 0, RATE, FOCAL, out);
    expect(out.x).toBeCloseTo(left);
  });

  it('stream into the Brake point when the ship flies backwards', () => {
    flowAt(200, -100, 0, 0, 1, RATE, FOCAL, out);
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBeLessThan(0);
  });

  it('flow faster the faster the ship goes, and never wildly', () => {
    const at = (ms: number) => flowRate(ms / METERS_PER_UNIT);
    expect(at(0)).toBe(0);
    expect(at(50)).toBeLessThan(at(150));
    expect(at(150)).toBeCloseTo(0.6);
    expect(at(250)).toBeCloseTo(0.75);
    expect(at(10000)).toBeLessThan(1.2);
  });

  it('standing dashes (reduced motion) are drawn anew when the speed changes, not only when the flow turns', () => {
    const ahead = new THREE.Vector3(0, 0, -1);
    const drawn = { count: 10, direction: ahead.clone(), fade: 0, rate: flowRate(20) };
    expect(stillStale(drawn, 10, ahead, 0, flowRate(20))).toBe(false);
    // a straight burn from rest: same direction, the fade and rate grow
    expect(stillStale(drawn, 10, ahead, 0.5, flowRate(100))).toBe(true);
    // braking straight down from speed
    const fast = { count: 10, direction: ahead.clone(), fade: 1, rate: flowRate(2000) };
    expect(stillStale(fast, 10, ahead, 0.3, flowRate(60))).toBe(true);
    expect(stillStale(fast, 10, new THREE.Vector3(0.1, 0, -1).normalize(), 1, flowRate(2000))).toBe(true);
    expect(stillStale(fast, 12, ahead, 1, flowRate(2000))).toBe(true);
  });
});
