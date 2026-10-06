/* Monte Carlo Probability Workbench: the view state and what the page derives from it. FIELDS is the kit's
 * versioned state: the model, the parameter settings, the method and its comparison, the streams across the
 * alternatives, the number of strata, the sample size, the seed, the assumption failure, the sweep and the open
 * panels. derive() reads the catalogue (raw.json, published as data.json), compiles the model with the engine, and
 * returns plain data: the record, its parameters, the moment status and reference values of each quantity, the
 * focus variable's reference law for the plots, the dependency graph, the equations, the samplers, the design of a
 * variance-reduction method and the fit of a real dataset. A run's results are not part of the state: the page
 * keeps them beside it, and the run record saves them.
 */
/** @param {any} root the global object @param {(En: any, D: any, X: any, L: any, S: any, Cu: any, Co: any, Pr: any, Ml: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCEngine ?? require("./engine.js"), root.MCDsl ?? require("./dsl.js"), root.MCExpr ?? require("./expr.js"), root.MCLaws ?? require("./laws.js"), root.MCSpecial ?? require("./special.js"),
    root.MCCustom ?? require("./custom.js"), root.MCConstructed ?? require("./constructed.js"), root.MCProcesses ?? require("./processes.js"), root.MCMultilevel ?? require("./mlmc.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./engine.js")} */ En, /** @type {typeof import("./dsl.js")} */ D, /** @type {typeof import("./expr.js")} */ X,
  /** @type {typeof import("./laws.js")} */ L, /** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./custom.js")} */ Cu, /** @type {typeof import("./constructed.js")} */ Co,
  /** @type {typeof import("./processes.js")} */ Pr, /** @type {typeof import("./mlmc.js")} */ Ml) {
  "use strict";

  const SLUG = "monte-carlo-workbench", SCHEMA_VERSION = 1, MAX_SIZE = 22, BINS = 400, CBINS = 100;

  /** The catalogue: the page's own dataset block, or raw.json in Node. */
  const DATA = typeof document !== "undefined" && document.getElementById("dataset")
    ? JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}")
    : require("../raw.json");

  /** @type {string[]} */
  const EXPERIMENTS = DATA.models.filter((/** @type {any} */ m) => m.kind === "experiment").map((/** @type {any} */ m) => m.id);
  /** @type {string[]} */
  const WORKFLOWS = DATA.models.filter((/** @type {any} */ m) => m.kind === "workflow").map((/** @type {any} */ m) => m.id);
  /** The examples of the custom law inputs of group 4. @type {string[]} */
  const INPUTS = DATA.models.filter((/** @type {any} */ m) => m.kind === "input").map((/** @type {any} */ m) => m.id);
  const MODEL_IDS = [...WORKFLOWS, ...EXPERIMENTS, ...INPUTS, "custom"];
  const METHOD_IDS = Object.keys(En.METHODS);

  const LAB_IDS = ["chain-correlated", "chain-two-modes", "chain-funnel", "balance-bias", "balance-evidence", "oring-launch", "tank-level", "volatility", "qmc-peak", "qmc-sum", "asian-option"];
  const LAB_METHODS = ["metropolis", "gibbs", "hmc", "smc", "particle", "rqmc", "independent"];
  /** @type {Record<string, KitField>} */
  const FIELDS = {
    model: { type: "enum", values: MODEL_IDS, default: "binomial-overbooking", label: "Model" },
    params: { type: "string", default: "", label: "Parameter settings" },
    method: { type: "enum", values: METHOD_IDS, default: "independent", label: "Method" },
    compare: { type: "enum", values: ["none", ...METHOD_IDS], default: "none", label: "Comparison method" },
    streams: { type: "enum", values: ["common", "separate"], default: "common", label: "Random numbers across the alternatives" },
    strata: { type: "integer", min: 1, max: En.MAX_STRATA, default: 4, label: "Number of strata, log2 K" },
    stratify: { type: "string", default: "", label: "Stratified variable (empty: the focus variable)" },
    size: { type: "integer", min: 10, max: MAX_SIZE, default: 16, label: "Number of replicates, log2 n" },
    seed: { type: "integer", min: 0, max: 4294967295, default: 2026, label: "Seed" },
    failure: { type: "enum", values: ["none", "envelope", "stream_reuse", "table_cut", "control_mean"], default: "none", label: "Assumption failure" },
    quantity: { type: "integer", min: 1, max: 8, default: 1, label: "Quantity in the plots" },
    alt: { type: "integer", min: 1, max: 4, default: 1, label: "Alternative in the plots" },
    plot: { type: "enum", values: ["pmf", "cdf", "survival", "quantile", "tail"], default: "pmf", label: "Distribution plot (pmf: the PMF or the PDF; tail: the survival function on log–log axes)" },
    yscale: { type: "enum", values: ["linear", "log"], default: "linear", label: "Vertical axis" },
    panel: { type: "enum", values: ["theory", "assumptions", "diagnostics", "interpretation"], default: "assumptions", label: "Right panel" },
    theory: { type: "enum", values: ["lln", "clt", "consistency", "variance", "reduction", "tails", "extremes", "exceedances", "ergodicity", "sklar", "mlmc", "ldp", "tilting", "ruin", "pk", "taildep", "sensitivity", "markov", "particles", "rqmc"], default: "lln", label: "Theory panel" },
    mlmc_eps: { type: "number", min: 1e-6, max: 1e6, default: 0.05, label: "Target root mean square error ε of multilevel Monte Carlo" },
    nav: { type: "enum", values: ["examples", "interview", "rare", "chains", "editor", "library"], default: "examples", label: "Left panel" },
    q: { type: "string", default: "", label: "Library search" },
    sweep: { type: "string", default: "", label: "Swept parameter" },
    sweep_from: { type: "number", min: -1e9, max: 1e9, default: 0, label: "Sweep from" },
    sweep_to: { type: "number", min: -1e9, max: 1e9, default: 1, label: "Sweep to" },
    sweep_points: { type: "integer", min: 3, max: 21, default: 9, label: "Sweep points" },
    iv: { type: "string", default: "", label: "Answers of the guided interview, such as k=cnt;g=evt;m=4" },
    iv_off: { type: "string", default: "", label: "Rules of the interview switched off, comma-separated" },
    iv_pick: { type: "string", default: "", label: "Candidate that the reader picked (empty: the top candidate)" },
    // Group 7: the rare-event lab (src/rare.js, src/rareview.js).
    r_problem: { type: "enum", values: ["sum", "ruin", "cat"], default: "sum", label: "Rare-event problem" },
    r_law: { type: "enum", values: ["exponential", "weibull", "pareto2"], default: "exponential", label: "Jump law of the rare-event problem" },
    r_copula: { type: "enum", values: ["independent", "gaussian", "gumbel", "clayton"], default: "gumbel", label: "Copula of the shares in the catastrophe test" },
    r_params: { type: "string", default: "", label: "Parameters of the rare-event problem, such as n=20; b=50" },
    r_method: { type: "enum", values: ["direct", "tilting", "splitting", "subset", "ais", "ce"], default: "tilting", label: "Rare-event method" },
    r_compare: { type: "enum", values: ["none", "direct", "tilting", "splitting", "subset", "ais", "ce"], default: "direct", label: "Rare-event comparison method" },
    r_failure: { type: "enum", values: ["none", "light_family", "small_spread", "nominal_start"], default: "none", label: "Rare-event assumption failure" },
    r_options: { type: "string", default: "", label: "Method settings, such as levels=6; p0=0.1" },
    r_size: { type: "integer", min: 8, max: 16, default: 12, label: "Paths in each replication, log2 N" },
    r_reps: { type: "integer", min: 2, max: 64, default: 16, label: "Number of replications R" },
    r_detail: { type: "enum", values: ["", "all"], default: "", label: "Every quantity of each policy in the results" },
    r_sweep: { type: "string", default: "", label: "Swept parameter of the rare-event lab" },
    r_from: { type: "number", min: -1e9, max: 1e9, default: 1, label: "Rare-event sweep from" },
    r_to: { type: "number", min: -1e9, max: 1e9, default: 2, label: "Rare-event sweep to" },
    r_points: { type: "integer", min: 3, max: 15, default: 6, label: "Rare-event sweep points" },
    // Group 8: the Markov chain, sequential and quasi-Monte Carlo lab (src/chains.js, src/chainview.js). It shares the seed.
    c_example: { type: "enum", values: LAB_IDS, default: "chain-correlated", label: "Example of the lab" },
    c_params: { type: "string", default: "", label: "Parameters of the lab example, such as rho=0.99" },
    c_method: { type: "enum", values: LAB_METHODS, default: "metropolis", label: "Method of the lab" },
    c_compare: { type: "enum", values: ["none", ...LAB_METHODS], default: "hmc", label: "Comparison method of the lab" },
    c_size: { type: "integer", min: 6, max: 18, default: 12, label: "Size of each run, log2: draws after the warm-up, particles or points" },
    c_runs: { type: "integer", min: 2, max: 32, default: 4, label: "Independent runs R: chains, samplers, filters or randomisations" },
    c_step: { type: "number", min: 0.001, max: 10, default: 1, label: "Step size of the random walk of Metropolis–Hastings, in units of the scale" },
    c_eps: { type: "number", min: 0.001, max: 10, default: 0.2, label: "Leapfrog step ε of Hamiltonian Monte Carlo, in units of the scale" },
    c_leap: { type: "integer", min: 1, max: 200, default: 10, label: "Leapfrog steps L of Hamiltonian Monte Carlo" },
    c_start: { type: "enum", values: ["dispersed", "one_point"], default: "dispersed", label: "Start points of the chains" },
    c_resample: { type: "enum", values: ["systematic", "stratified", "residual", "multinomial", "none"], default: "systematic", label: "Resampling scheme" },
    c_ess: { type: "number", min: 0.05, max: 1, default: 0.5, label: "ESS threshold τ: resample when the weight ESS is below τN" },
    c_schedule: { type: "enum", values: ["adaptive", "fixed"], default: "adaptive", label: "Tempering schedule of sequential Monte Carlo" },
    c_temps: { type: "integer", min: 1, max: 200, default: 10, label: "Steps of the fixed tempering schedule" },
    c_moves: { type: "integer", min: 0, max: 20, default: 5, label: "Metropolis moves after each tempering step" },
    c_scramble: { type: "enum", values: ["lms_shift", "shift", "none"], default: "lms_shift", label: "Randomisation of the Sobol points" },
    c_path: { type: "enum", values: ["standard", "bridge"], default: "standard", label: "Path construction of the option" },
    c_plot: { type: "enum", values: ["trace", "acf", "scatter", "weights", "genealogy", "filter", "points", "rate", "runs"], default: "trace", label: "Figure of the lab" },
    c_coord: { type: "integer", min: 1, max: 2, default: 1, label: "Coordinate in the trace and the autocorrelation" },
    c_q: { type: "integer", min: 1, max: 3, default: 1, label: "Quantity in the rate and runs figures" },
  };

  /** The state an example opens: its model and the settings its catalogue entry names. @param {any} m */
  function exampleState(m) {
    return { model: m.id, ...(m.settings ?? {}) };
  }

  /** @type {KitExample[]} */
  const EXAMPLES = DATA.models.map((/** @type {any} */ m) => ({ id: m.id, label: m.title, state: exampleState(m) }));

  const CUSTOM_TEXT = `title: My model
problem: Write the problem here. Each line states one part of the model.
param lambda = 2.5 {events per day} "mean count"
param capacity = 4 {events}
N ~ poisson(lambda = lambda) {events}
over := max(N - capacity, 0) {events}
prob overflow = N > capacity "a day above capacity"
mean excess = over {events per day}
alt "Capacity 4": capacity = 4
alt "Capacity 6": capacity = 6
minimise excess
require overflow <= 0.1
focus N
`;
  /** The custom model of this page, from the editor or a loaded record. @type {any} */
  let custom = null;
  /** @param {any} rec */
  function setCustom(rec) { custom = rec; }
  function getCustom() { return custom ?? D.parse(CUSTOM_TEXT, "custom").record; }

  /** The catalogue entry and the model record of a state. @param {Record<string, any>} state @param {any} data */
  function modelOf(state, data) {
    if (state.model === "custom") return { entry: null, record: getCustom(), errors: [] };
    const entry = data.models.find((/** @type {any} */ m) => m.id === state.model);
    const parsed = D.parse(entry.dsl, entry.id);
    return { entry, record: parsed.record, errors: parsed.errors };
  }

  /** "a=1; b=[0.2, 0.8]" -> { a: "1", b: "[0.2, 0.8]" }, at the top-level semicolons. @param {string} text */
  function parseParams(text) {
    /** @type {Record<string, string>} */
    const out = {};
    /** @type {string[]} */
    const errors = [];
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i <= text.length; i++) {
      const ch = text[i];
      if (ch === "[" || ch === "(") depth++;
      else if (ch === "]" || ch === ")") depth--;
      if ((ch === ";" && depth === 0) || i === text.length) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
      const m = /^([A-Za-z]\w*)\s*=\s*(.+)$/.exec(part);
      if (m) out[m[1]] = m[2].trim();
      else errors.push(`"${part.slice(0, 30)}" is not name = value.`);
    }
    return { overrides: out, errors };
  }

  /** "name=value; …" for overrides, in the record's parameter order. @param {Record<string, string>} overrides @param {any} rec */
  function formatParams(overrides, rec) {
    return rec.parameters.filter((/** @type {any} */ p) => overrides[p.name] !== undefined).map((/** @type {any} */ p) => `${p.name}=${overrides[p.name]}`).join("; ");
  }

  /** The kinds of the group 5 laws: a copula or a path. */
  const DEP_KIND = new Set(["copula", "process"]);

  /** Plain JSON data: every number that is NaN or ±Infinity becomes null. @param {any} v @returns {any} */
  const plain = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "number" && !Number.isFinite(x) ? null : x))));

  /** A number for JSON: null for NaN and ±Infinity. @param {number | null | undefined} v */
  const safe = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  /**
   * The histogram window of the focus variable over all alternatives. A discrete focus: unit bins when the range has
   * at most 400 points, wider bins otherwise, and thresholds at powers of 10 up to the largest support point, so the
   * survival plot can show a heavy tail past the window. A continuous focus: 100 bins between the 10^-4 and
   * 1 − 10^-4 quantiles (0.005 and 0.995 for a heavy tail), with thresholds past the window for a heavy tail. A focus
   * with no reference law takes its window from a pilot sample.
   * @param {any} c @param {any[]} refs
   */
  function windowOf(c, refs) {
    const [name, idx] = En.splitFocus(c.focus);
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    let lo = Infinity, hi = -Infinity, top = 0, heavy = false, continuous = false, realAtoms = false;
    // A continuous focus with an exact law (a variable, or a maximum, minimum, sum or affine function of draws): the
    // window from its quantiles, and for a heavy tail 24 thresholds equally spaced on a log scale past the window, to
    // the 1 − 10^-8 quantile, for the survival and tail plots.
    const exact = node?.type === "var" && (node.constant || DEP_KIND.has(node.law.kind)) ? [] : c.alternatives.map((/** @type {any} */ _, /** @type {number} */ a) => En.focusLaw(c, a));
    if (exact.length && exact.every((/** @type {any} */ b) => b && b.continuous)) {
      for (const b of exact) {
        const heavyTail = b.order !== null && b.order !== Infinity, tail = heavyTail ? 0.005 : 1e-4;
        lo = Math.min(lo, Math.max(b.support.lo, b.quantile(tail, 1 - tail)));
        hi = Math.max(hi, Math.min(b.support.hi, b.quantile(1 - tail, tail)));
        if (heavyTail) { heavy = true; top = Math.max(top, Math.min(b.support.hi, b.quantile(1 - 1e-8, 1e-8))); }
      }
      const width = hi > lo ? (hi - lo) / CBINS : Math.max(Math.abs(lo) * 1e-6, 1e-9);
      return { lo, width, bins: CBINS, thresholds: logThresholds(lo + CBINS * width, top, heavy), integer: false, heavy, continuous: true };
    }
    if (node?.type === "var" && node.constant && !DEP_KIND.has(node.law.kind)) {
      for (const alt of c.alternatives) {
        const p = En.argsAt(node, alt.values).params, m = marginalLaw(node, p, idx);
        if (!m) continue;
        const s = m.law.support(m.params), order = m.law.moments(m.params).order;
        if (m.law.continuous) {
          const tail = order !== null && order < Infinity ? 0.005 : 1e-4;
          continuous = true;
          lo = Math.min(lo, Math.max(s.lo, m.law.quantile(tail, m.params)));
          hi = Math.max(hi, Math.min(s.hi, m.law.isf(tail, m.params)));
          if (order !== null && order < Infinity) { heavy = true; top = Math.max(top, Math.min(s.hi, m.law.isf(1e-8, m.params))); }
          continue;
        }
        // The window holds the support less a mass of about 10^-9 on the left and 10^-6 on the right.
        lo = Math.min(lo, Math.max(s.lo, L.quantile(m.law, 1e-9, m.params)));
        hi = Math.max(hi, Math.min(s.hi, L.quantile(m.law, 1 - 1e-6, m.params)));
        // A table or an empirical law with values that are not integers takes bins of real width.
        if (m.law.isInteger && !m.law.isInteger(m.params)) realAtoms = true;
        top = Math.max(top, s.hi === Infinity ? 1e15 : s.hi);
        if (order !== null && order < Infinity) heavy = true;
      }
    } else if (refs.some((/** @type {any} */ r) => r.marginal)) {
      for (const r of refs) {
        if (!r.marginal) continue;
        const xs = r.marginal.x.filter((/** @type {number} */ _, /** @type {number} */ i) => r.marginal.p[i] > 1e-12);
        if (xs.length) { lo = Math.min(lo, xs[0]); hi = Math.max(hi, xs[xs.length - 1]); top = Math.max(top, xs[xs.length - 1]); }
      }
    } else if (c.nodes.some((/** @type {any} */ n) => n.type === "var" && (n.law.continuous || DEP_KIND.has(n.law.kind) || n.u))) {
      // No reference law: a pilot sample of 2,048 replicates of each alternative gives the window.
      /** @type {number[]} */
      let xs = [];
      try { xs = En.sampleFocus(c, 2048).sort((/** @type {number} */ x, /** @type {number} */ y) => x - y); } catch { xs = []; }
      if (xs.length) {
        continuous = !xs.every((/** @type {number} */ x) => Number.isInteger(x));
        lo = continuous ? xs[Math.floor(xs.length * 0.001)] : xs[0];
        hi = continuous ? xs[Math.ceil(xs.length * 0.999) - 1] : xs[xs.length - 1];
        top = continuous ? 0 : hi;
      }
    }
    if (continuous && hi >= lo) {
      const width = hi > lo ? (hi - lo) / CBINS : Math.max(Math.abs(lo) * 1e-6, 1e-9);
      return { lo, width, bins: CBINS, thresholds: logThresholds(lo + CBINS * width, top, heavy), integer: false, heavy, continuous: true };
    }
    if (!(hi >= lo)) {
      lo = 0;
      hi = BINS - 1;
      top = 1e15;
    }
    if (heavy) hi = Math.min(hi, lo + BINS - 1);
    const integer = Number.isInteger(lo) && Number.isInteger(hi) && !realAtoms;
    const span = hi - lo + (integer ? 1 : 0);
    // Values that are not integers (a table or an empirical law) take BINS − 1 cells, so the last value has its own bin.
    const width = integer ? Math.max(1, Math.ceil(span / BINS)) : Math.max(span / (realAtoms ? BINS - 1 : BINS), 1e-9);
    const bins = Math.max(1, Math.ceil(span / width) + (integer ? 0 : 1));
    const thresholds = [];
    for (let t = 10; t <= Math.min(top, 1e15); t *= 10) if (t > lo + bins * width - 1) thresholds.push(t);
    return { lo, width, bins, thresholds, integer, heavy, continuous: false };
  }

  /**
   * The name and the tail index of the focus law, for the plot notes: the law of a variable, or of a maximum,
   * minimum, sum or affine function of draws; null when the focus has no exact law.
   * @param {any} c @param {number} a
   */
  function focusLabel(c, a) {
    const [name, idx] = En.splitFocus(c.focus), node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    if (node?.type === "var" && node.constant && !idx && node.repeat === 1) {
      const p = En.argsAt(node, c.alternatives[a].values).params;
      if (node.law.check(p).length) return null;
      const order = node.law.moments(p).order, index = node.law.tailIndex ? node.law.tailIndex(p) : order < Infinity ? order : null;
      return { label: /\blaws?\b|\)$/.test(node.law.name) ? `the ${node.law.name}`.replace("the Mixture", "the mixture").replace("the Truncated", "the truncated").replace("the Compound", "the compound") : `the ${node.law.name} law`, tailIndex: safe(index), numeric: !!node.law.numeric };
    }
    const b = En.focusLaw(c, a);
    return b ? { label: b.label, tailIndex: safe(b.tailIndex), numeric: b.numeric } : null;
  }

  /** 24 thresholds equally spaced on a log scale from the end of the window to top, for a heavy tail. @param {number} end @param {number} top @param {boolean} heavy */
  function logThresholds(end, top, heavy) {
    if (!heavy || !(end > 0) || !(top > end * 1.01) || !Number.isFinite(top)) return [];
    return Array.from({ length: 24 }, (_, i) => end * Math.pow(top / end, (i + 1) / 24));
  }

  /** The law of a variable, or of component idx of a vector variable. @param {any} node @param {any} p @param {number} idx */
  function marginalLaw(node, p, idx) {
    if (DEP_KIND.has(node.law.kind) || node.law.check(p).length) return null;
    if (node.law.marginal) {
      const m = node.law.marginal(p, idx || 1);
      return { law: L.BY_ID[m.law], params: m.params };
    }
    return { law: node.law, params: p };
  }

  /**
   * The reference law of the focus variable for one alternative, in the form one plot needs: points of the PMF,
   * CDF or survival function, or the quantile function on a grid of u.
   * @param {any} c @param {any} ref @param {any} win @param {number} a @param {string} kind @returns {{ x: number[], y: number[] } | null}
   */
  function focusTheory(c, ref, win, a, kind) {
    if (kind === "tail") {
      // The tail plot: the survival function at the points with x > 0 and a positive value, on log–log axes.
      const sf = /** @type {{ x: number[], y: number[] } | null} */ (focusTheory(c, ref, win, a, "survival"));
      if (!sf) return null;
      /** @type {number[]} */
      const keep = sf.x.map((/** @type {number} */ _, /** @type {number} */ i) => i).filter((/** @type {number} */ i) => sf.x[i] > 0 && sf.y[i] > 0);
      return { x: keep.map((/** @type {number} */ i) => sf.x[i]), y: keep.map((/** @type {number} */ i) => sf.y[i]) };
    }
    const [name, idx] = En.splitFocus(c.focus);
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    const grid = Array.from({ length: 199 }, (_, i) => (i + 1) / 200);
    const exact = node?.type === "var" && node.constant ? null : En.focusLaw(c, a);
    /** The atom of a mixed law at 0 as a density over the bin that holds 0. @param {number} x a bin centre @param {number} z the atom */
    const spike = (x, z) => (x - win.width / 2 <= 0 && 0 < x + win.width / 2 ? z / win.width : 0);
    if (exact && exact.continuous && win.continuous) {
      if (kind === "quantile") return { x: grid, y: grid.map((u) => safe(exact.quantile(u, 1 - u)) ?? 0) };
      const xs = Array.from({ length: win.bins }, (_, k) => win.lo + (k + (kind === "pmf" ? 0.5 : 1)) * win.width);
      if (kind === "survival") for (const t of win.thresholds) xs.push(t);
      const f = kind === "pmf" ? (exact.mixed ? (/** @type {number} */ x) => exact.mass(x) + spike(x, exact.cdf(0)) : exact.mass) : kind === "cdf" ? exact.cdf : exact.sf;
      return { x: xs, y: xs.map((x) => safe(f(x)) ?? 0) };
    }
    if (node?.type === "var" && node.constant) {
      const m = marginalLaw(node, En.argsAt(node, c.alternatives[a].values).params, idx);
      if (!m) return null;
      if (kind === "quantile") return { x: grid, y: grid.map((u) => safe(L.quantile(m.law, u, m.params)) ?? 0) };
      if (m.law.continuous) {
        // The density at the bin centres; the CDF and the survival function at the right edges, as the run's bins.
        const xs = Array.from({ length: win.bins }, (_, k) => win.lo + (k + (kind === "pmf" ? 0.5 : 1)) * win.width);
        if (kind === "survival") for (const t of win.thresholds) xs.push(t);
        const f = kind === "pmf" ? (m.law.mixed ? (/** @type {number} */ x, /** @type {any} */ q) => m.law.pdf(x, q) + spike(x, m.law.cdf(0, q)) : m.law.pdf) : kind === "cdf" ? m.law.cdf : m.law.sf;
        return { x: xs, y: xs.map((x) => safe(f(x, m.params)) ?? 0) };
      }
      const xs = [];
      for (let k = 0; k < win.bins && xs.length < BINS; k++) xs.push(win.lo + k * win.width);
      if (kind === "survival") for (const t of win.thresholds) xs.push(t);
      if (m.law.atoms) {
        // A law of finitely many values: bin k holds [lo + kw, lo + (k + 1)w), as the run's bins, with P(X < y) = F(y) − P(X = y).
        const below = (/** @type {number} */ y) => m.law.cdf(y, m.params) - m.law.pmf(y, m.params);
        const g = kind === "pmf" ? (/** @type {number} */ x) => below(x + win.width) - below(x) : kind === "cdf" ? (/** @type {number} */ x) => below(x + win.width)
          : (/** @type {number} */ x) => (x >= win.lo + win.bins * win.width ? m.law.sf(x, m.params) : 1 - below(x + win.width));
        return { x: xs, y: xs.map((x) => safe(g(x)) ?? 0) };
      }
      const f = kind === "pmf" ? (/** @type {number} */ k) => (win.width === 1 ? m.law.pmf(k, m.params) : m.law.cdf(k + win.width - 1, m.params) - m.law.cdf(k - 1, m.params))
        : kind === "cdf" ? (/** @type {number} */ k) => m.law.cdf(k + win.width - 1, m.params) : (/** @type {number} */ k) => m.law.sf(k >= win.lo + win.bins * win.width ? k : k + win.width - 1, m.params);
      return { x: xs, y: xs.map((k) => safe(f(k)) ?? 0) };
    }
    if (!ref?.marginal) return null;
    const mx = ref.marginal.x, mp = ref.marginal.p;
    if (kind === "pmf") return { x: mx, y: mp };
    let F = 0;
    const cdf = mp.map((/** @type {number} */ p) => (F += p));
    if (kind === "cdf") return { x: mx, y: cdf };
    if (kind === "survival") return { x: mx, y: cdf.map((/** @type {number} */ v) => Math.max(0, 1 - v)) };
    return { x: grid, y: grid.map((u) => mx[Math.min(mx.length - 1, cdf.findIndex((/** @type {number} */ v) => v >= u - 1e-12))] ?? mx[mx.length - 1]) };
  }

  /** The dependency graph of a compiled model. @param {any} c @param {any} rec */
  function graphOf(c, rec) {
    /** @type {{ id: string, kind: "param" | "var" | "def" | "quantity", label: string, sub?: string }[]} */
    const nodes = [];
    /** @type {[string, string][]} */
    const edges = [];
    for (const p of c.params) nodes.push({ id: p.name, kind: "param", label: p.name, sub: `parameter ${p.name} = ${p.src}` });
    for (const n of c.nodes) {
      const v = rec.variables.find((/** @type {any} */ x) => x.name === n.name);
      nodes.push({ id: n.name, kind: n.type === "var" ? "var" : "def", label: n.name, sub: n.type === "var" ? `${n.name} ~ ${n.law.name}${n.repeat > 1 ? `, ${n.repeat} copies` : ""}${v?.unit ? ` [${v.unit}]` : ""}` : `${n.name} := definition` });
      for (const r of n.reads) edges.push([r, n.name]);
    }
    for (const q of c.quantities) {
      nodes.push({ id: `q:${q.name}`, kind: "quantity", label: q.name, sub: `quantity ${q.name} (${q.kind})` });
      for (const r of q.reads) edges.push([r, `q:${q.name}`]);
    }
    return { nodes, edges };
  }

  /** The model as TeX lines: laws, definitions and quantities. @param {any} rec */
  function equations(rec) {
    const lines = [];
    /** @param {string} src */
    const t = (src) => { try { return X.tex(X.parse(src)); } catch { return "\\text{(not an expression)}"; } };
    const customs = Cu.compileAll(rec.laws ?? [], Co.taken).laws;
    // A law line: its input as an equation, with its parameters and support.
    const KIND_TEX = /** @type {Record<string, (n: string, a: string) => string>} */ ({ pdf: (n, a) => `f_{${n}}(${a})`, logpdf: (n, a) => `\\log f_{${n}}(${a})`, density: (n, a) => `f_{${n}}(${a}) \\propto`, pmf: (n, a) => `p_{${n}}(${a})`,
      cdf: (n, a) => `F_{${n}}(${a})`, quantile: (n, a) => `Q_{${n}}(${a})`, mgf: (n, a) => `M_{${n}}(${a})`, cf: (n, a) => `\\varphi_{${n}}(${a})` });
    for (const l of rec.laws ?? []) {
      const n = `\\mathrm{${String(l.name).replace(/_/g, "\\_")}}`, a = X.texName(l.arg ?? "x");
      const on = l.on ? `,\\quad ${a} \\in \\left[${t(l.on[0])}, ${t(l.on[1])}\\right]` : "";
      if (l.kind === "table") lines.push(`\\mathbb{P}\\left(X_{${n}} = ${t(l.expr)}_j\\right) = ${t(l.probs ?? "0")}_j`);
      else if (KIND_TEX[l.kind]) lines.push(`${KIND_TEX[l.kind](n, a)}${l.kind === "density" ? "" : " ="} ${t(l.expr)}${on}`);
    }
    const order = rec.order ?? [...rec.variables.map((/** @type {any} */ v) => ({ type: "var", name: v.name })), ...rec.definitions.map((/** @type {any} */ d) => ({ type: "def", name: d.name }))];
    for (const item of order) {
      if (item.type === "var") {
        const v = rec.variables.find((/** @type {any} */ x) => x.name === item.name), law = Co.resolve(v.law, customs);
        const args = Object.entries(v.args).map(([k, e]) => `${GREEK[k] ?? X.texName(k)} = ${t(/** @type {string} */ (e))}`).join(",\\ ");
        lines.push(`${X.texName(v.name)}${(v.repeat ?? 1) > 1 ? `_{1..${v.repeat}} \\overset{\\text{i.i.d.}}{\\sim}` : " \\sim"} \\operatorname{${law ? law.name.replace(/ /g, "\\ ") : v.law}}\\left(${args}\\right)`);
      } else {
        const d = rec.definitions.find((/** @type {any} */ x) => x.name === item.name);
        lines.push(`${X.texName(d.name)} := ${t(d.expr)}`);
      }
    }
    for (const q of rec.quantities) {
      const body = q.kind === "probability" ? `\\mathbb{P}\\left(${t(q.expr)}\\right)` : q.kind === "expectation" ? `\\mathbb{E}\\left[${t(q.expr)}\\right]` : `\\frac{\\mathbb{E}\\left[${t(q.num)}\\right]}{\\mathbb{E}\\left[${t(q.den)}\\right]}`;
      lines.push(`\\theta_{\\mathrm{${q.name.replace(/_/g, "\\_")}}} = ${body}`);
    }
    if (rec.control) lines.push(`${X.texName(rec.control.name)} := ${t(rec.control.expr)} \\quad \\text{(control variate)}`);
    return lines;
  }

  /** The TeX of the Greek parameter names of the laws. */
  const GREEK = /** @type {Record<string, string>} */ ({ lambda: "\\lambda", mu: "\\mu", sigma: "\\sigma", theta: "\\theta", nu: "\\nu", alpha: "\\alpha", cov: "\\Sigma" });

  /**
   * Each random variable with its law, unit, number of copies and support at the first alternative's parameters, or
   * "depends on" its parents when its parameters read other variables.
   * @param {any} c @param {any} rec
   */
  function variablesOf(c, rec) {
    return c.nodes.filter((/** @type {any} */ n) => n.type === "var").map((/** @type {any} */ n) => {
      const v = rec.variables.find((/** @type {any} */ x) => x.name === n.name);
      let support = `depends on ${[...n.reads].filter((r) => c.kinds.get(r) !== "param").join(", ")}`;
      if (n.constant) {
        const p = En.argsAt(n, c.alternatives[0].values).params;
        if (!n.law.check(p).length) {
          const s = n.law.support(p), hi = s.hi === Infinity ? "∞" : String(s.hi);
          support = n.law.continuous || DEP_KIND.has(n.law.kind) ? n.law.supportText(p) : n.law.dim ? `x ∈ {0, …, ${p.n}}^${p.p.length}, sum ${p.n}` : s.lo === s.hi ? `{${s.lo}}` : s.hi === Infinity ? `{${s.lo}, ${s.lo + 1}, …}` : `{${s.lo}, …, ${hi}}`;
        }
      }
      return { name: n.name, law: n.law.name, unit: v?.unit ?? "", repeat: n.repeat, support, note: v?.note ?? "" };
    });
  }

  /** Each law the model uses, with its sampler for each method at the first alternative's parameters. @param {any} c @param {string} failure */
  function samplersOf(c, failure) {
    const out = [];
    for (const n of c.nodes) {
      if (n.type !== "var") continue;
      const p = En.argsAt(n, c.alternatives[0].values).params;
      if (!n.constant || n.law.check(p).length) { out.push({ variable: n.name, law: n.law.id, name: n.law.name, catalogue: Co.catalogueOf(n.law), code: n.law.params.map((/** @type {any} */ x) => ({ name: x.name, text: x.text })), constant: false, methods: null }); continue; }
      /** @param {any} s */
      const show = (s) => ("unavailable" in s ? { label: "Not available", exactness: s.unavailable, acceptance: null, sampling: "unavailable" } : { label: s.label, exactness: s.exactness, acceptance: safe(s.acceptance), sampling: s.sampling ?? (/^exact/.test(s.exactness) ? "exact" : "approximate") });
      // A variable with the argument u takes the quantile of its law at u under every method (Sklar's theorem).
      const given = n.u ? { label: `The inverse transform of the given uniform u = ${n.uSrc}: the quantile of the law at u`, exactness: "exact", acceptance: null, sampling: "exact" } : null;
      const ref = n.law.reference(p);
      out.push({ variable: n.name, law: n.law.id, name: n.law.name, catalogue: Co.catalogueOf(n.law), code: n.law.params.map((/** @type {any} */ x) => ({ name: x.name, text: x.text })), constant: true, alternate: n.law.alternate ? n.law.alternate(p) : null, methods: {
        independent: given ?? show(ref),
        inverse: given ?? show(n.law.inverse(p, failure === "table_cut" ? 0.99 : undefined)),
        rejection: given ?? show(n.law.rejection(p, failure === "envelope" ? 0.5 : 1)),
        euler: given ?? show(n.law.euler ? n.law.euler(p) : "unavailable" in ref ? ref : { ...ref, label: `${ref.label}. This law has no time, so the method uses this sampler` }),
      } });
    }
    return out;
  }

  /**
   * The fit of a real dataset: the maximum likelihood estimate of the law's parameter, then the chi-square test
   * of the counts against the fitted law and against each alternative, with cells pooled to an expected count of
   * at least 5.
   * @param {any} ds @param {any} c
   */
  function fitOf(ds, c) {
    const n = ds.counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    const mean = ds.values.reduce((/** @type {number} */ s, /** @type {number} */ v, /** @type {number} */ i) => s + v * ds.counts[i], 0) / n;
    const fitted = ds.law === "poisson" ? { lambda: mean } : { n: ds.trials, p: mean / ds.trials };
    const law = L.BY_ID[ds.law];
    /** @param {any} p @param {number} estimated */
    const test = (p, estimated) => {
      /** @type {{ o: number, e: number }[]} */
      const cells = [];
      let o = 0, e = 0;
      ds.values.forEach((/** @type {number} */ v, /** @type {number} */ i) => {
        const last = i === ds.values.length - 1;
        o += ds.counts[i];
        e += n * (last ? law.sf(v - 1, p) : i === 0 ? law.cdf(v, p) : law.pmf(v, p));
        if (e >= 5 || last) { cells.push({ o, e }); o = 0; e = 0; }
      });
      if (cells.length > 1 && cells[cells.length - 1].e < 5) { const l = /** @type {any} */ (cells.pop()); cells[cells.length - 1].o += l.o; cells[cells.length - 1].e += l.e; }
      const stat = cells.reduce((s, x) => s + ((x.o - x.e) ** 2) / x.e, 0), df = cells.length - 1 - estimated;
      return { stat, df, p: df > 0 ? S.chiSquareSf(stat, df) : null, cells: cells.length };
    };
    const expected = ds.values.map((/** @type {number} */ v, /** @type {number} */ i) => n * (i === ds.values.length - 1 ? law.sf(v - 1, fitted) : law.pmf(v, fitted)));
    const alternatives = c.alternatives.map((/** @type {any} */ alt) => {
      const node = c.nodes.find((/** @type {any} */ x) => x.type === "var" && x.law.id === ds.law);
      if (!node) return null;
      const p = En.argsAt(node, alt.values).params;
      return { label: alt.label, ...test(p, 0) };
    }).filter(Boolean);
    return { n, mean, fitted, estimate: ds.law === "poisson" ? mean : mean / ds.trials, fittedTest: test(fitted, 1), expected, alternatives };
  }

  /**
   * Nelder–Mead minimisation of f from x0 with initial steps `step`, to a relative change of 1e-12 or 4,000 steps.
   * @param {(x: number[]) => number} f @param {number[]} x0 @param {number[]} step
   */
  function nelderMead(f, x0, step) {
    const n = x0.length;
    let pts = [x0, ...step.map((h, i) => x0.map((v, j) => (i === j ? v + h : v)))].map((x) => ({ x, f: f(x) }));
    for (let it = 0; it < 4000; it++) {
      pts.sort((a, b) => a.f - b.f);
      if (Math.abs(pts[n].f - pts[0].f) <= 1e-12 * (Math.abs(pts[0].f) + 1e-12)) break;
      const c = x0.map((_, j) => pts.slice(0, n).reduce((t, p) => t + p.x[j], 0) / n);
      /** @param {number} t */
      const at = (t) => { const x = c.map((v, j) => v + t * (pts[n].x[j] - v)); return { x, f: f(x) }; };
      const r = at(-1);
      if (r.f < pts[0].f) { const e = at(-2); pts[n] = e.f < r.f ? e : r; }
      else if (r.f < pts[n - 1].f) pts[n] = r;
      else {
        const k = at(r.f < pts[n].f ? -0.5 : 0.5);
        if (k.f < Math.min(r.f, pts[n].f)) pts[n] = k;
        else pts = pts.map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])), f: 0 })).map((p, i) => (i === 0 ? p : { x: p.x, f: f(p.x) }));
      }
    }
    pts.sort((a, b) => a.f - b.f);
    return pts[0];
  }

  /** The inverse of a symmetric matrix by Gauss–Jordan elimination, or null when it is singular. @param {number[][]} m */
  function inverse(m) {
    const n = m.length, a = m.map((r, i) => [...r, ...r.map((_, j) => +(i === j))]);
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[piv][i])) piv = r;
      if (!(Math.abs(a[piv][i]) > 1e-300)) return null;
      [a[i], a[piv]] = [a[piv], a[i]];
      const d = a[i][i];
      for (let j = 0; j < 2 * n; j++) a[i][j] /= d;
      for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[i][j]; }
    }
    return a.map((r) => r.slice(n));
  }

  /**
   * The fit of a series of annual maxima: the GEV law and the Gumbel law (ξ = 0) by maximum likelihood, the standard
   * errors from the observed information (a numerical Hessian), the deviance test of ξ = 0, return levels, and the
   * points of a probability plot with the Gringorten plotting positions (i − 0.44)/(n + 0.12).
   * @param {any} ds
   */
  function seriesFit(ds) {
    const x = ds.values.slice(), n = x.length, mean = x.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / n;
    const sd = Math.sqrt(x.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + (b - mean) ** 2, 0) / (n - 1));
    const gev = L.BY_ID.gev;
    /** The negative log-likelihood at (μ, log σ, ξ). @param {number[]} t */
    const nll = (t) => {
      const p = { mu: t[0], sigma: Math.exp(t[1]), xi: Math.abs(t[2]) < 1e-9 ? 0 : t[2] };
      let s = 0;
      for (const v of x) { const d = gev.pdf(v, p); if (!(d > 0)) return 1e300; s -= Math.log(d); }
      return s;
    };
    // Starting values from the moments of the Gumbel law: σ = s√6/π, μ = x̄ − 0.5772 σ.
    const s0 = (sd * Math.sqrt(6)) / Math.PI, m0 = mean - 0.5772156649 * s0;
    const g0 = nelderMead((t) => nll([t[0], t[1], 0]), [m0, Math.log(s0)], [s0 / 4, 0.2]);
    const full = nelderMead(nll, [g0.x[0], g0.x[1], 0.05], [s0 / 4, 0.2, 0.1]);
    /** Standard errors of (μ, σ, ξ) from the inverse of the numerical Hessian of nll. @param {number[]} t @param {number} k */
    const se = (t, k) => {
      const h = t.map((v, i) => (i === 1 ? 1e-4 : 1e-4 * Math.max(1, Math.abs(v))));
      /** @param {number} i @param {number} j */
      const d2 = (i, j) => {
        /** @param {number} a @param {number} b */
        const f = (a, b) => nll([...t.map((v, m) => v + (m === i ? a * h[i] : 0) + (m === j ? b * h[j] : 0)), ...(k === 2 ? [0] : [])].slice(0, 3));
        return (f(1, 1) - f(1, -1) - f(-1, 1) + f(-1, -1)) / (4 * h[i] * h[j]);
      };
      const H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => d2(i, j)));
      const V = inverse(H);
      if (!V || V.some((r, i) => !(r[i] > 0))) return t.map(() => null);
      // The scale is fitted on the log scale: SE(σ) = σ·SE(log σ) by the delta method.
      return V.map((r, i) => (i === 1 ? Math.exp(t[1]) * Math.sqrt(r[i]) : Math.sqrt(r[i])));
    };
    const gevP = { mu: full.x[0], sigma: Math.exp(full.x[1]), xi: full.x[2] }, gumP = { mu: g0.x[0], sigma: Math.exp(g0.x[1]), xi: 0 };
    const dev = 2 * (g0.f - full.f);
    const levels = [10, 50, 100, 200].map((T) => ({ T, gev: gev.isf(1 / T, gevP), gumbel: gev.isf(1 / T, gumP) }));
    const sorted = x.slice().sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
    const plot = sorted.map((/** @type {number} */ v, /** @type {number} */ i) => { const u = (i + 1 - 0.44) / (n + 0.12); return { x: v, gev: gev.quantile(u, gevP), gumbel: gev.quantile(u, gumP) }; });
    return { kind: "series", n, mean, sd, max: sorted[n - 1], gev: { ...gevP, se: se(full.x, 3), loglik: -full.f }, gumbel: { mu: gumP.mu, sigma: gumP.sigma, se: se(g0.x, 2), loglik: -g0.f },
      deviance: dev, p: S.chiSquareSf(Math.max(0, dev), 1), levels, plot };
  }

  /**
   * What the chosen assumption failure does to the chosen method and comparison, or which method it needs.
   * @param {Record<string, any>} state
   */
  function noteOf(state) {
    const f = state.failure;
    if (f === "none") return "";
    if (f === "stream_reuse") return "Replicate i reuses the streams of replicate i mod 16, so the draws repeat.";
    const used = [state.method, state.compare].filter((m) => En.METHODS[m]).map((m) => En.METHODS[m]);
    if (f === "envelope") return used.some((u) => u.sampler === "rejection") ? "The rejection method uses half its envelope constant, so the envelope does not cover the target." : "This failure acts on the rejection method only. Choose that method to see it.";
    if (f === "table_cut") return used.some((u) => u.sampler === "inverse") ? "The inverse transform cuts its table at the 0.99 quantile: no value passes that quantile. Stratification and antithetic pairs use the same inverse transform." : "This failure acts on the inverse-transform method only. Choose that method to see it.";
    return used.some((u) => u.design === "control") ? "The control-variate estimator uses a control mean 0.1 standard deviation above the true mean, so its estimate has a bias of 0.1 β σ_C." : "This failure acts on the control-variate method only. Choose that method to see it.";
  }

  /**
   * The custom laws of a model with their checks: for each law line, each variable that uses it (directly, or as the
   * family of a constructed law) in each alternative, with its parameter values and the law's report: the checks,
   * the sampling label of each method, the approximation controls, the error sources and the observations. A law
   * with no parameters that no variable uses still shows its checks. Computed also when the model has errors, so a
   * failed check shows beside the error it causes.
   * @param {any} rec @param {any} c the compiled model, or its partial form after errors
   */
  function customOf(rec, c) {
    const defs = rec.laws ?? [];
    if (!defs.length) return null;
    const laws = c?.laws ?? Cu.compileAll(defs, Co.taken).laws;
    return defs.map((/** @type {any} */ def) => {
      const law = laws.get(def.name), out = { name: def.name, kind: def.kind, kindName: Cu.KINDS[def.kind] ?? def.kind, arg: def.arg, params: def.params ?? [], uses: /** @type {any[]} */ ([]), note: "" };
      if (!law) { out.note = "The law line has errors: the model errors list them."; return out; }
      for (const n of c?.nodes ?? []) {
        if (n.type !== "var") continue;
        let base = n.law, via = "";
        while (base && base !== law && base.base) { via = via || base.name; base = base.base; }
        if (base !== law) continue;
        (c.alternatives ?? []).forEach((/** @type {any} */ alt, /** @type {number} */ a) => {
          const pr = En.argsAt(n, alt.values);
          if (pr.error) return;
          // The family of a constructed law takes the parameters of its own names; a mixture shows each component with a positive weight.
          const w = pr.params.w, k = Array.isArray(w) && law.params.some((/** @type {any} */ x) => Array.isArray(pr.params[x.name])) ? w.length : 1;
          for (let j = 0; j < k; j++) {
            if (k > 1 && !(w[j] > 0)) continue;
            const q = Object.fromEntries(law.params.map((/** @type {any} */ x) => [x.name, Array.isArray(pr.params[x.name]) ? pr.params[x.name][j] : pr.params[x.name]]));
            out.uses.push({ variable: n.name, via, component: k > 1 ? j + 1 : 0, alt: a, label: alt.label, values: q, report: law.report(q) });
          }
        });
      }
      if (!out.uses.length) {
        if (!law.params.length) out.uses.push({ variable: "", via: "", alt: 0, label: "", values: {}, report: law.report({}) });
        else out.note = `No variable uses ${def.name}, so the page has no values for its parameters ${law.params.map((/** @type {any} */ x) => x.name).join(", ")} and checks nothing yet.`;
      }
      return out;
    });
  }

  /**
   * The group 5 facts of a model: each process variable with its conditions at each alternative's parameters and the
   * window of its ensemble band (from a pilot of 64 replicates of each alternative), and each copula variable with its
   * Kendall's tau and tail coefficients.
   * @param {any} c
   */
  function dependenceOf(c) {
    /** @type {any[]} */
    const processes = [], copulas = [];
    for (const n of c.nodes) {
      if (n.type !== "var" || !n.constant || n.repeat !== 1) continue;
      const ps = c.alternatives.map((/** @type {any} */ alt) => En.argsAt(n, alt.values).params);
      if (ps.some((/** @type {any} */ p) => n.law.check(p).length)) continue;
      if (n.law.kind === "process") {
        let lo = Infinity, hi = -Infinity, len = 0;
        try {
          c.alternatives.forEach((/** @type {any} */ _, /** @type {number} */ a) => {
            for (const env of En.sample(c, a, 0, 64, "independent")) {
              const v = env[c.slots.get(n.name)];
              len = v.length;
              for (const x of v) if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
            }
          });
        } catch { len = 0; }
        const pad = (hi - lo) * 0.15 || 1;
        processes.push({ name: n.name, law: n.law.id, title: n.law.name, family: n.law.family, times: n.law.times(ps[0]), conditions: ps.map((/** @type {any} */ p) => n.law.conditions(p)),
          band: len ? { name: n.name, ...Pr.bandSpec(len, lo - pad, hi + pad) } : null, level: plain(Pr.passageLevel(c, n, c.alternatives[0].values)),
          mean: ps.map((/** @type {any} */ p) => n.law.times(p).map((/** @type {number} */ t, /** @type {number} */ k) => n.law.marginal(p, n.law.id === "markovchain" || n.law.id === "branching" ? k : t).mean)) });
      } else if (n.law.kind === "copula") copulas.push({ name: n.name, law: n.law.id, title: n.law.name, d: ps[0].d, at: ps.map((/** @type {any} */ p) => ({ tau: n.law.tau(p), tails: n.law.tails(p) })) });
    }
    return { processes, copulas, given: c.nodes.filter((/** @type {any} */ n) => n.u).map((/** @type {any} */ n) => n.name) };
  }

  /** The last 24 reference computations, by record and parameter settings, the most recent last. @type {Map<string, { status: any[], refs: any[], win: any, dep: any }>} */
  const memo = new Map();

  /**
   * Everything the page shows that follows from the state alone. Plain data: no NaN or Infinity.
   * @param {Record<string, any>} state @param {any} [data] @returns {any}
   */
  function derive(state, data = DATA) {
    const { entry, record, errors: textErrors } = modelOf(state, data);
    const { overrides, errors: paramErrors } = parseParams(state.params);
    const settings = { seed: state.seed, method: state.method, compare: state.compare, failure: state.failure, overrides, streams: state.streams, strata: state.strata, stratify: state.stratify };
    const base = {
      model: { id: state.model, title: record.title, kind: entry?.kind ?? "custom", law: entry?.law ?? null, domain: entry?.domain ?? "Custom model", problem: record.problem },
      text: D.print(record), n: 2 ** state.size, settings: { ...settings, size: state.size },
      parameters: record.parameters.map((/** @type {any} */ p) => ({ name: p.name, expr: overrides[p.name] ?? p.expr, base: p.expr, unit: p.unit ?? "", note: p.note ?? "", set: overrides[p.name] !== undefined,
        alternatives: record.alternatives.filter((/** @type {any} */ a) => a.set?.[p.name] !== undefined).length })),
    };
    const c = En.prepare(record, settings);
    if (textErrors.length || paramErrors.length || !c.ok) return { ok: false, errors: [...textErrors, ...paramErrors.map((e) => `Parameter settings: ${e}`), ...(c.ok ? [] : c.errors)], ...base, custom: plain(customOf(record, c)) };
    // The reference values cost most; they depend on the record and the parameter settings only.
    const key = JSON.stringify([record, overrides]);
    let known = memo.get(key);
    if (known) memo.delete(key);
    else {
      const status = En.momentStatus(c), refs = En.reference(c, status);
      known = { status, refs, win: windowOf(c, refs), dep: dependenceOf(c) };
      if (memo.size >= 24) memo.delete(/** @type {string} */ (memo.keys().next().value));
    }
    memo.set(key, known);
    const { status, refs, win, dep } = known;
    const a = Math.min(state.alt, c.alternatives.length) - 1;
    const q = Math.min(state.quantity, c.quantities.length) - 1;
    const failureNote = noteOf(state);
    const dataset = entry?.data?.kind === "real" ? data.datasets.find((/** @type {any} */ d) => d.id === entry.data.dataset) : null;
    return {
      ok: true, errors: [], ...base,
      alternatives: c.alternatives.map((/** @type {any} */ alt) => alt.label), alt: a + 1,
      quantities: c.quantities.map((/** @type {any} */ qu, /** @type {number} */ k) => ({ name: qu.name, kind: qu.kind, unit: qu.unit, note: record.quantities[k].note ?? "", status: status[k] })), quantity: q + 1,
      references: refs.map((/** @type {any} */ r) => ({ values: r.values.map(safe), reason: r.reason, neglected: safe(r.neglected), closed: r.closed, method: r.method, how: r.how ?? null, continuous: r.continuous ?? null })),
      dependence: plain({ ...dep, processes: dep.processes.map((/** @type {any} */ x) => ({ ...x, conditions: x.conditions[a] ?? x.conditions[0], band: x.band })), copulas: dep.copulas.map((/** @type {any} */ x) => ({ ...x, at: x.at[a] ?? x.at[0] })), mlmc: Ml.ready(record) }),
      focus: { name: c.focus, window: { lo: win.lo, width: win.width, bins: win.bins, thresholds: win.thresholds }, heavy: win.heavy, integer: win.integer, continuous: win.continuous, theory: focusTheory(c, refs[a], win, a, state.plot),
        law: focusLabel(c, a) },
      graph: graphOf(c, record), equations: equations(record), samplers: samplersOf(c, state.failure), failureNote,
      design: { streams: state.streams, stratify: c.stratify ? { name: c.stratify.name, K: c.stratify.K } : null,
        scalars: c.nodes.filter((/** @type {any} */ n) => n.type === "var" && n.repeat === 1 && !n.law.dim).map((/** @type {any} */ n) => n.name),
        control: c.control ? { name: c.control.name, expr: c.control.expr, means: c.control.exact.map((/** @type {any} */ m) => (m ? safe(m.mean) : null)), sds: c.control.exact.map((/** @type {any} */ m) => (m ? safe(m.sd) : null)), why: c.control.exact.map((/** @type {any} */ m) => m?.why ?? "") } : null },
      fields: { initial: record.initial ?? "none", dynamics: record.dynamics ?? "none" },
      observation: record.observation ?? null,
      censoring: (() => { const n = c.nodes.find((/** @type {any} */ x) => x.censoring); return n ? { text: record.censoring, obs: n.name, event: n.name.replace(/_obs$/, "_event") } : null; })(),
      decision: c.decision, variables: c.nodes.filter((/** @type {any} */ n) => n.type === "var").map((/** @type {any} */ n) => n.name), variableTable: variablesOf(c, record),
      dataset: dataset ? { id: dataset.id, fit: dataset.kind === "series" ? seriesFit(dataset) : fitOf(dataset, c) } : null,
      custom: plain(customOf(record, c)),
    };
  }

  return { SLUG, SCHEMA_VERSION, MAX_SIZE, FIELDS, EXAMPLES, MODEL_IDS, EXPERIMENTS, WORKFLOWS, INPUTS, METHOD_IDS, LAB_IDS, LAB_METHODS, DATA, CUSTOM_TEXT, exampleState, derive, seriesFit, modelOf, parseParams, formatParams, setCustom, getCustom, safe };
});
