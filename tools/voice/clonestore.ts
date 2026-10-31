/**
 * The build cache's copies of Nicole's clone stores (one FLAC per language and fingerprint):
 * how a store is named, taken from the cache only if it is the one its index names, written
 * whole or not at all, and the stores of earlier fingerprints removed.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, writeWhole } from '../pinned.ts';

const prefix = (locale: string) => `nicole-${locale}-`;
const fileName = (locale: string, fingerprint: string) => `${prefix(locale)}${fingerprint.slice(0, 16)}.flac`;

/** The cached store of `locale` with this fingerprint (its audio's SHA-256), or null where there is none or what lies there is not that audio (a cut write, a changed file); that file is removed. */
export function cachedStore(dir: string, locale: string, fingerprint: string): string | null {
  const file = join(dir, fileName(locale, fingerprint));
  if (!existsSync(file)) return null;
  if (sha256(readFileSync(file)) === fingerprint) return file;
  rmSync(file, { force: true });
  return null;
}

/** Keeps the store `bytes` of `locale` in the cache, whole or not at all; returns its file. */
export function keepStore(dir: string, locale: string, fingerprint: string, bytes: Uint8Array): string {
  const file = join(dir, fileName(locale, fingerprint));
  writeWhole(file, bytes);
  return file;
}

/** Removes the stores of `locale` other than the one of this fingerprint: a language's earlier uploads are of no use once its index names another. */
export function pruneStores(dir: string, locale: string, fingerprint: string) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(prefix(locale)) && entry.endsWith('.flac') && entry !== fileName(locale, fingerprint)) rmSync(join(dir, entry), { force: true });
  }
}
