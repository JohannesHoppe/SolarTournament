import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BenchResult } from '../src/bench';
import { chosenProfile, contextOptions, throttle } from './profiles';

/**
 * The benchmark (npm run bench, not part of npm run e2e): the game's `?bench` page in the test
 * browser, as the device PROFILE names (PROFILE=pixel8) or as the desktop browser; BENCH_SECONDS
 * seconds per measurement (default 3). The table goes to the console, the JSON and the table to
 * the test's folder under test-results/ (bench.json, bench.txt). Without a GPU the frame times
 * only show what each feature costs next to the others, not what a real device makes of it.
 */
const profile = chosenProfile();
const seconds = Number(process.env.BENCH_SECONDS ?? 3);

if (profile) test.use(contextOptions(profile));
test.describe.configure({ timeout: 60 * 60_000 });

test('the benchmark measures every feature, rung, arena and mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  if (profile) await throttle(page, profile);
  await page.goto(`/?bench=${seconds}${process.env.BENCH_ONLY ? `&only=${process.env.BENCH_ONLY}` : ''}`);
  await page.waitForFunction(() => 'benchResult' in window, null, { timeout: 60 * 60_000, polling: 2000 });
  const result = (await page.evaluate(() => (window as unknown as { benchResult: BenchResult }).benchResult)) as BenchResult;
  const table = format(result);
  console.log(table);
  writeFileSync(test.info().outputPath('bench.json'), JSON.stringify(result, null, 1));
  writeFileSync(test.info().outputPath('bench.txt'), table);
  await test.info().attach('bench.json', { path: test.info().outputPath('bench.json'), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

/** The measurements as a plain-text table. */
function format(result: BenchResult): string {
  const d = result.device;
  const head = `${d.renderer} · ${d.viewport.join('x')} @ ${d.pixelRatio} · ${process.env.PROFILE ?? 'desktop'} · ${result.seconds} s per measurement`;
  const rows = [['section', 'what', 'ms/frame', 'fps', 'cost ms', 'cost %', 'script ms', 'gpu ms', 'calls', 'triangles']];
  const fixed = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '' : value.toFixed(digits));
  for (const m of result.measurements) rows.push([m.section, m.label, fixed(m.frameMs), fixed(m.fps, 0), fixed(m.costMs), fixed(m.costShare, 0), fixed(m.scriptMs), fixed(m.gpuMs), String(m.calls), String(m.triangles)]);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return [head, ...rows.map((row) => row.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  '))].join('\n');
}
