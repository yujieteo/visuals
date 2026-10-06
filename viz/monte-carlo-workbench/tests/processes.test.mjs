// The processes of group 5 against independent references, with 3 fixed seeds. Each exact sampler (reference,
// inverse transform, thinning) against the mean and the variance of the law at T; the Euler schemes against the
// exact means of their own recursions, which differ from the process by the discretisation bias; the coupling of a
// coarse and a fine path; the Markov chain, the branching process and the Hawkes process against their closed forms;
// the conditions each law states; the continuous-time passage probability; and the ensemble bands. A statistical
// assertion fails when a z-score exceeds 4.5 (false-failure probability below 7e-6 for each assertion, by the
// normal approximation of a sample mean); a variance check uses the relative bound 4.5 √(2/n) for light tails.
import assert from "node:assert/strict";
import test from "node:test";
import { Pr, Rng, S } from "./helpers.mjs";

const Z = 4.5, SEEDS = [7, 2026, 31337];

/** The values at T of n paths of one sampler, with the rejection counts. @param {any} s @param {number} seed @param {number} n @param {number} [k] */
function terminal(s, seed, n, k) {
  const rng = Rng.stream(seed, "process", 0, 0), out = new Float64Array(n), stats = { proposals: 0, accepts: 0, violations: 0 };
  for (let i = 0; i < n; i++) { rng.reset(i, 0); const x = s.draw(rng, stats); out[i] = x[k ?? x.length - 1]; }
  return { xs: out, stats };
}
/** @param {Float64Array} xs */
function moments(xs) {
  let m = 0;
  for (const x of xs) m += x;
  m /= xs.length;
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return { m, v: v / (xs.length - 1) };
}

const CASES = [
  ["brownian", { x0: 1, mu: 0.4, sigma: 1.5, T: 2, steps: 16, coarsen: 1 }],
  ["gbm", { s0: 50, mu: 0.08, sigma: 0.35, T: 1.5, steps: 12, coarsen: 1 }],
  ["ou", { x0: 4, kappa: 1.2, theta: 1, sigma: 0.8, T: 3, steps: 30, coarsen: 3 }],
  ["poissonprocess", { lambda: 2.5, amp: 0.6, period: 1, T: 3, steps: 12 }],
  ["compoundprocess", { x0: 5, drift: 1, lambda: 2, jump: -0.7, T: 4, steps: 8 }],
  ["variancegamma", { x0: 0, theta: -0.3, sigma: 0.4, nu: 0.6, T: 2, steps: 5 }],
  ["hawkes", { mu: 0.8, alpha: 0.9, beta: 1.5, T: 6, steps: 12 }],
];

test("each exact sampler of each process meets the mean and the variance of its law at T, with 3 seeds", () => {
  for (const [id, p] of /** @type {[string, any][]} */ (CASES)) {
    const law = Pr.BY_ID[id];
    assert.deepEqual(law.check(p), [], id);
    const mg = law.marginal(p, p.T);
    for (const kind of ["reference", "inverse", "rejection"]) {
      const s = kind === "rejection" ? law.rejection(p, 1) : law[kind](p);
      if ("unavailable" in s) continue;
      for (const seed of SEEDS) {
        const n = 20000, { xs, stats } = terminal(s, seed, n), { m, v } = moments(xs);
        assert.ok(Math.abs(m - mg.mean) / Math.sqrt(v / n) < Z, `${id} ${kind} seed ${seed}: mean ${m} against ${mg.mean}`);
        if (mg.sd !== null) assert.ok(Math.abs(v / mg.sd ** 2 - 1) < Z * Math.sqrt(2 / n) * (id === "variancegamma" || id === "gbm" ? 3 : 1.5), `${id} ${kind} seed ${seed}: variance ${v} against ${mg.sd ** 2}`);
        assert.equal(stats.violations, 0, `${id} ${kind}: no violation with the right envelope`);
      }
    }
  }
});

test("the Euler schemes meet the exact means of their recursions, and these differ from the process by the discretisation bias", () => {
  const g = { s0: 100, mu: 0.3, sigma: 0.2, T: 2, steps: 4, coarsen: 1 }, o = { x0: 5, kappa: 2, theta: 0, sigma: 1, T: 2, steps: 4, coarsen: 1 };
  const h = 0.5, euG = g.s0 * (1 + g.mu * h) ** g.steps, euO = o.theta + (o.x0 - o.theta) * (1 - o.kappa * h) ** o.steps;
  for (const seed of SEEDS) {
    const a = moments(terminal(Pr.BY_ID.gbm.euler(g), seed, 40000).xs), b = moments(terminal(Pr.BY_ID.ou.euler(o), seed, 40000).xs);
    assert.ok(Math.abs(a.m - euG) / Math.sqrt(a.v / 40000) < Z, `GBM Euler mean ${a.m} against s0 (1 + μh)^n = ${euG}`);
    assert.ok(Math.abs(b.m - euO) / Math.sqrt(b.v / 40000) < Z, `OU Euler mean ${b.m} against θ + (x0 − θ)(1 − κh)^n = ${euO}`);
  }
  // The discretisation bias: s0 e^(μT) − s0 (1 + μh)^n and the OU decay e^(−κT) against (1 − κh)^n; κh = 1 here.
  assert.ok(g.s0 * Math.exp(g.mu * g.T) - euG > 1, "the Euler mean of GBM is below e^(μT) by more than 1");
  assert.equal(euO, 0, "with κh = 1 the Euler mean reaches θ after one step, while the exact mean is 5 e^(−4)");
  assert.equal(Pr.BY_ID.ou.conditions({ ...o, steps: 1 }).find((/** @type {any} */ c) => c.kind === "stability").holds, false, "κh = 4 breaks the stability of the Euler scheme");
});

