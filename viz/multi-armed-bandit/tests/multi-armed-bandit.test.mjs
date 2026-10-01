// Numerical, state, import and simulation checks for multi-armed-bandit. The page inlines its pure
// logic as <script id="mab-logic"> and its data as JSON; these tests run that shipped code directly.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))[1];
const D = JSON.parse(script("mab-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
context.self = context;
vm.runInContext(script("mab-logic"), context);
const L = context.BanditLogic;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const website = (seed = 7) => L.fromTemplate(D, "website", seed);
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r.state; };

test("templates match the spec: fictional website counts A 8/100, B 12/100, C 3/20, custom starts at zero", () => {
  const s = website();
  assert.deepEqual(plain(s.variants.map((v) => [v.name, v.successes, v.trials])), [["Page A", 8, 100], ["Page B", 12, 100], ["Page C", 3, 20]]);
  assert.equal(s.basis, "fictional");
  for (const t of D.templates.filter((x) => x.fictional)) {
    assert.deepEqual(t.variants.map((v) => [v.successes, v.trials]), [[8, 100], [12, 100], [3, 20]], t.id);
    assert.match(t.note, /Fictional/);
  }
  const c = L.fromTemplate(D, "custom", 1);
  assert.equal(c.basis, "entered");
  assert.ok(c.variants.length === 3 && c.variants.every((v) => v.trials === 0));
  assert.deepEqual(plain(s.prior), { a: 1, b: 1 });
  assert.deepEqual(plain(s.simulation), { probabilities: [0.08, 0.12, 0.15], budget: 1000, seed: 42, pulls: 0 });
});

test("Beta(1,1) has interval [0.025, 0.975] and mean 0.5; Beta(2,1) quantiles are sqrt(0.025) and sqrt(0.975)", () => {
  near(L.betaQuantile(0.025, 1, 1), 0.025, 1e-12, "Beta(1,1) lower");
  near(L.betaQuantile(0.975, 1, 1), 0.975, 1e-12, "Beta(1,1) upper");
  near(L.betaQuantile(0.025, 2, 1), Math.sqrt(0.025), 1e-6, "Beta(2,1) lower");
  near(L.betaQuantile(0.975, 2, 1), Math.sqrt(0.975), 1e-6, "Beta(2,1) upper");
  const s = L.fromTemplate(D, "custom", 1), V = L.view(s);
  assert.equal(V.rows[0].mean, 0.5);
  assert.equal(V.rows[0].text.interval, "2.50% to 97.50%");
  assert.equal(V.rows[0].text.rate, "No trials");
});

test("posterior updates match hand calculations: 8/100 with Beta(1,1) is Beta(9, 93), mean 9/102", () => {
  const V = L.view(website());
  const a = V.rows[0];
  assert.equal(a.text.posterior, "Beta(9, 93)");
  assert.equal(a.mean, 9 / 102);
  assert.equal(a.text.mean, "8.82%");
  assert.equal(a.failures, 92);
  assert.equal(a.text.rate, "8.0%");
  const p = ok(L.setPrior(website(), "2", "3.5"));
  assert.equal(L.view(p).rows[2].text.posterior, "Beta(5, 20.5)");
  assert.equal(L.view(p).rows[2].mean, 5 / 25.5);
});

test("fixed-seed Beta samples stay in [0,1] with means within 0.01 of the known mean", () => {
  const st = L.seedState(42, 0);
  for (const [a, b] of [[1, 1], [2, 2], [0.5, 0.5], [2, 5], [9, 93], [50, 2], [0.1, 3]]) {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const x = L.sampleBeta(st, a, b);
      assert.ok(x >= 0 && x <= 1 && Number.isFinite(x), `Beta(${a},${b}) draw ${x}`);
      sum += x;
    }
    near(sum / n, a / (a + b), 0.01, `Beta(${a},${b}) sample mean`);
  }
  for (const [a, b] of [[0.1, 0.1], [0.1, 1000100], [1000100, 0.1], [1000001, 1]]) {
    const x = L.sampleBeta(st, a, b);
    assert.ok(Number.isFinite(x) && x >= 0 && x <= 1, `extreme Beta(${a},${b}) draw ${x}`);
  }
});

