// SQL and table algebra against the pinned engine (tests/engine.mjs): one fixture per operation of spec.md
// section 4 (tests/fixtures/sql/cases.json), each run through the visual controls (src/algebra.js) and, where it
// has one, as SQL through the statement whitelist (src/sqlcheck.js), both by the page's own runner
// (src/transform.js). The two fixture tables hold missing values and duplicate keys: orders has a missing customer,
// a missing city, an amount with a thousands separator and one that is not a number; customers repeats c2 and has a
// missing key. Then: the records' join diagnostics, conversion counts and COUNT(*) beside COUNT(column); the
// controls' SQL run again as SQL; derived views and tables made, read and dropped; and a selected result made a
// table to analyse.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Transform = require("../src/transform.js");
/** @type {any} */ const Check = require("../src/sqlcheck.js");

const fixture = (/** @type {string} */ name) => readFileSync(new URL(`fixtures/sql/${name}`, import.meta.url));
/** @type {any[]} */ const cases = JSON.parse(fixture("cases.json").toString("utf8"));
const e = await engine();
const IMPORTED = ["orders", "customers"];
let files = 0;
for (const t of IMPORTED) await Profile.importFile(e.query, { kind: "csv", path: e.register(`${t}.csv`, fixture(`${t}.csv`)), table: t, n: ++files });
/** @type {Record<string, any>} */ const tables = {};
for (const t of IMPORTED) tables[t] = { columns: await Transform.describe(e.query, `"${t}"`) };
/** @type {Record<string, "view" | "table">} */ const derived = {};
const catalog = (/** @type {string} */ source) => ({ tables, names: [...IMPORTED, ...Object.keys(derived)], readings: source === "orders" ? { amount: { kind: "integer-sep" } } : {} });

/** Run the controls of a case; returns the run and its result's rows as text. */
async function controls(/** @type {any} */ pipeline) {
  const run = await Transform.runPipeline(e.query, pipeline, catalog(pipeline.source));
  assert.equal(run.error, "", `the pipeline runs: ${run.error}`);
  return { run, columns: run.result.columns.map((/** @type {any} */ c) => c.name), rows: await Transform.preview(e.query, run.result.columns) };
}

/** Check and run SQL; returns its statement results and the last result's rows as text. */
async function sql(/** @type {string} */ text) {
  const checked = Check.check(text, { imported: IMPORTED, derived });
  assert.ok(checked.ok, `the whitelist accepts ${text}: ${checked.error}`);
  const out = [];
  for (const s of checked.statements) {
    const r = await Transform.runStatement(e.query, s);
    if (s.kind === "create-view" || s.kind === "create-table") { derived[s.name] = s.kind === "create-view" ? "view" : "table"; tables[s.name] = { columns: r.columns }; }
    if (s.kind === "drop") { delete derived[s.name]; delete tables[s.name]; }
    out.push(r);
  }
  const last = out[out.length - 1];
  return { out, last, columns: last.result?.columns.map((/** @type {any} */ c) => c.name), rows: last.result ? await Transform.preview(e.query, last.result.columns) : null };
}

for (const c of cases) {
  test(`fixture ${c.id}: ${c.operation}`, async () => {
    if (c.pipeline) {
      const r = await controls(c.pipeline);
      assert.deepEqual({ columns: r.columns, rows: r.rows }, c.expect.controls, "the visual controls give the fixture's rows, in their explicit order");
      // The controls' SQL is the SQL that makes the result: run as SQL, it passes the whitelist and gives the same rows.
      const again = await sql(r.run.sql);
      assert.deepEqual({ columns: again.columns, rows: again.rows }, c.expect.controls, `the controls' SQL gives the same rows:\n${r.run.sql}`);
    }
    if (c.sql && !c.error) {
      const r = await sql(c.sql);
      assert.deepEqual({ columns: r.columns, rows: r.rows }, c.expect.sql, "the SQL gives the fixture's rows");
    }
    if (c.error) {
      const checked = Check.check(c.sql, { imported: IMPORTED, derived });
      assert.ok(checked.ok, "the statement is whitelisted");
      await assert.rejects(Transform.runStatement(e.query, checked.statements[0]), new RegExp(c.error), "CAST fails the query when a value does not convert");
    }
  });
}

test("one fixture per operation of spec.md section 4, each with missing values or duplicate keys in its input", () => {
  const ops = cases.map((c) => c.id);
  for (const op of ["select", "filter", "sort", "limit", "distinct", "expression", "case", "cast", "cast-fails", "coalesce", "group", "having", "join-inner", "join-left", "join-right",
    "join-full", "join-cross", "join-semi", "join-anti", "subquery", "cte", "recursive", "union", "union-all", "intersect", "except", "window-rank", "rolling", "lag", "date", "string",
    "numeric", "statistics", "pivot", "unpivot"]) assert.ok(ops.includes(op), `a fixture for ${op}`);
  const orders = fixture("orders.csv").toString("utf8"), customers = fixture("customers.csv").toString("utf8");
  assert.match(orders, /\n4,,Pune/, "orders has a missing customer");
  assert.equal(customers.split("\n").filter((l) => l.startsWith("c2,")).length, 2, "customers repeats the key c2");
  assert.match(customers, /\n,Nobody/, "customers has a missing key");
});

