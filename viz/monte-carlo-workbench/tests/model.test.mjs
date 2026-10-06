// What the page derives from its state: parameter settings, the histogram window of the focus variable, the
// reference law for each plot kind, the dependency graph, and the plots drawn from them.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { L, M, P, data } from "./helpers.mjs";

const VisualKit = createRequire(import.meta.url)("../../../scripts/kit/kit.js");
const base = VisualKit.defaults(M.FIELDS);
/** @param {Record<string, any>} patch */
const derive = (patch) => M.derive({ ...base, ...patch }, data);

test("parameter settings: parse, format and apply, with an error for a bad entry", () => {
  const p = M.parseParams("tickets=190; w=[0.2, 0.8] ; bad");
  assert.deepEqual(p.overrides, { tickets: "190", w: "[0.2, 0.8]" });
  assert.equal(p.errors.length, 1);
  const d = derive({ params: "tickets=200" });
  assert.equal(d.ok, true);
  assert.equal(d.parameters.find((/** @type {any} */ x) => x.name === "tickets").expr, "200");
  assert.ok(d.references.every((/** @type {any} */ r) => r.values[1] > 0.9), "200 tickets for every alternative: bumping is likely");
  assert.equal(derive({ params: "nosuch=1" }).ok, false);
});

test("the focus window holds almost all the mass of each alternative, in at most 400 bins", () => {
  for (const id of M.EXPERIMENTS.concat(["binomial-overbooking", "zipf-cache", "multinomial-poll"])) {
    const d = derive({ model: id });
    const w = d.focus.window;
    assert.ok(w.bins >= 1 && w.bins <= 400, `${id}: ${w.bins} bins`);
    if (d.focus.theory && !d.focus.heavy) {
      const pmf = derive({ model: id, plot: "pmf" }).focus.theory;
      // A continuous window starts at the 10^-4 quantile (0.005 for a heavy tail): the CDF at its right end is the test.
      const mass = d.focus.continuous ? derive({ model: id, plot: "cdf" }).focus.theory.y[w.bins - 1] : pmf.y.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
      assert.ok(mass > 1 - (d.focus.continuous ? 2e-4 : 1e-5), `${id}: the window holds mass ${mass}`);
    }
  }
});

test("the reference law in each plot kind: a CDF rises to 1, the survival function falls, the quantile function rises", () => {
  for (const id of ["exp-poisson", "exp-geometric", "exp-uniform", "zipf-cascade"]) {
    const cdf = derive({ model: id, plot: "cdf" }).focus.theory, sf = derive({ model: id, plot: "survival" }).focus.theory, q = derive({ model: id, plot: "quantile" }).focus.theory;
    for (let i = 1; i < cdf.y.length; i++) assert.ok(cdf.y[i] >= cdf.y[i - 1] - 1e-12, `${id} CDF`);
    for (let i = 1; i < sf.y.length; i++) assert.ok(sf.y[i] <= sf.y[i - 1] + 1e-12, `${id} survival`);
    for (let i = 1; i < q.y.length; i++) assert.ok(q.y[i] >= q.y[i - 1], `${id} quantile`);
  }
  const z = derive({ model: "zipf-cascade", plot: "survival" });
  assert.ok(z.focus.window.thresholds.includes(1e6), "the zeta survival plot reaches 10^6 through thresholds");
  assert.ok(Math.abs(z.focus.theory.y.at(-1) - L.BY_ID.zipf.sf(1e15, { s: 2.3, N: Infinity })) < 1e-20);
});

test("the dependency graph has an edge from each name to each name that reads it", () => {
  const g = derive({ model: "bernoulli-screening" }).graph;
  const has = (/** @type {string} */ a, /** @type {string} */ b) => g.edges.some((/** @type {[string, string]} */ e) => e[0] === a && e[1] === b);
  assert.ok(has("D", "T") && has("sens", "T") && has("T", "treat") && has("loss", "q:cost"));
  assert.ok(!has("T", "D"));
  const svg = P.graph(g);
  assert.match(svg, /^<svg class="chart graph"/);
  assert.equal((svg.match(/<g class="node /g) ?? []).length, g.nodes.length);
});

test("the plots draw no NaN, Infinity or undefined, also with no data, one point or a log axis at 0", () => {
  const bad = /NaN|Infinity|undefined/;
  const outs = [
    P.distribution({ kind: "pmf", ylog: false, xlabel: "X", theory: null, empirical: null, n: 0 }),
    P.distribution({ kind: "survival", ylog: true, xlabel: "X", theory: { x: [0, 1, 2], y: [1, 0, 0] }, empirical: { x: [0, 1, 2], y: [0.5, 0, 0] }, n: 10 }),
    P.distribution({ kind: "quantile", ylog: false, xlabel: "X", theory: { x: [0.5], y: [3] }, empirical: null, n: 0 }),
    P.convergence({ trace: [], reference: null, ylabel: "q" }),
    P.convergence({ trace: [{ n: 1024, est: 5, lo: 5, hi: 5 }], reference: 5, ylabel: "q" }),
    P.convergence({ trace: [{ n: 1024, est: 0, lo: null, hi: null }, { n: 2048, est: 3, lo: null, hi: null }], reference: null, ylabel: "q", ylog: true }),
    P.comparison({ rows: [{ label: "a", est: 1, lo: 0.9, hi: 1.1, reference: 1 }, { label: "b", est: null, lo: null, hi: null }], ylabel: "q" }),
    P.sweep({ x: [0, 1, 2], est: [1, null, 3], lo: [0, null, 2], hi: [2, null, 4], ref: [1, 2, 3], xlabel: "p", ylabel: "q" }),
  ];
  for (const svg of outs) {
    assert.doesNotMatch(svg, bad);
    assert.match(svg, /role="img" aria-label="[^"]+"/);
  }
  assert.equal(P.fmt(Infinity), "∞");
  const t = P.ticks(0, 1, 5);
  assert.equal(t.length, 6);
  assert.ok(t[0] === 0 && Math.abs(t[5] - 1) < 1e-12);
  assert.deepEqual(P.logTicks(1024, 65536), [2000, 5000, 10000, 20000, 50000]);
  assert.equal(P.tickLabel(36000.5, 0.5), "36000.5");
});
