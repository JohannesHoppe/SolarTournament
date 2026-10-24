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
 * The lead browser, which runs the round and the bots, before its Host's name in the standings:
 * a small star, drawn the same way as the bot and Host marks, never a character.
 */
export function markLead(): HTMLElement {
  const mark = document.createElement('i');
  mark.className = 'mark lead';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', t('Lead browser: runs the round and the bots'));
  return mark;
}

/** A small square in a pilot's tint beside its name (see `.swatch` in style.css); the Sovereign's glows gold. */
export function swatch(tint: string, sovereign = false): HTMLElement {
  const element = document.createElement('i');
  element.className = sovereign ? 'swatch sovereign' : 'swatch';
  element.style.setProperty('--tint', tint);
  element.setAttribute('aria-hidden', 'true');
  return element;
}