test("coarsen = 2 gives the coarse path of the fine path's Brownian increments: the coupled pair of multilevel Monte Carlo", () => {
  for (const [id, p] of /** @type {[string, any][]} */ ([["brownian", { x0: 0, mu: 0.2, sigma: 1, T: 1, steps: 8 }], ["gbm", { s0: 10, mu: 0.1, sigma: 0.3, T: 1, steps: 8 }], ["ou", { x0: 2, kappa: 1, theta: 0, sigma: 0.5, T: 1, steps: 8 }]])) {
    for (const kind of ["reference", "euler"]) {
      const fine = Pr.BY_ID[id][kind]({ ...p, coarsen: 1 }), coarse = Pr.BY_ID[id][kind]({ ...p, steps: p.steps / 2, coarsen: 2 });
      const rng = Rng.stream(5, "couple", 0, 0);
      for (let i = 0; i < 50; i++) {
        rng.reset(i, 0);
        const f = fine.draw(rng);
        rng.reset(i, 0);
        const c = coarse.draw(rng);
        if (kind === "reference") for (let k = 0; k <= p.steps / 2; k++) assert.ok(Math.abs(c[k] - f[2 * k]) < 1e-9 * Math.max(1, Math.abs(f[2 * k])), `${id}: the exact coarse path is the fine path at even times`);
        else assert.ok(Math.abs(c[c.length - 1] - f[f.length - 1]) < 0.5 * Math.max(1, Math.abs(f[f.length - 1])), `${id}: the Euler paths stay close`);
      }
    }
  }
});

test("the Markov chain: the law of X_n against e_x0 Pⁿ, the stationary law, the period and the mixing time", () => {
  const p = { P: [0.6, 0.3, 0.1, 0.2, 0.5, 0.3, 0.1, 0.4, 0.5], x0: 1, steps: 6 }, law = Pr.BY_ID.markovchain;
  const d = Pr.distributions(Pr.matrix(p), 1, 6)[6];
  for (const kind of ["reference", "inverse"]) for (const seed of SEEDS) {
    const { xs } = terminal(law[kind](p), seed, 30000);
    for (let j = 1; j <= 3; j++) { const f = xs.filter((x) => x === j).length / xs.length; assert.ok(Math.abs(f - d[j - 1]) / Math.sqrt((d[j - 1] * (1 - d[j - 1])) / xs.length) < Z, `${kind} seed ${seed}: P(X_6 = ${j})`); }
  }
  const st = Pr.chainStructure(Pr.matrix(p)), pi = /** @type {number[]} */ (st.pi);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(pi.reduce((s, x, i) => s + x * Pr.matrix(p)[i][j], 0) - pi[j]) < 1e-14, "π P = π");
  // Two states that swap: period 2, and the law never converges.
  assert.deepEqual(Pr.chainStructure([[0, 1], [1, 0]]).periods, [2]);
  // A two-state chain with switching probabilities a and b: d(n) = |1 − a − b|^n max(π), so t_mix(1/4) is known.
  const a = 0.1, b = 0.2, two = [[1 - a, a], [b, 1 - b]], dn = (/** @type {number} */ n) => Math.abs(1 - a - b) ** n * Math.max(b, a) / (a + b);
  let n = 1;
  while (dn(n) > 0.25) n++;
  assert.equal(Pr.mixing(two, [b / (a + b), a / (a + b)], 1000), n);
  assert.equal(Pr.chainStructure([[1, 0, 0], [0.5, 0, 0.5], [0, 0, 1]]).closed.length, 2, "two absorbing classes");
});

test("the branching process: extinction against the PGF and the fixed point q = e^(m(q − 1)), with 3 seeds", () => {
  const p = { z0: 1, m: 1.5, k: Infinity, steps: 8 }, law = Pr.BY_ID.branching;
  const q = Pr.extinction(p);
  assert.ok(Math.abs(q - Math.exp(1.5 * (q - 1))) < 1e-15 && q > 0.41 && q < 0.42, `q = ${q}`);
  const p8 = Pr.extinctBy(p, 8);
  for (const kind of ["reference", "inverse"]) for (const seed of SEEDS) {
    const { xs } = terminal(law[kind](p), seed, 20000), f = xs.filter((x) => x === 0).length / xs.length;
    assert.ok(Math.abs(f - p8) / Math.sqrt((p8 * (1 - p8)) / xs.length) < Z, `${kind} seed ${seed}: P(Z_8 = 0) ${f} against ${p8}`);
    const { m, v } = moments(xs);
    assert.ok(Math.abs(m - 1.5 ** 8) / Math.sqrt(v / xs.length) < Z, `${kind}: E Z_8 = m^8`);
  }
  const nb = { z0: 2, m: 2, k: 0.3, steps: 5 }, z = terminal(law.reference(nb), 3, 20000).xs, f0 = z.filter((x) => x === 0).length / z.length, p0 = Pr.extinctBy(nb, 5) ** 2;
  assert.ok(Math.abs(f0 - p0) / Math.sqrt((p0 * (1 - p0)) / z.length) < Z, "negative binomial offspring");
  assert.equal(law.conditions({ ...p, m: 0.9 }).find((/** @type {any} */ c) => c.kind === "stability").holds, true);
});

