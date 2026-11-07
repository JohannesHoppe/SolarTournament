import { t } from '../i18n/i18n';

/**
 * Marks before names: a small robot for a bot, a person for a real Host. The game draws them
 * as shapes (CSS masks, see `.mark` in style.css), never as characters of a name, so no
 * callsign can fake them; callsigns may carry anything, emoji included.
 */
export type Kind = 'bot' | 'host' | null;

/** A name behind its mark, as nodes to append; without a kind, the plain name. */
export function markedName(kind: Kind, name: string): Node[] {
  const text = document.createTextNode(name);
  if (!kind) return [text];
  const mark = document.createElement('i');
  mark.className = `mark ${kind}`;
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', kind === 'bot' ? t('Bot') : t('Host'));
  return [mark, text];
}

/**
 * The game master, whose browser leads and runs the round and the bots, before its Host's name in the standings:
 * a small star, drawn the same way as the bot and Host marks, never a character.
 */
export function markLead(): HTMLElement {
  const mark = document.createElement('i');
  mark.className = 'mark lead';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', t('Game master: runs the round and the bots, and can start a new one'));
  return mark;
}

/** A small square in a pilot's tint beside its name (see `.swatch` in style.css); a trophy's glows in its own color (the Sovereign's gold, the Magpie's shimmer). */
export function swatch(tint: string, glow: string | null = null): HTMLElement {
  const element = document.createElement('i');
  element.className = glow ? 'swatch trophy' : 'swatch';
  element.style.setProperty('--tint', tint);
  if (glow) element.style.setProperty('--trophy-glow', glow);
  element.setAttribute('aria-hidden', 'true');
  return element;
}
