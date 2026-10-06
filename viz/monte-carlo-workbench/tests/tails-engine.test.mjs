// The engine and the model for group 3: censoring as an observation mechanism, exact references from the law of a
// maximum, a minimum, a sum or an affine function of draws, quadrature over the law of one name, the moment status of
// two-sided heavy tails, of maxima and sums of heavy draws and of clipped values, the focus law and the tail plot, the
// expression functions for censored and heavy-tailed samples, and the maximum likelihood fit of a series of maxima.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { D, En, L, M, P, Rng, X, runModel } from "./helpers.mjs";

const VisualKit = createRequire(import.meta.url)("../../../scripts/kit/kit.js");
/** @param {string} text */
const rec = (text) => { const r = D.parse(text); assert.deepEqual(r.errors, []); return r.record; };
/** @param {string} text @param {any} [settings] */
const prep = (text, settings = {}) => En.prepare(rec(text), { seed: 1, method: "independent", overrides: {}, ...settings });

test("right and left censoring observe min or max of T and C, and an event indicator", () => {
  const c = prep("T ~ weibull(k = 1.5, lambda = 10) repeat 5\nC ~ weibull(k = 1, lambda = 8) repeat 5\ncensoring: right T by C\nmean d = mean(T_event)\nmean y = mean(T_obs)\n");
  assert.ok(c.ok, c.errors?.join(" "));
  const blk = En.block(c, 0, {});
  assert.equal(blk.error, "");
  // Each replicate: T_obs = min(T, C) and T_event = 1 exactly when T ≤ C.
  const names = c.nodes.map((/** @type {any} */ n) => n.name);
  assert.deepEqual(names, ["T", "C", "T_obs", "T_event"]);
  const env = c.alternatives[0].values.slice(), tObs = c.nodes[2], tEv = c.nodes[3];
  env[c.slots.get("T")] = [1, 5, 9]; env[c.slots.get("C")] = [2, 4, 9];
  assert.deepEqual(tObs.fn(env), [1, 4, 9]);
  assert.deepEqual(tEv.fn(env), [1, 0, 1]);
  const left = prep("param lod = 0.5\nX ~ lognormal(mu = 0, sigma = 1)\ncensoring: left X by lod\nmean m = X_obs\n");
  assert.ok(left.ok);
  const e2 = left.alternatives[0].values.slice();
  e2[left.slots.get("X")] = 0.2;
  assert.equal(left.nodes[1].fn(e2), 0.5);
  assert.equal(left.nodes[2].fn(e2), 0);
  for (const [text, msg] of /** @type {[string, RegExp][]} */ ([["X ~ weibull(k = 1, lambda = 1)\ncensoring: right Y by 3\nmean m = X\n", /never defines Y/], ["X ~ weibull(k = 1, lambda = 1)\ncensoring: middle X by 3\nmean m = X\n", /no censoring mechanism/],
    ["X ~ weibull(k = 1, lambda = 1)\ncensoring: right X by X\nmean m = X\n", /cannot read X itself/]])) {
    const c2 = prep(text);
    assert.equal(c2.ok, false, text);
    assert.match(c2.errors.join(" "), msg, text);
  }
});

test("the Kaplan–Meier estimate stays near the true survival under censoring, and the naive fraction does not", () => {
  // S(10) = exp(−1) for Weibull(1.5, 10). Over 3 seeds of 4,096 samples of 50 units, the KM mean lies within 0.01 and
  // the naive fraction more than 0.1 below: the bias of the naive fraction is about 0.18.
  const r = rec("T ~ weibull(k = 1.5, lambda = 10) repeat 50\nC ~ weibull(k = 1, lambda = 15) repeat 50\ncensoring: right T by C\nmean naive = mean(T_obs > 10)\nmean kmest = km(T_obs, T_event, 10)\n");
  for (const seed of [3, 4, 5]) {
    const q = runModel(r, { seed }, 4).summary[0].alts[0].quantities;
    assert.ok(Math.abs(q[1].est - Math.exp(-1)) < 0.01, `seed ${seed}: KM ${q[1].est}`);
    assert.ok(Math.exp(-1) - q[0].est > 0.1, `seed ${seed}: naive ${q[0].est}`);
  }
});

