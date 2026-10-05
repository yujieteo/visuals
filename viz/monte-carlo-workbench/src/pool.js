/* Monte Carlo Probability Workbench: the worker pool. It starts up to `size` workers from the page's own inline
 * engine scripts through a Blob URL, so it works from file:// with no request. A job is a range of blocks; the pool
 * sends each worker one block at a time and passes the results on in block order, whatever order the workers
 * finish in. Thus the merged sums do not depend on the number of workers. Pause stops new blocks and lets the
 * blocks in flight finish; cancel drops them. When workers cannot start, the same blocks run on the main thread,
 * one block for each task of the event loop.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCPool = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  /**
   * @typedef {{ record: any, settings: any, opts: any, from: number, to: number }} Job
   * @typedef {{ onBlock(stats: any): void, onEnd(status: "done" | "paused" | "cancelled" | "error", message?: string): void }} Hooks
   */

  /**
   * @param {{ source: string, size: number, engine: any, makeWorker?: (url: string) => any, defer?: (f: () => void) => void }} o
   */
  function createPool(o) {
    /** @type {any[] | null} */
    let workers = null;
    let mainThread = false, jobId = 0;
    const defer = o.defer ?? ((f) => setTimeout(f, 0));

    function spawn() {
      if (workers || mainThread) return;
      try {
        if (!o.makeWorker && typeof Worker === "undefined") throw new Error("no workers");
        const url = o.makeWorker ? "" : URL.createObjectURL(new Blob([o.source], { type: "text/javascript" }));
        const make = o.makeWorker ?? ((/** @type {string} */ u) => new Worker(u));
        workers = Array.from({ length: Math.max(1, o.size) }, () => make(url));
      } catch {
        workers = null;
        mainThread = true;
      }
    }

    /**
     * Run blocks job.from to job.to - 1. Returns a handle with pause() and cancel().
     * @param {Job} job @param {Hooks} hooks
     */
    function run(job, hooks) {
      spawn();
      const id = ++jobId;
      /** The run that took over on the main thread after a worker failed. @type {any} */
      let inner = null;
      let next = job.from, merged = job.from, inFlight = 0, stopped = /** @type {"" | "paused" | "cancelled"} */ (""), ended = false;
      /** @type {Map<number, any>} */
      const early = new Map();
      const end = (/** @type {"done" | "paused" | "cancelled" | "error"} */ status, /** @type {string} */ message = "") => {
        if (ended) return;
        ended = true;
        if (workers) for (const w of workers) w.onmessage = w.onerror = null;
        hooks.onEnd(status, message);
      };
      const deliver = (/** @type {number} */ b, /** @type {any} */ stats) => {
        early.set(b, stats);
        while (early.has(merged)) {
          const s = early.get(merged);
          early.delete(merged);
          merged++;
          if (stopped === "cancelled") continue;
          if (s.error) { end("error", s.error); return; }
          hooks.onBlock(s);
        }
        if (merged === job.to) end("done");
        else if (stopped && inFlight === 0) end(stopped);
      };

      if (mainThread || !workers) {
        const c = o.engine.prepare(job.record, job.settings);
        if (!c.ok) { end("error", c.errors.join(" ")); return handle(); }
        const step = () => {
          if (ended) return;
          if (stopped || next >= job.to) { if (stopped) end(stopped); return; }
          const b = next++;
          deliver(b, o.engine.block(c, b, job.opts));
          if (!ended) defer(step);
        };
        defer(step);
        return handle();
      }

      const pool = /** @type {any[]} */ (workers);
      const feed = (/** @type {any} */ w) => {
        if (stopped || next >= job.to) return;
        inFlight++;
        w.postMessage({ type: "block", id, block: next++ });
      };
      for (const w of pool) {
        w.onmessage = (/** @type {MessageEvent} */ e) => {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === "error") { inFlight = 0; end("error", m.message); return; }
          inFlight--;
          feed(w);
          deliver(m.block, m.stats);
        };
        w.onerror = () => {
          // A worker that cannot run (a browser policy, an old engine): switch to the main thread for this job.
          if (ended) return;
          for (const x of pool) x.terminate?.();
          workers = null;
          mainThread = true;
          ended = true;
          const rest = run({ ...job, from: merged }, hooks);
          inner = rest;
        };
        w.postMessage({ type: "init", id, record: job.record, settings: job.settings, opts: job.opts });
      }
      for (const w of pool) feed(w);
      if (next === job.from) end("done");
      return handle();

      function handle() {
        return {
          pause() { if (inner) { inner.pause(); return; } if (!stopped) stopped = "paused"; if (inFlight === 0 && !ended && !mainThread) end("paused"); },
          cancel() { if (inner) { inner.cancel(); return; } stopped = "cancelled"; if (!ended) end("cancelled"); },
          get workers() { return mainThread || !workers ? 0 : workers.length; },
        };
      }
    }

    return { run, get mode() { return mainThread ? "main thread" : workers ? `${workers.length} workers` : "not started"; }, terminate() { if (workers) for (const w of workers) w.terminate?.(); workers = null; } };
  }

  return { createPool };
});
