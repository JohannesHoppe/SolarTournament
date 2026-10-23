import { HANDBOOK_NUMBERS } from './handbook/numbers';
import { currentLocale, initLocale, t, translatePage } from './i18n/i18n';
import { shareCorner } from './share';

/**
 * The Pilot's Handbook (handbook.html): its texts in the Host's language, the game's numbers
 * filled in, written the way the Host's language writes numbers.
 */

initLocale();
const format = new Intl.NumberFormat(currentLocale());
translatePage(document, Object.fromEntries(Object.entries(HANDBOOK_NUMBERS).map(([name, value]) => [name, format.format(value)])));
document.title = `${t("Pilot's Handbook")} · SolarTournament`;
shareCorner('handbook');
// a number keeps its unit on its line ("30 %", "250 m/s")
const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (texts.nextNode()) texts.currentNode.textContent = texts.currentNode.textContent!.replace(/(\d) (?=%|m\/s|km\b|m\b|g\b|s\b)/g, '$1 ');
// the texts changed length: a link to a section (handbook.html#torpedoes) lands on it again
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
