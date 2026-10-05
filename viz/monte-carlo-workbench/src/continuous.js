/* Monte Carlo Probability Workbench: the probability laws of the continuous group, and the samplers that both groups
 * share (the generic rejection sampler and the gamma sampler). Each law states its parameter convention and support,
 * and computes its density, CDF, survival function, quantile function and moments, with the conditions under which a
 * moment exists. Each law gives three samplers, one for each method of direct simulation: its reference sampler for
 * independent sampling, an inverse-transform sampler that uses exactly one uniform for a scalar law, and a rejection
 * sampler (or the reason that it has none). A sampler draws from a stream of MCRng. Tests load this file with
 * require().
 */
/** @param {any} root the global object @param {(S: any) => any} factory */
(function (root, factory) {
  const S = root.MCSpecial ?? require("./special.js");
  const api = factory(S);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCContinuous = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {typeof import("./special.js")} */ S) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {{ proposals: number, accepts: number, violations: number }} RejectStats */
  /** @typedef {{ label: string, exactness: string, draw(rng: Rng, stats?: RejectStats): number | number[], acceptance?: number, envelope?: number }} Sampler */
  /** @typedef {{ unavailable: string }} NoSampler */
  /** @typedef {Record<string, any>} Params */

  const BIG = 1e15;
  const NUMERIC = "exact up to the error of a numerical quantile: Newton steps on the CDF to about 15 significant digits";

  /** @param {unknown} x @param {number} lo @param {number} hi */
  const inside = (x, lo, hi) => typeof x === "number" && x >= lo && x <= hi;
  /** @param {unknown} x */
  const show = (x) => (typeof x === "number" ? (x === Infinity ? "∞" : String(x)) : "a vector");
  /** @param {unknown} x */
  const positive = (x) => typeof x === "number" && x > 0 && x <= BIG;
  /** @param {unknown} x */
  const real = (x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= BIG;
  /** @param {number} x */
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  /**
   * The generic rejection sampler from a proposal law q: accept x with probability p(x) / (M q(x)). p and q are
   * densities or PMFs. `factor` below 1 shrinks the envelope constant for the assumption-failure experiment, and
   * `violations` counts proposals where the ratio exceeds 1, which shows that the envelope does not dominate the
   * target.
   * @param {string} label @param {(x: number) => number} p @param {(x: number) => number} q @param {(rng: Rng) => number} propose
   * @param {number} M @param {number} factor @returns {Sampler | NoSampler}
   */
  function rejection(label, p, q, propose, M, factor) {
    if (!(M >= 1) || !Number.isFinite(M)) return { unavailable: `The envelope constant M = ${show(M)} is not finite.` };
    if (1 / M < 1e-3) return { unavailable: `The acceptance probability 1/M = ${(1 / M).toPrecision(3)} is below 0.001, so the method costs too much here.` };
    const Mf = M * factor;
    return {
      label: `${label}, envelope constant M = ${M.toPrecision(6)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
      exactness: factor === 1 ? "exact" : "not exact: the envelope is too small",
      acceptance: 1 / M,
      envelope: Mf,
      draw(rng, stats) {
        for (;;) {
          const x = propose(rng);
          const ratio = p(x) / (Mf * q(x));
          if (stats) {
            stats.proposals++;
            if (ratio > 1 + 1e-12) stats.violations++;
          }
          if (rng.uniform() <= ratio) {
            if (stats) stats.accepts++;
            return x;
          }
        }
      },
    };
  }

  /** A sampler y = f(x) of another sampler, with the same label suffix, exactness and acceptance. @param {Sampler | NoSampler} s @param {string} label @param {(x: any) => any} f @returns {Sampler | NoSampler} */
  function mapped(s, label, f) {
    if ("unavailable" in s) return s;
    return { ...s, label: `${label}: ${s.label}`, draw: (rng, stats) => f(s.draw(rng, stats)) };
  }

  /** Gamma(shape a, scale 1) by Marsaglia and Tsang (2000); a < 1 by Gamma(a + 1) U^(1/a). @param {Rng} rng @param {number} a @returns {number} */
  function gamma(rng, a) {
    if (a < 1) return gamma(rng, a + 1) * Math.pow(rng.uniform(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = rng.normal();
      let v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      const u = rng.uniform();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** The inverse-transform sampler of a scalar law: its quantile function at one uniform, optionally capped at a quantile. @param {any} law @param {Params} p @param {number | undefined} cut @param {string} label @param {string} exactness @returns {Sampler} */
  function inverseOf(law, p, cut, label, exactness) {
    if (cut === undefined) return { label, exactness, draw: (rng) => law.quantile(rng.uniform(), p) };
    const top = law.quantile(cut, p);
    return { label: `${label}, capped at the ${cut} quantile ${+top.toPrecision(6)}`, exactness: "not exact: the tail is cut", draw: (rng) => Math.min(top, law.quantile(rng.uniform(), p)) };
  }

  /** The quantile (or, with `upper`, the inverse survival function) of a law with no closed form, by Newton steps from a guess. @param {any} law @param {number} u @param {Params} p @param {number} guess @param {boolean} [upper] */
  function solved(law, u, p, guess, upper = false) {
    const s = law.support(p);
    if (u <= 0) return upper ? s.hi : s.lo;
    if (u >= 1) return upper ? s.lo : s.hi;
    const f = { cdf: (/** @type {number} */ x) => law.cdf(x, p), sf: (/** @type {number} */ x) => law.sf(x, p), pdf: (/** @type {number} */ x) => law.pdf(x, p), lo: s.lo, hi: s.hi, guess };
    return upper ? S.solveSurvival(u, f) : S.solveQuantile(u, f);
  }

  /** A standard Laplace value from one uniform: the quantile function of the law with density e^(−|x|)/2. @param {number} u */
  const laplaceQ = (u) => (u < 0.5 ? Math.log(2 * u) : -Math.log(2 * (1 - u)));
  /** The standard Laplace density. @param {number} x */
  const laplacePdf = (x) => Math.exp(-Math.abs(x)) / 2;
  /** The standard logistic density. @param {number} x */
  const logisticPdf = (x) => { const e = Math.exp(-Math.abs(x)); return e / ((1 + e) * (1 + e)); };
  /** The standard logistic quantile. @param {number} u */
  const logisticQ = (u) => Math.log(u) - Math.log1p(-u);

  /** Rejection for N(0, 1) from the standard Laplace proposal: M = sup φ/g = √(2e/π) at |x| = 1. @param {number} factor */
  const normalByLaplace = (factor) => rejection("Proposal: the standard Laplace law", S.normalPdf, laplacePdf, (rng) => laplaceQ(rng.uniform()), Math.sqrt((2 * Math.E) / Math.PI), factor);

  /** Gamma(k, 1) by rejection from the exponential law with the same mean k, for k ≥ 1: M = k^k e^(1−k) / Γ(k) at x = k. @param {number} k @param {number} factor @returns {Sampler | NoSampler} */
  function gammaByExponential(k, factor) {
    if (k < 1) return { unavailable: `For a shape k = ${k} below 1 the density is unbounded at 0, so no exponential proposal covers it.` };
    const lnc = -S.lgamma(k), M = Math.exp(k * Math.log(k) + 1 - k - S.lgamma(k));
    return rejection(`Proposal: the exponential law with mean k = ${+k.toPrecision(6)}`, (x) => (x > 0 ? Math.exp((k - 1) * Math.log(x) - x + lnc) : k === 1 ? 1 : 0),
      (x) => Math.exp(-x / k) / k, (rng) => -k * Math.log(rng.uniform()), M, factor);
  }

  /** Beta(a, b) by rejection from the uniform proposal on (0, 1), for a, b ≥ 1: M is the density at the mode. @param {number} a @param {number} b @param {number} factor @returns {Sampler | NoSampler} */
  function betaByUniform(a, b, factor) {
    if (a < 1 || b < 1) return { unavailable: `With a = ${a} and b = ${b} the density is unbounded at ${a < 1 ? "0" : "1"}, so no uniform proposal covers it.` };
    const mode = a + b > 2 ? (a - 1) / (a + b - 2) : 0.5;
    return rejection("Proposal: the uniform law on (0, 1)", (x) => beta.pdf(x, { a, b }), () => 1, (rng) => rng.uniform(), Math.max(1, beta.pdf(mode, { a, b })), factor);
  }

  /** The Cholesky factor L (row-major, lower triangular) of a k × k matrix, or null when it is not positive definite. @param {number[]} c @param {number} k */
  function cholesky(c, k) {
    const L = new Float64Array(k * k);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j <= i; j++) {
        let s = c[i * k + j];
        for (let m = 0; m < j; m++) s -= L[i * k + m] * L[j * k + m];
        if (i === j) {
          if (!(s > 1e-14 * Math.abs(c[i * k + i]))) return null;
          L[i * k + i] = Math.sqrt(s);
        } else L[i * k + j] = s / L[j * k + j];
      }
    }
    return L;
  }

  /** mu + L z for a vector of k standard normal values z. @param {number[]} mu @param {Float64Array} L @param {number[]} z */
  function affineNormal(mu, L, z) {
    const k = mu.length, out = new Array(k);
    for (let i = 0; i < k; i++) {
      let s = mu[i];
      for (let j = 0; j <= i; j++) s += L[i * k + j] * z[j];
      out[i] = s;
    }
    return out;
  }

  /* ---------- the laws ---------- */

  /**
   * @typedef {object} Law
   * @property {string} id @property {string} name @property {true} continuous
   * @property {{ name: string, kind: "real" | "integer" | "vector", text: string }[]} params
   * @property {string[]} [location] parameters that only shift the law
   * @property {(p: Params) => string[]} check
   * @property {(p: Params) => { lo: number, hi: number }} support
   * @property {(p: Params) => string} supportText
   * @property {(p: Params) => number} [dim]
   * @property {(x: number, p: Params) => number} pdf
   * @property {(x: number, p: Params) => number} pmf
   * @property {(x: number, p: Params) => number} cdf
   * @property {(x: number, p: Params) => number} sf
   * @property {(u: number, p: Params) => number} quantile
   * @property {(v: number, p: Params) => number} isf the inverse survival function: the x with P(X > x) = v, precise for a small v
   * @property {(p: Params) => { mean: number | null, variance: number | null, order: number }} moments
   * @property {(p: Params) => Sampler} reference
   * @property {(p: Params, cut?: number) => Sampler | NoSampler} inverse
   * @property {(p: Params, factor: number) => Sampler | NoSampler} rejection
   * @property {(p: Params, j: number) => { law: string, params: Params }} [marginal]
   * @property {(p: Params, i: number, j: number) => number} [covariance] the covariance of components i and j of a vector law
   */

  const zero = () => 0;

  /** @type {Law} */
  const cuniform = {
    id: "cuniform", name: "Continuous uniform", continuous: true, location: ["a", "b"],
    params: [{ name: "a", kind: "real", text: "least value" }, { name: "b", kind: "real", text: "greatest value, a < b" }],
    check: (p) => (real(p.a) && real(p.b) && p.a < p.b ? [] : [`a = ${show(p.a)} and b = ${show(p.b)} are not finite numbers with a < b.`]),
    support: (p) => ({ lo: p.a, hi: p.b }),
    supportText: (p) => `[${p.a}, ${p.b}]`,
    pdf: (x, p) => (x >= p.a && x <= p.b ? 1 / (p.b - p.a) : 0),
    pmf: zero,
    cdf: (x, p) => clamp01((x - p.a) / (p.b - p.a)),
    sf: (x, p) => clamp01((p.b - x) / (p.b - p.a)),
    quantile: (u, p) => p.a + clamp01(u) * (p.b - p.a),
    isf: (v, p) => p.b - clamp01(v) * (p.b - p.a),
    moments: (p) => ({ mean: (p.a + p.b) / 2, variance: (p.b - p.a) ** 2 / 12, order: Infinity }),
    reference: (p) => ({ label: "Scaled uniform: X = a + (b − a)U", exactness: "exact", draw: (rng) => p.a + (p.b - p.a) * rng.uniform() }),
    inverse: (p, cut) => inverseOf(cuniform, p, cut, "Quantile function a + (b − a)U", "exact"),
    rejection: () => ({ unavailable: "The uniform law is the proposal of the other rejection samplers. Rejection from itself accepts every proposal, so it adds nothing." }),
  };

  /** @type {Law} */
  const normal = {
    id: "normal", name: "Normal", continuous: true, location: ["mu"],
    params: [{ name: "mu", kind: "real", text: "mean μ" }, { name: "sigma", kind: "real", text: "standard deviation σ > 0" }],
    check: (p) => [...(real(p.mu) ? [] : [`mu = ${show(p.mu)} is not a finite number.`]), ...(positive(p.sigma) ? [] : [`sigma = ${show(p.sigma)} is not a number in (0, 10^15].`])],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => S.normalPdf((x - p.mu) / p.sigma) / p.sigma,
    pmf: zero,
    cdf: (x, p) => S.normalCdf((x - p.mu) / p.sigma),
    sf: (x, p) => S.normalCdf((p.mu - x) / p.sigma),
    quantile: (u, p) => (u <= 0 ? -Infinity : u >= 1 ? Infinity : p.mu + p.sigma * S.normalQuantile(u)),
    isf: (v, p) => (v <= 0 ? Infinity : v >= 1 ? -Infinity : p.mu - p.sigma * S.normalQuantile(v)),
    moments: (p) => ({ mean: p.mu, variance: p.sigma * p.sigma, order: Infinity }),
    reference: (p) => ({ label: "Box–Muller transform of two uniforms: X = μ + σ√(−2 log U₁) cos(2πU₂)", exactness: "exact", draw: (rng) => p.mu + p.sigma * rng.normal() }),
    inverse: (p, cut) => inverseOf(normal, p, cut, "Quantile function: Acklam's approximation of Φ⁻¹ with one Halley step", "exact up to the error of the quantile function, about 15 significant digits"),
    rejection: (p, f) => mapped(normalByLaplace(f), "μ + σZ, with Z", (z) => p.mu + p.sigma * z),
  };

  /** @param {Params} p */
  const dimOf = (p) => (Array.isArray(p.mu) ? p.mu.length : 0);

  /** @type {Law} */
  const mvnormal = {
    id: "mvnormal", name: "Multivariate normal", continuous: true, location: ["mu"],
    params: [{ name: "mu", kind: "vector", text: "mean vector μ of length k, 1 ≤ k ≤ 20" }, { name: "cov", kind: "vector", text: "covariance matrix Σ as k² entries, row by row; symmetric and positive definite" }],
    check: (p) => {
      if (!Array.isArray(p.mu) || p.mu.length < 1 || p.mu.length > 20 || !p.mu.every(real)) return ["mu is a vector of 1 to 20 finite numbers, such as [0, 0]."];
      const k = p.mu.length;
      if (!Array.isArray(p.cov) || p.cov.length !== k * k || !p.cov.every(real)) return [`cov is a vector of k² = ${k * k} finite numbers: the covariance matrix row by row.`];
      for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) if (Math.abs(p.cov[i * k + j] - p.cov[j * k + i]) > 1e-12 * Math.max(1, Math.abs(p.cov[i * k + j]))) return [`cov is not symmetric: entry (${i + 1}, ${j + 1}) differs from entry (${j + 1}, ${i + 1}).`];
      return cholesky(p.cov, k) ? [] : ["cov is not positive definite: no Cholesky factor exists."];
    },
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: (p) => `ℝ^${dimOf(p)}`,
    dim: dimOf,
    // The scalar functions describe component 1; marginal(p, j) gives component j.
    pdf: (x, p) => normal.pdf(x, mvMarginal(p, 1)),
    pmf: zero,
    cdf: (x, p) => normal.cdf(x, mvMarginal(p, 1)),
    sf: (x, p) => normal.sf(x, mvMarginal(p, 1)),
    quantile: (u, p) => normal.quantile(u, mvMarginal(p, 1)),
    isf: (v, p) => normal.isf(v, mvMarginal(p, 1)),
    moments: (p) => normal.moments(mvMarginal(p, 1)),
    marginal: (p, j) => ({ law: "normal", params: mvMarginal(p, j) }),
    covariance: (p, i, j) => p.cov[(i - 1) * p.mu.length + (j - 1)],
    reference: (p) => {
      const k = p.mu.length, L = /** @type {Float64Array} */ (cholesky(p.cov, k));
      return { label: "μ + LZ, with L the Cholesky factor of Σ and Z a vector of Box–Muller normal values", exactness: "exact", draw: (rng) => affineNormal(p.mu, L, Array.from({ length: k }, () => rng.normal())) };
    },
    inverse: (p, cut) => {
      const k = p.mu.length, L = /** @type {Float64Array} */ (cholesky(p.cov, k)), top = cut === undefined ? Infinity : S.normalQuantile(cut);
      return { label: `μ + LZ, with each Z_j = Φ⁻¹(U_j) by the quantile function${cut === undefined ? "" : `, each Z_j capped at its ${cut} quantile`}`, exactness: cut === undefined ? "exact up to the error of the quantile function" : "not exact: the tail is cut",
        draw: (rng) => affineNormal(p.mu, L, Array.from({ length: k }, () => Math.min(top, S.normalQuantile(rng.uniform())))) };
    },
    rejection: (p, f) => {
      const k = p.mu.length, L = /** @type {Float64Array} */ (cholesky(p.cov, k)), z = normalByLaplace(f);
      if ("unavailable" in z) return z;
      return { ...z, label: `μ + LZ, with each Z_j by rejection from the standard Laplace law, envelope constant M = ${Math.sqrt((2 * Math.E) / Math.PI).toPrecision(6)}${f === 1 ? "" : ` multiplied by ${f}`}`,
        draw: (rng, stats) => affineNormal(p.mu, L, Array.from({ length: k }, () => /** @type {number} */ (z.draw(rng, stats)))) };
    },
  };
  /** @param {Params} p @param {number} j */
  function mvMarginal(p, j) {
    const k = p.mu.length;
    return { mu: p.mu[j - 1], sigma: Math.sqrt(p.cov[(j - 1) * k + (j - 1)]) };
  }

  /** @type {Law} */
  const exponential = {
    id: "exponential", name: "Exponential", continuous: true,
    params: [{ name: "rate", kind: "real", text: "rate λ > 0, the inverse of the mean" }],
    check: (p) => (positive(p.rate) ? [] : [`rate = ${show(p.rate)} is not a number in (0, 10^15].`]),
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => (x < 0 ? 0 : p.rate * Math.exp(-p.rate * x)),
    pmf: zero,
    cdf: (x, p) => (x <= 0 ? 0 : -Math.expm1(-p.rate * x)),
    sf: (x, p) => (x <= 0 ? 1 : Math.exp(-p.rate * x)),
    quantile: (u, p) => (u <= 0 ? 0 : u >= 1 ? Infinity : -Math.log1p(-u) / p.rate),
    isf: (v, p) => (v <= 0 ? Infinity : v >= 1 ? 0 : -Math.log(v) / p.rate),
    moments: (p) => ({ mean: 1 / p.rate, variance: 1 / (p.rate * p.rate), order: Infinity }),
    reference: (p) => ({ label: "Inversion of the survival function: X = −log(U)/λ", exactness: "exact", draw: (rng) => -Math.log(rng.uniform()) / p.rate }),
    inverse: (p, cut) => inverseOf(exponential, p, cut, "Quantile function X = −log(1 − U)/λ", "exact"),
    rejection: (p, f) => rejection("Proposal: the exponential law with rate λ/2", (x) => exponential.pdf(x, p), (x) => exponential.pdf(x, { rate: p.rate / 2 }), (rng) => (-2 * Math.log(rng.uniform())) / p.rate, 2, f),
  };

  /** A starting point for the gamma quantile: Wilson–Hilferty for k ≥ 1, the small-x power law below. @param {number} u @param {number} k */
  function gammaGuess(u, k) {
    if (k >= 1) {
      const z = S.normalQuantile(Math.min(1 - 1e-16, Math.max(1e-300, u)));
      return Math.max(1e-3 * k, k * (1 - 1 / (9 * k) + z / (3 * Math.sqrt(k))) ** 3);
    }
    return Math.exp((Math.log(Math.max(u, 1e-300)) + S.lgamma(k + 1)) / k);
  }

  /** @type {Law} */
  const gammaLaw = {
    id: "gamma", name: "Gamma", continuous: true,
    params: [{ name: "k", kind: "real", text: "shape k > 0" }, { name: "theta", kind: "real", text: "scale θ > 0; the mean is kθ" }],
    check: (p) => [...(inside(p.k, 1e-6, 1e6) ? [] : [`k = ${show(p.k)} is outside [10^-6, 10^6].`]), ...(positive(p.theta) ? [] : [`theta = ${show(p.theta)} is not a number in (0, 10^15].`])],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => {
      if (x < 0) return 0;
      if (x === 0) return p.k === 1 ? 1 / p.theta : p.k > 1 ? 0 : Infinity;
      return Math.exp((p.k - 1) * Math.log(x / p.theta) - x / p.theta - S.lgamma(p.k)) / p.theta;
    },
    pmf: zero,
    cdf: (x, p) => (x <= 0 ? 0 : x === Infinity ? 1 : S.gammaPQ(p.k, x / p.theta).P),
    sf: (x, p) => (x <= 0 ? 1 : x === Infinity ? 0 : S.gammaPQ(p.k, x / p.theta).Q),
    quantile: (u, p) => solved(gammaLaw, u, p, p.theta * gammaGuess(u, p.k)),
    isf: (v, p) => solved(gammaLaw, v, p, p.theta * gammaGuess(1 - v, p.k), true),
    moments: (p) => ({ mean: p.k * p.theta, variance: p.k * p.theta * p.theta, order: Infinity }),
    reference: (p) => ({ label: `Marsaglia–Tsang (2000) squeeze and rejection${p.k < 1 ? ", with Gamma(k + 1)·U^(1/k) for k < 1" : ""}, times θ`, exactness: "exact", draw: (rng) => p.theta * gamma(rng, p.k) }),
    inverse: (p, cut) => inverseOf(gammaLaw, p, cut, "Quantile function: the inverse of the regularised incomplete gamma function", NUMERIC),
    rejection: (p, f) => mapped(gammaByExponential(p.k, f), "θ·G, with G", (g) => p.theta * g),
  };

  /** @type {Law} */
  const erlang = {
    id: "erlang", name: "Erlang", continuous: true,
    params: [{ name: "k", kind: "integer", text: "number of exponential phases, an integer 1 ≤ k ≤ 10^6" }, { name: "rate", kind: "real", text: "rate λ > 0 of each phase" }],
    check: (p) => [...(Number.isInteger(p.k) && inside(p.k, 1, 1e6) ? [] : [`k = ${show(p.k)} is not an integer in [1, 10^6].`]), ...(positive(p.rate) ? [] : [`rate = ${show(p.rate)} is not a number in (0, 10^15].`])],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => gammaLaw.pdf(x, { k: p.k, theta: 1 / p.rate }),
    pmf: zero,
    cdf: (x, p) => gammaLaw.cdf(x, { k: p.k, theta: 1 / p.rate }),
    sf: (x, p) => gammaLaw.sf(x, { k: p.k, theta: 1 / p.rate }),
    quantile: (u, p) => gammaLaw.quantile(u, { k: p.k, theta: 1 / p.rate }),
    isf: (v, p) => gammaLaw.isf(v, { k: p.k, theta: 1 / p.rate }),
    moments: (p) => ({ mean: p.k / p.rate, variance: p.k / (p.rate * p.rate), order: Infinity }),
    reference: (p) => {
      if (p.k <= 64) return { label: "Sum of k exponential phases: X = −Σ log(U_i)/λ (k ≤ 64)", exactness: "exact", draw: (rng) => { let s = 0; for (let i = 0; i < p.k; i++) s -= Math.log(rng.uniform()); return s / p.rate; } };
      return { label: "Marsaglia–Tsang (2000) for Gamma(k, 1), divided by λ (k > 64)", exactness: "exact", draw: (rng) => gamma(rng, p.k) / p.rate };
    },
    inverse: (p, cut) => inverseOf(erlang, p, cut, "Quantile function: the inverse of the regularised incomplete gamma function", NUMERIC),
    rejection: (p, f) => mapped(gammaByExponential(p.k, f), "G/λ, with G", (g) => g / p.rate),
  };

  /** @type {Law} */
  const beta = {
    id: "beta", name: "Beta", continuous: true,
    params: [{ name: "a", kind: "real", text: "shape a > 0" }, { name: "b", kind: "real", text: "shape b > 0; the mean is a/(a + b)" }],
    check: (p) => [...(inside(p.a, 1e-6, 1e6) ? [] : [`a = ${show(p.a)} is outside [10^-6, 10^6].`]), ...(inside(p.b, 1e-6, 1e6) ? [] : [`b = ${show(p.b)} is outside [10^-6, 10^6].`])],
    support: () => ({ lo: 0, hi: 1 }),
    supportText: () => "[0, 1]",
    pdf: (x, p) => {
      if (x < 0 || x > 1) return 0;
      if (x === 0) return p.a === 1 ? p.b : p.a > 1 ? 0 : Infinity;
      if (x === 1) return p.b === 1 ? p.a : p.b > 1 ? 0 : Infinity;
      return Math.exp((p.a - 1) * Math.log(x) + (p.b - 1) * Math.log1p(-x) - S.lbeta(p.a, p.b));
    },
    pmf: zero,
    cdf: (x, p) => (x <= 0 ? 0 : x >= 1 ? 1 : S.ibeta(x, p.a, p.b)),
    sf: (x, p) => (x <= 0 ? 1 : x >= 1 ? 0 : S.ibetac(x, p.a, p.b)),
    quantile: (u, p) => solved(beta, u, p, p.a / (p.a + p.b)),
    isf: (v, p) => solved(beta, v, p, p.a / (p.a + p.b), true),
    moments: (p) => { const s = p.a + p.b; return { mean: p.a / s, variance: (p.a * p.b) / (s * s * (s + 1)), order: Infinity }; },
    reference: (p) => ({ label: "Ratio of gamma values: X = G_a/(G_a + G_b), each by Marsaglia–Tsang", exactness: "exact", draw: (rng) => { const x = gamma(rng, p.a), y = gamma(rng, p.b); return x / (x + y); } }),
    inverse: (p, cut) => inverseOf(beta, p, cut, "Quantile function: the inverse of the regularised incomplete beta function", NUMERIC),
    rejection: (p, f) => betaByUniform(p.a, p.b, f),
  };

  /** @type {Law} */
  const dirichlet = {
    id: "dirichlet", name: "Dirichlet", continuous: true,
    params: [{ name: "alpha", kind: "vector", text: "concentrations α_1 … α_k, each > 0, with 2 ≤ k ≤ 50" }],
    check: (p) => (Array.isArray(p.alpha) && p.alpha.length >= 2 && p.alpha.length <= 50 && p.alpha.every((/** @type {unknown} */ a) => inside(a, 1e-6, 1e6)) ? [] : ["alpha is a vector of 2 to 50 numbers in [10^-6, 10^6], such as [2, 3, 5]."]),
    support: () => ({ lo: 0, hi: 1 }),
    supportText: (p) => `simplex: ${p.alpha.length} parts in [0, 1] with sum 1`,
    dim: (p) => p.alpha.length,
    // The scalar functions describe component 1; marginal(p, j) gives component j.
    pdf: (x, p) => beta.pdf(x, dirMarginal(p, 1)),
    pmf: zero,
    cdf: (x, p) => beta.cdf(x, dirMarginal(p, 1)),
    sf: (x, p) => beta.sf(x, dirMarginal(p, 1)),
    quantile: (u, p) => beta.quantile(u, dirMarginal(p, 1)),
    isf: (v, p) => beta.isf(v, dirMarginal(p, 1)),
    moments: (p) => beta.moments(dirMarginal(p, 1)),
    marginal: (p, j) => ({ law: "beta", params: dirMarginal(p, j) }),
    covariance: (p, i, j) => {
      const s = p.alpha.reduce((/** @type {number} */ t, /** @type {number} */ x) => t + x, 0), ai = p.alpha[i - 1] / s, aj = p.alpha[j - 1] / s;
      return ((i === j ? ai : 0) - ai * aj) / (s + 1);
    },
    reference: (p) => ({ label: "Normalised gamma values: X_j = G_j / Σ G_i, with G_j ~ Gamma(α_j, 1) by Marsaglia–Tsang", exactness: "exact", draw: (rng) => normalise(p.alpha.map((/** @type {number} */ a) => gamma(rng, a))) }),
    inverse: (p, cut) => {
      const k = p.alpha.length, rest = p.alpha.map((/** @type {number} */ _, /** @type {number} */ j) => p.alpha.slice(j + 1).reduce((/** @type {number} */ s, /** @type {number} */ a) => s + a, 0));
      const capped = (/** @type {number} */ u, /** @type {Params} */ q) => (cut === undefined ? beta.quantile(u, q) : Math.min(beta.quantile(cut, q), beta.quantile(u, q)));
      return { label: `Stick breaking: X_j = (1 − X_1 − … − X_{j−1})·B_j, each B_j ~ Beta(α_j, α_{j+1} + … + α_k) by its quantile function${cut === undefined ? "" : `, each capped at its ${cut} quantile`}`, exactness: cut === undefined ? NUMERIC : "not exact: the tail is cut",
        draw: (rng) => {
          const x = new Array(k);
          let left = 1;
          for (let j = 0; j < k - 1; j++) { x[j] = left * capped(rng.uniform(), { a: p.alpha[j], b: rest[j] }); left -= x[j]; }
          x[k - 1] = Math.max(0, left);
          return x;
        } };
    },
    rejection: (p, f) => {
      const parts = p.alpha.map((/** @type {number} */ a) => gammaByExponential(a, f));
      const bad = parts.find((/** @type {any} */ s) => "unavailable" in s);
      if (bad) return { unavailable: `Each α_j must be 1 or more. ${/** @type {NoSampler} */ (bad).unavailable}` };
      return { label: `Normalised gamma values, each G_j ~ Gamma(α_j, 1) by rejection from an exponential proposal${f === 1 ? "" : `, each envelope multiplied by ${f}`}`, exactness: f === 1 ? "exact" : "not exact: the envelope is too small",
        draw: (rng, stats) => normalise(parts.map((/** @type {any} */ s) => s.draw(rng, stats))) };
    },
  };
  /** @param {Params} p @param {number} j */
  function dirMarginal(p, j) {
    const a = p.alpha[j - 1], s = p.alpha.reduce((/** @type {number} */ t, /** @type {number} */ x) => t + x, 0);
    return { a, b: s - a };
  }
  /** @param {number[]} g */
  function normalise(g) {
    const s = g.reduce((t, x) => t + x, 0);
    return g.map((x) => x / s);
  }

  /** @type {Law} */
  const chisq = {
    id: "chisq", name: "Chi-square", continuous: true,
    params: [{ name: "nu", kind: "real", text: "degrees of freedom ν > 0" }],
    check: (p) => (inside(p.nu, 1e-6, 1e6) ? [] : [`nu = ${show(p.nu)} is outside [10^-6, 10^6].`]),
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => gammaLaw.pdf(x, { k: p.nu / 2, theta: 2 }),
    pmf: zero,
    cdf: (x, p) => gammaLaw.cdf(x, { k: p.nu / 2, theta: 2 }),
    sf: (x, p) => gammaLaw.sf(x, { k: p.nu / 2, theta: 2 }),
    quantile: (u, p) => gammaLaw.quantile(u, { k: p.nu / 2, theta: 2 }),
    isf: (v, p) => gammaLaw.isf(v, { k: p.nu / 2, theta: 2 }),
    moments: (p) => ({ mean: p.nu, variance: 2 * p.nu, order: Infinity }),
    reference: (p) => {
      if (Number.isInteger(p.nu) && p.nu <= 64) return { label: "Sum of ν squared standard normal values, each by Box–Muller (integer ν ≤ 64)", exactness: "exact", draw: (rng) => { let s = 0; for (let i = 0; i < p.nu; i++) { const z = rng.normal(); s += z * z; } return s; } };
      return { label: "2·Gamma(ν/2, 1) by Marsaglia–Tsang", exactness: "exact", draw: (rng) => 2 * gamma(rng, p.nu / 2) };
    },
    inverse: (p, cut) => inverseOf(chisq, p, cut, "Quantile function: the inverse of the regularised incomplete gamma function", NUMERIC),
    rejection: (p, f) => mapped(gammaByExponential(p.nu / 2, f), "2G, with G ~ Gamma(ν/2, 1)", (g) => 2 * g),
  };

  /** P(T > |t|) for Student's t with ν degrees of freedom, from the incomplete beta function without cancellation. @param {number} t @param {number} nu */
  function tTail(t, nu) {
    const t2 = t * t;
    if (t2 > nu) return 0.5 * S.ibeta(nu / (nu + t2), nu / 2, 0.5);
    return 0.5 - 0.5 * S.ibeta(t2 / (nu + t2), 0.5, nu / 2);
  }

  /** @type {Law} */
  const student = {
    id: "student", name: "Student's t", continuous: true,
    params: [{ name: "nu", kind: "real", text: "degrees of freedom ν > 0; the law is the standard t law, so use μ + s·T for a location μ and a scale s" }],
    check: (p) => (inside(p.nu, 1e-3, 1e6) ? [] : [`nu = ${show(p.nu)} is outside [0.001, 10^6].`]),
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => Math.exp(S.lgamma((p.nu + 1) / 2) - S.lgamma(p.nu / 2) - 0.5 * Math.log(p.nu * Math.PI) - ((p.nu + 1) / 2) * Math.log1p((x * x) / p.nu)),
    pmf: zero,
    cdf: (x, p) => (x === -Infinity ? 0 : x === Infinity ? 1 : x < 0 ? tTail(x, p.nu) : 1 - tTail(x, p.nu)),
    sf: (x, p) => (x === -Infinity ? 1 : x === Infinity ? 0 : x > 0 ? tTail(x, p.nu) : 1 - tTail(x, p.nu)),
    quantile: (u, p) => solved(student, u, p, S.normalQuantile(Math.min(1 - 1e-16, Math.max(1e-300, u)))),
    isf: (v, p) => -student.quantile(v, p),
    moments: (p) => ({ mean: p.nu > 1 ? 0 : null, variance: p.nu > 2 ? p.nu / (p.nu - 2) : null, order: p.nu }),
    reference: (p) => ({ label: "Z/√(V/ν), with Z by Box–Muller and V = 2·Gamma(ν/2, 1) by Marsaglia–Tsang", exactness: "exact", draw: (rng) => rng.normal() / Math.sqrt((2 * gamma(rng, p.nu / 2)) / p.nu) }),
    inverse: (p, cut) => inverseOf(student, p, cut, "Quantile function: the inverse of the t CDF, from the incomplete beta function", NUMERIC),
    rejection: (p, f) => {
      if (p.nu < 1) return { unavailable: `For ν = ${p.nu} below 1 the t tail is heavier than the Cauchy tail, so the Cauchy proposal does not cover it.` };
      // p/q is largest at t² = 1 for ν > 1 (and constant for ν = 1).
      const M = (student.pdf(1, p) * Math.PI * 2);
      return rejection("Proposal: the standard Cauchy law, X = tan(π(U − 1/2))", (x) => student.pdf(x, p), (x) => 1 / (Math.PI * (1 + x * x)), (rng) => Math.tan(Math.PI * (rng.uniform() - 0.5)), Math.max(1, M), f);
    },
  };

  /** @type {Law} */
  const fisher = {
    id: "fisher", name: "F (Fisher–Snedecor)", continuous: true,
    params: [{ name: "d1", kind: "real", text: "numerator degrees of freedom d₁ > 0" }, { name: "d2", kind: "real", text: "denominator degrees of freedom d₂ > 0" }],
    check: (p) => [...(inside(p.d1, 1e-3, 1e6) ? [] : [`d1 = ${show(p.d1)} is outside [0.001, 10^6].`]), ...(inside(p.d2, 1e-3, 1e6) ? [] : [`d2 = ${show(p.d2)} is outside [0.001, 10^6].`])],
    support: () => ({ lo: 0, hi: Infinity }),
    supportText: () => "[0, ∞)",
    pdf: (x, p) => {
      if (x < 0) return 0;
      if (x === 0) return p.d1 === 2 ? 1 : p.d1 > 2 ? 0 : Infinity;
      return Math.exp((p.d1 / 2) * Math.log(p.d1) + (p.d2 / 2) * Math.log(p.d2) + (p.d1 / 2 - 1) * Math.log(x) - ((p.d1 + p.d2) / 2) * Math.log(p.d2 + p.d1 * x) - S.lbeta(p.d1 / 2, p.d2 / 2));
    },
    pmf: zero,
    cdf: (x, p) => (x <= 0 ? 0 : x === Infinity ? 1 : S.ibeta((p.d1 * x) / (p.d1 * x + p.d2), p.d1 / 2, p.d2 / 2)),
    sf: (x, p) => (x <= 0 ? 1 : x === Infinity ? 0 : S.ibeta(p.d2 / (p.d2 + p.d1 * x), p.d2 / 2, p.d1 / 2)),
    quantile: (u, p) => solved(fisher, u, p, p.d2 > 2 ? p.d2 / (p.d2 - 2) : 1),
    isf: (v, p) => solved(fisher, v, p, p.d2 > 2 ? p.d2 / (p.d2 - 2) : 1, true),
    moments: (p) => ({
      mean: p.d2 > 2 ? p.d2 / (p.d2 - 2) : null,
      variance: p.d2 > 4 ? (2 * p.d2 * p.d2 * (p.d1 + p.d2 - 2)) / (p.d1 * (p.d2 - 2) ** 2 * (p.d2 - 4)) : null,
      order: p.d2 / 2,
    }),
    reference: (p) => ({ label: "Ratio of chi-square values: X = (V₁/d₁)/(V₂/d₂), each V = 2·Gamma(d/2, 1) by Marsaglia–Tsang", exactness: "exact", draw: (rng) => (gamma(rng, p.d1 / 2) / p.d1) / (gamma(rng, p.d2 / 2) / p.d2) }),
    inverse: (p, cut) => inverseOf(fisher, p, cut, "Quantile function: the inverse of the F CDF, from the incomplete beta function", NUMERIC),
    rejection: (p, f) => (p.d1 < 2 || p.d2 < 2 ? { unavailable: `The method needs d₁ ≥ 2 and d₂ ≥ 2: with d₁ = ${p.d1} and d₂ = ${p.d2} the density of Y = d₁X/(d₁X + d₂) is unbounded.` }
      : mapped(betaByUniform(p.d1 / 2, p.d2 / 2, f), "X = d₂Y/(d₁(1 − Y)), with Y ~ Beta(d₁/2, d₂/2)", (y) => (p.d2 * y) / (p.d1 * (1 - y)))),
  };

  /** @type {Law} */
  const logistic = {
    id: "logistic", name: "Logistic", continuous: true, location: ["mu"],
    params: [{ name: "mu", kind: "real", text: "location μ, the mean and the median" }, { name: "s", kind: "real", text: "scale s > 0; the standard deviation is sπ/√3" }],
    check: (p) => [...(real(p.mu) ? [] : [`mu = ${show(p.mu)} is not a finite number.`]), ...(positive(p.s) ? [] : [`s = ${show(p.s)} is not a number in (0, 10^15].`])],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => logisticPdf((x - p.mu) / p.s) / p.s,
    pmf: zero,
    cdf: (x, p) => 1 / (1 + Math.exp(-(x - p.mu) / p.s)),
    sf: (x, p) => 1 / (1 + Math.exp((x - p.mu) / p.s)),
    quantile: (u, p) => (u <= 0 ? -Infinity : u >= 1 ? Infinity : p.mu + p.s * logisticQ(u)),
    isf: (v, p) => (v <= 0 ? Infinity : v >= 1 ? -Infinity : p.mu - p.s * logisticQ(v)),
    moments: (p) => ({ mean: p.mu, variance: (p.s * p.s * Math.PI * Math.PI) / 3, order: Infinity }),
    reference: (p) => ({ label: "Difference of two standard Gumbel values: X = μ + s(G₁ − G₂), G = −log(−log U)", exactness: "exact", draw: (rng) => p.mu + p.s * (Math.log(-Math.log(rng.uniform())) - Math.log(-Math.log(rng.uniform()))) }),
    inverse: (p, cut) => inverseOf(logistic, p, cut, "Quantile function X = μ + s log(U/(1 − U))", "exact"),
    rejection: (p, f) => mapped(rejection("Proposal: the standard Laplace law", logisticPdf, laplacePdf, (rng) => laplaceQ(rng.uniform()), 2, f), "μ + sZ, with Z", (z) => p.mu + p.s * z),
  };

  /** @type {Law} */
  const laplace = {
    id: "laplace", name: "Laplace", continuous: true, location: ["mu"],
    params: [{ name: "mu", kind: "real", text: "location μ, the mean and the median" }, { name: "b", kind: "real", text: "scale b > 0; the standard deviation is b√2" }],
    check: (p) => [...(real(p.mu) ? [] : [`mu = ${show(p.mu)} is not a finite number.`]), ...(positive(p.b) ? [] : [`b = ${show(p.b)} is not a number in (0, 10^15].`])],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pdf: (x, p) => laplacePdf((x - p.mu) / p.b) / p.b,
    pmf: zero,
    cdf: (x, p) => { const z = (x - p.mu) / p.b; return z < 0 ? Math.exp(z) / 2 : 1 - Math.exp(-z) / 2; },
    sf: (x, p) => { const z = (x - p.mu) / p.b; return z > 0 ? Math.exp(-z) / 2 : 1 - Math.exp(z) / 2; },
    quantile: (u, p) => (u <= 0 ? -Infinity : u >= 1 ? Infinity : p.mu + p.b * laplaceQ(u)),
    isf: (v, p) => (v <= 0 ? Infinity : v >= 1 ? -Infinity : p.mu - p.b * laplaceQ(v)),
    moments: (p) => ({ mean: p.mu, variance: 2 * p.b * p.b, order: Infinity }),
    reference: (p) => ({ label: "Difference of two exponential values: X = μ + b(E₁ − E₂), E = −log U", exactness: "exact", draw: (rng) => p.mu + p.b * (Math.log(rng.uniform()) - Math.log(rng.uniform())) }),
    inverse: (p, cut) => inverseOf(laplace, p, cut, "Quantile function: X = μ + b log(2U) for U < 1/2, μ − b log(2(1 − U)) above", "exact"),
    rejection: (p, f) => mapped(rejection("Proposal: the standard logistic law", laplacePdf, logisticPdf, (rng) => logisticQ(rng.uniform()), 2, f), "μ + bZ, with Z", (z) => p.mu + p.b * z),
  };

  const LAWS = [cuniform, normal, mvnormal, exponential, gammaLaw, erlang, beta, dirichlet, chisq, student, fisher, logistic, laplace];

  return { LAWS, rejection, gamma, cholesky };
});
