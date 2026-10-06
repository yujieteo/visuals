/* Universal Data Workbench: the chart specification, its JSON Schema and its validator.
 *
 * One JSON document describes each chart: data + transform + encoding + scale + layout + annotation (spec.md,
 * section 5). The same specification drives generation, the gallery, edits and, in later steps, comparison and
 * export. Every specification is validated before it is drawn: first against SCHEMA (a JSON Schema, checked by the
 * small validator below), then against the rules no schema can say (a field's class, a log scale over values at
 * or below 0, a bar that does not start at zero, a facet with more than 12 levels, a sum of a field nobody marked
 * additive).
 *
 *   make(candidate, ctx)        the generated specification of a candidate, with the fixed rules of grammar v1
 *   edit(spec, change, ctx)     a new specification with the person's change, the change recorded in spec.edits
 *   validate(spec, ctx)         { ok, errors }: schema errors with their path, then rule errors
 *   validateSchema(schema, v)   the JSON Schema subset the specification uses
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./grammar.js"));
  else root.DWChartSpec = factory(root.DWGrammar);
})(typeof self !== "undefined" ? self : this, function (Grammar) {
  "use strict";

  const SPEC_VERSION = "1";
  const SEED = 20261005;
  const PERIODS = ["auto", "hour", "day", "week", "month", "quarter", "year"];
  /** The periods a time field's precision allows: a date has no hours; years are counted by year only. */
  const periodsFor = (precision) => (precision === "year" ? ["auto", "year"] : precision === "time" ? PERIODS : PERIODS.filter((p) => p !== "hour"));
  const LIMITS = { width: [40, 500], height: [30, 500], bins: [5, 100], top: [1, 29], groups: [1, 12], facetColumns: [1, 6], text: 200, notes: 2000 };

  const field = { type: "object", required: ["field", "class"], additionalProperties: false,
    properties: { field: { type: "string", minLength: 1, maxLength: 300 }, class: { enum: ["Q", "C", "T", "L"] }, aggregate: { enum: ["mean", "sum"] } } };
  const scale = { type: "object", required: ["type"], additionalProperties: false,
    properties: { type: { enum: ["linear", "log10", "band", "time", "sequential"] }, rule: { enum: ["auto", "set"] }, zero: { type: "boolean" },
      order: { enum: ["count", "value"] }, zone: { enum: ["none", "utc", "unknown"] }, scheme: { enum: ["blue"] } } };
  const text = { type: "string", maxLength: LIMITS.text };

  /** The JSON Schema of a chart specification (version 1). */
  const SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://teoyujie.org/visuals/data-workbench/chart-spec-1.json",
    title: "Universal Data Workbench chart specification, version 1",
    type: "object",
    required: ["version", "grammar", "id", "kind", "data", "transform", "encoding", "scale", "layout", "annotation", "edits"],
    additionalProperties: false,
    properties: {
      version: { const: SPEC_VERSION },
      grammar: { const: Grammar.VERSION },
      id: { type: "string", pattern: "^[a-z][a-z0-9_]*(\\.[a-z0-9_-]+)+$", maxLength: 400 },
      kind: { enum: Grammar.KINDS.map((k) => k.id) },
      data: { type: "object", required: ["table", "rows", "sample"], additionalProperties: false,
        properties: { table: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" }, rows: { type: "integer", minimum: 0 },
          sample: { oneOf: [{ type: "null" }, { type: "object", required: ["rows", "seed"], additionalProperties: false,
            properties: { rows: { type: "integer", minimum: 1 }, seed: { type: "integer" }, of: { type: "number", minimum: 0 } } }] } } },
      transform: { type: "array", maxItems: 12, items: { $ref: "#/$defs/transform" } },
      encoding: { type: "object", additionalProperties: false, minProperties: 1,
        properties: { x: field, y: { oneOf: [field, { type: "object", required: ["aggregate"], additionalProperties: false, properties: { aggregate: { const: "count" } } }] },
          x2: field, label: field, color: { type: "object", required: ["aggregate"], additionalProperties: false, properties: { aggregate: { const: "count" } } } } },
      scale: { type: "object", additionalProperties: false, properties: { x: scale, y: scale, color: scale } },
      layout: { type: "object", required: ["width", "height", "unit", "facet"], additionalProperties: false,
        properties: { width: { type: "number", minimum: LIMITS.width[0], maximum: LIMITS.width[1] }, height: { type: "number", minimum: LIMITS.height[0], maximum: LIMITS.height[1] },
          unit: { const: "mm" },
          facet: { oneOf: [{ type: "null" }, { type: "object", required: ["field", "columns"], additionalProperties: false,
            properties: { field: { type: "string", minLength: 1 }, columns: { type: "integer", minimum: LIMITS.facetColumns[0], maximum: LIMITS.facetColumns[1] } } }] } } },
      annotation: { type: "object", required: ["title", "labels", "units", "caption", "notes", "findings"], additionalProperties: false,
        properties: { title: text, labels: { type: "object", additionalProperties: text }, units: { type: "object", additionalProperties: { type: "string", maxLength: 24 } },
          caption: { type: "string", maxLength: LIMITS.notes }, notes: { type: "array", maxItems: 20, items: { type: "string", maxLength: LIMITS.notes } },
          findings: { type: "array", items: { type: "string" } } } },
      edits: { type: "array", maxItems: 200, items: { type: "string", maxLength: 600 } },
    },
    $defs: {
      transform: { type: "object", required: ["id", "op"], additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z0-9:-]+$" },
          op: { enum: ["records", "complete", "bin", "bin2d", "box", "top", "period", "aggregate", "sample", "merge-duplicates", "order-check", "page"] },
          refs: { type: "array", minItems: 1, maxItems: 200, items: { type: "string", pattern: "^t[0-9]+$" } },
          fields: { type: "array", items: { type: "string" } }, mode: { enum: ["all", "label-and-either"] },
          channel: { enum: ["x", "y", "x2"] }, method: { enum: ["freedman-diaconis", "set"] }, bins: { oneOf: [{ type: "null" }, { type: "integer", minimum: LIMITS.bins[0], maximum: LIMITS.bins[1] }] },
          cells: { type: "array", items: { type: "integer", minimum: 1, maximum: 40 }, minItems: 2, maxItems: 2 },
          whisker: { type: "number", minimum: 0 }, n: { type: "integer", minimum: 1, maximum: LIMITS.top[1] },
          unit: { enum: PERIODS }, fn: { enum: ["count", "mean", "sum"] }, interval: { enum: ["none", "t95"] },
          rows: { type: "integer", minimum: 1 }, seed: { type: "integer" }, min: { type: "number", minimum: 0, maximum: 1 },
          size: { type: "integer", minimum: 1, maximum: 500 }, page: { type: "integer", minimum: 1 },
        } },
    },
  };

  /* ---------- the JSON Schema subset ---------- */

  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const fits = (want, v) => want === typeOf(v) || (want === "number" && typeof v === "number" && Number.isFinite(v));

  /**
   * Validate a value against a schema of the subset this file uses: type, const, enum, required, properties,
   * additionalProperties, minProperties, items, minItems, maxItems, minimum, maximum, minLength, maxLength, pattern,
   * oneOf and $ref to "#/$defs/...". Returns the errors, each with its JSON Pointer path.
   * @param {any} schema @param {any} value @param {any} [rootSchema] @param {string} [path]
   * @returns {string[]}
   */
  function validateSchema(schema, value, rootSchema = schema, path = "") {
    const at = path || "/";
    if (schema.$ref) {
      const name = String(schema.$ref).replace(/^#\/\$defs\//, "");
      return validateSchema(rootSchema.$defs[name], value, rootSchema, path);
    }
    if (schema.oneOf) {
      const passing = schema.oneOf.filter((/** @type {any} */ s) => validateSchema(s, value, rootSchema, path).length === 0).length;
      return passing === 1 ? [] : [`${at}: matches ${passing} of the allowed forms, not exactly one`];
    }
    const errors = [];
    if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return [`${at}: must be ${JSON.stringify(schema.const)}`];
    if (schema.enum && !schema.enum.some((/** @type {any} */ e) => JSON.stringify(e) === JSON.stringify(value))) return [`${at}: must be one of ${schema.enum.join(", ")}`];
    if (schema.type && !fits(schema.type, value)) return [`${at}: must be of type ${schema.type}`];
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: must be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: must be at most ${schema.maximum}`);
    }
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: must have at least ${schema.minLength} characters`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: must have at most ${schema.maxLength} characters`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: must have at least ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: must have at most ${schema.maxItems} items`);
      if (schema.items) value.forEach((v, i) => errors.push(...validateSchema(schema.items, v, rootSchema, `${path}/${i}`)));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: lacks ${key}`);
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${at}: must have at least ${schema.minProperties} properties`);
      for (const key of keys) {
        const sub = schema.properties?.[key];
        if (sub) errors.push(...validateSchema(sub, value[key], rootSchema, `${path}/${key}`));
        else if (schema.additionalProperties === false) errors.push(`${at}: ${key} is not allowed`);
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errors.push(...validateSchema(schema.additionalProperties, value[key], rootSchema, `${path}/${key}`));
      }
    }
    return errors;
  }

  /* ---------- the generated specification ---------- */

  /**
   * What the rules need to know of a table's fields: each field's class and levels from the grammar, the log rule
   * (all values above 0 and P99/P1 at least 1,000), the smallest value, the unit and whether the person marked it
   * additive.
   * @typedef {{ name: string, cls: string, levels: number, logRule: boolean, min: number | null, unit: string,
   *   additive: boolean, precision: string | null, zone: "none" | "utc" | "unknown", ordered: boolean }} FieldInfo
   * @typedef {{ table: string, rows: number, sample: { rows: number, seed: number, of?: number } | null, records?: string[], fields: Record<string, FieldInfo> }} Context
   */

  const TITLES = {
    histogram: (f) => `Distribution of ${f[0]}`,
    box: (f) => `Spread of ${f[0]}`,
    bar: (f) => `Rows by ${f[0]}`,
    "count-series": (f) => `Rows over ${f[0]}`,
    scatter: (f) => `${f[1]} against ${f[0]}`,
    "binned-heatmap": (f) => `Rows by ${f[0]} and ${f[1]}`,
    "box-by-group": (f) => `${f[1]} by ${f[0]}`,
    "mean-bar": (f) => `Mean ${f[1]} by ${f[0]}, with 95% confidence intervals`,
    "count-heatmap": (f) => `Rows by ${f[0]} and ${f[1]}`,
    "mean-series": (f) => `Mean ${f[1]} over ${f[0]}`,
    "period-heatmap": (f) => `Rows by ${f[0]} and ${f[1]}`,
    "point-timeline": (f) => `${f[1]} over ${f[0]}`,
    "interval-timeline": (f) => `${f[2]} from ${f[0]} to ${f[1]}`,
  };

  /** Generated text within the specification's limit, cut with an ellipsis: long column names stay chartable. */
  const cut = (text) => (text.length > LIMITS.text ? `${text.slice(0, LIMITS.text - 1)}…` : text);

  /** The generated title of a chart of these fields: a sum is titled as one. */
  function autoTitle(kind, fields, fn) {
    if (fn === "sum" && kind === "mean-bar") return cut(`Sum of ${fields[1]} by ${fields[0]}`);
    if (fn === "sum" && kind === "mean-series") return cut(`Sum of ${fields[1]} over ${fields[0]}`);
    return cut(TITLES[/** @type {keyof typeof TITLES} */ (kind)](fields));
  }

  /** The label of a field's axis: its name, with its unit only when the source or the person gave one. */
  const axisLabel = (info) => cut(info.unit ? `${info.name} (${info.unit})` : info.name);

  /** The scale of one channel under the fixed rules. @param {FieldInfo} info */
  function scaleOf(info, kind, channel) {
    if (info.cls === "Q") {
      const bar = kind === "mean-bar";
      return bar ? { type: "linear", rule: "auto", zero: true } : { type: info.logRule ? "log10" : "linear", rule: "auto" };
    }
    if (info.cls === "C") return { type: "band", order: info.ordered ? "value" : "count" };
    if (info.cls === "T") return { type: "time", zone: info.zone };
    return channel === "label" ? undefined : { type: "band", order: "count" };
  }

  /**
   * The generated specification of a candidate (src/grammar.js enumerate). Size: 180 mm wide, the general
   * preset's width; 110 mm tall (timelines 140 mm).
   * @param {{ id: string, kind: string, fields: string[] }} candidate @param {Context} ctx
   */
  function make(candidate, ctx) {
    const kind = Grammar.KIND[candidate.kind];
    if (!kind) throw new Error(`unknown kind ${candidate.kind}`);
    const infos = candidate.fields.map((name) => ctx.fields[name]);
    if (infos.some((i) => !i)) throw new Error(`a field of ${candidate.id} is not in the table`);
    /** @type {Record<string, any>} */
    const encoding = {}, scales = {}, labels = {}, units = {};
    kind.channels.forEach((channel, i) => {
      const info = infos[i];
      encoding[channel] = { field: info.name, class: info.cls };
      labels[channel] = axisLabel(info);
      if (info.unit) units[channel] = info.unit;
      const sc = scaleOf(info, candidate.kind, channel);
      if (sc && channel !== "x2") scales[channel] = sc;
    });
    // A derived table's charts start from the transformation records that made the table (src/transform.js).
    const transform = [...(ctx.records?.length ? [{ id: "records", op: "records", refs: [...ctx.records] }] : []),
      { id: "complete", op: "complete", fields: [...candidate.fields], mode: candidate.kind === "interval-timeline" ? "label-and-either" : "all" }];
    const count = () => transform.push({ id: "count", op: "aggregate", fn: "count" });
    switch (candidate.kind) {
      case "histogram":
        transform.push({ id: "bin:x", op: "bin", channel: "x", method: "freedman-diaconis", bins: null });
        count();
        encoding.y = { aggregate: "count" };
        scales.y = { type: "linear", zero: true };
        labels.y = "Rows";
        break;
      case "box": transform.push({ id: "box", op: "box", whisker: 1.5 }); break;
      case "bar":
        transform.push({ id: "top:x", op: "top", channel: "x", n: 29 });
        count();
        encoding.y = { aggregate: "count" };
        scales.y = { type: "linear", zero: true };
        labels.y = "Rows";
        break;
      case "count-series":
        transform.push({ id: "period:x", op: "period", channel: "x", unit: "auto" });
        count();
        encoding.y = { aggregate: "count" };
        scales.y = { type: "linear", zero: true };
        labels.y = "Rows";
        break;
      case "scatter": transform.push({ id: "sample", op: "sample", rows: 50000, seed: SEED }); break;
      case "binned-heatmap":
        transform.push({ id: "bin2d", op: "bin2d", cells: [40, 40] });
        count();
        encoding.color = { aggregate: "count" };
        scales.color = { type: "sequential", scheme: "blue" };
        break;
      case "box-by-group":
        transform.push({ id: "top:x", op: "top", channel: "x", n: 12 }, { id: "box", op: "box", whisker: 1.5 });
        break;
      case "mean-bar":
        transform.push({ id: "top:x", op: "top", channel: "x", n: 12 }, { id: "aggregate", op: "aggregate", fn: "mean", channel: "y", interval: "t95" });
        encoding.y.aggregate = "mean";
        break;
      case "count-heatmap":
        transform.push({ id: "top:x", op: "top", channel: "x", n: 12 }, { id: "top:y", op: "top", channel: "y", n: 12 });
        count();
        encoding.color = { aggregate: "count" };
        scales.color = { type: "sequential", scheme: "blue" };
        break;
      case "mean-series":
        transform.push({ id: "period:x", op: "period", channel: "x", unit: "auto" }, { id: "aggregate", op: "aggregate", fn: "mean", channel: "y", interval: "t95" });
        encoding.y.aggregate = "mean";
        break;
      case "period-heatmap":
        transform.push({ id: "period:x", op: "period", channel: "x", unit: "auto" }, { id: "top:y", op: "top", channel: "y", n: 12 });
        count();
        encoding.color = { aggregate: "count" };
        scales.color = { type: "sequential", scheme: "blue" };
        break;
      case "point-timeline":
        transform.push({ id: "merge", op: "merge-duplicates" }, { id: "page", op: "page", size: 500, page: 1 });
        break;
      case "interval-timeline":
        transform.push({ id: "order", op: "order-check", min: 0.9 }, { id: "merge", op: "merge-duplicates" }, { id: "page", op: "page", size: 500, page: 1 });
        break;
      default: break;
    }
    const timeline = candidate.kind.endsWith("timeline");
    return {
      version: SPEC_VERSION,
      grammar: Grammar.VERSION,
      id: candidate.id,
      kind: candidate.kind,
      data: { table: ctx.table, rows: ctx.rows, sample: ctx.sample ? { ...ctx.sample } : null },
      transform,
      encoding,
      scale: scales,
      layout: { width: 180, height: timeline ? 140 : 110, unit: "mm", facet: null },
      annotation: { title: autoTitle(candidate.kind, candidate.fields, undefined), labels, units, caption: "", notes: [], findings: [] },
      edits: [],
    };
  }

  /* ---------- edits ---------- */

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const step = (spec, id) => spec.transform.find((/** @type {any} */ t) => t.id === id);

  /**
   * A new specification with the person's change. `change` holds only what changed: fields by channel (x, y, x2,
   * label), swap (exchange x and y of two fields of one class), bins (null for the rule), unit (a period), top and
   * topY (levels kept), fn ("mean" or "sum"), xScale and yScale ("auto", "linear", "log10"), title, xLabel, yLabel,
   * caption, notes, width, height, facet (a field name or ""), facetColumns, page. Each change is recorded in
   * spec.edits; the result is validated before it is drawn.
   * @param {any} spec @param {Record<string, any>} change @param {Context} ctx
   */
  function edit(spec, change, ctx) {
    const next = clone(spec);
    const said = [];
    const kind = Grammar.KIND[next.kind];
    const fieldsNow = () => kind.channels.map((c) => next.encoding[c].field);
    const fnNow = () => step(next, "aggregate")?.fn;
    // A title the workbench wrote follows the fields and the aggregate; a title the person wrote stays.
    const generatedTitle = next.annotation.title === autoTitle(next.kind, fieldsNow(), fnNow());
    for (const channel of kind.channels) {
      const name = change[channel];
      if (name === undefined || name === next.encoding[channel]?.field) continue;
      const info = ctx.fields[name];
      if (!info) throw new Error(`no field named ${name}`);
      const before = next.encoding[channel].field;
      next.encoding[channel] = { ...next.encoding[channel], field: name, class: info.cls };
      if (next.annotation.labels[channel] === axisLabel(ctx.fields[before] ?? { name: before, unit: "" })) next.annotation.labels[channel] = axisLabel(info);
      if (info.unit) next.annotation.units[channel] = info.unit;
      else delete next.annotation.units[channel];
      const sc = scaleOf(info, next.kind, channel);
      if (sc && channel !== "x2") next.scale[channel] = sc;
      said.push(`${channel}: ${before} → ${name}`);
    }
    const bin = step(next, "bin:x");
    if (bin && change.bins !== undefined && change.bins !== bin.bins) {
      bin.bins = change.bins === null ? null : Math.round(change.bins);
      bin.method = change.bins === null ? "freedman-diaconis" : "set";
      said.push(change.bins === null ? "bins by the Freedman–Diaconis rule" : `${bin.bins} bins`);
    }
    const period = step(next, "period:x");
    if (period && change.unit !== undefined && change.unit !== period.unit) {
      period.unit = change.unit;
      said.push(change.unit === "auto" ? "time period by the rule" : `time period: ${change.unit}`);
    }
    for (const [key, id] of [["top", "top:x"], ["topY", "top:y"]]) {
      const top = step(next, id);
      if (top && change[key] !== undefined && change[key] !== top.n) {
        top.n = Math.round(change[key]);
        said.push(`${top.n} most frequent levels of ${id.slice(4)} kept, the rest as Other`);
      }
    }
    const agg = step(next, "aggregate");
    if (agg && agg.fn !== "count" && change.fn !== undefined && change.fn !== agg.fn) {
      agg.fn = change.fn;
      agg.interval = change.fn === "mean" ? "t95" : "none";
      next.encoding.y.aggregate = change.fn;
      said.push(`aggregate: ${change.fn}`);
    }
    for (const [key, channel] of [["xScale", "x"], ["yScale", "y"]]) {
      const sc = next.scale[channel];
      const want = change[key];
      if (!sc || want === undefined || (sc.type !== "linear" && sc.type !== "log10")) continue;
      const info = ctx.fields[next.encoding[channel]?.field];
      const type = want === "auto" ? (info?.logRule && next.kind !== "mean-bar" ? "log10" : "linear") : want;
      const rule = want === "auto" ? "auto" : "set";
      if (type === sc.type && rule === (sc.rule ?? "auto")) continue;
      next.scale[channel] = { ...sc, type, rule };
      said.push(`${channel} scale: ${want === "auto" ? `by the rule (${type})` : type}`);
    }
    const page = step(next, "page");
    if (page && change.page !== undefined && change.page !== page.page) {
      page.page = Math.max(1, Math.round(change.page));
      said.push(`events page ${page.page}`);
    }
    // Axis labels as the form names them: the axes before any swap below.
    for (const [key, at] of [["xLabel", "x"], ["yLabel", "y"]]) {
      if (change[key] === undefined) continue;
      const value = String(change[key]).slice(0, LIMITS.text);
      if (value === next.annotation.labels[at]) continue;
      next.annotation.labels[at] = value;
      said.push(`${at} label: "${value}"`);
    }
    // A swap comes after every change the form names by axis, so each change stays with the field it was made for,
    // and the swap carries it to the other axis.
    if (change.swap && next.encoding.x && next.encoding.y?.field) {
      for (const key of ["encoding", "scale"]) [next[key].x, next[key].y] = [next[key].y, next[key].x];
      const tx = step(next, "top:x"), ty = step(next, "top:y");
      if (tx && ty) [tx.n, ty.n] = [ty.n, tx.n];
      [next.annotation.labels.x, next.annotation.labels.y] = [next.annotation.labels.y, next.annotation.labels.x];
      const ux = next.annotation.units.x, uy = next.annotation.units.y;
      delete next.annotation.units.x;
      delete next.annotation.units.y;
      if (uy) next.annotation.units.x = uy;
      if (ux) next.annotation.units.y = ux;
      said.push("x and y swapped");
    }
    const fields = kind.channels.map((c) => next.encoding[c].field);
    if (fields.join("\u0000") !== spec.transform.find((/** @type {any} */ t) => t.id === "complete").fields.join("\u0000")) step(next, "complete").fields = fields;
    if (generatedTitle) next.annotation.title = autoTitle(next.kind, fieldsNow(), fnNow());
    if (change.title !== undefined) {
      const value = String(change.title).slice(0, LIMITS.text);
      if (value !== next.annotation.title) {
        next.annotation.title = value;
        said.push(`title: "${value}"`);
      }
    }
    if (change.caption !== undefined && change.caption !== next.annotation.caption) {
      next.annotation.caption = String(change.caption).slice(0, LIMITS.notes);
      said.push(next.annotation.caption ? "caption written" : "caption by the rule");
    }
    if (change.notes !== undefined) {
      const notes = String(change.notes).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
      if (JSON.stringify(notes) !== JSON.stringify(next.annotation.notes)) {
        next.annotation.notes = notes;
        said.push(`${notes.length} note${notes.length === 1 ? "" : "s"}`);
      }
    }
    for (const key of ["width", "height"]) {
      if (change[key] === undefined || Number(change[key]) === next.layout[key]) continue;
      next.layout[key] = Number(change[key]);
      said.push(`${key} ${next.layout[key]} mm`);
    }
    if (change.facet !== undefined && (change.facet || null) !== (next.layout.facet?.field ?? null)) {
      next.layout.facet = change.facet ? { field: change.facet, columns: next.layout.facet?.columns ?? 3 } : null;
      said.push(change.facet ? `facets by ${change.facet}` : "no facets");
    }
    if (change.facetColumns !== undefined && next.layout.facet && Number(change.facetColumns) !== next.layout.facet.columns) {
      next.layout.facet.columns = Number(change.facetColumns);
      said.push(`${next.layout.facet.columns} facet columns`);
    }
    if (said.length) next.edits.push(said.join("; "));
    return next;
  }

  /* ---------- validation ---------- */

  /**
   * Validate a specification against SCHEMA, then the rules: each encoded field exists with the class its channel
   * needs; a log scale only over values all above 0; bars and counts start at zero on a linear scale; a facet is
   * a category of at most 12 levels that the chart does not already encode; a sum only of a field the person
   * marked additive; levels kept within their range.
   * @param {any} spec @param {Context} ctx @returns {{ ok: boolean, errors: string[] }}
   */
  function validate(spec, ctx) {
    const errors = validateSchema(SCHEMA, spec);
    if (errors.length) return { ok: false, errors };
    const kind = Grammar.KIND[spec.kind];
    const want = (channel) => kind.classes[kind.channels.indexOf(channel)];
    for (const channel of kind.channels) {
      const enc = spec.encoding[channel];
      if (!enc) { errors.push(`encoding.${channel}: a ${spec.kind} needs a field here`); continue; }
      const info = ctx.fields[enc.field];
      if (!info) errors.push(`encoding.${channel}: no field named ${enc.field} in ${ctx.table}`);
      else if (info.cls !== want(channel) || enc.class !== info.cls) errors.push(`encoding.${channel}: ${enc.field} is ${Grammar.CLASS_LABEL[info.cls]}, and a ${kind.label.toLowerCase()} needs ${Grammar.CLASS_LABEL[want(channel)]} here`);
    }
    for (const channel of Object.keys(spec.encoding)) {
      if (!kind.channels.includes(channel) && spec.encoding[channel].field) errors.push(`encoding.${channel}: a ${spec.kind} has no ${channel} field`);
    }
    const fields = kind.channels.map((c) => spec.encoding[c]?.field);
    if (new Set(fields).size !== fields.length) errors.push("encoding: a field may appear only once in a chart");
    for (const channel of ["x", "y"]) {
      const sc = spec.scale[channel];
      if (sc?.type !== "log10") continue;
      const info = ctx.fields[spec.encoding[channel]?.field];
      if (!info || !(info.min !== null && info.min > 0)) errors.push(`scale.${channel}: a log scale needs every value above 0, and ${spec.encoding[channel]?.field ?? "this axis"} has values at or below 0`);
    }
    const bars = { histogram: "y", bar: "y", "count-series": "y", "mean-bar": "y" };
    const barAxis = bars[/** @type {keyof typeof bars} */ (spec.kind)];
    if (barAxis) {
      const sc = spec.scale[barAxis];
      if (!sc || sc.type !== "linear" || sc.zero !== true) errors.push(`scale.${barAxis}: bars start at zero on a linear scale`);
    }
    const facet = spec.layout.facet;
    if (facet) {
      const info = ctx.fields[facet.field];
      if (!info) errors.push(`layout.facet: no field named ${facet.field}`);
      else if (info.cls !== "C" || info.levels > Grammar.MAX_FACET_LEVELS) errors.push(`layout.facet: facets need a category of at most ${Grammar.MAX_FACET_LEVELS} levels, and ${facet.field} is ${info.cls === "C" ? `a category of ${info.levels} levels` : Grammar.CLASS_LABEL[info.cls]}`);
      if (fields.includes(facet.field)) errors.push(`layout.facet: ${facet.field} is already encoded in the chart`);
      if (spec.kind.endsWith("timeline")) errors.push("layout.facet: timelines are not faceted in v1");
    }
    const period = spec.transform.find((/** @type {any} */ t) => t.id === "period:x");
    const timeField = ctx.fields[spec.encoding.x?.field];
    if (period && timeField && !periodsFor(timeField.precision).includes(period.unit)) {
      const known = { year: "the year", mixed: "the year, month or day", day: "the day" }[/** @type {"year" | "mixed" | "day"} */ (timeField.precision)] ?? "the day";
      errors.push(`transform.period:x: ${timeField.name} is known to ${known}, so it cannot be counted by ${period.unit}`);
    }
    const agg = spec.transform.find((/** @type {any} */ t) => t.id === "aggregate");
    if (agg?.fn === "sum" && !ctx.fields[spec.encoding.y?.field]?.additive) errors.push(`transform.aggregate: a sum needs ${spec.encoding.y?.field} marked additive by you`);
    for (const t of spec.transform) {
      if (t.op === "top" && t.channel === "x" && t.n > (spec.kind === "bar" ? LIMITS.top[1] : LIMITS.groups[1])) errors.push(`transform.${t.id}: at most ${spec.kind === "bar" ? LIMITS.top[1] : LIMITS.groups[1]} levels`);
      if (t.op === "top" && t.channel === "y" && t.n > LIMITS.groups[1]) errors.push(`transform.${t.id}: at most ${LIMITS.groups[1]} levels`);
    }
    return { ok: errors.length === 0, errors };
  }

  return { SPEC_VERSION, SEED, PERIODS, periodsFor, LIMITS, SCHEMA, validateSchema, make, edit, validate, axisLabel, autoTitle };
});
