import { msg, t } from './i18n/i18n';

/**
 * Sharing the game: a small button with the share glyph in a corner of every screen. Where the
 * device has a share sheet of its own (a phone), the button opens it; elsewhere it opens a small
 * menu: copy the link, send it by e-mail, or post it through a network's plain share link. No
 * network's script is loaded; a network hears of the link only when the Host clicks its name.
 */

/** The game's home, shared from everywhere but a running online tournament. */
export const GAME_URL = 'https://solartournament.games/';

/**
 * Where the Host shares from: a screen or page of the game, which shares the game itself, or a
 * running online tournament, which shares the tournament's own link (the game builds it, see
 * net/room.ts; the pages of the station share this module without the game's code), so a friend
 * joins at once.
 */
export type ShareWhere = 'menu' | 'school' | 'solo' | 'radio' | 'handbook' | { name: string; public: boolean; link: string };

export interface ShareLink {
  title: string;
  text: string;
  url: string;
  /** The link opens a running tournament. */
  room: boolean;
  /** The link opens a private tournament: whoever has it can join. */
  private: boolean;
}

/** What the Host says along with the game's link, by where it shares from. */
const GAME_TEXTS = {
  menu: msg('Five minutes. Die for the President. Again and again. SolarTournament'),
  school: msg("I'm learning to fly for the Presidential Games. Training clones are free. SolarTournament"),
  solo: msg('Five minutes, one arena, and I died for the President again. Your turn. SolarTournament'),
  radio: msg('Radio 2584: hard techno from the Presidential Games, a new track every round. SolarTournament'),
  handbook: msg("The Pilot's Handbook of the Ministry of War: read it between deaths. SolarTournament"),
};

/** The link and text shared from where the Host is. */
export function shareLink(where: ShareWhere): ShareLink {
  if (typeof where === 'string') return { title: 'SolarTournament', text: t(GAME_TEXTS[where]), url: GAME_URL, room: false, private: false };
  return {
    title: 'SolarTournament',
    text: t("I'm flying a round of SolarTournament right now, join me! Tournament: {name}", { name: where.name }),
    url: where.link,
    room: true,
    private: !where.public,
  };
}

/** A network's plain share link: it opens the network's own page to post from, nothing else. */
export interface ShareTarget {
  name: string;
  href: string;
}

