// The engine: estimates against exact reference values for every catalogue model, deterministic runs, block
// merges that do not depend on the order of arrival, intervals that fit the estimator (with the zero-hit bound),
// moment status, common random numbers across alternatives, the decision, and the assumption failures.
import assert from "node:assert/strict";
import test from "node:test";
import { D, En, S, data, recordOf, runModel } from "./helpers.mjs";

const SEEDS = [5, 77, 31337];

test("every catalogue model: each estimate is within 5.5 standard errors of its reference value, for 3 seeds", () => {
  // For a correct engine each comparison fails with a probability below 4e-8 (normal tail), so the about 1,500
  // comparisons fail together with a probability below 1e-4. The standard error of a probability and of an
  // expectation comes from the exact variance, not the sample variance: a rare large loss (as in the sensor vote)
  // makes the sample variance far too small in a short run. Quantities with an infinite variance are skipped.
  for (const m of data.models) {
    const rec = recordOf(m.id);
    const blocks = ["uniform-birthday-ids", "uniform-randomised-response", "zipf-dictionary"].includes(m.id) ? 4 : 16;
    for (const seed of SEEDS) {
      const r = runModel(rec, { seed }, blocks);
      r.summary[0].alts.forEach((/** @type {any} */ alt, /** @type {number} */ a) => alt.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => {
        const ref = r.refs[a].values[k];
        if (ref === null || r.status[k].variance !== "finite") return;
        const se = q.kind === "probability" ? Math.sqrt(ref * (1 - ref) / q.n) : q.kind === "expectation" ? trueSe(rec, a, k, q.n) ?? q.se : q.se;
        const tol = 5.5 * se + 1e-9 * Math.max(1, Math.abs(ref));
        assert.ok(Math.abs(q.est - ref) <= tol, `${m.id} seed ${seed} ${alt.label} ${q.name}: ${q.est} against ${ref} (tolerance ${tol})`);
      }));
    }
  }
});

test("the same seed and settings give the same run; another seed gives another run", () => {
  const rec = recordOf("binomial-overbooking");
  const a = runModel(rec, { seed: 9 }, 8), b = runModel(rec, { seed: 9 }, 8), c = runModel(rec, { seed: 10 }, 8);
  assert.deepEqual(stripTime(a.acc), stripTime(b.acc));
  assert.notDeepEqual(stripTime(a.acc), stripTime(c.acc));
});

test("blocks computed in any order and merged in block order give the same statistics as a sequential run", () => {
  const rec = recordOf("negbin-parasites");
  const c = En.prepare(rec, { seed: 3, method: "inverse", compare: "rejection", failure: "none", overrides: {} });
  const refs = En.reference(c, En.momentStatus(c)).map((/** @type {any} */ r) => r.values);
  const order = [5, 2, 7, 0, 3, 6, 1, 4], done = new Map(order.map((b) => [b, En.block(c, b, { references: refs })]));
  let acc = En.empty(c);
  for (let b = 0; b < 8; b++) acc = En.merge(acc, done.get(b), c);
  assert.deepEqual(stripTime(acc), stripTime(runModel(rec, { seed: 3, method: "inverse", compare: "rejection" }, 8).acc));
  assert.throws(() => En.merge(En.empty(c), En.block(c, 1, {}), c), /arrived for position 0/);
});

test("intervals fit the estimator: Wilson for a probability, the exact zero-hit bound with no hits, none for an infinite variance", () => {
  const zero = En.interval("probability", { n: 1000, hits: 0, mean: 0, m2: 0 }, "finite");
  assert.equal(zero.lo, 0);
  assert.ok(Math.abs(zero.hi - (1 - 0.05 ** (1 / 1000))) < 1e-15);
  assert.match(zero.how, /zero hits/);
  const w = En.interval("probability", { n: 100, hits: 50, mean: 0.5, m2: 25 }, "finite");
  assert.deepEqual([w.lo, w.hi], S.wilson(50, 100, 1.959963984540054));
  assert.equal(En.interval("expectation", { n: 100, mean: 3, m2: 50 }, "infinite").lo, null);
  const r = runModel(recordOf("zipf-cascade"), { seed: 1 }, 4);
  const avg = r.summary[0].alts[0].quantities[1];
  assert.equal(avg.lo, null, "the zeta mean with s = 2.3 has no CLT interval");
  assert.match(avg.how, /variance is infinite/);
  const inf = runModel(recordOf("exp-zipf"), { seed: 1 }, 2).summary[0].alts[0].quantities[0];
  assert.equal(inf.lo, null);
  assert.match(inf.how, /mean is infinite/, "with s = 1.8 the page names the infinite mean, the stronger reason");
});

