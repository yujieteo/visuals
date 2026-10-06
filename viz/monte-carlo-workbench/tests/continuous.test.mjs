// The 13 continuous laws: parameter checks, the density against the CDF (by quadrature), CDF + survival = 1, the
// quantile and the inverse survival functions as inverses of the CDF and the survival function, the moments against
// quadrature over the quantile function, the moment conditions of the heavy-tailed laws, and the components,
// covariances and Cholesky factor of the vector laws.
import assert from "node:assert/strict";
import test from "node:test";
import { C, L, S } from "./helpers.mjs";

/** Parameter sets for each law: ordinary, near an edge, and a heavy tail where the law has one. */
const CASES = /** @type {[string, any][]} */ ([
  ["cuniform", { a: -2, b: 5 }], ["normal", { mu: 3, sigma: 2 }], ["normal", { mu: -1e3, sigma: 1e-3 }],
  ["exponential", { rate: 0.5 }], ["gamma", { k: 2.5, theta: 3 }], ["gamma", { k: 0.4, theta: 1 }], ["gamma", { k: 300, theta: 0.01 }],
  ["erlang", { k: 3, rate: 2 }], ["beta", { a: 2, b: 5 }], ["beta", { a: 0.5, b: 0.5 }], ["beta", { a: 40, b: 3 }],
  ["chisq", { nu: 4 }], ["chisq", { nu: 0.7 }], ["student", { nu: 5 }], ["student", { nu: 1.5 }], ["student", { nu: 0.8 }],
  ["fisher", { d1: 5, d2: 12 }], ["fisher", { d1: 1.5, d2: 3 }], ["logistic", { mu: 1, s: 2 }], ["laplace", { mu: -1, b: 0.5 }],
]);
const O = { rel: 1e-11, abs: 1e-13, maxPanels: 400, breaks: [2 ** -30, 2 ** -26, 2 ** -22, 2 ** -18, 2 ** -14, 2 ** -10, 2 ** -6, 2 ** -3], openLo: true };

/** ∫ g(x) dF(x) over the law, as ∫ g(Q(u)) du on (0, 1/2) with the quantile function and on (0, 1/2) with the inverse survival function. @param {any} law @param {any} p @param {(x: number) => number[]} g @param {number} dim */
function expect(law, p, g, dim) {
  const a = S.integrate((u) => g(law.quantile(u, p)), 0, 0.5, dim, O), b = S.integrate((v) => g(law.isf(v, p)), 0, 0.5, dim, O);
  return { value: Array.from(a.value, (x, j) => x + b.value[j]), converged: a.converged && b.converged };
}

test("each parameter set passes its check, and invalid parameters fail with a message", () => {
  for (const [id, p] of CASES) assert.deepEqual(L.BY_ID[id].check(p), [], `${id} ${JSON.stringify(p)}`);
  const bad = /** @type {[string, any][]} */ ([["cuniform", { a: 2, b: 2 }], ["normal", { mu: 0, sigma: 0 }], ["normal", { mu: Infinity, sigma: 1 }], ["exponential", { rate: -1 }],
    ["gamma", { k: 0, theta: 1 }], ["erlang", { k: 2.5, rate: 1 }], ["beta", { a: 1, b: 0 }], ["chisq", { nu: 0 }], ["student", { nu: 0 }], ["fisher", { d1: 2, d2: -1 }],
    ["logistic", { mu: 0, s: 0 }], ["laplace", { mu: 0, b: -2 }], ["dirichlet", { alpha: [1] }], ["dirichlet", { alpha: [1, 0] }],
    ["mvnormal", { mu: [0, 0], cov: [1, 0.5, 0.4, 1] }], ["mvnormal", { mu: [0, 0], cov: [1, 2, 2, 1] }], ["mvnormal", { mu: [0, 0], cov: [1, 0, 0] }]]);
  for (const [id, p] of bad) assert.ok(L.BY_ID[id].check(p).length > 0, `${id} ${JSON.stringify(p)} is refused`);
});

