import * as THREE from 'three';
import { Randomizer } from '../random';
import { canvas, toTexture } from './textures';

/**
 * The surfaces of everything built in code, drawn on canvases from fixed seeds, so every
 * session shows the same wear. A surface comes as three maps: a color map that the part's own
 * color is multiplied with, a map of roughness (green) and metalness (blue) as three.js reads
 * them, with how intact a clear lacquer over the paint is in its red (gone where the paint
 * rusted or chipped, dull where it is scratched; read by the hulls, see ship/models.ts), and a
 * bump map of grooves and rivets. All of it is look only; nothing of it is shared.
 *
 * The fighters of the Games come from the depots of centuries of war: their paint is worn,
 * chipped down to bare metal, streaked with rust and grime, stenciled over and over. The
 * President's battleship is new and gleams; the world ship of the derelict arena carries the
 * craters and burns of the battle that broke it.
 */

/** Texture size of a surface (px): small, for phones; a surface repeats across a part (see boxUv). */
const SIZE = 256;

export type Surface = { map: THREE.Texture; orm: THREE.Texture; bump: THREE.Texture };

/**
 * Where nothing can be drawn (the unit tests run in Node, without a document), every surface is
 * a set of empty textures: the rules of what carries it do not depend on its looks.
 */
const drawable = typeof document !== 'undefined';
const blankSurface = (): Surface => ({ map: new THREE.Texture(), orm: new THREE.Texture(), bump: new THREE.Texture() });

/** How worn a surface is (0..1 each), and the stencils painted on it. */
export interface Wear {
  /** Rust streaks running from rivets and seams. */
  rust: number;
  /** Paint chipped down to bare, polished metal. */
  chips: number;
  /** Grime and soot in patches. */
  grime: number;
  /** Fine scratches. */
  scratches: number;
  /** How dark the panel seams are. */
  seams: number;
  /** Stencils in dark paint: numbers, arrows, warnings. */
  stencils: readonly string[];
  /** Roughness and metalness of the paint itself (0..1). */
  roughness: number;
  metalness: number;
  /** A fine pattern of scales instead of riveted panels (the alien hull). */
  scales?: boolean;
  /** Dents beaten into the plating (0..1; none when left out). */
  dents?: number;
}

/** The three canvases of a surface, filled: color white, paint's roughness and metalness, flat bump. */
function blank(wear: Pick<Wear, 'roughness' | 'metalness'>) {
  const color = canvas(SIZE);
  const orm = canvas(SIZE);
  const bump = canvas(SIZE);
  color[1].fillStyle = '#fff';
  color[1].fillRect(0, 0, SIZE, SIZE);
  orm[1].fillStyle = ormColor(wear.roughness, wear.metalness);
  orm[1].fillRect(0, 0, SIZE, SIZE);
  bump[1].fillStyle = '#808080';
  bump[1].fillRect(0, 0, SIZE, SIZE);
  return { color, orm, bump };
}

/** What of a surface glows of its own (an emissive map): black, drawn on in light. */
function glowLayer() {
  const layer = canvas(SIZE);
  layer[1].fillStyle = '#000';
  layer[1].fillRect(0, 0, SIZE, SIZE);
  return layer;
}

