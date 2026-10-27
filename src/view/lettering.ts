import * as THREE from 'three';
import { Randomizer } from '../random';
import { canvas, toTexture } from './textures';

/**
 * Paint on a hull: a ship's name, its registry and an emblem, in large stenciled block letters
 * drawn from rectangles (the same on every device, whatever fonts it has), weathered by
 * centuries out there: faded, chipped down to the plating, scratched and pitted by
 * micrometeorites. Drawn once on a canvas with transparency, laid over the plating as a decal
 * and lit like the hull. Look only.
 */

/** The width of a glyph and the gap after it, and a glyph's height, in strokes (a stroke is one unit thick). */
const GLYPH_WIDTH = 4;
const GLYPH_GAP = 1;
const GLYPH_HEIGHT = 6;
/** A space is this wide (units). */
const SPACE_WIDTH = 2;

/**
 * The stencil glyphs as rectangles [x, y, width, height] in units (y down), with the stencil's
 * bridges as gaps a quarter unit wide where a bar meets a stem. Only the letters the hull carries.
 */
const GLYPHS: Record<string, readonly (readonly [number, number, number, number])[]> = {
  P: [[0, 0, 1, 6], [1.25, 0, 2.75, 1], [3, 1, 1, 2], [1.25, 3, 2.75, 1]],
  E: [[0, 0, 1, 6], [1.25, 0, 2.75, 1], [1.25, 2.5, 2, 1], [1.25, 5, 2.75, 1]],
  R: [[0, 0, 1, 6], [1.25, 0, 2.75, 1], [3, 1, 1, 2], [1.25, 3, 2.75, 1], [3, 4.25, 1, 1.75]],
  A: [[0, 0, 1, 6], [3, 0, 1, 6], [1.25, 0, 1.5, 1], [1.25, 3, 1.5, 1]],
  S: [[0, 0, 4, 1], [0, 1.25, 1, 1.25], [0, 2.5, 4, 1], [3, 3.75, 1, 1.25], [0, 5, 4, 1]],
  D: [[0, 0, 1, 6], [1.25, 0, 2, 1], [3, 1.25, 1, 3.5], [1.25, 5, 2, 1]],
  T: [[0, 0, 4, 1], [1.5, 1.25, 1, 4.75]],
  '0': [[0, 0, 1, 6], [3, 0, 1, 6], [1.25, 0, 1.5, 1], [1.25, 5, 1.5, 1], [1.75, 2.5, 0.5, 1]],
  '1': [[2, 0, 1, 6], [0.75, 0, 1, 1], [0.75, 5, 3, 1]],
};

/** Whether every character of `text` has a stencil glyph (or is a space). */
export const stencilable = (text: string) => [...text].every((char) => char === ' ' || char in GLYPHS);

/** How wide `text` runs (units). */
export function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += char === ' ' ? SPACE_WIDTH : GLYPH_WIDTH + GLYPH_GAP;
  return width - (text.endsWith(' ') ? 0 : GLYPH_GAP);
}

/** Paints `text` in stencil glyphs, its top left at (x, y), `unit` pixels a unit. */
function stencil(g: CanvasRenderingContext2D, text: string, x: number, y: number, unit: number) {
  for (const char of text) {
    if (char === ' ') {
      x += SPACE_WIDTH * unit;
      continue;
    }
    for (const [gx, gy, w, h] of GLYPHS[char] ?? []) g.fillRect(x + gx * unit, y + gy * unit, w * unit, h * unit);
    x += (GLYPH_WIDTH + GLYPH_GAP) * unit;
  }
}

/**
 * The emblem of the united Earth that built the ship (a design of the game's own): the globe
 * with its meridians and parallels, an orbit tilted around it, and five stars in an arc above,
 * the way out. Painted white on a blue disc, centered at (x, y), `radius` pixels.
 */
function emblem(g: CanvasRenderingContext2D, x: number, y: number, radius: number, paint: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#23407a';
  g.beginPath();
  g.arc(0, 0, radius, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = g.fillStyle = paint;
  g.lineWidth = radius * 0.05;
  g.beginPath();
  g.arc(0, 0, radius * 0.93, 0, Math.PI * 2);
  g.stroke();
  // the globe, a little below the middle
  const globe = radius * 0.42;
  g.translate(0, radius * 0.12);
  g.lineWidth = radius * 0.04;
  g.beginPath();
  g.arc(0, 0, globe, 0, Math.PI * 2);
  g.stroke();
  for (const squeeze of [0.35, 0.75]) {
    g.beginPath();
    g.ellipse(0, 0, globe * squeeze, globe, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, -globe);
  g.lineTo(0, globe);
  for (const latitude of [-0.5, 0, 0.5]) {
    const half = Math.sqrt(1 - latitude * latitude) * globe;
    g.moveTo(-half, latitude * globe);
    g.lineTo(half, latitude * globe);
  }
  g.stroke();
  // the orbit around it
  g.lineWidth = radius * 0.05;
  g.beginPath();
  g.ellipse(0, 0, globe * 1.55, globe * 0.42, -0.35, 0, Math.PI * 2);
  g.stroke();
  // five stars in an arc above it
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i - 2) * 0.42;
    star(g, Math.cos(angle) * globe * 1.45, Math.sin(angle) * globe * 1.45 - radius * 0.02, radius * (i === 2 ? 0.1 : 0.075));
  }
  g.restore();
}

