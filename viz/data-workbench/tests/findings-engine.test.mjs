// Statistics and ranking with the pinned engine, through the page's own pipeline (Charts.prepare, Charts.evaluate,
// Family.run, Rank.rank): the page's SQL gives the reference statistics of SciPy, statsmodels and pymannkendall; the
// planted example's patterns appear in the unusual-pattern list with explanations, and its tested effects in the
// statistically supported list; each hypothesis is identified once; independence checks and study details turn tests
// off with their reasons; the ranking's rejection rules exclude charts with their reasons; a subset is a family of its own.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { engine } from "./engine.mjs";
import { close, num } from "./stats-helpers.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Family = require("../src/family.js");
/** @type {any} */ const Rank = require("../src/rank.js");
/** @type {any} */ const Stats = require("../src/stats.js");

const ref = JSON.parse(readFileSync(new URL("fixtures/stats-reference.json", import.meta.url), "utf8"));
const e = await engine();
let files = 0;

/** Import and profile CSV text as a table, then prepare its charts, as the page does. */
async function load(name, text) {
  const path = e.register(`${name}.csv`, new TextEncoder().encode(text));
  const imported = await Profile.importFile(e.query, { kind: "csv", path, table: name, n: ++files });
  const profile = await Profile.profileTable(e.query, { table: name, rowColumn: imported.rowColumn, columns: imported.columns });
  return { profile, ...Charts.prepare({ name, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns: profile.columns }) };
}

/** Every candidate's outcome, with the features the ranking reads. */
async function charts(t) {
  const out = [];
  for (const c of t.plan.candidates) {
    const spec = ChartSpec.make(c, t.ctx);
    const r = await Charts.evaluate(e.query, spec, t.ctx);
    out.push({ ...c, spec, outcome: r.outcome, reason: r.reason, facts: r.data?.facts, features: r.outcome === "valid" ? Rank.features(spec, r.data, r.drawn) : null });
  }
  return out;
}

/** The table's family, as the page runs it. */
const family = (t, o = {}) => Family.run(e.query, { table: t.ctx.table, name: o.name ?? t.ctx.table, run: 1, ctx: t.ctx, classes: t.classes, columns: t.profile.columns, ...o });

const csv = (head, rows) => `${head.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}\n`;
const near = (got, want, what, rel = 1e-7, abs = 1e-12) => assert.ok(close(got, num(want), rel, abs), `${what}: ${got}, the reference ${want}`);
const member = (fam, pattern, fields) => fam.members.find((m) => m.pattern === pattern && m.fields.join() === fields.join());

// Every table the tests share is loaded before the first test starts: the engine runs one query at a time.
const planted = await load("planted", Examples.planted());
const plantedCharts = await charts(planted);
const plantedFamily = await family(planted);

