// The guided interview, group 6: the rule graph as data covers the whole agreed catalogue; each candidate has its
// reason, competing explanations, rejection tests and sampling methods, and an answer path that ranks it first;
// "insufficient evidence" follows from the stated rules; switching a rule off and picking a candidate override the
// ranking; and the record the interview makes is the record the editor makes from the same text, with the moments
// that the interview's evidence states.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { D, En, M, data, runModel } from "./helpers.mjs";

const Iv = createRequire(import.meta.url)("../src/interview.js");
const spec = data.interview;
/** @param {string} iv @param {string} [off] @param {string} [pick] */
const ev = (iv, off = "", pick = "") => Iv.evaluate(data, { iv, off, pick });

/** The 45 entries of the owner's catalogue table (Part 2), by candidate id. */
const CATALOGUE = ["bernoulli", "binomial", "categorical", "multinomial", "uniform", "geometric", "negbin", "poisson", "hypergeometric", "zipf",
  "cuniform", "normal", "mvnormal", "exponential", "gamma", "erlang", "beta", "dirichlet", "chisquare", "studentt", "f", "logistic", "laplace",
  "lognormal", "weibull", "invgauss", "gompertz", "loglogistic", "pareto1", "pareto2", "burr12", "frechet", "cauchy", "levy", "stable",
  "gev", "gpd", "gumbel", "rweibull", "mixture", "cpoisson", "empirical", "kde", "truncated", "censored"];

test("the rule graph covers the whole catalogue: every law of the page and every entry of the owner's table is a candidate", () => {
  const ids = new Set(spec.candidates.map((/** @type {any} */ c) => c.id));
  for (const id of CATALOGUE) assert.ok(ids.has(id), `${id} is a candidate`);
  const lawIds = new Set(spec.candidates.map((/** @type {any} */ c) => c.law));
  for (const l of data.laws) assert.ok(lawIds.has(l.id), `the law ${l.id} of the page is a candidate`);
  for (const k of ["copula-gauss", "copula-t", "copula-clayton", "copula-gumbel", "copula-frank", "conditional", "proc-markov", "proc-bm", "proc-gbm", "proc-ou", "proc-poisson", "proc-cpp", "proc-branch", "proc-hawkes", "proc-levy"]) assert.ok(ids.has(k), `${k} is a component`);
  assert.equal(ids.size, spec.candidates.length, "no candidate is listed twice");
});

test("each candidate has a reason path, competing explanations, rejection tests and sampling methods", () => {
  const ids = new Set(spec.candidates.map((/** @type {any} */ c) => c.id));
  for (const c of spec.candidates) {
    assert.ok(c.competing.length >= 1 && c.competing.every((/** @type {any} */ x) => ids.has(x.id) && x.id !== c.id && x.text.length > 15), `${c.id}: competing explanations`);
    assert.ok(c.tests.length >= 1 && c.tests.every((/** @type {string} */ t) => t.length > 20), `${c.id}: rejection tests`);
    if (c.role === "law") assert.ok(c.template, `${c.id}: a model template, so the code gives its sampling methods`);
    else {
      assert.ok(c.methods?.length > 20, `${c.id}: sampling methods`);
      assert.ok(data.models.some((/** @type {any} */ m) => m.id === c.example), `${c.id}: its example model exists`);
    }
    assert.ok(spec.rules.some((/** @type {any} */ r) => r.effect === "for" && r.targets.some((/** @type {string} */ t) => t === c.id || (t.startsWith("tail:") && c.tails?.includes(t.slice(5))))), `${c.id}: a rule supports it`);
  }
});

