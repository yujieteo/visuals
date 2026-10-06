// Every sampler of every law of group 3 against the law's own CDF, the independent analytical reference. Each case
// runs 3 fixed seeds of 20,000 draws (5,000 for the stable law, whose CDF is a numerical integral). An assertion
// fails when the Kolmogorov–Smirnov statistic √n·D of one seed is above 2.6, or when the sample mean is more than
// 5.5 standard errors from the exact mean (where the variance is finite). For a correct sampler each assertion fails
// with a probability below 3e-6 (the Kolmogorov limit law) and below 4e-8, so the about 350 assertions together fail
// with a probability below 1.1e-3. The halved envelopes and the cut tables must fail the same test.
import assert from "node:assert/strict";
import test from "node:test";
import { L, Rng } from "./helpers.mjs";

const SEEDS = [11, 2026, 4294967295], KS = 2.6;
const CASES = /** @type {[string, any][]} */ ([
  ["lognormal", { mu: 0.3, sigma: 1.2 }], ["weibull", { k: 0.6, lambda: 2 }], ["weibull", { k: 3, lambda: 2 }], ["invgauss", { mu: 2, lambda: 3 }], ["invgauss", { mu: 1, lambda: 0.05 }],
  ["gompertz", { eta: 0.05, b: 0.1 }], ["gompertz", { eta: 2, b: 1 }], ["loglogistic", { alpha: 2, beta: 3 }], ["pareto1", { xm: 1, alpha: 1.5 }], ["pareto1", { xm: 2, alpha: 3.5 }],
  ["pareto2", { mu: 0, sigma: 2, alpha: 2.5 }], ["pareto2", { mu: 1, sigma: 1, alpha: 0.7 }], ["burr12", { c: 2, k: 1.5, lambda: 3 }], ["frechet", { alpha: 2.5, s: 1, m: 0 }], ["frechet", { alpha: 0.8, s: 2, m: 1 }],
  ["cauchy", { x0: 1, gamma: 2 }], ["levy", { mu: 0, c: 1 }], ["stable", { alpha: 1.5, beta: 0.5, gamma: 1, delta: 0 }], ["stable", { alpha: 0.7, beta: 1, gamma: 2, delta: 1 }], ["stable", { alpha: 2, beta: 0, gamma: 1, delta: 0 }],
  ["gev", { xi: 0.2, mu: 0, sigma: 1 }], ["gev", { xi: 0, mu: 1, sigma: 2 }], ["gev", { xi: -0.3, mu: 0, sigma: 1 }], ["gev", { xi: -1.5, mu: 0, sigma: 1 }],
  ["gpd", { xi: 0.3, sigma: 1, mu: 0 }], ["gpd", { xi: 0, sigma: 2, mu: 1 }], ["gpd", { xi: -0.5, sigma: 1, mu: 0 }], ["gumbel", { mu: 0, beta: 1 }], ["revweibull", { alpha: 2, mu: 1, sigma: 1 }], ["revweibull", { alpha: 0.6, mu: 0, sigma: 1 }],
]);

/** n draws of a sampler with one seed, each from its own replicate stream. @param {any} sampler @param {number} seed @param {number} n */
function draws(sampler, seed, n) {
  const stats = { proposals: 0, accepts: 0, violations: 0 }, xs = new Float64Array(n), r = Rng.stream(seed, "test", 0, 0);
  for (let i = 0; i < n; i++) {
    r.reset(i, 0);
    xs[i] = /** @type {number} */ (sampler.draw(r, stats));
  }
  return { xs, stats };
}

/** √n times the Kolmogorov–Smirnov distance between the draws and a CDF. @param {Float64Array} xs @param {(x: number) => number} cdf */
function ks(xs, cdf) {
  const s = Float64Array.from(xs).sort();
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const F = cdf(s[i]);
    d = Math.max(d, Math.abs(F - i / s.length), Math.abs(F - (i + 1) / s.length));
  }
  return d * Math.sqrt(s.length);
}

for (const kind of ["reference", "inverse", "rejection"]) {
  test(`${kind}: each group 3 law's draws fit its CDF and its mean for 3 seeds`, () => {
    for (const [id, p] of CASES) {
      const law = L.BY_ID[id], s = kind === "rejection" ? law.rejection(p, 1) : kind === "inverse" ? law.inverse(p) : law.reference(p), n = id === "stable" ? 5000 : 20000;
      if ("unavailable" in s) {
        assert.ok(s.unavailable.length > 20, `${id} ${JSON.stringify(p)}: ${kind} states why it is not available`);
        continue;
      }
      assert.ok(s.label.length > 10 && s.exactness.length > 4, `${id}: a label and its exactness`);
      const m = law.moments(p);
      for (const seed of SEEDS) {
        const d = draws(s, seed, n), stat = ks(d.xs, (x) => law.cdf(x, p));
        assert.ok(stat < KS, `${id} ${JSON.stringify(p)} ${kind} seed ${seed}: √n·D = ${stat.toFixed(3)}`);
        if (m.mean !== null && m.variance !== null) {
          const mean = d.xs.reduce((a, b) => a + b, 0) / n, z = (mean - m.mean) / Math.sqrt(m.variance / n);
          assert.ok(Math.abs(z) < 5.5, `${id} ${kind} seed ${seed}: mean ${mean} is ${z.toFixed(2)} standard errors from ${m.mean}`);
        }
        if (kind === "rejection" && s.acceptance) assert.ok(Math.abs(d.stats.accepts / d.stats.proposals - s.acceptance) < 6 * Math.sqrt(s.acceptance / d.stats.proposals) + 1e-3, `${id} acceptance rate`);
        if (kind === "rejection") assert.equal(d.stats.violations, 0, `${id}: the envelope covers the target`);
      }
    }
  });
}

test("the assumption failures break the samplers: a halved envelope and a table cut at the 0.99 quantile", () => {
  for (const [id, p] of /** @type {[string, any][]} */ ([["pareto1", { xm: 1, alpha: 1.5 }], ["gumbel", { mu: 0, beta: 1 }], ["lognormal", { mu: 0, sigma: 1 }], ["gpd", { xi: -0.5, sigma: 1, mu: 0 }]])) {
    const law = L.BY_ID[id], bad = /** @type {any} */ (law.rejection(p, 0.5)), cut = /** @type {any} */ (law.inverse(p, 0.99)), top = law.quantile(0.99, p);
    assert.match(bad.exactness, /not exact/);
    for (const seed of SEEDS) {
      const d = draws(bad, seed, 20000);
      assert.ok(ks(d.xs, (x) => law.cdf(x, p)) > KS, `${id} seed ${seed}: the halved envelope fails the fit`);
      assert.ok(d.stats.violations > 0, `${id}: the page counts the envelope violations`);
      assert.ok(Math.max(...draws(cut, seed, 20000).xs) <= top, `${id} seed ${seed}: no draw passes the 0.99 quantile`);
    }
  }
});
