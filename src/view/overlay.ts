/**
 * A canvas over the whole picture that the HUD draws on in CSS pixels, `ratio` canvas pixels to
 * each (see Hud.setViewport): the attitude and the motion streaks.
 */
export class Overlay {
  protected readonly context: CanvasRenderingContext2D;
  protected width = 1;
  protected height = 1;
  protected ratio = 1;

  constructor(protected readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
  }

  /** The picture's size in CSS pixels and the canvas's pixels per CSS pixel; resizing clears the canvas. */
  setViewport(width: number, height: number, ratio: number) {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.resized();
  }

  /** The canvas was resized and cleared: what was drawn on it is gone. */
  protected resized() {}
}
