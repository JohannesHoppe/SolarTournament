import * as THREE from 'three';
import { footOf, PLANE_UP, skyPointer } from '../world/reference';
import { Overlay } from './overlay';
import { atan2, cos, hypot, sin } from '../detmath';
import { t } from '../i18n/i18n';

/**
 * The flight computer keeps the ship upright to the arena (its north pole is up), and the
 * projection shows it the way a fighter's head-up display does: a horizon line through the
 * view where the reference plane lies (see world/reference; in a planet's air the planet's own
 * horizon, bold, see AIR_HORIZON_HALF), a pitch ladder every PITCH_STEP
 * degrees above and below it, a bank scale over the ladder and a heading tape above the gauges.
 * All of it in the projection's blue, faint, and broken in the middle so the crosshair stays
 * free. A rung lies where that elevation really is in the picture, so it bends with the view.
 */
const PITCH_STEP = 10;
/** Rungs are drawn within this share of the picture's height from its middle, so the ladder stays out of the gauges and the panel. */
const LADDER_REACH = 0.32;
/** Half the length of the horizon and of a rung (share of the picture's width), and the gap the crosshair keeps (px). */
const HORIZON_HALF = 0.2;
const RUNG_HALF = 0.07;
const GAP = 46;
/** The heading tape: degrees across its width, a tick every TICK degrees and a number every LABEL. */
const TAPE_SPAN = 90;
const TICK = 5;
const LABEL = 30;
/** The tape's line, this far above the picture's bottom (px), just over the gauges (the round's panel holds the top), and half its width (share of the picture's width). */
const TAPE_ABOVE = 92;
const TAPE_HALF = 0.17;
/** The projection's blue (see --hud in style.css), and a dark hairline under it for a sunlit background. */
const LINE = 'rgba(77, 145, 255, 0.55)';
const LINE_STRONG = 'rgba(120, 175, 255, 0.85)';
const SHADE = 'rgba(2, 3, 10, 0.55)';
/**
 * In a planet's air (see world/air, IN_AIR_TOP), where haze and cloud hide every horizon, the
 * horizon is the planet's (square to the way away from its center) and drawn bold: across
 * AIR_HORIZON_HALF of the picture's width to either side, AIR_HORIZON_WIDTH thick (px), in
 * AIR_LINE, over a broader dark shade, so which way is up reads at a glance in any cloud. It is
 * the artificial horizon, the level, dashed (AIR_DASH, px) and named "Level", so it is never
 * taken for the clouds' curved edge, the visible horizon the Host sees over the deck.
 */
const AIR_DASH = [18, 10];
const AIR_HORIZON_HALF = 0.46;
const AIR_HORIZON_WIDTH = 3.5;
const AIR_LINE = 'rgba(170, 205, 255, 0.95)';
const AIR_SHADE = 'rgba(2, 3, 10, 0.6)';
/**
 * How far from the camera a direction is looked up (units, 50 m): a point that far from the
 * camera along a direction sits in the picture where the direction does, between the camera's
 * near and far planes.
 */
const FAR = 1000;
/** How far a rung's end bends towards the horizon (px), and the dash of the rungs below it. */
const BEND = 6;
const DASHED = [6, 5];
const SOLID: number[] = [];
/**
 * The bank scale over the ladder: an arc around the picture's middle, BANK_ABOVE (px) beyond the
 * ladder's reach, with ticks at BANK_TICKS (degrees to either side; the long ones at 0 and 30)
 * and the sky pointer, a small triangle on the arc that points where the plane's up lies on
 * screen, so it swings against the bank as a fighter's does. Past BANK_SPAN it rests at the
 * scale's end.
 */
const BANK_ABOVE = 22;
const BANK_TICKS = [0, 10, 20, 30, 45];
const BANK_SPAN = 50;
/** The rungs' numbers, written once: 0, 10, 20 … 90. */
const LABELS = Array.from({ length: 90 / PITCH_STEP + 1 }, (_, i) => String(i * PITCH_STEP));
/** The tape's numbers, written once: 000 … 359. */
const HEADINGS = Array.from({ length: 360 }, (_, i) => String(i).padStart(3, '0'));

const forward = new THREE.Vector3();
const level = new THREE.Vector3();
const side = new THREE.Vector3();
const direction = new THREE.Vector3();
const at = new THREE.Vector3();
const beside = new THREE.Vector3();

export class Attitude extends Overlay {
  private drawn = false;
  /** What the picture on the canvas was drawn for: the camera's turn and lens, and the tape shown or not (see update). */
  private readonly drawnTurn = new THREE.Quaternion();
  private readonly drawnLens = [0, 0];
  private drawnTape = false;
  /** The up it was drawn for: a planet's (see update), or the reference plane's while `drawnAir` is false. */
  private readonly drawnUp = new THREE.Vector3();
  private drawnAir = false;
  /** The up this picture refers to. */
  private readonly up = new THREE.Vector3();
  private air = false;

