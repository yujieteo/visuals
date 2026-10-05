// Grammar v1 without the engine: field classes, the candidate set and its count, the 10,000 cap, the chart
// specification's schema and rules, edits, the fixed rules (bins, periods, intervals), the timeline layout and the
// SVG writer. Each test runs the page's own modules (src/grammar.js, chartspec.js, charts.js, render.js).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
/** @type {any} */ const Grammar = require("../src/grammar.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Render = require("../src/render.js");
/** @type {any} */ const Report = require("../src/report.js");
/** @type {any} */ const Beamdswitch = require("../beamdswitch.js");
const { parseDeck } = await import("../../../scripts/templates/beamdswitch/deck.mjs");

let position = 0;
/** A column profile as src/profile.js returns it, a measure unless `over` says otherwise. */
const col = (name, over = {}) => ({
  name, position: position++, type: "decimal", role: "measure", distinct: 50, valued: 100, reading: { kind: "decimal" }, unit: "", roleReasons: ["A reason."],
  summary: { kind: "numeric", min: 1, max: 100, p1: 1, p99: 99, whole: 0, n: 100 }, ...over,
});

test("field classes: Q, C, T and L, and every exclusion with its reason", () => {
  const cls = (over) => Grammar.classify(col("f", over));
  assert.equal(cls({}).cls, "Q");
  assert.equal(cls({ distinct: 13 }).cls, "Q", "13 distinct numbers make a measure");
  assert.deepEqual([cls({ distinct: 12 }).cls, cls({ distinct: 12 }).reason], ["C", "Numbers with 12 distinct values: levels."], "2 to 12 distinct numbers are levels");
  assert.equal(cls({ type: "integer", role: "ordered category", distinct: 5 }).cls, "C");
  assert.equal(cls({ type: "boolean", role: "category", distinct: 2 }).cls, "C");
  assert.equal(cls({ type: "categorical", role: "category", distinct: 1000 }).cls, "C");
  assert.match(cls({ type: "text", role: "category", distinct: 1001, valued: 5000 }).reason, /more than 1,000/);
  assert.equal(cls({ type: "date", role: "time", distinct: 2, reading: { kind: "date" } }).precision, "day");
  assert.equal(cls({ type: "datetime", role: "time", reading: { kind: "datetime-zoned" } }).precision, "time");
  assert.equal(cls({ type: "date", role: "time", reading: { kind: "date-partial" } }).precision, "mixed");
  assert.deepEqual([cls({ type: "text", role: "event label", distinct: 90 }).cls, cls({ type: "text", role: "unknown", distinct: 60 }).cls], ["L", "L"], "text with half or more of its values distinct is labels");
  assert.equal(cls({ type: "text", role: "unknown", distinct: 40 }).cls, "C");
  const years = { type: "integer", role: "time", summary: { kind: "numeric", min: 1950, max: 2020, whole: 71, n: 71 } };
  assert.deepEqual([cls(years).cls, cls(years).precision], ["T", "year"], "whole numbers from 1000 to 2999 with the role time are years");
  assert.equal(cls({ ...years, summary: { kind: "numeric", min: 1, max: 1e9, whole: 9, n: 9 } }).cls, "excluded");
  const out = (over, why) => { const c = cls(over); assert.equal(c.cls, "excluded"); assert.match(c.reason, why); };
  out({ role: "identifier", roleReasons: ['The name contains "id".'] }, /identifier, never a measure: The name contains "id"/);
  out({ type: "unsupported", role: "unknown" }, /nested or binary/);
  out({ type: "empty", valued: 0 }, /Every value is missing/);
  out({ distinct: 1 }, /Constant/);
  out({ type: "time", role: "time" }, /Times of day/);
  out({ failed: "boom" }, /Could not be profiled/);
  out({ notProfiled: true }, /Not profiled/);
  out({ type: "text", role: "unknown", reading: { kind: "text" }, ambiguous: ["dmy-slash", "mdy-slash"], distinct: 30 }, /more than one layout/);
});

/** A table of q measures, c categories, t times and l labels, with an identifier and a constant excluded. */
function table(q, c, t, l) {
  position = 0;
  const cols = [col("row_id", { role: "identifier", type: "integer" })];
  for (let i = 0; i < q; i++) cols.push(col(`m${i}`));
  for (let i = 0; i < c; i++) cols.push(col(`c${i}`, { type: "categorical", role: "category", distinct: 4 }));
  for (let i = 0; i < t; i++) cols.push(col(`t${i}`, { type: "date", role: "time", reading: { kind: "date" } }));
  for (let i = 0; i < l; i++) cols.push(col(`l${i}`, { type: "text", role: "event label", distinct: 95 }));
  cols.push(col("same", { distinct: 1, role: "unknown" }));
  return Grammar.classifyAll(cols);
}

test("candidate accounting: the enumerated set always has the documented count, 2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l", () => {
  const choose2 = (n) => (n * (n - 1)) / 2;
  for (const [q, c, t, l] of [[0, 0, 0, 0], [1, 0, 0, 0], [2, 1, 1, 1], [3, 2, 2, 1], [5, 4, 3, 2], [7, 5, 1, 1], [0, 3, 0, 2], [0, 0, 4, 1]]) {
    const plan = Grammar.enumerate("t", table(q, c, t, l));
    const want = 2 * q + c + t + 2 * choose2(q) + 2 * q * c + choose2(c) + t * q + t * c + t * l + choose2(t) * l;
    assert.equal(plan.total, want, `q=${q} c=${c} t=${t} l=${l}`);
    assert.equal(plan.formula.total, want);
    assert.equal(plan.candidates.length, want);
    assert.equal(new Set(plan.candidates.map((x) => x.id)).size, want, "every id is unique");
    const accounted = Grammar.accounting(plan.candidates.map((x, i) => ({ ...x, outcome: ["valid", "excluded", "failed", "incomplete"][i % 4] })));
    assert.equal(accounted.valid + accounted.excluded + accounted.failed + accounted.incomplete, want, "each candidate has exactly one outcome");
    assert.equal(accounted.pending, 0);
  }
});

test("the exact candidate set of a small table: kinds in order, the earlier column as x, a category as x against a measure", () => {
  const plan = Grammar.enumerate("small", table(2, 1, 1, 1));
  assert.deepEqual(plan.candidates.map((x) => `${x.kind}(${x.fields.join(",")})`), [
    "histogram(m0)", "histogram(m1)", "box(m0)", "box(m1)", "bar(c0)", "count-series(t0)", "scatter(m0,m1)", "binned-heatmap(m0,m1)",
    "box-by-group(c0,m0)", "box-by-group(c0,m1)", "mean-bar(c0,m0)", "mean-bar(c0,m1)", "mean-series(t0,m0)", "mean-series(t0,m1)", "period-heatmap(t0,c0)", "point-timeline(t0,l0)",
  ]);
  assert.equal(plan.candidates[6].id, "small.scatter.m0.m1");
});

test("an interval timeline takes the column whose role is interval start as its start, else the earlier column", () => {
  position = 0;
  const cols = [col("ends", { type: "date", role: "interval end", reading: { kind: "date" } }), col("begins", { type: "date", role: "interval start", reading: { kind: "date" } }),
    col("name", { type: "text", role: "event label", distinct: 99 })];
  const plan = Grammar.enumerate("x", Grammar.classifyAll(cols));
  assert.deepEqual(plan.candidates.filter((c) => c.kind === "interval-timeline").map((c) => c.fields), [["begins", "ends", "name"]]);
});

test("the 10,000 cap: candidates beyond it are counted as incomplete by kind, never dropped silently", () => {
  const plan = Grammar.enumerate("wide", table(150, 0, 0, 0));
  assert.equal(plan.total, 2 * 150 + 2 * ((150 * 149) / 2));
  assert.equal(plan.candidates.length, Grammar.MAX_CANDIDATES);
  assert.equal(Object.values(plan.overflow).reduce((a, b) => a + b, 0), plan.total - Grammar.MAX_CANDIDATES);
  const n = Grammar.accounting(plan.candidates.map((c) => ({ ...c, outcome: "valid" })), plan.total - Grammar.MAX_CANDIDATES);
  assert.deepEqual([n.valid, n.incomplete, n.total, n.complete], [10000, plan.total - 10000, plan.total, false]);
  const small = Grammar.enumerate("t", table(3, 0, 0, 0), { max: 4 });
  assert.deepEqual(small.overflow, { box: 2, scatter: 3, "binned-heatmap": 3 }, "three histograms and one box fit; the rest are counted");
});

test("ids: stable, filename-safe, and unique even when two names slug alike", () => {
  assert.equal(Grammar.slug("price"), "price");
  assert.match(Grammar.slug("Price (USD)"), /^price_usd-[0-9a-f]{6}$/);
  assert.notEqual(Grammar.slug("a b"), Grammar.slug("a-b"));
  assert.equal(Grammar.slug("Price (USD)"), Grammar.slug("Price (USD)"));
  const long = Grammar.candidateId("t", "interval-timeline", ["a".repeat(300), "b".repeat(300), "c".repeat(300)]);
  assert.ok(long.length <= 400, `${long.length} characters`);
  assert.equal(ChartSpec.validateSchema(ChartSpec.SCHEMA.properties.id, long).length, 0, "the longest id still passes the schema");
});

/* ---------- specifications ---------- */

/** The rules' view of a small table: two measures (one with values at or below 0), a category, a time, a label. */
function context() {
  const fields = {
    a: { name: "a", cls: "Q", levels: 30, logRule: true, min: 0.5, unit: "kg", additive: false, precision: null, zone: "none", ordered: false },
    b: { name: "b", cls: "Q", levels: 30, logRule: false, min: -3, unit: "", additive: false, precision: null, zone: "none", ordered: false },
    grp: { name: "grp", cls: "C", levels: 3, logRule: false, min: null, unit: "", additive: false, precision: null, zone: "none", ordered: false },
    many: { name: "many", cls: "C", levels: 40, logRule: false, min: null, unit: "", additive: false, precision: null, zone: "none", ordered: false },
    day: { name: "day", cls: "T", levels: 30, logRule: false, min: null, unit: "", additive: false, precision: "day", zone: "none", ordered: false },
    note: { name: "note", cls: "L", levels: 30, logRule: false, min: null, unit: "", additive: false, precision: null, zone: "none", ordered: false },
  };
  return { table: "small", rows: 30, sample: null, fields };
}
const cand = (kind, fields) => ({ id: Grammar.candidateId("small", kind, fields), kind, fields });

test("every generated specification passes the JSON Schema and the rules, for every kind", () => {
  const ctx = context();
  const kinds = { histogram: ["a"], box: ["b"], bar: ["grp"], "count-series": ["day"], scatter: ["a", "b"], "binned-heatmap": ["a", "b"], "box-by-group": ["grp", "a"],
    "mean-bar": ["grp", "b"], "count-heatmap": ["grp", "many"], "mean-series": ["day", "a"], "period-heatmap": ["day", "grp"], "point-timeline": ["day", "note"] };
  for (const [kind, fields] of Object.entries(kinds)) {
    const spec = ChartSpec.make(cand(kind, fields), ctx);
    assert.deepEqual(ChartSpec.validate(spec, ctx), { ok: true, errors: [] }, kind);
    assert.deepEqual(Object.keys(spec), ["version", "grammar", "id", "kind", "data", "transform", "encoding", "scale", "layout", "annotation", "edits"]);
  }
  const hist = ChartSpec.make(cand("histogram", ["a"]), ctx);
  assert.equal(hist.scale.x.type, "log10", "the log rule picks a log axis");
  assert.equal(hist.annotation.labels.x, "a (kg)", "a unit appears only when one is given");
  assert.equal(ChartSpec.make(cand("histogram", ["b"]), ctx).annotation.labels.x, "b");
  assert.equal(ChartSpec.make(cand("mean-bar", ["grp", "a"]), ctx).scale.y.type, "linear", "a mean bar starts at zero on a linear axis, whatever the log rule says");
});

test("the validator refuses what the grammar forbids, each with its reason", () => {
  const ctx = context();
  const refused = (spec, why) => {
    const v = ChartSpec.validate(spec, ctx);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => why.test(e)), v.errors.join("; "));
  };
  const scatter = ChartSpec.make(cand("scatter", ["a", "b"]), ctx);
  refused(ChartSpec.edit(scatter, { yScale: "log10" }, ctx), /log scale needs every value above 0, and b has values at or below 0/);
  const bar = ChartSpec.make(cand("bar", ["grp"]), ctx);
  refused({ ...bar, scale: { ...bar.scale, y: { type: "linear", zero: false } } }, /bars start at zero/);
  refused({ ...bar, scale: { ...bar.scale, y: { type: "log10", zero: true } } }, /bars start at zero/);
  refused(ChartSpec.edit(scatter, { facet: "many" }, ctx), /at most 12 levels, and many is a category of 40 levels/);
  refused(ChartSpec.edit(ChartSpec.make(cand("box-by-group", ["grp", "a"]), ctx), { facet: "grp" }, ctx), /already encoded/);
  refused(ChartSpec.edit(ChartSpec.make(cand("mean-bar", ["grp", "a"]), ctx), { fn: "sum" }, ctx), /a sum needs a marked additive by you/);
  refused({ ...scatter, encoding: { ...scatter.encoding, x: { field: "grp", class: "C" } } }, /grp is category \(C\)/);
  refused({ ...scatter, extra: 1 }, /extra is not allowed/);
  refused({ ...scatter, id: "Bad Id" }, /does not match/);
  refused({ ...scatter, layout: { ...scatter.layout, width: 10 } }, /at least 40/);
  refused(ChartSpec.edit(ChartSpec.make(cand("point-timeline", ["day", "note"]), ctx), { facet: "grp" }, ctx), /timelines are not faceted/);
  const additive = { ...ctx, fields: { ...ctx.fields, a: { ...ctx.fields.a, additive: true } } };
  assert.equal(ChartSpec.validate(ChartSpec.edit(ChartSpec.make(cand("mean-bar", ["grp", "a"]), additive), { fn: "sum" }, additive), additive).ok, true, "a sum of a field marked additive is allowed");
});

