// Every sampler of every law against the law's own PMF, the independent analytical reference. Each case runs 3
// fixed seeds of 20,000 draws. An assertion fails when the chi-square p-value of one seed is below 1e-6, or when the
// sample mean is more than 5.5 standard errors from the exact mean: for a correct sampler and a random seed, each
// assertion fails with a probability below 1e-6 and below 4e-8, so all 600 or so assertions together fail with a
// probability below 1e-3. The assumption-failure samplers must fail the same test.
import assert from "node:assert/strict";
import test from "node:test";
import { L, Rng, gofPValue } from "./helpers.mjs";

const SEEDS = [11, 2026, 4294967295], N = 20000;
const CASES = /** @type {[string, any][]} */ ([
  ["bernoulli", { p: 0.3 }], ["binomial", { n: 20, p: 0.3 }], ["binomial", { n: 1000, p: 0.6 }], ["binomial", { n: 500, p: 0.02 }],
  ["categorical", { p: [0.1, 0.2, 0.3, 0.4] }], ["uniform", { a: -3, b: 7 }], ["uniform", { a: 1, b: 100000 }],
  ["geometric", { p: 0.2 }], ["geometric", { p: 0.003 }], ["negbin", { r: 2.5, p: 0.3 }], ["negbin", { r: 0.5, p: 0.2 }],
  ["poisson", { lambda: 3.2 }], ["poisson", { lambda: 45 }], ["hypergeometric", { N: 60, K: 24, n: 7 }], ["hypergeometric", { N: 2000, K: 200, n: 100 }],
  ["zipf", { s: 0.9, N: 300 }], ["zipf", { s: 3.5, N: Infinity }],
]);

/** Draw N values with a sampler and one seed. @param {any} sampler @param {number} seed */
function draws(sampler, seed) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  const stats = { proposals: 0, accepts: 0, violations: 0 };
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const r = Rng.stream(seed, "test", i, 0), x = sampler.draw(r, stats);
    sum += x;
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return { counts, mean: sum / N, stats };
}

for (const method of ["reference", "inverse", "rejection"]) {
  test(`${method}: each law's draws fit its PMF and its mean for 3 seeds`, () => {
    for (const [id, p] of CASES) {
      const law = L.BY_ID[id], s = method === "rejection" ? law.rejection(p, 1) : method === "inverse" ? law.inverse(p) : law.reference(p);
      if ("unavailable" in s) continue;
      const m = law.moments(p);
      for (const seed of SEEDS) {
        const d = draws(s, seed);
        const pv = gofPValue(law, p, d.counts, N);
        assert.ok(pv > 1e-6, `${id} ${JSON.stringify(p)} ${method} seed ${seed}: chi-square p-value ${pv}`);
        if (m.mean !== null && m.variance !== null && m.variance > 0) {
          const z = (d.mean - m.mean) / Math.sqrt(m.variance / N);
          assert.ok(Math.abs(z) < 5.5, `${id} ${method} seed ${seed}: mean ${d.mean} is ${z.toFixed(2)} standard errors from ${m.mean}`);
        }
        if (method === "rejection" && s.acceptance) assert.ok(Math.abs(d.stats.accepts / d.stats.proposals - s.acceptance) < 6 * Math.sqrt(s.acceptance / d.stats.proposals) + 1e-3, `${id} acceptance rate`);
      }
    }
  });
}

test("the zeta law by the inverse transform reaches past its table through the Hurwitz zeta function", () => {
  const p = { s: 1.5, N: Infinity }, law = L.BY_ID.zipf, s = /** @type {any} */ (law.inverse(p));
  for (const seed of SEEDS) {
    const d = draws(s, seed);
    let above = 0;
    for (const [x, c] of d.counts) if (x > 4096) above += c;
    const expect = law.sf(4096, p) * N;
    assert.ok(Math.abs(above - expect) < 5.5 * Math.sqrt(expect), `seed ${seed}: ${above} draws above the table, ${expect.toFixed(1)} expected`);
    assert.ok(gofPValue(law, p, d.counts, N) > 1e-6);
  }
});

test("assumption failures break the samplers as the page says: a halved envelope and a cut table", () => {
  const p = { lambda: 3.2 }, law = L.BY_ID.poisson;
  const bad = /** @type {any} */ (law.rejection(p, 0.5));
  for (const seed of SEEDS) {
    const d = draws(bad, seed);
    assert.ok(gofPValue(law, p, d.counts, N) < 1e-6, `seed ${seed}: the halved envelope fails the fit`);
    assert.ok(d.stats.violations > 0, "the page counts the envelope violations");
  }
  const cut = /** @type {any} */ (law.inverse(p, 0.99)), top = L.quantile("poisson", 0.99, p);
  for (const seed of SEEDS) {
    const d = draws(cut, seed);
    assert.equal(Math.max(...d.counts.keys()), top, "no draw passes the 0.99 quantile");
  }
});

test("a cut table caps the binomial, Bernoulli and multinomial inverse draws at the 0.99 quantile", () => {
  for (const p of [{ n: 20, p: 0.3 }, { n: 1000, p: 0.6 }]) {
    const law = L.BY_ID.binomial, cut = /** @type {any} */ (law.inverse(p, 0.99)), top = L.quantile("binomial", 0.99, p);
    assert.equal(cut.exactness, "not exact: the tail is cut");
    for (const seed of SEEDS) assert.equal(Math.max(...draws(cut, seed).counts.keys()), top, `binomial ${JSON.stringify(p)} seed ${seed}: no draw passes the 0.99 quantile`);
  }
  const b = /** @type {any} */ (L.BY_ID.bernoulli.inverse({ p: 0.005 }, 0.99));
  for (const seed of SEEDS) assert.deepEqual([...draws(b, seed).counts.keys()], [0], `Bernoulli seed ${seed}: the 0.99 quantile of p = 0.005 is 0`);
  const mp = { n: 500, p: [0.02, 0.3, 0.68] }, m = /** @type {any} */ (L.BY_ID.multinomial.inverse(mp, 0.99)), top = L.quantile("binomial", 0.99, { n: 500, p: 0.02 });
  assert.equal(m.exactness, "not exact: the tail is cut");
  for (const seed of SEEDS) {
    let max = 0;
    for (let i = 0; i < N; i++) max = Math.max(max, m.draw(Rng.stream(seed, "test", i, 0))[0]);
    assert.equal(max, top, `multinomial seed ${seed}: the first count does not pass its 0.99 quantile`);
  }
});
