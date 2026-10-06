// Group 7's catalogue as data: each rare-event problem with its 7 parts and a data statement; each method with its
// estimator, assumptions, settings, suitable example, failure example and comparison, each example opening a setting
// that compiles; each example with what to observe and a state the page can hold; each theory panel of the group
// linked to an example; the refusals that the texts promise; and a glossary entry for each technical abbreviation and
// term of the group's reader text.
import assert from "node:assert/strict";
import test from "node:test";
import { M, Ra, data } from "./helpers.mjs";

const rare = data.rare;

test("each rare-event problem has its 7 parts, a decision, competing models, rejection conditions and a data statement", () => {
  assert.deepEqual(rare.problems.map((/** @type {any} */ p) => p.id), Ra.PROBLEMS);
  for (const p of rare.problems) {
    assert.ok(p.title.length > 10, `${p.id}: title`);
    for (const k of ["statement", "decision", "reason", "inputs", "dependence", "diagnostics", "interpretation"]) assert.ok(p[k]?.length > 30, `${p.id}: ${k}`);
    assert.match(p.decision, /Decision:.*Estimated quantity:/s, `${p.id}: a decision and an estimated quantity`);
    assert.match(p.diagnostics, /Other candidate models:/, `${p.id}: competing models`);
    assert.match(p.interpretation, /Reject/, `${p.id}: rejection conditions`);
    assert.match(p.data, /^Synthetic:.*not calibrated evidence/, `${p.id}: synthetic data that is not presented as evidence`);
  }
});

test("each rare-event method has its 6 parts, and its examples open settings that compile and run the method", () => {
  assert.deepEqual(rare.methods.map((/** @type {any} */ m) => m.id), Ra.METHODS);
  assert.deepEqual(rare.methods.filter((/** @type {any} */ m) => m.family === "Rare events").map((/** @type {any} */ m) => m.id), ["tilting", "splitting", "subset"]);
  assert.equal(rare.methods.find((/** @type {any} */ m) => m.id === "ais").family, "Integration");
  assert.equal(rare.methods.find((/** @type {any} */ m) => m.id === "ce").family, "Optimisation");
  for (const m of rare.methods) {
    for (const k of ["estimator", "estimatorText"]) assert.ok(m[k]?.length > 20, `${m.id}: ${k}`);
    assert.ok(m.assumptions.length >= 2 && m.settings.length >= 2, `${m.id}: assumptions and settings`);
    for (const k of ["suitable", "failure", "comparison"]) {
      const p = rare.presets.find((/** @type {any} */ x) => x.id === m[k].preset);
      assert.ok(p && m[k].text.length > 40, `${m.id}: ${k} opens an example`);
      assert.ok([p.method, p.compare].includes(m.id) || (k === "comparison" && [p.method, p.compare].includes(m.comparison.with)), `${m.id}: the ${k} example runs the method`);
    }
    assert.ok(rare.methods.some((/** @type {any} */ x) => x.id === m.comparison.with && x.id !== m.id), `${m.id}: compared with another method`);
    assert.ok(M.FIELDS.r_method.values?.includes(m.id), `${m.id}: the state can select it`);
  }
});

test("each example compiles with its settings, its failure applies to its method, and the state can hold it", () => {
  const ids = new Set();
  for (const p of rare.presets) {
    assert.ok(!ids.has(p.id), `${p.id} is unique`);
    ids.add(p.id);
    assert.ok(p.title.length > 10 && p.observe.length > 60, `${p.id}: a title and what to observe`);
    const c = Ra.prepare({ problem: p.problem, law: p.law, copula: p.copula, params: p.params }, { seed: 1, method: p.method, compare: p.compare, failure: p.failure, options: p.options, size: p.size, reps: p.reps });
    assert.ok(c.ok, `${p.id}: ${c.errors?.join(" ")}`);
    for (const [k, v] of Object.entries({ r_problem: p.problem, r_law: p.law, r_copula: p.copula, r_method: p.method, r_compare: p.compare, r_failure: p.failure })) assert.ok(M.FIELDS[k].values?.includes(v), `${p.id}: ${k} = ${v}`);
    const F = /** @type {any} */ (M.FIELDS);
    assert.ok(p.size >= F.r_size.min && p.size <= F.r_size.max && p.reps >= F.r_reps.min && p.reps <= F.r_reps.max, `${p.id}: size and replications`);
    const owner = { light_family: "ce", small_spread: "subset", nominal_start: "ais" }[/** @type {"light_family"} */ (p.failure)];
    if (owner) assert.ok([p.method, p.compare].includes(owner), `${p.id}: the failure ${p.failure} acts on ${owner}`);
  }
  for (const problem of Ra.PROBLEMS) assert.ok(rare.presets.filter((/** @type {any} */ p) => p.problem === problem).length >= 2, `${problem}: at least two examples`);
});

