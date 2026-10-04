// Theorem Explorer: which result to learn next: the model's own fixtures (§36) and invariants (§37). The expected values are
// calculated here by hand from the spec's formulas (sections 7, 9, 10 and 12), not read back from the model.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Model = /** @type {any} */ (require("../src/model.js"));
const D = require("../raw.json");
const VisualKit = require("../../../scripts/kit/kit.js");
const at = (/** @type {Record<string, unknown>} */ patch, data = D) => Model.derive(VisualKit.normalize(Model.FIELDS, patch).state, data);
const ix = Model.index(D);
const row = (/** @type {string} */ id) => ix.byId.get(id);

test("rubric: the three presets are the spec's weights and each adds up to 100", () => {
  assert.deepEqual(Model.PRESETS.balanced, [25, 25, 20, 15, 5, 5, 5]);
  assert.deepEqual(Model.PRESETS.practitioner, [25, 10, 35, 15, 5, 2, 8]);
  assert.deepEqual(Model.PRESETS.researcher, [25, 35, 10, 15, 5, 7, 3]);
  for (const w of Object.values(Model.PRESETS)) assert.equal(w.reduce((/** @type {any} */ s, /** @type {any} */ x) => s + x, 0), 100);
});

test("rubric: overall = sum(w r / 4); an unknown component gives no value and the 0..4 interval", () => {
  // 25*4/4 + 25*3/4 + 20*2/4 + 15*1/4 + 5*0 + 5*4/4 + 5*2/4 = 25 + 18.75 + 10 + 3.75 + 0 + 5 + 2.5 = 65
  assert.deepEqual(Model.aggregate([4, 3, 2, 1, 0, 4, 2], Model.PRESETS.balanced), { v: 65, lo: 65, hi: 65, missing: [] });
  // Practical impact unknown (weight 20): the low end puts 0 in, the high end 4.
  const u = Model.aggregate([4, 3, -1, 1, 0, 4, 2], Model.PRESETS.balanced);
  assert.equal(u.v, null);
  assert.equal(u.lo, 55);
  assert.equal(u.hi, 75);
  assert.deepEqual(u.missing, ["pra u"]);
  // A not-applicable component also makes the aggregate unknown; it never counts as 0.
  assert.equal(Model.aggregate([4, 4, 4, 4, 4, 4, -2], Model.PRESETS.balanced).v, null);
});

test("rubric: a custom view with weight 0 excludes that component, unknowns included", () => {
  const w = [30, 25, 25, 20, 0, 0, 0];
  // 30 + 25*3/4 + 25*2/4 + 20*1/4 = 30 + 18.75 + 12.5 + 5 = 66.25
  assert.equal(Model.aggregate([4, 3, 2, 1, -1, -2, -1], w).v, 66.25);
  const d = at({ preset: "custom", w_eff: 30, w_res: 25, w_pra: 25, w_rea: 20, w_hyp: 0, w_pro: 0, w_app: 0 });
  assert.deepEqual(d.excluded, ["hyp", "pro", "app"]);
});

test("rubric: custom weights that do not add up to 100 make every aggregate unknown", () => {
  const d = at({ view: "catalog", preset: "custom", w_eff: 50 });
  assert.equal(d.weightsOk, false);
  assert.ok(d.notes.some((/** @type {any} */ n) => /add up to 125/.test(n)));
  assert.equal(d.selected.score, null);
});

test("calibration: union bound, pigeonhole, Brown representability and Atiyah-Singer are present and fully scored", () => {
  for (const id of ["nm:union-bound", "nm:pigeonhole-principle", "wd:Q4975963", "wd:Q755991"]) {
    const i = row(id);
    assert.ok(i !== undefined, id);
    assert.match(ix.rows[i].s, /^[0-4]{7}$/, `${id} has seven known component scores`);
  }
  // The two elementary results have the simplest proofs; the two deep theorems do not.
  const pro = (/** @type {string} */ id) => ix.scores[row(id)][5];
  assert.ok(Math.min(pro("nm:union-bound"), pro("nm:pigeonhole-principle")) > Math.max(pro("wd:Q4975963"), pro("wd:Q755991")));
});

