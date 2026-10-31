/**
 * The mathematical functions of the game, bit for bit the same on every machine.
 *
 * JavaScript leaves `Math.sin`, `Math.exp`, `Math.pow` and the other transcendental functions to
 * the engine and the platform, and they differ in the last bits: the same input gives one result
 * on an x64 processor, another on an ARM one, and `Math.log` and `Math.pow` differ between macOS
 * and Linux (measured on all three with two versions of Node, the engine's version changing
 * nothing). Every browser of a tournament computes the shared world itself, and the cheat checks
 * compare what another browser reports with what this one computes, so every one of them has to
 * get the very same bits. The functions here use only what IEEE 754 rounds exactly the same way
 * everywhere: `+ - * /`, `Math.sqrt`, and the exact operations `Math.abs`, `floor`, `round`,
 * `trunc`, `min`, `max`, `sign` and `fround`; reading and writing a number's bits through a typed
 * array; and, for a reduction of a huge angle, integer arithmetic in `BigInt`. JavaScript never
 * fuses a multiplication and an addition into one rounding, so each operation rounds alike.
 *
 * Every function is within 1 ulp of the true value and keeps the special values (NaN, ±0,
 * ±Infinity) exactly as its `Math` namesake does; `src/detmath.test.ts` measures both against an
 * independent reference computed in integers to 192 bits and pins the exact bits of each
 * function over a fixed set of inputs, on every platform the workflow CI runs on.
 *
 * Every mathematical function beyond `+ - * /` and `Math.sqrt` in the game comes from here, never
 * from `Math` (the unit test `src/detmath.guard.test.ts` holds the code to it).
 *
 * The algorithms and constants are those of fdlibm, as the musl C library keeps them: argument
 * reduction (Cody and Waite's three-part π/2 and ln 2) and minimax polynomials on the reduced
 * range.
 *
 * fdlibm: Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved. Developed at
 * SunSoft, a Sun Microsystems, Inc. business. Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice is preserved.
 *
 * musl: Copyright © 2005-2020 Rich Felker, et al. Permission is hereby granted, free of charge, to
 * any person obtaining a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions: The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT
 * WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
 * OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// ---------------------------------------------------------------------------------------------
// A number's bits: its high word (sign, exponent, top 20 bits of the mantissa) and its low word.

const bits = new Float64Array(1);
const words = new Int32Array(bits.buffer);
/** Which of the two words holds the high one: the second on a little-endian machine. */
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const LO = 1 - HI;

/** The high word of x as a signed 32-bit integer (negative when x's sign bit is set). */
const highWord = (x: number) => {
  bits[0] = x;
  return words[HI];
};
/** The low word of x as an unsigned 32-bit integer. */
const lowWord = (x: number) => {
  bits[0] = x;
  return words[LO] >>> 0;
};
const fromWords = (hi: number, lo: number) => {
  words[HI] = hi;
  words[LO] = lo;
  return bits[0];
};
/** x with its low word cleared: its top 21 bits of mantissa, for a product that stays exact. */
const clearLow = (x: number) => {
  bits[0] = x;
  words[LO] = 0;
  return bits[0];
};
/** x with its high word replaced. */
const withHigh = (x: number, hi: number) => {
  bits[0] = x;
  words[HI] = hi;
  return bits[0];
};

const TWO54 = fromWords(0x43500000, 0); // 2^54
const TWO1023 = fromWords(0x7fe00000, 0); // 2^1023
const TWOM1022 = fromWords(0x00100000, 0); // 2^-1022, the smallest normal number
const TWO53 = 9007199254740992; // 2^53

/** x · 2^n, exact unless the result overflows or falls among the subnormal numbers. */
function scalbn(x: number, n: number): number {
  let y = x;
  if (n > 1023) {
    y *= TWO1023;
    n -= 1023;
    if (n > 1023) {
      y *= TWO1023;
      n -= 1023;
      if (n > 1023) n = 1023;
    }
  } else if (n < -1022) {
    // 2^-1022 · 2^53 keeps the intermediate normal, so the result rounds once
    y *= TWOM1022 * TWO53;
    n += 1022 - 53;
    if (n < -1022) {
      y *= TWOM1022 * TWO53;
      n += 1022 - 53;
      if (n < -1022) n = -1022;
    }
  }
  return y * fromWords((0x3ff + n) << 20, 0);
}

// ---------------------------------------------------------------------------------------------
// Exact products (Dekker): a value and its rounding error as two doubles, for the functions that
// combine several rounded parts and must round only once at the end. Valid while the factors lie
// within 2^±400 or so, where neither the split overflows nor the error underflows.

const SPLIT = 134217729; // 2^27 + 1, splits a double into two halves of 26 bits
const BIG = fromWords(0x58f00000, 0); // 2^400
const SMALL = fromWords(0x26f00000, 0); // 2^-400

/** The rounding error of a·a: a·a = square + squareError(a, square) exactly. */
function squareError(a: number, square: number): number {
  const c = SPLIT * a;
  const ah = c - (c - a);
  const al = a - ah;
  return ah * ah - square + 2 * ah * al + al * al;
}

/** The rounding error of a·b: a·b = product + productError(a, b, product) exactly. */
function productError(a: number, b: number, product: number): number {
  let c = SPLIT * a;
  const ah = c - (c - a);
  const al = a - ah;
  c = SPLIT * b;
  const bh = c - (c - b);
  const bl = b - bh;
  return ah * bh - product + ah * bl + al * bh + al * bl;
}

/** (nh + nl) / (dh + dl), rounded once (dh > 0, the parts well inside the range of Dekker's product). */
function divideParts(nh: number, nl: number, dh: number, dl: number): number {
  const q = nh / dh;
  const p = q * dh;
  return q + (nh - p - productError(q, dh, p) + nl - q * dl) / dh;
}

// ---------------------------------------------------------------------------------------------
// Reduction of an angle by π/2: x = n·π/2 + (y0 + y1), |y0 + y1| ≤ π/4.

const reduced = new Float64Array(2);