function glowTexture(element: HTMLCanvasElement) {
  const texture = toTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A surface with a layer that glows of its own (embers). */
export type GlowingSurface = Surface & { glow: THREE.Texture };

/** A color of the second map: how intact a lacquer over it is (red), roughness (green), metalness (blue). */
const ormColor = (roughness: number, metalness: number, alpha = 1, lacquer = 1) => `rgba(${Math.round(lacquer * 255)}, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)}, ${alpha})`;

/** The three canvases as repeating textures (the color map in sRGB, the others linear). */
function textures(color: HTMLCanvasElement, orm: HTMLCanvasElement, bump: HTMLCanvasElement): Surface {
  const repeat = (texture: THREE.CanvasTexture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  const linear = (element: HTMLCanvasElement) => repeat(new THREE.CanvasTexture(element));
  return { map: repeat(toTexture(color)), orm: linear(orm), bump: linear(bump) };
}

/** Panels of riveted plating: seams as grooves, rivets as bumps along them. */
function panels(r: Randomizer, color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, seams: number) {
  const rows = [0, 64, 128, 192, 256];
  color.strokeStyle = `rgba(0, 0, 0, ${0.12 + 0.28 * seams})`;
  bump.strokeStyle = '#404040';
  color.lineWidth = bump.lineWidth = 1.5;
  for (const y of rows) {
    for (const g of [color, bump]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(SIZE, y);
      g.stroke();
    }
    // the panels of a row are of different widths, as plates patched in over the years
    for (let x = 0; x < SIZE; ) {
      const width = [32, 48, 64, 96][r.nextInt() % 4];
      for (const g of [color, bump]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 64);
        g.stroke();
      }
      x += width;
    }
    // rivets in a row just off the seam
    for (let x = 4; x < SIZE; x += 8) {
      bump.fillStyle = '#c8c8c8';
      bump.fillRect(x, y + 4, 2, 2);
      color.fillStyle = 'rgba(0, 0, 0, 0.18)';
      color.fillRect(x + 1, y + 5, 1.5, 1.5);
    }
  }
}

/** A fine pattern of scales: overlapping arcs, as grown rather than riveted. */
function scales(color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, seams: number) {
  color.strokeStyle = `rgba(0, 0, 0, ${0.2 + 0.4 * seams})`;
  bump.strokeStyle = '#404040';
  color.lineWidth = bump.lineWidth = 1.5;
  for (let y = 0; y <= SIZE; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 8; x <= SIZE; x += 16) {
      for (const g of [color, bump]) {
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI);
        g.stroke();
      }
    }
  }
}

