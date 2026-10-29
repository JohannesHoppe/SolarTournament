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
function glowLayer(size = SIZE) {
  const layer = canvas(size);
  layer[1].fillStyle = '#000';
  layer[1].fillRect(0, 0, size, size);
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

/**
 * A surface whose relief is baked into a normal map (`normal`) besides its bump map, with what
 * glows of its own, and in the red of its second map how deep a point lies in a recess (a seam,
 * a crater's floor, a hatch's groove: 0 flush, 1 deep), where frost and dust gather.
 */
export type PlatingSurface = GlowingSurface & { normal: THREE.Texture };

/** Texture size of the plating (px): finer than the other surfaces, as a world ship's hull is seen up close over hundreds of meters. */
const PLATING = 512;
/**
 * The plating's heights in its bump map: PLATING_GRAY steps of gray a unit of height, around
 * the middle gray; and how steep the normal map tilts per step of that gray (see normalPixels):
 * a rise of one unit over a pixel tilts the normal by about 1.6 (58°).
 */
const PLATING_GRAY = 50;
const PLATING_SLOPE = 4;

const ravaged = new Map<number, PlatingSurface>();
const blankPlating = (): PlatingSurface => ({ ...blankSurface(), glow: new THREE.Texture(), normal: new THREE.Texture() });

/** The plating's maps while they are drawn: height (pixels' worth of relief), color (0..255, sRGB), roughness, metalness, per pixel, wrapping at the edges. */
class PlatingMaps {
  readonly height = new Float32Array(PLATING * PLATING);
  readonly color = new Float32Array(PLATING * PLATING * 3);
  readonly rough = new Float32Array(PLATING * PLATING).fill(0.72);
  readonly metal = new Float32Array(PLATING * PLATING).fill(0.3);

  /** The index of a pixel, wrapped into the tile. */
  at(x: number, y: number) {
    const s = PLATING;
    return (((Math.round(y) % s) + s) % s) * s + (((Math.round(x) % s) + s) % s);
  }

  /** Multiplies a pixel's color by `k`, or mixes it towards (r, g, b) by `k` with `to`. */
  shade(i: number, k: number, to?: [number, number, number]) {
    const c = this.color;
    for (let n = 0; n < 3; n++) c[i * 3 + n] = to ? c[i * 3 + n] + (to[n] - c[i * 3 + n]) * k : c[i * 3 + n] * k;
  }

  /** Mixes a pixel's roughness and metalness towards (rough, metal) by `k`. */
  finish(i: number, rough: number, metal: number, k = 1) {
    this.rough[i] += (rough - this.rough[i]) * k;
    this.metal[i] += (metal - this.metal[i]) * k;
  }

  /** Runs `paint(i, dx, dy)` over every pixel within `reach` of (cx, cy), wrapped, with its offset from there. */
  around(cx: number, cy: number, reachX: number, reachY: number, paint: (i: number, dx: number, dy: number) => void) {
    for (let y = Math.floor(cy - reachY); y <= Math.ceil(cy + reachY); y++) {
      for (let x = Math.floor(cx - reachX); x <= Math.ceil(cx + reachX); x++) paint(this.at(x, y), x - cx, y - cy);
    }
  }
}

/** Plates in courses of 2 and 4 m along the hull, of different lengths and greys, a few replaced with fresher ones, some stiffened by a rib; grooved seams with rivet rows on both sides. */
function plates(r: Randomizer, m: PlatingMaps) {
  const S = PLATING;
  for (let top = 0; top < S; ) {
    const course = S - top >= 64 && r.nextFloat() < 0.6 ? 64 : 32;
    const start = Math.floor(r.range(0, 8)) * 16;
    for (let x = start; x < start + S; ) {
      const width = Math.min([64, 96, 128, 192][r.nextInt() % 4], start + S - x);
      const fresh = r.nextFloat() < 0.08;
      const shade = fresh ? r.range(0.86, 0.92) : r.range(0.76, 0.87);
      const warm = r.range(-0.03, 0.03);
      const lift = r.range(-0.12, 0.12);
      const rib = width >= 96 && r.nextFloat() < 0.3 ? top + course / 2 : -1;
      for (let y = top; y < top + course; y++) {
        for (let u = x; u < x + width; u++) {
          const i = m.at(u, y);
          m.color[i * 3] = 255 * shade * (1 + warm);
          m.color[i * 3 + 1] = 255 * shade;
          m.color[i * 3 + 2] = 255 * shade * (1.02 - warm);
          m.height[i] = lift + (Math.abs(y - rib) <= 1 ? 0.35 : 0);
          if (fresh) m.finish(i, 0.6, 0.4);
        }
      }
      // the seam at the plate's start, and rivets every 40 cm a hand off both sides of it
      for (let y = top; y < top + course; y++) groove(m, m.at(x, y), m.at(x + 1, y));
      for (let y = top + 3; y < top + course - 2; y += 6) rivet(m, x + 4, y), rivet(m, x - 4, y);
      x += width;
    }
    for (let x = 0; x < S; x++) groove(m, m.at(x, top), m.at(x, top + 1));
    for (let x = 2; x < S; x += 6) rivet(m, x, top + 4), rivet(m, x, top - 4);
    top += course;
  }
}

/** A seam: a groove a pixel wide, beveled into the next. */
function groove(m: PlatingMaps, line: number, bevel: number) {
  m.height[line] -= 0.6;
  m.height[bevel] -= 0.2;
  m.shade(line, 0.45);
  m.shade(bevel, 0.85);
}

/** A rivet's head: a small dome. */
function rivet(m: PlatingMaps, x: number, y: number) {
  m.around(x, y, 1, 1, (i, dx, dy) => {
    m.height[i] += dx === 0 && dy === 0 ? 0.35 : 0.12;
  });
  m.shade(m.at(x, y), 1.08);
}

/** Access hatches with a recessed frame, hinges and a handle's recess; vents as grilles of grooves. */
function hatches(r: Randomizer, m: PlatingMaps) {
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(r.range(0, PLATING));
    const y = Math.floor(r.range(0, PLATING));
    const w = Math.floor(r.range(18, 34));
    const h = Math.floor(r.range(14, 26));
    const shade = r.range(0.85, 1.05);
    for (let v = 0; v <= h; v++) {
      for (let u = 0; u <= w; u++) {
        const i = m.at(x + u, y + v);
        const edge = u === 0 || v === 0 || u === w || v === h;
        if (edge) {
          m.height[i] -= 0.55;
          m.shade(i, 0.45);
        } else {
          m.height[i] += 0.06;
          m.shade(i, shade);
        }
      }
    }
    // hinges on its left, the handle's recess on its right
    for (const hinge of [0.25, 0.75]) {
      m.around(x - 1, y + h * hinge, 1, 2, (i) => {
        m.height[i] += 0.3;
        m.finish(i, 0.45, 0.7);
      });
    }
    m.around(x + w - 4, y + h / 2, 1, 3, (i) => {
      m.height[i] -= 0.4;
      m.shade(i, 0.55);
    });
  }
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(r.range(0, PLATING));
    const y = Math.floor(r.range(0, PLATING));
    const slots = 5 + Math.floor(r.range(0, 6));
    const length = Math.floor(r.range(16, 30));
    for (let s = 0; s < slots; s++) {
      for (let u = 0; u < length; u++) {
        const i = m.at(x + u, y + s * 3);
        m.height[i] -= 0.5;
        m.shade(i, 0.35);
        m.finish(i, 0.95, 0.1);
      }
    }
  }
}

