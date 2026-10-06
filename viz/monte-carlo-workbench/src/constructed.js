/* Monte Carlo Probability Workbench: the constructed laws of group 4. Five laws build a law from other laws or from
 * data:
 *
 *   mixture_F(w, …)       a finite mixture of laws of the family F, with weights w and a vector for each parameter
 *   compound_F(freq, …)   S = Y_1 + … + Y_N with N ~ Poisson(freq) and Y_i i.i.d. from F
 *   truncated_F(…, lower, upper)   the law F conditioned on lower ≤ X ≤ upper
 *   empirical(x, w)       the discrete law with mass w_i / Σw at the observed value x_i
 *   kde(x, w, h)          the kernel density model: x_J + hZ, with J drawn with weights w and Z standard normal
 *
 * F is any law of the catalogue, a custom law of the model (custom.js), or another constructed law, so the names
 * compose: truncated_mixture_geometric is a truncated mixture of geometric laws. resolve() builds a law from its
 * name. Each law has the interface of the other groups: its parameters and checks, support, PMF or PDF, CDF,
 * survival function, quantile function, moments with the order below which they exist, and its three samplers
 * (or the reason that one has none). Tests load this file with require().
 */
/** @param {any} root the global object @param {(S: any, L: any, Cu: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCSpecial ?? require("./special.js"), root.MCLaws ?? require("./laws.js"), root.MCCustom ?? require("./custom.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCConstructed = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./laws.js")} */ L, /** @type {typeof import("./custom.js")} */ Cu) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {{ label: string, exactness: string, draw(rng: Rng, stats?: any): number, acceptance?: number, envelope?: number, sampling?: string }} Sampler */
  /** @typedef {{ unavailable: string }} NoSampler */
  /** @typedef {Record<string, any>} Params */

  const MAX_COMPONENTS = 20, MAX_FREQ = 1000, MAX_DATA = 5000, PANJER = 4096, TABLE_MAX = 65536;
  const CATALOGUE = ["mixture", "compound", "empirical", "kde", "truncated"];

  /** @param {unknown} x */
  const show = (x) => (typeof x === "number" ? (x === Infinity ? "∞" : x === -Infinity ? "−∞" : String(+x.toPrecision(6))) : "a vector");
  /** @param {unknown} x @returns {x is number[]} */
  const isVec = (x) => Array.isArray(x);
  /** @param {string} label @returns {NoSampler} */
  const none = (label) => ({ unavailable: label });
  /** "exact" when a sampler of a base law is exact, else "approximate". @param {Sampler | NoSampler} s */
  const grade = (s) => ("unavailable" in s ? "unavailable" : s.sampling ?? (/^exact/.test(s.exactness) ? "exact" : "approximate"));

  /* ---------- what every law offers, whatever its group ---------- */

  /**
   * A uniform view of a law: whether it is integer-valued, its point mass, density, CDF and P(X < x), and its
   * quantile function. A law of the discrete group has no quantile of its own; MCLaws gives it.
   * @param {any} b
   */
  function view(b) {
    const integer = !b.continuous && b.integer !== false;
    return {
      integer, continuous: !!b.continuous,
      mass: (/** @type {number} */ x, /** @type {Params} */ p) => (b.continuous ? (b.mixed && x === 0 ? b.cdf(0, p) : 0) : b.pmf(x, p)),
      density: (/** @type {number} */ x, /** @type {Params} */ p) => (b.pdf ? b.pdf(x, p) : NaN),
      cdf: (/** @type {number} */ x, /** @type {Params} */ p) => b.cdf(x, p),
      sf: (/** @type {number} */ x, /** @type {Params} */ p) => b.sf(x, p),
      below: (/** @type {number} */ x, /** @type {Params} */ p) => b.cdf(x, p) - (b.continuous ? (b.mixed && x === 0 ? b.cdf(0, p) : 0) : b.pmf(x, p)),
      quantile: (/** @type {number} */ u, /** @type {Params} */ p) => L.quantile(b, u, p),
      isf: (/** @type {number} */ v, /** @type {Params} */ p) => (b.isf ? b.isf(v, p) : L.quantile(b, 1 - v, p)),
    };
  }

  /** The error of a family of finitely many values (an empirical law, a table) whose values are not integers. @param {any} b @param {Params} q */
  const integerValues = (b, q) => (b.isInteger && !b.isInteger(q) ? [`The values of the ${b.name} law are not all integers. A constructed law takes a law of finitely many values only when its values are integers.`] : []);

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

  /**
   * The quantile of a law from its CDF: the first integer k with F(k) ≥ u for an integer law (with the survival
   * function above one half), else Newton steps and bisection on F (S.solveQuantile).
   * @param {{ integer: boolean, cdf(x: number): number, sf(x: number): number, pdf(x: number): number, lo: number, hi: number, guess: number }} f @param {number} u
   */
  function quantileOf(f, u) {
    if (u <= 0) return f.lo;
    if (u >= 1) return f.hi;
    if (f.integer) return firstTrue(u <= 0.5 ? (k) => f.cdf(k) >= u : (k) => f.sf(k) <= 1 - u, f.lo, Math.min(f.hi, 9007199254740991));
    return S.solveQuantile(u, f);
  }

  /**
   * A table of a continuous CDF on n + 1 points of [lo, hi], and the bracket of the quantile u in it: the cell with
   * F(x_j) ≤ u ≤ F(x_{j+1}), so Newton steps start inside one cell. Outside the table the bracket is open.
   * @param {(x: number) => number} cdf @param {number} lo @param {number} hi @param {number} n
   */
  function cdfTable(cdf, lo, hi, n) {
    const xs = new Float64Array(n + 1), Fs = new Float64Array(n + 1);
    for (let j = 0; j <= n; j++) { xs[j] = lo + ((hi - lo) * j) / n; Fs[j] = cdf(xs[j]); }
    return {
      xs, Fs,
      /** @param {number} u @param {number} sLo @param {number} sHi */
      bracket(u, sLo, sHi) {
        const j = Cu.search(Fs, u);
        if (j === 0) return { lo: sLo, hi: xs[0], guess: xs[0] };
        if (Fs[j] < u) return { lo: xs[n], hi: sHi, guess: xs[n] };
        const d = Fs[j] - Fs[j - 1];
        return { lo: xs[j - 1], hi: xs[j], guess: xs[j - 1] + (xs[j] - xs[j - 1]) * (d > 0 ? (u - Fs[j - 1]) / d : 0.5) };
      },
    };
  }

  /** The order and side of the moments of several laws together: the least order, and the union of the heavy sides. @param {any[]} ms */
  function joinTails(ms) {
    let order = Infinity, left = false, right = false, unknown = false;
    for (const m of ms) {
      if (m.order === null || m.order === undefined || Number.isNaN(m.order)) unknown = true;
      else order = Math.min(order, m.order);
      if (m.side === "left" || m.side === "both") left = true;
      if (m.side === "right" || m.side === "both") right = true;
    }
    return { order: unknown ? null : order, side: /** @type {"" | "left" | "right" | "both"} */ (left && right ? "both" : left ? "left" : right ? "right" : "") };
  }

  /* ---------- the finite mixture ---------- */

  /**
   * mixture_F(w, a, b, …): with probability w_j, X comes from F with parameters a_j, b_j, …. Each parameter of F is a
   * vector with one entry for each component, or one number that every component shares.
   * @param {any} b the family F @returns {any}
   */
  function mixture(b) {
    if (b.dim || b.params.some((/** @type {any} */ ps) => ps.kind === "vector")) return null;
    if (b.params.some((/** @type {any} */ ps) => ps.name === "w")) return null;
    const v = view(b);
    const params = [{ name: "w", kind: "vector", text: "component weights w_1 … w_k, each ≥ 0, with sum 1 (normalize() scales weights)" },
      ...b.params.map((/** @type {any} */ ps) => ({ name: ps.name, kind: "vector", text: `${ps.text}: one entry for each component, or one number for all` }))];
    /** The parameters of component j. @param {Params} p @param {number} j */
    const comp = (p, j) => Object.fromEntries(b.params.map((/** @type {any} */ ps) => [ps.name, isVec(p[ps.name]) ? p[ps.name][j] : p[ps.name]]));
    /** @param {Params} p */
    const comps = (p) => p.w.map((/** @type {number} */ _, /** @type {number} */ j) => comp(p, j));
    /** @param {Params} p */
    const live = (p) => p.w.map((/** @type {number} */ w, /** @type {number} */ j) => (w > 0 ? j : -1)).filter((/** @type {number} */ j) => j >= 0);
    /** @param {Params} p */
    function check(p) {
      const w = p.w;
      if (!isVec(w) || w.length < 1 || w.length > MAX_COMPONENTS) return [`w is a vector of 1 to ${MAX_COMPONENTS} weights, such as [0.7, 0.3].`];
      if (w.some((x) => !(x >= 0))) return ["Each weight w_j is 0 or more."];
      const s = w.reduce((a, c) => a + c, 0);
      if (Math.abs(s - 1) > 1e-9) return [`The weights add to ${show(s)}, not 1. Use normalize() to scale weights.`];
      /** @type {string[]} */
      const out = [];
      for (const ps of b.params) if (isVec(p[ps.name]) && p[ps.name].length !== w.length) out.push(`${ps.name} has ${p[ps.name].length} entries, and w has ${w.length}.`);
      if (out.length) return out;
      live(p).forEach((/** @type {number} */ j) => { for (const e of [...b.check(comp(p, j)), ...integerValues(b, comp(p, j))]) out.push(`Component ${j + 1}: ${e}`); });
      return out;
    }
    /** @param {Params} p */
    function support(p) {
      let lo = Infinity, hi = -Infinity;
      for (const j of live(p)) { const s = b.support(comp(p, j)); lo = Math.min(lo, s.lo); hi = Math.max(hi, s.hi); }
      return { lo, hi };
    }
    /** @param {Params} p @param {(x: number, q: Params) => number} f @param {number} x */
    const sum = (p, f, x) => { let t = 0; for (const j of live(p)) t += p.w[j] * f(x, comp(p, j)); return t; };
    const law = {
      id: `mixture_${b.id}`, name: `Mixture of ${b.name} laws`, catalogue: "mixture", base: b, generic: true, continuous: !!b.continuous, mixed: !!b.mixed, integer: v.integer ? undefined : false,
      numeric: !!b.numeric, custom: !!b.custom, constantArgs: !!b.constantArgs, params, check, support,
      supportText: (/** @type {Params} */ p) => { const s = support(p); return b.continuous ? `${s.lo === -Infinity ? "(−∞" : `[${show(s.lo)}`}, ${s.hi === Infinity ? "∞)" : `${show(s.hi)}]`}` : s.hi === Infinity ? `{${s.lo}, ${s.lo + 1}, …}` : `{${s.lo}, …, ${s.hi}}`; },
      pmf: (/** @type {number} */ x, /** @type {Params} */ p) => (b.continuous ? 0 : sum(p, v.mass, x)),
      pdf: b.continuous ? (/** @type {number} */ x, /** @type {Params} */ p) => sum(p, v.density, x) : undefined,
      cdf: (/** @type {number} */ x, /** @type {Params} */ p) => Math.min(1, sum(p, v.cdf, x)),
      sf: (/** @type {number} */ x, /** @type {Params} */ p) => Math.min(1, sum(p, v.sf, x)),
      quantile: (/** @type {number} */ u, /** @type {Params} */ p) => quantileOf(fn(p, u), u),
      isf: (/** @type {number} */ q, /** @type {Params} */ p) => (v.integer ? quantileOf(fn(p, 1 - q), 1 - q) : S.solveSurvival(q, fn(p, 1 - q))),
      moments: (/** @type {Params} */ p) => {
        const ms = live(p).map((/** @type {number} */ j) => ({ w: p.w[j], m: b.moments(comp(p, j)) }));
        const t = joinTails(ms.map((/** @type {any} */ x) => x.m));
        const mean = ms.some((/** @type {any} */ x) => x.m.mean === null) ? null : ms.reduce((/** @type {number} */ a, /** @type {any} */ x) => a + x.w * x.m.mean, 0);
        const second = mean === null || ms.some((/** @type {any} */ x) => x.m.variance === null) ? null : ms.reduce((/** @type {number} */ a, /** @type {any} */ x) => a + x.w * (x.m.variance + x.m.mean * x.m.mean), 0);
        return { mean, variance: second === null || mean === null ? null : Math.max(0, second - mean * mean), ...t };
      },
      reference: (/** @type {Params} */ p) => {
        const parts = comps(p).map((/** @type {Params} */ q, /** @type {number} */ j) => (p.w[j] > 0 ? b.reference(q) : null));
        const bad = parts.find((/** @type {any} */ s) => s && "unavailable" in s);
        if (bad) return none(`A component has no reference sampler: ${bad.unavailable}`);
        const { prob, al } = L.alias(p.w), exact = parts.every((/** @type {any} */ s) => !s || grade(s) === "exact");
        return { label: `Composition: the alias method picks component J with probability w_J, then ${parts.find(Boolean).label.replace(/^./, (/** @type {string} */ c) => c.toLowerCase())} for that component`,
          exactness: exact ? "exact" : "approximate: a component sampler is approximate", sampling: exact ? "exact" : "approximate",
          draw: (/** @type {Rng} */ rng) => { const i = rng.below(prob.length), j = rng.uniform() < prob[i] ? i : al[i]; return /** @type {number} */ (parts[j].draw(rng)); } };
      },
      inverse: (/** @type {Params} */ p, /** @type {number | undefined} */ cut) => {
        const q = (/** @type {number} */ u) => law.quantile(u, p);
        const label = v.integer ? "Inverse transform: the first k with F(k) ≥ U, by doubling and bisection on the mixture CDF" : "Inverse transform: Newton steps and bisection on the mixture CDF";
        const exactness = v.integer ? "exact" : "exact up to the error of a numerical quantile: Newton steps on the CDF to about 15 significant digits";
        if (cut === undefined) return { label, exactness, draw: (/** @type {Rng} */ rng) => q(rng.uniform()) };
        const top = q(cut);
        return { label: `${label}, capped at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", draw: (/** @type {Rng} */ rng) => Math.min(top, q(rng.uniform())) };
      },
      rejection: (/** @type {Params} */ p, /** @type {number} */ factor) => {
        // Proposal: the equal-weight mixture of the same components. p(x)/q(x) = Σ w_j f_j / ((1/k) Σ f_j) ≤ k·max w_j.
        if (b.continuous && !b.pdf) return none("The components have no density in closed form, so the page has no envelope.");
        const k = p.w.length, M = k * Math.max(...p.w), Mf = M * factor, f = b.continuous ? v.density : v.mass;
        const parts = comps(p).map((/** @type {Params} */ q) => b.reference(q));
        if (parts.some((/** @type {any} */ s) => "unavailable" in s)) return none("A component has no reference sampler.");
        const exact = parts.every((/** @type {any} */ s) => grade(s) === "exact");
        return {
          label: `Proposal: the equal-weight mixture of the same ${k} components, envelope constant M = k · max w_j = ${show(M)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
          exactness: factor !== 1 ? "not exact: the envelope is too small" : exact ? "exact" : "approximate: a component sampler is approximate", acceptance: 1 / M, envelope: Mf,
          /** @param {Rng} rng @param {any} [stats] */
          draw(rng, stats) {
            for (;;) {
              const x = /** @type {number} */ (parts[rng.below(k)].draw(rng));
              let num = 0, den = 0;
              for (let j = 0; j < k; j++) { const d = f(x, comp(p, j)); num += p.w[j] * d; den += d / k; }
              const ratio = num / (Mf * den);
              if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
              if (rng.uniform() <= ratio) { if (stats) stats.accepts++; return x; }
            }
          },
        };
      },
    };
    /** The quantile problem of the mixture: bracketed by the least and the greatest component quantile. @param {Params} p @param {number} u */
    function fn(p, u) {
      const qs = live(p).map((/** @type {number} */ j) => v.quantile(Math.min(Math.max(u, 1e-300), 1 - 1e-16), comp(p, j))).filter(Number.isFinite);
      const s = support(p);
      return { integer: v.integer, cdf: (/** @type {number} */ x) => law.cdf(x, p), sf: (/** @type {number} */ x) => law.sf(x, p), pdf: (/** @type {number} */ x) => (b.pdf ? law.pdf?.(x, p) ?? NaN : NaN),
        lo: v.integer ? s.lo : qs.length ? Math.max(s.lo, Math.min(...qs) - 1e-9 * (1 + Math.abs(Math.min(...qs)))) : s.lo,
        hi: v.integer ? s.hi : qs.length ? Math.min(s.hi, Math.max(...qs) + 1e-9 * (1 + Math.abs(Math.max(...qs)))) : s.hi, guess: qs.length ? qs.reduce((/** @type {number} */ a, /** @type {number} */ c) => a + c, 0) / qs.length : 0 };
    }
    return law;
  }

  /* ---------- the truncated law ---------- */

  /**
   * truncated_F(…, lower, upper): X ~ F conditioned on lower ≤ X ≤ upper, with Z = P(lower ≤ X ≤ upper) > 0. The page
   * computes Z from the CDF below the median and from the survival function above it, for precision in a tail.
   * @param {any} b @returns {any}
   */
  function truncated(b) {
    if (b.dim || b.params.some((/** @type {any} */ ps) => ps.name === "lower" || ps.name === "upper")) return null;
    const v = view(b);
    const params = [...b.params, { name: "lower", kind: "real", text: "least kept value (−inf for none)" }, { name: "upper", kind: "real", text: "greatest kept value (inf for none)" }];
    /** @param {Params} p */
    const base = (p) => Object.fromEntries(b.params.map((/** @type {any} */ ps) => [ps.name, p[ps.name]]));
    /** The masses of the last parameter objects: the engine passes one object for many calls. @type {WeakMap<object, any>} */
    const seen = new WeakMap();
    /** @param {Params} p */
    function mass(p) {
      let m = seen.get(p);
      if (!m) { m = massOf(p); seen.set(p, m); }
      return m;
    }
    /** P(X ≥ lower) and P(X > upper) under F, and the mass Z between, by the side that keeps precision. @param {Params} p */
    function massOf(p) {
      const q = base(p);
      // An infinite end cuts nothing: the law's own functions need not take ±∞.
      const aboveLo = p.lower === -Infinity ? 1 : v.sf(p.lower, q) + v.mass(p.lower, q), aboveHi = p.upper === Infinity ? 0 : v.sf(p.upper, q);
      const belowLo = p.lower === -Infinity ? 0 : v.below(p.lower, q), belowHi = p.upper === Infinity ? 1 : v.cdf(p.upper, q);
      const upperSide = belowLo > 0.5;
      return { q, Z: upperSide ? aboveLo - aboveHi : belowHi - belowLo, upperSide, aboveLo, aboveHi, belowLo };
    }
    /** @param {Params} p */
    function check(p) {
      const errs = [...b.check(base(p)), ...integerValues(b, base(p))];
      if (errs.length) return errs;
      if (typeof p.lower !== "number" || typeof p.upper !== "number" || Number.isNaN(p.lower) || Number.isNaN(p.upper) || !(p.lower <= p.upper)) return [`lower = ${show(p.lower)} and upper = ${show(p.upper)} are not numbers with lower ≤ upper.`];
      const m = mass(p);
      if (!(m.Z > 1e-300)) return [`P(${show(p.lower)} ≤ X ≤ ${show(p.upper)}) = ${show(m.Z)} under the ${b.name} law, so there is nothing to keep.`];
      return [];
    }
    /** @param {Params} p */
    function support(p) {
      const s = b.support(base(p));
      return v.integer ? { lo: Math.max(s.lo, Math.ceil(p.lower)), hi: Math.min(s.hi, Math.floor(p.upper)) } : { lo: Math.max(s.lo, p.lower), hi: Math.min(s.hi, p.upper) };
    }
    /** P(lower ≤ X ≤ x) / Z. @param {number} x @param {Params} p */
    const cdf = (x, p) => {
      if (x < p.lower) return 0;
      if (x >= p.upper) return 1;
      const m = mass(p);
      return Math.min(1, Math.max(0, (m.upperSide ? m.aboveLo - v.sf(x, m.q) : v.cdf(x, m.q) - m.belowLo) / m.Z));
    };
    /** @param {number} x @param {Params} p */
    const sf = (x, p) => {
      if (x < p.lower) return 1;
      if (x >= p.upper) return 0;
      const m = mass(p);
      return Math.min(1, Math.max(0, (m.upperSide ? v.sf(x, m.q) - m.aboveHi : m.Z - (v.cdf(x, m.q) - m.belowLo)) / m.Z));
    };
    /** The CDF table of a truncated continuous law, once for each parameter object. @type {WeakMap<object, any>} */
    const tables = new WeakMap();
    /** @param {Params} p */
    const tableOf = (p) => {
      let t = tables.get(p);
      if (!t) {
        const s = support(p), q = base(p), m = mass(p);
        const a = Number.isFinite(s.lo) ? s.lo : v.quantile(Math.min(1, m.belowLo + 1e-9 * m.Z), q), b2 = Number.isFinite(s.hi) ? s.hi : v.isf(Math.max(1e-300, m.aboveHi + 1e-9 * m.Z), q);
        t = Number.isFinite(a) && Number.isFinite(b2) && b2 > a ? cdfTable((x) => cdf(x, p), a, b2, 1024) : null;
        tables.set(p, t);
      }
      return t;
    };
    /** @param {Params} p @param {number} u */
    const problem = (p, u) => {
      const s = support(p), q = base(p), m = mass(p);
      if (!v.integer) {
        const t = tableOf(p);
        if (t) { const br = t.bracket(u, s.lo, s.hi); return { integer: false, cdf: (/** @type {number} */ x) => cdf(x, p), sf: (/** @type {number} */ x) => sf(x, p), pdf: (/** @type {number} */ x) => (b.pdf && x >= p.lower && x <= p.upper ? b.pdf(x, q) / m.Z : NaN), ...br }; }
      }
      // A guess from the quantile of F at the matching level.
      let guess = NaN;
      try { guess = m.upperSide ? v.isf(Math.max(1e-300, m.aboveLo - u * m.Z), q) : v.quantile(Math.min(1, m.belowLo + u * m.Z), q); } catch { guess = NaN; }
      return { integer: v.integer, cdf: (/** @type {number} */ x) => cdf(x, p), sf: (/** @type {number} */ x) => sf(x, p), pdf: (/** @type {number} */ x) => (b.pdf && x >= p.lower && x <= p.upper ? b.pdf(x, q) / m.Z : NaN), lo: s.lo, hi: s.hi, guess };
    };
    const law = {
      id: `truncated_${b.id}`, name: `Truncated ${b.name.replace(/^[A-Z](?![A-Z])/, (/** @type {string} */ c) => c.toLowerCase())} law`, catalogue: "truncated", base: b, generic: true, continuous: !!b.continuous, mixed: !!b.mixed, integer: v.integer ? undefined : false,
      numeric: true, custom: !!b.custom, constantArgs: !!b.constantArgs, params, check, support,
      supportText: (/** @type {Params} */ p) => { const s = support(p); return b.continuous ? `${s.lo === -Infinity ? "(−∞" : `[${show(s.lo)}`}, ${s.hi === Infinity ? "∞)" : `${show(s.hi)}]`}` : s.hi === Infinity ? `{${s.lo}, ${s.lo + 1}, …}` : `{${s.lo}, …, ${s.hi}}`; },
      pmf: (/** @type {number} */ x, /** @type {Params} */ p) => (b.continuous || x < p.lower || x > p.upper ? 0 : v.mass(x, base(p)) / mass(p).Z),
      pdf: b.continuous ? (/** @type {number} */ x, /** @type {Params} */ p) => (x < p.lower || x > p.upper ? 0 : v.density(x, base(p)) / mass(p).Z) : undefined,
      cdf, sf,
      quantile: (/** @type {number} */ u, /** @type {Params} */ p) => quantileOf(problem(p, u), u),
      isf: (/** @type {number} */ q, /** @type {Params} */ p) => (v.integer ? quantileOf(problem(p, 1 - q), 1 - q) : S.solveSurvival(q, problem(p, 1 - q))),
      moments: (/** @type {Params} */ p) => truncatedMoments(b, v, p, support(p), law),
      // The reference sampler: draws of F kept inside [lower, upper] when that keeps at least a quarter of them and
      // F's sampler is exact; the inverse transform otherwise.
      reference: (/** @type {Params} */ p) => {
        const r = mass(p).Z >= 0.25 ? law.rejection(p, 1) : null;
        return r && !("unavailable" in r) && r.exactness === "exact" ? r : law.inverse(p, undefined);
      },
      inverse: (/** @type {Params} */ p, /** @type {number | undefined} */ cut) => {
        const q = (/** @type {number} */ u) => law.quantile(u, p);
        const label = v.integer ? "Inverse transform of the truncated CDF: the first k with F_t(k) ≥ U, by doubling and bisection" : "Inverse transform of the truncated CDF by Newton steps and bisection";
        const exactness = v.integer ? "exact" : "exact up to the error of a numerical quantile: Newton steps on the CDF to about 15 significant digits";
        if (cut === undefined) return { label, exactness, draw: (/** @type {Rng} */ rng) => q(rng.uniform()) };
        const top = q(cut);
        return { label: `${label}, capped at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", draw: (/** @type {Rng} */ rng) => Math.min(top, q(rng.uniform())) };
      },
      rejection: (/** @type {Params} */ p, /** @type {number} */ factor) => {
        // Draw from F until the value lies in [lower, upper]: the envelope is F itself with M = 1/Z, and the ratio is 1 inside.
        const Z = mass(p).Z, s = b.reference(base(p));
        if ("unavailable" in s) return s;
        if (Z < 1e-3) return none(`The acceptance probability Z = P(lower ≤ X ≤ upper) = ${show(Z)} is below 0.001, so the method costs too much here.`);
        return {
          label: `Proposal: the ${b.name} law itself (${s.label.replace(/^./, (/** @type {string} */ c) => c.toLowerCase())}); keep a draw in [${show(p.lower)}, ${show(p.upper)}]${factor === 1 ? "" : ". The envelope factor does not change this sampler: inside the interval the ratio is 1"}`,
          exactness: grade(s) === "exact" ? "exact" : "approximate: the base sampler is approximate", acceptance: Z, envelope: 1 / Z,
          /** @param {Rng} rng @param {any} [stats] */
          draw(rng, stats) {
            for (;;) {
              const x = /** @type {number} */ (s.draw(rng));
              if (stats) stats.proposals++;
              if (x >= p.lower && x <= p.upper) { if (stats) stats.accepts++; return x; }
            }
          },
        };
      },
    };
    return law;
  }

  /**
   * The moments of a truncated law: by summation over a finite integer support, by Simpson's rule on the CDF over a
   * bounded interval, and from the base law's moments less the cut part otherwise. A bounded interval keeps every
   * moment; an unbounded side keeps the order and the side of the base law there.
   * @param {any} b @param {any} v @param {Params} p @param {{ lo: number, hi: number }} s @param {any} law
   */
  function truncatedMoments(b, v, p, s, law) {
    const q = Object.fromEntries(b.params.map((/** @type {any} */ ps) => [ps.name, p[ps.name]]));
    const bm = b.moments(q), bs = b.support(q);
    // No end cuts the support: the law is F itself.
    if (p.lower <= bs.lo && p.upper >= bs.hi) return { ...bm, side: bm.side ?? "" };
    const bounded = s.lo > -Infinity && s.hi < Infinity;
    const side = /** @type {"" | "left" | "right" | "both"} */ (bounded ? "" : bm.side === "both" ? (s.lo > -Infinity ? "right" : s.hi < Infinity ? "left" : "both") : bm.side === "right" && s.hi < Infinity ? "" : bm.side === "left" && s.lo > -Infinity ? "" : bm.side ?? "");
    const order = bounded || side === "" ? (bm.order === null ? (bounded ? Infinity : null) : side === "" && !bounded && bm.side ? Infinity : bounded ? Infinity : bm.order) : bm.order;
    /** E[X] and E[X²] by Simpson's rule on the survival function over [lo, hi]. */
    const simpson = () => {
      const n = 2048, dx = (s.hi - s.lo) / n;
      let a = 0, c = 0;
      for (let j = 0; j < n; j++) {
        const x0 = s.lo + j * dx, xm = x0 + dx / 2, x1 = x0 + dx;
        const S0 = law.sf(x0, p), Sm = law.sf(xm, p), S1 = law.sf(x1, p);
        a += (dx / 6) * (S0 + 4 * Sm + S1);
        c += (dx / 6) * (2 * (x0 - s.lo) * S0 + 8 * (xm - s.lo) * Sm + 2 * (x1 - s.lo) * S1);
      }
      const m1 = s.lo + a, m2 = c + 2 * s.lo * m1 - s.lo * s.lo;
      return { mean: m1, variance: Math.max(0, m2 - m1 * m1) };
    };
    if (v.integer && bounded && s.hi - s.lo < TABLE_MAX) {
      let m1 = 0, m2 = 0;
      for (let k = s.lo; k <= s.hi; k++) { const w = law.pmf(k, p); m1 += w * k; m2 += w * k * k; }
      return { mean: m1, variance: Math.max(0, m2 - m1 * m1), order: Infinity, side: /** @type {""} */ ("") };
    }
    if (bounded && !v.integer) return { ...simpson(), order: Infinity, side: /** @type {""} */ ("") };
    if (!v.integer && order !== null && order > 1 && (s.lo > -Infinity || s.hi < Infinity)) {
      // One bounded side: E[X] = lo + ∫ S_t and E[(X − lo)²] = ∫ 2(x − lo) S_t over [lo, ∞) (or the mirror image), by
      // Simpson's rule in u with x = lo + c·u/(1 − u) and c the distance from the end to the median.
      const up = s.lo > -Infinity, end = up ? s.lo : s.hi, med = law.quantile(0.5, p), c = Math.max(Math.abs(med - end), 1e-12);
      const n = 4096;
      let a = 0, b2 = 0;
      /** The survival function away from the bounded end, and the distance from it, at u. @param {number} u */
      const at = (u) => { if (u >= 1) return [0, 0]; const t = (c * u) / (1 - u), x = up ? end + t : end - t; return [(up ? law.sf(x, p) : law.cdf(x, p)) * (c / ((1 - u) * (1 - u))), t]; };
      for (let j = 0; j < n; j++) {
        const [g0, t0] = at(j / n), [gm, tm] = at((j + 0.5) / n), [g1, t1] = at((j + 1) / n);
        a += (g0 + 4 * gm + g1) / (6 * n);
        b2 += (2 * t0 * g0 + 8 * tm * gm + 2 * t1 * g1) / (6 * n);
      }
      const dist = a, mean = up ? end + dist : end - dist;
      return { mean, variance: order > 2 ? Math.max(0, b2 - dist * dist) : null, order, side };
    }
    if (v.integer && s.lo > -Infinity && bm.mean !== null && bm.variance !== null) {
      // E[X·1{X ≥ lower}] = E[X] − Σ_{k < lower} k p(k), and the same for X², over the finite lower part.
      let m1 = bm.mean, m2 = bm.variance + bm.mean * bm.mean, cut = 0;
      for (let k = bs.lo; k < s.lo && k - bs.lo < TABLE_MAX; k++) { const w = v.mass(k, q); m1 -= w * k; m2 -= w * k * k; cut += w; }
      let up1 = 0, up2 = 0;
      if (p.upper < Infinity) { const hi = Math.floor(p.upper); for (let k = hi + 1, n = 0; n < TABLE_MAX && v.sf(k - 1, q) > 1e-16; k++, n++) { const w = v.mass(k, q); up1 += w * k; up2 += w * k * k; } }
      const Z = 1 - cut - (p.upper < Infinity ? v.sf(Math.floor(p.upper), q) : 0);
      const mean = (m1 - up1) / Z, second = (m2 - up2) / Z;
      return { mean, variance: Math.max(0, second - mean * mean), order: bm.order, side: bm.side ?? "" };
    }
    return { mean: null, variance: null, order, side };
  }

  /* ---------- the compound Poisson law ---------- */

  /**
   * compound_F(freq, …): S = Y_1 + … + Y_N, N ~ Poisson(freq), Y_i i.i.d. from F and independent of N. For a
   * severity on the non-negative integers, Panjer's recursion gives the exact law of S up to a table of 4,096
   * points; for a continuous severity on [0, ∞), the same recursion on a lattice of step h (each severity mass at
   * the nearest lattice point) gives a numerical CDF. Sampling is exact when the severity sampler is.
   * @param {any} b @returns {any}
   */
  function compound(b) {
    if (b.dim || b.params.some((/** @type {any} */ ps) => ps.name === "freq")) return null;
    const v = view(b);
    const params = [{ name: "freq", kind: "real", text: `Poisson mean of the number N of terms, 0 ≤ freq ≤ ${MAX_FREQ}` }, ...b.params];
    /** @param {Params} p */
    const sev = (p) => Object.fromEntries(b.params.map((/** @type {any} */ ps) => [ps.name, p[ps.name]]));
    /** @type {Map<string, any>} */
    const tables = new Map();
    /** The table of S: masses on the lattice 0, h, 2h, …, with the mass beyond the table. @param {Params} p */
    function table(p) {
      const key = JSON.stringify(p);
      let t = tables.get(key);
      if (t) return t;
      const q = sev(p), lam = p.freq, s = b.support(q);
      if (s.lo < 0) t = { why: "The terms take negative values, so Panjer's recursion does not apply." };
      else if (lam * (1 - (v.integer ? v.mass(0, q) : 0)) > 700) t = { why: "freq × P(Y > 0) is above 700, so P(S = 0) is below the smallest double." };
      else {
        let h = 1;
        if (!v.integer) {
          // The step: the table reaches the mean of S plus 12 standard deviations, or the 1 − 10^-9 quantile of the
          // severity times a bound of N where the moments do not exist.
          const m = b.moments(q);
          const top = m.mean !== null && m.variance !== null ? lam * m.mean + 12 * Math.sqrt(lam * (m.variance + m.mean * m.mean)) + 1e-12
            : v.quantile(1 - 1e-9, q) * Math.max(1, lam + 6 * Math.sqrt(lam) + 6);
          h = top / PANJER;
        }
        const n = PANJER;
        // Severity masses on the lattice: f_j = P(Y = j) for an integer law; otherwise f_0 = P(Y ≤ 0) and
        // f_j = P((j − 1)h < Y ≤ jh), so each term moves up to the next lattice point and the atom of S at 0 stays exact.
        const f = new Float64Array(n + 1);
        for (let j = 0; j <= n; j++) f[j] = v.integer ? v.mass(j, q) : Math.max(0, v.cdf(j * h, q) - (j === 0 ? 0 : v.cdf((j - 1) * h, q)));
        const g = new Float64Array(n + 1);
        g[0] = Math.exp(-lam * (1 - f[0]));
        for (let k = 1; k <= n; k++) {
          let acc = 0;
          for (let j = 1; j <= k; j++) if (f[j]) acc += j * f[j] * g[k - j];
          g[k] = (lam / k) * acc;
        }
        const cum = new Float64Array(n + 1);
        let F = 0;
        g.forEach((x, k) => { cum[k] = F += x; });
        t = { h, g, cum, n, rest: Math.max(0, 1 - F), integer: v.integer };
      }
      if (tables.size > 32) tables.clear();
      tables.set(key, t);
      return t;
    }
    /** @param {Params} p */
    function check(p) {
      if (!(typeof p.freq === "number" && p.freq >= 0 && p.freq <= MAX_FREQ)) return [`freq = ${show(p.freq)} is outside [0, ${MAX_FREQ}].`];
      const errs = [...b.check(sev(p)), ...integerValues(b, sev(p))];
      if (!errs.length && b.support(sev(p)).lo < 0) errs.push(`The terms of a compound Poisson law here take values in [0, ∞), and the ${b.name} law takes negative values.`);
      return errs;
    }
    /** @param {number} x @param {Params} p */
    const cdf = (x, p) => {
      if (x < 0) return 0;
      const t = table(p);
      if (t.why) return NaN;
      const k = Math.floor(t.integer ? x : x / t.h);
      return k >= t.n ? Math.min(1, t.cum[t.n] + (k > t.n ? t.rest : 0)) : Math.min(1, t.cum[k]);
    };
    const law = {
      id: `compound_${b.id}`, name: `Compound Poisson law with ${b.name.replace(/^[A-Z](?![A-Z])/, (/** @type {string} */ c) => c.toLowerCase())} terms`, catalogue: "compound", base: b, generic: true,
      continuous: !v.integer, mixed: !v.integer, integer: v.integer ? undefined : false, numeric: true, custom: !!b.custom, constantArgs: !!b.constantArgs, params, check,
      support: (/** @type {Params} */ p) => { const s = b.support(sev(p)); return { lo: Math.min(0, s.lo), hi: p.freq > 0 && s.hi > 0 ? Infinity : 0 }; },
      supportText: (/** @type {Params} */ p) => (v.integer ? "{0, 1, 2, …}" : "[0, ∞), with an atom at 0"),
      pmf: (/** @type {number} */ x, /** @type {Params} */ p) => {
        if (!v.integer) return 0;
        const t = table(p);
        return t.why || !Number.isInteger(x) || x < 0 || x > t.n ? 0 : t.g[x];
      },
      pdf: !v.integer ? (/** @type {number} */ x, /** @type {Params} */ p) => { const t = table(p); if (t.why || x <= 0) return 0; const k = Math.ceil(x / t.h); return k > t.n ? 0 : t.g[k] / t.h; } : undefined,
      cdf, sf: (/** @type {number} */ x, /** @type {Params} */ p) => Math.max(0, 1 - cdf(x, p)),
      quantile: (/** @type {number} */ u, /** @type {Params} */ p) => {
        const t = table(p);
        if (t.why) return NaN;
        const k = Cu.search(t.cum, u);
        return t.integer ? k : k * t.h;
      },
      isf: (/** @type {number} */ q, /** @type {Params} */ p) => law.quantile(1 - q, p),
      table,
      moments: (/** @type {Params} */ p) => {
        const m = b.moments(sev(p));
        if (p.freq === 0) return { mean: 0, variance: 0, order: Infinity, side: /** @type {""} */ ("") };
        // E[S] = λE[Y] and Var S = λE[Y²]; E|S|^r < ∞ exactly when E|Y|^r < ∞ (λ > 0).
        return { mean: m.mean === null ? null : p.freq * m.mean, variance: m.mean === null || m.variance === null ? null : p.freq * (m.variance + m.mean * m.mean), order: m.order ?? null, side: m.side ?? "" };
      },
      reference: (/** @type {Params} */ p) => {
        const s = b.reference(sev(p));
        if ("unavailable" in s) return s;
        return { label: `N ~ Poisson(freq) by the Poisson reference sampler, then the sum of N terms, each ${s.label.replace(/^./, (/** @type {string} */ c) => c.toLowerCase())}`,
          exactness: grade(s) === "exact" ? "exact" : "approximate: the sampler of a term is approximate",
          draw: (/** @type {Rng} */ rng) => { const n = L.poissonDraw(rng, p.freq); let x = 0; for (let i = 0; i < n; i++) x += /** @type {number} */ (s.draw(rng)); return x; } };
      },
      inverse: (/** @type {Params} */ p, /** @type {number | undefined} */ cut) => {
        const t = table(p);
        if (t.why) return none(t.why);
        const label = t.integer ? `Inverse transform with the CDF table of Panjer's recursion (${PANJER} points) and binary search` : `Inverse transform with the CDF table of Panjer's recursion on a lattice of step h = ${show(t.h)}`;
        const q = (/** @type {number} */ u) => law.quantile(u, p);
        const exactness = t.integer ? (t.rest > 1e-12 ? `approximate: the table holds all but a mass ${show(t.rest)}` : "exact up to a mass below 10^-12 past the table") : "approximate: each term moves up to the next lattice point";
        if (cut === undefined) return { label, exactness, sampling: t.integer && t.rest <= 1e-12 ? "exact" : "approximate", draw: (/** @type {Rng} */ rng) => q(rng.uniform()) };
        const top = q(cut);
        return { label: `${label}, capped at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", draw: (/** @type {Rng} */ rng) => Math.min(top, q(rng.uniform())) };
      },
      rejection: () => none("The law of S has no closed form, so the page has no envelope for it."),
    };
    return law;
  }

  /* ---------- the empirical law and the kernel density model ---------- */

  /** Weights for data x: a vector of the same length, or one number for equal weights. @param {Params} p */
  function weights(p) {
    const x = isVec(p.x) ? p.x : [p.x];
    const w = isVec(p.w) ? p.w : x.map(() => p.w);
    return { x, w };
  }
  /** @param {Params} p */
  function checkData(p) {
    const { x, w } = weights(p);
    if (x.length < 1 || x.length > MAX_DATA) return [`x holds 1 to ${MAX_DATA} values.`];
    if (x.some((v) => !Number.isFinite(v))) return ["Each value of x is a finite number."];
    if (w.length !== x.length) return [`w has ${w.length} entries, and x has ${x.length}. Give one weight for each value, or one number for all.`];
    if (w.some((v) => !(v >= 0) || !Number.isFinite(v))) return ["Each weight is a finite number ≥ 0."];
    if (!(w.reduce((a, c) => a + c, 0) > 0)) return ["The weights add to 0."];
    return [];
  }
  /** @type {Map<string, any>} */
  const atomCache = new Map();
  /** @type {WeakMap<object, any>} */
  const atomSeen = new WeakMap();
  /** The atoms law of the data, set up once for each (x, w). @param {Params} p */
  function atomsOf(p) {
    const hit = atomSeen.get(p);
    if (hit) return hit;
    const a = atomsByKey(p);
    atomSeen.set(p, a);
    return a;
  }
  /** @param {Params} p */
  function atomsByKey(p) {
    const key = JSON.stringify([p.x, p.w]);
    let a = atomCache.get(key);
    if (!a) {
      const { x, w } = weights(p);
      /** @type {Map<number, number>} */
      const sum = new Map();
      x.forEach((v, i) => sum.set(v, (sum.get(v) ?? 0) + w[i]));
      a = Cu.atomsLaw([...sum.keys()], [...sum.values()]);
      if (atomCache.size > 32) atomCache.clear();
      atomCache.set(key, a);
    }
    return a;
  }

  /** @type {any} */
  const empirical = {
    id: "empirical", name: "Empirical", catalogue: "empirical", generic: true,
    params: [{ name: "x", kind: "vector", text: `the observed values x_1 … x_n, at most ${MAX_DATA}` }, { name: "w", kind: "vector", text: "a weight or count for each value, or one number for equal weights" }],
    check: checkData,
    support: (/** @type {Params} */ p) => { const a = atomsOf(p); return { lo: a.lo, hi: a.hi }; },
    supportText: (/** @type {Params} */ p) => atomsOf(p).supportText,
    atoms: (/** @type {Params} */ p) => atomsOf(p).atoms,
    integer: undefined,
    isInteger: (/** @type {Params} */ p) => atomsOf(p).integer,
    pmf: (/** @type {number} */ v, /** @type {Params} */ p) => atomsOf(p).pmf(v),
    cdf: (/** @type {number} */ v, /** @type {Params} */ p) => atomsOf(p).cdf(v),
    sf: (/** @type {number} */ v, /** @type {Params} */ p) => atomsOf(p).sf(v),
    quantile: (/** @type {number} */ u, /** @type {Params} */ p) => atomsOf(p).quantile(u),
    moments: (/** @type {Params} */ p) => ({ ...atomsOf(p).moments, side: "" }),
    reference: (/** @type {Params} */ p) => atomsOf(p).samplers.reference,
    inverse: (/** @type {Params} */ p, /** @type {number | undefined} */ cut) => {
      const s = atomsOf(p).samplers.inverse;
      if (cut === undefined) return s;
      const top = atomsOf(p).quantile(cut);
      return { label: `${s.label}, capped at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", draw: (/** @type {Rng} */ rng) => Math.min(top, s.draw(rng)) };
    },
    rejection: (/** @type {Params} */ p, /** @type {number} */ factor) => atomsOf(p).samplers.rejection(factor),
  };

  /** @type {Map<string, any>} */
  const kdeCache = new Map();
  /** @type {WeakMap<object, any>} */
  const kdeSeen = new WeakMap();
  /** The data, the normalised weights, and a CDF table on 4,097 points for the quantile guess, once for each parameter object. @param {Params} p */
  function kdeOf(p) {
    const hit = kdeSeen.get(p);
    if (hit) return hit;
    const k = kdeByKey(p);
    kdeSeen.set(p, k);
    return k;
  }
  /** @param {Params} p */
  function kdeByKey(p) {
    const key = JSON.stringify([p.x, p.w, p.h]);
    let k = kdeCache.get(key);
    if (!k) {
      const { x, w } = weights(p);
      const W = w.reduce((a, c) => a + c, 0), ws = w.map((v) => v / W);
      const lo = Math.min(...x) - 9 * p.h, hi = Math.max(...x) + 9 * p.h, n = 4096, xs = new Float64Array(n + 1), Fs = new Float64Array(n + 1);
      const cdf = (/** @type {number} */ v) => { let F = 0; for (let i = 0; i < x.length; i++) F += ws[i] * S.normalCdf((v - x[i]) / p.h); return F; };
      for (let j = 0; j <= n; j++) { xs[j] = lo + ((hi - lo) * j) / n; Fs[j] = cdf(xs[j]); }
      let m = 0;
      x.forEach((v, i) => { m += ws[i] * v; });
      let s2 = 0;
      x.forEach((v, i) => { s2 += ws[i] * (v - m) ** 2; });
      const { prob, al } = L.alias(ws);
      k = { x, ws, cdf, lo, hi, xs, Fs, n, mean: m, var: s2 + p.h * p.h, prob, al };
      if (kdeCache.size > 32) kdeCache.clear();
      kdeCache.set(key, k);
    }
    return k;
  }

  /** @type {any} */
  const kde = {
    id: "kde", name: "Kernel density", catalogue: "kde", generic: true, continuous: true,
    params: [{ name: "x", kind: "vector", text: `the observed values x_1 … x_n, at most ${MAX_DATA}` }, { name: "w", kind: "vector", text: "a weight or count for each value, or one number for equal weights" },
      { name: "h", kind: "real", text: "bandwidth h > 0, the standard deviation of the Gaussian kernel" }],
    check: (/** @type {Params} */ p) => [...checkData(p), ...(typeof p.h === "number" && p.h > 0 && Number.isFinite(p.h) ? [] : [`h = ${show(p.h)} is not a positive number.`])],
    support: () => ({ lo: -Infinity, hi: Infinity }),
    supportText: () => "(−∞, ∞)",
    pmf: () => 0,
    pdf: (/** @type {number} */ v, /** @type {Params} */ p) => { const k = kdeOf(p); let f = 0; for (let i = 0; i < k.x.length; i++) f += k.ws[i] * S.normalPdf((v - k.x[i]) / p.h); return f / p.h; },
    cdf: (/** @type {number} */ v, /** @type {Params} */ p) => kdeOf(p).cdf(v),
    sf: (/** @type {number} */ v, /** @type {Params} */ p) => { const k = kdeOf(p); let F = 0; for (let i = 0; i < k.x.length; i++) F += k.ws[i] * S.normalCdf((k.x[i] - v) / p.h); return F; },
    quantile: (/** @type {number} */ u, /** @type {Params} */ p) => S.solveQuantile(u, kdeProblem(p, u)),
    isf: (/** @type {number} */ q, /** @type {Params} */ p) => S.solveSurvival(q, kdeProblem(p, 1 - q)),
    moments: (/** @type {Params} */ p) => { const k = kdeOf(p); return { mean: k.mean, variance: k.var, order: Infinity, side: "" }; },
    /** Silverman's rule of thumb for the data: 0.9 min(sd, IQR/1.34) n^(−1/5). @param {Params} p */
    silverman: (p) => {
      const k = kdeOf({ ...p, h: 1 }), sd = Math.sqrt(Math.max(0, k.var - 1)), n = k.x.length;
      const a = Cu.atomsLaw(k.x.length === new Set(k.x).size ? k.x : [...new Set(k.x)], k.x.length === new Set(k.x).size ? k.ws : [...new Set(k.x)].map((/** @type {number} */ v) => k.x.reduce((/** @type {number} */ s, /** @type {number} */ y, /** @type {number} */ i) => s + (y === v ? k.ws[i] : 0), 0)));
      const iqr = a.quantile(0.75) - a.quantile(0.25), spread = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
      return 0.9 * spread * n ** -0.2;
    },
    reference: (/** @type {Params} */ p) => {
      const k = kdeOf(p);
      return { label: "Composition: the alias method picks a data value x_J, then X = x_J + hZ with Z from the Box–Muller transform", exactness: "exact",
        draw: (/** @type {Rng} */ rng) => { const i = rng.below(k.prob.length), j = rng.uniform() < k.prob[i] ? i : k.al[i]; return k.x[j] + p.h * rng.normal(); } };
    },
    inverse: (/** @type {Params} */ p, /** @type {number | undefined} */ cut) => {
      const k = kdeOf(p);
      // Linear interpolation in a CDF table of 4,097 points: fast, and the error is stated.
      const q = (/** @type {number} */ u) => {
        const j = Math.max(1, Cu.search(k.Fs, u)) - 1, d = k.Fs[j + 1] - k.Fs[j];
        return k.xs[j] + (k.xs[j + 1] - k.xs[j]) * (d > 0 ? Math.min(1, Math.max(0, (u - k.Fs[j]) / d)) : 0);
      };
      const label = `Inverse transform with a CDF table of ${k.n + 1} points on [min x − 9h, max x + 9h], linear inside a cell`;
      if (cut === undefined) return { label, exactness: "approximate: the CDF is linear between the table points", draw: (/** @type {Rng} */ rng) => q(rng.uniform()) };
      const top = q(cut);
      return { label: `${label}, capped at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", draw: (/** @type {Rng} */ rng) => Math.min(top, q(rng.uniform())) };
    },
    rejection: () => none("The composition method draws the kernel mixture directly, with one data value and one normal draw, so the page has no rejection step for it."),
  };
  /** @param {Params} p @param {number} u */
  function kdeProblem(p, u) {
    const k = kdeOf(p);
    // The table of kdeOf, with the bracket of cdfTable.
    const j = Cu.search(k.Fs, u);
    const br = j === 0 ? { lo: -Infinity, hi: k.xs[0], guess: k.xs[0] } : k.Fs[j] < u ? { lo: k.xs[k.n], hi: Infinity, guess: k.xs[k.n] }
      : { lo: k.xs[j - 1], hi: k.xs[j], guess: k.xs[j - 1] + (k.xs[j] - k.xs[j - 1]) * (k.Fs[j] > k.Fs[j - 1] ? (u - k.Fs[j - 1]) / (k.Fs[j] - k.Fs[j - 1]) : 0.5) };
    return { cdf: (/** @type {number} */ v) => kde.cdf(v, p), sf: (/** @type {number} */ v) => kde.sf(v, p), pdf: (/** @type {number} */ v) => kde.pdf(v, p), ...br };
  }

  /* ---------- names ---------- */

  const BASE = /** @type {Record<string, any>} */ ({ empirical, kde });
  const WRAP = /** @type {Record<string, (b: any) => any>} */ ({ mixture, truncated, compound });
  /** Laws built from catalogue laws, shared by every model of the page. @type {Map<string, any>} */
  const BUILT = new Map();

  /**
   * The law of a name: a law of the catalogue, a custom law of the model, empirical or kde, or a constructed name
   * such as mixture_poisson or truncated_mixture_geometric. Null for an unknown name or a family a constructor does
   * not take (a vector law, or a law with a parameter of the constructor's own name).
   * @param {string} id @param {Map<string, any>} [customs] the custom laws of the model
   * @returns {any}
   */
  function resolve(id, customs) {
    if (typeof id !== "string") return null;
    if (customs?.has(id)) return customs.get(id);
    if (L.BY_ID[id]) return L.BY_ID[id];
    if (BASE[id]) return BASE[id];
    const m = /^(mixture|truncated|compound)_(.+)$/.exec(id);
    if (!m) return null;
    const base = resolve(m[2], customs);
    if (!base) return null;
    if (base.custom) return WRAP[m[1]](base);
    let law = BUILT.get(id);
    if (law === undefined) {
      law = WRAP[m[1]](base);
      BUILT.set(id, law);
    }
    return law;
  }

  /** True for a name that the catalogue or this file owns, so a custom law may not take it. @param {string} id */
  const taken = (id) => !!L.BY_ID[id] || !!BASE[id] || CATALOGUE.includes(id) || /^(mixture|truncated|compound)_/.test(id);

  /** The catalogue id of a law: mixture, compound, truncated, empirical, kde, custom, or the law's own id. @param {any} law */
  const catalogueOf = (law) => law?.catalogue ?? law?.id ?? null;

  return { CATALOGUE, resolve, taken, catalogueOf, mixture, truncated, compound, empirical, kde };
});
