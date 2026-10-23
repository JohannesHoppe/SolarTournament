/**
 * Runs every quality gate of the repository one after another and sums them up: types,
 * duplicates, the unit tests (the translations' completeness among them), and with `--full`
 * the browser tests and the balance runs. Every gate runs even when one before it failed, so
 * one run shows everything that is broken; the exit code is not zero when any gate failed.
 *
 * Run with `npm run check` (a few minutes at most) or `npm run check:full` (the browser
 * tests and about ten minutes of balance runs on top). DEV_PORT moves the dev server the
 * browser tests start, as for `npm run e2e`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

type Gate = { name: string; script: string; full?: boolean };

/** The gates in the order they run: the quick ones first, so a broken type shows within seconds. */
const GATES: Gate[] = [
  { name: 'Types', script: 'typecheck' },
  { name: 'Duplicates', script: 'dupes' },
  { name: 'Unit tests', script: 'test' },
  { name: 'Browser tests', script: 'e2e', full: true },
  { name: 'Balance runs', script: 'balance', full: true },
];

const full = process.argv.includes('--full');
const results: { name: string; ok: boolean; seconds: number }[] = [];
for (const gate of GATES.filter((gate) => full || !gate.full)) {
  console.log(`\n=== ${gate.name} (npm run ${gate.script})`);
  const start = Date.now();
  const run = spawnSync('npm', ['run', gate.script], { cwd: root, stdio: 'inherit' });
  results.push({ name: gate.name, ok: run.status === 0, seconds: (Date.now() - start) / 1000 });
}

console.log('\n=== Quality gates');
for (const { name, ok, seconds } of results) console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(14)} ${seconds.toFixed(0).padStart(5)} s`);
if (!full) console.log('(browser tests and balance runs: npm run check:full)');
process.exit(results.every((result) => result.ok) ? 0 : 1);