/** A smooth noise wrapping across the tile: random values on a grid of `cells`, interpolated. */
function tileNoise(r: Randomizer, cells: number): (x: number, y: number) => number {
  const grid = Array.from({ length: cells * cells }, () => r.nextFloat());
  const cell = PLATING / cells;
  const at = (gx: number, gy: number) => grid[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x, y) => {
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const sx = smoothstep(0, 1, x / cell - ix);
    const sy = smoothstep(0, 1, y / cell - iy);
    return lerp(lerp(at(ix, iy), at(ix, iy + 1), sy), lerp(at(ix + 1, iy), at(ix + 1, iy + 1), sy), sx);
  };
}

/** Weathering over the whole tile: patches where the plating darkened or bleached, and the pits of centuries of micrometeorites. */
function weathering(r: Randomizer, m: PlatingMaps) {
  const patches = tileNoise(r, 8);
  const fine = tileNoise(r, 32);
  for (let y = 0; y < PLATING; y++) {
    for (let x = 0; x < PLATING; x++) {
      const i = y * PLATING + x;
      m.shade(i, 0.9 + 0.14 * patches(x, y) + 0.04 * fine(x, y));
      m.rough[i] += (fine(x, y) - 0.5) * 0.12;
    }
  }
  for (let k = 0; k < 2500; k++) {
    const i = m.at(r.range(0, PLATING), r.range(0, PLATING));
    m.height[i] -= r.range(0.08, 0.25);
    m.shade(i, r.range(0.7, 0.9));
  }
}

/**
 * Impact craters of a few sizes, the large ones rare: a bowl with a dark, pitted floor, a rim
 * raised and scoured to bright metal, faint rays of ejecta around; the last embers in a few of
 * the large ones (see emissive; the world ship's are cold).
 */
