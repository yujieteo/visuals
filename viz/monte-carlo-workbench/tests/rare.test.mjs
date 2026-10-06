// Rare events and ruin (group 7): the jump laws against the catalogue laws, the references against independent
// computations, each method against the exact or numerical reference with 3 fixed seeds, the refusals, the failure
// experiments, the weight accounting of every change of measure, the catastrophe test's exact quantities, its
// methods against each other and its decision, and deterministic runs with 1 and 4 workers.
//
// Statistical bounds. A method's estimate is compared with the reference within 6 of its own standard errors (and
// the reference's, when the reference is numerical). For the pooled CLT intervals that bound fails with a probability
// below 2e-9; for the Student t intervals of 32 replications (31 degrees of freedom) below 2e-6. With fewer than 200
// such comparisons in this file, a correct engine fails one of them with a probability below 1e-3 (Bonferroni).
import assert from "node:assert/strict";
import test from "node:test";
import { Cop, L, Pool, Pr, Ra, Rng, S } from "./helpers.mjs";

const SEEDS = [11, 202, 3003];

/** ∫_a^b f on panels that double in length from a, for an integrand with its mass near a. @param {(x: number) => number} f @param {number} a @param {number} b */
function quad(f, a, b) {
  let s = 0, lo = a, w = Math.min(0.25, b - a);
  while (lo < b) { const hi = Math.min(b, lo + w); s += Ra.gaussLegendre(f, lo, hi); lo = hi; w *= 2; }
  return s;
}

/** Run a rare-event record to the end, sequentially. @param {any} record @param {any} settings */
function run(record, settings) {
  const c = Ra.prepare(record, { compare: "none", size: 11, reps: 32, ...settings });
  assert.ok(c.ok, c.errors?.join(" "));
  let acc = Ra.empty(c);
  for (let b = 0; b < c.R; b++) acc = Ra.merge(acc, Ra.block(c, b), c);
  return { c, acc, sm: Ra.summary(c, acc) };
}
/** @param {any} acc */
const strip = (acc) => JSON.parse(JSON.stringify({ ...acc, methods: acc.methods.map((/** @type {any} */ m) => ({ ...m, ms: 0, diags: m.diags.map(() => 0) })) }));

test("the jump laws agree with the catalogue's exponential, Weibull and Pareto II laws, and H⁻¹ inverts the cumulative hazard", () => {
  const cases = [["exponential", { rate: 0.7 }, { rate: 0.7 }], ["weibull", { k: 0.4, lambda: 2 }, { k: 0.4, lambda: 2 }], ["pareto2", { sigma: 1.5, alpha: 1.3 }, { mu: 0, sigma: 1.5, alpha: 1.3 }]];
  for (const [id, p, q] of /** @type {[string, any, any][]} */ (cases)) {
    const J = Ra.jump(id, p), law = /** @type {any} */ (L.BY_ID)[id];
    for (const x of [0.01, 0.5, 3, 40, 2000]) {
      assert.ok(Math.abs(J.sf(x) - law.sf(x, q)) <= 1e-13 * Math.max(1e-300, law.sf(x, q)) + 1e-300, `${id} sf(${x})`);
      if (law.pdf(x, q) > 1e-290) assert.ok(Math.abs(J.logpdf(x) - Math.log(law.pdf(x, q))) < 1e-10, `${id} log pdf(${x})`);
      assert.ok(Math.abs(J.Hinv(J.H(x)) - x) <= 1e-12 * x, `${id} H⁻¹(H(${x}))`);
    }
    assert.ok(Math.abs(J.Hinv(800) - law.isf(Math.exp(-700), q)) > 0, "H⁻¹ is finite where exp(−h) underflows");
    assert.ok(Number.isFinite(J.Hinv(800)), `${id}: H⁻¹(800) is finite`);
  }
});

test("the integrated tail of a Pareto II law is Pareto II with index α − 1, by quadrature of the survival function", () => {
  const J = Ra.jump("pareto2", { sigma: 1.5, alpha: 3.2 }), I = Ra.integratedTail(J);
  for (const x of [0, 1, 7, 30]) {
    const tail = quad((y) => J.sf(y), x, 1e7) + (1.5 / 2.2) * Math.pow(1 + 1e7 / 1.5, -2.2);
    assert.ok(Math.abs(tail / J.mean - I.sf(x)) < 1e-7 * I.sf(x) + 1e-12, `F̄_I(${x})`);
  }
});

