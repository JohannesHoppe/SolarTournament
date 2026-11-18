import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import { t } from '../i18n/i18n';
import { shownTint } from '../ship/tints';
import { cos, pow, sin } from '../detmath';

/** How fast the Sovereign's ring on the radar pulses (rad/s, a beat in about two seconds). */
const SOVEREIGN_PULSE = 3;

/** What the radar covers around the ship (units, 2.5 km). */
const RANGE = 50000;
/** Distances are shown compressed (the radar radius times (distance / RANGE) to this power), so the near space gets the room. */
const COMPRESSION = 0.6;
/** The radar is seen from above and behind the ship, tilted by this angle (rad). */
const TILT = 0.5;
/** The radar redraws this often (Hz): plenty for a glance, cheap on slow devices. */
const RATE = 20;
/** The radar's lettering, and the height of one of its lines (px). */
const FONT = '600 9px system-ui, sans-serif';
const LINE = 10;
const SIN_TILT = sin(TILT);
const COS_TILT = cos(TILT);
/** The rocks' stalks, and their dots: solid hulls bluish, rock and ice grey. */
const ROCK_STALK = 'rgba(150, 160, 180, 0.25)';
const ROCK_SOLID = 'rgba(140, 170, 220, 0.55)';
const ROCK_LOOSE = 'rgba(170, 160, 150, 0.5)';

const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

export interface RadarMark {
  position: THREE.Vector3;
  label: string;
  color: string;
}

/** Where a point lands on the radar (see Radar.project): its mark, its foot on the ship's horizontal plane, its distance (units) and how many px a unit is there. */
interface Projected {
  x: number;
  plane: number;
  y: number;
  distance: number;
  scale: number;
}
const p: Projected = { x: 0, plane: 0, y: 0, distance: 0, scale: 0 };

/**
 * The radar sphere in the corner: the own ship in its middle, everything around within 2.5 km
 * as the ship's own sensors see it, ahead at the top, behind at the bottom, each mark on a stalk
 * from the ship's horizontal plane, so above and below show too. Rocks and hulls show by their
 * size, the arena's massive body as a large disk, ships with their names, the next gate and the
 * field's center as marks. A solar storm leaves it blank.
 */