function craters(r: Randomizer, m: PlatingMaps, embers: CanvasRenderingContext2D) {
  const sizes = [...Array.from({ length: 24 }, () => r.range(1.5, 3.5)), ...Array.from({ length: 4 }, () => r.range(4, 9)), r.range(12, 18), r.range(26, 34)];
  for (const radius of sizes) {
    const cx = r.range(0, PLATING);
    const cy = r.range(0, PLATING);
    const depth = 0.15 * radius + 0.25;
    const rim = 0.04 * radius + 0.1;
    const rays = Array.from({ length: 14 }, () => (r.nextFloat() < 0.45 ? r.range(0.4, 1) : 0));
    const reach = radius * 2.6;
    m.around(cx, cy, reach, reach, (i, dx, dy) => {
      const q = Math.hypot(dx, dy) / radius;
      if (q >= 2.6) return;
      if (q < 1) {
        m.height[i] += depth * (q * q - 1) + rim * smoothstep(0.7, 1, q);
        const floor = 1 - smoothstep(0.6, 0.95, q);
        m.shade(i, 1 - floor * r.range(0.55, 0.75));
        m.finish(i, 0.95, 0.15, floor);
      } else {
        m.height[i] += rim * (1 - smoothstep(1, 1.7, q));
      }
      const scour = 1 - smoothstep(0.06, 0.2, Math.abs(q - 1));
      m.shade(i, 1 + 0.15 * scour);
      m.finish(i, 0.4, 0.7, scour);
      if (q > 1.1) {
        const ray = rays[Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * rays.length) % rays.length];
        m.shade(i, 1 - 0.3 * ray * (1 - (q - 1.1) / 1.5));
      }
    });
    if (radius > 12 && r.nextFloat() < 0.5) {
      const glow = embers.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.7);
      glow.addColorStop(0, 'rgba(255, 120, 30, 1)');
      glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
      embers.fillStyle = glow;
      embers.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }
}

/**
 * A hole punched through the plating: a jagged edge of petals bent outwards, the dark inside
 * with the ship's structure in it (a frame across, a deck below), soot around.
 */
function hole(r: Randomizer, m: PlatingMaps) {
  const cx = r.range(0, PLATING);
  const cy = r.range(0, PLATING);
  const radius = r.range(18, 26);
  const petals = Array.from({ length: 11 }, () => r.range(-0.25, 0.3));
  const frame = r.range(-0.4, 0.4) * radius;
  const deck = r.range(0, 0.5) * radius;
  const reach = radius * 2.4;
  m.around(cx, cy, reach, reach, (i, dx, dy) => {
    const a = ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * petals.length;
    const p0 = petals[Math.floor(a) % petals.length];
    const p1 = petals[(Math.floor(a) + 1) % petals.length];
    const edge = radius * (1 + p0 + (p1 - p0) * (a - Math.floor(a)));
    const d = Math.hypot(dx, dy);
    if (d < edge) {
      // the drop eased over a few pixels: a cliff in a normal map lights up as a line
      const structure = Math.abs(dx - frame) < 2;
      m.height[i] = (structure ? -0.4 : -0.9) * smoothstep(edge, edge - 4, d);
      const c = structure ? 48 : dy > deck ? 22 : 7;
      m.shade(i, 1, [c, c, c * 1.05]);
      m.finish(i, structure ? 0.8 : 1, structure ? 0.4 : 0);
    } else if (d < edge + 3) {
      m.height[i] += 0.25 * (1 - (d - edge) / 3);
      m.shade(i, 0.8);
      m.finish(i, 0.45, 0.6);
    } else {
      const soot = 1 - smoothstep(edge, radius * 2.4, d);
      m.shade(i, soot * 0.6, [26, 21, 18]);
      m.finish(i, 0.95, 0.1, soot * 0.6);
    }
  });
}

/**
 * Burns: soot streaked along the hull from where the fire touched it, as the fire ran with the
 * ship's flight, its edge faintly tempered to straw and blue by the heat; cold, long since.
 */