test("the references: the Erlang tail against the Poisson sum, the Hawkes mean against group 5's formula, and the Asmussen–Kroese estimator against quadrature", () => {
  for (const [n, b, r] of [[5, 12, 1], [20, 50, 1], [40, 30, 2.5]]) {
    let sum = 0, term = Math.exp(-r * b);
    for (let k = 0; k < n; k++) { sum += term; term *= (r * b) / (k + 1); }
    assert.ok(Math.abs(Ra.erlangSf(n, b, r) - sum) <= 1e-11 * sum, `Q(${n}, ${r * b})`);
  }
  for (const [nu, eta, beta, T] of [[2, 0.4, 4, 10], [0.5, 0.9, 1, 30], [3, 0, 2, 5]]) {
    const ref = Pr.hawkesMean({ mu: nu, alpha: eta * beta, beta }, T);
    assert.ok(Math.abs(Ra.hawkesMean(nu, eta, beta, T) - ref) < 1e-9 * ref, `E N(${T})`);
  }
  // P(X1 + X2 > x) = 2 ∫_0^(x/2) f(y) F̄(x − y) dy + F̄(x/2)² for two Pareto II jumps; the estimate is within 6 standard errors.
  const J = Ra.jump("pareto2", { sigma: 1, alpha: 1.7 });
  for (const x of [5, 60, 800]) {
    const exact = 2 * quad((y) => Math.exp(J.logpdf(y)) * J.sf(x - y), 0, x / 2) + J.sf(x / 2) ** 2;
    for (const seed of SEEDS) {
      const ak = Ra.asmussenKroese(J, { n: 2 }, x, 1 << 14, seed);
      assert.ok(Math.abs(ak.est - exact) <= 6 * ak.se, `x = ${x}, seed ${seed}: ${ak.est} against ${exact}`);
    }
  }
});

test("the light-tailed sum and the exponential ruin problem: every method meets the exact value, 3 seeds", () => {
  for (const [record, ref] of /** @type {[any, number][]} */ ([
    [{ problem: "sum", law: "exponential", params: "n=20; b=50" }, Ra.erlangSf(20, 50, 1)],
    [{ problem: "ruin", law: "exponential", params: "u=30; c=1.25" }, 0.8 * Math.exp(-0.2 * 30)],
  ])) {
    for (const method of ["direct", "tilting", "splitting", "subset", "ce", "ais"]) {
      for (const seed of SEEDS) {
        const q = run(record, { method, seed, reps: method === "direct" ? 4 : 32 }).sm[0].q[0];
        if (method === "direct" && record.problem === "sum") { assert.equal(q.hits, 0, "direct simulation sees no path of probability 4.8e-7"); assert.ok(q.hi >= ref, "the zero-hit bound holds the value"); continue; }
        assert.ok(Math.abs(q.est - ref) <= 6 * q.se, `${record.problem} ${method} seed ${seed}: ${q.est} against ${ref} (se ${q.se})`);
      }
    }
  }
});

test("heavy tails: tilting is refused with the reason, and the other methods meet the numerical reference, 3 seeds", () => {
  for (const record of [{ problem: "sum", law: "pareto2", params: "n=10; b=400; sigma=1; alpha=1.5" }, { problem: "sum", law: "weibull", params: "n=10; b=60; k=0.5; lambda=1" }, { problem: "ruin", law: "pareto2", params: "u=200; c=1.25; sigma=1.5; alpha=2.5" }]) {
    const c = Ra.prepare(record, { method: "tilting" });
    assert.match(c.refused.tilting, /E exp\(θX\) = ∞ for every θ > 0/);
    const ref = /** @type {any} */ (Ra.reference(c));
    assert.equal(ref.kind, "numerical");
    const refSe = (ref.interval[1] - ref.interval[0]) / (2 * 1.959963984540054);
    for (const method of ["direct", "splitting", "subset", "ce", "ais"]) {
      for (const seed of SEEDS) {
        const q = run(record, { method, seed }).sm[0].q[0];
        assert.ok(Math.abs(q.est - ref.value) <= 6 * Math.hypot(q.se, refSe), `${record.law} ${record.problem} ${method} seed ${seed}: ${q.est} against ${ref.value}`);
      }
    }
    assert.equal(run(record, { method: "tilting", seed: 1, reps: 2 }).sm[0].refused, c.refused.tilting, "a refused method returns its reason, not a number");
  }
});

