import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const block = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const P = (() => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(block("pigeonhole-engine"), ctx); return ctx.Pigeonhole; })();
const T = (await import("node:module")).createRequire(import.meta.url)("./fixtures/beamdswitch/template.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (x, y, e = 1e-9, what = "") => assert.ok(Math.abs(x - y) <= e, `${what} ${x} ≈ ${y}`);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/* A deterministic pseudo-random sequence for property checks. */
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

test("the page's own self-tests all pass", () => {
  const t = P.selfTests();
  assert.ok(t.length >= 13);
  for (const r of t) assert.equal(r.pass, true, r.name);
});

test("ceil and floor bounds and the balanced configuration for the worked examples", () => {
  const cases = [
    [23, 5, 5, 4, [5, 5, 5, 4, 4]],
    [13, 4, 4, 3, [4, 3, 3, 3]],
    [25, 12, 3, 2, null],
    [100, 9, 12, 11, [12, 11, 11, 11, 11, 11, 11, 11, 11]],
    [101, 10, 11, 10, null],
    [31, 7, 5, 4, [5, 5, 5, 4, 4, 4, 4]],
  ];
  for (const [N, k, ceil, floor, bal] of cases) {
    const b = P.bounds(N, k);
    assert.deepEqual([b.ceil, b.floor], [ceil, floor], `${N}/${k}`);
    near(b.avg, N / k);
    const got = P.balanced(N, k);
    if (bal) assert.deepEqual(plain(got), bal, `${N}/${k}`);
    assert.equal(sum(got), N);
    assert.equal(Math.max(...got), ceil);
    assert.equal(Math.min(...got), floor);
  }
  assert.equal(P.fmt(P.bounds(23, 5).avg), "4.6");
  assert.equal(P.fmt(P.bounds(31, 7).avg), "4.43");
  // The counting behind them: k(⌈N/k⌉ − 1) < N and k(⌊N/k⌋ + 1) > N.
  assert.deepEqual(plain(P.maxContradiction(23, 5)), { N: 23, k: 5, cap: 4, total: 20, short: 3, contradiction: true });
  assert.equal(P.maxContradiction(100, 9).total, 99);
  assert.deepEqual(plain(P.minContradiction(23, 5)), { N: 23, k: 5, floorPlus: 5, total: 25, excess: 2, contradiction: true });
  for (let N = 0; N <= 80; N++) for (let k = 1; k <= 13; k++) {
    const b = P.bounds(N, k);
    assert.equal(b.ceil, Math.ceil(N / k));
    assert.equal(b.floor, Math.floor(N / k));
    assert.ok(P.maxContradiction(N, k).total < N || N === 0);
    assert.ok(P.minContradiction(N, k).total > N);
  }
  assert.deepEqual(plain(P.obstruction(5, 4)), { N: 5, k: 4, capacity: 4, fits: false, forced: 2 });
  assert.equal(P.obstruction(4, 4).fits, true);
  assert.throws(() => P.bounds(5, 0));
  assert.throws(() => P.bounds(-1, 3));
  assert.throws(() => P.bounds(2.5, 3));
});

test("balancing moves keep the total, never raise the maximum, and reach the minimax ⌈N/k⌉", () => {
  const seq = P.balanceSequence(P.LOPSIDED);
  assert.deepEqual(plain(seq.states), [[6, 5, 2, 1], [5, 5, 2, 2], [4, 5, 3, 2], [4, 4, 3, 3]]);
  assert.deepEqual(plain(P.balanceMilestones(P.LOPSIDED)), [[6, 5, 2, 1], [5, 5, 2, 2], [4, 4, 3, 3]]);
  const rnd = lcg(7);
  for (let t = 0; t < 300; t++) {
    const k = 1 + Math.floor(rnd() * 10), ns = Array.from({ length: k }, () => Math.floor(rnd() * 15)), N = sum(ns);
    const s = P.balanceSequence(ns), b = P.bounds(N, k);
    for (let i = 1; i < s.states.length; i++) {
      assert.equal(sum(s.states[i]), N);
      assert.ok(Math.max(...s.states[i]) <= Math.max(...s.states[i - 1]));
    }
    assert.equal(Math.max(...s.final), b.ceil, JSON.stringify(ns));
    assert.equal(Math.min(...s.final), b.floor, JSON.stringify(ns));
    assert.deepEqual(plain(s.final.slice().sort((a, c) => c - a)), plain(P.balanced(N, k)));
  }
});

test("averages: the real example's mean is 4, deviations sum to 0, and min ≤ mean ≤ max", () => {
  const st = P.stats(P.REAL_EXAMPLE);
  near(st.mean, 4, 1e-12);
  near(st.sum, 20, 1e-12);
  assert.deepEqual([st.min, st.max], [0.6, 8.4]);
  assert.equal(st.strict, true);
  assert.deepEqual(plain(st.marks), ["below", "below", "above", "above", "below"]);
  assert.equal(P.mean(P.INTEGER_SHADOW), 4);
  const dv = P.deviations(P.REAL_EXAMPLE);
  near(dv.sum, 0, 1e-12);
  near(dv.positive, -dv.negative, 1e-12);
  assert.ok(dv.min <= 0 && dv.max >= 0);
  // Exams: 78 is the average and one of the values.
  const ex = P.stats(P.EXAMPLES.exams.values);
  assert.deepEqual([ex.mean, ex.min, ex.max, ex.marks[2]], [78, 61, 95, "equal"]);
  // Equality and the counterexamples from the distinctions.
  const flat = P.stats([4, 4, 4]);
  assert.deepEqual([flat.allEqual, flat.weak, flat.strict], [true, true, false]);
  assert.equal(P.stats(P.COUNTERS.notAValue).mean, 1.5);
  const cd = P.stats(P.COUNTERS.countsDiffer);
  assert.deepEqual([cd.mean, cd.below, cd.above], [2, 4, 1]);
  const rnd = lcg(11);
  for (let t = 0; t < 500; t++) {
    const xs = Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => Math.round(rnd() * 200 - 100) / 10), s = P.stats(xs);
    assert.ok(s.weak);
    assert.ok(Math.abs(P.deviations(xs).sum) < 1e-9);
    assert.equal(s.strict, !s.allEqual);
    const eq = P.equalise(xs, 0.37);
    near(sum(eq), sum(xs), 1e-9, "equalising keeps the volume");
    near(P.flow(xs).excess, P.flow(xs).deficit, 1e-9);
  }
  assert.throws(() => P.stats([]));
});