test("edits: each change is recorded; a field's axis label follows the field unless the person wrote one; swaps keep units with their field", () => {
  const ctx = context();
  const spec = ChartSpec.make(cand("scatter", ["a", "b"]), ctx);
  assert.equal(ChartSpec.edit(spec, {}, ctx).edits.length, 0, "no change, no edit");
  const swapped = ChartSpec.edit(spec, { swap: true }, ctx);
  assert.deepEqual([swapped.encoding.x.field, swapped.encoding.y.field, swapped.annotation.labels.y, swapped.annotation.units.y], ["b", "a", "a (kg)", "kg"]);
  assert.deepEqual(swapped.edits, ["x and y swapped"]);
  const titled = ChartSpec.edit(spec, { title: "Mass against b", xLabel: "Mass", facet: "grp", width: 120, height: 90 }, ctx);
  assert.deepEqual(titled.layout, { width: 120, height: 90, unit: "mm", facet: { field: "grp", columns: 3 } });
  assert.match(titled.edits[0], /title: "Mass against b"; x label: "Mass"; width 120 mm; height 90 mm; facets by grp/);
  assert.equal(ChartSpec.validate(titled, ctx).ok, true);
  assert.equal(ChartSpec.edit(ChartSpec.make(cand("histogram", ["a"]), ctx), { x: "b" }, ctx).annotation.title, "Distribution of b", "a generated title follows the field");
  assert.equal(swapped.annotation.title, "a against b", "and the swap");
  assert.equal(ChartSpec.edit(titled, { x: "b", swap: true }, ctx).annotation.title, "Mass against b", "a title the person wrote stays");
  const additive = { ...ctx, fields: { ...ctx.fields, a: { ...ctx.fields.a, additive: true } } };
  assert.equal(ChartSpec.edit(ChartSpec.make(cand("mean-bar", ["grp", "a"]), additive), { fn: "sum" }, additive).annotation.title, "Sum of a by grp");
  const heat = ChartSpec.edit(ChartSpec.edit(ChartSpec.make(cand("count-heatmap", ["grp", "many"]), ctx), { top: 3 }, ctx), { swap: true }, ctx);
  assert.deepEqual([heat.encoding.x.field, heat.transform.find((t) => t.id === "top:x").n, heat.transform.find((t) => t.id === "top:y").n], ["many", 12, 3], "levels kept move with their field");
  const hist = ChartSpec.edit(ChartSpec.make(cand("histogram", ["b"]), ctx), { bins: 12 }, ctx);
  assert.deepEqual(hist.transform.find((t) => t.id === "bin:x"), { id: "bin:x", op: "bin", channel: "x", method: "set", bins: 12 });
  assert.equal(spec.edits.length, 0, "the original is never changed");
});

