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
 * The tournament's rings: industrial armor plating, riveted and grimy, its plates patched in
 * over the years in lighter and darker steel, scuffed bare along their edges, streaked with
 * rust and soot, with coil numbers stenciled on. The hazard paint is a surface of its own (see
 * hazardSurface), laid only where it warns.
 */
export function industrialSurface(seed: number): Surface {
  if (industrial) return industrial;
  if (!drawable) return blankSurface();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank({ roughness: 0.6, metalness: 0.45 });
  const g = color[1];
  // patched plates: some rows' plates a shade lighter (fresh steel) or darker (old, oily), rougher or smoother
  for (let y = 0; y < SIZE; y += 64) {
    for (let x = 0; x < SIZE; ) {
      const width = [32, 64, 96][r.nextInt() % 3];
      const shade = r.range(-1, 1);
      g.fillStyle = shade > 0 ? `rgba(255, 250, 240, ${0.18 * shade})` : `rgba(12, 14, 18, ${-0.3 * shade})`;
      g.fillRect(x, y, width, 64);
      orm[1].fillStyle = ormColor(0.45 + 0.3 * r.nextFloat(), 0.45, 0.6);
      orm[1].fillRect(x, y, width, 64);
      x += width;
    }
  }
  panels(r, g, bump[1], 0.9);
  grime(r, g, 0.9);
  rust(r, g, orm[1], 0.45);
  chips(r, g, orm[1], 0.12);
  scratches(r, g, orm[1], 0.6);
  // soot streaked down from the seams, where the coils' heat leaks
  for (let i = 0; i < 14; i++) {
    const x = r.range(0, SIZE);
    const y = Math.floor(r.range(0, 4)) * 64 + 2;
    const streak = g.createLinearGradient(0, y, 0, y + r.range(20, 60));
    streak.addColorStop(0, 'rgba(8, 8, 10, 0.55)');
    streak.addColorStop(1, 'rgba(8, 8, 10, 0)');
    g.fillStyle = streak;
    g.fillRect(x, y, r.range(3, 12), 60);
  }
  stencils(r, g, ['COIL 07', 'HV 40 kA', 'NO DOCKING', 'MOW-2584']);
  industrial = textures(color[0], orm[0], bump[0]);
  return industrial;
}

let hazard: Surface | null = null;
/** The hazard paint's tile (px): HAZARD_PERIODS pairs of a yellow and a black stripe across a band HAZARD_HEIGHT high. */
const HAZARD_PERIODS = 8;
const HAZARD_HEIGHT = 64;

/**
 * Hazard paint: yellow and black stripes slanting across a band (u along it, v across it, one
 * band high), the paint of a depot gone over again and again and never cleaned: chipped down to
 * the steel, scuffed by docking clamps, worn ragged along both edges, grimy towards the lower
 * one. HAZARD_PERIODS pairs of stripes to a tile, each worn its own way, so the wear does not
 * repeat stripe by stripe.
 */
export function hazardSurface(): Surface {
  if (hazard) return hazard;
  if (!drawable) return blankSurface();
  const r = new Randomizer(1977);
  const width = HAZARD_PERIODS * HAZARD_HEIGHT;
  const color = canvas(width, HAZARD_HEIGHT);
  const orm = canvas(width, HAZARD_HEIGHT);
  const bump = canvas(width, HAZARD_HEIGHT);
  const [c, o, b] = [color[1], orm[1], bump[1]];
  c.fillStyle = '#1a1b1e';
  c.fillRect(0, 0, width, HAZARD_HEIGHT);
  o.fillStyle = ormColor(0.62, 0.15);
  o.fillRect(0, 0, width, HAZARD_HEIGHT);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, width, HAZARD_HEIGHT);
  const h = HAZARD_HEIGHT;
  for (let x = -h; x < width + h; x += h) {
    // each stripe a slightly different yellow, as repainted by hand
    c.fillStyle = `rgb(${Math.round(r.range(214, 236))}, ${Math.round(r.range(162, 184))}, ${Math.round(r.range(0, 24))})`;
    c.beginPath();
    c.moveTo(x, h);
    c.lineTo(x + h / 2, 0);
    c.lineTo(x + h, 0);
    c.lineTo(x + h / 2, h);
    c.fill();
  }
  // paint chipped off down to the steel: bare, smooth, metallic, a little sunk
  for (let i = 0; i < 45; i++) {
    const x = r.range(0, width);
    const edge = r.nextFloat() < 0.6;
    const y = edge ? (r.nextFloat() < 0.5 ? r.range(0, 6) : h - r.range(0, 6)) : r.range(0, h);
    const size = r.range(1.5, edge ? 6 : 4);
    c.fillStyle = `rgba(${Math.round(r.range(64, 88))}, ${Math.round(r.range(66, 90))}, 96, 0.95)`;
    o.fillStyle = ormColor(0.5, 0.9);
    b.fillStyle = '#5a5a5a';
    for (const g of [c, o, b]) {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2;
        const reach = size * r.range(0.5, 1.3);
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * reach * 1.6, y + Math.sin(angle) * reach);
      }
      g.fill();
    }
  }
  // scuffs along the band: the clamps and the hulls that rubbed past, dull and lighter
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, width);
    const y = r.range(6, h - 6);
    const length = r.range(20, 120);
    const slope = r.range(-0.08, 0.08);
    c.strokeStyle = `rgba(200, 200, 205, ${r.range(0.12, 0.3)})`;
    o.strokeStyle = ormColor(0.85, 0.5, 0.8);
    c.lineWidth = o.lineWidth = r.range(0.6, 2.2);
    for (const g of [c, o]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + length, y + length * slope);
      g.stroke();
    }
  }
  // grime settled towards the lower edge, soot in patches
  const settled = c.createLinearGradient(0, 0, 0, h);
  settled.addColorStop(0, 'rgba(20, 16, 10, 0.05)');
  settled.addColorStop(0.7, 'rgba(20, 16, 10, 0.18)');
  settled.addColorStop(1, 'rgba(20, 16, 10, 0.55)');
  c.fillStyle = settled;
  c.fillRect(0, 0, width, h);
  for (let i = 0; i < 10; i++) {
    const x = r.range(0, width);
    const y = r.range(0, h);
    const radius = r.range(12, 40);
    const soot = c.createRadialGradient(x, y, 0, x, y, radius);
    soot.addColorStop(0, 'rgba(10, 9, 8, 0.4)');
    soot.addColorStop(1, 'rgba(10, 9, 8, 0)');
    c.fillStyle = soot;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  hazard = textures(color[0], orm[0], bump[0]);
  return hazard;
}

