/**
 * A canvas over the whole picture that the HUD draws on in CSS pixels, `ratio` canvas pixels to
 * each (see Hud.setViewport): the attitude and the motion streaks. What is drawn on it is kept
 * in boxes (see box, ink), and only they are cleared for the next picture (see wipe): clearing a
 * large part of a full-screen canvas costs more than drawing a few lines on it.
 */
export class Overlay {
  protected readonly context: CanvasRenderingContext2D;
  protected width = 1;
  protected height = 1;
  protected ratio = 1;
  /** The boxes around what is on the canvas (CSS px: left, top, right, bottom, one after the other); a box with left > right holds nothing. */
  private readonly boxes: number[] = [];

  /** `margin` (CSS px): how far around a drawn point the canvas is cleared again, as far as a line's width and its antialiasing reach. */
  constructor(
    protected readonly canvas: HTMLCanvasElement,
    private readonly margin: number,
  ) {
    this.context = canvas.getContext('2d')!;
  }

  /** The picture's size in CSS pixels and the canvas's pixels per CSS pixel; resizing clears the canvas. */
  setViewport(width: number, height: number, ratio: number) {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.boxes.length = 0;
    this.resized();
  }

  /** The canvas was resized and cleared: what was drawn on it is gone. */
  protected resized() {}

  /** A new box around what is drawn next (see ink). */
  protected box() {
    this.boxes.push(Infinity, Infinity, -Infinity, -Infinity);
  }

  /** The last box takes in the point (x, y) (CSS px). */
  protected ink(x: number, y: number) {
    const boxes = this.boxes;
    const i = boxes.length - 4;
    if (x < boxes[i]) boxes[i] = x;
    if (y < boxes[i + 1]) boxes[i + 1] = y;
    if (x > boxes[i + 2]) boxes[i + 2] = x;
    if (y > boxes[i + 3]) boxes[i + 3] = y;
  }

  /** Clears what was drawn: each box, its margin around it, out to whole canvas pixels whatever the ratio. */
  protected wipe() {
    const { boxes, context, ratio, margin } = this;
    context.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < boxes.length; i += 4) {
      if (boxes[i] > boxes[i + 2]) continue;
      const left = Math.floor((boxes[i] - margin) * ratio);
      const top = Math.floor((boxes[i + 1] - margin) * ratio);
      context.clearRect(left, top, Math.ceil((boxes[i + 2] + margin) * ratio) - left, Math.ceil((boxes[i + 3] + margin) * ratio) - top);
    }
    boxes.length = 0;
  }
}