test("coverage: every named result is scored; only non-results stay unscored, and the counts agree", () => {
  const unscoredResults = ix.rows.filter((/** @type {any} */ r, /** @type {any} */ i) => ix.isResult[i] && /[un]/.test(r.s)).length;
  assert.equal(unscoredResults, 0);
  const nonResults = ix.rows.filter((/** @type {any} */ _, /** @type {any} */ i) => !ix.isResult[i]).length;
  assert.equal(D.coverage.named.unscored, nonResults);
  assert.equal(D.coverage.named.scored + D.coverage.named.unscored, ix.rows.length);
  // Non-results are hidden by default.
  const d = at({ view: "catalog" });
  assert.ok(d.order.every((/** @type {any} */ i) => ix.isResult[i]));
});

test("learning: priority = 100 (0.35 value + 0.25 relevance + 0.15 accessibility + 0.15 future + 0.10 effort fit)", () => {
  assert.deepEqual(Model.LEARN_WEIGHTS, { value: 0.35, relevance: 0.25, accessibility: 0.15, future_access: 0.15, effort_fit: 0.1 });
  const d = at({ view: "learn", interests: "math.PR", depth: "apply", budget: 2 });
  assert.ok(d.learn.recs.length > 0);
  for (const r of d.learn.recs.slice(0, 20)) {
    const c = r.comps;
    const lo = 100 * (0.35 * c.value[0] + 0.25 * c.relevance[0] + 0.15 * c.accessibility[0] + 0.15 * c.future_access[0] + 0.1 * c.effort_fit[0]);
    assert.ok(Math.abs(lo - r.lo) < 0.05, `${r.id}: ${lo} against ${r.lo}`);
    assert.equal(r.complete, r.lo === r.hi);
    assert.equal(r.p, r.complete ? r.lo : null);
  }
  // Sorted by priority, highest first.
  for (let k = 1; k < d.learn.recs.length; k++) assert.ok(d.learn.recs[k - 1].lo >= d.learn.recs[k].lo);
});

test("learning: with weights that add up to 125 the value term is unknown (0 to 1) and every priority is incomplete", () => {
  const d = at({ view: "learn", interests: "math.PR", depth: "apply", budget: 2, preset: "custom", w_eff: 50 });
  assert.equal(d.weightsOk, false);
  assert.ok(d.learn.recs.length > 0);
  assert.equal(d.learn.incomplete, d.learn.candidates);
  for (const r of d.learn.recs) {
    assert.deepEqual(r.comps.value, [0, 1]);
    assert.equal(r.complete, false);
    assert.equal(r.p, null);
    assert.ok(r.hi - r.lo >= 35 - 0.01, `${r.id}: ${r.lo} to ${r.hi}`);
  }
});

test("learning: a result known at the selected depth is excluded; known only at a lower depth it stays", () => {
  const id = "nm:union-bound";
  const known = (/** @type {number} */ depth) => ({ ...D, profile: { known: { [id]: depth } } });
  const apply = at({ view: "learn", depth: "apply" }, known(1));
  assert.equal(apply.learn.excludedKnown, 1);
  assert.ok(!apply.learn.candidates.some?.((/** @type {any} */ r) => r.id === id));
  const prove = at({ view: "learn", depth: "prove" }, known(1));
  assert.equal(prove.learn.excludedKnown, 0);
});

test("learning: interests that are not arXiv ids are reported, not silently used", () => {
  const d = at({ view: "learn", interests: "math.PR,not-a-category" });
  assert.ok(d.notes.some((/** @type {any} */ n) => n.includes("not-a-category")));
});

test("paths: a prerequisite cycle is detected and every edge is labelled supported or uncertain", () => {
  const data = { profile: { known: {} } };
  const fake = { pre: [[1], [2], [0]], rows: [{ id: "a" }, { id: "b" }, { id: "c" }], formalPairs: new Set(["0>1"]) };
  const p = Model.prerequisitePath(data, fake, 0);
  assert.equal(p.cycles.length, 1);
  assert.deepEqual([...p.cycles[0]].sort(), [0, 1, 2]);
  assert.deepEqual(p.edges.map((/** @type {any} */ e) => e.supported), [true, false, false]);
  // Each prerequisite comes before the result that needs it.
  const chain = { pre: [[1], [2], []], rows: [{ id: "a" }, { id: "b" }, { id: "c" }], formalPairs: new Set() };
  assert.deepEqual(Model.prerequisitePath(data, chain, 0).order, [2, 1, 0]);
  // A known result stops the path.
  assert.deepEqual(Model.prerequisitePath({ profile: { known: { b: 0 } } }, chain, 0).order, [0]);
});