const INV_PIO2 = 6.36619772367581382433e-1; // 2/π
// π/2 in three parts of 33 bits each and their tails: n · PIO2_k stays exact for |n| < 2^20
const PIO2_1 = 1.57079632673412561417e0;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const PIO4 = 7.85398163397448278999e-1;
/** 1.5 · 2^52: adding and subtracting it rounds a number below 2^51 to the nearest integer. */
const TO_INT = 6755399441055744;

/** 2/π to 1200 bits after the point (2/π · 2^1200, truncated), for the reduction of a huge angle. */
const TWO_OVER_PI = BigInt(
  '0xa2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980fef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b3d0739f78a5292ea6bfb5fb11f8d5d0856033046fc7b',
);
/** π/2 to 128 bits after the point (π/2 · 2^128, truncated). */
const PIO2_BIG = BigInt('0x1921fb54442d18469898cc51701b839a2');
const FRACTION_BITS = 128n;
const FRACTION_HALF = 1n << (FRACTION_BITS - 1n);
const FRACTION_ONE = 1n << FRACTION_BITS;
const TWOM256 = fromWords(0x2ff00000, 0); // 2^-256

/**
 * Reduces x (finite, |x| ≥ 2^20 · π/2) exactly in integers: x is m · 2^e with an integer m below
 * 2^53, and m · (2/π) · 2^e is taken to 128 bits after the point from 2/π's 1200 bits, which
 * covers the largest exponent with room to spare; the fraction times π/2 gives y0 + y1.
 */
function reduceHuge(x: number, hx: number): number {
  const e = ((hx >>> 20) & 0x7ff) - 1075;
  const m = (BigInt((hx & 0xfffff) | 0x100000) << 32n) | BigInt(lowWord(x));
  const scaled = (m * TWO_OVER_PI) >> BigInt(1200 - Number(FRACTION_BITS) - e);
  let n = scaled >> FRACTION_BITS;
  let fraction = scaled & (FRACTION_ONE - 1n);
  if (fraction >= FRACTION_HALF) {
    n += 1n;
    fraction -= FRACTION_ONE;
  }
  const r = fraction * PIO2_BIG; // the remainder · 2^256
  const head = Number(r);
  const tail = Number(r - BigInt(head));
  const quadrant = Number(n & 7n);
  if (hx < 0) {
    reduced[0] = -head * TWOM256;
    reduced[1] = -tail * TWOM256;
    return -quadrant;
  }
  reduced[0] = head * TWOM256;
  reduced[1] = tail * TWOM256;
  return quadrant;
}

/** x = n·π/2 + reduced[0] + reduced[1]; returns n (only n mod 4 matters to the callers). */
function reducePio2(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x413921fb) return reduceHuge(x, hx); // |x| ≥ 2^20 · π/2
  const fn = x * INV_PIO2 + TO_INT - TO_INT;
  let n = fn | 0;
  let f = fn;
  let r = x - f * PIO2_1;
  let w = f * PIO2_1T; // first round, good to 85 bits
  if (r - w < -PIO4) {
    n--;
    f--;
    r = x - f * PIO2_1;
    w = f * PIO2_1T;
  } else if (r - w > PIO4) {
    n++;
    f++;
    r = x - f * PIO2_1;
    w = f * PIO2_1T;
  }
  let y0 = r - w;
  const ex = ix >>> 20;
  let ey = (highWord(y0) >>> 20) & 0x7ff;
  if (ex - ey > 16) {
    // cancellation: second round, good to 118 bits
    let t = r;
    w = f * PIO2_2;
    r = t - w;
    w = f * PIO2_2T - (t - r - w);
    y0 = r - w;
    ey = (highWord(y0) >>> 20) & 0x7ff;
    if (ex - ey > 49) {
      // third round, good to 151 bits, covers every double
      t = r;
      w = f * PIO2_3;
      r = t - w;
      w = f * PIO2_3T - (t - r - w);
      y0 = r - w;
    }
  }
  reduced[0] = y0;
  reduced[1] = r - y0 - w;
  return n;
}

// ---------------------------------------------------------------------------------------------
// The kernels on [-π/4, π/4]: x + y is the reduced angle, y the tail of x.

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kernelSin(x: number, y: number, withTail: boolean): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (!withTail) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kernelCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const v = 1 - hz;
  return v + (1 - v - hz + (z * r - x * y));
}

const T0 = 3.33333333333334091986e-1;
const T1 = 1.33333333333201242699e-1;
const T2 = 5.39682539762260521377e-2;
const T3 = 2.18694882948595424599e-2;
const T4 = 8.86323982359930005737e-3;
const T5 = 3.59207910759131235356e-3;
const T6 = 1.45620945432529025516e-3;
const T7 = 5.88041240820264096874e-4;
const T8 = 2.46463134818469906812e-4;
const T9 = 7.81794442939557092300e-5;
const T10 = 7.14072491382608190305e-5;
const T11 = -1.85586374855275456654e-5;
const T12 = 2.59073051863633712884e-5;
const PIO4_LO = 3.06161699786838301793e-17;

/** tan(x + y), or -1/tan(x + y) when odd. */
function kernelTan(x: number, y: number, odd: boolean): number {
  const hx = highWord(x);
  const big = (hx & 0x7fffffff) >= 0x3fe59428; // |x| ≥ 0.6744
  const negative = hx < 0;
  if (big) {
    if (negative) {
      x = -x;
      y = -y;
    }
    x = PIO4 - x + (PIO4_LO - y);
    y = 0;
  }
  const z = x * x;
  let w = z * z;
  let r = T1 + w * (T3 + w * (T5 + w * (T7 + w * (T9 + w * T11))));
  let v = z * (T2 + w * (T4 + w * (T6 + w * (T8 + w * (T10 + w * T12)))));
  let s = z * x;
  r = y + z * (s * (r + v) + y) + s * T0;
  w = x + r;
  if (big) {
    s = odd ? -1 : 1;
    v = s - 2 * (x + (r - (w * w) / (w + s)));
    return negative ? -v : v;
  }
  if (!odd) return w;
  // -1/(x + r) has up to 2 ulp error, so it is computed in two parts
  const w0 = clearLow(w);
  v = r - (w0 - x); // w0 + v = r + x
  const a = -1 / w;
  const a0 = clearLow(a);
  return a0 + a * (1 + a0 * w0 + a0 * v);
}