/* ---------- fixed rules ---------- */

test("Student's t quantiles match published values; a mean's interval is mean ± t·sd/√n", () => {
  const cases = [[1, 12.7062], [2, 4.3027], [5, 2.5706], [10, 2.2281], [30, 2.0423], [120, 1.9799], [1000, 1.9623]];
  for (const [df, want] of cases) assert.ok(Math.abs(Charts.tQuantile(0.975, df) - want) < 5e-4, `t(0.975, ${df}) = ${Charts.tQuantile(0.975, df)}`);
  const ci = Charts.meanInterval(11, 10, 2);
  assert.ok(Math.abs(ci.hi - (10 + 2.2281 * (2 / Math.sqrt(11)))) < 1e-3);
  assert.deepEqual(Charts.meanInterval(1, 10, NaN), { lo: null, hi: null }, "one value has no interval");
});

test("Freedman–Diaconis bins, kept within 5 to 100", () => {
  assert.equal(Charts.fdBins(1000, 0, 100, 25, 75).bins, Math.ceil(100 / (2 * 50 * 1000 ** (-1 / 3))));
  assert.equal(Charts.fdBins(8, 0, 100, 40, 60).bins, 5, "never fewer than 5");
  assert.equal(Charts.fdBins(1e6, 0, 1e6, 499000, 501000).bins, 100, "never more than 100");
  assert.equal(Charts.fdBins(100, 0, 10, 5, 5).bins, 100, "no spread between the quartiles: the most bins");
});