test("quantiles at supported extremes are finite, ordered and within [0,1]", () => {
  const shapes = [0.1, 1, 100, 100.1, 1000001, 1000100];
  for (const a of shapes) for (const b of shapes) {
    const lo = L.betaQuantile(0.025, a, b), hi = L.betaQuantile(0.975, a, b), m = a / (a + b);
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `Beta(${a},${b}) finite`);
    assert.ok(lo >= 0 && hi <= 1 && lo <= hi, `Beta(${a},${b}) ordered: ${lo} ${hi}`);
    assert.ok(lo <= m + 1e-9 && m <= hi + 1e-9, `Beta(${a},${b}) brackets its mean`);
  }
  // A full view at the maximum counts and prior stays finite.
  let s = L.fromTemplate(D, "custom", 3);
  s = ok(L.setPrior(s, "0.1", "100"));
  s = ok(L.setCounts(s, 0, "1000000", "1000000"));
  s = ok(L.setCounts(s, 1, "0", "1000000"));
  for (const r of L.view(s).rows) for (const k of ["mean", "lo", "hi", "sample"]) assert.ok(Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1, k);
});

test("UCB1: two variants with 5/10 each score 0.5 + sqrt(2 ln 20 / 10); untried first; stable ties; scores above 1 are not capped", () => {
  const u = L.ucb([{ successes: 5, trials: 10 }, { successes: 5, trials: 10 }]);
  near(u.scores[0].score, 0.5 + Math.sqrt(2 * Math.log(20) / 10), 1e-15, "score");
  assert.equal(u.best, 0, "ties go to the first in display order");
  const t = L.ucb([{ successes: 9, trials: 10 }, { successes: 0, trials: 0 }, { successes: 0, trials: 0 }]);
  assert.equal(t.best, 1);
  assert.equal(t.untried, true);
  assert.equal(t.scores[1], null);
  let s = L.fromTemplate(D, "custom", 1);
  s = ok(L.setCounts(s, 0, "1", "1"));
  const V = L.view(s);
  assert.equal(V.ucb.index, 1);
  assert.equal(V.rows[1].text.ucb, "Untried — explore first");
  s = ok(L.setCounts(s, 1, "1", "1"));
  s = ok(L.setCounts(s, 2, "0", "1"));
  const W = L.view(s);
  assert.equal(W.ucb.index, 0, "tie between two 1/1 variants keeps the first");
  near(W.rows[0].ucb.score, 1 + Math.sqrt(2 * Math.log(3)), 1e-12, "uncapped");
  assert.ok(W.rows[0].ucb.score > 1);
  assert.equal(W.rows[0].text.ucb, (1 + Math.sqrt(2 * Math.log(3))).toFixed(4));
  assert.doesNotMatch(W.ucb.why, /probability of/);
});

test("the seeded generator's serialised state round-trips", () => {
  const a = L.seedState(42, 1);
  for (let i = 0; i < 17; i += 1) L.next(a);
  const b = JSON.parse(JSON.stringify(a));
  const xs = [], ys = [];
  for (let i = 0; i < 100; i += 1) { xs.push(L.next(a)); ys.push(L.next(b)); }
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(L.seedState(42, 0), L.seedState(42, 1), "streams are separate");
  assert.notDeepEqual(L.seedState(0, 0), [0, 0, 0, 0]);
  // The page's own document keeps the samples and the generator.
  const s = ok(L.select(website(9), "v2"));
  const r = L.parse(L.serialise(s, L.simCreate(s)));
  assert.deepEqual(plain(r.state), plain(s));
  assert.deepEqual(plain(L.resample(L.clone(r.state))), plain(L.resample(L.clone(s))), "the next draws continue identically");
});

