import * as THREE from 'three';
import { Randomizer } from '../random';
import { canvas, toTexture } from './textures';
import { cos, sin } from '../detmath';
import type { Surface } from './surfaces';

/**
 * The atlas the world ship's frozen dead wear (see world/derelict): a sheet of FROZEN_COLUMNS by
 * FROZEN_ROWS cells, each a tile of what a body is made of, all of it rimed with the frost that grew
 * on it in the vacuum: everyday cloth (white, the instance's color tints it), a work suit's coarse
 * cloth with a reflective band, skin the cold took, hair with ice crystals caught in it, an old EVA
 * suit's off-white panels, and a helmet's visor cracked from a point. Drawn once from a fixed seed,
 * on canvases (see view/surfaces for the hulls' surfaces); empty textures where nothing can be
 * drawn (the unit tests run in Node).
 */
export const FROZEN_CELLS = { cloth: 0, work: 1, skin: 2, hair: 3, suit: 4, visor: 5 } as const;
export type FrozenCell = keyof typeof FROZEN_CELLS;
const COLUMNS = 3;
const ROWS = 2;
/** A cell's size (px): a body's limb is some 20 cm across, a torso 40 cm, so a cell holds a part's whole face at a few millimetres a texel. */
const CELL = 128;

/** A color of the second map: roughness (green), metalness (blue). */
const orm = (roughness: number, metalness: number) => `rgb(255, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`;

type Pen = { color: CanvasRenderingContext2D; orm: CanvasRenderingContext2D; bump: CanvasRenderingContext2D; r: Randomizer; x: number; y: number };

/** Hoarfrost over a cell: `count` specks of ice, denser towards its edges where a fold or a seam held the frost, raised in the bump and smooth enough to glint in the sun. */
function hoarfrost(pen: Pen, count: number) {
  const { color, bump, r, x, y } = pen;
  const edge = (t: number) => (t < 0.5 ? t * t * 2 : 1 - (1 - t) * (1 - t) * 2);
  for (let i = 0; i < count; i++) {
    const px = x + edge(r.nextFloat()) * CELL;
    const py = y + edge(r.nextFloat()) * CELL;
    const size = r.range(0.6, 2.4);
    color.fillStyle = `rgba(232, 242, 255, ${r.range(0.45, 0.95).toFixed(2)})`;
    color.fillRect(px, py, size, size);
    pen.orm.fillStyle = orm(0.25, 0);
    pen.orm.fillRect(px, py, size, size);
    bump.fillStyle = '#c8c8c8';
    bump.fillRect(px, py, size, size);
  }
}

/** Woven cloth over a cell: threads both ways every `pitch` px, a few soft folds across. */
function weave(pen: Pen, pitch: number) {
  const { color, bump, r, x, y } = pen;
  color.fillStyle = 'rgba(0, 0, 0, 0.07)';
  bump.fillStyle = '#909090';
  for (let p = 0; p < CELL; p += pitch) {
    for (const g of [color, bump]) {
      g.fillRect(x + p, y, 1, CELL);
      g.fillRect(x, y + p, CELL, 1);
    }
  }
  for (let i = 0; i < 4; i++) {
    const at = r.range(0, CELL);
    const fold = color.createLinearGradient(x + at - 12, y, x + at + 12, y + CELL);
    fold.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fold.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
    fold.addColorStop(1, 'rgba(0, 0, 0, 0)');
    color.fillStyle = fold;
    color.fillRect(x, y, CELL, CELL);
  }
}

/** Blotches of `tone` over a cell, `count` of them `from` to `to` px across. */
function blotches(pen: Pen, tone: (alpha: string) => string, count: number, from: number, to: number) {
  const { color, r, x, y } = pen;
  for (let i = 0; i < count; i++) {
    color.fillStyle = tone(r.range(0.05, 0.16).toFixed(2));
    color.beginPath();
    color.arc(x + r.range(0, CELL), y + r.range(0, CELL), r.range(from, to), 0, Math.PI * 2);
    color.fill();
  }
}

