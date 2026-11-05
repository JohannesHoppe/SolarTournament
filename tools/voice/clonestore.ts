/**
 * The build cache's copies of the clone stores (one FLAC per speaker, language and fingerprint,
 * named by its store, see storeName): how a store is named, taken from the cache only if it is the one its index names, written
 * whole or not at all, and the stores of earlier fingerprints removed.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, writeWhole } from '../pinned.ts';

const prefix = (store: string) => `${store}-`;
const fileName = (store: string, fingerprint: string) => `${prefix(store)}${fingerprint.slice(0, 16)}.flac`;

/** The cached store `store` with this fingerprint (its audio's SHA-256), or null where there is none or what lies there is not that audio (a cut write, a changed file); that file is removed. */
export function cachedStore(dir: string, store: string, fingerprint: string): string | null {
  const file = join(dir, fileName(store, fingerprint));
  if (!existsSync(file)) return null;
  if (sha256(readFileSync(file)) === fingerprint) return file;
  rmSync(file, { force: true });
  return null;
}

/** Keeps the store `bytes` of `store` in the cache, whole or not at all; returns its file. */
export function keepStore(dir: string, store: string, fingerprint: string, bytes: Uint8Array): string {
  const file = join(dir, fileName(store, fingerprint));
  writeWhole(file, bytes);
  return file;
}

/** Removes the stores of `store` other than the one of this fingerprint: a store's earlier uploads are of no use once its index names another. */
export function pruneStores(dir: string, store: string, fingerprint: string) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(prefix(store)) && entry.endsWith('.flac') && entry !== fileName(store, fingerprint)) rmSync(join(dir, entry), { force: true });
  }
}