test("a join's record: unmatched keys of each side with examples, duplicate keys, and the multiplication factor flagged above 1", async () => {
  const r = await controls({ source: "orders", steps: [{ op: "join", table: "customers", kind: "left", keys: [{ left: "customer", right: "customer" }] }] });
  const j = r.run.steps[0].record.joins[0];
  // orders: c1, c2, c2, (missing), c9, c1; customers: c1, c2, c2, c3, (missing).
  assert.deepEqual([j.leftRows, j.rightRows, j.leftMissingKeys, j.rightMissingKeys], [6, 5, 1, 1]);
  assert.deepEqual([j.leftKeys, j.leftDuplicateKeys, j.leftDuplicateRows, j.rightKeys, j.rightDuplicateKeys, j.rightDuplicateRows], [3, 2, 4, 3, 1, 2]);
  assert.deepEqual([j.matchedKeys, j.matchedLeftRows, j.matchedRightRows, j.pairs], [2, 4, 3, 6]);
  assert.deepEqual(j.unmatchedLeft, { keys: 1, rows: 1, examples: [{ key: ["c9"], rows: 1 }] }, "c9 has no customer; the missing key is counted apart");
  assert.deepEqual(j.unmatchedRight, { keys: 1, rows: 1, examples: [{ key: ["c3"], rows: 1 }] });
  assert.equal(j.factor, 1.5, "6 pairs from 4 matched orders: the two c2 orders are each repeated");
  assert.equal(j.flagged, true);
  assert.equal(j.rowsOut, 8, "a left join: the 6 pairs and the 2 orders with no match");
  assert.equal(r.run.steps[0].record.rowsOut, 8, "the engine's rows agree with the diagnostics");
  const inner = await controls({ source: "orders", steps: [{ op: "join", table: "customers", kind: "inner", nullsMatch: true, keys: [{ left: "customer", right: "customer" }] }] });
  const k = inner.run.steps[0].record.joins[0];
  assert.deepEqual([k.matchedKeys, k.pairs, k.unmatchedLeft.keys, k.rowsOut], [3, 7, 1, 7], "with IS NOT DISTINCT FROM the missing keys match each other");
  const semi = (await controls({ source: "orders", steps: [{ op: "join", table: "customers", kind: "semi", keys: [{ left: "customer", right: "customer" }] }] })).run.steps[0].record.joins[0];
  assert.deepEqual([semi.rowsOut, semi.factor, semi.flagged], [4, 1, false], "a semi join never repeats a row");
});

test("SQL joins get the same diagnostics, and a join the readings cannot follow says why", async () => {
  const r = await sql("SELECT o.order_id, c.name FROM orders AS o LEFT JOIN customers AS c ON o.customer = c.customer");
  const j = r.last.record.joins[0];
  assert.deepEqual([j.computed, j.left, j.right, j.pairs, j.factor, j.rowsOut], [true, "orders", "customers", 6, 1.5, 8]);
  assert.equal(r.last.record.rowsOut, 8);
  const using = (await sql("WITH c2 AS (SELECT * FROM customers) SELECT * FROM orders JOIN c2 USING (customer)")).last.record.joins[0];
  assert.deepEqual([using.computed, using.right, using.pairs], [true, "c2", 6], "USING and a WITH name as a side");
  const odd = (await sql("SELECT * FROM orders o JOIN customers c ON o.customer < c.customer")).last.record.joins[0];
  assert.equal(odd.computed, false);
  assert.match(odd.why, /not key equalities/);
});

test("records count TRY_CAST failures with examples, and COUNT(*) beside COUNT(column)", async () => {
  const cast = await controls({ source: "orders", steps: [{ op: "compute", name: "amount", kind: "convert", column: "amount", type: "BIGINT" }] });
  assert.deepEqual(cast.run.steps[0].record.conversions, [{ column: "amount", table: null, to: "BIGINT", failures: 2, of: 6, examples: ["1,200", "abc"] }]);
  const reading = await controls({ source: "orders", steps: [{ op: "readings", columns: ["amount"] }] });
  assert.deepEqual(reading.run.steps[0].record.conversions.map((/** @type {any} */ c) => [c.failures, c.examples]), [[1, ["abc"]]], "the workbench's reading reads 1,200 and leaves abc");
  const group = await controls({ source: "orders", steps: [{ op: "readings", columns: ["amount"] }, { op: "aggregate", by: ["city"], measures: [{ fn: "mean", column: "amount" }] }] });
  assert.deepEqual(group.run.steps[1].record.aggregates, [{ column: "amount", rows: 6, values: 4, skipped: 2 }], "the mean skips the missing amount and the one that did not read");
  const custom = await sql("SELECT city, sum(TRY_CAST(amount AS DOUBLE)) AS s, count(amount) AS n FROM orders WHERE city IS NOT NULL GROUP BY city");
  assert.deepEqual(custom.last.record.conversions.map((/** @type {any} */ c) => [c.failures, c.of, c.examples]), [[2, 6, ["1,200", "abc"]]], "custom SQL: counted over the rows the query reads");
  assert.deepEqual(custom.last.record.aggregates.map((/** @type {any} */ a) => [a.column, a.rows, a.values]), [["amount", 5, 4]], "COUNT(*) beside COUNT(amount) after WHERE");
});