test("time periods: the coarsest giving at least 20, at most 500; values too coarse to place are counted", () => {
  const day = 86400, t0 = Date.UTC(2024, 0, 1) / 1000;
  const range = (days, extra = {}) => ({ lo: t0, hi: t0 + days * day, n: 100, p_year: 0, p_month: 0, ...extra });
  assert.equal(Charts.choosePeriod(range(730), "day").unit, "month", "two years by month: 24 periods");
  assert.equal(Charts.choosePeriod(range(40 * 365), "day").unit, "year");
  assert.equal(Charts.choosePeriod(range(200), "day").unit, "week", "about 29 weeks");
  assert.equal(Charts.choosePeriod(range(100), "day").unit, "day", "15 weeks are too few: by day");
  assert.equal(Charts.choosePeriod(range(25), "day").unit, "day");
  assert.equal(Charts.choosePeriod(range(5), "day").unit, "day", "a date has no hours");
  assert.equal(Charts.choosePeriod(range(5), "time").unit, "hour");
  assert.equal(Charts.choosePeriod(range(5), "year").unit, "year", "years are counted by year only");
  assert.equal(Charts.choosePeriod(range(730), "day", "quarter").unit, "quarter", "the person's choice");
  const mixed = Charts.choosePeriod(range(730, { p_year: 40 }), "mixed");
  assert.equal(mixed.unit, "year", "40% known only to the year: by year, so none is left out");
  const few = Charts.choosePeriod(range(730, { p_year: 3 }), "mixed");
  assert.deepEqual([few.unit, few.unplaced], ["month", 3], "3% known only to the year: by month, those 3 counted as not placed");
  assert.ok(Charts.choosePeriod(range(20000), "time", "hour").periods.length <= 501, "never more than 500 periods");
  assert.equal(Charts.floorPeriod(Date.UTC(2024, 0, 3, 12) / 1000, "week"), Date.UTC(2024, 0, 1) / 1000, "weeks start on Monday");
  const long = { lo: Render.utc(1100), hi: Render.utc(2000), n: 900, p_year: 0, p_month: 0 };
  const decades = Charts.choosePeriod(long, "day");
  assert.deepEqual([decades.unit, decades.asked, decades.periods.length], ["decade", "year", 91], "901 years would be more than 500 periods: by decade");
  assert.equal(Charts.choosePeriod({ ...long, lo: Render.utc(-3000) }, "day").unit, "century");
  assert.equal(Render.utc(50) < Render.utc(1950), true, "the year 50 is not 1950");
  assert.equal(Charts.floorPeriod(Date.UTC(1965, 0, 3) / 1000, "week"), Date.UTC(1964, 11, 28) / 1000, "a Sunday before 1970 belongs to the Monday before it");
  assert.equal(Charts.floorPeriod(Date.UTC(1969, 11, 29) / 1000, "week"), Date.UTC(1969, 11, 29) / 1000);
  assert.equal(Render.timeLabel(Render.utc(1850), "decade"), "1850–1859");
});

