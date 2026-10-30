import * as THREE from 'three';
import { Randomizer } from '../random';
import { canvas, toTexture } from './textures';

/**
 * The surfaces of everything built in code, drawn on canvases from fixed seeds, so every
 * session shows the same wear. A surface comes as three maps: a color map that the part's own
 * color is multiplied with, a map of roughness (green) and metalness (blue) as three.js reads
 * them, with how intact a clear lacquer over the paint is in its red (gone where the paint
 * rusted or chipped, dull where it is scratched; read by the hulls, see ship/models.ts), and a
 * bump map of grooves, rivets and bolts. All of it is look only; nothing of it is shared.
 *
 * The fighters of the Games come from the depots of centuries of war: their paint is worn,
 * chipped down to bare metal, streaked with rust and grime, stenciled over and over. The
 * President's battleship is new and gleams; the world ship of the derelict arena carries the
 * craters and burns of the battle that broke it.
 */

/** Texture size of a surface (px): small, for phones; a surface repeats across a part (see boxUv). */
export const SIZE = 256;

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
  /**
   * What the relief is instead of riveted panels: a fine pattern of scales (the alien hull),
   * ribs in riveted frames (the human interceptor's fins), polished metal engraved in bands
   * (the Sovereign's gold), flush plates welded and bonded without a rivet, a few hatches with
   * flush bolts (the Sovereign's ivory).
   */
  relief?: 'scales' | 'ribs' | 'engraved' | 'flush';
  /** Dents beaten into the plating (0..1; none when left out). */
  dents?: number;
  /** The chips as small flakes, a rim of primer around bare metal (see flakes), instead of plain scars. */
  flakes?: boolean;
}

/**
 * The three canvases of a surface, filled: color white, paint's roughness and metalness, flat
 * bump; `detail` pixels for every pixel of SIZE, everything drawn in SIZE's coordinates.
 */
function blank(wear: Pick<Wear, 'roughness' | 'metalness'>, detail = 1) {
  const color = canvas(SIZE * detail);
  const orm = canvas(SIZE * detail);
  const bump = canvas(SIZE * detail);
  for (const [, g] of [color, orm, bump]) g.setTransform(detail, 0, 0, detail, 0, 0);
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

/** The height of a row of panels (px of SIZE, 5 m), the rows down the tile, and the widths a panel comes in. */
const PANEL_ROW = 64;
const PANEL_WIDTHS = [32, 48, 64, 96];
/** An access hatch of flush plating (px of SIZE: about 1.25 by 0.95 m), how many sit on a tile, and how far its bolts sit in from its corners. */
const HATCH_W = 16;
const HATCH_H = 12;
const HATCHES = 2;
const BOLT_INSET = 2;

/**
 * Where a tile of panels has its seams, its rivets, its hatches and their bolts (px of SIZE),
 * computed from the seed's draws without drawing, so the unit tests read it in Node. Riveted
 * plating has a row of rivets just off every seam; flush plating (`relief` 'flush') is welded and bonded,
 * with no rivets at all: its only fasteners are the bolts sunk into the corners of a few hatches.
 */
export function panelLayout(r: Randomizer, relief?: Wear['relief']) {
  const flush = relief === 'flush';
  const seams: [number, number, number, number][] = [];
  const rivets: [number, number][] = [];
  const panes: [number, number, number][] = [];
  for (let y = 0; y <= SIZE; y += PANEL_ROW) {
    seams.push([0, y, SIZE, y]);
    // the panels of a row are of different widths, as plates patched in over the years
    for (let x = 0; x < SIZE; ) {
      const width = PANEL_WIDTHS[r.nextInt() % PANEL_WIDTHS.length];
      seams.push([x, y, x, y + PANEL_ROW]);
      if (y < SIZE && x + width <= SIZE && width >= 48) panes.push([x, y, width]);
      x += width;
    }
    if (!flush) for (let x = 4; x < SIZE; x += 8) rivets.push([x, y + 4]);
  }
  const hatches: [number, number][] = [];
  const bolts: [number, number][] = [];
  if (flush) {
    for (let i = 0; i < HATCHES && panes.length; i++) {
      const [x, y, width] = panes.splice(r.nextInt() % panes.length, 1)[0];
      const hx = Math.round(x + r.range(8, width - HATCH_W - 8));
      const hy = Math.round(y + r.range(10, PANEL_ROW - HATCH_H - 10));
      hatches.push([hx, hy]);
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) bolts.push([hx + BOLT_INSET + cx * (HATCH_W - 2 * BOLT_INSET), hy + BOLT_INSET + cy * (HATCH_H - 2 * BOLT_INSET)]);
    }
  }
  return { seams, rivets, hatches, bolts };
}

/**
 * Panels of plating: seams as grooves, and on riveted plating rivets as bumps along them; flush
 * plating (`relief` 'flush', the Sovereign's) has thin, crisp panel lines, a few hatches outlined the same
 * way and flush bolts sunk into their corners (see panelLayout).
 */