function scorch(r: Randomizer, m: PlatingMaps) {
  const streaks = Array.from({ length: PLATING }, () => r.range(0.35, 1));
  for (let k = 0; k < 5; k++) {
    const cx = r.range(0, PLATING);
    const cy = r.range(0, PLATING);
    const length = r.range(60, 200);
    const width = r.range(12, 30);
    const strength = r.range(0.6, 0.9);
    m.around(cx + length * 0.4, cy, length * 1.4, width * 2, (i, dx, dy) => {
      const along = (dx - length * 0.4) / length;
      const across = dy / width;
      const s = Math.exp(-across * across * 2) * smoothstep(-1, -0.5, along) * (1 - smoothstep(-0.1, 1, along)) * streaks[Math.floor(i / PLATING)] * strength;
      if (s < 0.01) return;
      m.shade(i, s * 0.85, [28, 22, 18]);
      m.shade(i, 0.1 * smoothstep(0.08, 0.25, s) * (1 - smoothstep(0.3, 0.55, s)), [182, 132, 74]);
      m.shade(i, 0.1 * smoothstep(0.02, 0.08, s) * (1 - smoothstep(0.1, 0.2, s)), [92, 104, 156]);
      m.finish(i, 0.95, 0.1, s);
    });
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How deep each point lies below what is around it (0..1): the plating's height against its
 * blur over a few pixels, wrapped. Dust settles there, and frost (see world/worldship).
 */
function recesses(height: Float32Array): Float32Array {
  const S = PLATING;
  const R = 3;
  const pass = (from: Float32Array, step: (x: number, y: number, d: number) => number) => {
    const to = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let sum = 0;
        for (let d = -R; d <= R; d++) sum += from[step(x, y, d)];
        to[y * S + x] = sum / (2 * R + 1);
      }
    }
    return to;
  };
  const blur = pass(pass(height, (x, y, d) => y * S + ((x + d + S) % S)), (x, y, d) => ((y + d + S) % S) * S + x);
  return blur.map((b, i) => Math.min(1, Math.max(0, (b - height[i]) * 1.4)));
}

/**
 * The world ship's plating after centuries in space and the battle that broke it, at a real
 * scale (see hullSet: a tile is about 34 m): plates in courses with grooved seams and rows of
 * rivets, access hatches and vents, the pits of micrometeorites, impact craters (few large
 * ones), holes punched through to the structure, soot streaked along the hull by the burns,
 * dust in every recess. Its relief is baked into a normal map from the heights (and kept as a
 * bump map); a surface per seed, built once.
 */
