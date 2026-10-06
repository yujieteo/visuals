// The copulas of group 5 against independent references. The normal and t quantiles against the bisection of
// MCSpecial and against their own CDF; the bivariate normal and t orthant probabilities against the closed form
// 1/4 + arcsin(ρ)/(2π), which holds for every elliptical law; each sampler of each copula against its CDF, its
// uniform margins and its Kendall's tau, with 3 seeds; the parameter and dimension domains; and the box references
// of the engine against runs. A statistical assertion fails when a z-score exceeds 4.5: for a correct sampler the
// probability of a false failure is below 7e-6 for each assertion (normal approximation of the sample mean).
import assert from "node:assert/strict";
import test from "node:test";
import { Cop, D, En, Rng, S } from "./helpers.mjs";

const Z = 4.5, SEEDS = [11, 2026, 90001];

test("the normal quantile AS 241 and the t quantile agree with independent computations to 1e-12", () => {
  for (let i = 1; i < 1000; i++) {
    const p = i / 1000;
    assert.ok(Math.abs(Cop.qnorm(p) - S.normalQuantile(p)) < 1e-12, `qnorm(${p})`);
    for (const nu of [1, 2, 3.5, 10, 50]) {
      const x = Cop.tQuantile(p, nu);
      assert.ok(Math.abs(Cop.tCdf(x, nu) - p) < 1e-12, `t quantile, nu ${nu}, p ${p}`);
    }
  }
  assert.ok(Math.abs(Cop.qnorm(1e-12) - S.normalQuantile(1e-12)) < 1e-9);
});

test("the bivariate normal and t orthant probabilities meet the closed form 1/4 + arcsin(ρ)/(2π)", () => {
  for (const r of [-0.99, -0.6, -0.2, 0.1, 0.5, 0.8, 0.95, 0.999]) {
    const exact = 0.25 + Math.asin(r) / (2 * Math.PI);
    assert.ok(Math.abs(Cop.bvn(0, 0, r) - exact) < 1e-14, `bvn ${r}`);
    for (const nu of [1, 4, 30]) assert.ok(Math.abs(Cop.bvt(0, 0, r, nu) - exact) < 2e-7, `bvt ${r} ${nu}`);
  }
  // Away from the origin: the bivariate normal against a 1-D Simpson integral of φ(x) Φ((b − ρx)/√(1 − ρ²)).
  for (const [a, b, r] of [[1, -0.5, 0.7], [-1.2, 0.3, -0.4], [2, 2, 0.95]]) {
    const n = 20000, lo = -10, h = (a - lo) / n;
    let s = 0;
    for (let i = 0; i <= n; i++) { const x = lo + i * h, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * S.normalPdf(x) * S.normalCdf((b - r * x) / Math.sqrt(1 - r * r)); }
    assert.ok(Math.abs(Cop.bvn(a, b, r) - (s * h) / 3) < 1e-10, `bvn(${a}, ${b}, ${r})`);
    assert.ok(Math.abs(Cop.bvt(a, b, r, 1e6) - Cop.bvn(a, b, r)) < 1e-5, "the t law tends to the normal law");
  }
});

const CASES = [
  ["gaussiancopula", { rho: 0.6, d: 2 }], ["gaussiancopula", { rho: [0.5, -0.3, 0.2], d: 3 }], ["tcopula", { rho: 0.5, nu: 4, d: 2 }],
  ["claytoncopula", { theta: 2, d: 2 }], ["claytoncopula", { theta: -0.5, d: 2 }], ["claytoncopula", { theta: 1.5, d: 3 }],
  ["gumbelcopula", { theta: 1.8, d: 2 }], ["gumbelcopula", { theta: 2.5, d: 3 }], ["frankcopula", { theta: 6, d: 2 }], ["frankcopula", { theta: -4, d: 2 }], ["frankcopula", { theta: 3, d: 3 }],
];

