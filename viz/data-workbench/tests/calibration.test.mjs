// Calibration of the family's tests and the Benjamini–Yekutieli adjustment on synthetic tables, without the engine:
// 3 fixed seeds × 200 tables of 3 measures, 2 categories and a time of 30 periods, so 16 members a family.
//
//   null tables       nothing related to anything: the share of families with any adjusted p-value at or below
//                     0.05 stays within 0.05 plus three binomial standard errors of 200 tables (0.096), and so does
//                     the share of raw p-values at or below 0.05 over every test that ran (0.05 + 3 SE of the tests)
//   planted effects   two members carry a real effect: the false discovery proportion, averaged over the tables,
//                     stays within the same bound, and both effects are found in most tables
//
// Under these assumptions BY keeps the family-wise rate near 1%, so a failure means a miscalibrated test, not
// chance: with a true rate of 5% the chance that 200 tables exceed the bound is below 0.2% per check.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { group, spearmanRho } from "./stats-helpers.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Stats = require("../src/stats.js");
/** @type {any} */ const Family = require("../src/family.js");

const SEEDS = [11, 23, 37];
const TABLES = 200;
const ROWS = 120;
const PERIODS = 30;
const bound = (share, n) => share + 3 * Math.sqrt((share * (1 - share)) / n);

/** One synthetic table's family, measured as the engine would measure it. */
function familyOf(u, effects) {
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const q1 = Array.from({ length: ROWS }, normal);
  const q2 = q1.map((x) => (effects ? 0.45 * x : 0) + normal());
  const q3 = Array.from({ length: ROWS }, () => Math.exp(0.5 * normal()));
  const c1 = Array.from({ length: ROWS }, () => ["a", "b", "c"][Math.floor(u() * 3)]);
  const c2 = Array.from({ length: ROWS }, () => (u() < 0.5 ? "x" : "y"));
  if (effects) c2.forEach((g, i) => { if (g === "y") q3[i] += 0.5; });
  const series = { q1: [], q2: [], q3: [] };
  for (const q of Object.keys(series)) for (let i = 0; i < PERIODS; i++) series[/** @type {"q1"} */ (q)].push({ p: i, n: 4, mean: normal() / 2 });
  const fields = { q1, q2, q3 };
  const groups = (c, q) => [...new Set(c)].sort().map((level) => {
    const xs = q.filter((_, i) => c[i] === level);
    const g = group(xs);
    const s = Stats.sorted(xs), med = Stats.medianOf(s);
    const mad = Stats.medianOf(Stats.sorted(xs.map((x) => Math.abs(x - med))));
    const m3 = xs.reduce((a, x) => a + (x - g.mean) ** 3, 0) / g.n, m2 = xs.reduce((a, x) => a + (x - g.mean) ** 2, 0) / g.n;
    const skew = (Math.sqrt(g.n * (g.n - 1)) / (g.n - 2)) * (m3 / m2 ** 1.5);
    return { level, key: null, ...g, skew, med, mad, far: Math.max(...xs.map((x) => Math.abs(x - med))) };
  });
  const table = (a, b) => {
    const ra = [...new Set(a)].sort(), rb = [...new Set(b)].sort();
    return { table: ra.map((x) => rb.map((y) => a.filter((v, i) => v === x && b[i] === y).length)), rows: ra, cols: rb, merged: [0, 0] };
  };
  const classes = [["q1", "Q"], ["q2", "Q"], ["q3", "Q"], ["c1", "C"], ["c2", "C"], ["t", "T"]].map(([name, cls], position) => ({ name, cls, position }));
  const members = Family.members(classes).map((m) => {
    const id = Family.hypothesisId("synthetic", m.pattern, m.fields);
    const [a, b] = m.fields;
    let measured;
    if (m.pattern === "monotone") measured = { n: ROWS, rho: spearmanRho(fields[a], fields[b]), distinct: [ROWS, ROWS] };
    else if (m.pattern === "difference") measured = { groups: groups(a === "c1" ? c1 : c2, fields[b]) };
    else if (m.pattern === "association") measured = table(c1, c2);
    else measured = { unit: "month", points: series[/** @type {"q1"} */ (b)], periods: PERIODS, unplaced: 0 };
    return { id, key: Family.keyOf(m.pattern, m.fields), pattern: m.pattern, fields: m.fields, measured };
  });
  const fam = { name: "synthetic", run: 1, status: "complete", members, independence: { repeated: [], serial: [], checked: [] }, measures: {} };
  return Family.decide(fam, Family.NO_STUDY);
}

test("null tables: the family-wise share of any adjusted p-value at or below 0.05, and each test's raw rate, stay within their bounds", () => {
  for (const seed of SEEDS) {
    const u = Stats.random(seed);
    let any = 0, tests = 0, raw = 0, m = 0;
    const byTest = {};
    for (let i = 0; i < TABLES; i++) {
      const fam = familyOf(u, false);
      assert.equal(fam.members.length, 16, "C(3,2) + 3·2 + C(2,2) + 2·1·3 members");
      if (fam.flagged > 0) any += 1;
      m += fam.m;
      for (const x of fam.members.filter((y) => y.status === "tested")) {
        tests += 1;
        if (x.p <= 0.05) raw += 1;
        byTest[x.test] = byTest[x.test] ?? { n: 0, low: 0 };
        byTest[x.test].n += 1;
        if (x.p <= 0.05) byTest[x.test].low += 1;
      }
    }
    assert.ok(m / TABLES >= 12, `seed ${seed}: most members are tested (${m / TABLES} a family)`);
    assert.ok(any / TABLES <= bound(0.05, TABLES), `seed ${seed}: ${any} of ${TABLES} null families flag a member`);
    assert.ok(raw / tests <= bound(0.05, tests), `seed ${seed}: ${raw} of ${tests} raw p-values at or below 0.05`);
    for (const [t, c] of Object.entries(byTest)) assert.ok(c.low / c.n <= bound(0.05, c.n), `seed ${seed}: ${t} gives ${c.low} of ${c.n} raw p-values at or below 0.05`);
  }
});

test("planted effects: the false discovery proportion stays within the bound, and both effects are found", () => {
  for (const seed of SEEDS) {
    const u = Stats.random(seed * 1000 + 1);
    let fdp = 0, found = 0;
    for (let i = 0; i < TABLES; i++) {
      const fam = familyOf(u, true);
      const real = (m) => (m.pattern === "monotone" && m.fields.join() === "q1,q2") || (m.pattern === "difference" && m.fields.join() === "c2,q3");
      const flagged = fam.members.filter((m) => m.flag);
      const wrong = flagged.filter((m) => !real(m)).length;
      fdp += flagged.length ? wrong / flagged.length : 0;
      found += flagged.filter(real).length;
    }
    assert.ok(fdp / TABLES <= bound(0.05, TABLES), `seed ${seed}: mean false discovery proportion ${fdp / TABLES}`);
    assert.ok(found / (2 * TABLES) >= 0.8, `seed ${seed}: ${found} of ${2 * TABLES} planted effects found`);
  }
});