/** Each cell's drawing, after its base tone, roughness and metalness. */
const CELLS: Record<FrozenCell, { tone: string; roughness: number; metalness?: number; draw: (pen: Pen) => void }> = {
  cloth: {
    tone: '#f2f2f2',
    roughness: 0.92,
    draw: (pen) => {
      weave(pen, 3);
      hoarfrost(pen, 260);
    },
  },
  work: {
    tone: '#ececec',
    roughness: 0.88,
    draw: (pen) => {
      const { color, x, y } = pen;
      weave(pen, 5);
      // the reflective band across the chest and the sleeves
      color.fillStyle = '#d8dde2';
      color.fillRect(x, y + 52, CELL, 14);
      pen.orm.fillStyle = orm(0.3, 0.2);
      pen.orm.fillRect(x, y + 52, CELL, 14);
      color.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      color.lineWidth = 1;
      color.setLineDash([3, 3]);
      for (const at of [20, 108]) {
        color.beginPath();
        color.moveTo(x + at, y);
        color.lineTo(x + at, y + CELL);
        color.stroke();
      }
      color.setLineDash([]);
      hoarfrost(pen, 220);
    },
  },
  skin: {
    tone: '#c4c9d3',
    roughness: 0.62,
    draw: (pen) => {
      blotches(pen, (alpha) => `rgba(70, 82, 118, ${alpha})`, 40, 4, 16);
      hoarfrost(pen, 180);
    },
  },
  hair: {
    tone: '#2b2420',
    roughness: 0.7,
    draw: (pen) => {
      const { color, bump, r, x, y } = pen;
      color.lineWidth = 1;
      for (let i = 0; i < 160; i++) {
        color.strokeStyle = r.nextFloat() < 0.5 ? 'rgba(10, 8, 6, 0.6)' : 'rgba(90, 74, 60, 0.5)';
        const sx = x + r.range(0, CELL);
        const sy = y + r.range(0, CELL);
        color.beginPath();
        color.moveTo(sx, sy);
        color.lineTo(sx + r.range(-6, 6), sy + r.range(10, 26));
        color.stroke();
      }
      // ice crystals caught in it: small white crosses that glint
      color.strokeStyle = 'rgba(235, 245, 255, 0.95)';
      for (let i = 0; i < 90; i++) {
        const cx = x + r.range(3, CELL - 3);
        const cy = y + r.range(3, CELL - 3);
        const arm = r.range(1, 3);
        color.beginPath();
        color.moveTo(cx - arm, cy);
        color.lineTo(cx + arm, cy);
        color.moveTo(cx, cy - arm);
        color.lineTo(cx, cy + arm);
        color.stroke();
        pen.orm.fillStyle = orm(0.12, 0);
        pen.orm.fillRect(cx - arm, cy - arm, arm * 2, arm * 2);
        bump.fillStyle = '#d0d0d0';
        bump.fillRect(cx - 1, cy - 1, 2, 2);
      }
    },
  },
  suit: {
    tone: '#d6d2c6',
    roughness: 0.75,
    draw: (pen) => {
      const { color, bump, x, y } = pen;
      // the panels' seams, sunk in the bump
      color.strokeStyle = 'rgba(40, 40, 40, 0.45)';
      bump.strokeStyle = '#5a5a5a';
      color.lineWidth = bump.lineWidth = 1.5;
      for (const at of [32, 80, 112]) {
        for (const g of [color, bump]) {
          g.beginPath();
          g.moveTo(x + at, y);
          g.lineTo(x + at, y + CELL);
          g.moveTo(x, y + at);
          g.lineTo(x + CELL, y + at);
          g.stroke();
        }
      }
      // a mission patch faded by centuries of sun
      color.fillStyle = 'rgba(190, 96, 40, 0.55)';
      color.fillRect(x + 44, y + 44, 22, 14);
      blotches(pen, (alpha) => `rgba(30, 26, 20, ${alpha})`, 10, 8, 30);
      hoarfrost(pen, 200);
    },
  },
  visor: {
    tone: '#0b1116',
    roughness: 0.06,
    metalness: 0.4,
    draw: (pen) => {
      const { color, r, x, y } = pen;
      const sheen = color.createLinearGradient(x, y, x + CELL, y + CELL);
      sheen.addColorStop(0, 'rgba(120, 150, 190, 0)');
      sheen.addColorStop(0.35, 'rgba(120, 150, 190, 0.35)');
      sheen.addColorStop(0.45, 'rgba(120, 150, 190, 0)');
      color.fillStyle = sheen;
      color.fillRect(x, y, CELL, CELL);
      // cracked from one point: jagged lines running out, rough where they run
      color.strokeStyle = 'rgba(220, 235, 255, 0.85)';
      pen.orm.strokeStyle = orm(0.5, 0);
      color.lineWidth = pen.orm.lineWidth = 1;
      for (let k = 0; k < 9; k++) {
        let px = x + 78;
        let py = y + 46;
        const heading = (k / 9) * Math.PI * 2 + r.range(-0.2, 0.2);
        for (const g of [color, pen.orm]) {
          g.beginPath();
          g.moveTo(px, py);
        }
        for (let s = 0; s < 6; s++) {
          const turn = heading + r.range(-0.5, 0.5);
          const step = r.range(5, 12);
          px += cos(turn) * step;
          py += sin(turn) * step;
          color.lineTo(px, py);
          pen.orm.lineTo(px, py);
        }
        color.stroke();
        pen.orm.stroke();
      }
      hoarfrost(pen, 120);
    },
  },
};