// ---------------------------------------------------------------------------------------------
// Trigonometry

/** sin(x) in radians. */
export function sin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    // |x| ≲ π/4
    if (ix < 0x3e500000) return x; // |x| < 2^-26
    return kernelSin(x, 0, false);
  }
  if (ix >= 0x7ff00000) return x - x; // NaN, ±Infinity
  const n = reducePio2(x);
  const y0 = reduced[0];
  const y1 = reduced[1];
  switch (n & 3) {
    case 0:
      return kernelSin(y0, y1, true);
    case 1:
      return kernelCos(y0, y1);
    case 2:
      return -kernelSin(y0, y1, true);
    default:
      return -kernelCos(y0, y1);
  }
}

/** cos(x) in radians. */
export function cos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e46a09e) return 1; // |x| < 2^-27 · √2
    return kernelCos(x, 0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = reducePio2(x);
  const y0 = reduced[0];
  const y1 = reduced[1];
  switch (n & 3) {
    case 0:
      return kernelCos(y0, y1);
    case 1:
      return -kernelSin(y0, y1, true);
    case 2:
      return -kernelCos(y0, y1);
    default:
      return kernelSin(y0, y1, true);
  }
}

/** tan(x) in radians. */
export function tan(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e400000) return x; // |x| < 2^-27
    return kernelTan(x, 0, false);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = reducePio2(x);
  return kernelTan(reduced[0], reduced[1], (n & 1) === 1);
}

const PIO2_HI = 1.57079632679489655800e0;
const PIO2_LO = 6.12323399573676603587e-17;
const PS0 = 1.66666666666666657415e-1;
const PS1 = -3.25565818622400915405e-1;
const PS2 = 2.01212532134862925881e-1;
const PS3 = -4.00555345006794114027e-2;
const PS4 = 7.91534994289814532176e-4;
const PS5 = 3.47933107596021167570e-5;
const QS1 = -2.40339491173441421878e0;
const QS2 = 2.02094576023350569471e0;
const QS3 = -6.88283971605453293030e-1;
const QS4 = 7.70381505559019352791e-2;

/** The rational approximation R shared by asin and acos: asin(x) ≈ x + x·R(x²). */
function asinRational(z: number): number {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
}

/** asin(x) in radians, in [-π/2, π/2]; NaN outside [-1, 1]. */
export function asin(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    // |x| ≥ 1 or NaN
    if (((ix - 0x3ff00000) | lowWord(x)) === 0) return x * PIO2_HI; // asin(±1) = ±π/2
    return NaN;
  }
  if (ix < 0x3fe00000) {
    // |x| < 0.5
    if (ix < 0x3e500000 && ix >= 0x00100000) return x;
    return x + x * asinRational(x * x);
  }
  // 0.5 ≤ |x| < 1
  const z = (1 - Math.abs(x)) * 0.5;
  const s = Math.sqrt(z);
  const r = asinRational(z);
  let y: number;
  if (ix >= 0x3fef3333) {
    // |x| > 0.975
    y = PIO2_HI - (2 * (s + s * r) - PIO2_LO);
  } else {
    // f + c = √z
    const f = clearLow(s);
    const c = (z - f * f) / (s + f);
    y = 0.5 * PIO2_HI - (2 * s * r - (PIO2_LO - 2 * c) - (0.5 * PIO2_HI - 2 * f));
  }
  return hx < 0 ? -y : y;
}

/** acos(x) in radians, in [0, π]; NaN outside [-1, 1]. */
export function acos(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowWord(x)) === 0) return hx < 0 ? 2 * PIO2_HI : 0; // acos(-1) = π, acos(1) = 0
    return NaN;
  }
  if (ix < 0x3fe00000) {
    // |x| < 0.5
    if (ix <= 0x3c600000) return PIO2_HI; // |x| < 2^-57
    return PIO2_HI - (x - (PIO2_LO - x * asinRational(x * x)));
  }
  if (hx < 0) {
    // x < -0.5
    const z = (1 + x) * 0.5;
    const s = Math.sqrt(z);
    const w = asinRational(z) * s - PIO2_LO;
    return 2 * (PIO2_HI - (s + w));
  }
  // x > 0.5
  const z = (1 - x) * 0.5;
  const s = Math.sqrt(z);
  const df = clearLow(s);
  const c = (z - df * df) / (s + df);
  const w = asinRational(z) * s + c;
  return 2 * (df + w);
}

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e0];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.11111104054623557880e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.65315727442169155270e-2;
const AT10 = 1.62858201153657823623e-2;

/** atan(x) in radians, in [-π/2, π/2]. */
export function atan(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    // |x| ≥ 2^66 or NaN
    if (x !== x) return x;
    return hx < 0 ? -ATAN_HI[3] : ATAN_HI[3];
  }
  if (ix < 0x3e400000) return x; // |x| < 2^-27
  return atanKernel(x, 0);
}

/**
 * atan(x + dx) for 2^-27 ≤ |x| < 2^66 and |dx| below an ulp of x, rounded once; its rounding error
 * is left in `atanTail` (the true value ≈ result + atanTail, but for the polynomial's error).
 */
let atanTail = 0;
function atanKernel(x: number, dx: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  // the slope of atan at x, by which dx moves the result
  const shift = dx === 0 ? 0 : dx / (1 + x * x);
  let id: number;
  if (ix < 0x3fdc0000) {
    // |x| < 0.4375
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      // |x| < 1.1875
      if (ix < 0x3fe60000) {
        // 7/16 ≤ |x| < 11/16
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        // 11/16 ≤ |x| < 19/16
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      // |x| < 2.4375
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      // 2.4375 ≤ |x| < 2^66
      id = 3;
      x = -1 / x;
    }
  }
  const z = x * x;
  const w = z * z;
  // the sum of AT_i · z^(i+1) split into an odd and an even polynomial
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) {
    const v = x * (s1 + s2) - shift;
    const y = x - v;
    atanTail = x - y - v;
    return y;
  }
  const v = x * (s1 + s2) - (ATAN_LO[id] + (hx < 0 ? -shift : shift)) - x;
  const y = ATAN_HI[id] - v;
  const tail = ATAN_HI[id] - y - v;
  atanTail = hx < 0 ? -tail : tail;
  return hx < 0 ? -y : y;
}