test("moment status: bounded, light-tailed, heavy-tailed and unknown quantities", () => {
  /** @param {string} text */
  const status = (text) => En.momentStatus(En.prepare(D.parse(text).record, { seed: 1, method: "independent", overrides: {} }));
  assert.equal(status("X ~ binomial(n = 10, p = 0.5)\nmean m = X^3\n")[0].variance, "finite");
  assert.equal(status("X ~ poisson(lambda = 2)\nmean m = 3*X^2 + max(X, 4)\n")[0].variance, "finite");
  assert.deepEqual(status("X ~ zipf(s = 1.8, N = inf)\nmean m = 2*X + 1\n")[0].mean, "infinite");
  const z = status("X ~ zipf(s = 2.5, N = inf)\nmean m = X\nprob p = X > 10\n");
  assert.deepEqual([z[0].mean, z[0].variance, z[1].variance], ["finite", "infinite", "finite"]);
  assert.equal(status("X ~ poisson(lambda = 2)\nmean m = exp(X^2)\n")[0].mean, "unknown");
  assert.equal(status("X ~ zipf(s = 4, N = inf)\nmean m = X^2\n")[0].mean, "unknown");
});

test("reference values: enumeration and closed forms agree with exact sums", () => {
  const r = runModel(recordOf("exp-poisson"), { seed: 1 }, 1);
  assert.ok(Math.abs(r.refs[0].values[0] - 18.5 * Math.exp(-5)) < 1e-12, "P(T ≤ 2) for T ~ Poisson(5)");
  const z = runModel(recordOf("zipf-cascade"), { seed: 1 }, 1);
  assert.ok(Math.abs(z.refs[0].values[0] - S.hurwitz(2.3, 10001) / S.zeta(2.3)) < 1e-15, "P(X > 10,000) by the Hurwitz zeta function");
  assert.ok(Math.abs(z.refs[0].values[1] - S.zeta(1.3) / S.zeta(2.3)) < 1e-12, "E[X] = zeta(s - 1)/zeta(s)");
  const inf = runModel(recordOf("exp-zipf"), { seed: 1 }, 1);
  assert.equal(inf.refs[0].values[0], null, "an infinite mean has no reference value");
  const hw = runModel(recordOf("multinomial-hardy-weinberg"), { seed: 1 }, 1);
  assert.ok(hw.refs[0].values[0] > 0.02 && hw.refs[0].values[0] < 0.03, "the exact bootstrap p-value is near the chi-square value 0.024");
});

test("alternatives share the streams: a variable that no alternative changes takes the same value in each", () => {
  const rec = D.parse("param c = 1\nX ~ uniform(a = 1, b = 6)\nY ~ poisson(lambda = c)\nmean x = X\nmean y = Y\nalt \"a\": c = 1\nalt \"b\": c = 3\n").record;
  const r = runModel(rec, { seed: 4 }, 2);
  const pair = r.summary[0].diffs[0].quantities;
  assert.equal(pair[0].est, 0);
  assert.equal(pair[0].hi - pair[0].lo, 0, "the paired difference of X is exactly 0");
  assert.ok(Math.abs(pair[1].est - 2) < 0.2, "Y differs by the change of its rate");
});

test("the decision: the best admissible alternative and whether the paired intervals separate it", () => {
  const o = runModel(recordOf("binomial-overbooking"), { seed: 2 }, 32).summary[0].decision;
  assert.equal(o.best, 1);
  assert.equal(o.separated, true);
  assert.deepEqual(o.rows.map((/** @type {any} */ r) => r.admissible), [true, true, false]);
  const a = runModel(recordOf("binomial-acceptance"), { seed: 2 }, 32).summary[0].decision;
  assert.equal(a.best, 2, "only n = 100, c = 3 meets both risks");
  assert.equal(runModel(recordOf("exp-poisson"), { seed: 2 }, 1).summary[0].decision.best, null);
});

test("reused streams break the independence: the block intervals cover the reference far less often", () => {
  // Without the failure, the number of covering blocks of 64 is Binomial(64, about 0.95); it falls to 54 or less
  // with a probability below 1e-3 for each seed. With the failure, the intervals assume 1,024 independent values but
  // see 16 values 64 times.
  const rec = recordOf("exp-poisson");
  for (const seed of SEEDS) {
    const good = runModel(rec, { seed }, 64).summary[0].alts[0].quantities[0].coverage;
    const bad = runModel(rec, { seed, failure: "stream_reuse" }, 64).summary[0].alts[0].quantities[0].coverage;
    assert.ok(good.hit > 54, `seed ${seed}: ${good.hit} of 64 blocks cover without the failure`);
    assert.ok(bad.hit < 32, `seed ${seed}: ${bad.hit} of 64 blocks cover with reused streams`);
  }
});

