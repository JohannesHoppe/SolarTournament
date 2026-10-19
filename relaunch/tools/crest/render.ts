/**
 * Draws the seal of the Ministry of War of the United Solar States into public/crest.svg.
 * The geometry is computed, so rings, stars and feathers sit exactly; the lettering is
 * Michroma turned into paths, so the seal looks the same wherever it is shown as an image.
 * Run with `npm run crest`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fontFile = readFileSync(join(root, 'public/assets/fonts/Michroma-Regular.ttf'));
const font = opentype.parse(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));

const ORANGE = '#ff9d00';
const DARK = '#0b0703';
const deg = (d: number) => (d * Math.PI) / 180;
const f = (n: number) => +n.toFixed(2);
const point = (r: number, angle: number, cx = 0, cy = 0): [number, number] => [f(cx + r * Math.cos(deg(angle))), f(cy + r * Math.sin(deg(angle)))];
const poly = (points: [number, number][]) => 'M ' + points.map(([x, y]) => `${x} ${y}`).join(' L ') + ' Z';

/** A five-pointed star; angle 0 points up. */
function star(cx: number, cy: number, outer: number, inner = outer * 0.4, rotation = 0) {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) points.push(point(i % 2 ? inner : outer, -90 + rotation + i * 36, cx, cy));
  return `<path d="${poly(points)}" fill="${ORANGE}"/>`;
}

/**
 * Lettering on a circle. On top the letters stand on the circle and read clockwise; at the
 * bottom they hang from it and read counter-clockwise, so both read left to right.
 */
