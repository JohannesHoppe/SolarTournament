import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as dm from './detmath';
import * as ref from './test/bigfloat';
import type { Big } from './test/bigfloat';

// ---------------------------------------------------------------------------------------------
// Inputs: doubles from a fixed generator, in ranges and over the bits of their exponents

const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const fromWords = (hi: number, lo: number) => {
  words[HI] = hi;
  words[1 - HI] = lo;
  return bits[0];
};
/** 2^e for a normal exponent, exactly. */
const pow2 = (e: number) => fromWords((e + 1023) << 20, 0);

/** The double |steps| doubles away from x, towards +Infinity for steps > 0. */
function nextAfter(x: number, steps: number): number {
  bits[0] = x;
  let value = (BigInt(words[HI]) << 32n) | BigInt(words[1 - HI]);
  const magnitude = value & 0x7fffffffffffffffn;
  let ordinal = value >> 63n === 1n ? -magnitude : magnitude;
  ordinal += BigInt(steps);
  value = ordinal < 0n ? (1n << 63n) | -ordinal : ordinal;
  return fromWords(Number(value >> 32n), Number(value & 0xffffffffn));
}

/** xorshift32: a fixed sequence of 32-bit words, the same on every machine. */
function generator(seed: number) {
  let s = seed >>> 0 || 1;
  const word = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  /** Uniform in [0, 1) with 53 bits. */
  const unit = () => (word() * 2097152 + (word() >>> 11)) / 9007199254740992;
  return {
    word,
    unit,
    uniform: (lo: number, hi: number) => lo + (hi - lo) * unit(),
    /** A random mantissa with an exponent in [low, high] (2^low ≤ |x| < 2^(high + 1); below -1022 a subnormal), of either sign if asked. */
    exponent: (low: number, high: number, signed = false) => {
      const e = low + (word() % (high - low + 1));
      let x: number;
      if (e >= -1022) x = fromWords(((e + 1023) << 20) | (word() & 0xfffff), word());
      else {
        // a subnormal with its leading bit at 2^e
        const shift = -1022 - e; // 1 … 52
        const mantissa = ((BigInt(word() & 0xfffff) << 32n) | BigInt(word()) | (1n << 52n)) >> BigInt(shift);
        x = fromWords(Number(mantissa >> 32n), Number(mantissa & 0xffffffffn));
      }
      return signed && word() & 1 ? -x : x;
    },
  };
}
type Generator = ReturnType<typeof generator>;

const sample = (seed: number, count: number, draw: (g: Generator) => number) => {
  const g = generator(seed);
  return Array.from({ length: count }, () => draw(g));
};

const N = 1200;
const big = ref.fromNumber;

/** The largest error in ulps over the inputs, and where. */
function worst<T>(inputs: T[], ours: (x: T) => number, truth: (x: T) => Big) {
  let max = 0;
  let at: T | undefined;
  for (const x of inputs) {
    const error = ref.ulpError(ours(x), truth(x));
    if (!(error <= max)) {
      max = error;
      at = x;
    }
  }
  return { max, at };
}

/** Expects every input within 1 ulp of the true value. */
function accurate(name: string, inputs: number[], ours: (x: number) => number, truth: (x: number) => Big) {
  const { max, at } = worst(inputs, ours, truth);
  report(name, max);
  expect.soft(max, `${name}: ${max} ulp at ${at}`).toBeLessThanOrEqual(1);
}
/** DETMATH_REPORT=1 lists the largest error of every range. */
const report = (name: string, max: number) => {
  if (process.env.DETMATH_REPORT) console.log(`${name.padEnd(40)} ${max.toFixed(3)} ulp`);
};
const viaBig = (f: (x: Big) => Big) => (x: number) => f(big(x));

/** The nearest double of a reference value (to a few bits beyond 53, enough for an input). */
const nearest = (b: Big) => ref.approx(b);