test("recording, undo and resampling: only the intended state changes", () => {
  let s = website(11);
  assert.match(L.canRecord(s), /Select a variant/);
  s = ok(L.select(s, "v3"));
  const before = L.snapshot(s), samples = s.variants.map((v) => v.sample);
  const r = ok(L.record(s, true));
  assert.deepEqual([r.variants[2].successes, r.variants[2].trials], [4, 21]);
  assert.equal(r.basis, "mixed");
  assert.notDeepEqual(r.variants.map((v) => v.sample), samples, "recording recalculates the samples");
  const f = ok(L.record(r, false));
  assert.deepEqual([f.variants[2].successes, f.variants[2].trials], [4, 22]);
  const u = L.restore(r, before);
  assert.deepEqual(plain(u), plain(s), "undo restores evidence, samples, generator and selection");
  const rs = L.resample(L.clone(s));
  assert.deepEqual(plain(rs.variants.map((v) => [v.successes, v.trials])), plain(s.variants.map((v) => [v.successes, v.trials])));
  assert.notDeepEqual(rs.variants.map((v) => v.sample), samples);
  assert.equal(rs.selected, s.selected);
  assert.deepEqual(L.view(rs).rows.map((x) => x.ucb), L.view(s).rows.map((x) => x.ucb), "UCB unchanged");
  const n = ok(L.rename(s, 0, "Homepage"));
  assert.deepEqual(n.variants.map((v) => v.sample), samples, "renaming never resamples");
  // Recording is disabled at the count limit, and before success is defined.
  let m = ok(L.select(ok(L.setCounts(s, 0, "5", "1000000")), "v1"));
  assert.match(L.canRecord(m), /limit/);
  assert.ok(L.record(m, true).error);
  const c = ok(L.select(L.fromTemplate(D, "custom", 1), "v1"));
  assert.match(L.canRecord(c), /Define/);
});

