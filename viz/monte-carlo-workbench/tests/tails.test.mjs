// The 16 laws of group 3: parameter checks, the CDF and the survival function as complements, the quantile and the
// inverse survival function as their inverses (also far in the tails), the PDF as the derivative of the CDF, the
// moments of light-tailed laws against quadrature, the order of the moments of heavy-tailed laws, the stable law's
// numerical integrals against the closed forms of its special cases and its tail asymptotics, and the exact laws of
// maxima, minima, sums and affine functions of draws.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { L, S } from "./helpers.mjs";

/** @type {typeof import("../src/tails.js")} */
const T = createRequire(import.meta.url)("../src/tails.js");

const CASES = /** @type {[string, any][]} */ ([
  ["lognormal", { mu: 0.3, sigma: 1.2 }], ["weibull", { k: 0.6, lambda: 2 }], ["weibull", { k: 3, lambda: 2 }], ["invgauss", { mu: 2, lambda: 3 }], ["invgauss", { mu: 1, lambda: 500 }],
  ["gompertz", { eta: 0.05, b: 0.1 }], ["loglogistic", { alpha: 2, beta: 3 }], ["pareto1", { xm: 1, alpha: 1.5 }], ["pareto2", { mu: 0, sigma: 2, alpha: 2.5 }], ["burr12", { c: 2, k: 1.5, lambda: 3 }],
  ["frechet", { alpha: 2.5, s: 1, m: 0 }], ["cauchy", { x0: 1, gamma: 2 }], ["levy", { mu: 0, c: 1 }], ["stable", { alpha: 1.5, beta: 0.5, gamma: 1, delta: 0 }], ["stable", { alpha: 0.7, beta: 1, gamma: 2, delta: 1 }],
  ["gev", { xi: 0.2, mu: 0, sigma: 1 }], ["gev", { xi: 0, mu: 1, sigma: 2 }], ["gev", { xi: -0.3, mu: 0, sigma: 1 }], ["gpd", { xi: 0.3, sigma: 1, mu: 0 }], ["gpd", { xi: -0.5, sigma: 1, mu: 0 }],
  ["gumbel", { mu: 0, beta: 1 }], ["revweibull", { alpha: 2, mu: 1, sigma: 1 }],
]);
/** @param {number} a @param {number} b @param {number} tol */
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1e-300, Math.abs(b));

test("each case passes its parameter check, and invalid parameters fail with a message", () => {
  for (const [id, p] of CASES) assert.deepEqual(L.BY_ID[id].check(p), [], `${id} ${JSON.stringify(p)}`);
  const bad = /** @type {[string, any][]} */ ([["lognormal", { mu: 0, sigma: 0 }], ["weibull", { k: -1, lambda: 1 }], ["pareto1", { xm: 0, alpha: 1 }], ["stable", { alpha: 2.5, beta: 0, gamma: 1, delta: 0 }],
    ["stable", { alpha: 1.005, beta: 0, gamma: 1, delta: 0 }], ["gev", { xi: 0, mu: 0, sigma: -1 }], ["invgauss", { mu: 1, lambda: 1e6 }], ["cauchy", { x0: 0, gamma: 0 }]]);
  for (const [id, p] of bad) assert.ok(L.BY_ID[id].check(p).length > 0, `${id} ${JSON.stringify(p)} is refused`);
});

test("CDF + survival = 1; the quantile and the inverse survival function invert them, the latter also at 2^-60; the PDF is F'", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], tight = law.numeric ? 1e-7 : 1e-9;
    for (const u of [2 ** -60, 1e-8, 0.01, 0.3, 0.5, 0.8, 0.999]) {
      const x = law.quantile(u, p), y = law.isf(u, p);
      // Near a finite lower end, Q(u) - x_lo has few correct digits for a small u, so the lower check starts at 1e-8, with 1e-6.
      if (u >= 1e-8) assert.ok(rel(law.cdf(x, p), u, u < 1e-4 ? 1e-6 : tight), `${id} ${JSON.stringify(p)}: F(Q(${u})) = ${law.cdf(x, p)}`);
      assert.ok(rel(law.sf(y, p), u, tight), `${id} ${JSON.stringify(p)}: S(isf(${u})) = ${law.sf(y, p)}`);
      assert.ok(Math.abs(law.cdf(x, p) + law.sf(x, p) - 1) < 1e-12, `${id}: F + S = 1 at ${x}`);
      if (u >= 0.01 && u <= 0.8) {
        const h = Math.max(1e-9, 1e-5 * Math.abs(x)), d = (law.cdf(x + h, p) - law.cdf(x - h, p)) / (2 * h);
        assert.ok(rel(d, law.pdf(x, p), 1e-5), `${id}: F'(${x}) = ${d}, f = ${law.pdf(x, p)}`);
      }
    }
    const s = law.support(p);
    assert.equal(typeof law.supportText(p), "string");
    assert.ok(law.quantile(0.5, p) >= s.lo && law.quantile(0.5, p) <= s.hi, `${id}: the median lies in the support`);
  }
});

