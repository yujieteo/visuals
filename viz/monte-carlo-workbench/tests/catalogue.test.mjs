// The catalogue as data: every law of the group with each required part, a behaviour experiment and three workflows
// of its own; every workflow with its 7 parts and a model that compiles and runs; two-way links between laws; every
// method with its 6 parts; every theory panel with its 6 parts and a linked experiment that opens; every dataset
// with its source, date and licence; and a glossary entry for each technical abbreviation of the reader text.
import assert from "node:assert/strict";
import test from "node:test";
import { D, En, L, M, data, recordOf } from "./helpers.mjs";

const GROUP = ["bernoulli", "binomial", "categorical", "multinomial", "uniform", "geometric", "negbin", "poisson", "hypergeometric", "zipf"];

test("the discrete group holds its 10 laws, each with every required part and a sampler in the code", () => {
  assert.deepEqual(data.laws.map((/** @type {any} */ l) => l.id), GROUP);
  for (const l of data.laws) {
    for (const k of ["name", "convention", "pmf", "support"]) assert.ok(l[k]?.length > 3, `${l.id}: ${k}`);
    assert.ok(l.params.length >= 1 && l.params.every((/** @type {any} */ p) => p.domain), `${l.id}: parameters with domains`);
    assert.ok(l.limits.length >= 2, `${l.id}: limiting cases`);
    for (const k of ["mean", "variance", "existence"]) assert.ok(l.moments[k], `${l.id}: moments.${k}`);
    for (const k of ["pgf", "mgf", "cf"]) assert.ok(l.transforms[k], `${l.id}: transforms.${k}`);
    const code = L.BY_ID[l.id];
    assert.ok(code, `${l.id} has code`);
    assert.deepEqual(code.params.map((/** @type {any} */ p) => p.name).sort(), l.params.map((/** @type {any} */ p) => p.name).sort(), `${l.id}: the same parameter names in the catalogue and the code`);
  }
});

test("links between laws go both ways", () => {
  for (const l of data.laws) {
    assert.ok(l.links.length >= 1, `${l.id} links to another law`);
    for (const x of l.links) {
      const back = data.laws.find((/** @type {any} */ y) => y.id === x.to);
      assert.ok(back, `${l.id} links to ${x.to}, which exists`);
      assert.ok(back.links.some((/** @type {any} */ y) => y.to === l.id), `${x.to} links back to ${l.id}`);
    }
  }
});

test("each law has one behaviour experiment and at least three workflows of its own, in different domains", () => {
  for (const id of GROUP) {
    const exps = data.models.filter((/** @type {any} */ m) => m.law === id && m.kind === "experiment");
    const wfs = data.models.filter((/** @type {any} */ m) => m.law === id && m.kind === "workflow");
    assert.equal(exps.length, 1, `${id}: one behaviour experiment`);
    assert.ok(exps[0].observe.length > 40, `${id}: the experiment says what to observe`);
    assert.ok(wfs.length >= 3, `${id}: ${wfs.length} workflows`);
    assert.equal(new Set(wfs.map((/** @type {any} */ w) => w.domain)).size, wfs.length, `${id}: workflows in different domains`);
    for (const w of wfs) assert.ok(recordOf(w.id).variables.some((/** @type {any} */ v) => v.law === id), `${w.id} draws from its own law ${id}`);
  }
  assert.deepEqual([...M.WORKFLOWS, ...M.EXPERIMENTS].sort(), data.models.map((/** @type {any} */ m) => m.id).sort(), "the state's model ids are the catalogue's");
});

test("each workflow has its 7 parts, a data statement, a decision, and a model that compiles and runs one block", () => {
  for (const w of data.models.filter((/** @type {any} */ m) => m.kind === "workflow")) {
    for (const k of ["decision", "reason", "inputs", "dependence", "method", "diagnostics", "interpretation"]) assert.ok(w[k]?.length > 30, `${w.id}: ${k}`);
    assert.match(w.decision, /Decision:.*Estimated quantity:/s, `${w.id}: a concrete decision and an estimated quantity`);
    assert.match(w.diagnostics, /Other candidate (model|method|design|rule)s?:/, `${w.id}: competing models`);
    assert.match(w.interpretation, /Reject/, `${w.id}: rejection conditions`);
    assert.ok(w.data.kind === "synthetic" ? /Synthetic/.test(w.data.text) : data.datasets.some((/** @type {any} */ d) => d.id === w.data.dataset), `${w.id}: a data statement`);
  }
  for (const m of data.models) {
    const c = En.prepare(recordOf(m.id), { seed: 1, method: "independent", overrides: {} });
    assert.ok(c.ok, `${m.id}: ${c.errors?.join(" ")}`);
    assert.equal(En.block(c, 0, {}).error, "", `${m.id} runs a block`);
    assert.deepEqual(D.parse(m.dsl, m.id).errors, [], m.id);
  }
});

