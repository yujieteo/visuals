// Grammar v1 with the pinned engine: the exact candidate sets and outcomes of the fixtures, the planted example,
// the fixed rules on real queries (log axes, bins, levels and Other, periods, the scatter sample, means with their
// intervals, facets), the timeline rules (time zones, dates known to the year or month, qualifiers, open ends,
// duplicates, pages of 500), and the time to the first figures. The page's own modules run the same pipeline as
// the gallery: Charts.prepare, ChartSpec.make, Charts.evaluate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const Grammar = require("../src/grammar.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Sql = require("../src/sql.js");

const folder = new URL("../", import.meta.url);
const encode = (/** @type {string} */ text) => new TextEncoder().encode(text);
const e = await engine();
let files = 0;

/** Import and profile bytes as a table, then prepare its charts, as the page does. */
async function load(name, bytes) {
  const started = performance.now();
  const path = e.register(`${name}.csv`, bytes);
  const imported = await Profile.importFile(e.query, { kind: "csv", path, table: name, n: ++files });
  const profile = await Profile.profileTable(e.query, { table: name, rowColumn: imported.rowColumn, columns: imported.columns });
  const prepared = Charts.prepare({ name, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns: profile.columns });
  return { started, imported, profile, ...prepared };
}

/** Every candidate's outcome, in order, with the time of the first valid figure. */
async function run(t) {
  const out = [];
  let first = null;
  for (const c of t.plan.candidates) {
    const spec = ChartSpec.make(c, t.ctx);
    const r = await Charts.evaluate(e.query, spec, t.ctx);
    if (r.outcome === "valid" && first === null) first = performance.now();
    out.push({ ...c, spec, ...r });
  }
  return { out, first, done: performance.now() };
}

/** One candidate computed with a specification changed by `change`. */
async function chart(t, kind, fields, change = {}) {
  const c = { id: Grammar.candidateId(t.ctx.table, kind, fields), kind, fields };
  const spec = ChartSpec.edit(ChartSpec.make(c, t.ctx), change, t.ctx);
  const r = await Charts.evaluate(e.query, spec, t.ctx);
  assert.equal(r.outcome, "valid", r.reason);
  return { spec, data: r.data, svg: r.drawn.svg };
}

// Every table the tests share is loaded before the first test starts: the engine runs one query at a time.
const planted = await load("planted", encode(Examples.planted()));
const plantedRun = await run(planted);
const timeline = await load("timeline_rules", readFileSync(new URL("tests/fixtures/timeline.csv", folder)));

for (const name of ["small", "timeline"]) {
  test(`exact candidate set and outcomes: tests/fixtures/${name}.csv`, async () => {
    const want = JSON.parse(readFileSync(new URL(`tests/fixtures/${name}-candidates.json`, folder), "utf8"));
    const t = await load(name, readFileSync(new URL(`tests/fixtures/${name}.csv`, folder)));
    assert.deepEqual(Object.fromEntries(t.classes.map((/** @type {any} */ c) => [c.name, c.cls])), want.classes);
    assert.deepEqual(t.plan.counts, want.counts);
    assert.equal(t.plan.total, want.total);
    assert.equal(t.plan.formula.total, want.total, "the documented count");
    const { out } = await run(t);
    assert.deepEqual(out.map((c) => ({ id: c.id, kind: c.kind, fields: c.fields, outcome: c.outcome, ...(c.outcome === "valid" ? {} : { reason: c.reason }) })), want.candidates);
    for (const c of out.filter((x) => x.outcome === "valid")) assert.doesNotMatch(c.drawn.svg, /NaN|undefined|Infinity/, c.id);
  });
}

test("the planted example: 155 candidates, each with an outcome, the identifier excluded with its reason", () => {
  assert.deepEqual(planted.plan.counts, { q: 7, c: 5, t: 1, l: 1 });
  assert.equal(planted.plan.total, 155);
  const ids = planted.classes.find((/** @type {any} */ c) => c.name === "order_id");
  assert.deepEqual([ids.cls, ids.reason], ["excluded", 'An identifier, never a measure: The name contains "id".']);
  const n = Grammar.accounting(plantedRun.out);
  assert.deepEqual([n.valid, n.excluded, n.failed, n.incomplete, n.pending], [155, 0, 0, 0, 0]);
  for (const c of plantedRun.out) {
    assert.doesNotMatch(c.drawn.svg, /NaN|undefined|Infinity/, c.id);
    assert.ok((c.drawn.svg.match(/<text /g) ?? []).length >= 4, `${c.id}: labels are text`);
  }
  console.log(`charts: planted (2,000 rows, 15 columns): first figure ${((plantedRun.first - planted.started) / 1000).toFixed(2)} s after the import began, all 155 after ${((plantedRun.done - planted.started) / 1000).toFixed(2)} s`);
});

