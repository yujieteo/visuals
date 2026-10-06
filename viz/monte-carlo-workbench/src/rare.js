/* Monte Carlo Probability Workbench: rare events and ruin, group 7. Three problems: the tail of a sum of n i.i.d.
 * jumps, the probability of ruin of the Cramér–Lundberg model in its Pollaczek–Khinchine form (a sum of a geometric
 * number of ladder heights), and the catastrophe and systemic ruin test (Hawkes arrivals, copula-linked shares,
 * reserves, a cascade of defaults and three control policies over a finite horizon). Six methods: direct simulation,
 * exponential tilting (refused when the transform E exp(θX) is infinite), fixed-effort multilevel splitting, subset
 * simulation, adaptive importance sampling with a defensive mixture and the cross-entropy method. Each run is a
 * sequence of independent replications: replication b uses its own Philox stream, so the result does not depend on
 * the number of workers. prepare() and block() have the signatures of the engine, so the page's worker pool runs
 * them; merge() adds the replications in order, and summary() gives each estimate with an interval that fits the
 * method. reference() gives the exact, numerical or asymptotic values that the methods are compared with. Every
 * function is pure: the page, its workers and the tests run the same code.
 */
/** @param {any} root the global object @param {(R: any, S: any, Cn: any, C: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCRng ?? require("./rng.js"), root.MCSpecial ?? require("./special.js"), root.MCContinuous ?? require("./continuous.js"), root.MCCopulas ?? require("./copulas.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCRare = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./rng.js")} */ R, /** @type {typeof import("./special.js")} */ S,
  /** @type {typeof import("./continuous.js")} */ Cn, /** @type {typeof import("./copulas.js")} */ C) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */

  const FORMAT = "monte-carlo-workbench/rare", VERSION = 1, STREAM = "rare";
  const PROBLEMS = ["sum", "ruin", "cat"];
  const METHODS = ["direct", "tilting", "splitting", "subset", "ais", "ce"];
  const LAWS = ["exponential", "weibull", "pareto2"];
  const COPULAS = ["independent", "gaussian", "gumbel", "clayton"];
  const FAILURES = ["none", "light_family", "small_spread", "nominal_start"];
  const LIMITS = { size: [8, 16], reps: [2, 64], events: 50000, ceIterations: 20, catIterations: 8, aisIterations: 6, subsetLevels: 60, splitStages: 40, kmax: 600 };
  const Z95 = 1.959963984540054;

  /* ---------- the jump laws: the catalogue's exponential, Weibull and Pareto II laws with location 0 ---------- */

  /**
   * A positive jump law with its cumulative hazard H(x) = −log P(X > x), its inverse, the density, the moments and
   * the exponential moment E exp(θX). Hinv(h) is exact for large h, so a draw x = Hinv(E) with E standard exponential
   * keeps its precision far in the tail.
   * @typedef {{ id: string, name: string, p: Record<string, number>, heavy: boolean, sf(x: number): number, H(x: number): number, Hinv(h: number): number,
   *   logpdf(x: number): number, mean: number, median: number, momentOrder: number, mgfBound: number, kappa(theta: number): number, text: string }} Jump
   */

  /** @param {string} id @param {Record<string, number>} p @returns {Jump} */
  function jump(id, p) {
    if (id === "exponential") {
      const r = p.rate;
      return { id, name: "Exponential", p, heavy: false, sf: (x) => (x <= 0 ? 1 : Math.exp(-r * x)), H: (x) => Math.max(0, r * x), Hinv: (h) => h / r,
        logpdf: (x) => (x < 0 ? -Infinity : Math.log(r) - r * x), mean: 1 / r, median: Math.LN2 / r, momentOrder: Infinity, mgfBound: r,
        kappa: (th) => (th < r ? -Math.log1p(-th / r) : Infinity), text: `exponential(rate = ${g4(r)}), mean ${g4(1 / r)}` };
    }
    if (id === "weibull") {
      const k = p.k, lam = p.lambda;
      return { id, name: "Weibull", p, heavy: k < 1, sf: (x) => (x <= 0 ? 1 : Math.exp(-Math.pow(x / lam, k))), H: (x) => (x <= 0 ? 0 : Math.pow(x / lam, k)), Hinv: (h) => lam * Math.pow(h, 1 / k),
        logpdf: (x) => (x <= 0 ? -Infinity : Math.log(k / lam) + (k - 1) * Math.log(x / lam) - Math.pow(x / lam, k)), mean: lam * Math.exp(S.lgamma(1 + 1 / k)), median: lam * Math.pow(Math.LN2, 1 / k),
        momentOrder: Infinity, mgfBound: k < 1 ? 0 : k === 1 ? 1 / lam : Infinity, kappa: (th) => (th <= 0 ? 0 : k < 1 ? Infinity : NaN), text: `Weibull(k = ${g4(k)}, λ = ${g4(lam)}), mean ${g4(lam * Math.exp(S.lgamma(1 + 1 / k)))}` };
    }
    const a = p.alpha, sg = p.sigma;
    return { id: "pareto2", name: "Pareto II (Lomax)", p, heavy: true, sf: (x) => (x <= 0 ? 1 : Math.exp(-a * Math.log1p(x / sg))), H: (x) => (x <= 0 ? 0 : a * Math.log1p(x / sg)), Hinv: (h) => sg * Math.expm1(h / a),
      logpdf: (x) => (x < 0 ? -Infinity : Math.log(a / sg) - (a + 1) * Math.log1p(x / sg)), mean: a > 1 ? sg / (a - 1) : Infinity, median: sg * Math.expm1(Math.LN2 / a),
      momentOrder: a, mgfBound: 0, kappa: (th) => (th <= 0 ? 0 : Infinity), text: `Pareto II(μ = 0, σ = ${g4(sg)}, α = ${g4(a)}), mean ${a > 1 ? g4(sg / (a - 1)) : "∞"}` };
  }

  /** The integrated-tail (equilibrium) law F_I(x) = (1/μ) ∫_0^x P(X > y) dy of an exponential or Pareto II claim law. @param {Jump} J @returns {Jump} */
  function integratedTail(J) {
    if (J.id === "exponential") return jump("exponential", { rate: J.p.rate });
    return jump("pareto2", { sigma: J.p.sigma, alpha: J.p.alpha - 1 });
  }

  /** @param {number} v */
  function g4(v) {
    if (!Number.isFinite(v)) return v > 0 ? "∞" : "–";
    const a = Math.abs(v);
    return a !== 0 && (a < 1e-4 || a >= 1e7) ? v.toExponential(3) : String(+v.toPrecision(4));
  }

  const exp1 = (/** @type {Rng} */ rng) => -Math.log(rng.uniform());
  /** P(Z > z) for a standard normal Z, accurate in the upper tail. @param {number} z */
  function normSf(z) {
    const q = S.gammaPQ(0.5, (z * z) / 2).Q / 2;
    return z >= 0 ? q : 1 - q;
  }
  /** The upper 0.975 quantile of Student's t with df degrees of freedom, from the incomplete beta function. @param {number} df */
  function tQuantile975(df) {
    if (df > 1e6) return Z95;
    const x = S.ibetaInv(0.05, df / 2, 0.5);
    return Math.sqrt((df * (1 - x)) / x);
  }
  /** log(exp(a) + exp(b)) without overflow. @param {number} a @param {number} b */
  const logAdd = (a, b) => (a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b))));

  /* ---------- the problems and their parameters ---------- */

  /**
   * The parameters of each problem: name, default, bounds, unit and the laws that read it. "law" names the jump laws
   * a parameter belongs to; the others hold for every law.
   * @type {Record<string, { name: string, def: number, min: number, max: number, int?: boolean, unit: string, text: string, laws?: string[] }[]>}
   */
  const PARAMS = {
    sum: [
      { name: "n", def: 20, min: 1, max: 200, int: true, unit: "jumps", text: "number of i.i.d. jumps in the sum" },
      { name: "b", def: 50, min: 0, max: 1e9, unit: "loss units", text: "threshold b of the event S_n > b" },
      { name: "rate", def: 1, min: 1e-6, max: 1e6, unit: "per loss unit", text: "rate λ of the exponential law", laws: ["exponential"] },
      { name: "k", def: 0.5, min: 0.1, max: 0.95, unit: "", text: "shape k < 1 of the Weibull law (a stretched exponential tail)", laws: ["weibull"] },
      { name: "lambda", def: 0.5, min: 1e-6, max: 1e6, unit: "loss units", text: "scale λ of the Weibull law", laws: ["weibull"] },
      { name: "sigma", def: 0.5, min: 1e-6, max: 1e6, unit: "loss units", text: "scale σ of the Pareto II law", laws: ["pareto2"] },
      { name: "alpha", def: 1.5, min: 0.3, max: 20, unit: "", text: "tail index α of the Pareto II law", laws: ["pareto2"] },
      { name: "target", def: 1e-4, min: 1e-15, max: 0.5, unit: "", text: "largest acceptable probability of the event" },
    ],
    ruin: [
      { name: "lam", def: 1, min: 1e-4, max: 1e4, unit: "claims per year", text: "Poisson rate λ of the claims" },
      { name: "c", def: 1.25, min: 1e-4, max: 1e6, unit: "money units per year", text: "premium rate c" },
      { name: "u", def: 20, min: 0, max: 1e7, unit: "money units", text: "initial capital u" },
      { name: "rate", def: 1, min: 1e-6, max: 1e6, unit: "per money unit", text: "rate of the exponential claims (mean 1/rate)", laws: ["exponential"] },
      { name: "sigma", def: 1.5, min: 1e-6, max: 1e6, unit: "money units", text: "scale σ of the Pareto II claims", laws: ["pareto2"] },
      { name: "alpha", def: 2.5, min: 1.05, max: 20, unit: "", text: "tail index α > 1 of the Pareto II claims (the mean claim must be finite)", laws: ["pareto2"] },
      { name: "target", def: 1e-3, min: 1e-15, max: 0.5, unit: "", text: "largest acceptable probability of ruin" },
    ],
    cat: [
      { name: "T", def: 10, min: 0.5, max: 50, unit: "years", text: "horizon T" },
      { name: "K", def: 3, min: 2, max: 5, int: true, unit: "entities", text: "number of insurers that share each event" },
      { name: "u", def: 14, min: 0.01, max: 1e6, unit: "money units", text: "initial capital u of each insurer" },
      { name: "c", def: 1.5, min: -1e6, max: 1e6, unit: "money units per year", text: "premium income c of each insurer" },
      { name: "nu", def: 2, min: 0.01, max: 100, unit: "events per year", text: "baseline rate ν of the Hawkes arrivals" },
      { name: "eta", def: 0.4, min: 0, max: 0.95, unit: "", text: "branching ratio η = α/β of the Hawkes arrivals (0: Poisson arrivals)" },
      { name: "decay", def: 4, min: 0.01, max: 1000, unit: "per year", text: "decay rate β of the Hawkes kernel" },
      { name: "rate", def: 1, min: 1e-6, max: 1e6, unit: "per money unit", text: "rate of the exponential event loss (light-tailed regime)", laws: ["exponential"] },
      { name: "k", def: 0.5, min: 0.1, max: 0.95, unit: "", text: "Weibull shape k of the event loss", laws: ["weibull"] },
      { name: "lambda", def: 0.5, min: 1e-6, max: 1e6, unit: "money units", text: "Weibull scale λ of the event loss", laws: ["weibull"] },
      { name: "sigma", def: 0.8, min: 1e-6, max: 1e6, unit: "money units", text: "Pareto II scale σ of the event loss (heavy-tailed regime)", laws: ["pareto2"] },
      { name: "alpha", def: 1.8, min: 0.3, max: 20, unit: "", text: "Pareto II tail index α of the event loss", laws: ["pareto2"] },
      { name: "M", def: 0, min: 0, max: 1e9, unit: "money units", text: "truncation point of the event loss (0: no truncation)" },
      { name: "tau", def: 0.5, min: 0, max: 0.95, unit: "", text: "Kendall's τ of the copula of the shares" },
      { name: "kappa", def: 0.3, min: 0, max: 5, unit: "", text: "contagion: a default costs each other insurer κ u" },
      { name: "m", def: 2, min: 1, max: 5, int: true, unit: "insurers", text: "number of defaults that makes a systemic ruin" },
      { name: "d", def: 6, min: 0, max: 1e6, unit: "money units", text: "retention d of the catastrophe layer on the event loss" },
      { name: "l", def: 60, min: 0, max: 1e6, unit: "money units", text: "limit ℓ of the layer: it pays min((S − d)⁺, ℓ)" },
      { name: "load", def: 0.6, min: 0, max: 10, unit: "", text: "loading of the layer price over its expected cost" },
      { name: "extra", def: 4, min: 0, max: 1e6, unit: "money units", text: "extra capital of each insurer in the third policy" },
      { name: "coc", def: 0.08, min: 0, max: 1, unit: "per year", text: "cost of capital" },
      { name: "target", def: 0.01, min: 1e-12, max: 0.5, unit: "", text: "largest acceptable probability of a systemic ruin within T" },
      { name: "xext", def: 40, min: 0, max: 1e9, unit: "money units", text: "threshold of an extreme single event loss" },
      { name: "q", def: 0.99, min: 0.5, max: 0.9999, unit: "", text: "level of the value at risk and the expected shortfall of the total loss" },
    ],
  };

  /** "n=20; b=50" → { n: "20", b: "50" }. @param {string} text */
  function parseParams(text) {
    /** @type {Record<string, string>} */
    const out = {};
    /** @type {string[]} */
    const errors = [];
    for (const part of String(text ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
      const m = /^([A-Za-z]\w*)\s*=\s*(.+)$/.exec(part);
      if (m) out[m[1]] = m[2].trim();
      else errors.push(`"${part.slice(0, 30)}" is not name = value.`);
    }
    return { values: out, errors };
  }

  /** The parameters of a problem and a law that the page reads, with their values. @param {string} problem @param {string} law */
  const paramsFor = (problem, law) => PARAMS[problem].filter((x) => !x.laws || x.laws.includes(law));

  /** The method settings with their defaults. Each is a number in the settings text of the method. */
  const OPTIONS = /** @type {Record<string, { def: number | null, min: number, max: number, text: string, methods: string[] }>} */ ({
    levels: { def: null, min: 1, max: 40, text: "number of stages of splitting (empty: from the reference value, about 0.1 for each stage)", methods: ["splitting"] },
    p0: { def: 0.1, min: 0.05, max: 0.5, text: "conditional probability p0 of each level of subset simulation", methods: ["subset"] },
    spread: { def: 1, min: 0.01, max: 4, text: "standard deviation of the component proposal of subset simulation", methods: ["subset"] },
    rho: { def: 0.1, min: 0.01, max: 0.5, text: "fraction ρ of elite samples of the cross-entropy method", methods: ["ce"] },
    beta: { def: 0.1, min: 0.01, max: 0.9, text: "weight β of the nominal law in the defensive mixture", methods: ["ais"] },
    iters: { def: 4, min: 1, max: LIMITS.aisIterations, text: "number of adaptation steps of adaptive importance sampling", methods: ["ais"] },
    tilt: { def: 1.3, min: 1, max: 50, text: "mean of the tilted event loss, as a multiple of the nominal mean (catastrophe test)", methods: ["tilting"] },
    arrivals: { def: 1.2, min: 0.2, max: 20, text: "baseline arrival rate under the tilt, as a multiple of ν (catastrophe test)", methods: ["tilting"] },
  });

  /* ---------- checking and compiling ---------- */

  /**
   * Check a record and settings and compile them. A method that does not apply is not an error: it carries its
   * reason in `refused`, and its replications return that reason.
   * @param {any} record { format, version, problem, law, copula, params: text or object }
   * @param {any} settings { seed, method, compare, failure, size, reps, options: text or object }
   */
  function prepare(record, settings) {
    /** @type {string[]} */
    const errors = [];
    if (!record || typeof record !== "object") return { ok: false, errors: ["The rare-event record is not an object."] };
    if (record.format !== undefined && record.format !== FORMAT) errors.push(`The record format is "${String(record.format).slice(0, 40)}", not ${FORMAT}.`);
    if (record.version !== undefined && record.version !== VERSION) errors.push(`The record uses version ${String(record.version).slice(0, 10)}. This page reads version ${VERSION}.`);
    const problem = String(record.problem ?? "");
    if (!PROBLEMS.includes(problem)) return { ok: false, errors: [...errors, `"${problem.slice(0, 20)}" is not a problem of this group (${PROBLEMS.join(", ")}).`] };
    const law = String(record.law ?? "exponential");
    if (!LAWS.includes(law)) errors.push(`"${law.slice(0, 20)}" is not a jump law of this group (${LAWS.join(", ")}).`);
    if (problem === "ruin" && law === "weibull") errors.push("The ruin problem reads the exponential or the Pareto II claims: the page has the integrated-tail law of these two only.");
    const copula = String(record.copula ?? "independent");
    if (problem === "cat" && !COPULAS.includes(copula)) errors.push(`"${copula.slice(0, 20)}" is not a copula of the test (${COPULAS.join(", ")}).`);
    const given = typeof record.params === "string" ? parseParams(record.params) : { values: Object.fromEntries(Object.entries(record.params ?? {}).map(([k, v]) => [k, String(v)])), errors: [] };
    errors.push(...given.errors);
    /** @type {Record<string, number>} */
    const p = {};
    const spec = PARAMS[problem];
    for (const name of Object.keys(given.values)) if (!spec.some((x) => x.name === name)) errors.push(`"${name}" is not a parameter of the ${problem} problem.`);
    for (const x of paramsFor(problem, law)) {
      const raw = given.values[x.name];
      const v = raw === undefined ? x.def : Number(raw);
      if (!Number.isFinite(v) || v < x.min || v > x.max || (x.int && !Number.isInteger(v))) errors.push(`${x.name} = ${String(raw).slice(0, 20)} is not ${x.int ? "an integer" : "a number"} in [${x.min}, ${x.max}] (${x.text}).`);
      else p[x.name] = v;
    }
    const opt = typeof settings?.options === "string" ? parseParams(settings.options) : { values: Object.fromEntries(Object.entries(settings?.options ?? {}).map(([k, v]) => [k, String(v)])), errors: [] };
    errors.push(...opt.errors.map((e) => `Method settings: ${e}`));
    /** @type {Record<string, number | null>} */
    const o = {};
    for (const [name, x] of Object.entries(OPTIONS)) {
      const raw = opt.values[name];
      if (raw === undefined || raw === "") { o[name] = x.def; continue; }
      const v = Number(raw);
      if (!Number.isFinite(v) || v < x.min || v > x.max) errors.push(`Method settings: ${name} = ${raw.slice(0, 20)} is not a number in [${x.min}, ${x.max}] (${x.text}).`);
      else o[name] = name === "levels" ? Math.round(v) : v;
    }
    for (const name of Object.keys(opt.values)) if (!(name in OPTIONS)) errors.push(`Method settings: "${name}" is not a setting (${Object.keys(OPTIONS).join(", ")}).`);
    const method = String(settings?.method ?? "direct"), compare = String(settings?.compare ?? "none");
    if (!METHODS.includes(method)) errors.push(`"${method.slice(0, 20)}" is not a rare-event method (${METHODS.join(", ")}).`);
    if (compare !== "none" && !METHODS.includes(compare)) errors.push(`"${compare.slice(0, 20)}" is not a rare-event method.`);
    const failure = String(settings?.failure ?? "none");
    if (!FAILURES.includes(failure)) errors.push(`"${failure.slice(0, 20)}" is not an assumption failure of this group.`);
    const size = Number(settings?.size ?? 12), reps = Number(settings?.reps ?? 16);
    if (!Number.isInteger(size) || size < LIMITS.size[0] || size > LIMITS.size[1]) errors.push(`The sample size 2^${size} is outside 2^${LIMITS.size[0]} to 2^${LIMITS.size[1]}.`);
    if (!Number.isInteger(reps) || reps < LIMITS.reps[0] || reps > LIMITS.reps[1]) errors.push(`The number of replications ${reps} is outside ${LIMITS.reps[0]} to ${LIMITS.reps[1]}.`);
    if (errors.length) return { ok: false, errors };

    const c = /** @type {any} */ ({ ok: true, errors: [], problem, law, copula: problem === "cat" ? copula : null, p, o, failure, N: 2 ** size, size, R: reps, seed: (Number(settings?.seed) || 0) >>> 0,
      methods: [method, ...(compare !== "none" && compare !== method ? [compare] : [])], method, compare });
    if (problem === "sum") {
      c.J = jump(law, p);
      c.x0 = p.b;
      c.n = p.n;
    } else if (problem === "ruin") {
      const claim = jump(law, p);
      c.claim = claim;
      c.rho = (p.lam * claim.mean) / p.c;
      if (!(c.rho < 1)) return { ok: false, errors: [`The net profit condition fails: ρ = λ E[X] / c = ${g4(c.rho)} ≥ 1, so ψ(u) = 1 for every u. Raise the premium c above λ E[X] = ${g4(p.lam * claim.mean)}.`] };
      c.J = integratedTail(claim);
      c.x0 = p.u;
      c.kmax = Math.min(LIMITS.kmax, Math.ceil(Math.log(1e-12) / Math.log(c.rho)));
      c.kmaxMass = Math.pow(c.rho, c.kmax + 1);
    } else {
      const sev = jump(law, p);
      c.sev = sev;
      c.trunc = p.M > 0 ? { M: p.M, sfM: sev.sf(p.M), FM: 1 - sev.sf(p.M) } : null;
      if (c.trunc && !(c.trunc.FM > 0)) return { ok: false, errors: [`The truncation point M = ${p.M} leaves no mass below it.`] };
      if (p.m > p.K) return { ok: false, errors: [`A systemic ruin needs m = ${p.m} defaults, more than the K = ${p.K} insurers.`] };
      c.cat = catSetup(c);
    }
    c.refused = Object.fromEntries(c.methods.map((/** @type {string} */ m) => [m, refusal(c, m)]));
    c.guess = guess(c);
    c.quantities = quantitiesOf(c);
    return c;
  }

  /** Why a method does not apply to a compiled problem, or "" when it applies. @param {any} c @param {string} m */
  function refusal(c, m) {
    if (m === "tilting") {
      const J = c.problem === "cat" ? c.sev : c.J;
      if (J.id !== "exponential") {
        if (c.problem === "cat" && c.trunc) return `The truncation at M = ${g4(c.trunc.M)} makes E exp(θS) finite, but the page has no exact sampler for the tilted truncated ${J.name} law. Use the cross-entropy method or adaptive importance sampling.`;
        return `Exponential tilting needs E exp(θX) < ∞ for some θ > 0. For the ${J.name} law ${J.id === "weibull" ? `with shape k = ${g4(J.p.k)} < 1` : `with tail index α = ${g4(J.p.alpha)}`}, E exp(θX) = ∞ for every θ > 0, so no tilted law exists. ${J.id === "weibull" ? "Every moment E X^r is finite, but finite moments do not give an exponential moment." : `Only the moments of order r < ${g4(J.p.alpha)} exist.`}`;
      }
      return "";
    }
    if (m === "subset" && c.problem === "cat") return "Subset simulation needs a fixed number of random inputs. In the catastrophe test, the number of events is random. Thus the page offers subset simulation only for the sum and the ruin problems.";
    return "";
  }

  /* ---------- references ---------- */

  /** The Erlang tail P(S_n > b) for i.i.d. exponential jumps with rate r: the regularised upper incomplete gamma Q(n, rb). @param {number} n @param {number} b @param {number} r */
  const erlangSf = (n, b, r) => (b <= 0 ? 1 : S.gammaPQ(n, r * b).Q);

  /**
   * The large-deviation data of a sum of n exponential jumps with threshold b = na: the rate function I(a) =
   * a/μ − 1 − log(a/μ), the tilt θ* = 1/μ − 1/a, the Chernoff bound exp(−n I(a)) and the Bahadur–Rao approximation
   * exp(−n I(a)) / (θ* σ_a √(2πn)) with σ_a = a.
   * @param {number} n @param {number} b @param {number} rate
   */
  function ldpExponential(n, b, rate) {
    const mu = 1 / rate, a = b / n;
    if (!(a > mu)) return { a, mu, I: 0, theta: 0, chernoff: 1, bahadurRao: null, note: `a = b/n = ${g4(a)} ≤ μ = ${g4(mu)}: the event is not a large deviation, and the law of large numbers makes it likely.` };
    const I = a / mu - 1 - Math.log(a / mu), theta = 1 / mu - 1 / a;
    return { a, mu, I, theta, chernoff: Math.exp(-n * I), bahadurRao: Math.exp(-n * I) / (theta * a * Math.sqrt(2 * Math.PI * n)), note: "" };
  }

  /**
   * The Asmussen–Kroese estimator of P(J_1 + … + J_K > x) for i.i.d. continuous jumps (Asmussen and Kroese, Adv. Appl.
   * Probab. 38, 2006): K F̄(max(M_{K−1}, x − S_{K−1})) with M_{K−1} and S_{K−1} the largest and the sum of the other
   * K − 1 jumps. It is unbiased, and its relative error stays bounded as x → ∞ for a regularly varying tail. K is n,
   * or a geometric number with P(K = k) = (1 − ρ) ρ^k for the ruin problem.
   * @param {Jump} J @param {{ n?: number, rho?: number }} count @param {number} x @param {number} N @param {number} seed
   */
  function asmussenKroese(J, count, x, N, seed) {
    const rng = R.stream(seed, `${STREAM}/reference`, 0, 0);
    let mean = 0, m2 = 0;
    for (let i = 0; i < N; i++) {
      const K = count.n ?? Math.floor(Math.log(rng.uniform()) / Math.log(/** @type {number} */ (count.rho)));
      let z = 0;
      if (K > 0) {
        let s = 0, mx = 0;
        for (let j = 0; j < K - 1; j++) { const v = J.Hinv(exp1(rng)); s += v; if (v > mx) mx = v; }
        z = K * J.sf(Math.max(mx, x - s));
      }
      const d = z - mean;
      mean += d / (i + 1);
      m2 += d * (z - mean);
    }
    const se = Math.sqrt(m2 / (N - 1) / N);
    return { est: mean, se, lo: mean - Z95 * se, hi: mean + Z95 * se, n: N };
  }

  /**
   * The reference values of a compiled problem: exact, numerical (with its own interval) or asymptotic, each with
   * the kind of claim it supports, and the points of the tail plot.
   * @param {any} c
   */
  function reference(c) {
    if (c.problem === "sum") {
      const J = c.J, n = c.n, b = c.x0;
      const tail = (/** @type {number} */ x) => n * J.sf(x);
      if (J.id === "exponential") {
        const ldp = ldpExponential(n, b, J.p.rate);
        const xs = gridAround(b, n * J.mean);
        return { kind: "exact", value: erlangSf(n, b, J.p.rate), how: "the Erlang tail Q(n, λb), exact up to the rounding of the incomplete gamma function", ldp, asymptotic: null,
          curves: { x: xs, exact: xs.map((x) => erlangSf(n, x, J.p.rate)), chernoff: xs.map((x) => ldpExponential(n, x, J.p.rate).chernoff), bahadurRao: xs.map((x) => ldpExponential(n, x, J.p.rate).bahadurRao), asymptotic: null, numerical: null } };
      }
      const ak = asmussenKroese(J, { n }, b, 1 << 16, 7777);
      const xs = gridAround(b, n * (Number.isFinite(J.mean) ? J.mean : J.median));
      const pts = xs.filter((_, i) => i % 3 === 0);
      return { kind: "numerical", value: ak.est, interval: [ak.lo, ak.hi], how: `the Asmussen–Kroese conditional Monte Carlo estimator with 65,536 samples and its own seed; 95 % interval ${g4(ak.lo)} to ${g4(ak.hi)}`, ldp: { I: 0, note: `E exp(θX) = ∞ for every θ > 0, so the rate function of Cramér's theorem is 0 above the mean: P(S_n > na) decays slower than any exponential in n.` },
        asymptotic: { value: tail(b), how: "n F̄(b): the one-big-jump asymptotic of a subexponential law, a limit as b → ∞, not a value at this b" },
        curves: { x: xs, exact: null, chernoff: null, bahadurRao: null, asymptotic: xs.map(tail), numerical: { x: pts, y: pts.map((x) => asmussenKroese(J, { n }, x, 1 << 13, 7778).est) } } };
    }
    if (c.problem === "ruin") {
      const J = c.J, rho = c.rho, u = c.x0;
      if (J.id === "exponential") {
        const Rr = (1 - rho) * J.p.rate;
        const exact = (/** @type {number} */ x) => rho * Math.exp(-Rr * x);
        const xs = gridAround(u, J.mean * rho / (1 - rho));
        return { kind: "exact", value: exact(u), how: "ψ(u) = ρ exp(−(1 − ρ)u/μ), the exact ruin probability for exponential claims", adjustment: Rr, lundberg: Math.exp(-Rr * u), asymptotic: null,
          curves: { x: xs, exact: xs.map(exact), lundberg: xs.map((x) => Math.exp(-Rr * x)), asymptotic: null, numerical: null } };
      }
      const ak = asmussenKroese(J, { rho }, u, 1 << 16, 7777);
      const tail = (/** @type {number} */ x) => (rho / (1 - rho)) * J.sf(x);
      const xs = gridAround(u, J.median * rho / (1 - rho));
      const pts = xs.filter((_, i) => i % 3 === 0);
      return { kind: "numerical", value: ak.est, interval: [ak.lo, ak.hi], how: `the Pollaczek–Khinchine sum by the Asmussen–Kroese estimator with 65,536 samples and its own seed; 95 % interval ${g4(ak.lo)} to ${g4(ak.hi)}`, adjustment: null,
        asymptotic: { value: tail(u), how: "ρ/(1 − ρ) F̄_I(u): the Embrechts–Veraverbeke asymptotic of subexponential claims, a limit as u → ∞" },
        curves: { x: xs, exact: null, lundberg: null, asymptotic: xs.map(tail), numerical: { x: pts, y: pts.map((x) => asmussenKroese(J, { rho }, x, 1 << 13, 7778).est) } } };
    }
    return { kind: "none", value: null, how: "The catastrophe test has no exact reference for the probabilities. The methods check each other. The expected number of events, the layer price and the costs are exact.", curves: null };
  }

  /** 31 points from a low value to beyond x, for a tail plot. @param {number} x @param {number} centre */
  function gridAround(x, centre) {
    const lo = Math.max(1e-9, Math.min(centre, x) * 0.5), hi = Math.max(x * 1.6, lo * 4);
    return Array.from({ length: 31 }, (_, i) => lo + ((hi - lo) * i) / 30);
  }

  /** A first value of the probability, to set the levels of splitting: the reference, the asymptotic or a rough bound. @param {any} c */
  function guess(c) {
    if (c.problem === "sum") {
      if (c.J.id === "exponential") return erlangSf(c.n, c.x0, c.J.p.rate);
      return Math.min(1, Math.max(c.n * c.J.sf(c.x0), 1e-300));
    }
    if (c.problem === "ruin") {
      if (c.J.id === "exponential") return c.rho * Math.exp(-(1 - c.rho) * c.J.p.rate * c.x0);
      return Math.min(1, (c.rho / (1 - c.rho)) * c.J.sf(c.x0));
    }
    return 1e-3;
  }

  /* ---------- the walk problems: the sum and the Pollaczek–Khinchine sum ---------- */

  /**
   * One path of a walk problem under a proposal: K jumps (n, or geometric), each drawn by a hazard-rate twist with
   * rate r (r = 1 is the nominal law), or from an exponential law with mean v (the light family). Returns the sum,
   * the log likelihood ratio log f/g, and the sufficient statistics of the families: the count K, the sum of the
   * nominal cumulative hazards H(J_i), and the sum of the jumps.
   * @param {any} c @param {Rng} rng @param {{ r?: number, v?: number, rho?: number }} q
   */
  function walkPath(c, rng, q) {
    const J = c.J;
    let K, logLR = 0;
    if (c.problem === "sum") K = c.n;
    else {
      const rp = q.rho ?? c.rho;
      // No cap at kmax here: a cap would change the proposal law and make the likelihood ratio wrong.
      K = Math.min(1e6, Math.floor(Math.log(rng.uniform()) / Math.log(rp)));
      if (rp !== c.rho) logLR += Math.log1p(-c.rho) + K * Math.log(c.rho) - Math.log1p(-rp) - K * Math.log(rp);
    }
    let s = 0, sumH = 0;
    if (q.v !== undefined) {
      const v = q.v;
      for (let i = 0; i < K; i++) {
        const x = v * exp1(rng);
        s += x;
        sumH += J.H(x);
        logLR += J.logpdf(x) + Math.log(v) + x / v;
      }
    } else {
      const r = q.r ?? 1;
      for (let i = 0; i < K; i++) {
        const h = exp1(rng) / r;
        s += J.Hinv(h);
        sumH += h;
      }
      if (r !== 1) logLR += -(1 - r) * sumH - K * Math.log(r);
    }
    return { s, logLR, K, sumH, work: K + (c.problem === "ruin" ? 1 : 0) };
  }

  /** The weighted maximum-likelihood update of the proposal from paths with weights w. @param {any} c @param {any[]} paths @param {number[]} w @param {any} q */
  function updateWalk(c, paths, w, q) {
    let sw = 0, sK = 0, sH = 0, sX = 0;
    paths.forEach((x, i) => { if (!w[i]) return; sw += w[i]; sK += w[i] * x.K; sH += w[i] * x.sumH; sX += w[i] * x.s; });
    if (!(sw > 0)) return q;
    /** @type {any} */
    const next = { ...q };
    if (q.v !== undefined) { if (sK > 0) next.v = Math.min(1e12, Math.max(1e-12, sX / sK)); }
    else if (sH > 0 && sK > 0) next.r = Math.min(10, Math.max(1e-4, sK / sH));
    if (c.problem === "ruin") next.rho = Math.min(0.999, Math.max(0.01, sK / (sK + sw)));
    return next;
  }

  /** Normalised weights exp(logW − max) of the selected paths, for an update that does not depend on a common factor. @param {number[]} logw */
  function normalise(logw) {
    const m = Math.max(...logw.filter((x) => x > -Infinity));
    return logw.map((x) => (x === -Infinity || !Number.isFinite(m) ? 0 : Math.exp(x - m)));
  }

  /** An i.i.d. accumulator of the terms Y_i of one replication. */
  const iid = () => ({ n: 0, sum: 0, sumsq: 0, hits: 0, max: 0 });
  /** @param {any} a @param {number} y */
  function add(a, y) {
    a.n++;
    a.sum += y;
    a.sumsq += y * y;
    if (y > 0) { a.hits++; if (y > a.max) a.max = y; }
  }

  /** One replication of a method on a walk problem. @param {any} c @param {string} m @param {Rng} rng */
  function walkReplication(c, m, rng) {
    const N = c.N, x0 = c.x0;
    if (m === "direct") {
      const a = iid();
      let work = 0;
      for (let i = 0; i < N; i++) {
        // Positive jumps: the sum passes x0 for good once it does, so the path can stop there.
        let s = 0, K = c.problem === "sum" ? c.n : Math.min(1e6, Math.floor(Math.log(rng.uniform()) / Math.log(c.rho)));
        if (c.problem === "ruin") work++;
        for (let j = 0; j < K && s <= x0; j++) { s += c.J.Hinv(exp1(rng)); work++; }
        add(a, s > x0 ? 1 : 0);
      }
      return { est: a.sum / N, iid: a, work, diag: { hits: a.hits } };
    }
    if (m === "tilting") return walkTilting(c, rng);
    if (m === "splitting") return walkSplitting(c, rng);
    if (m === "subset") return walkSubset(c, rng);
    return m === "ce" ? walkCE(c, rng) : walkAIS(c, rng);
  }

  /** Exponential tilting: the sum with θ* from κ'(θ*) = b/n, or Siegmund's algorithm for the ruin problem. @param {any} c @param {Rng} rng */
  function walkTilting(c, rng) {
    const N = c.N, J = c.J, a = iid();
    let work = 0, theta;
    if (c.problem === "sum") {
      const ldp = ldpExponential(c.n, c.x0, J.p.rate);
      theta = ldp.theta;
      const mt = 1 / (J.p.rate - theta), k = c.n * J.kappa(theta);
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0; j < c.n; j++) s += mt * exp1(rng);
        work += c.n;
        add(a, s > c.x0 ? Math.exp(k - theta * s) : 0);
      }
      return { est: a.sum / N, iid: a, work, diag: { theta, tiltedMean: mt, hits: a.hits, ess: ess(a), maxShare: a.sum > 0 ? a.max / a.sum : null } };
    }
    // Siegmund: θ = R = (1 − ρ)/μ makes ρ E exp(θY) = 1, the tilted ladder heights are exponential with mean μ/ρ, and
    // the tilted walk passes u with probability 1. The estimator exp(−R S_τ) is at most exp(−R u).
    theta = (1 - c.rho) * J.p.rate;
    const mt = 1 / (J.p.rate - theta);
    for (let i = 0; i < N; i++) {
      let s = 0;
      while (s <= c.x0) { s += mt * exp1(rng); work++; }
      add(a, Math.exp(-theta * s));
    }
    return { est: a.sum / N, iid: a, work, diag: { theta, tiltedMean: mt, hits: a.hits, ess: ess(a), maxShare: a.max / a.sum } };
  }

  /** The effective sample size (Σ Y)² / Σ Y² of the non-zero terms: a diagnostic of the weights, not a proof. @param {any} a */
  const ess = (a) => (a.sumsq > 0 ? (a.sum * a.sum) / a.sumsq : null);

  /**
   * The number of stages and the levels of splitting: the levels split [h0, x0] in equal steps, with a number of
   * stages from the guessed probability so that each stage has a probability of about 0.1.
   * @param {any} c @param {number} h0 @param {number} top
   */
  function splitLevels(c, h0, top) {
    const L = c.o.levels ?? Math.max(1, Math.min(LIMITS.splitStages, Math.round(Math.log(Math.max(c.guess, 1e-300)) / Math.log(0.1))));
    if (!(top > h0)) return { L: 1, levels: [] };
    return { L, levels: Array.from({ length: L - 1 }, (_, j) => h0 + ((j + 1) * (top - h0)) / L) };
  }

  /**
   * Fixed-effort multilevel splitting (Garvels 2000; Cérou, Del Moral, Furon and Guyader 2012). Stage j starts N
   * paths from entrance states drawn with replacement from the successes of stage j − 1 and runs each until its
   * importance h passes level ℓ_j or the path ends. The product of the fractions of success is an unbiased estimate.
   * The importance of the sum is h(k, s) = s + (n − k) m with m the mean (the median when the mean is infinite), of the
   * ruin problem h = s. A path that passes several levels with one jump enters the next stages at once: with a heavy
   * tail one big jump passes all of them, and splitting gains little.
   * @param {any} c @param {Rng} rng
   */
  function walkSplitting(c, rng) {
    const N = c.N, J = c.J, sum = c.problem === "sum";
    const m = sum ? (Number.isFinite(J.mean) ? J.mean : J.median) : 0;
    const h = (/** @type {number} */ k, /** @type {number} */ s) => (sum ? s + (c.n - k) * m : s);
    const { L, levels } = splitLevels(c, h(0, 0), c.x0);
    /** @type {{ k: number, s: number }[]} */
    let starts = [{ k: 0, s: 0 }];
    let est = 1, work = 0, at = 0;
    const fractions = [], early = [];
    for (let j = 0; j < L; j++) {
      const final = j === L - 1, lev = final ? c.x0 : levels[j];
      /** @type {{ k: number, s: number }[]} */
      const succ = [];
      let atOnce = 0;
      for (let i = 0; i < N; i++) {
        const st = j === 0 ? { k: 0, s: 0 } : { ...starts[rng.below(starts.length)] };
        const hit = () => (final ? st.s > c.x0 : h(st.k, st.s) > lev);
        if (hit()) { succ.push(st); atOnce++; continue; }
        for (;;) {
          if (sum) { if (st.k >= c.n) break; }
          else { work++; if (rng.uniform() >= c.rho) break; }
          st.k++;
          st.s += J.Hinv(exp1(rng));
          work++;
          if (hit()) { succ.push(st); break; }
        }
      }
      fractions.push(succ.length / N);
      early.push(atOnce / N);
      est *= succ.length / N;
      at = j + 1;
      if (!succ.length) { est = 0; break; }
      starts = succ;
    }
    return { est, iid: null, work, diag: { stages: L, stagesRun: at, fractions, early, levels } };
  }

  /**
   * Subset simulation (Au and Beck, Probab. Eng. Mech. 16, 2001) in standard normal space: z_i maps to the jump
   * F̄⁻¹(Φ̄(z_i)), and z_0 to the geometric count of the ruin problem. Each level keeps the N p0 samples with the largest
   * sum as seeds and grows each into a chain by the modified Metropolis algorithm (one random-walk proposal for each
   * component, accepted against the standard normal density, then the whole move accepted only inside the level
   * set). The estimate is p0^(levels) times the final fraction; its bias is of order 1/N.
   * @param {any} c @param {Rng} rng
   */
  function walkSubset(c, rng) {
    const N = c.N, J = c.J, sum = c.problem === "sum";
    const p0 = /** @type {number} */ (c.o.p0), spread = c.failure === "small_spread" ? 0.05 : /** @type {number} */ (c.o.spread);
    const d = sum ? c.n : c.kmax + 1, off = sum ? 0 : 1;
    const xOf = (/** @type {number} */ z) => J.Hinv(-Math.log(normSf(z)));
    const Kof = (/** @type {Float64Array} */ z) => (sum ? c.n : Math.min(c.kmax, Math.floor(Math.log(normSf(z[0])) / Math.log(c.rho))));
    let work = 0;
    /** g(z) with a cache of the jumps that are already mapped. @param {Float64Array} z @param {Float64Array} x */
    const g = (z, x) => {
      const K = Kof(z);
      let s = 0;
      for (let i = 0; i < K; i++) {
        if (Number.isNaN(x[off + i])) { x[off + i] = xOf(z[off + i]); work++; }
        s += x[off + i];
      }
      return s;
    };
    let pop = Array.from({ length: N }, () => {
      const z = new Float64Array(d), x = new Float64Array(d).fill(NaN);
      for (let i = 0; i < d; i++) z[i] = rng.normal();
      return { z, x, g: g(z, x) };
    });
    let est = 1, moves = 0, tries = 0, comps = 0, compTries = 0;
    const thresholds = [], fractions = [];
    for (let level = 0; ; level++) {
      if (level >= LIMITS.subsetLevels) return { est: null, iid: null, work, error: `Subset simulation did not reach the event after ${LIMITS.subsetLevels} levels.`, diag: { thresholds, fractions } };
      const sorted = pop.map((x) => x.g).sort((a, b) => b - a);
      const nc = Math.max(1, Math.round(N * p0));
      const gamma = (sorted[nc - 1] + sorted[Math.min(N - 1, nc)]) / 2;
      if (gamma >= c.x0) {
        const f = pop.filter((x) => x.g > c.x0).length / N;
        fractions.push(f);
        thresholds.push(c.x0);
        est *= f;
        break;
      }
      const seeds = pop.filter((x) => x.g > gamma);
      if (!seeds.length) return { est: null, iid: null, work, error: `Subset simulation stalls at level ${level + 1}: no sample is above the threshold ${g4(gamma)}, because many samples have the same value.`, diag: { thresholds, fractions } };
      fractions.push(seeds.length / N);
      thresholds.push(gamma);
      est *= seeds.length / N;
      /** @type {typeof pop} */
      const next = [];
      for (let k = 0; k < seeds.length; k++) {
        const len = Math.floor(N / seeds.length) + (k < N % seeds.length ? 1 : 0);
        let cur = seeds[k];
        next.push(cur);
        for (let t = 1; t < len; t++) {
          const z = Float64Array.from(cur.z), x = Float64Array.from(cur.x);
          let changed = false;
          for (let i = 0; i < d; i++) {
            const xi = z[i] + spread * rng.normal();
            compTries++;
            if (rng.uniform() < Math.exp((z[i] * z[i] - xi * xi) / 2)) { z[i] = xi; x[i] = NaN; changed = true; comps++; }
          }
          tries++;
          if (changed) {
            const gv = g(z, x);
            if (gv > gamma) { cur = { z, x, g: gv }; moves++; }
          }
          next.push(cur);
        }
      }
      pop = next;
    }
    return { est, iid: null, work, diag: { levels: thresholds.length, thresholds, fractions, accept: tries ? moves / tries : null, componentAccept: compTries ? comps / compTries : null, spread, p0 } };
  }

  /** The family and the first proposal of the cross-entropy method and of adaptive importance sampling. @param {any} c @param {boolean} light */
  function nominalProposal(c, light) {
    /** @type {any} */
    const q = light ? { v: Number.isFinite(c.J.mean) ? c.J.mean : c.J.median } : { r: 1 };
    if (c.problem === "ruin") q.rho = c.rho;
    return q;
  }

  /**
   * The level of a cross-entropy iteration: the (1 − ρ) quantile of the scores, at most the top. A level that does not
   * rise above the last one keeps the last one and doubles the sample size, up to 4N (Rubinstein and Kroese 2004,
   * the modified algorithm), so the method does not go round in circles.
   * @param {number[]} scores @param {number} rho @param {number} top @param {number} prev @param {number} size @param {number} N
   */
  function ceLevel(scores, rho, top, prev, size, N) {
    const sorted = scores.slice().sort((a, b) => a - b);
    let gamma = Math.min(top, sorted[Math.min(sorted.length - 1, Math.floor((1 - rho) * sorted.length))]);
    if (gamma < top && gamma <= prev + 1e-9 * Math.max(1, Math.abs(prev))) {
      gamma = Math.min(top, Math.max(gamma, prev));
      size = Math.min(4 * N, 2 * size);
    }
    return { gamma, size };
  }

  /** Smoothing of the cross-entropy update, v_t = 0.7 v̂_t + 0.3 v_(t−1), for each parameter of the family. @param {any} next @param {any} q */
  function smooth(next, q) {
    /** @type {any} */
    const out = { ...next };
    for (const k of ["r", "v", "rho", "nu"]) if (typeof next[k] === "number" && typeof q[k] === "number") out[k] = 0.7 * next[k] + 0.3 * q[k];
    return out;
  }

  /**
   * The cross-entropy method (Rubinstein 1997; Rubinstein and Kroese 2004) for P(S > x0): levels γ_t at the (1 − ρ)
   * quantile of the sum under the current proposal, and the weighted maximum-likelihood update of the proposal from
   * the elite paths, until γ_t = x0. Then a fresh sample from the last proposal gives the estimate. The family is
   * the hazard-rate twist F̄_r = F̄^r of the jump law (for the exponential law, the exponential tilt) and, for the ruin
   * problem, the geometric count. The light family failure uses exponential proposals for a heavier target: the
   * weights f/g are not bounded and their variance is infinite.
   * @param {any} c @param {Rng} rng
   */
  function walkCE(c, rng) {
    const light = c.failure === "light_family" && c.J.id !== "exponential";
    let q = nominalProposal(c, light), work = 0;
    let Nce = Math.max(256, c.N >> 2), prev = -Infinity, reached = true;
    const rho = /** @type {number} */ (c.o.rho);
    const path = /** @type {any[]} */ ([{ gamma: null, q: { ...q } }]);
    for (let t = 0; ; t++) {
      if (t >= LIMITS.ceIterations) { reached = false; break; }
      const paths = Array.from({ length: Nce }, () => walkPath(c, rng, q));
      for (const x of paths) work += x.work;
      const lv = ceLevel(paths.map((x) => x.s), rho, c.x0, prev, Nce, c.N);
      Nce = lv.size;
      prev = lv.gamma;
      const gamma = lv.gamma;
      const elite = paths.map((x) => x.s >= gamma && (gamma < c.x0 || x.s > c.x0));
      const w = normalise(paths.map((x, i) => (elite[i] ? x.logLR : -Infinity)));
      q = smooth(updateWalk(c, paths, w, q), q);
      path.push({ gamma, q: { ...q } });
      if (gamma >= c.x0) break;
    }
    const a = iid();
    for (let i = 0; i < c.N; i++) {
      const x = walkPath(c, rng, q);
      work += x.work;
      add(a, x.s > c.x0 ? Math.exp(x.logLR) : 0);
    }
    return { est: a.sum / c.N, iid: a, work, diag: { path, final: q, reached, family: light ? "exponential" : "hazard", ess: ess(a), maxShare: a.sum > 0 ? a.max / a.sum : null, hits: a.hits, infiniteVariance: light } };
  }

  /**
   * The first twist of adaptive importance sampling: r = 1/H(x0), so the twisted jump, whose cumulative hazard is
   * exponential with mean 1/r, has the typical size of the threshold x0. The failure "nominal_start" starts at r = 1,
   * the nominal law.
   * @param {any} c
   */
  function aisStart(c) {
    if (c.failure === "nominal_start") return 1;
    return Math.min(1, Math.max(1e-4, 1 / Math.max(1e-9, c.J.H(c.x0))));
  }

  /**
   * One path of a walk problem under the one-big-jump defensive mixture q = β f + (1 − β) (1/K) Σ_i q_i, where q_i
   * draws jump i from the hazard-rate twist g_r and the other jumps from f (the count K stays nominal). Then
   * f/q = 1 / (β + (1 − β) (1/K) Σ_i r exp((1 − r) H(J_i))) ≤ 1/β, and f/q = 1 for K = 0.
   * @param {any} c @param {Rng} rng @param {number} r @param {number} beta
   */
  function mixturePath(c, rng, r, beta) {
    const K = c.problem === "sum" ? c.n : Math.min(1e6, Math.floor(Math.log(rng.uniform()) / Math.log(c.rho)));
    const chosen = K && rng.uniform() >= beta ? rng.below(K) : -1;
    let s = 0, lsum = -Infinity, hBig = 0, big = -1;
    for (let i = 0; i < K; i++) {
      const h = exp1(rng) / (i === chosen ? r : 1), x = c.J.Hinv(h);
      s += x;
      lsum = logAdd(lsum, Math.log(r) + (1 - r) * h);
      if (x > big) { big = x; hBig = h; }
    }
    const lw = K ? -logAdd(Math.log(beta), Math.log1p(-beta) + lsum - Math.log(K)) : 0;
    return { s, lw, hBig, work: K + (c.problem === "ruin" ? 1 : 0) };
  }

  /**
   * Adaptive importance sampling with the one-big-jump defensive mixture (Hesterberg 1995 for the defensive part;
   * Dupuis, Leder and Wang 2007 for the mixture over the jump that is large). The weights are at most 1/β, so their
   * variance is finite for any tail. Each step updates r by weighted maximum likelihood, r = Σ w / Σ w H(J_max), from
   * the largest jump of each path in the event, as population Monte Carlo does (Cappé, Guillin, Marin and Robert 2004);
   * a step with no path in the event keeps r. A fresh sample from the last mixture gives the estimate.
   * @param {any} c @param {Rng} rng
   */
  function walkAIS(c, rng) {
    let r = aisStart(c), work = 0;
    const beta = /** @type {number} */ (c.o.beta), Na = Math.max(256, c.N >> 2), iters = /** @type {number} */ (c.o.iters);
    const path = /** @type {any[]} */ ([{ hits: null, r }]);
    for (let t = 0; t < iters; t++) {
      const xs = Array.from({ length: Na }, () => mixturePath(c, rng, r, beta));
      const w = normalise(xs.map((x) => (x.s > c.x0 ? x.lw : -Infinity)));
      let sw = 0, sh = 0, hits = 0;
      xs.forEach((x, i) => { work += x.work; if (w[i] > 0) { hits++; sw += w[i]; sh += w[i] * x.hBig; } });
      if (hits && sh > 0) r = Math.min(1, Math.max(1e-4, sw / sh));
      path.push({ hits, r });
    }
    const a = iid();
    for (let i = 0; i < c.N; i++) {
      const x = mixturePath(c, rng, r, beta);
      work += x.work;
      add(a, x.s > c.x0 ? Math.exp(x.lw) : 0);
    }
    return { est: a.sum / c.N, iid: a, work, diag: { path, final: { r }, beta, bound: 1 / beta, ess: ess(a), maxShare: a.sum > 0 ? a.max / a.sum : null, hits: a.hits, adapted: path.some((x) => x.hits) } };
  }

  /* ---------- the catastrophe and systemic ruin test ---------- */

  /**
   * The exact quantities of the test: E N(T) of the Hawkes arrivals that start with no history, the expected cost of
   * the layer for each event, its price, the three policies with their capital, premium and cost, and the grid of the
   * total loss.
   * @param {any} c
   */
  function catSetup(c) {
    const p = c.p, sev = c.sev, tr = c.trunc;
    const EN = hawkesMean(p.nu, p.eta, p.decay, p.T);
    // ∫_a^b P(S > x) dx for the (truncated) event loss.
    const intSf = (/** @type {number} */ a, /** @type {number} */ b) => {
      const hi = tr ? Math.min(b, tr.M) : b;
      if (!(hi > a)) return 0;
      let base;
      if (sev.id === "exponential") base = (Math.exp(-sev.p.rate * a) - Math.exp(-sev.p.rate * hi)) / sev.p.rate;
      else if (sev.id === "pareto2") {
        const al = sev.p.alpha, sg = sev.p.sigma;
        base = Math.abs(al - 1) < 1e-12 ? sg * Math.log((1 + hi / sg) / (1 + a / sg)) : (hi === Infinity && al < 1 ? Infinity : (sg / (al - 1)) * (Math.exp((1 - al) * Math.log1p(a / sg)) - (hi === Infinity ? 0 : Math.exp((1 - al) * Math.log1p(hi / sg)))));
      } else base = gaussLegendre((x) => sev.sf(x), a, hi);
      return tr ? (base - tr.sfM * (hi - a)) / tr.FM : base;
    };
    const meanS = intSf(0, Infinity);
    const ceded = intSf(p.d, p.d + p.l);
    const price = (1 + p.load) * ceded * (EN / p.T) / p.K;
    const policies = [
      { id: "none", label: "No action", u: p.u, c: p.c, layer: false, cost: 0, costText: "no cost" },
      { id: "layer", label: `Layer ${g4(p.l)} xs ${g4(p.d)}`, u: p.u, c: p.c - price, layer: true, cost: p.load * ceded * EN, costText: `loading × expected recoveries over T: ${g4(p.load)} × ${g4(ceded * EN)}` },
      { id: "capital", label: `Extra capital ${g4(p.extra)}`, u: p.u + p.extra, c: p.c, layer: false, cost: p.coc * p.extra * p.K * p.T, costText: `cost of capital × extra × K × T: ${g4(p.coc)} × ${g4(p.extra)} × ${p.K} × ${g4(p.T)}` },
    ];
    const scale = Math.max(1e-9, EN * (Number.isFinite(meanS) ? meanS : sev.median));
    const grid = Array.from({ length: 241 }, (_, i) => scale * Math.pow(10, -2 + (7 * i) / 240));
    return { EN, meanS, ceded, price, policies, grid, loading: Number.isFinite(meanS) ? (p.c * p.K) / ((EN / p.T) * meanS) - 1 : null, expectedLoss: Number.isFinite(meanS) ? (EN / p.T) * meanS / p.K : Infinity };
  }

  /** ∫_a^b f by 64-point composite Gauss–Legendre on 16 panels (for a smooth bounded integrand on a finite range). @param {(x: number) => number} f @param {number} a @param {number} b */
  function gaussLegendre(f, a, b) {
    if (b === Infinity) {
      // x = a + t/(1 − t): the Weibull tail of the page decays fast enough for this substitution.
      return gaussLegendre((t) => f(a + t / (1 - t)) / ((1 - t) * (1 - t)), 0, 1 - 1e-12);
    }
    const X = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526], W = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
    let s = 0;
    const P = 64, h = (b - a) / P;
    for (let k = 0; k < P; k++) {
      const m = a + (k + 0.5) * h;
      for (let i = 0; i < 4; i++) s += W[i] * f(m + (X[i] * h) / 2);
    }
    return (s * h) / 2;
  }

  /**
   * E N(T) of Hawkes arrivals with baseline ν, branching ratio η and kernel ηβ exp(−βt), from no history:
   * νT/(1 − η) − νη (1 − exp(−β(1 − η)T)) / (β (1 − η)²).
   * @param {number} nu @param {number} eta @param {number} beta @param {number} T
   */
  function hawkesMean(nu, eta, beta, T) {
    if (eta === 0) return nu * T;
    const d = beta * (1 - eta);
    return (nu * T) / (1 - eta) - (nu * eta * -Math.expm1(-d * T)) / (d * (1 - eta));
  }

  /**
   * The next event of the Hawkes arrivals from the state (t, λ_E), with λ_E the excited part of the intensity above
   * ν: the baseline clock is exponential with rate ν', and the excited part fires after s with P(s < ∞) =
   * 1 − exp(−λ_E/β), from the exact algorithm of Dassios and Zhao (Electron. Commun. Probab. 18, 2013).
   * @param {Rng} rng @param {number} lamE @param {number} nu @param {number} beta
   */
  function nextEvent(rng, lamE, nu, beta) {
    const s2 = exp1(rng) / nu;
    let s1 = Infinity;
    if (lamE > 0) {
      const D = 1 + (beta * Math.log(rng.uniform())) / lamE;
      if (D > 0) s1 = -Math.log(D) / beta;
    }
    return s2 < s1 ? { dt: s2, immigrant: true } : { dt: s1, immigrant: false };
  }

  /** The arrival times of one path on [0, T], with the number of baseline (immigrant) events. @param {any} c @param {Rng} rng @param {number} nu */
  function arrivals(c, rng, nu) {
    const p = c.p, times = [];
    let t = 0, lamE = 0, imm = 0;
    for (;;) {
      const e = nextEvent(rng, lamE, nu, p.decay);
      if (t + e.dt > p.T) break;
      t += e.dt;
      lamE = lamE * Math.exp(-p.decay * e.dt) + p.eta * p.decay;
      times.push(t);
      if (e.immigrant) imm++;
      if (times.length > LIMITS.events) throw new Error(`A path has more than ${LIMITS.events} events. Lower η or T.`);
    }
    return { times, imm };
  }

  /** The shares of the K insurers in one event, W_j = 2 U_j with U from the copula (mean 1). @param {any} c @param {Rng} rng @param {number[]} out */
  function shares(c, rng, out) {
    const K = c.p.K, tau = c.p.tau;
    if (c.copula === "independent" || tau === 0) { for (let j = 0; j < K; j++) out[j] = 2 * rng.uniform(); return out; }
    if (c.copula === "gaussian") {
      const rc = Math.sin((Math.PI * tau) / 2), w0 = rng.normal();
      for (let j = 0; j < K; j++) out[j] = 2 * (1 - normSf(Math.sqrt(rc) * w0 + Math.sqrt(1 - rc) * rng.normal()));
      return out;
    }
    if (c.copula === "gumbel") {
      const a = 1 - tau, V = C.positiveStable(rng, a);
      for (let j = 0; j < K; j++) out[j] = 2 * Math.exp(-Math.pow(exp1(rng) / V, a));
      return out;
    }
    const th = (2 * tau) / (1 - tau), V = Cn.gamma(rng, 1 / th);
    for (let j = 0; j < K; j++) out[j] = 2 * Math.pow(1 + exp1(rng) / V, -1 / th);
    return out;
  }

  /**
   * The event loss with its cumulative hazard h under the (truncated) nominal law: x = F̄⁻¹(F̄(M) + F(M) e^(−h)). The
   * proposal gives h: standard exponential for the nominal law, divided by r for the hazard-rate twist.
   * @param {any} c @param {number} h
   */
  function lossOf(c, h) {
    const tr = c.trunc;
    if (!tr) return c.sev.Hinv(h);
    const v = tr.sfM + tr.FM * Math.exp(-h);
    return Math.min(tr.M, c.sev.Hinv(-Math.log(v)));
  }
  /** The cumulative hazard of the (truncated) event loss at x. @param {any} c @param {number} x */
  function hazardOf(c, x) {
    const tr = c.trunc;
    if (!tr) return c.sev.H(x);
    return -Math.log(Math.max(1e-300, (c.sev.sf(x) - tr.sfM) / tr.FM));
  }

  /** A fresh state of the insurers for one policy. @param {any} c @param {any} pol */
  function insurers(c, pol) {
    return { R: new Float64Array(c.p.K).fill(pol.u), alive: new Uint8Array(c.p.K).fill(1), d: 0, t: 0, hmax: 0 };
  }

  /**
   * Bring the insurers of one policy to time t (premium income), then apply one event of size S with shares W,
   * the layer if the policy has it, and the cascade of defaults. Returns the importance h after the event.
   * @param {any} c @param {any} pol @param {any} st @param {number} t @param {number} S @param {number[]} W
   */
  function applyEvent(c, pol, st, t, S, W) {
    const p = c.p, K = p.K;
    const dt = t - st.t;
    st.t = t;
    let fresh = 0;
    for (let j = 0; j < K; j++) if (st.alive[j]) { st.R[j] += pol.c * dt; if (st.R[j] < 0) fresh |= 1 << j; }
    if (S > 0) {
      const kept = pol.layer ? S - Math.min(Math.max(S - p.d, 0), p.l) : S;
      for (let j = 0; j < K; j++) if (st.alive[j]) { st.R[j] -= (kept * W[j]) / K; if (st.R[j] < 0) fresh |= 1 << j; }
    }
    cascade(c, pol, st, fresh);
    return score(c, pol, st);
  }

  /** Default the insurers in `fresh`, charge each survivor κ u for each default, and repeat until no new default. @param {any} c @param {any} pol @param {any} st @param {number} fresh */
  function cascade(c, pol, st, fresh) {
    const K = c.p.K;
    while (fresh) {
      let n = 0;
      for (let j = 0; j < K; j++) if (fresh & (1 << j) && st.alive[j]) { st.alive[j] = 0; st.d++; n++; }
      fresh = 0;
      if (!n || !c.p.kappa) break;
      for (let j = 0; j < K; j++) if (st.alive[j]) { st.R[j] -= n * c.p.kappa * pol.u; if (st.R[j] < 0) fresh |= 1 << j; }
    }
  }

  /** The importance of a state: min(m, defaults + the largest used fraction of capital of a survivor). @param {any} c @param {any} pol @param {any} st */
  function score(c, pol, st) {
    let worst = 0;
    for (let j = 0; j < c.p.K; j++) if (st.alive[j]) worst = Math.max(worst, 1 - st.R[j] / pol.u);
    const h = Math.min(c.p.m, st.d + Math.min(0.999999, Math.max(0, worst)));
    if (h > st.hmax) st.hmax = h;
    return h;
  }

  /**
   * One path of the test under a proposal, for every policy at once: the arrivals, the event losses and shares, the
   * insurers of each policy, the total loss and the largest event loss. The proposal changes the baseline rate (ν'),
   * the event losses (hazard-rate twist r, exponential tilt to mean `tilt`, or an exponential light family with mean
   * v), or one event chosen at random (the defensive mixture of adaptive importance sampling). Returns the log
   * likelihood ratio log f/g and the statistics of the updates.
   * @param {any} c @param {Rng} rng @param {any} q @param {any[]} pols
   */
  function catPath(c, rng, q, pols) {
    const p = c.p, nu = q.nu ?? p.nu;
    const { times, imm } = arrivals(c, rng, nu);
    const n = times.length;
    let logLR = nu !== p.nu ? imm * Math.log(p.nu / nu) + (nu - p.nu) * p.T : 0;
    const S = new Float64Array(n), H = new Float64Array(n);
    let chosen = -1;
    if (q.mix) chosen = n && rng.uniform() >= q.mix.beta ? rng.below(n) : -1;
    for (let e = 0; e < n; e++) {
      if (q.tilt) {
        // Exponential tilt of an exponential (or truncated exponential) loss to mean q.tilt.
        const mt = q.tilt, r0 = c.sev.p.rate, M = c.trunc ? c.trunc.M : Infinity;
        const FMt = M === Infinity ? 1 : -Math.expm1(-M / mt), FM = M === Infinity ? 1 : -Math.expm1(-r0 * M);
        const x = -mt * Math.log1p(-rng.uniform() * FMt);
        S[e] = x;
        logLR += Math.log(r0) - r0 * x - Math.log(FM) - (-Math.log(mt) - x / mt - Math.log(FMt));
      } else if (q.v !== undefined) {
        const x = Math.min(c.trunc ? c.trunc.M : Infinity, q.v * exp1(rng));
        S[e] = x;
        H[e] = hazardOf(c, x);
        logLR += (c.trunc && x >= c.trunc.M ? -Infinity : c.sev.logpdf(x) - (c.trunc ? Math.log(c.trunc.FM) : 0)) + Math.log(q.v) + x / q.v - (c.trunc ? Math.log(-Math.expm1(-c.trunc.M / q.v)) : 0);
      } else {
        const r = q.r && !q.mix ? q.r : 1, rr = e === chosen ? q.mix.r : r;
        const h = exp1(rng) / rr;
        H[e] = h;
        S[e] = lossOf(c, h);
        if (r !== 1) logLR += -(1 - r) * h - Math.log(r);
      }
    }
    if (q.mix && n) {
      // f/q = 1 / (β + (1 − β) (1/n) Σ_e g_r/f(S_e)), with g_r/f(x) = r exp((1 − r) h(x)).
      const r = q.mix.r;
      let lsum = -Infinity;
      for (let e = 0; e < n; e++) lsum = logAdd(lsum, Math.log(r) + (1 - r) * H[e]);
      logLR = -logAdd(Math.log(q.mix.beta), Math.log1p(-q.mix.beta) + lsum - Math.log(n));
    }
    const W = new Array(p.K).fill(0);
    const states = pols.map((pol) => insurers(c, pol));
    let total = 0, biggest = 0, hmaxH = 0;
    for (let e = 0; e < n; e++) {
      shares(c, rng, W);
      total += S[e];
      if (S[e] > biggest) { biggest = S[e]; hmaxH = H[e]; }
      pols.forEach((pol, a) => applyEvent(c, pol, states[a], times[e], S[e], W));
    }
    pols.forEach((pol, a) => applyEvent(c, pol, states[a], p.T, 0, W));
    let sumS = 0, sumH = 0;
    for (let e = 0; e < n; e++) { sumS += S[e]; sumH += H[e]; }
    return { logLR, n, imm, sumS, sumH, total, biggest, hBig: hmaxH, defaults: states.map((s) => s.d), hmax: states.map((s) => s.hmax), work: n * (1 + p.K) };
  }

  /** The quantities of a compiled problem: one probability for a walk problem; for the test, three for each policy and the extreme event loss. @param {any} c */
  function quantitiesOf(c) {
    if (c.problem !== "cat") return [{ name: c.problem === "sum" ? "tail" : "ruin", kind: "probability", alt: null, label: c.problem === "sum" ? `P(S_n > ${g4(c.x0)})` : `ψ(${g4(c.x0)})` }];
    const out = [];
    c.cat.policies.forEach((/** @type {any} */ pol, /** @type {number} */ a) => {
      out.push({ name: "systemic", kind: "probability", alt: a, label: `P(at least ${c.p.m} defaults by T)`, policy: pol.label });
      out.push({ name: "any", kind: "probability", alt: a, label: "P(at least one default by T)", policy: pol.label });
      out.push({ name: "defaults", kind: "expectation", alt: a, label: "E[number of defaults by T]", policy: pol.label });
    });
    out.push({ name: "extreme", kind: "probability", alt: null, label: `P(largest event loss > ${g4(c.p.xext)})`, policy: "all" });
    return out;
  }

  /** Accumulators for the test: the quantities and the grid of the total loss. @param {any} c */
  function catAcc(c) {
    return { q: c.quantities.map(() => iid()), exceed: new Float64Array(c.cat.grid.length), excess: new Float64Array(c.cat.grid.length), n: 0, count: 0, sumW: 0 };
  }

  /** Add one weighted path to the accumulators. `only` limits the policy quantities to one policy. @param {any} c @param {any} acc @param {any} x @param {number} w @param {number | null} only */
  function catAdd(c, acc, x, w, only) {
    const P = c.cat.policies.length;
    for (let a = 0; a < P; a++) {
      if (only !== null && a !== only) continue;
      add(acc.q[3 * a], x.defaults[a] >= c.p.m ? w : 0);
      add(acc.q[3 * a + 1], x.defaults[a] >= 1 ? w : 0);
      add(acc.q[3 * a + 2], w * x.defaults[a]);
    }
    add(acc.q[3 * P], x.biggest > c.p.xext ? w : 0);
    const grid = c.cat.grid;
    let k = 0;
    while (k < grid.length && grid[k] < x.total) { acc.exceed[k] += w; acc.excess[k] += w * (x.total - grid[k]); k++; }
    acc.n++;
    acc.count += x.n;
    acc.sumW += w;
  }

  /** One replication of a method on the test. @param {any} c @param {string} m @param {Rng} rng */
  function catReplication(c, m, rng) {
    const pols = c.cat.policies, P = pols.length, N = c.N, p = c.p;
    let work = 0;
    if (m === "direct" || m === "tilting") {
      const q = m === "tilting" ? { tilt: /** @type {number} */ (c.o.tilt) / c.sev.p.rate, nu: p.nu * /** @type {number} */ (c.o.arrivals) } : {};
      const acc = catAcc(c);
      for (let i = 0; i < N; i++) {
        const x = catPath(c, rng, q, pols);
        work += x.work;
        catAdd(c, acc, x, Math.exp(x.logLR), null);
      }
      return { est: acc.q.map((/** @type {any} */ a) => a.sum / a.n), iid: acc.q, work, grid: { exceed: acc.exceed, excess: acc.excess, n: acc.n }, diag: { events: acc.count / N, ...(m === "tilting" ? { tiltedMean: q.tilt, tiltedRate: q.nu, sumW: acc.sumW / N, ess: acc.q.map(ess) } : {}) } };
    }
    if (m === "splitting") {
      const est = c.quantities.map(() => /** @type {number | null} */ (null)), diags = [];
      for (let a = 0; a < P; a++) {
        const r = catSplitting(c, pols[a], rng);
        work += r.work;
        est[3 * a] = r.est;
        diags.push(r.diag);
      }
      return { est, iid: null, work, diag: { policies: diags } };
    }
    // The cross-entropy method and adaptive importance sampling adapt one proposal for each policy, then estimate
    // that policy's quantities, and the extreme event loss from every final sample.
    const acc = catAcc(c), diags = [];
    for (let a = 0; a < P; a++) {
      const r = /** @type {any} */ (m === "ce" ? catCE(c, a, rng) : catAIS(c, a, rng));
      work += r.work;
      if (r.error) return { est: null, iid: null, work, error: r.error, diag: { policies: [...diags, r.diag] } };
      for (let i = 0; i < N; i++) {
        const x = catPath(c, rng, r.q, pols);
        work += x.work;
        catAdd(c, acc, x, Math.exp(x.logLR), a);
      }
      diags.push(r.diag);
    }
    const est = acc.q.map((/** @type {any} */ x) => x.sum / x.n);
    return { est, iid: null, work, grid: { exceed: acc.exceed, excess: acc.excess, n: acc.n }, diag: { policies: diags } };
  }

  /** The cross-entropy adaptation for policy a of the test: levels on the path maximum of the importance h. @param {any} c @param {number} a @param {Rng} rng */
  function catCE(c, a, rng) {
    const light = c.failure === "light_family" && c.sev.id !== "exponential";
    /** @type {any} */
    let q = light ? { v: Number.isFinite(c.cat.meanS) ? c.cat.meanS : c.sev.median, nu: c.p.nu } : { r: 1, nu: c.p.nu };
    let Nce = Math.max(256, c.N >> 2), prev = -Infinity, reached = true;
    const rho = /** @type {number} */ (c.o.rho), top = c.p.m;
    const path = /** @type {any[]} */ ([{ gamma: null, q: { ...q } }]);
    let work = 0;
    for (let t = 0; ; t++) {
      if (t >= LIMITS.catIterations) { reached = false; break; }
      const xs = Array.from({ length: Nce }, () => catPath(c, rng, q, [c.cat.policies[a]]));
      for (const x of xs) work += x.work;
      const hs = xs.map((x) => (x.defaults[0] >= top ? top : x.hmax[0]));
      const lv = ceLevel(hs, rho, top, prev, Nce, c.N);
      Nce = lv.size;
      prev = lv.gamma;
      const gamma = lv.gamma;
      const w = normalise(xs.map((x, i) => (hs[i] >= gamma ? x.logLR : -Infinity)));
      let sw = 0, sn = 0, sH = 0, sS = 0, sI = 0;
      xs.forEach((x, i) => { if (!w[i]) return; sw += w[i]; sn += w[i] * x.n; sH += w[i] * x.sumH; sS += w[i] * x.sumS; sI += w[i] * x.imm; });
      if (sw > 0) {
        /** @type {any} */
        const next = { ...q, nu: Math.min(100 * c.p.nu, Math.max(c.p.nu / 100, sI / (sw * c.p.T))) || c.p.nu };
        if (light) { if (sn > 0) next.v = sS / sn; }
        else if (sH > 0 && sn > 0) next.r = Math.min(10, Math.max(1e-4, sn / sH));
        q = smooth(next, q);
      }
      path.push({ gamma, q: { ...q } });
      if (gamma >= top) break;
    }
    return { q, work, diag: { path, final: q, reached, family: light ? "exponential" : "hazard", infiniteVariance: light } };
  }

  /**
   * Adaptive importance sampling for policy a of the test: the defensive mixture that, with probability 1 − β, draws
   * one event chosen at random from the hazard-rate twist g_r (the one-big-event change of measure), and leaves the
   * other events and the arrivals nominal. The first r makes the typical size of the twisted event K u, which ruins
   * the insurers when it hits them; the steps update r from the cumulative hazard of the largest event of the paths
   * in the event.
   * @param {any} c @param {number} a @param {Rng} rng
   */
  function catAIS(c, a, rng) {
    const pol = c.cat.policies[a], beta = /** @type {number} */ (c.o.beta), Na = Math.max(256, c.N >> 2);
    let r = 1;
    if (c.failure !== "nominal_start") {
      const x0 = c.trunc ? Math.min(c.p.K * pol.u, 0.9 * c.trunc.M) : c.p.K * pol.u;
      r = Math.min(1, Math.max(1e-4, 1 / Math.max(1e-9, hazardOf(c, x0))));
    }
    const path = /** @type {any[]} */ ([{ hits: null, r }]);
    let work = 0;
    for (let t = 0; t < /** @type {number} */ (c.o.iters); t++) {
      const xs = Array.from({ length: Na }, () => catPath(c, rng, { mix: { beta, r } }, [pol]));
      let sw = 0, sh = 0, hits = 0;
      const w = normalise(xs.map((x) => (x.defaults[0] >= c.p.m ? x.logLR : -Infinity)));
      xs.forEach((x, i) => { work += x.work; if (w[i] > 0) { hits++; sw += w[i]; sh += w[i] * x.hBig; } });
      if (hits && sh > 0) r = Math.min(1, Math.max(1e-4, sw / sh));
      path.push({ hits, r });
    }
    return { q: { mix: { beta, r } }, work, diag: { path, final: { r }, beta, bound: 1 / beta, adapted: path.some((x) => x.hits) } };
  }

  /**
   * Fixed-effort splitting for one policy of the test on the Markov state (time, excited intensity, capital and
   * defaults of each insurer). The importance is h = min(m, defaults + the largest used fraction of capital of a
   * survivor), and the event is h = m. The stages split [0, m] in equal steps: 3m stages unless the settings say.
   * @param {any} c @param {any} pol @param {Rng} rng
   */
  function catSplitting(c, pol, rng) {
    const p = c.p, N = c.N, L = c.o.levels ?? 3 * p.m;
    const levels = Array.from({ length: L - 1 }, (_, j) => ((j + 1) * p.m) / L);
    const W = new Array(p.K).fill(0);
    const fresh = () => ({ ...insurers(c, pol), lamE: 0 });
    /** @param {any} s */
    const copy = (s) => ({ R: Float64Array.from(s.R), alive: Uint8Array.from(s.alive), d: s.d, t: s.t, hmax: s.hmax, lamE: s.lamE });
    let starts = [fresh()], est = 1, work = 0;
    const fractions = [], early = [];
    for (let j = 0; j < L; j++) {
      const final = j === L - 1, lev = final ? p.m : levels[j];
      const succ = [];
      let atOnce = 0;
      for (let i = 0; i < N; i++) {
        const st = j === 0 ? fresh() : copy(starts[rng.below(starts.length)]);
        const hit = () => (final ? st.d >= p.m : score(c, pol, st) > lev);
        if (hit()) { succ.push(st); atOnce++; continue; }
        for (;;) {
          const e = nextEvent(rng, st.lamE, p.nu, p.decay);
          if (st.t + e.dt > p.T) { applyEvent(c, pol, st, p.T, 0, W); if (hit()) succ.push(st); break; }
          const t = st.t + e.dt;
          st.lamE = st.lamE * Math.exp(-p.decay * e.dt) + p.eta * p.decay;
          const S = lossOf(c, exp1(rng));
          shares(c, rng, W);
          applyEvent(c, pol, st, t, S, W);
          work += 1 + p.K;
          if (hit()) { succ.push(st); break; }
        }
      }
      fractions.push(succ.length / N);
      early.push(atOnce / N);
      est *= succ.length / N;
      if (!succ.length) { est = 0; break; }
      starts = succ;
    }
    return { est, work, diag: { stages: L, fractions, early, levels } };
  }

  /* ---------- runs: blocks of replications, merge and summary ---------- */

  /**
   * Replication b of each method of the run. Each method and replication draws from its own stream (seed, "rare/" +
   * problem + "/" + method, b), so a replication gives the same result on any worker.
   * @param {any} c @param {number} b
   */
  function block(c, b) {
    const out = { block: b, methods: /** @type {any[]} */ ([]), error: "" };
    for (const m of c.methods) {
      if (c.refused[m]) { out.methods.push({ method: m, refused: c.refused[m] }); continue; }
      const rng = R.stream(c.seed, `${STREAM}/${c.problem}/${m}`, b, 0);
      const t0 = Date.now();
      try {
        const r = /** @type {any} */ (c.problem === "cat" ? catReplication(c, m, rng) : walkReplication(c, m, rng));
        const est = Array.isArray(r.est) ? r.est : [r.est];
        const iidq = r.iid ? (Array.isArray(r.iid) ? r.iid : [r.iid]) : null;
        out.methods.push({ method: m, refused: "", error: r.error ?? "", est, iid: iidq, work: r.work, grid: r.grid ?? null, diag: r.diag, ms: Date.now() - t0 });
      } catch (e) {
        out.methods.push({ method: m, refused: "", error: e instanceof Error ? e.message : String(e), est: null, iid: null, work: 0, grid: null, diag: null, ms: Date.now() - t0 });
      }
    }
    return out;
  }

  /** An empty accumulator of a run. @param {any} c @returns {any} */
  function empty(c) {
    return { blocks: 0, methods: c.methods.map((/** @type {string} */ m) => ({ method: m, refused: c.refused[m], error: "", reps: 0, q: c.quantities.map(() => ({ n: 0, mean: 0, m2: 0, missing: 0 })), iid: null, work: 0, ms: 0, grid: null, diags: [] })), trace: [] };
  }

  /**
   * Merge replication blk into the accumulator, in replication order: Welford sums of the replication estimates, the
   * pooled terms of the i.i.d. methods, the work, the grid of the total loss and the diagnostics.
   * @param {any} acc @param {any} blk @param {any} c @returns {any}
   */
  function merge(acc, blk, c) {
    if (blk.block !== acc.blocks) throw new Error(`Replication ${blk.block} arrived for position ${acc.blocks}.`);
    const methods = acc.methods.map((/** @type {any} */ prev, /** @type {number} */ k) => {
      const m = blk.methods[k];
      if (m.refused) return prev;
      if (m.error) return { ...prev, error: m.error };
      const q = prev.q.map((/** @type {any} */ s, /** @type {number} */ i) => {
        const v = m.est?.[i];
        if (v === null || v === undefined || !Number.isFinite(v)) return { ...s, missing: s.missing + 1 };
        const n = s.n + 1, d = v - s.mean, mean = s.mean + d / n;
        return { n, mean, m2: s.m2 + d * (v - mean), missing: s.missing };
      });
      const iidq = m.iid ? m.iid.map((/** @type {any} */ x, /** @type {number} */ i) => {
        const p = prev.iid?.[i] ?? iid();
        return { n: p.n + x.n, sum: p.sum + x.sum, sumsq: p.sumsq + x.sumsq, hits: p.hits + x.hits, max: Math.max(p.max, x.max) };
      }) : prev.iid;
      const grid = m.grid ? { exceed: (prev.grid?.exceed ?? new Float64Array(m.grid.exceed.length)).map((/** @type {number} */ v, /** @type {number} */ i) => v + m.grid.exceed[i]),
        excess: (prev.grid?.excess ?? new Float64Array(m.grid.excess.length)).map((/** @type {number} */ v, /** @type {number} */ i) => v + m.grid.excess[i]), n: (prev.grid?.n ?? 0) + m.grid.n } : prev.grid;
      return { ...prev, reps: prev.reps + 1, q, iid: iidq, work: prev.work + m.work, ms: prev.ms + m.ms, grid, diags: [...prev.diags, m.diag] };
    });
    const blocks = acc.blocks + 1;
    const next = { blocks, methods, trace: acc.trace };
    const sm = summary(c, next);
    return { ...next, trace: [...acc.trace, { reps: blocks, methods: sm.map((/** @type {any} */ x) => ({ work: x.work, est: x.q[0]?.est ?? null, lo: x.q[0]?.lo ?? null, hi: x.q[0]?.hi ?? null })) }] };
  }

  /**
   * Each estimate with an interval that fits its method: the Wilson interval (or the exact zero-hit bound) for
   * direct simulation, the CLT interval of the pooled i.i.d. terms for a fixed proposal, and the Student t interval
   * of the independent replications for the adaptive and multistage methods. Also the relative error, the work and
   * the work-normalised relative variance.
   * @param {any} c @param {any} acc
   */
  function summary(c, acc) {
    return acc.methods.map((/** @type {any} */ m) => {
      if (m.refused) return { method: m.method, refused: m.refused, error: "", reps: 0, q: [], work: 0 };
      const pooled = m.method === "direct" || m.method === "tilting";
      const q = c.quantities.map((/** @type {any} */ qu, /** @type {number} */ i) => {
        const s = m.q[i];
        if (!s.n) return { est: null, lo: null, hi: null, se: null, how: m.method === "splitting" && i % 3 !== 0 && qu.alt !== null ? "not estimated: splitting estimates the probability of one event" : m.method === "splitting" && qu.alt === null ? "not estimated by splitting" : "no replication yet", n: 0, relErr: null };
        if (pooled && m.iid) {
          const a = m.iid[i], est = a.sum / a.n;
          if (m.method === "direct" && qu.kind === "probability") {
            const k = a.hits;
            if (k === 0) return { est: 0, lo: 0, hi: S.zeroHitBound(a.n, 0.05), se: 0, how: "zero hits: exact one-sided 95 % bound 1 − 0.05^(1/n)", n: a.n, hits: 0, relErr: null };
            const w = S.wilson(k, a.n, Z95), se = Math.sqrt((est * (1 - est)) / a.n);
            return { est, lo: w[0], hi: w[1], se, how: "Wilson score interval, 95 %", n: a.n, hits: k, relErr: se / est };
          }
          const v = a.n > 1 ? Math.max(0, (a.sumsq - (a.sum * a.sum) / a.n) / (a.n - 1)) : 0, se = Math.sqrt(v / a.n);
          if (a.hits === 0) return { est: 0, lo: null, hi: null, se: null, how: "no path in the event: the estimate 0 has no interval", n: a.n, hits: 0, relErr: null };
          return { est, lo: est - Z95 * se, hi: est + Z95 * se, se, how: `CLT interval of ${a.n.toLocaleString("en-US")} i.i.d. weighted terms, 95 %`, n: a.n, hits: a.hits, relErr: est > 0 ? se / est : null };
        }
        if (s.n < 2) return { est: s.mean, lo: null, hi: null, se: null, how: "one replication: no interval", n: s.n, relErr: null };
        const se = Math.sqrt(s.m2 / (s.n - 1) / s.n), t = tQuantile975(s.n - 1);
        return { est: s.mean, lo: s.mean - t * se, hi: s.mean + t * se, se, how: `Student t interval of ${s.n} independent replications, 95 %${s.missing ? `. ${s.missing} replications failed` : ""}`, n: s.n, relErr: s.mean > 0 ? se / s.mean : null };
      });
      const wnrv = q[0]?.relErr ? q[0].relErr * q[0].relErr * m.work : null;
      return { method: m.method, refused: "", error: m.error, reps: m.reps, q, work: m.work, ms: m.ms, wnrv, risk: c.problem === "cat" && m.grid ? risk(c, m.grid) : null, diag: diagSummary(c, m) };
    });
  }

  /**
   * The value at risk and the expected shortfall of the total loss at level q from the weighted grid: VaR_q is the
   * smallest x with P(L > x) ≤ 1 − q (by log-linear interpolation between grid points), and ES_q = VaR_q +
   * E[(L − VaR_q)⁺]/(1 − q). ES is infinite when the mean event loss is infinite (α ≤ 1 with no truncation).
   * @param {any} c @param {any} g
   */
  function risk(c, g) {
    const q = c.p.q, grid = c.cat.grid, n = g.n;
    const sf = Array.from(g.exceed, (/** @type {number} */ v) => v / n);
    let k = sf.findIndex((v) => v <= 1 - q);
    if (k < 0) return { var: null, es: null, how: `The grid ends at ${g4(grid[grid.length - 1])}: P(L > x) is above ${g4(1 - q)} there.` };
    let x = grid[k];
    if (k > 0 && sf[k - 1] > sf[k]) {
      const t = (Math.log(sf[k - 1]) - Math.log(1 - q)) / (Math.log(sf[k - 1]) - Math.log(Math.max(sf[k], 1e-300)));
      x = Math.exp(Math.log(grid[k - 1]) + Math.min(1, Math.max(0, t)) * (Math.log(grid[k]) - Math.log(grid[k - 1])));
      k = k - 1;
    }
    const finiteMean = Number.isFinite(c.cat.meanS);
    let es = null;
    if (finiteMean) {
      // E[(L − x)⁺] at the grid point below x, less (x − grid[k]) P(L > x): exact for the weighted sample.
      const ex = g.excess[k] / n - (x - grid[k]) * sf[Math.min(sf.length - 1, k + 1)];
      es = x + Math.max(0, ex) / (1 - q);
    }
    return { var: x, es, how: finiteMean ? `from the weighted sample on a grid of ${grid.length} points` : "ES is infinite: the mean event loss is infinite (α ≤ 1 and no truncation), so E[L | L > VaR] = ∞. The page shows no number." };
  }

  /** The diagnostics of a method over its replications. @param {any} c @param {any} m */
  function diagSummary(c, m) {
    const ds = /** @type {any[]} */ (m.diags.filter(Boolean));
    if (!ds.length) return null;
    const last = ds[ds.length - 1];
    const meanOf = (/** @type {(d: any) => number | null | undefined} */ f) => { const v = /** @type {number[]} */ (ds.map(f).filter((x) => typeof x === "number" && Number.isFinite(x))); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    if (c.problem === "cat") return { last, events: meanOf((d) => d.events) };
    return { last, ess: meanOf((d) => d.ess), maxShare: meanOf((d) => d.maxShare), accept: meanOf((d) => d.accept), levels: meanOf((d) => d.levels ?? d.stagesRun), adapted: ds.every((d) => d.adapted !== false) };
  }

  /**
   * The decision: for a walk problem, whether the probability meets the target; for the test, the cheapest policy
   * whose systemic ruin probability meets the target (met: the whole interval is below it; not separable: the
   * interval holds it).
   * @param {any} c @param {any} sm one method's summary
   */
  function decide(c, sm) {
    if (!sm || sm.refused || !sm.q.length) return null;
    const verdict = (/** @type {any} */ x) => (x.est === null ? "unknown" : (x.hi ?? x.est) <= c.p.target ? "met" : (x.lo ?? x.est) > c.p.target ? "not met" : "not separable");
    if (c.problem !== "cat") return { rows: [{ label: c.quantities[0].label, verdict: verdict(sm.q[0]) }], best: null };
    const rows = c.cat.policies.map((/** @type {any} */ pol, /** @type {number} */ a) => ({ a, label: pol.label, cost: pol.cost, verdict: verdict(sm.q[3 * a]) }));
    const ok = rows.filter((/** @type {any} */ r) => r.verdict === "met" || r.verdict === "not separable");
    const best = ok.length ? ok.reduce((/** @type {any} */ x, /** @type {any} */ y) => (y.cost < x.cost ? y : x)) : null;
    return { rows, best: best ? best.a : null, separated: best ? best.verdict === "met" : null };
  }

  /** Change one parameter of a record, for a sweep. @param {any} record @param {string} name @param {number} v */
  function withParam(record, name, v) {
    const vals = typeof record.params === "string" ? parseParams(record.params).values : { ...record.params };
    vals[name] = String(+v.toPrecision(10));
    return { ...record, params: Object.entries(vals).map(([k, x]) => `${k}=${x}`).join("; ") };
  }


  /** A number as text for the report: at most 4 significant digits, never NaN or Infinity. @param {number | null | undefined} v */
  function num(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "not available";
    const a = Math.abs(v);
    return a !== 0 && (a < 1e-4 || a >= 1e7) ? v.toExponential(2) : String(+v.toPrecision(4));
  }
  /** Words that read as speech. @param {string} t */
  const say = (t) => String(t).replace(/_/g, " ").replace(/[$\\`*#|<>×%&≈^]/g, " ").replace(/\s+/g, " ").trim();
  const VERDICT_SAY = /** @type {Record<string, string>} */ ({ met: "The estimate meets the target.", "not met": "The estimate does not meet the target.", "not separable": "The interval holds the target, so the run cannot decide.", unknown: "The run has no estimate yet." });
  const NAMES = /** @type {Record<string, string>} */ ({ direct: "Direct simulation", tilting: "Exponential tilting", splitting: "Multilevel splitting", subset: "Subset simulation", ais: "Adaptive importance sampling", ce: "Cross-entropy method" });

  /**
   * The plain-data report of the rare-event lab, in the shape that the kit writes as the Markdown record and the site's
   * beamdswitch template writes as a deck: the problem, the methods, the estimates with their intervals and claim tags,
   * the reference, the decision, the diagnostics and the limitations.
   * @param {any} c a compiled problem @param {any[] | null} sm the summary @param {any} ref the reference @param {any} texts data.rare
   * @param {{ status: string, replications: number, seed: number }} run
   */
  function report(c, sm, ref, texts, run) {
    const meta = { title: "Monte Carlo Probability Workbench", subtitle: "Rare events and ruin", voice: "bf_emma" };
    if (!c.ok) {
      return { meta, narration: "This deck reads a rare-event setting with errors.", setup: [{ title: "The setting has errors", body: c.errors.map((/** @type {string} */ e) => `- ${e}`).join("\n"), narration: "The setting has errors, so the page did not run it." }],
        method: [{ title: "No method ran", body: "Correct the setting first.", narration: "No method ran." }], results: [{ title: "No results", body: "The setting has errors.", narration: "There are no results." }],
        checks: [{ title: "Takeaway", key: "Correct the setting before you read any result.", narration: "Correct the setting before you read any result." }] };
    }
    const pr = texts.problems.find((/** @type {any} */ x) => x.id === c.problem);
    meta.subtitle = `${pr.title}: ${c.methods.map((/** @type {string} */ m) => NAMES[m]).join(" and ")}, seed ${run.seed}`;
    const params = Object.entries(c.p).map(([k, v]) => `${k} = ${num(/** @type {number} */ (v))}`).join(", ");
    const setup = [
      { title: `The problem: ${pr.title}`, body: [pr.statement, pr.decision, pr.data].join("\n\n"), narration: say(pr.statement) },
      { title: "The model", body: `- Law: ${c.problem === "cat" ? c.sev.text : c.problem === "ruin" ? `claims ${c.claim.text}; ladder heights ${c.J.text}; ρ = ${num(c.rho)}` : c.J.text}\n- Parameters: ${params}${c.copula ? `\n- Copula of the shares: ${c.copula}` : ""}\n- ${pr.dependence}`,
        narration: `The model uses the ${c.problem === "cat" ? c.sev.name : c.J.name} law. ${say(pr.reason)}` },
    ];
    const method = c.methods.map((/** @type {string} */ id) => {
      const m = texts.methods.find((/** @type {any} */ x) => x.id === id);
      return { title: `Method: ${m.name}`, body: c.refused[id] ? `**Refused.** ${c.refused[id]}` : `$$${m.estimator}$$\n\n${m.estimatorText}\n\n- ${c.R} replications of ${c.N} paths\n- Seed ${run.seed}, generator Philox4x32-10, one stream for each method and replication${c.failure !== "none" ? `\n- Assumption failure: ${c.failure.replace(/_/g, " ")}` : ""}`,
        narration: c.refused[id] ? `The page refuses ${m.name.toLowerCase()} here. ${say(c.refused[id])}` : `${m.name} with ${c.R} replications of ${c.N} paths.` };
    });
    const results = [];
    if (!sm) results.push({ title: "No run yet", body: `Run the lab to fill this frame. Reference: ${ref && ref.value !== null ? `${num(ref.value)}, ${ref.how}` : ref?.how ?? "none"}.`, narration: "The page has no run yet." });
    else {
      const rows = ["| Method | Quantity | Estimate | 95 % interval | Claim |", "| --- | --- | --- | --- | --- |"];
      for (const m of sm) {
        if (m.refused || m.error) { rows.push(`| ${NAMES[m.method]} | – | – | ${(m.refused ? `refused: ${m.refused}` : m.error).replace(/\|/g, "/")} | – |`); continue; }
        c.quantities.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
          if (c.problem === "cat" && q.name !== "systemic" && q.name !== "extreme") return;
          const x = m.q[i];
          rows.push(`| ${NAMES[m.method]} | ${q.label}${q.policy ? `, ${q.policy}` : ""} | ${num(x.est)} | ${x.lo === null || x.lo === undefined ? x.how : `${num(x.lo)} to ${num(x.hi)}`} | finite-run observation |`);
        });
      }
      const first = sm.find((/** @type {any} */ m) => !m.refused && !m.error);
      results.push({ title: `Results after ${run.replications} replications (${run.status})`, body: `${rows.join("\n")}\n\nReference: ${ref && ref.value !== null ? `${num(ref.value)}, ${ref.how} (${ref.kind === "exact" ? "theorem" : "numerical approximation"})` : ref?.how ?? "none"}.`,
        narration: first ? `${first.method === "direct" ? "Direct simulation" : NAMES[first.method]} estimates ${num(first.q[0].est)}.${run.status === "done" ? "" : " The run is not complete, so the values are partial."}` : "No method gave an estimate." });
      const dec = first ? decide(c, first) : null;
      if (dec) results.push({ title: "Decision", body: c.problem === "cat" ? `${dec.best === null ? "No policy meets the target." : `${c.cat.policies[dec.best].label} is the cheapest policy that ${dec.separated ? "meets" : "can meet"} the target ${num(c.p.target)}.`}\n\n${dec.rows.map((/** @type {any} */ r) => `- ${r.label}: cost ${num(r.cost)}, ${r.verdict}`).join("\n")}` : `Target ${num(c.p.target)}: ${dec.rows[0].verdict}.`,
        narration: c.problem === "cat" ? (dec.best === null ? "No policy meets the target." : `The cheapest policy that ${dec.separated ? "meets" : "can meet"} the target is ${say(c.cat.policies[dec.best].label)}.`) : VERDICT_SAY[dec.rows[0].verdict] });
    }
    const checks = [
      { title: "Diagnostics", body: pr.diagnostics, narration: "The methods check each other, and each change of measure shows its effective sample size, which is a diagnostic, not a proof." },
      { title: "Limitations and takeaway", body: [`- ${pr.interpretation}`, "- Each estimate is a finite-run observation. A finite sample variance is not a population guarantee.", "- The parameters are illustrative, not calibrated evidence."].join("\n"), key: pr.interpretation.split(". ")[0] + ".", narration: say(pr.interpretation.split(". ")[0]) },
    ];
    return { meta, narration: `This deck reads the rare-event problem ${say(pr.title)}.`, setup, method, results, checks };
  }

  return { FORMAT, VERSION, STREAM, PROBLEMS, METHODS, LAWS, COPULAS, FAILURES, LIMITS, PARAMS, OPTIONS, paramsFor, parseParams, jump, integratedTail, erlangSf, ldpExponential, asmussenKroese, hawkesMean,
    normSf, tQuantile975, prepare, refusal, reference, block, empty, merge, summary, decide, risk, withParam, walkPath, catPath, shares, lossOf, hazardOf, catSetup, gaussLegendre, report };
});
