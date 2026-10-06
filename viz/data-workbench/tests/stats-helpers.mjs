// What the engine computes for the statistics (src/statsql.js), written again in plain JavaScript for checks that
// run without it: the reference cases and the calibration on thousands of synthetic tables. The engine tests
// check that the page's SQL gives the same sufficient statistics.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {any} */ const Stats = require("../src/stats.js");

/** Read a number the reference JSON wrote as text (NaN and the infinities). @param {any} v */
export const num = (v) => (v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v);

/** The Pearson correlation of two lists. @param {number[]} x @param {number[]} y */
export function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho: the Pearson correlation of average ranks. */
export const spearmanRho = (/** @type {number[]} */ x, /** @type {number[]} */ y) => pearson(Stats.ranks(x), Stats.ranks(y));

/** A group's n, mean and sample variance. @param {number[]} xs */
export function group(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  return { n, mean, var: xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) };
}

/** Relative and absolute closeness. */
export function close(/** @type {number} */ got, /** @type {number} */ want, rel = 1e-7, abs = 1e-12) {
  if (Number.isNaN(want)) return Number.isNaN(got);
  if (!Number.isFinite(want)) return got === want;
  return Math.abs(got - want) <= Math.max(abs, rel * Math.abs(want));
}
