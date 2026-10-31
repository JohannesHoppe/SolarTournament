/**
 * Downloads that are checked against a pinned SHA-256 before anything is used or written, shared
 * by the tools that fetch a source (the sky's catalogue, the voice's ffmpeg).
 */
import { createHash } from 'node:crypto';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The folder the tools keep what they fetch in: inside npm's cache directory (~/.npm by default), which Cloudflare Pages keeps between builds and npm ignores. */
export const toolCache = () => join(process.env.npm_config_cache ?? join(homedir(), '.npm'), '_solartournament');

/**
 * What `url` serves, after `unpack` (the identity for a file used as served), if its SHA-256 is
 * `expected`; else an error naming both hashes, and nothing is used.
 */
export async function fetchPinned(url: string, label: string, expected: string, unpack: (bytes: Buffer) => Buffer = (bytes) => bytes): Promise<Buffer> {
  const answer = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!answer.ok) throw new Error(`${label} not fetched from ${url}: HTTP ${answer.status}`);
  const bytes = unpack(Buffer.from(await answer.arrayBuffer()));
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${label} from ${url} has SHA-256 ${actual}, pinned is ${expected}: not used`);
  return bytes;
}

/** Writes `bytes` to `path` through a temporary name of this process, so an interrupted or a concurrent write is never taken for the file. */
export function writeWhole(path: string, bytes: Uint8Array, mode?: number) {
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  if (mode !== undefined) chmodSync(partial, mode);
  renameSync(partial, path);
}
