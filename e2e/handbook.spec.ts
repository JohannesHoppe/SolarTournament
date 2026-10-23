import { expect, test } from '@playwright/test';
import { LOCALES } from '../src/i18n/i18n';

/**
 * The Pilot's Handbook opens in each of the game's languages without an error, every text in
 * that language and every number filled in, fits a phone without scrolling sideways, and a link
 * to one of its sections lands there.
 */
for (const locale of LOCALES) {
  test(`the handbook reads in ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    await page.addInitScript((chosen) => localStorage.setItem('solartournament.language', chosen), locale);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/handbook.html#torpedoes');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const text = await page.locator('main').innerText();
    // every placeholder got its number
    expect(text).not.toMatch(/\{\w+\}/);
    expect(await page.locator('section').count()).toBe(14);
    // the language's own words: the contents differ from the English ones
    const contents = await page.locator('.handbook-contents').innerText();
    if (locale === 'en') expect(contents).toContain('Dirty tricks');
    else expect(contents).not.toContain('Dirty tricks');
    // a phone reads it without scrolling sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // the link to a section lands on it
    expect(await page.evaluate(() => Math.abs(document.getElementById('torpedoes')!.getBoundingClientRect().top) < 40)).toBe(true);
    expect(errors).toEqual([]);
  });
}
