// The ranking without the engine: each penalty, unusualness and its ties, both lists' orders, redundancy clusters
// with substitute fields, the greedy distinct highlights and their count, and the findings in the record and the
// deck. Each test runs the page's own src/rank.js, src/family.js and src/report.js on small made-up families.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
/** @type {any} */ const Rank = require("../src/rank.js");
/** @type {any} */ const Family = require("../src/family.js");
/** @type {any} */ const Report = require("../src/report.js");
/** @type {any} */ const Beamdswitch = require("../beamdswitch.js");
const { parseDeck } = await import("../../../scripts/templates/beamdswitch/deck.mjs");

const classes = ["a", "b", "c", "g", "h"].map((name, position) => ({ name, position, cls: name < "g" ? "Q" : "C", levels: name === "h" ? 20 : 3 }));
const ctx = { fields: Object.fromEntries(classes.map((f) => [f.name, { cls: f.cls, levels: f.levels }])) };
const features = (over = {}) => ({ rows: 100, used: 100, complete: 1, density: null, collisions: 0, points: 0, overlapped: 0, small: 0, sample: false, ...over });
const cand = (kind, fields, over = {}) => ({ id: `t.${kind}.${fields.join(".")}`, kind, fields, outcome: "valid", spec: { annotation: { title: `${kind} of ${fields.join(" and ")}` }, transform: [] }, features: features(over) });

/** A decided family with the effects given, every member tested with the p given (default 0.5). */
function fam(effects = {}, ps = {}) {
  const members = Family.members(classes).map((m) => {
    const key = Family.keyOf(m.pattern, m.fields);
    const e = effects[m.fields.join()] ?? 0.01;
    const name = m.pattern === "monotone" ? "rho" : m.pattern === "difference" ? "omega-squared" : "Cramér's V";
    return { ...m, id: Family.hypothesisId("t", m.pattern, m.fields), key, status: "tested", p: ps[m.fields.join()] ?? 0.5, effect: { name, value: e } };
  });
  const tested = members.filter((m) => m.status === "tested");
  const adj = require("../src/stats.js").by(tested.map((m) => m.p));
  tested.forEach((m, i) => { m.adjusted = adj[i]; m.flag = adj[i] <= 0.05; });
  return { name: "t", run: 1, status: "complete", members, m: tested.length, measures: { shape: { a: { n: 100, skew: 3, kurt: 10, bc: 0.4, rare: 0, rareCount: 0 }, b: { n: 100, skew: 0.5, kurt: 0, bc: 0.4, rare: 0.004, rareCount: 0 } }, levels: {}, counts: {}, periods: {} } };
}

test("unusualness = usefulness × complete rows − penalties, each penalty as the rules say", () => {
  const f = fam({ "a,b": 0.25 });
  const keys = Family.byKey(f);
  const s = (c) => Rank.score(c, f, keys, ctx);
  assert.equal(s(cand("scatter", ["a", "b"])).unusualness, 0.5, "|rho| 0.25 against 0.5");
  assert.equal(s(cand("scatter", ["a", "b"], { complete: 0.8, used: 80 })).unusualness, 0.4, "times the share of complete rows");
  const rules = (c) => s(c).penalties.map((p) => [p.rule, p.amount]);
  assert.deepEqual(rules(cand("binned-heatmap", ["a", "b"], { density: 0.15 })), [["density", 0.1]]);
  assert.deepEqual(rules(cand("scatter", ["a", "b"], { collisions: 5 })), [["collisions", 0.3]], "0.1 a collision, at most 0.3");
  assert.deepEqual(rules(cand("box-by-group", ["h", "a"])), [["categories", 0.1]], "a category of 20 levels");
  assert.deepEqual(rules(cand("scatter", ["a", "b"], { points: 100, overlapped: 60 })), [["overplotting", 0.1]]);
  assert.deepEqual(rules(cand("mean-bar", ["g", "a"], { small: 1 })), [["small groups", 0.2]]);
  assert.deepEqual(rules(cand("scatter", ["a", "b"], { complete: 0.6, used: 60 })), [["missing", 0.2]], "more than 30% missing");
  assert.deepEqual(rules(cand("scatter", ["a", "b"], { sample: true })), [["sample", 0.05]]);
  assert.equal(s(cand("histogram", ["a"])).usefulness.name, "skewness", "|skewness| 3 against 2: usefulness 1");
  assert.equal(s(cand("histogram", ["a"])).usefulness.score, 1);
  assert.equal(s(cand("point-timeline", ["a", "b"])).usefulness.score, 0, "timelines have no effect measure");
});

test("the lists: unusual by unusualness with ties by id; supported by adjusted p, then usefulness; a chart may be in both", () => {
  const f = fam({ "a,b": 0.9, "a,c": 0.9, "b,c": 0.1 }, { "a,b": 1e-9, "a,c": 1e-9, "b,c": 1e-6 });
  const list = [cand("scatter", ["b", "c"]), cand("scatter", ["a", "c"]), cand("scatter", ["a", "b"]), cand("histogram", ["b"])];
  const r = Rank.rank(list, f, { ctx, classes, highlights: 6 });
  assert.deepEqual(r.unusual, ["t.scatter.a.b", "t.scatter.a.c", "t.histogram.b", "t.scatter.b.c"], "two at 1, ties by id; skewness 0.5 gives 0.25; rho 0.1 gives 0.2");
  assert.deepEqual(r.supported, ["t.scatter.a.b", "t.scatter.a.c", "t.scatter.b.c"]);
  assert.equal(r.places.unusual.get("t.scatter.b.c"), 4);
  assert.equal(r.places.supported.get("t.scatter.b.c"), 3);
});