// multiples of π/2 as doubles and their neighbours: the reductions where x - nπ/2 cancels most
const nearPio2 = sample(11, N, (g) => {
  const n = 1 + (g.word() % 200000);
  return nextAfter(nearest(ref.mul({ m: BigInt(n), e: -1 }, ref.PI)), (g.word() % 9) - 4) * (g.word() & 1 ? -1 : 1);
});
const nearPio2Huge = sample(12, 200, (g) => {
  const x = g.exponent(21, 1000);
  // the double nearest the multiple of π/2 nearest x
  const n = ref.div(big(x), ref.mul({ m: 1n, e: -1 }, ref.PI));
  const integer = n.e >= 0 ? n.m << BigInt(n.e) : n.m >> BigInt(-n.e);
  return nextAfter(nearest(ref.mul({ m: integer, e: -1 }, ref.PI)), (g.word() % 5) - 2);
});
/** The double closest to a multiple of π/2 (found by Kahan and McDonald): x - nπ/2 ≈ 2^-61. */
const HARDEST = 6381956970095103 * pow2(797);

describe('the reference', () => {
  it('has π to its last bit and the known correctly rounded values', () => {
    // π in hexadecimal, 122 bits of it (3.243f6a8885a308d313198a2e0370734…)
    expect((ref.PI_FIXED >> 1280n).toString(16)).toBe('3243f6a8885a308d313198a2e037073');
    // doubles known to be the correctly rounded values: within half an ulp of the reference
    const known: [Big, number][] = [
      [ref.exp(big(1)), 2.718281828459045],
      [ref.log(big(10)), 2.302585092994046],
      [ref.sin(1), 0.8414709848078965],
      [ref.cos(1), 0.5403023058681398],
      [ref.atan(big(1)), 0.7853981633974483],
      [ref.sin(1e22), -0.8522008497671888],
      [ref.LN2, 0.6931471805599453],
    ];
    for (const [truth, value] of known) expect(ref.ulpError(value, truth)).toBeLessThan(0.5);
  });
});