test("a count time series of two years of days is by month; every row is counted once", async () => {
  const { data } = await chart(planted, "count-series", ["order_date"]);
  assert.equal(data.unit, "month");
  assert.equal(data.periods.length, 24);
  assert.equal(data.panels[0].series.reduce((a, s) => a + s.n, 0), 2000);
});

test("a span of more than 500 years is counted by decade, every row once, and the figure says why", async () => {
  const lines = ["happened"];
  for (let i = 0; i < 900; i++) lines.push(`${1100 + i}-06-15`);
  const t = await load("centuries", encode(lines.join("\n")));
  const { data, svg } = await chart(t, "count-series", ["happened"]);
  assert.deepEqual([data.unit, data.periods.length], ["decade", 90]);
  assert.equal(data.panels[0].series.reduce((/** @type {number} */ a, /** @type {any} */ x) => a + x.n, 0), 900);
  assert.ok(data.panels[0].series.every((/** @type {any} */ x) => x.n === 10), "ten years a decade");
  assert.match(svg, /By year, the span would need more than 500 periods: drawn by decade\./);
});

test("the log rule, Freedman–Diaconis bins and their edits, on the engine", async () => {
  const u = Examples.random(11);
  const lines = ["size,weight"];
  for (let i = 0; i < 600; i++) lines.push(`${(10 ** (5 * u())).toFixed(3)},${(50 + 10 * u()).toFixed(2)}`);
  const t = await load("sizes", encode(lines.join("\n")));
  assert.equal(t.ctx.fields.size.logRule, true, "all values above 0 and P99/P1 at least 1,000");
  assert.equal(t.ctx.fields.weight.logRule, false);
  const { spec, data, svg } = await chart(t, "histogram", ["size"]);
  assert.equal(spec.scale.x.type, "log10");
  const q = (await e.query(`SELECT count(*)::DOUBLE AS n, quantile_cont(log10(CAST(size AS DOUBLE)), 0.25) AS q1, quantile_cont(log10(CAST(size AS DOUBLE)), 0.75) AS q3,
    min(log10(CAST(size AS DOUBLE))) AS lo, max(log10(CAST(size AS DOUBLE))) AS hi FROM sizes`))[0];
  assert.equal(data.x.bins, Math.min(100, Math.max(5, Math.ceil((q.hi - q.lo) / (2 * (q.q3 - q.q1) * q.n ** (-1 / 3))))), "Freedman–Diaconis on the log axis");
  assert.equal(data.panels[0].counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0), 600);
  assert.match(svg, />1,000</, "log ticks at powers of ten");
  const set = await chart(t, "histogram", ["size"], { bins: 8, xScale: "linear" });
  assert.deepEqual([set.data.x.bins, set.spec.scale.x.type], [8, "linear"]);
});

test("a category of 40 levels: the 29 most frequent, then Other with the rest of the rows", async () => {
  const lines = ["kind"];
  for (let k = 0; k < 40; k++) for (let i = 0; i <= k; i++) lines.push(`kind_${String(k).padStart(2, "0")}`);
  const t = await load("kinds", encode(lines.join("\n")));
  const { data } = await chart(t, "bar", ["kind"]);
  const heat = await chart(t, "bar", ["kind"], { top: 5 });
  assert.match(heat.svg, /the 5 most frequent levels kept, the rest as Other/);
  const bars = data.panels[0].bars;
  assert.equal(bars.length, 30);
  assert.equal(bars[0].level, "kind_39", "by count");
  assert.deepEqual(bars[29], { level: "Other (11 levels)", n: (11 * 12) / 2, other: true }, "kind_00 to kind_10 as Other: 1 + 2 + ... + 11 rows");
  assert.equal(bars.reduce((a, b) => a + b.n, 0), (40 * 41) / 2);
});

test("a scatter plot of more than 50,000 points draws a seeded sample of 50,000, the same each time, and says so", async () => {
  const u = Examples.random(5);
  const lines = ["x,y"];
  for (let i = 0; i < 60000; i++) lines.push(`${(u() * 100).toFixed(3)},${(u() * 50).toFixed(3)}`);
  const t = await load("dense", encode(lines.join("\n")));
  const a = await chart(t, "scatter", ["x", "y"]);
  const b = await chart(t, "scatter", ["x", "y"]);
  assert.deepEqual(a.data.facts.scatterSample, { rows: 50000, seed: 20261005, of: 60000 });
  assert.equal(a.data.panels[0].xs.length, 50000);
  assert.deepEqual(a.data.panels[0].xs.slice(0, 50), b.data.panels[0].xs.slice(0, 50), "seeded: the same points");
  assert.match(a.svg, /Sample: 50,000 of 60,000 points drawn \(seed 20261005\)/);
});

