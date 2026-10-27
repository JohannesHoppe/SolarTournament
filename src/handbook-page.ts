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
// the plain truth under a paragraph is a note Nicole stuck onto the page, so neither keeps the
// asterisk that ties them together in the plain text
document.querySelectorAll<HTMLElement>('.handbook-small-print').forEach((note, i) => {
  const text = note.firstChild;
  if (text) text.textContent = text.textContent!.replace(/^\*/, '');
  const truth = note.previousElementSibling?.lastChild;
  if (truth?.nodeType === Node.TEXT_NODE) truth.textContent = truth.textContent!.replace(/\*$/, '');
  const author = document.createElement('span');
  author.className = 'handbook-note-author';
  author.textContent = t('Note from Nicole');
  note.prepend(author);
  note.classList.toggle('askew', i % 2 === 1);
});
// the texts changed length: a link to a section (handbook.html#torpedoes) lands on it again
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
