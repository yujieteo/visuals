// Group 8's engine: the normal quantile, the Sobol points and their scramble, the resampling schemes, the weight
// accounting of the particle filter and of the sequential sampler, each sampler against an independent reference
// with several fixed seeds, the Markov-chain diagnostics on cases with a known answer, and determinism: the same
// seed gives the same runs, 1 and 4 workers give the same summary, and a paused run is not complete.
//
// Statistical assertions: an estimate from R = 16 independent runs must lie within 5 standard errors of the exact or
// numerical reference. Under the t law with 15 degrees of freedom, one such assertion fails by chance with a
// probability below 2e-4, so the at most 60 statistical assertions of this file fail together with a probability
// below 0.012 (Bonferroni). The seeds are fixed, so a run of the file is deterministic.
import assert from "node:assert/strict";
import test from "node:test";
import { Ch, Pool, Rng, S, data } from "./helpers.mjs";

const K = 5;
/** @param {string} id */
const example = (id) => data.chains.examples.find((/** @type {any} */ x) => x.id === id);

/**
 * Run an example R times with a seed and settings and return the compiled job, the reference and the summary.
 * @param {string} id @param {Record<string, any>} settings @param {number} seed @param {string} [params]
 */
function runExample(id, settings, seed, params = "") {
  const { record, errors } = Ch.recordOf(example(id), params, data.datasets);
  assert.deepEqual(errors, []);
  const c = Ch.prepare(record, { seed, compare: "none", size: 10, runs: 16, ...settings });
  assert.ok(c.ok, c.errors?.join(" "));
  const ref = Ch.reference(record);
  let acc = Ch.empty(c);
  for (let b = 0; b < /** @type {any} */ (c).settings.runs; b++) acc = Ch.merge(acc, Ch.block(c, b, { reference: ref }));
  assert.equal(acc.error, "");
  return { c, ref, acc, sm: /** @type {any} */ (Ch.summary(c, acc, ref)) };
}

/** Each estimate within K standard errors of its reference. @param {any} m @param {string} what */
function near(m, what) {
  for (const q of m.quantities) {
    if (q.est === null) continue;
    assert.ok(q.se !== null && q.se > 0, `${what} ${q.id}: a spread`);
    assert.ok(Math.abs(q.est - q.reference) <= K * q.se, `${what} ${q.id}: ${q.est} against ${q.reference}, standard error ${q.se}`);
  }
}

test("AS 241 agrees with the bisection of special.js to 1e-13, and the quantile is odd", () => {
  for (const p of [1e-300, 1e-100, 1e-20, 1e-10, 1e-5, 0.001, 0.02, 0.07, 0.2, 0.4, 0.5, 0.6, 0.93, 0.975, 0.999]) {
    const a = Ch.qnorm(p), b = S.normalQuantile(p);
    assert.ok(Math.abs(a - b) <= 1e-13 * Math.max(1, Math.abs(b)), `p = ${p}: ${a} against ${b}`);
    if (p < 0.5 && p > 1e-10) assert.ok(Math.abs(Ch.qnorm(p) + Ch.qnorm(1 - p)) < 1e-9, `symmetry at ${p}`);
  }
  assert.ok(Math.abs(Ch.tQuantile(0.975, 3) - 3.182446305284263) < 1e-9, "t quantile with 3 degrees of freedom");
  assert.ok(Math.abs(Ch.tQuantile(0.975, 15) - 2.131449545559323) < 1e-9, "t quantile with 15 degrees of freedom");
});