export function ravagedSurface(seed: number): PlatingSurface {
  const kept = ravaged.get(seed);
  if (kept) return kept;
  if (!drawable) return blankPlating();
  const r = new Randomizer(seed);
  const m = new PlatingMaps();
  const embers = glowLayer(PLATING);
  plates(r, m);
  hatches(r, m);
  weathering(r, m);
  scorch(r, m);
  craters(r, m, embers[1]);
  hole(r, m);
  const recess = recesses(m.height);
  const S = PLATING;
  const [colorCanvas, color] = canvas(S);
  const [ormCanvas, orm] = canvas(S);
  const [normalCanvas, normal] = canvas(S);
  const [bumpCanvas, bump] = canvas(S);
  const c = color.createImageData(S, S);
  const o = orm.createImageData(S, S);
  const n = normal.createImageData(S, S);
  const b = bump.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const dust = recess[i] * 0.4;
    for (let k = 0; k < 3; k++) c.data[i * 4 + k] = m.color[i * 3 + k] + ([150, 145, 136][k] - m.color[i * 3 + k]) * dust;
    o.data[i * 4] = recess[i] * 255;
    o.data[i * 4 + 1] = Math.min(1, Math.max(0, m.rough[i])) * 255;
    o.data[i * 4 + 2] = Math.min(1, Math.max(0, m.metal[i])) * 255;
    b.data[i * 4] = b.data[i * 4 + 1] = b.data[i * 4 + 2] = 128 + m.height[i] * PLATING_GRAY;
    c.data[i * 4 + 3] = o.data[i * 4 + 3] = b.data[i * 4 + 3] = 255;
  }
  n.data.set(normalPixels(b.data, S, PLATING_SLOPE));
  color.putImageData(c, 0, 0);
  orm.putImageData(o, 0, 0);
  normal.putImageData(n, 0, 0);
  bump.putImageData(b, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 4;
  const surface = { ...textures(colorCanvas, ormCanvas, bumpCanvas), glow: glowTexture(embers[0]), normal: normalMap };
  ravaged.set(seed, surface);
  return surface;
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

/** A crinkled foil blanket: its color (the metal's, darker along the creases) and its folds as a normal map. */
export type Foil = { map: THREE.Texture; normalMap: THREE.Texture };

const foils = new Map<string, Foil>();

/**
 * The thermal blankets a satellite's bus is wrapped in: gold-colored or silver foil of one hue,
 * crinkled by straight folds crossing it every way, each face between them catching the sun at
 * its own angle, the creases darker, the blankets' edges taped over. The color map is the metal's
 * reflectance (see debrisSet: metallic, glossy, mirroring the reflection map). The folds lie in
 * the normal map, so the texture's smaller levels average them into a plain sheen afar instead of
 * letting them shimmer.
 */
export function foilSurface(tone: 'gold' | 'silver'): Foil {
  const kept = foils.get(tone);
  if (kept) return kept;
  if (!drawable) return { map: new THREE.Texture(), normalMap: new THREE.Texture() };
  const r = new Randomizer(tone === 'gold' ? 61 : 62);
  // the folds: straight creases crossing the blanket every way, each a ridge or a valley sharp
  // at its crease (|sin| of a wave whose whole periods fit the tile, so the tile repeats seamlessly)
  // (the finer a fold, the lower: the large folds shape the blanket, the fine ones only crinkle it)
  const folds = Array.from({ length: 14 }, () => {
    const kx = Math.floor(r.range(1, 6)) * (r.nextFloat() < 0.5 ? -1 : 1);
    const ky = Math.floor(r.range(0, 6));
    return { kx, ky, phase: r.range(0, Math.PI), height: r.range(0.4, 1) / Math.sqrt(Math.hypot(kx, ky)) };
  });
  // the reflectance of the metal: a clear golden yellow (or silver), one hue all over
  const base = tone === 'gold' ? [255, 206, 96] : [204, 208, 214];
  const [colorElement, color] = canvas(SIZE);
  const [normalElement, normal] = canvas(SIZE);
  const colors = color.createImageData(SIZE, SIZE);
  const normals = normal.createImageData(SIZE, SIZE);
  /** How steep the folds are: the slope of the foil's surface per unit of a fold's height. */
  const steep = 0.1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let hx = 0;
      let hy = 0;
      let crease = 1;
      for (const fold of folds) {
        const angle = (Math.PI * (fold.kx * x + fold.ky * y)) / SIZE + fold.phase;
        const wave = Math.sin(angle);
        const slope = fold.height * Math.sign(wave) * Math.cos(angle);
        hx += slope * fold.kx;
        hy += slope * fold.ky;
        // right on a crease the foil is folded sharp and catches less light
        crease = Math.min(crease, 0.75 + 0.25 * THREE.MathUtils.smoothstep(Math.abs(wave), 0, 0.12 / fold.height));
      }
      // tape over the blankets' edges: flat and a shade duller
      const tape = y % 128 < 6;
      const i = (y * SIZE + x) * 4;
      const shade = tape ? 0.85 : crease;
      for (let c = 0; c < 3; c++) colors.data[i + c] = Math.min(255, base[c] * shade);
      const length = Math.hypot(hx * steep, hy * steep, 1);
      const nx = tape ? 0 : (-hx * steep) / length;
      const ny = tape ? 0 : (hy * steep) / length;
      normals.data[i] = (nx * 0.5 + 0.5) * 255;
      normals.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      normals.data[i + 2] = (Math.sqrt(1 - nx * nx - ny * ny) * 0.5 + 0.5) * 255;
      colors.data[i + 3] = normals.data[i + 3] = 255;
    }
  }
  color.putImageData(colors, 0, 0);
  normal.putImageData(normals, 0, 0);
  const map = toTexture(colorElement);
  const normalMap = new THREE.CanvasTexture(normalElement);
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const foil = { map, normalMap };
  foils.set(tone, foil);
  return foil;
}

/**
 * Where a solar wing's two faces lie on its texture (see solarWing), as texture heights
 * [from, to]: the cells on the front, the white sheet on the back; the rows between only keep the
 * two apart in the texture's smaller levels.
 */
export const WING_FRONT: readonly [number, number] = [0.53, 0.97];
export const WING_BACK: readonly [number, number] = [0.03, 0.47];
/** Cells along a wing in one repeat of its texture, and across its width. */
export const WING_CELLS_ALONG = 12;
export const WING_CELLS_ACROSS = 6;

let wing: { map: THREE.Texture; orm: THREE.Texture } | null = null;

/**
 * A solar wing's two faces on one texture (see WING_FRONT, WING_BACK): glossy cells of deep
 * blue, each a shade of its own, the backsheet showing at their cut corners, between gaps barely
 * lighter than the cells, and the wing's frame along its edges; the back a matte white sheet over
 * the panel's honeycomb. Nothing in it stands out far from the cells' mean color, so the
 * texture's smaller levels fade the cells into that color afar instead of a moiré.
 */
