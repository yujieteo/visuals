/* Monte Carlo Probability Workbench: special functions. The log-gamma function (Lanczos, g = 7, 9 terms), the
 * Hurwitz zeta function (Euler-Maclaurin), the regularised incomplete gamma and beta functions (series and Lentz
 * continued fractions, after Press et al., Numerical Recipes, 3rd ed., sections 6.2 and 6.4), the standard normal
 * law, and the Clopper-Pearson and Wilson intervals that the diagnostics use. Each function returns a number or
 * throws for an argument outside its domain; none returns a silent NaN.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCSpecial = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const EPS = 1e-15, TINY = 1e-300, LN_SQRT_2PI = 0.9189385332046728;
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  /** log |Gamma(x)| for x > 0. @param {number} x @returns {number} */
  function lgamma(x) {
    if (!(x > 0)) throw new RangeError(`lgamma needs x > 0, not ${x}`);
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    const z = x - 1;
    let a = LANCZOS[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** log of the binomial coefficient C(n, k) for real n >= k >= 0. @param {number} n @param {number} k */
  function lchoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  }

  // B_2j / (2j)! for j = 1..8.
  const BERNOULLI_OVER_FACT = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160, -691 / 1307674368000, 1 / 74724249600, -3617 / 10670622842880000];

  /**
   * The Hurwitz zeta function zeta(s, a) = sum over k >= 0 of (a + k)^(-s), for s > 1 and a > 0, by Euler-Maclaurin
   * summation after N direct terms. The relative error is below 1e-14 for 1 < s <= 40.
   * @param {number} s @param {number} a
   */
  function hurwitz(s, a) {
    if (!(s > 1)) throw new RangeError(`the zeta sum needs s > 1, not ${s}`);
    if (!(a > 0)) throw new RangeError(`the zeta sum needs a > 0, not ${a}`);
    const N = Math.max(0, Math.ceil(12 - a));
    let sum = 0;
    for (let k = 0; k < N; k++) sum += Math.pow(a + k, -s);
    const x = a + N;
    sum += Math.pow(x, 1 - s) / (s - 1) + Math.pow(x, -s) / 2;
    let rising = s, power = Math.pow(x, -s - 1);
    for (let j = 0; j < BERNOULLI_OVER_FACT.length; j++) {
      sum += BERNOULLI_OVER_FACT[j] * rising * power;
      rising *= (s + 2 * j + 1) * (s + 2 * j + 2);
      power /= x * x;
    }
    return sum;
  }

  /** The Riemann zeta function for s > 1. @param {number} s */
  const zeta = (s) => hurwitz(s, 1);

  /** The generalised harmonic number H(N, s) = sum of k^(-s) for k = 1..N, exact summation up to N = 10^6. @param {number} N @param {number} s */
  function harmonic(N, s) {
    if (N > 1e6 && s > 1) return zeta(s) - hurwitz(s, N + 1);
    let sum = 0;
    for (let k = N; k >= 1; k--) sum += Math.pow(k, -s);
    return sum;
  }

  /** Regularised lower incomplete gamma P(a, x) and upper Q(a, x) = 1 - P(a, x), each computed directly. @param {number} a @param {number} x */
  function gammaPQ(a, x) {
    if (!(a > 0) || !(x >= 0)) throw new RangeError(`incomplete gamma needs a > 0 and x >= 0, not (${a}, ${x})`);
    if (x === 0) return { P: 0, Q: 1 };
    const front = Math.exp(-x + a * Math.log(x) - lgamma(a));
    if (x < a + 1) {
      let ap = a, del = 1 / a, sum = del;
      for (let n = 0; n < 10000; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) break;
      }
      const P = Math.min(1, sum * front);
      return { P, Q: 1 - P };
    }
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 10000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    const Q = Math.min(1, front * h);
    return { P: 1 - Q, Q };
  }

  /** The continued fraction of the incomplete beta function. @param {number} a @param {number} b @param {number} x */
  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 10000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /** The regularised incomplete beta function I_x(a, b) for a, b > 0 and 0 <= x <= 1. @param {number} x @param {number} a @param {number} b */
  function ibeta(x, a, b) {
    if (!(a > 0) || !(b > 0) || !(x >= 0 && x <= 1)) throw new RangeError(`incomplete beta needs a, b > 0 and 0 <= x <= 1, not (${x}, ${a}, ${b})`);
    if (x === 0) return 0;
    if (x === 1) return 1;
    const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    if (x < (a + 1) / (a + b + 2)) return Math.min(1, (front * betacf(a, b, x)) / a);
    return Math.max(0, 1 - (front * betacf(b, a, 1 - x)) / b);
  }

  /** The upper tail 1 - I_x(a, b), computed without cancellation. @param {number} x @param {number} a @param {number} b */
  const ibetac = (x, a, b) => ibeta(1 - x, b, a);

  /** The x with I_x(a, b) = p, by bisection to 1e-15. @param {number} p @param {number} a @param {number} b */
  function ibetaInv(p, a, b) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 200 && hi - lo > 1e-15; i++) {
      const mid = (lo + hi) / 2;
      if (ibeta(mid, a, b) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** The standard normal CDF, from the incomplete gamma function: Phi(x) = Q(1/2, x^2 / 2) / 2 for x < 0. @param {number} x */
  function normalCdf(x) {
    if (x === Infinity) return 1;
    if (x === -Infinity) return 0;
    const q = gammaPQ(0.5, (x * x) / 2).Q / 2;
    return x < 0 ? q : 1 - q;
  }

  /** The standard normal quantile, by bisection then two Newton steps. @param {number} p */
  function normalQuantile(p) {
    if (!(p > 0 && p < 1)) throw new RangeError(`a normal quantile needs 0 < p < 1, not ${p}`);
    let lo = -40, hi = 40;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (normalCdf(mid) < p) lo = mid;
      else hi = mid;
    }
    let x = (lo + hi) / 2;
    for (let i = 0; i < 2; i++) x -= (normalCdf(x) - p) / Math.exp(-LN_SQRT_2PI - (x * x) / 2);
    return x;
  }

  /**
   * The Clopper-Pearson interval for a binomial proportion after k hits in n independent trials, at level 1 - alpha.
   * @param {number} k @param {number} n @param {number} alpha
   */
  function clopperPearson(k, n, alpha) {
    const lo = k === 0 ? 0 : ibetaInv(alpha / 2, k, n - k + 1);
    const hi = k === n ? 1 : ibetaInv(1 - alpha / 2, k + 1, n - k);
    return [lo, hi];
  }

  /** The Wilson score interval for k hits in n trials. @param {number} k @param {number} n @param {number} z */
  function wilson(k, n, z) {
    const p = k / n, z2 = z * z, den = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / den, half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  }

  /** The exact one-sided upper bound after 0 hits in n independent trials: 1 - alpha^(1/n). @param {number} n @param {number} alpha */
  const zeroHitBound = (n, alpha) => -Math.expm1(Math.log(alpha) / n);

  /** The upper tail of the chi-square law with df degrees of freedom. @param {number} x @param {number} df */
  const chiSquareSf = (x, df) => gammaPQ(df / 2, x / 2).Q;

  return { lgamma, lchoose, hurwitz, zeta, harmonic, gammaPQ, ibeta, ibetac, ibetaInv, normalCdf, normalQuantile, clopperPearson, wilson, zeroHitBound, chiSquareSf };
});