test("light-tailed laws: the mean and the variance equal the integrals of the quantile function", () => {
  for (const [id, p] of CASES) {
    const law = L.BY_ID[id], m = law.moments(p);
    if (m.order !== Infinity || law.numeric || id === "lognormal") continue;
    /** @param {(x: number) => number} g */
    const E = (g) => T.expectU(g, (u) => law.quantile(u, p), (v) => law.isf(v, p));
    assert.ok(rel(/** @type {number} */ (E((x) => x)), /** @type {number} */ (m.mean), 1e-8), `${id} mean`);
    assert.ok(rel(/** @type {number} */ (E((x) => (x - /** @type {number} */ (m.mean)) ** 2)), /** @type {number} */ (m.variance), 1e-7), `${id} variance`);
  }
});

test("heavy tails: moments exist below the tail order, and each law names the side of its heavy tail", () => {
  /** @param {string} id @param {any} p */
  const mo = (id, p) => L.BY_ID[id].moments(p);
  assert.deepEqual([mo("pareto1", { xm: 1, alpha: 1.5 }).order, mo("pareto1", { xm: 1, alpha: 1.5 }).variance, mo("pareto1", { xm: 1, alpha: 1.5 }).side], [1.5, null, "right"]);
  assert.equal(mo("pareto1", { xm: 1, alpha: 0.8 }).mean, null);
  assert.deepEqual([mo("cauchy", { x0: 0, gamma: 1 }).order, mo("cauchy", { x0: 0, gamma: 1 }).side], [1, "both"]);
  assert.deepEqual([mo("stable", { alpha: 1.5, beta: 1, gamma: 1, delta: 0 }).side, mo("stable", { alpha: 1.5, beta: -1, gamma: 1, delta: 0 }).side, mo("stable", { alpha: 0.9, beta: 0.2, gamma: 1, delta: 0 }).side], ["right", "left", "both"]);
  assert.equal(mo("stable", { alpha: 2, beta: 0, gamma: 1, delta: 3 }).variance, 2, "α = 2: N(δ, 2γ²)");
  assert.equal(mo("gev", { xi: 0.6, mu: 0, sigma: 1 }).variance, null, "ξ = 0.6 ≥ 1/2: no variance");
  assert.ok(mo("gev", { xi: 0.2, mu: 0, sigma: 1 }).variance !== null);
  assert.equal(mo("burr12", { c: 2, k: 0.5, lambda: 1 }).mean, null, "ck = 1: no mean");
  // Mean of a Pareto I law against its closed form α x_m/(α − 1), and of a log-logistic law against (απ/β)/sin(π/β).
  assert.ok(rel(/** @type {number} */ (mo("pareto1", { xm: 2, alpha: 3 }).mean), 3, 1e-15));
  assert.ok(rel(/** @type {number} */ (mo("loglogistic", { alpha: 1, beta: 4 }).mean), (Math.PI / 4) / Math.sin(Math.PI / 4), 1e-15));
});

test("the stable integrals: the Lévy and Cauchy closed forms, the density at ζ, the total mass and the power tail", () => {
  for (const x of [-0.5, 0, 0.5, 2, 10, 100, 1e4]) {
    assert.ok(rel(T.stable0(x, 0.5, 1, "pdf"), L.BY_ID.levy.pdf(x, { mu: -1, c: 1 }), 1e-8), `S(1/2, 1; 0) density at ${x} is the Lévy(−1, 1) density`);
    assert.ok(rel(T.stable0(x, 0.5, 1, "sf"), L.BY_ID.levy.sf(x, { mu: -1, c: 1 }), 1e-8), `and its survival function`);
  }
  assert.ok(rel(T.stable0(0, 1.5, 0, "pdf"), Math.exp(S.lgamma(1 + 1 / 1.5)) / Math.PI, 1e-12), "f(0) = Γ(1 + 1/α)/π for β = 0");
  for (const [a, b] of [[1.5, 0.5], [0.8, -0.3], [1.2, 1], [1, 0.7]]) {
    const mass = S.integrate((x) => [T.stable0(x, a, b, "pdf")], -40, 40, 1, { rel: 1e-9, abs: 1e-14, maxPanels: 400, breaks: [-1, 0, 1] }).value[0] + T.stable0(-40, a, b, "cdf") + T.stable0(40, a, b, "sf");
    assert.ok(Math.abs(mass - 1) < 1e-7, `α = ${a}, β = ${b}: the density integrates to ${mass}`);
    // P(X > x) ~ c_α (1 + β) x^(−α), c_α = sin(πα/2) Γ(α)/π, with a relative error of order x^(−α) at most.
    const x = 1e4, asym = (Math.sin((Math.PI * a) / 2) * Math.exp(S.lgamma(a)) / Math.PI) * (1 + b) * Math.pow(x, -a);
    assert.ok(rel(T.stable0(x, a, b, "sf"), asym, 3e-3), `α = ${a}, β = ${b}: the tail at 10^4`);
  }
  const p = { alpha: 1.3, beta: 0.4, gamma: 2, delta: 1 };
  assert.match(/** @type {any} */ (L.BY_ID.stable).alternate(p), /δ₁ = /);
  assert.ok(rel(T.stableS1(p), 1 - 0.4 * 2 * Math.tan((Math.PI * 1.3) / 2), 1e-15));
});