test("the page's SQL gives the reference statistics: Spearman, Welch's t and ANOVA, chi-square, Fisher, permutation, Mann–Kendall, the level shift, skewness and kurtosis", async () => {
  const tested = { T2: 0, T3: 0 };
  // Numbers with 12 or fewer distinct values are levels (C), not measures: only the larger cases are pairs of measures.
  for (const [i, c] of ref.spearman.filter((x) => x.n >= 13).entries()) {
    const t = await load(`sp_${i}`, csv(["x", "y"], c.x.map((x, j) => [x, c.y[j]])));
    const m = member(await family(t), "monotone", ["x", "y"]);
    near(m.measured.rho, c.rho, `${c.name}: rho`, 1e-10);
    near(m.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
  }
  for (const [i, c] of ref.welch.entries()) {
    const t = await load(`we_${i}`, csv(["grp", "x"], [...c.a.map((x) => ["a", x]), ...c.b.map((x) => ["b", x])]));
    const m = member(await family(t), "difference", ["grp", "x"]);
    // A small group needs support for normality (|skewness| at most 1); the reference data need not have it.
    if (!m.test) { assert.match(m.reason, /no support for normality/); continue; }
    tested.T2 += 1;
    assert.equal(m.test, "T2", m.reason);
    const flip = m.groups[0] === "a" ? 1 : -1;
    near(flip * m.result.statistic.value, c.t, `${c.name}: t`, 1e-10);
    near(m.result.df[0], c.df, `${c.name}: df`, 1e-10);
    near(m.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
  }
  for (const [i, c] of ref.anova.entries()) {
    const t = await load(`an_${i}`, csv(["grp", "x"], c.groups.flatMap((g, k) => g.map((x) => [`g${k}`, x]))));
    const m = member(await family(t), "difference", ["grp", "x"]);
    if (!m.test) { assert.match(m.reason, /no support for normality/); continue; }
    tested.T3 += 1;
    assert.equal(m.test, "T3", m.reason);
    near(m.result.statistic.value, c.f, `${c.name}: F`, 1e-9);
    near(m.result.df[1], c.df[1], `${c.name}: df2`, 1e-9);
    near(m.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(m.effect.value, c.omega, `${c.name}: omega-squared`, 1e-9);
  }
  assert.ok(tested.T2 >= 1 && tested.T3 >= 1, `the engine's Welch tests matched the references: ${JSON.stringify(tested)}`);
  const expand = (table) => table.flatMap((r, i) => r.flatMap((n, j) => Array.from({ length: n }, () => [`r${i}`, `c${j}`])));
  for (const [i, c] of ref.chiSquare.entries()) {
    const m = member(await family(await load(`ch_${i}`, csv(["row_level", "col_level"], expand(c.table)))), "association", ["row_level", "col_level"]);
    assert.equal(m.test, "T4", m.reason);
    near(m.result.statistic.value, c.x2, `${c.name}: chi-square`, 1e-10);
    near(m.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(m.effect.value, c.v, `${c.name}: V`, 1e-9);
  }
  const fisher = member(await family(await load("fi", csv(["row_level", "col_level"], expand(ref.fisher[0].table)))), "association", ["row_level", "col_level"]);
  assert.equal(fisher.test, "T5", "a 2 × 2 table failing T4's rule takes Fisher's exact test");
  near(fisher.p, ref.fisher[0].p, "Fisher: p", 1e-9);
  const perm = member(await family(await load("pe", csv(["row_level", "col_level"], expand(ref.permutation[0].table)))), "association", ["row_level", "col_level"]);
  assert.equal(perm.test, "T6", "a sparse 3 × 3 table takes the permutation test");
  assert.ok(Math.abs(perm.p - ref.permutation[0].p) <= 4 * Math.sqrt(perm.result.mcse ** 2 + ref.permutation[0].se ** 2), `permutation p ${perm.p}`);
  assert.match(perm.note, /T4's rule fails/);
  // A series of one value a month reads as the period means of the mean time series.
  const month = (k) => `${2000 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}-15`;
  for (const c of [ref.mannKendall[0], ref.mannKendall[1]]) {
    const t = await load(`mk_${c.x.length}`, csv(["day", "x"], c.x.map((x, k) => [month(k), x])));
    const m = member(await family(t), "trend", ["day", "x"]);
    assert.equal(m.unit, "month");
    near(m.result.s, c.s, `${c.name}: S`);
    near(m.p, c.p, `${c.name}: p`, 1e-8, 1e-12);
    near(m.result.slope.value, c.slope, `${c.name}: Sen's slope`, 1e-9);
  }
  const shift = ref.levelShift[2];
  const ts = member(await family(await load("ls", csv(["day", "x"], shift.x.map((x, k) => [month(k), x])))), "shift", ["day", "x"]);
  near(ts.result.statistic.value, shift.statistic, `${shift.name}: CUSUM`, 1e-9);
  near(ts.p, shift.p, `${shift.name}: p`, 1e-9, 1e-15);
  for (const [i, c] of ref.shape.entries()) {
    const s = (await family(await load(`sh_${i}`, csv(["x", "y"], c.x.map((x, k) => [x, k % 7]))))).measures.shape.x;
    near(s.skew, c.skew, `${c.name}: skewness (the engine's)`, 1e-9);
    near(s.kurt, c.kurt, `${c.name}: excess kurtosis (the engine's)`, 1e-9);
  }
});

test("discovery: the planted patterns lead the unusual-pattern list, the tested effects are statistically supported, and every highlight is explained", async () => {
  const ranked = Rank.rank(plantedCharts, plantedFamily, { ctx: planted.ctx, classes: planted.classes, highlights: 6 });
  const place = (id) => ranked.places.unusual.get(id);
  const planted5 = ["planted.bar.region", "planted.histogram.weight", "planted.scatter.dose.response", "planted.box-by-group.segment.score", "planted.mean-series.order_date.sales"];
  for (const id of planted5) {
    assert.ok(place(id) <= 12, `${id} is at place ${place(id)} of ${ranked.unusual.length}`);
    assert.equal(ranked.entries.get(id).unusualness, 1, `${id}: unusualness 1`);
  }
  assert.deepEqual(ranked.supported.slice(0, 4).sort(), ["planted.binned-heatmap.dose.response", "planted.box-by-group.segment.score", "planted.mean-bar.segment.score", "planted.scatter.dose.response"]);
  assert.equal(ranked.highlights.unusual.length, 6);
  assert.ok(ranked.highlights.unusual.includes("planted.bar.region"), "the rare region is highlighted");
  assert.deepEqual(ranked.highlights.supported, ["planted.binned-heatmap.dose.response", "planted.box-by-group.segment.score"], "two distinct supported patterns");
  assert.deepEqual(ranked.fewer.supported, 2, "fewer than 6 distinct exist, and the count says so");
  for (const id of [...ranked.highlights.unusual, ...ranked.highlights.supported]) {
    const x = Rank.explain(plantedCharts.find((c) => c.id === id), ranked, plantedFamily);
    assert.ok(x.observed.length && x.why.length && x.cautions.length && x.status.length, `${id} is explained`);
    assert.ok(x.observed.every((l) => !/usefulness|unusualness|penalt/i.test(l)), `${id}: Observed holds the numbers, not the rule scores`);
    assert.match(x.why[0], /^Unusualness /);
    assert.ok(x.cautions.every((l) => !/\bcaus(es|ed)\b/.test(l.replace("not a cause", ""))), `${id}: no causal claim`);
  }
  const region = Rank.explain(plantedCharts.find((c) => c.id === "planted.bar.region"), ranked, plantedFamily);
  assert.match(region.observed[0], /the rarest, Atlantis, holds 0\.5% of 2,000 rows/);
  const score = Rank.explain(plantedCharts.find((c) => c.id === "planted.box-by-group.segment.score"), ranked, plantedFamily);
  assert.match(score.status[0], /Welch's two-sample t-test \(T2\).*adjusted p-value .*: exploratory evidence.*Independence assumed, not confirmed\./);
  assert.ok(score.cautions.includes(Rank.CAUTIONS.cause) && score.cautions.includes(Rank.CAUTIONS.third));
  // Highlights are distinct: no two share a cluster or more than one field.
  for (const list of [ranked.highlights.unusual, ranked.highlights.supported]) {
    const es = list.map((id) => ranked.entries.get(id));
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      assert.notEqual(es[i].cluster, es[j].cluster);
      assert.ok(es[i].fields.filter((f) => es[j].fields.includes(f)).length <= 1);
    }
  }
  // The -999 stand-ins of temp_c are suspected errors, left out of the statistics and counted, never a pattern.
  assert.equal(plantedFamily.measures.shape.temp_c.n, 1995);
  assert.deepEqual(plantedFamily.sentinels.temp_c, [-999]);
  assert.ok(ranked.entries.get("planted.histogram.temp_c").unusualness < 0.2, "the stand-ins do not make temp_c unusual");
  const temp = Rank.explain(plantedCharts.find((c) => c.id === "planted.histogram.temp_c"), ranked, plantedFamily, { errors: { temp_c: { count: 5, sentinels: 5 } } });
  assert.ok(temp.cautions.some((c) => /Possible data error: temp_c holds 5 suspected data errors.*left out of these numbers/.test(c)));
  // A dismissed stand-in is a value again: the statistics use it.
  const kept = await family(planted, { dismissed: ["temp_c::sentinel::-999"] });
  assert.equal(kept.measures.shape.temp_c.n, 2000);
  assert.deepEqual(kept.sentinels, {});
  // The person's count: none, or as many as exist.
  assert.deepEqual(Rank.rank(plantedCharts, plantedFamily, { ctx: planted.ctx, classes: planted.classes, highlights: 0 }).highlights, { unusual: [], supported: [] });
  const all = Rank.rank(plantedCharts, plantedFamily, { ctx: planted.ctx, classes: planted.classes, highlights: 50 });
  assert.equal(all.highlights.unusual.length, 50);
  assert.equal(all.fewer.supported, 2, "fewer distinct than asked, stated");
});

test("hypotheses once: the family is enumerated from the classes, each hypothesis has one id, and every chart's hypothesis is in it", async () => {
  const fam = plantedFamily;
  assert.deepEqual(fam.counts, { q: 7, c: 5, t: 1 });
  assert.equal(fam.members.length, Family.size(fam.counts));
  assert.equal(fam.members.length, 21 + 35 + 10 + 14, "C(7,2) + 7·5 + C(5,2) + 2·1·7");
  assert.equal(new Set(fam.members.map((m) => m.id)).size, fam.members.length, "every id is distinct");
  assert.equal(new Set(fam.members.map((m) => m.key)).size, fam.members.length, "every pattern and field set is distinct");
  assert.deepEqual(fam.members.map((m) => [m.pattern, m.fields]), Family.members(planted.classes).map((m) => [m.pattern, m.fields]), "enumerated from the classes before any data");
  const again = await family(planted, { run: 2 });
  assert.deepEqual(again.members.map((m) => m.id), fam.members.map((m) => m.id), "ids do not change between runs");
  const ranked = Rank.rank(plantedCharts, fam, { ctx: planted.ctx, classes: planted.classes });
  const ids = new Set(fam.members.map((m) => m.id));
  const scatter = ranked.entries.get("planted.scatter.dose.response"), heat = ranked.entries.get("planted.binned-heatmap.dose.response");
  assert.deepEqual(scatter.hypotheses, heat.hypotheses, "the scatter plot and the binned heatmap of one pair test one hypothesis");
  assert.equal(scatter.cluster, heat.cluster);
  assert.equal(ranked.entries.get("planted.mean-series.order_date.sales").hypotheses.length, 2, "a mean time series shows a trend and a level shift");
  for (const e of ranked.entries.values()) for (const h of e.hypotheses) assert.ok(ids.has(h), `${e.id}: ${h} is in the family`);
  const tested = fam.members.filter((m) => m.status === "tested");
  assert.equal(fam.m, tested.length, "m counts the tests that ran");
  assert.ok(fam.members.filter((m) => m.status !== "tested").every((m) => m.reason.startsWith("Not tested") && m.adjusted === null), "not-tested members have a reason and no adjusted p-value");
  assert.deepEqual(tested.map((m) => m.adjusted), Stats.by(tested.map((m) => m.p)), "one Benjamini–Yekutieli adjustment over the family");
  assert.equal(Family.hypothesisId("planted", "monotone", ["response", "dose"]), Family.hypothesisId("planted", "monotone", ["dose", "response"]), "sorted fields");
  assert.notEqual(Family.hypothesisId("planted", "trend", ["order_date", "sales"]), Family.hypothesisId("planted", "shift", ["order_date", "sales"]));
});

test("independence: a repeated identifier and serial correlation turn the tests of independent rows off; study details decide again", async () => {
  // Planted: sales shifts in time, so its lag-1 autocorrelation in order_date order contradicts independence.
  const sales = member(plantedFamily, "monotone", ["dose", "sales"]);
  assert.match(sales.reason, /^Not tested: independence contradicted\. sales has a lag-1 autocorrelation of 0\.\d+ \(p < 0\.001\) in the order of order_date\.$/);
  assert.equal(member(plantedFamily, "shift", ["order_date", "sales"]).status, "tested", "T8 allows for temporal dependence");
  const u = Stats.random(9);
  const rows = Array.from({ length: 60 }, (_, i) => [`S${String(i % 15).padStart(2, "0")}`, (u() * 100).toFixed(2), (u() * 50).toFixed(2), i % 2 ? "x" : "y"]);
  const rep = await family(await load("visits", csv(["subject_id", "a", "b", "arm"], rows)));
  assert.deepEqual(rep.independence.repeated.map((r) => [r.field, r.share]), [["subject_id", 0.75]]);
  for (const m of rep.members) assert.match(m.reason, /independence contradicted\. The identifier subject_id repeats in 75% of its values/);
  const p = plantedFamily;
  const no = Family.decide(p, { independent: "no" });
  assert.ok(no.members.filter((m) => ["monotone", "difference", "association"].includes(m.pattern)).every((m) => m.reason === "Not tested: you said the observations are not independent."));
  assert.ok(no.members.filter((m) => m.pattern === "trend" || m.pattern === "shift").every((m) => m.status === "tested"));
  assert.ok(Family.decide(p, { design: "clustered" }).members.filter((m) => m.pattern === "monotone").every((m) => /clustered/.test(m.reason)));
  assert.ok(Family.decide(p, { repeated: "field:region" }).members.filter((m) => m.pattern === "difference").every((m) => /repeated measurements by region/.test(m.reason)));
  assert.equal(member(Family.decide(p, { repeated: "none" }), "monotone", ["dose", "response"]).status, "tested", "no repeated measurements: the tests run");
  const yes = Family.decide(p, { independent: "yes" });
  assert.equal(member(yes, "monotone", ["dose", "response"]).assumption, "Independence stated by you.");
  assert.equal(member(p, "monotone", ["dose", "response"]).assumption, "Independence assumed, not confirmed.");
  assert.ok(Family.decide(p, { design: "convenience" }).cautions.some((c) => /convenience sample/.test(c)));
  assert.ok(no.m < p.m, "tests turned off leave the family's m");
});

test("rejection: fewer than 5 complete rows or one value in an encoded field excludes the chart, with its reason, before any ranking", async () => {
  const rows = [];
  for (let i = 1; i <= 20; i++) rows.push([i, "", `g${i % 3}`]);
  for (let i = 1; i <= 20; i++) rows.push(["", i * 3, `g${i % 3}`]);
  for (let i = 1; i <= 4; i++) rows.push([5, i * 7, "g0"]);
  for (let i = 1; i <= 8; i++) rows.push([i + 40, 99, "g1"]);
  const t = await load("sparse", csv(["a", "b", "grp"], rows));
  const out = await charts(t);
  const scatter = out.find((c) => c.id === "sparse.scatter.a.b");
  assert.equal(scatter.outcome, "valid", "12 complete pairs");
  const t2 = await load("sparse2", csv(["a", "b", "grp"], rows.slice(0, 44)));
  const out2 = await charts(t2);
  assert.deepEqual([out2.find((c) => c.id === "sparse2.scatter.a.b").outcome, out2.find((c) => c.id === "sparse2.scatter.a.b").reason],
    ["excluded", "Only 4 rows have a value present for every field of the chart: the ranking needs at least 5."]);
  const t3 = await load("sparse3", csv(["a", "b", "grp"], [...rows.slice(0, 40), ...Array.from({ length: 10 }, (_, i) => [7, i * 11 + 1, "g2"])]));
  const flat = (await charts(t3)).find((c) => c.id === "sparse3.scatter.a.b");
  assert.deepEqual([flat.outcome, flat.reason], ["excluded", "Zero variance: every complete row has the same a."]);
  const ranked = Rank.rank(await charts(t3), await family(t3), { ctx: t3.ctx, classes: t3.classes });
  assert.ok(!ranked.entries.has("sparse3.scatter.a.b"), "an excluded chart is never ranked");
});

test("an engine error in one member leaves the family incomplete, with its reason and no adjusted p-values", async () => {
  let spearman = 0;
  const failing = async (/** @type {string} */ sql) => {
    if (/corr\(rx, ry\)/.test(sql) && ++spearman === 3) throw new Error("Out of Memory Error: failed to allocate");
    return e.query(sql);
  };
  const fam = await Family.run(failing, { table: "planted", name: "planted", run: 9, ctx: planted.ctx, classes: planted.classes, columns: planted.profile.columns });
  assert.equal(fam.status, "incomplete");
  assert.match(fam.reason, /^the engine stopped at monotone association of price and response: Out of Memory Error/);
  assert.ok(fam.members.every((m) => m.adjusted === null), "no adjustment over part of a family");
  assert.equal(Rank.rank(plantedCharts, fam, { ctx: planted.ctx, classes: planted.classes }).supported.length, 0);
});

test("a category of more than 12 levels against a measure: not tested, described by its groups as drawn", async () => {
  const u = Stats.random(4);
  const rows = Array.from({ length: 300 }, (_, i) => [`k${String(i % 15).padStart(2, "0")}`, ((i % 15) + u() * 3).toFixed(3)]);
  const t = await load("many_levels", csv(["kind", "value"], rows));
  const m = member(await family(t), "difference", ["kind", "value"]);
  assert.equal(m.reason, "Not tested: 15 groups, more than the 12 Welch's ANOVA takes.");
  assert.equal(m.measured.groups.length, 15);
  assert.deepEqual(m.measured.drawn.map((g) => g.level).slice(-1), ["Other (3 levels)"], "12 levels and Other, as the chart draws them");
  assert.equal(m.measured.drawn.reduce((a, g) => a + g.n, 0), 300);
  assert.ok(m.effect.value > 0.5, `omega-squared over the drawn groups: ${m.effect.value}`);
});

test("a subset is a family of its own: its rows, its members without the subset field, its own ids and adjustment", async () => {
  const sub = await family(planted, { name: "planted where segment = A", subset: { field: "segment", level: "A" } });
  assert.equal(sub.members.length, Family.size({ q: 7, c: 4, t: 1 }));
  assert.ok(sub.members.every((m) => !m.fields.includes("segment")));
  const ids = new Set(plantedFamily.members.map((m) => m.id));
  assert.ok(sub.members.every((m) => !ids.has(m.id)), "a subset's hypotheses are not the table's");
  const dr = member(sub, "monotone", ["dose", "response"]);
  assert.equal(dr.measured.n, 1008, "only the rows of segment A");
  assert.ok(dr.flag);
  assert.match(sub.definition, /where segment is A/);
});
