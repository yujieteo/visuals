// The catalogue as data: every law of groups 1 to 4 with each required part, and the censoring mechanism, a behaviour experiment and three
// workflows of its own; every workflow with its 7 parts and a model that compiles and runs; two-way links between
// laws; every method with its 6 parts; every theory panel with its 6 parts and a linked experiment that opens; every
// dataset with its source, date and licence; and a glossary entry for each technical abbreviation of the reader text.
import assert from "node:assert/strict";
import test from "node:test";
import { Co, D, En, L, M, data, recordOf } from "./helpers.mjs";

const DISCRETE = ["bernoulli", "binomial", "categorical", "multinomial", "uniform", "geometric", "negbin", "poisson", "hypergeometric", "zipf"];
const CONTINUOUS = ["cuniform", "normal", "mvnormal", "exponential", "gamma", "erlang", "beta", "dirichlet", "chisq", "student", "fisher", "logistic", "laplace"];
const TAILS = ["lognormal", "weibull", "invgauss", "gompertz", "loglogistic", "pareto1", "pareto2", "burr12", "frechet", "cauchy", "levy", "stable", "gev", "gpd", "gumbel", "revweibull"];
const CONSTRUCTED = ["mixture", "compound", "empirical", "kde", "truncated"];
const DEPENDENCE = ["conditional", "gaussiancopula", "tcopula", "claytoncopula", "gumbelcopula", "frankcopula"];
const PROCESSES = ["brownian", "gbm", "ou", "poissonprocess", "compoundprocess", "markovchain", "branching", "hawkes", "variancegamma"];
const GROUP = [...DISCRETE, ...CONTINUOUS, ...TAILS, "censoring", ...CONSTRUCTED, ...DEPENDENCE, ...PROCESSES];

test("groups 1 to 3 hold their 10 discrete, 13 continuous and 16 positive, heavy-tailed and extreme-value laws, each with every required part and a sampler in the code", () => {
  assert.deepEqual(data.laws.map((/** @type {any} */ l) => l.id), GROUP);
  for (const l of data.laws) {
    if (["observation", "constructed", "conditional", "copula", "process"].includes(l.type)) continue;
    const continuous = CONTINUOUS.includes(l.id) || TAILS.includes(l.id);
    assert.equal(l.type, continuous ? "continuous" : "discrete", `${l.id}: type`);
    for (const k of ["name", "convention", continuous ? "pdf" : "pmf", "support"]) assert.ok(l[k]?.length > 3, `${l.id}: ${k}`);
    assert.ok(l.params.length >= 1 && l.params.every((/** @type {any} */ p) => p.domain), `${l.id}: parameters with domains`);
    assert.ok(l.limits.length >= 2, `${l.id}: limiting cases`);
    for (const k of ["mean", "variance", "existence"]) assert.ok(l.moments[k], `${l.id}: moments.${k}`);
    for (const k of continuous ? ["mgf", "cf"] : ["pgf", "mgf", "cf"]) assert.ok(l.transforms[k], `${l.id}: transforms.${k}`);
    const code = L.BY_ID[l.id];
    assert.ok(code, `${l.id} has code`);
    assert.equal(!!code.continuous, continuous, `${l.id}: the code and the catalogue agree that the law is ${continuous ? "continuous" : "discrete"}`);
    assert.deepEqual(code.params.map((/** @type {any} */ p) => p.name).sort(), l.params.map((/** @type {any} */ p) => p.name).sort(), `${l.id}: the same parameter names in the catalogue and the code`);
  }
});

