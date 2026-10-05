/* Monte Carlo Probability Workbench: the view state and what the page derives from it. FIELDS is the kit's
 * versioned state: the model, the parameter settings, the method and its comparison, the sample size, the seed,
 * the assumption failure, the sweep and the open panels. derive() reads the catalogue (raw.json, published as
 * data.json), compiles the model with the engine, and returns plain data: the record, its parameters, the
 * moment status and reference values of each quantity, the focus variable's reference law for the plots, the
 * dependency graph, the equations, the samplers and the fit of a real dataset. A run's results are not part of
 * the state: the page keeps them beside it, and the run record saves them.
 */
/** @param {any} root the global object @param {(En: any, D: any, X: any, L: any, S: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCEngine ?? require("./engine.js"), root.MCDsl ?? require("./dsl.js"), root.MCExpr ?? require("./expr.js"), root.MCLaws ?? require("./laws.js"), root.MCSpecial ?? require("./special.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./engine.js")} */ En, /** @type {typeof import("./dsl.js")} */ D, /** @type {typeof import("./expr.js")} */ X,
  /** @type {typeof import("./laws.js")} */ L, /** @type {typeof import("./special.js")} */ S) {
  "use strict";

  const SLUG = "monte-carlo-workbench", SCHEMA_VERSION = 1, MAX_SIZE = 22, BINS = 400;
  const EXPERIMENTS = ["exp-bernoulli", "exp-binomial", "exp-categorical", "exp-multinomial", "exp-uniform", "exp-geometric", "exp-negbin", "exp-poisson", "exp-hypergeometric", "exp-zipf"];
  const WORKFLOWS = ["bernoulli-common-cause", "bernoulli-screening", "bernoulli-sensor-vote", "binomial-overbooking", "binomial-acceptance", "binomial-weldon",
    "categorical-triage", "categorical-returns", "categorical-camera-trap", "multinomial-size-stock", "multinomial-poll", "multinomial-hardy-weinberg",
    "uniform-randomised-response", "uniform-birthday-ids", "uniform-board-game", "geometric-retries", "geometric-relay-replacement", "geometric-survey-visits",
    "negbin-claims", "negbin-hospital-beds", "negbin-parasites", "poisson-horse-kicks", "poisson-rutherford-geiger", "poisson-spare-parts",
    "hypergeometric-capture-recapture", "hypergeometric-ballot-audit", "hypergeometric-card-deck", "zipf-cache", "zipf-dictionary", "zipf-cascade"];
  const MODEL_IDS = [...WORKFLOWS, ...EXPERIMENTS, "custom"];

  /** @type {Record<string, KitField>} */
  const FIELDS = {
    model: { type: "enum", values: MODEL_IDS, default: "binomial-overbooking", label: "Model" },
    params: { type: "string", default: "", label: "Parameter settings" },
    method: { type: "enum", values: ["independent", "inverse", "rejection"], default: "independent", label: "Method" },
    compare: { type: "enum", values: ["none", "independent", "inverse", "rejection"], default: "none", label: "Comparison method" },
    size: { type: "integer", min: 10, max: MAX_SIZE, default: 16, label: "Number of replicates, log2 n" },
    seed: { type: "integer", min: 0, max: 4294967295, default: 2026, label: "Seed" },
    failure: { type: "enum", values: ["none", "envelope", "stream_reuse", "table_cut"], default: "none", label: "Assumption failure" },
    quantity: { type: "integer", min: 1, max: 8, default: 1, label: "Quantity in the plots" },
    alt: { type: "integer", min: 1, max: 4, default: 1, label: "Alternative in the plots" },
    plot: { type: "enum", values: ["pmf", "cdf", "survival", "quantile"], default: "pmf", label: "Distribution plot" },
    yscale: { type: "enum", values: ["linear", "log"], default: "linear", label: "Vertical axis" },
    panel: { type: "enum", values: ["theory", "assumptions", "diagnostics", "interpretation"], default: "assumptions", label: "Right panel" },
    theory: { type: "enum", values: ["lln", "clt", "consistency", "variance"], default: "lln", label: "Theory panel" },
    nav: { type: "enum", values: ["examples", "editor", "library"], default: "examples", label: "Left panel" },
    q: { type: "string", default: "", label: "Library search" },
    sweep: { type: "string", default: "", label: "Swept parameter" },
    sweep_from: { type: "number", min: -1e9, max: 1e9, default: 0, label: "Sweep from" },
    sweep_to: { type: "number", min: -1e9, max: 1e9, default: 1, label: "Sweep to" },
    sweep_points: { type: "integer", min: 3, max: 21, default: 9, label: "Sweep points" },
  };

  /** The catalogue: the page's own dataset block, or raw.json in Node. */
  const DATA = typeof document !== "undefined" && document.getElementById("dataset")
    ? JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}")
    : require("../raw.json");

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

  /** A number for JSON: null for NaN and ±Infinity. @param {number | null | undefined} v */
  const safe = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  /**
   * The histogram window of the focus variable over all alternatives: unit bins when the range has at most 400
   * points, wider bins otherwise, and thresholds at powers of 10 up to the largest support point, so the survival
   * plot can show a heavy tail past the window.
   * @param {any} c @param {any[]} refs
   */
  function windowOf(c, refs) {
    const [name, idx] = En.splitFocus(c.focus);
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    let lo = Infinity, hi = -Infinity, top = 0, heavy = false;
    if (node?.type === "var" && node.constant) {
      for (const alt of c.alternatives) {
        const p = En.argsAt(node, alt.values).params, m = marginalLaw(node, p, idx);
        if (!m) continue;
        const s = m.law.support(m.params);
        // The window holds the support less a mass of about 10^-9 on the left and 10^-6 on the right.
        lo = Math.min(lo, Math.max(s.lo, L.quantile(m.law.id, 1e-9, m.params)));
        hi = Math.max(hi, Math.min(s.hi, L.quantile(m.law.id, 1 - 1e-6, m.params)));
        top = Math.max(top, s.hi === Infinity ? 1e15 : s.hi);
        if (m.law.moments(m.params).order < Infinity) heavy = true;
      }
    } else {
      for (const r of refs) {
        if (!r.marginal) continue;
        const xs = r.marginal.x.filter((/** @type {number} */ _, /** @type {number} */ i) => r.marginal.p[i] > 1e-12);
        if (xs.length) { lo = Math.min(lo, xs[0]); hi = Math.max(hi, xs[xs.length - 1]); top = Math.max(top, xs[xs.length - 1]); }
      }
    }
    if (!(hi >= lo)) {
      lo = 0;
      hi = BINS - 1;
      top = 1e15;
    }
    if (heavy) hi = Math.min(hi, lo + BINS - 1);
    const integer = Number.isInteger(lo) && Number.isInteger(hi);
    const span = hi - lo + (integer ? 1 : 0);
    const width = integer ? Math.max(1, Math.ceil(span / BINS)) : Math.max(span / BINS, 1e-9);
    const bins = Math.max(1, Math.ceil(span / width) + (integer ? 0 : 1));
    const thresholds = [];
    for (let t = 10; t <= Math.min(top, 1e15); t *= 10) if (t > lo + bins * width - 1) thresholds.push(t);
    return { lo, width, bins, thresholds, integer, heavy };
  }

  /** The law of a variable, or of component idx of a vector variable. @param {any} node @param {any} p @param {number} idx */
  function marginalLaw(node, p, idx) {
    if (node.law.check(p).length) return null;
    if (node.law.marginal) {
      const m = node.law.marginal(p, idx || 1);
      return { law: L.BY_ID[m.law], params: m.params };
    }
    return { law: node.law, params: p };
  }

  /**
   * The reference law of the focus variable for one alternative, in the form one plot needs: points of the PMF,
   * CDF or survival function, or the quantile function on a grid of u.
   * @param {any} c @param {any} ref @param {any} win @param {number} a @param {string} kind
   */
  function focusTheory(c, ref, win, a, kind) {
    const [name, idx] = En.splitFocus(c.focus);
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    const grid = Array.from({ length: 199 }, (_, i) => (i + 1) / 200);
    if (node?.type === "var" && node.constant) {
      const m = marginalLaw(node, En.argsAt(node, c.alternatives[a].values).params, idx);
      if (!m) return null;
      if (kind === "quantile") return { x: grid, y: grid.map((u) => safe(L.quantile(m.law.id, u, m.params)) ?? 0) };
      const xs = [];
      for (let k = 0; k < win.bins && xs.length < BINS; k++) xs.push(win.lo + k * win.width);
      if (kind === "survival") for (const t of win.thresholds) xs.push(t);
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
    const order = rec.order ?? [...rec.variables.map((/** @type {any} */ v) => ({ type: "var", name: v.name })), ...rec.definitions.map((/** @type {any} */ d) => ({ type: "def", name: d.name }))];
    for (const item of order) {
      if (item.type === "var") {
        const v = rec.variables.find((/** @type {any} */ x) => x.name === item.name), law = L.BY_ID[v.law];
        const args = Object.entries(v.args).map(([k, e]) => `${X.texName(k === "lambda" ? "lambda" : k).replace("\\mathrm{lambda}", "\\lambda")} = ${t(/** @type {string} */ (e))}`).join(",\\ ");
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
    return lines;
  }

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
          support = n.law.dim ? `x ∈ {0, …, ${p.n}}^${p.p.length}, sum ${p.n}` : s.lo === s.hi ? `{${s.lo}}` : s.hi === Infinity ? `{${s.lo}, ${s.lo + 1}, …}` : `{${s.lo}, …, ${hi}}`;
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
      if (!n.constant || n.law.check(p).length) { out.push({ variable: n.name, law: n.law.id, name: n.law.name, constant: false, methods: null }); continue; }
      /** @param {any} s */
      const show = (s) => ("unavailable" in s ? { label: "Not available", exactness: s.unavailable, acceptance: null } : { label: s.label, exactness: s.exactness, acceptance: safe(s.acceptance) });
      out.push({ variable: n.name, law: n.law.id, name: n.law.name, constant: true, methods: {
        independent: show(n.law.reference(p)),
        inverse: show(n.law.inverse(p, failure === "table_cut" ? 0.99 : undefined)),
        rejection: show(n.law.rejection(p, failure === "envelope" ? 0.5 : 1)),
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
      const node = c.nodes.find((/** @type {any} */ x) => x.type === "var");
      const p = En.argsAt(node, alt.values).params;
      return { label: alt.label, ...test(p, 0) };
    });
    return { n, mean, fitted, estimate: ds.law === "poisson" ? mean : mean / ds.trials, fittedTest: test(fitted, 1), expected, alternatives };
  }

  /** The last reference computation. @type {{ key: string, status: any[], refs: any[], win: any }} */
  let memo = { key: "", status: [], refs: [], win: null };

  /**
   * Everything the page shows that follows from the state alone. Plain data: no NaN or Infinity.
   * @param {Record<string, any>} state @param {any} [data] @returns {any}
   */
  function derive(state, data = DATA) {
    const { entry, record, errors: textErrors } = modelOf(state, data);
    const { overrides, errors: paramErrors } = parseParams(state.params);
    const settings = { seed: state.seed, method: state.method, compare: state.compare, failure: state.failure, overrides };
    const base = {
      model: { id: state.model, title: record.title, kind: entry?.kind ?? "custom", law: entry?.law ?? null, domain: entry?.domain ?? "Custom model", problem: record.problem },
      text: D.print(record), n: 2 ** state.size, settings: { ...settings, size: state.size },
      parameters: record.parameters.map((/** @type {any} */ p) => ({ name: p.name, expr: overrides[p.name] ?? p.expr, base: p.expr, unit: p.unit ?? "", note: p.note ?? "", set: overrides[p.name] !== undefined,
        alternatives: record.alternatives.filter((/** @type {any} */ a) => a.set?.[p.name] !== undefined).length })),
    };
    const c = En.prepare(record, settings);
    if (textErrors.length || paramErrors.length || !c.ok) return { ok: false, errors: [...textErrors, ...paramErrors.map((e) => `Parameter settings: ${e}`), ...(c.ok ? [] : c.errors)], ...base };
    // The reference values cost most; they depend on the record and the parameter settings only.
    const key = JSON.stringify([record, overrides]);
    if (memo.key !== key) {
      const status = En.momentStatus(c), refs = En.reference(c, status);
      memo = { key, status, refs, win: windowOf(c, refs) };
    }
    const { status, refs, win } = memo;
    const a = Math.min(state.alt, c.alternatives.length) - 1;
    const q = Math.min(state.quantity, c.quantities.length) - 1;
    const kinds = { envelope: "rejection", table_cut: "inverse" };
    const failureNote = state.failure === "none" ? "" : state.failure === "stream_reuse" ? "Replicate i reuses the streams of replicate i mod 16, so the draws repeat."
      : kinds[/** @type {"envelope"} */ (state.failure)] === state.method || kinds[/** @type {"envelope"} */ (state.failure)] === state.compare
        ? state.failure === "envelope" ? "The rejection method uses half its envelope constant, so the envelope does not cover the target." : "The inverse transform cuts its table at the 0.99 quantile."
        : `This failure acts on the ${kinds[/** @type {"envelope"} */ (state.failure)] === "rejection" ? "rejection" : "inverse-transform"} method only. Choose that method to see it.`;
    const dataset = entry?.data?.kind === "real" ? data.datasets.find((/** @type {any} */ d) => d.id === entry.data.dataset) : null;
    return {
      ok: true, errors: [], ...base,
      alternatives: c.alternatives.map((/** @type {any} */ alt) => alt.label), alt: a + 1,
      quantities: c.quantities.map((/** @type {any} */ qu, /** @type {number} */ k) => ({ name: qu.name, kind: qu.kind, unit: qu.unit, note: record.quantities[k].note ?? "", status: status[k] })), quantity: q + 1,
      references: refs.map((/** @type {any} */ r) => ({ values: r.values.map(safe), reason: r.reason, neglected: safe(r.neglected), closed: r.closed })),
      focus: { name: c.focus, window: { lo: win.lo, width: win.width, bins: win.bins, thresholds: win.thresholds }, heavy: win.heavy, integer: win.integer, theory: focusTheory(c, refs[a], win, a, state.plot) },
      graph: graphOf(c, record), equations: equations(record), samplers: samplersOf(c, state.failure), failureNote,
      decision: c.decision, variables: c.nodes.filter((/** @type {any} */ n) => n.type === "var").map((/** @type {any} */ n) => n.name), variableTable: variablesOf(c, record),
      dataset: dataset ? { id: dataset.id, fit: fitOf(dataset, c) } : null,
    };
  }

  return { SLUG, SCHEMA_VERSION, MAX_SIZE, FIELDS, EXAMPLES, MODEL_IDS, EXPERIMENTS, WORKFLOWS, DATA, CUSTOM_TEXT, exampleState, derive, modelOf, parseParams, formatParams, setCustom, getCustom, safe };
});
