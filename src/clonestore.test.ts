import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../tools/pinned';
import { cachedStore, keepStore, pruneStores } from '../tools/voice/clonestore';

describe("the build cache's clone stores", () => {
  let dir = '';
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'clonestore-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const bytes = (text: string) => Buffer.from(text.repeat(100));

  it('hands out a kept store and nothing for one never kept', () => {
    const audio = bytes('a');
    const fingerprint = sha256(audio);
    expect(cachedStore(dir, 'nicole-de', fingerprint)).toBeNull();
    const file = keepStore(dir, 'nicole-de', fingerprint, audio);
    expect(cachedStore(dir, 'nicole-de', fingerprint)).toBe(file);
    expect(readdirSync(dir)).toEqual([`nicole-de-${fingerprint.slice(0, 16)}.flac`]);
  });

  it('does not trust a file of the right name that is not the audio its index names', () => {
    const fingerprint = sha256(bytes('a'));
    const file = keepStore(dir, 'nicole-de', fingerprint, bytes('a'));
    writeFileSync(file, bytes('a').subarray(0, 50));
    expect(cachedStore(dir, 'nicole-de', fingerprint)).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("prunes a store's earlier audio and leaves the other stores alone, another speaker's of the same language too", () => {
    const old = sha256(bytes('a'));
    const current = sha256(bytes('b'));
    keepStore(dir, 'nicole-de', old, bytes('a'));
    keepStore(dir, 'nicole-de', current, bytes('b'));
    keepStore(dir, 'nicole-fr', old, bytes('a'));
    keepStore(dir, 'rask-de', old, bytes('a'));
    writeFileSync(join(dir, 'nicole-de.json'), '{}');
    pruneStores(dir, 'nicole-de', current);
    expect(readdirSync(dir).sort()).toEqual([`nicole-de-${current.slice(0, 16)}.flac`, 'nicole-de.json', `nicole-fr-${old.slice(0, 16)}.flac`, `rask-de-${old.slice(0, 16)}.flac`]);
  });
});
