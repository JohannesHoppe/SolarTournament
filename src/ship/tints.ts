import { msg } from '../i18n/i18n';
import { storageGet, storageSet } from '../storage';
import { BOT_NAMES } from '../music/lines';
import { TEAM_TINTS } from '../game/flags';

/**
 * The colors a ship is marked with: its markers, its arrow at the screen's edge, its dot on the
 * radar, its name and its laser. A Host picks one of the palette's neon tints in the menu; each
 * bot has its own; the Sovereign wears ivory and gold, a color no one can pick. In Capture the
 * Flag the side's color rules over all of them.
 *
 * Every tint is bright and saturated, so it reads on black space; its hue keeps at least 25°
 * from the sides' orange (37°) and the HUD's azure (217°), 20° from the red of a ship in danger
 * and 25° from every other tint (see tints.test.ts). The palette runs round the color wheel, so
 * neighbors in the list are neighbors in hue.
 */
export const TINTS = [
  { name: msg('Neon Yellow'), hex: '#f4ff3d' },
  { name: msg('Acid Green'), hex: '#9dff3a' },
  { name: msg('Laser Green'), hex: '#3dff5a' },
  { name: msg('Mint'), hex: '#3dffb0' },
  { name: msg('Electric Cyan'), hex: '#2ef2ff' },
  { name: msg('Ultraviolet'), hex: '#a970ff' },
  { name: msg('Hot Magenta'), hex: '#ff3df2' },
  { name: msg('Neon Pink'), hex: '#ff4d94' },
] as const;

/**
 * The Sovereign's ivory, and the gold of its glow (as `--sovereign` and `--sovereign-gold` in
 * style.css): far lighter than any tint of the palette, so a Sovereign stands out at once.
 */
export const SOVEREIGN_TINT = '#fff1c9';
export const SOVEREIGN_GOLD = '#ffc94d';

/** The tint a Host flies in, kept in this browser (an index into TINTS). */
const TINT_KEY = 'solartournament.tint';

/** The tint this browser's Host chose, checked; Neon Pink until one is chosen. */
export function loadTint(): number {
  const kept = Number(storageGet(TINT_KEY) ?? NaN);
  return Number.isInteger(kept) && kept >= 0 && kept < TINTS.length ? kept : TINTS.length - 1;
}

export function saveTint(index: number) {
  storageSet(TINT_KEY, String(index));
}

/** A bot's own tint: the palette in the order of the bots' names; a ship without a place there (the drone, the sparring bot) by its name. */
export function botTint(name: string): string {
  const index = BOT_NAMES.indexOf(name);
  if (index >= 0) return TINTS[index % TINTS.length].hex;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return TINTS[hash % TINTS.length].hex;
}

/**
 * The tints of a round's Hosts, in the order they joined the tournament (earliest first): each
 * gets the tint it chose unless an earlier Host already flies in it; then the nearest free one
 * on the color wheel (the next one up first). With every tint taken, a Host keeps its choice.
 */
export function assignTints(wishes: readonly number[]): number[] {
  const taken = new Array<boolean>(TINTS.length).fill(false);
  return wishes.map((wish) => {
    let index = wish;
    for (let step = 0; taken[index] && step < TINTS.length; step++) {
      const up = (wish + step + 1) % TINTS.length;
      const down = (wish - step - 1 + TINTS.length) % TINTS.length;
      index = !taken[up] ? up : !taken[down] ? down : wish;
    }
    taken[index] = true;
    return index;
  });
}

/** What a ship is marked in: its side's color in Capture the Flag, else its own tint. */
export function shownTint(ship: { team: number; tint: string }): string {
  return TEAM_TINTS[ship.team] ?? ship.tint;
}
