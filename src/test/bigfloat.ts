/**
 * Binary floating point of any precision in integers (`BigInt`), as the independent reference of
 * `src/detmath.test.ts`: every function here is computed from its defining series with 64 bits
 * more than it is compared at, so a reference value is off by far less than a thousandth of an ulp
 * of a double. Nothing here shares code or constants with `src/detmath.ts`: π comes from Machin's
 * formula, ln 2 from the series of atanh, and the reductions run in integers to whatever precision
 * the argument needs.
 */

/** A value m · 2^e. */
export interface Big {
  m: bigint;
  e: number;
}

/** The bits a result keeps. */
const PRECISION = 192;
/** Bits of π and 2/π for the reduction of an angle: enough for the largest double. */
const PI_BITS = 1400;

export const ZERO: Big = { m: 0n, e: 0 };
const ONE: Big = { m: 1n, e: 0 };

const abs = (m: bigint) => (m < 0n ? -m : m);

/** The number of bits of a positive integer. */
export function bitLength(m: bigint): number {
  const hex = m.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

/** m · 2^e rounded to `precision` bits. */
function norm(m: bigint, e: number, precision = PRECISION): Big {
  if (m === 0n) return ZERO;
  const negative = m < 0n;
  let a = negative ? -m : m;
  const length = bitLength(a);
  if (length > precision) {
    const shift = BigInt(length - precision);
    a = (a + (1n << (shift - 1n))) >> shift;
    e += length - precision;
  }
  return { m: negative ? -a : a, e };
}

const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;

/** A finite double exactly. */
export function fromNumber(x: number): Big {
  bits[0] = x;
  const hi = words[HI];
  const lo = words[1 - HI];
  const exponent = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e = -1074;
  if (exponent > 0) {
    m |= 1n << 52n;
    e = exponent - 1075;
  }
  return norm(hi >>> 31 ? -m : m, e);
}

export const isZero = (a: Big) => a.m === 0n;
export const neg = (a: Big): Big => ({ m: -a.m, e: a.e });
export const sign = (a: Big) => (a.m < 0n ? -1 : a.m > 0n ? 1 : 0);

export function add(a: Big, b: Big): Big {
  if (a.m === 0n) return b;
  if (b.m === 0n) return a;
  if (a.e >= b.e) return norm((a.m << BigInt(a.e - b.e)) + b.m, b.e);
  return norm(a.m + (b.m << BigInt(b.e - a.e)), a.e);
}
export const sub = (a: Big, b: Big) => add(a, neg(b));
export const mul = (a: Big, b: Big) => norm(a.m * b.m, a.e + b.e);
/** a · 2^n, exact. */
const scale = (a: Big, n: number): Big => ({ m: a.m, e: a.e + n });

export function div(a: Big, b: Big): Big {
  if (a.m === 0n) return ZERO;
  const k = Math.max(0, PRECISION + 8 + bitLength(abs(b.m)) - bitLength(abs(a.m)));
  return norm((a.m << BigInt(k)) / b.m, a.e - b.e - k);
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLength(n) >> 1) + 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

export function sqrt(a: Big): Big {
  if (a.m === 0n) return ZERO;
  let k = Math.max(0, 2 * PRECISION + 8 - bitLength(a.m));
  if ((a.e - k) % 2 !== 0) k++;
  return norm(isqrt(a.m << BigInt(k)), (a.e - k) / 2);
}

export const compare = (a: Big, b: Big) => sign(sub(a, b));
/** 2^1024 - 2^970: the largest double plus half its ulp, from where a result rounds to Infinity. */
const OVERFLOW: Big = { m: (1n << 54n) - 1n, e: 970 };

/** floor(log2 |a|): the exponent of a's leading bit. */
export const exponentOf = (a: Big) => bitLength(abs(a.m)) - 1 + a.e;

/** The nearest double, for messages and the choice of a reduction (not for the comparisons). */
export function approx(a: Big): number {
  if (a.m === 0n) return 0;
  const length = bitLength(abs(a.m));
  const top = Number(a.m >> BigInt(Math.max(0, length - 60))); // at most 60 bits
  let e = a.e + Math.max(0, length - 60);
  let v = top;
  while (e > 0) {
    const step = Math.min(e, 1000);
    v *= power2Number(step);
    e -= step;
  }
  while (e < 0) {
    const step = Math.min(-e, 1000);
    v /= power2Number(step);
    e += step;
  }
  return v;
}
function power2Number(n: number): number {
  let v = 1;
  for (let i = 0; i < n; i++) v *= 2;
  return v;
}

/**
 * How far a double lies from the true value, in ulps of the true value (the gap between the
 * doubles around it; 2^-1074 among the subnormal numbers).
 */
export function ulpError(got: number, truth: Big): number {
  // beyond the largest double and half its ulp the result rounds to Infinity
  const overflows = compare(truth.m < 0n ? neg(truth) : truth, OVERFLOW) >= 0;
  if (got === Infinity || got === -Infinity || overflows) return overflows && (got < 0) === (truth.m < 0n) && !Number.isFinite(got) ? 0 : Infinity;
  const diff = sub(fromNumber(got), truth);
  if (diff.m === 0n) return 0;
  const ulpExponent = Math.max(exponentOf(truth) - 52, -1074);
  const shift = diff.e - ulpExponent;
  if (shift >= 0) return shift > 64 ? Infinity : Math.abs(Number(diff.m << BigInt(shift)));
  if (-shift > 2000) return 0;
  return Math.abs(Number(diff.m) / Number(1n << BigInt(-shift)));
}

// ---------------------------------------------------------------------------------------------
// Constants, from their own series in fixed point

/** atan(1/n) · 2^bits. */
function atanInverse(n: bigint, bitCount: number): bigint {
  const one = 1n << BigInt(bitCount);
  const n2 = n * n;
  let term = one / n;
  let sum = term;
  for (let k = 1n; term !== 0n; k++) {
    term /= n2;
    sum += (k % 2n === 1n ? -1n : 1n) * (term / (2n * k + 1n));
  }
  return sum;
}
/** atanh(1/n) · 2^bits. */
function atanhInverse(n: bigint, bitCount: number): bigint {
  const one = 1n << BigInt(bitCount);
  const n2 = n * n;
  let term = one / n;
  let sum = term;
  for (let k = 1n; term !== 0n; k++) {
    term /= n2;
    sum += term / (2n * k + 1n);
  }
  return sum;
}

const GUARD = 32; // bits of the fixed-point constants beyond what is kept
/** π · 2^PI_BITS (Machin: π = 16 atan(1/5) - 4 atan(1/239)). */
export const PI_FIXED = (16n * atanInverse(5n, PI_BITS + GUARD) - 4n * atanInverse(239n, PI_BITS + GUARD)) >> BigInt(GUARD);
/** 2/π · 2^PI_BITS. */
const TWO_OVER_PI_FIXED = (1n << BigInt(2 * PI_BITS + 1)) / PI_FIXED;
export const PI: Big = norm(PI_FIXED, -PI_BITS);
const PI_HALF = scale(PI, -1);
/** ln 2 = 2 atanh(1/3). */
const LN2_FIXED = (2n * atanhInverse(3n, 640 + GUARD)) >> BigInt(GUARD);
export const LN2: Big = norm(LN2_FIXED, -640);

// ---------------------------------------------------------------------------------------------
// Functions

/** Sums the terms of a series until they no longer change the precision kept. */
function series(first: Big, next: (term: Big, k: number) => Big): Big {
  let sum = first;
  let term = first;
  for (let k = 1; ; k++) {
    term = next(term, k);
    if (term.m === 0n || exponentOf(term) < exponentOf(sum) - PRECISION - 8) return sum;
    sum = add(sum, term);
  }
}

export function exp(x: Big): Big {
  if (x.m === 0n) return ONE;
  // x = k ln2 + r with |r| ≤ ln2/2, ln2 to 640 bits: enough for |k| up to 2^60
  const k = Math.round(approx(x) / 0.6931471805599453);
  const r = sub(x, norm(BigInt(k) * LN2_FIXED, -640, PRECISION + 80));
  // e^r = (e^(r / 2^10))^(2^10)
  const small = scale(r, -10);
  let y = series(ONE, (term, n) => div(mul(term, small), { m: BigInt(n), e: 0 }));
  for (let i = 0; i < 10; i++) y = mul(y, y);
  return scale(y, k);
}

/** e^x - 1 without cancellation near 0. */
export function expm1(x: Big): Big {
  if (exponentOf(x) >= -1 || x.m === 0n) return sub(exp(x), ONE);
  return series(x, (term, n) => div(mul(term, x), { m: BigInt(n + 1), e: 0 }));
}

/** 2 atanh(z) by its series, for |z| ≤ 1/2. */
function twoAtanh(z: Big): Big {
  const z2 = mul(z, z);
  let power = z;
  return scale(
    series(z, (_, k) => {
      power = mul(power, z2);
      return div(power, { m: BigInt(2 * k + 1), e: 0 });
    }),
    1,
  );
}

export function log(x: Big): Big {
  // x = f · 2^n with f in [√2/2, √2)
  let n = exponentOf(x);
  let f = scale(x, -n);
  if (compare(f, { m: 181n, e: -7 }) > 0) {
    f = scale(f, -1);
    n++;
  }
  const z = div(sub(f, ONE), add(f, ONE));
  return add(mul({ m: BigInt(n), e: 0 }, LN2), twoAtanh(z));
}

/** log(1 + x) without cancellation near 0. */
export function log1p(x: Big): Big {
  if (exponentOf(x) >= -1) return log(add(ONE, x));
  return twoAtanh(div(x, add({ m: 2n, e: 0 }, x)));
}

/** sin and cos of a double: the angle reduced by π/2 in integers, then the Taylor series. */
function sinCos(x: number): { sin: Big; cos: Big } {
  const big = fromNumber(x);
  // x · 2/π exactly enough: m · (2/π · 2^PI_BITS) · 2^(e - PI_BITS)
  const product = big.m * TWO_OVER_PI_FIXED;
  const shift = PI_BITS - big.e;
  let quadrant: bigint;
  let fraction: Big;
  if (shift > 0) {
    const s = BigInt(shift);
    quadrant = (product + (1n << (s - 1n))) >> s; // round to the nearest integer
    fraction = norm(product - (quadrant << s), -shift);
  } else {
    quadrant = product << BigInt(-shift);
    fraction = ZERO;
  }
  const r = mul(fraction, PI_HALF);
  const r2 = mul(r, r);
  const sinR = series(r, (term, k) => neg(div(mul(term, r2), { m: BigInt(2 * k * (2 * k + 1)), e: 0 })));
  const cosR = series(ONE, (term, k) => neg(div(mul(term, r2), { m: BigInt((2 * k - 1) * 2 * k), e: 0 })));
  switch (Number(((quadrant % 4n) + 4n) % 4n)) {
    case 0:
      return { sin: sinR, cos: cosR };
    case 1:
      return { sin: cosR, cos: neg(sinR) };
    case 2:
      return { sin: neg(sinR), cos: neg(cosR) };
    default:
      return { sin: neg(cosR), cos: sinR };
  }
}
export const sin = (x: number) => sinCos(x).sin;
export const cos = (x: number) => sinCos(x).cos;
export function tan(x: number): Big {
  const { sin: s, cos: c } = sinCos(x);
  return div(s, c);
}

export function atan(x: Big): Big {
  if (x.m === 0n) return ZERO;
  if (x.m < 0n) return neg(atan(neg(x)));
  if (compare(x, ONE) > 0) return sub(PI_HALF, atan(div(ONE, x)));
  // atan(x) = 2 atan(x / (1 + √(1 + x²))), four times
  let y = x;
  for (let i = 0; i < 4; i++) y = div(y, add(ONE, sqrt(add(ONE, mul(y, y)))));
  const y2 = mul(y, y);
  let power = y;
  const sum = series(y, (_, k) => {
    power = neg(mul(power, y2));
    return div(power, { m: BigInt(2 * k + 1), e: 0 });
  });
  return scale(sum, 4);
}

export function atan2(y: Big, x: Big): Big {
  if (x.m === 0n) return y.m < 0n ? neg(PI_HALF) : PI_HALF;
  const base = atan(div(y, x));
  if (x.m > 0n) return base;
  return y.m < 0n ? sub(base, PI) : add(base, PI);
}

export function asin(x: Big): Big {
  const oneMinus = sub(ONE, x);
  const onePlus = add(ONE, x);
  if (oneMinus.m === 0n) return PI_HALF;
  if (onePlus.m === 0n) return neg(PI_HALF);
  return atan(div(x, sqrt(mul(oneMinus, onePlus))));
}

export function acos(x: Big): Big {
  const onePlus = add(ONE, x);
  if (onePlus.m === 0n) return PI;
  return scale(atan(sqrt(div(sub(ONE, x), onePlus))), 1);
}

export function sinh(x: Big): Big {
  if (exponentOf(x) >= 0) return scale(sub(exp(x), exp(neg(x))), -1);
  const x2 = mul(x, x);
  return series(x, (term, k) => div(mul(term, x2), { m: BigInt(2 * k * (2 * k + 1)), e: 0 }));
}
export const cosh = (x: Big) => scale(add(exp(x), exp(neg(x))), -1);
export function tanh(x: Big): Big {
  return div(sinh(x), cosh(x));
}

export function pow(x: Big, y: Big): Big {
  if (x.m === 0n) return ZERO;
  const magnitude = exp(mul(y, log(x.m < 0n ? neg(x) : x)));
  if (x.m > 0n) return magnitude;
  // a negative x: y is an integer here; its parity gives the sign
  const integer = y.e >= 0 ? y.m << BigInt(y.e) : y.m >> BigInt(-y.e);
  return integer % 2n === 0n ? magnitude : neg(magnitude);
}

export function cbrt(x: Big): Big {
  if (x.m === 0n) return ZERO;
  if (x.m < 0n) return neg(cbrt(neg(x)));
  return exp(div(log(x), { m: 3n, e: 0 }));
}

export function hypot(...values: number[]): Big {
  let sum = ZERO;
  for (const v of values) {
    const b = fromNumber(v);
    sum = add(sum, norm(b.m * b.m, 2 * b.e, 4 * PRECISION));
  }
  return sqrt(sum);
}

export const log2 = (x: Big) => div(log(x), LN2);
const LN10 = log({ m: 10n, e: 0 });
export const log10 = (x: Big) => div(log(x), LN10);