test("the density integrates to the CDF, and CDF + survival = 1", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id];
    for (const [u1, u2] of [[0.01, 0.2], [0.2, 0.8], [0.6, 0.999]]) {
      const x1 = law.quantile(u1, p), x2 = law.quantile(u2, p);
      const r = S.integrate((x) => [law.pdf(x, p)], x1, x2, 1, { rel: 1e-12, abs: 1e-14, maxPanels: 400 });
      assert.ok(Math.abs(r.value[0] - (law.cdf(x2, p) - law.cdf(x1, p))) < 1e-9, `${id} ${JSON.stringify(p)}: ∫ f from Q(${u1}) to Q(${u2})`);
    }
    for (const u of [1e-6, 0.1, 0.5, 0.9, 1 - 1e-6]) {
      const x = law.quantile(u, p);
      assert.ok(Math.abs(law.cdf(x, p) + law.sf(x, p) - 1) < 1e-14, `${id}: F + S = 1 at ${x}`);
    }
  }
});

test("the quantile and inverse survival functions invert the CDF and the survival function, also deep in the tails", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id];
    for (const u of [1e-12, 1e-6, 0.01, 0.3, 0.5]) {
      const lo = law.quantile(u, p), hi = law.isf(u, p);
      // Within 1e-12 relative, or the best a double can do: u lies between F at the two neighbours of x. A steep law
      // near a bounded end has no double close to its quantile in probability.
      const best = (/** @type {(x: number) => number} */ f, /** @type {number} */ x) => {
        const a = f(next(x, -1)), b = f(next(x, 1)), tol = 1e-12 * u;
        return Math.abs(f(x) - u) <= tol || (Math.min(a, b) - tol <= u && u <= Math.max(a, b) + tol);
      };
      assert.ok(best((x) => law.cdf(x, p), lo), `${id} ${JSON.stringify(p)}: F(Q(${u})) = ${law.cdf(lo, p)}`);
      assert.ok(best((x) => law.sf(x, p), hi), `${id} ${JSON.stringify(p)}: S(Q̄(${u})) = ${law.sf(hi, p)}`);
    }
  }
  assert.ok(Math.abs(L.BY_ID.normal.quantile(0.975, { mu: 0, sigma: 1 }) - 1.959963984540054) < 1e-14);
  assert.ok(Math.abs(L.BY_ID.normal.isf(1e-20, { mu: 0, sigma: 1 }) - 9.262340089798408) < 1e-12, "the normal upper 1e-20 quantile");
});

test("the mean and the variance equal integrals over the quantile function; a moment of a heavy tail exists only below its order", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], m = law.moments(p);
    // A heavy tail makes the quadrature of x² converge too slowly for this tolerance; the samplers' tests check those means.
    if (m.order < Infinity) continue;
    const r = expect(law, p, (x) => [x, x * x], 2);
    assert.ok(r.converged, `${id} ${JSON.stringify(p)}: the quadrature converges`);
    const scale = Math.max(1, Math.abs(/** @type {number} */ (m.mean)));
    assert.ok(Math.abs(r.value[0] - /** @type {number} */ (m.mean)) < 1e-8 * scale, `${id} ${JSON.stringify(p)}: mean ${r.value[0]} against ${m.mean}`);
    assert.ok(Math.abs(r.value[1] - r.value[0] ** 2 - /** @type {number} */ (m.variance)) < 1e-7 * Math.max(scale * scale, /** @type {number} */ (m.variance)), `${id}: variance`);
  }
  const t = L.BY_ID.student, f = L.BY_ID.fisher;
  assert.deepEqual(t.moments({ nu: 0.8 }), { mean: null, variance: null, order: 0.8 }, "ν ≤ 1: no mean");
  assert.deepEqual(t.moments({ nu: 1.5 }), { mean: 0, variance: null, order: 1.5 }, "1 < ν ≤ 2: a mean but no variance");
  assert.deepEqual(f.moments({ d1: 1.5, d2: 3 }), { mean: 3, variance: null, order: 1.5 }, "2 < d₂ ≤ 4: a mean but no variance");
  // P(T > t) ~ c t^(−ν): the ratio of the tails at t and 2t tends to 2^ν.
  const ratio = t.sf(1e4, { nu: 1.5 }) / t.sf(2e4, { nu: 1.5 });
  assert.ok(Math.abs(ratio - 2 ** 1.5) < 1e-3, `regularly varying t tail: ${ratio}`);
});