test("mean bars: the mean of each group with its 95% t interval, and n; a sum only of a field marked additive", async () => {
  const { data } = await chart(planted, "mean-bar", ["segment", "score"]);
  const rows = await e.query(`SELECT segment AS g, count(*)::DOUBLE AS n, avg(CAST(score AS DOUBLE)) AS m, stddev_samp(CAST(score AS DOUBLE)) AS sd FROM planted GROUP BY segment ORDER BY segment`);
  for (const r of rows) {
    const bar = data.panels[0].bars.find((/** @type {any} */ x) => x.group === r.g);
    assert.equal(bar.n, r.n);
    assert.ok(Math.abs(bar.value - r.m) < 1e-9);
    assert.ok(Math.abs(bar.hi - (r.m + Charts.tQuantile(0.975, r.n - 1) * (r.sd / Math.sqrt(r.n)))) < 1e-9);
  }
  const b = data.panels[0].bars.find((/** @type {any} */ x) => x.group === "B"), a = data.panels[0].bars.find((/** @type {any} */ x) => x.group === "A");
  assert.ok(b.value - a.value > 5, "the planted group difference shows");
  const sales = { ...planted.ctx, fields: { ...planted.ctx.fields, sales: { ...planted.ctx.fields.sales, additive: true } } };
  const spec = ChartSpec.edit(ChartSpec.make({ id: "planted.mean-bar.region.sales", kind: "mean-bar", fields: ["region", "sales"] }, sales), { fn: "sum" }, sales);
  const r = await Charts.evaluate(e.query, spec, sales);
  assert.equal(r.outcome, "valid");
  const total = (await e.query("SELECT sum(CAST(sales AS DOUBLE)) AS s FROM planted"))[0].s;
  assert.ok(Math.abs(r.data.panels[0].bars.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.value, 0) - total) < 1e-6, "the sums add up to the column's total");
});

test("facets: one panel a level on shared scales, and every row in exactly one panel", async () => {
  const { data, svg } = await chart(planted, "box-by-group", ["region", "score"], { facet: "segment" });
  assert.deepEqual(data.facets, ["A", "B"]);
  assert.equal(data.panels.length, 2);
  assert.equal(data.panels.flatMap((/** @type {any} */ p) => p.boxes).reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b.n, 0), 2000);
  assert.match(svg, /segment: A/);
  const hist = await chart(planted, "histogram", ["score"], { facet: "active" });
  assert.equal(hist.data.panels.length, 2);
  assert.equal(hist.data.panels.reduce((/** @type {number} */ a, /** @type {any} */ p) => a + p.counts.reduce((/** @type {number} */ x, /** @type {number} */ y) => x + y, 0), 0), 2000);
});

/* ---------- timelines ---------- */