test("censoring is an observation mechanism with every part of a catalogue entry, and the engine runs it", () => {
  const l = data.laws.find((/** @type {any} */ x) => x.id === "censoring");
  assert.equal(l.type, "observation");
  assert.equal(L.BY_ID.censoring, undefined, "censoring is not a law of the code");
  for (const k of ["name", "convention", "pdf", "support"]) assert.ok(l[k]?.length > 3, `censoring: ${k}`);
  assert.ok(l.params.length === 2 && l.limits.length >= 2 && l.moments.existence && l.transforms.mgf && l.transforms.cf);
  for (const m of data.models.filter((/** @type {any} */ x) => x.law === "censoring")) assert.match(recordOf(m.id).censoring, /^(right|left) \w+ by /, `${m.id} states its censoring mechanism`);
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
    // A constructed law counts by its outermost constructor: truncated_mixture_geometric is a truncated law.
    // A conditional model draws a variable whose argument reads another variable.
    const conditional = (/** @type {any} */ r) => r.variables.some((/** @type {any} */ v) => Object.values(v.args).some((e) => [...r.variables, ...r.definitions].some((/** @type {any} */ x) => new RegExp(`\\b${x.name}\\b`).test(String(e)))));
    for (const w of wfs) assert.ok(id === "conditional" ? conditional(recordOf(w.id)) : id === "censoring" ? recordOf(w.id).censoring !== "none" : recordOf(w.id).variables.some((/** @type {any} */ v) => v.law === id || Co.catalogueOf(Co.resolve(v.law)) === id), `${w.id} draws from its own law ${id}`);
  }
  assert.deepEqual([...M.WORKFLOWS, ...M.EXPERIMENTS, ...M.INPUTS].sort(), data.models.map((/** @type {any} */ m) => m.id).sort(), "the state's model ids are the catalogue's");
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
    // An example of a custom input that fails a check names the check, and the page refuses to run it with that message.
    if (m.fails) { assert.ok(!c.ok && c.errors.some((/** @type {string} */ e) => e.toLowerCase().includes(m.fails)), `${m.id} fails its ${m.fails} check: ${c.errors?.join(" ")}`); continue; }
    assert.ok(c.ok, `${m.id}: ${c.errors?.join(" ")}`);
    assert.equal(En.block(c, 0, {}).error, "", `${m.id} runs a block`);
    assert.deepEqual(D.parse(m.dsl, m.id).errors, [], m.id);
  }
});

test("each method has its estimator, assumptions, settings, suitable example, failure example and comparison", () => {
  assert.deepEqual(data.methods.map((/** @type {any} */ m) => m.id), ["independent", "inverse", "rejection", "stratified", "antithetic", "control", "crn", "euler", "mlmc"]);
  assert.deepEqual(data.methods.filter((/** @type {any} */ m) => m.family === "Variance reduction").map((/** @type {any} */ m) => m.id), ["stratified", "antithetic", "control", "crn"]);
  for (const m of data.methods) {
    for (const k of ["estimator", "estimatorText"]) assert.ok(m[k]?.length > 10, `${m.id}: ${k}`);
    assert.ok(m.assumptions.length >= 2 && m.settings.length >= 2, `${m.id}: assumptions and settings`);
    for (const k of ["suitable", "failure", "comparison"]) {
      assert.ok(data.models.some((/** @type {any} */ x) => x.id === m[k].model) && m[k].text.length > 40 && !/TODO/.test(m[k].text), `${m.id}: ${k}`);
      for (const key of Object.keys(m[k].settings ?? {})) assert.notEqual(M.FIELDS[key], undefined, `${m.id}: ${k} sets the state field ${key}`);
    }
    assert.ok(data.methods.some((/** @type {any} */ x) => x.id === m.comparison.with && x.id !== m.id), `${m.id}: compared with another method`);
    // Every method but common random numbers and multilevel Monte Carlo is a value of the method field; common random
    // numbers is the streams field, and multilevel Monte Carlo runs from its own panel with the target error field.
    assert.ok(m.id === "crn" ? M.FIELDS.streams.values?.includes("common") : m.id === "mlmc" ? M.FIELDS.mlmc_eps !== undefined : M.FIELDS.method.values?.includes(m.id), `${m.id}: the state can select it`);
  }
});