const PI = 3.1415926535897931160e0;
const PI_LO = 1.2246467991473531772e-16;
const PI_HALF = PI / 2; // exact: a power of two
const PI_QUARTER = PI / 4;

/** The angle of the point (x, y) from the positive x axis, in radians, in [-π, π]. */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  const hx = highWord(x);
  const lx = lowWord(x);
  const hy = highWord(y);
  const ly = lowWord(y);
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y); // x = 1
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2); // 2·sign(x) + sign(y)
  const ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) {
    // y = ±0
    switch (m) {
      case 0:
      case 1:
        return y; // atan2(±0, +anything) = ±0
      case 2:
        return PI; // atan2(+0, -anything) = π
      default:
        return -PI; // atan2(-0, -anything) = -π
    }
  }
  if ((ix | lx) === 0) return m & 1 ? -PI_HALF : PI_HALF; // x = ±0
  if (ix === 0x7ff00000) {
    // x = ±Infinity
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return PI_QUARTER;
        case 1:
          return -PI_QUARTER;
        case 2:
          return 3 * PI_QUARTER;
        default:
          return -3 * PI_QUARTER;
      }
    }
    switch (m) {
      case 0:
        return 0;
      case 1:
        return -0;
      case 2:
        return PI;
      default:
        return -PI;
    }
  }
  // |y/x| > 2^64
  if (ix + (64 << 20) < iy || iy === 0x7ff00000) return m & 1 ? -PI_HALF : PI_HALF;
  let z = 0;
  let tail = 0;
  // |y/x| < 2^-64 with x < 0: atan(|y/x|) vanishes beside π
  if (!(m & 2 && iy + (64 << 20) < ix)) {
    // atan(q + dq) with q = |y/x| rounded and dq the rounding error of the quotient, so the
    // quotient rounds only once into the result
    const q = Math.abs(y / x);
    if (q < TWOM27) {
      // atan(q) = q - q³/3, far below an ulp of π
      if (m < 2) return m & 1 ? -q : q;
      z = q;
    } else {
      z = atanKernel(q, quotientError(Math.abs(y), Math.abs(x), q));
      tail = atanTail;
    }
  }
  switch (m) {
    case 0:
      return z; // atan2(+, +)
    case 1:
      return -z; // atan2(-, +)
    case 2: {
      // π - (z + tail) in two parts, rounded once
      const s = PI - z;
      return s + (PI - s - z + (PI_LO - tail)); // atan2(+, -)
    }
    default: {
      const s = PI - z;
      return -(s + (PI - s - z + (PI_LO - tail))); // atan2(-, -)
    }
  }
}

const TWOM27 = fromWords(0x3e400000, 0); // 2^-27

/**
 * The rounding error of the quotient q = a/b (a, b > 0): a/b = q + quotientError(a, b, q), to far
 * below an ulp of q. The product q·b is taken exactly (Dekker's product), on a and b scaled by the
 * same power of two where they lie far from 1, so it neither overflows nor underflows.
 */
function quotientError(a: number, b: number, q: number): number {
  if (b > BIG || b < SMALL || a > BIG || a < SMALL) {
    const n = -exponent(b);
    a = scalbn(a, n);
    b = scalbn(b, n);
  }
  const p = q * b;
  return (a - p - productError(q, b, p)) / b;
}

/** The exponent of a finite nonzero x: 2^e ≤ |x| < 2^(e + 1). */
function exponent(x: number): number {
  const e = (highWord(x) >>> 20) & 0x7ff;
  if (e > 0) return e - 1023;
  return ((highWord(x * TWO54) >>> 20) & 0x7ff) - 1023 - 54; // subnormal
}

// ---------------------------------------------------------------------------------------------
// Exponentials and logarithms

const LN2_HI = 6.93147180369123816490e-1; // its low 32 bits zero: k · LN2_HI is exact for |k| < 2^11
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e0;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;
const EXP_OVERFLOW = 709.782712893383973096;

/** e^x. */
export function exp(x: number): number {
  const hx = highWord(x);
  const negative = hx < 0;
  const ix = hx & 0x7fffffff;
  if (ix >= 0x4086232b) {
    // |x| ≥ 708.39 or NaN
    if (x !== x) return x;
    if (x > EXP_OVERFLOW) return x * TWO1023; // overflow (Infinity)
    if (x < -745.13321910194110842) return 0; // underflow
  }
  let hi: number;
  let lo: number;
  let k: number;
  if (ix > 0x3fd62e42) {
    // |x| > ln2 / 2
    if (ix >= 0x3ff0a2b2) k = Math.trunc(INV_LN2 * x + (negative ? -0.5 : 0.5)); // |x| ≥ 1.5 ln2
    else k = negative ? -1 : 1;
    hi = x - k * LN2_HI; // exact here
    lo = k * LN2_LO;
    x = hi - lo;
  } else if (ix > 0x3e300000) {
    // |x| > 2^-28
    k = 0;
    hi = x;
    lo = 0;
  } else {
    return 1 + x;
  }
  const xx = x * x;
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
  const y = 1 + ((x * c) / (2 - c) - lo + hi);
  return k === 0 ? y : scalbn(y, k);
}

const Q1 = -3.33333333333331316428e-2;
const Q2 = 1.58730158725481460165e-3;
const Q3 = -7.93650757867487942473e-5;
const Q4 = 4.00821782732936239552e-6;
const Q5 = -2.01099218183624371326e-7;

