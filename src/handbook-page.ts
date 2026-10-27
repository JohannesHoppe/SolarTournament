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
// the plain truth under a paragraph is Nicole's comment on it, shown beside it as a reviewer's
// comment in the margin; neither keeps the asterisk that ties them together in the plain text
for (const note of document.querySelectorAll<HTMLElement>('.handbook-small-print')) {
  const paragraph = note.previousElementSibling;
  if (!paragraph) continue;
  const text = note.firstChild;
  if (text) text.textContent = text.textContent!.replace(/^\*/, '');
  const end = paragraph.lastChild;
  if (end?.nodeType === Node.TEXT_NODE) end.textContent = end.textContent!.replace(/\*$/, '');
  const author = document.createElement('span');
  author.className = 'handbook-note-author';
  author.textContent = t('Note from Nicole');
  note.prepend(author);
  const commented = document.createElement('div');
  commented.className = 'handbook-commented';
  paragraph.before(commented);
  commented.append(paragraph, note);
}
// in the margin (a wide screen, see style.css) a comment taller than its paragraph would cover
// the next one: each starts beside its paragraph or just below the comment above it
const margin = window.matchMedia('(min-width: 90rem)');
const comments = [...document.querySelectorAll<HTMLElement>('.handbook-small-print')];
function stackComments() {
  let free = -Infinity;
  for (const comment of comments) {
    comment.style.removeProperty('--pushed');
    if (!margin.matches) continue;
    const top = comment.getBoundingClientRect().top;
    const pushed = Math.max(0, free - top);
    comment.style.setProperty('--pushed', `${pushed}px`);
    free = top + pushed + comment.offsetHeight + 12;
  }
}
stackComments();
new ResizeObserver(stackComments).observe(document.body);
// the texts changed length: a link to a section (handbook.html#torpedoes) lands on it again
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