test("exact laws of names: the maximum, the minimum, the sum of stable values and an affine function", () => {
  const b = T.bind(L.BY_ID.pareto1, { xm: 1, alpha: 2 }), m = T.maxOf(b, 10), n = T.minOf(b, 10);
  for (const x of [1.5, 3, 30]) {
    assert.ok(rel(m.cdf(x), (1 - x ** -2) ** 10, 1e-12), "F_max = F^10");
    assert.ok(rel(n.sf(x), x ** -20, 1e-12), "S_min = S^10");
  }
  assert.ok(rel(m.cdf(m.quantile(0.9, 0.1)), 0.9, 1e-12) && rel(m.sf(m.quantile(1 - 1e-12, 1e-12)), 1e-12, 1e-9), "the quantile of the maximum");
  // The sum of n Cauchy values is Cauchy with n times the location and the scale; of n stable values, S0 with n^(1/α)γ.
  const c = /** @type {any} */ (T.sumOf(L.BY_ID.cauchy, { x0: 1, gamma: 2 }, 5));
  assert.ok(rel(c.cdf(7), 0.5 + Math.atan((7 - 5) / 10) / Math.PI, 1e-14));
  const s = /** @type {any} */ (T.sumOf(L.BY_ID.stable, { alpha: 1.5, beta: 0, gamma: 1, delta: 0 }, 16)), one = T.bind(L.BY_ID.stable, { alpha: 1.5, beta: 0, gamma: 1, delta: 0 });
  assert.ok(rel(s.sf(16 ** (1 / 1.5) * 2), one.sf(2), 1e-9), "β = 0, δ = 0: the sum is n^(1/α) X");
  const lv = /** @type {any} */ (T.sumOf(L.BY_ID.levy, { mu: 0, c: 1 }, 4));
  assert.ok(rel(lv.sf(10), L.BY_ID.levy.sf(10, { mu: 0, c: 16 }), 1e-14), "the sum of 4 Lévy(0, 1) values is Lévy(0, 16)");
  const af = /** @type {any} */ (T.affineOf(b, -2, 5));
  assert.ok(rel(af.cdf(5 - 2 * 3), b.sf(3), 1e-14) && af.support.hi === 3, "−2X + 5 reverses the tails");
  assert.equal(T.sumOf(L.BY_ID.pareto1, { xm: 1, alpha: 2 }, 3), null, "the Pareto family is not closed under sums");
});

test("the stable table beyond 10^-4: a power tail on a heavy side, the exact quantile on the light side of β = ±1", () => {
  for (const [a, b] of [[0.7, 1], [1.5, 1], [0.7, -1], [1.5, -1]]) {
    const t = T.stableTable(a, b), lo = b === 1 ? -Math.tan((Math.PI * a) / 2) : -Infinity, hi = b === -1 ? Math.tan((Math.PI * a) / 2) : Infinity;
    for (const v of [1e-5, 1e-7, 1e-10]) {
      const [u, w] = b === 1 ? [v, 1 - v] : [1 - v, v], x = T.tableQuantile(t, u, w);
      assert.ok(x >= (a < 1 ? lo : -Infinity) && x <= (a < 1 ? hi : Infinity), `α = ${a}, β = ${b}, ${v}: ${x} is in the support`);
      const F = b === 1 ? T.stable0(x, a, b, "cdf") : T.stable0(x, a, b, "sf");
      assert.ok(rel(F, v, 1e-6), `α = ${a}, β = ${b}: the light tail has probability ${F}, not ${v}`);
    }
  }
  const t = T.stableTable(1.5, 0);
  assert.ok(rel(T.tableQuantile(t, 1e-8, 1 - 1e-8) / T.tableQuantile(t, 1e-6, 1 - 1e-6), Math.pow(100, 1 / 1.5), 1e-12), "β = 0: the left power tail");
});