test("subset simulation on the ruin problem is refused when the cap on the ladder heights cuts off real mass (ρ = 0.99)", () => {
  const record = { problem: "ruin", law: "exponential", params: "u=650; c=1.01; lam=1; rate=1" };
  const c = Ra.prepare(record, { method: "subset", compare: "splitting" });
  assert.ok(c.ok, c.errors?.join(" "));
  assert.ok(Math.abs(c.rho - 1 / 1.01) < 1e-12);
  assert.match(c.refused.subset, /ρ = 0\.9901/);
  assert.match(c.refused.subset, /cap of 600 ladder heights/);
  assert.match(c.refused.subset, /ρ\^601 = /);
  assert.equal(c.refused.splitting, "", "splitting still applies");
  assert.equal(run(record, { method: "subset", seed: 1, reps: 2 }).sm[0].refused, c.refused.subset, "a refused method returns its reason, not a number");
  assert.equal(Ra.prepare({ problem: "ruin", law: "exponential", params: "u=30; c=1.25" }, { method: "subset" }).refused.subset, "", "ρ = 0.8 keeps subset simulation");
});

test("one big jump: splitting gains little on a heavy tail, because paths pass several levels at once", () => {
  const share = (/** @type {any} */ record) => {
    const d = run(record, { method: "splitting", seed: 5, reps: 4 }).acc.methods[0].diags;
    const early = d.flatMap((/** @type {any} */ x) => x.early.slice(1));
    return early.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / early.length;
  };
  const light = share({ problem: "sum", law: "exponential", params: "n=20; b=50" }), heavy = share({ problem: "sum", law: "pareto2", params: "n=10; b=400; sigma=1; alpha=1.5" });
  assert.ok(light < 0.1, `light tail: ${light} of the entrants are past the next level at once`);
  assert.ok(heavy > 0.3, `heavy tail: ${heavy} of the entrants are past the next level at once`);
});

test("the failure experiments: the light family has unbounded weights, a nominal start leaves adaptive importance sampling without hits, a tiny spread freezes the chains", () => {
  const ce = run({ problem: "sum", law: "pareto2", params: "n=10; b=400; sigma=1; alpha=1.5" }, { method: "ce", seed: 3, reps: 4, failure: "light_family" });
  const d = ce.acc.methods[0].diags[0];
  assert.equal(d.family, "exponential");
  assert.equal(d.infiniteVariance, true);
  // log f/g(x) for the Pareto II target and the exponential proposal with mean v grows without bound.
  const J = Ra.jump("pareto2", { sigma: 1, alpha: 1.5 }), v = d.final.v, lr = (/** @type {number} */ x) => J.logpdf(x) + Math.log(v) + x / v;
  assert.ok(lr(1e4 * v) > lr(1e3 * v) && lr(1e3 * v) > lr(100 * v) && lr(1e4 * v) > 1000, "the weight f/g grows without bound in the tail");
  const ais = run({ problem: "sum", law: "exponential", params: "n=20; b=90" }, { method: "ais", seed: 3, reps: 2, failure: "nominal_start" });
  assert.equal(ais.acc.methods[0].diags.every((/** @type {any} */ x) => !x.adapted), true, "no step had a path in the event (p ≈ 1e−15)");
  assert.equal(ais.sm[0].q[0].est, 0);
  const tiny = run({ problem: "sum", law: "exponential", params: "n=20; b=40" }, { method: "subset", seed: 3, reps: 2, failure: "small_spread" }).acc.methods[0].diags[0];
  const usual = run({ problem: "sum", law: "exponential", params: "n=20; b=40" }, { method: "subset", seed: 3, reps: 2 }).acc.methods[0].diags[0];
  assert.equal(tiny.spread, 0.05);
  assert.ok(tiny.componentAccept > 0.95 && usual.componentAccept < 0.85, `component acceptance ${tiny.componentAccept} with spread 0.05, ${usual.componentAccept} with spread 1: small steps are almost always accepted and hardly move`);
});