/** Soft patches of grime and soot. */
function grime(r: Randomizer, color: CanvasRenderingContext2D, amount: number) {
  for (let i = 0; i < 18 * amount; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const radius = r.range(12, 60);
    const gradient = color.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(20, 16, 12, ${0.35 * amount})`);
    gradient.addColorStop(1, 'rgba(20, 16, 12, 0)');
    color.fillStyle = gradient;
    color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** Rust streaks: brown drips down from the seams, rough and dull. */
function rust(r: Randomizer, color: CanvasRenderingContext2D, orm: CanvasRenderingContext2D, amount: number) {
  for (let i = 0; i < 40 * amount; i++) {
    const x = r.range(0, SIZE);
    const y = Math.floor(r.range(0, 4)) * 64 + 6;
    const length = r.range(10, 48);
    const width = r.range(1.5, 5);
    const gradient = color.createLinearGradient(0, y, 0, y + length);
    gradient.addColorStop(0, 'rgba(140, 62, 22, 0.75)');
    gradient.addColorStop(1, 'rgba(140, 62, 22, 0)');
    color.fillStyle = gradient;
    color.fillRect(x, y, width, length);
    orm.fillStyle = ormColor(0.95, 0.05, 0.8, 0);
    orm.fillRect(x, y, width, length * 0.6);
  }
}

/** Chips: paint flaked off down to bare metal, smooth and metallic, a pale scar in the color. */
function chips(r: Randomizer, color: CanvasRenderingContext2D, orm: CanvasRenderingContext2D, amount: number) {
  for (let i = 0; i < 60 * amount; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const size = r.range(1.5, 7);
    color.fillStyle = 'rgba(200, 200, 205, 0.9)';
    orm.fillStyle = ormColor(0.25, 1, 1, 0);
    for (const g of [color, orm]) {
      g.beginPath();
      // an irregular flake: a few points around the spot
      for (let k = 0; k < 5; k++) {
        const angle = (k / 5) * Math.PI * 2;
        const reach = size * r.range(0.5, 1.2);
        if (k === 0) g.moveTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
        else g.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
      }
      g.fill();
    }
  }
}

/** Fine scratches, bright in roughness (scuffed) and a little darker in color. */
function scratches(r: Randomizer, color: CanvasRenderingContext2D, orm: CanvasRenderingContext2D, amount: number) {
  color.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  orm.strokeStyle = ormColor(0.35, 0.9, 0.7, 0.3);
  color.lineWidth = orm.lineWidth = 0.8;
  for (let i = 0; i < 50 * amount; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const angle = r.range(-0.6, 0.6);
    const length = r.range(8, 40);
    for (const g of [color, orm]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      g.stroke();
    }
  }
}

/** Dents: shallow dips in the bump, a shade darker in their hollow, the light catching their rim. */
function dents(r: Randomizer, color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, amount: number) {
  for (let i = 0; i < 16 * amount; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const radius = r.range(6, 22);
    const dip = bump.createRadialGradient(x, y, 0, x, y, radius);
    dip.addColorStop(0, 'rgba(40, 40, 40, 0.8)');
    dip.addColorStop(0.75, 'rgba(110, 110, 110, 0.4)');
    dip.addColorStop(0.9, 'rgba(170, 170, 170, 0.35)');
    dip.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bump.fillStyle = dip;
    bump.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const shade = color.createRadialGradient(x, y, 0, x, y, radius);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    color.fillStyle = shade;
    color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** Stencils: numbers and warnings in dark paint, half worn off, the paint of a depot. */
function stencils(r: Randomizer, color: CanvasRenderingContext2D, texts: readonly string[]) {
  color.font = 'bold 13px monospace';
  color.textBaseline = 'top';
  for (const text of texts) {
    color.fillStyle = `rgba(10, 10, 10, ${r.range(0.45, 0.7)})`;
    color.fillText(text, r.range(6, SIZE - 80), Math.floor(r.range(0, 4)) * 64 + r.range(14, 40));
  }
}

const worn = new Map<string, Surface>();

/** A worn surface of a seed and a wear (built once per pair, shared by every part that carries it). */
export function wornSurface(seed: number, wear: Wear): Surface {
  const key = `${seed}:${JSON.stringify(wear)}`;
  const kept = worn.get(key);
  if (kept) return kept;
  if (!drawable) return blankSurface();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank(wear);
  if (wear.scales) scales(color[1], bump[1], wear.seams);
  else panels(r, color[1], bump[1], wear.seams);
  if (wear.dents) dents(r, color[1], bump[1], wear.dents);
  grime(r, color[1], wear.grime);
  rust(r, color[1], orm[1], wear.rust);
  chips(r, color[1], orm[1], wear.chips);
  scratches(r, color[1], orm[1], wear.scratches);
  stencils(r, color[1], wear.stencils);
  const surface = textures(color[0], orm[0], bump[0]);
  worn.set(key, surface);
  return surface;
}

let ravaged: GlowingSurface | null = null;
const blankGlowing = (): GlowingSurface => ({ ...blankSurface(), glow: new THREE.Texture() });

/**
 * The world ship's plating after the battle that broke it: panels of grey, meteorite craters
 * with raised rims, burns with the blue and violet tint of heat around a black core, soot
 * streaked along the hull, rust; the last embers glow in a few craters (see emissive).
 */
export function ravagedSurface(seed: number): GlowingSurface {
  if (ravaged) return ravaged;
  if (!drawable) return blankGlowing();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank({ roughness: 0.75, metalness: 0.35 });
  const g = color[1];
  // panels of different greys
  for (let y = 0; y < SIZE; y += 32) {
    for (let x = 0; x < SIZE; x += 64) {
      const shade = Math.floor(r.range(150, 225));
      g.fillStyle = `rgb(${shade}, ${shade}, ${shade + 6})`;
      g.fillRect(x, y, 64, 32);
    }
  }
  panels(r, g, bump[1], 0.6);
  // soot streaks along the hull, as the fire ran with the ship's flight
  for (let i = 0; i < 14; i++) {
    const y = r.range(0, SIZE);
    const gradient = g.createLinearGradient(0, y, SIZE, y);
    gradient.addColorStop(0, 'rgba(15, 12, 10, 0)');
    gradient.addColorStop(r.range(0.2, 0.8), 'rgba(15, 12, 10, 0.55)');
    gradient.addColorStop(1, 'rgba(15, 12, 10, 0)');
    g.fillStyle = gradient;
    g.fillRect(0, y, SIZE, r.range(3, 12));
  }
  // burns: a black core in rings of heat tint
  for (let i = 0; i < 6; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const radius = r.range(20, 50);
    const burn = g.createRadialGradient(x, y, 0, x, y, radius);
    burn.addColorStop(0, 'rgba(5, 4, 4, 0.95)');
    burn.addColorStop(0.45, 'rgba(40, 24, 60, 0.7)');
    burn.addColorStop(0.7, 'rgba(60, 70, 140, 0.45)');
    burn.addColorStop(0.85, 'rgba(150, 110, 50, 0.3)');
    burn.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = burn;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    orm[1].fillStyle = ormColor(1, 0);
    orm[1].beginPath();
    orm[1].arc(x, y, radius * 0.5, 0, Math.PI * 2);
    orm[1].fill();
  }
  // craters: a dark pit, a raised rim, fine ejecta around
  const embers = glowLayer();
  for (let i = 0; i < 22; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const radius = r.range(3, 14);
    g.fillStyle = 'rgba(8, 7, 6, 0.95)';
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(230, 225, 215, 0.6)';
    g.lineWidth = 1.5;
    g.stroke();
    bump[1].fillStyle = '#101010';
    bump[1].beginPath();
    bump[1].arc(x, y, radius, 0, Math.PI * 2);
    bump[1].fill();
    bump[1].strokeStyle = '#f0f0f0';
    bump[1].lineWidth = 2;
    bump[1].stroke();
    for (let k = 0; k < 6; k++) {
      g.fillStyle = 'rgba(20, 18, 16, 0.5)';
      g.fillRect(x + r.range(-3, 3) * radius, y + r.range(-3, 3) * radius, 1.5, 1.5);
    }
    // the last embers in some of the deeper pits
    if (radius > 9 && r.nextFloat() < 0.5) {
      const glow = embers[1].createRadialGradient(x, y, 0, x, y, radius * 0.7);
      glow.addColorStop(0, 'rgba(255, 120, 30, 1)');
      glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
      embers[1].fillStyle = glow;
      embers[1].fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  rust(r, g, orm[1], 0.6);
  ravaged = { ...textures(color[0], orm[0], bump[0]), glow: glowTexture(embers[0]) };
  return ravaged;
}

/**
 * The battleship's armor repeats every ARMOR_TILE units (80 m) across its hull, at 12.8 pixels a
 * meter in its relief (ARMOR_RELIEF_SIZE) and half that in its color and finish (ARMOR_SIZE):
 * sharp enough for a seam of 20 cm and a rivet's head a pilot flies past, and with its mipmaps
 * about 8 MB on the GPU, light enough for a phone.
 */
export const ARMOR_TILE = 1600;
const ARMOR_RELIEF_SIZE = 1024;
const ARMOR_SIZE = 512;
/** A plate is 10 m long and a course 5 m high (relief pixels); every fourth course a riveted belt strap. */
const PLATE = 128;
const COURSE = 64;
const BELT_EVERY = 4;
/** How steep the relief's slopes are in the normal map (normal map units per height step of the canvas). */
const ARMOR_SLOPE = 6;

/** The battleship's armor: its color, its finish (roughness and metalness, see ormColor) and its relief as a normal map. */
export type ArmorSurface = { map: THREE.Texture; orm: THREE.Texture; normal: THREE.Texture };
let armored: ArmorSurface | null = null;

/**
 * The plates of the armor, laid out once from the seed: where each lies (relief pixels), its
 * shade (lighter or darker than its neighbors, -1..1), its polish, whether a hatch sits in it,
 * and whether an edge of it is rubbed bright (the ship is new: a few only).
 */
type Plate = { x: number; y: number; width: number; shade: number; roughness: number; hatch: number[] | null; rubbed: boolean };

const shifted = (p: Plate, dx: number): Plate => ({ ...p, x: p.x + dx, hatch: p.hatch && [p.hatch[0] + dx, ...p.hatch.slice(1)] });

function armorPlates(r: Randomizer): Plate[] {
  const plates: Plate[] = [];
  for (let y = 0; y < ARMOR_RELIEF_SIZE; y += COURSE) {
    const shift = (y / COURSE) % 2 ? PLATE / 2 : 0;
    for (let x = shift; x < ARMOR_RELIEF_SIZE + shift; x += PLATE) {
      const hatch = r.nextFloat() < 0.18 ? [x + r.range(16, PLATE - 48), y + r.range(14, COURSE - 30), r.range(18, 30), r.range(12, 18)] : null;
      plates.push({ x, y, width: PLATE, shade: r.range(-1, 1), roughness: r.range(0.26, 0.4), hatch, rubbed: r.nextFloat() < 0.12 });
    }
  }
  return plates;
}

/**
 * The President's battleship, fresh from the dock: heavy armor plates of dark gunmetal laid in
 * staggered courses (5 m high, 10 m long, each course shifted by half a plate), deep seams
 * between them with a row of rivets along each, every fourth course a belt strap standing out of
 * the armor with two rows of rivets, here and there a flush hatch; each plate a shade lighter or
 * darker than its neighbors and a little more or less polished, a few edges rubbed bright where
 * the dock's cranes set them. The relief is a normal map, not a bump map: mipmapped like the
 * color, it fades evenly with distance instead of shimmering on a phone's small screen.
 */
export function armorSurface(seed: number): ArmorSurface {
  if (armored) return armored;
  if (!drawable) return { map: new THREE.Texture(), orm: new THREE.Texture(), normal: new THREE.Texture() };
  const plates = armorPlates(new Randomizer(seed));
  const [colorCanvas, color] = canvas(ARMOR_SIZE);
  const [ormCanvas, orm] = canvas(ARMOR_SIZE);
  const [, height] = canvas(ARMOR_RELIEF_SIZE);
  // color and finish are drawn in the relief's pixels, at half the size
  color.scale(ARMOR_SIZE / ARMOR_RELIEF_SIZE, ARMOR_SIZE / ARMOR_RELIEF_SIZE);
  orm.scale(ARMOR_SIZE / ARMOR_RELIEF_SIZE, ARMOR_SIZE / ARMOR_RELIEF_SIZE);
  height.fillStyle = '#808080';
  height.fillRect(0, 0, ARMOR_RELIEF_SIZE, ARMOR_RELIEF_SIZE);
  const rivets = (g: CanvasRenderingContext2D, x0: number, x1: number, y: number, fill: string, size: number) => {
    g.fillStyle = fill;
    for (let x = x0 + 8; x < x1 - 4; x += 16) g.fillRect(x - size / 2, y - size / 2, size, size);
  };
  // a plate that runs over the tile's right edge is drawn again from its left edge
  for (const p of plates.flatMap((p) => (p.x + p.width > ARMOR_RELIEF_SIZE ? [p, shifted(p, -ARMOR_RELIEF_SIZE)] : [p]))) {
    const shade = Math.round(p.shade * 7);
    color.fillStyle = `rgb(${236 + shade}, ${238 + shade}, ${242 + shade})`;
    color.fillRect(p.x, p.y, p.width, COURSE);
    orm.fillStyle = ormColor(p.roughness, 0.6);
    orm.fillRect(p.x, p.y, p.width, COURSE);
    // the seams: a groove with soft shoulders, dark in color and duller
    height.fillStyle = '#6a6a6a';
    height.fillRect(p.x, p.y, p.width, 5);
    height.fillRect(p.x, p.y, 5, COURSE);
    height.fillStyle = '#303030';
    height.fillRect(p.x, p.y + 1, p.width, 3);
    height.fillRect(p.x + 1, p.y, 3, COURSE);
    color.fillStyle = 'rgba(20, 22, 28, 0.5)';
    color.fillRect(p.x, p.y, p.width, 4);
    color.fillRect(p.x, p.y, 4, COURSE);
    orm.fillStyle = ormColor(0.6, 0.4);
    orm.fillRect(p.x, p.y, p.width, 4);
    orm.fillRect(p.x, p.y, 4, COURSE);
    // a row of rivets just under the plate's upper seam
    rivets(height, p.x, p.x + p.width, p.y + 9, '#c4c4c4', 3);
    rivets(color, p.x, p.x + p.width, p.y + 9, 'rgba(255, 255, 255, 0.22)', 2);
    if (p.hatch) {
      const [hx, hy, hw, hh] = p.hatch;
      height.strokeStyle = '#4a4a4a';
      height.lineWidth = 2;
      height.strokeRect(hx, hy, hw, hh);
      color.strokeStyle = 'rgba(20, 22, 28, 0.5)';
      color.lineWidth = 2;
      color.strokeRect(hx, hy, hw, hh);
      rivets(height, hx - 6, hx + hw + 6, hy + hh / 2, '#b0b0b0', 2);
    }
    if (p.rubbed) {
      // bare metal rubbed bright along the plate's lower edge: lighter, smoother
      color.fillStyle = 'rgba(255, 255, 255, 0.25)';
      color.fillRect(p.x + 6, p.y + COURSE - 4, p.width * 0.6, 2);
      orm.fillStyle = ormColor(0.18, 0.95);
      orm.fillRect(p.x + 6, p.y + COURSE - 4, p.width * 0.6, 2);
    }
  }
  // the belt straps: a band 1 m high standing out of the armor, grooved along both edges, riveted twice
  // (drawn at both ends of the tile, so the band wraps around its edge)
  for (let y = 0; y <= ARMOR_RELIEF_SIZE; y += COURSE * BELT_EVERY) {
    height.fillStyle = '#b4b4b4';
    height.fillRect(0, y - 6, ARMOR_RELIEF_SIZE, 13);
    height.fillStyle = '#3a3a3a';
    height.fillRect(0, y - 8, ARMOR_RELIEF_SIZE, 2);
    height.fillRect(0, y + 7, ARMOR_RELIEF_SIZE, 2);
    color.fillStyle = 'rgb(214, 218, 226)';
    color.fillRect(0, y - 6, ARMOR_RELIEF_SIZE, 13);
    orm.fillStyle = ormColor(0.32, 0.65);
    orm.fillRect(0, y - 6, ARMOR_RELIEF_SIZE, 13);
    rivets(height, 0, ARMOR_RELIEF_SIZE, y - 3, '#e0e0e0', 3);
    rivets(height, 0, ARMOR_RELIEF_SIZE, y + 3, '#e0e0e0', 3);
    rivets(color, 0, ARMOR_RELIEF_SIZE, y - 3, 'rgba(255, 255, 255, 0.3)', 2);
    rivets(color, 0, ARMOR_RELIEF_SIZE, y + 3, 'rgba(255, 255, 255, 0.3)', 2);
  }
  armored = { map: armorTexture(toTexture(colorCanvas)), orm: armorTexture(new THREE.CanvasTexture(ormCanvas)), normal: armorTexture(normalFrom(height)) };
  return armored;
}

function armorTexture<T extends THREE.Texture>(texture: T): T {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A tangent-space normal map from a square canvas of heights (gray, wrapping around its edges):
 * each pixel tilts against the slope across it, by `slope` per step of the canvas's gray (0..1).
 * Texture coordinates run as the GPU reads a canvas texture: u along a row, v up the canvas (its
 * first row at v = 1); red holds the normal along u, green along v, blue out of the surface.
 */
export function normalPixels(heights: ArrayLike<number>, size: number, slope: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => heights[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rising along u tilts the normal back along -u; rising down the canvas is falling along v
      const nx = -(at(x + 1, y) - at(x - 1, y)) * slope;
      const ny = (at(x, y + 1) - at(x, y - 1)) * slope;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round((nx / length / 2 + 0.5) * 255);
      out[i + 1] = Math.round((ny / length / 2 + 0.5) * 255);
      out[i + 2] = Math.round((1 / length / 2 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

function normalFrom(height: CanvasRenderingContext2D): THREE.CanvasTexture {
  const size = height.canvas.width;
  const [element, g] = canvas(size);
  const image = g.createImageData(size, size);
  image.data.set(normalPixels(height.getImageData(0, 0, size, size).data, size, ARMOR_SLOPE));
  g.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(element);
}

let industrial: Surface | null = null;

/**
 * The tournament's rings: industrial armor plating, riveted and grimy, with yellow and black
 * hazard stripes along its edges and coil numbers stenciled on.
 */
export function industrialSurface(seed: number): Surface {
  if (industrial) return industrial;
  if (!drawable) return blankSurface();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank({ roughness: 0.6, metalness: 0.45 });
  const g = color[1];
  panels(r, g, bump[1], 0.7);
  grime(r, g, 0.7);
  rust(r, g, orm[1], 0.35);
  scratches(r, g, orm[1], 0.5);
  // hazard stripes along one edge of the tile
  g.save();
  g.beginPath();
  g.rect(0, SIZE - 22, SIZE, 18);
  g.clip();
  for (let x = -40; x < SIZE + 40; x += 20) {
    g.fillStyle = (x / 20) % 2 === 0 ? 'rgba(255, 196, 0, 0.95)' : 'rgba(20, 20, 20, 0.95)';
    g.beginPath();
    g.moveTo(x, SIZE - 22);
    g.lineTo(x + 10, SIZE - 22);
    g.lineTo(x - 8, SIZE - 4);
    g.lineTo(x - 18, SIZE - 4);
    g.fill();
  }
  g.restore();
  stencils(r, g, ['COIL 07', 'HV 40 kA', 'NO DOCKING', 'MOW-2584']);
  industrial = textures(color[0], orm[0], bump[0]);
  return industrial;
}

let cells: THREE.Texture | null = null;

/** Solar cells: a grid of deep blue cells between silver lines, some cells darker, as aged panels go. */
export function solarCells(): THREE.Texture {
  if (cells) return cells;
  if (!drawable) return (cells = new THREE.Texture());
  const r = new Randomizer(5);
  const [element, g] = canvas(128);
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 16) {
      const shade = r.range(0.7, 1);
      g.fillStyle = `rgb(${Math.round(30 * shade)}, ${Math.round(50 * shade)}, ${Math.round(120 * shade)})`;
      g.fillRect(x, y, 16, 16);
      g.fillStyle = 'rgba(255, 255, 255, 0.08)';
      g.fillRect(x + 2, y + 2, 12, 3);
    }
  }
  g.strokeStyle = '#b8c0cc';
  g.lineWidth = 1.5;
  for (let p = 0; p <= 128; p += 16) {
    g.strokeRect(p, 0, 0, 128);
    g.strokeRect(0, p, 128, 0);
  }
  cells = toTexture(element);
  cells.wrapS = cells.wrapT = THREE.RepeatWrapping;
  cells.repeat.set(6, 2);
  return cells;
}

let bands: THREE.Texture | null = null;

/** A torpedo's casing, around (u) and along (v): gunmetal with yellow and black warning bands near the nose and a stenciled lot number. */
export function warheadBands(): THREE.Texture {
  if (bands) return bands;
  if (!drawable) return (bands = new THREE.Texture());
  const [element, g] = canvas(64, 128);
  g.fillStyle = '#9a9fa8';
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 30; y += 6) {
    g.fillStyle = (y / 6) % 2 < 1 ? '#ffc400' : '#141414';
    g.fillRect(0, y, 64, 6);
  }
  g.fillStyle = '#b02010';
  g.fillRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(10, 10, 10, 0.7)';
  g.font = 'bold 9px monospace';
  g.fillText('MK-IV', 6, 70);
  bands = toTexture(element);
  return bands;
}

/** A lit sign: a sponsor's name in neon letters on a dark plate, framed. */
export function signTexture(text: string, tint: string): THREE.Texture {
  if (!drawable) return new THREE.Texture();
  const [element, g] = canvas(512, 128);
  g.fillStyle = '#06070c';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = tint;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = tint;
  g.shadowBlur = 18;
  g.fillStyle = '#fff6ec';
  g.fillText(text, 256, 68, 470);
  return toTexture(element);
}

/** A material's surface: the color map, roughness and metalness, and the bump of seams and rivets. */
export function surfaced(surface: Surface, bumpScale: number) {
  return { map: surface.map, roughnessMap: surface.orm, metalnessMap: surface.orm, roughness: 1, metalness: 1, bumpMap: surface.bump, bumpScale };
}

/**
 * Texture coordinates for flat-faced parts: each face takes the surface at the same density
 * (one tile per `tile` units), projected along its dominant axis, so long and short parts look
 * alike.
 */
export function boxUv(geometry: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const [u, v] = nx >= ny && nx >= nz ? [position.getZ(i), position.getY(i)] : ny >= nz ? [position.getX(i), position.getZ(i)] : [position.getX(i), position.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** The materials under a clear lacquer, with the strength of their lacquer and its film (see setLacquer). */
const lacquered = new Map<THREE.MeshPhysicalMaterial, { clearcoat: number; iridescence: number }>();
let lacquerOn = true;

/** Registers a material's clear lacquer, so the picture's quality can take it off (see setLacquer). */
export function lacquer<M extends THREE.MeshPhysicalMaterial>(material: M): M {
  lacquered.set(material, { clearcoat: material.clearcoat, iridescence: material.iridescence });
  material.addEventListener('dispose', () => lacquered.delete(material));
  if (!lacquerOn) material.clearcoat = material.iridescence = 0;
  return material;
}

/**
 * Lacquer on or off on every registered material. Without it a hull is shaded as plain painted
 * metal: three.js drops the second specular layer (and the film's colors) from the shader when
 * their strength is 0, which costs a compile of the hulls' shaders once.
 */
export function setLacquer(on: boolean) {
  lacquerOn = on;
  for (const [material, kept] of lacquered) {
    material.clearcoat = on ? kept.clearcoat : 0;
    material.iridescence = on ? kept.iridescence : 0;
  }
}

let mirrored: THREE.CubeTexture | null = null;

/**
 * What polished plates mirror, painted in code: deep space, the sun blazing on one side, and
 * the tournament's neon in streaks, orange and azure. The glint of metal turning in the light,
 * built once for everything that shines.
 */
export function shine(): THREE.CubeTexture {
  if (mirrored) return mirrored;
  if (!drawable) return new THREE.CubeTexture();
  const face = (paint: (g: CanvasRenderingContext2D) => void) => {
    const [element, g] = canvas(128);
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#2a3242');
    sky.addColorStop(0.55, '#0a0d14');
    sky.addColorStop(1, '#020203');
    g.fillStyle = sky;
    g.fillRect(0, 0, 128, 128);
    paint(g);
    return element;
  };
  const streak = (color: string, y: number) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = color;
    g.fillRect(0, y, 128, 6);
  };
  const sun = (g: CanvasRenderingContext2D) => {
    const glow = g.createRadialGradient(64, 40, 0, 64, 40, 46);
    glow.addColorStop(0, '#fffaf0');
    glow.addColorStop(0.2, '#ffd9a0');
    glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
  };
  // +x, -x, +y, -y, +z, -z
  mirrored = new THREE.CubeTexture([face(sun), face(streak('#ff9d00', 70)), face(() => {}), face(() => {}), face(streak('#4d91ff', 76)), face(streak('#ff9d00', 60))]);
  mirrored.colorSpace = THREE.SRGBColorSpace;
  mirrored.needsUpdate = true;
  return mirrored;
}