  protected resized() {
    this.drawn = false;
  }

  /**
   * Draws the attitude for the camera; `show` false clears it. The heading tape only where
   * `tape` (not on a phone, whose top row holds its buttons). What it draws depends only on how
   * the camera is turned and its lens (every line is a direction, wherever the camera stands),
   * so while neither changed the picture on the canvas stays as it is. `sky`, in a planet's air,
   * is the planet's up there (see world/air, upIn): the horizon, the ladder and the sky pointer
   * then refer to it, and the horizon is drawn bold; null, they refer to the reference plane.
   */
  update(camera: THREE.Camera, show: boolean, tape: boolean, sky: Readonly<THREE.Vector3> | null = null) {
    const context = this.context;
    if (!show) {
      if (this.drawn) context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawn = false;
      return;
    }
    const lens = camera.projectionMatrix.elements;
    const air = sky !== null;
    const sameUp = air === this.drawnAir && (!air || this.drawnUp.equals(sky));
    if (this.drawn && sameUp && tape === this.drawnTape && camera.quaternion.equals(this.drawnTurn) && lens[0] === this.drawnLens[0] && lens[5] === this.drawnLens[1]) return;
    this.drawn = true;
    this.drawnTape = tape;
    this.drawnTurn.copy(camera.quaternion);
    this.drawnLens[0] = lens[0];
    this.drawnLens[1] = lens[5];
    this.drawnAir = air;
    if (air) this.drawnUp.copy(sky);
    this.air = air;
    this.up.copy(sky ?? PLANE_UP);
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    camera.getWorldDirection(forward);
    // the horizon is the reference plane's, or in a planet's air the planet's, seen from the camera (see world/reference)
    footOf(forward, level, this.up);
    // straight up or down there is no heading to keep a horizon by
    if (level.lengthSq() < 1e-6) return;
    level.normalize();
    side.crossVectors(level, this.up);
    context.lineWidth = 1.5;
    context.font = '11px ui-monospace, Menlo, Consolas, monospace';
    for (let pitch = -90; pitch <= 90; pitch += PITCH_STEP) this.rung(camera, pitch);
    if (tape) {
      this.tape(atan2(forward.x, -forward.z));
      this.bank(skyPointer(camera.quaternion, this.up));
    }
  }

  /** The horizon (pitch 0) or a rung of the ladder, where that elevation lies ahead in the picture. */
  private rung(camera: THREE.Camera, pitch: number) {
    const angle = THREE.MathUtils.degToRad(pitch);
    direction.copy(level).multiplyScalar(cos(angle)).addScaledVector(this.up, sin(angle));
    at.copy(camera.position).addScaledVector(direction, FAR).project(camera);
    if (at.z > 1) return;
    const x = ((at.x + 1) / 2) * this.width;
    const y = ((1 - at.y) / 2) * this.height;
    // in the air the horizon shows anywhere in the picture, so a dive still sees it above
    const reach = pitch === 0 && this.air ? 0.5 : LADDER_REACH;
    if (Math.abs(y - this.height / 2) > this.height * reach || x < 0 || x > this.width) return;
    // the rung runs along the horizon as the picture shows it (the view may roll in a steep climb)
    beside.copy(camera.position).addScaledVector(direction, FAR).addScaledVector(side, FAR * 0.05).project(camera);
    let dx = ((beside.x + 1) / 2) * this.width - x;
    let dy = ((1 - beside.y) / 2) * this.height - y;
    const length = hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const bold = pitch === 0 && this.air;
    const half = (bold ? AIR_HORIZON_HALF : pitch === 0 ? HORIZON_HALF : RUNG_HALF) * this.width;
    const context = this.context;
    // below the horizon the rungs are dashed, as on every flight instrument
    context.setLineDash(pitch < 0 ? DASHED : SOLID);
    // a dark hairline under the line, then the line itself; in the air the horizon bold over a broad shade
    if (bold) {
      // dashed, and named: it is the level, not the clouds' curved edge the Host sees
      context.setLineDash(AIR_DASH);
      context.lineWidth = AIR_HORIZON_WIDTH + 3;
      this.stroke(x, y, dx, dy, half, pitch, AIR_SHADE);
      context.lineWidth = AIR_HORIZON_WIDTH;
      this.stroke(x, y, dx, dy, half, pitch, AIR_LINE);
      context.lineWidth = 1.5;
      context.fillStyle = AIR_LINE;
      context.textAlign = 'left';
      // at its left end, clear of the radar at the right, just above it (square to the line on the screen)
      context.fillText(t('Level'), x - dx * half + dy * 10, y - dy * half - dx * 10);
    } else {
      this.stroke(x + 1, y + 1, dx, dy, half, pitch, SHADE);
      this.stroke(x, y, dx, dy, half, pitch, pitch === 0 ? LINE_STRONG : LINE);
    }
    context.setLineDash(SOLID);
    if (pitch !== 0) {
      context.fillStyle = LINE;
      context.textAlign = 'left';
      context.fillText(LABELS[Math.abs(pitch) / PITCH_STEP], x + dx * (half + 6), y + dy * (half + 6) + 4);
    }
  }

