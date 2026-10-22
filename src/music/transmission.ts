import type { Spoken } from './band';
import { currentLocale, t } from '../i18n/i18n';

/**
 * Whatever the radio says also runs across the screen, in neon, while it is spoken: the
 * #transmission box of the game and of the radio page.
 */

/** A spoken line stays on screen this long after it ends (ms). */
const HOLD_MS = 1800;
let timer = 0;

/**
 * Shows a line when it is spoken, `delay` ms from now. A station announcement of the regime's
 * voice names the track `title` instead of its words; `name` fills the {name} of an
 * announcer's line.
 */
export function showTransmission(spoken: Spoken, delay: number, title: string | null, name: string | null = null) {
  const station = spoken.language !== 'mod' && spoken.line.startsWith('radio');
  // the announcer speaks the Host's language; the regime's voice speaks its own English or German
  const speaker = spoken.language === 'mod' ? t('Announcer') : station ? 'Radio 2584' : spoken.language === 'de' ? 'Der Präsident' : 'The Orange President';
  const words =
    station && title
      ? `${spoken.language === 'de' ? 'Es läuft' : 'Now playing'}: ${title}`
      : spoken.line
          .replace('{name}', name ?? t('pilot'))
          .split(/(?<=[.?!])\s+/)
          .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
          .join(' ');
  window.setTimeout(() => {
    const box = document.getElementById('transmission')!;
    const text = document.getElementById('transmission-text')!;
    box.className = spoken.language === 'mod' ? 'announcer' : 'regime';
    document.getElementById('transmission-speaker')!.textContent = speaker;
    text.textContent = /[.?!]$/.test(words) ? words : words + '.';
    // a line is hyphenated and read out in its language: the announcer's is the Host's
    text.lang = spoken.language === 'mod' ? currentLocale() : spoken.language === 'de' ? 'de' : 'en';
    box.hidden = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => (box.hidden = true), spoken.duration * 1000 + HOLD_MS);
  }, Math.max(0, delay));
}
