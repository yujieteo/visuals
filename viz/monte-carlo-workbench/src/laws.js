/* Monte Carlo Probability Workbench: the probability laws of the discrete group. Each law states its parameter
 * convention and support, and computes its PMF, CDF, survival function, quantile function and moments, with the
 * conditions under which a moment exists. Each law also gives three samplers, one for each method of the method
 * library: its reference sampler for independent sampling, an inverse-transform sampler, and a rejection sampler
 * (or the reason that it has none). A sampler draws from a stream of MCRng. Tests load this file with require().
 */
/** @param {any} root the global object @param {(S: any) => any} factory */
(function (root, factory) {
  const S = root.MCSpecial ?? require("./special.js");
  const api = factory(S);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCLaws = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {typeof import("./special.js")} */ S) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {{ proposals: number, accepts: number, violations: number }} RejectStats */
  /** @typedef {{ label: string, exactness: string, draw(rng: Rng, stats?: RejectStats): number | number[], acceptance?: number, envelope?: number }} Sampler */
  /** @typedef {{ unavailable: string }} NoSampler */
  /** @typedef {Record<string, any>} Params */

  const TABLE_MAX = 65536;

  /** @param {number} x @param {number} lo @param {number} hi */
  const inside = (x, lo, hi) => typeof x === "number" && x >= lo && x <= hi;
  /** @param {number} x */
  const isInt = (x) => typeof x === "number" && Number.isInteger(x);
  /** @param {number} x */
  const show = (x) => (typeof x === "number" ? (x === Infinity ? "∞" : String(x)) : "a vector");

  /** The smallest index i with cdf[i] >= u in a non-decreasing table. @param {Float64Array} cdf @param {number} u */
  function search(cdf, u) {
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** A CDF table over lo..hi from a PMF. @param {(k: number) => number} pmf @param {number} lo @param {number} hi */
  function table(pmf, lo, hi) {
    const cdf = new Float64Array(hi - lo + 1);
    let F = 0;
    for (let k = lo; k <= hi; k++) {
      F += pmf(k);
      cdf[k - lo] = F;
    }
    return cdf;
  }

  /**
   * Inversion by sequential search from the mode: one uniform, then steps down or up the support with
   * the PMF ratio, from the mode's CDF. Exact up to floating-point rounding; the expected cost is of the order of the
   * standard deviation.
   * @param {{ lo: number, hi: number, mode: number, pm: number, Fm: number, up(k: number): number, down(k: number): number }} s
   * @returns {(rng: Rng) => number}
   */
  function modeInversion(s) {
    return (rng) => {
      const u = rng.uniform();
      let k = s.mode, F = s.Fm, pk = s.pm;
      if (u <= F) {
        while (k > s.lo && u <= F - pk) {
          F -= pk;
          pk *= s.down(k);
          k--;
        }
        return k;
      }
      while (u > F && k < s.hi) {
        pk *= s.up(k);
        k++;
        F += pk;
        if (pk === 0) break;
      }
      return k;
    };
  }

  /** A sampler that always returns one value. @param {number} v @param {string} why @returns {Sampler} */
  const constant = (v, why) => ({ label: `Constant ${v} (${why})`, exactness: "exact", draw: () => v });

  /**
   * The generic rejection sampler from a proposal law q: accept x with probability p(x) / (M q(x)). `factor` below 1
   * shrinks the envelope constant for the assumption-failure experiment, and `violations` counts proposals where the
   * ratio exceeds 1, which shows that the envelope does not dominate the target.
   * @param {string} label @param {(k: number) => number} p @param {(k: number) => number} q @param {(rng: Rng) => number} propose
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

  /** The smallest k in [lo, hi] with test(k) true, for a monotone test, by doubling then bisection. @param {(k: number) => boolean} test @param {number} lo @param {number} hi */
  function firstTrue(test, lo, hi) {
    let a = lo, step = 1, b = lo;
    while (!test(b)) {
      a = b + 1;
      b = Math.min(hi, lo + step);
      step *= 2;
      if (b >= hi) { b = hi; break; }
    }
    while (a < b) {
      const mid = a + Math.floor((b - a) / 2);
      if (test(mid)) b = mid;
      else a = mid + 1;
    }
    return a;
  }

  /** The quantile function: the smallest support point k with F(k) >= u, by the CDF below one half and the survival function above it. */
  /** @param {any} law @param {number} u @param {Params} p */
  function quantile(law, u, p) {
    const s = law.support(p);
    if (u <= 0) return s.lo;
    if (u >= 1) return s.hi;
    const test = u <= 0.5 ? (/** @type {number} */ k) => law.cdf(k, p) >= u : (/** @type {number} */ k) => law.sf(k, p) <= 1 - u;
    return firstTrue(test, s.lo, Math.min(s.hi, 9007199254740991));
  }

  /* ---------- the gamma sampler, for the negative binomial law as a gamma mixture of Poisson laws ---------- */

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

  /** A Poisson draw by the reference algorithm: multiplication of uniforms below 10, PTRS (Hormann 1993) above. @param {Rng} rng @param {number} lam */
  function poissonDraw(rng, lam) {
    if (lam === 0) return 0;
    if (lam < 10) {
      const L = Math.exp(-lam);
      let k = 0, prod = rng.uniform();
      while (prod > L) {
        k++;
        prod *= rng.uniform();
      }
      return k;
    }
    const slam = Math.sqrt(lam), loglam = Math.log(lam);
    const b = 0.931 + 2.53 * slam, a = -0.059 + 0.02483 * b, invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2);
    for (;;) {
      const U = rng.uniform() - 0.5, V = rng.uniform(), us = 0.5 - Math.abs(U);
      const k = Math.floor((2 * a / us + b) * U + lam + 0.43);
      if (us >= 0.07 && V <= vr) return k;
      if (k < 0 || (us < 0.013 && V > us)) continue;
      if (Math.log(V) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lam + k * loglam - S.lgamma(k + 1)) return k;
    }
  }

  /* ---------- the laws ---------- */

  /**
   * @typedef {object} Law
   * @property {string} id
   * @property {string} name
   * @property {{ name: string, kind: "integer" | "real" | "vector", text: string }[]} params
   * @property {(p: Params) => string[]} check
   * @property {(p: Params) => { lo: number, hi: number }} support
   * @property {(p: Params) => number} [dim]
   * @property {(k: number, p: Params) => number} pmf
   * @property {(k: number, p: Params) => number} cdf
   * @property {(k: number, p: Params) => number} sf
   * @property {(p: Params) => { mean: number | null, variance: number | null, order: number }} moments
   * @property {(p: Params) => Sampler} reference
   * @property {(p: Params, cut?: number) => Sampler | NoSampler} inverse
   * @property {(p: Params, factor: number) => Sampler | NoSampler} rejection
   * @property {(p: Params, j: number) => { law: string, params: Params }} [marginal]
   */

  /** @type {Law} */
  const bernoulli = {
    id: "bernoulli", name: "Bernoulli",
    params: [{ name: "p", kind: "real", text: "success probability, 0 ≤ p ≤ 1" }],
    check: (p) => (inside(p.p, 0, 1) ? [] : [`p = ${show(p.p)} is outside [0, 1].`]),
    support: () => ({ lo: 0, hi: 1 }),
    pmf: (k, p) => (k === 1 ? p.p : k === 0 ? 1 - p.p : 0),
    cdf: (k, p) => (k < 0 ? 0 : k < 1 ? 1 - p.p : 1),
    sf: (k, p) => (k < 0 ? 1 : k < 1 ? p.p : 0),
    moments: (p) => ({ mean: p.p, variance: p.p * (1 - p.p), order: Infinity }),
    reference: (p) => ({ label: "Comparison of one uniform with p: X = 1 if U < p", exactness: "exact", draw: (rng) => +(rng.uniform() < p.p) }),
    inverse: (p, cut) => cutSampler("Inverse transform: X = 1 if U > 1 − p", (rng) => +(rng.uniform() > 1 - p.p), cut === undefined ? undefined : quantile(bernoulli, cut, p), cut),
    rejection: (p, f) => finiteRejection(bernoulli, p, f),
  };

  /** @type {Law} */
  const binomial = {
    id: "binomial", name: "Binomial",
    params: [{ name: "n", kind: "integer", text: "number of trials, 0 ≤ n ≤ 10^6" }, { name: "p", kind: "real", text: "success probability of each trial, 0 ≤ p ≤ 1" }],
    check: (p) => [...(isInt(p.n) && inside(p.n, 0, 1e6) ? [] : [`n = ${show(p.n)} is not an integer in [0, 10^6].`]), ...(inside(p.p, 0, 1) ? [] : [`p = ${show(p.p)} is outside [0, 1].`])],
    support: (p) => ({ lo: 0, hi: p.n }),
    pmf: (k, p) => {
      if (!isInt(k) || k < 0 || k > p.n) return 0;
      if (p.p === 0) return +(k === 0);
      if (p.p === 1) return +(k === p.n);
      return Math.exp(S.lchoose(p.n, k) + k * Math.log(p.p) + (p.n - k) * Math.log1p(-p.p));
    },
    cdf: (k, p) => (k < 0 ? 0 : k >= p.n ? 1 : p.p === 0 ? 1 : p.p === 1 ? 0 : S.ibeta(1 - p.p, p.n - Math.floor(k), Math.floor(k) + 1)),
    sf: (k, p) => (k < 0 ? 1 : k >= p.n ? 0 : p.p === 0 ? 0 : p.p === 1 ? 1 : S.ibeta(p.p, Math.floor(k) + 1, p.n - Math.floor(k))),
    moments: (p) => ({ mean: p.n * p.p, variance: p.n * p.p * (1 - p.p), order: Infinity }),
    reference: (p) => {
      if (p.p === 0 || p.p === 1 || p.n === 0) return constant(p.p === 1 ? p.n : 0, "a degenerate law");
      if (p.n <= 64) return { label: "Count of successes in n Bernoulli trials (n ≤ 64)", exactness: "exact", draw: (rng) => { let x = 0; for (let i = 0; i < p.n; i++) x += +(rng.uniform() < p.p); return x; } };
      return { label: "Inversion by sequential search from the mode (n > 64)", exactness: "exact", draw: binomialModeInversion(p) };
    },
    inverse: (p, cut) => {
      if (p.p === 0 || p.p === 1 || p.n === 0) return constant(p.p === 1 ? p.n : 0, "a degenerate law");
      return cutSampler("Inverse transform by sequential search from the mode", binomialModeInversion(p), cut === undefined ? undefined : quantile(binomial, cut, p), cut);
    },
    rejection: (p, f) => finiteRejection(binomial, p, f),
  };

  /** @param {Params} p */
  function binomialModeInversion(p) {
    const mode = Math.min(p.n, Math.floor((p.n + 1) * p.p)), odds = p.p / (1 - p.p);
    return modeInversion({ lo: 0, hi: p.n, mode, pm: binomial.pmf(mode, p), Fm: binomial.cdf(mode, p), up: (k) => ((p.n - k) / (k + 1)) * odds, down: (k) => k / ((p.n - k + 1) * odds) });
  }

  /** @param {Params} p */
  function checkWeights(p) {
    const w = p.p;
    if (!Array.isArray(w) || w.length < 1 || w.length > 100) return ["p is a vector of 1 to 100 probabilities, such as [0.2, 0.3, 0.5]."];
    if (w.some((x) => !(x >= 0))) return ["Each entry of p is 0 or more."];
    const s = w.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 1e-9) return [`The entries of p add to ${s}, not 1. Use normalize() to scale weights.`];
    return [];
  }

  /** Vose's alias table for weights w. @param {number[]} w */
  function alias(w) {
    const k = w.length, prob = new Float64Array(k), al = new Int32Array(k), scaled = w.map((x) => x * k);
    /** @type {number[]} */
    const small = [];
    /** @type {number[]} */
    const large = [];
    for (let i = 0; i < k; i++) (scaled[i] < 1 ? small : large).push(i);
    while (small.length && large.length) {
      const s = /** @type {number} */ (small.pop()), l = /** @type {number} */ (large.pop());
      prob[s] = scaled[s];
      al[s] = l;
      scaled[l] = scaled[l] + scaled[s] - 1;
      (scaled[l] < 1 ? small : large).push(l);
    }
    for (const i of [...large, ...small]) prob[i] = 1;
    return { prob, al };
  }

  /** @type {Law} */
  const categorical = {
    id: "categorical", name: "Categorical",
    params: [{ name: "p", kind: "vector", text: "probabilities p_1 … p_k of the labels 1 … k, each ≥ 0, with sum 1" }],
    check: checkWeights,
    support: (p) => ({ lo: 1, hi: p.p.length }),
    pmf: (k, p) => (isInt(k) && k >= 1 && k <= p.p.length ? p.p[k - 1] : 0),
    cdf: (k, p) => { let F = 0; for (let j = 1; j <= Math.min(Math.floor(k), p.p.length); j++) F += p.p[j - 1]; return Math.min(1, F); },
    sf: (k, p) => { let F = 0; for (let j = Math.max(1, Math.floor(k) + 1); j <= p.p.length; j++) F += p.p[j - 1]; return Math.min(1, F); },
    moments: (p) => {
      let m = 0, m2 = 0;
      p.p.forEach((/** @type {number} */ w, /** @type {number} */ i) => { m += w * (i + 1); m2 += w * (i + 1) * (i + 1); });
      return { mean: m, variance: Math.max(0, m2 - m * m), order: Infinity };
    },
    reference: (p) => {
      const { prob, al } = alias(p.p);
      return { label: "Alias method (Walker 1977, Vose 1991): one integer and one uniform for each draw", exactness: "exact", draw: (rng) => { const i = rng.below(prob.length); return 1 + (rng.uniform() < prob[i] ? i : al[i]); } };
    },
    inverse: (p, cut) => tableInverse(categorical, p, cut),
    rejection: (p, f) => finiteRejection(categorical, p, f),
  };

  /** @type {Law} */
  const multinomial = {
    id: "multinomial", name: "Multinomial",
    params: [{ name: "n", kind: "integer", text: "number of trials, 0 ≤ n ≤ 10^6" }, { name: "p", kind: "vector", text: "category probabilities p_1 … p_k, each ≥ 0, with sum 1" }],
    check: (p) => [...(isInt(p.n) && inside(p.n, 0, 1e6) ? [] : [`n = ${show(p.n)} is not an integer in [0, 10^6].`]), ...checkWeights(p)],
    support: (p) => ({ lo: 0, hi: p.n }),
    dim: (p) => p.p.length,
    // The scalar functions describe component 1; marginal(p, j) gives component j.
    pmf: (k, p) => binomial.pmf(k, { n: p.n, p: p.p[0] }),
    cdf: (k, p) => binomial.cdf(k, { n: p.n, p: p.p[0] }),
    sf: (k, p) => binomial.sf(k, { n: p.n, p: p.p[0] }),
    moments: (p) => binomial.moments({ n: p.n, p: p.p[0] }),
    marginal: (p, j) => ({ law: "binomial", params: { n: p.n, p: p.p[j - 1] } }),
    reference: (p) => {
      const sampler = cached((q) => binomial.reference(q));
      return { label: "Conditional binomial draws, category by category, each by the binomial reference sampler", exactness: "exact", draw: (rng) => multinomialDraw(p, sampler, rng) };
    },
    inverse: (p, cut) => {
      const sampler = cached((q) => /** @type {Sampler} */ (binomial.inverse(q, cut))), label = "Conditional binomial draws, each by inversion from its mode";
      const draw = (/** @type {Rng} */ rng) => multinomialDraw(p, sampler, rng);
      if (cut === undefined) return { label, exactness: "exact", draw };
      return { label: `${label}, with the table of each conditional binomial cut at its ${cut} quantile`, exactness: "not exact: the tail is cut", draw };
    },
    rejection: () => ({ unavailable: "This piece has no rejection sampler for a vector law: a uniform proposal on all compositions of n has a very small acceptance probability." }),
  };

  /** The conditional binomial samplers of one multinomial sampler, set up once for each (n, p) and at most 4,096 at a time. @param {(q: Params) => Sampler} make @returns {(q: Params) => Sampler} */
  function cached(make) {
    /** @type {Map<string, Sampler>} */
    const memo = new Map();
    return (q) => {
      const key = `${q.n},${q.p}`;
      let s = memo.get(key);
      if (!s) {
        if (memo.size >= 4096) memo.clear();
        s = make(q);
        memo.set(key, s);
      }
      return s;
    };
  }

  /** @param {Params} p @param {(q: Params) => Sampler} sampler @param {Rng} rng */
  function multinomialDraw(p, sampler, rng) {
    const k = p.p.length, out = new Array(k).fill(0);
    let left = p.n, mass = 1;
    for (let j = 0; j < k - 1 && left > 0; j++) {
      const q = mass > 0 ? Math.min(1, Math.max(0, p.p[j] / mass)) : 0;
      const x = /** @type {number} */ (sampler({ n: left, p: q }).draw(rng));
      out[j] = x;
      left -= x;
      mass -= p.p[j];
    }
    out[k - 1] += left;
    return out;
  }

  /** @type {Law} */
  const uniform = {
    id: "uniform", name: "Discrete uniform",
    params: [{ name: "a", kind: "integer", text: "least value" }, { name: "b", kind: "integer", text: "greatest value, a ≤ b, with b − a < 2^32" }],
    check: (p) => (isInt(p.a) && isInt(p.b) && p.a <= p.b && p.b - p.a < 4294967296 && Math.abs(p.a) < 2 ** 52 && Math.abs(p.b) < 2 ** 52 ? [] : [`a = ${show(p.a)} and b = ${show(p.b)} are not integers with a ≤ b and b − a < 2^32.`]),
    support: (p) => ({ lo: p.a, hi: p.b }),
    pmf: (k, p) => (isInt(k) && k >= p.a && k <= p.b ? 1 / (p.b - p.a + 1) : 0),
    cdf: (k, p) => (k < p.a ? 0 : k >= p.b ? 1 : (Math.floor(k) - p.a + 1) / (p.b - p.a + 1)),
    sf: (k, p) => (k < p.a ? 1 : k >= p.b ? 0 : (p.b - Math.floor(k)) / (p.b - p.a + 1)),
    moments: (p) => { const m = p.b - p.a + 1; return { mean: (p.a + p.b) / 2, variance: (m * m - 1) / 12, order: Infinity }; },
    reference: (p) => ({ label: "Unbiased integer from 32 random bits, with rejection of the incomplete last range", exactness: "exact", draw: (rng) => p.a + rng.below(p.b - p.a + 1) }),
    inverse: (p, cut) => {
      const m = p.b - p.a + 1, top = cut === undefined ? Infinity : quantile(uniform, cut, p);
      return { label: `Inverse transform: X = a + ⌊U·(b − a + 1)⌋${cut === undefined ? "" : `, cut at the ${cut} quantile`}`, exactness: m <= 65536 ? "exact up to a bias below 2^-37 for each value" : `exact up to a bias below ${(m / 2 ** 53).toExponential(1)} for each value`, draw: (rng) => Math.min(top, p.a + Math.floor(rng.uniform() * m)) };
    },
    rejection: (p, f) => finiteRejection(uniform, p, f),
  };

  /** @type {Law} */
  const geometric = {
    id: "geometric", name: "Geometric",
    params: [{ name: "p", kind: "real", text: "success probability of each trial, 0 < p ≤ 1. X counts the failures before the first success" }],
    check: (p) => (inside(p.p, 1e-9, 1) ? [] : [`p = ${show(p.p)} is outside [10^-9, 1].`]),
    support: (p) => ({ lo: 0, hi: p.p === 1 ? 0 : Infinity }),
    pmf: (k, p) => (isInt(k) && k >= 0 ? p.p * Math.exp(k * Math.log1p(-p.p)) : 0),
    cdf: (k, p) => (k < 0 ? 0 : -Math.expm1((Math.floor(k) + 1) * Math.log1p(-p.p))),
    sf: (k, p) => (k < 0 ? 1 : Math.exp((Math.floor(k) + 1) * Math.log1p(-p.p))),
    moments: (p) => ({ mean: (1 - p.p) / p.p, variance: (1 - p.p) / (p.p * p.p), order: Infinity }),
    reference: (p) => {
      if (p.p === 1) return constant(0, "p = 1");
      if (p.p >= 0.01) return { label: "Count of failed Bernoulli trials before the first success (p ≥ 0.01)", exactness: "exact", draw: (rng) => { let k = 0; while (rng.uniform() >= p.p) k++; return k; } };
      return geometricClosed(p);
    },
    inverse: (p, cut) => {
      if (p.p === 1) return constant(0, "p = 1");
      if (cut !== undefined) { const top = quantile(geometric, cut, p), s = geometricClosed(p); return { label: `${s.label}, cut at the ${cut} quantile`, exactness: "not exact: the tail is cut", draw: (rng) => Math.min(top, /** @type {number} */ (s.draw(rng))) }; }
      return geometricClosed(p);
    },
    rejection: (p, f) => {
      if (p.p === 1) return { unavailable: "The law is a point mass at 0." };
      const q = p.p / 2;
      return rejection("Proposal: geometric with success probability p/2", (k) => geometric.pmf(k, p), (k) => geometric.pmf(k, { p: q }), (rng) => /** @type {number} */ (geometricClosed({ p: q }).draw(rng)), 2, f);
    },
  };

  /** @param {Params} p @returns {Sampler} */
  function geometricClosed(p) {
    const l = Math.log1p(-p.p);
    return { label: "Inverse transform in closed form: X = ⌊log U / log(1 − p)⌋", exactness: "exact", draw: (rng) => Math.floor(Math.log(rng.uniform()) / l) };
  }

  /** @type {Law} */
  const negbin = {
    id: "negbin", name: "Negative binomial",
    params: [{ name: "r", kind: "real", text: "number of successes, r > 0 (a real r gives the gamma–Poisson mixture)" }, { name: "p", kind: "real", text: "success probability of each trial, 0 < p ≤ 1. X counts the failures before success r" }],
    check: (p) => [...(inside(p.r, 1e-6, 1e6) ? [] : [`r = ${show(p.r)} is outside [10^-6, 10^6].`]), ...(inside(p.p, 1e-9, 1) ? [] : [`p = ${show(p.p)} is outside [10^-9, 1].`])],
    support: (p) => ({ lo: 0, hi: p.p === 1 ? 0 : Infinity }),
    pmf: (k, p) => (isInt(k) && k >= 0 ? (p.p === 1 ? +(k === 0) : Math.exp(S.lgamma(k + p.r) - S.lgamma(k + 1) - S.lgamma(p.r) + p.r * Math.log(p.p) + k * Math.log1p(-p.p))) : 0),
    cdf: (k, p) => (k < 0 ? 0 : p.p === 1 ? 1 : S.ibeta(p.p, p.r, Math.floor(k) + 1)),
    sf: (k, p) => (k < 0 ? 1 : p.p === 1 ? 0 : S.ibetac(p.p, p.r, Math.floor(k) + 1)),
    moments: (p) => ({ mean: (p.r * (1 - p.p)) / p.p, variance: (p.r * (1 - p.p)) / (p.p * p.p), order: Infinity }),
    reference: (p) => {
      if (p.p === 1) return constant(0, "p = 1");
      const scale = (1 - p.p) / p.p;
      return { label: "Gamma–Poisson mixture: Λ ~ Gamma(r, (1 − p)/p) by Marsaglia–Tsang, then X ~ Poisson(Λ)", exactness: "exact", draw: (rng) => poissonDraw(rng, gamma(rng, p.r) * scale) };
    },
    inverse: (p, cut) => {
      if (p.p === 1) return constant(0, "p = 1");
      const mode = p.r > 1 ? Math.floor(((p.r - 1) * (1 - p.p)) / p.p) : 0, q = 1 - p.p;
      const draw = modeInversion({ lo: 0, hi: Infinity, mode, pm: negbin.pmf(mode, p), Fm: negbin.cdf(mode, p), up: (k) => ((k + p.r) / (k + 1)) * q, down: (k) => k / ((k - 1 + p.r) * q) });
      return cutSampler("Inverse transform by sequential search from the mode", draw, cut === undefined ? undefined : quantile(negbin, cut, p), cut);
    },
    rejection: (p, f) => {
      if (p.p === 1) return { unavailable: "The law is a point mass at 0." };
      const mean = (p.r * (1 - p.p)) / p.p, q = p.r <= 1 ? p.p : 1 / (1 + mean);
      return geometricProposal(negbin, p, q, f);
    },
  };

  /** @type {Law} */
  const poisson = {
    id: "poisson", name: "Poisson",
    params: [{ name: "lambda", kind: "real", text: "rate, the mean count, 0 ≤ λ ≤ 10^6" }],
    check: (p) => (inside(p.lambda, 0, 1e6) ? [] : [`lambda = ${show(p.lambda)} is outside [0, 10^6].`]),
    support: (p) => ({ lo: 0, hi: p.lambda === 0 ? 0 : Infinity }),
    pmf: (k, p) => (isInt(k) && k >= 0 ? (p.lambda === 0 ? +(k === 0) : Math.exp(-p.lambda + k * Math.log(p.lambda) - S.lgamma(k + 1))) : 0),
    cdf: (k, p) => (k < 0 ? 0 : p.lambda === 0 ? 1 : S.gammaPQ(Math.floor(k) + 1, p.lambda).Q),
    sf: (k, p) => (k < 0 ? 1 : p.lambda === 0 ? 0 : S.gammaPQ(Math.floor(k) + 1, p.lambda).P),
    moments: (p) => ({ mean: p.lambda, variance: p.lambda, order: Infinity }),
    reference: (p) => (p.lambda === 0 ? constant(0, "λ = 0") : { label: p.lambda < 10 ? "Multiplication of uniforms until the product falls below e^{−λ} (λ < 10)" : "PTRS transformed rejection (Hörmann 1993) for λ ≥ 10", exactness: "exact", draw: (rng) => poissonDraw(rng, p.lambda) }),
    inverse: (p, cut) => {
      if (p.lambda === 0) return constant(0, "λ = 0");
      const mode = Math.floor(p.lambda);
      const draw = modeInversion({ lo: 0, hi: Infinity, mode, pm: poisson.pmf(mode, p), Fm: poisson.cdf(mode, p), up: (k) => p.lambda / (k + 1), down: (k) => k / p.lambda });
      return cutSampler("Inverse transform by sequential search from the mode", draw, cut === undefined ? undefined : quantile(poisson, cut, p), cut);
    },
    rejection: (p, f) => (p.lambda === 0 ? { unavailable: "The law is a point mass at 0." } : geometricProposal(poisson, p, 1 / (1 + p.lambda), f)),
  };

  /** @type {Law} */
  const hypergeometric = {
    id: "hypergeometric", name: "Hypergeometric",
    params: [{ name: "N", kind: "integer", text: "population size, 1 ≤ N ≤ 10^7" }, { name: "K", kind: "integer", text: "number of success items in the population, 0 ≤ K ≤ N" }, { name: "n", kind: "integer", text: "number of draws without replacement, 0 ≤ n ≤ N" }],
    check: (p) => (isInt(p.N) && isInt(p.K) && isInt(p.n) && p.N >= 1 && p.N <= 1e7 && p.K >= 0 && p.K <= p.N && p.n >= 0 && p.n <= p.N ? [] : [`N = ${show(p.N)}, K = ${show(p.K)} and n = ${show(p.n)} are not integers with 0 ≤ K ≤ N, 0 ≤ n ≤ N and N ≤ 10^7.`]),
    support: (p) => ({ lo: Math.max(0, p.n + p.K - p.N), hi: Math.min(p.n, p.K) }),
    pmf: (k, p) => {
      const s = hypergeometric.support(p);
      if (!isInt(k) || k < s.lo || k > s.hi) return 0;
      return Math.exp(S.lchoose(p.K, k) + S.lchoose(p.N - p.K, p.n - k) - S.lchoose(p.N, p.n));
    },
    cdf: (k, p) => { const s = hypergeometric.support(p); let F = 0; for (let j = s.lo; j <= Math.min(s.hi, Math.floor(k)); j++) F += hypergeometric.pmf(j, p); return Math.min(1, F); },
    sf: (k, p) => { const s = hypergeometric.support(p); let F = 0; for (let j = Math.max(s.lo, Math.floor(k) + 1); j <= s.hi; j++) F += hypergeometric.pmf(j, p); return Math.min(1, F); },
    moments: (p) => {
      const f = p.K / p.N;
      return { mean: p.n * f, variance: p.N > 1 ? (p.n * f * (1 - f) * (p.N - p.n)) / (p.N - 1) : 0, order: Infinity };
    },
    reference: (p) => {
      const s = hypergeometric.support(p);
      if (s.lo === s.hi) return constant(s.lo, "a one-point support");
      if (p.n <= 64) return { label: "Urn simulation: n draws without replacement (n ≤ 64)", exactness: "exact", draw: (rng) => { let k = 0, good = p.K, all = p.N; for (let i = 0; i < p.n; i++) { if (rng.below(all) < good) { k++; good--; } all--; } return k; } };
      return /** @type {Sampler} */ (hypergeometric.inverse(p));
    },
    inverse: (p, cut) => {
      const s = hypergeometric.support(p);
      if (s.lo === s.hi) return constant(s.lo, "a one-point support");
      const mode = Math.min(s.hi, Math.max(s.lo, Math.floor(((p.n + 1) * (p.K + 1)) / (p.N + 2))));
      const draw = modeInversion({ lo: s.lo, hi: s.hi, mode, pm: hypergeometric.pmf(mode, p), Fm: hypergeometric.cdf(mode, p),
        up: (k) => ((p.K - k) * (p.n - k)) / ((k + 1) * (p.N - p.K - p.n + k + 1)), down: (k) => (k * (p.N - p.K - p.n + k)) / ((p.K - k + 1) * (p.n - k + 1)) });
      return cutSampler("Inverse transform by sequential search from the mode", draw, cut === undefined ? undefined : quantile(hypergeometric, cut, p), cut);
    },
    rejection: (p, f) => finiteRejection(hypergeometric, p, f),
  };

  /** Zipf CDF tables, by s and N, so that each parameter set is summed once. @type {Map<string, Float64Array>} */
  const zipfTables = new Map();
  /** @param {Params} p */
  function zipfTable(p) {
    const key = `${p.s}/${p.N}`;
    let t = zipfTables.get(key);
    if (!t) {
      const w = new Float64Array(p.N);
      let total = 0;
      for (let k = p.N; k >= 1; k--) total += (w[k - 1] = Math.pow(k, -p.s));
      t = new Float64Array(p.N);
      let F = 0;
      for (let k = 1; k <= p.N; k++) { F += w[k - 1] / total; t[k - 1] = F; }
      if (zipfTables.size > 16) zipfTables.clear();
      zipfTables.set(key, t);
    }
    return t;
  }
  /** @param {Params} p */
  const zeta = (p) => p.N === Infinity;
  /** The normalising sum H(N, s), or zeta(s) for N = ∞, computed once for each parameter set. @type {Map<string, number>} */
  const norms = new Map();
  /** @param {Params} p */
  function norm(p) {
    const key = `${p.s}/${p.N}`;
    let h = norms.get(key);
    if (h === undefined) {
      h = zeta(p) ? S.zeta(p.s) : S.harmonic(p.N, p.s);
      if (norms.size > 64) norms.clear();
      norms.set(key, h);
    }
    return h;
  }

  /** @type {Law} */
  const zipf = {
    id: "zipf", name: "Zipf and zeta",
    params: [{ name: "s", kind: "real", text: "exponent: 0 ≤ s ≤ 20 for a finite N, 1 < s ≤ 20 for N = ∞ (the zeta law)" }, { name: "N", kind: "integer", text: "number of ranks, 1 ≤ N ≤ 2·10^5, or inf" }],
    check: (p) => {
      if (p.N === Infinity) return inside(p.s, 1 + 1e-9, 20) ? [] : [`With N = ∞ (the zeta law), s = ${show(p.s)} must be in (1, 20]: the sum of k^(−s) diverges for s ≤ 1.`];
      return [...(isInt(p.N) && inside(p.N, 1, 2e5) ? [] : [`N = ${show(p.N)} is not an integer in [1, 2·10^5] or inf.`]), ...(inside(p.s, 0, 20) ? [] : [`s = ${show(p.s)} is outside [0, 20].`])];
    },
    support: (p) => ({ lo: 1, hi: p.N }),
    pmf: (k, p) => (isInt(k) && k >= 1 && k <= p.N ? Math.pow(k, -p.s) / norm(p) : 0),
    cdf: (k, p) => (k < 1 ? 0 : k >= p.N ? 1 : zeta(p) ? 1 - S.hurwitz(p.s, Math.floor(k) + 1) / norm(p) : zipfTable(p)[Math.floor(k) - 1]),
    sf: (k, p) => {
      if (k < 1) return 1;
      if (k >= p.N) return 0;
      if (zeta(p)) return S.hurwitz(p.s, Math.floor(k) + 1) / norm(p);
      let F = 0;
      for (let j = p.N; j > Math.floor(k); j--) F += Math.pow(j, -p.s);
      return F / norm(p);
    },
    moments: (p) => {
      if (!zeta(p)) {
        const h = S.harmonic(p.N, p.s), m = S.harmonic(p.N, p.s - 1) / h;
        return { mean: m, variance: Math.max(0, S.harmonic(p.N, p.s - 2) / h - m * m), order: Infinity };
      }
      const z = S.zeta(p.s), m = p.s > 2 ? S.zeta(p.s - 1) / z : null;
      return { mean: m, variance: p.s > 3 && m !== null ? S.zeta(p.s - 2) / z - m * m : null, order: p.s - 1 };
    },
    reference: (p) => {
      if (zeta(p)) return devroye(p, 1);
      return { label: "Inverse transform with a CDF table and binary search", exactness: "exact", draw: (rng) => 1 + search(zipfTable(p), rng.uniform()) };
    },
    inverse: (p, cut) => {
      const top = cut === undefined ? Infinity : quantile(zipf, cut, p);
      if (!zeta(p)) {
        const t = zipfTable(p);
        return cutSampler("Inverse transform by sequential search up from rank 1", (rng) => { const u = rng.uniform(); let k = 0; while (k < t.length - 1 && t[k] < u) k++; return k + 1; }, cut === undefined ? undefined : top, cut);
      }
      const K = 4096, z = S.zeta(p.s), head = table((k) => Math.pow(k, -p.s) / z, 1, K);
      return cutSampler(`Inverse transform: a CDF table to rank ${K}, then bisection on the survival function ζ(s, k + 1)/ζ(s)`, (rng) => {
        const u = rng.uniform();
        if (u <= head[K - 1]) return 1 + search(head, u);
        return firstTrue((k) => S.hurwitz(p.s, k + 1) / z <= 1 - u, K + 1, 9007199254740991);
      }, cut === undefined ? undefined : top, cut);
    },
    rejection: (p, f) => (zeta(p) ? devroye(p, f) : finiteRejection(zipf, p, f)),
  };

  /**
   * The zeta law by rejection from the continuous Pareto proposal X = ⌊U^(−1/(s−1))⌋ (Devroye 1986, chapter X).
   * The acceptance probability is above 1/2 for every s > 1.
   * @param {Params} p @param {number} factor @returns {Sampler}
   */
  function devroye(p, factor) {
    const b = Math.pow(2, p.s - 1), cap = 9007199254740991;
    return {
      label: `Rejection from a Pareto proposal (Devroye 1986, chapter X)${factor === 1 ? "" : `, envelope multiplied by ${factor}`}`,
      exactness: factor === 1 ? "exact up to a cap at 2^53 − 1" : "not exact: the envelope is too small",
      draw(rng, stats) {
        for (;;) {
          const U = rng.uniform(), V = rng.uniform();
          const X = Math.min(cap, Math.floor(Math.pow(U, -1 / (p.s - 1))));
          const T = Math.pow(1 + 1 / X, p.s - 1);
          const ratio = (T * (b - 1)) / (b * X * (T - 1)) / factor;
          if (stats) {
            stats.proposals++;
            if (ratio > 1 + 1e-12) stats.violations++;
          }
          if (V <= ratio) {
            if (stats) stats.accepts++;
            return X;
          }
        }
      },
    };
  }

  /** @param {string} label @param {(rng: Rng) => number} draw @param {number | undefined} top @param {number | undefined} cut @returns {Sampler} */
  function cutSampler(label, draw, top, cut) {
    if (top === undefined) return { label, exactness: "exact", draw };
    return { label: `${label}, with the table cut at the ${cut} quantile ${top}`, exactness: "not exact: the tail is cut", draw: (rng) => Math.min(top, draw(rng)) };
  }

  /** Inversion with a CDF table over a finite support of at most 65,536 points. @param {Law} law @param {Params} p @param {number} [cut] @returns {Sampler | NoSampler} */
  function tableInverse(law, p, cut) {
    const s = law.support(p);
    if (s.hi - s.lo + 1 > TABLE_MAX) return { unavailable: `The support has more than ${TABLE_MAX} points.` };
    const t = table((k) => law.pmf(k, p), s.lo, s.hi);
    return cutSampler("Inverse transform with a CDF table and binary search", (rng) => s.lo + search(t, rng.uniform()), cut === undefined ? undefined : quantile(law, cut, p), cut);
  }

  /** Rejection from the uniform law on a finite support, with M = |support| · max p. @param {Law} law @param {Params} p @param {number} factor @returns {Sampler | NoSampler} */
  function finiteRejection(law, p, factor) {
    const s = law.support(p), m = s.hi - s.lo + 1;
    if (m > TABLE_MAX) return { unavailable: `The support has more than ${TABLE_MAX} points, so the page does not tabulate the envelope.` };
    const pm = new Float64Array(m);
    let pmax = 0;
    for (let k = s.lo; k <= s.hi; k++) pmax = Math.max(pmax, (pm[k - s.lo] = law.pmf(k, p)));
    return rejection("Proposal: the uniform law on the support", (k) => pm[k - s.lo], () => 1 / m, (rng) => s.lo + rng.below(m), m * pmax, factor);
  }

  /**
   * Rejection from a geometric proposal with success probability q on 0, 1, 2, …: the ratio p(k)/q(k) is unimodal
   * for the Poisson and negative binomial laws with the q the page picks, so its maximum is at the first k where
   * it stops increasing.
   * @param {Law} law @param {Params} p @param {number} q @param {number} factor @returns {Sampler | NoSampler}
   */
  function geometricProposal(law, p, q, factor) {
    const g = (/** @type {number} */ k) => geometric.pmf(k, { p: q });
    let k = 0, best = law.pmf(0, p) / g(0);
    for (;;) {
      const next = law.pmf(k + 1, p) / g(k + 1);
      if (!(next >= best) || k > 1e7) break;
      best = next;
      k++;
    }
    return rejection(`Proposal: geometric with success probability ${q.toPrecision(4)}`, (x) => law.pmf(x, p), g, (rng) => /** @type {number} */ (geometricClosed({ p: q }).draw(rng)), best, factor);
  }

  const LAWS = [bernoulli, binomial, categorical, multinomial, uniform, geometric, negbin, poisson, hypergeometric, zipf];
  /** @type {Record<string, Law>} */
  const BY_ID = Object.fromEntries(LAWS.map((l) => [l.id, l]));

  return { LAWS, BY_ID, quantile: (/** @type {string} */ id, /** @type {number} */ u, /** @type {Params} */ p) => quantile(BY_ID[id], u, p), poissonDraw, gamma, alias };
});
