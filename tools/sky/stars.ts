/**
 * Packs the stars of the real sky (see src/world/starmap.ts) into public/assets/sky/stars.bin
 * from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit and Warren, 1991), as NASA's
 * HEASARC distributes it (its table BSC5P): every star of it with its place (J2000), its visual
 * magnitude as its brightness, and its color index B−V (or, where it gives none, its spectral
 * class) as its color.
 *
 * The catalogue (about 0.9 MB) is fetched once into npm's cache directory (SKY_SOURCES moves it)
 * and used only if its SHA-256 is the one pinned here. Run with `npm run sky`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { magnitudeFlux, spectralBV, STAR_BYTES, starBrightnessCode, starColor } from '../../src/world/starfile.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'public/assets/sky/stars.bin');
const cache = process.env.SKY_SOURCES ?? join(process.env.npm_config_cache ?? join(homedir(), '.npm'), '_solartournament', 'sky');

/** The catalogue as HEASARC's archive serves it, and its SHA-256 as fetched on 2026-10-30. */
const SOURCE = {
  url: 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz',
  file: 'heasarc_bsc5p.tdat.gz',
  sha256: '122628cde2d8bedf7e16ddf5f888167ac58c04b5592d6155408ce297f3073931',
};

async function source(): Promise<Buffer> {
  const path = join(cache, SOURCE.file);
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  if (existsSync(path)) {
    const bytes = readFileSync(path);
    if (hash(bytes) === SOURCE.sha256) return bytes;
  }
  console.log(`Fetching ${SOURCE.url}`);
  const answer = await fetch(SOURCE.url, { signal: AbortSignal.timeout(300000) });
  if (!answer.ok) throw new Error(`${SOURCE.file} not fetched: HTTP ${answer.status}`);
  const bytes = Buffer.from(await answer.arrayBuffer());
  if (hash(bytes) !== SOURCE.sha256) throw new Error(`${SOURCE.file} has SHA-256 ${hash(bytes)}, pinned is ${SOURCE.sha256}: not used`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(`${path}.part`, bytes);
  renameSync(`${path}.part`, path);
  return bytes;
}

/** A star of the catalogue as the file keeps it. */
interface Star {
  ra: number;
  dec: number;
  flux: number;
  color: [number, number, number];
}

/**
 * The stars of HEASARC's table (a "tdat" file: a header naming the fields of each line, then
 * one star a line, its fields between bars). The 14 entries that are no stars (novae, clusters
 * and galaxies kept for their numbers) have no magnitude and are left out.
 */
function readCatalogue(text: string): Star[] {
  const fields = /^line\[1\] = (.*)$/m.exec(text)?.[1].trim().split(/\s+/);
  if (!fields) throw new Error('The catalogue names no fields');
  const column = (name: string) => {
    const index = fields.indexOf(name);
    if (index < 0) throw new Error(`The catalogue has no field ${name}`);
    return index;
  };
  const [ra, dec, vmag, bv, type] = ['ra', 'dec', 'vmag', 'bv_color', 'spect_type'].map(column);
  const rows = text.slice(text.indexOf('<DATA>') + 6, text.indexOf('<END>')).trim().split('\n');
  const stars: Star[] = [];
  for (const row of rows) {
    const cells = row.split('|');
    if (cells[vmag].trim() === '' || cells[ra].trim() === '') continue;
    const index = cells[bv].trim() === '' ? spectralBV(cells[type]) : Number(cells[bv]);
    stars.push({ ra: Number(cells[ra]), dec: Number(cells[dec]), flux: magnitudeFlux(Number(cells[vmag])), color: starColor(index) });
  }
  return stars;
}

const stars = readCatalogue(gunzipSync(await source()).toString('latin1'));
stars.sort((a, b) => b.flux - a.flux);
const file = new DataView(new ArrayBuffer(stars.length * STAR_BYTES));
stars.forEach((star, n) => {
  const at = n * STAR_BYTES;
  file.setUint16(at, Math.round((star.ra / 360) * 65536) % 65536, true);
  file.setUint16(at + 2, Math.round(((star.dec + 90) / 180) * 65535), true);
  star.color.forEach((c, k) => file.setUint8(at + 4 + k, Math.round(255 * c)));
  file.setUint8(at + 7, starBrightnessCode(star.flux));
});
writeFileSync(out, new Uint8Array(file.buffer));
console.log(`${stars.length} stars written to ${out} (${file.byteLength} bytes)`);
