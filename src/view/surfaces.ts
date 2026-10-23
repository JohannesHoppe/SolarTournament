import * as THREE from 'three';
import { Randomizer } from '../random';
import { canvas, toTexture } from './textures';

/**
 * The surfaces of everything built in code, drawn on canvases from fixed seeds, so every
 * session shows the same wear. A surface comes as three maps: a color map that the part's own
 * color is multiplied with, a map of roughness (green) and metalness (blue) as three.js reads
 * them, and a bump map of grooves and rivets. All of it is look only; nothing of it is shared.
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

/** A surface with a layer that glows of its own (embers, glitter). */
export type GlowingSurface = Surface & { glow: THREE.Texture };

const ormColor = (roughness: number, metalness: number, alpha = 1) => `rgba(255, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)}, ${alpha})`;

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
    orm.fillStyle = ormColor(0.95, 0.05, 0.8);
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
    orm.fillStyle = ormColor(0.25, 1);
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
  orm.strokeStyle = ormColor(0.35, 0.9, 0.7);
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

let gleaming: GlowingSurface | null = null;

/**
 * The President's battleship, fresh from the dock: flawless plating in fine pale seams, gold
 * pinstripes, and flakes of glitter in the lacquer, mirror smooth and fully metallic, that
 * sparkle even on the side away from the sun (see emissive).
 */
export function gleamingSurface(seed: number): GlowingSurface {
  if (gleaming) return gleaming;
  if (!drawable) return blankGlowing();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank({ roughness: 0.16, metalness: 0.95 });
  const g = color[1];
  g.strokeStyle = 'rgba(120, 125, 140, 0.35)';
  bump[1].strokeStyle = '#5a5a5a';
  g.lineWidth = bump[1].lineWidth = 1;
  for (let y = 0; y <= SIZE; y += 64) {
    for (const c of [g, bump[1]]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(SIZE, y);
      c.stroke();
    }
  }
  for (let x = 0; x <= SIZE; x += 128) {
    for (const c of [g, bump[1]]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, SIZE);
      c.stroke();
    }
  }
  // gold pinstripes
  g.fillStyle = 'rgba(255, 200, 80, 0.9)';
  for (const y of [30, 34, 158]) g.fillRect(0, y, SIZE, 1.5);
  // glitter: tiny flakes, mirror-smooth and bright, the brightest of them sparkling of their own
  const glitter = glowLayer();
  for (let i = 0; i < 420; i++) {
    const x = Math.floor(r.range(0, SIZE));
    const y = Math.floor(r.range(0, SIZE));
    const flake = r.nextFloat() < 0.5 ? '#fff6e0' : '#e6f0ff';
    g.fillStyle = flake;
    g.fillRect(x, y, 1, 1);
    orm[1].fillStyle = ormColor(0.02, 1);
    orm[1].fillRect(x, y, 1, 1);
    if (i % 3 === 0) {
      glitter[1].fillStyle = flake;
      glitter[1].fillRect(x, y, 1, 1);
    }
  }
  gleaming = { ...textures(color[0], orm[0], bump[0]), glow: glowTexture(glitter[0]) };
  return gleaming;
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