/** The networks a link can be posted to, each through its plain share link. */
export function shareTargets(link: ShareLink): ShareTarget[] {
  const url = encodeURIComponent(link.url);
  const text = encodeURIComponent(link.text);
  const both = encodeURIComponent(`${link.text} ${link.url}`);
  return [
    { name: 'X', href: `https://x.com/intent/tweet?text=${text}&url=${url}` },
    { name: 'Bluesky', href: `https://bsky.app/intent/compose?text=${both}` },
    { name: 'WhatsApp', href: `https://wa.me/?text=${both}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${url}&text=${text}` },
    { name: 'Reddit', href: `https://www.reddit.com/submit?url=${url}&title=${text}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { name: 'Threads', href: `https://www.threads.net/intent/post?text=${both}` },
  ];
}

/** An e-mail with the link, written in the Host's own mail program. */
export function mailLink(link: ShareLink): string {
  return `mailto:?subject=${encodeURIComponent(link.title)}&body=${encodeURIComponent(`${link.text}\n\n${link.url}`)}`;
}

/** The share glyph: three nodes, joined. */
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6"/></svg>';

/** How long "Copied" stays on the copy button (ms). */
const COPIED_MS = 1800;

/**
 * The share button and its menu. `where` says where the Host is the moment it shares;
 * `onToggle` hears the menu open and close (the game lets the mouse stop steering meanwhile).
 */
export class ShareButton {
  readonly button: HTMLButtonElement;
  private panel: HTMLElement | null = null;
  private link: ShareLink | null = null;

  constructor(
    parent: HTMLElement,
    private readonly where: () => ShareWhere,
    private readonly onToggle: (open: boolean) => void = () => {},
  ) {
    const label = t('Share');
    this.button = Object.assign(document.createElement('button'), { type: 'button', id: 'share', title: label, innerHTML: ICON });
    this.button.setAttribute('aria-label', label);
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.addEventListener('click', () => (this.panel ? this.close() : void this.share()));
    parent.append(this.button);
    document.addEventListener('pointerdown', (e) => {
      if (this.panel && !this.panel.contains(e.target as Node) && !this.button.contains(e.target as Node)) this.close();
    });
  }

  get isOpen(): boolean {
    return this.panel !== null;
  }

  /** Shares from where the Host is: the device's share sheet where it has one for touch, else the menu. */
  async share() {
    // whatever held the pointer gives it back, so the Host can choose
    if (document.pointerLockElement) document.exitPointerLock();
    const link = shareLink(this.where());
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: link.title, text: link.text, url: link.url });
        return;
      } catch (error) {
        // closed by the Host: done; refused by the browser: the menu instead
        if ((error as DOMException).name === 'AbortError') return;
      }
    }
    this.open(link);
  }

  /** Copies the link of where the Host is; false where the browser keeps the clipboard closed. */
  async copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText((this.link ?? shareLink(this.where())).url);
      return true;
    } catch {
      return false;
    }
  }

  private open(link: ShareLink) {
    this.close();
    this.link = link;
    const panel = (this.panel = Object.assign(document.createElement('div'), { id: 'share-panel', className: 'share-panel' }));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('Share'));
    const add = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string, into: HTMLElement = panel) =>
      into.appendChild(Object.assign(document.createElement(tag), { className, textContent: text }));
    add('p', 'share-heading', link.room ? t('Invite to this tournament') : t('Share SolarTournament'));
    if (link.private) add('p', 'share-warning', t('Private tournament: anyone with this link can join.'));
    add('p', 'share-url', link.url);
    const copy = add('button', 'share-copy', t('Copy link')) as HTMLButtonElement;
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      copy.textContent = (await this.copy()) ? t('Copied') : t('Copy it by hand from above');
      setTimeout(() => (copy.textContent = t('Copy link')), COPIED_MS);
    });
    const targets = add('div', 'share-targets', '');
    const mail = add('a', '', t('E-mail'), targets) as HTMLAnchorElement;
    mail.href = mailLink(link);
    for (const target of shareTargets(link)) {
      const a = add('a', '', target.name, targets) as HTMLAnchorElement;
      Object.assign(a, { href: target.href, target: '_blank', rel: 'noopener noreferrer' });
    }
    // a chosen network opens in its own tab; the menu has done its job
    targets.addEventListener('click', () => setTimeout(() => this.close()));
    // the menu's keys stay in the menu: Escape closes it, and the game does not fly on Enter or Space
    panel.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.close();
        this.button.focus();
      }
      if (['Escape', 'Enter', 'Space', 'Tab'].includes(e.code)) e.stopPropagation();
    });
    const corner = this.button.getBoundingClientRect();
    panel.style.top = `${Math.round(corner.bottom + 8)}px`;
    panel.style.right = `${Math.max(8, Math.round(innerWidth - corner.right))}px`;
    document.body.append(panel);
    this.button.setAttribute('aria-expanded', 'true');
    copy.focus({ preventScroll: true });
    this.onToggle(true);
  }

  close() {
    if (!this.panel) return;
    this.panel.remove();
    this.panel = null;
    this.link = null;
    this.button.setAttribute('aria-expanded', 'false');
    this.onToggle(false);
  }
}

/** The share button of a page without the game's radio box: alone in the page's top right corner. */
export function shareCorner(where: ShareWhere): ShareButton {
  const corner = Object.assign(document.createElement('div'), { className: 'share-corner' });
  document.body.append(corner);
  return new ShareButton(corner, () => where);
}