test("exact references for maxima, minima, sums and affine functions of draws, and the estimates meet them for 3 seeds", () => {
  const r = rec("param a = 1.5\nX ~ pareto1(xm = 1, alpha = a) repeat 100\nM := max(X)/100^(1/a)\nN := min(X)\nY ~ cauchy(x0 = 0, gamma = 1) repeat 20\nA := mean(Y)\nprob pm = M <= 1\nprob pn = N > 1.01\nprob pa = A > 1\nmean ea = 2*M + 1\n");
  const c = En.prepare(r, { seed: 1, method: "independent", overrides: {} }), st = En.momentStatus(c), refs = En.reference(c, st);
  const v = refs[0].values;
  assert.ok(Math.abs(/** @type {number} */ (v[0]) - (1 - 100 ** -1) ** 100) < 1e-12, "P(max ≤ 100^(1/α)) = (1 − 1/100)^100");
  assert.ok(Math.abs(/** @type {number} */ (v[1]) - 1.01 ** -150) < 1e-12, "P(min > 1.01) = 1.01^(−αn)");
  assert.ok(Math.abs(/** @type {number} */ (v[2]) - 0.25) < 1e-14, "the mean of 20 Cauchy values is Cauchy: P(A > 1) = 1/4");
  assert.equal(st[3].mean, "finite");
  assert.equal(st[3].variance, "infinite", "2M + 1 has the tail of X: index 1.5 < 2");
  assert.deepEqual(refs[0].closed.slice(0, 3), [true, true, true]);
  for (const seed of [5, 77, 31337]) {
    const q = runModel(r, { seed }, 16).summary[0].alts[0].quantities;
    for (const k of [0, 1, 2]) {
      const ref = /** @type {number} */ (v[k]), se = Math.sqrt((ref * (1 - ref)) / q[k].n);
      assert.ok(Math.abs(q[k].est - ref) < 5.5 * se + 1e-12, `seed ${seed} ${q[k].name}: ${q[k].est} against ${ref}`);
    }
  }
});

test("quadrature over the law of one name: a clipped mean of a heavy variable, and a stop-loss of a maximum", () => {
  const c = prep("Y ~ cauchy(x0 = 0, gamma = 1)\nmean clip = pmin(pmax(Y, -5), 5)\nmean m = Y\nX ~ pareto1(xm = 1, alpha = 3) repeat 10\nM := max(X)\nmean layer = pmin(pmax(M - 2, 0), 3)\n");
  const st = En.momentStatus(c), refs = En.reference(c, st);
  assert.deepEqual([st[0].mean, st[1].mean, st[1].twoSided], ["finite", "infinite", true], "a clipped value has every moment; Cauchy has no mean on either side");
  assert.ok(Math.abs(/** @type {number} */ (refs[0].values[0])) < 1e-9, "the clipped symmetric Cauchy value has mean 0");
  assert.equal(refs[0].values[1], null);
  // E[min(max(M − 2, 0), 3)] = ∫ from 2 to 5 of P(M > x) dx with P(M > x) = 1 − (1 − x^(−3))^10.
  let exact = 0;
  for (let i = 0; i < 300000; i++) { const x = 2 + ((i + 0.5) * 3) / 300000; exact += (1 - (1 - x ** -3) ** 10) * (3 / 300000); }
  assert.ok(Math.abs(/** @type {number} */ (refs[0].values[2]) - exact) < 1e-8, `layer ${refs[0].values[2]} against ${exact}`);
  assert.match(refs[0].how[2], /exact law of one name/);
  const s = runModel(rec("Y ~ cauchy(x0 = 0, gamma = 1)\nmean m = Y\n"), { seed: 2 }, 2).summary[0].alts[0].quantities[0];
  assert.equal(s.lo, null);
  assert.match(s.how, /does not exist/);
});

