// Every sampler of every continuous law against the law's own CDF, the independent analytical reference. Each case
// runs 3 fixed seeds of 20,000 draws. An assertion fails when the Kolmogorov–Smirnov statistic √n·D of one seed is
// above 2.6, or when the sample mean is more than 5.5 standard errors from the exact mean (where the variance is
// finite). For a correct sampler each assertion fails with a probability below 3e-6 (the Kolmogorov limit law) and
// below 4e-8, so the about 300 assertions together fail with a probability below 1e-3. The assumption-failure
// samplers must fail the same test, and the antithetic partner of each draw must be the reflected quantile.
import assert from "node:assert/strict";
import test from "node:test";
import { L, Rng } from "./helpers.mjs";

const SEEDS = [11, 2026, 4294967295], N = 20000, KS = 2.6;
const CASES = /** @type {[string, any][]} */ ([
  ["cuniform", { a: -2, b: 5 }], ["normal", { mu: 3, sigma: 2 }], ["exponential", { rate: 0.5 }], ["gamma", { k: 2.5, theta: 3 }], ["gamma", { k: 0.4, theta: 1 }],
  ["erlang", { k: 3, rate: 2 }], ["erlang", { k: 80, rate: 4 }], ["beta", { a: 2, b: 5 }], ["beta", { a: 0.5, b: 0.5 }], ["chisq", { nu: 4 }], ["chisq", { nu: 2.5 }],
  ["student", { nu: 5 }], ["student", { nu: 1.5 }], ["student", { nu: 0.8 }], ["fisher", { d1: 5, d2: 12 }], ["logistic", { mu: 1, s: 2 }], ["laplace", { mu: -1, b: 0.5 }],
]);

