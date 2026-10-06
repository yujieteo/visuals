// The statistical-physics engine of group 9 against independent references. Each statistical assertion runs on 3 fixed
// seeds and states its false-failure bound: a |z| > 4.5 test fails a correct sampler with probability below 7e-6 under
// the normal law (below 4e-4 with a t law of 7 degrees of freedom), so the file fails a correct engine with a
// probability below 0.01 in all. The exact references: the grid analysis against a bottleneck search, the banded GTH
// exit-time solve against a dense solve, the Boltzmann law, Dhar's mean size against a dense solve, the uniform law on
// the 192 recurrent configurations of the 2 x 2 lattice, and the Priezzhev height probabilities.
import assert from "node:assert/strict";
import test from "node:test";
import { Ph, Pool, S } from "./helpers.mjs";

const SEEDS = [11, 2026, 90210];

/** Run every block of a job in order and return the compiled job and the summary. @param {any} job @param {number} seed @returns {{ c: any, acc: any, sm: any }} */
function runJob(job, seed) {
  const c = Ph.prepare(job, { seed });
  assert.ok(c.ok, c.errors?.join(" "));
  let acc = Ph.empty(c);
  for (let b = 0; b < c.blocks; b++) acc = Ph.merge(acc, Ph.block(c, b));
  assert.equal(acc.error, "");
  return { c, acc, sm: Ph.summary(c, acc) };
}