export function solarWing(): { map: THREE.Texture; orm: THREE.Texture } {
  if (wing) return wing;
  if (!drawable) return (wing = { map: new THREE.Texture(), orm: new THREE.Texture() });
  const r = new Randomizer(64);
  const [colorElement, color] = canvas(SIZE);
  const [ormElement, orm] = canvas(SIZE);
  // canvas rows from the top: the texture's height runs from the bottom
  const rows = ([from, to]: readonly [number, number]) => [SIZE * (1 - to), SIZE * (1 - from)];
  const [frontTop, frontBottom] = rows(WING_FRONT);
  const [backTop, backBottom] = rows(WING_BACK);
  // the back: an off-white sheet, the honeycomb panel's frame faintly through it
  color.fillStyle = '#d8d4c8';
  color.fillRect(0, SIZE / 2, SIZE, SIZE / 2);
  color.fillStyle = 'rgba(90, 90, 80, 0.12)';
  for (let x = 0; x < SIZE; x += SIZE / 3) color.fillRect(x, backTop, 3, backBottom - backTop);
  color.fillRect(0, (backTop + backBottom) / 2, SIZE, 3);
  orm.fillStyle = ormColor(0.85, 0);
  orm.fillRect(0, SIZE / 2, SIZE, SIZE / 2);
  // the front: the frame, then the cells in their gaps
  const frame = 4;
  color.fillStyle = '#4a505e';
  color.fillRect(0, 0, SIZE, SIZE / 2);
  orm.fillStyle = ormColor(0.45, 0.6);
  orm.fillRect(0, 0, SIZE, SIZE / 2);
  color.fillStyle = '#2a3452';
  color.fillRect(0, frontTop + frame, SIZE, frontBottom - frontTop - frame * 2);
  orm.fillStyle = ormColor(0.22, 0.35);
  orm.fillRect(0, frontTop + frame, SIZE, frontBottom - frontTop - frame * 2);
  const cellWidth = SIZE / WING_CELLS_ALONG;
  const cellHeight = (frontBottom - frontTop - frame * 2) / WING_CELLS_ACROSS;
  for (let j = 0; j < WING_CELLS_ACROSS; j++) {
    for (let i = 0; i < WING_CELLS_ALONG; i++) {
      const x = i * cellWidth + 1;
      const y = frontTop + frame + j * cellHeight + 1;
      const w = cellWidth - 2;
      const h = cellHeight - 2;
      const shade = r.range(0.85, 1.08);
      color.fillStyle = `rgb(${Math.round(24 * shade)}, ${Math.round(38 * shade)}, ${Math.round(92 * shade)})`;
      color.fillRect(x, y, w, h);
      // the cut corners show the backsheet, the busbars run across a cell
      color.fillStyle = 'rgba(150, 160, 185, 0.5)';
      const cut = Math.min(w, h) * 0.16;
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        color.beginPath();
        color.moveTo(cx, cy);
        color.lineTo(cx + sx * cut, cy);
        color.lineTo(cx, cy + sy * cut);
        color.fill();
      }
      color.fillStyle = 'rgba(140, 150, 175, 0.16)';
      color.fillRect(x + w / 3, y, 1, h);
      color.fillRect(x + (2 * w) / 3, y, 1, h);
    }
  }
  const map = toTexture(colorElement);
  const ormMap = new THREE.CanvasTexture(ormElement);
  for (const texture of [map, ormMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
  }
  return (wing = { map, orm: ormMap });
}

/**
 * Where the parts painted in the Orbital Freedom Network's livery lie on its texture (see
 * networkLivery), as texture heights [from, to]: an upper stage's tank all around (its front at
 * `to`), a fairing half's outside (the nose's tip at `to`, its base at `from`) and its lining.
 */
export const LIVERY_STAGE: readonly [number, number] = [1 - 432 / 1024, 1];
export const LIVERY_FAIRING: readonly [number, number] = [1 - 832 / 1024, 1 - 448 / 1024];
export const LIVERY_LINING: readonly [number, number] = [1 - 1008 / 1024, 1 - 848 / 1024];

let livery: Surface | null = null;

/**
 * The Orbital Freedom Network's livery for its upper stages and fairings, laid once around each
 * part, never repeated (see LIVERY_STAGE): white paint in real panels (barrel sections welded
 * end to end, the cable raceway along the tank), the network's name stenciled once or twice and
 * worn, a few large scuffs down to bare metal, soot thickening in streaks towards the engine, the
 * fairing's band and its nose scorched by the ascent, and inside it the quilted blankets that
 * muffled the launch. Look only.
 */
