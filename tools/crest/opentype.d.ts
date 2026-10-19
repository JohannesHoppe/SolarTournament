/** The part of opentype.js the crest generator uses. */
declare module 'opentype.js' {
  interface Path {
    toPathData(decimalPlaces?: number): string;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }
  interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    getAdvanceWidth(text: string, fontSize: number): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
