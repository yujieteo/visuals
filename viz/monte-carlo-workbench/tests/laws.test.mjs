// The 10 discrete laws: parameter checks, PMF sums, CDF against the cumulative PMF, CDF + survival = 1, the quantile
// function as the inverse of the CDF, and the moments against sums of the PMF. The zeta law's moments exist only
// below order s - 1.
import assert from "node:assert/strict";
import test from "node:test";
import { L, S } from "./helpers.mjs";

/** Parameter sets for each law: ordinary, near an edge, and degenerate where the law allows it. */
const CASES = /** @type {[string, any][]} */ ([
  ["bernoulli", { p: 0.3 }], ["bernoulli", { p: 1 }],
  ["binomial", { n: 20, p: 0.3 }], ["binomial", { n: 1000, p: 0.6 }], ["binomial", { n: 500, p: 0.02 }],
  ["categorical", { p: [0.1, 0.2, 0.3, 0.4] }], ["categorical", { p: [1] }],
  ["multinomial", { n: 12, p: [0.5, 0.3, 0.2] }],
  ["uniform", { a: -3, b: 7 }], ["uniform", { a: 5, b: 5 }],
  ["geometric", { p: 0.2 }], ["geometric", { p: 0.003 }],
  ["negbin", { r: 2.5, p: 0.3 }], ["negbin", { r: 0.5, p: 0.2 }],
  ["poisson", { lambda: 3.2 }], ["poisson", { lambda: 45 }],
  ["hypergeometric", { N: 60, K: 24, n: 7 }], ["hypergeometric", { N: 500, K: 10, n: 150 }],
  ["zipf", { s: 1.1, N: 1000 }], ["zipf", { s: 0, N: 6 }], ["zipf", { s: 2.5, N: Infinity }],
]);

test("each parameter set passes its check, and invalid parameters fail with a message", () => {
  for (const [id, p] of CASES) assert.deepEqual(L.BY_ID[id].check(p), [], `${id} ${JSON.stringify(p)}`);
  const bad = /** @type {[string, any][]} */ ([["bernoulli", { p: 1.2 }], ["binomial", { n: 2.5, p: 0.5 }], ["categorical", { p: [0.5, 0.6] }], ["uniform", { a: 3, b: 1 }],
    ["geometric", { p: 0 }], ["negbin", { r: 0, p: 0.5 }], ["poisson", { lambda: -1 }], ["hypergeometric", { N: 10, K: 11, n: 3 }], ["zipf", { s: 1, N: Infinity }], ["multinomial", { n: -1, p: [1] }]]);
  for (const [id, p] of bad) assert.ok(L.BY_ID[id].check(p).length > 0, `${id} ${JSON.stringify(p)} is refused`);
});

test("the PMF sums to 1, the CDF is the cumulative PMF, and CDF + survival = 1", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], s = law.support(p);
    let F = 0;
    const hi = Math.min(s.hi, s.lo + 20000);
    for (let k = s.lo; k <= hi; k++) {
      F += law.pmf(k, p);
      assert.ok(Math.abs(F - law.cdf(k, p)) < 1e-11, `${id} CDF at ${k}`);
      assert.ok(Math.abs(1 - law.cdf(k, p) - law.sf(k, p)) < 1e-11, `${id} survival at ${k}`);
    }
    const left = s.hi === Infinity ? law.sf(hi, p) : 0;
    assert.ok(Math.abs(F + left - 1) < 1e-10, `${id} ${JSON.stringify(p)}: the PMF sums to ${F} with ${left} left`);
  }
});

test("the quantile function inverts the CDF: F(Q(u)) >= u > F(Q(u) - 1)", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id];
    for (const u of [1e-6, 0.01, 0.3, 0.5, 0.7, 0.99, 1 - 1e-6]) {
      const k = L.quantile(id, u, p);
      assert.ok(law.cdf(k, p) >= u - 1e-12, `${id} F(Q(${u}))`);
      assert.ok(law.cdf(k - 1, p) < u + 1e-12, `${id} F(Q(${u}) - 1)`);
    }
  }
});

test("the mean and the variance equal the sums of the PMF, and the zeta law's moments exist only below order s - 1", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], s = law.support(p), m = law.moments(p);
    if (m.order < Infinity) continue;
    let m1 = 0, m2 = 0;
    for (let k = s.lo; k <= Math.min(s.hi, s.lo + 100000); k++) { const w = law.pmf(k, p); m1 += w * k; m2 += w * k * k; }
    assert.ok(Math.abs(m1 - /** @type {number} */ (m.mean)) < 1e-8 * Math.max(1, Math.abs(m1)), `${id} mean`);
    assert.ok(Math.abs(m2 - m1 * m1 - /** @type {number} */ (m.variance)) < 1e-7 * Math.max(1, m2), `${id} variance`);
  }
  const z = L.BY_ID.zipf;
  assert.deepEqual(z.moments({ s: 1.8, N: Infinity }), { mean: null, variance: null, order: 0.8 }, "s ≤ 2: no mean");
  const m = z.moments({ s: 2.5, N: Infinity });
  assert.ok(Math.abs(/** @type {number} */ (m.mean) - S.zeta(1.5) / S.zeta(2.5)) < 1e-12 && m.variance === null, "2 < s ≤ 3: a mean but no variance");
  assert.ok(z.moments({ s: 3.5, N: Infinity }).variance !== null, "s > 3: a variance");
  const tail = z.sf(10000, { s: 2.3, N: Infinity }), approx = 10000 ** -1.3 / (1.3 * S.zeta(2.3));
  assert.ok(Math.abs(tail / approx - 1) < 0.01, "P(X > k) ~ k^(1 - s)/((s - 1) zeta(s))");
});

test("each law names a sampler for each method, or the reason it has none", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id];
    for (const s of [law.reference(p), law.inverse(p), law.rejection(p, 1)]) {
      if ("unavailable" in s) assert.ok(s.unavailable.length > 10, `${id}: a reason`);
      else assert.ok(s.label && s.exactness, `${id}: a label and its exactness`);
    }
  }
  assert.ok("unavailable" in L.BY_ID.multinomial.rejection({ n: 3, p: [0.5, 0.5] }, 1));
});