test("a constant quantity: each block interval of width 0 covers a reference with a rounding error", () => {
  // In binomial-overbooking, "Sell 180" never overbooks, so its net is 36,000 on every replicate. The enumerated
  // reference carries a rounding error of about 3e-9; it must not count as a miss of the interval [36000, 36000].
  const r = runModel(recordOf("binomial-overbooking"), { seed: 2026 }, 4);
  const a = r.summary[0].alts.findIndex((/** @type {any} */ x) => x.label === "Sell 180");
  const q = r.summary[0].alts[a].quantities.find((/** @type {any} */ x) => x.name === "net");
  assert.equal(q.est, 36000);
  assert.deepEqual([q.coverage.hit, q.coverage.of], [4, 4]);
});

test("a model record survives JSON and the model text: the same record and the same run", () => {
  for (const m of data.models) {
    const rec = recordOf(m.id);
    assert.deepEqual(D.parse(D.print(rec), m.id).record, rec, `${m.id}: text round trip`);
    assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec, `${m.id}: JSON round trip`);
  }
  const rec = recordOf("geometric-retries");
  assert.deepEqual(stripTime(runModel(JSON.parse(JSON.stringify(rec)), { seed: 8 }, 2).acc), stripTime(runModel(rec, { seed: 8 }, 2).acc));
  // The saved model record holds every field of the specification, and it runs as the original does.
  const full = JSON.parse(JSON.stringify({ ...En.complete(rec), order: rec.order }));
  for (const k of ["format", "version", "parameters", "variables", "definitions", "quantities", "alternatives", "decision", ...En.TEXT_FIELDS]) assert.ok(k in full, `the record has ${k}`);
  assert.equal(full.censoring, "none");
  assert.deepEqual(stripTime(runModel(full, { seed: 8 }, 2).acc), stripTime(runModel(rec, { seed: 8 }, 2).acc));
});

test("prepare refuses invalid records with a message for each problem", () => {
  const bad = /** @type {[string, RegExp][]} */ ([
    ["X ~ nosuch(p = 1)\nprob q = X == 1\n", /not a law/],
    ["X ~ poisson(lambda = Y)\nprob q = X == 1\n", /not defined/],
    ["param p = 2\nX ~ bernoulli(p = p)\nprob q = X == 1\n", /outside \[0, 1\]/],
    ["X ~ poisson(lambda = 1)\nX ~ poisson(lambda = 2)\nprob q = X == 1\n", /two definitions/],
    ["param sum = 1\nX ~ poisson(lambda = 1)\nprob q = X == 1\n", /reserved word/],
    ["X ~ poisson(lambda = 1) repeat 9000\nprob q = X[1] == 1\n", /repeat 9000/],
    ["X ~ poisson(lambda = 1)\n", /1 to 8 quantities/],
  ]);
  for (const [text, msg] of bad) {
    const c = En.prepare(D.parse(text).record, { seed: 1, method: "independent", overrides: {} });
    assert.equal(c.ok, false, text);
    assert.match(c.errors.join(" "), msg, text);
  }
  assert.match(En.prepare({ format: "other", version: 1 }, { seed: 1, method: "independent" }).errors.join(" "), /format/);
  assert.match(En.prepare({ ...recordOf("exp-poisson"), censoring: "left at 3" }, { seed: 1, method: "independent" }).errors.join(" "), /censoring/);
});

/**
 * The exact standard error of the sample mean of expectation k in alternative a, from the enumerated E[g^2], or null
 * when the model has no enumeration.
 * @param {any} rec @param {number} a @param {number} k @param {number} n
 */
function trueSe(rec, a, k, n) {
  const q = rec.quantities[k];
  const extended = { ...rec, quantities: [q, { name: "square_of_quantity", kind: "expectation", expr: `(${q.expr})^2` }] };
  const c = En.prepare(extended, { seed: 1, method: "independent", overrides: {} });
  const st = En.momentStatus(c), r = En.reference(c, st)[a];
  if (r.values[0] === null || r.values[1] === null || r.neglected > 1e-12) return null;
  return Math.sqrt(Math.max(0, r.values[1] - r.values[0] ** 2) / n);
}

/** The statistics without the measured times, which differ between runs. @param {any} acc */
function stripTime(acc) {
  return { ...acc, methods: acc.methods.map((/** @type {any} */ m) => ({ ...m, ms: 0 })) };
}