test("the rule graph is consistent: questions, options, targets and weights exist, and each rule states its basis", () => {
  const q = new Map(spec.questions.map((/** @type {any} */ x) => [x.id, new Set(["?", ...x.options.map((/** @type {any} */ o) => o.id)])]));
  const ids = new Set(spec.candidates.map((/** @type {any} */ c) => c.id));
  /** @param {any} w @param {string} where */
  const check = (w, where) => { for (const c of Array.isArray(w) ? w : [w]) for (const [k, opts] of Object.entries(c)) { assert.ok(q.has(k), `${where}: question ${k}`); for (const o of /** @type {string[]} */ (opts)) assert.ok(q.get(k).has(o), `${where}: option ${k}=${o}`); } };
  for (const x of spec.questions) if (x.ask) check(x.ask, `question ${x.id}`);
  for (const e of spec.evidence) check(e.ask, `evidence ${e.id}`);
  assert.equal(new Set(spec.rules.map((/** @type {any} */ r) => r.id)).size, spec.rules.length, "rule ids are unique");
  for (const r of spec.rules) {
    if (r.when !== "weak") check(r.when, `rule ${r.id}`);
    assert.ok(["for", "against", "insufficient", "assume"].includes(r.effect), r.id);
    assert.ok(["theorem", "assumption"].includes(r.basis) && r.source.length > 3 && r.reason.length > 20, `${r.id}: basis, source and reason`);
    if (r.effect === "for" || r.effect === "against") {
      assert.ok(r.weight > 0, `${r.id}: weight`);
      for (const t of r.targets) assert.ok(ids.has(t) || /^!?tail:(bnd|lgt|mid|pow)$/.test(t) || t === "continuous", `${r.id}: target ${t}`);
    }
  }
  for (const k of ["support", "shape", "dependence", "decision"]) assert.ok(spec.questions.some((/** @type {any} */ x) => x.topic === k), `a question on ${k}`);
});

test("each candidate has an answer path that ranks it first, alone, with the status 'candidates'", () => {
  for (const c of spec.candidates) {
    const r = ev(c.path);
    const list = c.role === "law" ? r.candidates : r.components;
    assert.equal(r.status, "candidates", `${c.id}: ${c.path} gives ${r.insufficient.map((/** @type {any} */ x) => x.rule).join(",")}`);
    assert.equal(list[0]?.id, c.id, `${c.id}: ${c.path} ranks ${list[0]?.id} first`);
    assert.ok(!list[1] || list[1].score < list[0].score, `${c.id}: no tie at the top`);
  }
});

test("insufficient evidence: no support fact, an unknown tail for a tail decision, selection, or weak support", () => {
  const empty = ev("");
  assert.equal(empty.status, "insufficient");
  assert.deepEqual(empty.insufficient.map((/** @type {any} */ x) => x.rule), ["i1"]);
  assert.equal(empty.chosen, null);
  assert.deepEqual(ev("k=siz;gs=mul;q=tl").insufficient.map((/** @type {any} */ x) => x.rule), ["n4"], "a tail decision with an unknown tail");
  assert.equal(ev("k=siz;gs=mul;t=mid;q=tl").status, "candidates", "the same with the tail known");
  assert.ok(ev("k=cnt;g=evt;o=sel").insufficient.some((/** @type {any} */ x) => x.rule === "o3"), "selection that depends on the value");
  assert.deepEqual(ev("k=cnt").insufficient.map((/** @type {any} */ x) => x.rule), ["wk"], "a count with no mechanism has only weak support");
  assert.deepEqual(ev("k=ext;ge=?;t=?;x=yes").insufficient.map((/** @type {any} */ x) => x.rule), ["i5"], "an extreme value with an unknown mechanism and an unknown tail");
  const losses = ev(spec.examples.find((/** @type {any} */ x) => x.id === "losses").iv);
  assert.equal(losses.status, "insufficient");
  assert.ok(losses.assumptions.length >= 2, "the interview lists the unresolved assumptions");
});

test("overrides: a rule switched off changes the ranking, an insufficiency rule can be switched off, and a pick replaces the top candidate", () => {
  const base = ev("k=cnt;g=het;x=yes");
  assert.equal(base.candidates[0].id, "mixture");
  const off = ev("k=cnt;g=het;x=yes", "x8,c7b");
  assert.equal(off.candidates[0].id, "negbin", "without the mixture rules, the negative binomial law is first");
  assert.ok(off.path.find((/** @type {any} */ p) => p.id === "x8").off, "the rule stays on the path, marked off");
  const weak = ev("k=cnt", "wk");
  assert.equal(weak.status, "candidates", "the reader accepts the weak support");
  const pick = ev("k=cnt;g=evt", "", "geometric");
  assert.equal(pick.chosen, "geometric");
  assert.equal(pick.picked, true);
  assert.equal(pick.top, "poisson");
  const b = Iv.build(data, pick);
  assert.ok(b.ok && /reader chose the geometric law/.test(b.record.problem), b.errors?.join(" "));
  const bad = ev("k=cnt;g=evt", "nosuch", "normal");
  assert.equal(bad.chosen, "poisson", "a pick outside the pool of the kind is ignored");
  assert.equal(bad.notices.length, 2);
});

