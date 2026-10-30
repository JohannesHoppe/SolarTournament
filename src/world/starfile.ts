import * as THREE from 'three';
import { celestial } from './celestial.ts';

/**
 * The real sky's stars (`public/assets/sky/stars.bin`, packed by tools/sky from the Yale Bright
 * Star Catalogue): how a star's magnitude and color index become its brightness and color, and
 * how they are packed. Shared by the tool that writes the file and the game that reads it (see
 * world/starmap).
 */

/**
 * A star in `stars.bin`, STAR_BYTES little-endian: its right ascension (uint16, a turn in 65 536
 * steps), its declination (uint16, -90° to +90° in 65 535 steps; both within 20″, far finer than
 * a pixel), its color (three bytes, linear, the brightest channel 255), and how bright it is
 * drawn (a byte, see starBrightnessCode). The brightest star first.
 */
export const STAR_BYTES = 8;

/**
 * How bright a star is drawn for its visual magnitude `v`: 1 at the sixth magnitude, the limit
 * of the eye under a dark sky. Each magnitude brighter is 2^0.79 (about 1.7) times as bright
 * instead of 2.512, so the sky's range (Sirius at -1.46 to the catalogue's faintest near 8) fits
 * a screen: Sirius 59, a star of the first magnitude 15, the faintest 0.33.
 */
export function magnitudeFlux(v: number): number {
  return 2 ** (0.79 * (6 - v));
}

/** How much of a star's color the eye sees: the rest is white, since the eye takes the colors of stars paler than a camera does. */
const STAR_SATURATION = 0.75;

/** A star's color (linear, the brightest channel 1) for its color index B−V: its black body's (see blackBodyColor), as pale as the eye sees it. */
export function starColor(bv: number): [number, number, number] {
  const [r, g, b] = blackBodyColor(bvTemperature(bv));
  const pale = (c: number) => 1 - STAR_SATURATION + STAR_SATURATION * c;
  return [pale(r), pale(g), pale(b)];
}

/** A star's brightness kept on a logarithmic scale in a byte, 16 steps to a doubling, from 1/64. */
export function starBrightnessCode(flux: number): number {
  return THREE.MathUtils.clamp(Math.round(16 * Math.log2(flux * 64)), 0, 255);
}

/** The brightness a byte of starBrightnessCode stands for. */
export function starFlux(code: number): number {
  return 2 ** (code / 16) / 64;
}

/**
 * The color index B−V of a star of a spectral class (its first letter), for the few stars the
 * catalogue gives no B−V: the middle of each class's main sequence.
 */
const CLASS_BV: Record<string, number> = { O: -0.3, B: -0.15, A: 0.1, F: 0.4, G: 0.65, K: 1.1, M: 1.6, C: 2.5, S: 1.8, N: 2.5, R: 1.5 };

/** The color index B−V of a spectral type, from its class's first letter (0.65, the sun's, when there is none). */
export function spectralBV(type: string): number {
  return CLASS_BV[type.trim().replace(/^(sd|d|g|c|k|e)/, '')[0]?.toUpperCase() ?? ''] ?? 0.65;
}

/**
 * A star's surface temperature (kelvin) from its color index B−V, by Ballesteros's formula
 * (2012), which treats a star as a black body: about 10 000 K for Vega's 0, 5 800 K for the
 * sun's 0.65, 3 600 K for Betelgeuse's 1.85.
 */
export function bvTemperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** The CIE 1931 color matching functions at a wavelength (nm), by the multi-lobe fit of Wyman, Sloan and Shirley (2013). */
function matching(nm: number): [number, number, number] {
  const lobe = (center: number, below: number, above: number) => {
    const t = (nm - center) * (nm < center ? below : above);
    return Math.exp(-0.5 * t * t);
  };
  return [
    1.056 * lobe(599.8, 0.0264, 0.0323) + 0.362 * lobe(442.0, 0.0624, 0.0374) - 0.065 * lobe(501.1, 0.049, 0.0382),
    0.821 * lobe(568.8, 0.0213, 0.0247) + 0.286 * lobe(530.9, 0.0613, 0.0322),
    1.217 * lobe(437.0, 0.0845, 0.0278) + 0.681 * lobe(459.0, 0.0385, 0.0725),
  ];
}

/**
 * The color of a black body at `kelvin` as linear sRGB, the brightest channel 1: its spectrum
 * (Planck's law) seen through the eye's color matching functions, from 380 to 780 nm, taken into
 * sRGB's primaries (white D65 at about 6 500 K). A hot star is a pale blue, a cool one orange.
 */
export function blackBodyColor(kelvin: number): [number, number, number] {
  const xyz = [0, 0, 0];
  for (let nm = 380; nm <= 780; nm += 5) {
    const m = nm * 1e-9;
    // Planck's law, its constant factors dropped (the color is normalized)
    const radiance = 1 / (m ** 5 * (Math.exp(0.014388 / (m * kelvin)) - 1));
    const [x, y, z] = matching(nm);
    xyz[0] += x * radiance;
    xyz[1] += y * radiance;
    xyz[2] += z * radiance;
  }
  const [x, y, z] = xyz;
  const rgb: [number, number, number] = [
    Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z),
    Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z),
    Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z),
  ];
  const peak = Math.max(...rgb);
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
}

/** The stars of `stars.bin`: per star its direction in the celestial frame (unit), color (linear, 0 to 1) and brightness (see magnitudeFlux). */
export interface StarList {
  count: number;
  directions: Float32Array;
  colors: Float32Array;
  fluxes: Float32Array;
}

export function decodeStars(buffer: ArrayBuffer): StarList {
  const view = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / STAR_BYTES);
  const directions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const fluxes = new Float32Array(count);
  const direction = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const at = i * STAR_BYTES;
    celestial((view.getUint16(at, true) / 65536) * 360, (view.getUint16(at + 2, true) / 65535) * 180 - 90, direction);
    directions.set([direction.x, direction.y, direction.z], i * 3);
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = view.getUint8(at + 4 + c) / 255;
    fluxes[i] = starFlux(view.getUint8(at + 7));
  }
  return { count, directions, colors, fluxes };
}
