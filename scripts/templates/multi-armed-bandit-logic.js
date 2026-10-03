/* Pure logic for the multi-armed-bandit page: numerics, state, validation and the simulation.
 *
 * No DOM. The page inlines this file (compacted) as <script id="mab-logic">, and
 * yujieteo/multi-armed-bandit's tests/multi-armed-bandit.test.mjs runs that shipped copy. Everything is deterministic given a
 * generator state:
 *
 *   Generator  xoshiro128** (Blackman and Vigna), four 32-bit words of state, seeded by splitmix32
 *              from (seed, stream). Not cryptographic. The state is a plain array, so it serialises.
 *   Beta draw  X/(X+Y) with X, Y gamma draws (Marsaglia and Tsang; shapes below 1 use the
 *              U^(1/a) boost), carried in logarithms so tiny shapes cannot underflow to 0/0.
 *   Quantile   the regularised incomplete beta function (Lentz continued fraction, Lanczos log
 *              gamma), inverted by safeguarded Newton steps inside a bisection bracket.
 *   UCB1       s/n + sqrt(2 ln T / n); an untried variant is recommended first, so ln 0 never occurs.
 *
 * The experiment state is a plain JSON document (the same shape is autosaved, exported and
 * imported). The simulation is rebuilt from its settings and replayed to its completed pull count.
 */