function arcText(text: string, radius: number, size: number, spacing: number, bottom: boolean) {
  const widths = [...text].map((c) => font.getAdvanceWidth(c, size) + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const span = (total / radius) * (180 / Math.PI);
  let angle = bottom ? 90 + span / 2 : -90 - span / 2;
  const glyphs: string[] = [];
  [...text].forEach((c, i) => {
    const half = ((widths[i] - spacing) / 2 / radius) * (180 / Math.PI);
    const center = bottom ? angle - half : angle + half;
    const [x, y] = point(radius, center);
    const path = font.getPath(c, -(widths[i] - spacing) / 2, 0, size).toPathData(2);
    const rotation = bottom ? center - 90 : center + 90;
    if (path) glyphs.push(`<path transform="translate(${x} ${y}) rotate(${f(rotation)})" d="${path}"/>`);
    angle += (bottom ? -1 : 1) * (widths[i] / radius) * (180 / Math.PI);
  });
  // Michroma has one weight only; an outline in the same color makes it bold
  return `<g fill="${ORANGE}" stroke="${ORANGE}" stroke-width="${BOLD}" stroke-linejoin="miter">${glyphs.join('')}</g>`;
}

/** Stroke that thickens the lettering of the rings. */
const BOLD = 1.3;

/**
 * Lettering along a quadratic curve from p0 over control point c to p1, centered on it
 * vertically, every letter turned with the curve: the motto bends with its ribbon.
 */
function curveText(content: string, p0: [number, number], c: [number, number], p1: [number, number], size: number, spacing: number) {
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
  ];
  // arc length table of the curve
  const samples = 400;
  const table: { t: number; length: number }[] = [{ t: 0, length: 0 }];
  for (let i = 1; i <= samples; i++) {
    const [ax, ay] = at((i - 1) / samples);
    const [bx, by] = at(i / samples);
    table.push({ t: i / samples, length: table[i - 1].length + Math.hypot(bx - ax, by - ay) });
  }
  const curveLength = table[samples].length;
  const tAt = (length: number) => table.find((entry) => entry.length >= length)?.t ?? 1;
  const widths = [...content].map((ch) => font.getAdvanceWidth(ch, size) + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const cap = -font.getPath('H', 0, 0, size).getBoundingBox().y1;
  let position = (curveLength - total) / 2;
  const glyphs = [...content].map((ch, i) => {
    const t = tAt(position + (widths[i] - spacing) / 2);
    const [x, y] = at(t);
    const [nx, ny] = at(Math.min(1, t + 0.001));
    const [px, py] = at(Math.max(0, t - 0.001));
    const angle = (Math.atan2(ny - py, nx - px) * 180) / Math.PI;
    position += widths[i];
    const d = font.getPath(ch, -(widths[i] - spacing) / 2, cap / 2, size).toPathData(2);
    return d ? `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})" d="${d}"/>` : '';
  });
  return `<g fill="${ORANGE}">${glyphs.join('')}</g>`;
}

/** Straight lettering, centered. */
function text(content: string, y: number, size: number, spacing: number, fill = ORANGE) {
  const widths = [...content].map((c) => font.getAdvanceWidth(c, size) + spacing);
  let x = -(widths.reduce((a, b) => a + b, 0) - spacing) / 2;
  const glyphs = [...content].map((c, i) => {
    const d = font.getPath(c, x, y, size).toPathData(2);
    x += widths[i];
    return d;
  });
  return `<path fill="${fill}" d="${glyphs.join(' ')}"/>`;
}

// ---- rings --------------------------------------------------------------------------------

const rings = [
  `<circle r="294" fill="${DARK}" stroke="${ORANGE}" stroke-width="7"/>`,
  `<circle r="283" stroke="${ORANGE}" stroke-width="1.6"/>`,
  `<circle r="211" stroke="${ORANGE}" stroke-width="2.8"/>`,
  `<circle r="204" stroke="${ORANGE}" stroke-width="1"/>`,
];
// an engraved border of beads just inside the outer ring
const beads = Array.from({ length: 96 }, (_, i) => {
  const [x, y] = point(276, i * 3.75);
  return `<circle cx="${x}" cy="${y}" r="1.7" fill="${ORANGE}"/>`;
}).join('');

// lettering band between the inner ring (212) and the beads (274): both lines in one size,
// optically centered in the band, the letters standing on top and hanging below
const LETTER_SIZE = 23;
const BAND_MIDDLE = 243;
const capHeight = -font.getPath('H', 0, 0, LETTER_SIZE).getBoundingBox().y1;
const lettering = [
  arcText('MINISTRY OF WAR', BAND_MIDDLE - capHeight / 2, LETTER_SIZE, 8, false),
  arcText('UNITED SOLAR STATES', BAND_MIDDLE + capHeight / 2, LETTER_SIZE, 5, true),
  star(...point(BAND_MIDDLE, 180), 11, 4.4, -90),
  star(...point(BAND_MIDDLE, 0), 11, 4.4, 90),
];

/** Tolerance for the eagle's facets, in units of its drawing: larger means fewer, harder edges. */
const EAGLE_FACET = 9;

// ---- the field: a sun with rays, and a star for every planet plus one for the belt -----------

const SUN: [number, number] = [0, -58];
const rays = Array.from({ length: 36 }, (_, i) => {
  const angle = i * 10;
  const long = i % 2 === 0;
  const a = point(96, angle - 3, ...SUN);
  const b = point(long ? 260 : 190, angle, ...SUN);
  const c = point(96, angle + 3, ...SUN);
  return `<path d="${poly([a, b, c])}" fill="${ORANGE}" opacity="${long ? 0.62 : 0.34}"/>`;
}).join('');
const sun = `<circle cx="${SUN[0]}" cy="${SUN[1]}" r="92" fill="url(#sun)"/><circle cx="${SUN[0]}" cy="${SUN[1]}" r="92" stroke="${ORANGE}" stroke-width="2"/>`;
/** Eight planets and the asteroid belt: nine stars in an even arc over the eagle. */
const PLANET_STARS = 9;
const constellation = Array.from({ length: PLANET_STARS }, (_, i) => {
  const [x, y] = point(178, -90 - 60 + (i * 120) / (PLANET_STARS - 1));
  return star(x, y, i === Math.floor(PLANET_STARS / 2) ? 9 : 7);
}).join('');

// ---- the eagle: a free heraldic drawing (see tools/crest/eagle.svg and its license) ----------

/** The outlines of an SVG path as polygons: every segment is reduced to its end point. */
function polygons(d: string): [number, number][][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const shapes: [number, number][][] = [];
  let current: [number, number][] = [];
  let x = 0, y = 0, startX = 0, startY = 0, command = '';
  let lastControl: [number, number] = [0, 0];
  const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let i = 0;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const lower = command.toLowerCase();
    if (lower === 'z') {
      if (current.length) shapes.push(current);
      current = [];
      x = startX;
      y = startY;
      continue;
    }
    const args = tokens.slice(i, i + arity[lower]).map(Number);
    i += arity[lower];
    const relative = command === lower;
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    if (lower === 'h') x = relative ? x + args[0] : args[0];
    else if (lower === 'v') y = relative ? y + args[0] : args[0];
    else {
      const [ex, ey] = args.slice(-2);
      // curves are sampled, so their shape survives; the simplification cuts them into facets afterwards
      if (lower === 'c' || lower === 's' || lower === 'q') {
        const end: [number, number] = [ox + ex, oy + ey];
        const c2: [number, number] = lower === 'q' ? [ox + args[0], oy + args[1]] : [ox + args[args.length - 4], oy + args[args.length - 3]];
        const c1: [number, number] = lower === 'c' ? [ox + args[0], oy + args[1]] : lower === 'q' ? c2 : [2 * x - lastControl[0], 2 * y - lastControl[1]];
        for (let k = 1; k < 8; k++) {
          const t = k / 8;
          const u = 1 - t;
          current.push([
            u * u * u * x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
            u * u * u * y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
          ]);
        }
        lastControl = c2;
      }
      x = relative ? x + ex : ex;
      y = relative ? y + ey : ey;
    }
    if (lower !== 'c' && lower !== 's') lastControl = [x, y];
    if (lower === 'm') {
      if (current.length) shapes.push(current);
      current = [];
      startX = x;
      startY = y;
      // further coordinate pairs after a move are lines
      command = relative ? 'l' : 'L';
    }
    current.push([x, y]);
  }
  if (current.length) shapes.push(current);
  return shapes;
}

