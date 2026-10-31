import { describe, expect, it } from 'vitest';
import { BACKOFF_SECONDS, CAP_STEPS, COOLDOWN_SECONDS, DOWN_SECONDS, Governor, Governors, guessTier, LADDER, STABLE_SECONDS, tierOf, TIER_RUNGS, UP_SECONDS, type DeviceHints, type Scene } from './quality';

/** Feeds the governor `seconds` of frames at `fps`, each with `busy` (share of the frame) of own work; returns the rungs it switched to. */
function run(governor: Governor, seconds: number, fps: number | ((rung: number) => number), busy = 0.2) {
  const switched: number[] = [];
  for (let t = 0; t < seconds; ) {
    const rate = typeof fps === 'number' ? fps : fps(governor.rung);
    const dt = 1 / rate;
    const next = governor.sample(dt, dt * busy);
    if (next !== null) switched.push(next);
    t += dt;
  }
  return switched;
}

describe('the quality ladder', () => {
  it('only ever gets cheaper from rung to rung', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [above, below] = [LADDER[i - 1], LADDER[i]];
      expect(below.pixelRatio).toBeLessThanOrEqual(above.pixelRatio);
      expect(below.bloom).toBeLessThanOrEqual(above.bloom);
      expect(below.shadows).toBeLessThanOrEqual(above.shadows);
      expect(below.particles).toBeLessThanOrEqual(above.particles);
      expect(below.rocks).toBeLessThanOrEqual(above.rocks);
      expect(below.belt).toBeLessThanOrEqual(above.belt);
      expect(below.landmark).toBeLessThanOrEqual(above.landmark);
      expect(below.lens).toBeLessThanOrEqual(above.lens);
      expect(below.showcase.pixelRatio).toBeLessThanOrEqual(above.showcase.pixelRatio);
      expect(below.showcase.every).toBeGreaterThanOrEqual(above.showcase.every);
      if (!above.lacquer) expect(below.lacquer).toBe(false);
      if (!above.showcase.shadows) expect(below.showcase.shadows).toBe(false);
      // every rung changes something
      expect(JSON.stringify(below)).not.toBe(JSON.stringify(above));
    }
  });

  it('has the tiers as presets on it, high on the full picture', () => {
    expect(TIER_RUNGS.high).toBe(0);
    expect(TIER_RUNGS.medium).toBeGreaterThan(TIER_RUNGS.high);
    expect(TIER_RUNGS.low).toBeGreaterThan(TIER_RUNGS.medium);
    expect(TIER_RUNGS.low).toBeLessThan(LADDER.length);
    for (const [tier, rung] of Object.entries(TIER_RUNGS)) expect(tierOf(rung)).toBe(tier);
  });
});

