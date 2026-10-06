// Step 7, speed: the typed copy of a table's measures and categories (Charts.stagePlan) that the charts and the
// statistics read. Against the pinned engine, every candidate drawn from the copy is the same figure, byte for byte,
// with the same outcome and reason, as drawn from the table, and the statistics give the same results: on the
// planted example, on the messy CSV with every suggested correction approved (markers and stand-ins made missing,
// date layouts), and on the 50-column benchmark table. Then the benchmark itself: import, profile and every
// candidate of the 50-column table, timed (DW_BENCH_ROWS rows, 10,000 by default; 1,000,000 for the spec's target).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { engine } from "./engine.mjs";
import { writeCsv } from "../tools/bench_data.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Family = require("../src/family.js");
/** @type {any} */ const Grammar = require("../src/grammar.js");

const e = await engine();
let files = 0;
const dir = mkdtempSync(join(tmpdir(), "dw-speed-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

/** Import and profile CSV bytes as the page does, with corrections approved; then the chart context. */
async function load(name, bytes, approveAll = false) {
  const path = e.register(`${name}.csv`, bytes);
  const imported = await Profile.importFile(e.query, { kind: "csv", path, table: name, n: ++files });
  let profile = await Profile.profileTable(e.query, { table: name, rowColumn: imported.rowColumn, columns: imported.columns });
  if (approveAll) {
    /** @type {Record<string, any>} */
    const overrides = {};
    for (const c of profile.columns) for (const s of c.suggestions ?? []) overrides[c.name] = { ...(overrides[c.name] ?? {}), ...s.change };
    assert.ok(Object.keys(overrides).length >= 3, "the messy CSV has corrections to approve");
    profile = await Profile.profileTable(e.query, { table: name, rowColumn: imported.rowColumn, columns: imported.columns, overrides });
  }
  return { imported, profile, ...Charts.prepare({ name, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns: profile.columns }) };
}

/** The same context with its typed copy made. */
async function staged(t) {
  const plan = Charts.stagePlan(t.ctx, `__dw_stage_${t.ctx.table}`);
  assert.ok(plan, "the table has measures or categories");
  await e.query(plan.sql);
  return { ...t.ctx, stage: plan.stage };
}

/** Every candidate's outcome, reason and SVG; of a large plan, every single-field candidate and every seventh other. */
async function draw(t, ctx) {
  const out = [];
  const some = t.plan.candidates.length > 400;
  for (const [i, c] of t.plan.candidates.entries()) {
    if (some && c.fields.length > 1 && i % 7) continue;
    const r = await Charts.evaluate(e.query, ChartSpec.make(c, t.ctx), ctx);
    out.push({ id: c.id, outcome: r.outcome, reason: r.reason, svg: r.drawn?.svg ?? null });
  }
  return out;
}

/** What the statistics found: every member's test, p-values and effect. */
async function stats(t, ctx) {
  const fam = await Family.run(e.query, { table: t.ctx.table, name: t.ctx.table, run: 1, ctx, classes: t.classes, columns: t.profile.columns });
  return JSON.stringify({ members: fam.members, measures: fam.measures, independence: fam.independence, m: fam.m });
}

async function same(name, bytes, approveAll = false) {
  const t = await load(name, bytes, approveAll);
  const ctx = await staged(t);
  const [plain, copy] = [await draw(t, t.ctx), await draw(t, ctx)];
  for (const [i, a] of plain.entries()) assert.deepEqual(copy[i], a, `${a.id}: the same outcome, reason and figure from the typed copy`);
  assert.equal(await stats(t, ctx), await stats(t, t.ctx), "the same statistics from the typed copy");
  return { t, plain };
}

test("the typed copy gives the same figures and statistics: the planted example", async () => {
  const { plain } = await same("planted", new TextEncoder().encode(Examples.planted()));
  assert.equal(plain.filter((c) => c.outcome === "valid").length, 155);
});

test("the typed copy gives the same figures and statistics: the messy CSV with every correction approved", async () => {
  const { t } = await same("messy", readFileSync(new URL("../examples/messy.csv", import.meta.url)), true);
  assert.ok(Object.values(t.ctx.fields).some((/** @type {any} */ f) => (f.reading.missingNumbers ?? []).length || (f.reading.missingText ?? []).length), "approved missing values are read through the copy");
});

test("the typed copy gives the same figures and statistics: 1,000 rows of the 50-column benchmark table, every kind of chart", async () => {
  const file = join(dir, "bench1k.csv");
  await writeCsv(file, 1000);
  const { t } = await same("bench1k", readFileSync(file));
  assert.deepEqual(t.plan.counts, { q: 20, c: 26, t: 2, l: 1 });
  assert.equal(t.plan.total, 1908);
});

test("the typed copy holds only measures and categories as typed values, and its estimate covers what the engine holds", async () => {
  const file = join(dir, "bench20k.csv");
  await writeCsv(file, 20000);
  const t = await load("bench20k", readFileSync(file));
  const before = (await e.query("SELECT sum(memory_usage_bytes)::DOUBLE AS m FROM duckdb_memory()"))[0].m;
  const plan = Charts.stagePlan(t.ctx, "__dw_stage_bench20k");
  await e.query(plan.sql);
  const after = (await e.query("SELECT sum(memory_usage_bytes)::DOUBLE AS m FROM duckdb_memory()"))[0].m;
  assert.ok(after - before <= plan.bytes, `the copy holds ${after - before} bytes, more than its estimate of ${plan.bytes}`);
  assert.ok(plan.bytes <= 3 * (after - before), `the estimate ${plan.bytes} is over 3 times the ${after - before} bytes held`);
  const types = Object.fromEntries((await e.query("SELECT column_name AS c, data_type AS t FROM duckdb_columns() WHERE table_name = '__dw_stage_bench20k'")).map((r) => [r.c, r.t]));
  assert.equal(types.m01, "DOUBLE", "a measure is a number");
  assert.equal(types.c03, "DOUBLE", "numbers read as levels are numbers");
  assert.equal(types.c01, "VARCHAR", "text categories stay text");
  assert.equal(types.order_date, "VARCHAR", "dates keep their text, which timelines show as written");
  assert.equal(types.id, undefined, "an excluded field is not copied");
  await e.query("DROP TABLE __dw_stage_bench20k");
});

test("benchmark: import, profile and every candidate of the 50-column table, with the typed copy, timed", async () => {
  const rows = Number(process.env.DW_BENCH_ROWS ?? 10000);
  const file = join(dir, `bench-${rows}.csv`);
  const bytes = await writeCsv(file, rows);
  const begun = performance.now();
  const path = e.register(`bench_${rows}.csv`, readFileSync(file));
  const imported = await Profile.importFile(e.query, { kind: "csv", path, table: `bench_${rows}`, n: ++files });
  const read = performance.now();
  let first = null;
  const columns = [];
  const all = imported.columns.map((/** @type {any} */ c, /** @type {number} */ i) => ({ ...c, position: i })).filter((/** @type {any} */ c) => c.name !== imported.rowColumn);
  for (const c of all) columns.push(await Profile.profileColumn(e.query, { table: `bench_${rows}`, rowColumn: imported.rowColumn, column: { ...c, position: columns.length } }));
  Profile.pairRoles(columns);
  const profiled = performance.now();
  const t = { profile: { columns }, ...Charts.prepare({ name: `bench_${rows}`, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns }) };
  const ctx = await staged(t);
  const copied = performance.now();
  const outcomes = [];
  for (const c of t.plan.candidates) {
    const r = await Charts.evaluate(e.query, ChartSpec.make(c, t.ctx), ctx);
    if (r.outcome === "valid" && first === null) first = performance.now();
    outcomes.push({ outcome: r.outcome });
  }
  const charted = performance.now();
  const fam = await Family.run(e.query, { table: t.ctx.table, name: t.ctx.table, run: 1, ctx, classes: t.classes, columns });
  const done = performance.now();
  const n = Grammar.accounting(outcomes);
  assert.equal(imported.rows, rows);
  assert.equal(n.pending + n.failed + n.incomplete, 0, "every candidate has an outcome, none failed");
  assert.equal(fam.status, "complete");
  const s = (/** @type {number} */ ms) => (ms / 1000).toFixed(1);
  console.log(`benchmark: ${rows.toLocaleString("en-US")} rows x 50 columns (${(bytes / 1e6).toFixed(1)} MB CSV): read ${s(read - begun)} s, profiled ${s(profiled - read)} s, typed copy ${s(copied - profiled)} s, `
    + `${t.plan.total} candidates (${n.valid} valid) ${s(charted - copied)} s, first figure ${s(/** @type {number} */ (first) - begun)} s after the import began, statistics (${fam.m} tests) ${s(done - charted)} s; `
    + `all ${s(done - begun)} s on Node ${process.version}, ${process.platform} ${process.arch}`);
});