test("closed relations between the laws hold: Erlang and chi-square as gamma laws, T² as F, Beta(1, 1) as U(0, 1)", () => {
  const g = L.BY_ID.gamma;
  for (const x of [0.1, 1, 5]) {
    assert.ok(Math.abs(L.BY_ID.erlang.cdf(x, { k: 3, rate: 2 }) - g.cdf(x, { k: 3, theta: 0.5 })) < 1e-15);
    assert.ok(Math.abs(L.BY_ID.chisq.sf(x, { nu: 2 }) - Math.exp(-x / 2)) < 1e-14, "χ²(2) is exponential with rate 1/2");
    assert.ok(Math.abs(L.BY_ID.student.sf(Math.sqrt(x), { nu: 7 }) * 2 - L.BY_ID.fisher.sf(x, { d1: 1, d2: 7 })) < 1e-13, "T² ~ F(1, ν)");
    assert.ok(Math.abs(L.BY_ID.beta.cdf(x / 5, { a: 1, b: 1 }) - x / 5) < 1e-15, "Beta(1, 1) is U(0, 1)");
  }
  // P(Erlang(k, λ) > t) = P(Poisson(λt) < k).
  assert.ok(Math.abs(L.BY_ID.erlang.sf(1.5, { k: 4, rate: 2 }) - L.BY_ID.poisson.cdf(3, { lambda: 3 })) < 1e-14);
  assert.ok(Math.abs(L.BY_ID.logistic.sf(3, { mu: 0, s: Math.sqrt(3) / Math.PI }) - 1 / (1 + Math.exp(Math.PI * Math.sqrt(3)))) < 1e-15, "the logistic tail at 3 standard deviations, about 0.0043");
});

test("the vector laws: components, covariances, the Cholesky factor and the simplex", () => {
  const mv = L.BY_ID.mvnormal, p = { mu: [1, 2, 3], cov: [4, 1, 0.5, 1, 9, -2, 0.5, -2, 1] };
  assert.deepEqual(mv.check(p), []);
  assert.equal(mv.dim(p), 3);
  assert.deepEqual(mv.marginal(p, 2), { law: "normal", params: { mu: 2, sigma: 3 } });
  assert.equal(mv.covariance(p, 2, 3), -2);
  const Lc = /** @type {Float64Array} */ (C.cholesky(p.cov, 3));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let m = 0; m < 3; m++) s += Lc[i * 3 + m] * Lc[j * 3 + m];
    assert.ok(Math.abs(s - p.cov[i * 3 + j]) < 1e-12, `LLᵀ = Σ at (${i + 1}, ${j + 1})`);
  }
  const d = L.BY_ID.dirichlet, q = { alpha: [2, 3, 5] };
  assert.deepEqual(d.marginal(q, 3), { law: "beta", params: { a: 5, b: 5 } });
  let row = 0;
  for (let j = 1; j <= 3; j++) row += d.covariance(q, 1, j);
  assert.ok(Math.abs(row) < 1e-15, "the components add to 1, so each row of the covariance adds to 0");
  assert.ok(Math.abs(d.covariance(q, 1, 1) - L.BY_ID.beta.moments({ a: 2, b: 8 }).variance) < 1e-15);
});


/** The double next to x towards +∞ (dir 1) or −∞ (dir −1), for a finite x. @param {number} x @param {number} dir */
function next(x, dir) {
  if (x === 0) return dir * Number.MIN_VALUE;
  const b = new Float64Array([x]), i = new BigInt64Array(b.buffer);
  i[0] += (x > 0) === (dir > 0) ? 1n : -1n;
  return b[0];
}
