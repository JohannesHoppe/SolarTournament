import { describe, expect, it } from 'vitest';
import { GAME_URL, mailLink, shareLink, shareTargets } from './share';
import { newRoom, roomFromFragment, roomLink, type Room } from './net/room';
import { setLocale } from './i18n/i18n';

const BASE = 'https://solartournament.games/';

/** A running tournament as the game hands it to the share button (see Game.shareWhere). */
const online = (room: Room, base: string) => ({ name: room.name, public: room.public, link: roomLink(room, base) });

describe('sharing', () => {
  it('shares the game from the menu, the flight school, a solo round and the pages, each with its own text', () => {
    setLocale('en');
    const texts = new Set<string>();
    for (const where of ['menu', 'school', 'solo', 'radio', 'handbook'] as const) {
      const link = shareLink(where);
      expect(link.url).toBe(GAME_URL);
      expect(link.room).toBe(false);
      expect(link.private).toBe(false);
      expect(link.text).toContain('SolarTournament');
      texts.add(link.text);
    }
    expect(texts.size).toBe(5);
    expect(shareLink('menu').text).toBe('Five minutes. Die for the President. Again and again. SolarTournament');
  });

  it("shares a public tournament's own link, and the friend's browser finds the same room in it", () => {
    const room = newRoom("Kessler's Revenge", true, false, 'race');
    const link = shareLink(online(room, BASE));
    expect(link.url.startsWith(`${BASE}#t=${room.code}`)).toBe(true);
    expect(roomFromFragment(new URL(link.url).hash)).toEqual(room);
    expect(link.room).toBe(true);
    expect(link.private).toBe(false);
    expect(link.text).toContain("Kessler's Revenge");
  });

  it('shares a private tournament too, and says that its link lets anyone in', () => {
    const room = newRoom('Friends only', false, true, 'deathmatch');
    const link = shareLink(online(room, 'http://127.0.0.1:5173/?local=1'));
    expect(link.url).toMatch(/^http:\/\/127\.0\.0\.1:5173\/\?local=1#t=friends-only-/);
    expect(roomFromFragment(new URL(link.url).hash)).toEqual(room);
    expect(link.private).toBe(true);
  });

  it('speaks the language of the Host', () => {
    setLocale('de');
    expect(shareLink('menu').text).toBe('Fünf Minuten. Stirb für den Präsidenten. Immer und immer wieder. SolarTournament');
    setLocale('en');
  });

  it('hands the link to each network only as a plain https link, the whole link encoded', () => {
    const link = shareLink(online(newRoom('A & B #1', false, true, 'mixed'), BASE));
    const targets = shareTargets(link);
    expect(targets.map((target) => target.name)).toEqual(['X', 'Bluesky', 'WhatsApp', 'Telegram', 'Reddit', 'LinkedIn', 'Facebook', 'Threads']);
    for (const target of targets) {
      const url = new URL(target.href);
      expect(url.protocol).toBe('https:');
      // the room's fragment travels inside a parameter, never as the share page's own fragment
      expect(url.hash).toBe('');
      expect([...url.searchParams.values()].some((value) => value.includes(link.url))).toBe(true);
    }
    const mail = new URL(mailLink(link));
    expect(mail.protocol).toBe('mailto:');
    expect(mail.searchParams.get('body')).toContain(link.url);
  });
});