/** A five-pointed star centered at (x, y). */
function star(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    const reach = k % 2 ? size * 0.42 : size;
    g.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  g.fill();
}

/**
 * Centuries of space on the paint: it faded in patches, flaked off in chips down to the
 * plating, and micrometeorites and debris scratched and pitted it. All of it takes paint away
 * (the plating shows through).
 */
function weather(r: Randomizer, g: CanvasRenderingContext2D, width: number, height: number) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  // faded patches
  for (let i = 0; i < 24; i++) {
    const x = r.range(0, width);
    const y = r.range(0, height);
    const radius = r.range(0.15, 0.5) * height;
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${r.range(0.2, 0.45)})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gradient;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  // chips, flaked off in irregular flakes
  g.fillStyle = '#000';
  for (let i = 0; i < width * 0.35; i++) {
    const x = r.range(0, width);
    const y = r.range(0, height);
    const size = r.range(1, 6);
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const angle = (k / 5) * Math.PI * 2;
      const reach = size * r.range(0.4, 1.2);
      g.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    g.fill();
  }
  // pits of micrometeorites
  for (let i = 0; i < width * 1.2; i++) g.fillRect(r.range(0, width), r.range(0, height), 1, 1);
  // long scratches, mostly along the hull
  g.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  for (let i = 0; i < width * 0.04; i++) {
    const x = r.range(0, width);
    const y = r.range(0, height);
    const angle = r.range(-0.25, 0.25) + (r.nextFloat() < 0.2 ? Math.PI / 2 : 0);
    const length = r.range(20, 220);
    g.lineWidth = r.range(0.6, 1.8);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    g.stroke();
  }
  g.restore();
}

/** The paint's colors: the name in the deep blue of the ship's livery, the emblem's lines in off-white. */
const NAME_PAINT = '#1a2d55';
const EMBLEM_PAINT = '#e9e4d6';

/** What a stretch of hull carries: a name, a smaller registry after it, the emblem before them, in this order from the left. */
export interface Lettering {
  emblem?: boolean;
  name?: string;
  registry?: string;
}

/** The canvas of a painted stretch (px): eight times as wide as high, as the stretch of hull it covers. */
export const PAINT_ASPECT = 8;
const PAINT_HEIGHT = 256;

/**
 * The paint of a stretch of hull as a texture with transparency, everything centered: the
 * emblem as high as the stretch, the name in letters of 70 % of it, the registry half as large,
 * set on the name's baseline, a livery stripe above and below. Weathered from `seed`.
 */
export function letteringTexture(lettering: Lettering, seed: number): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const height = PAINT_HEIGHT;
  const width = height * PAINT_ASPECT;
  const [element, g] = canvas(width, height);
  const unit = (height * 0.7) / GLYPH_HEIGHT;
  const small = unit * 0.5;
  const gap = unit * 4;
  const emblemSize = lettering.emblem ? height * 0.92 : 0;
  const nameWidth = lettering.name ? textWidth(lettering.name) * unit : 0;
  const registryWidth = lettering.registry ? textWidth(lettering.registry) * small : 0;
  const parts = [emblemSize, nameWidth, registryWidth].filter((w) => w > 0);
  const total = parts.reduce((sum, w) => sum + w, 0) + gap * (parts.length - 1);
  let x = (width - total) / 2;
  const top = (height - GLYPH_HEIGHT * unit) / 2;
  // the livery's stripes, the full length of the stretch
  g.fillStyle = NAME_PAINT;
  g.fillRect(0, 2, width, height * 0.035);
  g.fillRect(0, height - 2 - height * 0.035, width, height * 0.035);
  if (lettering.emblem) {
    emblem(g, x + emblemSize / 2, height / 2, emblemSize / 2, EMBLEM_PAINT);
    x += emblemSize + gap;
  }
  g.fillStyle = NAME_PAINT;
  if (lettering.name) {
    stencil(g, lettering.name, x, top, unit);
    x += nameWidth + gap;
  }
  if (lettering.registry) stencil(g, lettering.registry, x, top + (GLYPH_HEIGHT * unit - GLYPH_HEIGHT * small), small);
  weather(new Randomizer(seed), g, width, height);
  const texture = toTexture(element);
  texture.anisotropy = 4;
  return texture;
}