test("the plain Sobol points start as Joe and Kuo's sequence, and every prefix of 2^m points is a (0, m, 2)-net in dimensions 1 and 2", () => {
  const u = new Float64Array(3), plain = Ch.sobol(3, "none", null), first = [];
  for (let i = 0; i < 8; i++) { plain.next(u); first.push(Array.from(u, (v) => v - 2 ** -33)); }
  assert.deepEqual(first, [[0, 0, 0], [0.5, 0.5, 0.5], [0.75, 0.25, 0.25], [0.25, 0.75, 0.75], [0.375, 0.375, 0.625], [0.875, 0.875, 0.125], [0.625, 0.125, 0.875], [0.125, 0.625, 0.375]]);
  for (const kind of ["none", "shift", "lms_shift"]) for (const seed of [1, 2, 3]) {
    const gen = Ch.sobol(16, kind, Rng.stream(seed, "sobol-test", 0, 0)), m = 10, pts = [];
    const v = new Float64Array(16);
    for (let i = 0; i < 2 ** m; i++) { gen.next(v); pts.push([v[0], v[1], v[15]]); }
    // Every elementary box of area 2^-m with sides 2^-a by 2^-(m - a) holds exactly one point.
    for (let a = 0; a <= m; a++) {
      /** @type {Set<string>} */
      const seen = new Set(pts.map(([x, y]) => `${Math.floor(x * 2 ** a)},${Math.floor(y * 2 ** (m - a))}`));
      assert.equal(seen.size, 2 ** m, `${kind}, seed ${seed}: boxes 2^-${a} × 2^-${m - a}`);
    }
    // Each one-dimensional projection, dimension 16 too, puts one point in each interval of length 2^-m.
    assert.equal(new Set(pts.map((p) => Math.floor(p[2] * 2 ** m))).size, 2 ** m, `${kind}, seed ${seed}: dimension 16 is stratified`);
  }
});

test("the scramble makes each point uniform: the mean of a coordinate over 4,000 randomisations is 1/2", () => {
  // Var of a uniform is 1/12; the standard error of the mean of 4,000 is 0.00456, and 5 of them is 0.0228.
  for (const seed of [11, 12, 13]) {
    const rng = Rng.stream(seed, "scramble-test", 0, 0), sums = new Float64Array(4);
    const v = new Float64Array(2);
    for (let r = 0; r < 4000; r++) {
      const g = Ch.sobol(2, "lms_shift", rng);
      for (let i = 0; i < 2; i++) { g.next(v); sums[2 * i] += v[0]; sums[2 * i + 1] += v[1]; }
    }
    for (const s of sums) assert.ok(Math.abs(s / 4000 - 0.5) < 0.0228, `seed ${seed}: mean ${s / 4000}`);
  }
});

test("each resampling scheme gives N indices with the right number of copies, and is unbiased: E[copies of i] = N W_i", () => {
  const N = 50;
  for (const seed of [21, 22, 23]) {
    const rng = Rng.stream(seed, "weights", 0, 0);
    const raw = Array.from({ length: N }, () => Math.exp(3 * rng.normal())), tot = raw.reduce((a, b) => a + b, 0), W = raw.map((x) => x / tot);
    for (const scheme of ["multinomial", "stratified", "systematic", "residual"]) {
      const r2 = Rng.stream(seed, scheme, 0, 0), reps = 4000, mean = new Float64Array(N);
      for (let t = 0; t < reps; t++) {
        const a = Ch.resample(W, scheme, r2), counts = new Int32Array(N);
        for (const i of a) counts[i]++;
        assert.equal(a.length, N);
        for (let i = 0; i < N; i++) {
          const nw = N * W[i];
          if (scheme === "systematic") assert.ok(counts[i] === Math.floor(nw) || counts[i] === Math.ceil(nw), `systematic: ${counts[i]} copies for N W = ${nw}`);
          if (scheme === "stratified") assert.ok(Math.abs(counts[i] - nw) < 2, `stratified: ${counts[i]} copies for N W = ${nw}`);
          if (scheme === "residual") assert.ok(counts[i] >= Math.floor(nw), `residual: ${counts[i]} copies for N W = ${nw}`);
          mean[i] += counts[i] / reps;
        }
      }
      // The copies of particle i have variance at most N W_i (1 - W_i) (the multinomial case), so 6 standard errors
      // bound the mean: a false failure has a probability below 1e-8 for each of the 600 comparisons.
      for (let i = 0; i < N; i++) {
        const nw = N * W[i], se = Math.sqrt((nw * (1 - W[i])) / reps);
        assert.ok(Math.abs(mean[i] - nw) <= 6 * se + 1e-12, `${scheme}, seed ${seed}, particle ${i}: mean ${mean[i]} against ${nw}`);
      }
    }
  }
});

