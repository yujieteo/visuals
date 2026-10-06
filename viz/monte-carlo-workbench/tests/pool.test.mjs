// The worker pool with stand-in workers that run the real engine and answer after a delay from a fixed sequence,
// so blocks finish out of order. One worker and four workers must give the same statistics, a pause must leave a
// partial result that a later run completes to the same statistics, a cancel must deliver no further block, and a
// pool whose workers cannot start must run the same blocks on the main thread.
import assert from "node:assert/strict";
import test from "node:test";
import { D, En, Pool, Pr, recordOf } from "./helpers.mjs";

/** A stand-in worker: it runs the engine as src/worker.js does and answers after a delay from a fixed sequence. @param {number[]} delays */
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
        if (m.type === "init") { job = { id: m.id, c: En.prepare(m.record, m.settings), opts: m.opts }; return; }
        const stats = En.block(job.c, m.block, job.opts);
        setTimeout(() => w.onmessage?.({ data: { type: "block", id: m.id, block: m.block, stats } }), delays[k++ % delays.length]);
      },
    };
    return w;
  };
}

/**
 * Run blocks from..to of a model through a pool and merge them as the page does.
 * @param {any} pool @param {any} job @param {any} c @param {any} start @param {(h: any, n: number) => void} [during]
 */
function runPool(pool, job, c, start, during) {
  return new Promise((resolve) => {
    let acc = start, n = 0;
    /** @type {any} */
    let h = null;
    h = pool.run(job, {
      onBlock(/** @type {any} */ s) { acc = En.merge(acc, s, c); n++; during?.(h, n); },
      onEnd(/** @type {string} */ status) { resolve({ acc, status, n }); },
    });
  });
}

/** @param {any} acc */
const strip = (acc) => ({ ...acc, methods: acc.methods.map((/** @type {any} */ m) => ({ ...m, ms: 0 })) });

const record = recordOf("poisson-spare-parts");
const settings = { seed: 12, method: "independent", compare: "inverse", failure: "none", overrides: {} };
const c = En.prepare(record, settings);
const job = { record, settings, opts: {}, from: 0, to: 12 };

test("one worker and four workers give the same statistics as a sequential run, with blocks out of order", async () => {
  let seq = En.empty(c);
  for (let b = 0; b < 12; b++) seq = En.merge(seq, En.block(c, b, {}), c);
  for (const size of [1, 4]) {
    const pool = Pool.createPool({ source: "", size, engine: En, makeWorker: fakeWorkers([9, 1, 5, 0, 7, 3]) });
    const r = /** @type {any} */ (await runPool(pool, job, c, En.empty(c)));
    assert.equal(r.status, "done");
    assert.equal(pool.mode, `${size} workers`);
    assert.deepEqual(strip(r.acc), strip(seq), `${size} workers`);
  }
});

test("a pause leaves a partial result, and a later run from that block completes it to the same statistics", async () => {
  const pool = Pool.createPool({ source: "", size: 4, engine: En, makeWorker: fakeWorkers([4, 2, 6, 1]) });
  const part = /** @type {any} */ (await runPool(pool, job, c, En.empty(c), (h, n) => { if (n === 3) h.pause(); }));
  assert.equal(part.status, "paused");
  assert.ok(part.acc.blocks >= 3 && part.acc.blocks < 12, `${part.acc.blocks} blocks before the pause`);
  const rest = /** @type {any} */ (await runPool(pool, { ...job, from: part.acc.blocks }, c, part.acc));
  assert.equal(rest.status, "done");
  const whole = /** @type {any} */ (await runPool(pool, job, c, En.empty(c)));
  assert.deepEqual(strip(rest.acc), strip(whole.acc));
});

test("a cancel delivers no further block", async () => {
  const pool = Pool.createPool({ source: "", size: 2, engine: En, makeWorker: fakeWorkers([3, 3]) });
  const r = /** @type {any} */ (await runPool(pool, job, c, En.empty(c), (h, n) => { if (n === 2) h.cancel(); }));
  assert.equal(r.status, "cancelled");
  assert.equal(r.n, 2);
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(r.acc.blocks, 2, "the result stays at 2 blocks, marked cancelled, not complete");
});