/** e^x - 1, accurate where x is near 0. */
export function expm1(x: number): number {
  const hxs0 = highWord(x);
  const negative = hxs0 < 0;
  const hx = hxs0 & 0x7fffffff;
  if (hx >= 0x4043687a) {
    // |x| ≥ 56 ln2 or NaN
    if (x !== x) return x;
    if (negative) return -1;
    if (x > EXP_OVERFLOW) return x * TWO1023;
  }
  let k: number;
  let c = 0;
  if (hx > 0x3fd62e42) {
    // |x| > ln2 / 2
    let hi: number;
    let lo: number;
    if (hx < 0x3ff0a2b2) {
      // and |x| < 1.5 ln2
      if (!negative) {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      } else {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      }
    } else {
      k = Math.trunc(INV_LN2 * x + (negative ? -0.5 : 0.5));
      hi = x - k * LN2_HI; // exact here
      lo = k * LN2_LO;
    }
    x = hi - lo;
    c = hi - x - lo;
  } else if (hx < 0x3c900000) {
    return x; // |x| < 2^-54
  } else {
    k = 0;
  }
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6 - x * t));
  if (k === 0) return x - (x * e - hxs); // c is 0
  e = x * (e - c) - c;
  e -= hxs;
  // e^x ≈ 2^k (x_reduced - e + 1)
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2 * (e - (x + 0.5));
    return 1 + 2 * (x - e);
  }
  if (k < 0 || k > 56) {
    // e^x - 1 ≈ e^x
    let y = x - e + 1;
    if (k === 1024) y = y * 2 * TWO1023;
    else y = y * fromWords((0x3ff + k) << 20, 0);
    return y - 1;
  }
  const twopk = fromWords((0x3ff + k) << 20, 0);
  const twomk = fromWords((0x3ff - k) << 20, 0);
  if (k < 20) return (x - e + (1 - twomk)) * twopk;
  return (x - (e + twomk) + 1) * twopk;
}

const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

/**
 * Splits a positive normal or subnormal x into 2^k · (1 + f) with 1 + f in [√2/2, √2): returns k
 * and leaves f in `logParts[0]`. Shared by log, log2 and log10.
 */
const logParts = new Float64Array(1);
function logSplit(x: number, hx: number): number {
  let k = 0;
  if (hx < 0x00100000) {
    // subnormal: scale up
    k -= 54;
    x *= TWO54;
    hx = highWord(x);
  }
  // reduce x into [√2/2, √2)
  hx += 0x3ff00000 - 0x3fe6a09e;
  k += (hx >>> 20) - 0x3ff;
  hx = (hx & 0x000fffff) + 0x3fe6a09e;
  logParts[0] = withHigh(x, hx) - 1;
  return k;
}

/** log(1 + f) - f + f²/2 for f from logSplit: s·(f²/2 + R). */
function logTail(f: number, hfsq: number): number {
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  return s * (hfsq + t2 + t1);
}

/** Special values of the logarithms: -Infinity at ±0, NaN below 0 and at NaN, Infinity at Infinity, 0 at 1; else undefined. */
function logSpecial(x: number, hx: number): number | undefined {
  if (hx < 0x00100000 || hx < 0) {
    if (x === 0) return -Infinity;
    if (hx < 0) return NaN; // log of a negative number, or of a NaN with its sign bit set
  } else if (hx >= 0x7ff00000) {
    return x; // Infinity or NaN
  } else if (x === 1) {
    return 0;
  }
  return undefined;
}

/** The natural logarithm of x. */
export function log(x: number): number {
  const hx = highWord(x);
  const special = logSpecial(x, hx);
  if (special !== undefined) return special;
  const k = logSplit(x, hx);
  const f = logParts[0];
  const hfsq = 0.5 * f * f;
  return logTail(f, hfsq) + k * LN2_LO - hfsq + f + k * LN2_HI;
}

const IVLN2_HI = 1.44269504072144627571e0;
const IVLN2_LO = 1.67517131648865118353e-10;
const IVLN10_HI = 4.34294481878168880939e-1;
const IVLN10_LO = 2.50829467116452752298e-11;
const LOG10_2_HI = 3.01029995663611771306e-1;
const LOG10_2_LO = 3.69423907715893078616e-13;

/** log(1 + f) as hi + lo with hi's low word cleared, for log2 and log10; leaves lo in logParts[0]. */
function logHiLo(f: number): number {
  const hfsq = 0.5 * f * f;
  const hi = clearLow(f - hfsq);
  logParts[0] = f - hi - hfsq + logTail(f, hfsq);
  return hi;
}

/**
 * The logarithm of x to a base b: log(1 + f) · (1/ln b) in two parts (ivHi + ivLo) plus k times
 * log_b(2) in two parts (kHi + kLo), the sum rounded once.
 */
function logToBase(x: number, ivHi: number, ivLo: number, kHi: number, kLo: number): number {
  const hx = highWord(x);
  const special = logSpecial(x, hx);
  if (special !== undefined) return special;
  const k = logSplit(x, hx);
  const hi = logHiLo(logParts[0]);
  const lo = logParts[0];
  const valHi = hi * ivHi;
  const y = k * kHi;
  let valLo = k * kLo + (lo + hi) * ivLo + lo * ivHi;
  const w = y + valHi;
  valLo += y - w + valHi;
  return valLo + w;
}

/** The logarithm of x to base 2. */
export const log2 = (x: number) => logToBase(x, IVLN2_HI, IVLN2_LO, 1, 0);

/** The logarithm of x to base 10. */
export const log10 = (x: number) => logToBase(x, IVLN10_HI, IVLN10_LO, LOG10_2_HI, LOG10_2_LO);