test("weight accounting: the particle filter's likelihood estimate has no bias, its normalised weights sum to 1, and log Ẑ is biased down", () => {
  // A short series and few particles make the spread of Ẑ large and any bias visible. E Ẑ / Z = 1 for every N.
  const ex = { ...example("tank-level"), data: { kind: "synthetic", text: "", y: Ch.synthetic(example("tank-level").data.generator).slice(0, 8) } };
  for (const seed of [31, 32, 33]) for (const scheme of ["multinomial", "systematic", "residual", "none"]) {
    const { record } = Ch.recordOf(ex, "", data.datasets);
    const c = Ch.prepare(record, { seed, method: "particle", compare: "none", size: 6, runs: 32, resample: scheme, ess: 1 });
    const ref = Ch.reference(record);
    const ratios = [], logs = [];
    for (let b = 0; b < 400; b++) {
      const r = Ch.block(c, b, {}).methods[0];
      ratios.push(Math.exp(r.logZ - ref.logZ));
      logs.push(r.logZ - ref.logZ);
      if (b === 0) assert.ok(Math.abs(r.weights.reduce((/** @type {number} */ a, /** @type {number} */ w) => a + w, 0) - 1) < 1e-12, "the final weights sum to 1");
    }
    const m = ratios.reduce((a, b) => a + b, 0) / ratios.length, sd = Math.sqrt(ratios.reduce((a, b) => a + (b - m) ** 2, 0) / (ratios.length - 1));
    assert.ok(Math.abs(m - 1) <= K * (sd / Math.sqrt(ratios.length)), `${scheme}, seed ${seed}: mean of Ẑ/Z ${m}, standard deviation ${sd}`);
    assert.ok(logs.reduce((a, b) => a + b, 0) / logs.length < 0, `${scheme}, seed ${seed}: E log Ẑ < log Z`);
  }
});

test("weight accounting: with a fixed schedule, the tempered sampler's Ẑ has no bias for the normal law with ρ = 0.9", () => {
  for (const seed of [41, 42, 43]) {
    const { record } = Ch.recordOf(example("chain-correlated"), "rho=0.9", data.datasets);
    const c = Ch.prepare(record, { seed, method: "smc", compare: "none", size: 8, runs: 32, schedule: "fixed", temps: 3, moves: 2, resample: "systematic", ess: 0.5 });
    const ref = Ch.reference(record), ratios = [];
    for (let b = 0; b < 300; b++) ratios.push(Math.exp(Ch.block(c, b, {}).methods[0].logZ - ref.logZ));
    const m = ratios.reduce((a, b) => a + b, 0) / ratios.length, sd = Math.sqrt(ratios.reduce((a, b) => a + (b - m) ** 2, 0) / (ratios.length - 1));
    assert.ok(Math.abs(m - 1) <= K * (sd / Math.sqrt(ratios.length)), `seed ${seed}: mean of Ẑ/Z ${m}`);
  }
});

test("the particle filter agrees with the Kalman filter and the grid filter, with 4,096 particles and 3 seeds", () => {
  for (const seed of [1, 2, 3]) {
    near(runExample("tank-level", { method: "particle", size: 12, resample: "systematic", ess: 0.5 }, seed).sm.methods[0], `tank, seed ${seed}`);
    near(runExample("volatility", { method: "particle", size: 11, resample: "stratified", ess: 0.5 }, seed).sm.methods[0], `volatility, seed ${seed}`);
  }
});

test("Metropolis–Hastings, the Gibbs sampler and Hamiltonian Monte Carlo meet the exact moments of the normal law and the quadrature of the balance", () => {
  for (const seed of [5, 6, 7]) {
    near(runExample("chain-correlated", { method: "metropolis", step: 1, size: 13 }, seed, "rho=0.6").sm.methods[0], `MH normal, seed ${seed}`);
    near(runExample("chain-correlated", { method: "gibbs", size: 11 }, seed, "rho=0.6").sm.methods[0], `Gibbs normal, seed ${seed}`);
    near(runExample("chain-correlated", { method: "hmc", eps: 0.2, leap: 10, size: 11 }, seed).sm.methods[0], `HMC normal, seed ${seed}`);
    near(runExample("balance-bias", { method: "gibbs", size: 11 }, seed).sm.methods[0], `Gibbs balance, seed ${seed}`);
    near(runExample("oring-launch", { method: "hmc", eps: 0.3, leap: 10, size: 11 }, seed).sm.methods[0], `HMC O-rings, seed ${seed}`);
  }
});