test("every result has an explicit order: the query's ORDER BY, else the row column, else every column", async () => {
  assert.equal((await sql("SELECT city, order_id FROM orders ORDER BY city")).last.record.order, "the query's own ORDER BY");
  const byRow = await sql("SELECT __row, city FROM orders WHERE order_id <> '1'");
  assert.equal(byRow.last.record.order, "__row");
  assert.deepEqual(byRow.rows.map((/** @type {any} */ r) => r[0]), ["2", "3", "4", "5", "6"]);
  const all = await sql("SELECT city, customer FROM orders");
  assert.match(all.last.record.order, /^every column/);
  assert.deepEqual(all.rows, [["Lima", "c2"], ["Lima", "c2"], ["Oslo", "c1"], ["Oslo", "c9"], ["Pune", null], [null, "c1"]], "ordered by city, then customer, missing values last");
});

test("derived views and tables: made, read like any table, refused over an import, and dropped", async () => {
  const made = await sql("CREATE VIEW lima AS SELECT * FROM orders WHERE city = 'Lima'; CREATE TABLE totals AS SELECT city, count(*) AS n FROM orders GROUP BY city");
  assert.deepEqual(made.out.map((/** @type {any} */ x) => [x.record.kind, x.rows]), [["view", 2], ["table", 4]]);
  assert.deepEqual(made.out[0].record.inputs, ["orders"]);
  assert.deepEqual((await sql("SELECT order_id FROM lima JOIN totals USING (city)")).rows, [["2"], ["3"]], "a query reads derived objects by name");
  assert.match(Check.check("CREATE TABLE lima AS SELECT 1", { imported: IMPORTED, derived }).error, /derived view named lima|drop it first/);
  assert.match(Check.check("DROP TABLE orders", { imported: IMPORTED, derived }).error, /read-only/);
  assert.match(Check.check("DROP TABLE lima", { imported: IMPORTED, derived }).error, /DROP VIEW lima/);
  const dynamic = Check.check("CREATE VIEW p AS PIVOT orders ON city USING count(*)", { imported: IMPORTED, derived });
  assert.ok(dynamic.ok, "the whitelist allows it…");
  await assert.rejects(Transform.runStatement(e.query, dynamic.statements[0]), /cannot be used in views/, "…and the engine refuses a pivot whose columns come from the data in a view; the controls list the values");
  await sql("DROP VIEW lima; DROP TABLE totals");
  assert.deepEqual(derived, {});
  assert.match(Check.check("SELECT * FROM lima", { imported: IMPORTED, derived }).error, /not a table of the workbench/);
});

test("a selected result becomes a table to analyse: its source rows when __row stays distinct, else its place in the result", async () => {
  const kept = await Transform.analysable(e.query, "oslo", "SELECT * FROM orders WHERE city = 'Oslo'", false);
  assert.equal(kept.rowColumn, "__row");
  await e.query(kept.sql);
  assert.deepEqual(await e.query('SELECT "__row"::DOUBLE AS r FROM oslo ORDER BY 1'), [{ r: 1 }, { r: 5 }], "rows stay traceable to their source lines");
  const joined = await Transform.analysable(e.query, "pairs", "SELECT o.__row, c.name FROM orders o JOIN customers c ON o.customer = c.customer ORDER BY c.name DESC", true);
  assert.equal(joined.rowColumn, "__row_1", "__row repeats after the join, so a new row column numbers the result");
  await e.query(joined.sql);
  assert.deepEqual((await e.query('SELECT name FROM pairs ORDER BY "__row_1"')).map((/** @type {any} */ r) => r.name), ["Bo B", "Bo B", "Bo", "Bo", "Ann", "Ann"], "in the query's own order");
  const profile = await Profile.profileTable(e.query, { table: "pairs", rowColumn: "__row_1", columns: (await Transform.describe(e.query, '"pairs"')).map((/** @type {any} */ c) => ({ name: c.name, type: c.type })) });
  assert.deepEqual(profile.columns.map((/** @type {any} */ c) => c.name), ["__row", "name"], "the result is profiled like an import");
  await e.query("DROP TABLE oslo; DROP TABLE pairs");
});
