/* Monte Carlo Probability Workbench: multilevel Monte Carlo (Giles, Operations Research 56, 2008; Acta Numerica 24,
 * 2015). A model is ready for it when it has the parameters steps and coarsen, and its process variables read them.
 * Level 0 runs the model with steps = n0. Level l ≥ 1 runs two alternatives on the same streams: the fine path with
 * steps = n0·2^l and coarsen = 1, and the coarse path with steps = n0·2^(l−1) and coarsen = 2, which adds the fine
 * Brownian increments in pairs. The engine's paired difference of the two is the level correction Y_l = P_l − P_(l−1).
 * Each level has its own seed, so the levels are independent. The functions here are pure: a state machine that
 * names the next range of blocks to run, takes the merged statistics of each level, sets the sample sizes N_l that
 * minimise the cost for a target root mean square error ε, and tests the weak convergence. The page runs the jobs
 * with its worker pool; the tests run them with the engine.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCMultilevel = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const BLOCK = 1024, Z95 = 1.959963984540054, GOLDEN = 0x9e3779b9;

  /** True when a model record can run on levels: it has the parameters steps and coarsen. @param {any} rec */
  const ready = (rec) => ["steps", "coarsen"].every((n) => (rec?.parameters ?? []).some((/** @type {any} */ p) => p.name === n));

  /** The seed of level l: the run's seed plus (l + 1) times 2654435769, modulo 2^32. @param {number} seed @param {number} l */
  const levelSeed = (seed, l) => (seed + Math.imul(l + 1, GOLDEN)) >>> 0;

  /**
   * The record of level l: the alternative `alt` of the model, as one alternative at level 0 and as the fine and the
   * coarse alternatives at level l ≥ 1.
   * @param {any} rec @param {number} l @param {number} n0 @param {number} alt
   */
  function levelRecord(rec, l, n0, alt) {
    const base = { ...(rec.alternatives?.[alt]?.set ?? {}) };
    delete base.steps;
    delete base.coarsen;
    const alternatives = l === 0 ? [{ label: "Level 0", set: { ...base, steps: String(n0), coarsen: "1" } }]
      : [{ label: `Level ${l}, fine`, set: { ...base, steps: String(n0 * 2 ** l), coarsen: "1" } }, { label: `Level ${l}, coarse`, set: { ...base, steps: String(n0 * 2 ** (l - 1)), coarsen: "2" } }];
    return { ...rec, alternatives, decision: { objective: null, constraints: [] } };
  }

  /** The cost of one sample of level l, in path steps: the fine path, plus the coarse path above level 0. @param {number} l @param {number} n0 */
  const cost = (l, n0) => n0 * 2 ** l + (l > 0 ? n0 * 2 ** (l - 1) : 0);

  /**
   * The statistics of level l for quantity k from merged engine statistics: the mean and variance of Y_l, and of the
   * fine value P_l alone.
   * @param {any} accum @param {number} l @param {number} k
   */
  function fromAccum(accum, l, k) {
    const m = accum.methods[0], fine = m.acc[0][k], n = fine.n;
    const fv = n > 1 ? fine.m2 / (n - 1) : 0;
    if (l === 0) return { n, mean: fine.mean, var: fv, fineMean: fine.mean, fineVar: fv };
    // The engine's pair is (fine, coarse) and its difference is coarse − fine.
    const d = m.diffs[0][k];
    return { n: d.n, mean: -d.mean, var: d.n > 1 ? d.m2 / (d.n - 1) : 0, fineMean: fine.mean, fineVar: fv };
  }

  /**
   * A new multilevel run: levels 0, 1 and 2 with `initial` blocks each.
   * @param {{ eps: number, maxLevel: number, initial: number, n0: number }} o
   */
  function start(o) {
    return { eps: o.eps, maxLevel: o.maxLevel, initial: o.initial, n0: o.n0, levels: [0, 1, 2].map((l) => ({ l, blocks: 0, target: o.initial, cost: cost(l, o.n0), stats: /** @type {any} */ (null) })), done: false, converged: false, alpha: null, beta: null, message: "" };
  }

  /** The next range of blocks to run, or null. @param {any} st */
  function nextJob(st) {
    if (st.done) return null;
    const lv = st.levels.find((/** @type {any} */ x) => x.blocks < x.target);
    return lv ? { level: lv.l, from: lv.blocks, to: lv.target } : null;
  }

  /**
   * The slope of log2 y against the level, by least squares over the levels ≥ 1 with y > 0.
   * @param {{ l: number, y: number }[]} pts
   */
  function slope(pts) {
    const p = pts.filter((x) => x.l >= 1 && x.y > 0).map((x) => ({ x: x.l, y: Math.log2(x.y) }));
    if (p.length < 2) return null;
    const mx = p.reduce((s, q) => s + q.x, 0) / p.length, my = p.reduce((s, q) => s + q.y, 0) / p.length;
    const sxx = p.reduce((s, q) => s + (q.x - mx) ** 2, 0);
    return sxx > 0 ? p.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0) / sxx : null;
  }

  /**
   * Record the statistics of a finished job, then, when no level waits for blocks: set the sample sizes
   * N_l = ⌈2 ε⁻² √(V_l / C_l) Σ √(V_j C_j)⌉ (in whole blocks, never below the blocks run); if no level needs more,
   * test the weak convergence max(|Y_(L−1)|/2^α, |Y_L|) < (2^α − 1) ε/√2 and add a level or stop.
   * @param {any} st @param {number} l @param {number} to @param {any} stats
   */
  function afterJob(st, l, to, stats) {
    const lv = st.levels[l];
    lv.blocks = to;
    lv.stats = stats;
    if (nextJob(st)) return st;
    const sum = st.levels.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + Math.sqrt(Math.max(0, x.stats.var) * x.cost), 0);
    let more = false;
    for (const x of st.levels) {
      const N = sum > 0 ? Math.ceil((2 / (st.eps * st.eps)) * Math.sqrt(Math.max(0, x.stats.var) / x.cost) * sum) : 0;
      const target = Math.max(x.blocks, Math.ceil(N / BLOCK));
      if (target > x.blocks) { x.target = target; more = true; }
    }
    const pts = st.levels.map((/** @type {any} */ x) => ({ l: x.l, y: Math.abs(x.stats.mean) })), s = slope(pts), sv = slope(st.levels.map((/** @type {any} */ x) => ({ l: x.l, y: x.stats.var })));
    st.alpha = Math.max(0.5, s === null ? 0.5 : -s);
    st.beta = sv === null ? null : -sv;
    if (more) return st;
    const L = st.levels.length - 1, a = st.alpha, YL = Math.abs(st.levels[L].stats.mean), YL1 = Math.abs(st.levels[L - 1].stats.mean);
    const bias = Math.max(YL1 / 2 ** a, YL) / (2 ** a - 1);
    if (bias < st.eps / Math.SQRT2) { st.done = true; st.converged = true; return st; }
    if (L >= st.maxLevel) { st.done = true; st.message = `The bias test failed at the largest level L = ${L}: the bias estimate ${bias.toPrecision(3)} is above ε/√2 = ${(st.eps / Math.SQRT2).toPrecision(3)}.`; return st; }
    const n = st.levels.length;
    st.levels.push({ l: n, blocks: 0, target: st.initial, cost: cost(n, st.n0), stats: null });
    return st;
  }

  /**
   * The result: the estimate Σ Y_l with its Monte Carlo standard error √(Σ V_l / N_l), kept apart from the bias
   * estimate of the finest level; the cost; and the cost of plain Monte Carlo on the finest level with the same
   * Monte Carlo variance.
   * @param {any} st
   */
  function summary(st) {
    const done = st.levels.filter((/** @type {any} */ x) => x.stats);
    if (!done.length) return null;
    const est = done.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.stats.mean, 0);
    const v = done.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + (x.stats.n ? x.stats.var / x.stats.n : 0), 0), se = Math.sqrt(v);
    const L = done.length - 1, a = st.alpha ?? 0.5, top = done[L].stats;
    const bias = L >= 1 ? Math.max(Math.abs(done[L - 1].stats.mean) / 2 ** a, Math.abs(top.mean)) / (2 ** a - 1) : null;
    const work = done.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.stats.n * x.cost, 0);
    const plainN = v > 0 ? top.fineVar / v : null, plainWork = plainN === null ? null : plainN * st.n0 * 2 ** L;
    return { est, se, lo: est - Z95 * se, hi: est + Z95 * se, bias, rmse: Math.sqrt(v + (bias ?? 0) ** 2), work, plainWork, ratio: plainWork === null ? null : plainWork / work, L, alpha: st.alpha, beta: st.beta,
      levels: done.map((/** @type {any} */ x) => ({ l: x.l, steps: st.n0 * 2 ** x.l, n: x.stats.n, mean: x.stats.mean, var: x.stats.var, cost: x.cost, fineMean: x.stats.fineMean, fineVar: x.stats.fineVar })) };
  }

  return { BLOCK, ready, levelSeed, levelRecord, cost, fromAccum, start, nextJob, afterJob, summary, slope };
});
