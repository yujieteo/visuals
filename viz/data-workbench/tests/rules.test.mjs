// The workbench's rules without the engine: type and role inference from counts, sentinels, suggestions, the
// resource policy, table and row-column names, the Parquet schema walk, the streaming SHA-256 and the seeded
// example. Each test runs the page's own modules and asserts on what they return.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { parseDeck } from "../../../scripts/templates/beamdswitch/deck.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Infer = require("../src/infer.js");
/** @type {any} */ const Preflight = require("../src/preflight.js");
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Sha = require("../src/sha256.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const Report = require("../src/report.js");
/** @type {any} */ const Beamdswitch = require("../beamdswitch.js");
/** @type {any} */ const VisualKit = require("../../../scripts/kit/kit.js");

/** Counts of a text column with `rows` values, all present, overridden by `over`. */
const counts = (rows, over = {}) => ({
  rows, nulls: 0, blanks: 0, markers: 0, distinct_values: rows, int_plain: 0, int_sep: 0, dec_plain: 0, dec_sep: 0,
  zero_padded: 0, bool: 0, date_shape: 0, date_iso: 0, dt_naive: 0, dt_zoned: 0, time_iso: 0, uuid: 0,
  "f_dmy-slash": 0, "f_mdy-slash": 0, "f_ymd-slash": 0, "f_dmy-dash": 0, "f_mdy-dash": 0, "f_dmy-dot": 0, "f_d-mon-y": 0, "f_mon-d-y": 0,
  len_min: 1, len_max: 9, len_mean: 4, ...over,
});

test("type: the most specific reading that 95% of the values present fit, with that share as the uncertainty", () => {
  assert.equal(Infer.readText(counts(100, { int_plain: 100, dec_plain: 100 })).type, "integer");
  const ints = Infer.readText(counts(100, { int_plain: 96, dec_plain: 96 }));
  assert.equal(ints.type, "integer");
  assert.equal(ints.share, 0.96);
  assert.equal(Infer.readText(counts(100, { int_plain: 94, dec_plain: 94 })).type, "text", "94% is below the threshold");
  const sep = Infer.readText(counts(100, { int_plain: 40, int_sep: 60, dec_plain: 40, dec_sep: 60 }));
  assert.deepEqual([sep.type, sep.reading.kind], ["integer", "integer-sep"]);
  assert.equal(Infer.readText(counts(100, { int_plain: 50, dec_plain: 100 })).type, "decimal");
  assert.equal(Infer.readText(counts(10, { bool: 10, distinct_values: 2 })).type, "boolean");
  assert.equal(Infer.readText(counts(10, { date_iso: 10, date_shape: 10 })).type, "date");
  const zoned = Infer.readText(counts(10, { dt_zoned: 10 }));
  assert.deepEqual([zoned.type, zoned.reading.kind], ["datetime", "datetime-zoned"]);
  assert.equal(Infer.readText(counts(10, { dt_naive: 10 })).reading.kind, "datetime");
});

test("type: markers and blanks are missing, not failures; a column of nothing but missing values is empty", () => {
  const r = Infer.readText(counts(100, { markers: 10, int_plain: 90, dec_plain: 90 }));
  assert.equal(r.valued, 90);
  assert.equal(r.share, 1);
  assert.equal(Infer.readText(counts(5, { nulls: 3, blanks: 2 })).type, "empty");
});

test("dates: one layout reads on its own; two layouts that both fit, or two layouts mixed, wait for approval", () => {
  const one = Infer.readText(counts(30, { "f_dmy-slash": 30 }));
  assert.deepEqual([one.type, one.reading.kind, one.reading.format], ["date", "date-format", "dmy-slash"]);
  const both = Infer.readText(counts(30, { "f_dmy-slash": 30, "f_mdy-slash": 30, distinct_values: 30 }));
  assert.equal(both.type, "text");
  assert.deepEqual(both.ambiguous, ["dmy-slash", "mdy-slash"]);
  const mixed = Infer.readText(counts(30, { date_iso: 15, date_shape: 15, "f_dmy-slash": 15 }));
  assert.equal(mixed.type, "text");
  assert.equal(mixed.mixed, "dmy-slash");
});

test("text: categorical up to 1,000 levels with fewer than half distinct, else text; near-numbers become a suggestion", () => {
  assert.equal(Infer.readText(counts(100, { distinct_values: 12 })).type, "categorical");
  assert.equal(Infer.readText(counts(5000, { distinct_values: 1200 })).type, "text");
  assert.equal(Infer.readText(counts(100, { distinct_values: 60 })).type, "text");
  const near = Infer.readText(counts(100, { int_plain: 70, dec_plain: 70, distinct_values: 60 }));
  assert.equal(near.type, "text");
  assert.deepEqual(near.near, { kind: "integer", fits: 70 });
});

test("typed Parquet columns keep their type; nested and binary types are not analysed", () => {
  assert.equal(Infer.readSource("DECIMAL(10,2)", { rows: 3, nulls: 0, distinct_values: 3 }).type, "decimal");
  assert.equal(Infer.readSource("TIMESTAMP WITH TIME ZONE", { rows: 3, nulls: 0, distinct_values: 3 }).type, "datetime");
  assert.equal(Infer.readSource("STRUCT(a INTEGER)", { rows: 3, nulls: 0, distinct_values: 3 }).type, "unsupported");
  assert.equal(Infer.readSource("INTEGER[]", { rows: 3, nulls: 0, distinct_values: 3 }).type, "unsupported");
});

test("roles: identifiers are kept apart from measures; a storage type alone never makes a measure", () => {
  const num = (min, max, n = 100) => ({ min, max, whole: n, n });
  const role = (c) => Infer.role({ valued: 100, distinct: 100, lenMin: 3, lenMax: 9, numeric: null, ...c }).role;
  assert.equal(role({ name: "customer_id", type: "integer", numeric: num(5, 99999) }), "identifier", "an id name");
  assert.equal(role({ name: "zip", type: "integer", zeroPadded: 30, numeric: num(1000, 99999) }), "identifier", "a zip with leading zeros");
  assert.equal(role({ name: "row", type: "integer", numeric: num(1, 100) }), "identifier", "a dense run of unique whole numbers");
  assert.equal(role({ name: "sku", type: "text", lenMin: 8, lenMax: 8 }), "identifier");
  assert.equal(role({ name: "code_word", type: "text", lenMin: 6, lenMax: 6, distinct: 100 }), "identifier", "unique fixed-length text");
  assert.equal(role({ name: "population", type: "integer", lenMin: 3, lenMax: 8, numeric: num(120, 9876543) }), "measure", "unique but sparse whole numbers");
  assert.equal(role({ name: "key_rate", type: "decimal", numeric: { min: 0.1, max: 5, whole: 0, n: 100 } }), "measure", "an id word on a decimal is not enough");
  assert.equal(role({ name: "rating", type: "integer", distinct: 5, numeric: num(1, 5) }), "ordered category");
  assert.equal(role({ name: "when", type: "date" }), "time");
  assert.equal(role({ name: "flag", type: "boolean", distinct: 2 }), "category");
  assert.equal(role({ name: "same", type: "categorical", distinct: 1 }), "unknown");
  const year = Infer.role({ name: "year", type: "integer", valued: 30, distinct: 30, numeric: num(1990, 2019, 30), lenMin: 4, lenMax: 4 });
  assert.deepEqual([year.role, year.possibleTime], ["measure", true], "years are a measure flagged as possible time, never an identifier");
});

test("roles: a start time pairs with an end time; one alone is plain time", () => {
  const paired = Infer.pairIntervals([{ name: "start_date", role: "interval start" }, { name: "end_date", role: "interval end" }]);
  assert.deepEqual(paired.map((c) => c.role), ["interval start", "interval end"]);
  assert.deepEqual(Infer.pairIntervals([{ name: "start_date", role: "interval start" }]).map((c) => c.role), ["time"]);
});

test("sentinels: negative stand-ins in an otherwise non-negative field, 999-like values far above the rest", () => {
  assert.deepEqual(Infer.sentinels([{ value: -999, n: 3, other_min: 0.5, other_max: 40 }]), [{ value: -999, n: 3 }]);
  assert.deepEqual(Infer.sentinels([{ value: -1, n: 3, other_min: -5, other_max: 40 }]), [], "the field has other negative values");
  assert.deepEqual(Infer.sentinels([{ value: 9999, n: 2, other_min: 1, other_max: 120 }]), [{ value: 9999, n: 2 }]);
  assert.deepEqual(Infer.sentinels([{ value: 999, n: 2, other_min: 1, other_max: 900 }]), [], "999 is within ten times the rest");
});

test("suggestions change a reading or a role only through their change, and each has a stable id", () => {
  const col = { name: "visits", type: "integer", role: "measure", valued: 28, reading: { kind: "integer" }, missing: { markerValues: [{ value: "NA", n: 2 }] },
    sentinels: [{ value: -999, n: 2 }], ambiguous: [], mixed: null, near: null, possibleTime: false };
  const s = Infer.suggestions(col);
  assert.deepEqual(s.map((x) => x.id), ["visits::markers", "visits::sentinel::-999"]);
  assert.deepEqual(s[0].change.reading.missingText, ["na"]);
  assert.deepEqual(s[1].change.reading.missingNumbers, [-999]);
  const after = Infer.suggestions({ ...col, reading: { kind: "integer", missingText: ["na"], missingNumbers: [-999] } });
  assert.deepEqual(after, [], "an approved suggestion is not offered again");
});

test("preflight: a file that does not fit is refused before import, with a seeded sample that fits or fewer columns", () => {
  const { GiB, MiB } = Preflight;
  assert.equal(Preflight.device({ coarsePointer: false, screenMax: 1440 }).budget, 2 * GiB);
  assert.equal(Preflight.device({ coarsePointer: true, screenMax: 844 }).budget, 512 * MiB);
  assert.equal(Preflight.device({ coarsePointer: true, screenMax: 1366 }).budget, 1 * GiB);
  assert.equal(Preflight.device({ coarsePointer: false, screenMax: 1440, deviceMemoryGiB: 4 }).budget, 1 * GiB, "a quarter of the reported memory");
  assert.equal(Preflight.estimate("csv", 100 * MiB), 250 * MiB);
  assert.equal(Preflight.estimate("parquet", 10 * MiB, 1e6, 15), 16 * 1e6 * 16 + 10 * MiB, "16 bytes a value, with the row column, plus the size before compression");
  assert.deepEqual(Preflight.decide({ estimate: GiB, rows: 1e6, columns: 50, budget: 2 * GiB, used: 0 }), { fits: true, left: GiB }, "tables may fill half the budget");
  const refused = Preflight.decide({ estimate: 1.5 * GiB, rows: 1e6, columns: 50, budget: 2 * GiB, used: 0 });
  assert.equal(refused.fits, false);
  assert.equal(refused.sample.rows, 600000, "2/3 of the rows, less a 10% margin");
  assert.equal(refused.sample.seed, Preflight.SAMPLE_SEED);
  assert.equal(refused.maxColumns, 29, "2/3 of 50 columns, less a 10% margin, rounded down");
  assert.ok(Preflight.withColumns(1.5 * GiB, 29, 50) <= GiB, "the columns offered fit what the budget leaves");
  const full = Preflight.decide({ estimate: GiB, rows: 1e6, columns: 50, budget: 2 * GiB, used: GiB });
  assert.deepEqual([full.fits, full.sample, full.maxColumns], [false, null, 0], "nothing fits once tables fill half the budget");
  assert.equal(Preflight.csvRows(1000, 100, 11), 109, "rows estimated from the first bytes, less the header");
});

test("names: tables get safe unique names; the row column never collides with a source column", () => {
  assert.equal(Profile.tableName("Sales 2024 (final).csv", []), "sales_2024_final");
  assert.equal(Profile.tableName("2024.csv", []), "t_2024");
  assert.equal(Profile.tableName("sales.csv", ["sales", "sales_2"]), "sales_3");
  assert.equal(Profile.nameProblem("Sales", []), "Use lower-case letters, digits and _, starting with a letter (at most 63).");
  assert.equal(Profile.nameProblem("sales", ["sales"]), "A table named sales exists already.");
  assert.equal(Profile.nameProblem("sales", []), "");
  assert.equal(Profile.rowColumn(["a", "b"]), "__row");
  assert.equal(Profile.rowColumn(["__ROW", "__row_1"]), "__row_2");
});

test("Parquet schema: top-level columns in order, nested fields skipped with their parent", () => {
  const schema = [
    { name: "duckdb_schema", type: null, converted_type: null, num_children: 3 },
    { name: "a", type: "INT64", converted_type: null, num_children: null },
    { name: "s", type: null, converted_type: null, num_children: 2 },
    { name: "x", type: "INT32", converted_type: null, num_children: null },
    { name: "l", type: null, converted_type: "LIST", num_children: 1 },
    { name: "element", type: "INT32", converted_type: null, num_children: null },
    { name: "d", type: "INT32", converted_type: "DECIMAL", num_children: null },
  ];
  assert.deepEqual(Profile.parquetColumns(schema).map((c) => `${c.name}:${c.physical}:${c.converted}`), ["a:INT64:", "s:GROUP:", "d:INT32:DECIMAL"]);
});

test("SHA-256 in chunks equals node:crypto for every split of the bytes", () => {
  const bytes = new Uint8Array(1000).map((_, i) => (i * 31 + 7) & 255);
  const expected = createHash("sha256").update(bytes).digest("hex");
  for (const step of [1, 7, 63, 64, 65, 500, 1000]) {
    const h = Sha.create();
    for (let i = 0; i < bytes.length; i += step) h.update(bytes.subarray(i, i + step));
    assert.equal(h.hex(), expected, `chunks of ${step}`);
  }
  assert.equal(Sha.create().hex(), createHash("sha256").digest("hex"), "empty input");
});

test("the planted example is the same bytes from the same seed, with its patterns in place", () => {
  const text = Examples.planted();
  assert.equal(text, Examples.planted());
  assert.notEqual(text, Examples.planted(1));
  const rows = text.trim().split("\n").slice(1).map((l) => l.split(","));
  assert.equal(rows.length, Examples.ROWS);
  assert.equal(rows[0][0], "000001");
  const atlantis = rows.filter((r) => r[1] === "Atlantis").length;
  assert.ok(atlantis > 0 && atlantis < 0.02 * rows.length, `a rare region: ${atlantis} rows`);
  assert.equal(rows.filter((r) => r[11] === "-999").length, 5);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const before = rows.filter((r) => r[3] < "2025-03-01").map((r) => Number(r[10])), after = rows.filter((r) => r[3] >= "2025-03-01").map((r) => Number(r[10]));
  assert.ok(mean(after) - mean(before) > 30, "a level shift in sales");
  assert.equal(createHash("sha256").update(text).digest("hex").length, 64);
});

test("the record and the deck: names from the data stay out of narration, and beamdswitch's own parser reads the deck", () => {
  const column = (name, over = {}) => ({ name, sourceType: "VARCHAR", type: "integer", reading: "whole numbers", share: 0.96, role: "measure", certainty: "likely",
    roleReasons: [], valued: 28, distinct: 20, missing: { nulls: 0, blanks: 1, markers: 2, madeMissing: 0 }, failures: 1, failureExamples: ["abc"],
    errors: [{ kind: "parse", count: 1, text: "1 value does not read as integer", examples: ["abc"] }], unusual: null, summary: null, suggestions: [], unit: "", yourChanges: [], ...over });
  const snapshot = {
    engine: { duckdb: "v1.5.4", duckdbWasm: "1.33.1-dev57.0", budget: "2.0 GiB" },
    pieces: [{ n: 2, title: "Charts and candidates" }],
    tables: [{ name: "odd_name", file: { name: "#odd|file*.csv", sha256: "ab" }, rows: 28, columns: 2, status: "complete", sample: null, columnsKept: null,
      rejected: { count: 2, examples: [] }, notProfiled: [], profiled: [column("$weird|name_*"), column("# heading", { errors: [] })] }],
    log: ["Imported #odd|file*.csv as odd_name"],
  };
  const report = Report.report(snapshot);
  const deck = parseDeck(Beamdswitch.deck(report));
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), ["Set-up", "Method", "Results", "Checks and takeaway"]);
  assert.ok(deck.frames.filter((f) => f.kind === "frame").every((f) => f.narration && !/[$|*_#]/.test(f.narration)), "narration is plain words");
  const record = VisualKit.markdown(report);
  assert.match(record, /\| \$weird\\\|name_\* \| integer \| 96\.0% \| measure \| 3 \| 20 \|/, "a column row, with its bar escaped");
  assert.match(record, /^\| \\# heading /m, "a name that would start a heading stays in its cell");
  assert.doesNotMatch(Report.report({ ...snapshot, tables: [] }).results[0].body, /odd_name/);
});

