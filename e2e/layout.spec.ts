import { expect, test, type Page } from '@playwright/test';
import { openGame, startSolo } from './game';

/**
 * The HUD's pieces never cover each other: the race or school panel, the alarms with the
 * message, the subtitles of the transmission, the radar, the gauges, the radio, the kill feed,
 * the touch buttons, the height and climb and the fixed references. Each is filled as full as it gets (three alarms with a message, a long
 * line on the radio) and measured on a wide and on a small landscape screen, with keyboard and
 * with touch controls, in a race and in the flight school.
 */
const SCREENS = [
  { width: 1280, height: 720 },
  { width: 800, height: 360 },
];

/** The pieces that must keep apart; a group's members (the alarm column) may stack, not overlap. */
const PIECES = ['.hud-top', '#hud-room', '#school-panel', '#hud-split', '#hud-alerts > *', '#transmission', '#radar', '.hud-bottom', '#killfeed', '#now-playing', '.touch-button', '#hud-altitude', '.reference'];

/** Fills the HUD and returns every pair of its pieces that overlap, with their boxes. */
async function overlaps(page: Page, touch: boolean): Promise<string[]> {
  return page.evaluate(
    async ([pieces, touch]) => {
      const game = window.game;
      document.body.classList.toggle('touch', touch);
      game.hud.flashMessage(game.time, 'Missed gate 3: turn back and fly through it', 100);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      game.timeScale = 0;
      const Vector = game.camera.position.constructor;
      const alarm = (id: string, level: string, text: string) => ({ id, level, text, direction: new Vector(1, 0, 0), hasDirection: true, seconds: 3.2, tone: null, active: true, was: level });
      game.hud.setAlarms([alarm('impact', 'critical', 'IMPACT'), alarm('torpedo', 'warning', 'TORPEDO INBOUND'), alarm('laser', 'caution', 'LASER OVERHEATED')], game.camera);
      const box = document.getElementById('transmission')!;
      box.hidden = false;
      document.getElementById('transmission-speaker')!.textContent = 'The Orange President';
      document.getElementById('transmission-text')!.textContent = 'Very stable orbit. Very stable genius. The best games, believe me, the very best.';
      // the fixed references give way to the panels as they were laid out the frame before
      for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
      type Box = { left: number; top: number; right: number; bottom: number };
      const join = (a: Box | null, b: Box | null): Box | null => (!a ? b : !b ? a : { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
      const range = document.createRange();
      /** What an element shows on screen: its whole box where it draws one (a plate, a canvas, a button), else the text and children inside it. */
      const ink = (element: Element): Box | null => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        // a fixed reference draws its glyph in its own box, its label beside it
        if (element.matches('.reference')) return join(rect, ink(element.firstElementChild!));
        const drawn = element.matches('canvas, button') || !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) + parseFloat(style.borderLeftWidth) > 0;
        if (drawn) return rect;
        let box: Box | null = null;
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) {
            range.selectNodeContents(node);
            const r = range.getBoundingClientRect();
            if (r.width > 0) box = join(box, r);
          } else if (node instanceof Element) box = join(box, ink(node));
        }
        return box;
      };
      const found: { name: string; rect: Box }[] = [];
      for (const selector of pieces) {
        document.querySelectorAll<HTMLElement>(selector).forEach((element, i) => {
          if (element.closest('[hidden]')) return;
          const rect = ink(element);
          if (rect) found.push({ name: `${selector}${i ? `[${i}]` : ''}${element.id ? `#${element.id}` : ''}`, rect });
        });
      }
      const pairs: string[] = [];
      const box2 = (r: Box) => `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
      for (let a = 0; a < found.length; a++) {
        for (let b = a + 1; b < found.length; b++) {
          const p = found[a].rect;
          const q = found[b].rect;
          const x = Math.min(p.right, q.right) - Math.max(p.left, q.left);
          const y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (x > 1 && y > 1) pairs.push(`${found[a].name} ${box2(p)} × ${found[b].name} ${box2(q)}`);
        }
      }
      box.hidden = true;
      game.timeScale = 1;
      return pairs;
    },
    [PIECES, touch] as const,
  );
}

for (const where of ['race', 'school'] as const) {
  test(`the HUD's pieces keep apart in the ${where}`, async ({ page }) => {
    test.setTimeout(300_000);
    await openGame(page);
    if (where === 'race') await startSolo(page, 'race');
    else await page.evaluate(() => document.getElementById('school-racer')!.click());
    await page.waitForFunction(() => window.game.state === 'playing' && !document.getElementById('school-panel')!.hidden, null, { timeout: 120_000 });
    const found: string[] = [];
    for (const screen of SCREENS) {
      await page.setViewportSize(screen);
      for (const touch of [false, true]) for (const pair of await overlaps(page, touch)) found.push(`${screen.width}x${screen.height}${touch ? ' touch' : ''}: ${pair}`);
    }
    expect(found).toEqual([]);
  });
}
