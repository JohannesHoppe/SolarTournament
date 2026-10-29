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

/**
 * A surface whose relief is baked into a normal map (`normal`) besides its bump map, with what
 * glows of its own, and in the red of its second map how deep a point lies in a recess (a seam,
 * a crater's floor, a hatch's groove: 0 flush, 1 deep), where frost and dust gather.
 */
export type PlatingSurface = GlowingSurface & { normal: THREE.Texture };

/** Texture size of the plating (px): finer than the other surfaces, as a world ship's hull is seen up close over hundreds of meters. */
const PLATING = 512;
/** How steep the plating's relief turns its normals: a height step of 1 over one pixel tilts them by this much. */
const PLATING_RELIEF = 1.6;

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
  const h = (x: number, y: number) => m.height[(((y + S) % S) * S) + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dust = recess[i] * 0.4;
      for (let k = 0; k < 3; k++) c.data[i * 4 + k] = m.color[i * 3 + k] + ([150, 145, 136][k] - m.color[i * 3 + k]) * dust;
      o.data[i * 4] = recess[i] * 255;
      o.data[i * 4 + 1] = Math.min(1, Math.max(0, m.rough[i])) * 255;
      o.data[i * 4 + 2] = Math.min(1, Math.max(0, m.metal[i])) * 255;
      // the slope by a Sobel filter; the canvas runs down where the texture's v runs up
      const gx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) / 8;
      const gy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) / 8;
      const nx = -gx * PLATING_RELIEF;
      const ny = gy * PLATING_RELIEF;
      const length = Math.hypot(nx, ny, 1);
      n.data[i * 4] = (nx / length) * 127.5 + 127.5;
      n.data[i * 4 + 1] = (ny / length) * 127.5 + 127.5;
      n.data[i * 4 + 2] = (1 / length) * 127.5 + 127.5;
      b.data[i * 4] = b.data[i * 4 + 1] = b.data[i * 4 + 2] = 128 + m.height[i] * 50;
      c.data[i * 4 + 3] = o.data[i * 4 + 3] = n.data[i * 4 + 3] = b.data[i * 4 + 3] = 255;
    }
  }
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

let armored: Surface | null = null;

/**
 * The President's battleship, fresh from the dock: heavy armor plates laid in staggered courses
 * (5 m high, 10 m long, each course shifted by half a plate), deep seams between them, each plate
 * a shade lighter or darker than its neighbors, polished smooth.
 */
export function armorSurface(seed: number): Surface {
  if (armored) return armored;
  if (!drawable) return blankSurface();
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank({ roughness: 0.22, metalness: 0.9 });
  const g = color[1];
  const course = 64;
  const plate = 128;
  for (let y = 0; y < SIZE; y += course) {
    const shift = (y / course) % 2 ? plate / 2 : 0;
    for (let x = -shift; x < SIZE; x += plate) {
      const shade = Math.round(r.range(-14, 14));
      g.fillStyle = shade < 0 ? `rgba(0, 0, 0, ${-shade / 100})` : `rgba(255, 255, 255, ${shade / 100})`;
      g.fillRect(x, y, plate, course);
      orm[1].fillStyle = ormColor(r.range(0.16, 0.3), 0.9);
      orm[1].fillRect(x, y, plate, course);
      // the plate's seams: dark in color, grooves in the bump
      g.fillStyle = 'rgba(0, 0, 0, 0.55)';
      g.fillRect(x, y, plate, 2);
      g.fillRect(x, y, 2, course);
      bump[1].fillStyle = '#303030';
      bump[1].fillRect(x, y, plate, 2);
      bump[1].fillRect(x, y, 2, course);
    }
  }
  armored = textures(color[0], orm[0], bump[0]);
  return armored;
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