function panels(r: Randomizer, color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, seams: number, relief?: Wear['relief']) {
  const layout = panelLayout(r, relief);
  const flush = relief === 'flush';
  color.strokeStyle = flush ? `rgba(0, 0, 0, ${0.1 + 0.3 * seams})` : `rgba(0, 0, 0, ${0.12 + 0.28 * seams})`;
  bump.strokeStyle = flush ? '#5c5c5c' : '#404040';
  color.lineWidth = bump.lineWidth = flush ? 0.7 : 1.5;
  // each seam a stroke of its own, so where two cross the groove is a shade darker
  for (const [x0, y0, x1, y1] of layout.seams) {
    for (const g of [color, bump]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
  for (const [x, y] of layout.hatches) for (const g of [color, bump]) g.strokeRect(x, y, HATCH_W, HATCH_H);
  for (const [x, y] of layout.rivets) {
    bump.fillStyle = '#c8c8c8';
    bump.fillRect(x, y, 2, 2);
    color.fillStyle = 'rgba(0, 0, 0, 0.18)';
    color.fillRect(x + 1, y + 1, 1.5, 1.5);
  }
  // a flush bolt: a small round head sunk level into the plate, its ring a hairline
  for (const [x, y] of layout.bolts) {
    bump.fillStyle = '#6c6c6c';
    color.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (const g of [bump, color]) {
      g.beginPath();
      g.arc(x, y, 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** The pitch of the scales across and down (px of SIZE) and their radius: rows half a scale apart, every other row shifted by half a scale. */
const SCALE_PITCH = 16;
const SCALE_ROW = 8;
const SCALE_RADIUS = 11;

/**
 * A fine pattern of scales, as grown rather than riveted: each row overlaps the one above, so
 * only a crescent of every scale shows, rising from where it tucks under its neighbors to its
 * free rim, which stands out as a step (the relief catches the light on every scale). Each
 * scale is a shade of its own, and every few a rim glows faintly in `glow`, if given.
 */
function scales(r: Randomizer, color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, seams: number, glow?: CanvasRenderingContext2D) {
  for (let row = 0; row < SIZE / SCALE_ROW; row++) {
    const y = row * SCALE_ROW;
    for (let x = row % 2 ? SCALE_PITCH / 2 : 0; x < SIZE; x += SCALE_PITCH) {
      const shade = r.range(-0.08, 0.08);
      const lit = r.nextFloat() < 0.06;
      // drawn again across the tile's edges, so the pattern wraps
      for (const dx of [-SIZE, 0, SIZE]) {
        for (const dy of [-SIZE, 0, SIZE]) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx < -SCALE_RADIUS || cx > SIZE + SCALE_RADIUS || cy < -SCALE_RADIUS || cy > SIZE + SCALE_RADIUS) continue;
          const height = bump.createRadialGradient(cx, cy - SCALE_RADIUS * 0.6, 0, cx, cy - SCALE_RADIUS * 0.6, SCALE_RADIUS * 1.6);
          height.addColorStop(0, '#585858');
          height.addColorStop(1, '#b8b8b8');
          bump.fillStyle = height;
          bump.beginPath();
          bump.arc(cx, cy, SCALE_RADIUS, 0, Math.PI * 2);
          bump.fill();
          bump.strokeStyle = '#383838';
          bump.lineWidth = 1.2;
          bump.beginPath();
          bump.arc(cx, cy, SCALE_RADIUS, 0.15 * Math.PI, 0.85 * Math.PI);
          bump.stroke();
          color.fillStyle = shade > 0 ? `rgba(255, 255, 255, ${shade})` : `rgba(0, 0, 0, ${-shade})`;
          color.beginPath();
          color.arc(cx, cy, SCALE_RADIUS, 0, Math.PI * 2);
          color.fill();
          color.strokeStyle = `rgba(0, 0, 0, ${0.2 + 0.4 * seams})`;
          color.lineWidth = 1.2;
          color.beginPath();
          color.arc(cx, cy, SCALE_RADIUS, 0.15 * Math.PI, 0.85 * Math.PI);
          color.stroke();
          if (glow && lit) {
            glow.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            glow.lineWidth = 1;
            glow.beginPath();
            glow.arc(cx, cy, SCALE_RADIUS - 0.6, 0.25 * Math.PI, 0.75 * Math.PI);
            glow.stroke();
          }
        }
      }
    }
  }
}

/** The pitch of the ribs (px of SIZE, 60 cm) and the height of the frames that hold them, every quarter of the tile. */
const RIB_PITCH = 8;
const RIB_FRAME = 7;

/**
 * Ribbed plating, as stiffened plates go: ribs running across u (rounded crests, grooves between
 * them), held every quarter of the tile by a flat riveted frame.
 */
function ribs(color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, seams: number) {
  for (let x = 0; x < SIZE; x += RIB_PITCH) {
    const crest = bump.createLinearGradient(x, 0, x + RIB_PITCH, 0);
    crest.addColorStop(0, '#505050');
    crest.addColorStop(0.3, '#b4b4b4');
    crest.addColorStop(0.5, '#c4c4c4');
    crest.addColorStop(0.7, '#b4b4b4');
    crest.addColorStop(1, '#505050');
    bump.fillStyle = crest;
    bump.fillRect(x, 0, RIB_PITCH, SIZE);
    color.fillStyle = `rgba(0, 0, 0, ${0.1 + 0.2 * seams})`;
    color.fillRect(x - 0.75, 0, 1.5, SIZE);
  }
  for (let y = 0; y < SIZE; y += SIZE / 4) {
    bump.fillStyle = '#9a9a9a';
    bump.fillRect(0, y, SIZE, RIB_FRAME);
    bump.fillStyle = '#404040';
    bump.fillRect(0, y - 0.75, SIZE, 1.5);
    bump.fillRect(0, y + RIB_FRAME - 0.75, SIZE, 1.5);
    color.fillStyle = `rgba(0, 0, 0, ${0.15 + 0.3 * seams})`;
    color.fillRect(0, y - 0.75, SIZE, 1.5);
    color.fillRect(0, y + RIB_FRAME - 0.75, SIZE, 1.5);
    for (let x = RIB_PITCH / 2; x < SIZE; x += RIB_PITCH) {
      bump.fillStyle = '#d0d0d0';
      bump.fillRect(x - 1, y + RIB_FRAME / 2 - 1, 2, 2);
      color.fillStyle = 'rgba(0, 0, 0, 0.18)';
      color.fillRect(x - 0.5, y + RIB_FRAME / 2, 1.5, 1.5);
    }
  }
}

/** The engraving's bands: their pitch down the tile (px of SIZE), their half height, the waves in each and a wave's length along it. */
const BAND_PITCH = 64;
const BAND_HALF = 12;
const BAND_WAVES = 5;
const WAVE_LENGTH = 32;

/**
 * Polished metal, brushed along u and engraved in bands: between two border lines, waves
 * interlaced as on a banknote's guilloche, and between the bands a row of small stars, the
 * regime's. The cuts are fine grooves, duller and a little darker than the polish.
 */
function engraving(r: Randomizer, color: CanvasRenderingContext2D, orm: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, wear: Wear) {
  orm.lineWidth = 0.6;
  for (let i = 0; i < 500; i++) {
    const x = r.range(0, SIZE);
    const y = r.range(0, SIZE);
    const length = r.range(20, 140);
    orm.strokeStyle = ormColor(wear.roughness + r.range(-0.1, 0.14), wear.metalness, 0.35);
    for (const dx of [0, -SIZE]) {
      orm.beginPath();
      orm.moveTo(x + dx, y);
      orm.lineTo(x + dx + length, y);
      orm.stroke();
    }
  }
  const cut = (path: (g: CanvasRenderingContext2D) => void, width: number) => {
    bump.strokeStyle = '#505050';
    color.strokeStyle = 'rgba(60, 36, 0, 0.35)';
    orm.strokeStyle = ormColor(0.6, wear.metalness, 1, 0.4);
    for (const g of [bump, color, orm]) {
      g.lineWidth = width;
      g.beginPath();
      path(g);
      g.stroke();
    }
  };
  for (let y0 = BAND_PITCH / 2; y0 < SIZE; y0 += BAND_PITCH) {
    for (const edge of [-BAND_HALF, BAND_HALF]) {
      cut((g) => {
        g.moveTo(0, y0 + edge);
        g.lineTo(SIZE, y0 + edge);
      }, 1.2);
    }
    for (let k = 0; k < BAND_WAVES; k++) {
      cut((g) => {
        for (let x = 0; x <= SIZE; x += 1) {
          const y = y0 + (BAND_HALF - 3) * Math.sin(((x / WAVE_LENGTH) + k / BAND_WAVES) * Math.PI * 2);
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }, 0.7);
    }
    // the last row of stars lies on the tile's edge: drawn on both sides of it
    for (let x = WAVE_LENGTH / 2; x < SIZE; x += WAVE_LENGTH) for (const cy of [y0 + BAND_PITCH / 2, y0 + BAND_PITCH / 2 - SIZE]) {
      cut((g) => {
        for (let p = 0; p <= 5; p++) {
          const angle = -Math.PI / 2 + (p * 4 * Math.PI) / 5;
          const px = x + Math.cos(angle) * 5;
          const py = cy + Math.sin(angle) * 5;
          if (p === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
      }, 0.8);
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

/**
 * Chips as an old fighter's paint flakes: mostly small, a few larger, half of them along the
 * seams where the plates flex; each an irregular flake with a rim of dull primer around the bare
 * metal (rougher, no lacquer), the metal smooth and nearly a mirror. The hull shows the metal as
 * steel (see BARE_STEEL in ship/models); here it is white in color, so grime and soot still tint it.
 */
function flakes(r: Randomizer, color: CanvasRenderingContext2D, orm: CanvasRenderingContext2D, amount: number) {
  const flake = (g: CanvasRenderingContext2D, x: number, y: number, size: number, reach: number[], scale: number) => {
    g.beginPath();
    reach.forEach((k, i) => {
      const angle = (i / reach.length) * Math.PI * 2;
      const px = x + Math.cos(angle) * size * k * scale;
      const py = y + Math.sin(angle) * size * k * scale * 0.8;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.fill();
  };
  for (let i = 0; i < 170 * amount; i++) {
    const onSeam = r.nextFloat() < 0.5;
    const x = r.range(0, SIZE);
    const y = onSeam ? Math.floor(r.range(0, 4)) * 64 + r.range(-3, 3) : r.range(0, SIZE);
    // small ones far more often than large ones: bare metal from a few centimeters to half a meter across
    const size = 0.4 + 2.4 * r.nextFloat() ** 2.2;
    const reach = Array.from({ length: 6 + (r.nextInt() % 4) }, () => r.range(0.45, 1.25));
    // one near the tile's edge is drawn on its far side too, so it wraps
    for (const dx of [0, -SIZE, SIZE]) {
      for (const dy of [0, -SIZE, SIZE]) {
        if (Math.abs(x + dx - SIZE / 2) > SIZE / 2 + 5 || Math.abs(y + dy - SIZE / 2) > SIZE / 2 + 5) continue;
        color.fillStyle = 'rgba(150, 140, 120, 0.9)';
        orm.fillStyle = ormColor(0.75, 0.1, 1, 0);
        for (const g of [color, orm]) flake(g, x + dx, y + dy, size, reach, 1.5);
        color.fillStyle = 'rgba(235, 235, 235, 1)';
        orm.fillStyle = ormColor(0.3, 0.9, 1, 0);
        for (const g of [color, orm]) flake(g, x + dx, y + dy, size, reach, 1);
      }
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

/** The canvases of a worn surface, drawn from a seed: `detail` pixels for every pixel of SIZE, and what of it glows, if `glowing`. */
function drawWorn(seed: number, wear: Wear, detail = 1, glowing = false) {
  const r = new Randomizer(seed);
  const { color, orm, bump } = blank(wear, detail);
  const glow = glowing ? glowLayer(SIZE * detail) : null;
  glow?.[1].setTransform(detail, 0, 0, detail, 0, 0);
  if (wear.relief === 'scales') scales(r, color[1], bump[1], wear.seams, glow?.[1]);
  else if (wear.relief === 'ribs') ribs(color[1], bump[1], wear.seams);
  else if (wear.relief === 'engraved') engraving(r, color[1], orm[1], bump[1], wear);
  else panels(r, color[1], bump[1], wear.seams, wear.relief);
  if (wear.dents) dents(r, color[1], bump[1], wear.dents);
  grime(r, color[1], wear.grime);
  rust(r, color[1], orm[1], wear.rust);
  (wear.flakes ? flakes : chips)(r, color[1], orm[1], wear.chips);
  scratches(r, color[1], orm[1], wear.scratches);
  stencils(r, color[1], wear.stencils);
  return { color, orm, bump, glow };
}

const worn = new Map<string, Surface>();

/** A worn surface of a seed and a wear (built once per pair, shared by every part that carries it). */
export function wornSurface(seed: number, wear: Wear): Surface {
  const key = `${seed}:${JSON.stringify(wear)}`;
  const kept = worn.get(key);
  if (kept) return kept;
  if (!drawable) return blankSurface();
  const { color, orm, bump } = drawWorn(seed, wear);
  const surface = textures(color[0], orm[0], bump[0]);
  worn.set(key, surface);
  return surface;
}

/**
 * A fighter's hull: its worn surface (see wornSurface) twice as fine, 512 pixels a tile, as a
 * pilot sees the ships of the Games up close and the stencils have to stay sharp; its relief as
 * a normal map (`normal`), whose mipmaps flatten the seams and rivets evenly with distance
 * instead of shimmering as a bump map does on a phone; and, with `glowing`, a map of what glows
 * of its own (`glow`: the alien hull's scale rims).
 */
export type HullSurface = { map: THREE.Texture; orm: THREE.Texture; normal: THREE.Texture; glow: THREE.Texture | null };

/** A hull's surface is this many times as fine as SIZE. */
const HULL_DETAIL = 2;
/** How steep a hull's relief tilts its normals per step of the bump's gray (see normalPixels), at SIZE's pixels. */
const HULL_SLOPE = 2.2;

const hulls = new Map<string, HullSurface>();

/** A hull's surface of a seed and a wear (see HullSurface; built once per pair). */
export function hullSurface(seed: number, wear: Wear, glowing = false): HullSurface {
  const key = `${seed}:${JSON.stringify(wear)}:${glowing}`;
  const kept = hulls.get(key);
  if (kept) return kept;
  if (!drawable) return { map: new THREE.Texture(), orm: new THREE.Texture(), normal: new THREE.Texture(), glow: null };
  const { color, orm, bump, glow } = drawWorn(seed, wear, HULL_DETAIL, glowing);
  const size = SIZE * HULL_DETAIL;
  const [element, g] = canvas(size);
  const image = g.createImageData(size, size);
  image.data.set(normalPixels(bump[1].getImageData(0, 0, size, size).data, size, HULL_SLOPE * HULL_DETAIL));
  g.putImageData(image, 0, 0);
  // the normal map takes the bump's place among the textures (linear, repeating)
  const surface = textures(color[0], orm[0], element);
  const made = { map: surface.map, orm: surface.orm, normal: surface.bump, glow: glow && glowTexture(glow[0]) };
  hulls.set(key, made);
  return made;
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
 * The battleship's armor repeats every ARMOR_TILE units (100 m) across its hull, at about ten
 * pixels a meter in its relief (ARMOR_RELIEF_SIZE) and half that in its color and finish
 * (ARMOR_SIZE): sharp enough for a panel line of 20 cm a pilot flies past, a tile long enough
 * that its panels never line up into a pattern along a hull of 710 m, and with its mipmaps about
 * 8 MB on the GPU, light enough for a phone.
 */
export const ARMOR_TILE = 2000;
export const ARMOR_RELIEF_SIZE = 1024;
const ARMOR_SIZE = 512;
/** Relief pixels a meter of hull. */
const METER = ARMOR_RELIEF_SIZE / (ARMOR_TILE * 0.05);
/** How steep the relief's slopes are in the normal map (normal map units per height step of the canvas, see normalPixels). */
export const ARMOR_SLOPE = 6;
/**
 * How deep the line between two flush plates is cut (steps of gray below the plates beside it):
 * barely, so it shows as a thin dark cut in the color and the plates on both sides read as one
 * armored surface, without a cushion of light around each.
 */
const LINE_DEPTH = 6;
/**
 * How much of a line's depth each pixel in from a panel's edge is cut. Flush: the pixel at the
 * edge, hardly a bevel. A plate stepping out (or sunk in): the pixel at the edge fully, the next
 * two in a soft bevel, so its edge towards the sun catches the light; a step of a single pixel
 * would catch it as a hairline that breaks into dashes wherever the hull lies at a slant.
 */
const FLUSH_PROFILE = [1, 0.15];
const STEP_PROFILE = [1, 0.35, 0.08];
/** From how high a step (steps of gray) a panel's edge is beveled. */
const STEP = 8;

/** The battleship's armor: its color, its finish (roughness and metalness, see ormColor) and its relief as a normal map. */
export type ArmorSurface = { map: THREE.Texture; orm: THREE.Texture; normal: THREE.Texture };
let armored: ArmorSurface | null = null;

/**
 * A rectangle of the armor in relief pixels (it may run over the tile's edge and wraps): a
 * plate of the hull, or what is set into one (an armor plate laid over it, an access panel, a
 * hatch, a hardpoint). `lift` is how far it stands out of what is around it (steps of gray,
 * negative when recessed), `line` how deep the line around it is cut; `shade` its tone against
 * its neighbors (-1..1), `rough` its polish, `across` whether it is brushed along v instead of u.
 */
export type ArmorPanel = { x: number; y: number; w: number; h: number; lift: number; line: number; shade: number; rough: number; across: boolean; kind: 'plate' | 'doubler' | 'access' | 'hatch' | 'hardpoint' };
/** The armor laid out from a seed: the plates (covering the tile once), what is set into them, the welded butts between strakes, the sensor ports, and the flush bolts of the hatches (the only fasteners on the hull: no rivets). */
export type ArmorLayout = { plates: ArmorPanel[]; insets: ArmorPanel[]; welds: { x: number; y: number; h: number }[]; ports: { x: number; y: number; radius: number }[]; bolts: { x: number; y: number; radius: number }[] };

/**
 * The armor's plates: strakes along the hull in bands of different heights (3.5 to 16 m), each
 * band a row of plates of its own lengths (most long, 30 to 55 m, a quarter shorter, 12 to 24 m;
 * a few short ones in the high bands split in two), their butts welded or set apart by a thin
 * panel line flush with them, now and then a band standing out as a heavier belt; into the plates, armor
 * plates laid over them, access panels, hatches, hardpoints and sensor ports, none touching an
 * edge or each other.
 */
export function armorLayout(seed: number): ArmorLayout {
  const r = new Randomizer(seed);
  const S = ARMOR_RELIEF_SIZE;
  const px = (meters: number) => Math.round(meters * METER);
  const plates: ArmorPanel[] = [];
  const welds: ArmorLayout['welds'] = [];
  const plate = (x: number, y: number, w: number, h: number, lift: number, across = false): ArmorPanel => ({ x, y, w, h, lift, line: LINE_DEPTH, shade: r.range(-1, 1), rough: r.range(0.24, 0.36), across, kind: 'plate' });
  const split = (total: number, pick: () => number, least: number) => {
    const sizes: number[] = [];
    for (let left = total; left > 0; ) {
      const size = px(pick());
      if (left - size < least) {
        sizes.push(left);
        break;
      }
      sizes.push(size);
      left -= size;
    }
    return sizes;
  };
  const bands = split(S, () => [3.5, 5, 6, 8, 8, 10, 12, 16][r.nextInt() % 8], px(3));
  let y = Math.floor(r.range(0, S));
  for (const h of bands) {
    const lift = r.nextFloat() < 0.15 ? 12 : 0;
    const high = h >= px(10);
    let x = Math.floor(r.range(0, S));
    for (const w of split(S, () => (r.nextFloat() < 0.75 ? r.range(30, 55) : r.range(12, 24)), px(8))) {
      if (high && w < px(25) && r.nextFloat() < 0.3) {
        const top = Math.round(h * r.range(0.35, 0.65));
        plates.push(plate(x, y, w, top, lift), plate(x, y + top, w, h - top, lift));
      } else plates.push(plate(x, y, w, h, lift, high && w < px(25) && r.nextFloat() < 0.3));
      x += w;
      // a butt welded through instead of set apart by a line (the plates beside it run on as one)
      if (!high && r.nextFloat() < 0.6) welds.push({ x: x % S, y, h });
    }
    y += h;
  }
  const insets: ArmorPanel[] = [];
  const ports: ArmorLayout['ports'] = [];
  const bolts: ArmorLayout['ports'] = [];
  for (const p of plates) {
    const margin = px(1);
    const room = { x: p.x + margin, y: p.y + margin, w: p.w - 2 * margin, h: p.h - 2 * margin };
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    const place = (w: number, h: number) => {
      if (w > room.w || h > room.h) return null;
      for (let tries = 0; tries < 6; tries++) {
        const at = { x: Math.round(room.x + r.range(0, room.w - w)), y: Math.round(room.y + r.range(0, room.h - h)), w, h };
        if (taken.every((t) => at.x + at.w + margin <= t.x || t.x + t.w + margin <= at.x || at.y + at.h + margin <= t.y || t.y + t.h + margin <= at.y)) {
          taken.push(at);
          return at;
        }
      }
      return null;
    };
    const inset = (kind: ArmorPanel['kind'], w: number, h: number, lift: number, line: number, shade: number, rough: number) => {
      const at = place(w, h);
      if (at) insets.push({ ...at, lift, line, shade, rough, across: p.across, kind });
      return at;
    };
    // an armor plate laid over a big plate, stepping out of it
    if (p.w >= px(14) && p.h >= px(5) && r.nextFloat() < 0.3) inset('doubler', Math.round(p.w * r.range(0.4, 0.75)), Math.round((p.h - 2 * margin) * r.range(0.55, 1)), 16, 20, p.shade + r.range(-0.4, 0.4), p.rough + r.range(-0.03, 0.03));
    for (let k = r.nextInt() % 3; k > 0; k--) if (r.nextFloat() < 0.45) inset('access', px(r.range(1.5, 3.5)), px(r.range(1, 2.4)), -3, 10, p.shade + r.range(-0.6, 0.6), p.rough + 0.04);
    if (p.h >= px(6) && r.nextFloat() < 0.1) {
      const hatch = inset('hatch', px(3), px(3), 0, 14, p.shade - 0.3, p.rough);
      if (hatch) bolts.push(...[0, 1].flatMap((a) => [0, 1].map((b) => ({ x: hatch.x + px(0.2) + a * (hatch.w - 2 * px(0.2)), y: hatch.y + px(0.2) + b * (hatch.h - 2 * px(0.2)), radius: 1.3 }))));
      if (hatch) insets.push({ x: hatch.x + px(0.4), y: hatch.y + px(0.4), w: hatch.w - 2 * px(0.4), h: hatch.h - 2 * px(0.4), lift: 2, line: 8, shade: p.shade - 0.3, rough: p.rough, across: p.across, kind: 'hatch' });
    }
    if (r.nextFloat() < 0.12) {
      const side = px(r.range(1.4, 2.6));
      inset('hardpoint', side, side, -22, 8, -1, 0.5);
    }
    if (p.h >= px(4) && r.nextFloat() < 0.14) {
      const radius = px(r.range(0.35, 0.9));
      const at = place(radius * 2 + 2, radius * 2 + 2);
      if (at) ports.push({ x: at.x + at.w / 2, y: at.y + at.h / 2, radius });
    }
  }
  return { plates, insets, welds, ports, bolts };
}

/** A smooth value noise of the plane (0..1), from integer hashing only: the grain of brushed metal. */
function grain(x: number, y: number, seed: number) {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx;
  const bottom = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
  return top + (bottom - top) * sy;
}

/**
 * The armor drawn into plain arrays at the relief's size, wrapping at the tile's edges: heights
 * (steps of gray around 128, see normalPixels), color (sRGB, 0..255, three a pixel) and
 * roughness and metalness (0..1). Plain numbers, so the unit tests read it in Node.
 */
export function armorRelief(seed: number) {
  const S = ARMOR_RELIEF_SIZE;
  const layout = armorLayout(seed);
  const height = new Float32Array(S * S).fill(128);
  const color = new Float32Array(S * S * 3);
  const rough = new Float32Array(S * S);
  const metal = new Float32Array(S * S).fill(0.6);
  const at = (x: number, y: number) => (((y % S) + S) % S) * S + (((x % S) + S) % S);
  const welded = new Set(layout.welds.map((w) => `${w.x},${w.y}`));
  /**
   * Paints a panel: its face lifted by `lift` over what lies under it, the line around it cut
   * into its edge (across a welded butt none); its tone, polish and brushing.
   */
  const paint = (p: ArmorPanel, base: boolean) => {
    const openLeft = base && welded.has(`${p.x % S},${p.y}`);
    const openRight = base && welded.has(`${(p.x + p.w) % S},${p.y}`);
    const tone = 1 + p.shade * 0.035;
    for (let dy = 0; dy < p.h; dy++) {
      for (let dx = 0; dx < p.w; dx++) {
        const i = at(p.x + dx, p.y + dy);
        const edge = Math.min(dy, p.h - 1 - dy, openLeft ? Infinity : dx, openRight ? Infinity : p.w - 1 - dx);
        const u = p.x + dx;
        const v = p.y + dy;
        const [along, across] = p.across ? [v, u] : [u, v];
        const brush = grain(along / 160, across / 1.6, seed) * 0.6 + grain(along / 320, across / 5, seed + 1) * 0.4 - 0.5;
        const under = base ? 128 : height[i];
        const cut = (Math.abs(p.lift) >= STEP ? STEP_PROFILE : FLUSH_PROFILE)[edge] ?? 0;
        height[i] = under + p.lift - (p.lift + p.line) * cut;
        const shade = (1 - 0.45 * cut) * tone * (1 + brush * 0.02);
        for (let k = 0; k < 3; k++) color[i * 3 + k] = [238, 240, 244][k] * shade;
        rough[i] = p.rough + brush * 0.05 + (0.5 - p.rough) * cut;
        if (p.kind === 'hardpoint' && edge > 0) metal[i] = 0.45;
      }
    }
  };
  for (const p of layout.plates) paint(p, true);
  // the welds: a low bead along the butt, ground smooth, a faint tint of the heat beside it
  for (const w of layout.welds) {
    for (let dy = 1; dy < w.h - 1; dy++) {
      for (let dx = -6; dx <= 5; dx++) {
        const off = dx + 0.5;
        const i = at(w.x + dx, w.y + dy);
        const bead = Math.max(0, 1 - (off / 1.8) ** 2);
        height[i] += 9 * bead;
        const heat = Math.max(0, 1 - Math.abs(off) / 6) * 0.06;
        const tint = Math.abs(off) < 3 ? [214, 196, 160] : [150, 170, 214];
        for (let k = 0; k < 3; k++) color[i * 3 + k] += (tint[k] - color[i * 3 + k]) * heat - color[i * 3 + k] * 0.08 * bead;
        rough[i] += (0.48 - rough[i]) * bead;
      }
    }
  }
  for (const p of layout.insets) paint(p, false);
  // the sensor ports: a round recess with a polished rim, dark glass in it
  for (const port of layout.ports) {
    const reach = port.radius + 2;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const i = at(Math.floor(port.x + dx), Math.floor(port.y + dy));
        const rho = Math.hypot(dx + 0.5, dy + 0.5);
        const recess = 1 - smoothstep(port.radius - 0.7, port.radius + 0.7, rho);
        height[i] -= 20 * recess;
        const glass = 1 - smoothstep(port.radius - 2.2, port.radius - 1.2, rho);
        const rim = Math.max(0, 1 - Math.abs(rho - port.radius) / 1.2);
        for (let k = 0; k < 3; k++) color[i * 3 + k] += ([40, 48, 62][k] - color[i * 3 + k]) * glass + (255 - color[i * 3 + k]) * rim * 0.06;
        rough[i] += (0.08 - rough[i]) * Math.max(glass, rim * 0.7);
        metal[i] += (0.15 - metal[i]) * glass;
      }
    }
  }
  // the hatches' bolts: sunk flush into their corners, a small dark hole each
  for (const bolt of layout.bolts) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const i = at(Math.floor(bolt.x + dx), Math.floor(bolt.y + dy));
        const hole = 1 - smoothstep(bolt.radius - 0.6, bolt.radius + 0.6, Math.hypot(dx + 0.5, dy + 0.5));
        height[i] -= 8 * hole;
        for (let k = 0; k < 3; k++) color[i * 3 + k] *= 1 - 0.35 * hole;
      }
    }
  }
  return { layout, height, color, rough, metal };
}

/**
 * The President's battleship, fresh from the dock: armor of dark gunmetal in large plates of
 * many sizes (see armorLayout), set apart by thin panel lines with a polished bevel on each side
 * or welded butt to butt, armor plates stepping out of it here and there, access panels,
 * hatches, recessed hardpoints and sensor ports between them; each plate a shade lighter or
 * darker than its neighbors, a little more or less polished, brushed along its length. No
 * rivets and barely a mark: it is new. The relief is a normal map, not a bump map: mipmapped like
 * the color, it fades evenly with distance instead of shimmering on a phone's small screen.
 */
export function armorSurface(seed: number): ArmorSurface {
  if (armored) return armored;
  if (!drawable) return { map: new THREE.Texture(), orm: new THREE.Texture(), normal: new THREE.Texture() };
  const { height, color, rough, metal } = armorRelief(seed);
  const S = ARMOR_RELIEF_SIZE;
  const [colorCanvas, colorContext] = canvas(ARMOR_SIZE);
  const [ormCanvas, ormContext] = canvas(ARMOR_SIZE);
  const [normalCanvas, normalContext] = canvas(S);
  const c = colorContext.createImageData(ARMOR_SIZE, ARMOR_SIZE);
  const o = ormContext.createImageData(ARMOR_SIZE, ARMOR_SIZE);
  // color and finish at half the relief's size, each pixel the mean of the four under it
  for (let y = 0; y < ARMOR_SIZE; y++) {
    for (let x = 0; x < ARMOR_SIZE; x++) {
      const four = [2 * y * S + 2 * x, 2 * y * S + 2 * x + 1, (2 * y + 1) * S + 2 * x, (2 * y + 1) * S + 2 * x + 1];
      const mean = (values: Float32Array, stride = 1, k = 0) => four.reduce((sum, i) => sum + values[i * stride + k], 0) / 4;
      const i = (y * ARMOR_SIZE + x) * 4;
      for (let k = 0; k < 3; k++) c.data[i + k] = mean(color, 3, k);
      o.data[i] = 255;
      o.data[i + 1] = mean(rough) * 255;
      o.data[i + 2] = mean(metal) * 255;
      c.data[i + 3] = o.data[i + 3] = 255;
    }
  }
  colorContext.putImageData(c, 0, 0);
  ormContext.putImageData(o, 0, 0);
  const n = normalContext.createImageData(S, S);
  n.data.set(normalPixels(height, S, ARMOR_SLOPE, 1));
  normalContext.putImageData(n, 0, 0);
  armored = { map: armorTexture(toTexture(colorCanvas)), orm: armorTexture(new THREE.CanvasTexture(ormCanvas)), normal: armorTexture(new THREE.CanvasTexture(normalCanvas)) };
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
 * The heights are a canvas's pixels (`stride` 4, the gray in red) or one number a pixel (`stride`
 * 1, steps of gray that need not be whole). Texture coordinates run as the GPU reads a canvas
 * texture: u along a row, v up the canvas (its first row at v = 1); red holds the normal along u,
 * green along v, blue out of the surface.
 */
export function normalPixels(heights: ArrayLike<number>, size: number, slope: number, stride = 4): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => heights[(((y + size) % size) * size + ((x + size) % size)) * stride] / 255;
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

/**
 * A torpedo's casing as a lathe wraps it: once around (u, CASING_AROUND pixels) and its whole
 * length from the nose's tip at the top to the nozzle's lip at the bottom (v, CASING_ALONG
 * pixels). The two sizes keep the pixels square on its body (about 2 pixels per unit around its
 * 188 units and along its 260), so bands and stencils are drawn at their true proportions.
 */
export const CASING_AROUND = 384;
export const CASING_ALONG = 512;
/** A strip of plain paint along the casing (u up to this share), left free of stencils: the fins and strakes take their paint from it. */
export const CASING_PLAIN = 0.03;

let casing: THREE.Texture | null = null;

/**
 * A torpedo's casing: dark olive military paint, the radome a shade browner, the seeker's
 * glass black at the tip; a yellow warhead band just behind the nose (high explosive), seams
 * around the body, an arming hatch, the type and lot stenciled along it twice, and the tail
 * blued and sooted by its motor. `along(z)` turns a point along its axis into a row (see
 * torpedoes.ts); only plain fills and gentle gradients, so it holds still on a phone's screen.
 */
export function torpedoCasing(along: (z: number) => number): THREE.Texture {
  if (casing) return casing;
  if (!drawable) return (casing = new THREE.Texture());
  const W = CASING_AROUND;
  const H = CASING_ALONG;
  const [element, g] = canvas(W, H);
  const row = (z: number) => Math.round(along(z) * H);
  const nose = row(58);
  const tail = row(-96);
  // the body's paint, the radome a shade browner, the seeker's window at the tip black glass
  g.fillStyle = '#5d6650';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#6b6356';
  g.fillRect(0, 0, W, nose);
  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, W, row(118));
  // faint streaks of wear along the body, low in contrast
  const r = new Randomizer(2584);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r.nextFloat() < 0.5 ? 'rgba(255, 255, 240, 0.035)' : 'rgba(0, 0, 0, 0.06)';
    g.fillRect(Math.round(r.range(W * CASING_PLAIN, W)), Math.round(r.range(nose, tail)), Math.round(r.range(2, 6)), Math.round(r.range(20, 90)));
  }
  // the warhead band: broad yellow, a thin one behind it
  g.fillStyle = '#e0a800';
  g.fillRect(0, nose + 6, W, 16);
  g.fillRect(0, nose + 28, W, 4);
  // seams around the body: a dark groove with the light catching its lip
  for (const z of [58, 20, -44, -96]) {
    const y = row(z);
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(0, y - 1, W, 2);
    g.fillStyle = 'rgba(255, 255, 255, 0.10)';
    g.fillRect(0, y + 1, W, 1);
  }
  // a seam along the body, opposite the fins' strip
  g.fillStyle = 'rgba(0, 0, 0, 0.4)';
  g.fillRect(W / 2 - 1, nose, 2, tail - nose);
  // the arming hatch: a panel with four screws, its word stenciled beside it
  const hx = Math.round(W * 0.5) + 14;
  const hy = row(-58);
  g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  g.lineWidth = 2;
  g.strokeRect(hx, hy, 36, 26);
  g.fillStyle = 'rgba(0, 0, 0, 0.5)';
  for (const [x, y] of [[4, 4], [30, 4], [4, 20], [30, 20]]) g.fillRect(hx + x, hy + y, 2, 2);
  g.fillStyle = 'rgba(225, 222, 205, 0.8)';
  g.font = 'bold 11px monospace';
  g.textBaseline = 'top';
  g.fillText('ARM', hx + 6, hy + 30);
  // the type and the lot along the body, twice around, so one side always shows it
  for (const u of [0.25, 0.75]) {
    g.save();
    g.translate(Math.round(W * u), row(10));
    g.rotate(Math.PI / 2);
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(225, 222, 205, 0.85)';
    g.font = 'bold 16px monospace';
    g.fillText('MK-IV ST-9', 0, -9);
    g.font = 'bold 11px monospace';
    g.fillText('LOT 2584-07  HE 60', 0, 9);
    g.restore();
  }
  // the tail: blued and sooted by the motor towards the nozzle
  const heat = g.createLinearGradient(0, row(-80), 0, H);
  heat.addColorStop(0, 'rgba(30, 28, 40, 0)');
  heat.addColorStop(0.5, 'rgba(36, 34, 58, 0.55)');
  heat.addColorStop(1, 'rgba(10, 9, 12, 0.9)');
  g.fillStyle = heat;
  g.fillRect(0, row(-80), W, H - row(-80));
  casing = toTexture(element);
  casing.anisotropy = 4;
  return casing;
}

let innards: Surface | null = null;

/**
 * The inside of a fighter's hull, as a torn piece shows it: frames and stringers in a grid
 * over panels of dull yellow-green primer, lightening holes in the frames, bundles of cable
 * along them, scorched in patches; rough and dull, a repeating tile like the plating's.
 */
export function wreckInnards(): Surface {
  if (innards) return innards;
  if (!drawable) return blankSurface();
  const r = new Randomizer(41);
  const { color, orm, bump } = blank({ roughness: 0.85, metalness: 0.35 });
  const g = color[1];
  const b = bump[1];
  g.fillStyle = '#7d7a48';
  g.fillRect(0, 0, SIZE, SIZE);
  // frames across, stringers along: raised in the bump, a darker bare metal in the color
  for (let p = 0; p < SIZE; p += 64) {
    g.fillStyle = '#4a4c48';
    g.fillRect(p, 0, 10, SIZE);
    g.fillRect(0, p, SIZE, 6);
    b.fillStyle = '#d0d0d0';
    b.fillRect(p, 0, 10, SIZE);
    b.fillRect(0, p, SIZE, 6);
    // lightening holes in the frame
    for (let q = 20; q < SIZE; q += 32) {
      g.fillStyle = '#1a1a18';
      g.beginPath();
      g.arc(p + 5, q, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // cable bundles along the stringers, a few colored jackets among the grey
  for (let p = 0; p < SIZE; p += 64) {
    for (let k = 0; k < 3; k++) {
      g.fillStyle = ['#2b2b2b', '#5a1d14', '#23324a'][k];
      g.fillRect(0, p + 10 + k * 3, SIZE, 2);
      b.fillStyle = '#b0b0b0';
      b.fillRect(0, p + 10 + k * 3, SIZE, 2);
    }
  }
  grime(r, g, 0.9);
  scratches(r, g, orm[1], 0.4);
  innards = textures(color[0], orm[0], bump[0]);
  return innards;
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
 * alike. `lengthwise` turns the surface on faces looking up or down so its u runs along z, as
 * on the flanks: a hull's strakes then run along it on its deck too. `readable` gives every face
 * the surface the right way round as seen from outside, upright on the flanks and the stern and
 * the nose ahead on top and below, so a stencil reads on either flank (the hulls' paint).
 */
export function boxUv(geometry: THREE.BufferGeometry, tile: number, layout: 'plain' | 'lengthwise' | 'readable' = 'plain'): THREE.BufferGeometry {
  const readable = layout === 'readable';
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = position.getX(i);
    const z = position.getZ(i);
    // which way a face looks along its axis, if it is to read the right way round
    const side = (axis: number) => (readable ? Math.sign(axis) : 1);
    const [u, v] =
      nx >= ny && nx >= nz
        ? [readable ? -Math.sign(normal.getX(i)) * z : z, position.getY(i)]
        : ny >= nz
          ? layout === 'lengthwise'
            ? [z, x]
            : [side(normal.getY(i)) * x, readable ? -z : z]
          : [side(normal.getZ(i)) * x, position.getY(i)];
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
