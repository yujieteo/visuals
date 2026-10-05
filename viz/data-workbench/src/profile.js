/* Universal Data Workbench: profile an imported table, one column at a time.
 *
 * profileColumn() runs the queries of src/sql.js through a query function (the page's engine, or the pinned
 * engine in the Node checks) and reads the answers with the rules of src/infer.js. Every summary uses all rows of
 * the imported table; a table imported as a sample says so itself. Nothing here removes or fills a value.
 *
 * A column profile holds: the source type, the inferred type with the share of values that fit it, the reading
 * in use (inferred or approved), missing values and markers, values that do not read, the role with its reasons,
 * a summary fitting its type, unusual values (robust z above 3.5), suspected data errors, and suggestions.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"), require("./infer.js"));
  else root.DWProfile = factory(root.DWSql, root.DWInfer);
})(typeof self !== "undefined" ? self : this, function (Sql, Infer) {
  "use strict";

  /** @typedef {(sql: string) => Promise<Record<string, any>[]>} Query */

  /** @param {Query} query @param {string} sql */
  async function one(query, sql) {
    return (await query(sql))[0] ?? {};
  }

  const NUMERIC = ["integer", "decimal"];
  const TIME = ["date", "datetime", "time"];

  /**
   * Profile one column. `override` holds what approval changed: a reading, a type, a role or a unit.
   * @param {Query} query
   * @param {{ table: string, rowColumn: string, column: { name: string, type: string, position: number },
   *   override?: { reading?: any, type?: string, role?: string, unit?: string } }} o
   */
  async function profileColumn(query, o) {
    const { table, rowColumn } = o;
    const { name, type: sourceType, position } = o.column;
    const textSource = Infer.isTextSource(sourceType);
    const stats = await one(query, textSource ? Sql.textStats(table, name) : Sql.typedStats(table, name));
    stats.distinct_values = (await one(query, Sql.distinctCount(table, name, textSource))).distinct_values;
    if (textSource) {
      const present = stats.rows - stats.nulls - stats.blanks - stats.markers;
      Object.assign(stats, stats.date_like > 0 && stats.date_like >= 0.05 * present ? await one(query, Sql.textDateStats(table, name)) : Sql.NO_DATES);
    }
    const read = textSource ? Infer.readText(stats) : Infer.readSource(sourceType, stats);
    const ov = o.override ?? {};
    const reading = ov.reading ?? read.reading;
    const type = ov.type ?? read.type;
    const markerValues = textSource && stats.markers > 0 ? await query(Sql.markerValues(table, name)) : [];
    /** @type {any} */
    const col = {
      name, position, sourceType, textSource,
      inferred: { type: read.type, reading: read.reading, share: read.share },
      type, reading, share: read.share, valued: read.valued, distinct: stats.distinct_values,
      notes: read.notes, ambiguous: read.ambiguous, mixed: read.mixed, near: read.near,
      missing: { nulls: stats.nulls, blanks: stats.blanks ?? 0, markers: stats.markers ?? 0, markerValues },
      failures: { count: 0, examples: [] }, madeMissing: 0, impossible: [], sentinels: [], unusual: null,
      summary: null, unit: ov.unit ?? "", errors: [], overridden: Object.keys(ov).filter((k) => k !== "unit" && ov[k] !== undefined),
    };
    const reads = type !== "empty" && type !== "unsupported" && reading.kind !== "text";
    if (reads) {
      const counts = await one(query, Sql.readingCounts(table, name, reading, textSource));
      col.failures.count = counts.failures;
      col.madeMissing = counts.made_missing;
      col.share = counts.valued ? (counts.valued - counts.failures) / counts.valued : 0;
      if (counts.failures > 0) col.failures.examples = await query(Sql.failureExamples(table, name, reading, rowColumn, textSource));
      if (textSource && (reading.kind === "date" || reading.kind === "date-formats") && stats.date_shape > stats.date_iso) {
        col.impossible = await query(Sql.impossibleDates(table, name));
      }
    }
    let numeric = null;
    if (reads && NUMERIC.includes(type)) {
      const s = {};
      let bins = [], outliers = [];
      await query(Sql.stageNumbers(table, name, reading));
      try {
        for (const sql of Sql.numericSummary()) Object.assign(s, await one(query, sql));
        const binsSql = Sql.numericBins(s.min, s.max), outSql = Sql.robustOutliers(s.median, s.mad);
        if (binsSql) bins = await query(binsSql);
        if (outSql) outliers = await query(outSql);
      } finally {
        await query(Sql.dropNumbers);
      }
      numeric = { min: s.min, max: s.max, whole: s.whole, n: s.n };
      col.summary = { kind: "numeric", ...s, bins };
      col.unusual = { rule: "robust z = |x - median| / (1.4826 MAD) above 3.5", count: outliers[0]?.total ?? 0,
        examples: outliers.map((r) => ({ value: r.value, z: r.z, n: r.n })), madZero: !(s.mad > 0) };
      col.sentinels = Infer.sentinels(await query(Sql.sentinelCounts(table, name, reading)));
    } else if (reads && TIME.includes(type)) {
      const s = await one(query, Sql.timeSummary(table, name, reading, sourceType));
      col.summary = { kind: "time", ...s, bins: type === "time" ? [] : await query(Sql.timeBins(table, name, reading)) };
    } else if (type === "boolean" || type === "categorical") {
      col.summary = { kind: "levels", top: await query(Sql.topValues(table, name, reading)) };
    } else if (type === "text") {
      col.summary = { kind: "text", top: await query(Sql.topValues(table, name, reading, 5)), lenMin: stats.len_min, lenMax: stats.len_max, lenMean: stats.len_mean };
    }
    const r = Infer.role({ name, type, valued: col.valued, distinct: col.distinct, zeroPadded: stats.zero_padded, uuid: stats.uuid,
      lenMin: textSource ? stats.len_min : undefined, lenMax: textSource ? stats.len_max : undefined, numeric,
      datesPending: reading.kind === "text" && (read.ambiguous.length > 0 || read.mixed.length > 0) });
    col.role = ov.role ?? r.role;
    col.inferredRole = r.role;
    col.certainty = ov.role ? "set by you" : r.certainty;
    col.roleReasons = r.reasons;
    col.inferredReasons = r.reasons;
    col.possibleTime = r.possibleTime;
    if (col.role === "identifier") {
      const dup = await query(Sql.duplicates(table, name));
      col.identifier = { repeats: dup[0]?.repeats ?? 0, repeated: dup.map((d) => ({ value: d.value, n: d.n })), first: await query(Sql.firstValues(table, name, rowColumn)) };
      col.unusual = null;
    }
    col.errors = errors(col);
    col.suggestions = Infer.suggestions(col);
    return col;
  }

  /** Suspected data errors of a column, apart from unusual values: values that do not read, impossible dates and sentinels. */
  function errors(col) {
    const out = [];
    const label = Infer.TYPE_LABEL[col.type] ?? col.type;
    const impossible = col.impossible[0]?.total ?? 0;
    const other = col.failures.count - impossible;
    if (impossible > 0) out.push({ kind: "impossible-date", count: impossible, text: `${impossible} date${impossible === 1 ? "" : "s"} name no real day`, examples: col.impossible.map((r) => r.value) });
    if (other > 0) out.push({ kind: "parse", count: other, text: `${other} value${other === 1 ? " does" : "s do"} not read as ${label}`, examples: col.failures.examples.filter((e) => !col.impossible.some((i) => i.value === String(e.value).trim())).map((e) => e.value) });
    for (const s of col.sentinels) {
      if ((col.reading.missingNumbers ?? []).includes(s.value)) continue;
      out.push({ kind: "sentinel", count: s.n, text: `${s.n} value${s.n === 1 ? " is" : "s are"} ${s.value}, which looks like a stand-in for no value`, examples: [String(s.value)] });
    }
    return out;
  }

  /**
   * Profile every column of a table in order, leaving out the row column. Stops between columns when stopped()
   * says so, and returns the columns done so far with the count of those left.
   * @param {Query} query
   * @param {{ table: string, rowColumn: string, columns: { name: string, type: string }[], overrides?: Record<string, any> }} o
   * @param {{ onColumn?: (done: number, total: number, name: string) => void, stopped?: () => boolean }} [hooks]
   */
  async function profileTable(query, o, hooks = {}) {
    const columns = o.columns.map((c, i) => ({ ...c, position: i })).filter((c) => c.name !== o.rowColumn);
    const done = [];
    for (const c of columns) {
      if (hooks.stopped?.()) break;
      hooks.onColumn?.(done.length, columns.length, c.name);
      done.push(await profileColumn(query, { table: o.table, rowColumn: o.rowColumn, column: c, override: o.overrides?.[c.name] }));
    }
    pairRoles(done);
    return { columns: done, remaining: columns.slice(done.length).map((c) => c.name), total: columns.length };
  }

  /**
   * Pair interval starts with interval ends across a table's profiled columns, in place: a start or end without
   * a partner becomes plain time, with the reason added. A role set by the person is left as it is.
   * @param {any[]} columns
   */
  function pairRoles(columns) {
    const live = columns.filter((c) => !c.failed);
    // A role the person set counts as it is: an end they set pairs with an inferred start, and the reverse.
    const paired = Infer.pairIntervals(live.map((c) => ({ name: c.name, role: c.overridden.includes("role") ? c.role : c.inferredRole })));
    live.forEach((c, i) => {
      if (c.overridden.includes("role")) return;
      c.role = paired[i].role;
      c.roleReasons = paired[i].pairedNote ? [...c.inferredReasons, paired[i].pairedNote] : c.inferredReasons;
    });
  }

  /** A table name from a file name: lower case letters, digits and _, starting with a letter, unique among `taken`. */
  function tableName(fileName, taken) {
    let base = String(fileName).replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if (!base) base = "table";
    if (/^[0-9]/.test(base)) base = `t_${base}`;
    let name = base;
    for (let i = 2; taken.includes(name); i++) name = `${base}_${i}`;
    return name;
  }

  /** Why a name cannot name a new table, or "" when it can. */
  function nameProblem(name, taken) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) return "Use lower-case letters, digits and _, starting with a letter (at most 63).";
    if (taken.includes(name)) return `A table named ${name} exists already.`;
    return "";
  }

  /** The hidden row column: __row, or __row_1, __row_2, ... when the source has a column of that name. */
  function rowColumn(names) {
    const lower = names.map((n) => String(n).toLowerCase());
    let name = "__row";
    for (let i = 1; lower.includes(name); i++) name = `__row_${i}`;
    return name;
  }

  /**
   * The top-level columns of a Parquet schema (sql.parquetSchema rows, in the file's pre-order), each with its
   * physical and converted type; nested fields are skipped with their parent.
   * @param {{ name: string, type: string | null, converted_type: string | null, num_children: number | null }[]} schema
   */
  function parquetColumns(schema) {
    const out = [];
    /** @param {number} at */
    const skip = (at) => {
      let next = at + 1;
      for (let k = 0; k < (schema[at]?.num_children ?? 0); k++) next = skip(next);
      return next;
    };
    let at = 1;
    for (let k = 0; k < (schema[0]?.num_children ?? 0) && at < schema.length; k++) {
      const c = schema[at];
      out.push({ name: c.name, physical: c.type ?? (c.num_children ? "GROUP" : ""), converted: c.converted_type ?? "" });
      at = skip(at);
    }
    return out;
  }

  /**
   * Import one registered file as a read-only base table, then read back what the import did: the rows kept, the
   * columns with their source types, the CSV dialect and the rows the CSV reader could not read (line number and
   * the line as written), or the Parquet file's own types.
   * @param {Query} query
   * @param {{ kind: "csv" | "parquet", path: string, table: string, n: number, columns?: string[] | null,
   *   sample?: { rows: number, seed: number } | null, stopped?: () => boolean }} o
   */
  async function importFile(query, o) {
    const stop = () => {
      if (o.stopped?.()) throw new Error("Import canceled before the table was created.");
    };
    const probe = { table: `__probe_rejects_${o.n}`, scan: `__probe_scans_${o.n}` };
    const rejects = { table: `__rejects_${o.n}`, scan: `__scans_${o.n}` };
    try {
      stop();
      const names = (await query(Sql.describeFile(o.kind, o.path, probe))).map((c) => c.column_name);
      return await importInto(query, o, names, rejects, stop);
    } finally {
      // The reader's tables of rejected lines are read into the result; none stays in the engine.
      for (const t of [rejects.table, rejects.scan, probe.table, probe.scan]) await query(Sql.dropTemp(t)).catch(() => {});
    }
  }

  async function importInto(query, o, names, rejects, stop) {
    const row = rowColumn(names);
    stop();
    await query(Sql.importFile({ kind: o.kind, path: o.path, table: o.table, rowColumn: row, rejects, columns: o.columns, sample: o.sample }));
    const rows = (await one(query, Sql.rowCount(o.table))).n;
    const described = await query(Sql.describeTable(o.table));
    const columns = described.map((c) => ({ name: c.column_name, type: c.column_type, source: c.column_type }));
    const out = { table: o.table, rowColumn: row, rows, columns, sourceColumns: names.length, dialect: null, rejected: { count: 0, examples: [] }, parquet: null };
    if (o.kind === "csv") {
      out.dialect = await one(query, Sql.csvDialect(o.path));
      out.rejected.count = (await one(query, Sql.csvRejectCount(rejects.table))).n ?? 0;
      if (out.rejected.count) out.rejected.examples = await query(Sql.csvRejects(rejects.table));
      for (const c of columns) if (c.name !== row) c.source = "text (CSV)";
    } else {
      const physical = parquetColumns(await query(Sql.parquetSchema(o.path)));
      const size = await one(query, Sql.parquetSize(o.path));
      out.parquet = { rowGroups: size.row_groups, uncompressed: size.uncompressed };
      for (const c of columns) {
        const p = physical.find((x) => x.name === c.name);
        if (p) c.source = `${p.physical}${p.converted ? ` (${p.converted})` : ""}`;
      }
    }
    return out;
  }

  return { profileColumn, profileTable, pairRoles, importFile, tableName, nameProblem, rowColumn, parquetColumns };
});
