/* Universal Data Workbench: transformations run on the engine, each with its record.
 *
 * Every transformation, a step of the visual controls or a statement of the SQL editor, gets a record: its kind,
 * its inputs, its parameters, its SQL, its output schema, its rows in and out, its order, and what the rules of
 * spec.md ("SQL dialect") ask to be counted: values a TRY_CAST could not convert, COUNT(*) beside COUNT(column) for
 * each aggregated column, rows a comparison drops because a value is missing, and for each join the unmatched keys
 * of each side (a count and up to 20 examples), the duplicate keys of each side and the row multiplication factor,
 * flagged above 1.
 *
 *   runPipeline(query, pipeline, catalog)   the controls' steps one after another, each into a working table
 *   runStatement(query, statement, catalog) one checked statement (src/sqlcheck.js): a query, CREATE or DROP
 *   materialize(query, text, ordered)       a query's result kept with an explicit order (__dw_pos), for the view
 *   preview(query, limit)                   the first rows of the result in that order, every value as text
 *   analysable(query, name, text, ordered)  the CREATE TABLE that makes a selected result a table to analyse
 *   joinDiagnostics(query, o)               the keys of a join, side by side
 *
 * Results are only DOUBLE and VARCHAR (counts and values as text), as the rest of the page reads them.
 * The page loads this file as a plain script (window.DWTransform); the checks load it with require().
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"), require("./algebra.js"));
  else root.DWTransform = factory(root.DWSql, root.DWAlgebra);
})(typeof self !== "undefined" ? self : this, function (Sql, Algebra) {
  "use strict";

  const { ident } = Sql;
  const RESULT = "__dw_result";
  const POS = "__dw_pos";
  const EXAMPLES = 20;
  const PREVIEW = 100;

  /** @typedef {(sql: string) => Promise<Record<string, any>[]>} Query */

  /** A relation's columns with DuckDB's types. @param {Query} query @param {string} text a SELECT or a name */
  async function describe(query, text) {
    const rows = await query(`SELECT column_name, column_type FROM (DESCRIBE ${text})`);
    return rows.map((r) => ({ name: r.column_name, type: r.column_type }));
  }
  const count = async (query, ref) => (await query(`SELECT count(*)::DOUBLE AS n FROM ${ref}`))[0].n;
  const one = async (query, sql) => (await query(sql))[0] ?? {};

  /** The SQL of an order over these columns that leaves no tie: the order given, then every other column. */
  function fullOrder(order, columns) {
    const keys = [...(order ?? [])];
    for (const c of columns) if (!keys.some((k) => k.column === c.name)) keys.push({ column: c.name });
    return Algebra.orderSql(keys);
  }

  /**
   * The keys of a join side by side: rows and missing keys of each side, distinct keys, keys that repeat and the
   * rows they hold, keys and rows with no match on the other side (up to 20 example keys, most rows first), and the
   * pairs the join makes. The multiplication factor is pairs ÷ matched rows of the left side: above 1, some left
   * rows are repeated because their key repeats on the right.
   * @param {Query} query
   * @param {{ withText?: string, left: string, right: string, leftName: string, rightName: string, keys: { lkey: string, rkey: string, left: string, right: string }[],
   *   nullsMatch: boolean, kind: string }} o left and right are relations (a quoted name), keys their columns as SQL
   */
  async function joinDiagnostics(query, o) {
    const head = o.withText ? `${o.withText}, ` : "WITH ";
    const ks = o.keys.map((_, i) => `k${i}`);
    const eq = o.nullsMatch ? "IS NOT DISTINCT FROM" : "=";
    const on = ks.map((k) => `a.${k} ${eq} b.${k}`).join(" AND ");
    const someNull = ks.map((k) => `${k} IS NULL`).join(" OR ");
    const keep = o.nullsMatch ? "" : ` WHERE NOT (${someNull})`;
    const base = `${head}__l AS (SELECT ${o.keys.map((k, i) => `${k.lkey} AS k${i}`).join(", ")} FROM ${o.left}),
  __r AS (SELECT ${o.keys.map((k, i) => `${k.rkey} AS k${i}`).join(", ")} FROM ${o.right}),
  __lk AS (SELECT ${ks.join(", ")}, count(*) AS n FROM __l${keep} GROUP BY ${ks.join(", ")}),
  __rk AS (SELECT ${ks.join(", ")}, count(*) AS n FROM __r${keep} GROUP BY ${ks.join(", ")})`;
    const s = await one(query, `${base}, __m AS (SELECT a.n AS ln, b.n AS rn FROM __lk AS a JOIN __rk AS b ON ${on})
SELECT (SELECT count(*) FROM __l)::DOUBLE AS left_rows, (SELECT count(*) FROM __r)::DOUBLE AS right_rows,
  (SELECT count(*) FROM __l WHERE ${someNull})::DOUBLE AS left_null, (SELECT count(*) FROM __r WHERE ${someNull})::DOUBLE AS right_null,
  (SELECT count(*) FROM __lk)::DOUBLE AS left_keys, (SELECT count(*) FROM __rk)::DOUBLE AS right_keys,
  (SELECT count(*) FROM __lk WHERE n > 1)::DOUBLE AS left_dup_keys, (SELECT coalesce(sum(n), 0) FROM __lk WHERE n > 1)::DOUBLE AS left_dup_rows,
  (SELECT count(*) FROM __rk WHERE n > 1)::DOUBLE AS right_dup_keys, (SELECT coalesce(sum(n), 0) FROM __rk WHERE n > 1)::DOUBLE AS right_dup_rows,
  (SELECT count(*) FROM __m)::DOUBLE AS matched_keys, (SELECT coalesce(sum(ln), 0) FROM __m)::DOUBLE AS matched_left, (SELECT coalesce(sum(rn), 0) FROM __m)::DOUBLE AS matched_right,
  (SELECT coalesce(sum(ln * rn), 0) FROM __m)::DOUBLE AS pairs`);
    const unmatched = async (from, other) => {
      const rows = await query(`${base}, __u AS (SELECT a.* FROM ${from} AS a ANTI JOIN ${other} AS b ON ${on})
SELECT ${ks.map((k) => `CAST(${k} AS VARCHAR) AS ${k}`).join(", ")}, n::DOUBLE AS n, (SELECT count(*) FROM __u)::DOUBLE AS keys, (SELECT coalesce(sum(n), 0) FROM __u)::DOUBLE AS rows
FROM __u ORDER BY n DESC, ${ks.join(", ")} NULLS LAST LIMIT ${EXAMPLES}`);
      return { keys: rows[0]?.keys ?? 0, rows: rows[0]?.rows ?? 0, examples: rows.map((r) => ({ key: ks.map((k) => r[k]), rows: r.n })) };
    };
    const left = await unmatched("__lk", "__rk"), right = await unmatched("__rk", "__lk");
    const outRows = {
      inner: s.pairs, left: s.pairs + s.left_rows - s.matched_left, right: s.pairs + s.right_rows - s.matched_right,
      full: s.pairs + s.left_rows - s.matched_left + s.right_rows - s.matched_right, semi: s.matched_left, anti: s.left_rows - s.matched_left,
    }[o.kind] ?? s.pairs;
    const repeats = o.kind !== "semi" && o.kind !== "anti";
    const factor = repeats && s.matched_left > 0 ? s.pairs / s.matched_left : 1;
    return {
      computed: true, kind: o.kind, left: o.leftName, right: o.rightName, keys: o.keys.map((k) => ({ left: k.left, right: k.right })), nullsMatch: o.nullsMatch,
      leftRows: s.left_rows, rightRows: s.right_rows, leftMissingKeys: s.left_null, rightMissingKeys: s.right_null,
      leftKeys: s.left_keys, rightKeys: s.right_keys, leftDuplicateKeys: s.left_dup_keys, leftDuplicateRows: s.left_dup_rows,
      rightDuplicateKeys: s.right_dup_keys, rightDuplicateRows: s.right_dup_rows,
      matchedKeys: s.matched_keys, matchedLeftRows: s.matched_left, matchedRightRows: s.matched_right, pairs: s.pairs,
      unmatchedLeft: left, unmatchedRight: right, rowsOut: outRows,
      factor, flagged: factor > 1, rightFactor: s.matched_right > 0 ? s.pairs / s.matched_right : 1,
    };
  }

  /** A cross join: every pair of rows; no keys. */
  async function crossDiagnostics(query, o) {
    const l = await count(query, o.left), r = await count(query, o.right);
    return { computed: true, kind: "cross", left: o.leftName, right: o.rightName, keys: [], nullsMatch: false, leftRows: l, rightRows: r, pairs: l * r, rowsOut: l * r,
      factor: r, flagged: r > 1, rightFactor: l };
  }

  /** Values a TRY_CAST could not convert in a relation: present (not missing, not blank) before and missing after. */
  async function conversionCounts(query, relation, list, withText = "") {
    if (!list.length) return [];
    const exprs = list.map((c, i) => {
      const x = c.expr ?? ident(c.column);
      const failed = c.reading ? `(${Sql.valued(c.column, true)} AND (${Sql.typed(c.column, c.reading)}) IS NULL)`
        : `((${x}) IS NOT NULL AND trim(CAST((${x}) AS VARCHAR)) <> '' AND TRY_CAST((${x}) AS ${c.type}) IS NULL)`;
      return { failed, select: `count(*) FILTER (WHERE ${failed})::DOUBLE AS f${i}` };
    });
    const r = await one(query, `${withText} SELECT count(*)::DOUBLE AS rows, ${exprs.map((e) => e.select).join(", ")} FROM ${relation}`);
    const out = [];
    for (const [i, c] of list.entries()) {
      const failures = r[`f${i}`];
      const examples = failures ? (await query(`${withText} SELECT DISTINCT CAST((${c.expr ?? ident(c.column)}) AS VARCHAR) AS v FROM ${relation} WHERE ${exprs[i].failed} ORDER BY v LIMIT 5`)).map((x) => x.v) : [];
      out.push({ column: c.column, table: c.table ?? null, to: c.reading ? `the workbench's reading (${c.reading.kind})` : c.type, failures, of: r.rows, examples });
    }
    return out;
  }

  /** COUNT(*) beside COUNT(column) for each aggregated column of a relation. */
  async function aggregateCounts(query, relation, columns, withText = "") {
    if (!columns.length) return [];
    const r = await one(query, `${withText} SELECT count(*)::DOUBLE AS rows, ${columns.map((c, i) => `count(${c.expr ?? ident(c.column)})::DOUBLE AS c${i}`).join(", ")} FROM ${relation}`);
    return columns.map((c, i) => ({ column: c.column, rows: r.rows, values: r[`c${i}`], skipped: r.rows - r[`c${i}`] }));
  }

  /** A record with its common fields. */
  function record(o) {
    return { kind: o.kind, source: o.source, label: o.label ?? "", inputs: o.inputs ?? [], parameters: o.parameters ?? null, sql: o.sql ?? "",
      columns: o.columns ?? [], rowsIn: o.rowsIn ?? [], rowsOut: o.rowsOut ?? null, order: o.order ?? "", notes: o.notes ?? [], conversions: o.conversions ?? [],
      aggregates: o.aggregates ?? [], joins: o.joins ?? [], status: o.status ?? "ok", error: o.error ?? "" };
  }

  /* ---------- the visual controls ---------- */

  const STEP = (k) => `__dw_step_${k}`;

  /**
   * Run a pipeline step by step. Each step's SQL is compiled over the step before (as shown, a WITH name) and run
   * into a working table; its record compares the two. The whole pipeline's SQL is the chain of WITH clauses; the
   * result is kept as the view's result (materialize). A step that fails stops the run, with its error.
   * @param {Query} query
   * @param {{ source: string, steps: any[] }} pipeline
   * @param {{ tables: Record<string, { columns: { name: string, type: string }[], rows?: number }>, readings?: Record<string, any>, names: string[] }} catalog
   * @param {{ stopped?: () => boolean, onStep?: (k: number, n: number) => void }} [hooks]
   */
  async function runPipeline(query, pipeline, catalog, hooks = {}) {
    const src = catalog.tables[pipeline.source];
    if (!src) throw new Error(`Choose a table to start from: ${JSON.stringify(pipeline.source ?? "")} is not one.`);
    const names = pipeline.steps.map((_, i) => Algebra.stepName(i + 1, catalog.names));
    let input = { ref: ident(pipeline.source), name: pipeline.source, columns: src.columns, order: Algebra.defaultOrder(src.columns), rows: await count(query, ident(pipeline.source)) };
    const shown = [], steps = [];
    let error = "";
    try {
      for (const [i, step] of pipeline.steps.entries()) {
        if (hooks.stopped?.()) { error = "You cancelled the run."; break; }
        hooks.onStep?.(i, pipeline.steps.length);
        const label = `Step ${i + 1}: ${Algebra.OP[step.op]?.label ?? step.op}`;
        let display, run;
        try {
          const ctx = { ...catalog, readings: i === 0 ? catalog.readings : {} };
          display = Algebra.compileStep(step, { ...input, ref: ident(i ? names[i - 1] : pipeline.source) }, ctx);
          run = Algebra.compileStep(step, input, ctx);
        } catch (e) {
          error = `${label}: ${e.message}`;
          steps.push({ record: record({ kind: step.op, source: "controls", label, inputs: [input.name], parameters: step, status: "failed", error: e.message }) });
          break;
        }
        shown.push(display);
        const target = STEP(i + 1);
        try {
          await query(`CREATE OR REPLACE TEMP TABLE ${ident(target)} AS ${run.sql}`);
        } catch (e) {
          error = `${label}: ${String(e.message ?? e).split("\n")[0]}`;
          steps.push({ record: record({ kind: step.op, source: "controls", label, inputs: [input.name], parameters: step, sql: display.sql, status: "failed", error: String(e.message ?? e).split("\n")[0] }) });
          throw Object.assign(new Error(error), { stepFailed: true, cause: e });
        }
        const columns = await describe(query, ident(target));
        const rows = await count(query, ident(target));
        const rec = record({ kind: step.op, source: "controls", label, inputs: [input.name, ...(run.join || run.setop ? [step.table] : [])], parameters: step, sql: display.sql,
          columns, rowsIn: [{ name: input.name, rows: input.rows }], rowsOut: rows, order: Algebra.orderText(run.order), notes: [...run.notes, Algebra.describe(step)] });
        if (run.join || run.setop) rec.rowsIn.push({ name: step.table, rows: await count(query, ident(step.table)) });
        rec.conversions = await conversionCounts(query, input.ref, run.conversions.filter((c) => !c.table));
        if (run.conversions.some((c) => c.table)) rec.conversions.push(...await conversionCounts(query, ident(step.table), run.conversions.filter((c) => c.table)));
        rec.aggregates = await aggregateCounts(query, input.ref, run.aggregates);
        if (run.nullDrops.length) {
          const r = await one(query, `SELECT ${run.nullDrops.map((c, k) => `count(*) FILTER (WHERE ${ident(c)} IS NULL)::DOUBLE AS m${k}`).join(", ")} FROM ${input.ref}`);
          run.nullDrops.forEach((c, k) => { if (r[`m${k}`]) rec.notes.push(`${r[`m${k}`]} row${r[`m${k}`] === 1 ? " has" : "s have"} a missing ${c}: a comparison with it is unknown, so ${r[`m${k}`] === 1 ? "it is" : "they are"} not kept.`); });
        }
        if (run.join) {
          const o = { left: input.ref, right: ident(step.table), leftName: input.name, rightName: step.table, keys: run.join.keys, nullsMatch: run.join.nullsMatch, kind: run.join.kind };
          rec.joins.push(run.join.kind === "cross" ? await crossDiagnostics(query, o) : await joinDiagnostics(query, o));
        }
        if (run.pivot) {
          const m = await one(query, `SELECT count(*) FILTER (WHERE ${ident(run.pivot.on)} IS NULL)::DOUBLE AS m FROM ${input.ref}`);
          if (m.m) rec.notes.push(`${m.m} row${m.m === 1 ? " has" : "s have"} a missing ${run.pivot.on} and ${m.m === 1 ? "is" : "are"} in no column.`);
        }
        if (run.unpivot && !run.unpivot.keepMissing) {
          const m = await one(query, `SELECT (${run.unpivot.columns.map((c) => `count(*) FILTER (WHERE ${ident(c)} IS NULL)`).join(" + ")})::DOUBLE AS m FROM ${input.ref}`);
          if (m.m) rec.notes.push(`${m.m} missing value${m.m === 1 ? "" : "s"} made no row.`);
        }
        if (run.hierarchy) {
          const m = await one(query, `SELECT count(*) FILTER (WHERE depth IS NULL)::DOUBLE AS unreached FROM ${ident(target)}`);
          const d = await one(query, `SELECT count(*)::DOUBLE AS d FROM (SELECT ${ident(run.hierarchy.id)} FROM ${input.ref} WHERE ${ident(run.hierarchy.id)} IS NOT NULL GROUP BY 1 HAVING count(*) > 1)`);
          if (m.unreached) rec.notes.push(`${m.unreached} row${m.unreached === 1 ? " is" : "s are"} not reached from a root: depth and root are missing.`);
          if (d.d) rec.notes.push(`${d.d} id${d.d === 1 ? " repeats" : "s repeat"}, so their children are repeated once for each.`);
        }
        steps.push({ record: rec });
        if (i >= 2) await query(`DROP TABLE IF EXISTS ${ident(STEP(i - 1))}`);
        input = { ref: ident(target), name: `step ${i + 1}`, columns, order: run.order, rows };
      }
    } catch (e) {
      if (!(/** @type {any} */ (e).stepFailed)) throw e;
      error = /** @type {any} */ (e).message;
    }
    const sql = Algebra.chain(pipeline.source, shown, input.order, names);
    let result = null;
    if (!error) {
      result = await keep(query, `SELECT * FROM ${input.ref}`, input.order, input.columns);
      result.order = Algebra.orderText(input.order);
    }
    for (let k = 1; k <= pipeline.steps.length; k += 1) await query(`DROP TABLE IF EXISTS ${ident(STEP(k))}`);
    return { sql, steps, error, result, order: input.order };
  }

  /** Keep a relation as the result, numbered in an order given in full. */
  async function keep(query, text, order, columns) {
    await query(`CREATE OR REPLACE TEMP TABLE ${ident(RESULT)} AS SELECT row_number() OVER (${fullOrder(order, columns)}) AS ${ident(POS)}, * FROM (${text})`);
    return { columns, rows: await count(query, ident(RESULT)) };
  }

  /* ---------- the SQL editor ---------- */

  /**
   * Keep a query's result with an explicit order: the query's own ORDER BY when it has one, else its row columns
   * (__row, carried from an import), else every column, left to right.
   * @param {Query} query @param {string} text @param {boolean} ordered
   */
  async function materialize(query, text, ordered) {
    const columns = await describe(query, `SELECT * FROM (${text})`);
    const order = Algebra.defaultOrder(columns);
    if (ordered) {
      await query(`CREATE OR REPLACE TEMP TABLE ${ident(RESULT)} AS SELECT row_number() OVER () AS ${ident(POS)}, * FROM (${text})`);
      return { columns, rows: await count(query, ident(RESULT)), order: "the query's own ORDER BY" };
    }
    const kept = await keep(query, text, order, columns);
    return { ...kept, order: Algebra.orderText(order) };
  }

  /** The first rows of the kept result, in its order, every value as text (NULL as null). */
  async function preview(query, columns, limit = PREVIEW) {
    if (!columns.length) return [];
    const rows = await query(`SELECT ${columns.map((c, i) => `TRY_CAST(${ident(c.name)} AS VARCHAR) AS c${i}`).join(", ")} FROM ${ident(RESULT)} ORDER BY ${ident(POS)} LIMIT ${limit}`);
    return rows.map((r) => columns.map((_, i) => r[`c${i}`]));
  }

  /** The probes of a checked query: conversions over its FROM, aggregates over its FROM and WHERE, its joins. */
  async function probes(query, q) {
    const notes = [], out = { conversions: [], aggregates: [], joins: [] };
    if (q.single && q.fromText) {
      const withText = q.withText ?? "";
      if (q.tryCasts.length) {
        try {
          out.conversions = await conversionCounts(query, q.fromText, q.tryCasts.map((c) => ({ column: c.expr, expr: c.expr, type: c.type })), withText);
          notes.push("TRY_CAST failures are counted over the rows the query reads, before WHERE.");
        } catch { notes.push("The TRY_CASTs of this query could not be counted on their own: they read more than the FROM clause."); }
      }
      if (q.aggregates.length) {
        try {
          out.aggregates = await aggregateCounts(query, `${q.fromText}${q.whereText ? ` WHERE ${q.whereText}` : ""}`, q.aggregates.map((a) => ({ column: a.column, expr: a.column })), withText);
        } catch { notes.push("COUNT(*) beside COUNT(column) could not be counted for this query's aggregates."); }
      }
    } else if (/try_cast\s*\(/i.test(q.text)) notes.push("TRY_CAST failures are not counted: the query is not one SELECT with a FROM clause.");
    for (const j of q.joins) {
      if (!j.diagnostics) { out.joins.push({ computed: false, kind: j.kind, left: j.left?.name ?? null, right: j.right?.name ?? null, why: `Join diagnostics are not computed: ${j.why}.` }); continue; }
      try {
        out.joins.push(await joinDiagnostics(query, { withText: q.withText, left: ident(j.left.name), right: ident(j.right.name), leftName: j.left.name, rightName: j.right.name,
          keys: j.keys.map((k) => ({ lkey: ident(k.left), rkey: ident(k.right), left: k.left, right: k.right })), nullsMatch: j.nullsMatch, kind: j.kind }));
      } catch (e) {
        out.joins.push({ computed: false, kind: j.kind, left: j.left.name, right: j.right.name, why: `Join diagnostics are not computed: ${String(/** @type {any} */ (e).message).split("\n")[0]}` });
      }
    }
    return { ...out, notes };
  }

  /**
   * Run one checked statement and make its record. A query's result is kept for the view; CREATE runs as written
   * and the new object's schema and rows are read back; DROP runs as written.
   * @param {Query} query @param {any} s a statement of sqlcheck.check
   */
  async function runStatement(query, s) {
    const kind = s.kind === "query" ? "query" : s.kind === "create-view" ? "view" : s.kind === "create-table" ? "table" : "drop";
    const base = { kind, source: "sql", label: s.kind === "query" ? "SQL query" : s.kind === "drop" ? `DROP ${s.objectKind.toUpperCase()} ${s.name}` : `CREATE ${kind.toUpperCase()} ${s.name}`, sql: s.text,
      inputs: s.query?.refs ?? [], notes: ["Custom SQL, kept as written."] };
    const rowsIn = [];
    for (const r of base.inputs) rowsIn.push({ name: r, rows: await count(query, ident(r)) });
    if (kind === "drop") {
      await query(s.text);
      return { record: record({ ...base, inputs: [s.name] }) };
    }
    const pr = await probes(query, s.query);
    if (kind === "query") {
      const result = await materialize(query, s.query.text, s.query.ordered);
      return { record: record({ ...base, rowsIn, columns: result.columns, rowsOut: result.rows, order: result.order, notes: [...base.notes, ...pr.notes], conversions: pr.conversions, aggregates: pr.aggregates, joins: pr.joins }), result };
    }
    await query(s.text);
    const columns = await describe(query, ident(s.name));
    const rows = await count(query, ident(s.name));
    const order = s.query.ordered ? "the query's own ORDER BY" : Algebra.orderText(Algebra.defaultOrder(columns));
    return { record: record({ ...base, rowsIn, columns, rowsOut: rows, order, notes: [...base.notes, ...pr.notes, `A ${kind} named ${s.name}; it is shown in ${order}.`], conversions: pr.conversions, aggregates: pr.aggregates, joins: pr.joins }), columns, rows };
  }

  /** The hidden row column of a new table: __row, or __row_1, __row_2, … when the name is taken. */
  function rowColumnFor(names) {
    const lower = names.map((n) => String(n).toLowerCase());
    let name = "__row";
    for (let i = 1; lower.includes(name); i += 1) name = `__row_${i}`;
    return name;
  }

  /**
   * The statement that makes a selected result a table to analyse, and its row column. A result that carries its
   * import's __row with every value present and distinct keeps it, so each row stays traceable to its source line;
   * any other is numbered 1, 2, … in its order (the query's ORDER BY, else its row columns, else every column).
   * @param {Query} query @param {string} name @param {string} text @param {boolean} ordered
   */
  async function analysable(query, name, text, ordered) {
    const columns = await describe(query, `SELECT * FROM (${text})`);
    if (columns.some((c) => c.name === "__row")) {
      const u = await one(query, `SELECT count(*)::DOUBLE AS n, count(DISTINCT "__row")::DOUBLE AS d FROM (${text})`);
      if (u.n === u.d) return { sql: `CREATE TABLE ${ident(name)} AS SELECT * FROM (${text}) ORDER BY "__row"`, rowColumn: "__row", how: "the source rows' positions (__row), kept from the import" };
    }
    const rc = rowColumnFor(columns.map((c) => c.name));
    const over = ordered ? "OVER ()" : `OVER (${fullOrder(Algebra.defaultOrder(columns), columns)})`;
    return { sql: `CREATE TABLE ${ident(name)} AS SELECT row_number() ${over} AS ${ident(rc)}, * FROM (${text})`, rowColumn: rc,
      how: `each row's place in the result (${rc}), in ${ordered ? "the query's own order" : Algebra.orderText(Algebra.defaultOrder(columns))}` };
  }

  return { RESULT, POS, EXAMPLES, PREVIEW, describe, joinDiagnostics, conversionCounts, aggregateCounts, runPipeline, runStatement, materialize, preview, analysable, rowColumnFor };
});