test("timelines: dates known to the year or month keep their precision and qualifiers; duplicates merge with a count; the same label at another date stays apart", async () => {
  const when = timeline.profile.columns.find((/** @type {any} */ c) => c.name === "when");
  assert.deepEqual([when.type, when.reading.kind], ["date", "date-partial"], "1850, c. 1850, 1851-03 and 1860? read as dates with their precision");
  const { data, svg } = await chart(timeline, "point-timeline", ["when", "event"]);
  const by = (/** @type {string} */ label) => data.events.filter((/** @type {any} */ x) => x.label === label);
  assert.deepEqual(by("Treaty signed").map((/** @type {any} */ x) => [x.raw, x.p, x.q]), [["c. 1850", "year", true]]);
  assert.deepEqual(by("Bridge built").map((/** @type {any} */ x) => [x.raw, x.p, x.n]), [["1851-03", "month", 3]], "three rows, one mark");
  assert.deepEqual(by("Mine closed").map((/** @type {any} */ x) => [x.raw, x.p, x.q]), [["1860?", "year", true]]);
  assert.deepEqual(by("Fair").map((/** @type {any} */ x) => [x.raw, x.p, x.q]), [["~1862-09", "month", true]]);
  assert.deepEqual(by("Flood").map((/** @type {any} */ x) => x.raw), ["1858-04-02", "1859-04-02"], "the same label at two dates: two marks");
  assert.equal(data.page.merged, 1);
  assert.match(svg, /Bridge built \(1851-03\) ×3/);
  assert.match(svg, /<pattern id="hatch-/, "a year or month draws as a hatched span: no day is invented");
});

test("interval timelines: open ends drawn to the edge and labelled, an end before its start left out and counted, the 90% rule", async () => {
  const { data, svg } = await chart(timeline, "interval-timeline", ["start", "end", "event"]);
  const by = (/** @type {string} */ label) => data.events.find((/** @type {any} */ x) => x.label === label);
  assert.equal(by("Railway opened").e, null);
  assert.equal(by("Mine closed").s, null);
  assert.equal(by("Strike"), undefined, "1863-01-05 to 1863-01-02 ends before it starts");
  assert.ok(data.facts.notes.some((/** @type {string} */ n) => /1 row ends before its start: not drawn/.test(n)));
  assert.match(svg, /Railway opened \(end unknown\)/);
  assert.match(svg, /Mine closed \(start unknown\)/);
  assert.ok(data.share >= 0.9);
  const treaty = by("Treaty signed");
  assert.deepEqual([treaty.ps, treaty.pe], ["year", "year"], "1850 to 1852: both ends known to the year");
});

test("time zones: values with an offset are ordered in UTC and shown as written; values without one are zone unknown and never shifted", async () => {
  const lines = ["label,seen,naive",
    "Tokyo,2026-01-01T23:30:00+09:00,2026-01-01T23:30:00", "London,2026-01-01T15:00:00Z,2026-01-01T15:00:00", "Lima,2026-01-01T09:00:00-05:00,2026-01-01T09:00:00",
    "Delhi,2026-01-01T19:45:00+05:30,2026-01-01T19:45:00"];
  const t = await load("zones", encode(lines.join("\n")));
  const zoned = await chart(t, "point-timeline", ["seen", "label"]);
  assert.equal(zoned.spec.scale.x.zone, "utc");
  assert.deepEqual(zoned.data.events.map((/** @type {any} */ x) => x.label), ["Lima", "Delhi", "Tokyo", "London"], "14:00, 14:15, 14:30 and 15:00 in UTC");
  assert.equal(zoned.data.events[0].raw, "2026-01-01T09:00:00-05:00", "shown as written, in its own offset");
  assert.match(zoned.svg, /seen \(UTC\)/);
  const naive = await chart(t, "point-timeline", ["naive", "label"]);
  assert.equal(naive.spec.scale.x.zone, "unknown");
  assert.deepEqual(naive.data.events.map((/** @type {any} */ x) => x.label), ["Lima", "London", "Delhi", "Tokyo"], "as written, never shifted");
  assert.match(naive.svg, /naive \(zone unknown\)/);
});

test("timelines hold 500 events a figure, split in time order", async () => {
  const lines = ["label,day"];
  for (let i = 0; i < 1200; i++) lines.push(`event ${i},${new Date(Date.UTC(2020, 0, 1) + ((i * 7919) % 1200) * 86400000).toISOString().slice(0, 10)}`);
  const t = await load("many_events", encode(lines.join("\n")));
  const one = await chart(t, "point-timeline", ["day", "label"]);
  assert.deepEqual([one.data.page.pages, one.data.page.events, one.data.events.length], [3, 1200, 500]);
  const two = await chart(t, "point-timeline", ["day", "label"], { page: 2 });
  assert.equal(two.data.events.length, 500);
  assert.ok(two.data.events[0].t >= one.data.events[499].t, "page 2 starts where page 1 ends");
  const three = await chart(t, "point-timeline", ["day", "label"], { page: 3 });
  assert.equal(three.data.events.length, 200);
});

test("a precision column is read the same way by the profile and the chart: the partial-date reading", async () => {
  const rows = await e.query(`SELECT CAST(${Sql.typed("when", { kind: "date-partial" })} AS VARCHAR) AS d, ${Sql.partialPrecision("when")} AS p FROM timeline_rules ORDER BY __row LIMIT 3`);
  assert.deepEqual(rows, [{ d: "1850-01-01", p: "year" }, { d: "1851-03-01", p: "month" }, { d: "1851-03-01", p: "month" }]);
});

test("benchmark: time to the first figures and to every candidate, for a generated table of 100,000 rows", async () => {
  const rows = Number(process.env.DW_BENCH_ROWS ?? 100000);
  const t = await load("bench_charts", encode(Examples.planted(3, rows)));
  const { out, first, done } = await run(t);
  const n = Grammar.accounting(out);
  assert.equal(n.pending, 0);
  assert.equal(n.valid + n.excluded + n.failed + n.incomplete, t.plan.total);
  const s = (/** @type {number} */ ms) => (ms / 1000).toFixed(2);
  console.log(`benchmark: ${rows} rows x 15 columns: ${t.plan.total} candidates (${n.valid} valid); first figure ${s(/** @type {number} */ (first) - t.started)} s after the import began, every candidate after ${s(done - t.started)} s, on Node ${process.version}, ${process.platform} ${process.arch}`);
  assert.ok(done - t.started < 120000, "within the 2-minute target");
});
