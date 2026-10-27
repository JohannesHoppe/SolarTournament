import { describe, expect, it } from 'vitest';
import { between, DRIFT_AID_SPEED, DriftAids, driftAidsDrawn, driftAidsShown, findTag, hits, inPicture, Side, sideOf, toFrame, type FramePoint, type Segment } from './screen';
import { METERS_PER_UNIT } from '../ship/flight';

const W = 1280;
const H = 720;
const point = (): FramePoint => ({ x: 0, y: 0, offscreen: false, angle: 0 });
const ROOM = { gap: 16, margin: 4, tries: 3 };

describe('toFrame', () => {
  it('keeps a point in the picture where it is', () => {
    const at = toFrame(0.5, -0.5, false, 0.95, 0.8, W, H, point());
    expect(at.offscreen).toBe(false);
    expect(at.x).toBeCloseTo(960);
    expect(at.y).toBeCloseTo(540);
  });

  it('holds a point off screen on the frame, along the line from the middle', () => {
    const at = toFrame(3, 0.3, false, 0.95, 0.8, W, H, point());
    expect(at.offscreen).toBe(true);
    expect(at.x).toBeCloseTo(((0.95 + 1) / 2) * W);
    expect(at.angle).toBeCloseTo(Math.atan2(-0.095, 0.95));
    expect(sideOf(at.x, at.y, 0.95, 0.8, W, H)).toBe(Side.Right);
  });

  it('mirrors a point behind the camera, so its arrow points the way to turn', () => {
    // behind and to the right projects to the left: the arrow points right
    const at = toFrame(-0.2, 0, true, 0.95, 0.8, W, H, point());
    expect(at.offscreen).toBe(true);
    expect(sideOf(at.x, at.y, 0.95, 0.8, W, H)).toBe(Side.Right);
    // straight behind and below: the arrow sits at the bottom
    const below = toFrame(0, 0.4, true, 0.95, 0.8, W, H, point());
    expect(sideOf(below.x, below.y, 0.95, 0.8, W, H)).toBe(Side.Bottom);
  });

  it('agrees with the prograde marker on what is in the picture', () => {
    expect(inPicture(0.99, -0.99, 0.5)).toBe(true);
    expect(inPicture(1.01, 0, 0.5)).toBe(false);
    expect(inPicture(0, 0, 1.01)).toBe(false);
  });
});

describe('findTag', () => {
  const at = { x: 0, y: 0 };

  it('puts a name inward of an arrow at the right edge', () => {
    expect(findTag([], 1216, 360, Side.Right, 80, 16, W, H, ROOM, at)).toBe(true);
    expect(at.x + 80).toBeLessThanOrEqual(1216 - 16);
    expect(at.y).toBe(352);
  });

  it('steps along the edge around a box already taken, and gives up when all is taken', () => {
    const taken = [1100, 340, 1210, 370];
    expect(findTag(taken, 1216, 360, Side.Right, 80, 16, W, H, ROOM, at)).toBe(true);
    expect(hits(taken, at.x, at.y, at.x + 80, at.y + 16)).toBe(false);
    expect(findTag([0, 0, W, H], 1216, 360, Side.Right, 80, 16, W, H, ROOM, at)).toBe(false);
  });

  it('keeps a name below an arrow at the top on screen', () => {
    expect(findTag([], 4, 80, Side.Top, 120, 13, W, H, ROOM, at)).toBe(true);
    expect(at.x).toBe(4);
    expect(at.y).toBe(96);
  });
});

describe('between', () => {
  const line: Segment = { x: 0, y: 0, length: 0, angle: 0 };

  it('runs from mark to mark, clear of both', () => {
    between(100, 100, 400, 500, 30, 26, 16, line);
    expect(line.length).toBeCloseTo(500 - 56);
    expect(line.x).toBeCloseTo(100 + 0.6 * 30);
    expect(line.y).toBeCloseTo(100 + 0.8 * 30);
    expect(line.angle).toBeCloseTo(Math.atan2(400, 300));
  });

  it('is left out where the marks all but touch', () => {
    expect(between(100, 100, 150, 100, 30, 26, 16, line).length).toBe(0);
    expect(between(100, 100, 100, 100, 30, 26, 16, line).length).toBe(0);
  });
});

describe('the aids of free drift', () => {
  const fast = 200 / METERS_PER_UNIT;

  it('show for the own living clone in free drift, moving', () => {
    expect(driftAidsShown(true, true, true, fast)).toBe(true);
    expect(DRIFT_AID_SPEED * METERS_PER_UNIT).toBe(5);
    expect(driftAidsShown(true, true, true, DRIFT_AID_SPEED)).toBe(true);
  });

  it('draw the line to a Course marker in the picture, else the arrow too, and leave flying backwards to the Brake marker', () => {
    expect(driftAidsDrawn(true, true, false)).toBe(DriftAids.Line);
    expect(driftAidsDrawn(true, false, false)).toBe(DriftAids.Arrow);
    expect(driftAidsDrawn(true, false, true)).toBe(DriftAids.None);
    // a wide lens may show both at once: the Course marker wins
    expect(driftAidsDrawn(true, true, true)).toBe(DriftAids.Line);
    expect(driftAidsDrawn(false, false, false)).toBe(DriftAids.None);
  });

  it('stay out with the autopilot, at rest, for a watched ship and without a clone', () => {
    expect(driftAidsShown(true, true, false, fast)).toBe(false);
    expect(driftAidsShown(true, true, true, DRIFT_AID_SPEED * 0.9)).toBe(false);
    expect(driftAidsShown(false, true, true, fast)).toBe(false);
    expect(driftAidsShown(true, false, true, fast)).toBe(false);
  });
});
