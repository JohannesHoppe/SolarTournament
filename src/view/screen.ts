/**
 * Where the HUD's marks land on screen, as plain geometry with no page behind it: a point held
 * on the frame when it lies off screen, the edge an arrow sits at, a free box for a name beside
 * it, the line between two marks, and when the aids of free drift show (see Hud). Pixels are CSS
 * pixels from the screen's top left.
 */

/** The edge of the screen an arrow sits at. */
export const enum Side {
  Right,
  Left,
  Top,
  Bottom,
}

/** A point on the frame (see toFrame), reused by its caller. */
export interface FramePoint {
  /** Where on screen (px). */
  x: number;
  y: number;
  /** Off screen or behind: held on the frame. */
  offscreen: boolean;
  /** The angle an arrow there points out at (rad, clockwise from the right as the screen's y runs down). */
  angle: number;
}

/**
 * Where a point projected to the screen (`x`, `y` in -1..1 across, `behind` the camera) sits:
 * at its place, or off screen and behind on the frame within `edgeX` and `edgeY` of the middle
 * (shares of half the screen), where the line from the middle to it leaves that frame. A point
 * behind the camera is mirrored first, so its arrow points the way to turn.
 */
export function toFrame(x: number, y: number, behind: boolean, edgeX: number, edgeY: number, width: number, height: number, out: FramePoint): FramePoint {
  if (behind) {
    x = -x;
    y = -y;
  }
  const offscreen = behind || Math.abs(x) > edgeX || Math.abs(y) > edgeY;
  if (offscreen) {
    // points behind the camera always sit on the edge
    const scale = 1 / Math.max(Math.abs(x) / edgeX, Math.abs(y) / edgeY, 1e-6);
    x *= scale;
    y *= scale;
  }
  out.x = ((x + 1) / 2) * width;
  out.y = ((1 - y) / 2) * height;
  out.offscreen = offscreen;
  out.angle = Math.atan2(-y, x);
  return out;
}

/** The edge an arrow at (x, y) on the frame of `edgeX`, `edgeY` sits at: where the point, as a share of the frame, reaches farthest. */
export function sideOf(x: number, y: number, edgeX: number, edgeY: number, width: number, height: number): Side {
  const across = ((x / width) * 2 - 1) / edgeX;
  const up = (1 - (y / height) * 2) / edgeY;
  return Math.abs(across) >= Math.abs(up) ? (across > 0 ? Side.Right : Side.Left) : up > 0 ? Side.Top : Side.Bottom;
}

/** Whether a box overlaps one of the boxes (left, top, right, bottom; px, flat). */
export function hits(boxes: readonly number[], left: number, top: number, right: number, bottom: number): boolean {
  for (let i = 0; i < boxes.length; i += 4) if (left < boxes[i + 2] && boxes[i] < right && top < boxes[i + 3] && boxes[i + 1] < bottom) return true;
  return false;
}

/** How a name is placed beside an arrow at the screen's edge (px; see findTag). */
export interface TagRoom {
  /** How far the name keeps from its arrow's point, and from the screen's edge. */
  gap: number;
  margin: number;
  /** Steps along the edge each way it tries before it is left out. */
  tries: number;
}

/**
 * A free box of `w` × `h` for a name beside an arrow at (`left`, `top`) on `side`: inward of
 * the arrow, or a line or a step along the edge where that is taken, kept on screen and clear of
 * the `blocked` boxes. Writes its top left into `out` and says whether one was found.
 */
export function findTag(blocked: readonly number[], left: number, top: number, side: Side, w: number, h: number, width: number, height: number, room: TagRoom, out: { x: number; y: number }): boolean {
  const upright = side === Side.Left || side === Side.Right;
  const along = upright ? h + 2 : w / 2 + 8;
  for (let k = 0; k <= 2 * room.tries; k++) {
    const step = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * along;
    let x: number;
    let y: number;
    if (upright) {
      x = side === Side.Right ? left - room.gap - w : left + room.gap;
      y = top - h / 2 + step;
    } else {
      x = left - w / 2 + step;
      y = side === Side.Top ? top + room.gap : top - room.gap - h;
    }
    x = Math.min(Math.max(x, room.margin), width - room.margin - w);
    y = Math.min(Math.max(y, room.margin), height - room.margin - h);
    if (!hits(blocked, x, y, x + w, y + h)) {
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}

/** A line on screen (see between): where it starts (px), how long it runs (px, 0 for none) and its angle (rad, as FramePoint's). */
export interface Segment {
  x: number;
  y: number;
  length: number;
  angle: number;
}

/**
 * The line from (`x1`, `y1`) to (`x2`, `y2`), leaving `startGap` free around the first point
 * and `endGap` around the second (px), so it runs between two marks without crossing them; none
 * (length 0) where less than `shortest` would be left.
 */
export function between(x1: number, y1: number, x2: number, y2: number, startGap: number, endGap: number, shortest: number, out: Segment): Segment {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const length = distance - startGap - endGap;
  out.angle = Math.atan2(dy, dx);
  if (length < shortest) {
    out.length = 0;
    return out;
  }
  out.x = x1 + (dx / distance) * startGap;
  out.y = y1 + (dy / distance) * startGap;
  out.length = length;
  return out;
}

/**
 * The aids of free drift (the line from the crosshair to the Course marker, the Course arrow at
 * the screen's edge) show from this speed on (units/s, 5 m/s): slower, the flight has no
 * direction worth aiming against.
 */
export const DRIFT_AID_SPEED = 100;

/**
 * Whether the aids of free drift show: for the Host's own clone, alive, in free drift and moving
 * at DRIFT_AID_SPEED or more. With the autopilot the flight follows the nose within a second, so
 * crosshair and Course marker sit together and the aids would only clutter the view.
 */
export function driftAidsShown(own: boolean, alive: boolean, free: boolean, speed: number): boolean {
  return own && alive && free && speed >= DRIFT_AID_SPEED;
}

/**
 * What the aids of free drift draw while they show (see driftAidsShown): with the Course marker
 * in the picture, the line to it; with it off screen, the arrow at the edge and the line to the
 * arrow. With the Brake marker in the picture the ship flies backwards, the Course marker lies
 * behind and an arrow's side would flip with every twitch around it: the Brake marker says it
 * then, and the motion streaks stream into it (see view/streaks).
 */
export function driftAidsDrawn(shown: boolean, courseInPicture: boolean, brakeInPicture: boolean): DriftAids {
  if (!shown || (brakeInPicture && !courseInPicture)) return DriftAids.None;
  return courseInPicture ? DriftAids.Line : DriftAids.Arrow;
}

/** What the aids of free drift draw (see driftAidsDrawn): nothing, the line to the Course marker, or the arrow at the edge with the line to it. */
export const enum DriftAids {
  None,
  Line,
  Arrow,
}

/** Whether a point projected to the screen (-1..1 across, `z` above 1 behind the camera) lies in the picture. */
export function inPicture(x: number, y: number, z: number): boolean {
  return z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1;
}