test("the expression functions: median, quantile, Hill's estimator and the Kaplan–Meier estimate", () => {
  assert.equal(X.value("median([3, 1, 2, 10])"), 2.5);
  assert.equal(X.value("quantile([1, 2, 3, 4, 5], 0.9)"), 4.6);
  // Times 1, 2, 2, 3, 4 with events 1, 0, 1, 1, 0: Ŝ(2.5) = (4/5)(3/4) = 0.6, Ŝ(3) = 0.6·(1/2) = 0.3.
  assert.ok(Math.abs(/** @type {number} */ (X.value("km([1, 2, 2, 3, 4], [1, 0, 1, 1, 0], 2.5)")) - 0.6) < 1e-15);
  assert.ok(Math.abs(/** @type {number} */ (X.value("km([1, 2, 2, 3, 4], [1, 0, 1, 1, 0], 3)")) - 0.3) < 1e-15);
  assert.ok(Math.abs(/** @type {number} */ (X.value("hill([1, 2, 4, 8, 16], 2)")) - (Math.log(4) + Math.log(2)) / 2) < 1e-15);
  assert.throws(() => X.value("hill([1, 2], 2)"), /k from 1 to 1/);
  assert.throws(() => X.value("km([1, 2], [1], 1)"), /same length/);
  // Hill's estimate of γ = 1/α from 20,000 Pareto I(1, 2) values with k = 1,000 is within 0.02 of 0.5 for 3 seeds.
  for (const seed of [1, 2, 3]) {
    const r = Rng.stream(seed, "hill", 0, 0), xs = Array.from({ length: 20000 }, () => Math.pow(r.uniform(), -1 / 2));
    const g = /** @type {number} */ (X.compile(X.parse("hill(x, 1000)"), new Map([["x", 0]]))([xs]));
    assert.ok(Math.abs(g - 0.5) < 0.02, `seed ${seed}: γ̂ = ${g}`);
  }
});

test("the focus law, the log-spaced tail thresholds and the tail plot of a maximum", () => {
  const custom = rec("title: maxima\nX ~ pareto1(xm = 1, alpha = 1.5) repeat 50\nM := max(X)\nprob big = M > 100\nfocus M\n");
  M.setCustom(custom);
  const d = M.derive({ ...VisualKit.defaults(M.FIELDS), model: "custom", plot: "tail" });
  assert.equal(d.ok, true);
  assert.match(d.focus.law.label, /maximum of 50 draws/);
  assert.equal(d.focus.law.tailIndex, 1.5);
  const t = d.focus.theory;
  assert.ok(t.x.length > 50 && t.x.every((/** @type {number} */ x) => x > 0) && t.y.every((/** @type {number} */ y) => y > 0));
  // On the reference line far out, log P(M > x) falls with slope −α between the last two thresholds.
  const n = t.x.length, slope = Math.log(t.y[n - 1] / t.y[n - 2]) / Math.log(t.x[n - 1] / t.x[n - 2]);
  assert.ok(Math.abs(slope + 1.5) < 0.01, `slope ${slope}`);
  const svg = P.tail({ xlabel: "M", theory: t, empirical: { x: [2, 10, 100], y: [0.5, 0.1, 0] }, n: 10, alpha: 1.5 });
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  assert.match(svg, /slope −1.5/);
  M.setCustom(null);
});

test("the GEV fit of a series recovers the parameters of simulated maxima, and the deviance is not negative", () => {
  const gev = L.BY_ID.gev, p = { xi: 0.15, mu: 30, sigma: 10 };
  for (const seed of [1, 2, 3]) {
    const r = Rng.stream(seed, "fit", 0, 0), values = Array.from({ length: 2000 }, () => gev.quantile(r.uniform(), p));
    const f = M.seriesFit({ values });
    // With n = 2,000 the standard errors are about 0.25, 0.2 and 0.02; 5 of them bound each error.
    const se = /** @type {number[]} */ (f.gev.se);
    assert.ok(Math.abs(f.gev.mu - 30) < 5 * se[0] && Math.abs(f.gev.sigma - 10) < 5 * se[1] && Math.abs(f.gev.xi - 0.15) < 5 * se[2], `seed ${seed}: ${JSON.stringify(f.gev)}`);
    assert.ok(f.deviance >= 0 && f.gev.loglik >= f.gumbel.loglik);
    assert.ok(f.levels[1].gev > f.levels[0].gev && f.plot.length === 2000);
  }
});