/* ---------- drawing ---------- */

test("text metrics, ticks and timeline lanes", () => {
  assert.equal(Render.WIDTHS.length, 95, "a width for every character from space to ~");
  assert.ok(Math.abs(Render.textWidth("Hello", 10) - (((722 + 556 + 222 + 222 + 556) / 1000) * 10 * 25.4) / 72) < 1e-9);
  assert.deepEqual(Render.linearTicks(0, 100, 5).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(Render.logTicks(0, 3), [0, 1, 2, 3], "powers of ten over three decades");
  assert.deepEqual(Render.logTicks(0, 1).map((v) => Math.round(10 ** v)), [1, 2, 5, 10]);
  assert.deepEqual(Render.timeTicks(Date.UTC(2020, 0, 1) / 1000, Date.UTC(2026, 0, 1) / 1000, 7).ticks.map((t) => new Date(t * 1000).getUTCFullYear()), [2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  const lanes = Render.lanes([{ x0: 0, x1: 10 }, { x0: 5, x1: 12 }, { x0: 11, x1: 20 }, { x0: 6, x1: 9 }], 2, 1);
  assert.deepEqual(lanes.map((l) => [l.lane, l.crowded]), [[0, false], [1, false], [0, false], [1, true]], "first fit, then the lane that frees first, marked crowded");
  assert.equal(Render.fit("a long label here", 7, 10).endsWith("…"), true);
});

/** Data as src/charts.js computes it, for each kind, to draw without the engine. */
function computed(kind) {
  const facts = { rows: 30, used: 28, left: 2, sample: null, scatterSample: null, notes: [], period: null, levelsOther: null };
  const t0 = Date.UTC(2026, 0, 1) / 1000, day = 86400;
  const periods = Array.from({ length: 30 }, (_, i) => t0 + i * day);
  switch (kind) {
    case "histogram": return { kind, facts, facets: null, x: { lo: 0, hi: 10, width: 1, bins: 10, rule: "freedman-diaconis" }, panels: [{ facet: null, counts: [1, 2, 4, 6, 5, 4, 3, 2, 1, 0] }] };
    case "box": return { kind, facts, facets: null, panels: [{ facet: null, boxes: [{ group: null, n: 28, mean: 5, q1: 3, med: 5, q3: 7, wlo: 1, whi: 9, outn: 1, outliers: [{ x: 15, n: 1 }] }] }] };
    case "scatter": return { kind, facts, facets: null, x: { lo: 0, hi: 10 }, y: { lo: -3, hi: 3 }, panels: [{ facet: null, xs: [1, 2, 3, 9], ys: [-3, 0, 1, 3] }] };
    case "mean-bar": return { kind, facts, facets: null, groups: ["x", "y", "z"], other: null, fn: "mean", panels: [{ facet: null, bars: [{ group: "x", n: 10, value: 2, lo: 1, hi: 3 }, { group: "y", n: 10, value: -1, lo: -2, hi: 0 }, { group: "z", n: 8, value: 4, lo: null, hi: null }] }] };
    case "count-series": return { kind, facts, facets: null, unit: "day", periods, panels: [{ facet: null, series: periods.map((p, i) => ({ p, n: i % 4 })) }] };
    case "point-timeline": return { kind, facts, facets: null, zone: "none", precision: "mixed", page: { page: 1, pages: 1, size: 500, events: 3, merged: 1 }, panels: [{ facet: null }],
      events: [{ label: "Treaty", t: Date.UTC(1850, 0, 1) / 1000, p: "year", q: true, raw: "c. 1850", n: 1 }, { label: "Bridge", t: Date.UTC(1851, 2, 1) / 1000, p: "month", q: false, raw: "1851-03", n: 3 },
        { label: "Railway", t: Date.UTC(1855, 5, 1) / 1000, p: "day", q: false, raw: "1855-06-01", n: 1 }] };
    default: throw new Error(kind);
  }
}

test("the SVG writer: millimetre size, every label a <text>, no NaN, a title and a description, a sample stated on the figure", () => {
  const ctx = context();
  const kinds = { histogram: ["b"], box: ["b"], scatter: ["a", "b"], "mean-bar": ["grp", "b"], "count-series": ["day"], "point-timeline": ["day", "note"] };
  for (const [kind, fields] of Object.entries(kinds)) {
    const spec = ChartSpec.make(cand(kind, fields), ctx);
    if (kind === "scatter") spec.scale.x.type = "linear";
    const out = Render.render(spec, computed(kind));
    assert.match(out.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="180mm" height="(110|140)mm" viewBox="0 0 180 (110|140)"/, kind);
    assert.doesNotMatch(out.svg, /NaN|undefined|Infinity/, kind);
    assert.ok((out.svg.match(/<text /g) ?? []).length >= 5, `${kind}: labels are text`);
    assert.match(out.svg, /<title id="[^"]+-t">/);
    assert.match(out.desc, /28 of 30 rows of small; 2 left out with a value missing or not read\./);
    assert.equal((out.svg.match(/<svg/g) ?? []).length, (out.svg.match(/<\/svg>/g) ?? []).length);
  }
  const timeline = Render.render(ChartSpec.make(cand("point-timeline", ["day", "note"]), ctx), computed("point-timeline"));
  assert.match(timeline.svg, /<pattern id="hatch-/, "dates known only to the year or month draw as hatched spans");
  assert.match(timeline.svg, /Bridge \(1851-03\) ×3/, "merged duplicates carry their count");
  assert.match(timeline.svg, /Treaty \(c\. 1850\)/, "the date as written, with its qualifier");
  const sampled = ChartSpec.make(cand("scatter", ["a", "b"]), { ...ctx, sample: { rows: 300, seed: 7 } });
  sampled.scale.x.type = "linear";
  const data = computed("scatter");
  data.facts = { ...data.facts, scatterSample: { rows: 50000, seed: 20261005, of: 120000 } };
  const svg = Render.render(sampled, data).svg;
  assert.match(svg, /Sample: the table holds a seeded sample of 300 rows \(seed 7\); Sample: 50,000 of 120,000 points drawn \(seed 20261005\)/);
  const mean = Render.render(ChartSpec.make(cand("mean-bar", ["grp", "b"]), ctx), computed("mean-bar")).svg;
  assert.match(mean, />n = 10</, "n under each group");
});

test("heatmap colours: one blue from light to dark, and cell text that stays legible", () => {
  assert.equal(Render.shade(0, 10), "#ffffff", "an empty cell is paper");
  assert.equal(Render.shade(1, 10), Render.SEQUENTIAL[1]);
  assert.equal(Render.shade(10, 10), Render.SEQUENTIAL[Render.SEQUENTIAL.length - 1]);
  const contrast = (a, b) => { const [x, y] = [Render.luminance(a), Render.luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  assert.ok(contrast(Render.COLOR.mark, "#ffffff") >= 3, "marks reach 3:1 on the paper");
  assert.ok(contrast(Render.COLOR.other, "#ffffff") >= 3, "Other reaches 3:1 too");
  assert.ok(contrast(Render.COLOR.muted, "#ffffff") >= 4.5, "captions reach 4.5:1");
});

test("the record and the deck state each table's chart accounting", () => {
  const snapshot = {
    engine: { duckdb: "v1.5.4", duckdbWasm: "1.33.1-dev57.0", budget: "2.0 GiB" }, pieces: [{ n: 3, title: "Statistics and ranking" }], log: [],
    tables: [{ name: "planted", file: { name: "planted.csv", sha256: "ab" }, rows: 2000, columns: 15, status: "complete", sample: null, columnsKept: null, rejected: { count: 0, examples: [] }, notProfiled: [], profiled: [],
      charts: { grammar: "1", status: "complete", fields: { q: 7, c: 5, t: 1, l: 1 }, total: 155, valid: 154, excluded: 1, failed: 0, incomplete: 0, edited: 2 } }],
  };
  const report = Report.report(snapshot);
  assert.match(report.results[0].body, /- Charts \(grammar v1\): 155 candidates from 7 measures, 5 categories, 1 times and 1 labels; 154 valid, 1 excluded, 0 failed, 0 incomplete; 2 edited by you\./);
  const deck = parseDeck(Beamdswitch.deck(report));
  assert.ok(deck.frames.filter((f) => f.kind === "frame").every((f) => f.narration && !/[$|*_#]/.test(f.narration)));
});