test("comparisons: the tail-bound case gives the bounds of Markov, Chebyshev, Hoeffding and the exact tail", () => {
  const k = /** @type {any} */ (D.cases.cases.find((/** @type {any} */ c) => c.id === "tail-binomial"));
  assert.deepEqual(k.inputs, { n: 100, p: 0.5, t: 10 });
  const f = Model.CASE_FORMULAS;
  assert.ok(Math.abs(f.markov.calc(k.inputs) - 50 / 60) < 1e-12); // P(X >= 60) <= 50/60
  assert.ok(Math.abs(f.chebyshev.calc(k.inputs) - 0.25) < 1e-12); // 25 / 10^2
  assert.ok(Math.abs(f.hoeffding.calc(k.inputs) - Math.exp(-2)) < 1e-12); // exp(-2 * 100 / 100)
  // The exact tail P(X >= 60) for Bin(100, 1/2) is 0.028443966820490...
  assert.ok(Math.abs(f.binomial_tail.calc(k.inputs) - 0.02844396682049) < 1e-12);
  const c = Model.comparison(D, ix, "tail-binomial", Model.PRESETS.balanced);
  assert.equal(c.metric.direction, "lower");
  const ranked = c.entries.filter((/** @type {any} */ e) => e.rank).sort((/** @type {any} */ a, /** @type {any} */ b) => a.rank - b.rank);
  for (let r = 1; r < ranked.length; r++) assert.ok(ranked[r - 1].value <= ranked[r].value);
  assert.ok(c.entries.every((/** @type {any} */ e) => e.value !== null || e.excluded), "an entry with no value states why");
});

test("comparisons: the k-SAT case shows the local lemma decides where the union bound cannot", () => {
  const f = Model.CASE_FORMULAS;
  const v = { k: 10, m: 10000, d: 300 };
  assert.ok(Math.abs(f.union_condition.calc(v) - 10000 / 1024) < 1e-12); // 9.77 >= 1: no conclusion
  assert.ok(Math.abs(f.lll_symmetric.calc(v) - (Math.E * 301) / 1024) < 1e-12); // 0.799 <= 1: satisfiable
  const c = Model.comparison(D, ix, "existence-ksat", Model.PRESETS.balanced);
  const meets = Object.fromEntries(c.entries.filter((/** @type {any} */ e) => e.formula).map((/** @type {any} */ e) => [e.formula, e.meets]));
  assert.deepEqual(meets, { union_condition: false, lll_symmetric: true });
});

test("histories: each dated record has weight 1 over its categories, and a year with no record has no share", () => {
  const c = Model.core(D);
  const dated = c.uses.filter((/** @type {any[]} */ u) => u[2] === 0 && u[1] !== null).length;
  for (const flevel of ["group", "archive", "category"]) {
    const h = at({ view: "fields", fview: "application", fby: "application", flevel, mode: "retrospective" }).fields;
    const total = h.total.reduce((/** @type {number} */ s, /** @type {number} */ x) => s + x, 0);
    assert.ok(Math.abs(total - dated) < 1e-3, `${flevel}: ${total} against ${dated}`);
    assert.equal(h.keys.at(-1), "unclassified");
    h.total.forEach((/** @type {number} */ t, /** @type {number} */ j) => { if (t === 0) assert.equal(h.shares[j], null); });
    h.shares.forEach((/** @type {number[] | null} */ s) => { if (s) assert.ok(Math.abs(s.reduce((a, x) => a + x, 0) - 100) < 0.2); });
  }
});

test("histories: the utility-weighted history has no data in historical mode", () => {
  const h = at({ view: "fields", fview: "utility", mode: "historical" }).fields;
  assert.ok(h.shares.every((/** @type {any} */ s) => s === null));
  assert.match(h.note, /No data in historical mode/);
});