test("redundancy: one cluster per hypothesis, fields that substitute count as one, and highlights skip a chosen cluster or two shared fields", () => {
  const f = fam({ "a,b": 0.97, "a,c": 0.4, "b,c": 0.4 });
  const list = [cand("histogram", ["a"]), cand("box", ["a"]), cand("histogram", ["b"]), cand("scatter", ["a", "c"]), cand("binned-heatmap", ["a", "c"]), cand("scatter", ["b", "c"])];
  const r = Rank.rank(list, f, { ctx, classes, highlights: 6 });
  const cl = (id) => r.entries.get(id).cluster;
  assert.equal(cl("t.histogram.a"), cl("t.box.a"), "histogram and box plot of one field: one hypothesis");
  assert.equal(cl("t.histogram.a"), cl("t.histogram.b"), "a and b substitute (|rho| 0.97)");
  assert.equal(cl("t.scatter.a.c"), cl("t.binned-heatmap.a.c"));
  assert.equal(cl("t.scatter.a.c"), cl("t.scatter.b.c"), "b stands for a");
  assert.deepEqual(r.substitutes.map((x) => x.fields), [["a", "b"]]);
  assert.deepEqual(r.highlights.unusual.map((id) => cl(id)), [...new Set(r.highlights.unusual.map((id) => cl(id)))], "one chart a cluster");
  assert.equal(r.highlights.unusual.length, 2);
  assert.equal(r.fewer.unusual, 2, "fewer than 6 distinct, and the count says so");
  const two = Rank.distinct([{ id: "1", cluster: "x", fields: ["a", "b", "l"] }, { id: "2", cluster: "y", fields: ["a", "b", "m"] }, { id: "3", cluster: "z", fields: ["a", "c", "m"] }], 6);
  assert.deepEqual(two.map((e) => e.id), ["1", "3"], "the second shares two fields with the first");
  assert.equal(Rank.highlightCount(99), 50);
  assert.equal(Rank.highlightCount(-1), 0);
  assert.equal(Rank.highlightCount(undefined), 6);
});

test("an unbounded shift scores 1 and reads as unbounded; field names with commas never share a cluster", () => {
  const step = [...Array(34).fill(2), ...Array(6).fill(4)];
  const counts = Family.describeSeries({ unit: "day" }, step);
  assert.equal(counts.shiftSd, Infinity, "no noise about the two levels");
  const f = fam();
  f.measures.counts.t = counts;
  const tc = [{ name: "t", position: 9, cls: "T", levels: 40 }];
  const c = cand("count-series", ["t"]);
  const r = Rank.rank([c], f, { ctx: { fields: { t: { cls: "T", levels: 40 } } }, classes: tc });
  assert.equal(r.entries.get(c.id).usefulness.score, 1);
  assert.match(Rank.explain(c, r, f).observed[0], /the largest shift is unbounded long-run SD, from 2 to 4 rows a day/);
  const subs = { of: (/** @type {string} */ n) => n };
  assert.notEqual(Rank.clusterOf({ kind: "scatter", fields: ["a,b", "c"] }, subs).id, Rank.clusterOf({ kind: "scatter", fields: ["a", "b,c"] }, subs).id);
});

test("the record and the deck carry the family's counts and each list's highlights, with names only in list items", () => {
  const snapshot = {
    engine: { duckdb: "v1.5.4", duckdbWasm: "1.33.1-dev57.0", budget: "2.0 GiB" }, pieces: [{ n: 4, title: "Publication figures" }], log: [],
    tables: [{ name: "planted", file: { name: "planted.csv", sha256: "ab" }, rows: 2000, columns: 15, status: "complete", sample: null, columnsKept: null, rejected: { count: 0, examples: [] }, notProfiled: [], profiled: [],
      charts: { grammar: "1", status: "complete", fields: { q: 7, c: 5, t: 1, l: 1 }, total: 155, valid: 155, excluded: 0, failed: 0, incomplete: 0, edited: 0 },
      findings: { status: "complete", family: { name: "planted", run: 1, status: "complete", catalogue: "1", size: 80, m: 62, notTested: 18, flagged: 2, study: { independent: "unknown" } },
        unusual: { charts: 155, highlighted: ["Rows by region", "odd | name"] }, supported: { charts: 4, highlighted: ["Rows by dose and response"], adjusted: [0] } } }],
  };
  const report = Report.report(snapshot);
  const body = report.results[0].body;
  assert.match(body, /- Findings \(catalogue v1\), family planted, run 1: 80 hypotheses, 62 tested, 18 not tested; 2 with an adjusted p-value at or below 0\.05 \(Benjamini–Yekutieli\); independence assumed, not confirmed\./);
  assert.match(body, /- Unusual patterns \(155 charts\), highlighted: Rows by region; odd \\\| name\./);
  assert.match(body, /- Statistically supported patterns \(4 charts\), highlighted: Rows by dose and response \(adjusted p-value < 1e-300\)\./);
  assert.match(report.results[0].narration, /tested 62 hypotheses, and 2 have an adjusted p value at or below 0\.05, which is exploratory evidence, not proof\./);
  assert.doesNotMatch(report.results[0].narration, /region|dose/);
  const deck = parseDeck(Beamdswitch.deck(report));
  assert.ok(deck.frames.filter((f) => f.kind === "frame").every((f) => f.narration && !/[$|*_#]/.test(f.narration)));
  const said = (study) => Report.report({ ...snapshot, tables: [{ ...snapshot.tables[0], findings: { ...snapshot.tables[0].findings, family: { ...snapshot.tables[0].findings.family, study } } }] }).results[0].body;
  assert.match(said({ independent: "no" }), /the tests of independent rows are off, as the study details say/);
  assert.match(said({ independent: "unknown", repeated: "field:region" }), /the tests of independent rows are off/);
  assert.match(said({ independent: "yes" }), /independence stated by you/);
});