test("the tempered sampler finds both modes and the evidence; scrambled Sobol points meet the closed forms", () => {
  for (const seed of [8, 9, 10]) {
    near(runExample("chain-two-modes", { method: "smc", size: 11, schedule: "adaptive", moves: 5, resample: "systematic", ess: 0.5 }, seed).sm.methods[0], `SMC two modes, seed ${seed}`);
    near(runExample("balance-evidence", { method: "smc", size: 10, schedule: "adaptive", moves: 5, resample: "systematic", ess: 0.5 }, seed).sm.methods[0], `SMC evidence, seed ${seed}`);
    for (const id of ["qmc-peak", "qmc-sum", "asian-option"]) near(runExample(id, { method: "rqmc", size: 12, scramble: "lms_shift", path: "bridge" }, seed).sm.methods[0], `RQMC ${id}, seed ${seed}`);
  }
});

test("the reference values: the O-ring mode is stationary, the Irwin–Hall law is symmetric, one Kalman step is exact", () => {
  const oring = Ch.reference(Ch.recordOf(example("oring-launch"), "", data.datasets).record);
  // Logistic regression at the mode: the gradient of the log posterior is 0.
  const g = [0, 0];
  Ch.TARGETS.oring.grad(oring.mode, { sa: 5, sb: 2.5, t0: 31 }, g, { t: data.datasets.find((/** @type {any} */ d) => d.id === "challenger-orings").values, k: data.datasets.find((/** @type {any} */ d) => d.id === "challenger-orings").counts, m: 6 });
  assert.ok(Math.abs(g[0]) + Math.abs(g[1]) < 1e-8, `gradient at the mode ${g}`);
  assert.ok(oring.values.pred_t0 > 0.9 && oring.values.pred_t0 < 1);
  assert.ok(Math.abs(Ch.irwinHall(1, 2) - 0.5) < 1e-15 && Math.abs(Ch.irwinHall(0.5, 1) - 0.5) < 1e-15 && Math.abs(Ch.irwinHall(4, 8) - 0.5) < 1e-12, "Irwin–Hall symmetry");
  // The Kalman log likelihood equals the sum of the predictive normal densities by direct algebra for one reading.
  const k1 = Ch.kalman({ d: 0, sx: 1, sy: 1, m0: 0, s0: 1, h: 0 }, { y: [1] });
  assert.ok(Math.abs(k1.logZ - (-0.5 * Math.log(2 * Math.PI * 3) - 1 / 6)) < 1e-14, "one Kalman step");
  // The grid filter of the volatility model is checked against the particle filter with 2,048 particles above.
  const vol = Ch.reference(Ch.recordOf(example("volatility"), "", data.datasets).record);
  assert.ok(Number.isFinite(vol.logZ) && vol.values.above > 0 && vol.values.above < 1);
});

test("Markov-chain diagnostics: Geyer's τ of an AR(1) series, and split R-hat near 1 for agreeing chains and large for disagreeing ones", () => {
  // AR(1) with φ = 0.8 has τ = (1 + φ)/(1 - φ) = 9.
  const rng = Rng.stream(51, "ar1", 0, 0), n = 1 << 17, xs = new Float64Array(n);
  let x = 0;
  for (let i = 0; i < n; i++) { x = 0.8 * x + Math.sqrt(1 - 0.64) * rng.normal(); xs[i] = x; }
  const tau = Ch.geyer(Ch.autocorrelation(xs, 2000)).tau;
  assert.ok(Math.abs(tau - 9) < 0.6, `τ = ${tau}`);
  const chain = (/** @type {number} */ shift, /** @type {number} */ seed) => {
    const r = Rng.stream(seed, "iid", 0, 0), v = new Float64Array(4096);
    for (let i = 0; i < v.length; i++) v[i] = shift + r.normal();
    const half = 2048, mean = (/** @type {number} */ a, /** @type {number} */ b) => { let s = 0; for (let i = a; i < b; i++) s += v[i]; return s / (b - a); };
    const vr = (/** @type {number} */ a, /** @type {number} */ b) => { const m = mean(a, b); let s = 0; for (let i = a; i < b; i++) s += (v[i] - m) ** 2; return s / (b - a - 1); };
    return { mean: mean(0, 4096), var: vr(0, 4096), halves: [[mean(0, half), vr(0, half)], [mean(half, 4096), vr(half, 4096)]], acf: Ch.autocorrelation(v, 200) };
  };
  const same = Ch.chainDiagnostics([chain(0, 1), chain(0, 2), chain(0, 3), chain(0, 4)], 4096);
  assert.ok(/** @type {number} */ (same.rhat) < 1.01, `independent chains: R-hat ${same.rhat}`);
  assert.ok(/** @type {number} */ (same.ess) > 12000, `independent draws: ESS ${same.ess} of 16,384`);
  const apart = Ch.chainDiagnostics([chain(0, 1), chain(0, 2), chain(3, 3), chain(3, 4)], 4096);
  assert.ok(/** @type {number} */ (apart.rhat) > 1.5, `chains in two places: R-hat ${apart.rhat}`);
});