test("weight accounting: every change of measure of the catastrophe test has E_g[f/g] = 1, 3 seeds", () => {
  for (const [law, q, params] of /** @type {[string, any, string][]} */ ([["exponential", { tilt: 1.3, nu: 2.4 }, "M=200"], ["exponential", { r: 0.8, nu: 2.4 }, "M=200"], ["pareto2", { r: 0.9 }, "M=200"], ["pareto2", { mix: { beta: 0.1, r: 0.2 } }, "M=200"], ["weibull", { mix: { beta: 0.2, r: 0.3 } }, "M=200"], ["pareto2", { v: 2 }, "M=3; T=0.5; nu=1; eta=0"], ["weibull", { v: 1.5 }, "M=4; k=0.8; T=0.5; nu=1; eta=0"]])) {
    const c = Ra.prepare({ problem: "cat", law, copula: "clayton", params }, { method: "direct" });
    for (const seed of SEEDS) {
      const rng = Rng.stream(seed, "test/lr", 0, 0);
      let s = 0, s2 = 0;
      const N = 8000;
      for (let i = 0; i < N; i++) { const w = Math.exp(Ra.catPath(c, rng, q, c.cat.policies).logLR); s += w; s2 += w * w; }
      const m = s / N, se = Math.sqrt((s2 / N - m * m) / N);
      assert.ok(Math.abs(m - 1) <= 6 * se, `${law} ${JSON.stringify(q)} seed ${seed}: mean weight ${m} (se ${se})`);
    }
  }
  for (const [law, params, infinite] of /** @type {[string, string, boolean][]} */ ([["pareto2", "M=3", false], ["weibull", "M=4; k=0.8", false], ["weibull", "M=4; k=0.5", true], ["weibull", "M=0; k=0.8", true]])) {
    for (const d of run({ problem: "cat", law, copula: "clayton", params }, { method: "ce", seed: 1, size: 8, reps: 2, failure: "light_family" }).acc.methods[0].diags[0].policies) {
      assert.equal(d.family, "exponential");
      assert.equal(d.infiniteVariance, infinite, `${law} ${params}: the light family has ${infinite ? "infinite" : "finite"} weight variance`);
    }
  }
});

test("the shares: Kendall's tau of two shares is the copula's τ, for the Gaussian, Gumbel and Clayton copulas, 3 seeds", () => {
  for (const copula of ["gaussian", "gumbel", "clayton"]) {
    const c = Ra.prepare({ problem: "cat", law: "exponential", copula, params: "tau=0.5" }, { method: "direct" });
    for (const seed of SEEDS) {
      const rng = Rng.stream(seed, "test/tau", 0, 0), n = 1500, a = [], b = [], W = [0, 0, 0];
      for (let i = 0; i < n; i++) { Ra.shares(c, rng, W); a.push(W[0]); b.push(W[1]); }
      let conc = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) conc += Math.sign((a[i] - a[j]) * (b[i] - b[j]));
      const tau = conc / ((n * (n - 1)) / 2);
      // The standard deviation of Kendall's estimate is below sqrt(2(2n + 5) / (9n(n − 1))) · 1.6 ≈ 0.028 here.
      assert.ok(Math.abs(tau - 0.5) < 6 * 0.028, `${copula} seed ${seed}: tau ${tau}`);
    }
  }
  assert.ok(Cop.positiveStable, "the Gumbel shares use group 5's positive stable sampler");
});

