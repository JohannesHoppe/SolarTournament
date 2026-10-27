/**
 * ffmpeg for the voice tool, so no machine needs one installed: a static build from a fixed
 * release (ffmpeg 6.1.1, GPL-3.0, the builds of the ffmpeg-static project), fetched only when
 * the build cache lacks it and used only when its SHA-256 is the one pinned here for the
 * machine's platform. A download that does not match stops the build.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

/** Where the builds are published: one gzipped binary per platform, `ffmpeg-<platform>-<arch>.gz`. */
export const FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';

/** SHA-256 of the unpacked binary of each platform the voices are made on: the Macs of development, Cloudflare's build and GitHub's runners. */
export const FFMPEG_SHA256: Record<string, string> = {
  'darwin-arm64': 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
  'darwin-x64': 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
  'linux-x64': 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
  'linux-arm64': '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
};

/** This machine's platform as the release names it. */
const target = `${platform()}-${arch()}`;

/** The pinned SHA-256 of this machine's ffmpeg, or null where none is pinned. */
export const ffmpegHash = (): string | null => FFMPEG_SHA256[target] ?? null;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The path of a checked ffmpeg in `folder` (one subfolder per binary, others are removed): the
 * copy kept there if its hash is the pinned one, else a fresh download, checked before it is
 * written (to a temporary name first, so an interrupted write is never taken for the binary).
 */
export async function ffmpegBinary(folder: string): Promise<string> {
  const expected = ffmpegHash();
  if (!expected) throw new Error(`No ffmpeg is pinned for ${target} (tools/voice/ffmpeg.ts pins ${Object.keys(FFMPEG_SHA256).join(', ')})`);
  const file = join(folder, expected.slice(0, 16), 'ffmpeg');
  if (existsSync(file) && sha256(readFileSync(file)) === expected) return file;
  const url = `${FFMPEG_RELEASE}/ffmpeg-${target}.gz`;
  console.log(`Fetching ffmpeg for ${target}`);
  const answer = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!answer.ok) throw new Error(`ffmpeg not fetched from ${url}: HTTP ${answer.status}`);
  const binary = gunzipSync(Buffer.from(await answer.arrayBuffer()));
  const actual = sha256(binary);
  if (actual !== expected) throw new Error(`ffmpeg from ${url} has SHA-256 ${actual}, pinned is ${expected}: not used`);
  // other binaries are of no use any more
  if (existsSync(folder)) for (const entry of readdirSync(folder)) if (entry !== expected.slice(0, 16)) rmSync(join(folder, entry), { recursive: true, force: true });
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.part`;
  writeFileSync(partial, binary);
  chmodSync(partial, 0o755);
  renameSync(partial, file);
  return file;
}
