/* Monte Carlo Probability Workbench: the model text of the expert editor. One line states one part of a model
 * record, so the editor text, the record, the dependency graph and the equations describe the same model:
 *
 *   title: Overbooking at the gate            problem: …        focus X        observation: …    censoring: none
 *   param seats = 180 {seats} "note"           X ~ binomial(n = tickets, p = pshow) repeat 1 {passengers} "note"
 *   bumped := max(X - seats, 0) {passengers}   prob pbump = bumped >= 1        mean profit = fare*tickets - comp*bumped
 *   ratio ppv = E[D*T] / E[T]                  alt "Sell 180": tickets = 180; comp = 500
 *   maximise profit                            require pbump <= 0.05           # a comment
 *   control C = D "a control variate"
 *
 * parse() reads the text into a record and lists each problem with its line; print() writes a record as text, and
 * parse(print(r)) gives r back.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCDsl = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const TEXT = ["title", "problem", "initial", "dynamics", "observation", "censoring", "truncation", "selection"];

  /** Split a line's tail into the expression, then repeat, {unit} and "note" from the end. @param {string} s */
  function tail(s) {
    let rest = s.trim(), note = "", unit = "", repeat = 1;
    const n = /\s*"([^"]*)"$/.exec(rest);
    if (n) { note = n[1]; rest = rest.slice(0, n.index).trim(); }
    const u = /\s*\{([^{}]*)\}$/.exec(rest);
    if (u) { unit = u[1].trim(); rest = rest.slice(0, u.index).trim(); }
    const r = /(?:^|\s+)repeat\s+(\d+)$/.exec(rest);
    if (r) { repeat = Number(r[1]); rest = rest.slice(0, r.index).trim(); }
    return { rest, note, unit, repeat };
  }

  /** Split at the top-level separators of an argument list: not inside (), [] or "". @param {string} s @param {string} sep */
  function split(s, sep) {
    const out = [];
    let depth = 0, start = 0, quote = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') quote = !quote;
      else if (quote) continue;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (ch === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map((x) => x.trim()).filter((x) => x !== "");
  }

  /** The text inside E[ … ] from position i (the "["), with bracket depth. @param {string} s @param {number} i */
  function bracket(s, i) {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "[") depth++;
      else if (s[j] === "]" && --depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 };
    }
    return null;
  }

  const KINDS = ["pdf", "logpdf", "density", "pmf", "table", "cdf", "quantile", "mgf", "cf"];
  const CLAUSES = ["on", "where", "obs", "grid", "probs"];

  /**
   * A law line: law NAME(p1, p2) KIND(arg) = EXPR, then the clauses on [lo, hi], where CONDITION, obs [values],
   * probs [probabilities] and grid N in any order, then {unit} and "note". A clause starts at its keyword outside
   * brackets and quotes. Returns the law record or an error.
   * @param {string} name @param {string} params @param {string} kind @param {string} arg @param {string} body
   */
  function lawLine(name, params, kind, arg, body) {
    if (!KINDS.includes(kind)) return { error: `"${kind}" is not an input kind of a law line (${KINDS.join(", ")}).` };
    const t = tail(body);
    if (t.repeat !== 1) return { error: "a law line takes no repeat." };
    // The start of each clause keyword at depth 0.
    const cuts = [];
    let depth = 0;
    for (let i = 0; i < t.rest.length; i++) {
      const ch = t.rest[i];
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (depth === 0 && /\s/.test(ch)) {
        const w = /^\s+([a-z]+)\b/.exec(t.rest.slice(i));
        if (w && CLAUSES.includes(w[1])) cuts.push({ at: i, key: w[1], from: i + w[0].length });
      }
    }
    /** @type {any} */
    const def = { name, params: split(params ?? "", ","), kind, arg, expr: (cuts.length ? t.rest.slice(0, cuts[0].at) : t.rest).trim() };
    for (let j = 0; j < cuts.length; j++) {
      const c = cuts[j], value = t.rest.slice(c.from, j + 1 < cuts.length ? cuts[j + 1].at : undefined).trim();
      if (def[c.key] !== undefined) return { error: `the clause ${c.key} comes twice.` };
      if (c.key === "on") {
        const inner = /^\[(.*)\]$/.exec(value), ends = inner ? split(inner[1], ",") : [];
        if (ends.length !== 2) return { error: "the support is written on [lo, hi], with inf for no bound." };
        def.on = ends;
      } else if (c.key === "grid") {
        if (!/^\d+$/.test(value)) return { error: "grid takes a whole number, such as grid 4096." };
        def.grid = Number(value);
      } else def[c.key] = value;
    }
    if (!def.expr) return { error: "the law has no expression after =." };
    if (t.unit) def.unit = t.unit;
    if (t.note) def.note = t.note;
    return { def };
  }

  /**
   * Read model text into a record. Returns { record, errors } with each error as "Line n: …".
   * @param {string} text @param {string} [id]
   */
  function parse(text, id = "custom") {
    /** @type {any} */
    const rec = { format: "monte-carlo-workbench/model", version: 1, id, title: "Untitled model", problem: "", parameters: [], variables: [], definitions: [], order: [], quantities: [], alternatives: [], decision: { objective: null, constraints: [] } };
    /** @type {string[]} */
    const errors = [];
    const lines = String(text ?? "").split(/\r?\n/);
    if (lines.length > 200) errors.push("The model text has more than 200 lines.");
    lines.slice(0, 200).forEach((raw, k) => {
      const line = raw.replace(/^\s+|\s+$/g, "");
      const at = `Line ${k + 1}`;
      if (!line || line.startsWith("#")) return;
      let m;
      if ((m = /^([a-z]+):\s*(.*)$/.exec(line)) && TEXT.includes(m[1])) rec[m[1]] = m[2];
      else if ((m = /^focus\s+([A-Za-z][\w]*(?:\[\d+\])?)$/.exec(line))) rec.focus = m[1];
      else if ((m = /^law\s+([A-Za-z]\w*)\s*(?:\(([^()]*)\))?\s+([a-z]+)\s*\(\s*([A-Za-z]\w*)\s*\)\s*=\s*(.+)$/.exec(line))) {
        const r = lawLine(m[1], m[2] ?? "", m[3], m[4], m[5]);
        if (r.error) errors.push(`${at}: ${r.error}`);
        else (rec.laws ??= []).push(r.def);
      }
      else if ((m = /^control\s+([A-Za-z]\w*)\s*=\s*(.+)$/.exec(line))) {
        const t = tail(m[2]);
        rec.control = { name: m[1], expr: t.rest, ...(t.note ? { note: t.note } : {}) };
      }
      else if ((m = /^param\s+([A-Za-z]\w*)\s*=\s*(.+)$/.exec(line))) {
        const t = tail(m[2]);
        rec.parameters.push({ name: m[1], expr: t.rest, unit: t.unit, note: t.note });
      } else if ((m = /^([A-Za-z]\w*)\s*~\s*([A-Za-z]\w*)\s*\((.*)\)(.*)$/.exec(line))) {
        const t = tail(m[4]);
        if (t.rest) { errors.push(`${at}: "${t.rest.slice(0, 30)}" after the law is not repeat, {unit} or "note".`); return; }
        /** @type {Record<string, string>} */
        const args = {};
        for (const part of split(m[3], ",")) {
          const a = /^([A-Za-z]\w*)\s*=\s*(.+)$/.exec(part);
          if (!a) { errors.push(`${at}: the argument "${part.slice(0, 30)}" is not name = expression.`); return; }
          args[a[1]] = a[2].trim();
        }
        rec.variables.push({ name: m[1], law: m[2], args, unit: t.unit, repeat: t.repeat, note: t.note });
        rec.order.push({ type: "var", name: m[1] });
      } else if ((m = /^([A-Za-z]\w*)\s*:=\s*(.+)$/.exec(line))) {
        const t = tail(m[2]);
        rec.definitions.push({ name: m[1], expr: t.rest, unit: t.unit, note: t.note });
        rec.order.push({ type: "def", name: m[1] });
      } else if ((m = /^(prob|mean)\s+([A-Za-z]\w*)\s*=\s*(.+)$/.exec(line))) {
        const t = tail(m[3]);
        rec.quantities.push({ name: m[2], kind: m[1] === "prob" ? "probability" : "expectation", expr: t.rest, unit: t.unit, note: t.note });
      } else if ((m = /^ratio\s+([A-Za-z]\w*)\s*=\s*(E\[.*)$/.exec(line))) {
        const t = tail(m[2]);
        const a = bracket(t.rest, 1);
        const slash = a ? /^\s*\/\s*E\[/.exec(t.rest.slice(a.end)) : null;
        const b = a && slash ? bracket(t.rest, a.end + slash[0].length - 1) : null;
        if (!a || !b || t.rest.slice(b.end).trim()) { errors.push(`${at}: a ratio is written ratio name = E[numerator] / E[denominator].`); return; }
        rec.quantities.push({ name: m[1], kind: "ratio", num: a.inner.trim(), den: b.inner.trim(), unit: t.unit, note: t.note });
      } else if ((m = /^alt\s+"([^"]+)"\s*(?::\s*(.*))?$/.exec(line))) {
        /** @type {Record<string, string>} */
        const set = {};
        for (const part of split(m[2] ?? "", ";")) {
          const a = /^([A-Za-z]\w*)\s*=\s*(.+)$/.exec(part);
          if (!a) { errors.push(`${at}: the setting "${part.slice(0, 30)}" is not name = expression.`); return; }
          set[a[1]] = a[2].trim();
        }
        rec.alternatives.push({ label: m[1], set });
      } else if ((m = /^(maximise|minimise)\s+([A-Za-z]\w*)$/.exec(line))) rec.decision.objective = { quantity: m[2], direction: m[1] };
      else if ((m = /^require\s+([A-Za-z]\w*)\s*(<=|>=)\s*(-?[\d.]+(?:[eE][+-]?\d+)?)$/.exec(line))) rec.decision.constraints.push({ quantity: m[1], op: m[2], value: Number(m[3]) });
      else errors.push(`${at}: "${line.slice(0, 40)}" is not a line of the model text.`);
    });
    if (!rec.alternatives.length) rec.alternatives.push({ label: "As stated", set: {} });
    return { record: rec, errors };
  }

  /** @param {{ unit?: string, note?: string }} x */
  const end = (x) => `${x.unit ? ` {${x.unit}}` : ""}${x.note ? ` "${x.note}"` : ""}`;

  /** Write a record as model text. @param {any} rec */
  function print(rec) {
    const out = [`title: ${rec.title}`];
    if (rec.problem) out.push(`problem: ${rec.problem}`);
    for (const p of rec.parameters ?? []) out.push(`param ${p.name} = ${p.expr}${end(p)}`);
    for (const l of rec.laws ?? []) {
      const clauses = [l.on ? ` on [${l.on[0]}, ${l.on[1]}]` : "", l.probs ? ` probs ${l.probs}` : "", l.where ? ` where ${l.where}` : "", l.obs ? ` obs ${l.obs}` : "", l.grid ? ` grid ${l.grid}` : ""].join("");
      out.push(`law ${l.name}${l.params?.length ? `(${l.params.join(", ")})` : ""} ${l.kind}(${l.arg}) = ${l.expr}${clauses}${end(l)}`);
    }
    const vars = new Map((rec.variables ?? []).map((/** @type {any} */ v) => [v.name, v]));
    const defs = new Map((rec.definitions ?? []).map((/** @type {any} */ d) => [d.name, d]));
    const order = rec.order ?? [...(rec.variables ?? []).map((/** @type {any} */ v) => ({ type: "var", name: v.name })), ...(rec.definitions ?? []).map((/** @type {any} */ d) => ({ type: "def", name: d.name }))];
    for (const item of order) {
      if (item.type === "var") {
        const v = vars.get(item.name);
        out.push(`${v.name} ~ ${v.law}(${Object.entries(v.args).map(([k, e]) => `${k} = ${e}`).join(", ")})${(v.repeat ?? 1) > 1 ? ` repeat ${v.repeat}` : ""}${end(v)}`);
      } else {
        const d = defs.get(item.name);
        out.push(`${d.name} := ${d.expr}${end(d)}`);
      }
    }
    for (const q of rec.quantities ?? []) {
      if (q.kind === "ratio") out.push(`ratio ${q.name} = E[${q.num}] / E[${q.den}]${end(q)}`);
      else out.push(`${q.kind === "probability" ? "prob" : "mean"} ${q.name} = ${q.expr}${end(q)}`);
    }
    for (const a of rec.alternatives ?? []) {
      const set = Object.entries(a.set ?? {}).map(([k, e]) => `${k} = ${e}`).join("; ");
      if (a.label === "As stated" && !set && rec.alternatives.length === 1) continue;
      out.push(`alt "${a.label}"${set ? `: ${set}` : ""}`);
    }
    if (rec.decision?.objective) out.push(`${rec.decision.objective.direction} ${rec.decision.objective.quantity}`);
    for (const c of rec.decision?.constraints ?? []) out.push(`require ${c.quantity} ${c.op} ${c.value}`);
    if (rec.focus) out.push(`focus ${rec.focus}`);
    if (rec.control) out.push(`control ${rec.control.name} = ${rec.control.expr}${end(rec.control)}`);
    for (const k of TEXT.slice(2)) if (rec[k] !== undefined) out.push(`${k}: ${rec[k]}`);
    return `${out.join("\n")}\n`;
  }

  return { parse, print };
});