test("when workers cannot start, the pool runs the same blocks on the main thread", async () => {
  const pool = Pool.createPool({ source: "", size: 4, engine: En, makeWorker: () => { throw new Error("no workers here"); } });
  const r = /** @type {any} */ (await runPool(pool, job, c, En.empty(c)));
  assert.equal(pool.mode, "main thread");
  const w = /** @type {any} */ (await runPool(Pool.createPool({ source: "", size: 3, engine: En, makeWorker: fakeWorkers([2, 0]) }), job, c, En.empty(c)));
  assert.deepEqual(strip(r.acc), strip(w.acc));
});

test("an error in a block ends the job with its message", async () => {
  const bad = { ...job, record: { ...record, parameters: record.parameters.map((/** @type {any} */ p) => (p.name === "rate" ? { ...p, expr: "-1" } : p)) } };
  const pool = Pool.createPool({ source: "", size: 2, engine: En, makeWorker: () => { throw new Error("main thread"); } });
  const r = /** @type {any} */ (await new Promise((resolve) => pool.run(bad, { onBlock() {}, onEnd: (/** @type {string} */ status, /** @type {string} */ message) => resolve({ status, message }) })));
  assert.equal(r.status, "error");
  assert.match(r.message, /lambda/);
});

test("the variance-reduction designs give the same statistics with one and four workers: strata, antithetic pairs, control sums and separate streams", async () => {
  const text = "param q = 110\nD ~ normal(mu = 100, sigma = 20)\nG ~ gamma(k = 2, theta = 5)\nmean profit = 3*min(D, q) - 2*q + G\nprob short = D > q\ncontrol C = D\nalt \"q = 110\": q = 110\nalt \"q = 130\": q = 130\n";
  const rec = D.parse(text).record;
  for (const [method, compare, streams] of [["stratified", "antithetic", "separate"], ["control", "stratified", "common"]]) {
    const set = { seed: 9, method, compare, failure: "none", overrides: {}, streams, strata: 3 };
    const cc = En.prepare(rec, set), j = { record: rec, settings: set, opts: {}, from: 0, to: 8 };
    let seq = En.empty(cc);
    for (let b = 0; b < 8; b++) seq = En.merge(seq, En.block(cc, b, {}), cc);
    for (const size of [1, 4]) {
      const pool = Pool.createPool({ source: "", size, engine: En, makeWorker: fakeWorkers([7, 0, 3, 5, 1]) });
      const r = /** @type {any} */ (await runPool(pool, j, cc, En.empty(cc)));
      assert.equal(r.status, "done");
      assert.deepEqual(strip(r.acc), strip(seq), `${method} with ${compare}, ${streams} streams, ${size} workers`);
    }
  }
});

test("a process model with its ensemble band and a copula model: one worker and four workers give the same statistics", async () => {
  for (const id of ["exp-hawkes", "claytoncopula-crop-yields", "exp-gbm"]) {
    const rec = recordOf(id), set = { seed: 21, method: "independent", compare: "none", failure: "none", overrides: {} }, cc = En.prepare(rec, set);
    assert.ok(cc.ok, cc.errors?.join(" "));
    const proc = cc.nodes.find((/** @type {any} */ n) => n.type === "var" && n.law.kind === "process");
    const opts = proc ? { band: { name: proc.name, ...Pr.bandSpec(9, -5, 300) } } : {};
    const j = { record: rec, settings: set, opts, from: 0, to: 6 };
    const results = [];
    for (const size of [1, 4]) {
      const pool = Pool.createPool({ source: "", size, engine: En, makeWorker: fakeWorkers([5, 0, 3, 1]) });
      results.push(strip(/** @type {any} */ (await runPool(pool, j, cc, En.empty(cc))).acc));
    }
    assert.deepEqual(results[0], results[1], id);
  }
});
