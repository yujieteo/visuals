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

  /** The standard normal density. @param {number} x */
  const normalPdf = (x) => Math.exp(-LN_SQRT_2PI - (x * x) / 2);

  // Acklam's rational approximation of the normal quantile (relative error below 1.2e-9), refined by one Halley step.
  const QA = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const QB = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const QC = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const QD = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];

  /**
   * The standard normal quantile: Acklam's approximation, then one Halley step on the CDF. The upper half uses the
   * symmetry Φ⁻¹(p) = −Φ⁻¹(1 − p), so the tail keeps its relative precision.
   * @param {number} p @returns {number}
   */
  function normalQuantile(p) {
    if (!(p > 0 && p < 1)) throw new RangeError(`a normal quantile needs 0 < p < 1, not ${p}`);
    if (p > 0.5) return -normalQuantile(1 - p);
    let x;
    if (p < 0.02425) {
      const q = Math.sqrt(-2 * Math.log(p));
      x = (((((QC[0] * q + QC[1]) * q + QC[2]) * q + QC[3]) * q + QC[4]) * q + QC[5]) / ((((QD[0] * q + QD[1]) * q + QD[2]) * q + QD[3]) * q + 1);
    } else {
      const q = p - 0.5, r = q * q;
      x = ((((((QA[0] * r + QA[1]) * r + QA[2]) * r + QA[3]) * r + QA[4]) * r + QA[5]) * q) / (((((QB[0] * r + QB[1]) * r + QB[2]) * r + QB[3]) * r + QB[4]) * r + 1);
    }
    const u = (normalCdf(x) - p) / normalPdf(x);
    return Number.isFinite(u) ? x - u / (1 + (x * u) / 2) : x;
  }

  /** log B(a, b) for a, b > 0. @param {number} a @param {number} b */
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);

  /**
   * The x with F(x) = u for a continuous law with CDF F: Newton steps inside a bracket that shrinks at each step, and
   * bisection when a Newton step leaves the bracket. Above u = 1/2 it solves S(x) = 1 − u with the survival function
   * S, so an upper quantile keeps its precision. An infinite end of the support is first replaced by a finite bracket.
   * @param {number} u in (0, 1)
   * @param {{ cdf(x: number): number, sf(x: number): number, pdf(x: number): number, lo: number, hi: number, guess: number }} f
   */
  const solveQuantile = (u, f) => (u > 0.5 ? solve(1 - u, true, f) : solve(u, false, f));
  /** The x with S(x) = v: the inverse survival function, precise for a small v where 1 − v rounds to 1. @param {number} v @param {{ cdf(x: number): number, sf(x: number): number, pdf(x: number): number, lo: number, hi: number, guess: number }} f */
  const solveSurvival = (v, f) => (v > 0.5 ? solve(1 - v, false, f) : solve(v, true, f));

  /** The number of CDF evaluations of every numerical quantile so far: a deterministic measure of their work. */
  let solved = 0;

  /** @param {number} target @param {boolean} upper @param {{ cdf(x: number): number, sf(x: number): number, pdf(x: number): number, lo: number, hi: number, guess: number }} f */
  function solve(target, upper, f) {
    /** Increasing in x, zero at the quantile. @param {number} x */
    const g = (x) => { solved++; return upper ? target - f.sf(x) : f.cdf(x) - target; };
    let lo = f.lo, hi = f.hi, x = Number.isFinite(f.guess) ? f.guess : 0;
    if (!(x > lo && x < hi)) x = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo + 1 : Number.isFinite(hi) ? hi - 1 : 0;
    let step = Math.max(1, Math.abs(x));
    if (lo === -Infinity) { lo = x - step; while (g(lo) > 0) { hi = Math.min(hi, lo); step *= 2; lo -= step; } }
    step = Math.max(1, Math.abs(x));
    if (hi === Infinity) { hi = x + step; while (g(hi) < 0) { lo = Math.max(lo, hi); step *= 2; hi += step; } }
    if (!(x > lo && x < hi)) x = (lo + hi) / 2;
    for (let i = 0; i < 300; i++) {
      const gx = g(x);
      if (gx === 0) return x;
      if (gx < 0) lo = x;
      else hi = x;
      // No double lies strictly inside the bracket: return the end where g is nearer 0.
      const mid = (lo + hi) / 2;
      if (!(mid > lo && mid < hi)) return Math.abs(g(lo)) <= Math.abs(g(hi)) ? lo : hi;
      const d = f.pdf(x), newton = x - gx / d;
      if (d > 0 && Number.isFinite(newton) && newton > lo && newton < hi) {
        // A Newton step of at most one unit in the last place has converged.
        if (Math.abs(newton - x) <= 2.3e-16 * Math.abs(x) + 1e-300) return newton;
        x = newton;
      } else x = mid;
    }
    return x;
  }

  // Gauss–Kronrod (7, 15) nodes and weights on [−1, 1] (Piessens et al., QUADPACK, 1983): XGK[1], XGK[3], XGK[5]
  // and the centre XGK[7] = 0 are the Gauss nodes, with the weights WG.
  const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
  const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
  const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];

  /**
   * The change of f across the gap between an end point and its nearest node, when it is a jump: more than 10 times
   * the change that the slope between the two nearest nodes predicts. A smooth f gives 0.
   * @param {number} end f at the end point @param {number} f0 f at the nearest node @param {number} f1 f at the next node
   */
  function jump(end, f0, f1) {
    const d = Math.abs(end - f0), slope = (Math.abs(f0 - f1) * (1 - XGK[0])) / (XGK[0] - XGK[1]);
    return d > 10 * slope + 1e-12 * (Math.abs(end) + Math.abs(f0)) ? d : 0;
  }

  /**
   * The 15-point Kronrod and 7-point Gauss sums of a vector function on [a, b]. The error estimate is |K − G| plus,
   * where f is known at an end point (fa, fb), a jump between that end point and the nearest node times the gap
   * between them: no node sees such a jump, so |K − G| alone would miss it.
   * @param {(x: number) => ArrayLike<number>} f @param {number} a @param {number} b @param {number} dim
   * @param {ArrayLike<number> | null} fa @param {ArrayLike<number> | null} fb
   */
  function gk15(f, a, b, dim, fa, fb) {
    const c = (a + b) / 2, h = (b - a) / 2, gap = h * (1 - XGK[0]);
    const K = new Float64Array(dim), G = new Float64Array(dim), fc = f(c), err = new Float64Array(dim);
    for (let j = 0; j < dim; j++) { K[j] = WGK[7] * fc[j]; G[j] = WG[3] * fc[j]; }
    /** @type {ArrayLike<number>[]} */
    const outer = [];
    for (let i = 0; i < 7; i++) {
      const dx = h * XGK[i], f1 = f(c - dx), f2 = f(c + dx);
      if (i < 2) outer.push(f1, f2);
      for (let j = 0; j < dim; j++) {
        const s = f1[j] + f2[j];
        K[j] += WGK[i] * s;
        if (i % 2 === 1) G[j] += WG[(i - 1) / 2] * s;
      }
    }
    for (let j = 0; j < dim; j++) {
      K[j] *= h;
      err[j] = Math.abs(K[j] - G[j] * h) + gap * ((fa ? jump(fa[j], outer[0][j], outer[2][j]) : 0) + (fb ? jump(fb[j], outer[1][j], outer[3][j]) : 0));
    }
    return { a, b, fa, fb, value: K, err };
  }

  /**
   * The integral of a vector function over (a, b) by adaptive Gauss–Kronrod (7, 15) quadrature: the panel with the
   * largest error estimate, relative to the tolerance of each component, splits in two until every component meets
   * max(rel · |integral|, abs) or the panels reach maxPanels. The integration starts from the panels between the
   * break points. f is also known at every end point except `a` when openLo is set, so f may be infinite at a; a
   * jump next to a known end point counts as error (gk15), so adaptive splitting finds it.
   * @param {(x: number) => ArrayLike<number>} f @param {number} a @param {number} b @param {number} dim
   * @param {{ rel: number, abs: number, maxPanels: number, breaks?: number[], openLo?: boolean }} o
   * @returns {{ value: Float64Array, error: Float64Array, converged: boolean, panels: number }}
   */
  function integrate(f, a, b, dim, o) {
    const pts = [a, ...(o.breaks ?? []).filter((x) => x > a && x < b), b];
    const fx = pts.map((x, i) => (i === 0 && o.openLo ? null : f(x)));
    const panels = pts.slice(1).map((x, i) => gk15(f, pts[i], x, dim, fx[i], fx[i + 1]));
    const value = new Float64Array(dim), error = new Float64Array(dim);
    for (const p of panels) for (let j = 0; j < dim; j++) { value[j] += p.value[j]; error[j] += p.err[j]; }
    const tol = (/** @type {number} */ j) => Math.max(o.rel * Math.abs(value[j]), o.abs);
    for (;;) {
      let worst = -1, score = 1;
      for (let j = 0; j < dim; j++) score = Math.max(score, error[j] / tol(j));
      if (score <= 1) return { value, error, converged: true, panels: panels.length };
      if (panels.length >= o.maxPanels) return { value, error, converged: false, panels: panels.length };
      let best = 0;
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        if (p.b - p.a <= 1e-15 * Math.max(1, Math.abs(p.a), Math.abs(p.b))) continue;
        let s = 0;
        for (let j = 0; j < dim; j++) s = Math.max(s, p.err[j] / tol(j));
        if (s > best) { best = s; worst = i; }
      }
      if (worst < 0) return { value, error, converged: false, panels: panels.length };
      const p = panels[worst], mid = (p.a + p.b) / 2, fm = f(mid), l = gk15(f, p.a, mid, dim, p.fa, fm), r = gk15(f, mid, p.b, dim, fm, p.fb);
      for (let j = 0; j < dim; j++) {
        value[j] += l.value[j] + r.value[j] - p.value[j];
        error[j] += l.err[j] + r.err[j] - p.err[j];
      }
      panels.splice(worst, 1, l, r);
    }
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

  return { work: () => solved, lgamma, lchoose, lbeta, hurwitz, zeta, harmonic, gammaPQ, ibeta, ibetac, ibetaInv, normalCdf, normalPdf, normalQuantile, solveQuantile, solveSurvival, integrate, clopperPearson, wilson, zeroHitBound, chiSquareSf };
});