/**
 * @typedef {number[]} Rng four 32-bit words of xoshiro128** state
 * @typedef {{ id: string, name: string, successes: number, trials: number, sample: number }} Variant
 * @typedef {{ a: number, b: number }} Prior
 * @typedef {{ probabilities: number[], budget: number, seed: number, pulls: number, thompsonRng?: Rng }} SimSettings
 * @typedef {"title" | "success" | "unit"} TextField
 * @typedef {{ format: string, version: number, template: string, basis: string, title: string, success: string, unit: string, prior: Prior,
 *   variants: Variant[], selected: string | null, nextId: number, rng: Rng, simulation: SimSettings }} State
 * @typedef {{ id: string, label: string, note: string, title: string, success: string, unit: string, fictional?: boolean,
 *   variants: { name: string, successes: number, trials: number }[] }} Template
 * @typedef {{ templates: Template[], assumptions: unknown, references: unknown }} PageData
 * @typedef {{ state: State, unchanged?: boolean, error?: undefined, field?: undefined } | { error: string, field?: string, state?: undefined, unchanged?: undefined }} Change
 * @typedef {{ mean: number, bonus: number, score: number }} UcbScore
 * @typedef {{ successes: number[], trials: number[], pulls: number, total: number, regret: number, curve: number[], regretCurve: number[] }} MethodRun
 * @typedef {{ probabilities: number[], budget: number, seed: number, prior: Prior, k: number, best: number, rewards: Uint8Array[], rng: Rng,
 *   methods: Record<string, MethodRun> }} Sim
 * @typedef {{ counts: [string, number, number, number][], rng: Rng, selected: string | null, basis: string }} Snapshot
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BanditLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMAT = "multi-armed-bandit", VERSION = 1;
  /** @type {Record<string, number>} */
  const LIMITS = { minVariants: 2, maxVariants: 10, maxCount: 1000000, priorMin: 0.1, priorMax: 100, name: 80, title: 120, success: 300, unit: 120,
    maxBudget: 2000, maxSeed: 4294967295 };
  const SIM_DEFAULTS = { probabilities: [0.08, 0.12, 0.15], budget: 1000, seed: 42, added: 0.1 };
  const METHODS = [["ts", "Thompson Sampling"], ["ucb", "UCB1"], ["eq", "Equal allocation"]];
  const TEMPLATES = ["website", "email", "study", "outreach", "custom"];

  /* ---- Seeded generator ---- */
  /** @param {number} x @returns {[number, number]} */
  function splitmix(x) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return [x, (z ^ (z >>> 16)) >>> 0];
  }
  /* Four words from (seed, stream): stream 0 is the experiment, 1 the simulation's Thompson draws,
     and 2 + j the rewards of simulation variant j. */
  /** @param {number} seed @param {number} [stream] @returns {Rng} */
  function seedState(seed, stream) {
    let x = ((seed >>> 0) ^ Math.imul((stream || 0) + 1, 0x632be5ab)) >>> 0;
    const s = [];
    for (let i = 0; i < 4; i += 1) { const r = splitmix(x); x = r[0]; s.push(r[1]); }
    if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
    return s;
  }
  /** @param {number} x @param {number} k */
  const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
  /** @param {Rng} s */
  function next(s) {
    const out = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0; s[3] = (s[3] ^ s[1]) >>> 0; s[1] = (s[1] ^ s[2]) >>> 0; s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0; s[3] = rotl(s[3], 11);
    return out;
  }
  /* Uniform in the open interval (0, 1). */
  /** @param {Rng} s */
  const uniform = (s) => (next(s) + 0.5) / 4294967296;

  /* ---- Special functions ---- */
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  /** @param {number} x @returns {number} */
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  /** @param {number} a @param {number} b */
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  /** @param {number} x @param {number} a @param {number} b */
  function betacf(x, a, b) {
    const TINY = 1e-300;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 100000; m += 1) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  /* Regularised incomplete beta I_x(a, b). */
  /** @param {number} x @param {number} a @param {number} b */
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lf = a * Math.log(x) + b * Math.log1p(-x) - lbeta(a, b);
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lf) * betacf(x, a, b) / a;
    return 1 - Math.exp(lf) * betacf(1 - x, b, a) / b;
  }
  /** @param {number} p @param {number} a @param {number} b */
  function betaQuantile(p, a, b) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    const lb = lbeta(a, b);
    let lo = 0, hi = 1;
    const m = a / (a + b), sd = Math.sqrt(a * b / ((a + b) * (a + b) * (a + b + 1)));
    let x = Math.min(1 - 1e-12, Math.max(1e-12, m + (p < 0.5 ? -2 : 2) * sd * Math.abs(p - 0.5)));
    for (let i = 0; i < 300; i += 1) {
      const f = ibeta(x, a, b) - p;
      if (f === 0) return x;
      if (f < 0) lo = x; else hi = x;
      const pdf = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lb);
      let nx = x - f / pdf;
      if (!(nx > lo && nx < hi)) nx = lo > 0 && hi / lo > 4 ? Math.sqrt(lo * hi) : (lo + hi) / 2;
      if (Math.abs(nx - x) <= 1e-15 * Math.max(x, 1e-300) || hi - lo <= 1e-16 * hi) return nx;
      x = nx;
    }
    return x;
  }

  /* ---- Sampling ---- */
  /** @param {Rng} s */
  function normal(s) {
    return Math.sqrt(-2 * Math.log(uniform(s))) * Math.cos(2 * Math.PI * uniform(s));
  }
  /* Logarithm of a Gamma(a, 1) draw. */
  /** @param {Rng} s @param {number} a @returns {number} */
  function logGamma(s, a) {
    if (a < 1) return logGamma(s, a + 1) + Math.log(uniform(s)) / a;
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = normal(s), v = 1 + c * x;
      if (v <= 0) continue;
      const v3 = v * v * v, u = uniform(s);
      if (Math.log(u) < 0.5 * x * x + d - d * v3 + d * Math.log(v3)) return Math.log(d) + Math.log(v3);
    }
  }
  /** @param {Rng} s @param {number} a @param {number} b */
  function sampleBeta(s, a, b) {
    const lx = logGamma(s, a), ly = logGamma(s, b);
    const r = 1 / (1 + Math.exp(ly - lx));
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  /* ---- Formatting shared by the page, the deck and the tools ---- */
  /** @param {number} n */
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  /** @param {number | null | undefined} v @param {number} [d] */
  function pct(v, d) {
    if (v == null) return "—";
    const k = d == null ? 1 : d, unit = Math.pow(10, -k - 2);
    if (v > 0 && v < unit) return "<" + (unit * 100).toFixed(k) + "%";
    if (v < 1 && v > 1 - unit) return ">" + (100 - unit * 100).toFixed(k) + "%";
    return (v * 100).toFixed(k) + "%";
  }
  /** @param {number} v @param {number} [d] */
  const num = (v, d) => v.toFixed(d == null ? 4 : d);
  /** @param {number} x */
  const fmtPrior = (x) => String(+x.toPrecision(6));

  /* ---- Experiment ---- */
  /** @param {Prior} prior @param {{ successes: number, trials: number }} v @returns {[number, number]} */
  function posterior(prior, v) { return [prior.a + v.successes, prior.b + v.trials - v.successes]; }
  /** @param {State} state */
  function resample(state) {
    const st = state.rng.slice();
    for (const v of state.variants) { const p = posterior(state.prior, v); v.sample = sampleBeta(st, p[0], p[1]); }
    state.rng = st;
    return state;
  }
  /** @param {{ successes: number, trials: number }[]} variants @returns {{ T: number, scores: (UcbScore | null)[], best: number, untried: boolean }} */
  function ucb(variants) {
    const T = variants.reduce((t, v) => t + v.trials, 0);
    const untried = variants.findIndex((v) => v.trials === 0);
    const scores = variants.map((v) => {
      if (!v.trials) return null;
      const mean = v.successes / v.trials, bonus = Math.sqrt(2 * Math.log(T) / v.trials);
      return { mean, bonus, score: mean + bonus };
    });
    let best = untried;
    // @ts-expect-error no variant is untried here, so no score is null
    if (best < 0) { best = 0; scores.forEach((x, i) => { if (x.score > scores[best].score) best = i; }); }
    return { T, scores, best, untried: untried >= 0 };
  }
  /** @param {number[]} xs */
  function argmax(xs) { let b = 0; xs.forEach((x, i) => { if (x > xs[b]) b = i; }); return b; }

  /** @param {PageData} D @param {string} id @param {number} seed @returns {State} */
  function fromTemplate(D, id, seed) {
    const t = D.templates.find((x) => x.id === id) || D.templates[0];
    const variants = t.variants.map((v, i) => ({ id: "v" + (i + 1), name: v.name, successes: v.successes, trials: v.trials, sample: 0 }));
    const state = { format: FORMAT, version: VERSION, template: t.id, basis: t.fictional ? "fictional" : "entered",
      title: t.title, success: t.success, unit: t.unit, prior: { a: 1, b: 1 }, variants, selected: null, nextId: variants.length + 1,
      rng: seedState(seed, 0), simulation: { probabilities: simProbabilities([], variants.length), budget: SIM_DEFAULTS.budget, seed: SIM_DEFAULTS.seed, pulls: 0 } };
    return resample(state);
  }
  /** @param {number[]} old @param {number} k */
  function simProbabilities(old, k) {
    const out = [];
    for (let i = 0; i < k; i += 1) out.push(i < old.length ? old[i] : old.length ? SIM_DEFAULTS.added : SIM_DEFAULTS.probabilities[i] == null ? SIM_DEFAULTS.added : SIM_DEFAULTS.probabilities[i]);
    return out;
  }
  /** @template T @param {T} x @returns {T} */
  const clone = (x) => JSON.parse(JSON.stringify(x));
  /** @param {State} state */
  const ready = (state) => !!(state.title.trim() && state.success.trim() && state.unit.trim());

  /* Field validation: an error message, or null. */
  const WHOLE = /^\d+$/, DECIMAL = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
  /** @param {string | number} raw @param {number} lo @param {number} hi @param {string} what */
  function wholeError(raw, lo, hi, what) {
    const s = String(raw).trim();
    if (!WHOLE.test(s) || +s < lo || +s > hi) return what + " must be a whole number from " + group(lo) + " to " + group(hi) + ".";
    return null;
  }
  /** @param {string} field one of the text fields: title, success, unit or name @param {unknown} raw */
  function textError(field, raw) {
    const s = String(raw == null ? "" : raw).trim(), max = LIMITS[field];
    const label = { title: "Experiment title", success: "Success definition", unit: "Trial unit", name: "Variant name" }[field];
    if (!s) return label + " is required.";
    if (s.length > max) return label + " must be at most " + max + " characters (now " + s.length + ").";
    return null;
  }
  /** @param {State} state @param {number} index @param {unknown} raw */
  function nameError(state, index, raw) {
    const e = textError("name", raw);
    if (e) return e;
    const key = String(raw).trim().toLowerCase();
    if (state.variants.some((v, i) => i !== index && v.name.trim().toLowerCase() === key)) return "Variant names must be unique, ignoring case.";
    return null;
  }
  /** @param {string | number} rawS @param {string | number} rawN */
  function countsError(rawS, rawN) {
    const e = wholeError(rawS, 0, LIMITS.maxCount, "Successes") || wholeError(rawN, 0, LIMITS.maxCount, "Trials");
    if (e) return e;
    if (+String(rawS).trim() > +String(rawN).trim()) return "Successes cannot exceed trials.";
    return null;
  }
  /** @param {string | number} raw @param {string} which */
  function priorError(raw, which) {
    const s = String(raw).trim();
    if (!DECIMAL.test(s) || !(+s >= LIMITS.priorMin && +s <= LIMITS.priorMax)) return "Prior " + which + " must be a number from 0.1 to 100.";
    return null;
  }

  /* Commands return { state } with a new state, or { error }. They never change their input. */
  /** @param {State} state @param {TextField} field @param {unknown} raw @returns {Change} */
  function setText(state, field, raw) {
    const e = textError(field, raw);
    if (e) return { error: e };
    const s = clone(state); s[field] = String(raw).trim();
    return { state: s };
  }
  /** @param {State} state @param {number} index @param {unknown} raw @returns {Change} */
  function rename(state, index, raw) {
    const e = nameError(state, index, raw);
    if (e) return { error: e };
    const s = clone(state); s.variants[index].name = String(raw).trim();
    return { state: s };
  }
  /** @param {State} s */
  const touched = (s) => { if (s.basis === "fictional") s.basis = "mixed"; return s; };
  /** @param {State} state @param {number} index @param {string | number} rawS @param {string | number} rawN @returns {Change} */
  function setCounts(state, index, rawS, rawN) {
    const e = countsError(rawS, rawN);
    if (e) return { error: e };
    const s = clone(state), v = s.variants[index];
    const ns = +String(rawS).trim(), nn = +String(rawN).trim();
    if (ns === v.successes && nn === v.trials) return { state: s, unchanged: true };
    v.successes = ns; v.trials = nn;
    return { state: resample(touched(s)) };
  }
  /** @param {State} state @param {string | number} rawA @param {string | number} rawB @returns {Change} */
  function setPrior(state, rawA, rawB) {
    const e = priorError(rawA, "a") || priorError(rawB, "b");
    if (e) return { error: e };
    const s = clone(state);
    if (s.prior.a === +rawA && s.prior.b === +rawB) return { state: s, unchanged: true };
    s.prior = { a: +String(rawA).trim(), b: +String(rawB).trim() };
    s.simulation.pulls = 0;
    return { state: resample(s) };
  }
  /** @param {State} state @returns {Change} */
  function addVariant(state) {
    if (state.variants.length >= LIMITS.maxVariants) return { error: "At most " + LIMITS.maxVariants + " variants." };
    const s = clone(state);
    // @ts-expect-error name is a string: the loop body assigns it before the test reads it
    let n = s.variants.length, name;
    // @ts-expect-error name is a string, as above
    do { name = "Variant " + (n < 26 ? String.fromCharCode(65 + n) : n + 1); n += 1; } while (s.variants.some((v) => v.name.toLowerCase() === name.toLowerCase()));
    s.variants.push({ id: "v" + s.nextId, name, successes: 0, trials: 0, sample: 0 });
    s.nextId += 1;
    s.simulation.probabilities = simProbabilities(s.simulation.probabilities, s.variants.length);
    s.simulation.budget = Math.max(s.simulation.budget, s.variants.length);
    s.simulation.pulls = 0;
    return { state: resample(s) };
  }
  /** @param {State} state @param {number} index @returns {Change} */
  function removeVariant(state, index) {
    if (state.variants.length <= LIMITS.minVariants) return { error: "At least " + LIMITS.minVariants + " variants are needed." };
    const s = clone(state);
    const [gone] = s.variants.splice(index, 1);
    s.simulation.probabilities.splice(index, 1);
    s.simulation.pulls = 0;
    if (s.selected === gone.id) s.selected = null;
    return { state: resample(touched(s)) };
  }
  /** @param {State} state @param {string} id @returns {Change} */
  function select(state, id) {
    if (!state.variants.some((v) => v.id === id)) return { error: "No such variant." };
    const s = clone(state); s.selected = id;
    return { state: s };
  }
  /** @param {State} state */
  function canRecord(state) {
    const v = state.variants.find((x) => x.id === state.selected);
    if (!v) return "Select a variant first.";
    if (!ready(state)) return "Define the experiment title, success and trial unit first.";
    if (v.trials >= LIMITS.maxCount) return "This variant has reached the limit of " + group(LIMITS.maxCount) + " trials.";
    return null;
  }
  /** @param {State} state @param {boolean} success @returns {Change} */
  function record(state, success) {
    const e = canRecord(state);
    if (e) return { error: e };
    const s = clone(state), v = s.variants.find((x) => x.id === s.selected);
    // @ts-expect-error canRecord() has checked that the selected variant exists
    v.trials += 1;
    // @ts-expect-error as above
    if (success) v.successes += 1;
    return { state: resample(touched(s)) };
  }
  /* Undo keeps evidence, samples, generator and selection; names and settings are left as they are. */
  /** @param {State} state @returns {Snapshot} */
  function snapshot(state) {
    return { counts: state.variants.map((v) => [v.id, v.successes, v.trials, v.sample]), rng: state.rng.slice(), selected: state.selected, basis: state.basis };
  }
  /** @param {State} state @param {Snapshot} snap */
  function restore(state, snap) {
    const s = clone(state);
    for (const [id, su, tr, sa] of snap.counts) { const v = s.variants.find((x) => x.id === id); if (v) Object.assign(v, { successes: su, trials: tr, sample: sa }); }
    s.rng = snap.rng.slice(); s.selected = snap.selected; s.basis = snap.basis;
    return s;
  }
  /** @param {State} state @param {{ probabilities: (string | number)[], budget: string | number, seed: string | number }} raws @returns {Change} */
  function setSimulation(state, raws) {
    const k = state.variants.length;
    const probs = [];
    for (let i = 0; i < k; i += 1) {
      const r = String(raws.probabilities[i]).trim();
      if (!DECIMAL.test(r) || !(+r >= 0 && +r <= 100)) return { error: "Probability for " + state.variants[i].name + " must be a percentage from 0 to 100.", field: "p" + i };
      probs.push(+r / 100);
    }
    let e = wholeError(raws.budget, k, LIMITS.maxBudget, "Pulls per method");
    if (e) return { error: e, field: "budget" };
    e = wholeError(raws.seed, 0, LIMITS.maxSeed, "Seed");
    if (e) return { error: e, field: "seed" };
    const s = clone(state), sim = s.simulation;
    const changed = probs.some((p, i) => p !== sim.probabilities[i]) || +raws.budget !== sim.budget || +raws.seed !== sim.seed;
    if (!changed) return { state: s, unchanged: true };
    s.simulation = { probabilities: probs, budget: +String(raws.budget).trim(), seed: +String(raws.seed).trim(), pulls: 0 };
    return { state: s };
  }

  /* ---- The view: every number the page, deck and tools show, formatted once ---- */
  /** @param {State} state */
  function view(state) {
    const u = ucb(state.variants), samples = state.variants.map((v) => v.sample), ts = argmax(samples);
    const rows = state.variants.map((v, i) => {
      const p = posterior(state.prior, v), f = v.trials - v.successes, mean = p[0] / (p[0] + p[1]);
      const lo = betaQuantile(0.025, p[0], p[1]), hi = betaQuantile(0.975, p[0], p[1]), sc = u.scores[i];
      return { id: v.id, name: v.name, successes: v.successes, failures: f, trials: v.trials, rate: v.trials ? v.successes / v.trials : null,
        mean, lo, hi, sample: v.sample, ucb: sc, alpha: p[0], beta: p[1],
        text: { successes: group(v.successes), failures: group(f), trials: group(v.trials), rate: v.trials ? pct(v.successes / v.trials) : "No trials",
          mean: pct(mean, 2), interval: pct(lo, 2) + " to " + pct(hi, 2), sample: pct(v.sample, 2),
          ucb: sc ? num(sc.score) : "Untried — explore first", posterior: "Beta(" + fmtPrior(p[0]) + ", " + fmtPrior(p[1]) + ")" } };
    });
    /** @param {number} best @param {(number | null)[]} vals */
    // @ts-expect-error vals[r] is never null: r only ever indexes a non-null value
    const second = (best, vals) => { let r = -1; vals.forEach((x, i) => { if (i !== best && x != null && (r < 0 || x > vals[r])) r = i; }); return r; };
    // @ts-expect-error every variant has trials when none is untried, so no score is null
    const tsNext = second(ts, samples), ucbNext = u.untried ? -1 : second(u.best, u.scores.map((x) => x.score));
    const tsWhy = rows[ts].name + " has the largest posterior draw, " + rows[ts].text.sample + (tsNext >= 0 ? "; the next largest is " + rows[tsNext].name + " at " + rows[tsNext].text.sample : "") + ".";
    const b = rows[u.best];
    const ucbWhy = u.untried ? b.name + " has no trials yet, so UCB1 tries it before comparing scores." :
      // @ts-expect-error this branch has no untried variant, so the best one has a score
      b.name + " has the highest score: observed rate " + num(b.ucb.mean) + " plus exploration bonus " + num(b.ucb.bonus) + " equals " + num(b.ucb.score) +
      (ucbNext >= 0 ? "; next is " + rows[ucbNext].name + " at " + rows[ucbNext].text.ucb : "") + ". The score is not a probability.";
    const agree = ts === u.best;
    return { rows, total: u.T, totalText: group(u.T), prior: state.prior, priorText: "Beta(" + fmtPrior(state.prior.a) + ", " + fmtPrior(state.prior.b) + ")",
      ts: { index: ts, id: rows[ts].id, name: rows[ts].name, value: rows[ts].text.sample, why: tsWhy },
      ucb: { index: u.best, id: b.id, name: b.name, untried: u.untried, value: b.text.ucb, why: ucbWhy },
      agree, disagreement: agree ? "" : "The methods disagree. Thompson Sampling follows one random draw from each posterior, so uncertain variants sometimes win; UCB1 adds a deterministic exploration bonus to each observed rate, which is largest for variants with few trials.",
      ready: ready(state), selected: state.selected, canRecord: canRecord(state) };
  }
  /** @param {State} state @param {ReturnType<typeof view>} v */
  function hints(state, v) {
    const out = [];
    if (!v.ready) out.push("Define success, the trial unit and a fixed outcome horizon before you begin recording outcomes.");
    else if (v.ucb.untried) out.push("UCB1 suggests trying " + v.ucb.name + ", which has no trials yet.");
    if (v.ready && !state.selected) out.push("Select the variant you will trial next, using either recommendation or the Select column.");
    // @ts-expect-error the selected id is one of the variants
    if (v.ready && state.selected) out.push("Run one trial of " + state.variants.find((x) => x.id === state.selected).name + ", then record its outcome once it is resolved.");
    if (!v.agree) out.push("The recommendations differ: compare their explanations to see how each method explores.");
    return out;
  }

  /* ---- Simulation ---- */
  /** @param {State} state @returns {Sim} */
  function simCreate(state) {
    const c = state.simulation, k = c.probabilities.length;
    const rewards = c.probabilities.map((p, j) => {
      const st = seedState(c.seed, 2 + j), r = new Uint8Array(c.budget);
      for (let i = 0; i < c.budget; i += 1) r[i] = uniform(st) < p ? 1 : 0;
      return r;
    });
    const best = Math.max.apply(null, c.probabilities);
    /** @type {Record<string, MethodRun>} */
    const methods = {};
    for (const [id] of METHODS) methods[id] = { successes: Array(k).fill(0), trials: Array(k).fill(0), pulls: 0, total: 0, regret: 0, curve: [], regretCurve: [] };
    return { probabilities: c.probabilities.slice(), budget: c.budget, seed: c.seed, prior: { a: state.prior.a, b: state.prior.b }, k, best, rewards, rng: seedState(c.seed, 1), methods };
  }
  /** @param {Sim} sim @param {string} id */
  function choose(sim, id) {
    const m = sim.methods[id];
    if (id === "eq") return m.pulls % sim.k;
    if (id === "ucb") return ucb(m.trials.map((n, j) => ({ successes: m.successes[j], trials: n }))).best;
    return argmax(m.trials.map((n, j) => sampleBeta(sim.rng, sim.prior.a + m.successes[j], sim.prior.b + n - m.successes[j])));
  }
  /* One pull for every unfinished method; the kth pull of a variant reads its kth reward. */
  /** @param {Sim} sim */
  function simStep(sim) {
    let moved = false;
    for (const [id] of METHODS) {
      const m = sim.methods[id];
      if (m.pulls >= sim.budget) continue;
      const j = choose(sim, id), r = sim.rewards[j][m.trials[j]];
      m.trials[j] += 1; m.successes[j] += r; m.pulls += 1; m.total += r;
      m.regret += sim.best - sim.probabilities[j];
      m.curve.push(m.total); m.regretCurve.push(m.regret);
      moved = true;
    }
    return moved;
  }
  /** @param {Sim} sim */
  const simDone = (sim) => METHODS.every(([id]) => sim.methods[id].pulls >= sim.budget);
  /** @param {State} state */
  function simReplay(state) {
    const sim = simCreate(state);
    for (let i = 0; i < state.simulation.pulls && simStep(sim); i += 1);
    return sim;
  }
  /** @param {Sim} sim @param {string[]} names */
  function simView(sim, names) {
    const pulls = sim.methods.ts.pulls;
    return { pulls, budget: sim.budget, seed: sim.seed, partial: pulls > 0 && pulls < sim.budget, started: pulls > 0,
      progress: pulls === 0 ? "Not run yet: 0 of " + group(sim.budget) + " pulls per method." : pulls < sim.budget ? "Partial run: " + group(pulls) + " of " + group(sim.budget) + " pulls per method." : "Complete: " + group(sim.budget) + " pulls per method.",
      settings: names.map((n, j) => ({ name: n, probability: pct(sim.probabilities[j]) })),
      methods: METHODS.map(([id, label]) => {
        const m = sim.methods[id];
        return { id, label, pulls: m.pulls, successes: m.total, regret: m.regret,
          text: { pulls: group(m.pulls), successes: group(m.total), rate: m.pulls ? pct(m.total / m.pulls) : "No pulls", regret: num(m.regret, 2) },
          allocation: names.map((n, j) => ({ name: n, trials: m.trials[j], text: group(m.trials[j]) })) };
      }) };
  }

  /* ---- Import and storage validation ---- */
  /** @param {any} x any value; checked here @returns {x is number} */
  const isWord = (x) => Number.isInteger(x) && x >= 0 && x <= 4294967295;
  /** @param {unknown} r */
  const isRng = (r) => Array.isArray(r) && r.length === 4 && r.every(isWord) && r.some((x) => x !== 0);
  /** Throws the first problem with an imported document. @param {any} doc untrusted JSON, checked field by field here */
  function check(doc) {
    /** @param {string} m @returns {never} */
    const fail = (m) => { throw new Error(m); };
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) fail("The file is not a JSON object.");
    if (doc.format !== FORMAT) fail("This is not a multi-armed bandit experiment file.");
    if (doc.version !== VERSION) fail("Unsupported version " + JSON.stringify(doc.version) + "; this page reads version " + VERSION + ".");
    for (const f of ["title", "success", "unit"]) {
      if (typeof doc[f] !== "string") fail("Missing " + f + ".");
      // @ts-expect-error textError() returns a message whenever this branch fails
      if (doc[f].trim() && textError(f, doc[f])) fail(textError(f, doc[f]));
      // @ts-expect-error an over-long field always has a message
      if (doc[f].length > LIMITS[f]) fail(textError(f, doc[f]));
    }
    if (!TEMPLATES.includes(doc.template) || !["fictional", "mixed", "entered"].includes(doc.basis)) fail("Invalid template or evidence basis.");
    if (!doc.prior || priorError(String(doc.prior.a), "a") !== null || priorError(String(doc.prior.b), "b") !== null || typeof doc.prior.a !== "number" || typeof doc.prior.b !== "number") fail("Prior a and b must be numbers from 0.1 to 100.");
    /** @type {any[]} untrusted, checked below */
    const vs = doc.variants;
    if (!Array.isArray(vs) || vs.length < LIMITS.minVariants || vs.length > LIMITS.maxVariants) fail("An experiment needs 2 to 10 variants.");
    const ids = new Set(), names = new Set();
    vs.forEach((v, i) => {
      if (!v || typeof v.id !== "string" || !/^v\d+$/.test(v.id) || ids.has(v.id)) fail("Variant " + (i + 1) + " has a missing or duplicate id.");
      ids.add(v.id);
      if (typeof v.name !== "string" || textError("name", v.name)) fail("Variant " + (i + 1) + ": " + (textError("name", v.name) || "invalid name."));
      const key = v.name.trim().toLowerCase();
      if (names.has(key)) fail("Variant names must be unique, ignoring case.");
      names.add(key);
      if (!Number.isInteger(v.successes) || !Number.isInteger(v.trials) || countsError(v.successes, v.trials)) fail("Variant " + (i + 1) + ": " + (countsError(String(v.successes), String(v.trials)) || "counts must be whole numbers."));
      if (typeof v.sample !== "number" || !(v.sample >= 0 && v.sample <= 1)) fail("Variant " + (i + 1) + " has an invalid Thompson sample.");
    });
    if (!Number.isInteger(doc.nextId) || doc.nextId <= Math.max.apply(null, vs.map((v) => +v.id.slice(1)))) fail("Invalid next variant id.");
    if (doc.selected !== null && !ids.has(doc.selected)) fail("The selected variant does not exist.");
    if (!isRng(doc.rng)) fail("Invalid generator state.");
    /** @type {{ probabilities: any[], budget: any, seed: any, pulls: any, thompsonRng?: any }} untrusted, checked below */
    const sim = doc.simulation;
    if (!sim || !Array.isArray(sim.probabilities) || sim.probabilities.length !== vs.length || !sim.probabilities.every((p) => typeof p === "number" && p >= 0 && p <= 1)) fail("Simulation probabilities must be one number from 0 to 1 per variant.");
    if (!Number.isInteger(sim.budget) || sim.budget < vs.length || sim.budget > LIMITS.maxBudget) fail("Simulation pulls per method must be a whole number from the number of variants to 2,000.");
    if (!isWord(sim.seed)) fail("Simulation seed must be a whole number from 0 to 4,294,967,295.");
    if (!Number.isInteger(sim.pulls) || sim.pulls < 0 || sim.pulls > sim.budget) fail("Simulation progress must be a whole number of pulls within the budget.");
    if (sim.thompsonRng !== undefined && !isRng(sim.thompsonRng)) fail("Invalid simulation generator state.");
  }
  /* Parses and fully validates a document; returns { state, sim } or { error }. Never partial. */
  /** Parses and validates; never partial. @param {string} text @returns {{ state: State, sim: Sim, error?: undefined } | { error: string, state?: undefined, sim?: undefined }} */
  function parse(text) {
    /** @type {State} valid once check() passes */
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return { error: "The file is not valid JSON." }; }
    // @ts-expect-error check() throws only Error objects
    try { check(doc); } catch (e) { return { error: e.message }; }
    const state = { format: FORMAT, version: VERSION, template: doc.template, basis: doc.basis, title: doc.title, success: doc.success, unit: doc.unit,
      prior: { a: doc.prior.a, b: doc.prior.b }, variants: doc.variants.map((v) => ({ id: v.id, name: v.name, successes: v.successes, trials: v.trials, sample: v.sample })),
      selected: doc.selected, nextId: doc.nextId, rng: doc.rng.slice(),
      simulation: { probabilities: doc.simulation.probabilities.slice(), budget: doc.simulation.budget, seed: doc.simulation.seed, pulls: doc.simulation.pulls } };
    const sim = simReplay(state);
    if (doc.simulation.thompsonRng && doc.simulation.thompsonRng.join() !== sim.rng.join()) return { error: "The simulation progress does not match its seed and settings." };
    return { state, sim };
  }
  /** @param {State} state @param {Sim | null | undefined} sim */
  function serialise(state, sim) {
    const s = clone(state);
    if (sim) s.simulation.thompsonRng = sim.rng.slice();
    return JSON.stringify(s, null, 2);
  }

  return { FORMAT, VERSION, LIMITS, SIM_DEFAULTS, METHODS, seedState, next, uniform, lgamma, lbeta, ibeta, betaQuantile, sampleBeta, ucb, argmax,
    group, pct, num, posterior, resample, fromTemplate, ready, textError, nameError, countsError, priorError, setText, rename, setCounts, setPrior,
    addVariant, removeVariant, select, canRecord, record, snapshot, restore, setSimulation, view, hints, simCreate, simStep, simDone, simReplay, simView,
    parse, serialise, clone };
});