/** N draws of a sampler with one seed, each from its own replicate stream. @param {any} sampler @param {number} seed @param {boolean} [flip] */
function draws(sampler, seed, flip = false) {
  const stats = { proposals: 0, accepts: 0, violations: 0 }, xs = new Float64Array(N), r = Rng.stream(seed, "test", 0, 0);
  for (let i = 0; i < N; i++) {
    r.reset(i, 0, flip);
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
  test(`${kind}: each continuous law's draws fit its CDF and its mean for 3 seeds`, () => {
    for (const [id, p] of CASES) {
      const law = L.BY_ID[id], s = kind === "rejection" ? law.rejection(p, 1) : kind === "inverse" ? law.inverse(p) : law.reference(p);
      if ("unavailable" in s) {
        assert.ok(s.unavailable.length > 20, `${id} ${JSON.stringify(p)}: ${kind} states why it is not available`);
        continue;
      }
      const m = law.moments(p);
      for (const seed of SEEDS) {
        const d = draws(s, seed), stat = ks(d.xs, (x) => law.cdf(x, p));
        assert.ok(stat < KS, `${id} ${JSON.stringify(p)} ${kind} seed ${seed}: √n·D = ${stat.toFixed(3)}`);
        if (m.mean !== null && m.variance !== null) {
          const mean = d.xs.reduce((a, b) => a + b, 0) / N, z = (mean - m.mean) / Math.sqrt(m.variance / N);
          assert.ok(Math.abs(z) < 5.5, `${id} ${kind} seed ${seed}: mean ${mean} is ${z.toFixed(2)} standard errors from ${m.mean}`);
        }
        if (kind === "rejection" && s.acceptance) assert.ok(Math.abs(d.stats.accepts / d.stats.proposals - s.acceptance) < 6 * Math.sqrt(s.acceptance / d.stats.proposals) + 1e-3, `${id} acceptance rate`);
      }
    }
  });
}

test("the samplers of the vector laws: normal and beta components, the covariance of Σ, and proportions that add to 1", () => {
  const mv = L.BY_ID.mvnormal, p = { mu: [1, -2], cov: [4, 1.2, 1.2, 1] };
  for (const kind of ["reference", "inverse", "rejection"]) {
    const s = kind === "rejection" ? mv.rejection(p, 1) : kind === "inverse" ? mv.inverse(p) : mv.reference(p);
    for (const seed of SEEDS) {
      const r = Rng.stream(seed, "test", 0, 0), x = [], y = [];
      for (let i = 0; i < N; i++) { r.reset(i, 0); const v = s.draw(r); x.push(v[0]); y.push(v[1]); }
      assert.ok(ks(Float64Array.from(x), (t) => L.BY_ID.normal.cdf(t, { mu: 1, sigma: 2 })) < KS, `${kind} seed ${seed}: X[1] ~ N(1, 4)`);
      assert.ok(ks(Float64Array.from(y), (t) => L.BY_ID.normal.cdf(t, { mu: -2, sigma: 1 })) < KS, `${kind} seed ${seed}: X[2] ~ N(−2, 1)`);
      const mx = x.reduce((a, b) => a + b, 0) / N, my = y.reduce((a, b) => a + b, 0) / N;
      let c = 0;
      for (let i = 0; i < N; i++) c += (x[i] - mx) * (y[i] - my);
      c /= N - 1;
      // The sample covariance has the standard error √((Σ₁₁Σ₂₂ + Σ₁₂²)/n) for a normal pair.
      assert.ok(Math.abs(c - 1.2) < 5.5 * Math.sqrt((4 + 1.44) / N), `${kind} seed ${seed}: covariance ${c}`);
    }
  }
  const dir = L.BY_ID.dirichlet, q = { alpha: [2, 3, 5] };
  for (const kind of ["reference", "inverse", "rejection"]) {
    const s = kind === "rejection" ? dir.rejection(q, 1) : kind === "inverse" ? dir.inverse(q) : dir.reference(q);
    for (const seed of SEEDS) {
      const r = Rng.stream(seed, "test", 0, 0), first = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        r.reset(i, 0);
        const v = s.draw(r);
        assert.ok(Math.abs(v[0] + v[1] + v[2] - 1) < 1e-12 && v.every((/** @type {number} */ t) => t >= 0), "a point of the simplex");
        first[i] = v[0];
      }
      assert.ok(ks(first, (t) => L.BY_ID.beta.cdf(t, { a: 2, b: 8 })) < KS, `${kind} seed ${seed}: X[1] ~ Beta(2, 8)`);
    }
  }
  assert.ok("unavailable" in dir.rejection({ alpha: [0.5, 2] }, 1), "a concentration below 1 has no exponential proposal");
});

test("assumption failures break the continuous samplers as the page says: a halved envelope and a cut quantile function", () => {
  const p = { mu: 0, sigma: 1 }, law = L.BY_ID.normal;
  const bad = /** @type {any} */ (law.rejection(p, 0.5));
  for (const seed of SEEDS) {
    const d = draws(bad, seed);
    assert.ok(ks(d.xs, (x) => law.cdf(x, p)) > KS, `seed ${seed}: the halved envelope fails the fit`);
    assert.ok(d.stats.violations > 0, "the page counts the envelope violations");
  }
  const cut = /** @type {any} */ (L.BY_ID.gamma.inverse({ k: 2, theta: 1 }, 0.99)), top = L.BY_ID.gamma.quantile(0.99, { k: 2, theta: 1 });
  assert.equal(cut.exactness, "not exact: the tail is cut");
  for (const seed of SEEDS) assert.equal(Math.max(...draws(cut, seed).xs), top, `seed ${seed}: no draw passes the 0.99 quantile`);
});

test("the antithetic partner of an inverse-transform draw is the reflected quantile: F(X) + F(X') = 1", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], s = /** @type {any} */ (law.inverse(p)), a = draws(s, 7), b = draws(s, 7, true);
    for (let i = 0; i < 200; i++) {
      const u = law.cdf(a.xs[i], p), v = law.sf(b.xs[i], p);
      assert.ok(Math.abs(u - v) <= 1e-9 * Math.max(1e-300, Math.min(u, 1 - u)) + 1e-12, `${id} draw ${i}: F(X) = ${u}, 1 − F(X') = ${v}`);
    }
  }
});