test("the catastrophe test: the mean number of events is E N(T), the layer price is its quadrature, and ES is refused when the mean loss is infinite", () => {
  for (const seed of SEEDS) {
    const r = run({ problem: "cat", law: "exponential", copula: "gaussian", params: "" }, { method: "direct", seed, size: 10, reps: 8 });
    const counts = r.acc.methods[0].diags.map((/** @type {any} */ d) => d.events);
    const mean = counts.reduce((/** @type {number} */ x, /** @type {number} */ y) => x + y, 0) / counts.length;
    const sd = Math.sqrt(counts.reduce((/** @type {number} */ x, /** @type {number} */ y) => x + (y - mean) ** 2, 0) / (counts.length - 1) / counts.length);
    assert.ok(Math.abs(mean - r.c.cat.EN) <= 6 * sd, `seed ${seed}: ${mean} events against E N(T) = ${r.c.cat.EN}`);
  }
  for (const law of ["exponential", "pareto2", "weibull"]) {
    const c = Ra.prepare({ problem: "cat", law, copula: "independent", params: "M=500" }, { method: "direct" });
    const J = Ra.jump(law, c.p), FM = 1 - J.sf(500);
    const ceded = Ra.gaussLegendre((x) => (J.sf(x) - J.sf(500)) / FM, 6, 66);
    assert.ok(Math.abs(c.cat.ceded - ceded) < 1e-6 * ceded, `${law}: expected recoveries for each event ${c.cat.ceded} against ${ceded}`);
  }
  const inf = run({ problem: "cat", law: "pareto2", copula: "independent", params: "alpha=0.9; sigma=0.3" }, { method: "direct", seed: 1, size: 9, reps: 2 });
  assert.equal(inf.sm[0].risk.es, null);
  assert.match(inf.sm[0].risk.how, /ES is infinite/);
  assert.ok(Number.isFinite(inf.sm[0].risk.var), "the value at risk exists");
  const c = Ra.prepare({ problem: "cat", law: "pareto2", copula: "gumbel", params: "" }, { method: "tilting", compare: "subset" });
  assert.match(c.refused.tilting, /E exp\(θX\) = ∞/);
  assert.match(c.refused.subset, /number of events is random/);
});

test("the catastrophe test, light-tailed regime: tilting, splitting, cross-entropy and adaptive importance sampling agree with direct simulation, 3 seeds", () => {
  const record = { problem: "cat", law: "exponential", copula: "gumbel", params: "" };
  for (const seed of SEEDS) {
    const direct = run(record, { method: "direct", seed, size: 13, reps: 8 }).sm[0].q[0];
    for (const method of ["tilting", "splitting", "ce", "ais"]) {
      const q = run(record, { method, seed, size: 9, reps: 32 }).sm[0].q[0];
      assert.ok(Math.abs(q.est - direct.est) <= 6 * Math.hypot(q.se, direct.se), `${method} seed ${seed}: ${q.est} against direct ${direct.est}`);
    }
  }
});

test("the decision changes with the tail: no action for light-tailed losses, the layer for heavy-tailed losses of the same mean, 3 seeds", () => {
  for (const seed of SEEDS) {
    const light = run({ problem: "cat", law: "exponential", copula: "gumbel", params: "" }, { method: "direct", seed, size: 13, reps: 8 });
    const heavy = run({ problem: "cat", law: "pareto2", copula: "gumbel", params: "" }, { method: "direct", seed, size: 13, reps: 8 });
    assert.equal(light.c.cat.meanS, heavy.c.cat.meanS, "the same mean event loss");
    const dl = /** @type {any} */ (Ra.decide(light.c, light.sm[0])), dh = /** @type {any} */ (Ra.decide(heavy.c, heavy.sm[0]));
    assert.equal(dl.best, 0, `seed ${seed}: light tails choose no action`);
    assert.equal(dh.best, 1, `seed ${seed}: heavy tails choose the layer`);
    assert.equal(dh.rows[0].verdict, "not met");
    assert.equal(dh.separated, true);
  }
});