test("exports: CSV cells that a spreadsheet reads as formulas get an apostrophe, and quotes double", () => {
  assert.equal(Model.csvCell("=1+1"), "'=1+1");
  assert.equal(Model.csvCell("+cmd"), "'+cmd");
  assert.equal(Model.csvCell("-2"), "'-2");
  assert.equal(Model.csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(Model.csvCell('a "b", c'), '"a ""b"", c"');
  assert.equal(Model.csvCell(-2), "-2");
  assert.equal(Model.csvCell(null), "");
  const st = VisualKit.normalize(Model.FIELDS, { view: "catalog", q: "pigeonhole" }).state;
  const d = Model.derive(st, D);
  const lines = Model.csv(st, d, D).trimEnd().split("\r\n");
  assert.equal(lines.length, d.order.length + 1);
});

test("exports: the JSON export is versioned and holds no credential or home path", () => {
  const st = VisualKit.normalize(Model.FIELDS, { view: "catalog", sel: "wd:Q755991", pins: "nm:union-bound" }).state;
  const doc = Model.exportJson(st, Model.derive(st, D), D);
  assert.equal(doc.schema, Model.EXPORT_SCHEMA);
  assert.deepEqual(doc.records.map((/** @type {any} */ r) => r.id), ["wd:Q755991", "nm:union-bound"]);
  const text = JSON.stringify(doc);
  assert.doesNotMatch(text, /\/Users\/|\/home\/|C:\\\\Users|password|secret|api[_-]?key|access_token|bearer /i);
});

test("profiles: import validates the file, migrates identities and lists the ids it cannot find", () => {
  const data = { ...D, snapshot: { ...D.snapshot, identity_map: [{ from: "old:union", to: "nm:union-bound" }] } };
  const doc = { schema: Model.PROFILE_SCHEMA, snapshot: "te-old", known: { "old:union": 1, "nm:nothing-like-this": 0 }, interests: "math.CO", depth: "apply" };
  const p = Model.readProfile(JSON.stringify(doc), data);
  assert.deepEqual(p.known, { "nm:union-bound": 1 });
  assert.deepEqual(p.unresolved, ["nm:nothing-like-this"]);
  assert.equal(p.migrated, true);
  assert.equal(p.state.interests, "math.CO");
  assert.throws(() => Model.readProfile("{", D), /not JSON/);
  assert.throws(() => Model.readProfile(JSON.stringify({ schema: "other" }), D), /profile/);
  assert.throws(() => Model.readProfile(JSON.stringify({ ...doc, known: { "nm:union-bound": 7 } }), D), /depth/);
});

test("search: offline substring search finds a result by an alias word and by its arXiv category", () => {
  const d = at({ view: "catalog", q: "pigeonhole" });
  assert.ok(d.order.includes(row("nm:pigeonhole-principle")));
  const none = at({ view: "catalog", q: "zzzz-no-such-word" });
  assert.equal(none.order.length, 0);
});

/* ---------- concepts, the prerequisite tree and popularity by arXiv tag ---------- */

const cx = Model.cindex(D);

test("concepts: the catalog holds at least 10,000 concepts, the 546 fully judged ones among them", () => {
  assert.ok(cx.rows.length >= 10000, `${cx.rows.length} concepts`);
  assert.equal(cx.rows.filter((/** @type {any} */ r) => r.j === 2).length, 546);
  assert.equal(D.coverage.concepts.catalog, cx.rows.length);
  for (const r of cx.rows) assert.match(r.s, /^[0-4un]{7}$/, r.id);
  assert.equal(new Set(cx.rows.map((/** @type {any} */ r) => r.id)).size, cx.rows.length);
});

test("concepts: the concept presets add up to 100 and the aggregate follows tc-rubric/1", () => {
  for (const w of Object.values(Model.CONCEPT_PRESETS)) assert.equal(/** @type {number[]} */ (w).reduce((s, x) => s + x, 0), 100);
  // Hilbert space, judged 4444232: 25 + 25 + 20 + 15 + 5*2/4 + 5*3/4 + 5*2/4 = 85 + 2.5 + 3.75 + 2.5 = 93.75
  const d = at({ view: "concepts", csel: "c:hilbert-space" });
  assert.equal(d.concepts.selected.scores.join(""), "4444232");
  assert.equal(d.concepts.selected.score, 93.75);
  assert.ok(d.concepts.selected.prerequisites.some((/** @type {any} */ p) => p.id === "c:inner-product-space"));
  assert.ok(d.concepts.selected.resultCount >= 20, "many catalog results name Hilbert space");
});

test("concepts: filters by tag and source, and custom weights that miss 100 make every aggregate unknown", () => {
  const all = at({ view: "concepts" }).concepts.counts.shown;
  const ag = at({ view: "concepts", ctag: "math.AG" }).concepts;
  assert.ok(ag.counts.shown > 0 && ag.counts.shown < all);
  for (const i of ag.order.slice(0, 50)) assert.ok(cx.rows[i].cat.includes(ix.catIdx.get("math.AG")));
  const ml = at({ view: "concepts", csrc: "mathlib" }).concepts;
  for (const i of ml.order) assert.notEqual(cx.rows[i].decl, null);
  const bad = at({ view: "concepts", preset: "custom", cw_uni: 50 }).concepts;
  assert.equal(bad.weightsOk, false);
  assert.equal(bad.selected.score, null);
});

test("tree: a result's children are its prerequisite results and key concepts; each item is expanded once", () => {
  const d = at({ view: "tree", troot: "wd:Q1425077", tdepth: 3 });
  const t = d.tree;
  assert.equal(t.root.id, "wd:Q1425077");
  const kids = t.root.children.map((/** @type {any} */ c) => c.id);
  const expect = [...ix.pre[row("wd:Q1425077")].map((/** @type {number} */ j) => ix.rows[j].id), ...cx.rc[row("wd:Q1425077")].map((/** @type {number} */ j) => cx.rows[j].id)];
  assert.deepEqual(kids, expect);
  // No item is expanded twice: an item with children appears once.
  const seen = new Set();
  (function walk(/** @type {any} */ n) { if (n.children.length) { assert.ok(!seen.has(n.id), n.id); seen.add(n.id); } n.children.forEach(walk); })(t.root);
  // The study order puts every prerequisite before the items that need it.
  const pos = new Map(t.study.map((/** @type {any} */ n, /** @type {number} */ k) => [n.id, k]));
  (function walk(/** @type {any} */ n) { for (const c of n.children) { if (pos.has(c.id) && pos.has(n.id) && !c.ref && !c.cycle) assert.ok(pos.get(c.id) < pos.get(n.id), `${c.id} before ${n.id}`); walk(c); } })(t.root);
  assert.ok(at({ view: "tree", troot: "wd:Q1425077", tshow: "results", tdepth: 3 }).tree.root.children.every((/** @type {any} */ c) => c.kind === "result"));
});

test("tree: a known item is not expanded and leaves the study order", () => {
  const data = { ...D, profile: { known: { "c:inner-product-space": 0 } } };
  const t = Model.treeOf(VisualKit.normalize(Model.FIELDS, { tdepth: 4 }).state, data, "c:hilbert-space");
  const ips = t.root.children.find((/** @type {any} */ c) => c.id === "c:inner-product-space");
  assert.equal(ips.known, true);
  assert.equal(ips.children.length, 0);
  assert.ok(!t.study.some((/** @type {any} */ n) => n.id === "c:inner-product-space"));
});

test("popularity: rate = 10,000 x papers naming the item / papers with the tag, recomputed from the pack", () => {
  const pp = Model.popularityPack(D);
  const d = at({ view: "popularity", ptags: "math.PR,hep-th", pmetric: "rate" });
  const p = d.popularity;
  assert.deepEqual(p.tags.map((/** @type {any} */ t) => t.id), ["math.PR", "hep-th"]);
  const r = p.matrix[0];
  const flat = pp.c[String(r.i)];
  const tagIdx = ix.catIdx.get("math.PR");
  let n = 0;
  for (let k = 0; k < flat.length; k += 3) if (flat[k] === tagIdx) n += flat[k + 2];
  const den = pp.den[tagIdx].reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
  assert.equal(r.counts[0], n);
  assert.equal(r.values[0], Math.round((1e4 * n / den) * 1000) / 1000);
  // An id that is a category and an archive at once ("hep-th") resolves to the category, with papers.
  assert.ok(p.tags[1].papers > 0);
});

test("popularity: archives and groups count a cross-listed paper once; lift needs 20 papers", () => {
  const pp = Model.popularityPack(D);
  const cats = D.taxonomy.categories.map((/** @type {any[]} */ c, /** @type {number} */ i) => [c, i]).filter((/** @type {any[]} */ x) => x[0][2] === "math");
  const archIdx = pp.ncat + ix.archIdx.get("math");
  const sumCats = cats.reduce((/** @type {number} */ s, /** @type {any[]} */ x) => s + pp.den[x[1]].reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0), 0);
  const arch = pp.den[archIdx].reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
  assert.ok(arch < sumCats, "the math archive counts each cross-listed paper once");
  const lift = at({ view: "popularity", ptags: "q-fin", pmetric: "lift" }).popularity;
  for (const t of lift.perTag) for (const x of t.top) assert.ok(x.count >= Model.LIFT_MIN);
});

test("popularity: unknown tags are reported and ignored", () => {
  const d = at({ view: "popularity", ptags: "math.PR,not.ATAG" });
  assert.deepEqual(d.popularity.tags.map((/** @type {any} */ t) => t.id), ["math.PR"]);
  assert.ok(d.notes.some((/** @type {string} */ n) => /not\.ATAG/.test(n)));
});