test("the refusals that the texts promise: tilting without an exponential moment, subset simulation on the catastrophe test", () => {
  const refused = rare.presets.find((/** @type {any} */ p) => p.id === "sum-pareto-refused");
  const c = Ra.prepare({ problem: refused.problem, law: refused.law, params: refused.params }, { method: refused.method, compare: refused.compare });
  assert.match(c.refused.tilting, /E exp\(θX\) = ∞ for every θ > 0/);
  assert.equal(c.refused.subset, "");
  for (const law of ["exponential", "weibull", "pareto2"]) assert.match(Ra.prepare({ problem: "cat", law, copula: "gumbel", params: "" }, { method: "subset" }).refused.subset, /random/);
  assert.equal(Ra.prepare({ problem: "cat", law: "exponential", copula: "gumbel", params: "" }, { method: "tilting" }).refused.tilting, "", "the light-tailed regime can be tilted");
  assert.match(Ra.prepare({ problem: "ruin", law: "pareto2", params: "c=1" }, { method: "direct" }).errors?.[0] ?? "", /net profit condition fails/);
});

test("the theory panels of group 7 link to examples of the rare-event lab", () => {
  const mine = data.theory.filter((/** @type {any} */ t) => t.experiment.rare);
  assert.deepEqual(mine.map((/** @type {any} */ t) => t.id), ["ldp", "tilting", "ruin", "pk", "taildep", "sensitivity"]);
  for (const t of mine) assert.ok(rare.presets.some((/** @type {any} */ p) => p.id === t.experiment.rare), `${t.id} → ${t.experiment.rare}`);
});

test("every technical abbreviation and term of the group's reader text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  const text = JSON.stringify({ rare, theory: data.theory.filter((/** @type {any} */ t) => t.experiment.rare) });
  const found = new Set([...text.matchAll(/\b(VaR|ES|ESS|CLT|MGF|i\.i\.d\.)(?![\w])/g)].map((m) => m[1]));
  assert.ok(found.size >= 3, [...found].join(" "));
  for (const t of found) assert.ok(glossary.has(t), `the glossary defines ${t}`);
  for (const term of ["exponential tilting", "likelihood ratio", "rate function", "large deviation", "splitting", "subset simulation", "cross-entropy method", "defensive mixture", "hazard-rate twist", "effective sample size", "adjustment coefficient", "Pollaczek–Khinchine formula", "ladder height", "integrated-tail law", "value at risk", "expected shortfall", "catastrophe layer", "systemic ruin", "cascade of defaults", "one-big-jump principle", "truncation"]) assert.ok(glossary.has(term), `the glossary defines ${term}`);
});

test("the report of the rare-event lab opens as a standard beamdswitch deck, holds each estimate and the decision, and states a refusal", async () => {
  const { createRequire } = await import("node:module");
  const { assertStandardDeck } = await import("../../../scripts/kit/checks.mjs");
  const require = createRequire(import.meta.url);
  const Beamdswitch = require("../../../scripts/templates/beamdswitch.js"), VisualKit = require("../../../scripts/kit/kit.js");
  const c = Ra.prepare({ problem: "cat", law: "pareto2", copula: "gumbel", params: "" }, { seed: 4, method: "direct", compare: "tilting", size: 10, reps: 4 });
  let acc = Ra.empty(c);
  for (let b = 0; b < c.R; b++) acc = Ra.merge(acc, Ra.block(c, b), c);
  const report = Ra.report(c, Ra.summary(c, acc), Ra.reference(c), rare, { status: "done", replications: 4, seed: 4 });
  assertStandardDeck(Beamdswitch.deck(report), "catastrophe");
  const md = VisualKit.markdown(report);
  assert.match(md, /Results after 4 replications \(done\)/);
  assert.match(md, /\| Direct simulation \| P\(at least 2 defaults by T\), No action \| /);
  assert.match(md, /refused: Exponential tilting needs E exp\(θX\) < ∞/);
  assert.match(md, /is the cheapest policy that/);
});
