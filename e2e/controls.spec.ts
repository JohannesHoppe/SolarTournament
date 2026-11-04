import { expect, test } from '@playwright/test';
import { openGame } from './game';

/** The controls sheet's open tab and its first row. */
const sheet = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({
    open: !document.getElementById('quicksheet')!.hidden,
    tab: document.querySelector<HTMLElement>('#quicksheet-tabs .selected')?.dataset.device,
    first: document.querySelector('#quicksheet-list dt')?.textContent,
  }));

test('the controls sheet opens at the device steered with last, with tabs for the others', async ({ page }) => {
  // a gamepad of the standard layout whose A button the test presses
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    (window as any).testPad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  const errors = await openGame(page);
  await page.waitForFunction(() => window.game.state === 'menu');

  // keyboard: F1 opens it at the keyboard's tab, F1 again closes it
  await page.keyboard.press('F1');
  expect(await sheet(page)).toEqual({ open: true, tab: 'keyboard', first: 'Mouse / Arrows' });
  await page.keyboard.press('F1');
  expect((await sheet(page)).open).toBe(false);

  // a gamepad's button pressed: the next sheet opens at the gamepad's tab
  await page.evaluate(async () => {
    const pad = (window as any).testPad;
    pad.buttons[3].value = 1;
    pad.buttons[3].pressed = true;
    for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    pad.buttons[3].value = 0;
    pad.buttons[3].pressed = false;
  });
  await page.evaluate(() => window.game.showControlsSheet(true));
  expect(await sheet(page)).toEqual({ open: true, tab: 'gamepad', first: 'Left stick' });

  // the other tabs are a click away
  await page.click('#quicksheet-tabs [data-device="touch"]');
  expect(await sheet(page)).toMatchObject({ tab: 'touch' });
  await page.click('#quicksheet-close');
  expect((await sheet(page)).open).toBe(false);

  // a finger on the screen: the touch screen's tab, from the pause menu's button too
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' })));
  await page.evaluate(() => window.game.showControlsSheet(true));
  expect(await sheet(page)).toEqual({ open: true, tab: 'touch', first: 'Left stick' });
  await page.evaluate(() => window.game.showControlsSheet(false));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' })));
  await page.evaluate(() => document.getElementById('pause-controls')!.click());
  expect(await sheet(page)).toEqual({ open: true, tab: 'keyboard', first: 'Mouse / Arrows' });
  expect(errors).toEqual([]);
});
