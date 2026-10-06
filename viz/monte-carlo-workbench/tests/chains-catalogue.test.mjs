// Group 8's catalogue as data: each lab example with what to observe or its 7 workflow parts, its parameters,
// quantities and settings, and a record that compiles and runs; each synthetic dataset made again by its stated
// generator; the real O-ring dataset; each method with its 6 parts and examples that open settings that run the
// method; the theory panels of the group; the state fields that can hold every example; and a glossary entry for each
// technical abbreviation and term of the group's reader text.
import assert from "node:assert/strict";
import test from "node:test";
import { Ch, M, data } from "./helpers.mjs";

const lab = data.chains;
/** The state of an example with optional settings, as the page opens it. @param {any} x @param {Record<string, any>} [extra] */
const stateOf = (x, extra = {}) => ({ ...Object.fromEntries(Object.keys(M.FIELDS).filter((k) => k.startsWith("c_")).map((k) => [k, M.FIELDS[k].default])), ...x.settings, ...extra });
/** The engine settings of a state. @param {Record<string, any>} s */
const settingsOf = (s) => ({ seed: 1, method: s.c_method, compare: s.c_compare, size: s.c_size, runs: s.c_runs, step: s.c_step, eps: s.c_eps, leap: s.c_leap, start: s.c_start,
  resample: s.c_resample, ess: s.c_ess, schedule: s.c_schedule, temps: s.c_temps, moves: s.c_moves, scramble: s.c_scramble, path: s.c_path });

test("each example has a title, a problem, its parameters and quantities, and a setting the state can hold", () => {
  assert.deepEqual(lab.examples.map((/** @type {any} */ x) => x.id), M.LAB_IDS, "the state's example ids are the catalogue's");
  for (const x of lab.examples) {
    assert.ok(x.title.length > 20 && x.problem.length > 60, `${x.id}: title and problem`);
    assert.equal(Ch.familyOf(x.model), x.family, `${x.id}: family`);
    assert.ok(x.params.length >= 1 && x.params.every((/** @type {any} */ p) => p.note.length > 10 && Number.isFinite(p.value)), `${x.id}: parameters`);
    assert.ok(x.quantities.length >= 1 && x.quantities.length <= /** @type {number} */ (M.FIELDS.c_q.max) && x.quantities.every((/** @type {any} */ q) => q.name && q.note.length > 10), `${x.id}: quantities`);
    for (const [k, v] of Object.entries(x.settings)) {
      const F = /** @type {any} */ (M.FIELDS[k]);
      assert.ok(F, `${x.id}: ${k} is a state field`);
      if (F.values) assert.ok(F.values.includes(v), `${x.id}: ${k} = ${v}`);
      else assert.ok(v >= F.min && v <= F.max, `${x.id}: ${k} = ${v} in [${F.min}, ${F.max}]`);
    }
    const s = stateOf(x), { record, errors } = Ch.recordOf(x, s.c_params, data.datasets);
    assert.deepEqual(errors, []);
    const c = Ch.prepare(record, settingsOf(s));
    assert.ok(c.ok, `${x.id}: ${c.errors?.join(" ")}`);
    const ref = Ch.reference(record);
    for (const q of x.quantities) assert.ok(Number.isFinite(ref.values[q.id]), `${x.id}: a reference for ${q.id}`);
    assert.ok(["exact", "numerical"].includes(ref.tag) && ref.how.length > 10, `${x.id}: the reference states its kind and method`);
  }
  for (const fam of ["target", "filter", "integral"]) assert.ok(lab.examples.filter((/** @type {any} */ x) => x.family === fam).length >= 2, `${fam}: at least two examples`);
});

test("each behaviour experiment says what to observe; each workflow has its 7 parts, a decision rule and a data statement", () => {
  for (const x of lab.examples) {
    if (x.kind === "experiment") { assert.ok(x.observe.length > 120, `${x.id}: what to observe`); continue; }
    assert.equal(x.kind, "workflow");
    for (const k of ["decision", "reason", "inputs", "dependence", "method", "diagnostics", "interpretation"]) assert.ok(x[k]?.length > 60, `${x.id}: ${k}`);
    assert.match(x.decision, /Decision:.*Estimated quantity:/s, `${x.id}: a concrete decision and an estimated quantity`);
    assert.match(x.diagnostics, /Other candidate models:/, `${x.id}: competing models`);
    assert.match(x.interpretation, /Reject/, `${x.id}: rejection conditions`);
    assert.ok(x.domain.length > 3, `${x.id}: a domain`);
    assert.ok(x.quantities.some((/** @type {any} */ q) => q.id === x.rule.quantity) && [">=", "<="].includes(x.rule.op) && x.rule.yes && x.rule.no, `${x.id}: a decision rule on one of its quantities`);
    assert.ok(x.data.kind === "synthetic" ? /^Synthetic:.*not calibrated evidence/.test(x.data.text) : data.datasets.some((/** @type {any} */ d) => d.id === x.data.dataset), `${x.id}: a data statement`);
  }
  assert.ok(new Set(lab.examples.filter((/** @type {any} */ x) => x.kind === "workflow").map((/** @type {any} */ x) => x.domain)).size >= 5, "workflows in different domains");
});