test("deterministic runs: the same seed gives the same record, replications in any order merge to it, and 1 and 4 workers agree; a cancel delivers no further replication", async () => {
  for (const [record, method] of /** @type {[any, string][]} */ ([[{ problem: "sum", law: "pareto2", params: "n=10; b=400; sigma=1; alpha=1.5" }, "subset"], [{ problem: "cat", law: "pareto2", copula: "gumbel", params: "" }, "ais"], [{ problem: "ruin", law: "exponential", params: "" }, "splitting"]])) {
    const settings = { seed: 7, method, compare: "direct", size: 9, reps: 6 };
    const a = run(record, settings), b = run(record, settings), other = run(record, { ...settings, seed: 8 });
    assert.deepEqual(strip(a.acc), strip(b.acc));
    assert.notDeepEqual(strip(a.acc), strip(other.acc));
    const c = a.c, done = new Map([3, 0, 5, 1, 4, 2].map((k) => [k, Ra.block(c, k)]));
    let acc = Ra.empty(c);
    for (let k = 0; k < 6; k++) acc = Ra.merge(acc, done.get(k), c);
    assert.deepEqual(strip(acc), strip(a.acc));
    assert.throws(() => Ra.merge(Ra.empty(c), Ra.block(c, 1), c), /arrived for position 0/);
    for (const size of [1, 4]) {
      const pool = Pool.createPool({ source: "", size, engine: Ra, makeWorker: fakeWorkers([6, 0, 3, 1, 4]) });
      const r = /** @type {any} */ (await runPool(pool, { record, settings: { ...settings, size: 9, reps: 6, compare: "direct" }, opts: {}, from: 0, to: 6 }, c));
      assert.equal(r.status, "done");
      assert.deepEqual(strip(r.acc), strip(a.acc), `${record.problem} ${method}, ${size} workers`);
    }
  }
  const c = Ra.prepare({ problem: "sum", law: "exponential", params: "" }, { seed: 1, method: "tilting", size: 9, reps: 10 });
  const pool = Pool.createPool({ source: "", size: 2, engine: Ra, makeWorker: fakeWorkers([3, 3]) });
  const r = /** @type {any} */ (await runPool(pool, { record: { problem: "sum", law: "exponential", params: "" }, settings: { seed: 1, method: "tilting", size: 9, reps: 10 }, opts: {}, from: 0, to: 10 }, c, (h, n) => { if (n === 2) h.cancel(); }));
  assert.equal(r.status, "cancelled");
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(r.acc.blocks, 2, "the result stays at 2 replications, marked cancelled, not complete");
});

/** Stand-in workers that run the rare-event engine and answer after delays from a fixed sequence. @param {number[]} delays */
function fakeWorkers(delays) {
  let k = 0;
  return () => {
    /** @type {any} */
    let job = null;
    const w = {
      /** @type {((e: { data: any }) => void) | null} */ onmessage: null,
      /** @type {(() => void) | null} */ onerror: null,
      terminate() {},
      /** @param {any} m */
      postMessage(m) {
        if (m.type === "init") { job = { id: m.id, c: Ra.prepare(m.record, m.settings) }; return; }
        const stats = Ra.block(job.c, m.block);
        setTimeout(() => w.onmessage?.({ data: { type: "block", id: m.id, block: m.block, stats } }), delays[k++ % delays.length]);
      },
    };
    return w;
  };
}

/** @param {any} pool @param {any} job @param {any} c @param {(h: any, n: number) => void} [during] */
function runPool(pool, job, c, during) {
  return new Promise((resolve) => {
    let acc = Ra.empty(c), n = 0;
    /** @type {any} */
    let h = null;
    h = pool.run(job, {
      onBlock(/** @type {any} */ s) { acc = Ra.merge(acc, s, c); n++; during?.(h, n); },
      onEnd(/** @type {string} */ status) { resolve({ acc, status, n }); },
    });
  });
}

test("the t quantile and the normal tail used by the intervals and the subset maps", () => {
  assert.ok(Math.abs(Ra.tQuantile975(31) - 2.0395134463964077) < 1e-9);
  assert.ok(Math.abs(Ra.tQuantile975(1) - 12.706204736174698) < 1e-7);
  for (const z of [-3, 0, 1.5, 8, 20]) assert.ok(Math.abs(Ra.normSf(z) - (1 - S.normalCdf(z))) <= 1e-12 || Math.abs(Ra.normSf(z) / (S.normalCdf(-z)) - 1) < 1e-12, `Φ̄(${z})`);
});