test("weighted averages and convex combinations stay between min and max; weighted deviations sum to 0", () => {
  const w = P.weightedMean(P.WEIGHTED.values, P.WEIGHTED.weights);
  near(w.mean, 33 / 7);
  near(w.area, 33);
  near(w.deviation, 0, 1e-12);
  const rnd = lcg(3);
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 8), xs = Array.from({ length: n }, () => rnd() * 20 - 5), ws = Array.from({ length: n }, () => 0.1 + rnd() * 4);
    const r = P.weightedMean(xs, ws);
    assert.ok(Math.min(...xs) - 1e-9 <= r.mean && r.mean <= Math.max(...xs) + 1e-9);
    assert.ok(Math.abs(r.deviation) < 1e-9);
    const c = P.convexCombination(xs, ws.map((x, i) => (i % 3 ? x : 0)).map((x, i, a) => (a.some((y) => y > 0) ? x : 1)));
    assert.equal(c.inside, true);
    near(sum(c.lambdas), 1, 1e-12);
  }
  assert.throws(() => P.weightedMean([1, 2], [1, 0]));
  assert.throws(() => P.convexCombination([1, 2], [0, 0]));
});

test("graph average degree is 2|E|/|V|, and the hull contains the barycentre", () => {
  const g = P.EXAMPLES.graph, a = P.averageDegree(g.n, g.edges);
  assert.deepEqual(plain(a.degrees), [4, 2, 3, 3, 3, 1]);
  assert.equal(a.sum, 2 * g.edges.length);
  near(a.average, 16 / 6);
  const rnd = lcg(5);
  let edges = [];
  for (let t = 0; t < 200; t++) {
    edges = P.toggleEdge(edges, Math.floor(rnd() * 6), Math.floor(rnd() * 6));
    const r = P.averageDegree(6, edges);
    assert.equal(r.sum, 2 * edges.length);
    near(r.average, sum(r.degrees) / 6);
    assert.ok(Math.max(...r.degrees) >= r.average && Math.min(...r.degrees) <= r.average);
  }
  assert.equal(P.toggleEdge([[0, 1]], 1, 0).length, 0);
  const h = P.hull(P.HULL.points);
  assert.equal(h.length, 6, "the inner point is not a vertex of the hull");
  assert.ok(P.inHull(P.centroid(P.HULL.points), h));
  for (let t = 0; t < 200; t++) {
    const ps = Array.from({ length: 3 + Math.floor(rnd() * 6) }, () => [rnd(), rnd()]);
    assert.ok(P.inHull(P.centroid(ps), P.hull(ps)) || P.hull(ps).length < 3);
  }
});

