/* Monte Carlo Probability Workbench: the simulation engine. prepare() checks a model record and compiles it:
 * parameters, random variables in dependency order, definitions, the quantities to estimate, and the decision
 * alternatives. block() simulates one block of replicates and returns its statistics; merge() combines blocks in
 * block order, so the result does not depend on how many workers ran the blocks or in which order they finished.
 * summary() turns merged statistics into estimates and intervals; reference() computes exact or numerical
 * reference values by enumeration where the support allows it. Every function is pure: the page, its workers and
 * the tests run the same code.
 */
/** @param {any} root the global object @param {(R: any, S: any, E: any, L: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCRng ?? require("./rng.js"), root.MCSpecial ?? require("./special.js"), root.MCExpr ?? require("./expr.js"), root.MCLaws ?? require("./laws.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCEngine = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./rng.js")} */ R, /** @type {typeof import("./special.js")} */ S,
  /** @type {typeof import("./expr.js")} */ E, /** @type {typeof import("./laws.js")} */ L) {
  "use strict";

  const FORMAT = "monte-carlo-workbench/model", VERSION = 1;
  const BLOCK = 1024, STREAM = "model", REUSE = 16;
  const LIMITS = { variables: 16, parameters: 24, quantities: 8, alternatives: 4, repeat: 2000, drawsPerReplicate: 5000, bins: 400, states: 400000 };
  const NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
  const RESERVED = new Set([...Object.keys(E.FUNCTIONS), ...Object.keys(E.CONSTANTS), "and", "or", "not", "P", "E"]);
  const Z95 = 1.959963984540054;
  const TEXT_FIELDS = ["initial", "dynamics", "observation", "censoring", "truncation", "selection"];

  /** @typedef {number | number[]} Value */
  /** @typedef {{ name: string, expr: string, unit?: string, note?: string }} ParamRec */
  /** @typedef {{ name: string, law: string, args: Record<string, string>, unit?: string, repeat?: number, note?: string }} VarRec */
  /** @typedef {{ name: string, expr: string, unit?: string, note?: string }} DefRec */
  /** @typedef {{ name: string, kind: "probability" | "expectation" | "ratio", expr?: string, num?: string, den?: string, unit?: string, note?: string }} QuantRec */
  /** @typedef {{ label: string, set: Record<string, string> }} AltRec */
  /** @typedef {{ objective?: { quantity: string, direction: "minimise" | "maximise" } | null, constraints?: { quantity: string, op: "<=" | ">=", value: number }[] }} DecisionRec */
  /**
   * @typedef {object} ModelRecord
   * @property {string} format @property {number} version @property {string} id @property {string} title @property {string} problem
   * @property {ParamRec[]} parameters @property {VarRec[]} variables @property {DefRec[]} definitions
   * @property {QuantRec[]} quantities @property {AltRec[]} alternatives @property {DecisionRec} decision
   * @property {string} [focus] @property {string} [initial] @property {string} [dynamics] @property {string} [observation]
   * @property {string} [censoring] @property {string} [truncation] @property {string} [selection]
   */
  /** @typedef {{ seed: number, method: string, compare?: string, failure?: string, overrides?: Record<string, string> }} Settings */

  /* ---------- checking and compiling ---------- */

  /** A shallow copy of a model record with every field present, for records from files and the editor. @param {any} rec @returns {ModelRecord} */
  function complete(rec) {
    return {
      format: FORMAT, version: VERSION, id: String(rec.id ?? "custom"), title: String(rec.title ?? "Untitled model"), problem: String(rec.problem ?? ""),
      parameters: rec.parameters ?? [], variables: rec.variables ?? [], definitions: rec.definitions ?? [], quantities: rec.quantities ?? [],
      alternatives: rec.alternatives?.length ? rec.alternatives : [{ label: "As stated", set: {} }],
      decision: rec.decision ?? { objective: null, constraints: [] }, focus: rec.focus,
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, rec[k] ?? (k === "observation" ? "complete: each replicate observes every variable" : "none")])),
    };
  }

  /**
   * Check a model record and compile it for one setting. Returns { ok: false, errors } or the compiled model.
   * Overrides replace parameter expressions by name, as the view's parameter fields do.
   * @param {any} input @param {Settings} settings @returns {any}
   */
  function prepare(input, settings) {
    /** @type {string[]} */
    const errors = [];
    if (!input || typeof input !== "object") return { ok: false, errors: ["The model record is not an object."] };
    if (input.format !== undefined && input.format !== FORMAT) errors.push(`The record format is "${String(input.format).slice(0, 40)}", not ${FORMAT}.`);
    if (input.version !== undefined && input.version !== VERSION) errors.push(`The record uses model version ${String(input.version).slice(0, 10)}. This page reads version ${VERSION}.`);
    const rec = complete(input);
    for (const k of TEXT_FIELDS) if (k !== "observation" && String(rec[/** @type {"initial"} */ (k)]).trim().toLowerCase() !== "none") errors.push(`The ${k} field holds "${String(rec[/** @type {"initial"} */ (k)]).slice(0, 40)}": this group of the workbench has no ${k} mechanism, so the field must be "none".`);
    if (rec.parameters.length > LIMITS.parameters) errors.push(`A model has at most ${LIMITS.parameters} parameters.`);
    if (rec.variables.length > LIMITS.variables) errors.push(`A model has at most ${LIMITS.variables} random variables.`);
    if (rec.quantities.length < 1 || rec.quantities.length > LIMITS.quantities) errors.push(`A model has 1 to ${LIMITS.quantities} quantities to estimate.`);
    if (rec.alternatives.length > LIMITS.alternatives) errors.push(`A model has at most ${LIMITS.alternatives} decision alternatives.`);
    if (errors.length) return { ok: false, errors };

    /** @type {Map<string, number>} */
    const slots = new Map();
    /** @type {Map<string, "param" | "var" | "def">} */
    const kinds = new Map();
    /** @param {string} name @param {"param" | "var" | "def"} kind @param {string} where */
    const declare = (name, kind, where) => {
      if (typeof name !== "string" || !NAME.test(name)) { errors.push(`${where}: "${String(name).slice(0, 30)}" is not a name (a letter, then letters, digits or _, at most 24 characters).`); return false; }
      if (RESERVED.has(name)) { errors.push(`${where}: "${name}" is a reserved word of the expression language.`); return false; }
      if (slots.has(name)) { errors.push(`${where}: "${name}" has two definitions.`); return false; }
      slots.set(name, slots.size);
      kinds.set(name, kind);
      return true;
    };
    /** @param {string} src @param {string} where @param {Map<string, number>} visible */
    const expr = (src, where, visible) => {
      try {
        return E.build(String(src ?? ""), visible);
      } catch (e) {
        errors.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    };

    const overrides = settings.overrides ?? {};
    for (const name of Object.keys(overrides)) if (!rec.parameters.some((p) => p.name === name)) errors.push(`The value for "${name}" names no parameter of this model.`);
    /** @type {{ name: string, slot: number, fn: (env: Value[]) => Value, src: string, reads: Set<string> }[]} */
    const params = [];
    for (const p of rec.parameters) {
      const visible = new Map(slots);
      if (!declare(p.name, "param", `Parameter ${p.name}`)) continue;
      const src = overrides[p.name] ?? p.expr;
      const b = expr(src, `Parameter ${p.name}`, visible);
      if (b) params.push({ name: p.name, slot: /** @type {number} */ (slots.get(p.name)), fn: b.fn, src, reads: b.reads });
    }
    /** @type {any[]} */
    const nodes = [];
    let draws = 0;
    const defsByName = new Map((rec.definitions ?? []).map((d) => [d.name, d]));
    // Variables and definitions in record order: a definition may follow the variables it reads, and a variable's
    // arguments may read earlier variables and definitions. The record lists them in one order, "order".
    const order = /** @type {any[]} */ (input.order ?? [...rec.variables.map((v) => ({ type: "var", name: v.name })), ...rec.definitions.map((d) => ({ type: "def", name: d.name }))]);
    const varsByName = new Map(rec.variables.map((v) => [v.name, v]));
    for (const item of order) {
      if (item.type === "var") {
        const v = varsByName.get(item.name);
        if (!v) { errors.push(`The order lists "${item.name}", which is not a variable.`); continue; }
        const visible = new Map(slots);
        const law = L.BY_ID[v.law];
        if (!declare(v.name, "var", `Variable ${v.name}`)) continue;
        if (!law) { errors.push(`Variable ${v.name}: "${String(v.law).slice(0, 30)}" is not a law of this group (${L.LAWS.map((l) => l.id).join(", ")}).`); continue; }
        const repeat = v.repeat ?? 1;
        if (!Number.isInteger(repeat) || repeat < 1 || repeat > LIMITS.repeat) { errors.push(`Variable ${v.name}: repeat ${repeat} is not an integer in [1, ${LIMITS.repeat}].`); continue; }
        /** @type {Record<string, any>} */
        const args = {};
        let constant = true;
        /** @type {Set<string>} */
        const reads = new Set();
        for (const ps of law.params) {
          if (!(ps.name in (v.args ?? {}))) { errors.push(`Variable ${v.name}: the ${law.name} law needs the argument ${ps.name} (${ps.text}).`); continue; }
          const b = expr(v.args[ps.name], `Variable ${v.name}, argument ${ps.name}`, visible);
          if (!b) continue;
          args[ps.name] = b.fn;
          for (const r of b.reads) {
            reads.add(r);
            if (kinds.get(r) !== "param") constant = false;
          }
        }
        for (const extra of Object.keys(v.args ?? {})) if (!law.params.some((ps) => ps.name === extra)) errors.push(`Variable ${v.name}: the ${law.name} law has no argument ${extra}.`);
        draws += repeat * (v.law === "multinomial" ? 8 : 1);
        nodes.push({ type: "var", name: v.name, slot: slots.get(v.name), law, args, repeat, constant, reads, index: nodes.length, unit: v.unit ?? "" });
      } else if (item.type === "def") {
        const d = defsByName.get(item.name);
        if (!d) { errors.push(`The order lists "${item.name}", which is not a definition.`); continue; }
        const visible = new Map(slots);
        if (!declare(d.name, "def", `Definition ${d.name}`)) continue;
        const b = expr(d.expr, `Definition ${d.name}`, visible);
        if (b) nodes.push({ type: "def", name: d.name, slot: slots.get(d.name), fn: b.fn, tree: b.tree, reads: b.reads, unit: d.unit ?? "" });
      } else errors.push(`The order holds an item of type "${String(item.type).slice(0, 20)}".`);
    }
    if (draws > LIMITS.drawsPerReplicate) errors.push(`One replicate draws ${draws} values. The limit is ${LIMITS.drawsPerReplicate}.`);
    if (order.length !== rec.variables.length + rec.definitions.length) errors.push("The order must list every variable and every definition once.");

    /** @type {any[]} */
    const quantities = [];
    const qnames = new Set();
    for (const q of rec.quantities) {
      if (!NAME.test(q.name ?? "") || qnames.has(q.name)) { errors.push(`Quantity "${String(q.name).slice(0, 30)}": a quantity needs a unique name.`); continue; }
      qnames.add(q.name);
      if (q.kind === "ratio") {
        const a = expr(/** @type {string} */ (q.num), `Quantity ${q.name}, numerator`, slots), b = expr(/** @type {string} */ (q.den), `Quantity ${q.name}, denominator`, slots);
        if (a && b) quantities.push({ name: q.name, kind: q.kind, num: a.fn, den: b.fn, trees: [a.tree, b.tree], reads: new Set([...a.reads, ...b.reads]), unit: q.unit ?? "" });
      } else if (q.kind === "probability" || q.kind === "expectation") {
        const a = expr(/** @type {string} */ (q.expr), `Quantity ${q.name}`, slots);
        if (a) quantities.push({ name: q.name, kind: q.kind, fn: a.fn, trees: [a.tree], reads: a.reads, unit: q.unit ?? "" });
      } else errors.push(`Quantity ${q.name}: the kind "${String(q.kind).slice(0, 20)}" is not probability, expectation or ratio.`);
    }

    // Alternatives: each sets some parameters; the rest keep their values.
    /** @type {{ label: string, values: Value[] }[]} */
    const alternatives = [];
    for (const alt of rec.alternatives) {
      const env = /** @type {Value[]} */ (new Array(slots.size).fill(0));
      for (const name of Object.keys(alt.set ?? {})) if (!rec.parameters.some((p) => p.name === name)) errors.push(`Alternative "${alt.label}": "${name}" is not a parameter.`);
      for (const p of params) {
        const set = alt.set?.[p.name];
        let fn = p.fn;
        if (set !== undefined && overrides[p.name] === undefined) {
          const b = expr(set, `Alternative "${alt.label}", parameter ${p.name}`, new Map([...slots].filter(([n]) => kinds.get(n) === "param" && /** @type {number} */ (slots.get(n)) < p.slot)));
          if (!b) continue;
          fn = b.fn;
        }
        try {
          const v = fn(env);
          if (typeof v === "number" ? Number.isNaN(v) : v.some(Number.isNaN)) throw new E.ExprError("the value is not a number");
          env[p.slot] = v;
        } catch (e) {
          errors.push(`Alternative "${alt.label}", parameter ${p.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      alternatives.push({ label: String(alt.label ?? `Alternative ${alternatives.length + 1}`), values: env });
    }
    for (const n of nodes) {
      if (n.type !== "var" || !n.constant) continue;
      for (const alt of alternatives) {
        const p = argsAt(n, alt.values);
        const bad = p.error ? [p.error] : n.law.check(p.params);
        for (const msg of bad) errors.push(`Variable ${n.name} in "${alt.label}": ${msg}`);
      }
    }
    const method = settings.method ?? "independent", failure = settings.failure ?? "none";
    if (!["independent", "inverse", "rejection"].includes(method)) errors.push(`The method "${method}" is not part of this group.`);
    if (errors.length) return { ok: false, errors };

    const focusName = rec.focus && slots.has(String(rec.focus).replace(/\[\d+\]$/, "")) ? String(rec.focus) : nodes.find((n) => n.type === "var")?.name ?? nodes[0]?.name;
    const compiled = { ok: true, record: rec, settings: { seed: settings.seed >>> 0, method, compare: settings.compare ?? "none", failure, overrides }, slots, kinds, params, nodes, quantities, alternatives, focus: focusName, decision: rec.decision ?? { objective: null, constraints: [] }, errors: [] };
    return compiled;
  }

  /** The parameters of a variable node in an environment. @param {any} node @param {Value[]} env */
  function argsAt(node, env) {
    /** @type {Record<string, any>} */
    const params = {};
    try {
      for (const [k, fn] of Object.entries(node.args)) params[k] = /** @type {(e: Value[]) => Value} */ (fn)(env);
    } catch (e) {
      return { params, error: e instanceof Error ? e.message : String(e) };
    }
    return { params, error: "" };
  }

  /* ---------- simulation ---------- */

  /**
   * A sampler factory for one method: it caches samplers by parameter values, so a variable with constant
   * arguments sets up its sampler once.
   * @param {string} method @param {string} failure
   */
  function samplers(method, failure) {
    /** @type {Map<string, any>} */
    const cache = new Map();
    /** @param {any} law @param {Record<string, any>} params */
    return (law, params) => {
      const key = law.id + JSON.stringify(params);
      let s = cache.get(key);
      if (!s) {
        const errs = law.check(params);
        if (errs.length) throw new E.ExprError(errs[0]);
        if (method === "inverse") s = law.inverse(params, failure === "table_cut" ? 0.99 : undefined);
        else if (method === "rejection") s = law.rejection(params, failure === "envelope" ? 0.5 : 1);
        else s = law.reference(params);
        if ("unavailable" in s) throw new E.ExprError(`${law.name} law, ${method} method: ${s.unavailable}`);
        if (cache.size > 512) cache.clear();
        cache.set(key, s);
      }
      return s;
    };
  }

  /**
   * The statistics of one block of replicates, b * BLOCK to (b + 1) * BLOCK - 1, for each method (the chosen one and
   * the comparison), alternative and quantity: Welford sums, hit counts, co-moments for ratios, paired differences
   * between alternatives, the focus variable's histogram, rejection counts and the block's interval coverage.
   * @param {any} c a compiled model @param {number} b @param {{ references?: (number | null)[][], window?: { lo: number, width: number, bins: number, thresholds: number[] } }} [opts]
   */
  function block(c, b, opts = {}) {
    const methods = [c.settings.method, ...(c.settings.compare !== "none" && c.settings.compare !== c.settings.method ? [c.settings.compare] : [])];
    const out = { block: b, n: BLOCK, methods: /** @type {any[]} */ ([]), error: "" };
    for (const m of methods) {
      const t0 = Date.now();
      const r = runMethod(c, b, m, opts);
      out.methods.push({ method: m, ...r, ms: Date.now() - t0 });
      if (r.error) { out.error = r.error; break; }
    }
    return out;
  }

  /** @param {any} c @param {number} b @param {string} method @param {any} opts */
  function runMethod(c, b, method, opts) {
    const get = samplers(method, c.settings.failure);
    const A = c.alternatives.length, Q = c.quantities.length;
    const rngVar = R.stream(c.settings.seed, STREAM, 0, 0);
    const stats = { proposals: 0, accepts: 0, violations: 0 };
    // Per alternative and quantity: [n, mean, m2] or, for a ratio, [n, ma, mb, caa, cbb, cab]; hits for probabilities.
    const acc = c.alternatives.map(() => c.quantities.map(() => ({ n: 0, mean: 0, m2: 0, mb: 0, cbb: 0, cab: 0, hits: 0 })));
    const pairs = [];
    for (let a = 0; a < A; a++) for (let a2 = a + 1; a2 < A; a2++) pairs.push([a, a2]);
    const diffs = pairs.map(() => c.quantities.map(() => ({ n: 0, mean: 0, m2: 0 })));
    const win = opts.window;
    // The focus variable's frequencies, for each alternative: bins of the window, values below and above it, and
    // the counts above each threshold, so the survival plot reaches past the window.
    const hists = c.alternatives.map(() => ({ bins: win ? new Array(win.bins).fill(0) : [], under: 0, over: 0, exceed: win ? new Array(win.thresholds.length).fill(0) : [], values: 0, max: -Infinity }));
    const [focusName, focusIdx] = splitFocus(c.focus);
    const vals = new Float64Array(A * Q), dens = new Float64Array(A * Q);
    const envs = c.alternatives.map((/** @type {any} */ alt) => alt.values.slice());
    const start = b * BLOCK;
    try {
      for (let r = 0; r < BLOCK; r++) {
        const i = start + r, iStream = c.settings.failure === "stream_reuse" ? i % REUSE : i;
        for (let a = 0; a < A; a++) {
          const env = envs[a];
          for (const node of c.nodes) {
            if (node.type === "def") { env[node.slot] = node.fn(env); continue; }
            const p = argsAt(node, env);
            if (p.error) throw new E.ExprError(`Variable ${node.name}: ${p.error}`);
            const s = get(node.law, p.params);
            if (node.repeat === 1) {
              rngVar.reset(iStream, node.index * 65536);
              env[node.slot] = s.draw(rngVar, stats);
            } else {
              const xs = new Array(node.repeat);
              for (let j = 0; j < node.repeat; j++) {
                rngVar.reset(iStream, node.index * 65536 + j);
                xs[j] = s.draw(rngVar, stats);
              }
              env[node.slot] = xs;
            }
          }
          for (let q = 0; q < Q; q++) {
            const qu = c.quantities[q];
            if (qu.kind === "ratio") {
              const x = scalar(qu.num(env), qu.name), y = scalar(qu.den(env), qu.name);
              vals[a * Q + q] = x;
              dens[a * Q + q] = y;
              const s = acc[a][q], n = s.n + 1, dx = x - s.mean, dy = y - s.mb;
              s.mean += dx / n;
              s.mb += dy / n;
              s.m2 += dx * (x - s.mean);
              s.cbb += dy * (y - s.mb);
              s.cab += dx * (y - s.mb);
              s.n = n;
            } else {
              let x = scalar(qu.fn(env), qu.name);
              if (qu.kind === "probability") x = +(x !== 0);
              vals[a * Q + q] = x;
              const s = acc[a][q], n = s.n + 1, d = x - s.mean;
              s.mean += d / n;
              s.m2 += d * (x - s.mean);
              s.n = n;
              if (x !== 0) s.hits++;
            }
          }
          if (focusName) {
            const v = env[c.slots.get(focusName)], h = hists[a];
            const xs = typeof v === "number" ? [v] : focusIdx ? [v[focusIdx - 1]] : v;
            for (const x of xs) {
              h.values++;
              if (x > h.max) h.max = x;
              if (!win) continue;
              const k = Math.floor((x - win.lo) / win.width);
              if (k < 0) h.under++;
              else if (k >= win.bins) h.over++;
              else h.bins[k]++;
              for (let t = 0; t < win.thresholds.length && x > win.thresholds[t]; t++) h.exceed[t]++;
            }
          }
        }
        for (let p = 0; p < pairs.length; p++) {
          const [a, a2] = pairs[p];
          for (let q = 0; q < Q; q++) {
            if (c.quantities[q].kind === "ratio") continue;
            const d = vals[a2 * Q + q] - vals[a * Q + q], s = diffs[p][q], n = s.n + 1, dd = d - s.mean;
            s.mean += dd / n;
            s.m2 += dd * (d - s.mean);
            s.n = n;
          }
        }
      }
    } catch (e) {
      return { error: `Replicate ${start}..${start + BLOCK - 1}: ${e instanceof Error ? e.message : String(e)}`, acc, diffs, pairs, hists: [], rejection: stats, cover: [] };
    }
    // Interval coverage of this block alone, against the reference values the caller passes.
    const cover = acc.map((/** @type {any[]} */ row, /** @type {number} */ a) => row.map((/** @type {any} */ s, /** @type {number} */ q) => {
      const ref = opts.references?.[a]?.[q];
      if (ref === null || ref === undefined) return null;
      const iv = interval(c.quantities[q].kind, s, "unknown");
      // The tolerance absorbs the rounding error of an enumerated reference; an interval of width 0 needs it.
      const tol = 1e-9 * Math.max(1, Math.abs(ref));
      return iv.lo === null || iv.hi === null ? null : +(ref >= iv.lo - tol && ref <= iv.hi + tol);
    }));
    for (const h of hists) if (!Number.isFinite(h.max)) h.max = /** @type {any} */ (null);
    return { error: "", acc, diffs, pairs, hists, rejection: stats, cover };
  }

  /** @param {Value} v @param {string} name */
  function scalar(v, name) {
    if (typeof v !== "number") throw new E.ExprError(`Quantity ${name} gives a vector. Use sum(), mean() or an index.`);
    if (!Number.isFinite(v)) throw new E.ExprError(`Quantity ${name} is not finite (${v > 0 ? "+∞" : v < 0 ? "−∞" : "not a number"}).`);
    return v;
  }

  /** "X[2]" -> ["X", 2]; "X" -> ["X", 0]. @param {string} focus @returns {[string, number]} */
  function splitFocus(focus) {
    const m = /^(.*)\[(\d+)\]$/.exec(focus ?? "");
    return m ? [m[1], Number(m[2])] : [focus, 0];
  }

  /** Chan, Golub and LeVeque's update: two Welford summaries as one. @param {any} x @param {any} y */
  function combine(x, y) {
    const n = x.n + y.n;
    if (!x.n) return { ...y };
    if (!y.n) return { ...x };
    const d = y.mean - x.mean, db = (y.mb ?? 0) - (x.mb ?? 0), w = (x.n * y.n) / n;
    return {
      n, mean: x.mean + (d * y.n) / n, m2: x.m2 + y.m2 + d * d * w, mb: (x.mb ?? 0) + (db * y.n) / n,
      cbb: (x.cbb ?? 0) + (y.cbb ?? 0) + db * db * w, cab: (x.cab ?? 0) + (y.cab ?? 0) + d * db * w, hits: (x.hits ?? 0) + (y.hits ?? 0),
    };
  }

  /** An empty accumulator for a compiled model. @param {any} c */
  function empty(c) {
    return { blocks: 0, n: 0, methods: /** @type {any[]} */ ([]), trace: /** @type {any[]} */ ([]), cover: /** @type {any[]} */ ([]), error: "" };
  }

  /**
   * Merge the next block into the accumulator. Blocks must arrive in order 0, 1, 2, …: the pool holds early
   * arrivals until their turn, so the floating-point sums are the same for any number of workers.
   * @param {any} accum @param {any} blk @param {any} c
   */
  function merge(accum, blk, c) {
    if (blk.block !== accum.blocks) throw new Error(`Block ${blk.block} arrived for position ${accum.blocks}.`);
    if (blk.error) return { ...accum, error: blk.error };
    const methods = blk.methods.map((/** @type {any} */ m, /** @type {number} */ k) => {
      const prev = accum.methods[k];
      if (!prev) return { method: m.method, acc: m.acc.map((/** @type {any[]} */ row) => row.map((s) => ({ ...s }))), diffs: m.diffs.map((/** @type {any[]} */ row) => row.map((s) => ({ ...s }))), pairs: m.pairs, hists: m.hists.map((/** @type {any} */ h) => ({ ...h, bins: h.bins.slice(), exceed: h.exceed.slice() })), rejection: { ...m.rejection }, ms: m.ms, cover: m.cover.map((/** @type {any[]} */ row) => row.map((x) => (x === null ? null : { hit: x, of: 1 }))) };
      return {
        method: m.method,
        acc: prev.acc.map((/** @type {any[]} */ row, /** @type {number} */ a) => row.map((s, q) => combine(s, m.acc[a][q]))),
        diffs: prev.diffs.map((/** @type {any[]} */ row, /** @type {number} */ p) => row.map((s, q) => combine(s, m.diffs[p][q]))),
        pairs: prev.pairs,
        hists: prev.hists.map((/** @type {any} */ h, /** @type {number} */ a) => {
          const g = m.hists[a];
          return { bins: h.bins.map((/** @type {number} */ x, /** @type {number} */ i) => x + g.bins[i]), under: h.under + g.under, over: h.over + g.over,
            exceed: h.exceed.map((/** @type {number} */ x, /** @type {number} */ i) => x + g.exceed[i]), values: h.values + g.values, max: g.max === null ? h.max : h.max === null ? g.max : Math.max(h.max, g.max) };
        }),
        rejection: { proposals: prev.rejection.proposals + m.rejection.proposals, accepts: prev.rejection.accepts + m.rejection.accepts, violations: prev.rejection.violations + m.rejection.violations },
        ms: prev.ms + m.ms,
        cover: prev.cover.map((/** @type {any[]} */ row, /** @type {number} */ a) => row.map((x, q) => { const y = m.cover[a]?.[q]; return x === null || y === null || y === undefined ? null : { hit: x.hit + y, of: x.of + 1 }; })),
      };
    });
    const blocks = accum.blocks + 1, n = blocks * BLOCK;
    const trace = accum.trace.slice();
    // Thin the trace to about 300 points on a log scale of n: every block up to 16, then each 1.5 % step in n.
    const last = trace.length ? trace[trace.length - 1].n : 0;
    if (blocks <= 16 || n >= last * 1.015) trace.push({ n, est: methods.map((/** @type {any} */ m) => m.acc.map((/** @type {any[]} */ row) => row.map((/** @type {any} */ s, /** @type {number} */ q) => point(c.quantities[q].kind, s)))) });
    return { blocks, n, methods, trace, error: "" };
  }

  /** The estimate and its 95 % interval, for the trace. @param {string} kind @param {any} s */
  function point(kind, s) {
    const iv = interval(kind, s, "unknown");
    return [iv.est, iv.lo, iv.hi];
  }

  /**
   * The estimate and a 95 % interval that fits the estimator: Wilson (and Clopper-Pearson) for a probability, with
   * the exact zero-hit bound; the CLT interval for an expectation, and none when the variance is infinite; the
   * delta-method interval for a ratio of means.
   * @param {string} kind @param {any} s @param {string} variance "finite", "infinite" or "unknown"
   */
  function interval(kind, s, variance) {
    const n = s.n;
    if (!n) return { est: null, lo: null, hi: null, se: null, how: "no replicates" };
    if (kind === "probability") {
      const k = s.hits, est = k / n, w = S.wilson(k, n, Z95);
      if (k === 0) return { est, lo: 0, hi: S.zeroHitBound(n, 0.05), se: 0, how: "zero hits: exact one-sided 95 % bound 1 − 0.05^(1/n)" };
      if (k === n) return { est, lo: 1 - S.zeroHitBound(n, 0.05), hi: 1, se: 0, how: "all hits: exact one-sided 95 % bound" };
      return { est, lo: w[0], hi: w[1], se: Math.sqrt((est * (1 - est)) / n), how: "Wilson score interval, 95 %" };
    }
    if (kind === "ratio") {
      if (s.mb === 0 || n < 2) return { est: null, lo: null, hi: null, se: null, how: "the denominator mean is 0" };
      const r = s.mean / s.mb, va = s.m2 / (n - 1), vb = s.cbb / (n - 1), cab = s.cab / (n - 1);
      const se = Math.sqrt(Math.max(0, va - 2 * r * cab + r * r * vb) / n) / Math.abs(s.mb);
      return { est: r, lo: r - Z95 * se, hi: r + Z95 * se, se, how: "delta-method interval for a ratio of means, 95 %" };
    }
    if (n < 2) return { est: s.mean, lo: null, hi: null, se: null, how: "one replicate" };
    if (variance === "infinite") return { est: s.mean, lo: null, hi: null, se: null, how: "no interval: the variance is infinite, so the central limit theorem does not apply" };
    const se = Math.sqrt(s.m2 / (n - 1) / n);
    return { est: s.mean, lo: s.mean - Z95 * se, hi: s.mean + Z95 * se, se, how: "CLT interval, 95 %, asymptotic" };
  }

  /* ---------- moment status ---------- */

  /**
   * Whether the mean and the variance of each quantity exist: from the tail class of each variable it reads and the
   * growth of the expression. A probability is bounded. A quantity that reads a heavy-tailed variable is decided only
   * when it is that variable, or an affine function of it; other cases are "unknown", never guessed.
   * @param {any} c a compiled model
   */
  function momentStatus(c) {
    /** @type {Map<string, { cls: "finite" | "light" | "heavy" | "unknown", order: number }>} */
    const tails = new Map();
    for (const n of c.nodes) {
      if (n.type === "def") continue;
      const parents = [...n.reads].filter((r) => c.kinds.get(r) !== "param");
      let cls = /** @type {"finite" | "light" | "heavy" | "unknown"} */ ("unknown"), order = Infinity;
      const finiteLaw = ["bernoulli", "categorical", "uniform", "hypergeometric", "multinomial", "binomial"].includes(n.law.id);
      if (!parents.length) {
        const p = argsAt(n, c.alternatives[0].values).params, s = n.law.support(p), mo = n.law.moments(p);
        order = mo.order;
        cls = s.hi < Infinity ? "finite" : order === Infinity ? "light" : "heavy";
        for (const alt of c.alternatives.slice(1)) {
          const q = argsAt(n, alt.values).params, o2 = n.law.moments(q).order;
          if (o2 < order) { order = o2; cls = "heavy"; }
          if (n.law.support(q).hi === Infinity && cls === "finite") cls = o2 === Infinity ? "light" : "heavy";
        }
      } else {
        const ups = parents.map((r) => tailOf(r, c, tails));
        if (ups.every((u) => u === "finite")) cls = finiteLaw && n.law.id !== "binomial" && n.law.id !== "multinomial" ? "finite" : n.law.id === "zipf" ? "unknown" : finiteLaw ? "finite" : "light";
        else if (finiteLaw && !["binomial", "multinomial"].includes(n.law.id)) cls = "finite";
      }
      tails.set(n.name, { cls, order });
    }
    return c.quantities.map((/** @type {any} */ q) => {
      if (q.kind === "probability") return { mean: "finite", variance: "finite", reason: "An indicator takes only the values 0 and 1, so all its moments exist." };
      const vars = new Set();
      for (const t of q.trees) for (const r of randomReads(t, c)) vars.add(r);
      const classes = [...vars].map((v) => /** @type {any} */ (tails.get(v)) ?? { cls: "unknown", order: Infinity });
      if (classes.every((t) => t.cls === "finite")) return { mean: "finite", variance: "finite", reason: "Every variable it reads has a finite support, so the quantity has bounds." };
      const growth = q.trees.every((/** @type {any} */ t) => polynomial(t, c));
      if (q.kind === "expectation" && vars.size === 1) {
        const v = /** @type {string} */ ([...vars][0]), t = /** @type {any} */ (tails.get(v));
        if (t && t.cls === "heavy" && affine(q.trees[0], v, c)) {
          const o = t.order;
          return { mean: o > 1 ? "finite" : "infinite", variance: o > 2 ? "finite" : "infinite", reason: `The quantity is an affine function of ${v}, whose moment of order r exists only for r < ${fmtOrder(o)}.` };
        }
      }
      if (classes.every((t) => t.cls === "finite" || t.cls === "light") && growth) return { mean: "finite", variance: "finite", reason: "Every variable it reads has finite moments of all orders, and the expression grows at most as a polynomial." };
      return { mean: "unknown", variance: "unknown", reason: "The page cannot show that the moments exist. A variable it reads has a heavy or unknown tail, or the expression grows faster than a polynomial." };
    });
  }

  /** @param {number} o */
  const fmtOrder = (o) => (Number.isInteger(o) ? String(o) : o.toFixed(3).replace(/0+$/, ""));

  /** @param {string} name @param {any} c @param {Map<string, any>} tails @returns {string} */
  function tailOf(name, c, tails) {
    if (tails.has(name)) return tails.get(name).cls;
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    if (node?.type === "def") {
      const ups = [...node.reads].filter((r) => c.kinds.get(r) !== "param").map((r) => tailOf(r, c, tails));
      return ups.every((u) => u === "finite") ? "finite" : "unknown";
    }
    return "unknown";
  }

  /** The random variables an expression reads, through definitions. @param {any} tree @param {any} c */
  function randomReads(tree, c) {
    /** @type {Set<string>} */
    const out = new Set();
    /** @param {string} name */
    const visit = (name) => {
      const k = c.kinds.get(name);
      if (k === "var") out.add(name);
      else if (k === "def") for (const r of c.nodes.find((/** @type {any} */ n) => n.name === name).reads) visit(r);
    };
    for (const r of E.names(tree)) visit(r);
    return out;
  }

  /** True when the expression reads no random variable. @param {any} tree @param {any} c */
  const fixed = (tree, c) => randomReads(tree, c).size === 0;

  /** True when the expression grows at most as a polynomial of the variables. @param {any} t @param {any} c @returns {boolean} */
  function polynomial(t, c) {
    switch (t.t) {
      case "num": return true;
      case "id": {
        if (c.kinds.get(t.name) === "def") return polynomial(c.nodes.find((/** @type {any} */ n) => n.name === t.name).tree, c);
        return true;
      }
      case "un": return polynomial(t.a, c);
      case "bin":
        if (t.op === "/") return polynomial(t.a, c) && fixed(t.b, c);
        if (t.op === "^") return polynomial(t.a, c) && fixed(t.b, c);
        return polynomial(t.a, c) && polynomial(t.b, c);
      case "call":
        if (["exp", "log", "log1p", "pow", "prod"].includes(t.fn)) return t.args.every((/** @type {any} */ a) => fixed(a, c));
        return t.args.every((/** @type {any} */ a) => polynomial(a, c));
      case "idx": return polynomial(t.a, c) && polynomial(t.i, c);
      case "arr": return t.items.every((/** @type {any} */ a) => polynomial(a, c));
      default: return false;
    }
  }

  /** True when the expression is a + b·v with a and b free of random variables. @param {any} t @param {string} v @param {any} c @returns {boolean} */
  function affine(t, v, c) {
    if (fixed(t, c)) return true;
    if (t.t === "id") return t.name === v;
    if (t.t === "un") return affine(t.a, v, c);
    if (t.t === "bin" && (t.op === "+" || t.op === "-")) return affine(t.a, v, c) && affine(t.b, v, c);
    if (t.t === "bin" && t.op === "*") return (fixed(t.a, c) && affine(t.b, v, c)) || (fixed(t.b, c) && affine(t.a, v, c));
    if (t.t === "bin" && t.op === "/") return affine(t.a, v, c) && fixed(t.b, c);
    return false;
  }

  /* ---------- reference values by enumeration ---------- */

  /**
   * Reference values for each alternative and quantity by enumeration of the joint support, with the focus
   * variable's marginal law. Infinite supports stop where the remaining mass is below 1e-13, and the result states
   * that neglected mass. A model with a repeated variable, or more than 400,000 states, has no enumeration.
   * @param {any} c a compiled model @param {any[]} status the moment status of each quantity
   */
  function reference(c, status) {
    return enumerate(c, status).map((/** @type {any} */ r, /** @type {number} */ a) => {
      const closed = closedForm(c, a, status);
      return { ...r, values: r.values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (v !== null ? v : closed[k])), closed: closed.map((v) => v !== null) };
    });
  }

  /**
   * Exact values for a model with one scalar variable X of constant parameters and no definitions: P(X op v) from
   * the CDF, the survival function or the PMF, and E[X] from the law's moments. These need no enumeration, so they
   * also cover a heavy tail such as the zeta law.
   * @param {any} c @param {number} a @param {any[]} status @returns {(number | null)[]}
   */
  function closedForm(c, a, status) {
    const none = c.quantities.map(() => null);
    if (c.nodes.length !== 1 || c.nodes[0].type !== "var" || !c.nodes[0].constant || c.nodes[0].repeat !== 1 || c.nodes[0].law.dim) return none;
    const node = c.nodes[0], law = node.law, pr = argsAt(node, c.alternatives[a].values);
    if (pr.error || law.check(pr.params).length) return none;
    const p = pr.params, env = c.alternatives[a].values;
    const FLIP = /** @type {Record<string, string>} */ ({ "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "!=": "!=" });
    return c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
      const t = q.trees[0];
      if (q.kind === "expectation" && t.t === "id" && t.name === node.name) return status[k].mean === "finite" ? law.moments(p).mean : null;
      if (q.kind !== "probability" || t.t !== "bin" || !(t.op in FLIP)) return null;
      let op = t.op, side = t.b;
      if (t.a.t === "id" && t.a.name === node.name && fixed(t.b, c)) side = t.b;
      else if (t.b.t === "id" && t.b.name === node.name && fixed(t.a, c)) { side = t.a; op = FLIP[op]; }
      else return null;
      const v = E.compile(side, c.slots)(env);
      if (typeof v !== "number" || Number.isNaN(v)) return null;
      switch (op) {
        case "<": return law.cdf(Math.ceil(v) - 1, p);
        case "<=": return law.cdf(Math.floor(v), p);
        case ">": return law.sf(Math.floor(v), p);
        case ">=": return law.sf(Math.ceil(v) - 1, p);
        case "==": return law.pmf(v, p);
        default: return 1 - law.pmf(v, p);
      }
    });
  }

  /** @param {any} c @param {any[]} status */
  function enumerate(c, status) {
    const rep = c.nodes.find((/** @type {any} */ n) => n.type === "var" && n.repeat > 1);
    if (rep) return c.alternatives.map(() => ({ values: c.quantities.map(() => null), reason: `Variable ${rep.name} repeats ${rep.repeat} times, so the page does not enumerate the joint support.`, neglected: 0, marginal: null }));
    const [focusName, focusIdx] = splitFocus(c.focus);
    return c.alternatives.map((/** @type {any} */ alt) => {
      const Q = c.quantities.length, sums = new Float64Array(Q), dens = new Float64Array(Q);
      /** @type {Map<number, number>} */
      const marginal = new Map();
      let states = 0, neglected = 0, reason = "";
      const env = alt.values.slice();
      /** @param {number} i @param {number} w @returns {boolean} */
      const walk = (i, w) => {
        if (i === c.nodes.length) {
          if (++states > LIMITS.states) { reason = `The joint support has more than ${LIMITS.states} states.`; return false; }
          for (let q = 0; q < Q; q++) {
            const qu = c.quantities[q];
            if (qu.kind === "ratio") {
              sums[q] += w * scalar(qu.num(env), qu.name);
              dens[q] += w * scalar(qu.den(env), qu.name);
            } else {
              const x = scalar(qu.fn(env), qu.name);
              sums[q] += w * (qu.kind === "probability" ? +(x !== 0) : x);
            }
          }
          if (focusName) {
            const v = env[c.slots.get(focusName)], x = typeof v === "number" ? v : v[(focusIdx || 1) - 1];
            marginal.set(x, (marginal.get(x) ?? 0) + w);
          }
          return true;
        }
        const node = c.nodes[i];
        if (node.type === "def") { env[node.slot] = node.fn(env); return walk(i + 1, w); }
        const pr = argsAt(node, env);
        if (pr.error) throw new E.ExprError(pr.error);
        const errs = node.law.check(pr.params);
        if (errs.length) throw new E.ExprError(`Variable ${node.name}: ${errs[0]}`);
        if (node.law.id === "multinomial") return compositions(pr.params, (x, p) => { env[node.slot] = x; return walk(i + 1, w * p); });
        const s = node.law.support(pr.params);
        let mass = 0;
        for (let k = s.lo; k <= s.hi; k++) {
          const p = node.law.pmf(k, pr.params);
          mass += p;
          if (p > 0) {
            env[node.slot] = k;
            if (!walk(i + 1, w * p)) return false;
          }
          if (s.hi === Infinity && 1 - mass < 1e-13 && node.law.sf(k, pr.params) < 1e-13) { neglected += w * node.law.sf(k, pr.params); break; }
          if (k - s.lo > 200000) { reason = `Variable ${node.name} has more than 200,000 support points with mass.`; return false; }
        }
        return true;
      };
      /** Every composition of n into k parts, for a multinomial law with at most 50,000 compositions. @param {any} p @param {(x: number[], w: number) => boolean} visit */
      const compositions = (p, visit) => {
        const k = p.p.length;
        if (S.lchoose(p.n + k - 1, k - 1) > Math.log(50000)) { reason = "A multinomial variable has more than 50,000 outcomes."; return false; }
        const x = new Array(k).fill(0);
        /** @param {number} j @param {number} left @returns {boolean} */
        const rec = (j, left) => {
          if (j === k - 1) {
            x[j] = left;
            let lp = S.lgamma(p.n + 1);
            for (let t = 0; t < k; t++) lp += x[t] === 0 ? 0 : x[t] * Math.log(p.p[t]) - S.lgamma(x[t] + 1);
            const pr = Math.exp(lp);
            return !(pr > 0) || visit(x.slice(), pr);
          }
          for (let v = 0; v <= left; v++) { x[j] = v; if (!rec(j + 1, left - v)) return false; }
          return true;
        };
        return rec(0, p.n);
      };
      try {
        if (!walk(0, 1)) return { values: c.quantities.map(() => null), reason, neglected, marginal: null };
      } catch (e) {
        return { values: c.quantities.map(() => null), reason: e instanceof Error ? e.message : String(e), neglected, marginal: null };
      }
      const values = c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
        if (status[k].mean === "infinite") return null;
        if (q.kind !== "probability" && neglected > 0 && status[k].mean !== "finite") return null;
        if (q.kind === "ratio") return dens[k] === 0 ? null : sums[k] / dens[k];
        return sums[k];
      });
      const keys = [...marginal.keys()].sort((x, y) => x - y);
      return { values, reason: "", neglected, marginal: { x: keys, p: keys.map((k) => /** @type {number} */ (marginal.get(k))) } };
    });
  }

  /* ---------- results ---------- */

  /**
   * Estimates, intervals, paired differences, coverage and the decision for merged statistics.
   * @param {any} c @param {any} accum @param {any[]} status @param {any[]} refs
   */
  function summary(c, accum, status, refs) {
    return accum.methods.map((/** @type {any} */ m) => {
      const alts = c.alternatives.map((/** @type {any} */ alt, /** @type {number} */ a) => ({
        label: alt.label,
        quantities: c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
          const s = m.acc[a][k], iv = interval(q.kind, s, status[k].variance);
          // An infinite mean is the stronger reason: the sample mean then has no finite limit at all.
          if (status[k].mean === "infinite" && iv.lo === null) iv.how = "no interval: the mean is infinite, so the sample mean has no finite limit";
          const sd = s.n > 1 ? Math.sqrt(s.m2 / (s.n - 1)) : null;
          const cov = m.cover[a]?.[k];
          return { name: q.name, kind: q.kind, n: s.n, hits: q.kind === "probability" ? s.hits : null, ...iv, sampleSd: q.kind === "probability" ? null : sd,
            reference: refs[a]?.values?.[k] ?? null, coverage: cov ? { hit: cov.hit, of: cov.of } : null,
            clopperPearson: q.kind === "probability" && s.n ? S.clopperPearson(s.hits, s.n, 0.05) : null };
        }),
      }));
      const diffs = m.pairs.map((/** @type {number[]} */ pair, /** @type {number} */ p) => ({
        a: pair[0], b: pair[1],
        quantities: c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
          if (q.kind === "ratio") return { name: q.name, est: null, lo: null, hi: null, how: "no paired interval for a ratio" };
          const s = m.diffs[p][k];
          const iv = interval("expectation", s, status[k].variance === "infinite" ? "infinite" : "unknown");
          return { name: q.name, est: iv.est, lo: iv.lo, hi: iv.hi, how: `paired difference ${c.alternatives[pair[1]].label} − ${c.alternatives[pair[0]].label}, same streams` };
        }),
      }));
      return { method: m.method, alts, diffs, decision: decide(c, alts, diffs), rejection: m.rejection, ms: m.ms, hists: m.hists };
    });
  }

  /**
   * The decision: the alternatives that meet each constraint (yes, no or not separable at this sample size), then the
   * best admissible one for the objective, and whether its paired interval separates it from each other one.
   * @param {any} c @param {any[]} alts @param {any[]} diffs
   */
  function decide(c, alts, diffs) {
    const d = c.decision ?? {};
    const qi = (/** @type {string} */ name) => c.quantities.findIndex((/** @type {any} */ q) => q.name === name);
    const rows = alts.map((alt, a) => {
      const checks = (d.constraints ?? []).map((/** @type {any} */ con) => {
        const r = alt.quantities[qi(con.quantity)];
        if (!r || r.est === null) return { ...con, verdict: "unknown" };
        const lo = r.lo ?? r.est, hi = r.hi ?? r.est;
        const ok = con.op === "<=" ? hi <= con.value : lo >= con.value, bad = con.op === "<=" ? lo > con.value : hi < con.value;
        return { ...con, verdict: ok ? "met" : bad ? "not met" : "not separable" };
      });
      return { a, label: alt.label, checks, admissible: checks.every((/** @type {any} */ x) => x.verdict !== "not met") };
    });
    if (!d.objective) return { rows, best: null, separated: null, text: "The model states no objective, so the page ranks no alternatives." };
    const k = qi(d.objective.quantity), sign = d.objective.direction === "maximise" ? 1 : -1;
    const ok = rows.filter((r) => r.admissible && alts[r.a].quantities[k]?.est !== null);
    if (!ok.length) return { rows, best: null, separated: null, text: "No alternative meets the constraints." };
    const best = ok.reduce((x, y) => (sign * alts[y.a].quantities[k].est > sign * alts[x.a].quantities[k].est ? y : x));
    const separated = ok.filter((r) => r.a !== best.a).every((r) => {
      const pair = diffs.find((/** @type {any} */ p) => (p.a === best.a && p.b === r.a) || (p.a === r.a && p.b === best.a));
      const q = pair?.quantities[k];
      if (!q || q.lo === null) return false;
      // The interval of best − other, from the pair's interval of b − a.
      const [lo, hi] = pair.a === best.a ? [-q.hi, -q.lo] : [q.lo, q.hi];
      return sign > 0 ? lo > 0 : hi < 0;
    });
    return { rows, best: best.a, separated, text: "" };
  }

  return { FORMAT, VERSION, BLOCK, STREAM, REUSE, LIMITS, TEXT_FIELDS, complete, prepare, block, merge, empty, summary, interval, momentStatus, reference, splitFocus, argsAt };
});