export class Radar {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private nextDraw = 0;
  private size = 0;
  /** The canvas's width on the page (CSS pixels); 0 while it is hidden. */
  private css = 0;
  /** The names written in this draw (x, y, width; px), reused from draw to draw. */
  private readonly written: number[] = [];
  /** The rocks' dots of this draw (x, y, radius in px, solid 1 or 0), reused from draw to draw. */
  private readonly dots: number[] = [];
  /** The sphere itself (see frame), drawn once for the canvas's size and the word AHEAD in the Host's language, and copied onto every draw. */
  private readonly backdrop = document.createElement('canvas');
  private readonly backdropCtx: CanvasRenderingContext2D;
  private backdropCss = 0;
  private backdropAhead = '';
  /** The draw's middle and radius (px), for project. */
  private center = 0;
  private radius = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.backdropCtx = this.backdrop.getContext('2d')!;
    // its size is told when it changes, not asked every draw (which would lay out the page mid-frame)
    new ResizeObserver(([entry]) => (this.css = entry.contentRect.width)).observe(canvas);
  }

  update(
    now: number,
    me: Ship,
    ships: readonly Ship[],
    field: AsteroidField,
    inSight: (ship: Ship) => boolean,
    marks: readonly RadarMark[],
    blind: boolean,
  ) {
    if (now < this.nextDraw) return;
    this.nextDraw = now + 1 / RATE;
    const ctx = this.ctx;
    const css = this.css;
    if (!css) return;
    const pixels = Math.round(css * Math.min(window.devicePixelRatio, 2));
    if (pixels !== this.size) {
      this.size = this.canvas.width = this.canvas.height = pixels;
    }
    const scale = pixels / css;
    const center = (this.center = css / 2);
    const radius = (this.radius = css / 2 - 14);
    const ahead = t('AHEAD');
    if (pixels !== this.backdrop.width || css !== this.backdropCss || ahead !== this.backdropAhead) {
      this.backdropCss = css;
      this.backdropAhead = ahead;
      this.backdrop.width = this.backdrop.height = pixels;
      this.frame(this.backdropCtx, scale, center, radius, ahead);
    }
    // the sphere copied over the last draw, which it replaces whole
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // one font for every word of the draw: setting it costs a parse, even to the same
    ctx.font = FONT;
    this.written.length = 0;
    if (blind) {
      // a storm: the sensors show static
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(160, 190, 255, ${Math.random() * 0.5})`;
        ctx.fillRect(center + (Math.random() - 0.5) * radius * 2, center + (Math.random() - 0.5) * radius * 2, 1.5, 1.5);
      }
      this.text(t('NO SIGNAL'),center, center + 4, 'rgba(255, 157, 0, 0.9)', 'center');
      return;
    }
    inverse.copy(me.flight.orientation).invert();
    const from = me.flight.position;

    // the big things first: the arena's massive body, rocks and hulls, as shapes of their size
    const well = field.well;
    if (well) {
      this.project(well.position, from);
      if (p.distance - well.radius < RANGE) {
        ctx.fillStyle = 'rgba(255, 120, 60, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(4, well.radius * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the rocks' stalks in one path under their dots, the dots one by one (each blends over the
    // ones before it), their color set only where it changes
    ctx.strokeStyle = ROCK_STALK;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    const dots = this.dots;
    dots.length = 0;
    ctx.beginPath();
    for (const rock of field.asteroids.values()) {
      this.project(rock.object.position, from);
      if (p.distance - rock.radius > RANGE) continue;
      ctx.moveTo(p.x, p.plane);
      ctx.lineTo(p.x, p.y);
      // near rocks would fill the sphere: a rock shows at most a sixth of its radius across
      dots.push(p.x, p.y, Math.max(1.5, Math.min(radius / 6, rock.meanRadius * p.scale)), rock.solid ? 1 : 0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    let solid = -1;
    for (let i = 0; i < dots.length; i += 4) {
      if (dots[i + 3] !== solid) {
        solid = dots[i + 3];
        ctx.fillStyle = solid ? ROCK_SOLID : ROCK_LOOSE;
      }
      ctx.beginPath();
      ctx.arc(dots[i], dots[i + 1], dots[i + 2], 0, Math.PI * 2);
      ctx.fill();
    }
    for (const mark of marks) {
      this.project(mark.position, from);
      this.stalk(p, mark.color);
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      this.label(mark.label, p.x + 6, p.y + 3, mark.color);
    }
    for (const ship of ships) {
      if (ship === me || !ship.alive || !inSight(ship)) continue;
      this.project(ship.flight.position, from);
      if (p.distance > RANGE) continue;
      const color = shownTint(ship);
      this.stalk(p, color);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      if (ship.trophy) {
        // a trophy's dot wears a slowly pulsing ring in its glow (the Sovereign's gold, the Magpie's shimmer), its side's color or not
        ctx.strokeStyle = ship.trophy.glow;
        ctx.globalAlpha = 0.6 + 0.4 * sin(now * SOVEREIGN_PULSE);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
        ctx.globalAlpha = 1;
      }
      this.label(ship.name, p.x + 6, p.y + 3, color);
    }
    // the own ship in the middle, its nose up
    ctx.fillStyle = '#4d91ff';
    ctx.beginPath();
    ctx.moveTo(center, center - 6);
    ctx.lineTo(center + 4, center + 4);
    ctx.lineTo(center - 4, center + 4);
    ctx.fill();
  }

  /** The sphere: its outline, the ship's horizontal plane and the line ahead. */
  private frame(ctx: CanvasRenderingContext2D, scale: number, center: number, radius: number, ahead: string) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = FONT;
    ctx.fillStyle = 'rgba(5, 9, 20, 0.55)';
    ctx.strokeStyle = 'rgba(77, 145, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(77, 145, 255, 0.3)';
    for (const share of [1, 0.5]) {
      ctx.beginPath();
      ctx.ellipse(center, center, radius * share, radius * share * SIN_TILT, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(center, center - radius * SIN_TILT);
    ctx.lineTo(center, center + radius * SIN_TILT);
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(77, 145, 255, 0.7)';
    ctx.fillText(ahead, center, center - radius * SIN_TILT - 4);
  }

  /** Where `world` lands on the radar of a ship at `from` (turned by `inverse`), into `p`. */
  private project(world: THREE.Vector3, from: THREE.Vector3) {
    local.copy(world).sub(from).applyQuaternion(inverse);
    const distance = local.length();
    const shown = pow(Math.min(distance, RANGE) / RANGE, COMPRESSION) * this.radius;
    if (distance > 1) local.multiplyScalar(shown / distance);
    // ahead (-z) goes up the screen, foreshortened by the tilt; height lifts the mark off the plane
    p.x = this.center + local.x;
    p.plane = this.center + local.z * SIN_TILT;
    p.y = p.plane - local.y * COS_TILT;
    p.distance = distance;
    p.scale = shown / Math.max(distance, 1);
  }

  /** A line from the ship's horizontal plane up or down to a mark. */
  private stalk(p: { x: number; plane: number; y: number }, color: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.plane);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** A mark's name, unless it would run into a name already written: the marks come first, then the ships, each keeps its dot either way. */
  private label(text: string, x: number, y: number, color: string) {
    const written = this.written;
    const width = this.ctx.measureText(text).width;
    for (let i = 0; i < written.length; i += 3) {
      if (x < written[i] + written[i + 2] && written[i] < x + width && Math.abs(y - written[i + 1]) < LINE) return;
    }
    written.push(x, y, width);
    this.text(text, x, y, color);
  }

  /** A word in the draw's font (FONT, set once in update). */
  private text(text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
    const ctx = this.ctx;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