test("lock-total mode preserves the sum exactly and respects the limits", () => {
  const rnd = lcg(13);
  for (let t = 0; t < 2000; t++) {
    const n = 1 + Math.floor(rnd() * 10), u = Array.from({ length: n }, () => Math.floor(rnd() * 121)), i = Math.floor(rnd() * n), target = Math.floor(rnd() * 160) - 20;
    const r = P.lockTotal(u, i, target, 0, 120);
    assert.equal(sum(r.units), sum(u), JSON.stringify([u, i, target]));
    assert.ok(r.units.every((x) => Number.isInteger(x) && x >= 0 && x <= 120));
    assert.equal(sum(r.moved), 0);
    if (!r.clamped) assert.equal(r.units[i], Math.max(0, Math.min(120, target)));
  }
  // Spread as evenly as the limits allow.
  assert.deepEqual(plain(P.lockTotal([30, 30, 30, 30], 0, 60).units), [60, 20, 20, 20]);
  assert.throws(() => P.lockTotal([1.5, 2], 0, 1));
});

test("continuous time: every partition averages exactly 5 km/h, and the extremes approach 8 and 2", () => {
  for (const n of P.EXAMPLES.time.partitions) {
    const p = P.partition(n);
    near(p.mean, 5, 1e-9, `n=${n}`);
    near(p.distance, 10, 1e-9, `n=${n}`);
    assert.ok(p.min <= 5 && p.max >= 5);
  }
  assert.ok(P.partition(64).max > 7.99 && P.partition(64).min < 2.01);
  assert.ok(P.partition(2).max < P.partition(64).max);
});

test("the challenges have the forced answers; Challenge C is a plain yes", () => {
  const by = Object.fromEntries(P.CHALLENGES.map((c) => [c.id, c]));
  assert.equal(by.A.options[by.A.answer], "Some box has ≥ 11");
  assert.equal(P.bounds(101, 10).ceil, 11);
  assert.equal(by.B.options[by.B.answer], "No");
  assert.equal(by.C.options[by.C.answer], "Yes");
  assert.match(by.C.explain, /^Yes\. .*\+7.*strictly below 12/);
  assert.doesNotMatch(by.C.explain, /unless/);
  assert.match(by.D.options[by.D.answer], /only if every value equals/);
  for (const c of P.CHALLENGES) assert.doesNotMatch(c.explain, /wrong|incorrect/i);
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.scenes, plain(P.SCENES));
  assert.deepEqual(raw.modes, plain(P.MODES));
  assert.deepEqual(raw.examples, plain(P.EXAMPLES));
  assert.deepEqual(raw.challenges, plain(P.CHALLENGES));
  assert.deepEqual(raw.real_example, plain(P.REAL_EXAMPLE));
  assert.deepEqual(raw.lab, plain(P.LAB));
  for (const w of raw.worked) assert.deepEqual(w.balanced, plain(P.balanced(w.N, w.k)));
});

test("fmt keeps the zeros of whole numbers and drops only trailing decimal zeros", () => {
  assert.deepEqual([10, 20, 80, 100, 0, -0.001, 7].map((x) => P.fmt(x, 0)), ["10", "20", "80", "100", "0", "0", "7"]);
  assert.deepEqual([4.6, 4.429, 12, 10, 0, -1.5].map((x) => P.fmt(x)), ["4.6", "4.43", "12", "10", "0", "−1.5"]);
  const md = T.deck(P.report({ title: "x", N: 23, k: 5, counts: [23, 0, 0, 0, 0] }));
  assert.match(md, /hold 23, 0, 0, 0 and 0\./);
  const a = T.deck(P.report({ title: "x", N: 101, k: 10, counts: [11, 10, 10, 10, 10, 10, 10, 10, 10, 10] }));
  assert.match(a, /hold 11, 10, 10, 10, 10, 10, 10, 10, 10 and 10\./);
  assert.match(T.deck(P.report({ title: "x", N: 60, k: 6, counts: P.balanced(60, 6) })), /most balanced way to place them is 10, 10, 10, 10, 10 and 10\./);
});