test("the Hawkes process: the three exact samplers meet E N(T), the Euler scheme does not, and thinning with half the envelope shows violations", () => {
  const p = { mu: 1, alpha: 1.2, beta: 2, T: 4, steps: 8 }, law = Pr.BY_ID.hawkes, EN = Pr.hawkesMean(p, 4);
  for (const seed of SEEDS) {
    const bad = terminal(law.rejection(p, 0.5), seed, 4000);
    assert.ok(bad.stats.violations > 0, "violations are counted");
    const eu = moments(terminal(law.euler(p), seed, 20000).xs);
    assert.ok(Math.abs(eu.m - EN) / Math.sqrt(eu.v / 20000) > Z, `the Euler scheme with h = 0.5 has a bias: ${eu.m} against ${EN}`);
  }
  assert.equal(law.conditions({ ...p, alpha: 2.5 }).find((/** @type {any} */ c) => c.kind === "stationarity").holds, false, "n ≥ 1: no stationary version");
  assert.ok(Math.abs(Pr.hawkesMean({ mu: 1, alpha: 1, beta: 1 }, 2) - 4) < 1e-12, "α = β: E N(t) = μt + αμt²/2");
});

test("the continuous-time passage probability: the reflection principle, its symmetry, and a fine grid approaching it from below", () => {
  // No drift: P(max ≥ b) = 2 P(W_T ≥ b).
  for (const b of [0.5, 1, 2]) assert.ok(Math.abs(Pr.passUp(0, 0, 1, 1, b) - 2 * (1 - S.normalCdf(b))) < 1e-14, `b = ${b}`);
  // With drift: the probability tends to 1 for a large positive drift and to 0 for a large negative drift.
  assert.ok(Pr.passUp(0, 20, 1, 2, 1) > 1 - 1e-12 && Pr.passUp(0, -20, 1, 2, 1) < 1e-12 && Pr.passUp(0, 0.5, 1, 2, 1) > Pr.passUp(0, -0.5, 1, 2, 1));
  const p = { x0: 0, mu: 0.3, sigma: 1, T: 1, coarsen: 1 }, b = 1, ref = Pr.passUp(0, 0.3, 1, 1, b);
  let last = 0;
  for (const steps of [8, 64, 512]) {
    const { xs } = terminal({ draw: (/** @type {any} */ rng) => { const x = Pr.BY_ID.brownian.reference({ ...p, steps }).draw(rng); return [Math.max(...x)]; } }, 9, 20000, 0);
    const f = xs.filter((x) => x >= b).length / xs.length;
    assert.ok(f < ref + Z * Math.sqrt((ref * (1 - ref)) / xs.length), `steps ${steps}: ${f} is not above ${ref}`);
    assert.ok(f > last, "a finer grid sees more passages");
    last = f;
  }
  assert.ok(ref - last < 0.02, "512 steps leave a monitoring bias below 0.02");
});

test("the ensemble band: merging the bands of two blocks equals the band of all paths, and its quantiles follow the law", () => {
  const p = { x0: 0, mu: 0, sigma: 1, T: 1, steps: 16, coarsen: 1 }, s = Pr.BY_ID.brownian.reference(p), spec = Pr.bandSpec(17, -5, 5, 200);
  const rng = Rng.stream(4, "band", 0, 0), all = Pr.bandNew(spec), x = Pr.bandNew(spec), y = Pr.bandNew(spec);
  for (let i = 0; i < 20000; i++) { rng.reset(i, 0); const path = s.draw(rng); Pr.bandAdd(all, spec, path); Pr.bandAdd(i < 7000 ? x : y, spec, path); }
  const m = Pr.bandMerge(x, y);
  assert.deepEqual(m.counts, all.counts);
  for (let i = 0; i < all.mean.length; i++) assert.ok(Math.abs(m.mean[i] - all.mean[i]) < 1e-12 && Math.abs(m.m2[i] - all.m2[i]) < 1e-8 * Math.max(1, all.m2[i]));
  const r = Pr.bandRead(all, spec, [0.05, 0.95]), last = spec.idx.length - 1;
  assert.ok(Math.abs(/** @type {number} */ (r.q[1][last]) - 1.6449) < 0.06 && Math.abs(/** @type {number} */ (r.q[0][last]) + 1.6449) < 0.06, `the 5 % and 95 % quantiles at T = 1: ${r.q[0][last]}, ${r.q[1][last]}`);
});
