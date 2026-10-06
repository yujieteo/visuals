/* Monte Carlo Probability Workbench, group 8: the engine of the Markov chain, sequential and quasi-Monte Carlo
 * laboratory. A laboratory record names one model of the code: a target law (a density known up to a constant),
 * a state-space model with its observations, or an integrand on the unit cube. prepare() checks the record and its
 * settings; block(c, b) computes independent run b: one Markov chain (Metropolis-Hastings, Gibbs or Hamiltonian
 * Monte Carlo), one sequential Monte Carlo sampler, one particle filter, or one randomisation of a scrambled Sobol
 * point set. Each run reads its own Philox streams, so the runs do not depend on the number of workers. summary()
 * keeps three kinds of diagnostic apart: Markov-chain diagnostics (acceptance, split R-hat, effective sample size,
 * autocorrelation, divergent transitions), weight degeneracy (the weight ESS, the largest weight, resampling and the
 * surviving ancestors) and estimation error (the spread of the independent runs against the reference value).
 * reference() gives exact values or numerical values with a stated method. Every function is pure: the page, its
 * workers and the tests run the same code.
 */
/** @param {any} root the global object @param {(R: any, S: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCRng ?? require("./rng.js"), root.MCSpecial ?? require("./special.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCChains = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./rng.js")} */ R, /** @type {typeof import("./special.js")} */ S) {
  "use strict";

  const FORMAT = "monte-carlo-workbench/lab", VERSION = 1, STREAM = "lab";
  const LIMITS = {
    runs: /** @type {[number, number]} */ ([2, 32]),
    size: /** @type {Record<string, [number, number]>} */ ({ target: [8, 16], filter: [6, 14], integral: [6, 18] }),
    leap: 200, temps: 200, moves: 20, lags: 2000, trace: 400, cloud: 600, lineages: 128, crowd: 48, steps: 200,
  };
  const FAMILY_METHODS = /** @type {Record<string, string[]>} */ ({ target: ["metropolis", "gibbs", "hmc", "smc"], filter: ["particle"], integral: ["rqmc", "independent"] });
  const LOG_2PI = Math.log(2 * Math.PI), TWO32 = 4294967296;
  // Streams of one run: v = 0 for start points and initial particles, 1 for proposals, momenta and dynamics,
  // 2 for acceptance uniforms, 3 for resampling, 4 for the scramble, 5 for independent uniforms.
  const V_INIT = 0, V_MOVE = 1, V_ACCEPT = 2, V_RESAMPLE = 3, V_SCRAMBLE = 4, V_PLAIN = 5;

  /* ---------- numerical helpers ---------- */

  /** @param {object | undefined} o @param {string} k */
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);

  // Wichura's algorithm AS 241 (PPND16), Applied Statistics 37 (1988) 477-484: the standard normal quantile with a
  // relative error near 1e-16. The tests check it against the bisection of special.js.
  const AS241 = {
    a: [3.3871328727963666080e0, 1.3314166789178437745e2, 1.9715909503065514427e3, 1.3731693765509461125e4, 4.5921953931549871457e4, 6.7265770927008700853e4, 3.3430575583588128105e4, 2.5090809287301226727e3],
    b: [1, 4.2313330701600911252e1, 6.8718700749205790830e2, 5.3941960214247511077e3, 2.1213794301586595867e4, 3.9307895800092710610e4, 2.8729085735721942674e4, 5.2264952788528545610e3],
    c: [1.42343711074968357734e0, 4.63033784615654529590e0, 5.76949722146069140550e0, 3.64784832476320460504e0, 1.27045825245236838258e0, 2.41780725177450611770e-1, 2.27238449892691845833e-2, 7.74545014278341407640e-4],
    d: [1, 2.05319162663775882187e0, 1.67638483018380384940e0, 6.89767334985100004550e-1, 1.48103976427480074590e-1, 1.51986665636164571966e-2, 5.47593808499534494600e-4, 1.05075007164441684324e-9],
    e: [6.65790464350110377720e0, 5.46378491116411436990e0, 1.78482653991729133580e0, 2.96560571828504891230e-1, 2.65321895265761230930e-2, 1.24266094738807843860e-3, 2.71155556874348757815e-5, 2.01033439929228813265e-7],
    f: [1, 5.99832206555887937690e-1, 1.36929880922735805310e-1, 1.48753612908506148525e-2, 7.86869131145613259100e-4, 1.84631831751005468180e-5, 1.42151175831644588870e-7, 2.04426310338993978564e-15],
  };
  /** @param {number[]} c @param {number} x */
  const poly = (c, x) => { let s = 0; for (let i = c.length - 1; i >= 0; i--) s = s * x + c[i]; return s; };
  /** The standard normal quantile, for 0 < p < 1. @param {number} p */
  function qnorm(p) {
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return (q * poly(AS241.a, r)) / poly(AS241.b, r);
    }
    let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p)), x;
    if (r <= 5) { r -= 1.6; x = poly(AS241.c, r) / poly(AS241.d, r); } else { r -= 5; x = poly(AS241.e, r) / poly(AS241.f, r); }
    return q < 0 ? -x : x;
  }

  /** log(sum exp(x_i)) without overflow. @param {ArrayLike<number>} xs */
  function logSumExp(xs) {
    let m = -Infinity;
    for (let i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
    if (m === -Infinity) return -Infinity;
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += Math.exp(xs[i] - m);
    return m + Math.log(s);
  }

  /** The effective sample size of normalised weights: 1 / sum W_i^2. @param {ArrayLike<number>} w */
  function weightEss(w) {
    let s = 0;
    for (let i = 0; i < w.length; i++) s += w[i] * w[i];
    return 1 / s;
  }

  /** Normalise log weights in place to weights that sum to 1; returns log of the sum of exp(lw). @param {Float64Array} lw @param {Float64Array} w */
  function normalise(lw, w) {
    const lse = logSumExp(lw);
    for (let i = 0; i < lw.length; i++) w[i] = Math.exp(lw[i] - lse);
    return lse;
  }

  /** A gamma(a, 1) draw by Marsaglia and Tsang's method (ACM TOMS 26, 2000). @param {any} rng @param {number} a @returns {number} */
  function gammaDraw(rng, a) {
    if (a < 1) return gammaDraw(rng, a + 1) * Math.pow(rng.uniform(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = rng.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rng.uniform();
      if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** The Student t quantile with nu degrees of freedom, for p > 0.5, from the inverse incomplete beta function. @param {number} p @param {number} nu */
  function tQuantile(p, nu) {
    const x = S.ibetaInv(2 * (1 - p), nu / 2, 0.5);
    return Math.sqrt((nu * (1 - x)) / x);
  }

  /** An in-place radix-2 complex FFT; sign -1 forward, +1 inverse (unscaled). @param {Float64Array} re @param {Float64Array} im @param {number} sign */
  function fft(re, im, sign) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (sign * 2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  /**
   * The autocorrelation of a series at lags 0 to maxLag, from the biased autocovariance (divisor n) by FFT, as
   * Geyer (1992) and the Stan reference manual define it.
   * @param {ArrayLike<number>} xs @param {number} maxLag
   */
  function autocorrelation(xs, maxLag) {
    const n = xs.length;
    let size = 1;
    while (size < 2 * n) size <<= 1;
    const re = new Float64Array(size), im = new Float64Array(size);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += xs[i];
    mean /= n;
    for (let i = 0; i < n; i++) re[i] = xs[i] - mean;
    fft(re, im, -1);
    for (let i = 0; i < size; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft(re, im, 1);
    const L = Math.min(maxLag, n - 1), out = new Array(L + 1), c0 = re[0];
    for (let k = 0; k <= L; k++) out[k] = c0 > 0 ? re[k] / c0 : k === 0 ? 1 : 0;
    return out;
  }

  /**
   * The integrated autocorrelation time tau = 1 + 2 sum rho_k by Geyer's initial monotone sequence: sums of pairs
   * rho_2t + rho_2t+1 while they stay positive, each no larger than the one before. `ended` is false when the lags ran
   * out before a pair became negative: tau is then a lower bound.
   * @param {ArrayLike<number>} rho
   */
  function geyer(rho) {
    let sum = 0, prev = Infinity, t = 0, ended = false;
    for (; 2 * t + 1 < rho.length; t++) {
      let p = rho[2 * t] + rho[2 * t + 1];
      if (!(p > 0)) { ended = true; break; }
      if (p > prev) p = prev;
      sum += p;
      prev = p;
    }
    return { tau: Math.max(-1 + 2 * sum, 1e-9), lags: 2 * t, ended };
  }

  /* ---------- target laws ---------- */

  const sq = (/** @type {number} */ x) => x * x;
  const Phi = (/** @type {number} */ x) => S.normalCdf(x);

  /**
   * The target laws: an unnormalised log density logp with its gradient, the Gibbs sweep where the full conditional
   * laws are standard, the reference law q of the sequential sampler (a product of normal laws, which also gives the
   * dispersed start points), a scale for each coordinate, and the functions whose expectations the examples estimate.
   * @type {Record<string, any>}
   */
  const TARGETS = {
    normal2: {
      coords: ["x1", "x2"],
      check: (/** @type {any} */ p) => (Math.abs(p.rho) < 1 ? [] : ["The correlation rho must lie strictly between −1 and 1."]),
      scale: () => [1, 1],
      logp(/** @type {number[]} */ x, /** @type {any} */ p) { const r = p.rho; return -(x[0] * x[0] - 2 * r * x[0] * x[1] + x[1] * x[1]) / (2 * (1 - r * r)); },
      grad(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {number[]} */ g) { const r = p.rho, q = 1 - r * r; g[0] = -(x[0] - r * x[1]) / q; g[1] = -(x[1] - r * x[0]) / q; },
      gibbs(/** @type {number[]} */ x, /** @type {any} */ rng, /** @type {any} */ p) {
        const r = p.rho, s = Math.sqrt(1 - r * r);
        x[0] = r * x[1] + s * rng.normal();
        x[1] = r * x[0] + s * rng.normal();
      },
      q: () => ({ mean: [0, 0], sd: [3, 3] }),
      point: () => [2.5, -2.5],
      window: () => [[-4, 4], [-4, 4]],
      f: { mean_x1: (/** @type {number[]} */ x) => x[0], sum_gt_2: (/** @type {number[]} */ x) => +(x[0] + x[1] > 2), product: (/** @type {number[]} */ x) => x[0] * x[1] },
      reference(/** @type {any} */ p) {
        const r = p.rho;
        return { tag: "exact", how: "closed form: x₁ + x₂ is normal with variance 2 + 2ρ", values: { mean_x1: 0, sum_gt_2: 1 - Phi(2 / Math.sqrt(2 + 2 * r)), product: r }, logZ: Math.log(2 * Math.PI * Math.sqrt(1 - r * r)) };
      },
    },
    mixture: {
      coords: ["x1", "x2"],
      check: (/** @type {any} */ p) => [...(p.w > 0 && p.w < 1 ? [] : ["The weight w must lie strictly between 0 and 1."]), ...(p.b >= 0 && p.b <= 8 ? [] : ["The mode distance b must lie in [0, 8]."])],
      scale: () => [1, 1],
      logp(/** @type {number[]} */ x, /** @type {any} */ p) {
        const l1 = Math.log(1 - p.w) - (sq(x[0] + p.b) + sq(x[1] + p.b)) / 2, l2 = Math.log(p.w) - (sq(x[0] - p.b) + sq(x[1] - p.b)) / 2;
        const m = Math.max(l1, l2);
        return m + Math.log(Math.exp(l1 - m) + Math.exp(l2 - m));
      },
      grad(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {number[]} */ g) {
        const l1 = Math.log(1 - p.w) - (sq(x[0] + p.b) + sq(x[1] + p.b)) / 2, l2 = Math.log(p.w) - (sq(x[0] - p.b) + sq(x[1] - p.b)) / 2;
        const r2 = 1 / (1 + Math.exp(l1 - l2)), r1 = 1 - r2;
        g[0] = r1 * (-p.b - x[0]) + r2 * (p.b - x[0]);
        g[1] = r1 * (-p.b - x[1]) + r2 * (p.b - x[1]);
      },
      gibbs(/** @type {number[]} */ x, /** @type {any} */ rng, /** @type {any} */ p) {
        // x1 given x2 is a mixture of N(-b, 1) and N(b, 1) with weights from the density of x2 in each mode.
        for (const [i, j] of [[0, 1], [1, 0]]) {
          const l1 = Math.log(1 - p.w) - sq(x[j] + p.b) / 2, l2 = Math.log(p.w) - sq(x[j] - p.b) / 2;
          const up = rng.uniform() < 1 / (1 + Math.exp(l1 - l2));
          x[i] = (up ? p.b : -p.b) + rng.normal();
        }
      },
      q: (/** @type {any} */ p) => ({ mean: [0, 0], sd: [p.b + 2, p.b + 2] }),
      point: (/** @type {any} */ p) => [-p.b, -p.b],
      window: (/** @type {any} */ p) => [[-p.b - 4, p.b + 4], [-p.b - 4, p.b + 4]],
      f: { upper: (/** @type {number[]} */ x) => +(x[0] + x[1] > 0), mean_x1: (/** @type {number[]} */ x) => x[0] },
      reference(/** @type {any} */ p) {
        return { tag: "exact", how: "closed form: x₁ + x₂ is normal with mean ±2b and variance 2 in each mode", values: { upper: (1 - p.w) * Phi(-p.b * Math.SQRT2) + p.w * Phi(p.b * Math.SQRT2), mean_x1: p.b * (2 * p.w - 1) }, logZ: LOG_2PI };
      },
    },
    funnel: {
      coords: ["v", "x"],
      check: (/** @type {any} */ p) => (p.s > 0 && p.s <= 5 ? [] : ["The scale s of v must lie in (0, 5]."]),
      scale: () => [1, 1],
      gibbsNote: "The law of v given x is not a standard law, so the page has no Gibbs sweep for the funnel.",
      logp(/** @type {number[]} */ x, /** @type {any} */ p) { return -sq(x[0]) / (2 * p.s * p.s) - (sq(x[1]) * Math.exp(-x[0])) / 2 - x[0] / 2; },
      grad(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {number[]} */ g) {
        const e = Math.exp(-x[0]);
        g[0] = -x[0] / (p.s * p.s) + (sq(x[1]) * e) / 2 - 0.5;
        g[1] = -x[1] * e;
      },
      q: (/** @type {any} */ p) => ({ mean: [0, 0], sd: [p.s, 10] }),
      point: () => [0, 0],
      window: (/** @type {any} */ p) => [[-3 * p.s, 3 * p.s], [-12, 12]],
      f: { neck: (/** @type {number[]} */ x) => +(x[0] < -3), mean_v: (/** @type {number[]} */ x) => x[0] },
      reference(/** @type {any} */ p) {
        return { tag: "exact", how: "closed form: v is N(0, s²)", values: { neck: Phi(-3 / p.s), mean_v: 0 }, logZ: Math.log(2 * Math.PI * p.s) };
      },
    },
    balance: {
      coords: ["mu", "log_sigma"],
      check: (/** @type {any} */ p) => [...(p.tau0 > 0 ? [] : ["The prior standard deviation tau0 must be positive."]), ...(p.a0 > 0 && p.b0 > 0 ? [] : ["The prior parameters a0 and b0 must be positive."])],
      scale: (/** @type {any} */ p, /** @type {any} */ data) => [Math.max(0.05, sdOf(data.y) / Math.sqrt(data.y.length)), 0.25],
      logp(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {any} */ data) {
        const y = data.y, n = y.length, mu = x[0], s = x[1], e2 = Math.exp(-2 * s);
        let ss = 0;
        for (let i = 0; i < n; i++) ss += sq(y[i] - mu);
        return -0.5 * n * LOG_2PI - n * s - (ss * e2) / 2 - 0.5 * Math.log(2 * Math.PI * p.tau0 * p.tau0) - sq(mu - p.mu0) / (2 * p.tau0 * p.tau0)
          + p.a0 * Math.log(p.b0) - S.lgamma(p.a0) - 2 * (p.a0 + 1) * s - p.b0 * e2 + Math.LN2 + 2 * s;
      },
      grad(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {number[]} */ g, /** @type {any} */ data) {
        const y = data.y, n = y.length, mu = x[0], e2 = Math.exp(-2 * x[1]);
        let sy = 0, ss = 0;
        for (let i = 0; i < n; i++) { sy += y[i] - mu; ss += sq(y[i] - mu); }
        g[0] = sy * e2 - (mu - p.mu0) / (p.tau0 * p.tau0);
        g[1] = -n + ss * e2 - 2 * p.a0 + 2 * p.b0 * e2;
      },
      gibbs(/** @type {number[]} */ x, /** @type {any} */ rng, /** @type {any} */ p, /** @type {any} */ data) {
        // mu given sigma^2 is normal; sigma^2 given mu is inverse gamma. The chain moves on (mu, log sigma).
        const y = data.y, n = y.length;
        let sy = 0;
        for (let i = 0; i < n; i++) sy += y[i];
        const s2 = Math.exp(2 * x[1]), v = 1 / (1 / (p.tau0 * p.tau0) + n / s2), m = v * (p.mu0 / (p.tau0 * p.tau0) + sy / s2);
        x[0] = m + Math.sqrt(v) * rng.normal();
        let ss = 0;
        for (let i = 0; i < n; i++) ss += sq(y[i] - x[0]);
        x[1] = 0.5 * Math.log((p.b0 + ss / 2) / gammaDraw(rng, p.a0 + n / 2));
      },
      q: (/** @type {any} */ p) => ({ mean: [p.mu0, 0], sd: [2 * p.tau0, 1] }),
      point: (/** @type {any} */ p) => [p.mu0, 0],
      window: (/** @type {any} */ p, /** @type {any} */ data) => {
        const m = meanOf(data.y), se = Math.max(0.05, sdOf(data.y) / Math.sqrt(data.y.length)), ls = Math.log(sdOf(data.y));
        return [[m - 6 * se, m + 6 * se], [ls - 1.2, ls + 1.2]];
      },
      f: {
        bias_prob: (/** @type {number[]} */ x, /** @type {any} */ p) => +(x[0] - p.mu0 > p.c),
        bias: (/** @type {number[]} */ x, /** @type {any} */ p) => x[0] - p.mu0,
        sigma: (/** @type {number[]} */ x) => Math.exp(x[1]),
      },
      evidence: {
        log_z: (/** @type {number} */ logZ) => logZ,
        post_m1: (/** @type {number} */ logZ, /** @type {any} */ ref) => 1 / (1 + Math.exp(ref.logZ0 - logZ)),
      },
      reference: balanceReference,
    },
    oring: {
      coords: ["alpha", "beta"],
      check: (/** @type {any} */ p) => [...(p.sa > 0 && p.sb > 0 ? [] : ["The prior standard deviations sa and sb must be positive."]), ...(p.t0 >= 0 && p.t0 <= 100 ? [] : ["The temperature t0 must lie in [0, 100] °F."])],
      scale: () => [0.4, 0.45],
      gibbsNote: "The full conditional laws of a logistic regression are not standard laws. A Pólya-Gamma augmentation would give them, but this page does not have it, so it has no Gibbs sweep here.",
      logp(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {any} */ data) { return oringLogp(x[0], x[1], p, data); },
      grad(/** @type {number[]} */ x, /** @type {any} */ p, /** @type {number[]} */ g, /** @type {any} */ data) {
        let ga = -x[0] / (p.sa * p.sa), gb = -x[1] / (p.sb * p.sb);
        for (let i = 0; i < data.t.length; i++) {
          const z = (data.t[i] - 70) / 10, pr = 1 / (1 + Math.exp(-(x[0] + x[1] * z))), r = data.k[i] - data.m * pr;
          ga += r;
          gb += r * z;
        }
        g[0] = ga;
        g[1] = gb;
      },
      q: (/** @type {any} */ p) => ({ mean: [0, 0], sd: [p.sa, p.sb] }),
      point: () => [0, 0],
      window: (/** @type {any} */ p, /** @type {any} */ data, /** @type {any} */ ref) => (ref?.mode ? ref.mode.map((/** @type {number} */ m, /** @type {number} */ j) => [m - 5 * ref.sd[j], m + 5 * ref.sd[j]]) : [[-6, 0], [-3.5, 1]]),
      f: {
        pred_t0: (/** @type {number[]} */ x, /** @type {any} */ p, /** @type {any} */ data) => 1 - Math.pow(1 - logistic(x[0] + (x[1] * (p.t0 - 70)) / 10), data.m),
        p_t0: (/** @type {number[]} */ x, /** @type {any} */ p) => logistic(x[0] + (x[1] * (p.t0 - 70)) / 10),
        slope_neg: (/** @type {number[]} */ x) => +(x[1] < 0),
      },
      reference: oringReference,
    },
  };

  /** @param {number} x */
  const logistic = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
  /** log(1 + e^x) without overflow. @param {number} x */
  const softplus = (x) => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)));
  /** @param {number[]} xs */
  const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  /** @param {number[]} xs */
  const sdOf = (xs) => { const m = meanOf(xs); return Math.sqrt(xs.reduce((a, b) => a + sq(b - m), 0) / (xs.length - 1)); };

  /** The sum of log C(m, k_i), once for each data object. @type {WeakMap<object, number>} */
  const binomialConst = new WeakMap();
  /** The O-ring log posterior with all constants: binomial counts of distressed O-rings, logit-linear in temperature. @param {number} a @param {number} b @param {any} p @param {any} data */
  function oringLogp(a, b, p, data) {
    let c = binomialConst.get(data);
    if (c === undefined) { c = /** @type {number} */ (data.k.reduce((/** @type {number} */ a2, /** @type {number} */ k) => a2 + S.lchoose(data.m, k), 0)); binomialConst.set(data, c); }
    let s = c - sq(a) / (2 * p.sa * p.sa) - sq(b) / (2 * p.sb * p.sb) - Math.log(2 * Math.PI * p.sa * p.sb);
    for (let i = 0; i < data.t.length; i++) {
      const eta = a + (b * (data.t[i] - 70)) / 10, k = data.k[i];
      s -= k * softplus(-eta) + (data.m - k) * softplus(eta);
    }
    return s;
  }

  /**
   * Reference values of the balance model by quadrature in log sigma: for each sigma the law of mu is normal, so its
   * integral and P(mu - mu0 > c) are closed forms. The trapezoid rule on 4,001 points over the whole mass of log sigma
   * has an error far below 1e-9. The evidence of model 0 (mu = mu0) is a closed form.
   * @param {any} p @param {any} data
   */
  function balanceReference(p, data) {
    const y = data.y, n = y.length, ybar = meanOf(y), t2 = p.tau0 * p.tau0;
    const ssw = y.reduce((/** @type {number} */ a, /** @type {number} */ v) => a + sq(v - ybar), 0);
    /** @param {number} s */
    const at = (s) => {
      const s2 = Math.exp(2 * s), v = 1 / (1 / t2 + n / s2), m = v * (p.mu0 / t2 + (n * ybar) / s2);
      const L = -0.5 * n * LOG_2PI - n * s - 0.5 * Math.log(2 * Math.PI * t2) + 0.5 * Math.log(2 * Math.PI * v) - sq(ybar - p.mu0) / (2 * (s2 / n + t2)) - ssw / (2 * s2)
        + p.a0 * Math.log(p.b0) - S.lgamma(p.a0) - 2 * (p.a0 + 1) * s - p.b0 / s2 + Math.LN2 + 2 * s;
      return { L, m, v };
    };
    // The mode of the marginal of log sigma, then a grid that covers it with room on both sides.
    let lo = -12, hi = 12;
    for (let i = 0; i < 200; i++) {
      const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
      if (at(a).L < at(b).L) lo = a; else hi = b;
    }
    const mode = (lo + hi) / 2, top = at(mode).L;
    let left = mode, right = mode;
    while (at(left).L - top > -60 && left > mode - 30) left -= 0.05;
    while (at(right).L - top > -60 && right < mode + 30) right += 0.05;
    const G = 4001, h = (right - left) / (G - 1);
    let z = 0, prob = 0, mean = 0, sig = 0;
    for (let i = 0; i < G; i++) {
      const s = left + i * h, r = at(s), w = (i === 0 || i === G - 1 ? 0.5 : 1) * Math.exp(r.L - top);
      z += w;
      prob += w * (1 - Phi((p.mu0 + p.c - r.m) / Math.sqrt(r.v)));
      mean += w * (r.m - p.mu0);
      sig += w * Math.exp(s);
    }
    const logZ = top + Math.log(z * h);
    const ss0 = y.reduce((/** @type {number} */ a, /** @type {number} */ v) => a + sq(v - p.mu0), 0);
    const logZ0 = p.a0 * Math.log(p.b0) + S.lgamma(p.a0 + n / 2) - S.lgamma(p.a0) - 0.5 * n * LOG_2PI - (p.a0 + n / 2) * Math.log(p.b0 + ss0 / 2);
    return {
      tag: "numerical", how: "quadrature in log σ (trapezoid rule, 4,001 points); μ given σ in closed form; the evidence of model 0 in closed form",
      values: { bias_prob: prob / z, bias: mean / z, sigma: sig / z, log_z: logZ, post_m1: 1 / (1 + Math.exp(logZ0 - logZ)) }, logZ, logZ0,
    };
  }

  /**
   * Reference values of the O-ring model by quadrature on a grid of 241 by 241 points over the posterior mode plus or
   * minus 9 standard deviations of the normal approximation at the mode (trapezoid rule).
   * @param {any} p @param {any} data
   */
  function oringReference(p, data) {
    // Newton's method for the mode, with the Hessian of the log posterior.
    let a = 0, b = 0, haa = 0, hbb = 0, hab = 0;
    for (let it = 0; it < 100; it++) {
      let ga = -a / (p.sa * p.sa), gb = -b / (p.sb * p.sb);
      haa = -1 / (p.sa * p.sa); hbb = -1 / (p.sb * p.sb); hab = 0;
      for (let i = 0; i < data.t.length; i++) {
        const z = (data.t[i] - 70) / 10, pr = logistic(a + b * z), r = data.k[i] - data.m * pr, w = data.m * pr * (1 - pr);
        ga += r; gb += r * z; haa -= w; hbb -= w * z * z; hab -= w * z;
      }
      const det = haa * hbb - hab * hab, da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
      a -= da; b -= db;
      if (Math.abs(da) + Math.abs(db) < 1e-13) break;
    }
    const det = haa * hbb - hab * hab, sda = Math.sqrt(-hbb / det), sdb = Math.sqrt(-haa / det);
    const G = 241, top = oringLogp(a, b, p, data);
    const ha = (18 * sda) / (G - 1), hb = (18 * sdb) / (G - 1);
    let z = 0;
    const acc = { pred_t0: 0, p_t0: 0, slope_neg: 0 };
    for (let i = 0; i < G; i++) {
      const x0 = a - 9 * sda + i * ha, wi = i === 0 || i === G - 1 ? 0.5 : 1;
      for (let j = 0; j < G; j++) {
        const x1 = b - 9 * sdb + j * hb, w = wi * (j === 0 || j === G - 1 ? 0.5 : 1) * Math.exp(oringLogp(x0, x1, p, data) - top);
        const pt = logistic(x0 + (x1 * (p.t0 - 70)) / 10);
        z += w;
        acc.pred_t0 += w * (1 - Math.pow(1 - pt, data.m));
        acc.p_t0 += w * pt;
        // The grid line x1 = 0 counts one half on each side.
        acc.slope_neg += w * (x1 < -1e-12 ? 1 : x1 > 1e-12 ? 0 : 0.5);
      }
    }
    const logZ = top + Math.log(z * ha * hb);
    return {
      tag: "numerical", how: "quadrature on 241 × 241 points over the mode ± 9 standard deviations (trapezoid rule)",
      values: { pred_t0: acc.pred_t0 / z, p_t0: acc.p_t0 / z, slope_neg: acc.slope_neg / z }, logZ, mode: [a, b], sd: [sda, sdb],
    };
  }

  /* ---------- state-space models ---------- */

  /**
   * The state-space models of the particle filter: the law of x0, the transition, the log density of an observation
   * given the state, and an exact or numerical reference filter.
   * @type {Record<string, any>}
   */
  const FILTERS = {
    level: {
      check: (/** @type {any} */ p) => [...(p.sx > 0 && p.sy > 0 && p.s0 > 0 ? [] : ["The standard deviations sx, sy and s0 must be positive."])],
      init: (/** @type {any} */ rng, /** @type {any} */ p) => p.m0 + p.s0 * rng.normal(),
      step: (/** @type {number} */ x, /** @type {any} */ rng, /** @type {any} */ p) => x + p.d + p.sx * rng.normal(),
      logg: (/** @type {number} */ y, /** @type {number} */ x, /** @type {any} */ p) => -0.5 * LOG_2PI - Math.log(p.sy) - sq(y - x) / (2 * p.sy * p.sy),
      f: { level_T: (/** @type {number} */ x) => x, above: (/** @type {number} */ x, /** @type {any} */ p) => +(x > p.h) },
      reference: kalman,
    },
    sv: {
      check: (/** @type {any} */ p) => [...(Math.abs(p.phi) < 1 ? [] : ["The persistence phi must lie strictly between −1 and 1."]), ...(p.s > 0 ? [] : ["The standard deviation s must be positive."]), ...(p.c > 0 ? [] : ["The threshold c must be positive."])],
      init: (/** @type {any} */ rng, /** @type {any} */ p) => p.mu + (p.s / Math.sqrt(1 - p.phi * p.phi)) * rng.normal(),
      step: (/** @type {number} */ x, /** @type {any} */ rng, /** @type {any} */ p) => p.mu + p.phi * (x - p.mu) + p.s * rng.normal(),
      logg: (/** @type {number} */ y, /** @type {number} */ x) => -0.5 * LOG_2PI - x / 2 - (y * y * Math.exp(-x)) / 2,
      f: { vol_T: (/** @type {number} */ x) => Math.exp(x / 2), above: (/** @type {number} */ x, /** @type {any} */ p) => +(Math.exp(x / 2) > p.c) },
      reference: gridFilter,
    },
  };

  /** The Kalman filter of the level model: exact filter means and variances and the exact log likelihood. @param {any} p @param {any} data */
  function kalman(p, data) {
    let m = p.m0, P = p.s0 * p.s0, ll = 0;
    const means = [], sds = [];
    for (const y of data.y) {
      const mp = m + p.d, Pp = P + p.sx * p.sx, Sv = Pp + p.sy * p.sy, K = Pp / Sv;
      ll += -0.5 * Math.log(2 * Math.PI * Sv) - sq(y - mp) / (2 * Sv);
      m = mp + K * (y - mp);
      P = (1 - K) * Pp;
      means.push(m);
      sds.push(Math.sqrt(P));
    }
    return { tag: "exact", how: "the Kalman filter, exact for a linear model with normal noise", values: { level_T: m, above: 1 - Phi((p.h - m) / Math.sqrt(P)), loglik: ll }, logZ: ll, means, sds };
  }

  /**
   * A point-mass filter of the volatility model on 601 grid points over the stationary mean plus or minus 10
   * stationary standard deviations: the prediction step is a sum with the normal transition density.
   * @param {any} p @param {any} data
   */
  function gridFilter(p, data) {
    const sdStat = p.s / Math.sqrt(1 - p.phi * p.phi), G = 601, lo = p.mu - 10 * sdStat, h = (20 * sdStat) / (G - 1);
    const xs = Array.from({ length: G }, (_, i) => lo + i * h);
    let w = xs.map((x) => Math.exp(-sq(x - p.mu) / (2 * sdStat * sdStat)));
    let tot = w.reduce((a, b) => a + b, 0);
    w = w.map((v) => v / tot);
    let ll = 0;
    const means = [], sds = [];
    const kernel = new Float64Array(G * G);
    for (let i = 0; i < G; i++) {
      let row = 0;
      for (let j = 0; j < G; j++) { const v = Math.exp(-sq(xs[j] - p.mu - p.phi * (xs[i] - p.mu)) / (2 * p.s * p.s)); kernel[i * G + j] = v; row += v; }
      for (let j = 0; j < G; j++) kernel[i * G + j] /= row;
    }
    for (const y of data.y) {
      const pred = new Float64Array(G);
      for (let i = 0; i < G; i++) { const wi = w[i]; if (wi < 1e-300) continue; for (let j = 0; j < G; j++) pred[j] += wi * kernel[i * G + j]; }
      let z = 0;
      const post = new Array(G);
      for (let j = 0; j < G; j++) { post[j] = pred[j] * Math.exp(FILTERS.sv.logg(y, xs[j], p)); z += post[j]; }
      ll += Math.log(z);
      w = post.map((v) => v / z);
      let m = 0, m2 = 0;
      for (let j = 0; j < G; j++) { m += w[j] * xs[j]; m2 += w[j] * xs[j] * xs[j]; }
      means.push(m);
      sds.push(Math.sqrt(Math.max(0, m2 - m * m)));
    }
    let vol = 0, above = 0;
    for (let j = 0; j < G; j++) { vol += w[j] * Math.exp(xs[j] / 2); above += w[j] * (Math.exp(xs[j] / 2) > p.c ? 1 : 0); }
    return { tag: "numerical", how: "a point-mass filter on 601 grid points; the error comes from the grid", values: { vol_T: vol, above, loglik: ll }, logZ: ll, means, sds };
  }

  /* ---------- integrands ---------- */

  /**
   * The integrands on the unit cube [0, 1)^d, with their exact integrals.
   * @type {Record<string, any>}
   */
  const INTEGRANDS = {
    peak: {
      check: (/** @type {any} */ p) => [...(Number.isInteger(p.d) && p.d >= 1 && p.d <= 21 ? [] : ["The dimension d must be an integer from 1 to 21."]), ...(p.a > 0 ? [] : ["The peak width a must be positive."])],
      dim: (/** @type {any} */ p) => p.d,
      eval(/** @type {Float64Array} */ u, /** @type {any} */ p, /** @type {Float64Array} */ out) {
        let v = 1;
        const ia = 1 / (p.a * p.a);
        for (let j = 0; j < p.d; j++) v /= ia + sq(u[j] - 0.5);
        out[0] = v;
      },
      outputs: ["integral"],
      reference: (/** @type {any} */ p) => ({ tag: "exact", how: "closed form: a product of arctangent integrals", values: { integral: Math.pow(2 * p.a * Math.atan(p.a / 2), p.d) } }),
    },
    sum: {
      check: (/** @type {any} */ p) => [...(Number.isInteger(p.d) && p.d >= 1 && p.d <= 21 ? [] : ["The dimension d must be an integer from 1 to 21."]), ...(p.c >= 0 && p.c <= p.d ? [] : ["The threshold c must lie in [0, d]."])],
      dim: (/** @type {any} */ p) => p.d,
      eval(/** @type {Float64Array} */ u, /** @type {any} */ p, /** @type {Float64Array} */ out) {
        let s = 0;
        for (let j = 0; j < p.d; j++) s += u[j];
        out[0] = +(s > p.c);
      },
      outputs: ["prob"],
      reference: (/** @type {any} */ p) => ({ tag: "exact", how: "the Irwin–Hall law of a sum of d uniforms", values: { prob: 1 - irwinHall(p.c, p.d) } }),
    },
    asian: {
      check: (/** @type {any} */ p) => [...([2, 4, 8, 16].includes(p.m) ? [] : ["The number of dates m must be 2, 4, 8 or 16, so that the Brownian bridge halves each interval."]),
        ...(p.S0 > 0 && p.K > 0 && p.sigma > 0 && p.T > 0 ? [] : ["S0, K, sigma and T must be positive."])],
      dim: (/** @type {any} */ p) => p.m,
      eval(/** @type {Float64Array} */ u, /** @type {any} */ p, /** @type {Float64Array} */ out, /** @type {any} */ ws) {
        const m = p.m, dt = p.T / m, W = ws.W;
        if (ws.bridge) {
          W[m] = Math.sqrt(p.T) * qnorm(u[0]);
          W[0] = 0;
          let k = 1;
          for (let span = m; span > 1; span >>= 1) {
            for (let left = 0; left < m; left += span) {
              const mid = left + span / 2, right = left + span;
              W[mid] = (W[left] + W[right]) / 2 + Math.sqrt((span * dt) / 4) * qnorm(u[k++]);
            }
          }
        } else {
          W[0] = 0;
          for (let i = 1; i <= m; i++) W[i] = W[i - 1] + Math.sqrt(dt) * qnorm(u[i - 1]);
        }
        let logG = 0;
        for (let i = 1; i <= m; i++) logG += (p.r - (p.sigma * p.sigma) / 2) * i * dt + p.sigma * W[i];
        const G = p.S0 * Math.exp(logG / m);
        out[0] = Math.exp(-p.r * p.T) * Math.max(G - p.K, 0);
        out[1] = +(G > p.K);
      },
      outputs: ["price", "itm"],
      reference(/** @type {any} */ p) {
        const m = p.m, muG = Math.log(p.S0) + (p.r - (p.sigma * p.sigma) / 2) * (p.T * (m + 1)) / (2 * m);
        const sG = p.sigma * Math.sqrt((p.T * (m + 1) * (2 * m + 1)) / (6 * m * m)), d2 = (muG - Math.log(p.K)) / sG;
        return { tag: "exact", how: "closed form: the log of the geometric average is normal", values: { price: Math.exp(-p.r * p.T) * (Math.exp(muG + (sG * sG) / 2) * Phi(d2 + sG) - p.K * Phi(d2)), itm: Phi(d2) } };
      },
    },
  };

  /** The Irwin–Hall CDF P(U_1 + ... + U_d <= c). @param {number} c @param {number} d */
  function irwinHall(c, d) {
    if (c <= 0) return 0;
    if (c >= d) return 1;
    let s = 0;
    for (let k = 0; k <= Math.floor(c); k++) s += (k % 2 ? -1 : 1) * Math.exp(S.lchoose(d, k) + d * Math.log(c - k));
    return s / Math.exp(S.lgamma(d + 1));
  }

  /* ---------- Sobol points ---------- */

  // Joe and Kuo's direction numbers new-joe-kuo-6.21201 for dimensions 2 to 21: degree s, coefficient a and the
  // initial m_1 ... m_s. Dimension 1 is the van der Corput sequence in base 2.
  const JOE_KUO = [[1, 0, [1]], [2, 1, [1, 3]], [3, 1, [1, 3, 1]], [3, 2, [1, 1, 1]], [4, 1, [1, 1, 3, 3]], [4, 4, [1, 3, 5, 13]], [5, 2, [1, 1, 5, 5, 17]],
    [5, 4, [1, 1, 5, 5, 5]], [5, 7, [1, 1, 7, 11, 19]], [5, 11, [1, 1, 5, 1, 1]], [5, 13, [1, 1, 1, 3, 11]], [5, 14, [1, 3, 5, 5, 31]], [6, 1, [1, 3, 3, 9, 7, 49]],
    [6, 13, [1, 1, 1, 15, 21, 21]], [6, 16, [1, 3, 1, 13, 27, 49]], [6, 19, [1, 1, 1, 15, 7, 5]], [6, 22, [1, 3, 1, 15, 13, 25]], [6, 25, [1, 1, 5, 5, 19, 61]],
    [7, 1, [1, 3, 7, 11, 23, 15, 103]], [7, 4, [1, 3, 7, 13, 13, 15, 69]]];
  const MAX_DIM = JOE_KUO.length + 1;

  /** The 32 direction numbers of each of the first d dimensions, as unsigned 32-bit integers. @param {number} d @returns {Uint32Array[]} */
  function sobolDirections(d) {
    if (d > MAX_DIM) throw new RangeError(`The Sobol points of this page have at most ${MAX_DIM} dimensions.`);
    const out = [];
    for (let j = 0; j < d; j++) {
      const v = new Uint32Array(32);
      if (j === 0) for (let k = 0; k < 32; k++) v[k] = 2 ** (31 - k);
      else {
        const [s, a, m] = /** @type {[number, number, number[]]} */ (JOE_KUO[j - 1]);
        for (let k = 0; k < s; k++) v[k] = (m[k] * 2 ** (31 - k)) >>> 0;
        for (let k = s; k < 32; k++) {
          let x = (v[k - s] ^ (v[k - s] >>> s)) >>> 0;
          for (let i = 1; i < s; i++) if ((a >>> (s - 1 - i)) & 1) x = (x ^ v[k - i]) >>> 0;
          v[k] = x;
        }
      }
      out.push(v);
    }
    return out;
  }

  /** The parity of the set bits of a 32-bit integer. @param {number} x */
  function parity(x) {
    x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x ^= x >>> 2; x ^= x >>> 1;
    return x & 1;
  }

  /**
   * Matoušek's random linear scramble: a random lower-triangular binary matrix with a unit diagonal for each
   * dimension, applied to its direction numbers. Digit 1 of a point is its most significant bit.
   * @param {Uint32Array[]} dirs @param {any} rng
   */
  function scramble(dirs, rng) {
    return dirs.map((v) => {
      const rows = new Uint32Array(32);
      for (let r = 1; r <= 32; r++) {
        const high = r === 1 ? 0 : (rng.u32() & ~(2 ** (33 - r) - 1)) >>> 0;
        rows[r - 1] = (high | 2 ** (32 - r)) >>> 0;
      }
      const out = new Uint32Array(32);
      for (let k = 0; k < 32; k++) {
        let x = 0;
        for (let r = 1; r <= 32; r++) if (parity((rows[r - 1] & v[k]) >>> 0)) x = (x | 2 ** (32 - r)) >>> 0;
        out[k] = x;
      }
      return out;
    });
  }

  /**
   * A point generator over the first 2^m points in Gray-code order (Antonov and Saleev), so each prefix of length
   * 2^k is a digital net. kind: "lms_shift" scrambles and shifts, "shift" only shifts, "none" gives the plain points.
   * @param {number} d @param {string} kind @param {any} rng
   */
  function sobol(d, kind, rng) {
    let dirs = sobolDirections(d);
    if (kind === "lms_shift") dirs = scramble(dirs, rng);
    const shift = new Uint32Array(d);
    if (kind !== "none") for (let j = 0; j < d; j++) shift[j] = rng.u32();
    const X = new Uint32Array(d);
    let i = 0;
    return {
      /** Write point i into u and advance. @param {Float64Array} u */
      next(u) {
        if (i > 0) {
          const c = 31 - Math.clz32(i & -i);
          for (let j = 0; j < d; j++) X[j] = (X[j] ^ dirs[j][c]) >>> 0;
        }
        for (let j = 0; j < d; j++) u[j] = (((X[j] ^ shift[j]) >>> 0) + 0.5) / TWO32;
        i++;
      },
    };
  }

  /* ---------- resampling ---------- */

  /**
   * Resampling: N ancestor indices from normalised weights W. Each scheme is unbiased: the expected number of copies of
   * particle i is N W_i. Multinomial uses N sorted uniforms (from N + 1 exponential spacings), stratified one uniform
   * in each of N strata, systematic one uniform for all strata, residual the integer parts first.
   * @param {ArrayLike<number>} W @param {string} scheme @param {any} rng @param {Int32Array} [out]
   */
  function resample(W, scheme, rng, out = new Int32Array(W.length)) {
    const N = W.length;
    if (scheme === "residual") {
      let k = 0, rest = 0;
      const res = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const c = Math.floor(N * W[i]);
        for (let j = 0; j < c; j++) out[k++] = i;
        res[i] = N * W[i] - c;
        rest += res[i];
      }
      const R2 = N - k;
      if (R2 > 0) {
        // The rest: a multinomial draw of R2 items from the residual weights.
        for (let i = 0; i < N; i++) res[i] /= rest;
        const draw = multinomialCount(res, R2, rng);
        for (let i = 0; i < N && k < N; i++) for (let j = 0; j < draw[i]; j++) out[k++] = i;
      }
      return out;
    }
    const u = new Float64Array(N);
    if (scheme === "multinomial") {
      let s = 0;
      for (let i = 0; i < N; i++) { s += -Math.log(rng.uniform()); u[i] = s; }
      s += -Math.log(rng.uniform());
      for (let i = 0; i < N; i++) u[i] /= s;
    } else if (scheme === "stratified") for (let i = 0; i < N; i++) u[i] = (i + rng.uniform()) / N;
    else { const v = rng.uniform(); for (let i = 0; i < N; i++) u[i] = (i + v) / N; }
    let c = W[0], j = 0;
    for (let i = 0; i < N; i++) {
      while (u[i] > c && j < N - 1) c += W[++j];
      out[i] = j;
    }
    return out;
  }

  /** Counts of a multinomial draw of n items with probabilities w, by sorted uniforms. @param {ArrayLike<number>} w @param {number} n @param {any} rng */
  function multinomialCount(w, n, rng) {
    const counts = new Int32Array(w.length);
    const u = new Float64Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) { s += -Math.log(rng.uniform()); u[i] = s; }
    s += -Math.log(rng.uniform());
    let c = w[0], j = 0;
    for (let i = 0; i < n; i++) {
      const v = u[i] / s;
      while (v > c && j < w.length - 1) c += w[++j];
      counts[j]++;
    }
    return counts;
  }

  /* ---------- checking and compiling ---------- */

  /** The family of a model id: "target", "filter" or "integral", or "". @param {string} model */
  function familyOf(model) {
    return own(TARGETS, model) ? "target" : own(FILTERS, model) ? "filter" : own(INTEGRANDS, model) ? "integral" : "";
  }


  /**
   * Whether a method applies to a laboratory record, with the reason when it does not.
   * @param {any} rec @param {string} method
   */
  function applicable(rec, method) {
    const fam = familyOf(rec.model);
    if (!FAMILY_METHODS[fam]?.includes(method)) return { ok: false, reason: `${method} does not apply to ${fam === "target" ? "a target law" : fam === "filter" ? "a state-space model" : "an integral"}.` };
    const t = TARGETS[rec.model];
    if (method === "gibbs" && !t.gibbs) return { ok: false, reason: t.gibbsNote ?? "This target has no Gibbs sweep." };
    if (method === "hmc" && !t.grad) return { ok: false, reason: "This target has no gradient." };
    return { ok: true, reason: "" };
  }

  /**
   * Check a laboratory record and its settings. Returns { ok: false, errors } or the compiled job.
   * @param {any} rec @param {any} settings
   */
  function prepare(rec, settings) {
    /** @type {string[]} */
    const errors = [];
    if (!rec || typeof rec !== "object") return { ok: false, errors: ["The laboratory record is not an object."] };
    if (rec.format !== FORMAT) errors.push(`The record format is "${String(rec.format).slice(0, 40)}", not ${FORMAT}.`);
    if (rec.version !== VERSION) errors.push(`The record uses version ${String(rec.version).slice(0, 10)}. This page reads version ${VERSION}.`);
    const fam = familyOf(String(rec.model));
    if (!fam) errors.push(`"${String(rec.model).slice(0, 30)}" is not a model of the laboratory.`);
    if (errors.length) return { ok: false, errors };
    const code = fam === "target" ? TARGETS[rec.model] : fam === "filter" ? FILTERS[rec.model] : INTEGRANDS[rec.model];
    const p = rec.params ?? {};
    for (const [k, v] of Object.entries(p)) if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`The parameter ${k} is not a finite number.`);
    if (!errors.length) errors.push(...code.check(p));
    const s = { seed: settings.seed >>> 0, method: settings.method, compare: settings.compare ?? "none", size: settings.size, runs: settings.runs, step: settings.step ?? 1, eps: settings.eps ?? 0.2, leap: settings.leap ?? 10,
      start: settings.start ?? "dispersed", resample: settings.resample ?? "systematic", ess: settings.ess ?? 0.5, schedule: settings.schedule ?? "adaptive", temps: settings.temps ?? 10,
      moves: settings.moves ?? 5, scramble: settings.scramble ?? "lms_shift", path: settings.path ?? "standard" };
    for (const m of [s.method, ...(s.compare !== "none" ? [s.compare] : [])]) {
      const a = applicable(rec, m);
      if (!a.ok) errors.push(a.reason);
    }
    if (s.compare === s.method) errors.push("The comparison method is the method itself.");
    const [lo, hi] = LIMITS.size[fam];
    if (!Number.isInteger(s.size) || s.size < lo || s.size > hi) errors.push(`The size must be an integer from ${lo} to ${hi} for this model: 2^${lo} to 2^${hi} ${fam === "target" ? "draws after the warm-up" : fam === "filter" ? "particles" : "points"}.`);
    if (!Number.isInteger(s.runs) || s.runs < LIMITS.runs[0] || s.runs > LIMITS.runs[1]) errors.push(`The number of independent runs must be an integer from ${LIMITS.runs[0]} to ${LIMITS.runs[1]}.`);
    if (!(s.step > 0 && s.step <= 10)) errors.push("The step size of the random walk must lie in (0, 10].");
    if (!(s.eps > 0 && s.eps <= 10)) errors.push("The leapfrog step must lie in (0, 10].");
    if (!Number.isInteger(s.leap) || s.leap < 1 || s.leap > LIMITS.leap) errors.push(`The number of leapfrog steps must be an integer from 1 to ${LIMITS.leap}.`);
    if (!(s.ess > 0 && s.ess <= 1)) errors.push("The ESS threshold must lie in (0, 1].");
    if (!Number.isInteger(s.temps) || s.temps < 1 || s.temps > LIMITS.temps) errors.push(`The number of fixed temperatures must be an integer from 1 to ${LIMITS.temps}.`);
    if (!Number.isInteger(s.moves) || s.moves < 0 || s.moves > LIMITS.moves) errors.push(`The number of moves must be an integer from 0 to ${LIMITS.moves}.`);
    if (!["dispersed", "one_point"].includes(s.start)) errors.push(`The start "${s.start}" is not dispersed or one_point.`);
    if (!["multinomial", "stratified", "systematic", "residual", "none"].includes(s.resample)) errors.push(`The resampling scheme "${s.resample}" is not known.`);
    if (!["adaptive", "fixed"].includes(s.schedule)) errors.push(`The schedule "${s.schedule}" is not adaptive or fixed.`);
    if (!["lms_shift", "shift", "none"].includes(s.scramble)) errors.push(`The randomisation "${s.scramble}" is not known.`);
    if (!["standard", "bridge"].includes(s.path)) errors.push(`The path construction "${s.path}" is not standard or bridge.`);
    const data = rec.data ?? {};
    if (fam === "filter" && !(Array.isArray(data.y) && data.y.length >= 1 && data.y.length <= 500 && data.y.every(Number.isFinite))) errors.push("A state-space model needs 1 to 500 finite observations y.");
    if (rec.model === "balance" && !(Array.isArray(data.y) && data.y.length >= 2 && data.y.every(Number.isFinite))) errors.push("The balance model needs at least 2 finite weighings y.");
    if (rec.model === "oring" && !(Array.isArray(data.t) && Array.isArray(data.k) && data.t.length === data.k.length && data.k.every((/** @type {number} */ k) => Number.isInteger(k) && k >= 0 && k <= data.m))) errors.push("The O-ring model needs temperatures t and counts k in [0, m] of the same length.");
    const quantities = rec.quantities ?? [];
    for (const q of quantities) {
      const ok = fam === "target" ? own(code.f, q) || own(code.evidence, q) : fam === "filter" ? own(code.f, q) || q === "loglik" : code.outputs.includes(q);
      if (!ok) errors.push(`The model ${rec.model} has no quantity "${String(q).slice(0, 30)}".`);
    }
    if (!quantities.length) errors.push("The record names no quantity to estimate.");
    if (errors.length) return { ok: false, errors };
    return { ok: true, record: rec, family: fam, code, params: p, data, quantities, settings: s, errors: [] };
  }

  /* ---------- Markov chains ---------- */

  /**
   * One Markov chain: 2^size warm-up iterations, which the run discards, then 2^size draws. Returns the summary of
   * each series (each coordinate, then each quantity): its mean, variance, split halves and autocorrelation, with the
   * acceptance, the divergent transitions and bounded plot data.
   * @param {any} c @param {number} b @param {string} method
   */
  function runChain(c, b, method) {
    const t = c.code, p = c.params, data = c.data, s = c.settings, d = t.coords.length;
    const n = 2 ** s.size, total = 2 * n;
    const name = `${STREAM}/${method}`;
    const rInit = R.stream(s.seed, name, b, V_INIT), rMove = R.stream(s.seed, name, b, V_MOVE), rAcc = R.stream(s.seed, name, b, V_ACCEPT);
    const scale = t.scale(p, data);
    const q = t.q(p, data);
    // Start: one point for every chain, or a draw from the reference law q.
    let x = s.start === "one_point" ? t.point(p, data).slice() : q.mean.map((/** @type {number} */ m, /** @type {number} */ j) => m + q.sd[j] * rInit.normal());
    let lp = t.logp(x, p, data);
    const start = x.slice();
    const fs = c.quantities.filter((/** @type {string} */ k) => own(t.f, k)).map((/** @type {string} */ k) => t.f[k]);
    const nSeries = d + fs.length;
    const series = Array.from({ length: nSeries }, () => new Float64Array(n));
    const thin = Math.max(1, Math.floor(total / LIMITS.trace)), trace = [];
    const cloudEvery = Math.max(1, Math.floor(n / LIMITS.cloud)), cloud = [];
    let proposals = 0, accepted = 0, divergent = 0, maxEnergy = 0, grads = 0;
    const g = new Array(d).fill(0), g2 = new Array(d).fill(0), mom = new Array(d).fill(0);
    /** @type {number[][]} */
    let path = [];
    for (let it = 0; it < total; it++) {
      if (method === "metropolis") {
        const y = x.map((/** @type {number} */ v, /** @type {number} */ j) => v + s.step * scale[j] * rMove.normal());
        const ly = t.logp(y, p, data);
        proposals++;
        if (Math.log(rAcc.uniform()) < ly - lp) { x = y; lp = ly; accepted++; }
      } else if (method === "gibbs") {
        t.gibbs(x, rMove, p, data);
        lp = t.logp(x, p, data);
        proposals++;
        accepted++;
      } else {
        // Hamiltonian Monte Carlo: mass m_j = 1 / scale_j^2, a step jittered by ±10 %, L leapfrog steps.
        const eps = s.eps * (0.9 + 0.2 * rAcc.uniform());
        for (let j = 0; j < d; j++) mom[j] = rMove.normal() / scale[j];
        let kin0 = 0;
        for (let j = 0; j < d; j++) kin0 += (mom[j] * mom[j] * scale[j] * scale[j]) / 2;
        const y = x.slice(), keep = it === total - 1 && b === 0;
        if (keep) path = [y.slice()];
        t.grad(y, p, g, data);
        grads++;
        let ok = true;
        for (let l = 0; l < s.leap && ok; l++) {
          for (let j = 0; j < d; j++) mom[j] += (eps / 2) * g[j];
          for (let j = 0; j < d; j++) y[j] += eps * scale[j] * scale[j] * mom[j];
          t.grad(y, p, g2, data);
          grads++;
          for (let j = 0; j < d; j++) { mom[j] += (eps / 2) * g2[j]; g[j] = g2[j]; }
          if (keep) path.push(y.slice());
          if (!y.every(Number.isFinite)) ok = false;
        }
        const ly = ok ? t.logp(y, p, data) : -Infinity;
        let kin = 0;
        for (let j = 0; j < d; j++) kin += (mom[j] * mom[j] * scale[j] * scale[j]) / 2;
        const dH = ly - kin - (lp - kin0);
        proposals++;
        if (!(dH > -1000)) { if (it >= n) divergent++; }
        else {
          if (it >= n) maxEnergy = Math.max(maxEnergy, Math.abs(dH));
          if (Math.log(rAcc.uniform()) < dH) { x = y; lp = ly; accepted++; }
        }
      }
      if (it % thin === 0) trace.push([it, ...x]);
      if (it >= n) {
        const i = it - n;
        for (let j = 0; j < d; j++) series[j][i] = x[j];
        for (let k = 0; k < fs.length; k++) series[d + k][i] = fs[k](x, p, data);
        if (i % cloudEvery === 0 && cloud.length < LIMITS.cloud) cloud.push([x[0], x[1]]);
      }
    }
    const out = series.map((xs) => {
      const half = n / 2;
      return { mean: mean(xs, 0, n), var: variance(xs, 0, n), halves: [[mean(xs, 0, half), variance(xs, 0, half)], [mean(xs, half, n), variance(xs, half, n)]], acf: autocorrelation(xs, LIMITS.lags) };
    });
    return { kind: "chain", n, start, series: out, proposals, accepted, divergent, maxEnergy, grads, trace, cloud, path, accept: accepted / proposals };
  }

  /** @param {ArrayLike<number>} xs @param {number} a @param {number} b */
  function mean(xs, a, b) { let s = 0; for (let i = a; i < b; i++) s += xs[i]; return s / (b - a); }
  /** @param {ArrayLike<number>} xs @param {number} a @param {number} b */
  function variance(xs, a, b) {
    const m = mean(xs, a, b);
    let s = 0;
    for (let i = a; i < b; i++) s += sq(xs[i] - m);
    return b - a > 1 ? s / (b - a - 1) : 0;
  }

  /* ---------- sequential Monte Carlo ---------- */

  /**
   * The genealogy of a particle system for the figure: the ancestral lines of up to 128 evenly spaced particles of the
   * last step, back to step 0, with a crowd of 48 other particles at each step.
   * @param {Float32Array[]} values the particle values at each step @param {Int32Array[]} parents parents[k][i] is the index at step k - 1 of particle i at step k
   */
  function lineages(values, parents) {
    const K = values.length - 1, N = values[K].length, D = Math.min(N, LIMITS.lineages);
    /** @type {number[][]} */
    const ids = new Array(K + 1);
    let idx = [...new Set(Array.from({ length: D }, (_, i) => Math.floor((i * N) / D)))];
    for (let k = K; k >= 0; k--) {
      ids[k] = idx;
      if (k > 0) idx = [...new Set(idx.map((i) => parents[k][i]))];
    }
    // Each node is [value, position of its parent in the node list of the step before].
    const nodes = ids.map((list, k) => {
      const pos = new Map(k > 0 ? ids[k - 1].map((i, j) => [i, j]) : []);
      return list.map((i) => [values[k][i], k > 0 ? /** @type {number} */ (pos.get(parents[k][i])) : -1]);
    });
    const crowd = values.map((v) => { const c = Math.min(v.length, LIMITS.crowd); return Array.from({ length: c }, (_, i) => v[Math.floor((i * v.length) / c)]); });
    return { steps: K + 1, nodes, crowd, surviving: ids[0].length };
  }

  /** The number of distinct ancestors at each step of the particles of the last step. @param {Int32Array[]} parents @param {number} N */
  function distinctAncestors(parents, N) {
    const K = parents.length - 1, out = new Array(K + 1);
    let set = new Int32Array(N).map((_, i) => i), mark = new Uint8Array(N);
    out[K] = N;
    for (let k = K; k >= 1; k--) {
      mark.fill(0);
      const up = [];
      for (const i of set) { const a = parents[k][i]; if (!mark[a]) { mark[a] = 1; up.push(a); } }
      set = Int32Array.from(up);
      out[k - 1] = set.length;
    }
    return out;
  }

  /**
   * One sequential Monte Carlo sampler: N particles from the reference law q, then geometric tempering
   * pi_beta ∝ q^(1 - beta) pi^beta to beta = 1. The adaptive schedule takes the step that multiplies the weight ESS
   * by the threshold; the fixed schedule takes equal steps. After each step: resampling when the ESS falls below
   * the threshold times N, then random-walk Metropolis moves with a scale from the particle cloud. The product of
   * the mean incremental weights estimates the normalising constant Z.
   * @param {any} c @param {number} b @param {any} ref
   */
  function runSmc(c, b, ref) {
    const t = c.code, p = c.params, data = c.data, s = c.settings, d = t.coords.length, N = 2 ** s.size;
    const name = `${STREAM}/smc`;
    const rInit = R.stream(s.seed, name, b, V_INIT), rMove = R.stream(s.seed, name, b, V_MOVE), rAcc = R.stream(s.seed, name, b, V_ACCEPT), rRes = R.stream(s.seed, name, b, V_RESAMPLE);
    const q = t.q(p, data);
    const logq = (/** @type {number[]} */ x) => { let v = 0; for (let j = 0; j < d; j++) v += -0.5 * LOG_2PI - Math.log(q.sd[j]) - sq(x[j] - q.mean[j]) / (2 * q.sd[j] * q.sd[j]); return v; };
    let xs = Array.from({ length: N }, () => q.mean.map((/** @type {number} */ m, /** @type {number} */ j) => m + q.sd[j] * rInit.normal()));
    let ell = new Float64Array(N);
    for (let i = 0; i < N; i++) ell[i] = t.logp(xs[i], p, data) - logq(xs[i]);
    let W = new Float64Array(N).fill(1 / N);
    const lw = new Float64Array(N);
    let beta = 0, logZ = 0, k = 0, held = true;
    const keep = b === 0;
    /** @type {{ beta: number, ess: number, resampled: boolean, accept: number | null }[]} */
    const steps = [{ beta: 0, ess: N, resampled: false, accept: null }];
    /** @type {Float32Array[]} */
    const values = keep ? [Float32Array.from(xs, (x) => x[0])] : [];
    /** @type {Int32Array[]} */
    const parents = [new Int32Array(0)];
    const essOf = (/** @type {number} */ delta) => { for (let i = 0; i < N; i++) lw[i] = Math.log(W[i]) + delta * ell[i]; const tmp = new Float64Array(N); normalise(lw, tmp); return weightEss(tmp); };
    while (beta < 1 && k < LIMITS.steps) {
      let next;
      if (s.schedule === "fixed") next = Math.min(1, (Math.round(beta * s.temps) + 1) / s.temps);
      else {
        const target = s.ess * weightEss(W), room = 1 - beta;
        if (essOf(room) >= target) next = 1;
        else if (essOf(1e-12) < target) { next = 1; held = false; }
        else {
          let lo = 0, hi = room;
          for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (essOf(mid) >= target) lo = mid; else hi = mid; }
          next = beta + lo;
        }
      }
      if (k === LIMITS.steps - 1) { next = 1; held = false; }
      const delta = next - beta;
      for (let i = 0; i < N; i++) lw[i] = Math.log(W[i]) + delta * ell[i];
      logZ += normalise(lw, W);
      beta = next;
      k++;
      const ess = weightEss(W);
      const step = { beta, ess, resampled: false, accept: /** @type {number | null} */ (null) };
      steps.push(step);
      /** @type {Int32Array} */
      let par = Int32Array.from({ length: N }, (_, i) => i);
      if (beta < 1) {
        // The adaptive schedule resamples after each step; the fixed one when the ESS falls below the threshold.
        if (s.resample !== "none" && (s.schedule === "adaptive" || ess < s.ess * N)) {
          par = resample(W, s.resample, rRes);
          xs = Array.from(par, (a) => xs[a].slice());
          ell = Float64Array.from(par, (a) => ell[a]);
          W.fill(1 / N);
          step.resampled = true;
        }
        // Moves that leave pi_beta invariant: random-walk Metropolis with 2.38 / sqrt(d) times the weighted spread.
        const sd = new Array(d).fill(0);
        for (let j = 0; j < d; j++) {
          let m = 0, m2 = 0;
          for (let i = 0; i < N; i++) { m += W[i] * xs[i][j]; m2 += W[i] * xs[i][j] * xs[i][j]; }
          sd[j] = Math.max(1e-6, Math.sqrt(Math.max(0, m2 - m * m))) * (2.38 / Math.sqrt(d));
        }
        let acc = 0;
        for (let mv = 0; mv < s.moves; mv++) {
          for (let i = 0; i < N; i++) {
            const y = xs[i].map((/** @type {number} */ v, /** @type {number} */ j) => v + sd[j] * rMove.normal());
            const lpy = t.logp(y, p, data), lqy = logq(y);
            // log pi_beta(x) = (1 - beta) log q + beta log pi = log q + beta ell.
            if (Math.log(rAcc.uniform()) < lqy + beta * (lpy - lqy) - (logq(xs[i]) + beta * ell[i])) { xs[i] = y; ell[i] = lpy - lqy; acc++; }
          }
        }
        step.accept = s.moves ? acc / (N * s.moves) : null;
      }
      parents.push(par);
      if (keep) values.push(Float32Array.from(xs, (x) => x[0]));
    }
    const fs = c.quantities.filter((/** @type {string} */ id) => own(t.f, id));
    /** @type {Record<string, number>} */
    const est = {};
    for (const id of fs) { let v = 0; for (let i = 0; i < N; i++) v += W[i] * t.f[id](xs[i], p, data); est[id] = v; }
    for (const id of c.quantities.filter((/** @type {string} */ q2) => own(t.evidence, q2))) est[id] = t.evidence[id](logZ, ref);
    const every = Math.max(1, Math.floor(N / LIMITS.cloud));
    const cloud = keep ? Array.from({ length: Math.min(N, LIMITS.cloud) }, (_, j) => [xs[j * every][0], xs[j * every][1], W[j * every] * N]) : null;
    return { kind: "smc", N, estimates: est, logZ, steps, held, maxW: W.reduce((/** @type {number} */ a, /** @type {number} */ b) => Math.max(a, b), 0), finalEss: weightEss(W), distinct: distinctAncestors(parents, N),
      weights: keep ? Array.from(W).sort((a, b2) => b2 - a) : null, cloud, genealogy: keep ? lineages(values, parents) : null };
  }

  /* ---------- particle filter ---------- */

  /**
   * One bootstrap particle filter: particles move with the state dynamics and take the observation density as their
   * weight. The filter resamples when the weight ESS falls below the threshold times N (never with "none"), and
   * estimates each quantity from the weighted particles before it resamples. The product over t of the weighted mean
   * of the observation densities is the estimate Ẑ of the likelihood.
   * @param {any} c @param {number} b
   */
  function runFilter(c, b) {
    const m = c.code, p = c.params, y = c.data.y, s = c.settings, N = 2 ** s.size, T = y.length;
    const name = `${STREAM}/particle`;
    const rInit = R.stream(s.seed, name, b, V_INIT), rMove = R.stream(s.seed, name, b, V_MOVE), rRes = R.stream(s.seed, name, b, V_RESAMPLE);
    let x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = m.init(rInit, p);
    const W = new Float64Array(N).fill(1 / N), lw = new Float64Array(N);
    let logZ = 0;
    const ess = [], resampled = [], means = [], sds = [];
    const keep = b === 0;
    /** @type {Float32Array[]} */
    const values = keep ? [Float32Array.from(x)] : [];
    /** @type {Int32Array[]} */
    const parents = [new Int32Array(0)];
    /** @type {Int32Array} */
    let pending = Int32Array.from({ length: N }, (_, i) => i);
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < N; i++) x[i] = m.step(x[i], rMove, p);
      for (let i = 0; i < N; i++) lw[i] = Math.log(W[i]) + m.logg(y[t], x[i], p);
      logZ += normalise(lw, W);
      let mu = 0, m2 = 0;
      for (let i = 0; i < N; i++) { mu += W[i] * x[i]; m2 += W[i] * x[i] * x[i]; }
      means.push(mu);
      sds.push(Math.sqrt(Math.max(0, m2 - mu * mu)));
      const e = weightEss(W);
      ess.push(e);
      if (keep) values.push(Float32Array.from(x));
      parents.push(pending);
      pending = Int32Array.from({ length: N }, (_, i) => i);
      if (t < T - 1 && s.resample !== "none" && e < s.ess * N * (1 + 1e-9)) {
        const a = resample(W, s.resample, rRes);
        x = Float64Array.from(a, (k) => x[k]);
        W.fill(1 / N);
        pending = a;
        resampled.push(true);
      } else resampled.push(false);
    }
    /** @type {Record<string, number>} */
    const est = {};
    for (const id of c.quantities) {
      if (id === "loglik") { est[id] = logZ; continue; }
      let v = 0;
      for (let i = 0; i < N; i++) v += W[i] * m.f[id](x[i], p);
      est[id] = v;
    }
    const distinct = distinctAncestors(parents, N);
    return { kind: "filter", N, T, estimates: est, logZ, ess, resampled, means: keep ? means : null, sds: keep ? sds : null, distinct, maxW: W.reduce((/** @type {number} */ a, /** @type {number} */ b) => Math.max(a, b), 0), finalEss: ess[T - 1],
      weights: keep ? Array.from(W).sort((a, b2) => b2 - a) : null, genealogy: keep ? lineages(values, parents) : null };
  }

  /* ---------- randomised quasi-Monte Carlo ---------- */

  /**
   * One randomisation: the estimate of each output with the first 2^k points for k = 4 to size, with scrambled Sobol
   * points (or plain or only shifted points) and with independent uniforms, so one run gives both methods and their
   * rates. Run 0 also returns the first 256 points of dimensions 1 and 2.
   * @param {any} c @param {number} b
   */
  function runIntegral(c, b) {
    const f = c.code, p = c.params, s = c.settings, d = f.dim(p), n = 2 ** s.size, K0 = Math.min(4, s.size);
    const name = `${STREAM}/rqmc`;
    const rScr = R.stream(s.seed, name, b, V_SCRAMBLE), rPlain = R.stream(s.seed, name, b, V_PLAIN);
    const gen = sobol(d, s.scramble, rScr);
    const ids = f.outputs, nq = ids.length;
    const u = new Float64Array(d), out = new Float64Array(nq), ws = { W: new Float64Array(d + 1), bridge: s.path === "bridge" };
    const sumQ = new Float64Array(nq), sumP = new Float64Array(nq);
    const ks = [], qmc = [], plain = [];
    const keep = b === 0, pts = /** @type {{ qmc: number[][], plain: number[][] }} */ ({ qmc: [], plain: [] });
    let next = 2 ** K0;
    for (let i = 0; i < n; i++) {
      gen.next(u);
      if (keep && i < 256) pts.qmc.push([u[0], d > 1 ? u[1] : 0.5]);
      f.eval(u, p, out, ws);
      for (let k = 0; k < nq; k++) sumQ[k] += out[k];
      for (let j = 0; j < d; j++) u[j] = rPlain.uniform();
      if (keep && i < 256) pts.plain.push([u[0], d > 1 ? u[1] : 0.5]);
      f.eval(u, p, out, ws);
      for (let k = 0; k < nq; k++) sumP[k] += out[k];
      if (i + 1 === next) {
        ks.push(Math.log2(next));
        qmc.push(Array.from(sumQ, (v) => v / next));
        plain.push(Array.from(sumP, (v) => v / next));
        next *= 2;
      }
    }
    return { kind: "integral", n, d, ids, ks, qmc, plain, points: keep ? pts : null };
  }

  /* ---------- blocks, merge and summary ---------- */

  /**
   * Independent run b of each method (the chosen one, then the comparison). opts.reference passes the reference of
   * the record, which the evidence quantities of the sequential sampler need.
   * @param {any} c @param {number} b @param {{ reference?: any }} [opts]
   */
  function block(c, b, opts = {}) {
    const methods = [c.settings.method, ...(c.settings.compare !== "none" ? [c.settings.compare] : [])];
    const out = { block: b, methods: /** @type {any[]} */ ([]), error: "" };
    try {
      for (const m of methods) {
        const t0 = Date.now();
        const r = c.family === "target" ? (m === "smc" ? runSmc(c, b, opts.reference) : runChain(c, b, m))
          : c.family === "filter" ? runFilter(c, b) : out.methods[0] ?? runIntegral(c, b);
        out.methods.push({ ...r, method: m, ms: Date.now() - t0 });
      }
    } catch (e) {
      out.error = `Run ${b + 1}: ${e instanceof Error ? e.message : String(e)}`;
    }
    return out;
  }

  /** An empty accumulator. @param {any} c */
  function empty(c) { void c; return { blocks: 0, runs: /** @type {any[]} */ ([]), error: "" }; }

  /** Append run b in order: the pool delivers the runs in order, so the result does not depend on the workers. @param {any} accum @param {any} blk */
  function merge(accum, blk) {
    if (blk.block !== accum.blocks) throw new Error(`Run ${blk.block} arrived for position ${accum.blocks}.`);
    if (blk.error) return { ...accum, error: blk.error };
    return { blocks: accum.blocks + 1, runs: [...accum.runs, blk], error: "" };
  }

  /**
   * The estimate of the mean of R independent run values with a t interval at 95 %.
   * @param {number[]} vals
   */
  function between(vals) {
    const R2 = vals.length, m = vals.reduce((a, b) => a + b, 0) / R2;
    if (R2 < 2) return { est: m, lo: null, hi: null, se: null, sd: null, how: "one run: no interval" };
    const same = vals.every((v) => v === vals[0]);
    const sd = same ? 0 : Math.sqrt(vals.reduce((a, b) => a + sq(b - m), 0) / (R2 - 1)), se = sd / Math.sqrt(R2);
    if (se === 0) return { est: m, lo: null, hi: null, se: 0, sd: 0, how: `the ${R2} runs give the same value, so their spread says nothing about the error` };
    const tq = tQuantile(0.975, R2 - 1);
    return { est: m, lo: m - tq * se, hi: m + tq * se, se, sd, how: `t interval, 95 %, from the spread of ${R2} independent runs (${R2 - 1} degrees of freedom)` };
  }

  /**
   * Multi-chain diagnostics of one series (Stan's definitions, without rank normalisation): split R-hat from the
   * halves of each chain, and the effective sample size from the combined autocorrelation with Geyer's initial
   * monotone sequence.
   * @param {any[]} chains the summaries of one series in each chain @param {number} n draws in each chain
   */
  function chainDiagnostics(chains, n) {
    const M = chains.length;
    const halves = chains.flatMap((ch) => ch.halves);
    const h = n / 2, Wh = halves.reduce((a, x) => a + x[1], 0) / halves.length, mh = halves.reduce((a, x) => a + x[0], 0) / halves.length;
    const Bh = (h * halves.reduce((a, x) => a + sq(x[0] - mh), 0)) / (halves.length - 1);
    const rhat = Wh > 0 ? Math.sqrt((((h - 1) / h) * Wh + Bh / h) / Wh) : null;
    const W = chains.reduce((a, ch) => a + ch.var, 0) / M, m = chains.reduce((a, ch) => a + ch.mean, 0) / M;
    const B = M > 1 ? (n * chains.reduce((a, ch) => a + sq(ch.mean - m), 0)) / (M - 1) : 0;
    const vplus = ((n - 1) / n) * W + B / n;
    if (!(vplus > 0)) return { rhat, ess: null, tau: null, bound: false, mcse: null, sd: 0, acf: chains[0].acf.slice(0, 1) };
    const L = Math.min(...chains.map((ch) => ch.acf.length));
    const rho = new Array(L);
    for (let k = 0; k < L; k++) {
      let s = 0;
      for (const ch of chains) s += ch.var * ch.acf[k];
      rho[k] = 1 - (W - s / M) / vplus;
    }
    rho[0] = 1;
    const gy = geyer(rho);
    const ess = Math.min((M * n) / gy.tau, M * n * Math.log10(M * n));
    // bound: the lags ran out before the sum ended, so the ESS is an upper bound.
    return { rhat, ess, tau: gy.tau, bound: !gy.ended, mcse: Math.sqrt(vplus / ess), sd: Math.sqrt(vplus), acf: rho.slice(0, Math.min(L, 201)) };
  }

  /**
   * Estimates, intervals and the three kinds of diagnostic for the runs so far.
   * @param {any} c @param {any} accum @param {any} ref the reference of the record
   */
  function summary(c, accum, ref) {
    if (!accum.runs.length) return null;
    const methods = accum.runs[0].methods.map((/** @type {any} */ m0, /** @type {number} */ k) => {
      const runs = accum.runs.map((/** @type {any} */ r) => r.methods[k]);
      const method = m0.method, ms = runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.ms, 0);
      /** @type {any} */
      const out = { method, runs: runs.length, ms, chain: null, weights: null, integral: null, quantities: [] };
      if (c.family === "target" && method !== "smc") {
        const d = c.code.coords.length, fids = c.quantities.filter((/** @type {string} */ q) => own(c.code.f, q));
        const n = runs[0].n;
        const diag = runs[0].series.map((/** @type {any} */ _, /** @type {number} */ j) => chainDiagnostics(runs.map((/** @type {any} */ r) => r.series[j]), n));
        const names = [...c.code.coords, ...fids];
        out.chain = {
          n, accept: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.accepted, 0) / runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.proposals, 0),
          divergent: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.divergent, 0), maxEnergy: Math.max(...runs.map((/** @type {any} */ r) => r.maxEnergy)),
          grads: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.grads, 0),
          series: diag.map((/** @type {any} */ x, /** @type {number} */ j) => ({ name: names[j], coord: j < d, ...x })),
          maxRhat: Math.max(...diag.map((/** @type {any} */ x) => x.rhat ?? 1)), minEss: Math.min(...diag.map((/** @type {any} */ x) => x.ess ?? Infinity)),
        };
        out.quantities = c.quantities.map((/** @type {string} */ id) => {
          if (!own(c.code.f, id)) return { id, est: null, lo: null, hi: null, how: "Markov chain Monte Carlo gives no estimate of the evidence. Use sequential Monte Carlo.", reference: ref?.values?.[id] ?? null };
          const j = d + fids.indexOf(id), b = between(runs.map((/** @type {any} */ r) => r.series[j].mean));
          return { id, ...b, mcse: diag[j].mcse, reference: ref?.values?.[id] ?? null };
        });
      } else if (c.family === "target" || c.family === "filter") {
        const N = runs[0].N;
        out.weights = {
          N, meanFinalEss: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.finalEss, 0) / runs.length,
          maxW: Math.max(...runs.map((/** @type {any} */ r) => r.maxW)),
          resamplings: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + (c.family === "filter" ? r.resampled.filter(Boolean).length : r.steps.filter((/** @type {any} */ x) => x.resampled).length), 0) / runs.length,
          minEss: Math.min(...runs.map((/** @type {any} */ r) => Math.min(...(c.family === "filter" ? r.ess : r.steps.slice(1).map((/** @type {any} */ x) => x.ess))))),
          logZ: between(runs.map((/** @type {any} */ r) => r.logZ)),
          zRatio: ref?.logZ !== undefined ? between(runs.map((/** @type {any} */ r) => Math.exp(r.logZ - ref.logZ))) : null,
          surviving: runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.distinct[0], 0) / runs.length,
          steps: c.family === "target" ? runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.steps.length - 1, 0) / runs.length : null,
          held: c.family === "target" ? runs.every((/** @type {any} */ r) => r.held) : null,
        };
        out.quantities = c.quantities.map((/** @type {string} */ id) => ({ id, ...between(runs.map((/** @type {any} */ r) => r.estimates[id])), reference: ref?.values?.[id] ?? null }));
      } else {
        const ids = runs[0].ids, last = runs[0].ks.length - 1;
        const rate = runs[0].ks.map((/** @type {number} */ kk, /** @type {number} */ i) => ({
          n: 2 ** kk,
          rmse: ids.map((/** @type {string} */ id, /** @type {number} */ q) => {
            const refv = ref?.values?.[id];
            if (refv === undefined) return { qmc: null, plain: null };
            const e = (/** @type {string} */ key) => Math.sqrt(runs.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + sq(r[key][i][q] - refv), 0) / runs.length);
            return { qmc: e("qmc"), plain: e("plain") };
          }),
        }));
        out.integral = { d: runs[0].d, n: runs[0].n, rate, ratio: ids.map((/** @type {string} */ id, /** @type {number} */ q) => {
          const vq = between(runs.map((/** @type {any} */ r) => r.qmc[last][q])).sd, vp = between(runs.map((/** @type {any} */ r) => r.plain[last][q])).sd;
          return vq && vp ? sq(vp) / sq(vq) : null;
        }) };
        const key = method === "rqmc" ? "qmc" : "plain";
        out.quantities = c.quantities.map((/** @type {string} */ id) => ({ id, ...between(runs.map((/** @type {any} */ r) => r[key][last][ids.indexOf(id)])), reference: ref?.values?.[id] ?? null }));
      }
      for (const q of out.quantities) {
        q.error = q.est !== null && q.reference !== null ? q.est - q.reference : null;
        q.covered = q.lo !== null && q.reference !== null ? q.reference >= q.lo && q.reference <= q.hi : null;
      }
      return out;
    });
    return { runs: accum.runs.length, methods };
  }

  const NAMES = /** @type {Record<string, string>} */ ({ metropolis: "Metropolis–Hastings", gibbs: "Gibbs sampler", hmc: "Hamiltonian Monte Carlo", smc: "Sequential Monte Carlo", particle: "Particle filter", rqmc: "Randomised quasi-Monte Carlo", independent: "Independent sampling", none: "No comparison" });
  /** A number as text: at most 4 significant digits, never NaN or Infinity. @param {number | null | undefined} v */
  const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "not available" : Math.abs(v) !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e7) ? v.toExponential(2) : String(+v.toPrecision(4)));
  /** Words that read as speech. @param {string} t */
  const say = (t) => String(t).replace(/[$\\`*#|<>×%&≈^_⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, " ").replace(/\s+/g, " ").trim();

  /**
   * The plain-data report of the lab: the frames that the site's beamdswitch template writes as a deck and the kit as the
   * Markdown record, with the three kinds of diagnostic in separate lines.
   * @param {{ example: any, method: any, state: Record<string, any>, summary: any, reference: any, errors: string[], status: string }} o
   */
  function report(o) {
    const x = o.example, s = o.state, sm = o.summary;
    const meta = { title: "Monte Carlo Probability Workbench", subtitle: `${x.title}: ${NAMES[s.c_method]}, seed ${s.seed}`, voice: "bf_emma" };
    const setup = [{ title: `The problem: ${x.title}`, body: [x.problem, x.kind === "workflow" ? x.decision : `What to observe: ${x.observe}`, x.data.text].join("\n\n"), narration: say(x.problem) }];
    if (x.kind === "workflow") setup.push({ title: "Assumptions", body: [`- Reason: ${x.reason}`, `- Inputs: ${x.inputs}`, `- Dependence: ${x.dependence}`].join("\n"), narration: say(x.dependence) });
    const m = o.method;
    const method = [{ title: `Method: ${NAMES[s.c_method]}`, body: `${m ? `$$${m.estimator}$$\n\n${m.estimatorText}\n\n` : ""}- Size 2^${s.c_size}, ${s.c_runs} independent runs, seed ${s.seed}, generator Philox4x32-10\n- Comparison: ${NAMES[s.c_compare]}`, narration: `The lab uses ${say(NAMES[s.c_method])} with ${s.c_runs} independent runs and the seed ${s.seed}.` }];
    const results = [];
    if (o.errors.length) results.push({ title: "No run", body: o.errors.map((e) => `- ${e}`).join("\n"), narration: "The setting has errors, so the page did not run it." });
    else if (!sm) results.push({ title: "No run yet", body: "Run the lab to fill this frame.", narration: "The lab has no run yet." });
    else {
      const cell = (/** @type {string} */ t) => String(t).replace(/\|/g, "/");
      const rows = ["| Method | Quantity | Estimate | 95 % interval | Reference | Claim |", "| --- | --- | --- | --- | --- | --- |"];
      for (const mm of sm.methods) mm.quantities.forEach((/** @type {any} */ q, /** @type {number} */ i) => rows.push(`| ${NAMES[mm.method]} | ${cell(x.quantities[i].name)} | ${num(q.est)} | ${q.lo === null ? cell(q.how) : `${num(q.lo)} to ${num(q.hi)}`} | ${num(q.reference)} | finite-run observation |`));
      const q0 = sm.methods[0].quantities[0];
      results.push({ title: `Lab results after ${sm.runs} runs (${o.status})`, body: `${rows.join("\n")}\n\nReference: ${o.reference.how} (${o.reference.tag === "exact" ? "theorem" : "numerical approximation"}).`, narration: `After ${sm.runs} runs, the estimate of the first quantity is ${num(q0.est)}.${o.status === "done" ? "" : " The run is not complete, so these values are partial."}` });
    }
    const ms = sm?.methods ?? [];
    /** One line for each method, or one line that says there is no run. @param {string} kind @param {(mm: any) => string} text */
    const lines = (kind, text) => (ms.length ? ms.map((/** @type {any} */ mm) => `- ${kind}, ${NAMES[mm.method]}: ${text(mm)}.`) : [`- ${kind}: no run.`]);
    const checks = [{
      title: "Diagnostics, kept apart",
      body: [...lines("Markov-chain diagnostics", (mm) => (mm.chain ? `largest split R-hat ${mm.chain.maxRhat.toFixed(3)}, smallest ESS ${num(mm.chain.minEss)}, acceptance rate ${num(mm.chain.accept)}, divergent transitions ${mm.chain.divergent}` : "not applicable")),
        ...lines("Weight degeneracy", (mm) => (mm.weights ? `smallest weight ESS ${num(mm.weights.minEss)} of ${mm.weights.N}, ${num(mm.weights.surviving)} distinct ancestors at the start` : "not applicable")),
        ...lines("Estimation error", (mm) => mm.quantities.map((/** @type {any} */ q, /** @type {number} */ i) => `${x.quantities[i].name} error ${num(q.error)}${q.covered === null ? "" : q.covered ? ", inside the interval" : ", outside the interval"}`).join("; ")),
        "- The effective sample size is a diagnostic, not a proof of convergence."].join("\n"),
      narration: "The page keeps the Markov chain diagnostics, the weight degeneracy and the estimation error apart. The effective sample size is a diagnostic, not a proof of convergence.",
    }, {
      title: "Limitations and takeaway",
      body: [x.kind === "workflow" ? `- ${x.interpretation}` : `- ${x.observe}`, "- Each estimate is a finite-run observation. Its interval comes from the spread of independent runs and cannot show a bias that all runs share.", `- ${x.data.text}`].join("\n"),
      key: "Compare each estimate with its reference: agreement between runs does not prove correctness.",
      narration: "Each estimate is an observation of a finite run. Agreement between runs does not prove that the runs are correct.",
    }];
    return { meta, narration: `This deck reads the lab example ${say(x.title)}.`, setup, method, results, checks };
  }

  /**
   * "name=value; name=value" as numbers. A name must be a parameter of the example.
   * @param {string} text @param {string[]} names
   */
  function parseParams(text, names) {
    /** @type {Record<string, number>} */
    const values = {};
    const errors = [];
    for (const part of String(text ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
      const m = /^([A-Za-z]\w*)\s*=\s*(\S+)$/.exec(part);
      if (!m) { errors.push(`"${part.slice(0, 30)}" is not name = value.`); continue; }
      if (!names.includes(m[1])) { errors.push(`"${m[1]}" is not a parameter of this example (${names.join(", ")}).`); continue; }
      const v = Number(m[2]);
      if (!Number.isFinite(v)) { errors.push(`The value of ${m[1]} is not a number.`); continue; }
      values[m[1]] = v;
    }
    return { values, errors };
  }

  /**
   * The laboratory record of a catalogue example with the reader's parameter settings: the model, the parameters,
   * the data (inline, made by its stated generator, or from a real dataset) and the quantities.
   * @param {any} ex the example @param {string} paramsText @param {any[]} datasets
   */
  function recordOf(ex, paramsText, datasets) {
    const names = ex.params.map((/** @type {any} */ x) => x.name);
    const parsed = parseParams(paramsText, names);
    const params = Object.fromEntries(ex.params.map((/** @type {any} */ x) => [x.name, parsed.values[x.name] ?? x.value]));
    /** @type {any} */
    let data = {};
    if (ex.data?.dataset) {
      const ds = datasets.find((d) => d.id === ex.data.dataset);
      data = { t: ds.values, k: ds.counts, m: ds.atRisk };
    } else if (ex.data?.y) data = { y: ex.data.y };
    else if (ex.data?.generator) data = { y: synthetic(ex.data.generator) };
    return { record: { format: FORMAT, version: VERSION, example: ex.id, model: ex.model, params, data, quantities: ex.quantities.map((/** @type {any} */ q) => q.id) }, errors: parsed.errors };
  }

  /**
   * Synthetic data from a stated generating model, with the page's own generator, so a test can make them again:
   * "normal" gives n values of N(mean, sd^2); "level" and "sv" give the observations of those state-space models.
   * Each value is rounded to the stated number of decimals.
   * @param {{ kind: string, seed: number, n: number, decimals: number, params: any }} spec
   */
  function synthetic(spec) {
    const rng = R.stream(spec.seed, `${STREAM}/data/${spec.kind}`, 0, 0), p = spec.params, out = [];
    const round = (/** @type {number} */ v) => Number(v.toFixed(spec.decimals));
    if (spec.kind === "normal") for (let i = 0; i < spec.n; i++) out.push(round(p.mean + p.sd * rng.normal()));
    else {
      const m = FILTERS[spec.kind];
      let x = m.init(rng, p);
      for (let i = 0; i < spec.n; i++) {
        x = m.step(x, rng, p);
        out.push(round(spec.kind === "level" ? x + p.sy * rng.normal() : Math.exp(x / 2) * rng.normal()));
      }
    }
    return out;
  }

  /**
   * The reference of a record: exact or numerical values of each quantity, and the normalising constant where the
   * model gives it. Throws for a record that prepare() refuses.
   * @param {any} rec
   */
  function reference(rec) {
    const fam = familyOf(rec.model);
    const code = fam === "target" ? TARGETS[rec.model] : fam === "filter" ? FILTERS[rec.model] : INTEGRANDS[rec.model];
    return code.reference(rec.params, rec.data ?? {});
  }

  return {
    FORMAT, VERSION, STREAM, LIMITS, FAMILY_METHODS, TARGETS, FILTERS, INTEGRANDS, MAX_DIM,
    qnorm, logSumExp, weightEss, gammaDraw, tQuantile, autocorrelation, geyer, irwinHall, sobolDirections, sobol, scramble, resample,
    familyOf, applicable, prepare, synthetic, parseParams, recordOf, report, block, empty, merge, summary, reference, between, chainDiagnostics, kalman, gridFilter, lineages, distinctAncestors,
  };
});