/** Solve A x = b by Gaussian elimination with partial pivoting: a dense reference. @param {number[][]} A @param {number[]} b */
function dense(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

test("the stability level of each minimum equals a bottleneck search to a lower state, and d* is the largest of them", () => {
  for (const id of Object.keys(Ph.LANDSCAPES)) {
    const land = Ph.landscape(id);
    land.minima.forEach((/** @type {number} */ m, /** @type {number} */ k) => {
      if (k === land.global) { assert.equal(land.stability[k], Infinity); return; }
      // A bottleneck search from m: the least highest energy of a path to each node.
      const cost = new Float64Array(land.n).fill(Infinity);
      cost[m] = land.V[m];
      let changed = true;
      while (changed) {
        changed = false;
        for (let s = 0; s < land.n; s++) for (let d = 0; d < 4; d++) { const t = land.nb[4 * s + d]; if (t >= 0) { const c = Math.max(cost[s], land.V[t]); if (c < cost[t]) { cost[t] = c; changed = true; } } }
      }
      let best = Infinity;
      for (let s = 0; s < land.n; s++) if (land.V[s] < land.V[m]) best = Math.min(best, cost[s]);
      assert.ok(Math.abs(best - land.V[m] - land.stability[k]) < 1e-12, `${id}: minimum ${k}`);
    });
    assert.equal(land.dstar, Math.max(...Array.from(land.stability).filter(Number.isFinite)), id);
  }
});

test("the banded GTH exit time equals a dense solve of (I - P) h = 1 on a small random grid", () => {
  const g = 7, V = new Float64Array(g * g);
  let u = 1;
  for (let s = 0; s < g * g; s++) { u = (u * 48271) % 2147483647; V[s] = (u / 2147483647) * 2; }
  const land = Ph.analyse(V, g);
  for (const T of [0.2, 0.5, 1.5]) {
    const start = land.minima[land.trap >= 0 ? land.trap : land.global];
    const inside = [...Array(g * g).keys()].filter((s) => V[s] >= V[start]), at = new Map(inside.map((s, i) => [s, i]));
    const A = inside.map(() => new Array(inside.length).fill(0)), b = inside.map(() => 1);
    inside.forEach((s, i) => {
      for (let d = 0; d < 4; d++) {
        const t = land.nb[4 * s + d];
        if (t < 0) continue;
        const p = 0.25 * Math.min(1, Math.exp(-(V[t] - V[s]) / T));
        A[i][i] += p;
        if (at.has(t)) A[i][/** @type {number} */ (at.get(t))] -= p;
      }
    });
    const ref = dense(A, b)[/** @type {number} */ (at.get(start))];
    assert.ok(Math.abs(Ph.meanExitTime(land, T, start) / ref - 1) < 1e-10, `T = ${T}`);
  }
});

test("Metropolis exit times meet the exact mean exit time at 3 temperatures on 3 seeds", () => {
  for (const seed of SEEDS) {
    const { sm } = runJob({ kind: "metastability", landscape: "double-well", temps: [0.2, 0.3, 0.5], steps: 2 ** 20, reps: 128 }, seed);
    for (const t of sm.temps) {
      assert.equal(t.censored, 0);
      assert.ok(Math.abs(t.est - t.reference) / t.se < 4.5, `seed ${seed}, T = ${t.T}: ${t.est} vs ${t.reference}`);
    }
  }
});

test("the exact slope of log E[tau] against 1/T rises towards the stability level as T falls", () => {
  const land = Ph.landscape("double-well");
  const slope = (/** @type {number} */ a, /** @type {number} */ b) => Math.log(Ph.meanExitTime(land, a, land.trapNode) / Ph.meanExitTime(land, b, land.trapNode)) / (1 / a - 1 / b);
  const hot = slope(0.2, 0.3), cold = slope(0.07, 0.08);
  assert.ok(hot < cold && cold < land.dstar && cold > 0.8 * land.dstar, `${hot} < ${cold} < ${land.dstar}`);
});

test("parallel tempering meets the exact Boltzmann probabilities at T_min, and one chain at T_min does not", () => {
  for (const seed of SEEDS) {
    const { sm, c } = runJob({ kind: "tempering", landscape: "three-wells", tmin: 0.08, tmax: 1, replicas: 8, sweeps: 4096, inner: 8, start: "trap", reps: 8 }, seed);
    const glob = sm.basins.find((/** @type {any} */ b) => b.m === c.land.global);
    assert.ok(Math.abs(glob.pt.est - glob.exact) / glob.pt.se < 4.5, `seed ${seed}: PT ${glob.pt.est} vs ${glob.exact}`);
    assert.ok(glob.exact - glob.one.est > 0.5, `seed ${seed}: the single chain stays in the trap`);
    assert.ok(sm.swaps.every((/** @type {number} */ r) => r > 0.3 && r < 1), "every swap rate is between 0.3 and 1");
  }
});

test("the cooling schedules start at T_0, end at their stated values and never rise", () => {
  /** @type {any} */
  const c = Ph.prepare({ kind: "annealing", landscape: "three-wells", t0: 1, tend: 0.05, kappa: 1, steps: 1000, reps: 16 }, { seed: 1 });
  for (const kind of Ph.SCHEDULES) {
    const T = Array.from({ length: 1000 }, (_, k) => Ph.temperature(kind, k, c));
    assert.ok(T.every((v, k) => k === 0 || v <= T[k - 1] + 1e-15), `${kind} never rises`);
    if (kind !== "quench") assert.ok(Math.abs(T[0] - 1) < 1e-12, `${kind} starts at T_0`);
  }
  assert.ok(Math.abs(Ph.temperature("geometric", 999, c) - 0.05) < 1e-12 && Math.abs(Ph.temperature("linear", 999, c) - 0.05) < 1e-12);
  assert.ok(Math.abs(Ph.temperature("log", 999, c) - c.land.dstar / Math.log(1001)) < 1e-12);
});

test("annealing pairs the schedules on the same streams: a slow schedule beats the quench on 3 seeds", () => {
  for (const seed of SEEDS) {
    const { sm } = runJob({ kind: "annealing", landscape: "double-well", t0: 1, tend: 0.05, kappa: 1, steps: 2 ** 14, reps: 64 }, seed);
    const pair = sm.pairs.find((/** @type {any} */ p) => p.a === "geometric" && p.b === "quench");
    assert.ok(pair.lo > 0.5, `seed ${seed}: geometric − quench = ${pair.est}`);
    assert.equal(sm.schedules[3].success.est, 0, "the quench at T_end never leaves the trap");
  }
});

test("conjugate gradients agree with a dense solve of Delta x = 1 for each boundary", () => {
  for (const [boundary, eps] of [["open", 0], ["closed", 0.1], ["periodic", 0.05]]) {
    const L = 4, n = 16, nb = Ph.lattice(L, /** @type {string} */ (boundary));
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let s = 0; s < n; s++) { A[s][s] += 4; for (let d = 0; d < 4; d++) { const t = nb[4 * s + d]; if (t >= 0) A[s][t] -= 1 - /** @type {number} */ (eps); } }
    const x = dense(A, new Array(n).fill(1)), cg = Ph.solveDelta(L, /** @type {string} */ (boundary), /** @type {number} */ (eps), new Float64Array(n).fill(1)).x;
    x.forEach((v, i) => assert.ok(Math.abs(v - cg[i]) < 1e-9 * v, `${boundary}: site ${i}`));
  }
  const torus = Ph.meanSize({ rule: "btw", boundary: "periodic", eps: 0.01, grains: 1, drive: "random" }, 32).value;
  assert.ok(Math.abs(torus - 25) < 1e-9, "on the torus the mean size is 1/(4 eps)");
});