describe('detmath: within 1 ulp of the true value', () => {
  it('sin', () => {
    accurate('sin |x| < π/4', sample(1, N, (g) => g.uniform(-0.79, 0.79)), dm.sin, ref.sin);
    accurate('sin ±10', sample(2, N, (g) => g.uniform(-10, 10)), dm.sin, ref.sin);
    accurate('sin ±2e6', sample(3, N, (g) => g.uniform(-2e6, 2e6)), dm.sin, ref.sin);
    accurate('sin huge', sample(4, N, (g) => g.exponent(20, 1023, true)), dm.sin, ref.sin);
    accurate('sin tiny', sample(5, N, (g) => g.exponent(-1074, -1, true)), dm.sin, ref.sin);
    accurate('sin near nπ/2', nearPio2, dm.sin, ref.sin);
    accurate('sin near nπ/2, huge', nearPio2Huge, dm.sin, ref.sin);
    accurate('sin hardest', [HARDEST, -HARDEST, 1e22, 1.7976931348623157e308], dm.sin, ref.sin);
  });

  it('cos', () => {
    accurate('cos |x| < π/4', sample(21, N, (g) => g.uniform(-0.79, 0.79)), dm.cos, ref.cos);
    accurate('cos ±10', sample(22, N, (g) => g.uniform(-10, 10)), dm.cos, ref.cos);
    accurate('cos ±2e6', sample(23, N, (g) => g.uniform(-2e6, 2e6)), dm.cos, ref.cos);
    accurate('cos huge', sample(24, N, (g) => g.exponent(20, 1023, true)), dm.cos, ref.cos);
    accurate('cos tiny', sample(25, N, (g) => g.exponent(-1074, -1, true)), dm.cos, ref.cos);
    accurate('cos near nπ/2', nearPio2, dm.cos, ref.cos);
    accurate('cos near nπ/2, huge', nearPio2Huge, dm.cos, ref.cos);
    accurate('cos hardest', [HARDEST, -HARDEST, 1e22, 1.7976931348623157e308], dm.cos, ref.cos);
  });

  it('tan, also at its poles', () => {
    accurate('tan |x| < π/4', sample(31, N, (g) => g.uniform(-0.79, 0.79)), dm.tan, ref.tan);
    accurate('tan near ±0.6744', sample(32, N, (g) => g.uniform(0.66, 0.69) * (g.word() & 1 ? -1 : 1)), dm.tan, ref.tan);
    accurate('tan ±10', sample(33, N, (g) => g.uniform(-10, 10)), dm.tan, ref.tan);
    accurate('tan huge', sample(34, N, (g) => g.exponent(20, 1023, true)), dm.tan, ref.tan);
    accurate('tan tiny', sample(35, N, (g) => g.exponent(-1074, -1, true)), dm.tan, ref.tan);
    accurate('tan near nπ/2 (its poles and zeros)', nearPio2, dm.tan, ref.tan);
    accurate('tan hardest', [HARDEST, -HARDEST, 1e22], dm.tan, ref.tan);
  });

  it('asin and acos, also at ±1', () => {
    const inside = sample(41, N, (g) => g.uniform(-1, 1));
    const nearOne = sample(42, N, (g) => (1 - g.exponent(-53, -2)) * (g.word() & 1 ? -1 : 1));
    const nearHalf = sample(43, N, (g) => g.uniform(0.45, 0.55) * (g.word() & 1 ? -1 : 1));
    const nearBreak = sample(44, N, (g) => g.uniform(0.97, 0.98) * (g.word() & 1 ? -1 : 1));
    const tiny = sample(45, N, (g) => g.exponent(-1074, -2, true));
    for (const [name, inputs] of [['inside', inside], ['near ±1', nearOne], ['near ±0.5', nearHalf], ['near ±0.975', nearBreak], ['tiny', tiny]] as const) {
      accurate(`asin ${name}`, [...inputs], dm.asin, viaBig(ref.asin));
      accurate(`acos ${name}`, [...inputs], dm.acos, viaBig(ref.acos));
    }
    accurate('asin ±1', [1, -1], dm.asin, viaBig(ref.asin));
    accurate('acos ±1', [1, -1], dm.acos, viaBig(ref.acos));
  });

  it('atan', () => {
    accurate('atan ±1', sample(51, N, (g) => g.uniform(-1, 1)), dm.atan, viaBig(ref.atan));
    accurate('atan ±1e3', sample(52, N, (g) => g.uniform(-1e3, 1e3)), dm.atan, viaBig(ref.atan));
    accurate('atan all exponents', sample(53, N, (g) => g.exponent(-1074, 1023, true)), dm.atan, viaBig(ref.atan));
    // the edges of its reductions: 7/16, 11/16, 19/16, 39/16
    const edges = sample(54, N, (g) => nextAfter([0.4375, 0.6875, 1.1875, 2.4375][g.word() % 4], (g.word() % 2001) - 1000) * (g.word() & 1 ? -1 : 1));
    accurate('atan at its breakpoints', edges, dm.atan, viaBig(ref.atan));
  });

  it('atan2 in every quadrant', () => {
    const g = generator(61);
    const pairs: [number, number][] = [];
    for (let i = 0; i < N; i++) pairs.push([g.uniform(-10, 10), g.uniform(-10, 10)]);
    for (let i = 0; i < N; i++) pairs.push([g.exponent(-1074, 1023, true), g.exponent(-1074, 1023, true)]);
    for (let i = 0; i < 300; i++) {
      const x = g.uniform(-10, 10);
      pairs.push([nextAfter(x, (g.word() % 5) - 2), x]); // along the diagonals
      pairs.push([g.exponent(-80, 80, true), g.exponent(-1074, -1000, true)]); // nearly on the y axis
    }
    const { max, at } = worst(pairs, ([y, x]) => dm.atan2(y, x), ([y, x]) => ref.atan2(big(y), big(x)));
    report('atan2', max);
    expect(max, `atan2: ${max} ulp at ${at}`).toBeLessThanOrEqual(1);
  });

  it('exp, up to its overflow and down into the subnormal numbers', () => {
    accurate('exp ±1', sample(71, N, (g) => g.uniform(-1, 1)), dm.exp, viaBig(ref.exp));
    accurate('exp full range', sample(72, N, (g) => g.uniform(-745.1, 709.78)), dm.exp, viaBig(ref.exp));
    accurate('exp near overflow', sample(73, N, (g) => g.uniform(708, 709.782712893384)), dm.exp, viaBig(ref.exp));
    accurate('exp subnormal results', sample(74, N, (g) => g.uniform(-745.13, -708)), dm.exp, viaBig(ref.exp));
    accurate('exp tiny', sample(75, N, (g) => g.exponent(-1074, -2, true)), dm.exp, viaBig(ref.exp));
  });

  it('expm1', () => {
    accurate('expm1 ±1', sample(81, N, (g) => g.uniform(-1, 1)), dm.expm1, viaBig(ref.expm1));
    accurate('expm1 -40 … 709', sample(82, N, (g) => g.uniform(-40, 709.78)), dm.expm1, viaBig(ref.expm1));
    accurate('expm1 tiny', sample(83, N, (g) => g.exponent(-1074, -2, true)), dm.expm1, viaBig(ref.expm1));
  });

  it('log, log2 and log10, also near 1 and among the subnormal numbers', () => {
    const all = sample(91, N, (g) => g.exponent(-1074, 1023));
    const nearOne = sample(92, N, (g) => nextAfter(1, (g.word() % 2000001) - 1000000));
    const near1 = sample(93, N, (g) => g.uniform(0.7, 1.45));
    for (const [name, inputs] of [['every exponent', all], ['next to 1', nearOne], ['around 1', near1]] as const) {
      accurate(`log ${name}`, [...inputs], dm.log, viaBig(ref.log));
      accurate(`log2 ${name}`, [...inputs], dm.log2, viaBig(ref.log2));
      accurate(`log10 ${name}`, [...inputs], dm.log10, viaBig(ref.log10));
    }
  });

  it('log1p', () => {
    accurate('log1p -1 … 1', sample(101, N, (g) => g.uniform(-1, 1)), dm.log1p, viaBig(ref.log1p));
    accurate('log1p next to -1', sample(102, N, (g) => nextAfter(-1, 1 + (g.word() % 100000))), dm.log1p, viaBig(ref.log1p));
    accurate('log1p tiny', sample(103, N, (g) => g.exponent(-1074, -2, true)), dm.log1p, viaBig(ref.log1p));
    accurate('log1p large', sample(104, N, (g) => g.exponent(0, 1023)), dm.log1p, viaBig(ref.log1p));
  });

  it('pow, over its whole range', () => {
    const g = generator(111);
    const pairs: [number, number][] = [];
    for (let i = 0; i < N; i++) pairs.push([g.uniform(0, 10), g.uniform(-100, 100)]);
    for (let i = 0; i < N; i++) pairs.push([g.exponent(-1074, 1023), g.uniform(-1.2, 1.2)]);
    for (let i = 0; i < 400; i++) pairs.push([-g.uniform(0, 10), (g.word() % 201) - 100]); // a negative base, an integer power
    for (let i = 0; i < 400; i++) pairs.push([nextAfter(1, (g.word() % 2001) - 1000), g.uniform(-1, 1) * pow2(40)]); // x near 1, y huge
    for (let i = 0; i < 400; i++) pairs.push([g.uniform(1.5, 2), g.uniform(1000, 1024) * (g.word() & 1 ? 1 : -1.05)]); // near overflow and into the subnormal numbers
    for (let i = 0; i < 400; i++) pairs.push([g.uniform(0, 100), (g.word() % 41) - 20]); // integer powers
    const { max, at } = worst(pairs, ([x, y]) => dm.pow(x, y), ([x, y]) => ref.pow(big(x), big(y)));
    report('pow', max);
    expect(max, `pow: ${max} ulp at ${at}`).toBeLessThanOrEqual(1);
  });

  it('sinh, cosh and tanh', () => {
    const small = sample(121, N, (g) => g.uniform(-1, 1));
    const medium = sample(122, N, (g) => g.uniform(-25, 25));
    const tiny = sample(123, N, (g) => g.exponent(-1074, -2, true));
    const large = sample(124, N, (g) => g.uniform(-710.47, 710.47));
    for (const [name, inputs] of [['±1', small], ['±25', medium], ['tiny', tiny], ['up to overflow', large]] as const) {
      accurate(`sinh ${name}`, [...inputs], dm.sinh, viaBig(ref.sinh));
      accurate(`cosh ${name}`, [...inputs], dm.cosh, viaBig(ref.cosh));
      accurate(`tanh ${name}`, [...inputs], dm.tanh, viaBig(ref.tanh));
    }
  });

  it('cbrt', () => {
    accurate('cbrt every exponent', sample(131, N, (g) => g.exponent(-1074, 1023, true)), dm.cbrt, viaBig(ref.cbrt));
    accurate('cbrt ±1000', sample(132, N, (g) => g.uniform(-1000, 1000)), dm.cbrt, viaBig(ref.cbrt));
  });

  it('hypot of two, three and four values, from the subnormal numbers to the largest', () => {
    const g = generator(141);
    const sets: number[][] = [];
    for (let k = 2; k <= 4; k++) {
      for (let i = 0; i < N / 2; i++) sets.push(Array.from({ length: k }, () => g.uniform(-100, 100)));
      for (let i = 0; i < N / 2; i++) sets.push(Array.from({ length: k }, () => g.exponent(-1074, 1023, true)));
      const e = (g.word() % 2000) - 1000;
      for (let i = 0; i < N / 4; i++) sets.push(Array.from({ length: k }, () => g.exponent(e - 30, Math.min(e + 30, 1023), true)));
    }
    const { max, at } = worst(
      sets,
      (v) => dm.hypot(v[0], v[1], v[2], v[3]),
      (v) => ref.hypot(...v),
    );
    report('hypot', max);
    expect(max, `hypot: ${max} ulp at ${at}`).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------

/** x and y the same number, telling -0 from +0 and taking NaN as NaN. */
const same = (x: number, y: number) => Object.is(x, y);
const Inf = Infinity;

describe('detmath: special values as JavaScript defines them', () => {
  const cases: [string, (x: number) => number, [number, number][]][] = [
    ['sin', dm.sin, [[NaN, NaN], [0, 0], [-0, -0], [Inf, NaN], [-Inf, NaN]]],
    ['cos', dm.cos, [[NaN, NaN], [0, 1], [-0, 1], [Inf, NaN], [-Inf, NaN]]],
    ['tan', dm.tan, [[NaN, NaN], [0, 0], [-0, -0], [Inf, NaN], [-Inf, NaN]]],
    ['asin', dm.asin, [[NaN, NaN], [0, 0], [-0, -0], [1.0000000000000002, NaN], [-1.0000000000000002, NaN], [Inf, NaN], [-Inf, NaN]]],
    ['acos', dm.acos, [[NaN, NaN], [1, 0], [1.0000000000000002, NaN], [-1.0000000000000002, NaN], [Inf, NaN], [-Inf, NaN]]],
    ['atan', dm.atan, [[NaN, NaN], [0, 0], [-0, -0], [Inf, 1.5707963267948966], [-Inf, -1.5707963267948966]]],
    ['exp', dm.exp, [[NaN, NaN], [0, 1], [-0, 1], [Inf, Inf], [-Inf, 0], [709.8, Inf], [-746, 0]]],
    ['expm1', dm.expm1, [[NaN, NaN], [0, 0], [-0, -0], [Inf, Inf], [-Inf, -1], [709.8, Inf], [-800, -1]]],
    ['log', dm.log, [[NaN, NaN], [0, -Inf], [-0, -Inf], [-1, NaN], [-5e-324, NaN], [1, 0], [Inf, Inf], [-Inf, NaN]]],
    ['log2', dm.log2, [[NaN, NaN], [0, -Inf], [-0, -Inf], [-1, NaN], [1, 0], [Inf, Inf], [-Inf, NaN]]],
    ['log10', dm.log10, [[NaN, NaN], [0, -Inf], [-0, -Inf], [-1, NaN], [1, 0], [Inf, Inf], [-Inf, NaN]]],
    ['log1p', dm.log1p, [[NaN, NaN], [0, 0], [-0, -0], [-1, -Inf], [-1.0000000000000002, NaN], [Inf, Inf], [-Inf, NaN]]],
    ['sinh', dm.sinh, [[NaN, NaN], [0, 0], [-0, -0], [Inf, Inf], [-Inf, -Inf], [711, Inf], [-711, -Inf]]],
    ['cosh', dm.cosh, [[NaN, NaN], [0, 1], [-0, 1], [Inf, Inf], [-Inf, Inf], [711, Inf], [-711, Inf]]],
    ['tanh', dm.tanh, [[NaN, NaN], [0, 0], [-0, -0], [Inf, 1], [-Inf, -1], [30, 1], [-30, -1]]],
    ['cbrt', dm.cbrt, [[NaN, NaN], [0, 0], [-0, -0], [Inf, Inf], [-Inf, -Inf], [27, 3], [-8, -2], [1, 1]]],
  ];
  for (const [name, f, table] of cases)
    it(name, () => {
      for (const [x, y] of table) expect(same(f(x), y), `${name}(${x}) = ${f(x)}, not ${y}`).toBe(true);
    });

  it('the exact values: log2 of a power of two, log10 of a power of ten, a perfect cube', () => {
    for (let e = -1074; e <= 1023; e++) {
      const x = e < -1022 ? pow2(-1022) / pow2(-1022 - e) : pow2(e);
      expect(dm.log2(x)).toBe(e);
    }
    let ten = 1;
    for (let k = 0; k <= 22; k++, ten *= 10) expect(dm.log10(ten)).toBe(k); // 10^k exact up to 10^22
    for (let k = -1000; k <= 1000; k++) expect(dm.cbrt(k * k * k)).toBe(k);
  });

  it('atan2 at ±0 and ±Infinity', () => {
    const pi = 3.141592653589793;
    const table: [number, number, number][] = [
      [NaN, 1, NaN], [1, NaN, NaN],
      [0, 1, 0], [-0, 1, -0], [0, 0, 0], [-0, 0, -0], [0, -0, pi], [-0, -0, -pi], [0, -1, pi], [-0, -1, -pi],
      [1, 0, pi / 2], [1, -0, pi / 2], [-1, 0, -pi / 2], [-1, -0, -pi / 2],
      [1, Inf, 0], [-1, Inf, -0], [1, -Inf, pi], [-1, -Inf, -pi],
      [Inf, 1, pi / 2], [-Inf, 1, -pi / 2], [Inf, -1, pi / 2], [-Inf, -1, -pi / 2],
      [Inf, Inf, pi / 4], [-Inf, Inf, -pi / 4], [Inf, -Inf, (3 * pi) / 4], [-Inf, -Inf, (-3 * pi) / 4],
    ];
    for (const [y, x, z] of table) expect(same(dm.atan2(y, x), z), `atan2(${y}, ${x}) = ${dm.atan2(y, x)}`).toBe(true);
  });

  it('hypot at ±0, ±Infinity and NaN', () => {
    expect(same(dm.hypot(0, 0), 0)).toBe(true);
    expect(same(dm.hypot(-0, -0, -0, -0), 0)).toBe(true);
    expect(dm.hypot(-3, 4)).toBe(5);
    expect(dm.hypot(Inf, NaN)).toBe(Inf);
    expect(dm.hypot(NaN, -Inf)).toBe(Inf);
    expect(dm.hypot(1, 2, NaN, -Inf)).toBe(Inf);
    expect(dm.hypot(1, NaN)).toBeNaN();
    expect(dm.hypot(1.7976931348623157e308, 1.7976931348623157e308)).toBe(Inf);
    expect(dm.hypot(5e-324, 0)).toBe(5e-324);
    expect(dm.hypot(1e300, 1e300)).toBe(1.4142135623730952e300);
  });

  /** Math.pow's table (ECMAScript, Number::exponentiate), for the special bases and exponents. */
  function specPow(x: number, y: number): number | undefined {
    const oddInteger = Number.isInteger(y) && Math.abs(y % 2) === 1;
    if (y !== y) return NaN;
    if (y === 0) return 1;
    if (x !== x) return NaN;
    if (x === Inf) return y > 0 ? Inf : 0;
    if (x === -Inf) return y > 0 ? (oddInteger ? -Inf : Inf) : oddInteger ? -0 : 0;
    if (same(x, 0)) return y > 0 ? 0 : Inf;
    if (same(x, -0)) return y > 0 ? (oddInteger ? -0 : 0) : oddInteger ? -Inf : Inf;
    if (y === Inf) return Math.abs(x) > 1 ? Inf : Math.abs(x) === 1 ? NaN : 0;
    if (y === -Inf) return Math.abs(x) > 1 ? 0 : Math.abs(x) === 1 ? NaN : Inf;
    if (x < 0 && !Number.isInteger(y)) return NaN;
    if (y === 1) return x;
    if (y === -1) return 1 / x;
    if (y === 2) return x * x;
    if (y === 0.5 && x >= 0) return Math.sqrt(x);
    if (Math.abs(x) === 1) return x < 0 && !oddInteger ? 1 : x;
    return undefined;
  }

  it('pow: every special base against every special exponent', () => {
    const values = [NaN, 0, -0, Inf, -Inf, 1, -1, 2, -2, 0.5, -0.5, 3, -3, 1.5, -1.5, 0.25, 1e-310, -1e-310, 1e308, -1e308, 2.5];
    for (const x of values)
      for (const y of values) {
        const expected = specPow(x, y);
        if (expected === undefined) continue;
        expect(same(dm.pow(x, y), expected), `pow(${x}, ${y}) = ${dm.pow(x, y)}, not ${expected}`).toBe(true);
      }
  });

  it('pow: an integer to an integer power is exact when representable', () => {
    for (let base = -30; base <= 30; base++)
      for (let n = 0; n <= 40; n++) {
        let exact = 1n;
        for (let i = 0; i < n; i++) exact *= BigInt(base);
        if (exact > 9007199254740992n || exact < -9007199254740992n) continue;
        expect(dm.pow(base, n), `${base}^${n}`).toBe(Number(exact));
      }
    for (let e = -1074; e <= 1023; e++) expect(dm.pow(2, e)).toBe(e < -1022 ? pow2(-1022) / pow2(-1022 - e) : pow2(e));
  });
});

// ---------------------------------------------------------------------------------------------

describe('detmath: identities', () => {
  const xs = sample(201, 20000, (g) => g.uniform(-1000, 1000));
  it('odd and even functions are exactly so', () => {
    for (const x of xs) {
      expect(dm.sin(-x)).toBe(-dm.sin(x));
      expect(dm.cos(-x)).toBe(dm.cos(x));
      expect(dm.tan(-x)).toBe(-dm.tan(x));
      expect(dm.atan(-x)).toBe(-dm.atan(x));
      expect(dm.sinh(-x / 100)).toBe(-dm.sinh(x / 100));
      expect(dm.cosh(-x / 100)).toBe(dm.cosh(x / 100));
      expect(dm.tanh(-x / 100)).toBe(-dm.tanh(x / 100));
      expect(dm.cbrt(-x)).toBe(-dm.cbrt(x));
      expect(dm.asin(-x / 1000)).toBe(-dm.asin(x / 1000));
      expect(dm.hypot(x, -x / 3)).toBe(dm.hypot(-x, x / 3));
    }
  });

  it('sin² + cos² = 1 within 2 ulps; atan2 mirrors exactly; exp(log x) and log(exp x) come back', () => {
    const g = generator(202);
    for (const x of xs) {
      const s = dm.sin(x);
      const c = dm.cos(x);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThanOrEqual(4.5e-16);
      const y = g.uniform(-1000, 1000);
      expect(dm.atan2(-y, x)).toBe(-dm.atan2(y, x));
      expect(dm.atan2(y, 1)).toBe(dm.atan(y));
      // the two angles of a point measured from either axis add up to π/2 (-3π/2 in the third quadrant)
      expect(Math.abs(dm.atan2(y, x) + dm.atan2(x, y) - (x < 0 && y < 0 ? -4.71238898038469 : 1.5707963267948966))).toBeLessThanOrEqual(3e-15);
      const p = Math.abs(x) + 1e-3;
      expect(Math.abs(dm.exp(dm.log(p)) / p - 1)).toBeLessThan(4e-15);
      expect(Math.abs(dm.log(dm.exp(x / 2)) - x / 2)).toBeLessThanOrEqual(1.2e-13);
      expect(Math.abs(dm.pow(p, 1 / 3) / dm.cbrt(p) - 1)).toBeLessThan(5e-16);
      expect(Math.abs(dm.tan(x) - s / c)).toBeLessThanOrEqual(4e-16 * Math.max(1, Math.abs(s / c)) * Math.max(1, Math.abs(s / c)));
    }
  });
});

// ---------------------------------------------------------------------------------------------

/** The first 16 hex digits of the SHA-256 of the results' bits. */
function digest(values: number[]): string {
  return createHash('sha256').update(new Uint8Array(Float64Array.from(values).buffer)).digest('hex').slice(0, 16);
}

describe('detmath: the same bits on every machine', () => {
  it('gives the pinned bits for a fixed set of inputs (run by the workflow CI on x64 and ARM, Linux and macOS)', () => {
    const g = generator(301);
    const wide = Array.from({ length: 4000 }, () => g.exponent(-1074, 1023, true));
    const angles = Array.from({ length: 4000 }, () => g.uniform(-20, 20));
    const units = Array.from({ length: 4000 }, () => g.uniform(-1, 1));
    const exps = Array.from({ length: 4000 }, () => g.uniform(-745, 709));
    const positive = wide.map(Math.abs);
    const hashes = {
      sin: digest([...angles.map(dm.sin), ...wide.map(dm.sin)]),
      cos: digest([...angles.map(dm.cos), ...wide.map(dm.cos)]),
      tan: digest([...angles.map(dm.tan), ...wide.map(dm.tan)]),
      asin: digest(units.map(dm.asin)),
      acos: digest(units.map(dm.acos)),
      atan: digest(wide.map(dm.atan)),
      atan2: digest(angles.map((y, i) => dm.atan2(y, angles[(i * 7 + 3) % angles.length]))),
      exp: digest(exps.map(dm.exp)),
      expm1: digest([...units.map(dm.expm1), ...exps.map(dm.expm1)]),
      log: digest(positive.map(dm.log)),
      log2: digest(positive.map(dm.log2)),
      log10: digest(positive.map(dm.log10)),
      log1p: digest([...units.map(dm.log1p), ...positive.map(dm.log1p)]),
      pow: digest(angles.map((y, i) => dm.pow(Math.abs(units[i]) * 10, y * 5))),
      sinh: digest(angles.map((x) => dm.sinh(x * 30))),
      cosh: digest(angles.map((x) => dm.cosh(x * 30))),
      tanh: digest(angles.map(dm.tanh)),
      cbrt: digest(wide.map(dm.cbrt)),
      hypot: digest(angles.map((x, i) => dm.hypot(x, units[i], i % 2 ? exps[i] : 0, i % 3 ? wide[i] : 0))),
    };
    expect(hashes).toEqual({
      sin: '5f400a73a1accb92',
      cos: '872a593daff49c5e',
      tan: 'c7c030d04e93eb1f',
      asin: '6715fdb65041f570',
      acos: 'a357d49c42bc285c',
      atan: '0cb3ab8ff09e8563',
      atan2: '5561b7dab1e36a2f',
      exp: '09a7e60553b27361',
      expm1: '6b61685f8e89226a',
      log: '9100d138edde553b',
      log2: '1109122cf3196ba8',
      log10: '6e164dcd7beaa568',
      log1p: '005d389729ed8e66',
      pow: '8dfaf52c5a625d60',
      sinh: '2db6f6b3bb55ccdd',
      cosh: '3cea64663e0264c1',
      tanh: 'e045f354008450bd',
      cbrt: '99eb50c219b0b3c4',
      hypot: '555ec12b8b70fedb',
    });
  });
});