test("each copula sampler has uniform margins, its CDF at two boxes and its Kendall's tau, with 3 seeds", () => {
  for (const [id, p] of /** @type {[string, any][]} */ (CASES)) {
    const law = Cop.BY_ID[id];
    assert.deepEqual(law.check(p), [], `${id} ${JSON.stringify(p)}`);
    for (const kind of ["reference", "inverse"]) {
      const s = law[kind](p);
      if ("unavailable" in s) { assert.ok(p.d > 2 && kind === "inverse", `${id}: only d > 2 lacks the conditional inverse`); continue; }
      for (const seed of SEEDS) {
        const rng = Rng.stream(seed, `copula/${kind}`, 0, 0), n = 6000, xs = [];
        for (let i = 0; i < n; i++) { rng.reset(i, 0); xs.push(s.draw(rng)); }
        for (let j = 0; j < p.d; j++) {
          const m = xs.reduce((a, x) => a + x[j], 0) / n;
          assert.ok(Math.abs(m - 0.5) / Math.sqrt(1 / 12 / n) < Z, `${id} ${kind} seed ${seed}: margin ${j + 1} mean ${m}`);
        }
        for (const [a, b] of [[0.3, 0.6], [0.85, 0.9]]) {
          const u = Array.from({ length: p.d }, (_, j) => (j === 0 ? a : j === 1 ? b : 1)), F = law.cdf(u, p);
          const hat = xs.filter((x) => x[0] <= a && x[1] <= b).length / n;
          assert.ok(Math.abs(hat - F) / Math.sqrt(Math.max(F * (1 - F), 1e-4) / n) < Z, `${id} ${kind} seed ${seed}: C(${a}, ${b}) = ${F}, estimate ${hat}`);
        }
        // Kendall's tau of 1,500 points: its standard deviation is at most √(4/(9n)) (the value under independence is
        // 2(2n + 5)/(9n(n − 1)); dependence lowers it).
        const k = 1500, pts = xs.slice(0, k);
        let c = 0;
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) c += Math.sign((pts[i][0] - pts[j][0]) * (pts[i][1] - pts[j][1]));
        const tau = c / ((k * (k - 1)) / 2), th = law.tau(p)[0].tau;
        assert.ok(Math.abs(tau - th) / Math.sqrt(4 / (9 * k)) < Z, `${id} ${kind} seed ${seed}: tau ${tau} against ${th}`);
      }
    }
  }
});

test("the parameter and dimension domains: each copula refuses the parameters where it does not exist or where the page has no sampler", () => {
  const err = (/** @type {string} */ id, /** @type {any} */ p) => Cop.BY_ID[id].check(p).join(" ");
  assert.match(err("gumbelcopula", { theta: 0.8, d: 2 }), /θ ≥ 1/);
  assert.match(err("frankcopula", { theta: -2, d: 3 }), /only for θ > 0/);
  assert.match(err("claytoncopula", { theta: -0.7, d: 3 }), /not d-monotone/);
  assert.match(err("claytoncopula", { theta: -0.3, d: 3 }), /copula exists, but this page samples θ < 0 only for d = 2/);
  assert.match(err("claytoncopula", { theta: -1, d: 2 }), /θ > −1/);
  assert.match(err("gaussiancopula", { rho: [0.9, 0.9, -0.9], d: 3 }), /not positive definite/);
  assert.match(err("gaussiancopula", { rho: -0.6, d: 3 }), /rho > −1\/\(d − 1\)/);
  assert.match(err("tcopula", { rho: 0.5, nu: 0.2, d: 2 }), /nu = 0.2/);
  assert.match(err("gaussiancopula", { rho: [0.1, 0.2], d: 3 }), /3 entries above the diagonal/);
  assert.equal(err("frankcopula", { theta: -5, d: 2 }), "");
  // Tail coefficients: the Gaussian has none, the t copula has both, Clayton the lower one, Gumbel the upper one.
  assert.deepEqual(Cop.BY_ID.gaussiancopula.tails({ rho: 0.9, d: 2 })[0], { i: 1, j: 2, lower: 0, upper: 0 });
  const t = Cop.BY_ID.tcopula.tails({ rho: 0.5, nu: 4, d: 2 })[0];
  assert.ok(Math.abs(t.upper - 2 * Cop.tCdf(-Math.sqrt((5 * 0.5) / 1.5), 5)) < 1e-15 && t.lower === t.upper);
  assert.equal(Cop.BY_ID.claytoncopula.tails({ theta: 2, d: 2 })[0].lower, 2 ** -0.5);
  assert.ok(Math.abs(Cop.BY_ID.gumbelcopula.tails({ theta: 2, d: 2 })[0].upper - (2 - Math.SQRT2)) < 1e-15);
});

test("the engine's box references of a copula with discrete margins lie inside the run's intervals, for 3 seeds", () => {
  const text = `title: t
U ~ claytoncopula(theta = 2, d = 2)
N1 ~ poisson(lambda = 3, u = U[1])
N2 ~ negbin(r = 2, p = 0.4, u = U[2])
prob both = N1 >= 5 and N2 >= 5
prob low = N1 <= 1 and N2 <= 1
prob box = U[1] > 0.2 and U[1] <= 0.7 and U[2] > 0.5
`;
  const rec = D.parse(text).record;
  for (const seed of SEEDS) {
    const c = En.prepare(rec, { seed, method: "independent", overrides: {} });
    assert.ok(c.ok, c.errors?.join(" "));
    const st = En.momentStatus(c), refs = En.reference(c, st);
    let acc = En.empty(c);
    for (let b = 0; b < 16; b++) acc = En.merge(acc, En.block(c, b, {}), c);
    const sm = En.summary(c, acc, st, refs)[0].alts[0].quantities;
    for (const [k, q] of sm.entries()) {
      assert.ok(refs[0].closed[k], `${q.name} has a closed form`);
      const p = /** @type {number} */ (refs[0].values[k]);
      assert.ok(Math.abs(q.est - p) / Math.sqrt((p * (1 - p)) / q.n) < Z, `seed ${seed}, ${q.name}: ${q.est} against ${p}`);
    }
  }
});