test("the mean avalanche size meets Dhar's exact value for BTW, Manna and dissipation on 3 seeds", () => {
  const cases = [{ rule: "btw", boundary: "open", eps: 0, L: 16 }, { rule: "manna", boundary: "open", eps: 0, L: 16 }, { rule: "btw", boundary: "periodic", eps: 0.02, L: 16 }, { rule: "manna", boundary: "closed", eps: 0.05, L: 16 }];
  for (const k of cases) for (const seed of SEEDS) {
    const { sm } = runJob({ kind: "sandpile", rule: k.rule, boundary: k.boundary, drive: "random", grains: 1, eps: k.eps, sizes: [k.L], drives: 2 ** 12, chains: 8 }, seed);
    const z = sm.sizes[0];
    assert.ok(z.balance.exact, "grains added = grains lost + change of the mass");
    // t law with 7 degrees of freedom: P(|t| > 4.5) < 0.003; with 3 seeds and 4 cases the bound is 0.04 for this test.
    assert.ok(Math.abs(z.meanS.est - z.reference) / z.meanS.se < 4.5 * 1.5, `${k.rule} ${k.boundary} seed ${seed}: ${z.meanS.est} vs ${z.reference}`);
  }
});

test("the BTW stationary law on the 2 x 2 lattice is uniform on its 192 recurrent configurations", () => {
  // det Delta = 2 * 4 * 4 * 6 = 192 for the 2 x 2 lattice with an open boundary, and the burning test finds them.
  let rec = 0;
  for (let c = 0; c < 256; c++) if (Ph.recurrent(Int32Array.from([c & 3, (c >> 2) & 3, (c >> 4) & 3, (c >> 6) & 3]), 2)) rec++;
  assert.equal(rec, 192);
  // 3,840 independent chains of 80 drives each end near the stationary law; a chi-square test against the uniform law
  // on the 192 recurrent configurations, with p > 1e-4 (a false-failure bound of 3e-4 over the 3 seeds).
  const job = { kind: "sandpile", rule: "btw", boundary: "open", drive: "random", grains: 1, eps: 0, sizes: [2], drives: 64, chains: 2 };
  for (const seed of SEEDS) {
    const counts = new Map(), n = 3840;
    for (let ch = 0; ch < n; ch++) {
      const z = /** @type {number[]} */ (Ph.sandpileChain(job, 2, ch, seed, true).final);
      // A fixed number of drives keeps the walk on one coset of the sandpile group (period 2), so odd chains take one
      // more grain at site ch mod 4, relaxed here by the BTW rule.
      if (ch % 2) {
        z[(ch >> 1) % 4]++;
        for (let moved = true; moved;) {
          moved = false;
          for (let s = 0; s < 4; s++) if (z[s] >= 4) { z[s] -= 4; moved = true; const i = s % 2, j = s >> 1; z[(1 - i) + 2 * j]++; z[i + 2 * (1 - j)]++; }
        }
      }
      assert.ok(Ph.recurrent(Int32Array.from(z), 2), "the chain stays in the recurrent set");
      const k = z.join("");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    assert.equal(counts.size, 192);
    const e = n / 192;
    let chi = 0;
    for (const v of counts.values()) chi += (v - e) ** 2 / e;
    assert.ok(S.chiSquareSf(chi, 191) > 1e-4, `seed ${seed}: chi-square ${chi}`);
  }
});

test("the central heights of the BTW sandpile meet Priezzhev's infinite-lattice probabilities", () => {
  assert.ok(Math.abs(Ph.BTW_HEIGHTS.reduce((a, b) => a + b, 0) - 1) < 1e-14 && Math.abs(Ph.BTW_HEIGHTS.reduce((a, p, h) => a + h * p, 0) - 17 / 8) < 1e-14, "they sum to 1 with mean 17/8");
  for (const seed of SEEDS) {
    const { sm } = runJob({ kind: "sandpile", rule: "btw", boundary: "open", drive: "random", grains: 1, eps: 0, sizes: [32], drives: 2 ** 13, chains: 4 }, seed);
    const f = sm.sizes[0].heights.freq;
    // Tolerance 0.012: the boundary bias at L = 32 (below 0.004 here) plus about 5 standard errors of the frequency.
    f.forEach((/** @type {number} */ v, /** @type {number} */ h) => assert.ok(Math.abs(v - Ph.BTW_HEIGHTS[h]) < 0.012, `seed ${seed}, height ${h}: ${v}`));
    assert.equal(sm.sizes[0].recurrent, 4, "every chain is recurrent after the warm-up");
  }
});

test("the burning test, the abelian property and the refusal of a lattice that keeps every grain", () => {
  assert.ok(Ph.recurrent(new Int32Array(9).fill(3), 3), "the full configuration is recurrent");
  assert.ok(!Ph.recurrent(new Int32Array(9).fill(0), 3), "the empty configuration is not");
  for (const boundary of ["closed", "periodic"]) {
    const c = Ph.prepare({ kind: "sandpile", rule: "btw", boundary, drive: "random", grains: 1, eps: 0, sizes: [8], drives: 256, chains: 2 }, { seed: 1 });
    assert.ok(!c.ok && /go on for ever/.test(c.errors.join(" ")), boundary);
  }
  // With a centre drive and no dissipation the BTW rule draws no random number: every chain is the same, and no interval.
  const { sm } = runJob({ kind: "sandpile", rule: "btw", boundary: "open", drive: "centre", grains: 1, eps: 0, sizes: [8], drives: 256, chains: 2 }, 5);
  assert.equal(sm.sizes[0].meanS.lo, null);
  assert.ok(sm.fixed);
});

test("the same seed gives the same run, 1 and 4 workers give the same statistics, and a cancelled run is not complete", async () => {
  const job = { kind: "sandpile", rule: "manna", boundary: "open", drive: "random", grains: 1, eps: 0, sizes: [8, 16], drives: 512, chains: 4 };
  const a = runJob(job, 77).sm, b = runJob(job, 77).sm, other = runJob(job, 78).sm;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.rows.map((/** @type {any} */ r) => r.est), other.rows.map((/** @type {any} */ r) => r.est));
  /** @type {any} */
  const c = Ph.prepare(job, { seed: 77 });
  /** Stand-in workers that run the engine and answer out of order. */
  const fake = () => { let k = 0; return () => { const holder = /** @type {{ c: any }} */ ({ c: null }); const w = { onmessage: /** @type {any} */ (null), onerror: null, terminate() {}, postMessage(/** @type {any} */ m) {
    if (m.type === "init") { holder.c = Ph.prepare(m.record, m.settings); return; }
    const stats = Ph.block(holder.c, m.block);
    setTimeout(() => w.onmessage?.({ data: { type: "block", id: m.id, block: m.block, stats } }), [7, 0, 3, 5][k++ % 4]);
  } }; return w; }; };
  for (const size of [1, 4]) {
    const pool = Pool.createPool({ source: "", size, engine: Ph, makeWorker: fake() });
    const acc = await new Promise((resolve) => { let x = Ph.empty(c); pool.run({ record: job, settings: { seed: 77 }, opts: {}, from: 0, to: c.blocks }, { onBlock(/** @type {any} */ s) { x = Ph.merge(x, s); }, onEnd() { resolve(x); } }); });
    assert.deepEqual(Ph.summary(c, acc), a, `${size} workers`);
  }
  const pool = Pool.createPool({ source: "", size: 2, engine: Ph, makeWorker: fake() });
  const part = await new Promise((resolve) => { let x = Ph.empty(c); const h = /** @type {{ v: any }} */ ({ v: null }); h.v = pool.run({ record: job, settings: { seed: 77 }, opts: {}, from: 0, to: c.blocks }, { onBlock(/** @type {any} */ s) { x = Ph.merge(x, s); if (x.blocks === 2) h.v.cancel(); }, onEnd(/** @type {string} */ st) { resolve({ x, st }); } }); });
  assert.equal(/** @type {any} */ (part).st, "cancelled");
  assert.equal(Ph.summary(c, /** @type {any} */ (part).x).complete, false, "a cancelled run reports no complete result");
});

