// Test catalogue v1 against its references: every distribution, test, effect and the Benjamini–Yekutieli
// adjustment of src/stats.js compared with SciPy, statsmodels and pymannkendall (tests/fixtures/stats-reference.json,
// written by tools/reference_stats.py with the versions it records). The page's own functions run on the same data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { close, group, num, spearmanRho } from "./stats-helpers.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Stats = require("../src/stats.js");
const ref = JSON.parse(readFileSync(new URL("fixtures/stats-reference.json", import.meta.url), "utf8"));
const xs = (/** @type {any[]} */ a) => a.map(num);
const near = (got, want, what, rel = 1e-7, abs = 1e-12) => assert.ok(close(got, num(want), rel, abs), `${what}: ${got}, the reference ${want}`);

test("the references were written by the pinned versions", () => {
  assert.deepEqual(ref.versions, { scipy: "1.13.1", statsmodels: "0.14.6", pymannkendall: "1.4.3", numpy: "2.0.2" });
});

test("distributions: normal, Student's t, F, chi-square and Kolmogorov against SciPy", () => {
  const d = ref.distributions;
  for (const [z, want] of d.normSf) near(Stats.normSf(z), want, `normal sf(${z})`, 1e-10, 1e-300);
  for (const [p, want] of d.normQuantile) near(Stats.normQuantile(p), want, `normal ppf(${p})`, 1e-10);
  for (const [t, df, want] of d.tTwoSided) near(Stats.tTwoSided(t, df), want, `t two-sided(${t}, ${df})`, 1e-9, 1e-300);
  for (const [p, df, want] of d.tQuantile) near(Stats.tQuantile(p, df), want, `t ppf(${p}, ${df})`, 1e-9);
  for (const [f, d1, d2, want] of d.fSf) near(Stats.fSf(f, d1, d2), want, `F sf(${f}, ${d1}, ${d2})`, 1e-9, 1e-300);
  for (const [x, k, want] of d.chi2Sf) near(Stats.chi2Sf(x, k), want, `chi-square sf(${x}, ${k})`, 1e-9, 1e-300);
  for (const [x, want] of d.kolmogorovSf) near(Stats.kolmogorovSf(x), want, `Kolmogorov sf(${x})`, 1e-9, 1e-15);
});

