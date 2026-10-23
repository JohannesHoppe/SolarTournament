import type { AdProvider } from './sponsors';
import { msg, t } from '../i18n/i18n';

/**
 * The sponsors of 2584: invented brands that advertise in the sponsor break until real
 * sponsors take the slot. Consumer satire in the regime's world: a cola that is proud of a
 * few grams less sugar, burgers from the clone printer, air by subscription. Brands, slogans
 * and fine print are all made up.
 */
interface SatireAd {
  /** A brand name stays as it is in every language; one made of plain words is marked for translation. */
  brand: string;
  slogan: string;
  /** The small print, where the truth hides. */
  fine: string;
  /** Brand color (CSS). */
  color: string;
  /** A small product picture, inline SVG on a 100×100 canvas. */
  art: string;
}

const ADS: SatireAd[] = [
  {
    brand: 'Victory Cola',
    slogan: msg('Now with less sugar than before!*'),
    fine: msg('*Before: 412 g per can. Now: 409 g. Victory tastes sweet.'),
    color: '#ff2a4f',
    art: '<rect x="32" y="14" width="36" height="72" rx="8" fill="currentColor"/><rect x="36" y="10" width="28" height="8" rx="3" fill="#d9e3ff"/><path d="M34 44 Q50 34 66 44 L66 56 Q50 46 34 56 Z" fill="#fff"/>',
  },
  {
    brand: 'Space Burger',
    slogan: msg('Flame-grilled in a fusion drive. 100 % meat-like!*'),
    fine: msg('*Printed fresh in the same printers as your clone. Do not ask which batch.'),
    color: '#ff9d00',
    art: '<path d="M18 46 Q50 10 82 46 Z" fill="currentColor"/><rect x="16" y="50" width="68" height="8" rx="4" fill="#5a2a12"/><rect x="18" y="60" width="64" height="5" rx="2" fill="#7ad86b"/><path d="M18 68 H82 Q82 82 50 82 Q18 82 18 68 Z" fill="currentColor"/>',
  },
  {
    brand: 'Victory Cola Zero',
    slogan: msg('Zero sugar. Zero taste. Zero questions.'),
    fine: msg('Approved by the Ministry of War. Asking questions voids the warranty.'),
    color: '#c7d2e8',
    art: '<rect x="32" y="14" width="36" height="72" rx="8" fill="#10131c" stroke="currentColor" stroke-width="3"/><text x="50" y="58" text-anchor="middle" font-size="26" font-family="Michroma, sans-serif" fill="currentColor">0</text>',
  },
  {
    brand: 'PrintMe Bodies',
    slogan: msg('Your next body is already warm. Premium Skin: 40 % less pain!*'),
    fine: msg('*Pain is not reduced. Your awareness of it is. Memories stream as usual.'),
    color: '#4d91ff',
    art: '<circle cx="50" cy="28" r="12" fill="currentColor"/><path d="M30 86 Q30 46 50 44 Q70 46 70 86 Z" fill="currentColor"/><path d="M14 90 H86" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4"/>',
  },
  {
    brand: 'Oxygen+',
    slogan: msg('Breathe more. Gold plan: 21 % oxygen. Basic plan: 17 %.'),
    fine: msg('Rockborn not eligible. Holding your breath without a plan is a violation of the terms of service.'),
    color: '#7affd4',
    art: '<circle cx="38" cy="58" r="20" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="66" cy="34" r="12" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="72" cy="70" r="7" fill="currentColor"/>',
  },
  {
    brand: msg('Solar Wall Bonds'),
    slogan: msg('Invest in the biggest wall in the history of walls. Mars pays the interest!*'),
    fine: msg('*Mars has not agreed. Mars has never agreed. Past returns are fake news.'),
    color: '#ffcc33',
    art: '<g fill="currentColor"><rect x="10" y="62" width="24" height="12"/><rect x="38" y="62" width="24" height="12"/><rect x="66" y="62" width="24" height="12"/><rect x="24" y="46" width="24" height="12"/><rect x="52" y="46" width="24" height="12"/><rect x="38" y="30" width="24" height="12"/></g>',
  },
  {
    brand: 'DreamLink',
    slogan: msg('Sleep through your deaths. Memory filter, now in beta.*'),
    fine: msg('*Beta not available to Hosts. Hosts are reminded that remembering is part of the job.'),
    color: '#c58cff',
    art: '<path d="M64 18 A34 34 0 1 0 80 70 A28 28 0 1 1 64 18 Z" fill="currentColor"/><circle cx="74" cy="30" r="3" fill="currentColor"/><circle cx="84" cy="46" r="2" fill="currentColor"/>',
  },
  {
    brand: 'Orange Steaks',
    slogan: msg('The best steaks. Everybody says so. Tremendous steaks.'),
    fine: msg('Steaks are a serving suggestion. Product contains no steak.'),
    color: '#ff7a1a',
    art: '<path d="M20 56 Q18 30 46 28 Q80 26 82 50 Q84 74 54 76 Q22 78 20 56 Z" fill="currentColor"/><path d="M34 46 L70 58 M36 58 L60 44" stroke="#2a1205" stroke-width="4"/>',
  },
  {
    brand: 'CarrierCare',
    slogan: msg('Your health care now flies with the President. Proudly!*'),
    fine: msg('*Every hospital closed paid for one golden deck plate. Feeling sick? Print a new clone.'),
    color: '#ffd24d',
    art: '<path d="M8 62 L92 62 L84 74 L16 74 Z" fill="currentColor"/><rect x="58" y="42" width="12" height="20" fill="currentColor"/><path d="M26 30 h10 v-10 h8 v10 h10 v8 h-10 v10 h-8 v-10 h-10 Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 30 L60 52" stroke="currentColor" stroke-width="3"/>',
  },
];

/** A number and its percent sign stay on one line, in every language: the space before % does not break. */
const unbroken = (text: string) => text.replace(/ %/g, ' %');

/** The sponsors' names and colors, as their signs show them on the rings of the tournament (see GateKit), in the Host's language. */
export const sponsorSigns = () => ADS.map((ad) => ({ brand: t(ad.brand), color: ad.color }));

/** Seconds a satire ad runs before the clone can boot. */
const AD_SECONDS = 6;

/** Shows the invented sponsors one after the other, in a fresh order every session. */
export class SatireAds implements AdProvider {
  private readonly order = ADS.map((_, i) => i).sort(() => Math.random() - 0.5);
  private next = 0;

  render(slot: HTMLElement): Promise<void> {
    const ad = ADS[this.order[this.next++ % this.order.length]];
    const card = document.createElement('div');
    card.className = 'satire-ad';
    card.style.setProperty('--brand', ad.color);
    card.innerHTML = `
      <span class="ad-label">${t('Advertisement')}</span>
      <svg class="satire-art" viewBox="0 0 100 100" aria-hidden="true">${ad.art}</svg>
      <strong class="satire-brand"></strong>
      <p class="satire-slogan"></p>
      <p class="satire-fine"></p>
      <div class="satire-progress"><span style="animation-duration: ${AD_SECONDS}s"></span></div>`;
    card.querySelector('.satire-brand')!.textContent = t(ad.brand);
    card.querySelector('.satire-slogan')!.textContent = unbroken(t(ad.slogan));
    card.querySelector('.satire-fine')!.textContent = unbroken(t(ad.fine));
    slot.replaceChildren(card);
    return new Promise((resolve) => setTimeout(resolve, AD_SECONDS * 1000));
  }
}
