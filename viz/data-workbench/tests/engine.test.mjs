// The workbench's import and profile against the pinned engine: the same DuckDB release, engine file, Parquet
// extension and lockdown as the page (tests/engine.mjs), running the page's own SQL and pipeline (src/profile.js).
// Data integrity, identifiers against measures, approval of corrections, Parquet types, the lockdown, a seeded
// sample, the memory limit, and a first import benchmark.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Sql = require("../src/sql.js");
/** @type {any} */ const Engine = require("../src/engine.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const Preflight = require("../src/preflight.js");

const folder = new URL("../", import.meta.url);
const bytesOf = (/** @type {string} */ path) => readFileSync(new URL(path, folder));
const encode = (/** @type {string} */ text) => new TextEncoder().encode(text);

const e = await engine();
let files = 0;

/** Import bytes as a table and profile it, as the page does. @param {string} name @param {Uint8Array} bytes */
async function load(name, bytes, kind = "csv", extra = {}) {
  const path = e.register(`${name}.${kind}`, bytes);
  const imported = await Profile.importFile(e.query, { kind, path, table: name, n: ++files, ...extra });
  const profile = await Profile.profileTable(e.query, { table: name, rowColumn: imported.rowColumn, columns: imported.columns });
  const col = (/** @type {string} */ c) => profile.columns.find((/** @type {any} */ x) => x.name === c);
  return { path, imported, profile, col };
}

const messy = await load("messy", bytesOf("examples/messy.csv"));

test("lockdown: no URL, no extension, no file outside the registered ones, no setting change", async () => {
  const refused = async (/** @type {string} */ sql, /** @type {RegExp} */ why) => assert.rejects(e.query(sql), why, sql);
  await refused("SELECT * FROM read_csv('https://example.com/x.csv')", /disabled by configuration/);
  await refused("SELECT * FROM read_parquet('http://127.0.0.1:9/x.parquet')", /disabled by configuration/);
  await refused("LOAD json", /disabled through configuration/);
  await refused("SELECT * FROM read_csv('/etc/hosts')", /disabled by configuration/);
  await refused("SET enable_external_access = true", /locked/);
  await refused("SET autoload_known_extensions = true", /locked/);
  assert.deepEqual(await e.query("SELECT count(*)::DOUBLE AS n FROM read_csv('" + messy.path + "', all_varchar = true, ignore_errors = true)"), [{ n: 28 }], "registered files still read");
});

test("data integrity: the CSV dialect, a byte-order mark and a quoted line break are read; rows the reader cannot read are listed", () => {
  const { imported } = messy;
  assert.deepEqual(imported.dialect, { delimiter: ",", quote: "\"", escape: "(empty)", newline_delimiter: "\\n", skip_rows: 0, has_header: true });
  assert.equal(imported.columns[1].name, "id", "the byte-order mark is not part of the first name");
  assert.equal(imported.rows, 28);
  assert.equal(imported.rejected.count, 2);
  assert.deepEqual(imported.rejected.examples.map((/** @type {any} */ r) => [r.line, r.error_type, r.csv_line]), [
    [19, "MISSING COLUMNS", "00034,Ray Low"],
    [20, "TOO MANY COLUMNS", "00035,Sue Pan,\"8,080\",20,2026-01-22,30/01/2026,06/08/2026,23/01/2026,ok,30.1,no,3,27,extra"],
  ]);
});

test("the reader's tables of rejected lines are read into the import's result and dropped", async () => {
  assert.deepEqual(await e.query("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '%rejects%' OR table_name LIKE '%scans%'"), []);
});

test("data integrity: source values are kept as written; conversions read them without changing the table", async () => {
  const row = (await e.query(`SELECT id, amount, note, visits, temp FROM messy WHERE __row = 1`))[0];
  assert.deepEqual(row, { id: "00017", amount: "1,234", note: "first line\nsecond line", visits: "8", temp: "21.5" });
  const amount = messy.col("amount");
  assert.deepEqual([amount.type, amount.reading.kind, amount.share], ["integer", "integer-sep", 1]);
  assert.equal(amount.summary.max, 12500, "1,234 and 12,500 read as numbers");
  assert.deepEqual((await e.query(`SELECT amount FROM messy WHERE __row = 2`))[0], { amount: "12,500" }, "the table still holds the text");
});

test("data integrity: parse failures, impossible dates, markers and sentinels are reported, never removed or filled", () => {
  const junk = messy.col("junk");
  assert.equal(junk.type, "integer");
  assert.equal(junk.failures.count, 1);
  assert.deepEqual(junk.failures.examples.map((/** @type {any} */ f) => [f.value, f.n, f.first_row]), [["abc", 1, 7]]);
  assert.deepEqual(junk.errors.map((/** @type {any} */ x) => x.kind), ["parse"]);
  const when = messy.col("when");
  assert.equal(when.type, "date");
  assert.deepEqual(when.errors.map((/** @type {any} */ x) => [x.kind, x.examples]), [["impossible-date", ["2026-02-30"]]]);
  const visits = messy.col("visits");
  assert.equal(visits.missing.markers, 2);
  assert.deepEqual(visits.missing.markerValues, [{ value: "NA", n: 2 }]);
  assert.equal(visits.failures.count, 0, "a marker is not a parse failure");
  assert.deepEqual(visits.suggestions.map((/** @type {any} */ s) => s.id), ["visits::markers"]);
  const temp = messy.col("temp");
  assert.deepEqual(temp.sentinels, [{ value: -999, n: 2 }]);
  assert.equal(temp.summary.min, -999, "the sentinel stays in the data until approval");
  assert.deepEqual(temp.errors.map((/** @type {any} */ x) => x.kind), ["sentinel"]);
});

test("data integrity: date layouts read on their own when one fits, and wait for approval when two fit or two are mixed", () => {
  const dmy = messy.col("dmy");
  assert.deepEqual([dmy.type, dmy.reading.kind, dmy.reading.format], ["date", "date-format", "dmy-slash"]);
  assert.equal(dmy.summary.min, "2026-01-13");
  const amb = messy.col("amb");
  assert.deepEqual([amb.type, amb.role], ["text", "unknown"]);
  assert.deepEqual(amb.suggestions.map((/** @type {any} */ s) => s.id), ["amb::layout::dmy-slash", "amb::layout::mdy-slash"]);
  const mixed = messy.col("mixed");
  assert.deepEqual(mixed.suggestions.map((/** @type {any} */ s) => s.id), ["mixed::layouts::dmy-slash"]);
});

test("impossible dates are counted in full, however many distinct ones there are", async () => {
  const lines = ["day"];
  for (let i = 0; i < 300; i++) lines.push(`2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`);
  for (let y = 2001; y <= 2015; y++) lines.push(`${y}-02-30`);
  const t = await load("days", encode(lines.join("\n")));
  assert.deepEqual(t.col("day").errors.map((/** @type {any} */ x) => [x.kind, x.count]), [["impossible-date", 15]]);
  assert.equal(t.col("day").errors[0].examples.length, 10, "the ten most frequent are shown");
});

test("identifiers against measures: names, leading zeros and dense unique runs make identifiers; storage type alone does not", async () => {
  const lines = ["customer_id,zip,row,code,population,price,year,rating,score"];
  for (let i = 0; i < 40; i++) {
    lines.push([5000 + i * 37, String(1000 + i * 13).padStart(6, "0"), i + 1, `K${String(i * 7919 % 99991).padStart(5, "0")}X`, 1000 + ((i * 7919) ** 2 % 9999991),
      (9.99 + i * 1.37).toFixed(2), 1980 + i, (i % 5) + 1, (i * 37 % 41) / 4].join(","));
  }
  const t = await load("ids", encode(lines.join("\n")));
  const roles = Object.fromEntries(t.profile.columns.map((/** @type {any} */ c) => [c.name, c.role]));
  assert.deepEqual(roles, { customer_id: "identifier", zip: "identifier", row: "identifier", code: "identifier", population: "measure", price: "measure", year: "measure", rating: "ordered category", score: "measure" });
  assert.equal(t.col("year").possibleTime, true);
  assert.deepEqual(t.col("year").suggestions.map((/** @type {any} */ s) => s.id), ["year::year"]);
  assert.equal(t.col("zip").type, "integer", "the type says integer; the role says identifier");
  assert.equal(t.col("customer_id").unusual, null, "identifiers get no unusual-value check");
  assert.equal(t.col("customer_id").identifier.repeats, 0);
});

test("approval: an approved correction changes the reading and is counted; the source table is unchanged", async () => {
  const base = { table: "messy", rowColumn: messy.imported.rowColumn };
  const column = (/** @type {string} */ name) => messy.imported.columns.find((/** @type {any} */ c) => c.name === name);
  const approve = async (/** @type {string} */ name, /** @type {string} */ id) => {
    const s = messy.col(name).suggestions.find((/** @type {any} */ x) => x.id === id);
    return Profile.profileColumn(e.query, { ...base, column: column(name), override: s.change });
  };
  const temp = await approve("temp", "temp::sentinel::-999");
  assert.equal(temp.madeMissing, 2);
  assert.ok(temp.summary.min > 0, "-999 no longer counts as a temperature");
  assert.deepEqual(temp.errors, []);
  assert.deepEqual(temp.overridden, ["reading"]);
  const amb = await approve("amb", "amb::layout::mdy-slash");
  assert.deepEqual([amb.type, amb.role, amb.failures.count, amb.summary.min], ["date", "time", 0, "2026-01-02"]);
  const mixed = await approve("mixed", "mixed::layouts::dmy-slash");
  assert.deepEqual([mixed.type, mixed.failures.count], ["date", 0]);
  const role = await Profile.profileColumn(e.query, { ...base, column: column("score"), override: { role: "measure" } });
  assert.deepEqual([role.role, role.inferredRole, role.certainty], ["measure", "ordered category", "set by you"]);
  assert.deepEqual((await e.query(`SELECT temp FROM messy WHERE __row = 2`))[0], { temp: "-999" });
});

test("Parquet: types, decimals and zoned timestamps are kept; nested columns are excluded with a reason", async () => {
  const open = await engine({ locked: false });
  const dir = mkdtempSync(join(tmpdir(), "dw-parquet-"));
  try {
    const file = join(dir, "typed.parquet");
    await open.query(`COPY (SELECT i AS id, (i * 1.25)::DECIMAL(10,2) AS amount, to_timestamp(1767225600 + i * 3600) AS seen,
      {'a': i, 'b': 'x'} AS nested, [i, i + 1] AS list, CAST(i * 3 AS VARCHAR) AS text_number, 'same' AS constant,
      make_time(8, i, 0) AS clock
      FROM range(1, 31) t(i)) TO '${file}' (FORMAT parquet)`);
    const t = await load("typed", readFileSync(file), "parquet");
    assert.equal(t.imported.rows, 30);
    assert.equal(t.imported.dialect, null);
    const by = Object.fromEntries(t.profile.columns.map((/** @type {any} */ c) => [c.name, [c.sourceType, c.type, c.role]]));
    assert.deepEqual(by, {
      id: ["BIGINT", "integer", "identifier"],
      amount: ["DECIMAL(10,2)", "decimal", "measure"],
      seen: ["TIMESTAMP WITH TIME ZONE", "datetime", "time"],
      nested: ["STRUCT(a BIGINT, b VARCHAR)", "unsupported", "unknown"],
      list: ["BIGINT[]", "unsupported", "unknown"],
      text_number: ["VARCHAR", "integer", "measure"],
      constant: ["VARCHAR", "categorical", "unknown"],
      clock: ["TIME", "time", "time"],
    });
    assert.deepEqual([t.col("clock").summary.min, t.col("clock").summary.max, t.col("clock").summary.span_days], ["08:01:00", "08:30:00", null], "a time of day has no span in days");
    assert.equal(t.imported.columns.find((/** @type {any} */ c) => c.name === "amount").source, "INT64 (DECIMAL)", "the physical type and its annotation");
    assert.equal(t.col("seen").summary.min, "2026-01-01 01:00:00+00", "zoned times are ordered and shown in UTC");
    assert.match(t.col("nested").roleReasons[0], /nested or binary/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a seeded sample keeps the same rows in source order every time, and says how many", async () => {
  const text = Examples.planted();
  const a = await load("sample_a", encode(text), "csv", { sample: { rows: 300, seed: 7 } });
  await load("sample_b", encode(text), "csv", { sample: { rows: 300, seed: 7 } });
  assert.equal(a.imported.rows, 300);
  const ids = async (/** @type {string} */ t) => (await e.query(`SELECT order_id, __row FROM ${t} ORDER BY __row`)).map((r) => `${r.__row}:${r.order_id}`);
  const first = await ids("sample_a");
  assert.deepEqual(await ids("sample_b"), first);
  assert.ok(first.every((/** @type {string} */ v) => Number(v.split(":")[0]) === Number(v.split(":")[1])), "each row keeps its source position");
  const c = await load("sample_c", encode(text), "csv", { columns: ["order_id", "sales"] });
  assert.deepEqual(c.imported.columns.map((/** @type {any} */ x) => x.name), ["__row", "order_id", "sales"]);
});

test("memory estimate: what the engine holds for an imported CSV and Parquet file stays within the preflight estimate", async () => {
  const text = Examples.planted(3, 100000);
  const open = await engine({ locked: false });
  const dir = mkdtempSync(join(tmpdir(), "dw-memory-"));
  try {
    const csvPath = join(dir, "m.csv"), parquetPath = join(dir, "m.parquet");
    writeFileSync(csvPath, text);
    await open.query(`COPY (SELECT * FROM read_csv('${csvPath}')) TO '${parquetPath}' (FORMAT parquet)`);
    const held = async (/** @type {string} */ kind, /** @type {Uint8Array} */ bytes) => {
      const fresh = await engine();
      const path = fresh.register(`m.${kind}`, bytes);
      const imported = await Profile.importFile(fresh.query, { kind, path, table: "m", n: 1 });
      const size = kind === "parquet" ? (await fresh.query(Sql.parquetSize(path)))[0].uncompressed : bytes.length;
      const estimate = Preflight.estimate(kind, size, imported.rows, imported.columns.length - 1);
      const memory = (await fresh.query("SELECT sum(memory_usage_bytes)::DOUBLE AS m FROM duckdb_memory()"))[0].m;
      return { estimate, memory };
    };
    for (const [kind, bytes] of [["csv", encode(text)], ["parquet", readFileSync(parquetPath)]]) {
      const { estimate, memory } = await held(kind, /** @type {Uint8Array} */ (bytes));
      assert.ok(memory <= estimate, `${kind}: the engine holds ${memory} bytes, more than the estimate ${estimate}`);
      assert.ok(estimate <= 3 * memory, `${kind}: the estimate ${estimate} is over 3 times the ${memory} bytes held`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resource limit: a query beyond the engine's memory limit fails with an out-of-memory error, never a silent cut", async () => {
  const small = await engine({ memoryLimitBytes: 64 * 2 ** 20 });
  const error = await small.query("CREATE TABLE big AS SELECT i, repeat('x', 200) || i AS s FROM range(2000000) t(i)").then(() => null, (err) => err);
  assert.ok(error, "the import does not succeed");
  assert.ok(Engine.outOfMemory(error), String(error?.message).slice(0, 200));
  assert.rejects(small.query("SELECT count(*) FROM big"), /does not exist/, "no partial table is left");
});

test("benchmark: import and profile a generated CSV, timed", async () => {
  const rows = Number(process.env.DW_BENCH_ROWS ?? 100000);
  const lines = ["id,region,day,amount,score,flag,note"];
  const u = Examples.random(1);
  for (let i = 0; i < rows; i++) {
    lines.push([i + 1, ["North", "South", "East", "West"][i % 4], `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      (u() * 1000).toFixed(2), Math.round(u() * 100), u() < 0.5 ? "yes" : "no", `n${Math.floor(u() * 1e6)}`].join(","));
  }
  const bytes = encode(lines.join("\n"));
  const start = performance.now();
  const t = await load("bench", bytes);
  const ms = performance.now() - start;
  assert.equal(t.imported.rows, rows);
  assert.equal(t.profile.columns.length, 7);
  console.log(`benchmark: ${rows} rows x 7 columns (${(bytes.length / 2 ** 20).toFixed(1)} MiB CSV) imported and profiled in ${(ms / 1000).toFixed(2)} s on Node ${process.version}, ${process.platform} ${process.arch}`);
  assert.ok(ms < 120000, "within the 2-minute target");
});

test("plain rows: 64-bit integers become numbers, or text beyond 2^53", () => {
  assert.equal(Engine.plain(12n), 12);
  assert.equal(Engine.plain(2n ** 60n), "1152921504606846976");
  assert.equal(Engine.plain(null), null);
  assert.equal(Sql.ident('a"b'), '"a""b"');
  assert.equal(Sql.literal("it's"), "'it''s'");
});
