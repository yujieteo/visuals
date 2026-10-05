// Special functions against known values: zeta and Hurwitz zeta, log-gamma, the incomplete gamma and beta
// functions, the normal law, and the binomial intervals with their exact zero-hit bound.
import assert from "node:assert/strict";
import test from "node:test";
import { S } from "./helpers.mjs";

/** @param {number} a @param {number} b @param {number} tol */
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} is not within ${tol} of ${b}`);

test("zeta(2), zeta(3), zeta(4) and zeta(1.5) to 1e-14, and a Hurwitz tail against a direct sum", () => {
  near(S.zeta(2), Math.PI ** 2 / 6, 1e-14);
  near(S.zeta(3), 1.2020569031595942, 1e-14);
  near(S.zeta(4), Math.PI ** 4 / 90, 1e-14);
  near(S.zeta(1.5), 2.612375348685488, 1e-14);
  let direct = 0;
  for (let k = 1001; k < 2e6; k++) direct += k ** -2.5;
  direct += (2e6 - 0.5) ** -1.5 / 1.5;
  near(S.hurwitz(2.5, 1001), direct, 1e-10);
  assert.throws(() => S.zeta(1), /s > 1/);
});

test("log-gamma against factorials and Gamma(1/2) = sqrt(pi)", () => {
  near(S.lgamma(10), Math.log(362880), 1e-14);
  near(S.lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-14);
  near(S.lgamma(171), 706.5730622457874, 1e-13);
  near(Math.exp(S.lchoose(50, 3)), 19600, 1e-12);
});

test("incomplete gamma and beta against closed forms", () => {
  near(S.gammaPQ(3, 2).P, 1 - Math.exp(-2) * 5, 1e-14);
  near(S.gammaPQ(1, 7).Q, Math.exp(-7), 1e-14);
  const x = 0.3;
  near(S.ibeta(x, 2, 3), 6 * x * x * (1 - x) ** 2 + 4 * x ** 3 * (1 - x) + x ** 4, 1e-14);
  near(S.ibeta(0.7, 1, 1), 0.7, 1e-14);
  near(S.ibetaInv(S.ibeta(x, 2, 3), 2, 3), x, 1e-12);
});

test("the normal law, the chi-square tail, and the Wilson and Clopper-Pearson intervals", () => {
  near(S.normalQuantile(0.975), 1.959963984540054, 1e-12);
  near(S.normalCdf(-3), 0.0013498980316301, 1e-12);
  near(S.chiSquareSf(3.841458820694124, 1), 0.05, 1e-10);
  const [lo, hi] = S.clopperPearson(0, 100, 0.05);
  assert.equal(lo, 0);
  near(hi, 1 - 0.025 ** (1 / 100), 1e-12);
  near(S.zeroHitBound(100, 0.05), 1 - 0.05 ** (1 / 100), 1e-14);
  assert.ok(Math.abs(S.zeroHitBound(1e6, 0.05) * 1e6 - 3) < 0.01, "the zero-hit bound is about 3/n");
  const [wl, wh] = S.wilson(50, 100, 1.959963984540054);
  near(wl, 0.4038, 1e-3);
  near(wh, 0.5962, 1e-3);
});
