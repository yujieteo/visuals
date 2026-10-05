/* Universal Data Workbench: grammar v1, the finite set of charts searched for each table (grammar.md).
 *
 * Pure functions of a table's column profiles (src/profile.js), so the candidate set is exact and tested without
 * the engine:
 *
 *   classify    each column's field class: Q (a numeric measure with at least 13 distinct values), C (categories:
 *               categorical, yes or no, or numbers with 2 to 12 distinct values; at most 1,000 levels), T (dates
 *               and date-times, at least 2 distinct), L (labels: text with at least half its values distinct), or
 *               excluded, always with the reason
 *   enumerate   every candidate of the grammar, in a fixed order (the kinds below, then column order), each with a
 *               stable id; the first 10,000 are generated, the rest counted as incomplete
 *   formula     the documented count: 2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWGrammar = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "1";
  const MAX_CANDIDATES = 10000;
  const MAX_LEVELS = 1000;
  const MIN_Q_DISTINCT = 13;
  const MAX_FACET_LEVELS = 12;

  /**
   * The kinds of grammar v1, in the order they are enumerated. `channels` names the encoding of each field, in
   * the order the candidate lists them; `classes` gives each field's class; `pattern` is the pattern class the
   * statistics of step 3 test.
   */
  const KINDS = [
    { id: "histogram", label: "Histogram", channels: ["x"], classes: ["Q"], pattern: "distribution" },
    { id: "box", label: "Box plot", channels: ["y"], classes: ["Q"], pattern: "distribution" },
    { id: "bar", label: "Bar chart of counts", channels: ["x"], classes: ["C"], pattern: "levels" },
    { id: "count-series", label: "Count time series", channels: ["x"], classes: ["T"], pattern: "time-count" },
    { id: "scatter", label: "Scatter plot", channels: ["x", "y"], classes: ["Q", "Q"], pattern: "QxQ" },
    { id: "binned-heatmap", label: "Binned heatmap", channels: ["x", "y"], classes: ["Q", "Q"], pattern: "QxQ" },
    { id: "box-by-group", label: "Box plot by group", channels: ["x", "y"], classes: ["C", "Q"], pattern: "CxQ" },
    { id: "mean-bar", label: "Mean bar with 95% CI", channels: ["x", "y"], classes: ["C", "Q"], pattern: "CxQ" },
    { id: "count-heatmap", label: "Count heatmap", channels: ["x", "y"], classes: ["C", "C"], pattern: "CxC" },
    { id: "mean-series", label: "Mean time series", channels: ["x", "y"], classes: ["T", "Q"], pattern: "TxQ" },
    { id: "period-heatmap", label: "Period-by-category heatmap", channels: ["x", "y"], classes: ["T", "C"], pattern: "TxC" },
    { id: "point-timeline", label: "Point timeline", channels: ["x", "label"], classes: ["T", "L"], pattern: "timeline" },
    { id: "interval-timeline", label: "Interval timeline", channels: ["x", "x2", "label"], classes: ["T", "T", "L"], pattern: "timeline" },
  ];
  const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const CLASS_LABEL = { Q: "measure (Q)", C: "category (C)", T: "time (T)", L: "label (L)", excluded: "excluded" };

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const YEAR_MIN = 1000, YEAR_MAX = 2999;

  /**
   * The field class of one profiled column, with its reason. Exclusions come first (could not be profiled, a nested
   * or binary type, every value missing, constant, an identifier, dates waiting for a layout); then the role the
   * person set or the workbench inferred; then the type.
   * @param {any} col a column profile (src/profile.js)
   * @returns {{ name: string, position: number, cls: "Q" | "C" | "T" | "L" | "excluded", reason: string,
   *   levels: number, type: string, role: string, precision: string | null, unit: string }}
   */
  function classify(col) {
    const base = { name: col.name, position: col.position, levels: col.distinct ?? 0, type: col.type ?? "", role: col.role ?? "", precision: null, unit: col.unit ?? "" };
    const out = (cls, reason, extra = {}) => ({ ...base, cls, reason, ...extra });
    if (col.notProfiled) return out("excluded", "Not profiled: profiling stopped before this column.");
    if (col.failed) return out("excluded", "Could not be profiled.");
    if (col.type === "unsupported") return out("excluded", "A nested or binary type, which v1 does not chart.");
    if (col.type === "empty" || !(col.valued > 0)) return out("excluded", "Every value is missing.");
    if (!(col.distinct > 1)) return out("excluded", "Constant: one value only.");
    if (col.role === "identifier") return out("excluded", `An identifier, never a measure: ${(col.roleReasons ?? [])[0] ?? "its role says so."}`);
    if (col.type === "text" && col.reading?.kind === "text" && ((col.ambiguous ?? []).length || (col.mixed ?? []).length) && col.role === "unknown") {
      return out("excluded", "Its values look like dates in more than one layout: approve a layout to chart it as time.");
    }
    const numeric = col.type === "integer" || col.type === "decimal";
    const textual = col.type === "text" || col.type === "categorical";
    const category = col.role === "category" || col.role === "ordered category";
    if (col.role === "event label" && textual) return out("L", `Text with ${plural(col.distinct, "distinct value", "distinct values")}, used as labels (its role).`);
    if (category || col.type === "boolean" || col.type === "categorical") {
      if (col.distinct > MAX_LEVELS) return out("excluded", `${col.distinct} levels: more than 1,000 for a category.`);
      const what = col.type === "boolean" ? "Yes or no" : col.type === "categorical" ? "Categorical text" : numeric ? `Numbers with the role ${col.role}` : `The role ${col.role}`;
      return out("C", `${what}, ${plural(col.distinct, "level", "levels")}.`);
    }
    if (col.type === "date" || col.type === "datetime") {
      const precision = col.reading?.kind === "date-partial" ? "mixed" : col.type === "date" ? "day" : "time";
      return out("T", `${col.type === "date" ? "Dates" : "Date-times"}, ${plural(col.distinct, "distinct value", "distinct values")}.`, { precision });
    }
    if (col.type === "time") return out("excluded", "Times of day: v1 charts dates and date-times only.");
    if (numeric) {
      if (col.role === "time") {
        const s = col.summary ?? {};
        const years = s.kind === "numeric" && s.min >= YEAR_MIN && s.max <= YEAR_MAX && s.whole === s.n;
        if (years) return out("T", `Whole numbers from ${s.min} to ${s.max} with the role time: years.`, { precision: "year" });
        return out("excluded", "The role time on numbers that are not years (whole numbers from 1000 to 2999): v1 reads only years from numbers.");
      }
      if (col.distinct <= 12) return out("C", `Numbers with ${plural(col.distinct, "distinct value", "distinct values")}: levels.`);
      if (col.role === "measure") return out("Q", `A measure with ${plural(col.distinct, "distinct value", "distinct values")}.`);
      return out("excluded", `Numbers with the role ${col.role}: v1 charts numbers as measures, levels or years.`);
    }
    if (textual) {
      if (col.valued > 0 && col.distinct / col.valued >= 0.5) return out("L", `Text, ${Math.floor((100 * col.distinct) / col.valued)}% of the values distinct: labels.`);
      if (col.distinct <= MAX_LEVELS) return out("C", `Text with ${plural(col.distinct, "level", "levels")}.`);
      return out("excluded", `Text with ${col.distinct} levels: more than 1,000 for a category, and too few distinct for labels.`);
    }
    return out("excluded", `The type ${col.type} has no chart in v1.`);
  }

  /** Each profiled column's class, in column order. @param {any[]} columns */
  const classifyAll = (columns) => [...columns].sort((a, b) => a.position - b.position).map(classify);

  /** n choose 2. */
  const pairs = (n) => (n * (n - 1)) / 2;

  /** The documented count of candidates for a table with q, c, t and l fields of each class. */
  function formula({ q, c, t, l }) {
    const terms = { histogram: q, box: q, bar: c, "count-series": t, scatter: pairs(q), "binned-heatmap": pairs(q), "box-by-group": q * c, "mean-bar": q * c,
      "count-heatmap": pairs(c), "mean-series": t * q, "period-heatmap": t * c, "point-timeline": t * l, "interval-timeline": pairs(t) * l };
    const total = Object.values(terms).reduce((a, b) => a + b, 0);
    return { terms, total, text: "2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l" };
  }

  /**
   * A name as part of an id: lower case, [a-z0-9_], at most 60 characters; a name that changes gets a short hash of
   * itself, so ids stay unique and short enough for the specification's schema and for file names.
   */
  function slug(name) {
    const s = (String(name).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "field").slice(0, 60);
    if (s === name) return s;
    let h = 0x811c9dc5;
    for (const ch of String(name)) {
      h ^= ch.codePointAt(0) ?? 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${s}-${h.toString(16).padStart(8, "0").slice(0, 6)}`;
  }

  /** A candidate's stable id: table, kind, then its fields in channel order. */
  const candidateId = (table, kind, fields) => [table, kind, ...fields.map(slug)].join(".");

  /**
   * Every candidate of grammar v1 for a table, in the documented order: the kinds of KINDS in turn; within a kind,
   * fields in column order (for two fields of one class the earlier is x; a category is x against a measure; time
   * is x). An interval timeline takes two time fields: the start is the one whose role is interval start, else the
   * earlier column. The first `max` candidates are listed; the rest are counted by kind (`overflow`).
   * @param {string} table @param {ReturnType<typeof classify>[]} fields @param {{ max?: number }} [o]
   */
  function enumerate(table, fields, o = {}) {
    const max = o.max ?? MAX_CANDIDATES;
    const of = (cls) => fields.filter((f) => f.cls === cls).sort((a, b) => a.position - b.position);
    const Q = of("Q"), C = of("C"), T = of("T"), L = of("L");
    const counts = { q: Q.length, c: C.length, t: T.length, l: L.length };
    /** @type {{ id: string, kind: string, fields: string[], pattern: string }[]} */
    const candidates = [];
    /** @type {Record<string, number>} */
    const overflow = {};
    /** @type {Record<string, number>} */
    const byKind = {};
    const add = (kind, list) => {
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      if (candidates.length >= max) {
        overflow[kind] = (overflow[kind] ?? 0) + 1;
        return;
      }
      const names = list.map((f) => f.name);
      candidates.push({ id: candidateId(table, kind, names), kind, fields: names, pattern: KIND[kind].pattern });
    };
    const each2 = (list, fn) => list.forEach((a, i) => list.slice(i + 1).forEach((b) => fn(a, b)));
    for (const k of KINDS) {
      switch (k.id) {
        case "histogram": case "box": Q.forEach((f) => add(k.id, [f])); break;
        case "bar": C.forEach((f) => add(k.id, [f])); break;
        case "count-series": T.forEach((f) => add(k.id, [f])); break;
        case "scatter": case "binned-heatmap": each2(Q, (a, b) => add(k.id, [a, b])); break;
        case "box-by-group": case "mean-bar": C.forEach((c) => Q.forEach((q) => add(k.id, [c, q]))); break;
        case "count-heatmap": each2(C, (a, b) => add(k.id, [a, b])); break;
        case "mean-series": T.forEach((t) => Q.forEach((q) => add(k.id, [t, q]))); break;
        case "period-heatmap": T.forEach((t) => C.forEach((c) => add(k.id, [t, c]))); break;
        case "point-timeline": T.forEach((t) => L.forEach((l) => add(k.id, [t, l]))); break;
        case "interval-timeline":
          each2(T, (a, b) => {
            const [start, end] = b.role === "interval start" && a.role !== "interval start" ? [b, a] : [a, b];
            L.forEach((l) => add(k.id, [start, end, l]));
          });
          break;
        default: break;
      }
    }
    const total = Object.values(byKind).reduce((a, b) => a + b, 0);
    return { version: VERSION, counts, candidates, byKind, overflow, total, formula: formula(counts), max };
  }

  /** The fields a facet may use: categories with at most 12 levels. @param {ReturnType<typeof classify>[]} fields */
  const facetFields = (fields) => fields.filter((f) => f.cls === "C" && f.levels <= MAX_FACET_LEVELS);

  /**
   * The accounting of a table's candidates: how many of each outcome, and whether every candidate has one.
   * @param {{ outcome: string }[]} candidates @param {number} overflow candidates beyond the cap
   */
  function accounting(candidates, overflow = 0) {
    const n = { valid: 0, excluded: 0, failed: 0, incomplete: overflow, pending: 0 };
    for (const c of candidates) n[/** @type {keyof typeof n} */ (c.outcome in n ? c.outcome : "pending")] += 1;
    return { ...n, total: candidates.length + overflow, complete: n.pending === 0 && n.incomplete === 0 };
  }

  return { VERSION, MAX_CANDIDATES, MAX_LEVELS, MIN_Q_DISTINCT, MAX_FACET_LEVELS, KINDS, KIND, CLASS_LABEL, classify, classifyAll, formula, slug, candidateId, enumerate, facetFields, accounting };
});
