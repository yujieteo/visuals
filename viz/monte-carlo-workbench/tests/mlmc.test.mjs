// Multilevel Monte Carlo against the Black–Scholes value of a call on geometric Brownian motion with the Euler
// scheme, for 3 seeds: the estimate lies within 4.5 standard errors plus the target error ε of the exact value; the
// level variances decay (β near 1 for a Lipschitz payoff, below 0.8 for the indicator of a passage); the sample sizes
// fall with the level; the same seed gives the same result; and the levels are independent. The page runs the same
// state machine with its worker pool.
import assert from "node:assert/strict";
import test from "node:test";
import { D, En, Ml, S } from "./helpers.mjs";

const SEEDS = [3, 2026, 77777];

/** Run the multilevel state machine of a record synchronously with the engine. @param {any} rec @param {number} seed @param {number} eps @param {number} n0 */
function runML(rec, seed, eps, n0) {
  const st = Ml.start({ eps, maxLevel: 7, initial: 2, n0 });
  /** @type {any[]} */
  const acc = [];
  for (let job = Ml.nextJob(st); job; job = Ml.nextJob(st)) {
    const c = En.prepare(Ml.levelRecord(rec, job.level, n0, 0), { seed: Ml.levelSeed(seed, job.level), method: "euler", compare: "none", failure: "none", overrides: {}, streams: "common" });
    assert.ok(c.ok, c.errors?.join(" "));
    let a = acc[job.level] ?? En.empty(c);
    for (let b = job.from; b < job.to; b++) a = En.merge(a, En.block(c, b, {}), c);
    acc[job.level] = a;
    Ml.afterJob(st, job.level, job.to, Ml.fromAccum(a, job.level, 0));
  }
  return { st, sum: /** @type {any} */ (Ml.summary(st)) };
}

const CALL = D.parse(`title: call
param steps = 4
param coarsen = 1
S ~ gbm(s0 = 100, mu = 0.05, sigma = 0.2, T = 1, steps = steps, coarsen = coarsen)
mean pay = max(last(S) - 100, 0)
`).record;

test("multilevel Monte Carlo of a call with the Euler scheme meets the Black–Scholes value, with 3 seeds", () => {
  const d1 = (0.05 + 0.02) / 0.2, ref = 100 * Math.exp(0.05) * S.normalCdf(d1) - 100 * S.normalCdf(d1 - 0.2);
  for (const seed of SEEDS) {
    const { st, sum } = runML(CALL, seed, 0.05, 4);
    assert.ok(st.done, "the run ends");
    assert.ok(Math.abs(sum.est - ref) < 4.5 * sum.se + 0.05, `seed ${seed}: ${sum.est} against ${ref} (se ${sum.se})`);
    assert.ok(sum.beta > 0.6 && sum.beta < 1.6, `β = ${sum.beta}: the Euler level variance decays as 2^−l`);
    const ns = sum.levels.map((/** @type {any} */ x) => x.n);
    assert.ok(ns.slice(1).every((/** @type {number} */ n, /** @type {number} */ i) => n <= ns[i]), `N_l falls with the level: ${ns}`);
    assert.ok(sum.ratio > 1, `the multilevel run costs less than plain sampling on the finest grid (ratio ${sum.ratio})`);
  }
  const a = runML(CALL, 5, 0.1, 4).sum, b = runML(CALL, 5, 0.1, 4).sum;
  assert.deepEqual(a, b, "the same seed gives the same result");
  assert.notEqual(Ml.levelSeed(5, 0), Ml.levelSeed(5, 1), "each level has its own seed");
});

test("the indicator of a passage has a slowly decaying level variance: the failure example of multilevel Monte Carlo", () => {
  const rec = D.parse(`title: alarm
param steps = 4
param coarsen = 1
W ~ brownian(T = 1, steps = steps, coarsen = coarsen)
prob hit = max(W) >= 1
`).record;
  for (const seed of SEEDS) {
    const { sum } = runML(rec, seed, 0.02, 4);
    assert.ok(sum.beta < 0.85, `seed ${seed}: β = ${sum.beta} for a discontinuous functional`);
  }
});

test("the level records: level 0 has one alternative, a higher level the fine and the coarse grid on common streams", () => {
  const r0 = Ml.levelRecord(CALL, 0, 4, 0), r3 = Ml.levelRecord(CALL, 3, 4, 0);
  assert.deepEqual(r0.alternatives.map((/** @type {any} */ a) => a.set), [{ steps: "4", coarsen: "1" }]);
  assert.deepEqual(r3.alternatives.map((/** @type {any} */ a) => a.set), [{ steps: "32", coarsen: "1" }, { steps: "16", coarsen: "2" }]);
  assert.ok(Ml.ready(CALL) && !Ml.ready(D.parse("title: t\nX ~ poisson(lambda = 1)\nmean m = X\n").record));
  assert.equal(Ml.cost(3, 4), 32 + 16);
});