test("the record of the interview is the record the editor makes from the same text, and it compiles and runs", () => {
  for (const c of spec.candidates.filter((/** @type {any} */ x) => x.role === "law")) {
    for (const k of c.kinds) {
      const r = ev(`k=${k}`, "", c.id);
      const b = Iv.build(data, r, c.id);
      assert.ok(b.ok, `${c.id} for k=${k}: ${b.errors?.join(" ")}`);
      assert.deepEqual(b.record, D.parse(b.text, "custom").record, `${c.id}: the editor reads the same record from the text`);
      assert.deepEqual(D.parse(D.print(b.record), "custom").record, b.record, `${c.id}: the record survives print and parse`);
      const comp = En.prepare(b.record, { seed: 1, method: "independent", overrides: {} });
      assert.ok(comp.ok, `${c.id}: ${comp.errors?.join(" ")}`);
      assert.equal(En.block(comp, 0, {}).error, "", `${c.id} runs a block`);
      assert.equal(b.record.format ?? "monte-carlo-workbench/model", "monte-carlo-workbench/model");
    }
  }
});

test("moment matching: the law of the record has the mean and the variance of the interview's evidence", () => {
  // Reference: the moment formulas of each law (law.moments), independent of the templates' expressions.
  const cases = [["poisson", "k=cnt;g=evt;m=3.5", 3.5, 3.5], ["negbin", "k=cnt;g=het;m=2;sd=2", 2, 4], ["geometric", "k=cnt;g=wai;r=one;m=1.5", 1.5, 3.75],
    ["binomial", "k=cnt;g=tri;m=6;lim=20", 6, 4.2], ["normal", "k=mea;gm=sum;m=-1;sd=2", -1, 4], ["gamma", "k=siz;gs=add;m=3;sd=1.5", 3, 2.25],
    ["lognormal", "k=siz;gs=mul;m=2;sd=1", 2, 1], ["exponential", "k=tim;gt=mem;m=4", 4, 16], ["invgauss", "k=tim;gt=fpt;dr=yes;m=2;sd=1", 2, 1],
    ["beta", "k=pro;gp=unc;m=0.3;sd=0.1", 0.3, 0.01], ["logistic", "k=mea;gm=lgs;m=1;sd=2", 1, 4], ["laplace", "k=mea;gm=dif;m=1;sd=2", 1, 4],
    ["cuniform", "k=pro;gp=lim;m=0.5;sd=0.1", 0.5, 0.01], ["gumbel", "k=ext;ge=max;t=lgt;m=90;sd=25", 90, 625], ["weibull", "k=tim;gt=age;h=inc;m=5", 5, null],
    ["pareto2", "k=siz;gs=pow;pm=zero;m=2", 2, null], ["gpd", "k=ext;ge=exc;m=3", 3, null], ["uniform", "k=cnt;g=eqv;m=7;lim=10", 7, 4],
    ["pareto2", "k=siz;gs=pow;pm=zero;m=2;sd=3", 2, 9], ["pareto1", "k=siz;gs=pow;pm=min;m=2;sd=3", 2, 9], ["gpd", "k=ext;ge=exc;m=95;sd=30", 95, 900]];
  for (const [id, iv, mean, variance] of cases) {
    const b = Iv.build(data, ev(/** @type {string} */ (iv)), /** @type {string} */ (id));
    assert.ok(b.ok, `${id}: ${b.errors?.join(" ")}`);
    assert.ok(Math.abs(b.moments.mean - /** @type {number} */ (mean)) <= 1e-9 * Math.max(1, Math.abs(/** @type {number} */ (mean))), `${id}: mean ${b.moments.mean}, expected ${mean}`);
    if (variance !== null) assert.ok(Math.abs(b.moments.variance - /** @type {number} */ (variance)) <= 1e-9 * Math.max(1, /** @type {number} */ (variance)), `${id}: variance ${b.moments.variance}, expected ${variance}`);
  }
  const nofit = Iv.build(data, ev("k=cnt;g=het;m=4;sd=1.5"), "negbin");
  assert.equal(nofit.ok, false);
  assert.match(nofit.errors[0], /variance sd² must be larger than the mean/);
  const below = Iv.build(data, ev("k=cnt;g=eqv;m=4;lim=10"), "uniform");
  assert.equal(below.ok, false, "a mean below half the limit needs a lower limit below 0");
  assert.match(below.errors[0], /whole or half number with 0 ≤ 2m − n ≤ n/);
  const light = Iv.build(data, ev("k=siz;gs=pow;pm=zero;m=2;sd=1"), "pareto2");
  assert.equal(light.ok, false);
  assert.match(light.errors[0], /needs sd larger than m/);
});

