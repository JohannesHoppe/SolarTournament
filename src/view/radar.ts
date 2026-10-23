import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import type { Ship } from '../ship/ship';
import { t } from '../i18n/i18n';

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

const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

export interface RadarMark {
  position: THREE.Vector3;
  label: string;
  color: string;
}

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
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
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, css, css);
    const center = css / 2;
    const radius = css / 2 - 14;
    this.written.length = 0;
    this.frame(center, radius);
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
    const project = (world: THREE.Vector3) => {
      local.copy(world).sub(me.flight.position).applyQuaternion(inverse);
      const distance = local.length();
      const shown = (Math.min(distance, RANGE) / RANGE) ** COMPRESSION * radius;
      if (distance > 1) local.multiplyScalar(shown / distance);
      // ahead (-z) goes up the screen, foreshortened by the tilt; height lifts the mark off the plane
      const x = center + local.x;
      const plane = center + local.z * Math.sin(TILT);
      return { x, plane, y: plane - local.y * Math.cos(TILT), distance, scale: shown / Math.max(distance, 1) };
    };

    // the big things first: the arena's massive body, rocks and hulls, as shapes of their size
    const well = field.well;
    if (well) {
      const p = project(well.position);
      if (p.distance - well.radius < RANGE) {
        ctx.fillStyle = 'rgba(255, 120, 60, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(4, well.radius * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const rock of field.asteroids.values()) {
      const p = project(rock.object.position);
      if (p.distance - rock.radius > RANGE) continue;
      this.stalk(p, 'rgba(150, 160, 180, 0.25)');
      ctx.fillStyle = rock.solid ? 'rgba(140, 170, 220, 0.55)' : 'rgba(170, 160, 150, 0.5)';
      ctx.beginPath();
      // near rocks would fill the sphere: a rock shows at most a sixth of its radius across
      ctx.arc(p.x, p.y, Math.max(1.5, Math.min(radius / 6, rock.meanRadius * p.scale)), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const mark of marks) {
      const p = project(mark.position);
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
      const p = project(ship.flight.position);
      if (p.distance > RANGE) continue;
      const color = ship.kind === 'bot' ? '#ffb347' : '#ff6a8a';
      this.stalk(p, color);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
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
  private frame(center: number, radius: number) {
    const ctx = this.ctx;
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
      ctx.ellipse(center, center, radius * share, radius * share * Math.sin(TILT), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(center, center - radius * Math.sin(TILT));
    ctx.lineTo(center, center + radius * Math.sin(TILT));
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.stroke();
    this.text(t('AHEAD'),center, center - radius * Math.sin(TILT) - 4, 'rgba(77, 145, 255, 0.7)', 'center');
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
    this.ctx.font = FONT;
    const width = this.ctx.measureText(text).width;
    for (let i = 0; i < written.length; i += 3) {
      if (x < written[i] + written[i + 2] && written[i] < x + width && Math.abs(y - written[i + 1]) < LINE) return;
    }
    written.push(x, y, width);
    this.text(text, x, y, color);
  }

  private text(text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
    const ctx = this.ctx;
    ctx.font = FONT;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