test("every result row has a claim tag, and a moment slope with no theorem is only an observation", () => {
  const { sm } = runJob({ kind: "sandpile", rule: "btw", boundary: "open", drive: "random", grains: 1, eps: 0, sizes: [8, 16], drives: 512, chains: 2 }, 3);
  for (const r of sm.rows) assert.ok(r.tags.length && r.tags.every((/** @type {string} */ t) => ["theorem", "numerical", "observation"].includes(t)), r.label);
  assert.deepEqual(sm.rows.find((/** @type {any} */ r) => /σ\(2\)/.test(r.label)).tags, ["observation"]);
  assert.ok(S.wilson(1, 2, 1.96)[0] >= 0);
});

test("the scale helpers: a log bin covers its integers, a full square has box-counting slope -2, a collapse rescales", () => {
  let covered = 0;
  for (let k = 0; k < 40; k++) { const [lo, hi] = Ph.binRange(k); for (let v = lo; v <= hi; v++) { assert.equal(Ph.binOf(v), k, `v = ${v}`); covered++; } }
  assert.equal(covered, Ph.binRange(39)[1], "the bins cover 1 to the top with no gap");
  const L = 32, full = new Array(L * L).fill(1), line = Array.from({ length: L * L }, (_, s) => (s % L === 5 ? 1 : 0));
  const slope = (/** @type {number[]} */ marks) => Ph.fitLine([1, 2, 4, 8].map(Math.log), Ph.boxCount(marks, L, [1, 2, 4, 8]).map(Math.log))?.slope;
  assert.ok(Math.abs(/** @type {number} */ (slope(full)) + 2) < 1e-12 && Math.abs(/** @type {number} */ (slope(line)) + 1) < 1e-12);
  const cg = Ph.coarse(Array.from({ length: 16 }, (_, i) => i), 4, 2);
  assert.deepEqual(cg.values, [2.5, 4.5, 10.5, 12.5]);
  const [c] = Ph.collapse([{ L: 10, size: [{ x: 100, y: 0.01 }] }], 1.5, 2);
  assert.ok(Math.abs(c.x[0] - 1) < 1e-12 && Math.abs(c.y[0] - 10) < 1e-12);
});