  /** Both halves of a rung around (x, y), along (dx, dy), broken by the gap in the middle; a rung's ends bend towards the horizon, so they say which way level is. */
  private stroke(x: number, y: number, dx: number, dy: number, half: number, pitch: number, color: string) {
    const context = this.context;
    // square to the rung on the screen, towards the horizon
    const bendX = -dy * BEND * Math.sign(pitch);
    const bendY = dx * BEND * Math.sign(pitch);
    context.strokeStyle = color;
    context.beginPath();
    for (let sign = -1; sign <= 1; sign += 2) {
      const endX = x + sign * dx * half;
      const endY = y + sign * dy * half;
      context.moveTo(x + sign * dx * GAP, y + sign * dy * GAP);
      context.lineTo(endX, endY);
      if (pitch !== 0) context.lineTo(endX + bendX, endY + bendY);
    }
    context.stroke();
  }

  /** The bank scale and its sky pointer at `sky` (rad from the top, see skyPointer); without a bank (NaN) only the scale. */
  private bank(sky: number) {
    const context = this.context;
    const x = this.width / 2;
    const y = this.height / 2;
    const radius = this.height * LADDER_REACH + BANK_ABOVE;
    context.strokeStyle = LINE;
    context.beginPath();
    for (const degrees of BANK_TICKS) {
      const long = degrees === 0 || degrees === 30 ? 9 : 5;
      for (let sign = -1; sign <= (degrees ? 1 : -1); sign += 2) {
        const angle = THREE.MathUtils.degToRad(degrees * sign);
        const sinA = sin(angle);
        const cosA = cos(angle);
        context.moveTo(x + sinA * radius, y - cosA * radius);
        context.lineTo(x + sinA * (radius + long), y - cosA * (radius + long));
      }
    }
    context.stroke();
    if (Number.isNaN(sky)) return;
    const angle = THREE.MathUtils.clamp(sky, -THREE.MathUtils.degToRad(BANK_SPAN), THREE.MathUtils.degToRad(BANK_SPAN));
    const sinA = sin(angle);
    const cosA = cos(angle);
    // a triangle inside the arc, its tip on it
    const tipX = x + sinA * (radius - 1);
    const tipY = y - cosA * (radius - 1);
    const baseX = x + sinA * (radius - 9);
    const baseY = y - cosA * (radius - 9);
    context.fillStyle = LINE_STRONG;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(baseX + cosA * 5, baseY + sinA * 5);
    context.lineTo(baseX - cosA * 5, baseY - sinA * 5);
    context.closePath();
    context.fill();
  }

  /** The heading tape: the degrees around the arena's north pole, with the nose's heading in a box. */
  private tape(heading: number) {
    const context = this.context;
    const center = this.width / 2;
    const half = this.width * TAPE_HALF;
    const degrees = ((THREE.MathUtils.radToDeg(heading) % 360) + 360) % 360;
    const scale = half / (TAPE_SPAN / 2);
    const top = this.height - TAPE_ABOVE;
    context.strokeStyle = LINE;
    context.fillStyle = LINE;
    context.textAlign = 'center';
    context.beginPath();
    const first = Math.ceil((degrees - TAPE_SPAN / 2) / TICK) * TICK;
    for (let tick = first; tick <= degrees + TAPE_SPAN / 2; tick += TICK) {
      const x = center + (tick - degrees) * scale;
      const labeled = ((tick % LABEL) + LABEL) % LABEL === 0;
      context.moveTo(x, top);
      context.lineTo(x, top + (labeled ? 8 : 4));
      if (labeled) context.fillText(HEADINGS[((tick % 360) + 360) % 360], x, top + 20);
    }
    context.stroke();
    // the nose's heading in a box over the tape
    context.strokeStyle = LINE_STRONG;
    context.strokeRect(center - 18, top - 18, 36, 14);
    context.fillStyle = LINE_STRONG;
    context.fillText(HEADINGS[Math.round(degrees) % 360], center, top - 7);
  }
}
