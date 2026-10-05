/* Scientific Modelling: exact rational numbers on BigInt. Every "exact" status on the page comes from this
 * arithmetic or from canonical-form equality, never from a floating-point comparison. A value is a frozen
 * { n, d } with d > 0 and gcd(n, d) = 1, so equal numbers have equal fields. Derived data that leaves the engine
 * carries rationals as strings ("-3/2"), because JSON has no BigInt.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SM = root.SM || {}).Q = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const babs = (a) => (a < 0n ? -a : a);
  function gcd(a, b) {
    a = babs(a); b = babs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  const lcm = (a, b) => (a === 0n || b === 0n ? 0n : babs(a * b) / gcd(a, b));

  /** A reduced fraction n/d. @param {bigint | number | string} n @param {bigint | number | string} [d] */
  function q(n, d = 1n) {
    let N = BigInt(n), D = BigInt(d);
    if (D === 0n) throw new RangeError("division by zero");
    if (D < 0n) { N = -N; D = -D; }
    const g = gcd(N, D) || 1n;
    return Object.freeze({ n: N / g, d: D / g });
  }
  const ZERO = q(0), ONE = q(1);

  /** An exact rational from text: "3", "-3/2", "0.25", "1.5e-3", "2E3". Returns null for anything else. @param {string} text */
  function parse(text) {
    const s = String(text).trim();
    let m = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(s);
    if (m) return BigInt(m[2]) === 0n ? null : q(m[1], m[2]);
    m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
    const digits = BigInt(`${m[2] || "0"}${m[3] ?? ""}`);
    const exp = Number(m[4] ?? 0) - (m[3] ?? "").length;
    if (Math.abs(exp) > 400) return null;
    const v = exp >= 0 ? q(digits * 10n ** BigInt(exp)) : q(digits, 10n ** BigInt(-exp));
    return m[1] === "-" ? neg(v) : v;
  }

  /** The exact value of a finite double, through its shortest decimal text. @param {number} x */
  function fromNumber(x) {
    if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
    return /** @type {any} */ (parse(String(x)));
  }

  /** @param {any} x */
  const of = (x) => (typeof x === "object" && x !== null && "n" in x ? x : typeof x === "number" ? fromNumber(x) : typeof x === "string" ? parse(x) : q(x));

  const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => q(a.n * b.n, a.d * b.d);
  const div = (a, b) => {
    if (b.n === 0n) throw new RangeError("division by zero");
    return q(a.n * b.d, a.d * b.n);
  };
  const neg = (a) => q(-a.n, a.d);
  const inv = (a) => div(ONE, a);
  const abs = (a) => q(babs(a.n), a.d);
  const sign = (a) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
  const isZero = (a) => a.n === 0n;
  const isInteger = (a) => a.d === 1n;
  const eq = (a, b) => a.n === b.n && a.d === b.d;
  const cmp = (a, b) => sign(sub(a, b));
  /** a to an integer power. @param {{n: bigint, d: bigint}} a @param {number | bigint} k */
  function pow(a, k) {
    const K = BigInt(k);
    if (K === 0n) return ONE;
    if (K < 0n) return inv(pow(a, -K));
    return q(a.n ** K, a.d ** K);
  }

  /** "3", "-3/2". */
  const str = (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
  /** TeX: "3", "-\frac{3}{2}". */
  const tex = (a) => (a.d === 1n ? `${a.n}` : `${a.n < 0n ? "-" : ""}\\frac{${babs(a.n)}}{${a.d}}`);
  /** A double close to the value, also for numerators and denominators beyond 2^53. */
  function toNumber(a) {
    const n = a.n, d = a.d;
    const shift = Math.max(0, Math.max(n.toString().length, d.toString().length) - 300);
    const s = 10n ** BigInt(shift);
    return Number(n / s) / Number(d / s);
  }

  /** The least common multiple of the denominators of a list. */
  const denominatorLcm = (list) => list.reduce((m, a) => lcm(m, a.d), 1n);
  /** The greatest common divisor of the numerators of a list. */
  const numeratorGcd = (list) => list.reduce((g, a) => gcd(g, a.n), 0n);

  return { q, ZERO, ONE, parse, fromNumber, of, add, sub, mul, div, neg, inv, abs, sign, isZero, isInteger, eq, cmp, pow,
    str, tex, toNumber, gcd, lcm, denominatorLcm, numeratorGcd };
});