/** log(1 + x), accurate where x is near 0. */
export function log1p(x: number): number {
  const hx = highWord(x);
  const ux = hx >>> 0;
  let k = 1;
  let c = 0;
  let f = 0;
  if (ux < 0x3fda827a || hx < 0) {
    // 1 + x < √2
    if (ux >= 0xbff00000) {
      // x ≤ -1 or a NaN with its sign bit set
      if (x === -1) return -Infinity;
      return NaN;
    }
    if (((ux << 1) >>> 0) < 0x3ca00000 << 1) return x; // |x| < 2^-53
    if (ux <= 0xbfd2bec4) {
      // √2/2 ≤ 1 + x < √2
      k = 0;
      c = 0;
      f = x;
    }
  } else if (ux >= 0x7ff00000) {
    return x;
  }
  if (k) {
    const u = 1 + x;
    let hu = highWord(u);
    hu += 0x3ff00000 - 0x3fe6a09e;
    k = (hu >>> 20) - 0x3ff;
    // the correction log(1 + x) - log(u), without an underflow in c/u
    if (k < 54) {
      c = k >= 2 ? 1 - (u - x) : x - (u - 1);
      c /= u;
    } else {
      c = 0;
    }
    hu = (hu & 0x000fffff) + 0x3fe6a09e;
    f = withHigh(u, hu) - 1;
  }
  const hfsq = 0.5 * f * f;
  return logTail(f, hfsq) + (k * LN2_LO + c) - hfsq + f + k * LN2_HI;
}

// ---------------------------------------------------------------------------------------------
// Powers and roots

const BP = [1, 1.5];
const DP_H = [0, 5.84962487220764160156e-1];
const DP_L = [0, 1.35003920212974897128e-8];
const HUGE = 1e300;
const TINY = 1e-300;
const L1 = 5.99999999999994648725e-1;
const L2 = 4.28571428578550184252e-1;
const L3 = 3.33333329818377432918e-1;
const L4 = 2.72728123808534006489e-1;
const L5 = 2.30660745775561754067e-1;
const L6 = 2.06975017800338417784e-1;
const LG2_FULL = 6.93147180559945286227e-1;
const LG2_H = 6.93147182464599609375e-1;
const LG2_L = -1.90465429995776804525e-9;
const OVT = 8.0085662595372944372e-17; // -(1024 - log2(overflow + 0.5 ulp))
const CP = 9.61796693925975554329e-1; // 2/(3 ln2)
const CP_H = 9.61796700954437255859e-1;
const CP_L = -7.02846165095275826516e-9;
const IVLN2 = 1.44269504088896338700e0;
const IVLN2_H = 1.44269502162933349609e0;
const IVLN2_L = 1.92596299112661746887e-8;

/**
 * x^y, as `Math.pow` and `**` define it: y = ±0 gives 1 for every x (NaN too), a NaN otherwise
 * gives NaN, (±1)^±Infinity is NaN, a negative x gives NaN unless y is an integer (negative for
 * an odd y), y = 2 gives x·x and y = 0.5 gives √x for x ≥ +0. Nearly correctly rounded; an integer
 * to an integer power is exact whenever the result is representable.
 */
export function pow(x: number, y: number): number {
  const hx = highWord(x);
  const lx = lowWord(x);
  const hy = highWord(y);
  const ly = lowWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;

  if ((iy | ly) === 0) return 1; // x^0 = 1
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return NaN;

  // whether y is an integer, when x < 0: 0 not, 1 odd, 2 even
  let yIsInt = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yIsInt = 2; // |y| ≥ 2^53: even
    else if (iy >= 0x3ff00000) {
      const k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        const j = ly >>> (52 - k);
        if (((j << (52 - k)) >>> 0) === ly) yIsInt = 2 - (j & 1);
      } else if (ly === 0) {
        const j = iy >> (20 - k);
        if (j << (20 - k) === iy) yIsInt = 2 - (j & 1);
      }
    }
  }

  if (ly === 0) {
    if (iy === 0x7ff00000) {
      // y = ±Infinity
      if (((ix - 0x3ff00000) | lx) === 0) return NaN; // (±1)^±Infinity
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0; // (|x| > 1)^±Infinity = Infinity, 0
      return hy < 0 ? -y : 0; // (|x| < 1)^∓Infinity = Infinity, 0
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x; // y = ±1
    if (hy === 0x40000000) return x * x; // y = 2
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x); // y = 0.5, x ≥ +0
  }

  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    // x = ±0, ±Infinity, ±1
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yIsInt) === 0) z = NaN; // (-1)^non-integer
      else if (yIsInt === 1) z = -z; // (x < 0)^odd = -(|x|^odd)
    }
    return z;
  }

  const positive = hx >= 0;
  if (!positive && yIsInt === 0) return NaN; // (x < 0)^non-integer
  const s = !positive && yIsInt === 1 ? -1 : 1; // the sign of the result

  let t1: number;
  let t2: number;
  if (iy > 0x41e00000) {
    // |y| > 2^31
    if (iy > 0x43f00000) {
      // |y| > 2^64: overflows or underflows
      if (ix <= 0x3fefffff) return hy < 0 ? HUGE * HUGE : TINY * TINY;
      if (ix >= 0x3ff00000) return hy > 0 ? HUGE * HUGE : TINY * TINY;
    }
    // overflow or underflow unless x is close to one
    if (ix < 0x3fefffff) return hy < 0 ? s * HUGE * HUGE : s * TINY * TINY;
    if (ix > 0x3ff00000) return hy > 0 ? s * HUGE * HUGE : s * TINY * TINY;
    // |1 - x| ≤ 2^-20: log(x) by x - x²/2 + x³/3 - x⁴/4
    const t = ax - 1; // 20 trailing zeros
    const w = t * t * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    const u = IVLN2_H * t; // IVLN2_H has 21 significant bits
    const v = t * IVLN2_L - w * IVLN2;
    t1 = clearLow(u + v);
    t2 = v - (t1 - u);
  } else {
    let n = 0;
    if (ix < 0x00100000) {
      // subnormal x
      ax *= TWO53;
      n -= 53;
      ix = highWord(ax);
    }
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    // the interval
    ix = j | 0x3ff00000;
    let k: number;
    if (j <= 0x3988e) k = 0; // |x| < √(3/2)
    else if (j < 0xbb67a) k = 1; // |x| < √3
    else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = withHigh(ax, ix);

    // ss = s_h + s_l = (x - 1)/(x + 1) or (x - 1.5)/(x + 1.5)
    let u = ax - BP[k];
    let v = 1 / (ax + BP[k]);
    const ss = u * v;
    const sH = clearLow(ss);
    // tH = ax + BP[k], high part
    let tH = fromWords(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let tL = ax - (tH - BP[k]);
    const sL = v * (u - sH * tH - sH * tL);
    // log(ax)
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = clearLow(3 + s2 + r);
    tL = r - (tH - 3 - s2);
    // u + v = ss · (1 + …)
    u = sH * tH;
    v = sL * tH + tL * ss;
    // 2/(3 log2) · (ss + …)
    const pH = clearLow(u + v);
    const pL = v - (pH - u);
    const zH = CP_H * pH; // CP_H + CP_L = 2/(3 log2)
    const zL = CP_L * pH + pL * CP + DP_L[k];
    // log2(ax) = (ss + …) · 2/(3 log2) = n + DP_H + zH + zL
    const t = n;
    t1 = clearLow(zH + zL + DP_H[k] + t);
    t2 = zL - (t1 - t - DP_H[k] - zH);
  }

  // y = y1 + y2, (y1 + y2) · (t1 + t2)
  const y1 = clearLow(y);
  let pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  let j = highWord(z);
  const i = lowWord(z);
  if (j >= 0x40900000) {
    // z ≥ 1024
    if (((j - 0x40900000) | i) !== 0) return s * HUGE * HUGE; // z > 1024: overflow
    if (pL + OVT > z - pH) return s * HUGE * HUGE;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    // z ≤ -1075
    if (j !== (0xc090cc00 | 0) || i !== 0) return s * TINY * TINY; // z < -1075: underflow
    if (pL <= z - pH) return s * TINY * TINY;
  }

  // 2^(pH + pL)
  const iz = j & 0x7fffffff;
  let k = (iz >> 20) - 0x3ff;
  let n = 0;
  if (iz > 0x3fe00000) {
    // |z| > 0.5: n = [z + 0.5]
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff; // the new k for n
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  const t = clearLow(pL + pH);
  const u = t * LG2_H;
  const v = (pL - (t - pH)) * LG2_FULL + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  const tt = z * z;
  const r1 = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * r1) / (r1 - 2) - (w + z * w);
  z = 1 - (r - z);
  j = highWord(z) + (n << 20);
  if (j >> 20 <= 0) z = scalbn(z, n); // a subnormal result
  else z = withHigh(z, j);
  return s * z;
}