let frozen: Surface | null = null;

/** The frozen dead's atlas (see FROZEN_CELLS); texture coordinates pick a cell with frozenUv. */
export function frozenSurface(): Surface {
  if (frozen) return frozen;
  if (typeof document === 'undefined') return { map: new THREE.Texture(), orm: new THREE.Texture(), bump: new THREE.Texture() };
  const r = new Randomizer(1902);
  const [colorElement, color] = canvas(CELL * COLUMNS, CELL * ROWS);
  const [ormElement, ormContext] = canvas(CELL * COLUMNS, CELL * ROWS);
  const [bumpElement, bump] = canvas(CELL * COLUMNS, CELL * ROWS);
  for (const name of Object.keys(CELLS) as FrozenCell[]) {
    const cell = CELLS[name];
    const x = (FROZEN_CELLS[name] % COLUMNS) * CELL;
    const y = Math.floor(FROZEN_CELLS[name] / COLUMNS) * CELL;
    color.fillStyle = cell.tone;
    color.fillRect(x, y, CELL, CELL);
    ormContext.fillStyle = orm(cell.roughness, cell.metalness ?? 0);
    ormContext.fillRect(x, y, CELL, CELL);
    bump.fillStyle = '#808080';
    bump.fillRect(x, y, CELL, CELL);
    cell.draw({ color, orm: ormContext, bump, r, x, y });
  }
  frozen = { map: toTexture(colorElement), orm: new THREE.CanvasTexture(ormElement), bump: new THREE.CanvasTexture(bumpElement) };
  for (const texture of [frozen.map, frozen.orm, frozen.bump]) texture.anisotropy = 4;
  return frozen;
}

/** Texture coordinates of `geometry` (each face 0..1, as three's boxes and spheres have them) moved into `cell` of the atlas, a texel short of its edges. */
export function frozenUv(geometry: THREE.BufferGeometry, cell: FrozenCell): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const column = FROZEN_CELLS[cell] % COLUMNS;
  const row = Math.floor(FROZEN_CELLS[cell] / COLUMNS);
  const inset = 1 / CELL;
  for (let i = 0; i < uv.count; i++) {
    const u = inset + uv.getX(i) * (1 - 2 * inset);
    const v = inset + uv.getY(i) * (1 - 2 * inset);
    // the canvas's first row is the texture's top
    uv.setXY(i, (column + u) / COLUMNS, 1 - (row + 1 - v) / ROWS);
  }
  uv.needsUpdate = true;
  return geometry;
}
