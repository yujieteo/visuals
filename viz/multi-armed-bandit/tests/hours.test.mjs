// Model checks for the hours mode (Next week's hours). The page inlines its pure logic as
// <script id="hours-logic"> after <script id="mab-logic">; these tests run that shipped code directly,
// and drive the page's hours interface in the stand-in DOM of beamdswitch-decks.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { openPage } from "./beamdswitch-decks.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))[1];
const D = JSON.parse(script("mab-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
context.self = context;
vm.runInContext(script("mab-logic"), context);
vm.runInContext(script("hours-logic"), context);
const L = context.BanditLogic, H = context.HoursLogic;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r.state; };
const example = () => H.fromExample(D);
const sum = (xs) => xs.reduce((t, x) => t + x, 0);
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

test("the example lists the five activities with fictional counts and plans 20 hours", () => {
  const s = example();
  assert.deepEqual(plain(s.activities.map((a) => [a.name, a.worthwhile, a.notWorthwhile])),
    [["Mathematics", 12, 4], ["Structural engineering", 6, 4], ["FPL", 2, 6], ["Notes", 5, 1], ["Agent work", 9, 5]]);
  assert.equal(s.basis, "example");
  assert.equal(s.hours, 20);
  assert.match(D.hours.note, /Fictional/);
  assert.equal(H.serialise(example()), H.serialise(s), "the example is the same every time: no seed, no clock");
});

test("evidence: each block counts as one success or one failure", () => {
  assert.deepEqual(plain(H.evidence({ worthwhile: 3, notWorthwhile: 2 })), { s: 3, f: 2, n: 5 });
  assert.deepEqual(plain(H.evidence({ worthwhile: 0, notWorthwhile: 0 })), { s: 0, f: 0, n: 0 });
});

test("basis: a plan starts blank, two activities with no blocks, and stays blank when filled", () => {
  let b = H.blank(D);
  assert.equal(b.basis, "blank");
  assert.deepEqual(plain(b.activities), [{ id: "a1", name: "Activity 1", worthwhile: 0, notWorthwhile: 0 }, { id: "a2", name: "Activity 2", worthwhile: 0, notWorthwhile: 0 }]);
  assert.equal(b.hours, D.hours.hours);
  b = ok(H.setCount(ok(H.addActivity(ok(H.rename(b, 0, "Reading")))), 0, "worthwhile", "4"));
  assert.equal(b.basis, "blank");
  assert.equal(b.activities.at(-1).id, "a3");
  assert.match(H.markdown(b, H.view(b), D, "2026-10-02"), /Counts entered by the user in a plan started blank\./);
});

test("basis: the loaded example is labelled fictional until changed", () => {
  const s = example();
  assert.equal(s.basis, "example");
  assert.match(H.markdown(s, H.view(s), D, "2026-10-02"), /Fictional example counts, for illustration only; not real data\./);
  for (const r of [H.setCount(s, 0, "worthwhile", "012"), H.rename(s, 3, " Notes "), H.setHours(s, "020")]) {
    assert.equal(r.unchanged, true, "an unchanged value is no edit");
    assert.equal(r.state.basis, "example");
  }
});

test("basis: any change to the example makes it the edited example, which stays fictional", () => {
  const edits = [(s) => H.setCount(s, 3, "notWorthwhile", "2"), (s) => H.rename(s, 0, "Maths"), (s) => H.setHours(s, "30"), (s) => H.addActivity(s), (s) => H.removeActivity(s, 0)];
  for (const e of edits) assert.equal(ok(e(example())).basis, "edited", String(e));
  const s = ok(edits[0](example()));
  assert.match(H.markdown(s, H.view(s), D, "2026-10-02"), /The fictional example, edited by the user; counts left unchanged are still fictional\./);
  assert.equal(ok(H.setCount(s, 0, "worthwhile", "1")).basis, "edited");
});

test("chance of the highest draw matches closed forms: a/(a + 1) for Beta(a, 1) against Beta(1, 1), 1/k for k equal posteriors", () => {
  for (const a of [1, 2, 5, 40]) {
    const [p, q] = H.probBest([[a, 1], [1, 1]]);
    near(p, a / (a + 1), 1e-9, `Beta(${a}, 1)`);
    near(q, 1 / (a + 1), 1e-9, `Beta(1, 1) against Beta(${a}, 1)`);
  }
  for (const k of [2, 3, 7]) H.probBest(Array.from({ length: k }, () => [4, 9])).forEach((p, i) => near(p, 1 / k, 1e-9, `${k} equal, ${i}`));
  // Beta(2, 1) against Beta(1, 2): P(X > Y) = ∫ 2x (2x - x²) dx = 4/3 - 1/2 = 5/6.
  near(H.probBest([[2, 1], [1, 2]])[0], 5 / 6, 1e-9, "Beta(2, 1) against Beta(1, 2)");
});

test("chance best agrees with 200,000 seeded Thompson draws on the example, and sums to 1", () => {
  const V = H.view(example()), params = V.rows.map((r) => [1 + r.s, 1 + r.f]);
  const st = L.seedState(9, 0), wins = params.map(() => 0), N = 200000;
  for (let d = 0; d < N; d += 1) wins[L.argmax(params.map(([a, b]) => L.sampleBeta(st, a, b)))] += 1;
  V.rows.forEach((r, i) => near(r.probBest, wins[i] / N, 0.004, r.name));
  near(sum(V.rows.map((r) => r.probBest)), 1, 1e-12, "sum");
});

test("chance best stays finite and normalised for sharp and far-apart posteriors", () => {
  const pb = H.probBest([[1, 20001], [2, 20000], [10001, 10001], [1, 1], [3, 9]]);
  assert.ok(pb.every((p) => Number.isFinite(p) && p >= 0 && p <= 1), String(pb));
  near(sum(pb), 1, 1e-12, "sum");
  assert.ok(pb[0] < 1e-6 && pb[1] < 1e-6, "near-zero rates are almost never best");
  near(pb[2] + pb[3], 1, 0.02, "the two activities near 50% take nearly everything");
  near(H.probBest([[10001, 1], [1, 10001]])[0], 1, 1e-12, "a sure winner");
});

test("apportioning: whole hours that sum to H, floors first, then the largest remainders, ties to the first", () => {
  assert.deepEqual(plain(H.apportion([1 / 3, 1 / 3, 1 / 3], 10)), [4, 3, 3]);
  assert.deepEqual(plain(H.apportion([0.5, 0.3, 0.2], 7)), [4, 2, 1]);
  assert.deepEqual(plain(H.apportion([0.98, 0.01, 0.01], 3)), [3, 0, 0]);
  assert.deepEqual(plain(H.apportion([0, 1], 1)), [0, 1]);
  for (const H_ of [1, 2, 13, 168]) assert.equal(sum(H.apportion([0.123, 0.456, 0.421], H_)), H_);
});

test("UCB1 hour by hour: hand-computed scores, untried activities first, planned hours count as blocks", () => {
  // A: 1 of 2 worthwhile; B: 1 of 1. The first hour: T = 3; A scores 0.5 + √(2 ln 3 / 2), B 1 + √(2 ln 3).
  const one = H.ucbPlan([{ s: 1, f: 1, n: 2 }, { s: 1, f: 0, n: 1 }], 1);
  assert.deepEqual(plain(one.hours), [0, 1]);
  // After it, B counts 2 blocks with share 1 and T = 4.
  near(one.scores[1].score, 1 + Math.sqrt(2 * Math.log(4) / 2), 1e-12, "B after one planned hour");
  near(one.scores[0].score, 0.5 + Math.sqrt(2 * Math.log(4) / 2), 1e-12, "A after one planned hour");
  const fresh = H.ucbPlan([{ s: 5, f: 0, n: 5 }, { s: 0, f: 0, n: 0 }, { s: 0, f: 0, n: 0 }], 2);
  assert.deepEqual(plain(fresh.order), [1, 2], "untried activities get the first hours, in display order");
  const tie = H.ucbPlan([{ s: 1, f: 1, n: 2 }, { s: 1, f: 1, n: 2 }], 1);
  assert.deepEqual(plain(tie.hours), [1, 0], "ties go to the first");
  assert.equal(sum(H.ucbPlan([{ s: 1, f: 1, n: 2 }, { s: 0, f: 3, n: 3 }], 37).hours), 37);
});

test("the example's plan: both methods use exactly the hours, Thompson follows chance best, explanations quote the numbers", () => {
  const V = H.view(example());
  assert.equal(sum(V.rows.map((r) => r.thompson)), 20);
  assert.equal(sum(V.rows.map((r) => r.ucb)), 20);
  assert.deepEqual(V.rows.map((r) => r.thompson), plain(H.apportion(V.rows.map((r) => r.probBest), 20)));
  const notes = V.rows.find((r) => r.name === "Notes"), fpl = V.rows.find((r) => r.name === "FPL");
  assert.equal(notes.text.posterior, "Beta(6, 2)");
  assert.equal(notes.mean, 6 / 8);
  assert.equal(notes.text.mean, "75.0%");
  assert.equal(V.lead, "Notes");
  assert.ok(V.tsWhy.includes("Notes has " + notes.text.probBest) && V.tsWhy.includes("Notes gets " + notes.text.thompson + " of the 20"), V.tsWhy);
  assert.equal(fpl.thompson, 0);
  assert.match(V.tsWhy, /FPL gets none/);
  assert.match(V.ucbWhy, /not probabilities/);
  assert.equal(V.agree, false);
  assert.match(V.agreement, /^The plans differ by \d+ hours?: Thompson Sampling uses \d of the 5 activities and UCB1 \d\./);
  assert.deepEqual(plain(H.view(example())), plain(V), "the view is deterministic");
});

test("sensitivity: one more not-worthwhile block for the leader never gives it more Thompson hours", () => {
  for (const s of [example(), ok(H.setCount(ok(H.setCount(example(), 2, "worthwhile", "20")), 2, "notWorthwhile", "1"))]) {
    const V = H.view(s), lead = V.rows.find((r) => r.name === V.lead);
    const m = /would give it (\d+) hours? instead of (\d+) hours?/.exec(V.sensitivity[0]);
    assert.ok(m, V.sensitivity[0]);
    assert.equal(+m[2], lead.thompson);
    const worse = H.clone(s);
    worse.activities.find((x) => x.name === V.lead).notWorthwhile += 1;
    assert.equal(+m[1], H.view(worse).rows.find((r) => r.name === V.lead).thompson);
    assert.ok(+m[1] <= +m[2], V.lead);
  }
});

test("input validation: names, block counts and hours", () => {
  const s = example();
  assert.match(H.rename(s, 0, " ").error, /required/);
  assert.match(H.rename(s, 0, "notes").error, /unique/);
  assert.match(H.rename(s, 0, "x".repeat(61)).error, /at most 60/);
  assert.equal(ok(H.rename(s, 0, "  Maths  ")).activities[0].name, "Maths");
  assert.match(H.setCount(s, 0, "worthwhile", "-1").error, /Worthwhile blocks must be a whole number from 0 to 10,000/);
  assert.match(H.setCount(s, 0, "notWorthwhile", "2.5").error, /Not-worthwhile blocks/);
  assert.match(H.setCount(s, 0, "worthwhile", "10001").error, /10,000/);
  assert.equal(H.setCount(s, 0, "worthwhile", "12").unchanged, true);
  const b = ok(H.setCount(s, 0, "worthwhile", " 3 "));
  assert.deepEqual([b.activities[0].worthwhile, b.activities[0].notWorthwhile], [3, 4]);
  assert.equal(b.basis, "edited");
  for (const bad of ["0", "169", "2.5", "", "ten"]) assert.match(H.setHours(s, bad).error, /Hours available must be a whole number from 1 to 168/, bad);
  assert.equal(ok(H.setHours(s, "40")).hours, 40);
  assert.equal(H.serialise(s), H.serialise(example()), "commands never change their input");
});

test("adding and removing activities: 2 to 12, unique default names, new activities start with no blocks", () => {
  let s = example();
  s = ok(H.addActivity(s));
  assert.deepEqual(plain(s.activities.at(-1)), { id: "a6", name: "Activity 6", worthwhile: 0, notWorthwhile: 0 });
  const V = H.view(s);
  assert.ok(V.rows.at(-1).ucb >= 1, "UCB1 gives an untried activity at least one hour");
  assert.match(V.ucbWhy, /Activity 6 has no blocks yet, so it gets the first hours/);
  while (s.activities.length < 12) s = ok(H.addActivity(s));
  assert.match(H.addActivity(s).error, /At most 12/);
  while (s.activities.length > 2) s = ok(H.removeActivity(s, 0));
  assert.match(H.removeActivity(s, 0).error, /At least 2/);
  assert.equal(sum(H.view(s).rows.map((r) => r.thompson)), 20);
});

test("JSON round trip, and imports that are rejected whole", () => {
  const s = ok(H.setHours(ok(H.setCount(example(), 2, "worthwhile", "1")), "31"));
  const r = H.parse(H.serialise(s));
  assert.deepEqual(plain(r.state), plain(s));
  const doc = () => JSON.parse(H.serialise(s));
  const reject = (mutate, pattern) => { const d = doc(); mutate(d); const out = H.parse(JSON.stringify(d)); assert.match(out.error || "", pattern); assert.equal(out.state, undefined); };
  assert.match(H.parse("{").error, /not valid JSON/);
  assert.match(H.parse("[]").error, /not a JSON object/);
  reject((d) => { d.format = "multi-armed-bandit"; }, /not a multi-armed bandit hours plan/);
  reject((d) => { d.version = 2; }, /Unsupported version 2/);
  reject((d) => { d.basis = "real"; }, /Invalid plan basis/);
  reject((d) => { d.basis = "entered"; }, /Invalid plan basis/);
  reject((d) => { d.hours = 0; }, /Hours available/);
  reject((d) => { d.hours = "20"; }, /Hours available/);
  reject((d) => { d.activities = d.activities.slice(0, 1); }, /2 to 12 activities/);
  reject((d) => { d.activities[1].id = d.activities[0].id; }, /duplicate id/);
  reject((d) => { d.activities[1].name = d.activities[0].name.toUpperCase(); }, /unique/);
  reject((d) => { d.activities[0].worthwhile = 1.5; }, /Activity 1: /);
  reject((d) => { d.activities[0].notWorthwhile = -1; }, /Activity 1: /);
  reject((d) => { d.nextId = 2; }, /next activity id/);
  // An experiment file is not a plan, and a plan is not an experiment.
  assert.match(H.parse(L.serialise(L.fromTemplate(D, "website", 3))).error, /not a multi-armed bandit hours plan/);
  assert.match(L.parse(H.serialise(s)).error, /not a multi-armed bandit experiment/);
});

test("the Markdown plan follows Inputs, Assumptions, Derived quantities, Result, Sensitivity, Notes and quotes the view", () => {
  const s = example(), V = H.view(s), md = H.markdown(s, V, D, "2026-10-02");
  assert.deepEqual(md.split("\n").filter((l) => /^#{1,2} /.test(l)),
    ["# Next week's hours: a plan for 20 hours", "## Inputs", "## Assumptions", "## Derived quantities", "## Result", "## Sensitivity", "## Notes"]);
  assert.match(md, /Made on 2026-10-02 /);
  assert.match(md, /Fictional example counts, for illustration only; not real data\./);
  for (const r of V.rows) {
    assert.ok(md.includes(`| ${r.name} | ${r.text.thompson} | ${r.text.ucb} |`), r.name);
    assert.ok(md.includes(`| ${r.name} | ${r.text.share} | ${r.text.posterior} | ${r.text.mean} | ${r.text.interval} | ${r.text.probBest} | ${r.text.score} |`), r.name);
  }
  for (const a of D.hours.assumptions) assert.ok(md.includes("- " + a), a);
  assert.ok(md.includes(V.sensitivity[0]));
  assert.equal(H.markdown(s, H.view(s), D, "2026-10-02"), md, "deterministic");
  const evil = ok(H.rename(s, 0, "a | b *c* <x>"));
  const md2 = H.markdown(evil, H.view(evil), D, "2026-10-02");
  assert.ok(md2.includes("| a \\| b \\*c\\* \\<x\\> |"), "names are escaped inside table cells");
  assert.ok(!md2.includes("<x>"));
});

test("the page saves, copies, exports and restores the plan under its own key, and get_data reports it", async () => {
  const s = ok(H.setHours(ok(H.setCount(ok(H.setCount(example(), 2, "worthwhile", "7")), 2, "notWorthwhile", "1")), "12")), stored = H.serialise(s), tools = [];
  const exp = L.fromTemplate(D, "website", 4), expStored = L.serialise(exp, L.simCreate(exp));
  const localStorage = { getItem: (k) => (k === "multi-armed-bandit:hours:v1" ? stored : k === "multi-armed-bandit:v1" ? expStored : null), setItem() {}, removeItem() {} };
  const navigator = { modelContext: { registerTool: (t) => tools.push(t) }, clipboard: { writeText: async () => {} } };
  const page = await openPage("multi-armed-bandit", { globals: { localStorage, navigator } });
  const md = H.markdown(s, H.view(s), D, today());
  await page.click("h-save-md");
  assert.deepEqual(page.saved, [{ name: "multi-armed-bandit-hours-plan.md", text: md }]);
  await page.click("h-export");
  assert.equal(page.saved[1].name, "multi-armed-bandit-hours.json");
  assert.deepEqual(plain(H.parse(page.saved[1].text).state), plain(s));
  const data = JSON.parse((await tools.find((t) => t.name === "get_data").execute()).content[0].text);
  assert.equal(data.hours.hours, 12);
  assert.deepEqual(data.hours.activities.map((a) => [a.name, a.thompsonHours, a.ucb1Hours]), plain(H.view(s).rows.map((r) => [r.name, r.thompson, r.ucb])));
  assert.equal(data.experiment.variants[0].posteriorMean, "8.82%", "the experiment is untouched");
  const meta = JSON.parse((await tools.find((t) => t.name === "get_metadata").execute()).content[0].text);
  assert.equal(meta.hours.format, "multi-armed-bandit-hours");
  assert.deepEqual(meta.hours.assumptions, D.hours.assumptions);
});

test("the page starts a blank plan when the saved plan is invalid, and says so", async () => {
  const writes = [];
  const page = await openPage("multi-armed-bandit", { globals: { setTimeout: (fn) => { fn(); return 0; }, localStorage: { getItem: (k) => (k === "multi-armed-bandit:hours:v1" ? "{\"format\":\"x\"}" : null), setItem: (k, v) => writes.push([k, v]), removeItem() {} } } });
  assert.match(page.run(`document.getElementById("h-store").textContent`), /^Saved plan could not be restored \(This is not a multi-armed bandit hours plan file\.\); started a blank plan\.$/);
  const plan = writes.filter(([k]) => k === "multi-armed-bandit:hours:v1").at(-1);
  assert.equal(plan[1], H.serialise(H.blank(D)));
});

test("the page starts blank; Load example shows the fictional example and Clear example returns to blank", async () => {
  const writes = [];
  const page = await openPage("multi-armed-bandit", { globals: { setTimeout: (fn) => { fn(); return 0; }, localStorage: { getItem: () => null, setItem: (k, v) => writes.push([k, v]), removeItem() {} } } });
  const shown = () => page.run(`[document.getElementById("h-basis").textContent, document.getElementById("h-note").textContent, document.getElementById("h-clear").hidden]`);
  const last = () => writes.filter(([k]) => k === "multi-armed-bandit:hours:v1").at(-1)[1];
  assert.deepEqual(plain(shown()), ["Your own plan", "", true]);
  assert.equal(last(), H.serialise(H.blank(D)));
  await page.click("h-example");
  assert.deepEqual(plain(shown()), ["Fictional example counts", D.hours.note, false]);
  assert.equal(last(), H.serialise(example()));
  await page.click("h-clear");
  assert.deepEqual(plain(shown()), ["Your own plan", "", true]);
  assert.equal(last(), H.serialise(H.blank(D)));
});