export function networkLivery(): Surface {
  if (livery) return livery;
  if (!drawable) return (livery = blankSurface());
  const r = new Randomizer(65);
  const W = 512;
  const H = 1024;
  const [colorElement, color] = canvas(W, H);
  const [ormElement, orm] = canvas(W / 2, H / 2);
  const [bumpElement, bump] = canvas(W / 2, H / 2);
  // roughness, metalness and bump at half the color's resolution, drawn in its coordinates
  orm.scale(0.5, 0.5);
  bump.scale(0.5, 0.5);
  color.fillStyle = '#e4e1da';
  color.fillRect(0, 0, W, H);
  orm.fillStyle = ormColor(0.6, 0.1);
  orm.fillRect(0, 0, W, H);
  bump.fillStyle = '#808080';
  bump.fillRect(0, 0, W, H);
  // a part's rows on the canvas
  const span = ([from, to]: readonly [number, number]) => ({ top: H * (1 - to), height: H * (to - from) });
  const stage = span(LIVERY_STAGE);
  const fairing = span(LIVERY_FAIRING);
  const lining = span(LIVERY_LINING);
  // large, soft blotches of age in the paint
  for (let i = 0; i < 40; i++) {
    const x = r.range(40, W - 40);
    const y = r.range(0, 832);
    const radius = r.range(30, 90);
    const gradient = color.createRadialGradient(x, y, 0, x, y, radius);
    const tone = r.nextFloat() < 0.5 ? '70, 64, 56' : '255, 255, 250';
    gradient.addColorStop(0, `rgba(${tone}, 0.07)`);
    gradient.addColorStop(1, `rgba(${tone}, 0)`);
    color.fillStyle = gradient;
    color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  /** A seam: a dark line in the paint, a groove in the bump. */
  const seam = (x: number, y: number, w: number, h: number) => {
    color.fillStyle = 'rgba(40, 38, 34, 0.35)';
    color.fillRect(x, y, w, h);
    bump.fillStyle = '#404040';
    bump.fillRect(x, y, w, h);
  };
  /** Stenciled text along a part, reading from its front to its back, its middle at (x, y), `size` pixels high, worn. */
  const stencil = (text: string, x: number, y: number, size: number) => {
    color.save();
    color.translate(x, y);
    color.rotate(Math.PI / 2);
    color.font = `bold ${size}px monospace`;
    color.textAlign = 'center';
    color.textBaseline = 'middle';
    color.fillStyle = 'rgba(24, 26, 32, 0.85)';
    color.fillText(text, 0, 0);
    // worn: flecks of the white paint back over the letters
    const width = color.measureText(text).width;
    color.fillStyle = 'rgba(228, 225, 218, 0.8)';
    for (let i = 0; i < text.length * 6; i++) color.fillRect(r.range(-width / 2, width / 2), r.range(-size / 2, size / 2), r.range(1, 3), r.range(1, 2.5));
    color.restore();
  };
  /** A large scuff: the paint scraped off down to the metal in an irregular patch, scratched along one direction. */
  const scuff = (x: number, y: number, size: number) => {
    const angle = r.range(0, Math.PI);
    const strokes = Array.from({ length: 7 }, () => [r.range(-0.6, 0.6) * size, size * r.range(0.25, 0.45), size * r.range(0.08, 0.2)]);
    color.fillStyle = 'rgba(172, 174, 180, 0.6)';
    orm.fillStyle = ormColor(0.45, 0.5, 0.8, 0);
    for (const g of [color, orm]) {
      for (const [along, a, b] of strokes) {
        g.beginPath();
        g.ellipse(x + Math.cos(angle) * along, y + Math.sin(angle) * along, a, b, angle, 0, Math.PI * 2);
        g.fill();
      }
    }
    color.strokeStyle = 'rgba(60, 60, 64, 0.35)';
    color.lineWidth = 0.8;
    for (let k = 0; k < 24; k++) {
      const ox = r.range(-0.5, 0.5) * size;
      const oy = r.range(-0.5, 0.5) * size;
      const length = r.range(0.3, 0.8) * size;
      color.beginPath();
      color.moveTo(x + ox, y + oy);
      color.lineTo(x + ox + Math.cos(angle) * length, y + oy + Math.sin(angle) * length);
      color.stroke();
    }
  };
  // the stage's tank: barrel sections welded end to end, panels between longitudinal seams, the cable raceway
  for (const t of [0.04, 0.26, 0.5, 0.74, 0.96]) seam(0, stage.top + t * stage.height, W, 2);
  for (const u of [0.07, 0.32, 0.57, 0.82]) seam(u * W, stage.top, 1.5, stage.height);
  color.fillStyle = '#7d8088';
  color.fillRect(0.66 * W, stage.top + 0.02 * stage.height, 12, stage.height * 0.96);
  bump.fillStyle = '#d0d0d0';
  bump.fillRect(0.66 * W, stage.top + 0.02 * stage.height, 12, stage.height * 0.96);
  stencil('ORBITAL FREEDOM', 0.2 * W, stage.top + 0.45 * stage.height, 34);
  stencil('INTERNET FOR ALL', 0.45 * W, stage.top + 0.4 * stage.height, 16);
  stencil('OFN-7', 0.88 * W, stage.top + 0.12 * stage.height, 20);
  stencil('NO STEP', 0.62 * W, stage.top + 0.2 * stage.height, 9);
  scuff(0.38 * W, stage.top + 0.7 * stage.height, 70);
  scuff(0.78 * W, stage.top + 0.35 * stage.height, 90);
  scuff(0.12 * W, stage.top + 0.15 * stage.height, 50);
  // soot from the engine: thickening towards the tank's back, in streaks
  const soot = color.createLinearGradient(0, stage.top + stage.height * 0.55, 0, stage.top + stage.height);
  soot.addColorStop(0, 'rgba(34, 28, 24, 0)');
  soot.addColorStop(1, 'rgba(34, 28, 24, 0.8)');
  color.fillStyle = soot;
  color.fillRect(0, stage.top, W, stage.height);
  orm.fillStyle = ormColor(0.95, 0.02, 0.5, 0);
  orm.fillRect(0, stage.top + stage.height * 0.85, W, stage.height * 0.15);
  for (let i = 0; i < 120; i++) {
    const length = r.range(0.05, 0.45) * stage.height;
    const x = r.range(0, W);
    const streak = color.createLinearGradient(0, stage.top + stage.height - length, 0, stage.top + stage.height);
    streak.addColorStop(0, 'rgba(30, 24, 20, 0)');
    streak.addColorStop(1, `rgba(30, 24, 20, ${r.range(0.15, 0.35)})`);
    color.fillStyle = streak;
    color.fillRect(x, stage.top + stage.height - length, r.range(2, 8), length);
  }
  // the fairing's outside: its seams, the network's band near the base, its name once along the crown
  for (const t of [0.4, 0.7]) seam(0, fairing.top + t * fairing.height, W, 2);
  for (const u of [0.33, 0.67]) seam(u * W, fairing.top + 0.4 * fairing.height, 1.5, fairing.height * 0.6);
  color.fillStyle = '#b8389e';
  color.fillRect(0, fairing.top + 0.89 * fairing.height, W, 0.04 * fairing.height);
  stencil('ORBITAL FREEDOM', 0.5 * W, fairing.top + 0.67 * fairing.height, 40);
  stencil('INTERNET FOR ALL', 0.26 * W, fairing.top + 0.6 * fairing.height, 18);
  scuff(0.75 * W, fairing.top + 0.8 * fairing.height, 80);
  scuff(0.4 * W, fairing.top + 0.48 * fairing.height, 60);
  // the nose scorched by the ascent, the split line grimy
  const scorch = color.createLinearGradient(0, fairing.top + fairing.height * 0.25, 0, fairing.top);
  scorch.addColorStop(0, 'rgba(90, 60, 36, 0)');
  scorch.addColorStop(1, 'rgba(70, 46, 30, 0.7)');
  color.fillStyle = scorch;
  color.fillRect(0, fairing.top, W, fairing.height);
  color.fillStyle = 'rgba(40, 36, 30, 0.45)';
  color.fillRect(0, fairing.top, 8, fairing.height);
  color.fillRect(W - 8, fairing.top, 8, fairing.height);
  // the lining: quilted acoustic blankets, a few torn open
  color.fillStyle = '#b4b2ab';
  color.fillRect(0, lining.top - 8, W, lining.height + 16);
  orm.fillStyle = ormColor(0.9, 0);
  orm.fillRect(0, lining.top - 8, W, lining.height + 16);
  const quilt = W / 8;
  const row = lining.height / 4;
  for (let y = lining.top; y < lining.top + lining.height - 1; y += row) {
    for (let x = 0; x < W; x += quilt) {
      const puff = color.createRadialGradient(x + quilt / 2, y + row / 2, 0, x + quilt / 2, y + row / 2, quilt * 0.6);
      puff.addColorStop(0, 'rgba(255, 255, 250, 0.18)');
      puff.addColorStop(1, 'rgba(60, 58, 54, 0.18)');
      color.fillStyle = r.nextFloat() < 0.12 ? 'rgba(70, 66, 60, 0.6)' : puff;
      color.fillRect(x, y, quilt, row);
      seam(x, y, 1, row);
    }
    seam(0, y, W, 1);
  }
  livery = textures(colorElement, ormElement, bumpElement);
  for (const texture of [livery.map, livery.orm, livery.bump]) texture.wrapT = THREE.ClampToEdgeWrapping;
  return livery;
}