test("the ESS is a diagnostic, not a proof: chains that all start in one mode agree and have a large ESS, and the estimate is wrong", () => {
  for (const seed of [2026, 61, 62]) {
    const { sm } = runExample("chain-two-modes", { method: "metropolis", step: 1, start: "one_point", size: 12, runs: 4 }, seed);
    const m = sm.methods[0];
    assert.ok(m.chain.maxRhat < 1.02, `seed ${seed}: R-hat ${m.chain.maxRhat}`);
    assert.ok(m.chain.series[0].ess > 500, `seed ${seed}: ESS ${m.chain.series[0].ess}`);
    const upper = m.quantities.find((/** @type {any} */ q) => q.id === "upper");
    assert.ok(Math.abs(upper.est - upper.reference) > 0.6, `seed ${seed}: ${upper.est} against ${upper.reference}`);
  }
  const dispersed = runExample("chain-two-modes", { method: "metropolis", step: 1, start: "dispersed", size: 12, runs: 4 }, 2026).sm.methods[0];
  assert.ok(dispersed.chain.maxRhat > 1.1, `dispersed starts: R-hat ${dispersed.chain.maxRhat}`);
});

test("Hamiltonian Monte Carlo counts divergent transitions in the funnel, and the methods that do not apply are refused with a reason", () => {
  const f = runExample("chain-funnel", { method: "hmc", eps: 0.5, leap: 10, size: 12, runs: 4 }, 2026).sm.methods[0];
  assert.ok(f.chain.divergent > 100, `divergent transitions ${f.chain.divergent}`);
  const rec = (/** @type {string} */ id) => Ch.recordOf(example(id), "", data.datasets).record;
  assert.match(Ch.prepare(rec("chain-funnel"), { seed: 1, method: "gibbs", size: 10, runs: 4 }).errors?.[0] ?? "", /no Gibbs sweep/);
  assert.match(Ch.prepare(rec("oring-launch"), { seed: 1, method: "gibbs", size: 10, runs: 4 }).errors?.[0] ?? "", /Pólya-Gamma/);
  assert.match(Ch.prepare(rec("tank-level"), { seed: 1, method: "hmc", size: 10, runs: 4 }).errors?.[0] ?? "", /does not apply/);
  assert.match(Ch.prepare(rec("tank-level"), { seed: 1, method: "particle", size: 18, runs: 4 }).errors?.join(" ") ?? "", /from 6 to 14/);
  assert.match(Ch.recordOf(example("chain-correlated"), "rho=abc; zeta=1", data.datasets).errors.join(" "), /not a number.*not a parameter/);
  assert.match(Ch.prepare(Ch.recordOf(example("chain-correlated"), "rho=1", data.datasets).record, { seed: 1, method: "metropolis", size: 10, runs: 4 }).errors?.[0] ?? "", /strictly between −1 and 1/);
  assert.match(Ch.prepare({ ...rec("chain-correlated"), model: "toString" }, { seed: 1, method: "metropolis", size: 10, runs: 4 }).errors?.[0] ?? "", /not a model/);
  // Without randomisation every run gives the same value, and the page shows no interval.
  const none = runExample("qmc-peak", { method: "rqmc", size: 10, scramble: "none" }, 1).sm.methods[0].quantities[0];
  assert.equal(none.lo, null);
  assert.match(none.how, /spread says nothing/);
});

