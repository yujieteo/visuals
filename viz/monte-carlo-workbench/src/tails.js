/* Monte Carlo Probability Workbench: the positive, heavy-tailed and extreme-value laws of group 3. Each law states
 * its parameter convention and support, and computes its PDF, CDF, survival function, quantile function (and its
 * inverse survival function, for precision in the upper tail) and moments, with the order below which the moments
 * exist and the side of each heavy tail. Each law gives its reference sampler, an inverse-transform sampler, and a
 * rejection sampler with an analytic envelope constant (or the reason that it has none). The stable law uses Nolan's
 * S0 parameterisation; its density and CDF are numerical integrals (Nolan 1997), so they carry the label
 * "numerical". The file also gives the exact law of a maximum, a minimum, a sum or an affine function of i.i.d.
 * draws where the page knows it, for the engine's reference values and the plots. MCLaws lists these laws after the
 * continuous group. Tests load this file with require().
 */
/** @param {any} root the global object @param {(S: any, C: any) => any} factory */
(function (root, factory) {
  const S = root.MCSpecial ?? require("./special.js");
  const api = factory(S, root.MCContinuous ?? require("./continuous.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCTails = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./continuous.js")} */ C) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {{ proposals: number, accepts: number, violations: number }} RejectStats */
  /** @typedef {{ label: string, exactness: string, draw(rng: Rng, stats?: RejectStats): number, acceptance?: number, envelope?: number }} Sampler */
  /** @typedef {{ unavailable: string }} NoSampler */
  /** @typedef {Record<string, any>} Params */

  const PI = Math.PI, EULER = 0.5772156649015329, LN_SQRT_2PI = 0.9189385332046728, U_MAX = 1 - 2 ** -53;

  /** @param {number} x @param {number} lo @param {number} hi */
  const inside = (x, lo, hi) => typeof x === "number" && x >= lo && x <= hi;
  /** @param {number} x */
  const show = (x) => (typeof x === "number" ? String(x) : "a vector");
  /** One uniform in (0, 1), never 1: the generator can round its largest value up to 1. @param {Rng} rng */
  const unif = (rng) => Math.min(rng.uniform(), U_MAX);
  /** −log u, from w = 1 − u when u is near 1. @param {number} u @param {number} w */
  const mlog = (u, w) => (u <= 0.5 ? -Math.log(u) : -Math.log1p(-w));
  /** Gamma(x) for x > 0. @param {number} x */
  const gammaFn = (x) => Math.exp(S.lgamma(x));

  /* ---------- the normal law, for the lognormal, inverse Gaussian and Lévy laws ---------- */

  /**
   * The standard normal survival function Q(z) = 1 − Φ(z) with full relative precision: the incomplete gamma
   * function below z = 5, and the continued fraction of Mills' ratio above it.
   * @param {number} z
   */
  function nsf(z) {
    if (z === Infinity) return 0;
    if (z === -Infinity) return 1;
    if (z < 5) return S.normalCdf(-z);
    return Math.exp(nlogsf(z));
  }
  /** log Q(z) for z ≥ 5 by Mills' ratio R(z) = 1/(z + 1/(z + 2/(z + 3/(z + …)))), and log of Q otherwise. @param {number} z */
  function nlogsf(z) {
    if (z < 5) return Math.log(S.normalCdf(-z));
    let r = z;
    for (let k = 60; k >= 1; k--) r = z + k / r;
    return -0.5 * z * z - LN_SQRT_2PI - Math.log(r);
  }
  /** Φ(z). @param {number} z */
  const ncdf = (z) => (z <= 0 ? nsf(-z) : 1 - nsf(z));
  /**
   * The standard normal quantile from the lower-tail probability p or, when it is the smaller one, from the
   * upper-tail probability q = 1 − p, so that both tails keep their relative precision.
   * @param {number} p @param {number} [q]
   */
  const nquantile = (p, q = 1 - p) => (!(p > 0) ? -Infinity : !(q > 0) ? Infinity : q < p ? -S.normalQuantile(q) : S.normalQuantile(p));
  /** φ(z). @param {number} z */
  const npdf = (z) => S.normalPdf(z);
  /**
   * Φ⁻¹(1/2 + w/2) for 0 < w ≤ 1, precise also for a small w, where 1/2 + w/2 rounds to 1/2: the series
   * z = z₀ + z₀³/6 with z₀ = √(π/2) w below w = 10^-4 (relative error below 10^-13).
   * @param {number} w
   */
  const nquantileHalf = (w) => { if (w < 1e-4) { const z0 = Math.sqrt(PI / 2) * w; return z0 + (z0 * z0 * z0) / 6; } return nquantile(0.5 + w / 2, 0.5 - w / 2); };

  /** The exponential integral E1(x) for x > 0 (Press et al., section 6.3): a series below 1, a continued fraction above. @param {number} x */
  function e1(x) {
    if (x <= 1) {
      let sum = -EULER - Math.log(x), term = 1;
      for (let k = 1; k < 200; k++) {
        term *= -x / k;
        const add = -term / k;
        sum += add;
        if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
      }
      return sum;
    }
    let b = x + 1, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * i;
      b += 2;
      d = 1 / (an * d + b);
      c = b + an / c;
      const del = c * d;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h * Math.exp(-x);
  }

  /* ---------- quadrature and roots ---------- */

  /** ∫ f over [a, b] by the adaptive Gauss–Kronrod rule of special.js, with break points, to a relative error of 1e-11. @param {(x: number) => number} f @param {number} a @param {number} b @param {number[]} [breaks] */
  const integral = (f, a, b, breaks = []) => S.integrate((x) => [f(x)], a, b, 1, { rel: 1e-11, abs: 1e-300, maxPanels: 600, breaks }).value[0];

  /**
   * ∫ over (0, 1) of g(Q(u)) du for a law with quantile function Q and inverse survival function: the lower half by Q,
   * the upper half by the inverse survival function, each with break points that resolve the tail. Null when it does
   * not converge.
   * @param {(x: number) => number} g @param {(u: number) => number} q @param {(v: number) => number} isf
   */
  function expectU(g, q, isf) {
    const o = { rel: 1e-10, abs: 1e-12, maxPanels: 400, breaks: [2 ** -30, 2 ** -20, 2 ** -10, 2 ** -4], openLo: true };
    let total = 0;
    for (const f of [q, isf]) {
      const r = S.integrate((u) => [g(f(Math.max(u, 1e-300)))], 0, 0.5, 1, o);
      if (!r.converged || !Number.isFinite(r.value[0])) return null;
      total += r.value[0];
    }
    return total;
  }

  /* ---------- samplers ---------- */

  /** A standard Laplace draw by inversion. @param {Rng} rng */
  function laplace(rng) {
    const u = unif(rng);
    return u < 0.5 ? Math.log(2 * u) : -Math.log(2 * (1 - u));
  }
  const LAPLACE_LOG = (/** @type {number} */ y) => -Math.LN2 - Math.abs(y);

  /**
   * Rejection from a proposal with log-density logg: accept y with probability f(y)/(M g(y)), then return the
   * transform of y. `factor` below 1 shrinks the envelope constant for the assumption-failure experiment, and
   * `violations` counts proposals with a ratio above 1, which shows that the envelope does not cover the target.
   * @param {string} label @param {(y: number) => number} logf @param {(y: number) => number} logg @param {(rng: Rng) => number} propose
   * @param {number} M @param {number} factor @param {(y: number) => number} [out] @returns {Sampler}
   */
  function reject(label, logf, logg, propose, M, factor, out) {
    const Mf = M * factor, logM = Math.log(Mf);
    return {
      label: `${label}, envelope constant M = ${M.toPrecision(6)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
      exactness: factor === 1 ? "exact" : "not exact: the envelope is too small",
      acceptance: 1 / M,
      envelope: Mf,
      draw(rng, stats) {
        for (let i = 0; i < 1e7; i++) {
          const y = propose(rng);
          const lr = logf(y) - logg(y) - logM;
          if (stats) {
            stats.proposals++;
            if (lr > 1e-12) stats.violations++;
          }
          if (Math.log(unif(rng)) <= lr) {
            if (stats) stats.accepts++;
            return out ? out(y) : y;
          }
        }
        throw new RangeError("the rejection sampler accepted no value in 10^7 proposals");
      },
    };
  }

  /**
   * An inverse-transform sampler X = Q(U), and the same capped at the `cut` quantile for the assumption failure.
   * @param {string} label @param {(u: number, w: number) => number} q the quantile at u, with w = 1 − u @param {number | undefined} cut @param {string} [exactness]
   * @returns {Sampler}
   */
  function inverseSampler(label, q, cut, exactness = "exact") {
    const draw = (/** @type {Rng} */ rng) => { const u = unif(rng); return q(u, 1 - u); };
    if (cut === undefined) return { label, exactness, draw };
    const top = q(cut, 1 - cut);
    return { label: `${label}, cut at the ${cut} quantile ${+top.toPrecision(6)}`, exactness: "not exact: the tail is cut", draw: (rng) => Math.min(top, draw(rng)) };
  }

  /** The normal law by rejection from the Laplace law, M = √(2e/π). @param {number} factor @param {(y: number) => number} out @param {string} what */
  const normalByLaplace = (factor, out, what) => reject(`${what}: a standard normal Z by rejection from the Laplace law`, (y) => -0.5 * y * y - LN_SQRT_2PI, LAPLACE_LOG, laplace, Math.sqrt((2 * Math.E) / PI), factor, out);
  /** The standard logistic law by rejection from the Laplace law, M = 2. @param {number} factor @param {(y: number) => number} out @param {string} what */
  const logisticByLaplace = (factor, out, what) => reject(`${what}: a standard logistic Y by rejection from the Laplace law`, (y) => -Math.abs(y) - 2 * Math.log1p(Math.exp(-Math.abs(y))), LAPLACE_LOG, laplace, 2, factor, out);
  /** Lomax(1, a) by rejection from Lomax(1, a/2), M = 2. @param {number} a @param {number} factor @param {(y: number) => number} out @param {string} what */
  const lomaxByLomax = (a, factor, out, what) => reject(`${what}: a Lomax(1, ${+a.toPrecision(6)}) draw Y by rejection from Lomax(1, ${+(a / 2).toPrecision(6)})`,
    (y) => Math.log(a) - (a + 1) * Math.log1p(y), (y) => Math.log(a / 2) - (a / 2 + 1) * Math.log1p(y), (rng) => Math.pow(unif(rng), -2 / a) - 1, 2, factor, out);
  /** Weibull(k, 1) for k ≥ 1 by rejection from the standard exponential law, M = k. @param {number} k @param {number} factor @param {(y: number) => number} out @param {string} what */
  const weibullByExp = (k, factor, out, what) => reject(`${what}: a Weibull(${+k.toPrecision(6)}, 1) draw Y by rejection from the standard exponential law`,
    (y) => Math.log(k) + (k - 1) * Math.log(y) - Math.pow(y, k), (y) => -y, (rng) => -Math.log(unif(rng)), k, factor, out);
  /** The standard exponential law by rejection from Lomax(2, 2), M = 3.375/e. @param {number} factor @param {(y: number) => number} out @param {string} what */
  const expByLomax = (factor, out, what) => reject(`${what}: a standard exponential Y by rejection from Lomax(2, 2)`, (y) => -y, (y) => -3 * Math.log1p(y / 2), (rng) => 2 * (Math.pow(unif(rng), -0.5) - 1), 3.375 / Math.E, factor, out);
  /** Fréchet(α, 1) by rejection from the log-logistic law with scale 1 and shape α, M = 4/e. @param {number} a @param {number} factor @param {(y: number) => number} out @param {string} what */
  const frechetByLogLogistic = (a, factor, out, what) => reject(`${what}: a Fréchet(${+a.toPrecision(6)}, 1) draw Y by rejection from the log-logistic law with shape ${+a.toPrecision(6)}`,
    (y) => Math.log(a) - (a + 1) * Math.log(y) - Math.pow(y, -a), (y) => Math.log(a) + (a - 1) * Math.log(y) - 2 * Math.log1p(Math.pow(y, a)),
    (rng) => { const u = unif(rng); return Math.pow(u / (1 - u), 1 / a); }, 4 / Math.E, factor, out);
  /** The standard Gumbel law by rejection from the Laplace law, M = 2. @param {number} factor @param {(y: number) => number} out @param {string} what */
  const gumbelByLaplace = (factor, out, what) => reject(`${what}: a standard Gumbel Y by rejection from the Laplace law`, (y) => -y - Math.exp(-y), LAPLACE_LOG, laplace, 2, factor, out);

  /* ---------- the stable law, S0 parameterisation (Nolan 1997) ---------- */

  /**
   * The standard stable law S(α, β, 1, 0; 0) at x: its density ("pdf"), CDF ("cdf") or survival function ("sf") by
   * Nolan's integrals over θ, split where the integrand peaks. Each integral has a relative error target of 1e-11.
   * The survival function is an integral of its own, so it keeps its relative precision far in the right tail.
   * @param {number} x @param {number} a @param {number} b @param {"pdf" | "cdf" | "sf"} want @returns {number}
   */
  function stable0(x, a, b, want) {
    const flip = want === "cdf" ? "sf" : want === "sf" ? "cdf" : "pdf";
    if (a === 1) {
      if (b === 0) return want === "pdf" ? 1 / (PI * (1 + x * x)) : (want === "cdf") === x < 0 ? Math.atan2(1, Math.abs(x)) / PI : 1 - Math.atan2(1, Math.abs(x)) / PI;
      if (b < 0) return stable0(-x, 1, -b, flip);
      // α = 1, β > 0: h(θ) = e^{−πx/(2β)} V(θ), f = (1/(2β)) ∫ h e^{−h} dθ, F = (1/π) ∫ e^{−h} dθ.
      const shift = (-PI * x) / (2 * b);
      /** @param {number} th */
      const logh = (th) => shift + Math.log(2 / PI) + Math.log((PI / 2 + b * th) / Math.cos(th)) + ((PI / 2 + b * th) * Math.tan(th)) / b;
      const parts = split(logh, -PI / 2, PI / 2);
      if (want === "pdf") return sumIntegrals((th) => { const h = Math.exp(logh(th)); return h === Infinity || !(h > 0) ? 0 : h * Math.exp(-h); }, parts) / (2 * b);
      if (want === "sf") return sumIntegrals((th) => { const h = Math.exp(logh(th)); return Number.isNaN(h) ? 0 : -Math.expm1(-h); }, parts) / PI;
      return sumIntegrals((th) => { const h = Math.exp(logh(th)); return Number.isNaN(h) ? 0 : Math.exp(-h); }, parts) / PI;
    }
    const tq = Math.tan((PI * a) / 2), zeta = -b * tq, th0 = Math.atan(b * tq) / a;
    if (Math.abs(x - zeta) < 1e-12 * Math.max(1, Math.abs(zeta))) {
      const F = (PI / 2 - th0) / PI;
      return want === "pdf" ? (gammaFn(1 + 1 / a) * Math.cos(th0)) / (PI * Math.pow(1 + zeta * zeta, 1 / (2 * a))) : want === "cdf" ? F : 1 - F;
    }
    if (x < zeta) return stable0(-x, a, -b, flip);
    const d = x - zeta, e = a / (a - 1), lcos0 = Math.log(Math.cos(a * th0));
    /** log h(θ) = (α/(α−1)) log(x − ζ) + log V(θ). @param {number} th */
    const logh = (th) => e * Math.log(d) + lcos0 / (a - 1) + e * (Math.log(Math.cos(th)) - Math.log(Math.sin(a * (th0 + th)))) + Math.log(Math.cos(a * th0 + (a - 1) * th)) - Math.log(Math.cos(th));
    const parts = split(logh, -th0, PI / 2);
    if (want === "pdf") return (a * sumIntegrals((th) => { const h = Math.exp(logh(th)); return h === Infinity || !(h > 0) ? 0 : h * Math.exp(-h); }, parts)) / (PI * Math.abs(a - 1) * d);
    // α > 1: S = (1/π) ∫ e^{−h}. α < 1: F = c₁ + (1/π) ∫ e^{−h} with c₁ = (π/2 − θ₀)/π, and S = (1/π) ∫ (1 − e^{−h}).
    const tail = sumIntegrals(a > 1 ? (th) => { const h = Math.exp(logh(th)); return Number.isNaN(h) ? 0 : Math.exp(-h); } : (th) => { const h = Math.exp(logh(th)); return Number.isNaN(h) ? 0 : -Math.expm1(-h); }, parts) / PI;
    if (want === "sf") return tail;
    if (a > 1) return 1 - tail;
    return (PI / 2 - th0) / PI + sumIntegrals((th) => { const h = Math.exp(logh(th)); return Number.isNaN(h) ? 1 : Math.exp(-h); }, parts) / PI;
  }

  /**
   * The integration range split where log h = 0, the peak of h e^{−h}; h is monotone in θ, so bisection finds it.
   * @param {(th: number) => number} logh @param {number} lo @param {number} hi @returns {number[]}
   */
  function split(logh, lo, hi) {
    const eps = (hi - lo) * 1e-13;
    let a = lo + eps, b = hi - eps;
    const fa = logh(a), fb = logh(b);
    if (!(Number.isFinite(fa) || Number.isFinite(fb)) || Math.sign(fa) === Math.sign(fb)) return [lo, hi];
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2, fm = logh(m);
      if (Math.sign(fm) === Math.sign(fa)) a = m;
      else b = m;
    }
    return [lo, (a + b) / 2, hi];
  }
  /** @param {(th: number) => number} f @param {number[]} parts */
  const sumIntegrals = (f, parts) => integral(f, parts[0], parts[parts.length - 1], parts.slice(1, -1));

  /**
   * A standard stable draw S(α, β, 1, 0; 0) by Chambers, Mallows and Stuck (1976), in the form of Weron (1996).
   * @param {Rng} rng @param {number} a @param {number} b
   */
  function cms(rng, a, b) {
    const V = PI * (unif(rng) - 0.5), W = -Math.log(unif(rng));
    if (a === 1) {
      const pb = PI / 2 + b * V;
      return (2 / PI) * (pb * Math.tan(V) - b * Math.log(((PI / 2) * W * Math.cos(V)) / pb));
    }
    const tq = Math.tan((PI * a) / 2), B = Math.atan(b * tq) / a, Sab = Math.pow(1 + b * b * tq * tq, 1 / (2 * a));
    const z1 = (Sab * Math.sin(a * (V + B))) / Math.pow(Math.cos(V), 1 / a) * Math.pow(Math.cos(V - a * (V + B)) / W, (1 - a) / a);
    // z1 follows S(α, β, 1, 0; 1); S0 moves the location by β tan(πα/2).
    return z1 - b * tq;
  }

  /** The exact special cases of the stable law: α = 2 (normal), α = 1 with β = 0 (Cauchy), α = 1/2 with β = ±1 (Lévy). @param {Params} p */
  const stableCase = (p) => (p.alpha === 2 ? "normal" : p.alpha === 1 && p.beta === 0 ? "cauchy" : p.alpha === 0.5 && Math.abs(p.beta) === 1 ? "levy" : "");

  /** Quantile tables of the stable law, by parameter set, so that each table is built once. @type {Map<string, any>} */
  const stableTables = new Map();
  /**
   * A table of 401 quantiles of the standard stable law, equally spaced in logit u from u = 10^-4 to 1 − 10^-4, for the
   * approximate inverse transform: monotone cubic (Fritsch–Carlson) interpolation inside, and beyond it the asymptotic
   * power tail x ∝ (1 − u)^(−1/α) on a heavy side, or a root of the numerical CDF on the light side of β = ±1.
   * @param {number} a @param {number} b
   */
  function stableTable(a, b) {
    const key = `${a}/${b}`;
    let t = stableTables.get(key);
    if (t) return t;
    const N = 400, T = Math.log(9999), xs = new Float64Array(N + 1), ts = new Float64Array(N + 1);
    const sup = stableSupport(a, b);
    for (let i = 0; i <= N; i++) {
      const tt = -T + (2 * T * i) / N, u = 1 / (1 + Math.exp(-tt)), w = 1 / (1 + Math.exp(tt));
      ts[i] = tt;
      xs[i] = stableRoot(a, b, u, w, sup, i ? xs[i - 1] : 0);
    }
    // Fritsch–Carlson slopes for a monotone interpolant in t.
    const m = new Float64Array(N + 1), dl = new Float64Array(N);
    for (let i = 0; i < N; i++) dl[i] = (xs[i + 1] - xs[i]) / (ts[i + 1] - ts[i]);
    m[0] = dl[0]; m[N] = dl[N - 1];
    for (let i = 1; i < N; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : (dl[i - 1] + dl[i]) / 2;
    for (let i = 0; i < N; i++) {
      if (dl[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const al = m[i] / dl[i], be = m[i + 1] / dl[i], s = al * al + be * be;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * al * dl[i]; m[i + 1] = k * be * dl[i]; }
    }
    t = { N, T, xs, ts, m, a, b };
    if (stableTables.size > 32) stableTables.clear();
    stableTables.set(key, t);
    return t;
  }
  /** The approximate standard stable quantile from its table. @param {any} t @param {number} u @param {number} w */
  function tableQuantile(t, u, w) {
    const tt = Math.log(u) - Math.log(w), h = (2 * t.T) / t.N;
    if (tt <= -t.T && t.b === 1) return stableRoot(t.a, t.b, u, w, stableSupport(t.a, t.b), t.xs[0]);
    if (tt >= t.T && t.b === -1) return stableRoot(t.a, t.b, u, w, stableSupport(t.a, t.b), t.xs[t.N]);
    if (tt <= -t.T) return t.xs[0] - (t.xs[0] < 0 ? Math.abs(t.xs[0]) * (Math.pow(1e-4 / u, 1 / t.a) - 1) : 0);
    if (tt >= t.T) return t.xs[t.N] + (t.xs[t.N] > 0 ? t.xs[t.N] * (Math.pow(1e-4 / w, 1 / t.a) - 1) : 0);
    const i = Math.min(t.N - 1, Math.floor((tt + t.T) / h)), s = (tt - t.ts[i]) / h;
    const h00 = (1 + 2 * s) * (1 - s) * (1 - s), h10 = s * (1 - s) * (1 - s), h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
    return h00 * t.xs[i] + h10 * h * t.m[i] + h01 * t.xs[i + 1] + h11 * h * t.m[i + 1];
  }
  /** The support of the standard S0 law: a half-line when α < 1 and β = ±1. @param {number} a @param {number} b */
  function stableSupport(a, b) {
    if (a < 1 && b === 1) return { lo: -Math.tan((PI * a) / 2), hi: Infinity };
    if (a < 1 && b === -1) return { lo: -Infinity, hi: Math.tan((PI * a) / 2) };
    return { lo: -Infinity, hi: Infinity };
  }

  /* ---------- the laws ---------- */

  /**
   * @typedef {object} Law
   * @property {string} id @property {string} name @property {true} continuous @property {boolean} [numeric]
   * @property {{ name: string, kind: "real", text: string }[]} params
   * @property {(p: Params) => string[]} check
   * @property {(p: Params) => { lo: number, hi: number }} support @property {(p: Params) => string} supportText @property {string[]} [location]
   * @property {(x: number, p: Params) => number} pdf
   * @property {(x: number, p: Params) => number} pmf
   * @property {(x: number, p: Params) => number} cdf
   * @property {(x: number, p: Params) => number} sf
   * @property {(u: number, p: Params) => number} quantile
   * @property {(w: number, p: Params) => number} isf the x with S(x) = w
   * @property {(p: Params) => { mean: number | null, variance: number | null, order: number, side: "" | "right" | "left" | "both" }} moments
   * @property {(p: Params) => number | null} tailIndex the index α of a regularly varying right tail, P(X > x) = x^(−α) ℓ(x), or null
   * @property {(p: Params) => Sampler} reference
   * @property {(p: Params, cut?: number) => Sampler | NoSampler} inverse
   * @property {(p: Params, factor: number) => Sampler | NoSampler} rejection
   * @property {(p: Params) => string} [alternate]
   */

  /** The quantile from the inverse survival function above u = 1/2. @param {(u: number, p: Params) => number} lower @param {(w: number, p: Params) => number} upper */
  const both = (lower, upper) => (/** @type {number} */ u, /** @type {Params} */ p) => (u <= 0.5 ? lower(u, p) : upper(1 - u, p));
  /** @param {Params} p @param {string} name @param {number} lo @param {number} hi @param {string} text */
  const need = (p, name, lo, hi, text) => (inside(p[name], lo, hi) ? [] : [`${name} = ${show(p[name])} is outside ${text}.`]);
  /** Moments of a light-tailed law. @param {number} mean @param {number} variance */
  const light = (mean, variance) => ({ mean, variance, order: Infinity, side: /** @type {""} */ ("") });
  /** Moments of a law whose moments of order r exist only for r < order. @param {number} order @param {() => number} mean @param {() => number} variance @param {"right" | "left" | "both"} side */
  const heavy = (order, mean, variance, side) => ({ mean: order > 1 ? mean() : null, variance: order > 2 ? variance() : null, order, side });

  /** @type {Law} */
  const lognormal = {
    id: "lognormal", name: "Lognormal", continuous: true,
    params: [{ name: "mu", kind: "real", text: "mean of log X, |μ| ≤ 100" }, { name: "sigma", kind: "real", text: "standard deviation of log X, 0 < σ ≤ 10" }],
    check: (p) => [...need(p, "mu", -100, 100, "[−100, 100]"), ...need(p, "sigma", 1e-6, 10, "[10^-6, 10]")],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "(0, ∞)",
    pdf: (x, p) => (x > 0 ? npdf((Math.log(x) - p.mu) / p.sigma) / (x * p.sigma) : 0),
    pmf: () => 0,
    cdf: (x, p) => (x > 0 ? ncdf((Math.log(x) - p.mu) / p.sigma) : 0),
    sf: (x, p) => (x > 0 ? nsf((Math.log(x) - p.mu) / p.sigma) : 1),
    quantile: (u, p) => Math.exp(p.mu + p.sigma * nquantile(u, 1 - u)),
    isf: (w, p) => Math.exp(p.mu + p.sigma * nquantile(1 - w, w)),
    moments: (p) => light(Math.exp(p.mu + (p.sigma * p.sigma) / 2), Math.expm1(p.sigma * p.sigma) * Math.exp(2 * p.mu + p.sigma * p.sigma)),
    tailIndex: () => null,
    reference: (p) => ({ label: "X = exp(μ + σZ), with Z standard normal by the Box–Muller transform", exactness: "exact", draw: (rng) => Math.exp(p.mu + p.sigma * rng.normal()) }),
    inverse: (p, cut) => inverseSampler("Inverse transform: X = exp(μ + σ Φ⁻¹(U)), with Φ⁻¹ by Acklam's approximation and one Halley step", (u, w) => Math.exp(p.mu + p.sigma * nquantile(u, w)), cut, "exact up to a relative error of about 10^-15 in Φ⁻¹"),
    rejection: (p, f) => normalByLaplace(f, (z) => Math.exp(p.mu + p.sigma * z), "X = exp(μ + σZ)"),
  };

  /** @type {Law} */
  const weibull = {
    id: "weibull", name: "Weibull", continuous: true,
    params: [{ name: "k", kind: "real", text: "shape, 0.05 ≤ k ≤ 50" }, { name: "lambda", kind: "real", text: "scale, λ > 0" }],
    check: (p) => [...need(p, "k", 0.05, 50, "[0.05, 50]"), ...need(p, "lambda", 1e-300, 1e300, "(0, 10^300]")],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => (x < 0 ? 0 : x === 0 ? (p.k < 1 ? Infinity : p.k === 1 ? 1 / p.lambda : 0) : (p.k / p.lambda) * Math.pow(x / p.lambda, p.k - 1) * Math.exp(-Math.pow(x / p.lambda, p.k))),
    pmf: () => 0,
    cdf: (x, p) => (x <= 0 ? 0 : -Math.expm1(-Math.pow(x / p.lambda, p.k))),
    sf: (x, p) => (x <= 0 ? 1 : Math.exp(-Math.pow(x / p.lambda, p.k))),
    quantile: both((u, p) => p.lambda * Math.pow(-Math.log1p(-u), 1 / p.k), (w, p) => p.lambda * Math.pow(-Math.log(w), 1 / p.k)),
    isf: (w, p) => p.lambda * Math.pow(-Math.log(w), 1 / p.k),
    moments: (p) => { const g1 = gammaFn(1 + 1 / p.k), g2 = gammaFn(1 + 2 / p.k); return light(p.lambda * g1, p.lambda * p.lambda * (g2 - g1 * g1)); },
    tailIndex: () => null,
    reference: (p) => ({ label: "X = λ(−log U)^(1/k): inversion of the survival function", exactness: "exact", draw: (rng) => p.lambda * Math.pow(-Math.log(unif(rng)), 1 / p.k) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = λ(−log(1 − U))^(1/k)", (u, w) => p.lambda * Math.pow(-Math.log(w), 1 / p.k), cut),
    rejection: (p, f) => (p.k >= 1 ? weibullByExp(p.k, f, (y) => p.lambda * y, "X = λY") : { unavailable: `For k = ${p.k} < 1 the density is not bounded at 0 and its tail is heavier than an exponential tail, so the page has no envelope.` }),
  };

  /** @param {number} x @param {Params} p */
  function igCdf(x, p) {
    if (x <= 0) return 0;
    const s = Math.sqrt(p.lambda / x), b = s * (x / p.mu - 1), a = s * (x / p.mu + 1);
    return ncdf(b) + Math.exp((2 * p.lambda) / p.mu + nlogsf(a));
  }
  /** @param {number} x @param {Params} p */
  function igSf(x, p) {
    if (x <= 0) return 1;
    const s = Math.sqrt(p.lambda / x), b = s * (x / p.mu - 1), a = s * (x / p.mu + 1);
    return Math.max(0, nsf(b) - Math.exp((2 * p.lambda) / p.mu + nlogsf(a)));
  }
  /** The inverse Gaussian quantile: safeguarded Newton steps on the CDF (special.js) from the quantile of the lognormal law with the same mean and variance. @param {number} u @param {number} w @param {Params} p */
  function igQuantile(u, w, p) {
    const s2 = Math.log1p(p.mu / p.lambda), guess = Math.exp(Math.log(p.mu) - s2 / 2 + Math.sqrt(s2) * nquantile(u, w));
    const f = { cdf: (/** @type {number} */ y) => igCdf(y, p), sf: (/** @type {number} */ y) => igSf(y, p), pdf: (/** @type {number} */ y) => invgauss.pdf(y, p), lo: 0, hi: Infinity, guess };
    return u > 0.5 ? S.solveSurvival(w, f) : S.solveQuantile(u, f);
  }

  /** @type {Law} */
  const invgauss = {
    id: "invgauss", name: "Inverse Gaussian", continuous: true,
    params: [{ name: "mu", kind: "real", text: "mean, μ > 0" }, { name: "lambda", kind: "real", text: "shape, λ > 0, with λ/μ ≤ 10^4" }],
    check: (p) => [...need(p, "mu", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "lambda", 1e-100, 1e100, "(0, 10^100]"), ...(p.lambda / p.mu <= 1e4 && p.mu / p.lambda <= 1e4 ? [] : [`λ/μ = ${show(p.lambda / p.mu)} is outside [10^-4, 10^4].`])],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "(0, ∞)",
    pdf: (x, p) => (x > 0 ? Math.sqrt(p.lambda / (2 * PI * x * x * x)) * Math.exp((-p.lambda * (x - p.mu) * (x - p.mu)) / (2 * p.mu * p.mu * x)) : 0),
    pmf: () => 0,
    cdf: igCdf,
    sf: igSf,
    quantile: (u, p) => igQuantile(u, 1 - u, p),
    isf: (w, p) => igQuantile(1 - w, w, p),
    moments: (p) => light(p.mu, (p.mu * p.mu * p.mu) / p.lambda),
    tailIndex: () => null,
    reference: (p) => ({
      label: "Transformation with one normal and one uniform (Michael, Schucany and Haas 1976)", exactness: "exact",
      draw: (rng) => {
        const z = rng.normal(), v = z * z, mu = p.mu, l = p.lambda;
        const y = mu + (mu * mu * v) / (2 * l) - (mu / (2 * l)) * Math.sqrt(4 * mu * l * v + mu * mu * v * v);
        return unif(rng) <= mu / (mu + y) ? y : (mu * mu) / y;
      },
    }),
    inverse: (p, cut) => inverseSampler("Inverse transform: Newton steps on the CDF from the matching lognormal quantile", (u, w) => igQuantile(u, w, p), cut, "exact up to a relative error of 10^-13 in the root"),
    rejection: () => ({ unavailable: "The page gives no envelope for this law. The reference sampler, the exact transformation of Michael, Schucany and Haas, needs no rejection step." }),
  };

  /** @type {Law} */
  const gompertz = {
    id: "gompertz", name: "Gompertz", continuous: true,
    params: [{ name: "eta", kind: "real", text: "shape, the initial hazard divided by b, 0.001 ≤ η ≤ 1000" }, { name: "b", kind: "real", text: "rate of growth of the hazard, b > 0" }],
    check: (p) => [...need(p, "eta", 1e-3, 1e3, "[0.001, 1000]"), ...need(p, "b", 1e-100, 1e100, "(0, 10^100]")],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => (x < 0 ? 0 : p.b * p.eta * Math.exp(p.b * x - p.eta * Math.expm1(p.b * x))),
    pmf: () => 0,
    cdf: (x, p) => (x <= 0 ? 0 : -Math.expm1(-p.eta * Math.expm1(p.b * x))),
    sf: (x, p) => (x <= 0 ? 1 : Math.exp(-p.eta * Math.expm1(p.b * x))),
    quantile: both((u, p) => Math.log1p(-Math.log1p(-u) / p.eta) / p.b, (w, p) => Math.log1p(-Math.log(w) / p.eta) / p.b),
    isf: (w, p) => Math.log1p(-Math.log(w) / p.eta) / p.b,
    moments: (p) => {
      const mean = (Math.exp(p.eta) * e1(p.eta)) / p.b;
      const m2 = expectU((x) => x * x, (u) => gompertz.quantile(u, p), (v) => gompertz.isf(v, p));
      return light(mean, m2 === null ? NaN : m2 - mean * mean);
    },
    tailIndex: () => null,
    reference: (p) => ({ label: "X = log(1 − log(U)/η)/b: inversion of the survival function", exactness: "exact", draw: (rng) => Math.log1p(-Math.log(unif(rng)) / p.eta) / p.b }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = log(1 − log(1 − U)/η)/b", (u, w) => Math.log1p(-Math.log(w) / p.eta) / p.b, cut),
    rejection: (p, f) => reject("Proposal: the exponential law with rate ηb, which the hazard ηb e^{bx} never falls below",
      (x) => Math.log(p.b * p.eta) + p.b * x - p.eta * Math.expm1(p.b * x), (x) => Math.log(p.eta * p.b) - p.eta * p.b * x, (rng) => -Math.log(unif(rng)) / (p.eta * p.b),
      Math.exp(-1 + (1 + p.eta) * Math.log1p(1 / p.eta)), f),
  };

  /** @type {Law} */
  const loglogistic = {
    id: "loglogistic", name: "Log-logistic", continuous: true,
    params: [{ name: "alpha", kind: "real", text: "scale, the median, α > 0" }, { name: "beta", kind: "real", text: "shape, 0.05 ≤ β ≤ 100" }],
    check: (p) => [...need(p, "alpha", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "beta", 0.05, 100, "[0.05, 100]")],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => { if (x <= 0) return 0; const r = Math.pow(x / p.alpha, p.beta); return (p.beta / x) * r / ((1 + r) * (1 + r)); },
    pmf: () => 0,
    cdf: (x, p) => (x <= 0 ? 0 : 1 / (1 + Math.pow(x / p.alpha, -p.beta))),
    sf: (x, p) => (x <= 0 ? 1 : 1 / (1 + Math.pow(x / p.alpha, p.beta))),
    quantile: both((u, p) => p.alpha * Math.pow(u / (1 - u), 1 / p.beta), (w, p) => p.alpha * Math.pow((1 - w) / w, 1 / p.beta)),
    isf: (w, p) => p.alpha * Math.pow((1 - w) / w, 1 / p.beta),
    moments: (p) => heavy(p.beta, () => { const b = PI / p.beta; return (p.alpha * b) / Math.sin(b); }, () => { const b = PI / p.beta; return p.alpha * p.alpha * ((2 * b) / Math.sin(2 * b) - (b * b) / (Math.sin(b) ** 2)); }, "right"),
    tailIndex: (p) => p.beta,
    reference: (p) => ({ label: "X = α(U/(1 − U))^(1/β): α times the exponential of a logistic draw divided by β", exactness: "exact", draw: (rng) => { const u = unif(rng); return p.alpha * Math.pow(u / (1 - u), 1 / p.beta); } }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = α(U/(1 − U))^(1/β)", (u, w) => p.alpha * Math.pow(u / w, 1 / p.beta), cut),
    rejection: (p, f) => logisticByLaplace(f, (y) => p.alpha * Math.exp(y / p.beta), "X = α e^{Y/β}"),
  };

  /** @type {Law} */
  const pareto1 = {
    id: "pareto1", name: "Pareto I", continuous: true,
    params: [{ name: "xm", kind: "real", text: "scale, the least value, x_m > 0" }, { name: "alpha", kind: "real", text: "tail index, 0.05 ≤ α ≤ 100" }],
    check: (p) => [...need(p, "xm", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "alpha", 0.05, 100, "[0.05, 100]")],
    support: (p) => ({ lo: p.xm, hi: Infinity }),
    supportText: (p) => `[${p.xm}, ∞)`,
    pdf: (x, p) => (x < p.xm ? 0 : (p.alpha / p.xm) * Math.pow(x / p.xm, -p.alpha - 1)),
    pmf: () => 0,
    cdf: (x, p) => (x <= p.xm ? 0 : -Math.expm1(-p.alpha * Math.log(x / p.xm))),
    sf: (x, p) => (x <= p.xm ? 1 : Math.pow(x / p.xm, -p.alpha)),
    quantile: both((u, p) => p.xm * Math.exp(-Math.log1p(-u) / p.alpha), (w, p) => p.xm * Math.pow(w, -1 / p.alpha)),
    isf: (w, p) => p.xm * Math.pow(w, -1 / p.alpha),
    moments: (p) => heavy(p.alpha, () => (p.alpha * p.xm) / (p.alpha - 1), () => (p.xm * p.xm * p.alpha) / ((p.alpha - 1) ** 2 * (p.alpha - 2)), "right"),
    tailIndex: (p) => p.alpha,
    reference: (p) => ({ label: "X = x_m U^(−1/α): inversion of the survival function", exactness: "exact", draw: (rng) => p.xm * Math.pow(unif(rng), -1 / p.alpha) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = x_m (1 − U)^(−1/α)", (u, w) => p.xm * Math.pow(w, -1 / p.alpha), cut),
    rejection: (p, f) => reject(`Proposal: Pareto I with the index α/2 = ${+(p.alpha / 2).toPrecision(6)}, which has the heavier tail`,
      (x) => Math.log(p.alpha) - (p.alpha + 1) * Math.log(x / p.xm), (x) => Math.log(p.alpha / 2) - (p.alpha / 2 + 1) * Math.log(x / p.xm), (rng) => p.xm * Math.pow(unif(rng), -2 / p.alpha), 2, f),
  };

  /** @type {Law} */
  const pareto2 = {
    id: "pareto2", location: ["mu"], name: "Pareto II (Lomax)", continuous: true,
    params: [{ name: "mu", kind: "real", text: "location, the least value" }, { name: "sigma", kind: "real", text: "scale, σ > 0" }, { name: "alpha", kind: "real", text: "tail index, 0.05 ≤ α ≤ 100" }],
    check: (p) => [...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "sigma", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "alpha", 0.05, 100, "[0.05, 100]")],
    support: (p) => ({ lo: p.mu, hi: Infinity }),
    supportText: (p) => `[${p.mu}, ∞)`,
    pdf: (x, p) => (x < p.mu ? 0 : (p.alpha / p.sigma) * Math.exp(-(p.alpha + 1) * Math.log1p((x - p.mu) / p.sigma))),
    pmf: () => 0,
    cdf: (x, p) => (x <= p.mu ? 0 : -Math.expm1(-p.alpha * Math.log1p((x - p.mu) / p.sigma))),
    sf: (x, p) => (x <= p.mu ? 1 : Math.exp(-p.alpha * Math.log1p((x - p.mu) / p.sigma))),
    quantile: both((u, p) => p.mu + p.sigma * Math.expm1(-Math.log1p(-u) / p.alpha), (w, p) => p.mu + p.sigma * Math.expm1(-Math.log(w) / p.alpha)),
    isf: (w, p) => p.mu + p.sigma * Math.expm1(-Math.log(w) / p.alpha),
    moments: (p) => heavy(p.alpha, () => p.mu + p.sigma / (p.alpha - 1), () => (p.sigma * p.sigma * p.alpha) / ((p.alpha - 1) ** 2 * (p.alpha - 2)), "right"),
    tailIndex: (p) => p.alpha,
    reference: (p) => ({ label: "An exponential draw with a gamma rate: Λ ~ Gamma(α, rate σ) by Marsaglia–Tsang, then X = μ + E/Λ with E standard exponential", exactness: "exact",
      draw: (rng) => p.mu - Math.log(unif(rng)) / (C.gamma(rng, p.alpha) / p.sigma) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = μ + σ((1 − U)^(−1/α) − 1)", (u, w) => p.mu + p.sigma * Math.expm1(-Math.log(w) / p.alpha), cut),
    rejection: (p, f) => lomaxByLomax(p.alpha, f, (y) => p.mu + p.sigma * y, "X = μ + σY"),
  };

  /** @type {Law} */
  const burr12 = {
    id: "burr12", name: "Burr XII", continuous: true,
    params: [{ name: "c", kind: "real", text: "first shape, 0.05 ≤ c ≤ 100" }, { name: "k", kind: "real", text: "second shape, 0.05 ≤ k ≤ 100" }, { name: "lambda", kind: "real", text: "scale, λ > 0" }],
    check: (p) => [...need(p, "c", 0.05, 100, "[0.05, 100]"), ...need(p, "k", 0.05, 100, "[0.05, 100]"), ...need(p, "lambda", 1e-100, 1e100, "(0, 10^100]")],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => { if (x <= 0) return 0; const r = Math.pow(x / p.lambda, p.c); return ((p.c * p.k) / x) * r * Math.exp(-(p.k + 1) * Math.log1p(r)); },
    pmf: () => 0,
    cdf: (x, p) => (x <= 0 ? 0 : -Math.expm1(-p.k * Math.log1p(Math.pow(x / p.lambda, p.c)))),
    sf: (x, p) => (x <= 0 ? 1 : Math.exp(-p.k * Math.log1p(Math.pow(x / p.lambda, p.c)))),
    quantile: both((u, p) => p.lambda * Math.pow(Math.expm1(-Math.log1p(-u) / p.k), 1 / p.c), (w, p) => p.lambda * Math.pow(Math.expm1(-Math.log(w) / p.k), 1 / p.c)),
    isf: (w, p) => p.lambda * Math.pow(Math.expm1(-Math.log(w) / p.k), 1 / p.c),
    moments: (p) => {
      /** E[X^r] = λ^r k B(k − r/c, 1 + r/c). @param {number} r */
      const m = (r) => Math.pow(p.lambda, r) * p.k * Math.exp(S.lgamma(p.k - r / p.c) + S.lgamma(1 + r / p.c) - S.lgamma(p.k + 1));
      return heavy(p.c * p.k, () => m(1), () => m(2) - m(1) ** 2, "right");
    },
    tailIndex: (p) => p.c * p.k,
    reference: (p) => ({ label: "X = λ(U^(−1/k) − 1)^(1/c): inversion of the survival function", exactness: "exact", draw: (rng) => p.lambda * Math.pow(Math.expm1(-Math.log(unif(rng)) / p.k), 1 / p.c) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = λ((1 − U)^(−1/k) − 1)^(1/c)", (u, w) => p.lambda * Math.pow(Math.expm1(-Math.log(w) / p.k), 1 / p.c), cut),
    rejection: (p, f) => lomaxByLomax(p.k, f, (y) => p.lambda * Math.pow(y, 1 / p.c), "X = λY^(1/c)"),
  };

  /** @type {Law} */
  const frechet = {
    id: "frechet", location: ["m"], name: "Fréchet", continuous: true,
    params: [{ name: "alpha", kind: "real", text: "shape, the tail index, 0.05 ≤ α ≤ 100" }, { name: "s", kind: "real", text: "scale, s > 0" }, { name: "m", kind: "real", text: "location, the least value" }],
    check: (p) => [...need(p, "alpha", 0.05, 100, "[0.05, 100]"), ...need(p, "s", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "m", -1e100, 1e100, "[−10^100, 10^100]")],
    support: (p) => ({ lo: p.m, hi: Infinity }),
    supportText: (p) => `(${p.m}, ∞)`,
    pdf: (x, p) => { if (x <= p.m) return 0; const z = (x - p.m) / p.s, t = Math.pow(z, -p.alpha); return (p.alpha / p.s) * (t / z) * Math.exp(-t); },
    pmf: () => 0,
    cdf: (x, p) => (x <= p.m ? 0 : Math.exp(-Math.pow((x - p.m) / p.s, -p.alpha))),
    sf: (x, p) => (x <= p.m ? 1 : -Math.expm1(-Math.pow((x - p.m) / p.s, -p.alpha))),
    quantile: both((u, p) => p.m + p.s * Math.pow(-Math.log(u), -1 / p.alpha), (w, p) => p.m + p.s * Math.pow(-Math.log1p(-w), -1 / p.alpha)),
    isf: (w, p) => p.m + p.s * Math.pow(-Math.log1p(-w), -1 / p.alpha),
    moments: (p) => heavy(p.alpha, () => p.m + p.s * gammaFn(1 - 1 / p.alpha), () => p.s * p.s * (gammaFn(1 - 2 / p.alpha) - gammaFn(1 - 1 / p.alpha) ** 2), "right"),
    tailIndex: (p) => p.alpha,
    reference: (p) => ({ label: "X = m + s/W with W = (−log U)^(1/α), a Weibull(α, 1) draw", exactness: "exact", draw: (rng) => p.m + p.s / Math.pow(-Math.log(unif(rng)), 1 / p.alpha) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = m + s(−log U)^(−1/α)", (u, w) => p.m + p.s * Math.pow(mlog(u, w), -1 / p.alpha), cut),
    rejection: (p, f) => frechetByLogLogistic(p.alpha, f, (y) => p.m + p.s * y, "X = m + sY"),
  };

  /** @type {Law} */
  const cauchy = {
    id: "cauchy", location: ["x0"], name: "Cauchy", continuous: true,
    params: [{ name: "x0", kind: "real", text: "location, the median" }, { name: "gamma", kind: "real", text: "scale, the half-width at half-maximum, γ > 0" }],
    check: (p) => [...need(p, "x0", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "gamma", 1e-100, 1e100, "(0, 10^100]")],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => { const z = (x - p.x0) / p.gamma; return 1 / (PI * p.gamma * (1 + z * z)); },
    pmf: () => 0,
    cdf: (x, p) => { const z = (x - p.x0) / p.gamma; return z < 0 ? Math.atan2(1, -z) / PI : 1 - Math.atan2(1, z) / PI; },
    sf: (x, p) => { const z = (x - p.x0) / p.gamma; return z > 0 ? Math.atan2(1, z) / PI : 1 - Math.atan2(1, -z) / PI; },
    quantile: both((u, p) => p.x0 - p.gamma / Math.tan(PI * u), (w, p) => p.x0 + p.gamma / Math.tan(PI * w)),
    isf: (w, p) => (w <= 0.5 ? p.x0 + p.gamma / Math.tan(PI * w) : p.x0 - p.gamma / Math.tan(PI * (1 - w))),
    moments: () => ({ mean: null, variance: null, order: 1, side: "both" }),
    tailIndex: () => 1,
    reference: (p) => ({ label: "X = x_0 + γ Z_1/Z_2, a ratio of two independent standard normal draws", exactness: "exact", draw: (rng) => p.x0 + (p.gamma * rng.normal()) / rng.normal() }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = x_0 + γ tan(π(U − 1/2))", (u, w) => (u <= 0.5 ? p.x0 - p.gamma / Math.tan(PI * u) : p.x0 + p.gamma / Math.tan(PI * w)), cut),
    rejection: (p, f) => reject("Proposal: the two-sided Lomax law with density 1/(2(1 + |y|)²)", (y) => -Math.log(PI) - Math.log1p(y * y), (y) => -Math.LN2 - 2 * Math.log1p(Math.abs(y)),
      (rng) => { const v = 1 / unif(rng) - 1; return unif(rng) < 0.5 ? -v : v; }, 4 / PI, f, (y) => p.x0 + p.gamma * y),
  };

  /** @type {Law} */
  const levy = {
    id: "levy", location: ["mu"], name: "Lévy", continuous: true,
    params: [{ name: "mu", kind: "real", text: "location, the least value" }, { name: "c", kind: "real", text: "scale, c > 0" }],
    check: (p) => [...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "c", 1e-100, 1e100, "(0, 10^100]")],
    support: (p) => ({ lo: p.mu, hi: Infinity }),
    supportText: (p) => `(${p.mu}, ∞)`,
    pdf: (x, p) => { if (x <= p.mu) return 0; const y = x - p.mu; return Math.sqrt(p.c / (2 * PI)) * Math.pow(y, -1.5) * Math.exp(-p.c / (2 * y)); },
    pmf: () => 0,
    cdf: (x, p) => (x <= p.mu ? 0 : 2 * nsf(Math.sqrt(p.c / (x - p.mu)))),
    // P(X > x) = erf(√(c/(2(x − μ)))) = P(1/2, c/(2(x − μ))), which keeps its relative precision far in the tail.
    sf: (x, p) => (x <= p.mu ? 1 : S.gammaPQ(0.5, p.c / (2 * (x - p.mu))).P),
    quantile: both((u, p) => p.mu + p.c / nquantile(1 - u / 2, u / 2) ** 2, (w, p) => p.mu + p.c / nquantileHalf(w) ** 2),
    isf: (w, p) => p.mu + p.c / nquantileHalf(w) ** 2,
    moments: () => ({ mean: null, variance: null, order: 0.5, side: "right" }),
    tailIndex: () => 0.5,
    reference: (p) => ({ label: "X = μ + c/Z², with Z standard normal", exactness: "exact", draw: (rng) => { const z = rng.normal(); return p.mu + p.c / (z * z); } }),
    inverse: (p, cut) => inverseSampler("Inverse transform: X = μ + c/Φ⁻¹(1 − U/2)²", (u) => p.mu + p.c / nquantile(1 - u / 2, u / 2) ** 2, cut, "exact up to a relative error of about 10^-15 in Φ⁻¹"),
    rejection: (p, f) => reject("Proposal: Lomax(c, 1/2) for X − μ", (y) => 0.5 * Math.log(p.c / (2 * PI)) - 1.5 * Math.log(y) - p.c / (2 * y), (y) => -Math.log(2 * p.c) - 1.5 * Math.log1p(y / p.c),
      (rng) => p.c * (Math.pow(unif(rng), -2) - 1), Math.sqrt(2 / PI) * Math.pow(3, 1.5) / Math.E, f, (y) => p.mu + y),
  };

  /** The location δ₁ of the same law in Nolan's S1 parameterisation. @param {Params} p */
  const stableS1 = (p) => (p.alpha === 1 ? p.delta - p.beta * (2 / PI) * p.gamma * Math.log(p.gamma) : p.delta - p.beta * p.gamma * Math.tan((PI * p.alpha) / 2));

  /** @type {Law} */
  const stable = {
    id: "stable", name: "Stable (S0)", continuous: true, numeric: true,
    params: [{ name: "alpha", kind: "real", text: "index of stability, 0.2 ≤ α ≤ 2" }, { name: "beta", kind: "real", text: "skewness, −1 ≤ β ≤ 1" },
      { name: "gamma", kind: "real", text: "scale, γ > 0" }, { name: "delta", kind: "real", text: "location in the S0 parameterisation" }],
    check: (p) => [...need(p, "alpha", 0.2, 2, "[0.2, 2]"), ...need(p, "beta", -1, 1, "[−1, 1]"), ...need(p, "gamma", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "delta", -1e100, 1e100, "[−10^100, 10^100]"),
      ...(p.alpha !== 1 && Math.abs(p.alpha - 1) < 0.01 ? [`alpha = ${p.alpha} is within 0.01 of 1, where Nolan's integrals lose precision. Use α = 1 or |α − 1| ≥ 0.01.`] : [])],
    support: (p) => { const s = stableSupport(p.alpha, p.beta); return { lo: p.delta + p.gamma * s.lo, hi: p.delta + p.gamma * s.hi }; },
    supportText: (p) => { const s = stable.support(p); return `${Number.isFinite(s.lo) ? `[${+s.lo.toPrecision(6)}` : "(−∞"}, ${Number.isFinite(s.hi) ? `${+s.hi.toPrecision(6)}]` : "∞)"}`; },
    pdf: (x, p) => {
      const c = stableCase(p), z = (x - p.delta) / p.gamma;
      if (c === "normal") return npdf(z / Math.SQRT2) / (Math.SQRT2 * p.gamma);
      if (c === "levy") return levy.pdf(p.beta * z, { mu: -1, c: 1 }) / p.gamma;
      const s = stableSupport(p.alpha, p.beta);
      return z < s.lo || z > s.hi ? 0 : stable0(z, p.alpha, p.beta, "pdf") / p.gamma;
    },
    pmf: () => 0,
    cdf: (x, p) => {
      const c = stableCase(p), z = (x - p.delta) / p.gamma;
      if (c === "normal") return ncdf(z / Math.SQRT2);
      if (c === "levy") return p.beta > 0 ? levy.cdf(z, { mu: -1, c: 1 }) : levy.sf(-z, { mu: -1, c: 1 });
      const s = stableSupport(p.alpha, p.beta);
      return z <= s.lo ? 0 : z >= s.hi ? 1 : stable0(z, p.alpha, p.beta, "cdf");
    },
    sf: (x, p) => {
      const c = stableCase(p), z = (x - p.delta) / p.gamma;
      if (c === "normal") return nsf(z / Math.SQRT2);
      if (c === "levy") return p.beta > 0 ? levy.sf(z, { mu: -1, c: 1 }) : levy.cdf(-z, { mu: -1, c: 1 });
      const s = stableSupport(p.alpha, p.beta);
      return z <= s.lo ? 1 : z >= s.hi ? 0 : stable0(z, p.alpha, p.beta, "sf");
    },
    quantile: (u, p) => stableQuantile(u, 1 - u, p),
    isf: (w, p) => stableQuantile(1 - w, w, p),
    moments: (p) => {
      if (p.alpha === 2) return light(p.delta, 2 * p.gamma * p.gamma);
      const side = p.beta === 1 ? "right" : p.beta === -1 ? "left" : "both";
      return heavy(p.alpha, () => p.delta - p.beta * p.gamma * Math.tan((PI * p.alpha) / 2), () => NaN, side);
    },
    tailIndex: (p) => (p.alpha < 2 && p.beta > -1 ? p.alpha : null),
    alternate: (p) => `In the S1 parameterisation the same law is S(α, β, γ, δ₁; 1) with δ₁ = ${+stableS1(p).toPrecision(8)}.`,
    reference: (p) => ({ label: "Chambers–Mallows–Stuck: one uniform angle and one exponential draw, then X = γZ + δ", exactness: "exact", draw: (rng) => p.delta + p.gamma * cms(rng, p.alpha, p.beta) }),
    inverse: (p, cut) => {
      const c = stableCase(p);
      if (c === "normal") return inverseSampler("Inverse transform: X = δ + √2 γ Φ⁻¹(U) (α = 2, the normal law)", (u, w) => p.delta + Math.SQRT2 * p.gamma * nquantile(u, w), cut);
      if (c === "cauchy") return inverseSampler("Inverse transform: X = δ + γ tan(π(U − 1/2)) (α = 1, β = 0, the Cauchy law)", (u, w) => (u <= 0.5 ? p.delta - p.gamma / Math.tan(PI * u) : p.delta + p.gamma / Math.tan(PI * w)), cut);
      if (c === "levy") return inverseSampler("Inverse transform of the Lévy law (α = 1/2, β = ±1)", (u, w) => { const v = p.beta > 0 ? w : u; return p.delta + p.beta * p.gamma * (1 / nquantileHalf(v) ** 2 - 1); }, cut);
      const t = stableTable(p.alpha, p.beta);
      return inverseSampler("Inverse transform with a table of 401 quantiles of the numerical CDF (equally spaced in logit U from 10^-4 to 1 − 10^-4), monotone cubic interpolation, and beyond the table the power tail (1 − U)^(−1/α) on a heavy side or a root of the numerical CDF on a light side",
        (u, w) => p.delta + p.gamma * tableQuantile(t, u, w), cut, "approximate: an interpolated table of a numerical CDF");
    },
    rejection: (p, f) => {
      const c = stableCase(p);
      if (c === "normal") return normalByLaplace(f, (z) => p.delta + Math.SQRT2 * p.gamma * z, "X = δ + √2 γZ (α = 2)");
      if (c === "cauchy") return cauchy.rejection({ x0: p.delta, gamma: p.gamma }, f);
      if (c === "levy") return reject("Proposal: Lomax(1, 1/2) for the Lévy part L, with X = δ + βγ(L − 1) (α = 1/2, β = ±1)", (y) => -0.5 * Math.log(2 * PI) - 1.5 * Math.log(y) - 1 / (2 * y), (y) => -Math.LN2 - 1.5 * Math.log1p(y),
        (rng) => Math.pow(unif(rng), -2) - 1, Math.sqrt(2 / PI) * Math.pow(3, 1.5) / Math.E, f, (y) => p.delta + p.beta * p.gamma * (y - 1));
      return { unavailable: "The stable density has no closed form here: it is a numerical integral, so the page cannot guarantee an envelope constant M ≥ sup f/g." };
    },
  };

  /** The stable quantile: closed forms for the special cases, else a bracketed root of the numerical CDF. @param {number} u @param {number} w @param {Params} p */
  function stableQuantile(u, w, p) {
    const c = stableCase(p);
    if (c === "normal") return p.delta + Math.SQRT2 * p.gamma * nquantile(u, w);
    if (c === "cauchy") return u <= 0.5 ? p.delta - p.gamma / Math.tan(PI * u) : p.delta + p.gamma / Math.tan(PI * w);
    if (c === "levy") { const v = p.beta > 0 ? w : u; return p.delta + p.beta * p.gamma * (1 / nquantileHalf(v) ** 2 - 1); }
    const s = stableSupport(p.alpha, p.beta);
    return p.delta + p.gamma * stableRoot(p.alpha, p.beta, u, w, s, Number.isFinite(s.lo) ? s.lo + 1 : Number.isFinite(s.hi) ? s.hi - 1 : 0);
  }
  /** The standard stable x with F(x) = u, or S(x) = w above u = 1/2, by the safeguarded Newton solver of special.js. @param {number} a @param {number} b @param {number} u @param {number} w @param {{ lo: number, hi: number }} s @param {number} guess */
  function stableRoot(a, b, u, w, s, guess) {
    const f = { cdf: (/** @type {number} */ x) => stable0(x, a, b, "cdf"), sf: (/** @type {number} */ x) => stable0(x, a, b, "sf"), pdf: (/** @type {number} */ x) => stable0(x, a, b, "pdf"), lo: s.lo, hi: s.hi, guess };
    return u <= 0.5 ? S.solveQuantile(u, f) : S.solveSurvival(w, f);
  }

  /** GEV: t(x) = (1 + ξz)^(−1/ξ), or e^(−z) when ξ = 0. Returns null outside the support. @param {number} x @param {Params} p */
  function gevT(x, p) {
    const z = (x - p.mu) / p.sigma;
    if (p.xi === 0) return Math.exp(-z);
    const q = 1 + p.xi * z;
    if (q <= 0) return p.xi > 0 ? Infinity : 0;
    return Math.exp(-Math.log1p(p.xi * z) / p.xi);
  }
  /** (e^{−ξ y} − 1)/(−ξ) → y as ξ → 0, with no loss of precision near 0. @param {number} xi @param {number} y */
  const boxcox = (xi, y) => (xi === 0 ? y : Math.expm1(xi * y) / xi);

  /** @type {Law} */
  const gev = {
    id: "gev", location: ["mu"], name: "Generalised extreme value (GEV)", continuous: true,
    params: [{ name: "xi", kind: "real", text: "shape, −5 ≤ ξ ≤ 5: ξ > 0 Fréchet type, ξ = 0 Gumbel type, ξ < 0 reverse Weibull type" }, { name: "mu", kind: "real", text: "location" }, { name: "sigma", kind: "real", text: "scale, σ > 0" }],
    check: (p) => [...need(p, "xi", -5, 5, "[−5, 5]"), ...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "sigma", 1e-100, 1e100, "(0, 10^100]")],
    support: (p) => (p.xi > 0 ? { lo: p.mu - p.sigma / p.xi, hi: Infinity } : p.xi < 0 ? { lo: -Infinity, hi: p.mu - p.sigma / p.xi } : { lo: -Infinity, hi: Infinity }),
    supportText: (p) => { const s = gev.support(p); return p.xi > 0 ? `[${+s.lo.toPrecision(6)}, ∞)` : p.xi < 0 ? `(−∞, ${+s.hi.toPrecision(6)}]` : "(−∞, ∞)"; },
    pdf: (x, p) => { const t = gevT(x, p); return t === Infinity || t === 0 ? 0 : (Math.pow(t, p.xi + 1) * Math.exp(-t)) / p.sigma; },
    pmf: () => 0,
    cdf: (x, p) => Math.exp(-gevT(x, p)),
    sf: (x, p) => -Math.expm1(-gevT(x, p)),
    // Q(u) = μ + σ((−log u)^(−ξ) − 1)/ξ, written with y = −log(−log u) so that ξ = 0 needs no special case.
    quantile: both((u, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log(-Math.log(u))), (w, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log(-Math.log1p(-w)))),
    isf: (w, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log(-Math.log1p(-w))),
    moments: (p) => {
      if (p.xi === 0) return light(p.mu + p.sigma * EULER, (p.sigma * p.sigma * PI * PI) / 6);
      const g1 = () => gammaFn(1 - p.xi), g2 = () => gammaFn(1 - 2 * p.xi);
      const mean = () => (Math.abs(p.xi) < 1e-7 ? p.mu + p.sigma * (EULER + (EULER * EULER / 2 + PI * PI / 12) * p.xi) : p.mu + (p.sigma * (g1() - 1)) / p.xi);
      const variance = () => (Math.abs(p.xi) < 1e-7 ? (p.sigma * p.sigma * PI * PI) / 6 : (p.sigma * p.sigma * (g2() - g1() ** 2)) / (p.xi * p.xi));
      return p.xi > 0 ? heavy(1 / p.xi, mean, variance, "right") : light(mean(), variance());
    },
    tailIndex: (p) => (p.xi > 0 ? 1 / p.xi : null),
    reference: (p) => ({ label: "X = μ + σ((−log U)^(−ξ) − 1)/ξ: inversion of the CDF", exactness: "exact", draw: (rng) => p.mu + p.sigma * boxcox(p.xi, -Math.log(-Math.log(unif(rng)))) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = μ + σ((−log U)^(−ξ) − 1)/ξ, and μ − σ log(−log U) for ξ = 0", (u, w) => p.mu + p.sigma * boxcox(p.xi, -Math.log(mlog(u, w))), cut),
    rejection: (p, f) => {
      if (p.xi > 0) return frechetByLogLogistic(1 / p.xi, f, (y) => p.mu + (p.sigma * (y - 1)) / p.xi, "X = μ + σ(Y − 1)/ξ");
      if (p.xi === 0) return gumbelByLaplace(f, (y) => p.mu + p.sigma * y, "X = μ + σY");
      if (p.xi >= -1) return weibullByExp(-1 / p.xi, f, (y) => p.mu + (p.sigma * (1 - y)) / -p.xi, "X = μ + σ(1 − Y)/|ξ|");
      return { unavailable: `For ξ = ${p.xi} < −1 the density is not bounded at the upper end point, so the page has no envelope.` };
    },
  };

  /** @type {Law} */
  const gpd = {
    id: "gpd", location: ["mu"], name: "Generalised Pareto (GPD)", continuous: true,
    params: [{ name: "xi", kind: "real", text: "shape, −5 ≤ ξ ≤ 5: ξ > 0 a power tail, ξ = 0 exponential, ξ < 0 a finite end point" }, { name: "sigma", kind: "real", text: "scale, σ > 0" }, { name: "mu", kind: "real", text: "location, the threshold" }],
    check: (p) => [...need(p, "xi", -5, 5, "[−5, 5]"), ...need(p, "sigma", 1e-100, 1e100, "(0, 10^100]"), ...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]")],
    support: (p) => ({ lo: p.mu, hi: p.xi < 0 ? p.mu - p.sigma / p.xi : Infinity }),
    supportText: (p) => (p.xi < 0 ? `[${p.mu}, ${+(p.mu - p.sigma / p.xi).toPrecision(6)}]` : `[${p.mu}, ∞)`),
    pdf: (x, p) => {
      const z = (x - p.mu) / p.sigma;
      if (z < 0) return 0;
      if (p.xi === 0) return Math.exp(-z) / p.sigma;
      const q = 1 + p.xi * z;
      return q <= 0 ? 0 : Math.exp(-(1 / p.xi + 1) * Math.log1p(p.xi * z)) / p.sigma;
    },
    pmf: () => 0,
    cdf: (x, p) => -Math.expm1(gpdLogSf(x, p)),
    sf: (x, p) => Math.exp(gpdLogSf(x, p)),
    quantile: both((u, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log1p(-u)), (w, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log(w))),
    isf: (w, p) => p.mu + p.sigma * boxcox(p.xi, -Math.log(w)),
    moments: (p) => {
      const mean = () => p.mu + p.sigma / (1 - p.xi), variance = () => (p.sigma * p.sigma) / ((1 - p.xi) ** 2 * (1 - 2 * p.xi));
      return p.xi > 0 ? heavy(1 / p.xi, mean, variance, "right") : light(mean(), variance());
    },
    tailIndex: (p) => (p.xi > 0 ? 1 / p.xi : null),
    reference: (p) => ({ label: "X = μ + σ(U^(−ξ) − 1)/ξ: inversion of the survival function", exactness: "exact", draw: (rng) => p.mu + p.sigma * boxcox(p.xi, -Math.log(unif(rng))) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = μ + σ((1 − U)^(−ξ) − 1)/ξ", (u, w) => p.mu + p.sigma * boxcox(p.xi, -Math.log(w)), cut),
    rejection: (p, f) => {
      if (p.xi > 0) return lomaxByLomax(1 / p.xi, f, (y) => p.mu + (p.sigma / p.xi) * y, "X = μ + (σ/ξ)Y");
      if (p.xi === 0) return expByLomax(f, (y) => p.mu + p.sigma * y, "X = μ + σY");
      if (p.xi >= -1) {
        const top = -1 / p.xi;
        return reject(`Proposal: the uniform law on [0, ${+top.toPrecision(6)}], the support of the standard law`, (y) => (y > top ? -Infinity : -(1 / p.xi + 1) * Math.log1p(p.xi * y)), () => Math.log(-p.xi), (rng) => top * unif(rng), top, f, (y) => p.mu + p.sigma * y);
      }
      return { unavailable: `For ξ = ${p.xi} < −1 the density is not bounded at the upper end point, so the page has no envelope.` };
    },
  };
  /** log P(X > x) of the GPD. @param {number} x @param {Params} p */
  function gpdLogSf(x, p) {
    const z = (x - p.mu) / p.sigma;
    if (z <= 0) return 0;
    if (p.xi === 0) return -z;
    const q = 1 + p.xi * z;
    return q <= 0 ? -Infinity : -Math.log1p(p.xi * z) / p.xi;
  }

  /** @type {Law} */
  const gumbel = {
    id: "gumbel", location: ["mu"], name: "Gumbel", continuous: true,
    params: [{ name: "mu", kind: "real", text: "location, the mode" }, { name: "beta", kind: "real", text: "scale, β > 0" }],
    check: (p) => [...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "beta", 1e-100, 1e100, "(0, 10^100]")],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => { const z = (x - p.mu) / p.beta; return Math.exp(-z - Math.exp(-z)) / p.beta; },
    pmf: () => 0,
    cdf: (x, p) => Math.exp(-Math.exp(-(x - p.mu) / p.beta)),
    sf: (x, p) => -Math.expm1(-Math.exp(-(x - p.mu) / p.beta)),
    quantile: both((u, p) => p.mu - p.beta * Math.log(-Math.log(u)), (w, p) => p.mu - p.beta * Math.log(-Math.log1p(-w))),
    isf: (w, p) => p.mu - p.beta * Math.log(-Math.log1p(-w)),
    moments: (p) => light(p.mu + p.beta * EULER, (PI * PI * p.beta * p.beta) / 6),
    tailIndex: () => null,
    reference: (p) => ({ label: "X = μ − β log(−log U): inversion of the CDF", exactness: "exact", draw: (rng) => p.mu - p.beta * Math.log(-Math.log(unif(rng))) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = μ − β log(−log U)", (u, w) => p.mu - p.beta * Math.log(mlog(u, w)), cut),
    rejection: (p, f) => gumbelByLaplace(f, (y) => p.mu + p.beta * y, "X = μ + βY"),
  };

  /** @type {Law} */
  const revweibull = {
    id: "revweibull", location: ["mu"], name: "Reverse Weibull", continuous: true,
    params: [{ name: "alpha", kind: "real", text: "shape, 0.05 ≤ α ≤ 50" }, { name: "mu", kind: "real", text: "upper end point" }, { name: "sigma", kind: "real", text: "scale, σ > 0" }],
    check: (p) => [...need(p, "alpha", 0.05, 50, "[0.05, 50]"), ...need(p, "mu", -1e100, 1e100, "[−10^100, 10^100]"), ...need(p, "sigma", 1e-100, 1e100, "(0, 10^100]")],
    support: (p) => ({ lo: -Infinity, hi: p.mu }),
    supportText: (p) => `(−∞, ${p.mu}]`,
    pdf: (x, p) => { if (x >= p.mu) return 0; const y = (p.mu - x) / p.sigma; return (p.alpha / p.sigma) * Math.pow(y, p.alpha - 1) * Math.exp(-Math.pow(y, p.alpha)); },
    pmf: () => 0,
    cdf: (x, p) => (x >= p.mu ? 1 : Math.exp(-Math.pow((p.mu - x) / p.sigma, p.alpha))),
    sf: (x, p) => (x >= p.mu ? 0 : -Math.expm1(-Math.pow((p.mu - x) / p.sigma, p.alpha))),
    quantile: both((u, p) => p.mu - p.sigma * Math.pow(-Math.log(u), 1 / p.alpha), (w, p) => p.mu - p.sigma * Math.pow(-Math.log1p(-w), 1 / p.alpha)),
    isf: (w, p) => p.mu - p.sigma * Math.pow(-Math.log1p(-w), 1 / p.alpha),
    moments: (p) => { const g1 = gammaFn(1 + 1 / p.alpha), g2 = gammaFn(1 + 2 / p.alpha); return light(p.mu - p.sigma * g1, p.sigma * p.sigma * (g2 - g1 * g1)); },
    tailIndex: () => null,
    reference: (p) => ({ label: "X = μ − σW with W = (−log U)^(1/α), a Weibull(α, 1) draw", exactness: "exact", draw: (rng) => p.mu - p.sigma * Math.pow(-Math.log(unif(rng)), 1 / p.alpha) }),
    inverse: (p, cut) => inverseSampler("Inverse transform in closed form: X = μ − σ(−log U)^(1/α)", (u, w) => p.mu - p.sigma * Math.pow(mlog(u, w), 1 / p.alpha), cut),
    rejection: (p, f) => (p.alpha >= 1 ? weibullByExp(p.alpha, f, (y) => p.mu - p.sigma * y, "X = μ − σY") : { unavailable: `For α = ${p.alpha} < 1 the density is not bounded at the end point, so the page has no envelope.` }),
  };

  const LAWS = [lognormal, weibull, invgauss, gompertz, loglogistic, pareto1, pareto2, burr12, frechet, cauchy, levy, stable, gev, gpd, gumbel, revweibull];
  /* ---------- the law of one name: a variable, or a maximum, minimum, sum or affine function of draws ---------- */

  /**
   * @typedef {object} Bound a law with its parameters bound
   * @property {string} label @property {boolean} continuous @property {boolean} numeric the CDF is a numerical approximation
   * @property {boolean} [atoms] a law of finitely many values that need not be integers (group 4)
   * @property {boolean} [mixed] a continuous law on [0, ∞) with an atom P(X = 0) = F(0), such as a compound Poisson law (group 4)
   * @property {{ lo: number, hi: number }} support
   * @property {(x: number) => number} cdf @property {(x: number) => number} sf @property {(x: number) => number} mass the PDF, or the PMF of a discrete law
   * @property {(u: number, w: number) => number} quantile the x with F(x) = u, given u and w = 1 − u
   * @property {number | null} mean the mean when it is finite and known in closed form @property {boolean} exactMean
   * @property {number} order moments of order r exist for r < order @property {string} side
   * @property {number | null} tailIndex @property {(n: number) => Bound | null} [sum] the law of the sum of n i.i.d. copies, when closed
   */

  /** A law with its parameters; `dq` is the quantile function of a discrete law, from laws.js. @param {any} law @param {Params} p @param {(id: string, u: number, p: Params) => number} [dq] @returns {Bound} */
  function bind(law, p, dq) {
    const m = law.moments(p);
    const continuous = !!law.continuous;
    return {
      label: `${law.name}(${law.params.map((/** @type {any} */ x) => `${x.name} = ${Array.isArray(p[x.name]) ? "[…]" : +Number(p[x.name]).toPrecision(6)}`).join(", ")})`,
      continuous, mixed: !!law.mixed, numeric: !!law.numeric, support: law.support(p), atoms: !!law.atoms,
      cdf: (x) => law.cdf(x, p), sf: (x) => law.sf(x, p), mass: (x) => (continuous ? law.pdf(x, p) : law.pmf(x, p)),
      quantile: continuous ? (u, w) => (u <= 0.5 ? law.quantile(u, p) : law.isf(w, p)) : (u) => /** @type {any} */ (dq)(law.quantile ? law : law.id, u, p),
      mean: m.mean, exactMean: m.mean !== null && !law.numeric, order: m.order, side: m.side ?? "", tailIndex: law.tailIndex ? law.tailIndex(p) : m.order < Infinity ? m.order : null,
      sum: (n) => sumOf(law, p, n),
    };
  }

  /** The maximum of n i.i.d. draws: F^n. @param {Bound} b @param {number} n @returns {Bound} */
  function maxOf(b, n) {
    const powF = (/** @type {number} */ x) => { const F = b.cdf(x); return F >= 1 ? 1 : Math.exp(n * Math.log1p(-b.sf(x))); };
    return {
      label: `the maximum of ${n} draws of ${b.label}`, continuous: b.continuous, mixed: b.mixed, numeric: b.numeric, support: b.support,
      cdf: powF, sf: (x) => (b.sf(x) <= 0 ? 0 : -Math.expm1(n * Math.log1p(-b.sf(x)))),
      mass: b.continuous ? (x) => { const d = b.mass(x); return d === 0 ? 0 : n * Math.exp((n - 1) * Math.log1p(-b.sf(x))) * d; } : (x) => powF(x) - powF(x - 1),
      // F_M(x) ≥ u ⟺ F(x) ≥ u^{1/n}; 1 − u^{1/n} = −expm1(log(u)/n), with log u from the more precise of u and w.
      quantile: (u, w) => { const lu = u <= 0.5 ? Math.log(u) : Math.log1p(-w), v = Math.exp(lu / n), cv = -Math.expm1(lu / n); return b.quantile(v, cv); },
      // A heavy left tail becomes lighter in the maximum, by an amount the page does not compute: NaN is "unknown".
      mean: null, exactMean: false, order: b.side === "left" ? NaN : b.order, side: b.side === "left" ? "" : b.side === "both" ? "right" : b.side, tailIndex: b.tailIndex,
    };
  }

  /** The minimum of n i.i.d. draws: 1 − S^n. @param {Bound} b @param {number} n @returns {Bound} */
  function minOf(b, n) {
    const powS = (/** @type {number} */ x) => { const s = b.sf(x); return s <= 0 ? 0 : Math.exp(n * Math.log1p(-b.cdf(x))); };
    return {
      label: `the minimum of ${n} draws of ${b.label}`, continuous: b.continuous, mixed: b.mixed, numeric: b.numeric, support: b.support,
      cdf: (x) => 1 - powS(x), sf: powS,
      mass: b.continuous ? (x) => { const d = b.mass(x); return d === 0 ? 0 : n * Math.exp((n - 1) * Math.log1p(-b.cdf(x))) * d; } : (x) => powS(x - 1) - powS(x),
      quantile: (u, w) => { const lw = w <= 0.5 ? Math.log(w) : Math.log1p(-u), cv = Math.exp(lw / n), v = -Math.expm1(lw / n); return b.quantile(v, cv); },
      // The minimum of a law with one heavy right tail can have more moments than the law: the page does not claim them.
      mean: null, exactMean: false, order: b.side === "right" ? NaN : b.order, side: b.side === "right" ? "" : b.side === "both" ? "left" : b.side, tailIndex: null,
    };
  }

  /** a·Y + c for a continuous law of Y. @param {Bound} b @param {number} a @param {number} c @returns {Bound | null} */
  function affineOf(b, a, c) {
    if (!b.continuous || b.mixed || !(a !== 0) || !Number.isFinite(a) || !Number.isFinite(c)) return null;
    if (a === 1 && c === 0) return b;
    const pos = a > 0, map = (/** @type {number} */ y) => (y - c) / a;
    const lo = a * (pos ? b.support.lo : b.support.hi) + c, hi = a * (pos ? b.support.hi : b.support.lo) + c;
    return {
      label: `${+a.toPrecision(6)}·(${b.label}) + ${+c.toPrecision(6)}`, continuous: true, numeric: b.numeric, support: { lo, hi },
      cdf: pos ? (y) => b.cdf(map(y)) : (y) => b.sf(map(y)), sf: pos ? (y) => b.sf(map(y)) : (y) => b.cdf(map(y)),
      mass: (y) => b.mass(map(y)) / Math.abs(a),
      quantile: pos ? (u, w) => a * b.quantile(u, w) + c : (u, w) => a * b.quantile(w, u) + c,
      mean: b.mean === null ? null : a * b.mean + c, exactMean: b.exactMean, order: b.order,
      side: pos ? b.side : b.side === "right" ? "left" : b.side === "left" ? "right" : b.side, tailIndex: pos ? b.tailIndex : null,
      sum: b.sum ? (n) => { const s = /** @type {any} */ (b.sum)(n); return s && affineOf(s, a, n * c); } : undefined,
    };
  }

  /**
   * The law of the sum of n i.i.d. draws when the family is closed under sums: stable, Cauchy, Lévy and inverse
   * Gaussian. Null otherwise.
   * @param {any} law @param {Params} p @param {number} n @returns {Bound | null}
   */
  function sumOf(law, p, n) {
    if (n === 1) return bind(law, p);
    switch (law.id) {
      case "cauchy": return bind(cauchy, { x0: n * p.x0, gamma: n * p.gamma });
      case "levy": return bind(levy, { mu: n * p.mu, c: n * n * p.c });
      case "invgauss": return bind(invgauss, { mu: n * p.mu, lambda: n * n * p.lambda });
      case "stable": {
        const g = Math.pow(n, 1 / p.alpha) * p.gamma;
        const d = p.alpha === 1 ? n * p.delta + (2 / PI) * p.beta * p.gamma * n * Math.log(n) : n * p.delta + p.beta * p.gamma * Math.tan((PI * p.alpha) / 2) * (Math.pow(n, 1 / p.alpha) - n);
        return bind(stable, { alpha: p.alpha, beta: p.beta, gamma: g, delta: d });
      }
      default: return null;
    }
  }

  return { LAWS, nsf, nquantile, e1, stable0, cms, stableTable, tableQuantile, stableS1, expectU, bind, maxOf, minOf, affineOf, sumOf };
});
