/* Monte Carlo Probability Workbench: the simulation engine. prepare() checks a model record and compiles it:
 * parameters, random variables in dependency order, definitions, the quantities to estimate, the decision
 * alternatives, and the control variate and the stratified variable of the variance-reduction methods. block()
 * simulates one block of replicates with a method (a sampler and a design: plain, stratified, antithetic or control
 * variate) and returns its statistics; merge() combines blocks in block order, so the result does not depend on how
 * many workers ran the blocks or in which order they finished. summary() turns merged statistics into estimates and
 * intervals that fit the design; reference() computes exact or numerical reference values: closed forms, the
 * enumeration of a discrete support, or adaptive quadrature over the quantile functions of continuous laws. Every
 * function is pure: the page, its workers and the tests run the same code.
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
  /** Each method of the run: the sampler of every law and the design of the estimator. */
  const METHODS = /** @type {Record<string, { sampler: "reference" | "inverse" | "rejection", design: "plain" | "stratified" | "antithetic" | "control" }>} */ ({
    independent: { sampler: "reference", design: "plain" }, inverse: { sampler: "inverse", design: "plain" }, rejection: { sampler: "rejection", design: "plain" },
    stratified: { sampler: "inverse", design: "stratified" }, antithetic: { sampler: "inverse", design: "antithetic" }, control: { sampler: "reference", design: "control" },
  });
  /** Stratification uses K = 2^s strata, 1 ≤ s ≤ 6, so each block of 1,024 replicates holds 1024/K ≥ 16 in each stratum. */
  const MAX_STRATA = 6;
  /**
   * The work budget of the quadrature of a reference for each alternative: an evaluation of the model counts 1 and a
   * CDF evaluation inside a numerical quantile counts 6, about their relative costs. The page computes references
   * when the model changes, so the budget keeps that below about 0.1 s for each alternative; a model beyond it shows
   * no reference, with the reason. The quadrature integrates over at most 2 continuous variables.
   */
  const QUAD = { work: 800000, quantile: 6, continuous: 2 };
  const ONE_MINUS = 1 - 2 ** -53;
  const TAIL_BREAKS = [2 ** -30, 2 ** -26, 2 ** -22, 2 ** -18, 2 ** -14, 2 ** -10, 2 ** -6, 2 ** -3];

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
   * @property {{ name: string, expr: string, note?: string }} [control] the control variate of the control-variate method
   */
  /**
   * @typedef {{ seed: number, method: string, compare?: string, failure?: string, overrides?: Record<string, string>, streams?: string, strata?: number, stratify?: string }} Settings
   * `stratify` names the variable whose uniform the stratified method divides into strata; "" picks the focus variable, else the first scalar variable.
   */

  /* ---------- checking and compiling ---------- */

  /** A shallow copy of a model record with every field present, for records from files and the editor. @param {any} rec @returns {ModelRecord} */
  function complete(rec) {
    return {
      format: FORMAT, version: VERSION, id: String(rec.id ?? "custom"), title: String(rec.title ?? "Untitled model"), problem: String(rec.problem ?? ""),
      parameters: rec.parameters ?? [], variables: rec.variables ?? [], definitions: rec.definitions ?? [], quantities: rec.quantities ?? [],
      alternatives: rec.alternatives?.length ? rec.alternatives : [{ label: "As stated", set: {} }],
      decision: rec.decision ?? { objective: null, constraints: [] }, focus: rec.focus, control: rec.control,
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
        /** The arguments that read a random variable or a definition. @type {string[]} */
        const random = [];
        for (const ps of law.params) {
          if (!(ps.name in (v.args ?? {}))) { errors.push(`Variable ${v.name}: the ${law.name} law needs the argument ${ps.name} (${ps.text}).`); continue; }
          const b = expr(v.args[ps.name], `Variable ${v.name}, argument ${ps.name}`, visible);
          if (!b) continue;
          args[ps.name] = b.fn;
          for (const r of b.reads) {
            reads.add(r);
            if (kinds.get(r) !== "param") { constant = false; if (!random.includes(ps.name)) random.push(ps.name); }
          }
        }
        for (const extra of Object.keys(v.args ?? {})) if (!law.params.some((/** @type {any} */ ps) => ps.name === extra)) errors.push(`Variable ${v.name}: the ${law.name} law has no argument ${extra}.`);
        draws += repeat * (law.dim ? 8 : 1);
        nodes.push({ type: "var", name: v.name, slot: slots.get(v.name), law, args, repeat, constant, reads, random, index: nodes.length, unit: v.unit ?? "" });
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
    const method = settings.method ?? "independent", compare = settings.compare ?? "none", failure = settings.failure ?? "none";
    const streams = settings.streams ?? "common", strata = settings.strata ?? 4, stratify = settings.stratify ?? "";
    if (!METHODS[method]) errors.push(`The method "${String(method).slice(0, 20)}" is not part of this page.`);
    if (compare !== "none" && !METHODS[compare]) errors.push(`The comparison method "${String(compare).slice(0, 20)}" is not part of this page.`);
    if (streams !== "common" && streams !== "separate") errors.push(`The streams setting "${String(streams).slice(0, 20)}" is not common or separate.`);
    if (!Number.isInteger(strata) || strata < 1 || strata > MAX_STRATA) errors.push(`The number of strata is 2^s with s an integer from 1 to ${MAX_STRATA}.`);
    if (errors.length) return { ok: false, errors };
    const designs = new Set([method, compare].filter((m) => METHODS[m]).map((m) => METHODS[m].design));

    const focusName = rec.focus && slots.has(String(rec.focus).replace(/\[\d+\]$/, "")) ? String(rec.focus) : nodes.find((n) => n.type === "var")?.name ?? nodes[0]?.name;
    const compiled = { ok: true, record: rec, settings: { seed: settings.seed >>> 0, method, compare, failure, overrides, streams, strata, stratify }, slots, kinds, params, nodes, quantities, alternatives, focus: focusName,
      decision: rec.decision ?? { objective: null, constraints: [] }, control: /** @type {any} */ (null), stratify: /** @type {any} */ (null), errors: [] };

    // The control variate: an expression of the model whose mean the page computes exactly, for each alternative.
    if (rec.control) {
      const ctl = rec.control, b = NAME.test(ctl.name ?? "") ? expr(ctl.expr, `Control ${ctl.name}`, slots) : null;
      if (!NAME.test(ctl.name ?? "")) errors.push(`Control "${String(ctl.name).slice(0, 30)}": a control needs a name.`);
      if (b) {
        const exact = alternatives.map((alt) => controlMoments(b.tree, compiled, alt.values));
        compiled.control = { name: ctl.name, expr: ctl.expr, fn: b.fn, tree: b.tree, exact,
          // The assumption failure "control_mean" moves the mean the estimator uses by 0.1 standard deviation.
          used: exact.map((m) => (m && m.mean !== null ? m.mean + (failure === "control_mean" && m.sd !== null ? 0.1 * m.sd : 0) : null)) };
        if (designs.has("control")) {
          const bad = exact.findIndex((m) => !m || m.mean === null);
          if (bad >= 0) errors.push(`Control ${ctl.name}: ${exact[bad]?.why ?? "the page cannot compute its exact mean"} (alternative "${alternatives[bad].label}").`);
          else if (exact.some((m) => m && m.sd === null)) errors.push(`Control ${ctl.name}: its variance is infinite, so the control-variate estimator has no CLT interval.`);
        }
      }
    } else if (designs.has("control")) errors.push("The control-variate method needs a control: add a line such as control C = X, with X a random variable whose mean the page knows.");

    // The stratified variable: the one the settings name, else the focus variable, else the first scalar variable.
    if (designs.has("stratified")) {
      const scalar = (/** @type {any} */ n) => n && n.type === "var" && n.repeat === 1 && !n.law.dim;
      const node = stratify ? nodes.find((n) => n.name === stratify) : [nodes.find((n) => n.name === focusName), ...nodes].find(scalar);
      if (!scalar(node)) errors.push(stratify ? `The stratified variable ${String(stratify).slice(0, 30)} is not a scalar random variable with no repeat of this model.` : "Stratification needs a scalar random variable with no repeat, and this model has none.");
      else compiled.stratify = { name: node.name, index: node.index, K: 2 ** strata };
    }
    if (errors.length) return { ok: false, errors };
    return compiled;
  }

  /**
   * The exact mean and standard deviation of a control expression in one alternative: it must be an affine function
   * of scalar variables with constant parameters, of the components X[j] of a vector law (or their sum), and of sum()
   * and mean() of a repeated scalar variable. Linearity gives the mean; independence between variables and the
   * covariances of each vector law give the variance. Returns { mean, sd } (sd null for an infinite variance), or
   * { mean: null, why } when the page cannot compute it.
   * @param {any} tree @param {any} c @param {Value[]} values
   */
  function controlMoments(tree, c, values) {
    const env = values.slice();
    for (const n of c.nodes) if (n.type === "def" && fixed(n.tree, c)) env[n.slot] = n.fn(env);
    /** The coefficient of each term: a variable, "sum X" or "mean X" of a repeated one, or the component "X[j]" of a vector law. @type {Map<string, number>} */
    const terms = new Map();
    let why = "";
    /** @param {string} key @param {number} k */
    const term = (key, k) => { terms.set(key, (terms.get(key) ?? 0) + k); return 0; };
    /** @param {string} name */
    const varNode = (name) => c.nodes.find((/** @type {any} */ x) => x.type === "var" && x.name === name && x.constant);
    /** @param {any} t @param {number} k @returns {number | null} the constant part, or null */
    const walk = (t, k) => {
      if (fixed(t, c)) {
        const v = E.compile(t, c.slots)(env);
        return typeof v === "number" ? k * v : null;
      }
      if (t.t === "id") {
        if (c.kinds.get(t.name) === "def") return walk(c.nodes.find((/** @type {any} */ n) => n.name === t.name).tree, k);
        const n = varNode(t.name);
        if (!n || n.repeat !== 1 || n.law.dim) { why = `the variable ${t.name} must be scalar, with no repeat and constant parameters`; return null; }
        return term(t.name, k);
      }
      if (t.t === "idx" && t.a.t === "id" && fixed(t.i, c)) {
        const n = varNode(t.a.name), j = E.compile(t.i, c.slots)(env);
        if (n && n.repeat === 1 && n.law.dim && typeof j === "number") return term(`${n.name}[${j}]`, k);
      }
      if (t.t === "un" && (t.op === "-" || t.op === "+")) return walk(t.a, t.op === "-" ? -k : k);
      if (t.t === "bin" && (t.op === "+" || t.op === "-")) { const a = walk(t.a, k), b = walk(t.b, t.op === "-" ? -k : k); return a === null || b === null ? null : a + b; }
      if (t.t === "bin" && (t.op === "*" || t.op === "/")) {
        const side = fixed(t.b, c) ? t.b : t.op === "*" && fixed(t.a, c) ? t.a : null;
        if (!side) { why = "the expression is not affine: a product or a quotient of random terms"; return null; }
        const v = E.compile(side, c.slots)(env);
        if (typeof v !== "number" || !Number.isFinite(v) || (t.op === "/" && v === 0)) { why = "a coefficient is not a finite number"; return null; }
        return walk(side === t.b ? t.a : t.b, t.op === "*" ? k * v : k / v);
      }
      if (t.t === "call" && (t.fn === "sum" || t.fn === "mean") && t.args[0].t === "id") {
        const n = varNode(t.args[0].name);
        if (n && n.repeat > 1 && !n.law.dim) return term(`${t.fn} ${n.name}`, k);
        if (n && n.repeat === 1 && n.law.dim) {
          const dim = n.law.dim(argsAt(n, values).params);
          for (let j = 1; j <= dim; j++) term(`${n.name}[${j}]`, t.fn === "sum" ? k : k / dim);
          return 0;
        }
      }
      why = "the expression is not an affine function of variables with known means";
      return null;
    };
    const a = walk(tree, 1);
    if (a === null) return { mean: null, sd: null, why };
    /** @type {Map<string, [number, number][]>} the components and coefficients of each vector variable */
    const vectors = new Map();
    let mean = a, variance = /** @type {number | null} */ (0);
    for (const [key, k] of terms) {
      const m = /^(sum |mean )?(\w+)(?:\[(\d+)\])?$/.exec(key), name = /** @type {string[]} */ (m)[2], n = varNode(name), p = argsAt(n, values).params;
      if (n.law.check(p).length) return { mean: null, sd: null, why: `the variable ${name} has invalid parameters` };
      if (m?.[3]) {
        const j = Number(m[3]), dim = n.law.dim(p);
        if (j < 1 || j > dim) return { mean: null, sd: null, why: `the index ${j} of ${name} is outside 1..${dim}` };
        const mg = n.law.marginal(p, j), mo = L.BY_ID[mg.law].moments(mg.params);
        mean += k * /** @type {number} */ (mo.mean);
        vectors.set(name, [...(vectors.get(name) ?? []), [j, k]]);
        continue;
      }
      if ((m?.[1] === "sum " || m?.[1] === "mean ") && terms.has(name)) return { mean: null, sd: null, why: `sum() or mean() of ${name} and ${name} itself are not independent terms` };
      const mo = n.law.moments(p), r = n.repeat, scale = m?.[1] === "mean " ? 1 / r : 1;
      if (mo.mean === null) return { mean: null, sd: null, why: `the mean of ${name} is infinite`, infinite: true };
      mean += k * scale * r * mo.mean;
      variance = variance === null || mo.variance === null ? null : variance + k * k * scale * scale * r * mo.variance;
    }
    for (const [name, parts] of vectors) {
      const n = varNode(name), p = argsAt(n, values).params;
      for (const [i, ki] of parts) for (const [j, kj] of parts) if (variance !== null) variance += ki * kj * n.law.covariance(p, i, j);
    }
    return { mean, sd: variance === null ? null : Math.sqrt(Math.max(0, variance)), why: "" };
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
   * A sampler factory for one sampler kind: it caches samplers by parameter values, so a variable with constant
   * arguments sets up its sampler once.
   * @param {"reference" | "inverse" | "rejection"} kind @param {string} failure
   */
  function samplers(kind, failure) {
    /** @type {Map<string, any>} */
    const cache = new Map();
    /** @param {any} law @param {Record<string, any>} params */
    return (law, params) => {
      const key = law.id + JSON.stringify(params);
      let s = cache.get(key);
      if (!s) {
        const errs = law.check(params);
        if (errs.length) throw new E.ExprError(errs[0]);
        if (kind === "inverse") s = law.inverse(params, failure === "table_cut" ? 0.99 : undefined);
        else if (kind === "rejection") s = law.rejection(params, failure === "envelope" ? 0.5 : 1);
        else s = law.reference(params);
        if ("unavailable" in s) throw new E.ExprError(`${law.name} law, ${kind === "reference" ? "independent sampling" : kind === "inverse" ? "inverse transform" : "rejection sampling"}: ${s.unavailable}`);
        if (cache.size > 512) cache.clear();
        cache.set(key, s);
      }
      return s;
    };
  }

  /**
   * The statistics of one block of replicates, b * BLOCK to (b + 1) * BLOCK - 1, for each method (the chosen one and
   * the comparison), alternative and quantity: Welford sums, hit counts, co-moments for ratios and control variates,
   * the strata of a stratified run, paired differences between alternatives, the focus variable's histogram,
   * rejection counts and the block's interval coverage.
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

  /** An empty accumulator of one design: bivariate Welford sums, hits, and the strata or the single values it needs. @param {string} design @param {number} K */
  function newAcc(design, K) {
    /** @type {any} */
    const s = { n: 0, mean: 0, m2: 0, mb: 0, cbb: 0, cab: 0, hits: 0 };
    if (design === "stratified") s.st = Array.from({ length: K }, () => ({ n: 0, mean: 0, m2: 0, mb: 0, cbb: 0, cab: 0, hits: 0 }));
    if (design === "antithetic") s.ind = { n: 0, mean: 0, m2: 0, mb: 0, cbb: 0, cab: 0, hits: 0 };
    return s;
  }

  /** Add one pair (x, y) to a bivariate Welford accumulator. @param {any} s @param {number} x @param {number} y */
  function add(s, x, y) {
    const n = s.n + 1, dx = x - s.mean, dy = y - s.mb;
    s.mean += dx / n;
    s.mb += dy / n;
    s.m2 += dx * (x - s.mean);
    s.cbb += dy * (y - s.mb);
    s.cab += dx * (y - s.mb);
    s.n = n;
  }

  /**
   * One replicate of the model in an environment: definitions in order and each variable from its sampler, with the
   * draws of replicate `iStream`. `flip` gives the antithetic draws; `strat` holds the stratum of the stratified
   * variable's first uniform.
   * @param {any} c @param {Value[]} env @param {any} rng @param {number} iStream @param {boolean} flip @param {any} get @param {any} stats @param {any} strat
   */
  function simulate(c, env, rng, iStream, flip, get, stats, strat) {
    for (const node of c.nodes) {
      if (node.type === "def") { env[node.slot] = node.fn(env); continue; }
      const p = argsAt(node, env);
      if (p.error) throw new E.ExprError(`Variable ${node.name}: ${p.error}`);
      const s = get(node.law, p.params);
      if (node.repeat === 1) {
        rng.reset(iStream, node.index * 65536, flip);
        if (strat && strat.index === node.index) {
          strat.base = rng;
          strat.first = true;
          env[node.slot] = s.draw(strat, stats);
        } else env[node.slot] = s.draw(rng, stats);
      } else {
        const xs = new Array(node.repeat);
        for (let j = 0; j < node.repeat; j++) {
          rng.reset(iStream, node.index * 65536 + j, flip);
          xs[j] = s.draw(rng, stats);
        }
        env[node.slot] = xs;
      }
    }
  }

  /**
   * A stratified uniform source: the first uniform of a draw is (k + U)/K, in stratum k of K equal parts of (0, 1);
   * every other number comes from the stream unchanged.
   * @param {number} index @param {number} K
   */
  function stratifier(index, K) {
    const st = {
      index, K, k: 0, first: true, base: /** @type {any} */ (null),
      uniform() {
        const u = st.base.uniform();
        if (!st.first) return u;
        st.first = false;
        return Math.min((st.k + u) / st.K, ONE_MINUS);
      },
      u32() { return st.base.u32(); },
      /** @param {number} m */
      below(m) { return st.base.below(m); },
      normal() { return st.base.normal(); },
    };
    return st;
  }

  /** @param {any} c @param {number} b @param {string} method @param {any} opts */
  function runMethod(c, b, method, opts) {
    const cfg = METHODS[method], design = cfg.design;
    const get = samplers(cfg.sampler, c.settings.failure);
    const A = c.alternatives.length, Q = c.quantities.length;
    const common = R.stream(c.settings.seed, STREAM, 0, 0);
    // Common random numbers: every alternative reads the same streams. Separate streams: alternative a > 1 has its own stream name.
    const rngs = c.alternatives.map((/** @type {any} */ _, /** @type {number} */ a) => (a === 0 || c.settings.streams === "common" ? common : R.stream(c.settings.seed, `${STREAM}/${a}`, 0, 0)));
    const stats = { proposals: 0, accepts: 0, violations: 0 };
    const K = design === "stratified" ? c.stratify.K : 1;
    const strat = design === "stratified" ? stratifier(c.stratify.index, K) : null;
    const ctl = design === "control" ? c.control : null;
    // Per alternative and quantity: bivariate sums of (value, denominator) for a ratio, (value, control) for a
    // control variate, or (value, 0); the pair means of an antithetic run; the strata of a stratified run.
    const acc = c.alternatives.map(() => c.quantities.map(() => newAcc(design, K)));
    const pairs = [];
    for (let a = 0; a < A; a++) for (let a2 = a + 1; a2 < A; a2++) pairs.push([a, a2]);
    const diffs = pairs.map(() => c.quantities.map(() => newAcc(design, K)));
    const win = opts.window;
    // The focus variable's frequencies, for each alternative: bins of the window, values below and above it, and
    // the counts above each threshold, so the survival plot reaches past the window.
    const hists = c.alternatives.map(() => ({ bins: win ? new Array(win.bins).fill(0) : [], under: 0, over: 0, exceed: win ? new Array(win.thresholds.length).fill(0) : [], values: 0, max: -Infinity }));
    const [focusName, focusIdx] = splitFocus(c.focus);
    const vals = new Float64Array(A * Q), dens = new Float64Array(A * Q), ctls = new Float64Array(A);
    // The first member of an antithetic pair, kept until its partner: values and denominators or controls.
    const held = new Float64Array(A * Q), heldY = new Float64Array(A * Q);
    const heldD = pairs.map(() => new Float64Array(2 * Q));
    const envs = c.alternatives.map((/** @type {any} */ alt) => alt.values.slice());
    const start = b * BLOCK;
    try {
      for (let r = 0; r < BLOCK; r++) {
        const i = start + r, second = design === "antithetic" && (r & 1) === 1, stratum = r % K;
        // An antithetic pair shares the streams of its first member; the second member complements every number.
        const base = design === "antithetic" ? i - (i & 1) : i;
        const iStream = c.settings.failure === "stream_reuse" ? base % REUSE : base;
        if (strat) strat.k = stratum;
        for (let a = 0; a < A; a++) {
          const env = envs[a];
          simulate(c, env, rngs[a], iStream, second, get, stats, strat);
          if (ctl) ctls[a] = scalar(ctl.fn(env), ctl.name);
          for (let q = 0; q < Q; q++) {
            const qu = c.quantities[q], k = a * Q + q;
            let x, y = 0;
            if (qu.kind === "ratio") {
              x = scalar(qu.num(env), qu.name);
              y = scalar(qu.den(env), qu.name);
            } else {
              x = scalar(qu.fn(env), qu.name);
              if (qu.kind === "probability") x = +(x !== 0);
              if (ctl) y = ctls[a];
            }
            vals[k] = x;
            dens[k] = y;
            const s = acc[a][q];
            if (qu.kind !== "ratio" && x !== 0) s.hits++;
            if (design === "stratified") { add(s.st[stratum], x, y); add(s, x, y); }
            else if (design === "antithetic") {
              add(s.ind, x, y);
              if (second) add(s, (held[k] + x) / 2, (heldY[k] + y) / 2);
              else { held[k] = x; heldY[k] = y; }
            } else add(s, x, y);
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
            const d = vals[a2 * Q + q] - vals[a * Q + q], dy = ctl ? ctls[a2] - ctls[a] : 0, s = diffs[p][q];
            if (design === "stratified") { add(s.st[stratum], d, dy); add(s, d, dy); }
            else if (design === "antithetic") {
              add(s.ind, d, dy);
              if (second) add(s, (heldD[p][2 * q] + d) / 2, (heldD[p][2 * q + 1] + dy) / 2);
              else { heldD[p][2 * q] = d; heldD[p][2 * q + 1] = dy; }
            } else add(s, d, dy);
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
      const iv = interval(c.quantities[q].kind, s, "unknown", design, controlMean(c, design, a, q));
      // The tolerance absorbs the rounding error of an enumerated reference; an interval of width 0 needs it.
      const tol = 1e-9 * Math.max(1, Math.abs(ref));
      return iv.lo === null || iv.hi === null ? null : +(ref >= iv.lo - tol && ref <= iv.hi + tol);
    }));
    for (const h of hists) if (!Number.isFinite(h.max)) h.max = /** @type {any} */ (null);
    return { error: "", acc, diffs, pairs, hists, rejection: stats, cover };
  }

  /** The control mean the estimator of quantity q in alternative a uses, or null when it uses none. @param {any} c @param {string} design @param {number} a @param {number} q */
  function controlMean(c, design, a, q) {
    return design === "control" && c.control && c.quantities[q].kind !== "ratio" ? c.control.used[a] : null;
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

  /** A copy of an accumulator with its own strata and single values. @param {any} s */
  const clone = (s) => ({ ...s, ...(s.st ? { st: s.st.map((/** @type {any} */ t) => ({ ...t })) } : {}), ...(s.ind ? { ind: { ...s.ind } } : {}) });

  /** Chan, Golub and LeVeque's update: two Welford summaries as one, stratum by stratum. @param {any} x @param {any} y @returns {any} */
  function combine(x, y) {
    const n = x.n + y.n;
    if (!x.n) return clone(y);
    if (!y.n) return clone(x);
    const d = y.mean - x.mean, db = (y.mb ?? 0) - (x.mb ?? 0), w = (x.n * y.n) / n;
    return {
      n, mean: x.mean + (d * y.n) / n, m2: x.m2 + y.m2 + d * d * w, mb: (x.mb ?? 0) + (db * y.n) / n,
      cbb: (x.cbb ?? 0) + (y.cbb ?? 0) + db * db * w, cab: (x.cab ?? 0) + (y.cab ?? 0) + d * db * w, hits: (x.hits ?? 0) + (y.hits ?? 0),
      ...(x.st ? { st: x.st.map((/** @type {any} */ t, /** @type {number} */ k) => combine(t, y.st[k])) } : {}),
      ...(x.ind ? { ind: combine(x.ind, y.ind) } : {}),
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
      if (!prev) return { method: m.method, acc: m.acc.map((/** @type {any[]} */ row) => row.map(clone)), diffs: m.diffs.map((/** @type {any[]} */ row) => row.map(clone)), pairs: m.pairs, hists: m.hists.map((/** @type {any} */ h) => ({ ...h, bins: h.bins.slice(), exceed: h.exceed.slice() })), rejection: { ...m.rejection }, ms: m.ms, cover: m.cover.map((/** @type {any[]} */ row) => row.map((x) => (x === null ? null : { hit: x, of: 1 }))) };
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
    if (blocks <= 16 || n >= last * 1.015) trace.push({ n, est: methods.map((/** @type {any} */ m) => m.acc.map((/** @type {any[]} */ row, /** @type {number} */ a) => row.map((/** @type {any} */ s, /** @type {number} */ q) => point(c.quantities[q].kind, s, METHODS[m.method].design, controlMean(c, METHODS[m.method].design, a, q))))) });
    return { blocks, n, methods, trace, error: "" };
  }

  /** The estimate and its 95 % interval, for the trace. @param {string} kind @param {any} s @param {string} design @param {number | null} mu */
  function point(kind, s, design, mu) {
    const iv = interval(kind, s, "unknown", design, mu);
    return [iv.est, iv.lo, iv.hi];
  }

  /**
   * The estimate and a 95 % interval that fits the estimator and its design. Plain: Wilson (and Clopper-Pearson) for
   * a probability, with the exact zero-hit bound; the CLT interval for an expectation, and none when the variance is
   * infinite; the delta-method interval for a ratio of means. Stratified: the mean of the stratum means, with the
   * variance Σ s_k²/(K² n_k). Antithetic: the CLT interval of the pair means. Control variate: the regression
   * estimator Ȳ − β̂(C̄ − μ_C), with the residual variance. A run with no hit keeps the exact zero-hit bound.
   * @param {string} kind @param {any} s @param {string} variance "finite", "infinite" or "unknown"
   * @param {string} [design] @param {number | null} [mu] the control mean of a control-variate estimate
   */
  function interval(kind, s, variance, design = "plain", mu = null) {
    const n = s.n;
    if (!n) return { est: null, lo: null, hi: null, se: null, how: "no replicates" };
    if (design === "plain" || (design === "control" && (kind === "ratio" || mu === null))) return plainInterval(kind, s, variance);
    // A probability with no hit, or with a hit in every replicate, keeps the exact bound: it holds for each design,
    // because each design draws every replicate from the model law and P(no hit) ≤ (1 − p)^n.
    const evals = design === "antithetic" ? 2 * n : n;
    if (kind === "probability" && (s.hits === 0 || s.hits === evals)) {
      const m = design === "antithetic" ? n : evals, b = S.zeroHitBound(m, 0.05), all = s.hits !== 0;
      return { est: all ? 1 : 0, lo: all ? 1 - b : 0, hi: all ? 1 : b, se: 0, how: `${all ? "all hits" : "zero hits"}: exact one-sided 95 % bound ${design === "antithetic" ? `from ${m} independent pairs` : "1 − 0.05^(1/n)"}` };
    }
    if (design === "antithetic") {
      if (kind === "ratio") return plainInterval("ratio", s, variance, "delta-method interval for a ratio of the antithetic pair means, 95 %");
      if (n < 2) return { est: s.mean, lo: null, hi: null, se: null, how: "one antithetic pair" };
      if (variance === "infinite") return { est: s.mean, lo: null, hi: null, se: null, how: "no interval: the variance is infinite, so the central limit theorem does not apply" };
      const se = Math.sqrt(s.m2 / (n - 1) / n);
      return { est: s.mean, lo: s.mean - Z95 * se, hi: s.mean + Z95 * se, se, how: `CLT interval of ${n} antithetic pair means, 95 %, asymptotic` };
    }
    if (design === "stratified") {
      const K = s.st.length, w = 1 / K;
      if (s.st.some((/** @type {any} */ t) => t.n < 2)) return { est: s.mean, lo: null, hi: null, se: null, how: "no interval: a stratum holds fewer than 2 replicates" };
      if (kind === "ratio") {
        let A = 0, B = 0;
        for (const t of s.st) { A += w * t.mean; B += w * t.mb; }
        if (B === 0) return { est: null, lo: null, hi: null, se: null, how: "the denominator mean is 0" };
        const r = A / B;
        let v = 0;
        for (const t of s.st) v += (w * w * Math.max(0, t.m2 - 2 * r * t.cab + r * r * t.cbb)) / (t.n - 1) / t.n;
        const se = Math.sqrt(v) / Math.abs(B);
        return { est: r, lo: r - Z95 * se, hi: r + Z95 * se, se, how: `delta-method interval for a ratio, ${K} strata, 95 %` };
      }
      let est = 0, v = 0;
      for (const t of s.st) { est += w * t.mean; v += (w * w * t.m2) / (t.n - 1) / t.n; }
      if (variance === "infinite") return { est, lo: null, hi: null, se: null, how: "no interval: the variance is infinite, so the central limit theorem does not apply" };
      const se = Math.sqrt(v);
      return { est, lo: est - Z95 * se, hi: est + Z95 * se, se, how: `stratified CLT interval, ${K} equal strata, 95 %, asymptotic` };
    }
    // Control variate: the regression of the quantity on the control, evaluated at the control mean.
    if (n < 3) return { est: s.mean, lo: null, hi: null, se: null, how: "fewer than 3 replicates" };
    const beta = s.cbb > 0 ? s.cab / s.cbb : 0, est = s.mean - beta * (s.mb - /** @type {number} */ (mu));
    if (variance === "infinite") return { est, lo: null, hi: null, se: null, how: "no interval: the variance is infinite, so the central limit theorem does not apply" };
    const resid = Math.max(0, s.m2 - (s.cbb > 0 ? (s.cab * s.cab) / s.cbb : 0)) / (n - 2);
    const se = Math.sqrt(resid * (1 / n + (s.cbb > 0 ? (s.mb - /** @type {number} */ (mu)) ** 2 / s.cbb : 0)));
    return { est, lo: est - Z95 * se, hi: est + Z95 * se, se, how: `control-variate interval, β̂ = ${+beta.toPrecision(4)}, 95 %, asymptotic` };
  }

  /** The interval of plain independent replicates. @param {string} kind @param {any} s @param {string} variance @param {string} [ratioHow] */
  function plainInterval(kind, s, variance, ratioHow = "delta-method interval for a ratio of means, 95 %") {
    const n = s.n;
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
      return { est: r, lo: r - Z95 * se, hi: r + Z95 * se, se, how: ratioHow };
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
   * when it is that variable, or an affine function of it; other cases are "unknown", never guessed. The classes:
   * "finite" (finitely many values), "bounded" (a continuous law on a bounded interval), "light" (every moment
   * exists), "heavy" (moments exist only below an order) and "unknown".
   * @param {any} c a compiled model
   */
  function momentStatus(c) {
    /** @type {Map<string, { cls: "finite" | "bounded" | "light" | "heavy" | "unknown", order: number }>} */
    const tails = new Map();
    for (const n of c.nodes) {
      if (n.type === "def") continue;
      const parents = [...n.reads].filter((r) => c.kinds.get(r) !== "param");
      let cls = /** @type {"finite" | "bounded" | "light" | "heavy" | "unknown"} */ ("unknown"), order = Infinity;
      const finiteLaw = ["bernoulli", "categorical", "uniform", "hypergeometric", "multinomial", "binomial"].includes(n.law.id);
      const bounded = (/** @type {{ lo: number, hi: number }} */ s) => s.hi < Infinity && s.lo > -Infinity;
      if (!parents.length) {
        const p = argsAt(n, c.alternatives[0].values).params, s = n.law.support(p), mo = n.law.moments(p);
        order = mo.order;
        cls = bounded(s) ? (n.law.continuous ? "bounded" : "finite") : order === Infinity ? "light" : "heavy";
        for (const alt of c.alternatives.slice(1)) {
          const q = argsAt(n, alt.values).params, o2 = n.law.moments(q).order;
          if (o2 < order) { order = o2; cls = "heavy"; }
          if (!bounded(n.law.support(q)) && (cls === "finite" || cls === "bounded")) cls = o2 === Infinity ? "light" : "heavy";
        }
      } else if (n.law.continuous) {
        // A continuous law with random parameters: a law on [0, 1] stays bounded; a location or a scale (or the
        // shape of a gamma law) from light parents keeps every moment; a finite mixture of light laws stays light.
        const ups = parents.map((r) => tailOf(r, c, tails)), light = ups.every((u) => u === "finite" || u === "bounded" || u === "light");
        if (n.law.id === "beta" || n.law.id === "dirichlet") cls = "bounded";
        else if (light && n.random.every((/** @type {string} */ a) => (SAFE[n.law.id] ?? []).includes(a))) cls = n.law.id === "cuniform" && !ups.includes("light") ? "bounded" : "light";
        else if (ups.every((u) => u === "finite") && n.law.id !== "student" && n.law.id !== "fisher") cls = "light";
      } else {
        const ups = parents.map((r) => tailOf(r, c, tails));
        if (ups.every((u) => u === "finite")) cls = finiteLaw && n.law.id !== "binomial" && n.law.id !== "multinomial" ? "finite" : n.law.id === "zipf" ? "unknown" : finiteLaw ? "finite" : "light";
        else if (finiteLaw && !["binomial", "multinomial"].includes(n.law.id)) cls = "finite";
        else if (ups.every((u) => u === "finite" || u === "bounded" || u === "light") && n.random.every((/** @type {string} */ a) => (SAFE[n.law.id] ?? []).includes(a))) cls = "light";
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
      if (classes.every((t) => t.cls === "finite" || t.cls === "bounded" || t.cls === "light") && growth) return { mean: "finite", variance: "finite", reason: "Every variable it reads has finite moments of all orders, and the expression grows at most as a polynomial." };
      // An affine function of independent variables (or of the components of a vector law) has a mean exactly when
      // each of its terms has one, and a variance exactly when each term has one.
      if (q.kind === "expectation") {
        const lin = c.alternatives.map((/** @type {any} */ alt) => controlMoments(q.trees[0], c, alt.values));
        if (lin.every((/** @type {any} */ m) => m.mean !== null)) return { mean: "finite", variance: lin.every((/** @type {any} */ m) => m.sd !== null) ? "finite" : "infinite", reason: "The quantity is an affine function of variables with known moments, so linearity gives its mean, and its variance exists exactly when each term has a variance." };
        if (lin.some((/** @type {any} */ m) => m.infinite)) return { mean: "infinite", variance: "infinite", reason: "The quantity is an affine function of variables, and one of them has an infinite mean." };
      }
      return { mean: "unknown", variance: "unknown", reason: "The page cannot show that the moments exist. A variable it reads has a heavy or unknown tail, or the expression grows faster than a polynomial." };
    });
  }

  /**
   * The arguments of each continuous law that may read a random variable with every moment and keep every moment of
   * the law: a location, a scale (X = scale · Y), and the shape of the gamma family (E X^r is a polynomial in k).
   * A rate is not one: the scale 1/rate has no moments when the rate can come near 0. Two discrete laws have such
   * arguments too: a Poisson count with a light mean (a gamma–Poisson mixture, for example) and a binomial count
   * with a light number of trials, which it cannot exceed.
   */
  const SAFE = /** @type {Record<string, string[]>} */ ({ cuniform: ["a", "b"], normal: ["mu", "sigma"], mvnormal: ["mu"], logistic: ["mu", "s"], laplace: ["mu", "b"], gamma: ["k", "theta"], erlang: ["k"], chisq: ["nu"], poisson: ["lambda"], binomial: ["n", "p"] });

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

  /**
   * Values of the focus variable from a pilot sample of n replicates of each alternative, with the reference samplers
   * and a fixed pilot stream, for the histogram window of a focus with no reference law.
   * @param {any} c @param {number} n @returns {number[]}
   */
  function sampleFocus(c, n) {
    const get = samplers("reference", "none"), rng = R.stream(1, "pilot", 0, 0), stats = { proposals: 0, accepts: 0, violations: 0 };
    const [name, idx] = splitFocus(c.focus), out = [];
    for (const alt of c.alternatives) {
      const env = alt.values.slice();
      for (let i = 0; i < n; i++) {
        simulate(c, env, rng, i, false, get, stats, null);
        const v = env[c.slots.get(name)], x = typeof v === "number" ? v : v[(idx || 1) - 1];
        if (Number.isFinite(x)) out.push(x);
      }
    }
    return out;
  }

  /* ---------- reference values: closed forms, enumeration and quadrature ---------- */

  /**
   * Reference values for each alternative and quantity. A discrete model: enumeration of the joint support, with the
   * focus variable's marginal law; infinite supports stop where the remaining mass is below 1e-13, and the result
   * states that neglected mass. A model with a continuous variable: the closed form where one exists, else adaptive
   * quadrature over the quantile functions (quadrature()). A model with a repeated variable, or more than 400,000
   * states, has no enumeration.
   * @param {any} c a compiled model @param {any[]} status the moment status of each quantity
   */
  function reference(c, status) {
    if (c.nodes.some((/** @type {any} */ n) => n.type === "var" && n.law.continuous)) {
      return c.alternatives.map((/** @type {any} */ alt, /** @type {number} */ a) => {
        // Linearity gives the mean of an affine function of independent variables with known means.
        const closed = closedForm(c, a, status, true).map((v, k) => {
          const q = c.quantities[k];
          return v !== null || q.kind !== "expectation" || status[k].mean !== "finite" ? v : controlMoments(q.trees[0], c, alt.values).mean;
        });
        const r = closed.every((v) => v !== null) ? { values: closed, reason: "", neglected: 0, marginal: null, method: "closed" } : quadrature(c, status, a, closed);
        return { ...r, values: r.values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (closed[k] !== null ? closed[k] : v)), closed: closed.map((v) => v !== null) };
      });
    }
    return enumerate(c, status).map((/** @type {any} */ r, /** @type {number} */ a) => {
      const closed = closedForm(c, a, status);
      return { ...r, method: "enumeration", values: r.values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (v !== null ? v : closed[k])), closed: closed.map((v) => v !== null) };
    });
  }

  class QuadratureStop extends Error {}

  /**
   * Reference values of alternative a by iterated integration over the model's nodes in order: a sum over the
   * support of each discrete variable (cut where the remaining mass is below 1e-13), and adaptive Gauss–Kronrod
   * quadrature over (0, 1/2) of the quantile function and of the inverse survival function of each continuous
   * variable, so a parameter that reads an earlier variable gives the conditional law. The integrand is the vector
   * of every quantity (numerator and denominator) and the neglected mass. At most 2 continuous variables and 200,000
   * evaluations of the model; a vector law or a repeated variable has no quadrature. A quantity with a closed form
   * stays out of the integrand.
   * @param {any} c @param {any[]} status @param {number} a @param {(number | null)[]} closed
   */
  function quadrature(c, status, a, closed) {
    const Q = c.quantities.length, D = 2 * Q + 1, none = c.quantities.map(() => null);
    const vars = c.nodes.filter((/** @type {any} */ n) => n.type === "var");
    const rep = vars.find((/** @type {any} */ n) => n.repeat > 1), vec = vars.find((/** @type {any} */ n) => n.law.dim), cont = vars.filter((/** @type {any} */ n) => n.law.continuous);
    const why = rep ? `Variable ${rep.name} repeats ${rep.repeat} times, so the page does not integrate over its copies.`
      : vec ? `Variable ${vec.name} has a vector law, so the page does not integrate over it.`
        : cont.length > QUAD.continuous ? `The model has ${cont.length} continuous variables, and the quadrature takes at most ${QUAD.continuous}.` : "";
    if (why) return { values: none, reason: why, neglected: 0, marginal: null, method: "quadrature" };
    const env = c.alternatives[a].values.slice();
    // A component whose quadrature missed its tolerance at any level has no reference value. An expectation with no
    // finite mean gets none either, so it stays 0 in the integrand and does not drive the adaptive splitting.
    const missed = new Uint8Array(D), skip = c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => closed[k] !== null || (q.kind !== "probability" && status[k].mean !== "finite"));
    // The variables that the integrated quantities read, directly or through definitions and parameters of other
    // variables. A variable that no such quantity reads needs no sum and no integral.
    /** @type {Set<string>} */
    const needed = new Set();
    /** @param {string} name */
    const need = (name) => {
      if (needed.has(name)) return;
      needed.add(name);
      const n = c.nodes.find((/** @type {any} */ x) => x.name === name);
      if (n) for (const r of n.reads) need(r);
    };
    c.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => { if (!skip[k]) for (const r of q.reads) need(r); });
    // One continuous variable allows a tight tolerance; two need a looser one, because the inner integral repeats at each outer node.
    const nested = vars.filter((/** @type {any} */ n) => n.law.continuous && needed.has(n.name)).length > 1;
    let leaves = 0;
    const solved0 = S.work();
    /** @param {number} i @param {number} depth @returns {Float64Array} */
    const walk = (i, depth) => {
      if (i === c.nodes.length) {
        if (++leaves + QUAD.quantile * (S.work() - solved0) > QUAD.work) throw new QuadratureStop("The quadrature needs more work than its budget for one alternative, so the page shows no reference value.");
        const out = new Float64Array(D);
        for (let q = 0; q < Q; q++) {
          const qu = c.quantities[q];
          if (skip[q]) continue;
          if (qu.kind === "ratio") { out[2 * q] = scalar(qu.num(env), qu.name); out[2 * q + 1] = scalar(qu.den(env), qu.name); }
          else { const x = scalar(qu.fn(env), qu.name); out[2 * q] = qu.kind === "probability" ? +(x !== 0) : x; }
        }
        return out;
      }
      const node = c.nodes[i];
      if (node.type === "def") { env[node.slot] = node.fn(env); return walk(i + 1, depth); }
      const pr = argsAt(node, env);
      if (pr.error) throw new E.ExprError(pr.error);
      const errs = node.law.check(pr.params);
      if (errs.length) throw new E.ExprError(`Variable ${node.name}: ${errs[0]}`);
      const law = node.law, p = pr.params, out = new Float64Array(D);
      if (!needed.has(node.name)) { env[node.slot] = law.continuous ? law.quantile(0.5, p) : law.support(p).lo; return walk(i + 1, depth); }
      if (law.continuous) {
        // Break points at u = 2^-30, 2^-26, …, 2^-2 resolve the tail; a jump below 2^-30 moves a probability by less than 1e-9.
        const o = !nested ? { rel: 1e-10, abs: 1e-12, maxPanels: 300, breaks: TAIL_BREAKS, openLo: true }
          : depth === 0 ? { rel: 1e-6, abs: 1e-8, maxPanels: 200, breaks: TAIL_BREAKS, openLo: true } : { rel: 1e-7, abs: 1e-9, maxPanels: 80, breaks: TAIL_BREAKS, openLo: true };
        /** @param {(u: number, p: any) => number} g */
        const f = (g) => (/** @type {number} */ u) => { env[node.slot] = g(Math.max(u, 1e-300), p); return walk(i + 1, depth + 1); };
        for (const g of [law.quantile, law.isf]) {
          const r = S.integrate(f(g), 0, 0.5, D, o);
          for (let j = 0; j < D; j++) {
            out[j] += r.value[j];
            if (r.error[j] > Math.max(o.rel * Math.abs(r.value[j]), o.abs)) missed[j] = 1;
          }
        }
        return out;
      }
      const s = law.support(p);
      let mass = 0;
      for (let k = s.lo; k <= s.hi; k++) {
        const pk = law.pmf(k, p);
        mass += pk;
        if (pk > 0) {
          env[node.slot] = k;
          const sub = walk(i + 1, depth);
          for (let j = 0; j < D; j++) out[j] += pk * sub[j];
        }
        if (s.hi === Infinity && 1 - mass < 1e-13 && law.sf(k, p) < 1e-13) { out[D - 1] += law.sf(k, p); break; }
        if (k - s.lo > 200000) throw new QuadratureStop(`Variable ${node.name} has more than 200,000 support points with mass.`);
      }
      return out;
    };
    let v;
    try {
      v = walk(0, 0);
    } catch (e) {
      return { values: none, reason: e instanceof Error ? e.message : String(e), neglected: 0, marginal: null, method: "quadrature" };
    }
    const values = c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
      if (missed[2 * k] || (q.kind === "ratio" && missed[2 * k + 1])) return null;
      if (q.kind === "probability") return Math.min(1, Math.max(0, v[2 * k]));
      // A finite quadrature sum does not show that a mean exists, so an expectation needs the moment status.
      if (status[k].mean !== "finite") return null;
      if (q.kind === "ratio") return v[2 * k + 1] === 0 ? null : v[2 * k] / v[2 * k + 1];
      return v[2 * k];
    });
    return { values, reason: values.some((/** @type {number | null} */ x, /** @type {number} */ k) => x === null && missed[2 * k]) ? "The adaptive quadrature did not reach its tolerance for some quantities." : "", neglected: v[D - 1], marginal: null, method: "quadrature" };
  }

  /**
   * Exact values for a model with one scalar variable X of constant parameters and no definitions: P(X op v) from
   * the CDF, the survival function or the PMF, and E[X] from the law's moments. These need no enumeration, so they
   * also cover a heavy tail such as the zeta law.
   * @param {any} c @param {number} a @param {any[]} status @returns {(number | null)[]}
   */
  function closedForm(c, a, status, anyModel = false) {
    const none = c.quantities.map(() => null);
    const scalar = (/** @type {any} */ n) => n?.type === "var" && n.constant && n.repeat === 1 && !n.law.dim;
    // The discrete path keeps group 1's rule: one variable and nothing else. With a continuous variable, a variable
    // with constant parameters has its own law as its marginal law, whatever else the model holds.
    if (!anyModel && (c.nodes.length !== 1 || !scalar(c.nodes[0]))) return none;
    const env = c.alternatives[a].values.slice();
    for (const n of c.nodes) if (n.type === "def" && fixed(n.tree, c)) env[n.slot] = n.fn(env);
    const FLIP = /** @type {Record<string, string>} */ ({ "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "!=": "!=" });
    /** The node and its parameters when t names a scalar variable with constant parameters. @param {any} t */
    const lawOf = (t) => {
      const node = t.t === "id" ? c.nodes.find((/** @type {any} */ n) => n.name === t.name) : null;
      if (!scalar(node)) return null;
      const pr = argsAt(node, env);
      return pr.error || node.law.check(pr.params).length ? null : { law: node.law, p: pr.params };
    };
    return c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
      const t = q.trees[0];
      if (q.kind === "expectation" && t.t === "id") { const m = lawOf(t); return m && status[k].mean === "finite" ? m.law.moments(m.p).mean : null; }
      if (q.kind !== "probability" || t.t !== "bin" || !(t.op in FLIP)) return null;
      let op = t.op, side = t.b, m = lawOf(t.a);
      if (m && fixed(t.b, c)) side = t.b;
      else if ((m = lawOf(t.b)) && fixed(t.a, c)) { side = t.a; op = FLIP[op]; }
      else return null;
      const { law, p } = m;
      const v = E.compile(side, c.slots)(env);
      if (typeof v !== "number" || Number.isNaN(v)) return null;
      // A continuous law gives every single point probability 0, so P(X < v) = P(X ≤ v) = F(v).
      if (law.continuous) return op === "<" || op === "<=" ? law.cdf(v, p) : op === ">" || op === ">=" ? law.sf(v, p) : op === "==" ? 0 : 1;
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
   * Estimates, intervals, paired differences, coverage and the decision for merged statistics. Each estimate of a
   * variance-reduction design also carries its gain: the estimated variance of plain independent sampling with the
   * same number of model evaluations, divided by the variance of the design's estimate. Each paired difference
   * carries the gain of the streams: (se_a² + se_b²)/se_d², about 1 with separate streams, above 1 when common
   * random numbers help, and below 1 when they hurt.
   * @param {any} c @param {any} accum @param {any[]} status @param {any[]} refs
   */
  function summary(c, accum, status, refs) {
    return accum.methods.map((/** @type {any} */ m) => {
      const design = METHODS[m.method].design;
      const alts = c.alternatives.map((/** @type {any} */ alt, /** @type {number} */ a) => ({
        label: alt.label,
        quantities: c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
          const s = m.acc[a][k], mu = controlMean(c, design, a, k), iv = interval(q.kind, s, status[k].variance, design, mu);
          // An infinite mean is the stronger reason: the sample mean then has no finite limit at all.
          if (status[k].mean === "infinite" && iv.lo === null) iv.how = "no interval: the mean is infinite, so the sample mean has no finite limit";
          const one = design === "antithetic" ? s.ind : s, sd = one.n > 1 ? Math.sqrt(one.m2 / (one.n - 1)) : null;
          const cov = m.cover[a]?.[k];
          return { name: q.name, kind: q.kind, n: one.n, hits: q.kind === "probability" ? s.hits : null, ...iv, sampleSd: q.kind === "probability" ? null : sd,
            reference: refs[a]?.values?.[k] ?? null, coverage: cov ? { hit: cov.hit, of: cov.of } : null,
            clopperPearson: q.kind === "probability" && s.n && design === "plain" ? S.clopperPearson(s.hits, s.n, 0.05) : null,
            gain: gainOf(q.kind, s, design, mu, iv) };
        }),
      }));
      const diffs = m.pairs.map((/** @type {number[]} */ pair, /** @type {number} */ p) => ({
        a: pair[0], b: pair[1],
        quantities: c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
          if (q.kind === "ratio") return { name: q.name, est: null, lo: null, hi: null, how: "no paired interval for a ratio", crn: null };
          const s = m.diffs[p][k], ma = controlMean(c, design, pair[0], k), mb = controlMean(c, design, pair[1], k);
          const iv = interval("expectation", s, status[k].variance === "infinite" ? "infinite" : "unknown", design, ma === null || mb === null ? null : mb - ma);
          const sa = alts[pair[0]].quantities[k].se, sb = alts[pair[1]].quantities[k].se;
          const crn = iv.se && sa !== null && sb !== null && (sa > 0 || sb > 0) ? (sa * sa + sb * sb) / (iv.se * iv.se) : null;
          return { name: q.name, est: iv.est, lo: iv.lo, hi: iv.hi, se: iv.se, crn, how: `paired difference ${c.alternatives[pair[1]].label} − ${c.alternatives[pair[0]].label}, ${c.settings.streams === "common" ? "common random numbers" : "separate streams"}` };
        }),
      }));
      return { method: m.method, design, alts, diffs, decision: decide(c, alts, diffs), rejection: m.rejection, ms: m.ms, hists: m.hists,
        strata: design === "stratified" ? { variable: c.stratify.name, K: c.stratify.K } : null, control: design === "control" ? { name: c.control.name, means: c.control.used } : null };
    });
  }

  /**
   * The gain of a variance-reduction design for one estimate: the variance of plain sampling with the same number of
   * evaluations, from the run's own values, over the variance of the design's estimate; with the within-pair
   * correlation of antithetic pairs, and β̂ and the correlation of the quantity with the control.
   * @param {string} kind @param {any} s @param {string} design @param {number | null} mu @param {any} iv
   */
  function gainOf(kind, s, design, mu, iv) {
    if (design === "plain" || kind === "ratio" || !iv.se || (design === "control" && mu === null)) return null;
    if (design === "antithetic") {
      // ρ from the plug-in variances of the single values and of the pair means: Var(pair mean) = σ²(1 + ρ)/2.
      const one = s.ind, sigma2 = one.n > 1 ? one.m2 / (one.n - 1) : 0, rho = one.m2 > 0 ? Math.max(-1, Math.min(1, (2 * s.m2 * one.n) / (s.n * one.m2) - 1)) : null;
      return { ratio: sigma2 / one.n / (iv.se * iv.se), rho };
    }
    const sigma2 = s.n > 1 ? s.m2 / (s.n - 1) : 0, ratio = sigma2 / s.n / (iv.se * iv.se);
    if (design === "control") return { ratio, rho: s.m2 > 0 && s.cbb > 0 ? s.cab / Math.sqrt(s.m2 * s.cbb) : null, beta: s.cbb > 0 ? s.cab / s.cbb : 0 };
    return { ratio };
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

  return { FORMAT, VERSION, BLOCK, STREAM, REUSE, LIMITS, TEXT_FIELDS, METHODS, MAX_STRATA, QUAD, complete, prepare, block, merge, empty, summary, interval, momentStatus, reference, splitFocus, argsAt, sampleFocus };
});