/** Ramer–Douglas–Peucker: drops the points that deviate less than epsilon, leaving hard facets. */
function simplify(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
    if (distance > worst) {
      worst = distance;
      index = i;
    }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplify(points.slice(index), epsilon)];
}

/** The eagle made angular: straight facets instead of curves, a techno eagle. */
function facet(d: string, epsilon: number): string {
  return polygons(d)
    .map((shape) => {
      // a closed outline starts and ends in the same point: simplify its two halves, split at the point farthest from the start
      const [sx, sy] = shape[0];
      let far = 0;
      shape.forEach(([x, y], i) => {
        if (Math.hypot(x - sx, y - sy) > Math.hypot(shape[far][0] - sx, shape[far][1] - sy)) far = i;
      });
      const closed = [...simplify(shape.slice(0, far + 1), epsilon).slice(0, -1), ...simplify([...shape.slice(far), shape[0]], epsilon).slice(0, -1)];
      return closed.length > 2 ? poly(closed.map(([x, y]) => [f(x), f(y)])) : '';
    })
    .join(' ');
}

/**
 * The eagle's drawing, recolored: a dark silhouette with an orange outline before the sun, like
 * an eclipse. Placed and scaled into the field.
 */
function eagle(): string {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'eagle.svg');
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1].split(/[\s,]+/).map(Number) ?? [0, 0, 100, 100];
  // every outline of the drawing, cut into straight facets
  const inner = [...source.matchAll(/\sd="([^"]+)"/g)].map((m) => `<path d="${facet(m[1], EAGLE_FACET)}"/>`).join('');
  const [vx, vy, vw, vh] = viewBox;
  const size = 262;
  const scale = size / Math.max(vw, vh);
  return `<g transform="translate(${f(-(vw * scale) / 2)} ${f(-(vh * scale) / 2 - 26)}) scale(${f(scale)}) translate(${-vx} ${-vy})" fill="${DARK}" stroke="${ORANGE}" stroke-width="${f(3 / scale)}">${inner}</g>`;
}

// ---- the ribbon, laid across the inner ring --------------------------------------------------

const ribbon = [
  `<path d="M -128 142 L -152 146 L -141 157 L -152 170 L -124 166 Z" fill="${DARK}" stroke="${ORANGE}" stroke-width="2.4"/>`,
  `<path d="M 128 142 L 152 146 L 141 157 L 152 170 L 124 166 Z" fill="${DARK}" stroke="${ORANGE}" stroke-width="2.4"/>`,
  `<path d="M -132 138 Q 0 102 132 138 L 132 166 Q 0 130 -132 166 Z" fill="${DARK}" stroke="${ORANGE}" stroke-width="2.6"/>`,
  curveText('PRESIDENTIAL GAMES', [-132, 152], [0, 116], [132, 152], 12, 2),
].join('');
const year = text('MMDLXXXIV', 184, 10, 5);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-300 -300 600 600" fill="none" stroke-linejoin="round">
<title>Seal of the Ministry of War of the United Solar States</title>
<defs>
<radialGradient id="sun"><stop offset="0" stop-color="#ffe2a8"/><stop offset="0.55" stop-color="${ORANGE}"/><stop offset="1" stop-color="#e2541b"/></radialGradient>
<clipPath id="field"><circle r="203"/></clipPath>
</defs>
${rings.join('\n')}
${beads}
${lettering.join('\n')}
<g clip-path="url(#field)">
${rays}
${sun}
${constellation}
${eagle()}
${year}
</g>
${ribbon}
</svg>
`;

writeFileSync(join(root, 'public/crest.svg'), svg);
console.log(`crest.svg: ${(svg.length / 1024).toFixed(0)} KB`);