const B1 = 715094163; // (1023 - 1023/3 - 0.03306235651) · 2^20
const B2 = 696219795; // (1023 - 1023/3 - 54/3 - 0.03306235651) · 2^20
const CB_P0 = 1.87595182427177009643;
const CB_P1 = -1.88497979543377169875;
const CB_P2 = 1.62142972010535446614;
const CB_P3 = -0.758397934778766047437;
const CB_P4 = 0.145996192886612446982;

/** The cube root of x. */
export function cbrt(x: number): number {
  const sign = highWord(x) & 0x80000000;
  let hx = highWord(x) & 0x7fffffff;
  if (hx >= 0x7ff00000) return x + x; // NaN, ±Infinity
  let t: number;
  if (hx < 0x00100000) {
    // zero or subnormal
    const scaled = x * TWO54;
    hx = highWord(scaled) & 0x7fffffff;
    if (hx === 0) return x; // ±0
    t = fromWords(sign | (Math.trunc(hx / 3) + B2), 0);
  } else {
    t = fromWords(sign | (Math.trunc(hx / 3) + B1), 0);
  }
  // a first approximation to 23 bits by a polynomial in r = t³/x
  let r = t * t * (t / x);
  t = t * (CB_P0 + r * (CB_P1 + r * CB_P2) + r * r * r * (CB_P3 + r * CB_P4));
  // round t away from zero to 23 bits, so t·t is exact and t is no smaller than cbrt(x)
  let hi = highWord(t);
  let lo = lowWord(t) + 0x80000000;
  if (lo >= 0x100000000) {
    hi += 1;
    lo -= 0x100000000;
  }
  t = fromWords(hi, lo & 0xc0000000);
  // one step of Newton's method to 53 bits
  const s = t * t; // exact
  r = x / s; // error ≤ 0.5 ulp, |r| < |t|
  const w = t + t; // exact
  r = (r - t) / (w + r); // r - t is exact, w + r ≈ 3t
  return t + t * r;
}

const SCALE_DOWN = fromWords(0x14300000, 0); // 2^-700
const SCALE_UP = fromWords(0x6bb00000, 0); // 2^700

/**
 * √(a² + b² + c² + d²) without overflow or underflow, nearly correctly rounded (the sum of squares
 * is kept exactly in two doubles, its square root corrected by one step). Infinity if any is
 * infinite, else NaN if any is NaN.
 */
export function hypot(a: number, b: number, c = 0, d = 0): number {
  a = Math.abs(a);
  b = Math.abs(b);
  c = Math.abs(c);
  d = Math.abs(d);
  if (a === Infinity || b === Infinity || c === Infinity || d === Infinity) return Infinity;
  const m = Math.max(a, b, c, d);
  if (m !== m) return NaN;
  if (m === 0) return 0;
  let scale = 1;
  if (m > BIG) {
    a *= SCALE_DOWN;
    b *= SCALE_DOWN;
    c *= SCALE_DOWN;
    d *= SCALE_DOWN;
    scale = SCALE_UP;
  } else if (m < SMALL) {
    a *= SCALE_UP;
    b *= SCALE_UP;
    c *= SCALE_UP;
    d *= SCALE_UP;
    scale = SCALE_DOWN;
  }
  // the sum of squares as hi + lo, each square split exactly and added with its rounding error
  let hi = a * a;
  let lo = squareError(a, hi);
  for (let i = 0; i < 3; i++) {
    const v = i === 0 ? b : i === 1 ? c : d;
    const p = v * v;
    const q = squareError(v, p);
    const sum = hi + p;
    const back = sum - hi;
    lo += hi - (sum - back) + (p - back) + q;
    hi = sum;
  }
  const sum = hi + lo;
  lo -= sum - hi;
  hi = sum;
  // √(hi + lo): r = √hi, corrected by (hi + lo - r²)/(2r), r² taken exactly
  const r = Math.sqrt(hi);
  const rr = r * r;
  const correction = (hi - rr - squareError(r, rr) + lo) / (2 * r);
  return (r + correction) * scale;
}