test("determinism: the same seed gives the same runs; 1 and 4 workers give the same summary; a paused run is partial", async () => {
  const { record } = Ch.recordOf(example("balance-evidence"), "", data.datasets);
  const settings = { seed: 77, method: "smc", compare: "none", size: 8, runs: 12, schedule: "adaptive", moves: 2, resample: "systematic", ess: 0.5 };
  const c = Ch.prepare(record, settings), ref = Ch.reference(record);
  const strip = (/** @type {any} */ blk) => JSON.stringify(blk.methods.map((/** @type {any} */ m) => ({ ...m, ms: 0 })));
  for (let b = 0; b < 3; b++) assert.equal(strip(Ch.block(c, b, { reference: ref })), strip(Ch.block(c, b, { reference: ref })), `run ${b} repeats`);
  /** Stand-in workers that run the engine as src/chains-worker.js does and answer out of order. @param {number[]} delays */
  const fake = (delays) => {
    let k = 0;
    return () => {
      /** @type {any} */
      let job = null;
      const w = {
        /** @type {any} */ onmessage: null, /** @type {any} */ onerror: null, terminate() {},
        /** @param {any} m */
        postMessage(m) {
          if (m.type === "init") { job = { c: Ch.prepare(m.record, m.settings), opts: m.opts }; return; }
          const stats = Ch.block(job.c, m.block, job.opts);
          setTimeout(() => w.onmessage?.({ data: { type: "block", id: m.id, block: m.block, stats } }), delays[k++ % delays.length]);
        },
      };
      return w;
    };
  };
  /** @param {number} size @param {boolean} pauseEarly */
  const viaPool = (size, pauseEarly) => new Promise((resolve) => {
    const pool = Pool.createPool({ source: "", size, engine: Ch, makeWorker: fake([7, 1, 4, 0, 6]) });
    let acc = Ch.empty(c);
    /** @type {any} */
    let h = null;
    h = pool.run({ record, settings, opts: { reference: ref }, from: 0, to: 12 }, {
      onBlock(/** @type {any} */ blk) { acc = Ch.merge(acc, blk); if (pauseEarly && acc.blocks === 1) h.pause(); },
      onEnd(/** @type {string} */ status) { resolve({ status, acc }); },
    });
  });
  const one = /** @type {any} */ (await viaPool(1, false)), four = /** @type {any} */ (await viaPool(4, false));
  assert.equal(one.status, "done");
  const sum = (/** @type {any} */ a) => JSON.stringify(Ch.summary(c, a, ref)?.methods.map((/** @type {any} */ m) => ({ ...m, ms: 0 })));
  assert.equal(sum(one.acc), sum(four.acc), "1 and 4 workers");
  const paused = /** @type {any} */ (await viaPool(2, true));
  assert.equal(paused.status, "paused");
  assert.ok(paused.acc.blocks < 12, `a paused run stops early: ${paused.acc.blocks} runs`);
  assert.throws(() => Ch.merge(Ch.empty(c), { block: 2, methods: [], error: "" }), /arrived for position 0/, "runs merge in order only");
});

test("the report of the lab opens as a standard beamdswitch deck and keeps the three kinds of diagnostic apart", async () => {
  const { createRequire } = await import("node:module");
  const { assertStandardDeck } = await import("../../../scripts/kit/checks.mjs");
  const require = createRequire(import.meta.url);
  const Beamdswitch = require("../../../scripts/templates/beamdswitch.js"), VisualKit = require("../../../scripts/kit/kit.js");
  const x = example("chain-two-modes"), { sm, ref } = runExample("chain-two-modes", { method: "metropolis", compare: "smc", start: "one_point", size: 10, runs: 4, resample: "systematic", ess: 0.5, schedule: "adaptive", moves: 5 }, 3);
  const state = { c_method: "metropolis", c_compare: "smc", c_size: 10, c_runs: 4, seed: 3 };
  const report = Ch.report({ example: x, method: data.chains.methods.find((/** @type {any} */ m) => m.id === "metropolis"), state, summary: sm, reference: ref, errors: [], status: "done" });
  assertStandardDeck(Beamdswitch.deck(report), "two modes");
  const md = VisualKit.markdown(report);
  assert.match(md, /Lab results after 4 runs \(done\)/);
  assert.match(md, /- Markov-chain diagnostics, Metropolis–Hastings: largest split R-hat/);
  assert.match(md, /- Markov-chain diagnostics, Sequential Monte Carlo: not applicable/);
  assert.match(md, /- Weight degeneracy, Metropolis–Hastings: not applicable/);
  assert.match(md, /- Weight degeneracy, Sequential Monte Carlo: smallest weight ESS \d[\d.]* of 1024, /);
  assert.match(md, /- Estimation error, Metropolis–Hastings: P\(x₁ \+ x₂ > 0\) error [-−]?0\.7/);
  assert.match(md, /- Estimation error, Sequential Monte Carlo: P\(x₁ \+ x₂ > 0\) error /);
  assert.match(md, /The effective sample size is a diagnostic, not a proof of convergence/);
});
