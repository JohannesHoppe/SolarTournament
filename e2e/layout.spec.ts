import { expect, test, type Page } from '@playwright/test';
import { openGame, startSolo } from './game';

/**
 * The HUD's pieces never cover each other: the race or school panel, the alarms with the
 * message, the subtitles of the transmission, the radar, the gauges, the radio, the kill feed,
 * the touch buttons, the height and climb and the fixed references; and the share button in the radio box stays in view, nothing on top of it. Each is filled as full as it gets (three alarms with a message, a long
 * line on the radio) and measured on a wide and on a small landscape screen, with keyboard and
 * with touch controls, in a race and in the flight school.
 */
const SCREENS = [
  { width: 1280, height: 720 },
  { width: 800, height: 360 },
];

/**
 * The pieces that must keep apart; a group's members (the alarm column) may stack, not overlap.
 * The names beside the arrows of ships off screen keep apart from them and from each other.
 */
const PIECES = ['.hud-top', '#hud-room', '#school-panel', '#hud-split', '#hud-alerts > *', '#transmission', '#radar', '.hud-bottom', '#killfeed', '#now-playing', '.touch-button', '#hud-altitude', '.reference', '.marker.offscreen:not(.crowded) .tag'];

/**
 * Fills the HUD and returns every pair of its pieces that overlap, with their boxes; in a round
 * with rivals, they fly off screen all around, some bunched at one edge, and on the wide screen
 * at least one name must stand beside its arrow (on the small one, filled this full, the HUD may
 * leave a name no room: then its arrow goes alone).
 */
async function overlaps(page: Page, touch: boolean): Promise<string[]> {
  return page.evaluate(
    async ([pieces, touch]) => {
      const game = window.game;
      // the HUD's own measure of what a piece shows, as the dev server serves it
      const inkModule: string = '/src/view/ink.ts';
      const { ink } = (await import(inkModule)) as typeof import('../src/view/ink');
      document.body.classList.toggle('touch', touch);
      game.hud.flashMessage(game.time, 'Missed gate 3: turn back and fly through it', 100);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      game.timeScale = 0;
      const Vector = game.camera.position.constructor;
      const camera = game.camera;
      const rivals = game.ships.filter((ship: { id: string }) => ship !== game.me);
      // four bunched just past the right edge, the others behind, all around; placed anew where the camera looks now
      const place = () =>
        rivals.forEach((ship: Record<string, any>, i: number) => {
          const angle = (i * 2 * Math.PI) / rivals.length;
          const offset = i < 4 ? new Vector(1500, 0, -600 + i * 120) : new Vector(Math.cos(angle) * 900, Math.sin(angle) * 900, 1500);
          ship.alive = true;
          ship.respawnAt = Infinity;
          // in the camera's frame as the markers project it (the tests switch rendering off, which would update it)
          ship.flight.position.copy(offset.applyMatrix4(camera.matrixWorld));
        });
      place();
      const alarm = (id: string, level: string, text: string) => ({ id, level, text, direction: new Vector(1, 0, 0), hasDirection: true, seconds: 3.2, tone: null, active: true, was: level });
      game.hud.setAlarms([alarm('impact', 'critical', 'IMPACT'), alarm('torpedo', 'warning', 'TORPEDO INBOUND'), alarm('laser', 'caution', 'LASER OVERHEATED')], game.camera);
      const box = document.getElementById('transmission')!;
      box.hidden = false;
      document.getElementById('transmission-speaker')!.textContent = 'The Orange President';
      document.getElementById('transmission-text')!.textContent = 'Very stable orbit. Very stable genius. The best games, believe me, the very best.';
      // the HUD measures its pieces for the names at the edge twice a second, and the fixed
      // references give way to the panels as they were laid out the frame before: let both see these
      await new Promise((resolve) => setTimeout(resolve, 700));
      place();
      for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
      type Box = { left: number; top: number; right: number; bottom: number };
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
      // (a solar storm of the Corona blinds the sensors: then no ship has an arrow at all)
      const arrows = document.querySelectorAll('.marker.offscreen').length;
      if (arrows && innerWidth >= 1000 && !found.some(({ name }) => name.includes('.tag'))) pairs.push(`none of ${arrows} ships off screen has its name beside its arrow`);
      // the share button sits in the radio box, in view and on top: a click at its middle reaches it
      const share = document.getElementById('share')!;
      const at = share.getBoundingClientRect();
      const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
      if (at.width < 1 || !share.contains(hit)) pairs.push(`#share ${box2(at)} hidden or covered by ${hit?.id || hit?.className || hit?.nodeName}`);
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
