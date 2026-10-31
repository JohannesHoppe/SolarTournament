/**
 * The voice sprites the workflow CI rendered for a commit (see .github/workflows/ci.yml), kept as
 * assets of the release "voice-sprites": each render under its inputs' key (see render.ts), and a
 * pointer per commit naming the key and every file's SHA-256. The site's build (Cloudflare Pages)
 * takes them from there instead of rendering the voices itself, which takes longer than its
 * build may run when the spoken lines changed.
 */
import { join } from 'node:path';
import { sha256, writeWhole } from '../pinned.ts';
import { RELEASE } from './nicole.ts';

export const SPRITES_TAG = 'voice-sprites';
const spritesUrl = (file: string) => `https://github.com/${RELEASE.repo}/releases/download/${SPRITES_TAG}/${file}`;

/** The pointer of a commit: which render it was built with and what each of its files hashes to. */
export type Pointer = { inputs: string; sha256: Record<string, string> };
export const pointerName = (commit: string) => `sprites-${commit.slice(0, 12)}.json`;
/** A file of a render, under its inputs' key. */
export const spriteAsset = (inputs: string, file: string) => `${inputs}-${file}`;

/**
 * Writes the sprites `files` the workflow CI rendered for `commit` into `out`, each checked
 * against the SHA-256 its pointer names; true when all of them were had, false (nothing used, the
 * caller renders) when the pointer or a file is missing, cut short or not what was promised.
 */
export async function fetchPrebuilt(commit: string, files: readonly string[], out: string, get: typeof fetch = fetch): Promise<boolean> {
  try {
    const answer = await get(spritesUrl(pointerName(commit)), { signal: AbortSignal.timeout(20000) });
    if (!answer.ok) throw new Error(`pointer: HTTP ${answer.status}`);
    const pointer = (await answer.json()) as Pointer;
    const fetched: Buffer[] = [];
    for (const file of files) {
      const expected = pointer.sha256?.[file];
      if (!expected) throw new Error(`${file} not in the pointer`);
      const response = await get(spritesUrl(spriteAsset(pointer.inputs, file)), { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== expected) throw new Error(`${file} is not the file its pointer names`);
      fetched.push(bytes);
    }
    // only a whole set goes in
    files.forEach((file, i) => writeWhole(join(out, file), fetched[i]));
    return true;
  } catch (error) {
    console.warn(`Voice sprites of ${commit.slice(0, 12)} not taken from the release (${(error as Error).message}): rendered here`);
    return false;
  }
}