test("T1 Spearman: rho, p and the Bonett–Wright interval against spearmanr", () => {
  for (const c of ref.spearman) {
    const rho = spearmanRho(xs(c.x), xs(c.y));
    near(rho, c.rho, `${c.name}: rho`, 1e-10);
    const r = Stats.spearman({ n: c.n, rho });
    near(r.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(r.effect.ci[0], c.ci[0], `${c.name}: interval low`, 1e-9);
    near(r.effect.ci[1], c.ci[1], `${c.name}: interval high`, 1e-9);
  }
});

test("T2 Welch t: t, df, p, the mean difference and Hedges' g with intervals against ttest_ind", () => {
  for (const c of ref.welch) {
    const r = Stats.welchT(group(xs(c.a)), group(xs(c.b)));
    near(r.statistic.value, c.t, `${c.name}: t`, 1e-10);
    near(r.df[0], c.df, `${c.name}: df`, 1e-10);
    near(r.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(r.difference.value, c.difference, `${c.name}: difference`, 1e-10);
    near(r.difference.ci[0], c.differenceCi[0], `${c.name}: difference interval`, 1e-8);
    near(r.difference.ci[1], c.differenceCi[1], `${c.name}: difference interval`, 1e-8);
    near(r.effect.value, c.g, `${c.name}: g`, 1e-10);
    near(r.effect.ci[0], c.gCi[0], `${c.name}: g interval`, 1e-9);
    near(r.effect.ci[1], c.gCi[1], `${c.name}: g interval`, 1e-9);
  }
});

test("T3 Welch ANOVA: F, both df and p against statsmodels anova_oneway; omega-squared", () => {
  for (const c of ref.anova) {
    const r = Stats.welchAnova(c.groups.map((g) => group(xs(g))));
    near(r.statistic.value, c.f, `${c.name}: F`, 1e-9);
    near(r.df[0], c.df[0], `${c.name}: df1`);
    near(r.df[1], c.df[1], `${c.name}: df2`, 1e-9);
    near(r.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(r.effect.value, c.omega, `${c.name}: omega-squared`, 1e-9);
  }
});

test("T4 chi-square without continuity correction, and the bias-corrected Cramér's V, against chi2_contingency", () => {
  for (const c of ref.chiSquare) {
    const r = Stats.chiSquare(c.table);
    near(r.statistic.value, c.x2, `${c.name}: chi-square`, 1e-10);
    assert.equal(r.df[0], c.df);
    near(r.p, c.p, `${c.name}: p`, 1e-8, 1e-300);
    near(r.effect.value, c.v, `${c.name}: V`, 1e-9);
    assert.equal(Stats.expectedRule(c.table).ok, c.minExpected >= 5, `${c.name}: the expected counts rule`);
  }
  assert.equal(Stats.expectedRule([[3, 0, 1], [0, 4, 0], [1, 1, 2]]).ok, false, "a sparse table fails T4's rule");
});

test("T5 Fisher exact: p and the sample odds ratio with its interval against fisher_exact and odds_ratio", () => {
  for (const c of ref.fisher) {
    const r = Stats.fisher(c.table);
    near(r.p, c.p, `${c.name}: p`, 1e-9);
    near(r.effect.value, c.oddsRatio, `${c.name}: odds ratio`, 1e-12);
    near(r.effect.ci[0], c.ci[0], `${c.name}: interval low`, 1e-9);
    // SciPy answers NaN for the upper end when a cell is 0; the page calls that interval unbounded.
    if (num(c.ci[1]) !== num(c.ci[1])) assert.equal(r.effect.ci[1], Infinity, `${c.name}: unbounded`);
    else near(r.effect.ci[1], c.ci[1], `${c.name}: interval high`, 1e-9);
  }
});

test("T6 permutation: p within four Monte Carlo standard errors of 400,000 tables drawn by SciPy; seeded, so repeatable", () => {
  for (const [i, c] of ref.permutation.entries()) {
    const r = Stats.permutation(c.table, { seed: 20261005 + i });
    near(r.statistic.value, c.x2, `${c.name}: chi-square`, 1e-10);
    near(r.effect.value, c.v, `${c.name}: V`, 1e-9);
    const se = Math.sqrt(r.mcse ** 2 + num(c.se) ** 2);
    assert.ok(Math.abs(r.p - num(c.p)) <= 4 * se, `${c.name}: p ${r.p}, SciPy's estimate ${c.p} (SE ${se})`);
    assert.equal(Stats.permutation(c.table, { seed: 20261005 + i }).p, r.p, "the same seed, the same p");
    assert.equal(r.permutations, 10000);
    assert.equal(r.p, (r.exceed + 1) / 10001);
  }
});

test("random tables keep both margins, and their cells follow the hypergeometric mean", () => {
  const u = Stats.random(3);
  const rows = [5, 9, 6], cols = [4, 10, 6];
  const sum = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < 4000; k++) {
    const t = Stats.randomTable(rows, cols, u);
    assert.deepEqual(t.map((r) => r.reduce((a, b) => a + b, 0)), rows);
    assert.deepEqual(cols.map((_, j) => t.reduce((a, r) => a + r[j], 0)), cols);
    t.forEach((r, i) => r.forEach((x, j) => { sum[i][j] += x; }));
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(sum[i][j] / 4000 - (rows[i] * cols[j]) / 20) < 0.08, `cell ${i},${j}`);
});

test("T7 Mann–Kendall with the Hamed–Rao correction: S, var(S), z, p, tau and Sen's slope against pymannkendall", () => {
  for (const c of ref.mannKendall) {
    const r = Stats.mannKendall(xs(c.x));
    near(r.s, c.s, `${c.name}: S`);
    near(r.varS, c.varS, `${c.name}: var(S)`, 1e-9);
    near(r.statistic.value, c.z, `${c.name}: z`, 1e-9);
    near(r.p, c.p, `${c.name}: p`, 1e-8, 1e-12);
    near(r.effect.value, c.tau, `${c.name}: tau`, 1e-12);
    near(r.slope.value, c.slope, `${c.name}: Sen's slope`, 1e-12);
    near(r.slope.ci[0], c.slopeCi[0], `${c.name}: slope interval`, 1e-12);
    near(r.slope.ci[1], c.slopeCi[1], `${c.name}: slope interval`, 1e-12);
  }
});

test("T8 level shift: the CUSUM statistic, its Kolmogorov p, the break and the shift against the Python reference", () => {
  for (const c of ref.levelShift) {
    const r = Stats.levelShift(xs(c.x));
    assert.equal(r.bandwidth, c.bandwidth, `${c.name}: bandwidth`);
    near(r.statistic.value, c.statistic, `${c.name}: statistic`, 1e-10);
    near(r.p, c.p, `${c.name}: p`, 1e-9, 1e-15);
    assert.equal(r.shift.at, c.at, `${c.name}: the break`);
    near(r.shift.value, c.shift, `${c.name}: shift`, 1e-10);
    near(r.effect.value, c.shiftSd, `${c.name}: shift in long-run SD`, 1e-9);
  }
  assert.ok(Stats.levelShift(xs(ref.levelShift[0].x)).p < 0.05, "a shift of two SDs over 60 periods is found");
});

test("Benjamini–Yekutieli: adjusted p-values equal false_discovery_control(method='by'), in the input order, ties included", () => {
  const got = Stats.by(xs(ref.by.p));
  got.forEach((p, i) => near(p, ref.by.adjusted[i], `p ${i}`, 1e-12));
  assert.deepEqual(Stats.by([]), []);
  assert.deepEqual(Stats.by([0.5]), [0.5]);
});

test("shape: the bimodality coefficient from the sample skewness and excess kurtosis of SciPy", () => {
  for (const c of ref.shape) {
    const x = xs(c.x);
    const s = Stats.shape({ n: x.length, skew: num(c.skew), kurt: num(c.kurt), rare: 0 });
    const n = x.length;
    near(s.bc, (num(c.skew) ** 2 + 1) / (num(c.kurt) + (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))), `${c.name}: BC`);
  }
  const two = ref.shape.find((c) => c.name === "two modes");
  assert.ok(Stats.shape({ n: two.x.length, skew: num(two.skew), kurt: num(two.kurt), rare: 0 }).bc > 0.555, "two modes have a coefficient above 0.555");
  const logn = ref.shape.find((c) => c.name === "lognormal");
  assert.ok(Stats.shape({ n: logn.x.length, skew: num(logn.skew), kurt: num(logn.kurt), rare: 0 }).bc < 0.555);
});

test("rarity: 1 − k · the rarest share; even levels give 0", () => {
  assert.equal(Stats.rarity([{ level: "a", n: 50 }, { level: "b", n: 50 }]).value, 0);
  const r = Stats.rarity([{ level: "North", n: 480 }, { level: "South", n: 440 }, { level: "Atlantis", n: 10 }]);
  assert.equal(r.rarest.level, "Atlantis");
  assert.ok(Math.abs(r.value - (1 - (3 * 10) / 930)) < 1e-12);
  assert.equal(Stats.rarity([{ level: "only", n: 9 }]).value, 0, "one level has no rarity");
});
