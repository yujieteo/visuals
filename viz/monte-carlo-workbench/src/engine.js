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
/** @param {any} root the global object @param {(R: any, S: any, E: any, L: any, T: any, Cu: any, Co: any, Cop: any, Pr: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCRng ?? require("./rng.js"), root.MCSpecial ?? require("./special.js"), root.MCExpr ?? require("./expr.js"), root.MCLaws ?? require("./laws.js"), root.MCTails ?? require("./tails.js"),
    root.MCCustom ?? require("./custom.js"), root.MCConstructed ?? require("./constructed.js"), root.MCCopulas ?? require("./copulas.js"), root.MCProcesses ?? require("./processes.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCEngine = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./rng.js")} */ R, /** @type {typeof import("./special.js")} */ S,
  /** @type {typeof import("./expr.js")} */ E, /** @type {typeof import("./laws.js")} */ L, /** @type {typeof import("./tails.js")} */ T,
  /** @type {typeof import("./custom.js")} */ Cu, /** @type {typeof import("./constructed.js")} */ Co,
  /** @type {typeof import("./copulas.js")} */ Cop, /** @type {typeof import("./processes.js")} */ Pr) {
  "use strict";

  /** The dependence and process laws of group 5: the copulas and the path laws. @type {Record<string, any>} */
  const DEP = { ...Cop.BY_ID, ...Pr.BY_ID };
  /** The kinds of the group 5 laws: a copula or a path. */
  const DEP_KIND = new Set(["copula", "process"]);

  const FORMAT = "monte-carlo-workbench/model", VERSION = 1;
  const BLOCK = 1024, STREAM = "model", REUSE = 16;
  const LIMITS = { variables: 16, parameters: 24, quantities: 8, alternatives: 4, repeat: 2000, drawsPerReplicate: 5000, pathDraws: 20000, bins: 400, states: 400000 };
  const NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
  const RESERVED = new Set([...Object.keys(E.FUNCTIONS), ...Object.keys(E.CONSTANTS), "and", "or", "not", "P", "E"]);
  const Z95 = 1.959963984540054;
  const TEXT_FIELDS = ["initial", "dynamics", "observation", "censoring", "truncation", "selection"];
  /**
   * The censoring mechanism of the model text: "right T by C" observes T_obs = min(T, C) and T_event = 1{T ≤ C};
   * "left T by C" observes T_obs = max(T, C) and T_event = 1{T ≥ C}. C is an expression: a censoring variable, a
   * parameter or a number. Element by element when T or C is a vector.
   */
  const CENSOR = /^(right|left)\s+([A-Za-z]\w{0,19})\s+by\s+(.+)$/;
  /** Each method of the run: the sampler of every law and the design of the estimator. */
  const METHODS = /** @type {Record<string, { sampler: "reference" | "inverse" | "rejection" | "euler", design: "plain" | "stratified" | "antithetic" | "control" }>} */ ({
    independent: { sampler: "reference", design: "plain" }, inverse: { sampler: "inverse", design: "plain" }, rejection: { sampler: "rejection", design: "plain" }, euler: { sampler: "euler", design: "plain" },
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
   * @property {any[]} [laws] the custom law lines of group 4 (custom.js)
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
      decision: rec.decision ?? { objective: null, constraints: [] }, focus: rec.focus, control: rec.control, laws: rec.laws ?? [],
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
    const censor = CENSOR.exec(String(rec.censoring ?? "none").trim());
    // A model with a process variable states its initial conditions and dynamics in words; the law arguments hold them.
    const process = rec.variables.some((v) => DEP[v.law]?.kind === "process");
    for (const k of TEXT_FIELDS) if (k !== "observation" && !(k === "censoring" && censor) && !((k === "initial" || k === "dynamics") && process) && String(rec[/** @type {"initial"} */ (k)]).trim().toLowerCase() !== "none") errors.push(`The ${k} field holds "${String(rec[/** @type {"initial"} */ (k)]).slice(0, 40)}": this group of the workbench has no ${k} mechanism, so the field must be "none".`);
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
    // The custom laws of the model (group 4): each law line compiles to a law that the variables can name.
    const custom = Cu.compileAll(rec.laws ?? [], Co.taken);
    errors.push(...custom.errors);
    /** @type {any[]} */
    const nodes = [];
    let draws = 0;
    const defsByName = new Map((rec.definitions ?? []).map((d) => [d.name, d]));
    // Variables and definitions in record order: a definition may follow the variables it reads, and a variable's
    // arguments may read earlier variables and definitions. The record lists them in one order, "order".
    const order = /** @type {any[]} */ (input.order ?? [...rec.variables.map((v) => ({ type: "var", name: v.name })), ...rec.definitions.map((d) => ({ type: "def", name: d.name }))]);
    const varsByName = new Map(rec.variables.map((v) => [v.name, v]));
    /** @type {{ t: string, names: string[] } | null} */
    let censorReads = null, censored = false;
    if (censor) {
      try { censorReads = { t: censor[2], names: [...E.names(E.parse(censor[3]))] }; } catch (e) { errors.push(`Censoring "${censor[0].slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`); }
    }
    for (const item of order) {
      if (item.type === "var") {
        const v = varsByName.get(item.name);
        if (!v) { errors.push(`The order lists "${item.name}", which is not a variable.`); continue; }
        const visible = new Map(slots);
        const law = Co.resolve(v.law, custom.laws) ?? DEP[v.law] ?? null;
        if (!declare(v.name, "var", `Variable ${v.name}`)) continue;
        if (!law) { errors.push(`Variable ${v.name}: "${String(v.law).slice(0, 40)}" is not a law of this page: a law of the catalogue (${L.LAWS.map((l) => l.id).join(", ")}, empirical, kde), mixture_, truncated_ or compound_ before one of them, a copula or a process (${Object.keys(DEP).join(", ")}), or a law line of the model.`); continue; }
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
          // An argument with a default (a group 5 law) may be left out.
          const src = v.args?.[ps.name] ?? ps.default;
          if (src === undefined) { errors.push(`Variable ${v.name}: the ${law.name} law needs the argument ${ps.name} (${ps.text}).`); continue; }
          const b = expr(src, `Variable ${v.name}, argument ${ps.name}`, visible);
          if (!b) continue;
          args[ps.name] = b.fn;
          for (const r of b.reads) {
            reads.add(r);
            if (kinds.get(r) !== "param") { constant = false; if (!random.includes(ps.name)) random.push(ps.name); }
          }
        }
        // u = U[j] draws a scalar law by the inverse transform of a given uniform, such as a copula component (Sklar).
        let u = null;
        if (v.args && "u" in v.args) {
          if (DEP_KIND.has(law.kind) || law.dim) errors.push(`Variable ${v.name}: the ${law.name} law takes no argument u. Only a scalar law takes the uniform u of its inverse transform.`);
          else if ((u = expr(v.args.u, `Variable ${v.name}, argument u`, visible))) for (const r of u.reads) reads.add(r);
        }
        for (const extra of Object.keys(v.args ?? {})) if (extra !== "u" && !law.params.some((/** @type {any} */ ps) => ps.name === extra)) errors.push(`Variable ${v.name}: the ${law.name} law has no argument ${extra}.`);
        draws += repeat * (law.cost ? 1 : law.dim ? 8 : 1);
        // A custom law tabulates its input once for each parameter value, so its arguments read parameters only.
        if (law.constantArgs && !constant) errors.push(`Variable ${v.name}: the arguments of the custom law ${law.name} read only parameters, because the page tabulates the law once for each parameter value.`);
        nodes.push({ type: "var", name: v.name, slot: slots.get(v.name), law, args, repeat, constant, reads, random, index: nodes.length, unit: v.unit ?? "",
          ...(u ? { u: u.fn, uTree: u.tree, ureads: u.reads, uSrc: String(v.args?.u) } : {}) });
      } else if (item.type === "def") {
        const d = defsByName.get(item.name);
        if (!d) { errors.push(`The order lists "${item.name}", which is not a definition.`); continue; }
        const visible = new Map(slots);
        if (!declare(d.name, "def", `Definition ${d.name}`)) continue;
        const b = expr(d.expr, `Definition ${d.name}`, visible);
        if (b) nodes.push({ type: "def", name: d.name, slot: slots.get(d.name), fn: b.fn, tree: b.tree, reads: b.reads, unit: d.unit ?? "" });
      } else errors.push(`The order holds an item of type "${String(item.type).slice(0, 20)}".`);
      // The censoring nodes come as soon as T and every name the censoring expression reads exist, so the later
      // definitions can read T_obs and T_event.
      if (censorReads && !censored && slots.has(censorReads.t) && censorReads.names.every((r) => slots.has(r))) { censored = true; censorNodes(/** @type {RegExpExecArray} */ (censor), nodes, slots, declare, expr, errors); }
    }
    if (censor && !censored) errors.push(`Censoring "${censor[0].slice(0, 40)}": the model never defines ${censor[2]} or a name that the censoring expression reads.`);
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
    let compoundDraws = 0, pathDraws = 0;
    for (const n of nodes) {
      if (n.type !== "var" || !n.constant) continue;
      if (n.law.cost) pathDraws += n.repeat * Math.max(0, ...alternatives.map((alt) => { const p = argsAt(n, alt.values); return p.error || n.law.check(p.params).length ? 0 : n.law.cost(p.params); }));
      let most = 0, family = n.law;
      while (family.base && family.catalogue !== "compound") family = family.base;
      for (const alt of alternatives) {
        const p = argsAt(n, alt.values);
        const bad = p.error ? [p.error] : n.law.check(p.params);
        for (const msg of bad) errors.push(`Variable ${n.name} in "${alt.label}": ${msg}`);
        // A compound Poisson draw (also inside a mixture or a truncated law) sums about freq terms: count them in the draws of one replicate.
        if (!bad.length && family.catalogue === "compound") most = Math.max(most, Math.ceil(Math.max(.../** @type {number[]} */ ([p.params.freq].flat()))));
      }
      compoundDraws += n.repeat * most;
    }
    if (pathDraws > LIMITS.pathDraws) errors.push(`One replicate draws about ${pathDraws} values for its paths and copulas. The limit is ${LIMITS.pathDraws}: lower steps or coarsen.`);
    if (compoundDraws && draws + compoundDraws > LIMITS.drawsPerReplicate) errors.push(`One replicate draws about ${draws + compoundDraws} values with the terms of its compound Poisson laws. The limit is ${LIMITS.drawsPerReplicate}.`);
    const method = settings.method ?? "independent", compare = settings.compare ?? "none", failure = settings.failure ?? "none";
    const streams = settings.streams ?? "common", strata = settings.strata ?? 4, stratify = settings.stratify ?? "";
    if (!METHODS[method]) errors.push(`The method "${String(method).slice(0, 20)}" is not part of this page.`);
    if (compare !== "none" && !METHODS[compare]) errors.push(`The comparison method "${String(compare).slice(0, 20)}" is not part of this page.`);
    if (streams !== "common" && streams !== "separate") errors.push(`The streams setting "${String(streams).slice(0, 20)}" is not common or separate.`);
    if (!Number.isInteger(strata) || strata < 1 || strata > MAX_STRATA) errors.push(`The number of strata is 2^s with s an integer from 1 to ${MAX_STRATA}.`);
    if (errors.length) return { ok: false, errors, nodes, alternatives, laws: custom.laws }; // the nodes and alternatives let the page show the checks of a custom law that failed
    const designs = new Set([method, compare].filter((m) => METHODS[m]).map((m) => METHODS[m].design));

    const focusName = rec.focus && slots.has(String(rec.focus).replace(/\[\d+\]$/, "")) ? String(rec.focus) : nodes.find((n) => n.type === "var")?.name ?? nodes[0]?.name;
    const compiled = { ok: true, laws: custom.laws, record: rec, settings: { seed: settings.seed >>> 0, method, compare, failure, overrides, streams, strata, stratify }, slots, kinds, params, nodes, quantities, alternatives, focus: focusName,
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
      // A custom law on an unbounded support has moments the page does not know (order null): not infinite, unknown.
      if (mo.mean === null && (mo.order === null || Number.isNaN(mo.order))) return { mean: null, sd: null, why: `the page does not know whether the mean of ${name} exists` };
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

  /**
   * The observation nodes of a censoring mechanism: T_obs and T_event, two definitions placed after T and after every
   * name the censoring expression reads, so later definitions and the quantities can read them.
   * @param {RegExpExecArray} m @param {any[]} nodes @param {Map<string, number>} slots
   * @param {(name: string, kind: "def", where: string) => boolean} declare @param {(src: string, where: string, visible: Map<string, number>) => any} expr @param {string[]} errors
   */
  function censorNodes(m, nodes, slots, declare, expr, errors) {
    const [, side, t, by] = m, where = `Censoring "${m[0].slice(0, 40)}"`;
    const at = nodes.findIndex((n) => n.name === t);
    if (at < 0 || nodes[at].type !== "var") { errors.push(`${where}: "${t}" is not a random variable of the model.`); return; }
    const c = expr(by, where, slots);
    if (!c) return;
    let after = at;
    for (const r of c.reads) {
      const j = nodes.findIndex((n) => n.name === r);
      if (j > after) after = j;
      if (r === t) { errors.push(`${where}: the censoring time cannot read ${t} itself.`); return; }
    }
    const [fn, op] = side === "right" ? ["pmin", "<="] : ["pmax", ">="];
    const made = [];
    for (const [name, src] of [[`${t}_obs`, `${fn}(${t}, ${by})`], [`${t}_event`, `${t} ${op} (${by})`]]) {
      if (!declare(name, "def", where)) return;
      const b = expr(src, where, slots);
      if (!b) return;
      made.push({ type: "def", name, slot: slots.get(name), fn: b.fn, tree: b.tree, reads: b.reads, unit: "", censoring: side });
    }
    nodes.splice(after + 1, 0, ...made);
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
   * @param {"reference" | "inverse" | "rejection" | "euler"} kind @param {string} failure
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
        else if (kind === "euler") s = law.euler ? law.euler(params) : law.reference(params);
        else s = law.reference(params);
        if ("unavailable" in s) throw new E.ExprError(`${law.name} law, ${kind === "reference" ? "independent sampling" : kind === "inverse" ? "inverse transform" : kind === "euler" ? "Euler time discretisation" : "rejection sampling"}: ${s.unavailable}`);
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
      if (node.u) { env[node.slot] = fromUniform(node, node.u(env), p.params); continue; }
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
   * The value of a variable with the argument u: the quantile of its law at u, for each copy. u is one number, or a
   * vector with one entry for each copy, each in (0, 1).
   * @param {any} node @param {Value} u @param {Record<string, any>} params
   */
  function fromUniform(node, u, params) {
    const one = (/** @type {number} */ x) => {
      if (!(x > 0 && x < 1)) throw new E.ExprError(`Variable ${node.name}: u = ${x} is outside (0, 1).`);
      return L.quantile(node.law, x, params);
    };
    if (node.repeat === 1) {
      if (typeof u !== "number") throw new E.ExprError(`Variable ${node.name}: u is a vector, so give one entry, such as U[1].`);
      return one(u);
    }
    const us = typeof u === "number" ? null : u;
    if (!us || us.length !== node.repeat) throw new E.ExprError(`Variable ${node.name}: u needs ${node.repeat} entries, one for each copy.`);
    return us.map(one);
  }

  /**
   * Replicates from..from + count − 1 of alternative a with a method's samplers, as copies of the environment: the
   * sample paths and the scatter of the page show the same draws as the run (the plain streams of the method).
   * @param {any} c @param {number} a @param {number} from @param {number} count @param {string} [method]
   */
  function sample(c, a, from, count, method) {
    const cfg = METHODS[method ?? c.settings.method] ?? METHODS.independent, get = samplers(cfg.sampler, c.settings.failure);
    const rng = a === 0 || c.settings.streams === "common" ? R.stream(c.settings.seed, STREAM, 0, 0) : R.stream(c.settings.seed, `${STREAM}/${a}`, 0, 0);
    const stats = { proposals: 0, accepts: 0, violations: 0 }, env = c.alternatives[a].values.slice(), out = [];
    for (let i = from; i < from + count; i++) {
      simulate(c, env, rng, c.settings.failure === "stream_reuse" ? i % REUSE : i, false, get, stats, null);
      out.push(env.slice());
    }
    return out;
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
    // The ensemble band of a path variable (group 5): pointwise counts in a window, mergeable across blocks.
    const band = opts.band && c.slots.has(opts.band.name) ? opts.band : null, bands = band ? c.alternatives.map(() => Pr.bandNew(band)) : null;
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
          if (bands && band) Pr.bandAdd(bands[a], band, env[c.slots.get(band.name)]);
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
    return { error: "", acc, diffs, pairs, hists, rejection: stats, cover, bands };
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
      if (!prev) return { method: m.method, acc: m.acc.map((/** @type {any[]} */ row) => row.map(clone)), diffs: m.diffs.map((/** @type {any[]} */ row) => row.map(clone)), pairs: m.pairs, hists: m.hists.map((/** @type {any} */ h) => ({ ...h, bins: h.bins.slice(), exceed: h.exceed.slice() })), bands: m.bands ?? null, rejection: { ...m.rejection }, ms: m.ms, cover: m.cover.map((/** @type {any[]} */ row) => row.map((x) => (x === null ? null : { hit: x, of: 1 }))) };
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
        bands: prev.bands && m.bands ? prev.bands.map((/** @type {any} */ x, /** @type {number} */ a) => Pr.bandMerge(x, m.bands[a])) : null,
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
   * exists), "heavy" (moments exist only below an order) and "unknown". The status of a quantity holds for every
   * alternative; with several alternatives, `alts` gives the status of each one, because a heavy tail can change
   * between them (Student's t with ν = 1.5 or 30).
   * @param {any} c a compiled model
   */
  function momentStatus(c) {
    const all = statusOf(c);
    if (c.alternatives.length < 2) return all;
    const each = c.alternatives.map((/** @type {any} */ alt) => statusOf({ ...c, alternatives: [alt] }));
    return all.map((/** @type {any} */ s, /** @type {number} */ k) => ({ ...s, alts: each.map((/** @type {any[]} */ e) => ({ mean: e[k].mean, variance: e[k].variance })) }));
  }

  /** @param {any} c */
  function statusOf(c) {
    /** @type {Map<string, { cls: "finite" | "bounded" | "light" | "heavy" | "unknown", order: number }>} */
    const tails = new Map();
    for (const n of c.nodes) {
      if (n.type === "def") continue;
      // The uniform u of an inverse transform does not change the law: the variable keeps the law of its parameters.
      const parents = [...n.reads].filter((r) => c.kinds.get(r) !== "param" && !n.ureads?.has(r));
      let cls = /** @type {"finite" | "bounded" | "light" | "heavy" | "unknown"} */ ("unknown"), order = Infinity;
      const finiteLaw = ["bernoulli", "categorical", "uniform", "hypergeometric", "multinomial", "binomial"].includes(n.law.id);
      const bounded = (/** @type {{ lo: number, hi: number }} */ s) => s.hi < Infinity && s.lo > -Infinity;
      if (!parents.length) {
        const p = argsAt(n, c.alternatives[0].values).params, s = n.law.support(p), mo = n.law.moments(p);
        order = mo.order;
        // A custom law on an unbounded support has an order the page does not know (null): its class is unknown.
        cls = bounded(s) ? (n.law.continuous ? "bounded" : "finite") : order === null || Number.isNaN(order) ? "unknown" : order === Infinity ? "light" : "heavy";
        if (cls === "unknown") order = Infinity;
        for (const alt of c.alternatives.slice(1)) {
          const q = argsAt(n, alt.values).params, o2 = n.law.moments(q).order;
          if (o2 === null || Number.isNaN(o2)) { if (!bounded(n.law.support(q))) cls = "unknown"; continue; }
          if (cls === "unknown") continue;
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
      if (q.trees.every(indicator)) return { mean: "finite", variance: "finite", reason: "Each expression is an indicator: it takes only the values 0 and 1, so all its moments exist." };
      const vars = new Set();
      for (const t of q.trees) for (const r of randomReads(t, c)) vars.add(r);
      const classes = [...vars].map((v) => /** @type {any} */ (tails.get(v)) ?? { cls: "unknown", order: Infinity });
      if (classes.every((t) => t.cls === "finite")) return { mean: "finite", variance: "finite", reason: "Every variable it reads has a finite support, so the quantity has bounds." };
      const growth = q.trees.every((/** @type {any} */ t) => polynomial(t, c));
      if (q.kind === "expectation" && vars.size === 1) {
        const v = /** @type {string} */ ([...vars][0]), t = /** @type {any} */ (tails.get(v));
        if (t && t.cls === "heavy" && (affine(q.trees[0], v, c) || clippedAffine(q.trees[0], v, c))) {
          const o = t.order, both = sideOf(v, c) === "both";
          return { mean: o > 1 ? "finite" : "infinite", variance: o > 2 ? "finite" : "infinite", twoSided: o <= 1 && both,
            reason: `The quantity is an affine function of ${v}, whose moment of order r exists only for r < ${fmtOrder(o)}.${o <= 1 && both ? ` Both tails of ${v} are heavy, so E[${v}⁺] = E[${v}⁻] = ∞: the mean does not exist, and it is not +∞ or −∞.` : ""}` };
        }
      }
      // An affine function of the maximum, the sum or the mean of the copies of one heavy variable has the tail order of
      // that variable: the largest copy decides the tail (P(max > x) ~ n P(X > x)), and so does the sum.
      if (q.kind === "expectation") {
        const d = derivedTail(q.trees[0], c, tails);
        if (d) return { mean: d.order > 1 ? "finite" : "infinite", variance: d.order > 2 ? "finite" : "infinite", twoSided: d.order <= 1 && d.both,
          reason: `The quantity is an affine function of ${d.fn}(${d.v}), which has the tail of ${d.v}: its moment of order r exists only for r < ${fmtOrder(d.order)}.${d.order <= 1 && d.both ? " Both tails are heavy, so the mean does not exist, and it is not +∞ or −∞." : ""}` };
      }
      if (classes.every((t) => t.cls === "finite" || t.cls === "bounded" || t.cls === "light") && growth) return { mean: "finite", variance: "finite", reason: "Every variable it reads has finite moments of all orders, and the expression grows at most as a polynomial." };
      // An affine function of independent variables (or of the components of a vector law) has a mean exactly when
      // each of its terms has one, and a variance exactly when each term has one.
      if (q.kind === "expectation") {
        const lin = c.alternatives.map((/** @type {any} */ alt) => controlMoments(q.trees[0], c, alt.values));
        if (lin.every((/** @type {any} */ m) => m.mean !== null)) return { mean: "finite", variance: lin.every((/** @type {any} */ m) => m.sd !== null) ? "finite" : "infinite", reason: "The quantity is an affine function of variables with known moments, so linearity gives its mean, and its variance exists exactly when each term has a variance." };
        if (lin.some((/** @type {any} */ m) => m.infinite)) return { mean: "infinite", variance: "infinite", reason: "The quantity is an affine function of variables, and one of them has an infinite mean." };
      }
      if (q.trees.every((/** @type {any} */ t) => { const b = bounds(t, c); return b[0] && b[1]; })) return { mean: "finite", variance: "finite", reason: "The expression has a lower and an upper bound (a clipped or capped value, an indicator, or a variable with a bounded support), so all its moments exist." };
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

  /**
   * Whether an expression has a lower bound and an upper bound, from its form: a constant, an indicator, a variable
   * with a bounded support for every alternative, min and pmin with a bounded argument above, max and pmax below,
   * sums, differences, the mean of a vector, and products of two bounded factors.
   * @param {any} t @param {any} c @returns {[boolean, boolean]}
   */
  function bounds(t, c) {
    if (fixed(t, c) || indicator(t)) return [true, true];
    switch (t.t) {
      case "id": {
        const n = c.nodes.find((/** @type {any} */ x) => x.name === t.name);
        if (n?.type === "def") return bounds(n.tree, c);
        if (n?.type !== "var" || !n.constant) return [false, false];
        const s = c.alternatives.map((/** @type {any} */ alt) => n.law.support(argsAt(n, alt.values).params));
        return [s.every((/** @type {any} */ x) => x.lo > -Infinity), s.every((/** @type {any} */ x) => x.hi < Infinity)];
      }
      case "un": { const b = bounds(t.a, c); return t.op === "-" ? [b[1], b[0]] : b; }
      case "bin": {
        const a = bounds(t.a, c), b = bounds(t.b, c);
        if (t.op === "+") return [a[0] && b[0], a[1] && b[1]];
        if (t.op === "-") return [a[0] && b[1], a[1] && b[0]];
        if (t.op === "*") { const ok = a[0] && a[1] && b[0] && b[1]; return [ok, ok]; }
        return [false, false];
      }
      case "call": {
        const bs = t.args.map((/** @type {any} */ x) => bounds(x, c));
        if (t.fn === "min" || t.fn === "pmin") return [bs.every((/** @type {[boolean, boolean]} */ b) => b[0]), bs.some((/** @type {[boolean, boolean]} */ b) => b[1])];
        if (t.fn === "max" || t.fn === "pmax") return [bs.some((/** @type {[boolean, boolean]} */ b) => b[0]), bs.every((/** @type {[boolean, boolean]} */ b) => b[1])];
        if (t.fn === "mean" || t.fn === "median" || t.fn === "quantile" || t.fn === "sum" || t.fn === "abs") return t.fn === "abs" ? [true, bs[0][0] && bs[0][1]] : bs[0];
        if (t.fn === "km") return [true, true];
        if (t.fn === "if") return [bs[1][0] && bs[2][0], bs[1][1] && bs[2][1]];
        return [false, false];
      }
      default: return [false, false];
    }
  }

  /** True when an expression takes only the values 0 and 1: a comparison or a logical operator. @param {any} t */
  const indicator = (t) => (t.t === "bin" && ["<", "<=", ">", ">=", "==", "!=", "&&", "||"].includes(t.op)) || (t.t === "un" && t.op === "!");

  /** The side of the heavy tail of a variable with constant parameters: "right", "left", "both" or "". @param {string} v @param {any} c */
  function sideOf(v, c) {
    const n = c.nodes.find((/** @type {any} */ x) => x.name === v);
    if (n?.type !== "var" || !n.constant) return "";
    return c.alternatives.some((/** @type {any} */ alt) => n.law.moments(argsAt(n, alt.values).params).side === "both") ? "both" : n.law.moments(argsAt(n, c.alternatives[0].values).params).side ?? "";
  }

  /**
   * The tail order of an affine function of D, where D := max(V), sum(V) or mean(V) of a heavy variable V with constant
   * parameters. The maximum of a variable whose only heavy tail is on the left is lighter, so it gives null; so does a
   * minimum, whose moments the page does not decide.
   * @param {any} t @param {any} c @param {Map<string, any>} tails
   */
  function derivedTail(t, c, tails) {
    const env = c.alternatives[0].values;
    let core = t;
    for (let i = 0; i < 8; i++) {
      const parts = affineParts(core, c, env);
      if (!parts) return null;
      if (parts.inner.t === "call") { core = parts.inner; break; }
      const n = c.nodes.find((/** @type {any} */ x) => x.name === parts.inner.name);
      if (n?.type !== "def") return null;
      core = n.tree;
    }
    if (core.t !== "call" || !["max", "sum", "mean"].includes(core.fn)) return null;
    const v = core.args[0].name, tl = tails.get(v), side = sideOf(v, c);
    if (!tl || tl.cls !== "heavy" || (core.fn === "max" && side === "left")) return null;
    return { fn: core.fn, v, order: tl.order, both: core.fn !== "max" && side === "both" };
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
        if (["exp", "log", "log1p", "pow", "prod", "tan", "lgamma"].includes(t.fn)) return t.args.every((/** @type {any} */ a) => fixed(a, c));
        return t.args.every((/** @type {any} */ a) => polynomial(a, c));
      case "idx": return polynomial(t.a, c) && polynomial(t.i, c);
      case "arr": return t.items.every((/** @type {any} */ a) => polynomial(a, c));
      default: return false;
    }
  }

  /**
   * True when the expression is max or pmax of a fixed value and a + b·v with b > 0, for a variable v whose only
   * heavy tail is on the right, such as the excess pmax(X − u, 0): it keeps the heavy tail, so it has the tail order of v.
   * @param {any} t @param {string} v @param {any} c
   */
  function clippedAffine(t, v, c) {
    if (t.t !== "call" || !["max", "pmax"].includes(t.fn) || t.args.length !== 2 || sideOf(v, c) !== "right") return false;
    const arg = t.args.find((/** @type {any} */ x) => !fixed(x, c));
    if (!arg || !t.args.some((/** @type {any} */ x) => fixed(x, c)) || !affine(arg, v, c)) return false;
    const env = c.alternatives[0].values.slice(), slot = c.slots.get(v), f = E.compile(arg, c.slots);
    env[slot] = 0;
    const y0 = f(env);
    env[slot] = 1;
    const y1 = f(env);
    return typeof y0 === "number" && typeof y1 === "number" && y1 > y0;
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
        // A vector focus with no index, such as a path, gives every entry, as the run's histogram counts them.
        const v = env[c.slots.get(name)], xs = typeof v === "number" ? [v] : idx ? [v[idx - 1]] : v;
        for (const x of xs) if (Number.isFinite(x)) out.push(x);
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
    if (c.nodes.some((/** @type {any} */ n) => n.type === "var" && (DEP_KIND.has(n.law.kind) || n.u))) return dependenceReference(c, status);
    if (c.nodes.some((/** @type {any} */ n) => n.type === "var" && n.law.continuous)) {
      return c.alternatives.map((/** @type {any} */ alt, /** @type {number} */ a) => {
        // Linearity gives the mean of an affine function of independent variables with known means.
        const cf = closedForm(c, a, status, true);
        const closed = cf.values.map((v, k) => {
          const q = c.quantities[k];
          return v !== null || q.kind !== "expectation" || status[k].mean !== "finite" ? v : controlMoments(q.trees[0], c, alt.values).mean;
        });
        const r = closed.every((v) => v !== null) ? { values: closed, reason: "", neglected: 0, marginal: null, method: "closed" } : quadrature(c, status, a, closed);
        // A quantity that reads the model only through one name with an exact law (a maximum of draws, say) has its
        // own one-dimensional quadrature, also where the model has repeated variables.
        const one = c.quantities.map((/** @type {any} */ _, /** @type {number} */ k) => (closed[k] === null && r.values[k] === null ? oneNameRef(c, a, status, k) : null));
        const values = r.values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (closed[k] !== null ? closed[k] : v !== null ? v : one[k]));
        const reason = values.some((/** @type {number | null} */ v) => v === null) ? r.reason : "";
        const how = values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (v === null ? "" : closed[k] !== null ? (cf.numeric[k] ? "the law's numerical CDF (an integral)" : "closed form") : r.values[k] !== null ? "adaptive quadrature over the quantile functions" : "quadrature over the exact law of one name"));
        return { ...r, reason, values, closed: closed.map((v, k) => v !== null && !cf.numeric[k]), how };
      });
    }
    return enumerate(c, status).map((/** @type {any} */ r, /** @type {number} */ a) => {
      const closed = closedForm(c, a, status).values;
      return { ...r, method: "enumeration", values: r.values.map((/** @type {number | null} */ v, /** @type {number} */ k) => (v !== null ? v : closed[k])), closed: closed.map((v) => v !== null) };
    });
  }

  /**
   * Reference values of a model with a copula, a path or a variable drawn from a uniform u (group 5): the box
   * probabilities of a copula and the path quantities that MCCopulas.closed and MCProcesses.closed recognise. Every
   * other quantity has none: the page does not integrate over a path or a copula.
   * @param {any} c @param {any[]} status
   */
  function dependenceReference(c, status) {
    return c.alternatives.map((/** @type {any} */ _, /** @type {number} */ a) => {
      const cop = Cop.closed(c, a, argsAt), pro = Pr.closed(c, a, argsAt);
      const found = c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
        const r = cop[k] ?? pro[k];
        return r && !(q.kind === "expectation" && status[k].mean !== "finite") ? r : null;
      });
      const values = found.map((/** @type {any} */ r) => (r ? r.value : null));
      return { values, reason: values.some((/** @type {number | null} */ v) => v === null) ? "The model has a copula, a path or a variable drawn from a copula uniform. The page has reference values only for the box probabilities and the path quantities it recognises, and it does not integrate over a path." : "",
        neglected: 0, marginal: null, method: "closed", closed: found.map((/** @type {any} */ r) => !!r && r.exact), continuous: found.map((/** @type {any} */ r) => !!r?.continuous), how: found.map((/** @type {any} */ r) => (r ? r.how : "")) };
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
      if (law.atoms) {
        // A law of finitely many values (an empirical law or a table): a sum over its values, which need not be integers.
        const at = law.atoms(p);
        for (let j = 0; j < at.x.length; j++) {
          env[node.slot] = at.x[j];
          const sub = walk(i + 1, depth);
          for (let d = 0; d < D; d++) out[d] += at.p[j] * sub[d];
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
   * The exact law of one name of the model, or null: a scalar variable with constant parameters, the maximum, the
   * minimum, the sum or the mean of the i.i.d. copies of such a variable (a sum only for the families closed under
   * sums), or an affine function of a name with a continuous law. env holds the parameters and the definitions that
   * read no random variable.
   * @param {any} c @param {string} name @param {Value[]} env @param {number} [depth] @returns {any}
   */
  function nameLaw(c, name, env, depth = 0) {
    const node = c.nodes.find((/** @type {any} */ n) => n.name === name);
    if (!node || depth > 8) return null;
    if (node.type === "var") { const v = boundVar(c, node, env); return v && v.n === 1 ? v.b : null; }
    const parts = affineParts(node.tree, c, env);
    if (!parts) return null;
    const t = parts.inner;
    let inner = null;
    if (t.t === "id") inner = nameLaw(c, t.name, env, depth + 1);
    else {
      const v = boundVar(c, c.nodes.find((/** @type {any} */ n) => n.name === t.args[0].name), env);
      if (!v) return null;
      if (v.n === 1) inner = v.b;
      else if (t.fn === "max") inner = T.maxOf(v.b, v.n);
      else if (t.fn === "min") inner = T.minOf(v.b, v.n);
      else {
        const sum = T.sumOf(v.law, v.p, v.n);
        inner = t.fn === "sum" || !sum ? sum : T.affineOf(sum, 1 / v.n, 0);
      }
    }
    if (!inner) return null;
    return parts.a === 1 && parts.b === 0 ? inner : T.affineOf(inner, parts.a, parts.b);
  }

  /** The bound law of a variable with constant parameters, and its number of copies. @param {any} c @param {any} n @param {Value[]} env */
  function boundVar(c, n, env) {
    if (n?.type !== "var" || !n.constant || n.law.dim) return null;
    // The exact law of a maximum, minimum or sum assumes integer or continuous values, not the values of a table.
    if (n.law.atoms && n.repeat > 1) return null;
    const pr = argsAt(n, env);
    return pr.error || n.law.check(pr.params).length ? null : { b: T.bind(n.law, pr.params, L.quantile), law: n.law, p: pr.params, n: n.repeat };
  }

  /**
   * t as a·inner + b, where inner is a name that reads a random variable or max, min, sum or mean of a variable, and a
   * and b read no random variable; null for any other form.
   * @param {any} t @param {any} c @param {Value[]} env @returns {{ inner: any, a: number, b: number } | null}
   */
  function affineParts(t, c, env) {
    /** @param {any} x */
    const val = (x) => { const v = E.compile(x, c.slots)(env); return typeof v === "number" && Number.isFinite(v) ? v : null; };
    if (t.t === "id") return c.kinds.get(t.name) !== "param" && randomReads(t, c).size ? { inner: t, a: 1, b: 0 } : null;
    if (t.t === "call") return t.args.length === 1 && t.args[0].t === "id" && c.kinds.get(t.args[0].name) === "var" && ["max", "min", "sum", "mean"].includes(t.fn) ? { inner: t, a: 1, b: 0 } : null;
    if (t.t === "un" && (t.op === "-" || t.op === "+")) { const r = affineParts(t.a, c, env); return r && (t.op === "+" ? r : { inner: r.inner, a: -r.a, b: -r.b }); }
    if (t.t !== "bin") return null;
    const fa = fixed(t.a, c), fb = fixed(t.b, c);
    if (fa === fb) return null;
    const k = val(fa ? t.a : t.b), r = affineParts(fa ? t.b : t.a, c, env);
    if (k === null || !r) return null;
    switch (t.op) {
      case "+": return { inner: r.inner, a: r.a, b: r.b + k };
      case "-": return fa ? { inner: r.inner, a: -r.a, b: k - r.b } : { inner: r.inner, a: r.a, b: r.b - k };
      case "*": return { inner: r.inner, a: r.a * k, b: r.b * k };
      case "/": return fa || k === 0 ? null : { inner: r.inner, a: r.a / k, b: r.b / k };
      default: return null;
    }
  }

  /** The exact law of the focus name for alternative a (a bound law of tails.js), or null; never a component of a vector. @param {any} c @param {number} a */
  function focusLaw(c, a) {
    const [name, idx] = splitFocus(c.focus);
    return idx ? null : nameLaw(c, name, fixedEnv(c, a));
  }

  /** The parameters and the definitions that read no random variable, for alternative a. @param {any} c @param {number} a */
  function fixedEnv(c, a) {
    const env = c.alternatives[a].values.slice();
    for (const n of c.nodes) if (n.type === "def" && fixed(n.tree, c)) env[n.slot] = n.fn(env);
    return env;
  }

  /**
   * Exact values from the law of one name: P(N op v) from the CDF, the survival function or the PMF, E[N] from the
   * law's moments, and a ratio of two such values. With anyModel false it keeps group 1's rule: a model of one
   * scalar variable and nothing else. `numeric` marks a value whose CDF is itself a numerical integral (the stable law).
   * @param {any} c @param {number} a @param {any[]} status @returns {{ values: (number | null)[], numeric: boolean[] }}
   */
  function closedForm(c, a, status, anyModel = false) {
    const none = { values: c.quantities.map(() => null), numeric: c.quantities.map(() => false) };
    const scalar = (/** @type {any} */ n) => n?.type === "var" && n.constant && n.repeat === 1 && !n.law.dim;
    if (!anyModel && (c.nodes.length !== 1 || !scalar(c.nodes[0]))) return none;
    const env = fixedEnv(c, a), numeric = c.quantities.map(() => false);
    const FLIP = /** @type {Record<string, string>} */ ({ "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "!=": "!=" });
    /** @param {any} t */
    const lawOf = (t) => (t.t === "id" ? nameLaw(c, t.name, env) : null);
    /** The value of E[t] for an indicator comparison or a name. @param {any} t @param {number} k @param {boolean} mean */
    const value = (t, k, mean) => {
      // An expression of the parameters alone, such as a decision variable that an objective reads, is its own mean.
      if (mean && fixed(t, c)) { const v = E.compile(t, c.slots)(env); return typeof v === "number" && Number.isFinite(v) ? v : null; }
      if (mean && t.t === "id") {
        const m = lawOf(t);
        if (!m || status[k].mean !== "finite") return null;
        if (m.mean !== null) { if (!m.exactMean) numeric[k] = true; return m.mean; }
        return null;
      }
      if (t.t !== "bin" || !(t.op in FLIP)) return null;
      let op = t.op, side = t.b, m = lawOf(t.a);
      if (m && fixed(t.b, c)) side = t.b;
      else if ((m = lawOf(t.b)) && fixed(t.a, c)) { side = t.a; op = FLIP[op]; }
      else return null;
      const v = E.compile(side, c.slots)(env);
      if (typeof v !== "number" || Number.isNaN(v)) return null;
      if (m.numeric) numeric[k] = true;
      // A continuous law with an atom at 0: P(X = 0) = F(0), and every other point has probability 0.
      if (m.mixed) { const z = v === 0 ? m.cdf(0) : 0; return op === "<" ? m.cdf(v) - z : op === "<=" ? m.cdf(v) : op === ">" ? m.sf(v) : op === ">=" ? m.sf(v) + z : op === "==" ? z : 1 - z; }
      // A continuous law gives every single point probability 0, so P(X < v) = P(X ≤ v) = F(v).
      if (m.continuous) return op === "<" || op === "<=" ? m.cdf(v) : op === ">" || op === ">=" ? m.sf(v) : op === "==" ? 0 : 1;
      // A law of finitely many values that need not be integers: P(X < v) = F(v) − P(X = v), and so on.
      if (m.atoms) return op === "<" ? m.cdf(v) - m.mass(v) : op === "<=" ? m.cdf(v) : op === ">" ? m.sf(v) : op === ">=" ? m.sf(v) + m.mass(v) : op === "==" ? m.mass(v) : 1 - m.mass(v);
      switch (op) {
        case "<": return m.cdf(Math.ceil(v) - 1);
        case "<=": return m.cdf(Math.floor(v));
        case ">": return m.sf(Math.floor(v));
        case ">=": return m.sf(Math.ceil(v) - 1);
        case "==": return m.mass(v);
        default: return 1 - m.mass(v);
      }
    };
    const values = c.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
      if (q.kind === "expectation") return value(q.trees[0], k, true);
      if (q.kind === "probability") return value(q.trees[0], k, false);
      if (!anyModel) return null;
      const x = value(q.trees[0], k, true), y = value(q.trees[1], k, true);
      return x === null || y === null || y === 0 ? null : x / y;
    });
    return { values, numeric };
  }

  /**
   * Reference values by quadrature over the law of one name: a quantity that reads the random variables only through
   * a name N with an exact law (such as M := max(X) of a repeated variable) is E[g(N)] = ∫ g(Q_N(u)) du. The
   * definitions between N and the quantity are evaluated at each node. Null for a quantity that reads another random
   * name, for a law whose CDF is numerical (each quantile would need a root of an integral), and for an integral that
   * does not converge.
   * @param {any} c @param {number} a @param {any[]} status @param {number} k
   */
  function oneNameRef(c, a, status, k) {
    const q = c.quantities[k];
    if (q.kind === "expectation" && status[k].mean !== "finite") return null;
    if (q.kind === "ratio" && status[k].mean !== "finite") return null;
    const env = fixedEnv(c, a);
    for (const n of [...c.nodes].reverse()) {
      if (n.type === "var" && n.repeat > 1) continue;
      if (!q.trees.every((/** @type {any} */ t) => through(t, n.name, c))) continue;
      const law = nameLaw(c, n.name, env);
      if (!law || law.numeric) continue;
      // The definitions after N that read it, in model order.
      const after = c.nodes.slice(c.nodes.indexOf(n) + 1).filter((/** @type {any} */ d) => d.type === "def" && !fixed(d.tree, c) && through(d.tree, n.name, c));
      /** @param {(e: Value[]) => Value} fn @param {boolean} indicator */
      const g = (fn, indicator) => (/** @type {number} */ x) => {
        const e = env.slice();
        e[n.slot] = x;
        for (const d of after) e[d.slot] = d.fn(e);
        const v = scalar(fn(e), q.name);
        return indicator ? +(v !== 0) : v;
      };
      /** @param {(x: number) => number} f */
      const integral = (f) => T.expectU(f, (u) => law.quantile(u, 1 - u), (v) => law.quantile(1 - v, v));
      try {
        if (q.kind === "ratio") { const x = integral(g(q.num, false)), y = integral(g(q.den, false)); return x === null || y === null || y === 0 ? null : x / y; }
        const v = integral(g(q.fn, q.kind === "probability"));
        return v === null ? null : q.kind === "probability" ? Math.min(1, Math.max(0, v)) : v;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** True when every random variable that t reads, directly or through definitions, it reads through the name n. @param {any} t @param {string} n @param {any} c @returns {boolean} */
  function through(t, n, c) {
    return [...E.names(t)].every((r) => {
      if (r === n || c.kinds.get(r) === "param") return true;
      const node = c.nodes.find((/** @type {any} */ x) => x.name === r);
      return node?.type === "def" && through(node.tree, n, c);
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
        if (node.law.atoms) {
          const at = node.law.atoms(pr.params);
          for (let j = 0; j < at.x.length; j++) {
            env[node.slot] = at.x[j];
            if (!walk(i + 1, w * at.p[j])) return false;
          }
          return true;
        }
        if (node.law.continuous) { reason = `Variable ${node.name} has a continuous law, so the page does not enumerate it.`; return false; }
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
          const st = status[k].alts?.[a] ?? status[k], s = m.acc[a][k], mu = controlMean(c, design, a, k), iv = interval(q.kind, s, st.variance, design, mu);
          // An infinite mean is the stronger reason: the sample mean then has no finite limit at all.
          if (st.mean === "infinite" && iv.lo === null) iv.how = status[k].twoSided ? "no interval: the mean does not exist (both tails are heavy), so the sample mean has no limit" : "no interval: the mean is infinite, so the sample mean has no finite limit";
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
          const heavy = [pair[0], pair[1]].some((a) => (status[k].alts?.[a] ?? status[k]).variance === "infinite");
          const iv = interval("expectation", s, heavy ? "infinite" : "unknown", design, ma === null || mb === null ? null : mb - ma);
          const sa = alts[pair[0]].quantities[k].se, sb = alts[pair[1]].quantities[k].se;
          const crn = iv.se && sa !== null && sb !== null && (sa > 0 || sb > 0) ? (sa * sa + sb * sb) / (iv.se * iv.se) : null;
          return { name: q.name, est: iv.est, lo: iv.lo, hi: iv.hi, se: iv.se, crn, how: `paired difference ${c.alternatives[pair[1]].label} − ${c.alternatives[pair[0]].label}, ${c.settings.streams === "common" ? "common random numbers" : "separate streams"}` };
        }),
      }));
      return { method: m.method, design, alts, diffs, decision: decide(c, alts, diffs), rejection: m.rejection, ms: m.ms, hists: m.hists, bands: m.bands ?? null,
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

  return { FORMAT, VERSION, BLOCK, STREAM, REUSE, LIMITS, TEXT_FIELDS, METHODS, MAX_STRATA, QUAD, DEP, complete, prepare, block, merge, empty, summary, interval, momentStatus, reference, splitFocus, argsAt, sampleFocus, focusLaw, sample };
});
