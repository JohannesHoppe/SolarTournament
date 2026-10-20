/**
 * Finds style rules that say the same thing twice, under any selector. jscpd only sees
 * identical stretches of text; this compares what the rules declare, whatever their selector
 * and order: two rules with the same set of at least three declarations, in the same media
 * query, belong together under one selector list.
 *
 * A rule that has to repeat another carries the comment `css-dupes: <reason>` right before it.
 * Run with `npm run dupes`.
 */
import { globSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type Rule } from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
/** Fewer declarations than this make no duplicate: `margin: 0; padding: 0` stands in many rules. */
const MIN_DECLARATIONS = 3;

type Found = { place: string; key: string };

/** The rule's declarations as sorted `property: value` lines. */
function declarations(rule: Rule) {
  const lines: string[] = [];
  rule.each((node) => {
    if (node.type === 'decl') lines.push(`${node.prop}: ${node.value.replace(/\s+/g, ' ').trim()}${node.important ? ' !important' : ''}`);
  });
  return lines.sort();
}

/** The at-rules around a rule: the same declarations in different media queries are no copy. */
function context(rule: Rule) {
  const parts: string[] = [];
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule') parts.unshift(`@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`);
  }
  return parts.join(' ');
}

/** A comment `css-dupes: …` right before the rule allows it. */
function allowed(rule: Rule) {
  const previous = rule.prev();
  return previous?.type === 'comment' && /css-dupes:/.test(previous.text);
}

const files = globSync('src/**/*.css', { cwd: root });
const found: Found[] = [];
let rules = 0;
for (const file of files) {
  postcss.parse(readFileSync(join(root, file), 'utf8'), { from: file }).walkRules((rule) => {
    // keyframe steps are no rules of their own
    if (rule.parent?.type === 'atrule' && /keyframes$/.test((rule.parent as postcss.AtRule).name)) return;
    rules++;
    const lines = declarations(rule);
    if (lines.length < MIN_DECLARATIONS || allowed(rule)) return;
    found.push({ place: `${relative(root, join(root, file))}:${rule.source?.start?.line ?? 0} ${rule.selector.replace(/\s+/g, ' ')}`, key: `${context(rule)}|${lines.join(';')}` });
  });
}

const groups = new Map<string, string[]>();
for (const { place, key } of found) groups.set(key, [...(groups.get(key) ?? []), place]);
const copies = [...groups.values()].filter((places) => places.length > 1);
if (copies.length > 0) {
  console.error(`css-dupes: ${copies.length} ${copies.length === 1 ? 'rule' : 'rules'} declared twice\n${copies.map((places) => `  the same declarations in\n    ${places.join('\n    ')}`).join('\n')}`);
  process.exit(1);
}
console.log(`css-dupes: no rule declared twice (${rules} rules in ${files.length} ${files.length === 1 ? 'file' : 'files'})`);