/** The texture of a coil's windings (px, square): WINDING_TURNS turns of wire across it, a clamp strap across them over its first WINDING_STRAP of its width. */
const WINDING_SIZE = 128;
const WINDING_TURNS = 8;
const WINDING_STRAP = 0.12;
/** How steeply the turns' relief tilts the light (see normalPixels): round wire. */
const WINDING_SLOPE = 3;
/** The relief's gray in the grooves between turns, and how much higher a turn's crown rises (0..255). */
const WINDING_GROOVE = 40;
const WINDING_CROWN = 160;
/** The wire's glow map is bright on the turns' crowns and dark in the grooves, about two thirds on the whole: lifted by this, a coil as a whole glows at about its brightness. */
export const WIRE_GLOW = 1.5;

/**
 * The relief of wound wire, as a square canvas of heights (gray, `size` px): `turns` round
 * turns stacked across it (v), each highest along its crown, and a flat strap raised over them
 * across the first `strap` of its width (u), with a bevel. It wraps around its edges, as the
 * winding goes on.
 */
export function windingHeights(size: number, turns: number, strap: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const pitch = size / turns;
  const band = strap * size;
  for (let y = 0; y < size; y++) {
    const t = ((y % pitch) + 0.5) / pitch;
    const crown = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    for (let x = 0; x < size; x++) {
      // the strap's bevel: two pixels each side
      const inStrap = Math.min(x + 0.5, band - x - 0.5);
      const strapHeight = inStrap > 0 ? Math.min(1, inStrap / 2) : 0;
      const height = Math.max(WINDING_GROOVE + WINDING_CROWN * crown, strapHeight * 235);
      data.fill(Math.round(height), (y * size + x) * 4, (y * size + x) * 4 + 3);
      data[(y * size + x) * 4 + 3] = 255;
    }
  }
  return data;
}

/** A coil's windings: copper color, what glows of the wire, and the turns' relief as a normal map. */
export type WindingSurface = { map: THREE.Texture; glow: THREE.Texture; normal: THREE.Texture };
let windings: WindingSurface | null = null;

/**
 * Copper wire wound in turns (see windingHeights), clamped by a steel strap: the copper bright
 * on each turn's crown, dark in the grooves between, tarnished turn by turn; what glows of it is
 * the wire, brightest along the crowns and dark under the strap, so a lit coil shows its turns
 * through the glow and an unlit one its copper. One tile is WINDING_TURNS turns high; a part
 * repeats it (see GateKit, CoreKit), mipmapped, so far off the turns calm into their mean.
 */
