import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../tools/pinned';
import { fetchPrebuilt, pointerName, spriteAsset } from '../tools/voice/prebuilt';
import { fetchRelease } from '../tools/voice/nicole';

describe('the voice sprites the workflow CI rendered', () => {
  let dir = '';
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'prebuilt-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const commit = '0123456789abcdef0123';
  const files = ['voice-en.mp3', 'voice-en.json'];
  const content: Record<string, Buffer> = { 'voice-en.mp3': Buffer.from('mp3'.repeat(50)), 'voice-en.json': Buffer.from('{"inputs":"k"}') };
  /** A release serving `assets` by name, 404 for anything else. */
  const release = (assets: Record<string, Buffer | string>) =>
    (async (url: string | URL | Request) => {
      const name = String(url).split('/').pop()!;
      const body = assets[name];
      return body === undefined ? new Response(null, { status: 404 }) : new Response(typeof body === 'string' ? body : new Uint8Array(body));
    }) as typeof fetch;
  const pointer = (hashes = Object.fromEntries(files.map((file) => [file, sha256(content[file])]))) => JSON.stringify({ inputs: 'k', sha256: hashes });
  const published = (overrides: Record<string, Buffer | string> = {}) => ({
    [pointerName(commit)]: pointer(),
    ...Object.fromEntries(files.map((file) => [spriteAsset('k', file), content[file]])),
    ...overrides,
  });

  it("writes a commit's sprites as the pointer names them", async () => {
    expect(await fetchPrebuilt(commit, files, dir, release(published()))).toBe(true);
    for (const file of files) expect(readFileSync(join(dir, file))).toEqual(content[file]);
  });

  it('takes nothing without a pointer for the commit, or with a file missing or not the one named', async () => {
    expect(await fetchPrebuilt(commit, files, dir, release({ ...published(), [pointerName(commit)]: undefined as unknown as string }))).toBe(false);
    const missing = published();
    delete missing[spriteAsset('k', 'voice-en.json')];
    expect(await fetchPrebuilt(commit, files, dir, release(missing))).toBe(false);
    expect(await fetchPrebuilt(commit, files, dir, release(published({ [spriteAsset('k', 'voice-en.json')]: Buffer.from('cut') })))).toBe(false);
    // nothing was written: a half set never goes in
    for (const file of files) expect(existsSync(join(dir, file))).toBe(false);
  });
});

describe('a download from a release', () => {
  afterEach(() => void vi.useRealTimers());

  /** A release answering with `statuses` in turn (an Error: no answer at all), the last for every try after them. */
  const flaky = (statuses: (number | Error)[]) => {
    let tries = 0;
    const get = (async () => {
      const status = statuses[Math.min(tries++, statuses.length - 1)];
      if (status instanceof Error) throw status;
      return new Response(status === 200 ? 'file' : null, { status });
    }) as typeof fetch;
    return { get, tries: () => tries };
  };

  it('tries again after a server error or no answer, and takes the file once it comes', async () => {
    vi.useFakeTimers();
    const release = flaky([504, new Error('reset'), 200]);
    const answer = fetchRelease('https://example.invalid/f', 20, release.get);
    await vi.runAllTimersAsync();
    expect((await answer).status).toBe(200);
    expect(release.tries()).toBe(3);
  });

  it('takes a 404 at once, and gives up on server errors after a few tries', async () => {
    vi.useFakeTimers();
    const missing = flaky([404]);
    expect((await fetchRelease('https://example.invalid/f', 20, missing.get)).status).toBe(404);
    expect(missing.tries()).toBe(1);
    const down = flaky([504]);
    const answer = fetchRelease('https://example.invalid/f', 20, down.get);
    await vi.runAllTimersAsync();
    expect((await answer).status).toBe(504);
    expect(down.tries()).toBe(4);
  });
});