test("synthetic data are what their generator makes, and the real O-ring data have 23 flights with 9 distressed O-rings", () => {
  for (const x of lab.examples) {
    if (!x.data.generator) continue;
    const made = Ch.synthetic(x.data.generator);
    assert.equal(made.length, x.data.generator.n, `${x.id}: count`);
    if (x.data.y) assert.deepEqual(x.data.y, made, `${x.id}: the stored values are the generator's`);
    assert.match(x.data.text, new RegExp(`seed ${x.data.generator.seed}\\b`), `${x.id}: the text names the seed`);
  }
  const d = data.datasets.find((/** @type {any} */ x) => x.id === "challenger-orings");
  assert.deepEqual([d.values.length, d.counts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0), d.counts.filter((/** @type {number} */ k) => k > 0).length, Math.min(...d.values), d.atRisk], [23, 9, 7, 53, 6]);
  assert.match(d.licence, /Public domain/);
});

test("each method has its estimator, assumptions, settings, suitable example, failure example and comparison, each opening a setting that runs it", () => {
  assert.deepEqual(lab.methods.map((/** @type {any} */ m) => m.id), ["metropolis", "gibbs", "hmc", "smc", "particle", "rqmc"]);
  assert.deepEqual([...new Set(lab.methods.map((/** @type {any} */ m) => m.family))], ["Markov chains", "Sequential inference", "Integration"]);
  for (const m of lab.methods) {
    assert.ok(m.estimator.length > 20 && m.estimatorText.length > 80, `${m.id}: estimator`);
    assert.ok(m.assumptions.length >= 3 && m.settings.length >= 3, `${m.id}: assumptions and settings`);
    assert.ok(M.FIELDS.c_method.values?.includes(m.id), `${m.id}: the state can select it`);
    assert.ok(m.comparison.with !== m.id && M.LAB_METHODS.includes(m.comparison.with), `${m.id}: compared with another method`);
    for (const part of ["suitable", "failure", "comparison"]) {
      const p = m[part], x = lab.examples.find((/** @type {any} */ e) => e.id === p.example);
      assert.ok(x && p.text.length > 60, `${m.id}: the ${part} example exists`);
      const s = stateOf(x, p.settings);
      assert.equal(s.c_method, m.id, `${m.id}: the ${part} example runs the method`);
      const { record } = Ch.recordOf(x, s.c_params, data.datasets);
      const c = Ch.prepare(record, { ...settingsOf(s), size: Math.min(s.c_size, 10), runs: 2 });
      assert.ok(c.ok, `${m.id} ${part}: ${c.errors?.join(" ")}`);
      assert.equal(Ch.block(c, 0, { reference: Ch.reference(record) }).error, "", `${m.id} ${part}: one run`);
    }
  }
});

test("the theory panels of group 8 link to lab examples with settings the state can hold", () => {
  const mine = data.theory.filter((/** @type {any} */ t) => t.experiment.chains);
  assert.deepEqual(mine.map((/** @type {any} */ t) => t.id), ["markov", "particles", "rqmc"]);
  for (const t of mine) {
    assert.ok(lab.examples.some((/** @type {any} */ x) => x.id === t.experiment.chains), `${t.id} → ${t.experiment.chains}`);
    for (const k of Object.keys(t.experiment.settings ?? {})) assert.ok(M.FIELDS[k], `${t.id}: ${k} is a state field`);
    assert.ok(t.assumptions.length >= 3 && t.counterexample.length > 100, `${t.id}: assumptions and a counterexample`);
  }
});

test("every technical abbreviation and term of the group's reader text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  const text = JSON.stringify({ lab, theory: data.theory.filter((/** @type {any} */ t) => t.experiment.chains) });
  const found = new Set([...text.matchAll(/\b(ESS|MCSE|MCMC|HMC|SMC|QMC|RQMC|CLT|i\.i\.d\.)(?![\w])/g)].map((m) => m[1]));
  assert.ok(found.size >= 3, [...found].join(" "));
  for (const t of found) assert.ok(glossary.has(t), `the glossary defines ${t}`);
  for (const term of ["Markov chain", "stationary law", "detailed balance", "Metropolis–Hastings", "Gibbs sampler", "full conditional law", "leapfrog", "divergent transition", "warm-up", "autocorrelation",
    "integrated autocorrelation time", "split R-hat", "effective sample size", "tempering", "evidence", "importance weight", "weight degeneracy", "resampling", "particle filter", "Kalman filter",
    "genealogy", "path degeneracy", "Sobol sequence", "digital net", "scramble", "digital shift", "Koksma–Hlawka inequality", "Brownian bridge"]) assert.ok(glossary.has(term), `the glossary defines ${term}`);
});