test("invalid inputs are rejected without touching the committed experiment", () => {
  const s = website(5), frozen = JSON.stringify(s);
  for (const [s1, n1] of [["5", "4"], ["-1", "3"], ["1.5", "3"], ["", "3"], ["1", "1000001"], ["abc", "2"], ["1e3", "2000"]]) assert.ok(L.setCounts(s, 0, s1, n1).error, `${s1}/${n1}`);
  assert.equal(L.rename(s, 0, "page b").error, "Variant names must be unique, ignoring case.");
  assert.ok(L.rename(s, 0, "   ").error);
  assert.match(L.rename(s, 0, "x".repeat(81)).error, /80/);
  assert.ok(L.setText(s, "title", "").error);
  assert.match(L.setText(s, "success", "y".repeat(301)).error, /300/);
  assert.match(L.setText(s, "unit", "z".repeat(121)).error, /120/);
  for (const v of ["0.09", "100.1", "abc", "", "NaN", "Infinity"]) assert.ok(L.setPrior(s, v, "1").error, v);
  assert.equal(JSON.stringify(s), frozen);
  // Two to ten variants; added variants get unique names and a 10% simulation default.
  let t = s;
  for (let i = 0; i < 7; i += 1) t = ok(L.addVariant(t));
  assert.equal(t.variants.length, 10);
  assert.ok(L.addVariant(t).error);
  assert.deepEqual(plain(t.simulation.probabilities), [0.08, 0.12, 0.15, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  assert.equal(new Set(t.variants.map((v) => v.name.toLowerCase())).size, 10);
  let u = s;
  u = ok(L.removeVariant(u, 0));
  assert.ok(L.removeVariant(u, 0).error);
  assert.deepEqual(plain(u.simulation.probabilities), [0.12, 0.15]);
  // Text is kept as text.
  const x = ok(L.rename(s, 0, "<img src=x onerror=alert(1)>"));
  assert.equal(x.variants[0].name, "<img src=x onerror=alert(1)>");
});

function runSim(s, chunks) {
  const sim = L.simCreate(s);
  for (const c of chunks) for (let i = 0; i < c; i += 1) L.simStep(sim);
  while (L.simStep(sim));
  return sim;
}
const summary = (sim) => JSON.stringify(Object.fromEntries(Object.entries(sim.methods).map(([k, m]) => [k, [m.successes, m.trials, m.total, m.regret, m.curve]])));

test("the simulation is deterministic across step, run and pause/resume, and replays from its pull count", () => {
  const s = website(1);
  const all = runSim(s, []), stepped = runSim(s, Array(1000).fill(1)), paused = runSim(s, [3, 50, 1, 400, 2]);
  assert.equal(summary(stepped), summary(all));
  assert.equal(summary(paused), summary(all));
  assert.deepEqual(plain(all.rng), plain(stepped.rng));
  const half = L.clone(s);
  half.simulation.pulls = 333;
  const replay = L.simReplay(half), direct = runSim(s, []);
  const partial = L.simCreate(s);
  for (let i = 0; i < 333; i += 1) L.simStep(partial);
  assert.equal(summary(replay), summary(partial));
  const doc = L.serialise(half, replay), back = L.parse(doc);
  assert.equal(back.error, undefined);
  assert.equal(summary(back.sim), summary(partial));
  assert.equal(all.methods.ts.pulls, 1000);
  assert.ok(direct.methods.ts.pulls === 1000 && L.simDone(direct));
  // Different seeds give different results; the real experiment is never touched.
  const other = L.clone(s);
  other.simulation.seed = 43;
  assert.notEqual(summary(runSim(other, [])), summary(all));
  assert.deepEqual(plain(s), plain(website(1)));
});

test("simulation methods share per-variant reward sequences, start fresh, and UCB tries each variant once", () => {
  const s = website(1), sim = L.simCreate(s);
  for (let i = 0; i < 3; i += 1) L.simStep(sim);
  assert.deepEqual(plain(sim.methods.ucb.trials), [1, 1, 1]);
  assert.deepEqual(plain(sim.methods.eq.trials), [1, 1, 1]);
  while (L.simStep(sim));
  for (const m of Object.values(sim.methods)) {
    assert.equal(m.pulls, 1000);
    m.trials.forEach((n, j) => {
      const expected = Array.from(sim.rewards[j].slice(0, n)).reduce((a, b) => a + b, 0);
      assert.equal(m.successes[j], expected, "the kth pull of a variant receives its kth reward");
    });
  }
  assert.deepEqual(plain(sim.methods.eq.trials), [334, 333, 333]);
});

test("equal probabilities give zero expected regret; probability 0 always fails and 1 always succeeds", () => {
  const s = L.clone(website(1));
  s.simulation.probabilities = [0.3, 0.3, 0.3];
  for (const m of Object.values(runSim(s, []).methods)) assert.equal(m.regret, 0);
  s.simulation.probabilities = [0, 1, 0];
  const sim = runSim(s, []);
  for (const m of Object.values(sim.methods)) {
    assert.equal(m.successes[0], 0);
    assert.equal(m.successes[2], 0);
    assert.equal(m.successes[1], m.trials[1]);
    assert.equal(m.regret, m.trials[0] + m.trials[2]);
  }
  const V = L.simView(sim, ["A", "B", "C"]);
  assert.equal(V.progress, "Complete: 1,000 pulls per method.");
  const p = L.simCreate(s);
  L.simStep(p);
  assert.equal(L.simView(p, ["A", "B", "C"]).partial, true);
});

test("simulation settings validate their limits and a change resets progress", () => {
  const s = L.clone(website(1));
  s.simulation.pulls = 10;
  const raws = (o) => Object.assign({ probabilities: ["8", "12", "15"], budget: "1000", seed: "42" }, o);
  assert.equal(L.setSimulation(s, raws()).unchanged, true);
  for (const bad of [{ probabilities: ["-1", "12", "15"] }, { probabilities: ["101", "1", "1"] }, { budget: "2" }, { budget: "2001" }, { seed: "4294967296" }, { seed: "-1" }, { seed: "1.5" }])
    assert.ok(L.setSimulation(s, raws(bad)).error, JSON.stringify(bad));
  const ok0 = ok(L.setSimulation(s, raws({ probabilities: ["0", "100", "50"], budget: "3", seed: "4294967295" })));
  assert.deepEqual(plain(ok0.simulation), { probabilities: [0, 1, 0.5], budget: 3, seed: 4294967295, pulls: 0 });
  assert.equal(ok(L.setPrior(s, "2", "2")).simulation.pulls, 0, "a prior change also resets the simulation");
});

test("a full 2,000-pull run per method finishes well within one second", () => {
  const s = L.clone(website(1));
  s.simulation.budget = 2000;
  s.variants.push({ id: "v4", name: "D", successes: 0, trials: 0, sample: 0 });
  s.simulation.probabilities.push(0.1);
  const t0 = performance.now();
  const sim = runSim(s, []);
  const ms = performance.now() - t0;
  assert.ok(L.simDone(sim));
  assert.ok(ms < 1000, `${ms} ms`);
});

test("JSON import is fully validated and never partial", () => {
  const s = ok(L.select(website(3), "v1")), good = JSON.parse(L.serialise(s, L.simCreate(s)));
  assert.equal(L.parse(JSON.stringify(good)).error, undefined);
  const bad = (mutate, re) => {
    const d = JSON.parse(JSON.stringify(good));
    mutate(d);
    const r = L.parse(JSON.stringify(d));
    assert.ok(r.error, `should reject: ${mutate}`);
    assert.equal(r.state, undefined);
    if (re) assert.match(r.error, re);
  };
  assert.equal(L.parse("{not json").error, "The file is not valid JSON.");
  assert.ok(L.parse("[]").error);
  bad((d) => { d.version = 2; }, /Unsupported version/);
  bad((d) => { d.format = "other"; });
  bad((d) => { d.variants[1].name = "PAGE a"; }, /unique/);
  bad((d) => { d.variants[0].successes = 101; }, /exceed/);
  bad((d) => { d.variants[0].trials = 1000001; });
  bad((d) => { d.variants[0].successes = 1.5; });
  bad((d) => { d.variants[0].sample = 2; });
  bad((d) => { d.variants[0].sample = "0.1"; });
  bad((d) => { d.variants[0].name = ""; });
  bad((d) => { d.variants[1].id = "v1"; });
  bad((d) => { d.variants = d.variants.slice(0, 1); d.simulation.probabilities = [0.1]; }, /2 to 10/);
  bad((d) => { d.prior.a = 0.05; });
  bad((d) => { d.prior.b = "1"; });
  bad((d) => { d.title = "t".repeat(121); });
  bad((d) => { d.selected = "v9"; });
  bad((d) => { d.rng = [0, 0, 0, 0]; });
  bad((d) => { d.rng = [1, 2, 3]; });
  bad((d) => { d.nextId = 2; });
  bad((d) => { d.basis = "real"; });
  bad((d) => { d.template = "zzz"; }, /template/);
  bad((d) => { d.template = undefined; }, /template/);
  bad((d) => { d.simulation.probabilities = [0.1, 0.2]; });
  bad((d) => { d.simulation.probabilities[0] = 1.2; });
  bad((d) => { d.simulation.budget = 2001; });
  bad((d) => { d.simulation.seed = -1; });
  bad((d) => { d.simulation.pulls = 1001; });
  bad((d) => { d.simulation.pulls = 5; }, /does not match/);
  // Undo history is never exported.
  assert.ok(!("undo" in good));
});

test("next-step hints follow the state", () => {
  const c = L.fromTemplate(D, "custom", 1);
  assert.match(L.hints(c, L.view(c))[0], /Define success/);
  let r = ok(L.setText(c, "success", "Replied within 7 days"));
  r = ok(L.setText(r, "unit", "Email"));
  assert.match(L.hints(r, L.view(r))[0], /UCB1 suggests trying Variant A/);
  const s = ok(L.select(website(2), "v2"));
  assert.ok(L.hints(s, L.view(s)).some((h) => /record its outcome once it is resolved/.test(h)));
});