// ---------------------------------------------------------------------------------------------
// Hyperbolic functions: below |x| = 0.5 by their Taylor series, above it from e^x and e^-x, each
// kept as two doubles, so that their sum, difference or quotient rounds only once.

// 1/n!, each rounded once (n! is exact as a double up to 18!)
const F2 = 1 / 2;
const F3 = 1 / 6;
const F4 = 1 / 24;
const F5 = 1 / 120;
const F6 = 1 / 720;
const F7 = 1 / 5040;
const F8 = 1 / 40320;
const F9 = 1 / 362880;
const F10 = 1 / 3628800;
const F11 = 1 / 39916800;
const F12 = 1 / 479001600;
const F13 = 1 / 6227020800;
const F14 = 1 / 87178291200;
const F15 = 1 / 1307674368000;
const F16 = 1 / 20922789888000;
const F17 = 1 / 355687428096000;
const F18 = 1 / 6402373705728000;

/** sinh(x) - x for |x| < 0.5 (z = x²): the series' terms from x³/3! to x^17/17!. */
const sinhTail = (x: number, z: number) => x * z * (F3 + z * (F5 + z * (F7 + z * (F9 + z * (F11 + z * (F13 + z * (F15 + z * F17)))))));
/** cosh(x) - 1 for |x| < 0.5 (z = x²): the series' terms from x²/2! to x^18/18!. */
const coshTail = (z: number) => z * (F2 + z * (F4 + z * (F6 + z * (F8 + z * (F10 + z * (F12 + z * (F14 + z * (F16 + z * F18))))))));

/**
 * e^x = 2^k · (expParts[0] + expParts[1]) for 0.5 ≤ x ≤ 711, the two parts true to about 2^-58 of
 * their sum, which lies in [√2/2, √2]; returns k. x - k ln2 is reduced as exp does it, its rounding
 * error kept, and e^r summed as 1 + r + r²/2 (r² exact) + r³ · (1/3! + … + r^11/14!).
 */
const expParts = new Float64Array(2);
function expSplit(x: number): number {
  const k = Math.round(x * INV_LN2);
  const rh = x - k * LN2_HI; // exact
  const t = k * LN2_LO;
  const r = rh - t;
  const back = r - rh;
  const rt = rh - (r - back) - (t + back); // r + rt = rh - t exactly
  const r2 = r * r;
  const r2e = squareError(r, r2);
  const tail = r * r2 * (F3 + r * (F4 + r * (F5 + r * (F6 + r * (F7 + r * (F8 + r * (F9 + r * (F10 + r * (F11 + r * (F12 + r * (F13 + r * F14)))))))))));
  const s1 = 1 + r;
  const e1 = 1 - s1 + r;
  const half = 0.5 * r2;
  const s2 = s1 + half;
  const e2 = s1 - s2 + half;
  const lo = e1 + e2 + 0.5 * r2e + tail + rt * s1;
  const hi = s2 + lo;
  expParts[0] = hi;
  expParts[1] = s2 - hi + lo;
  return k;
}

/**
 * For 0.5 ≤ x ≤ 711: e^x and e^-x as 2^k · (eh + el) and 2^-k · (ih + il); leaves in `hyperParts`
 * the sum (cosh) or difference (sinh) of their mantissas as two parts, both scaled by 2^k: returns k.
 */
const hyperParts = new Float64Array(4);
function hyperSplit(x: number): number {
  const k = expSplit(x);
  const eh = expParts[0];
  const el = expParts[1];
  // 1/(eh + el) in two parts
  const ih = 1 / eh;
  const p = ih * eh;
  const il = ih * (1 - p - productError(ih, eh, p) - el * ih);
  // e^-x relative to e^x: 2^-2k · (ih + il)
  const f = 2 * k <= 1022 ? fromWords((0x3ff - 2 * k) << 20, 0) : 0;
  const a = f * ih;
  const b = f * il;
  // cosh: eh + el + a + b
  const c = eh + a;
  hyperParts[0] = c;
  hyperParts[1] = eh - c + a + el + b;
  // sinh: eh + el - a - b
  const s = eh - a;
  hyperParts[2] = s;
  hyperParts[3] = eh - s - a + el - b;
  return k;
}

/** Above it, sinh and cosh overflow. */
const HYPER_OVERFLOW = 711;

/** sinh(x). */
export function sinh(x: number): number {
  const ax = Math.abs(x);
  if (ax < 0.5) return x + sinhTail(x, x * x); // NaN and ±0 come through as they are
  if (ax > HYPER_OVERFLOW) return x; // ±Infinity
  const k = hyperSplit(ax);
  const m = scalbn(hyperParts[2] + hyperParts[3], k - 1);
  return x < 0 ? -m : m;
}

/** cosh(x). */
export function cosh(x: number): number {
  const ax = Math.abs(x);
  if (ax < 0.5) return 1 + coshTail(x * x);
  if (ax > HYPER_OVERFLOW) return ax; // Infinity, NaN
  const k = hyperSplit(ax);
  return scalbn(hyperParts[0] + hyperParts[1], k - 1);
}

/** tanh(x). */
export function tanh(x: number): number {
  const ax = Math.abs(x);
  if (ax < TWOM27) return x; // tanh(x) = x - x³/3 rounds to x; ±0 too
  let t: number;
  if (ax < 0.5) {
    const z = x * x;
    const s = sinhTail(ax, z);
    const n = ax + s;
    const c = coshTail(z);
    const d = 1 + c;
    t = divideParts(n, ax - n + s, d, 1 - d + c);
  } else if (ax < 22) {
    hyperSplit(ax);
    t = divideParts(hyperParts[2], hyperParts[3], hyperParts[0], hyperParts[1]);
  } else {
    if (ax !== ax) return x; // NaN
    t = 1; // 1 - 2e^-2x rounds to 1
  }
  return x < 0 ? -t : t;
}