describe('the guess of a device', () => {
  const desktop: DeviceHints = { renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', touch: false, cores: 10, memory: 8 };
  it('starts a desktop with a GPU high, a software renderer and a phone low', () => {
    expect(guessTier(desktop)).toBe('high');
    expect(guessTier({ ...desktop, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)' })).toBe('low');
    expect(guessTier({ renderer: 'Mali-G715', touch: true, cores: 9, memory: 8 })).toBe('low');
  });
  it('starts a small machine or an integrated Intel GPU on medium', () => {
    expect(guessTier({ ...desktop, cores: 4 })).toBe('medium');
    expect(guessTier({ ...desktop, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('medium');
  });
});

describe('the governor', () => {
  it('steps down a rung after a stretch below the target frame rate, not before', () => {
    const governor = new Governor(0);
    expect(run(governor, COOLDOWN_SECONDS + DOWN_SECONDS * 0.9, 30)).toEqual([]);
    expect(run(governor, DOWN_SECONDS * 0.2, 30)).toEqual([1]);
  });

  it('waits out its cooldown after a change before it steps again', () => {
    const governor = new Governor(0);
    run(governor, COOLDOWN_SECONDS + DOWN_SECONDS + 0.1, 30);
    expect(governor.rung).toBe(1);
    // still slow, but the new picture settles first
    expect(run(governor, COOLDOWN_SECONDS + DOWN_SECONDS * 0.9, 30)).toEqual([]);
    expect(run(governor, DOWN_SECONDS * 0.2, 30)).toEqual([2]);
  });

  it('steps down rung by rung while the device cannot keep up, down to the last', () => {
    // the frame's own work fills the frame: every rung is too slow
    const busy = new Governor(0);
    run(busy, 600, 20, 0.9);
    expect(busy.rung).toBe(LADDER.length - 1);
    // the GPU is the bottleneck: little work of its own, but every rung down draws a little faster
    const gpu = new Governor(0);
    run(gpu, 600, (rung) => 20 * 1.07 ** rung, 0.2);
    expect(gpu.rung).toBe(LADDER.length - 1);
    expect(gpu.cap).toBe(0);
  });

  it('takes a screen capped at 30 Hz for the screen, not for a slow device', () => {
    // every rung runs at 30 frames/s with a quarter of the frame spent on its own work
    const governor = new Governor(2);
    const stable: number[] = [];
    governor.stable = (rung) => stable.push(rung);
    const switched = run(governor, 600, 30, 0.25);
    // a few rungs down find nothing gained, and it goes back to where it was and stays
    expect(switched).toEqual([...Array.from({ length: CAP_STEPS }, (_, i) => 3 + i), 2]);
    expect(governor.rung).toBe(2);
    expect(governor.cap).toBeCloseTo(30, 0);
    // a capped screen's rung is never kept as the device's
    expect(stable).toEqual([]);
    // once the cap is lifted, the governor watches as before: smooth and with headroom, it climbs
    expect(run(governor, STABLE_SECONDS + 1, 60, 0.25).length).toBeGreaterThan(0);
    expect(governor.cap).toBe(0);
  });

  it('does not take a fill-rate-bound GPU for a capped screen: rungs that only thin rocks gain nothing', () => {
    // 40 frames/s on the first rungs (rocks only), the lower resolutions run at 52
    const fps = (rung: number) => (LADDER[rung].pixelRatio < LADDER[0].pixelRatio ? 52 : 40 + rung * 0.4);
    const governor = new Governor(0);
    run(governor, 600, fps, 0.2);
    expect(governor.cap).toBe(0);
    expect(governor.rung).toBeGreaterThanOrEqual(3);
  });

  it('steps down under a cap once the device itself gets slower than the cap', () => {
    const governor = new Governor(2);
    run(governor, 120, 30, 0.25);
    expect(governor.rung).toBe(2);
    // a heavier scene: 20 frames/s under the 30 Hz cap, the work filling the frame
    run(governor, COOLDOWN_SECONDS + DOWN_SECONDS + 0.1, 20, 0.9);
    expect(governor.rung).toBe(3);
  });

  it('steps up a rung after a long smooth stretch with headroom, not without', () => {
    const smooth = new Governor(5);
    expect(run(smooth, COOLDOWN_SECONDS + UP_SECONDS * 0.9, 60)).toEqual([]);
    expect(run(smooth, UP_SECONDS * 0.3, 60)).toEqual([4]);
    // the frame's own work fills most of it: the next rung up would not keep up
    const busy = new Governor(5);
    expect(run(busy, COOLDOWN_SECONDS + UP_SECONDS * 4, 60, 0.9)).toEqual([]);
    // a stretch below the smooth rate starts the run anew
    const choppy = new Governor(5);
    expect(run(choppy, COOLDOWN_SECONDS + UP_SECONDS * 0.6, 60)).toEqual([]);
    expect(run(choppy, DOWN_SECONDS, 54)).toEqual([]);
    expect(run(choppy, UP_SECONDS * 0.6, 60)).toEqual([]);
  });

  it('does not seesaw between a rung that is too slow and the one below it', () => {
    // rung 3 and above run at 40 frames/s, rung 4 at the screen's 60
    const fps = (rung: number) => (rung < 4 ? 40 : 60);
    const governor = new Governor(3);
    const switched = run(governor, 600, fps);
    // each try of rung 3 is barred twice as long as the one before: a handful of tries in ten minutes
    expect(switched.filter((rung) => rung === 3).length).toBeLessThanOrEqual(Math.ceil(Math.log2(600 / BACKOFF_SECONDS)));
    expect(governor.rung).toBeGreaterThanOrEqual(3);
    // never back up within the bar after leaving the slow rung
    const again = new Governor(3);
    run(again, COOLDOWN_SECONDS + DOWN_SECONDS + 0.1, fps);
    expect(again.rung).toBe(4);
    expect(run(again, BACKOFF_SECONDS - 1, fps)).toEqual([]);
  });

  it("names the rung that held long enough as the device's", () => {
    const governor = new Governor(5);
    const stable: number[] = [];
    governor.stable = (rung) => stable.push(rung);
    run(governor, COOLDOWN_SECONDS + STABLE_SECONDS + 1, 52);
    expect(stable).toEqual([5]);
  });
});

describe('the governors of the menu and the round', () => {
  /** Feeds `seconds` of frames at `fps` drawn in `scene`; returns the rungs switched to. */
  function play(governors: Governors, scene: Scene, seconds: number, fps: number, busy = 0.2) {
    const switched: number[] = [];
    for (let t = 0; t < seconds; t += 1 / fps) {
      const next = governors.sample(1 / fps, busy / fps, scene);
      if (next !== null) switched.push(next);
    }
    return switched;
  }

  it("never lets the menu decide the round's rung, nor keep its own as the device's", () => {
    const governors = new Governors(3);
    const stable: number[] = [];
    governors.stable = (rung) => stable.push(rung);
    // the title screen's pad is slow on this device, its work filling the frame: the menu steps down a long way
    play(governors, 'menu', 120, 30, 0.9);
    expect(stable).toEqual([]);
    expect(governors.round).toBe(3);
    // the round starts on its own rung, smooth there, with nothing barred by the menu: it holds it and climbs
    expect(play(governors, 'round', 0.01, 60)).toEqual([3]);
    const climbed = play(governors, 'round', COOLDOWN_SECONDS + UP_SECONDS + 1, 60);
    expect(climbed).toEqual([2]);
    expect(stable).toEqual([]);
    play(governors, 'round', STABLE_SECONDS + COOLDOWN_SECONDS + 1, 52);
    expect(stable).toEqual([2]);
    // back in the menu, the menu's own rung returns
    expect(play(governors, 'menu', 0.01, 60)[0]).toBeGreaterThan(3);
  });
});