export function windingSurface(): WindingSurface {
  if (windings) return windings;
  if (!drawable) return (windings = { map: new THREE.Texture(), glow: new THREE.Texture(), normal: new THREE.Texture() });
  const r = new Randomizer(4096);
  const size = WINDING_SIZE;
  const heights = windingHeights(size, WINDING_TURNS, WINDING_STRAP);
  const [colorCanvas, c] = canvas(size);
  const [glowCanvas, g] = canvas(size);
  const colorPixels = c.createImageData(size, size);
  const glowPixels = g.createImageData(size, size);
  const pitch = size / WINDING_TURNS;
  const tarnish = Array.from({ length: WINDING_TURNS }, () => r.range(0.75, 1.05));
  for (let y = 0; y < size; y++) {
    const turn = Math.floor(y / pitch);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // how high on its turn's crown (0 in the groove, 1 on top; see windingHeights)
      const crown = Math.min(1, Math.max(0, (heights[i] - WINDING_GROOVE) / WINDING_CROWN));
      const strap = x < WINDING_STRAP * size;
      // copper by the crown's height and the turn's tarnish; the strap gunmetal
      const lit = strap ? 0.35 : (0.25 + 0.85 * crown) * tarnish[turn];
      const [cr, cg, cb] = strap ? [120, 124, 132] : [222, 132, 72];
      colorPixels.data[i] = Math.min(255, cr * lit);
      colorPixels.data[i + 1] = Math.min(255, cg * lit);
      colorPixels.data[i + 2] = Math.min(255, cb * lit);
      colorPixels.data[i + 3] = 255;
      const glow = strap ? 0.04 : 0.18 + 0.82 * crown ** 2;
      glowPixels.data.fill(Math.round(255 * glow), i, i + 3);
      glowPixels.data[i + 3] = 255;
    }
  }
  c.putImageData(colorPixels, 0, 0);
  g.putImageData(glowPixels, 0, 0);
  const [normalCanvas, n] = canvas(size);
  const normalImage = n.createImageData(size, size);
  normalImage.data.set(normalPixels(heights, size, WINDING_SLOPE));
  n.putImageData(normalImage, 0, 0);
  const wrap = <T extends THREE.Texture>(texture: T): T => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  // the glow and the normals are data, read as they are; only the color is sRGB
  windings = { map: wrap(toTexture(colorCanvas)), glow: wrap(new THREE.CanvasTexture(glowCanvas)), normal: wrap(new THREE.CanvasTexture(normalCanvas)) };
  return windings;
}

let panel: { map: THREE.Texture; orm: THREE.Texture } | null = null;

/**
 * A solar wing as one tile across its whole face (512 × 128 px): an aluminium frame around a
 * field of 32 × 8 cells of deep blue polycrystalline silicon, each with its own grain and two
 * thin busbars, light gaps between them, a few cells darker where they aged. The glass over the
 * cells is smooth (a sheen moves over it as the wing turns, see shine), the frame rougher.
 * Mipmapped: far off the grid calms into the panel's mean blue, never a crawling grid.
 */
export function solarPanel(): { map: THREE.Texture; orm: THREE.Texture } {
  if (panel) return panel;
  if (!drawable) return (panel = { map: new THREE.Texture(), orm: new THREE.Texture() });
  const r = new Randomizer(808);
  const [width, height, cell, rim] = [512, 128, 15, 4];
  const [colorCanvas, c] = canvas(width, height);
  const [ormCanvas, o] = canvas(width, height);
  c.fillStyle = '#9aa3ae';
  c.fillRect(0, 0, width, height);
  o.fillStyle = ormColor(0.45, 0.9);
  o.fillRect(0, 0, width, height);
  // the cells' field, lighter gaps (the backsheet) between them
  c.fillStyle = '#5d6c86';
  c.fillRect(rim, rim, width - 2 * rim, height - 2 * rim);
  const across = Math.floor((width - 2 * rim) / (cell + 1));
  const down = Math.floor((height - 2 * rim) / (cell + 1));
  const x0 = (width - across * (cell + 1) + 1) / 2;
  const y0 = (height - down * (cell + 1) + 1) / 2;
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < across; i++) {
      const x = x0 + i * (cell + 1);
      const y = y0 + j * (cell + 1);
      const aged = r.nextFloat() < 0.06 ? 0.65 : r.range(0.88, 1.05);
      c.fillStyle = `rgb(${Math.round(20 * aged)}, ${Math.round(36 * aged)}, ${Math.round(92 * aged)})`;
      c.fillRect(x, y, cell, cell);
      // the silicon's crystals: a few facets a shade lighter or darker
      for (let k = 0; k < 5; k++) {
        c.fillStyle = r.nextFloat() < 0.5 ? 'rgba(120, 150, 230, 0.12)' : 'rgba(0, 0, 20, 0.18)';
        c.fillRect(x + r.range(0, cell - 5), y + r.range(0, cell - 5), r.range(3, 8), r.range(3, 8));
      }
      c.fillStyle = 'rgba(190, 200, 215, 0.55)';
      c.fillRect(x + cell * 0.3, y, 1, cell);
      c.fillRect(x + cell * 0.7, y, 1, cell);
      o.fillStyle = ormColor(r.range(0.12, 0.22), 0.55);
      o.fillRect(x, y, cell, cell);
    }
  }
  const texture = <T extends THREE.Texture>(made: T): T => {
    made.anisotropy = 8;
    return made;
  };
  panel = { map: texture(toTexture(colorCanvas)), orm: texture(new THREE.CanvasTexture(ormCanvas)) };
  return panel;
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
