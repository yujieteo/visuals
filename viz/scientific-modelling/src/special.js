/* Scientific Modelling: special functions, roots and quadrature for the declared conduction models (piece 3). These
 * are floating-point calculations with a stated accuracy, so a value from here can support a numerical status with
 * its tolerance, never an exact status. tests/conduction.test.mjs compares each function with mpmath values that
 * tools/references.py computed once.
 *
 *   erf, erfc, erfcx   power series below 0.8, a continued fraction (Lentz) from 0.8; relative error below 1e-14
 *   J0, J1             Miller's backward recurrence up to 25, Hankel's asymptotic expansion above
 *   brent              the root of f in a bracket [a, b] (Brent's method)
 *   besselZeros        the first zeros of J0 or J1 (McMahon's estimate, then Brent)
 *   gauss              Gauss–Legendre quadrature on [a, b], composite
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SM = root.SM || {}).SF = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SQRT_PI = Math.sqrt(Math.PI);

  /** erf(x) for |x| < 0.8 from its Taylor series, whose terms decrease from the first. */
  function erfSeries(x) {
    const x2 = x * x;
    let term = x, sum = x;
    for (let n = 1; n < 200; n++) {
      term *= -x2 / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return (2 / SQRT_PI) * sum;
  }

  /** exp(x²) erfc(x) for x >= 0.8 from the continued fraction 1/(x + (1/2)/(x + (2/2)/(x + ...))), by Lentz's method. */
  function erfcxFraction(x) {
    const tiny = 1e-300;
    let f = x, C = x, D = 0;
    for (let k = 1; k < 5000; k++) {
      const a = k / 2;
      D = x + a * D;
      D = Math.abs(D) < tiny ? tiny : D;
      C = x + a / C;
      C = Math.abs(C) < tiny ? tiny : C;
      D = 1 / D;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return 1 / (SQRT_PI * f);
  }

  /** The error function. @param {number} x */
  function erf(x) {
    if (x < 0) return -erf(-x);
    if (x < 0.8) return erfSeries(x);
    return 1 - erfc(x);
  }
  /** The complementary error function, 1 − erf(x), without cancellation for large x. @param {number} x */
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x < 0.8) return 1 - erfSeries(x);
    return Math.exp(-x * x) * erfcxFraction(x);
  }
  /** The scaled complementary error function exp(x²) erfc(x), finite for every x >= 0. @param {number} x */
  function erfcx(x) {
    if (x < 0) return 2 * Math.exp(x * x) - erfcx(-x);
    if (x < 0.8) return Math.exp(x * x) * (1 - erfSeries(x));
    return erfcxFraction(x);
  }

  /** [J0(x), J1(x)] for 0 < x <= 25 by Miller's backward recurrence, normalized with J0 + 2(J2 + J4 + ...) = 1. */
  function besselMiller(x) {
    const M = 2 * Math.ceil((1.3 * x + 40) / 2);
    let next = 0, cur = 1e-30, sum = 0, j1 = 0;
    for (let k = M; k > 0; k--) {
      const prev = (2 * k / x) * cur - next;
      next = cur;
      cur = prev; // cur is now J_{k-1}, up to one common factor
      if (Math.abs(cur) > 1e200) { cur *= 1e-200; next *= 1e-200; sum *= 1e-200; j1 *= 1e-200; }
      if (k - 1 === 1) j1 = cur;
      else if (k - 1 >= 2 && (k - 1) % 2 === 0) sum += 2 * cur;
    }
    sum += cur;
    return [cur / sum, j1 / sum];
  }

  /** J_nu(x) for x > 25 and nu = 0 or 1 by Hankel's asymptotic expansion, summed to its smallest term. */
  function besselHankel(nu, x) {
    const mu = 4 * nu * nu;
    let a = 1, P = 1, Q = 0, last = Infinity;
    for (let k = 1; k < 200; k++) {
      a *= (mu - (2 * k - 1) * (2 * k - 1)) / (k * 8 * x);
      if (Math.abs(a) > last || Math.abs(a) < 1e-18) break;
      last = Math.abs(a);
      // a_k / x^k with the sign (−1)^floor(k/2): even k go to P, odd k to Q.
      const s = Math.floor(k / 2) % 2 === 0 ? 1 : -1;
      if (k % 2 === 0) P += s * a;
      else Q += s * a;
    }
    const chi = x - (nu / 2 + 0.25) * Math.PI;
    return Math.sqrt(2 / (Math.PI * x)) * (P * Math.cos(chi) - Q * Math.sin(chi));
  }

  /** [J0(x), J1(x)] for x >= 0. @param {number} x */
  function bessel01(x) {
    if (x === 0) return [1, 0];
    if (x < 0) { const [a, b] = bessel01(-x); return [a, -b]; }
    if (x <= 25) return besselMiller(x);
    return [besselHankel(0, x), besselHankel(1, x)];
  }
  const J0 = (x) => bessel01(x)[0];
  const J1 = (x) => bessel01(x)[1];

  /**
   * The root of f in [a, b], where f(a) and f(b) have opposite signs (Brent's method: bisection, secant and inverse
   * quadratic interpolation). Returns null when the bracket holds no sign change.
   * @param {(x: number) => number} f @param {number} a @param {number} b @param {number} [tol]
   */
  function brent(f, a, b, tol = 1e-15) {
    let fa = f(a), fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb > 0) return null;
    let c = a, fc = fa, d = b - a, e = d;
    for (let i = 0; i < 200; i++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const t = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
      const m = 0.5 * (c - b);
      if (Math.abs(m) <= t || fb === 0) return b;
      if (Math.abs(e) >= t && Math.abs(fa) > Math.abs(fb)) {
        let p, q;
        const s = fb / fa;
        if (a === c) { p = 2 * m * s; q = 1 - s; }
        else {
          const qq = fa / fc, r = fb / fc;
          p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
          q = (qq - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        else p = -p;
        if (2 * p < Math.min(3 * m * q - Math.abs(t * q), Math.abs(e * q))) { e = d; d = p / q; }
        else { d = m; e = m; }
      } else { d = m; e = m; }
      a = b; fa = fb;
      b += Math.abs(d) > t ? d : m > 0 ? t : -t;
      fb = f(b);
    }
    return b;
  }

  /** The first n positive zeros of J0 (nu = 0) or J1 (nu = 1): McMahon's estimate, then Brent in a bracket around it. */
  function besselZeros(nu, n) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      const beta = (k + (nu === 0 ? -0.25 : 0.25)) * Math.PI;
      const guess = nu === 0 ? beta + 1 / (8 * beta) : beta - 3 / (8 * beta);
      const f = nu === 0 ? J0 : J1;
      out.push(brent(f, guess - 0.4, guess + 0.4) ?? guess);
    }
    return out;
  }

  /** Gauss–Legendre nodes and weights on [−1, 1] (Newton on the Legendre polynomial). */
  const GL = new Map();
  function legendre(n) {
    if (GL.has(n)) return GL.get(n);
    const x = [], w = [];
    for (let i = 1; i <= n; i++) {
      let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = z;
        for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
        dp = n * (z * p1 - p0) / (z * z - 1);
        const dz = p1 / dp;
        z -= dz;
        if (Math.abs(dz) < 1e-16) break;
      }
      x.push(z);
      w.push(2 / ((1 - z * z) * dp * dp));
    }
    GL.set(n, { x, w });
    return GL.get(n);
  }
  /** ∫ f over [a, b] with `pieces` panels of the 20-point Gauss–Legendre rule. */
  function gauss(f, a, b, pieces = 8) {
    const { x, w } = legendre(20);
    const h = (b - a) / pieces;
    let s = 0;
    for (let p = 0; p < pieces; p++) {
      const lo = a + p * h, mid = lo + h / 2;
      for (let i = 0; i < x.length; i++) s += w[i] * f(mid + (h / 2) * x[i]);
    }
    return (s * h) / 2;
  }

  return { erf, erfc, erfcx, J0, J1, bessel01, brent, besselZeros, gauss };
});