test("each theory panel has a statement, assumptions, a proof sketch, a reference, a counterexample and a linked experiment", () => {
  assert.deepEqual(data.theory.map((/** @type {any} */ t) => t.id), ["lln", "clt", "consistency", "variance", "reduction", "tails", "extremes", "exceedances", "ergodicity", "sklar", "mlmc"]);
  assert.deepEqual(data.theory.map((/** @type {any} */ t) => t.id), M.FIELDS.theory.values, "the state can open every panel");
  for (const t of data.theory) {
    for (const k of ["title", "statement", "proof", "reference", "counterexample"]) assert.ok(t[k]?.length > 20, `${t.id}: ${k}`);
    assert.ok(t.assumptions.length >= 2, `${t.id}: assumptions`);
    assert.ok(data.models.some((/** @type {any} */ m) => m.id === t.experiment.model), `${t.id}: the linked experiment exists`);
    const state = { ...M.exampleState(data.models.find((/** @type {any} */ m) => m.id === t.experiment.model)), ...t.experiment.settings };
    for (const [k, v] of Object.entries(state)) assert.notEqual(M.FIELDS[k], undefined, `${t.id}: ${k} is a state field (${v})`);
  }
});

test("each real dataset states its source, date and licence, and its counts or its series fit its law's support", () => {
  for (const d of data.datasets) {
    for (const k of ["title", "source", "date", "licence", "unit"]) assert.ok(d[k]?.length >= 4, `${d.id}: ${k}`);
    assert.match(d.licence, /Public domain/);
    if (d.kind === "series") {
      assert.equal(d.values.length, d.years.length);
      assert.ok(d.years.every((/** @type {number} */ y, /** @type {number} */ i) => Number.isInteger(y) && (i === 0 || y > d.years[i - 1])), `${d.id}: increasing years`);
      assert.ok(d.values.every((/** @type {number} */ v) => v > 0), `${d.id}: positive maxima`);
      continue;
    }
    assert.equal(d.values.length, d.counts.length);
    assert.ok(d.counts.every((/** @type {number} */ c) => Number.isInteger(c) && c >= 0));
  }
  const rain = data.datasets.find((/** @type {any} */ d) => d.id === "fort-collins-rain");
  assert.deepEqual([rain.values.length, rain.years[0], rain.years.at(-1), Math.max(...rain.values)], [128, 1896, 2025, 117.6]);
  assert.ok(data.models.some((/** @type {any} */ m) => m.data?.dataset === "fort-collins-rain"), "a workflow uses the rainfall series");
  const total = (/** @type {string} */ id) => data.datasets.find((/** @type {any} */ d) => d.id === id).counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
  assert.deepEqual([total("horse-kicks"), total("rutherford-geiger"), total("weldon")], [200, 2608, 26306]);
});

test("the groups list pieces 1 to 6 here and the 4 groups to come, in merge order", () => {
  assert.deepEqual(data.groups.map((/** @type {any} */ g) => g.piece), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(data.groups.map((/** @type {any} */ g) => g.status), [...Array(6).fill("here"), ...Array(4).fill("to come")]);
});

test("every technical abbreviation of the reader text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  const text = JSON.stringify({ laws: data.laws, models: data.models.map((/** @type {any} */ m) => ({ ...m, dsl: "" })), methods: data.methods, theory: data.theory });
  const found = new Set([...text.matchAll(/\b(PMF|PDF|CDF|PGF|MGF|CF|CLT|LLN|MLE|PERT|GEV|GPD|LOD|GBM|OU|VG|SDE|MLMC|TV|ETAS|i\.i\.d\.)(?![\w])/g)].map((m) => m[1]));
  assert.ok(found.size >= 5, [...found].join(" "));
  for (const t of found) assert.ok(glossary.has(t), `the glossary defines ${t}`);
  assert.equal(glossary.size, data.glossary.length, "no term is defined twice");
  for (const g of data.glossary) assert.ok(g.definition.length > 15, `${g.term} has a definition`);
});
