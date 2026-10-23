import type { Page } from '@playwright/test';

/**
 * Devices the browser tests can pretend to be (PROFILE=<name>): the screen as the device's
 * Chrome shows it, touch, and the CPU slowed through the DevTools protocol to the device's speed
 * in a browser benchmark. The GPU cannot be slowed: the test browser draws in software
 * (swiftshader), slow in its own way, so its frame times only compare features and tiers with
 * each other, at the device's pixel count, where fill rate decides.
 */
export interface Profile {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  /** How many times slower the CPU runs (Emulation.setCPUThrottlingRate). */
  cpuThrottling: number;
}

/**
 * The Pixel 8 (Tensor G3: one Cortex-X3 at 2.9 GHz, four A715 at 2.4 GHz, four A510 at
 * 1.7 GHz; Mali-G715 MP7; 8 GB), held sideways: its 412 × 915 CSS pixels at a ratio of 2.625,
 * 2400 × 1080 device pixels (Notebookcheck's review; yesviz.com and blisk.io for viewport and
 * ratio). Chrome's bars take some of the height in a browser tab; the full screen counts here,
 * as in the game's fullscreen. Its Chrome 116 makes 136 runs/min in Speedometer 2.0
 * (Notebookcheck); cpuThrottling is calibrated against it (see e2e/README.md).
 */
export const PIXEL8: Profile = {
  viewport: { width: 915, height: 412 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  cpuThrottling: 6.3,
};

export const PROFILES: Record<string, Profile> = { pixel8: PIXEL8 };

/** The profile PROFILE names, or none. */
export function chosenProfile(): Profile | null {
  const name = process.env.PROFILE;
  if (!name) return null;
  const profile = PROFILES[name];
  if (!profile) throw new Error(`unknown PROFILE ${name}: ${Object.keys(PROFILES).join(', ')}`);
  return profile;
}

/** Slows the page's CPU as the profile says (the screen and touch come with the browser context, see contextOptions). */
export async function throttle(page: Page, profile: Profile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottling });
}

/** The browser context's options for a profile. */
export function contextOptions(profile: Profile) {
  const { viewport, deviceScaleFactor, isMobile, hasTouch } = profile;
  return { viewport, deviceScaleFactor, isMobile, hasTouch };
}