test("a run of an interview record meets its evidence mean, for 3 seeds", () => {
  // n = 2^14 replicates of Poisson(3.5). Each check uses the bound 4.42 standard errors, so P(false failure) < 1e-5 for
  // each seed by the normal approximation, and below 3e-5 for the three seeds together.
  const b = Iv.build(data, ev("k=cnt;g=evt;m=3.5;c=7"));
  for (const seed of [1, 2026, 4242]) {
    const { summary } = runModel(b.record, { seed }, 16);
    const q = summary[0].alts[0].quantities.find((/** @type {any} */ x) => x.name === "average");
    assert.ok(Math.abs(q.est - 3.5) <= 4.42 * Math.sqrt(3.5 / q.n), `seed ${seed}: ${q.est}`);
  }
});

test("determinism: the same answers give the same evaluation, in any order of the answer text, and the canonical text round-trips", () => {
  const a = ev("k=cnt;g=het;v=gt;m=2;sd=2;q=avg"), b = ev("q=avg;sd=2;m=2;v=gt;g=het;k=cnt");
  assert.deepEqual(a, b);
  assert.equal(a.canonical, "k=cnt;g=het;v=gt;q=avg;m=2;sd=2");
  for (const x of spec.examples) assert.equal(ev(x.iv).canonical, x.iv, `${x.id} is canonical`);
  assert.equal(ev("k=tim;g=evt").canonical, "k=tim", "an answer to a question that is not asked is left out");
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, "plain data");
  assert.ok(ev("k=zz;m=x;foo=1").notices.length === 3, "unknown options, values and names give notices");
});

test("the state fields of the interview are valid kit fields, and every example fits the 200-character limit", () => {
  for (const k of ["iv", "iv_off", "iv_pick"]) assert.equal(M.FIELDS[k].type, "string");
  assert.ok(M.FIELDS.nav.values?.includes("interview"));
  for (const x of spec.examples) assert.ok(x.iv.length <= 200, x.id);
  const longest = spec.questions.map((/** @type {any} */ q) => `${q.id}=${q.options.reduce((/** @type {string} */ m, /** @type {any} */ o) => (o.id.length > m.length ? o.id : m), "")}`).join(";");
  assert.ok(longest.length + 60 <= 200 || longest.length <= 200, `all answers: ${longest.length} characters`);
});

test("every technical term of the interview text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  for (const t of ["rule graph", "rule path", "candidate model", "insufficient evidence", "unresolved assumption", "rejection test", "hazard rate", "tail dependence", "domain of attraction", "atom"]) assert.ok(glossary.has(t), t);
  const text = JSON.stringify(spec);
  const found = new Set([...text.matchAll(/\b(PMF|PDF|CDF|MGF|CF|CLT|GEV|GPD|OU|i\.i\.d\.)(?![\w])/g)].map((m) => m[1]));
  for (const t of found) assert.ok(glossary.has(t) || data.glossary.some((/** @type {any} */ g) => g.term.includes(t)), `the glossary defines ${t}`);
});