test("a weighted deck measures deviations from the weighted average", () => {
  const { values, weights } = P.WEIGHTED, m = 33 / 7, dv = P.deviations(values, weights);
  values.forEach((x, i) => near(dv.d[i], weights[i] * (x - m), 1e-12));
  near(dv.sum, 0, 1e-12);
  near(dv.positive, -dv.negative, 1e-12);
  const md = T.deck(P.report({ title: "Weighted averages", values, weights }));
  assert.match(md, /^## Weighted deviations from the weighted average sum to zero$/m);
  assert.ok(md.includes(`: ${P.list(dv.d)}`), "lists w_i (x_i − x̄_w)");
  assert.ok(md.includes(`Positive total ${P.fmt(dv.positive)}, negative total ${P.fmt(dv.negative)}`));
  assert.ok(md.includes("$\\sum_i w_i (x_i - \\bar x_w) = 0$"));
  assert.ok(!md.includes(P.list(P.deviations(values).d)), "not the unweighted deviations");
  const plainDeck = T.deck(P.report({ title: "x", values: P.REAL_EXAMPLE }));
  assert.ok(plainDeck.includes(`Deviations: ${P.list(P.deviations(P.REAL_EXAMPLE).d)}`));
});

test("with Preserve total on, add, remove and randomise are disabled and leave the total and average unchanged", async () => {
  const page = await openPage("pigeonhole", { hash: "#lab" });
  page.run("PigeonholeApp.enter('lab')");
  const units = () => plain(page.run("PigeonholeApp.state().lab.units"));
  const acts = ["lab-add", "lab-sub", "lab-rand"];
  const disabled = (a) => page.run(`document.querySelector('#panel [data-act="${a}"]').disabled`);
  const press = (a) => page.run(`document.getElementById("app").listeners.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: { act: ${JSON.stringify(a)} }, disabled: false }) } }))`);
  page.run(`document.getElementById("app").listeners.change.forEach((fn) => fn({ target: { type: "checkbox", checked: true, dataset: { in: "lab-lock" } } }))`);
  assert.equal(page.run("PigeonholeApp.state().lab.lock"), true);
  assert.match(page.run(`document.getElementById("lab-out").innerHTML`), /Unlock the total to add, remove or randomise values\./);
  for (const a of acts) assert.equal(disabled(a), true, a);
  const before = units(), total = sum(before), avg = total / before.length;
  for (const a of acts) {
    press(a);
    assert.equal(sum(units()), total, a);
    near(sum(units()) / units().length, avg, 1e-12, a);
  }
  assert.deepEqual(units(), before);
  page.run(`document.getElementById("app").listeners.change.forEach((fn) => fn({ target: { type: "checkbox", checked: false, dataset: { in: "lab-lock" } } }))`);
  for (const a of acts) assert.equal(disabled(a), false, a);
  assert.doesNotMatch(page.run(`document.getElementById("lab-out").innerHTML`), /Unlock the total/);
  press("lab-add");
  assert.equal(units().length, before.length + 1);
});

// The published HTML is an owned contract: its metadata, offline single-file shape, theme and motion queries and no-JS fallback.
test("the page is one offline file with the metadata and fallback it promises", () => {
  assert.match(html, /<title>Pigeonhole → Averages — Yu Jie Teo<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/pigeonhole">/);
  for (const p of ["og:title", "og:description", "og:type", "og:url"]) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`));
  assert.match(html, /<a href="https:\/\/teoyujie\.org\/visuals\.html">Visuals<\/a>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|@import|@font-face|type="module"|https?:\/\/[^"\s]*\.(js|css|woff2?)\b/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /<div id="nojs">[\s\S]*Pigeonhole principle[\s\S]*Generalised pigeonhole principle[\s\S]*5 · 4 = 20 &lt; 23[\s\S]*Principle of averages[\s\S]*Why this is pigeonhole/);
  assert.match(html, /<div id="app" hidden>/);
});

test("every scene's deck opens in beamdswitch as the standard narrated template", async () => {
  assertTemplateCopy("pigeonhole");
  assertInlined(html, "beamdswitch", read("tests/fixtures/beamdswitch/template.js"), "pigeonhole");
  const page = await openPage("pigeonhole");
  for (const s of P.SCENES) {
    page.run(`PigeonholeApp.enter(${JSON.stringify(s.id)})`);
    const snap = plain(page.run("PigeonholeApp.snapshot()"));
    const md = T.deck(P.report(snap));
    const deck = assertStandardDeck(md, s.id);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.match(md, new RegExp(`^title: Pigeonhole to averages: ${s.title.replace(/[?()]/g, "\\$&")}$`, "m"));
  }
  const md = T.deck(P.report({ title: "Generalised pigeonhole", N: 23, k: 5, counts: [5, 5, 5, 4, 4] }));
  assert.match(md, /^## Average 4\.6, so some box has at least 5$/m);
  assert.match(md, /^## The most balanced configuration: 5, 5, 5, 4, 4$/m);
  const real = T.deck(P.report({ title: "x", values: P.REAL_EXAMPLE }));
  assert.match(real, /^## min 0\.6 ≤ average 4 ≤ max 8\.4$/m);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the scene as set", async () => {
  const network = [], record = (what) => function () { network.push(what); };
  const page = await openPage("pigeonhole", { hash: "#general", globals: { fetch: record("fetch"), XMLHttpRequest: record("XMLHttpRequest"), WebSocket: record("WebSocket") } });
  const tools = page.run("PigeonholeTools");
  // The site checks these names against its catalogue stub (data/visuals/pigeonhole.yaml); here they are listed.
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "compute_bounds", "analyze_values", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/pigeonhole");
  const st = await call("get_current_state");
  assert.equal(st.scene, "general");
  assert.deepEqual([st.bounds.ceil, st.bounds.floor], [5, 4]);
  const b = await call("compute_bounds", { N: 100, k: 9 });
  assert.deepEqual([b.ceil, b.floor, b.capacity_check.total], [12, 11, 99]);
  assert.ok((await call("compute_bounds", { N: 3, k: 0 })).error);
  const a = await call("analyze_values", { values: P.REAL_EXAMPLE });
  near(a.mean, 4, 1e-12);
  assert.deepEqual([a.min, a.max, a.weak, a.strict], [0.6, 8.4, true, true]);
  const aw = await call("analyze_values", { values: [3, 7, 4, 9], weights: [3, 1, 2, 1] });
  near(aw.weighted_mean, 33 / 7);
  assert.ok((await call("analyze_values", { values: [1, 2], weights: [1] })).error);
  assert.ok((await call("analyze_values", { values: [] })).error);
  assert.ok((await call("run_self_tests")).every((t) => t.pass));
  // Distribute evenly through the page's own state, then export.
  page.run("PigeonholeApp.state().gen.counts = [5, 5, 5, 4, 4]");
  const snap = plain(page.run("PigeonholeApp.snapshot()"));
  assert.deepEqual(snap.counts, [5, 5, 5, 4, 4]);
  await assertButtonsExport(page, "pigeonhole", T.deck(P.report(snap)));
  assert.deepEqual(network, [], "the page makes no network requests");
});

// The step controls of the jump and synthesis scenes, and the capped bars of the contradiction pictures.
test("the step buttons walk the jump and synthesis scenes, and capping bars sends the excess to the tray", async () => {
  const page = await openPage("pigeonhole", { hash: "#jump" });
  const press = (a) => page.run(`document.getElementById("app").listeners.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: { act: ${JSON.stringify(a)} }, disabled: false }) } }))`);
  const state = (path) => plain(page.run(`PigeonholeApp.state().${path}`));
  page.run("PigeonholeApp.enter('jump')");
  press("j-fwd"); press("j-fwd");
  assert.equal(state("jstep"), 2);
  press("j-back");
  assert.equal(state("jstep"), 1);
  press("j-end");
  assert.equal(state("jstep"), 5);
  press("j-fwd");
  assert.equal(state("jstep"), 5, "Step → stops at the last step");
  assert.equal(state("unlocked"), true, "reaching the end of the jump unlocks the theorem card");
  page.run("PigeonholeApp.enter('synthesis')");
  press("s-fwd");
  assert.equal(state("syn.step"), 1);
  assert.deepEqual(state("syn.m.counts"), [3, 3, 3, 2], "stepping (not playing) jumps straight to the balanced boxes");
  press("s-back");
  assert.deepEqual([state("syn.step"), state("syn.m.counts")], [0, [0, 0, 0, 0]]);
  press("s-end");
  assert.equal(state("syn.step"), 6);
  page.run("PigeonholeApp.enter('max')");
  press("max-force");
  assert.equal(state("forced"), "max");
  assert.match(page.run(`document.getElementById("max-out").innerHTML`), /5 · 4 = 20 &lt; 23/);
  press("force-off");
  assert.equal(state("forced"), false);
});