test("each method has its estimator, assumptions, settings, suitable example, failure example and comparison", () => {
  assert.deepEqual(data.methods.map((/** @type {any} */ m) => m.id), ["independent", "inverse", "rejection"]);
  for (const m of data.methods) {
    for (const k of ["estimator", "estimatorText"]) assert.ok(m[k]?.length > 10, `${m.id}: ${k}`);
    assert.ok(m.assumptions.length >= 2 && m.settings.length >= 2, `${m.id}: assumptions and settings`);
    for (const k of ["suitable", "failure", "comparison"]) assert.ok(data.models.some((/** @type {any} */ x) => x.id === m[k].model) && m[k].text.length > 40, `${m.id}: ${k}`);
    assert.ok(data.methods.some((/** @type {any} */ x) => x.id === m.comparison.with && x.id !== m.id), `${m.id}: compared with another method`);
  }
});

test("each theory panel has a statement, assumptions, a proof sketch, a reference, a counterexample and a linked experiment", () => {
  assert.deepEqual(data.theory.map((/** @type {any} */ t) => t.id), ["lln", "clt", "consistency", "variance"]);
  for (const t of data.theory) {
    for (const k of ["title", "statement", "proof", "reference", "counterexample"]) assert.ok(t[k]?.length > 20, `${t.id}: ${k}`);
    assert.ok(t.assumptions.length >= 2, `${t.id}: assumptions`);
    assert.ok(data.models.some((/** @type {any} */ m) => m.id === t.experiment.model), `${t.id}: the linked experiment exists`);
    const state = { ...M.exampleState(data.models.find((/** @type {any} */ m) => m.id === t.experiment.model)), ...t.experiment.settings };
    for (const [k, v] of Object.entries(state)) assert.notEqual(M.FIELDS[k], undefined, `${t.id}: ${k} is a state field (${v})`);
  }
});

test("each real dataset states its source, date and licence, and its counts fit its law's support", () => {
  for (const d of data.datasets) {
    for (const k of ["title", "source", "date", "licence", "unit"]) assert.ok(d[k]?.length >= 4, `${d.id}: ${k}`);
    assert.match(d.licence, /Public domain/);
    assert.equal(d.values.length, d.counts.length);
    assert.ok(d.counts.every((/** @type {number} */ c) => Number.isInteger(c) && c >= 0));
  }
  const total = (/** @type {string} */ id) => data.datasets.find((/** @type {any} */ d) => d.id === id).counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
  assert.deepEqual([total("horse-kicks"), total("rutherford-geiger"), total("weldon")], [200, 2608, 26306]);
});

test("the groups list piece 1 here and the 9 groups to come, in merge order", () => {
  assert.deepEqual(data.groups.map((/** @type {any} */ g) => g.piece), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(data.groups.map((/** @type {any} */ g) => g.status), ["here", ...Array(9).fill("to come")]);
});

test("every technical abbreviation of the reader text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  const text = JSON.stringify({ laws: data.laws, models: data.models.map((/** @type {any} */ m) => ({ ...m, dsl: "" })), methods: data.methods, theory: data.theory });
  const found = new Set([...text.matchAll(/\b(PMF|CDF|PGF|MGF|CF|CLT|LLN|MLE|i\.i\.d\.)(?![\w])/g)].map((m) => m[1]));
  assert.ok(found.size >= 5, [...found].join(" "));
  for (const t of found) assert.ok(glossary.has(t), `the glossary defines ${t}`);
  assert.equal(glossary.size, data.glossary.length, "no term is defined twice");
  for (const g of data.glossary) assert.ok(g.definition.length > 15, `${g.term} has a definition`);
});
